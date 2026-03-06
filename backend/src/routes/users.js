const express = require('express');
const bcrypt = require('bcryptjs');
const { executeQuery, sql } = require('../config/database');
const { authenticateAdmin } = require('../middleware/admin-auth');
const { validate, userValidations, queryValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// 所有路由都需要管理員認證
router.use(authenticateAdmin);

// 獲取使用者列表 (僅管理員和經理)
router.get('/',
  validate(queryValidations.pagination, 'query'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc', search, status, role } = req.query;
    const offset = (page - 1) * limit;

    // 建構查詢條件
    let whereConditions = [];
    const params = {};

    // 狀態過濾 (預設顯示所有，除非明確指定)
    // 如果 status 是 'active'，顯示啟用 (is_active = 1)
    // 如果 status 是 'inactive'，顯示停用 (is_active = 0)
    // 如果 status 是 'all' 或未提供，顯示所有
    if (status === 'active') {
        whereConditions.push('u.is_active = 1');
    } else if (status === 'inactive') {
        whereConditions.push('u.is_active = 0');
    }
    // 如果是 'all' 或其他值，不添加 is_active 條件，即顯示所有

    // 角色過濾
    if (role) {
        whereConditions.push('u.role = @role');
        params.role = role;
    }

    if (search) {
      whereConditions.push('(u.username LIKE @search OR u.email LIKE @search OR u.full_name LIKE @search)');
      params.search = `%${search}%`;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM Users u ${whereClause}`;
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取使用者列表
    const query = `
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
        u.manager_id, m.full_name as manager_name,
        u.assigned_workflow_id, aw.name as assigned_workflow_name
      FROM Users u
      LEFT JOIN Users m ON u.manager_id = m.id
      LEFT JOIN ApprovalWorkflows aw ON u.assigned_workflow_id = aw.id
      ${whereClause}
      ORDER BY u.${sortBy} ${sortOrder}
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
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          managerId: user.manager_id,
          managerName: user.manager_name,
          assignedWorkflowId: user.assigned_workflow_id,
          assignedWorkflowName: user.assigned_workflow_name
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// 獲取使用者統計 (僅管理員、經理和編輯)
router.get('/stats/overview',
  asyncHandler(async (req, res) => {
    // 檢查權限
    if (!['Admin', 'Manager', 'Editor'].includes(req.admin.role)) {
      throw new AppError('權限不足', 403);
    }
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN role = 'Admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'Manager' THEN 1 ELSE 0 END) as managers,
        SUM(CASE WHEN role = 'User' THEN 1 ELSE 0 END) as users
      FROM Users
    `;

    const result = await executeQuery(statsQuery);
    const stats = result.recordset[0];

    res.json({
      success: true,
      data: {
        totalUsers: stats.total,
        activeUsers: stats.active,
        inactiveUsers: stats.inactive,
        usersByRole: {
          admin: stats.admins,
          manager: stats.managers,
          user: stats.users
        }
      }
    });
  })
);

// 獲取角色列表
router.get('/roles',
  asyncHandler(async (req, res) => {
    // 檢查權限
    if (!['Admin', 'Manager'].includes(req.admin.role)) {
      throw new AppError('權限不足', 403);
    }

    const roles = [
      { value: 'Admin', label: '管理員' },
      { value: 'Manager', label: '經理' },
      { value: 'Approver', label: '審核員' },
      { value: 'User', label: '一般使用者' }
    ];

    res.json({
      success: true,
      data: roles
    });
  })
);

// 匯出使用者資料 (僅管理員)
router.get('/export',
  asyncHandler(async (req, res) => {
    // 檢查權限
    if (req.admin.role !== 'Admin') {
      throw new AppError('權限不足', 403);
    }

    const { format = 'csv', search, role } = req.query;

    // 建構查詢條件
    let whereConditions = ['u.is_active = 1'];
    const params = {};

    if (search) {
      whereConditions.push('(u.username LIKE @search OR u.email LIKE @search OR u.full_name LIKE @search)');
      params.search = `%${search}%`;
    }

    if (role) {
      whereConditions.push('u.role = @role');
      params.role = role;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 查詢使用者資料
    const query = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.role,
        CASE WHEN u.is_active = 1 THEN '啟用' ELSE '停用' END as status,
        u.created_at,
        u.updated_at,
        m.full_name as manager_name,
        u.assigned_workflow_id,
        aw.name as assigned_workflow_name
      FROM Users u
      LEFT JOIN Users m ON u.manager_id = m.id
      LEFT JOIN ApprovalWorkflows aw ON u.assigned_workflow_id = aw.id
      ${whereClause}
      ORDER BY u.created_at DESC
    `;

    const result = await executeQuery(query, params);
    const users = result.recordset;

    if (format === 'csv') {
      // 生成 CSV 格式
      const csvHeader = 'ID,使用者名稱,電子郵件,全名,角色,直屬主管,分配審核流程,狀態,建立時間,更新時間\n';
      const csvRows = users.map(user => {
        const createdAt = new Date(user.created_at).toLocaleString('zh-TW');
        const updatedAt = new Date(user.updated_at).toLocaleString('zh-TW');
        return `${user.id},"${user.username}","${user.email}","${user.full_name || ''}","${user.role}","${user.manager_name || ''}","${user.assigned_workflow_name || ''}","${user.status}","${createdAt}","${updatedAt}"`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="users_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send('\uFEFF' + csvContent); // 添加 BOM 以支援中文
    } else {
      // JSON 格式
      res.json({
        success: true,
        data: users
      });
    }
  })
);

// 獲取單一使用者 (管理員和經理可查看所有，一般使用者只能查看自己)
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const currentUser = req.admin;

    // 檢查權限
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Manager' && currentUser.role !== 'Editor' && currentUser.userId !== id) {
      throw new AppError('權限不足', 403);
    }

    // 獲取使用者詳情
    const query = `
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
        u.manager_id, m.full_name as manager_name,
        u.assigned_workflow_id, aw.name as assigned_workflow_name
      FROM Users u
      LEFT JOIN Users m ON u.manager_id = m.id
      LEFT JOIN ApprovalWorkflows aw ON u.assigned_workflow_id = aw.id
      WHERE u.id = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }

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
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          managerId: user.manager_id,
          managerName: user.manager_name,
          assignedWorkflowId: user.assigned_workflow_id,
          assignedWorkflowName: user.assigned_workflow_name
        }
      }
    });
  })
);

// 建立新使用者 (僅管理員)
router.post('/',
  validate(userValidations.register),
  asyncHandler(async (req, res) => {
    // 檢查權限 - 只有管理員可以創建用戶
    if (req.admin.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: '權限不足'
      });
    }

    const { username, email, password, fullName, role, managerId, isActive, assignedWorkflowId } = req.body;

    // 檢查使用者是否已存在
    const checkQuery = `
        SELECT id, username, email FROM Users 
        WHERE username = @username OR email = @email
    `;
    const existingUser = await executeQuery(checkQuery, { username, email });

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: '使用者名稱或電子郵件已存在'
      });
    }

    // 檢查主管是否存在
    if (managerId) {
      const managerCheck = await executeQuery('SELECT id FROM Users WHERE id = @managerId', { managerId });
      if (managerCheck.recordset.length === 0) {
        return res.status(400).json({
          success: false,
          message: '指定的直屬主管不存在'
        });
      }
    }

    // 檢查工作流程是否存在
    if (assignedWorkflowId) {
      const workflowCheck = await executeQuery('SELECT id FROM ApprovalWorkflows WHERE id = @assignedWorkflowId', { assignedWorkflowId });
      if (workflowCheck.recordset.length === 0) {
        return res.status(400).json({
          success: false,
          message: '指定的工作流程不存在'
        });
      }
    }

    // 加密密碼
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 創建新使用者
    const insertQuery = `
        INSERT INTO Users (username, email, password_hash, full_name, role, manager_id, is_active, assigned_workflow_id, created_at, updated_at)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.full_name, INSERTED.role, INSERTED.manager_id, INSERTED.assigned_workflow_id, INSERTED.created_at
        VALUES (@username, @email, @passwordHash, @fullName, @role, @managerId, @isActive, @assignedWorkflowId, GETDATE(), GETDATE())
    `;

    const result = await executeQuery(insertQuery, {
      username,
      email,
      passwordHash,
      fullName,
      role,
      managerId: managerId || null,
      isActive: isActive !== undefined ? isActive : true,
      assignedWorkflowId: assignedWorkflowId || null
    });

    const newUser = result.recordset[0];

    res.status(201).json({
      success: true,
      message: '使用者建立成功',
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.full_name,
          role: newUser.role,
          managerId: newUser.manager_id,
          assignedWorkflowId: newUser.assigned_workflow_id,
          createdAt: newUser.created_at
        }
      }
    });
  })
);

// 更新使用者 (管理員可更新所有，一般使用者只能更新自己的部分資訊)
router.put('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, email, fullName, role, isActive, managerId, assignedWorkflowId } = req.body;
    const currentUser = req.admin;

    // 檢查權限 - 管理員可以更新所有用戶
    if (!['Admin', 'Manager'].includes(currentUser.role)) {
      throw new AppError('權限不足', 403);
    }

    const params = { id };
    const updateFields = [];

    // 檢查是否有要更新的欄位
    if (username !== undefined) {
      // 檢查使用者名稱是否重複
      const checkQuery = `SELECT id FROM Users WHERE username = @username AND id != @id`;
      const checkResult = await executeQuery(checkQuery, { username, id });
      if (checkResult.recordset.length > 0) {
        throw new AppError('使用者名稱已存在', 400);
      }
      updateFields.push('username = @username');
      params.username = username;
    }

    if (email !== undefined) {
      // 檢查電子郵件是否重複
      const checkQuery = `SELECT id FROM Users WHERE email = @email AND id != @id`;
      const checkResult = await executeQuery(checkQuery, { email, id });
      if (checkResult.recordset.length > 0) {
        throw new AppError('電子郵件已存在', 400);
      }
      updateFields.push('email = @email');
      params.email = email;
    }

    if (fullName !== undefined) {
      updateFields.push('full_name = @fullName');
      params.fullName = fullName;
    }

    if (role !== undefined) {
      updateFields.push('role = @role');
      params.role = role;
    }

    if (isActive !== undefined) {
      updateFields.push('is_active = @isActive');
      params.isActive = isActive;
    }

    if (managerId !== undefined) {
      if (managerId === null || managerId === '') {
        updateFields.push('manager_id = NULL');
      } else {
        // 檢查主管是否存在
        const managerCheck = await executeQuery('SELECT id FROM Users WHERE id = @managerId', { managerId });
        if (managerCheck.recordset.length === 0) {
          throw new AppError('指定的直屬主管不存在', 400);
        }
        // 防止自我參照
        if (managerId == id) {
          throw new AppError('無法將自己設為直屬主管', 400);
        }
        updateFields.push('manager_id = @managerId');
        params.managerId = managerId;
      }
    }

    if (assignedWorkflowId !== undefined) {
      if (assignedWorkflowId === null || assignedWorkflowId === '') {
        updateFields.push('assigned_workflow_id = NULL');
      } else {
        // 檢查工作流程是否存在
        const workflowCheck = await executeQuery('SELECT id FROM ApprovalWorkflows WHERE id = @assignedWorkflowId', { assignedWorkflowId });
        if (workflowCheck.recordset.length === 0) {
          throw new AppError('指定的工作流程不存在', 400);
        }
        updateFields.push('assigned_workflow_id = @assignedWorkflowId');
        params.assignedWorkflowId = assignedWorkflowId;
      }
    }

    if (updateFields.length === 0) {
      throw new AppError('沒有提供要更新的欄位', 400);
    }

    // 添加更新時間
    updateFields.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE Users 
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, 
             INSERTED.full_name, INSERTED.role, INSERTED.is_active, INSERTED.manager_id, INSERTED.assigned_workflow_id
      WHERE id = @id
    `;

    const result = await executeQuery(updateQuery, params);

    if (result.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }

    const updatedUser = result.recordset[0];

    res.json({
      success: true,
      message: '使用者更新成功',
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          fullName: updatedUser.full_name,
          role: updatedUser.role,
          isActive: updatedUser.is_active,
          managerId: updatedUser.manager_id,
          assignedWorkflowId: updatedUser.assigned_workflow_id
        }
      }
    });
  })
);

