const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { authenticateAdmin } = require('../middleware/admin-auth');
const { generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const router = express.Router();

// 登入速率限制（開發環境下放寬限制）
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分鐘
    max: 20, // 最多 20 次嘗試
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '請求過於頻繁，請稍後再試'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 管理員登入
router.post('/login', loginLimiter, [
    body('username')
        .notEmpty()
        .withMessage('用戶名不能為空')
        .isLength({ min: 3, max: 50 })
        .withMessage('用戶名長度必須在3-50字符之間'),
    body('password')
        .notEmpty()
        .withMessage('密碼不能為空')
        .isLength({ min: 6 })
        .withMessage('密碼長度至少6個字符')
], async (req, res) => {
    try {
        // 驗證輸入
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '輸入驗證失敗',
                errors: errors.array()
            });
        }

        const { username, password, rememberMe } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';

        // 查找管理員用戶
        const pool = req.app.locals.db;
        const userResult = await pool.request()
            .input('username', sql.NVarChar(50), username)
            .query(`
                SELECT 
                    AdminUserID, Username, Email, PasswordHash, Salt,
                    FirstName, LastName, DisplayName, Role, Department, Position,
                    IsActive, IsEmailVerified, FailedLoginAttempts, LockedUntil,
                    MustChangePassword, TwoFactorEnabled
                FROM AdminUsers 
                WHERE Username = @username
            `);

        if (userResult.recordset.length === 0) {
            // 嘗試從普通 Users 表查找具有管理權限的用戶
            const appUserResult = await pool.request()
                .input('username', sql.NVarChar(50), username)
                .query(`
                    SELECT 
                        id, username, email, password_hash, full_name, role, is_active, created_at,
                        failed_login_attempts, locked_until, must_change_password
                    FROM Users 
                    WHERE (username = @username OR email = @username)
                `);

            if (appUserResult.recordset.length > 0) {
                const appUser = appUserResult.recordset[0];
                
                // 檢查權限
                const allowedRoles = ['Admin'];
                const userRole = appUser.role ? appUser.role.charAt(0).toUpperCase() + appUser.role.slice(1).toLowerCase() : '';
                
                if (allowedRoles.includes(userRole)) {
                    // 檢查帳號是否被鎖定
                    if (appUser.locked_until && new Date() < new Date(appUser.locked_until)) {
                        return res.status(423).json({
                            success: false,
                            message: '帳號已被鎖定，請稍後再試'
                        });
                    }

                    // 檢查帳號是否啟用
                    if (!appUser.is_active) {
                        return res.status(403).json({
                            success: false,
                            message: '帳號已被停用'
                        });
                    }

                    // 驗證密碼
                    const isPasswordValid = await bcrypt.compare(password, appUser.password_hash);
                    
                    if (!isPasswordValid) {
                        // 增加失敗登入次數
                        const newFailedAttempts = (appUser.failed_login_attempts || 0) + 1;
                        let lockedUntil = null;
                        
                        // 如果失敗次數達到5次，鎖定帳號30分鐘
                        if (newFailedAttempts >= 5) {
                            lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30分鐘後
                        }
                        
                        await pool.request()
                            .input('id', sql.Int, appUser.id)
                            .input('failedAttempts', sql.Int, newFailedAttempts)
                            .input('lockedUntil', sql.DateTime2, lockedUntil)
                            .query(`
                                UPDATE Users 
                                SET failed_login_attempts = @failedAttempts,
                                    locked_until = @lockedUntil,
                                    updated_at = GETDATE()
                                WHERE id = @id
                            `);

                        return res.status(401).json({
                            success: false,
                            message: '用戶名或密碼錯誤'
                        });
                    }

                    if (isPasswordValid) {
                        // 登入成功，重置失敗次數
                        await pool.request()
                            .input('id', sql.Int, appUser.id)
                            .input('clientIP', sql.NVarChar(45), clientIP)
                            .query(`
                                UPDATE Users 
                                SET failed_login_attempts = 0,
                                    locked_until = NULL,
                                    last_login_at = GETDATE(),
                                    last_login_ip = @clientIP,
                                    updated_at = GETDATE()
                                WHERE id = @id
                            `);

                        // 生成JWT token
                        const tokenPayload = {
                            userId: appUser.id,
                            username: appUser.username,
                            email: appUser.email,
                            role: appUser.role,
                            fullName: appUser.full_name
                        };

                        const tokenExpiry = rememberMe ? '7d' : '24h';
                        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
                            expiresIn: tokenExpiry
                        });

                        // 生成刷新令牌
                        const refreshToken = generateRefreshToken({ id: appUser.id });

                        // 記錄登入 (使用負數 ID 或其他方式標記來自 Users 表的登入，這裡暫時略過或記錄到 Users 相關日誌)
                        // 為了兼容性，我們可以回傳類似 AdminUser 的結構
                        return res.json({
                            success: true,
                            message: '登入成功',
                            token,
                            refreshToken,
                            user: {
                                id: appUser.id, // 用戶ID
                                adminUserID: null, // 區分普通用戶
                                username: appUser.username,
                                email: appUser.email,
                                firstName: appUser.full_name ? appUser.full_name.split(' ')[0] : '',
                                lastName: appUser.full_name ? appUser.full_name.split(' ').slice(1).join(' ') : '',
                                displayName: appUser.full_name,
                                role: appUser.role,
                                department: '',
                                position: '',
                                mustChangePassword: !!appUser.must_change_password,
                                twoFactorEnabled: false
                            },
                            expiresIn: tokenExpiry
                        });
                    }
                }
            }

            // 記錄失敗的登入嘗試
            await logLoginAttempt(pool, null, username, clientIP, userAgent, false, '用戶不存在');
            
            return res.status(401).json({
                success: false,
                message: '用戶名或密碼錯誤'
            });
        }

        const user = userResult.recordset[0];

        // 檢查帳號是否被鎖定
        if (user.LockedUntil && new Date() < new Date(user.LockedUntil)) {
            await logLoginAttempt(pool, user.AdminUserID, username, clientIP, userAgent, false, '帳號被鎖定');
            
            return res.status(423).json({
                success: false,
                message: '帳號已被鎖定，請稍後再試'
            });
        }

        // 檢查帳號是否啟用
        if (!user.IsActive) {
            await logLoginAttempt(pool, user.AdminUserID, username, clientIP, userAgent, false, '帳號未啟用');
            
            return res.status(403).json({
                success: false,
                message: '帳號已被停用'
            });
        }

        // 驗證密碼
        const isPasswordValid = await bcrypt.compare(password, user.PasswordHash);
        
        if (!isPasswordValid) {
            // 增加失敗登入次數
            const newFailedAttempts = (user.FailedLoginAttempts || 0) + 1;
            let lockedUntil = null;
            
            // 如果失敗次數達到5次，鎖定帳號30分鐘
            if (newFailedAttempts >= 5) {
                lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30分鐘後
            }
            
            await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, user.AdminUserID)
                .input('failedAttempts', sql.Int, newFailedAttempts)
                .input('lockedUntil', sql.DateTime2, lockedUntil)
                .query(`
                    UPDATE AdminUsers 
                    SET FailedLoginAttempts = @failedAttempts,
                        LockedUntil = @lockedUntil,
                        UpdatedAt = GETDATE()
                    WHERE AdminUserID = @adminUserID
                `);

            await logLoginAttempt(pool, user.AdminUserID, username, clientIP, userAgent, false, '密碼錯誤');
            
            return res.status(401).json({
                success: false,
                message: '用戶名或密碼錯誤'
            });
        }

        // 登入成功，重置失敗次數
        await pool.request()
            .input('adminUserID', sql.UniqueIdentifier, user.AdminUserID)
            .input('clientIP', sql.NVarChar(45), clientIP)
            .query(`
                UPDATE AdminUsers 
                SET FailedLoginAttempts = 0,
                    LockedUntil = NULL,
                    LastLoginAt = GETDATE(),
                    LastLoginIP = @clientIP,
                    UpdatedAt = GETDATE()
                WHERE AdminUserID = @adminUserID
            `);

        // 生成JWT token
        const tokenPayload = {
            adminUserID: user.AdminUserID,
            username: user.Username,
            email: user.Email,
            role: user.Role,
            displayName: user.DisplayName
        };

        const tokenExpiry = rememberMe ? '7d' : '24h';
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: tokenExpiry
        });

        // 生成刷新令牌
        const refreshToken = generateRefreshToken({ id: user.AdminUserID });

        // 記錄成功的登入
        await logLoginAttempt(pool, user.AdminUserID, username, clientIP, userAgent, true, null, token);

        // 返回用戶資訊（不包含敏感資料）
        const userInfo = {
            adminUserID: user.AdminUserID,
            username: user.Username,
            email: user.Email,
            firstName: user.FirstName,
            lastName: user.LastName,
            displayName: user.DisplayName,
            role: user.Role,
            department: user.Department,
            position: user.Position,
            mustChangePassword: user.MustChangePassword,
            twoFactorEnabled: user.TwoFactorEnabled
        };

        res.json({
            success: true,
            message: '登入成功',
            token,
            refreshToken,
            user: userInfo,
            expiresIn: tokenExpiry
        });

    } catch (error) {
        console.error('管理員登入錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器內部錯誤'
        });
    }
});

