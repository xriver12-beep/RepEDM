const express = require('express');
const router = express.Router();
const { executeQuery, executeTransaction } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authenticateUserOrAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/errorHandler');

// 獲取工作流程設定
router.get('/settings', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
  try {
    // 從 SystemSettings 獲取 workflow 開頭的設定
    const query = `
      SELECT SettingKey, SettingValue 
      FROM SystemSettings 
      WHERE SettingKey LIKE 'workflow.%'
    `;
    const result = await executeQuery(query);
    
    // 將扁平的 Key-Value 轉換為物件
    const settings = {
        autoAssignReviewer: false,
        requireMultipleApprovals: false,
        approvalTimeout: 24,
        emailNotifications: true,
        slackNotifications: false,
        reminderNotifications: true
    };

    result.recordset.forEach(row => {
      const key = row.SettingKey.replace('workflow.', '');
      try {
        settings[key] = JSON.parse(row.SettingValue);
      } catch (e) {
        settings[key] = row.SettingValue;
      }
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('獲取工作流程設定失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取工作流程設定失敗'
    });
  }
}));

// 保存工作流程設定
router.put('/settings', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const settings = req.body;
  const userId = req.user.id;

  try {
    const operations = [];
    
    // 為每個設定項生成 MERGE 語句
    for (const [key, value] of Object.entries(settings)) {
      const settingKey = `workflow.${key}`;
      const settingValue = JSON.stringify(value);
      
      operations.push({
        query: `
          MERGE SystemSettings AS target
          USING (SELECT @settingKey AS SettingKey, @settingValue AS SettingValue, @userId AS UpdatedBy) AS source
          ON target.SettingKey = source.SettingKey
          WHEN MATCHED THEN
            UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE(), UpdatedBy = source.UpdatedBy
          WHEN NOT MATCHED THEN
            INSERT (SettingKey, SettingValue, UpdatedBy, Description)
            VALUES (source.SettingKey, source.SettingValue, source.UpdatedBy, '工作流程設定');
        `,
        params: {
          settingKey,
          settingValue,
          userId
        }
      });
    }

    await executeTransaction(operations);

    res.json({
      success: true,
      message: '工作流程設定保存成功'
    });
  } catch (error) {
    console.error('保存工作流程設定失敗:', error);
    res.status(500).json({
      success: false,
      message: '保存工作流程設定失敗'
    });
  }
}));

// 獲取所有工作流程列表
router.get(['/', '/list'], authenticateUserOrAdmin, asyncHandler(async (req, res) => {
    const query = `
        SELECT aw.*, 
               (SELECT COUNT(*) FROM WorkflowSteps ws WHERE ws.workflow_id = aw.id) as step_count
        FROM ApprovalWorkflows aw
        ORDER BY aw.is_default DESC, aw.created_at DESC
    `;
    const result = await executeQuery(query);
    res.json({ success: true, data: result.recordset });
}));

// 設定預設工作流程
router.post('/:id/set-default', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const operations = [
        // 1. Reset all to not default
        { query: 'UPDATE ApprovalWorkflows SET is_default = 0' },
        // 2. Set target to default
        { query: 'UPDATE ApprovalWorkflows SET is_default = 1 WHERE id = @id', params: { id } }
    ];

    await executeTransaction(operations);
    
    res.json({ success: true, message: '已設為預設工作流程' });
}));

// 獲取單個工作流程詳情（包含步驟）
router.get('/:id', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const workflowQuery = 'SELECT * FROM ApprovalWorkflows WHERE id = @id';
    const stepsQuery = `
        SELECT ws.id, ws.workflow_id, ws.step_order, ws.step_name, ws.is_required, ws.created_at, ws.approver_type,
               CASE 
                   WHEN ws.approver_type = 'Role' THEN ws.approver_role
                   ELSE CAST(ws.approver_id AS NVARCHAR(50))
               END as approver_id,
               u.full_name as specific_user_name
        FROM WorkflowSteps ws
        LEFT JOIN Users u ON ws.approver_id = CAST(u.id AS NVARCHAR(50))
        WHERE ws.workflow_id = @id AND ws.is_active = 1
        ORDER BY ws.step_order ASC
    `;

    const [workflowResult, stepsResult] = await Promise.all([
        executeQuery(workflowQuery, { id }),
        executeQuery(stepsQuery, { id })
    ]);

    if (workflowResult.recordset.length === 0) {
        return res.status(404).json({ success: false, message: '工作流程不存在' });
    }

    res.json({
        success: true,
        data: {
            ...workflowResult.recordset[0],
            steps: stepsResult.recordset
        }
    });
}));



