const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

// JWT 認證中介軟體
const authenticateToken = async (req, res, next) => {
  try {
    // 調試信息
    console.log('🔧 認證中間件調試:');
    console.log('SKIP_AUTH:', process.env.SKIP_AUTH);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('條件檢查:', process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development');
    
    // 開發模式下跳過認證
    if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
      console.log('🔧 開發模式：跳過認證檢查');
      // 設置一個模擬用戶用於開發
      req.user = {
        userId: 1, // 使用整數 ID 而不是 UUID
        id: 1,
        username: 'dev_user',
        email: 'dev@example.com',
        full_name: '開發用戶',
        role: 'admin',
        is_active: 1
      };
      return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '存取被拒絕，需要有效的認證令牌'
      });
    }

    console.log('Verifying token:', token.substring(0, 20) + '...');
    console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');

    // 驗證 JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token verified payload:', decoded);
    
    let user = null;

    // 檢查是否為管理員 Token
    if (decoded.adminUserID) {
      const query = `
        SELECT AdminUserID as id, Username as username, Email as email, DisplayName as full_name, Role as role, IsActive as is_active
        FROM AdminUsers 
        WHERE AdminUserID = @userId AND IsActive = 1
      `;
      const result = await executeQuery(query, { userId: decoded.adminUserID });
      if (result.recordset.length > 0) {
        user = result.recordset[0];
        user.userId = user.id; // Alias for consistency
      }
    } 
    // 一般使用者 Token
    else if (decoded.userId || decoded.id) {
      const query = `
        SELECT id, username, email, full_name, role, is_active, updated_at
        FROM Users 
        WHERE id = @userId AND is_active = 1
      `;
      const result = await executeQuery(query, { userId: decoded.userId || decoded.id });
      if (result.recordset.length > 0) {
        user = result.recordset[0];
        user.userId = user.id; // Alias for consistency
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '無效的認證令牌或使用者不存在'
      });
    }

    // 將使用者資訊附加到請求物件
    req.user = user;

    // 更新最後活躍時間 (非同步執行，不阻塞請求)
    if (user && user.id) {
        // 使用更寬鬆的條件來更新，避免每次請求都查詢數據庫
        // 但為了確保精確性，這裡先每次都更新
        const updateActivityQuery = `
            UPDATE UserLoginLogs 
            SET last_active_at = GETDATE() 
            WHERE user_id = @userId 
            AND logout_time IS NULL 
            AND id = (
                SELECT TOP 1 id FROM UserLoginLogs 
                WHERE user_id = @userId AND logout_time IS NULL 
                ORDER BY login_time DESC
            )
        `;
        // 不等待結果，避免影響效能
        executeQuery(updateActivityQuery, { userId: user.id }).catch(err => {
            console.error('Failed to update last activity:', err);
        });
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '無效的認證令牌'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '認證令牌已過期'
      });
    } else {
      console.error('認證中介軟體錯誤:', error);
      return res.status(500).json({
        success: false,
        message: '伺服器內部錯誤'
      });
    }
  }
};

// 角色授權中介軟體
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // 開發模式下跳過權限檢查
    if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
      // 設置一個模擬用戶用於開發
      req.user = {
        userId: 1,
        id: 1,
        username: 'dev_user',
        email: 'dev@example.com',
        full_name: '開發用戶',
        role: 'admin',
        is_active: 1
      };
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '需要先進行身份認證'
      });
    }

    // Normalize user role and allowed roles to lowercase for comparison
    const userRole = req.user.role ? req.user.role.toLowerCase() : '';
    const allowedRoles = roles.map(role => role.toLowerCase());

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: '權限不足，無法存取此資源'
      });
    }

    next();
  };
};

// 檢查資源擁有者權限
const checkResourceOwner = (resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField];
      const userId = req.user.id;
      const userRole = req.user.role;

      // 管理員可以存取所有資源
      if (userRole === 'Admin') {
        return next();
      }

      // 檢查資源是否屬於當前使用者
      // 這裡需要根據具體的資源類型來實現檢查邏輯
      // 暫時允許通過，具體實現在各個路由中處理
      next();
    } catch (error) {
      console.error('資源擁有者檢查錯誤:', error);
      return res.status(500).json({
        success: false,
        message: '伺服器內部錯誤'
      });
    }
  };
};

// 可選的認證中介軟體（不強制要求認證）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const query = `
        SELECT id, username, email, full_name, role, is_active
        FROM Users 
        WHERE id = @userId AND is_active = 1
      `;
      
      const result = await executeQuery(query, { userId: decoded.userId });
      
      if (result.recordset.length > 0) {
        req.user = result.recordset[0];
        req.user.userId = req.user.id; // Alias for consistency
      }
    }
    
    next();
  } catch (error) {
    // 可選認證失敗時不阻止請求繼續
    next();
  }
};

// 生成 JWT 令牌
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// 生成刷新令牌
const generateRefreshToken = (user) => {
  const payload = {
    userId: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d' // 刷新令牌有效期 7 天
  });
};

// 驗證刷新令牌
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('無效的刷新令牌類型');
    }
    return decoded;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  checkResourceOwner,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};