// 刷新令牌
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: '需要刷新令牌'
        });
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);
        
        // 從資料庫查詢用戶
        const pool = req.app.locals.db;
        let user;
        let tokenPayload;

        // 嘗試從 AdminUsers 查詢
        const adminResult = await pool.request()
            .input('adminUserID', sql.UniqueIdentifier, decoded.userId)
            .query(`
                SELECT AdminUserID, Username, Email, Role, DisplayName, IsActive 
                FROM AdminUsers 
                WHERE AdminUserID = @adminUserID AND IsActive = 1
            `);

        if (adminResult.recordset.length > 0) {
            user = adminResult.recordset[0];
            tokenPayload = {
                adminUserID: user.AdminUserID,
                username: user.Username,
                email: user.Email,
                role: user.Role,
                displayName: user.DisplayName
            };
        } else {
            // 嘗試從 Users 查詢 (fallback)
            const userResult = await pool.request()
                .input('id', sql.Int, decoded.userId)
                .query(`
                    SELECT id, username, email, role, full_name, is_active
                    FROM Users
                    WHERE id = @id AND is_active = 1
                `);
            
            if (userResult.recordset.length > 0) {
                user = userResult.recordset[0];
                const allowedRoles = ['Admin'];
                const userRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : '';
                
                if (allowedRoles.includes(userRole)) {
                     tokenPayload = {
                        userId: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        fullName: user.full_name
                    };
                }
            }
        }

        if (!tokenPayload) {
            return res.status(401).json({
                success: false,
                message: '無效的刷新令牌或用戶不存在'
            });
        }

        // 生成新的訪問令牌
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: '24h'
        });

        // 生成新的刷新令牌 (可選: 輪換刷新令牌)
        const newRefreshToken = generateRefreshToken({ id: decoded.userId });

        res.json({
            success: true,
            data: {
                token,
                refreshToken: newRefreshToken
            }
        });

    } catch (error) {
        console.error('刷新令牌錯誤:', error);
        res.status(401).json({
            success: false,
            message: '無效的刷新令牌'
        });
    }
});

