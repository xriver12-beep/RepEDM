const jwt = require('jsonwebtoken');
const sql = require('mssql');
const { getPool } = require('../config/database');

// 驗證管理員token
const authenticateAdmin = async (req, res, next) => {
    try {
        // 開發模式下跳過認證
        console.log('=== Admin Auth Debug ===');
        console.log('SKIP_AUTH:', process.env.SKIP_AUTH);
        console.log('NODE_ENV:', process.env.NODE_ENV);
        
        if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
            console.log('開發模式：跳過管理員認證');
            // 設置模擬管理員用戶
            req.admin = {
                adminUserID: 'dev-admin-id',
                userId: 'dev-admin-id',
                username: 'dev-admin',
                email: 'dev-admin@example.com',
                role: 'Admin',
                fullName: 'Development Admin'
            };
            return next();
        }

        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '未提供認證令牌'
            });
        }

        // 驗證JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 從資料庫驗證用戶是否仍然有效
        const pool = req.app.locals.db;
        let userResult;
        
        // 檢查是否為admin-auth token (包含adminUserID) 或普通auth token (包含userId)
        if (decoded.adminUserID) {
            // admin-auth token - 查詢 AdminUsers 表
            console.log('=== Admin Auth Debug ===');
            console.log('Auth header:', authHeader);
            console.log('Token:', token.substring(0, 20) + '...');
            console.log('Decoded token:', decoded);
            
            userResult = await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, decoded.adminUserID)
                .query(`
                    SELECT 
                        AdminUserID as id, Username as username, Email as email, 
                        Role as role, IsActive as is_active, DisplayName as full_name
                    FROM AdminUsers 
                    WHERE AdminUserID = @adminUserID AND IsActive = 1
                `);
            
            console.log('User query result:', userResult.recordset);
        } else if (decoded.userId) {
            // 普通auth token - 查詢 Users 表
            userResult = await pool.request()
                .input('userId', sql.Int, decoded.userId)
                .query(`
                    SELECT 
                        id, username, email, role, is_active, full_name
                    FROM Users 
                    WHERE id = @userId AND is_active = 1
                `);
        } else {
            return res.status(403).json({
                success: false,
                message: 'token格式無效'
            });
        }

        if (userResult.recordset.length === 0) {
            return res.status(403).json({
                success: false,
                message: '用戶不存在或已被停用'
            });
        }

        const user = userResult.recordset[0];
        
        // 檢查用戶是否有管理員權限
        // 對於前台帳戶(Users表)，只允許Admin進入後台
        // 對於後台帳戶(AdminUsers表)，保持原有的角色權限
        let allowedRoles = ['Admin', 'Manager', 'Editor'];
        
        if (decoded.userId) {
            allowedRoles = ['Admin'];
        }

        // Normalize roles for comparison
        const userRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : '';
        const normalizedAllowedRoles = allowedRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase());

        if (!normalizedAllowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: '權限不足，需要管理員權限'
            });
        }
        
        // Normalize role to Title Case (e.g., "Admin", "User")
        const normalizedRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : '';

        // 將用戶資訊附加到請求對象
        req.admin = {
            id: user.id, // Ensure id is available
            adminUserID: user.id, // 對於 AdminUsers 表，這是 AdminUserID
            userId: user.id,      // 保持向後兼容
            username: user.username,
            email: user.email,
            role: normalizedRole,
            fullName: user.full_name
        };

        // 為了兼容性，同時設置 req.user
        req.user = req.admin;

        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({
                success: false,
                message: 'token無效'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(403).json({
                success: false,
                message: 'token已過期'
            });
        } else {
            console.error('管理員認證錯誤:', error);
            return res.status(500).json({
                success: false,
                message: '伺服器內部錯誤'
            });
        }
    }
};

// 檢查管理員角色權限
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: '未認證的請求'
            });
        }

        const userRole = req.admin.role;
        
        // 如果是字符串，轉換為數組
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        // Normalize for comparison
        const normalizedUserRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase() : '';
        const normalizedAllowedRoles = roles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase());

        if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
            return res.status(403).json({
                success: false,
                message: '權限不足'
            });
        }

        next();
    };
};

