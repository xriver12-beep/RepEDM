const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { executeQuery, sql } = require('../config/database');
const emailService = require('../services/email-service');
const settingsService = require('../services/settings-service');
const { generateToken, generateRefreshToken, verifyRefreshToken, authenticateToken } = require('../middleware/auth');
const { validate, userValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// 登入速率限制
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 10, // 每個 IP 最多 10 次嘗試
    message: {
        success: false,
        message: '嘗試登入次數過多，請 15 分鐘後再試'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 使用者註冊
router.post('/register', 
  validate(userValidations.register),
  asyncHandler(async (req, res) => {
    const { username, email, password, fullName, role } = req.body;

    // 檢查使用者是否已存在
    const existingUser = await executeQuery(
      'SELECT id FROM Users WHERE username = @username OR email = @email',
      { username, email }
    );

    if (existingUser.recordset.length > 0) {
      throw new AppError('使用者名稱或電子郵件已存在', 400);
    }

    // 加密密碼
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 建立新使用者
    const insertQuery = `
      INSERT INTO Users (username, email, password_hash, full_name, role)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.full_name, INSERTED.role, INSERTED.created_at
      VALUES (@username, @email, @passwordHash, @fullName, @role)
    `;

    const result = await executeQuery(insertQuery, {
      username,
      email,
      passwordHash,
      fullName,
      role: role || 'User'
    });

    const newUser = result.recordset[0];

    // 生成 JWT 令牌
    const token = generateToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    res.status(201).json({
      success: true,
      message: '使用者註冊成功',
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.full_name,
          role: newUser.role,
          createdAt: newUser.created_at
        },
        token,
        refreshToken
      }
    });
  })
);

// 使用者登入
router.post('/login',
  loginLimiter,
  validate(userValidations.login),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // 查找使用者
    const query = `
      SELECT id, username, email, password_hash, full_name, role, is_active, updated_at,
             failed_login_attempts, locked_until
      FROM Users 
      WHERE email = @email OR username = @email
    `;

    const result = await executeQuery(query, { email });

    if (result.recordset.length === 0) {
      throw new AppError('電子郵件或密碼錯誤', 401);
    }

    const user = result.recordset[0];

    // 檢查帳號是否被鎖定
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remainingTime = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      throw new AppError(`帳號已被鎖定，請 ${remainingTime} 分鐘後再試`, 423);
    }

    // 檢查帳號是否啟用
    if (!user.is_active) {
      throw new AppError('帳號已被停用，請聯繫管理員', 401);
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // 獲取安全設定
      const settings = await settingsService.getSettings();
      const maxFailedAttempts = settings.security?.maxFailedAttempts || 5;
      const lockoutDurationMinutes = settings.security?.lockoutDurationMinutes || 30;

      // 增加失敗登入次數
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil = null;
      
      // 如果失敗次數達到設定值，鎖定帳號
      if (newFailedAttempts >= maxFailedAttempts) {
          lockedUntil = new Date(Date.now() + lockoutDurationMinutes * 60 * 1000); 
      }
      
      await executeQuery(
          `UPDATE Users 
           SET failed_login_attempts = @failedAttempts,
               locked_until = @lockedUntil,
               updated_at = GETDATE()
           WHERE id = @userId`,
          { failedAttempts: newFailedAttempts, lockedUntil, userId: user.id }
      );

      if (newFailedAttempts >= maxFailedAttempts) {
          throw new AppError(`密碼錯誤次數過多，帳號已被鎖定 ${lockoutDurationMinutes} 分鐘`, 423);
      }

      throw new AppError('電子郵件或密碼錯誤', 401);
    }

    // 登入成功，重置失敗次數
    await executeQuery(
      `UPDATE Users 
       SET updated_at = GETDATE(),
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE id = @userId`,
      { userId: user.id }
    );

    // 生成令牌
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // 記錄登入日誌
    try {
      await executeQuery(
        `INSERT INTO UserLoginLogs (user_id, ip_address, user_agent, last_active_at)
         VALUES (@userId, @ipAddress, @userAgent, GETDATE())`,
        { 
          userId: user.id,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        }
      );
    } catch (logError) {
      console.error('Login log error:', logError);
      // 不阻擋登入流程
    }

    res.json({
      success: true,
      message: '登入成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          lastLoginAt: user.updated_at
        },
        token,
        refreshToken
      }
    });
  })
);

// 刷新令牌
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('需要刷新令牌', 400);
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      
      // 獲取使用者資訊
      const query = `
        SELECT id, username, email, full_name, role, is_active
        FROM Users 
        WHERE id = @userId AND is_active = 1
      `;

      const result = await executeQuery(query, { userId: decoded.userId });

      if (result.recordset.length === 0) {
        throw new AppError('無效的刷新令牌', 401);
      }

      const user = result.recordset[0];

      // 生成新的令牌
      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user);

      res.json({
        success: true,
        message: '令牌刷新成功',
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      throw new AppError('無效的刷新令牌', 401);
    }
  })
);