// 管理員登出
router.post('/logout', authenticateAdmin, async (req, res) => {
    try {
        // 這裡可以實現token黑名單機制
        // 目前簡單返回成功
        res.json({
            success: true,
            message: '登出成功'
        });
    } catch (error) {
        console.error('管理員登出錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器內部錯誤'
        });
    }
});

// 驗證token並獲取用戶資訊
router.get('/me', authenticateAdmin, async (req, res) => {
    try {
        const user = req.user; // authenticateAdmin middleware sets req.user
        const pool = req.app.locals.db;
        
        // 判斷是用戶表還是管理員表
        // 如果是 GUID (string) 則是 AdminUsers，如果是 number 則是 Users
        const isAppUser = typeof user.id === 'number';

        if (isAppUser) {
            // Users 表
            const userResult = await pool.request()
                .input('id', sql.Int, user.id)
                .query(`
                    SELECT 
                        id, username, email, full_name, role, is_active, created_at
                    FROM Users 
                    WHERE id = @id AND is_active = 1
                `);
            
            if (userResult.recordset.length === 0) {
                 return res.status(404).json({
                    success: false,
                    message: '用戶不存在或已被停用'
                });
            }
            
            const appUser = userResult.recordset[0];
            
            return res.json({
                success: true,
                user: {
                    id: appUser.id,
                    adminUserID: null,
                    username: appUser.username,
                    email: appUser.email,
                    firstName: appUser.full_name ? appUser.full_name.split(' ')[0] : '',
                    lastName: appUser.full_name ? appUser.full_name.split(' ').slice(1).join(' ') : '',
                    displayName: appUser.full_name,
                    role: appUser.role,
                    department: '',
                    position: '',
                    isActive: !!appUser.is_active,
                    mustChangePassword: false,
                    twoFactorEnabled: false,
                    createdAt: appUser.created_at
                }
            });
        } else {
            // AdminUsers 表
            const userResult = await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, user.id)
                .query(`
                    SELECT 
                        AdminUserID, Username, Email, FirstName, LastName, DisplayName,
                        Role, Department, Position, IsActive, IsEmailVerified,
                        MustChangePassword, TwoFactorEnabled, LastLoginAt, CreatedAt
                    FROM AdminUsers 
                    WHERE AdminUserID = @adminUserID AND IsActive = 1
                `);

            if (userResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: '用戶不存在或已被停用'
                });
            }

            const adminUser = userResult.recordset[0];

            res.json({
                success: true,
                user: {
                    id: adminUser.AdminUserID,
                    adminUserID: adminUser.AdminUserID,
                    username: adminUser.Username,
                    email: adminUser.Email,
                    firstName: adminUser.FirstName,
                    lastName: adminUser.LastName,
                    displayName: adminUser.DisplayName,
                    role: adminUser.Role,
                    department: adminUser.Department,
                    position: adminUser.Position,
                    isActive: !!adminUser.IsActive,
                    mustChangePassword: adminUser.MustChangePassword,
                    twoFactorEnabled: adminUser.TwoFactorEnabled,
                    lastLoginAt: adminUser.LastLoginAt,
                    createdAt: adminUser.CreatedAt
                }
            });
        }
    } catch (error) {
        console.error('獲取用戶資訊錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器內部錯誤'
        });
    }
});