// 檢查特定權限
const requirePermission = (permissionName) => {
    return async (req, res, next) => {
        try {
            if (!req.admin) {
                return res.status(401).json({
                    success: false,
                    message: '未認證的請求'
                });
            }

            const pool = req.app.locals.db;
            
            // 檢查用戶角色是否有該權限
            const permissionResult = await pool.request()
                .input('role', sql.NVarChar(20), req.admin.role)
                .input('permissionName', sql.NVarChar(50), permissionName)
                .query(`
                    SELECT COUNT(*) as HasPermission
                    FROM RolePermissions rp
                    INNER JOIN AdminPermissions ap ON rp.PermissionID = ap.PermissionID
                    WHERE rp.Role = @role AND ap.PermissionName = @permissionName
                `);

            const hasPermission = permissionResult.recordset[0].HasPermission > 0;

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `缺少權限: ${permissionName}`
                });
            }

            next();

        } catch (error) {
            console.error('權限檢查錯誤:', error);
            return res.status(500).json({
                success: false,
                message: '伺服器內部錯誤'
            });
        }
    };
};

// 管理員專用權限（只有Admin角色可以訪問）
const requireAdmin = requireRole('Admin');

// 管理員和經理權限（Admin和Manager角色可以訪問）
const requireManagerOrAbove = requireRole(['Admin', 'Manager']);

// 所有管理員權限（所有角色都可以訪問）
const requireAnyAdmin = requireRole(['Admin', 'Manager', 'Editor']);

// 認證用戶或管理員 (允許任何有效用戶，不限角色)
const authenticateUserOrAdmin = async (req, res, next) => {
    try {
        // 開發模式下跳過認證
        if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
            req.user = {
                userId: 1,
                username: 'dev_user',
                email: 'dev@example.com',
                role: 'admin',
                fullName: 'Development User'
            };
            return next();
        }

        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '未提供認證令牌'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const pool = req.app.locals.db;
        let userResult;
        let isAdminUser = false;
        
        if (decoded.adminUserID) {
            isAdminUser = true;
            userResult = await pool.request()
                .input('adminUserID', sql.UniqueIdentifier, decoded.adminUserID)
                .query(`
                    SELECT 
                        AdminUserID as id, Username as username, Email as email, 
                        Role as role, IsActive as is_active, DisplayName as full_name
                    FROM AdminUsers 
                    WHERE AdminUserID = @adminUserID AND IsActive = 1
                `);
        } else if (decoded.userId) {
            userResult = await pool.request()
                .input('userId', sql.Int, decoded.userId)
                .query(`
                    SELECT 
                        id, username, email, role, is_active, full_name
                    FROM Users 
                    WHERE id = @userId AND is_active = 1
                `);
        } else {
            return res.status(403).json({
                success: false,
                message: 'token格式無效'
            });
        }

        if (userResult.recordset.length === 0) {
            return res.status(403).json({
                success: false,
                message: '用戶不存在或已被停用'
            });
        }

        const user = userResult.recordset[0];
        
        // 設置 req.user (所有通過認證的請求都有這個)
        req.user = {
            id: user.id, // Ensure id is available
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.full_name
        };

        // 如果是管理員表中的用戶，也設置 req.admin (為了兼容性)
        if (isAdminUser) {
            req.admin = {
                adminUserID: user.id,
                ...req.user
            };
        } else {
             // 即使是一般用戶，也設置 req.admin，但標記角色為 User (為了某些只檢查 req.admin 存在的邏輯)
             // 許多路由使用 authenticateUserOrAdmin 但後續可能檢查 req.admin.role
             req.admin = {
                 ...req.user,
                 role: user.role // 確保角色傳遞
             };
        }

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'token無效'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'token已過期'
            });
        } else {
            console.error('認證錯誤:', error);
            return res.status(500).json({
                success: false,
                message: '伺服器內部錯誤'
            });
        }
    }
};

module.exports = {
    authenticateAdmin,
    authenticateUserOrAdmin,
    requireRole,
    requirePermission,
    requireAdmin,
    requireManagerOrAbove,
    requireAnyAdmin
};