// 驗證審核 Token (免登入)
router.post('/verify-approval-token',
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
      throw new AppError('未提供 Token', 400);
    }

    // 查找 Token 並檢查有效性
    const query = `
      SELECT 
        t.id as TokenID,
        t.approval_id,
        t.approver_id,
        t.expires_at,
        t.is_used,
        u.id, u.username, u.email, u.full_name, u.role, u.is_active
      FROM ApprovalTokens t
      JOIN Users u ON t.approver_id = u.id
      WHERE t.token = @token
    `;

    const result = await executeQuery(query, { token });

    if (result.recordset.length === 0) {
      throw new AppError('無效的連結', 400);
    }

    const tokenData = result.recordset[0];

    // 檢查過期
    if (new Date() > new Date(tokenData.expires_at)) {
      throw new AppError('連結已過期', 400);
    }

    // 檢查使用者帳號狀態
    if (!tokenData.is_active) {
      throw new AppError('帳號已被停用', 401);
    }

    // 標記為已使用 (可選)
    await executeQuery(
      'UPDATE ApprovalTokens SET is_used = 1 WHERE id = @id',
      { id: tokenData.TokenID }
    );
    
    // 生成 JWT
    const user = {
      id: tokenData.id,
      username: tokenData.username,
      email: tokenData.email,
      full_name: tokenData.full_name,
      role: tokenData.role
    };

    const jwtToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: '驗證成功',
      data: {
        token: jwtToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role
        },
        approvalId: tokenData.approval_id
      }
    });
  })
);

// 獲取當前使用者資訊
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const query = `
      SELECT id, username, email, full_name, role, is_active, updated_at, created_at
      FROM Users 
      WHERE id = @userId
    `;

    const result = await executeQuery(query, { userId: req.user.id });
    const user = result.recordset[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          isActive: user.is_active,
          lastLoginAt: user.updated_at,
          createdAt: user.created_at
        }
      }
    });
  })
);

// 更新個人資料
router.put('/profile',
  authenticateToken,
  validate(userValidations.updateProfile),
  asyncHandler(async (req, res) => {
    const { fullName, phone, username, email } = req.body;
    const userId = req.user.id;

    // 檢查使用者名稱或電子郵件是否已被使用
    if (username || email) {
      const checkQuery = `
        SELECT id FROM Users 
        WHERE (username = @username OR email = @email) 
        AND id != @userId
      `;
      const checkResult = await executeQuery(checkQuery, { 
        username: username || '', 
        email: email || '', 
        userId 
      });

      if (checkResult.recordset.length > 0) {
        throw new AppError('使用者名稱或電子郵件已被使用', 400);
      }
    }

    // 獲取當前用戶資料以保留未更改的欄位
    const currentUserResult = await executeQuery('SELECT * FROM Users WHERE id = @userId', { userId });
    if (currentUserResult.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }
    const currentUser = currentUserResult.recordset[0];

    const updateQuery = `
      UPDATE Users 
      SET full_name = @fullName, 
          username = @username,
          email = @email,
          updated_at = GETDATE()
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.full_name, INSERTED.role
      WHERE id = @userId
    `;

    const result = await executeQuery(updateQuery, {
      fullName: fullName || currentUser.full_name,
      username: username || currentUser.username,
      email: email || currentUser.email,
      userId
    });

    const updatedUser = result.recordset[0];

    res.json({
      success: true,
      message: '個人資料更新成功',
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          fullName: updatedUser.full_name,
          role: updatedUser.role
        }
      }
    });
  })
);

// 修改密碼
router.put('/password',
  authenticateToken,
  validate(userValidations.changePassword),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 獲取當前密碼雜湊
    const userQuery = 'SELECT password_hash FROM Users WHERE id = @userId';
    const userResult = await executeQuery(userQuery, { userId });

    if (userResult.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }

    const user = userResult.recordset[0];

    // 驗證當前密碼
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      throw new AppError('當前密碼錯誤', 400);
    }

    // 加密新密碼
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 更新密碼
    await executeQuery(
      'UPDATE Users SET password_hash = @newPasswordHash, updated_at = GETDATE() WHERE id = @userId',
      { newPasswordHash, userId }
    );

    res.json({
      success: true,
      message: '密碼修改成功'
    });
  })
);

// 登出 (客戶端處理，伺服器端可以實現黑名單機制)
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 更新登入日誌，記錄登出時間
    try {
      await executeQuery(
        `UPDATE UserLoginLogs 
         SET logout_time = GETDATE()
         WHERE user_id = @userId AND logout_time IS NULL`,
        { userId: req.user.id }
      );
    } catch (logError) {
      console.error('Logout log error:', logError);
    }

    // 這裡可以實現令牌黑名單機制
    // 目前簡單回應成功，實際登出由客戶端刪除令牌處理

    res.json({
      success: true,
      message: '登出成功'
    });
  })
);