// 更改密碼
router.post('/change-password', authenticateAdmin, [
    body('currentPassword')
        .notEmpty()
        .withMessage('當前密碼不能為空'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('新密碼長度至少8個字符')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('新密碼必須包含大小寫字母和數字')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '輸入驗證失敗',
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        const pool = req.app.locals.db;
        const user = req.user;
        const isAppUser = typeof user.id === 'number';

        if (isAppUser) {
            // Users 表更改密碼
             const userResult = await pool.request()
                .input('id', sql.Int, user.id)
                .query(`
                    SELECT password_hash FROM Users 
                    WHERE id = @id
                `);

            if (userResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: '用戶不存在'
                });
            }

            const appUser = userResult.recordset[0];
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, appUser.password_hash);
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: '當前密碼錯誤'
                });
            }

            const saltRounds = 12;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

            await pool.request()
                .input('id', sql.Int, user.id)
                .input('passwordHash', sql.NVarChar(255), newPasswordHash)
                .query(`
                    UPDATE Users 
                    SET password_hash = @passwordHash,
                        updated_at = GETDATE()
                    WHERE id = @id
                `);

        } else {
            // AdminUsers 表更改密碼
            const userResult = await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, user.id)
                .query(`
                    SELECT PasswordHash FROM AdminUsers 
                    WHERE AdminUserID = @adminUserID
                `);

            if (userResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: '用戶不存在'
                });
            }

            const adminUser = userResult.recordset[0];
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, adminUser.PasswordHash);
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: '當前密碼錯誤'
                });
            }

            const saltRounds = 10;
            const salt = await bcrypt.genSalt(saltRounds);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);

            await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, user.id)
                .input('passwordHash', sql.NVarChar(255), newPasswordHash)
                .input('salt', sql.NVarChar(255), salt)
                .query(`
                    UPDATE AdminUsers 
                    SET PasswordHash = @passwordHash,
                        Salt = @salt,
                        PasswordChangedAt = GETDATE(),
                        MustChangePassword = 0,
                        UpdatedAt = GETDATE()
                    WHERE AdminUserID = @adminUserID
                `);
        }

        res.json({
            success: true,
            message: '密碼更改成功'
        });

    } catch (error) {
        console.error('更改密碼錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器內部錯誤'
        });
    }
});

