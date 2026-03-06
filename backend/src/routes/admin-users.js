const express = require('express');
const bcrypt = require('bcryptjs');
const { executeQuery, sql } = require('../config/database');
const { authenticateAdmin } = require('../middleware/admin-auth');
const { validate, commonValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Joi = require('joi');

const router = express.Router();

// 所有路由都需要管理員認證
router.use(authenticateAdmin);

// 驗證規則
const adminUserValidations = {
    create: Joi.object({
        username: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).message('使用者名稱只能包含字母、數字和底線').min(3).max(50).required(),
        email: commonValidations.email,
        password: commonValidations.password,
        firstName: Joi.string().max(50).allow('', null),
        lastName: Joi.string().max(50).allow('', null),
        displayName: Joi.string().max(100).allow('', null),
        role: Joi.string().valid('Admin', 'Manager', 'Editor', 'Viewer').required(),
        department: Joi.string().max(100).allow('', null),
        position: Joi.string().max(100).allow('', null),
        isActive: Joi.boolean().default(true)
    }),
    update: Joi.object({
        username: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).message('使用者名稱只能包含字母、數字和底線').min(3).max(50),
        email: Joi.string().email().max(255),
        firstName: Joi.string().max(50).allow('', null),
        lastName: Joi.string().max(50).allow('', null),
        displayName: Joi.string().max(100).allow('', null),
        role: Joi.string().valid('Admin', 'Manager', 'Editor', 'Viewer'),
        department: Joi.string().max(100).allow('', null),
        position: Joi.string().max(100).allow('', null),
        isActive: Joi.boolean()
    })
};

// 獲取統計數據
router.get('/stats', asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const query = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN Role = 'Admin' THEN 1 ELSE 0 END) as admins,
            SUM(CASE WHEN Role = 'Manager' THEN 1 ELSE 0 END) as managers
        FROM AdminUsers
    `;

    const result = await executeQuery(query);
    const stats = result.recordset[0];

    res.json({
        success: true,
        data: {
            totalUsers: stats.total,
            activeUsers: stats.active,
            roleBreakdown: {
                admin: stats.admins,
                manager: stats.managers
            }
        }
    });
}));

// 獲取管理員列表
router.get('/', asyncHandler(async (req, res) => {
    // 檢查權限 - 只有 Admin 可以查看所有管理員
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { page = 1, limit = 10, search, role, status, sortBy = 'CreatedAt', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    const params = {};

    if (search) {
        whereConditions.push('(Username LIKE @search OR Email LIKE @search OR DisplayName LIKE @search)');
        params.search = `%${search}%`;
    }

    if (role) {
        whereConditions.push('Role = @role');
        params.role = role;
    }

    if (status === 'active') {
        whereConditions.push('IsActive = 1');
    } else if (status === 'inactive') {
        whereConditions.push('IsActive = 0');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM AdminUsers ${whereClause}`;
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取列表
    const query = `
        SELECT 
            AdminUserID, Username, Email, FirstName, LastName, DisplayName, 
            Role, Department, Position, IsActive, LastLoginAt, CreatedAt, UpdatedAt
        FROM AdminUsers
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(query, {
        ...params,
        offset,
        limit: parseInt(limit)
    });

    res.json({
        success: true,
        data: {
            users: result.recordset.map(user => ({
                id: user.AdminUserID,
                username: user.Username,
                email: user.Email,
                firstName: user.FirstName,
                lastName: user.LastName,
                displayName: user.DisplayName,
                role: user.Role,
                department: user.Department,
                position: user.Position,
                isActive: user.IsActive,
                lastLoginAt: user.LastLoginAt,
                createdAt: user.CreatedAt,
                updatedAt: user.UpdatedAt
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
}));

// 獲取單一管理員
router.get('/:id', asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { id } = req.params;
    
    const query = `
        SELECT 
            AdminUserID, Username, Email, FirstName, LastName, DisplayName, 
            Role, Department, Position, IsActive, LastLoginAt, CreatedAt, UpdatedAt
        FROM AdminUsers
        WHERE AdminUserID = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
        throw new AppError('管理員不存在', 404);
    }

    const user = result.recordset[0];

    res.json({
        success: true,
        data: {
            user: {
                id: user.AdminUserID,
                username: user.Username,
                email: user.Email,
                firstName: user.FirstName,
                lastName: user.LastName,
                displayName: user.DisplayName,
                role: user.Role,
                department: user.Department,
                position: user.Position,
                isActive: user.IsActive,
                lastLoginAt: user.LastLoginAt,
                createdAt: user.CreatedAt,
                updatedAt: user.UpdatedAt
            }
        }
    });
}));