// 忘記密碼 (發送重設連結)
router.post('/forgot-password',
  validate(userValidations.forgotPassword),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    // 1. 檢查 Users 表
    const userQuery = 'SELECT id, username, email, full_name FROM Users WHERE email = @email AND is_active = 1';
    const userResult = await executeQuery(userQuery, { email });

    // 2. 檢查 AdminUsers 表
    const adminQuery = 'SELECT AdminUserID, Username, Email, DisplayName FROM AdminUsers WHERE Email = @email AND IsActive = 1';
    const adminResult = await executeQuery(adminQuery, { email });

    if (userResult.recordset.length === 0 && adminResult.recordset.length === 0) {
      // 為了安全，不透露郵箱是否存在
      return res.json({
        success: true,
        message: '如果該電子郵件存在於系統中，我們將發送重置連結。'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    let targetName = '';

    // 更新 Users 表
    if (userResult.recordset.length > 0) {
      const user = userResult.recordset[0];
      targetName = user.full_name || user.username;
      await executeQuery(
        'UPDATE Users SET reset_token = @resetToken, reset_token_expires = @resetTokenExpires WHERE id = @id',
        { resetToken, resetTokenExpires, id: user.id }
      );
    }

    // 更新 AdminUsers 表
    if (adminResult.recordset.length > 0) {
      const admin = adminResult.recordset[0];
      if (!targetName) targetName = admin.DisplayName || admin.Username;
      await executeQuery(
        'UPDATE AdminUsers SET reset_token = @resetToken, reset_token_expires = @resetTokenExpires WHERE AdminUserID = @id',
        { resetToken, resetTokenExpires, id: admin.AdminUserID }
      );
    }

    // 發送重設密碼郵件
    const frontendHost = process.env.FRONTEND_URL || req.get('origin') || 'http://localhost:3000';
    // 根據環境調整連結
    const resetLink = `${frontendHost}/reset-password.html?token=${resetToken}`;
    
    try {
      const emailResult = await emailService.sendEmail({
        to: email,
        subject: 'WintonEDM 密碼重設請求',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>密碼重設請求</h2>
            <p>您好 ${targetName}，</p>
            <p>我們收到了您的密碼重設請求。請點擊下方連結以重設您的密碼：</p>
            <p style="margin: 20px 0;">
              <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">重設密碼</a>
            </p>
            <p>此連結將在 1 小時後失效。</p>
            <p>如果您沒有發出此請求，請忽略此郵件。</p>
          </div>
        `,
        text: `您好，請點擊以下連結重設密碼：${resetLink}`,
        emailType: 'password_reset'
      });

      if (!emailResult.success) {
        console.error('發送密碼重設郵件失敗:', emailResult.message);
      } else {
        console.log(`發送密碼重設郵件給: ${email}`);
      }
    } catch (error) {
      console.error('發送密碼重設郵件時發生錯誤:', error);
    }

    res.json({
      success: true,
      message: '如果該電子郵件存在於系統中，我們將發送重置連結。'
    });
  })
);

// 重置密碼
router.post('/reset-password',
  validate(userValidations.resetPassword),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    let updated = false;

    // 1. 嘗試更新 Users
    const userQuery = `
      SELECT id FROM Users 
      WHERE reset_token = @token 
      AND reset_token_expires > GETDATE()
      AND is_active = 1
    `;
    const userResult = await executeQuery(userQuery, { token });

    if (userResult.recordset.length > 0) {
      const userId = userResult.recordset[0].id;
      await executeQuery(
        `UPDATE Users 
         SET password_hash = @passwordHash, 
             reset_token = NULL, 
             reset_token_expires = NULL,
             updated_at = GETDATE()
         WHERE id = @id`,
        { passwordHash, id: userId }
      );
      updated = true;
    }

    // 2. 嘗試更新 AdminUsers
    const adminQuery = `
      SELECT AdminUserID FROM AdminUsers 
      WHERE reset_token = @token 
      AND reset_token_expires > GETDATE()
      AND IsActive = 1
    `;
    const adminResult = await executeQuery(adminQuery, { token });

    if (adminResult.recordset.length > 0) {
      const adminId = adminResult.recordset[0].AdminUserID;
      await executeQuery(
        `UPDATE AdminUsers 
         SET PasswordHash = @passwordHash, 
             reset_token = NULL, 
             reset_token_expires = NULL,
             UpdatedAt = GETDATE()
         WHERE AdminUserID = @id`,
        { passwordHash, id: adminId }
      );
      updated = true;
    }

    if (!updated) {
      throw new AppError('無效或已過期的重置連結', 400);
    }

    res.json({
      success: true,
      message: '密碼重置成功，請使用新密碼登入'
    });
  })
);

module.exports = router;