// 更新個人資料
router.put('/profile', authenticateAdmin, [
    body('firstName').optional().trim().isLength({ max: 50 }).withMessage('名字過長'),
    body('lastName').optional().trim().isLength({ max: 50 }).withMessage('姓氏過長')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '輸入驗證失敗',
                errors: errors.array()
            });
        }

        const { firstName, lastName, email } = req.body;
        const pool = req.app.locals.db;
        const user = req.user;
        const isAppUser = typeof user.id === 'number';

        if (isAppUser) {
             // Users 表更新
             if (email) {
                const checkEmail = await pool.request()
                    .input('email', sql.NVarChar(100), email)
                    .input('id', sql.Int, user.id)
                    .query('SELECT id FROM Users WHERE email = @email AND id != @id');
                
                if (checkEmail.recordset.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: '該電子郵件已被使用'
                    });
                }
            }
            
            // Users 表通常只有 full_name
            const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || user.fullName);

            await pool.request()
                .input('id', sql.Int, user.id)
                .input('fullName', sql.NVarChar(100), fullName)
                .input('email', sql.NVarChar(100), email || user.email)
                .query(`
                    UPDATE Users 
                    SET full_name = @fullName,
                        email = @email,
                        updated_at = GETDATE()
                    WHERE id = @id
                `);
            
            // 返回更新後的資料
             return res.json({
                success: true,
                message: '個人資料更新成功',
                user: {
                    id: user.id,
                    username: user.username,
                    email: email || user.email,
                    fullName: fullName,
                    role: user.role
                }
            });

        } else {
            // AdminUsers 表更新
            if (email) {
                const checkEmail = await pool.request()
                    .input('email', sql.NVarChar(100), email)
                    .input('adminUserID', sql.UniqueIdentifier, user.id)
                    .query('SELECT AdminUserID FROM AdminUsers WHERE Email = @email AND AdminUserID != @adminUserID');
                
                if (checkEmail.recordset.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: '該電子郵件已被使用'
                    });
                }
            }

            await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, user.id)
                .input('firstName', sql.NVarChar(50), firstName)
                .input('lastName', sql.NVarChar(50), lastName)
                .input('email', sql.NVarChar(100), email)
                .query(`
                    UPDATE AdminUsers 
                    SET FirstName = @firstName,
                        LastName = @lastName,
                        Email = ISNULL(@email, Email),
                        UpdatedAt = GETDATE()
                    WHERE AdminUserID = @adminUserID
                `);

            // 獲取更新後的用戶資訊 (略，為簡化直接返回輸入值)
             res.json({
                success: true,
                message: '個人資料更新成功',
                 user: {
                    id: user.id,
                    firstName,
                    lastName,
                    email
                }
            });
        }

    } catch (error) {
        console.error('更新個人資料錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器內部錯誤'
        });
    }
});

// 記錄登入嘗試
async function logLoginAttempt(pool, adminUserID, username, ipAddress, userAgent, isSuccessful, failureReason, sessionToken = null) {
    try {
        // 截斷 sessionToken 以符合資料庫欄位長度 (假設為 255 或更多，但為了安全截斷)
        // 同時避免 TDS 協議錯誤
        const truncatedToken = sessionToken ? sessionToken.substring(0, 250) : null;

        await pool.request()
            .input('adminUserID', sql.UniqueIdentifier, adminUserID)
            .input('username', sql.NVarChar(50), username)
            .input('ipAddress', sql.NVarChar(45), ipAddress)
            .input('userAgent', sql.NVarChar(500), userAgent)
            .input('isSuccessful', sql.Bit, isSuccessful)
            .input('failureReason', sql.NVarChar(255), failureReason)
            .input('sessionToken', sql.NVarChar(255), truncatedToken)
            .query(`
                INSERT INTO AdminLoginLogs (
                    AdminUserID, Username, IPAddress, UserAgent,
                    IsSuccessful, FailureReason, SessionToken
                ) VALUES (
                    @adminUserID, @username, @ipAddress, @userAgent,
                    @isSuccessful, @failureReason, @sessionToken
                )
            `);
    } catch (error) {
        console.error('記錄登入嘗試錯誤:', error);
    }
}

module.exports = router;