// 更新工作流程 (包含步驟)
router.put('/:id/steps', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, steps } = req.body; // steps is array of { id?, step_name, approver_type, approver_id, is_required }
    const userId = req.user.id;

    // 1. Update Workflow Basic Info
    const updateWorkflowQuery = `
        UPDATE ApprovalWorkflows 
        SET name = @name, description = @description, updated_at = GETDATE()
        WHERE id = @id
    `;
    
    // Get existing steps to decide Update vs Insert vs Delete
    const existingStepsQuery = 'SELECT id FROM WorkflowSteps WHERE workflow_id = @id AND is_active = 1';
    const existingStepsResult = await executeQuery(existingStepsQuery, { id });
    const existingStepIds = existingStepsResult.recordset.map(s => s.id);
    const incomingStepIds = steps.filter(s => s.id).map(s => parseInt(s.id));
    
    // Calculate steps to delete
    const stepsToDelete = existingStepIds.filter(stepId => !incomingStepIds.includes(stepId));

    const operations = [
        { query: updateWorkflowQuery, params: { id, name, description } }
    ];
    
    // 2. Soft Delete operations
    if (stepsToDelete.length > 0) {
        stepsToDelete.forEach(stepId => {
             operations.push({
                 // Set is_active to 0 and negate step_order to avoid unique constraint violations
                 query: 'UPDATE WorkflowSteps SET is_active = 0, step_order = -id WHERE id = @stepId',
                 params: { stepId }
             });
        });
    }

    // 3. Upsert steps
    steps.forEach((step, index) => {
        let approverId = null;
        let approverRole = null;
        
        if (step.approver_type === 'Role') {
            approverRole = step.approver_id;
        } else {
            approverId = step.approver_id;
        }

        if (step.id && existingStepIds.includes(parseInt(step.id))) {
            // Update
            operations.push({
                query: `
                    UPDATE WorkflowSteps 
                    SET step_name = @stepName, 
                        step_order = @stepOrder, 
                        approver_type = @approverType, 
                        approver_id = @approverId, 
                        approver_role = @approverRole, 
                        is_required = @isRequired,
                        is_active = 1
                    WHERE id = @stepId
                `,
                params: {
                    stepId: step.id,
                    stepName: step.step_name,
                    stepOrder: index + 1,
                    approverType: step.approver_type,
                    approverId: approverId,
                    approverRole: approverRole,
                    isRequired: step.is_required ? 1 : 0
                }
            });
        } else {
            // Insert
            operations.push({
                query: `
                    INSERT INTO WorkflowSteps (workflow_id, step_name, step_order, approver_type, approver_id, approver_role, is_required)
                    VALUES (@id, @stepName, @stepOrder, @approverType, @approverId, @approverRole, @isRequired)
                `,
                params: {
                    id,
                    stepName: step.step_name,
                    stepOrder: index + 1,
                    approverType: step.approver_type,
                    approverId: approverId,
                    approverRole: approverRole,
                    isRequired: step.is_required ? 1 : 0
                }
            });
        }
    });

    try {
        await executeTransaction(operations);
        res.json({ success: true, message: '工作流程已更新' });
    } catch (error) {
        // Check for FK violation (Error 547 in SQL Server)
        if (error.message && error.message.includes('REFERENCE constraint')) {
             console.error('Workflow update failed due to FK constraint:', error);
             // Try to be more specific
             res.status(400).json({ 
                 success: false, 
                 message: '無法刪除部分步驟，因為它們已被用於現有的審核記錄中。您只能修改或新增步驟，不能刪除已被使用的步驟。' 
             });
        } else {
             throw error;
        }
    }
}));

// 創建新工作流程
router.post('/', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const { name, description, steps } = req.body;
    const userId = req.user.id;

    // 1. Insert Workflow
    // Use output inserted.id to get the new ID
    const insertWorkflowQuery = `
        INSERT INTO ApprovalWorkflows (name, description, is_active, created_by)
        OUTPUT INSERTED.id
        VALUES (@name, @description, 1, @userId)
    `;

    // Since we need the ID for steps, we can't easily use executeTransaction for everything in one go 
    // without a stored proc or chaining. 
    // But executeTransaction supports array.
    // However, we need the ID from the first query to use in subsequent queries.
    // So we'll do it in two parts or use a variable in SQL if possible, but simplest is:
    
    // Let's just execute the first one separately.
    const workflowResult = await executeQuery(insertWorkflowQuery, { name, description, userId });
    const newWorkflowId = workflowResult.recordset[0].id;

    const operations = [];
    steps.forEach((step, index) => {
        let approverId = null;
        let approverRole = null;
        
        if (step.approver_type === 'Role') {
            approverRole = step.approver_id;
        } else {
            approverId = step.approver_id;
        }

        operations.push({
            query: `
                INSERT INTO WorkflowSteps (workflow_id, step_name, step_order, approver_type, approver_id, approver_role, is_required)
                VALUES (@workflowId, @stepName, @stepOrder, @approverType, @approverId, @approverRole, @isRequired)
            `,
            params: {
                workflowId: newWorkflowId,
                stepName: step.step_name,
                stepOrder: index + 1,
                approverType: step.approver_type,
                approverId: approverId,
                approverRole: approverRole,
                isRequired: step.is_required ? 1 : 0
            }
        });
    });

    if (operations.length > 0) {
        await executeTransaction(operations);
    }

    res.json({ success: true, message: '工作流程已創建', data: { id: newWorkflowId } });
}));

// 刪除工作流程
router.delete('/:id', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if used? Maybe later.
    
    const operations = [
        { query: 'DELETE FROM WorkflowSteps WHERE workflow_id = @id', params: { id } },
        { query: 'DELETE FROM ApprovalWorkflows WHERE id = @id', params: { id } }
    ];

    await executeTransaction(operations);
    res.json({ success: true, message: '工作流程已刪除' });
}));

module.exports = router;