// 刪除使用者 (軟刪除，僅管理員)
router.delete('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 檢查權限
    if (req.admin.role !== 'Admin') {
      throw new AppError('權限不足', 403);
    }

    // 檢查用戶是否存在
    const checkResult = await executeQuery(
      `SELECT id, is_active FROM Users WHERE id = @id`,
      { id }
    );

    if (checkResult.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }

    const user = checkResult.recordset[0];
    
    if (user.is_active) {
      // 軟刪除使用者
      await executeQuery(
        `UPDATE Users 
         SET is_active = 0, updated_at = GETDATE()
         WHERE id = @id`,
        { id }
      );

      res.json({
        success: true,
        message: '使用者已停用'
      });
    } else {
      // 硬刪除使用者 (永久刪除)
      try {
        await executeQuery(
          `DELETE FROM Users WHERE id = @id`,
          { id }
        );

        res.json({
          success: true,
          message: '使用者已永久刪除'
        });
      } catch (error) {
        // 檢查是否為外鍵約束錯誤 (SQL Server 錯誤碼 547)
        if (error.number === 547 || (error.message && error.message.includes('REFERENCE'))) {
          throw new AppError('無法永久刪除：該使用者尚有相關聯的資料（如下屬、審核紀錄等）。', 400);
        }
        throw error;
      }
    }
  })
);