// 建立新管理員
router.post('/', validate(adminUserValidations.create), asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { username, email, password, firstName, lastName, displayName, role, department, position, isActive } = req.body;

    // 檢查是否存在
    const checkQuery = `SELECT AdminUserID FROM AdminUsers WHERE Username = @username OR Email = @email`;
    const checkResult = await executeQuery(checkQuery, { username, email });

    if (checkResult.recordset.length > 0) {
        throw new AppError('使用者名稱或電子郵件已存在', 400);
    }

    // 加密密碼
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const insertQuery = `
        INSERT INTO AdminUsers (
            AdminUserID, Username, Email, PasswordHash, FirstName, LastName, DisplayName,
            Role, Department, Position, IsActive, CreatedAt, UpdatedAt, CreatedBy
        )
        OUTPUT INSERTED.AdminUserID
        VALUES (
            NEWID(), @username, @email, @passwordHash, @firstName, @lastName, @displayName,
            @role, @department, @position, @isActive, GETDATE(), GETDATE(), @createdBy
        )
    `;

    const result = await executeQuery(insertQuery, {
        username, email, passwordHash, firstName, lastName, displayName,
        role, department, position, isActive: isActive !== undefined ? isActive : true,
        createdBy: req.admin.username
    });

    res.status(201).json({
        success: true,
        message: '管理員建立成功',
        data: {
            id: result.recordset[0].AdminUserID
        }
    });
}));

// 更新管理員
router.put('/:id', validate(adminUserValidations.update), asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { id } = req.params;
    const { username, email, firstName, lastName, displayName, role, department, position, isActive } = req.body;

    // 檢查是否存在
    const checkQuery = `SELECT AdminUserID FROM AdminUsers WHERE AdminUserID = @id`;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
        throw new AppError('管理員不存在', 404);
    }

    // 檢查重複 (排除自己)
    if (username || email) {
        const duplicateQuery = `
            SELECT AdminUserID FROM AdminUsers 
            WHERE (Username = @username OR Email = @email) AND AdminUserID != @id
        `;
        const duplicateResult = await executeQuery(duplicateQuery, { 
            username: username || '', 
            email: email || '', 
            id 
        });

        if (duplicateResult.recordset.length > 0) {
            throw new AppError('使用者名稱或電子郵件已存在', 400);
        }
    }

    let updateFields = ['UpdatedAt = GETDATE()', 'UpdatedBy = @updatedBy'];
    const params = { id, updatedBy: req.admin.username };

    if (username) { updateFields.push('Username = @username'); params.username = username; }
    if (email) { updateFields.push('Email = @email'); params.email = email; }
    if (firstName !== undefined) { updateFields.push('FirstName = @firstName'); params.firstName = firstName; }
    if (lastName !== undefined) { updateFields.push('LastName = @lastName'); params.lastName = lastName; }
    if (displayName !== undefined) { updateFields.push('DisplayName = @displayName'); params.displayName = displayName; }
    if (role) { updateFields.push('Role = @role'); params.role = role; }
    if (department !== undefined) { updateFields.push('Department = @department'); params.department = department; }
    if (position !== undefined) { updateFields.push('Position = @position'); params.position = position; }
    if (isActive !== undefined) { updateFields.push('IsActive = @isActive'); params.isActive = isActive; }

    const updateQuery = `
        UPDATE AdminUsers
        SET ${updateFields.join(', ')}
        WHERE AdminUserID = @id
    `;

    await executeQuery(updateQuery, params);

    res.json({
        success: true,
        message: '管理員更新成功'
    });
}));

// 刪除管理員 (軟刪除)
router.delete('/:id', asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { id } = req.params;

    // 不能刪除自己
    if (id === req.admin.adminUserID) {
        throw new AppError('無法刪除自己的帳號', 400);
    }

    const checkQuery = `SELECT AdminUserID, IsActive FROM AdminUsers WHERE AdminUserID = @id`;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
        throw new AppError('管理員不存在', 404);
    }

    // 如果已經是停用狀態，則執行硬刪除
    if (!checkResult.recordset[0].IsActive) {
        await executeQuery(`DELETE FROM AdminUsers WHERE AdminUserID = @id`, { id });
        return res.json({ success: true, message: '管理員已永久刪除' });
    }

    // 否則執行軟刪除 (停用)
    await executeQuery(`
        UPDATE AdminUsers 
        SET IsActive = 0, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy 
        WHERE AdminUserID = @id
    `, { id, updatedBy: req.admin.username });

    res.json({
        success: true,
        message: '管理員已停用'
    });
}));

// 重設密碼
router.post('/:id/reset-password', asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!newPassword || newPassword.length < 8 || !passwordRegex.test(newPassword)) {
        throw new AppError('新密碼必須至少8個字符，且包含大小寫字母和數字', 400);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await executeQuery(`
        UPDATE AdminUsers 
        SET PasswordHash = @passwordHash, 
            MustChangePassword = 1,
            FailedLoginAttempts = 0,
            LockedUntil = NULL,
            UpdatedAt = GETDATE(), 
            UpdatedBy = @updatedBy
        WHERE AdminUserID = @id
    `, { 
        id, 
        passwordHash, 
        updatedBy: req.admin.username 
    });

    res.json({
        success: true,
        message: '密碼重設成功'
    });
}));

// 切換狀態
router.patch('/:id/status', asyncHandler(async (req, res) => {
    if (req.admin.role !== 'Admin') {
        throw new AppError('權限不足', 403);
    }

    const { id } = req.params;
    const { isActive } = req.body;

    // 不能停用自己
    if (id === req.admin.adminUserID && !isActive) {
        throw new AppError('無法停用自己的帳號', 400);
    }

    await executeQuery(`
        UPDATE AdminUsers 
        SET IsActive = @isActive, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
        WHERE AdminUserID = @id
    `, { 
        id, 
        isActive, 
        updatedBy: req.admin.username 
    });

    res.json({
        success: true,
        message: `管理員已${isActive ? '啟用' : '停用'}`
    });
}));

module.exports = router;
