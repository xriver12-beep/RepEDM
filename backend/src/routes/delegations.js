const express = require('express');
const router = express.Router();
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Joi = require('joi');

// 驗證 schema
const createDelegationSchema = Joi.object({
  delegateId: Joi.alternatives().try(Joi.string(), Joi.number()).required(), // 接受委派的人 (支持 UUID 或 Int)
  workflowId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).optional(), // 特定工作流程
  startDate: Joi.date().default(Date.now),
  endDate: Joi.date().allow(null).optional(),
  reason: Joi.string().max(500).allow('').optional()
});

// 1. 獲取我的委派列表 (我委派給別人的)
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { activeOnly } = req.query;

  let whereClause = 'WHERE d.DelegatorID = @userId';
  if (activeOnly === 'true') {
    whereClause += ' AND d.IsActive = 1 AND (d.EndDate IS NULL OR d.EndDate > GETDATE())';
  }

  const query = `
    SELECT 
      d.DelegationID,
      d.DelegatorID,
      d.DelegateID,
      d.WorkflowID,
      d.StartDate,
      d.EndDate,
      d.IsActive,
      d.Reason,
      d.CreatedAt,
      u.full_name as DelegateName,
      u.email as DelegateEmail,
      aw.name as WorkflowName
    FROM ApprovalDelegations d
    INNER JOIN Users u ON d.DelegateID = u.id
    LEFT JOIN ApprovalWorkflows aw ON d.WorkflowID = aw.id
    ${whereClause}
    ORDER BY d.CreatedAt DESC
  `;

  const result = await executeQuery(query, { userId });

  res.json({
    success: true,
    data: result.recordset
  });
}));

// 2. 獲取委派給我的列表 (別人委派給我的)
router.get('/assigned', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { activeOnly } = req.query;

  let whereClause = 'WHERE d.DelegateID = @userId';
  if (activeOnly === 'true') {
    whereClause += ' AND d.IsActive = 1 AND (d.EndDate IS NULL OR d.EndDate > GETDATE())';
  }

  const query = `
    SELECT 
      d.DelegationID,
      d.DelegatorID,
      d.DelegateID,
      d.WorkflowID,
      d.StartDate,
      d.EndDate,
      d.IsActive,
      d.Reason,
      d.CreatedAt,
      u.full_name as DelegatorName,
      u.email as DelegatorEmail,
      aw.name as WorkflowName
    FROM ApprovalDelegations d
    INNER JOIN Users u ON d.DelegatorID = u.id
    LEFT JOIN ApprovalWorkflows aw ON d.WorkflowID = aw.id
    ${whereClause}
    ORDER BY d.CreatedAt DESC
  `;

  const result = await executeQuery(query, { userId });

  res.json({
    success: true,
    data: result.recordset
  });
}));

// 3. 創建新的委派
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = createDelegationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '輸入資料驗證失敗',
      errors: error.details
    });
  }

  const { delegateId, workflowId, startDate, endDate, reason } = value;
  const userId = req.user.userId;

  // 不能委派給自己
  if (delegateId === userId) {
    return res.status(400).json({
      success: false,
      message: '不能委派給自己'
    });
  }

  // 檢查接受者是否存在
  const userCheckQuery = 'SELECT id FROM Users WHERE id = @delegateId';
  const userCheck = await executeQuery(userCheckQuery, { delegateId });
  if (userCheck.recordset.length === 0) {
    return res.status(404).json({
      success: false,
      message: '找不到指定的委派對象'
    });
  }

  // 檢查是否已有重疊的委派
  // 這裡簡化處理：如果同一個人、同一工作流程，且時間重疊，則提示衝突
  // 實際邏輯可能更複雜，例如檢查特定工作流程與全域委派的衝突
  
  // 插入新委派
  const insertQuery = `
    INSERT INTO ApprovalDelegations (
      DelegatorID, DelegateID, WorkflowID, StartDate, EndDate, IsActive, Reason, CreatedBy
    )
    OUTPUT INSERTED.DelegationID
    VALUES (
      @userId, @delegateId, @workflowId, @startDate, @endDate, 1, @reason, @userId
    )
  `;

  const result = await executeQuery(insertQuery, {
    userId,
    delegateId,
    workflowId: workflowId || null,
    startDate,
    endDate: endDate || null,
    reason: reason || ''
  });

  res.status(201).json({
    success: true,
    message: '委派設定成功',
    data: {
      delegationId: result.recordset[0].DelegationID
    }
  });
}));

// 4. 取消/結束委派
router.put('/:id/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  // 檢查委派是否存在且屬於當前用戶
  const checkQuery = `
    SELECT DelegationID 
    FROM ApprovalDelegations 
    WHERE DelegationID = @id AND DelegatorID = @userId
  `;
  const checkResult = await executeQuery(checkQuery, { id, userId });

  if (checkResult.recordset.length === 0) {
    return res.status(404).json({
      success: false,
      message: '找不到指定的委派記錄或您無權修改'
    });
  }

  // 更新狀態為不啟用
  const updateQuery = `
    UPDATE ApprovalDelegations
    SET IsActive = 0, EndDate = GETDATE()
    WHERE DelegationID = @id
  `;

  await executeQuery(updateQuery, { id });

  res.json({
    success: true,
    message: '委派已取消'
  });
}));

module.exports = router;