// 切換使用者狀態 (僅管理員和經理)
router.patch('/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    // 檢查權限
    if (!['Admin', 'Manager'].includes(req.admin.role)) {
      throw new AppError('權限不足', 403);
    }

    if (typeof is_active !== 'boolean') {
      throw new AppError('is_active 必須是布林值', 400);
    }

    // 更新用戶狀態
    const result = await executeQuery(
      `UPDATE Users 
       SET is_active = @isActive, updated_at = GETDATE()
       OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, 
              INSERTED.full_name, INSERTED.role, INSERTED.is_active
       WHERE id = @id`,
      {
        id,
        isActive: is_active
      }
    );

    if (result.recordset.length === 0) {
      throw new AppError('使用者不存在', 404);
    }

    const updatedUser = result.recordset[0];

    res.json({
      success: true,
      message: `使用者已${is_active ? '啟用' : '停用'}`,
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          fullName: updatedUser.full_name,
          role: updatedUser.role,
          isActive: updatedUser.is_active
        }
      }
    });
  })
);

// 重設使用者密碼 (僅管理員)
router.post('/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    // 檢查權限
    if (req.admin.role !== 'Admin') {
      throw new AppError('權限不足', 403);
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!newPassword || newPassword.length < 8 || !passwordRegex.test(newPassword)) {
      throw new AppError('新密碼必須至少8個字符，且包含大小寫字母和數字', 400);
    }

    // 加密新密碼
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // 更新密碼
    const result = await executeQuery(
      `UPDATE Users 
       SET password_hash = @passwordHash, updated_at = GETDATE()
       WHERE id = @id AND is_active = 1`,
      {
        id,
        passwordHash
      }
    );

    if (result.rowsAffected[0] === 0) {
      throw new AppError('使用者不存在或已被停用', 404);
    }

    res.json({
      success: true,
      message: '密碼重設成功'
    });
  })
);

module.exports = router;
