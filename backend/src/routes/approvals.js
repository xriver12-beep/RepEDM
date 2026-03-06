const express = require('express');
const router = express.Router();
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authenticateUserOrAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notification-service');
const recipientService = require('../services/recipient-service');
const frequencyService = require('../services/frequency-service');

const Joi = require('joi');

// 驗證schemas
const submitApprovalSchema = Joi.object({
  campaignId: Joi.string().guid().required(),
  workflowId: Joi.string().guid().optional(),
  priority: Joi.string().valid('Low', 'Normal', 'High', 'Urgent').default('Normal'),
  comments: Joi.string().max(1000).optional()
});

const approvalActionSchema = Joi.object({
  action: Joi.string().valid('Approved', 'Rejected', 'Returned', 'Delegated', 'EmergencyApprove').required(),
  comments: Joi.string().max(1000).optional(),
  delegateToUserId: Joi.string().guid().when('action', { is: 'Delegated', then: Joi.required() }),
  force_send: Joi.boolean().optional()
});

// 1. 提交電子報審核
router.post('/submit', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
  const { error, value } = submitApprovalSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '輸入資料驗證失敗',
      errors: error.details
    });
  }

  const { campaignId, workflowId, priority, comments } = value;
  const userId = req.user.id;

  // 檢查電子報是否存在且屬於當前用戶
  const campaignQuery = `
    SELECT id, name, status, created_by
    FROM Campaigns 
    WHERE id = @campaignId
  `;
  
  const campaignResult = await executeQuery(campaignQuery, { campaignId });
  
  if (campaignResult.recordset.length === 0) {
    return res.status(404).json({
      success: false,
      message: '找不到指定的電子報'
    });
  }

  const campaign = campaignResult.recordset[0];

  // 檢查權限（只有創建者或管理員可以提交審核）
  // Normalize role check
  const userRole = req.user.role ? req.user.role.toLowerCase() : '';
  if (campaign.created_by !== userId && userRole !== 'admin') {
    return res.status(403).json({
      success: false,
      message: '您沒有權限提交此電子報的審核'
    });
  }

  // 檢查電子報狀態
  if (campaign.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿狀態的電子報可以提交審核'
    });
  }

  // 檢查是否已經在審核中
  const existingApprovalQuery = `
    SELECT id FROM ApprovalItems 
    WHERE campaign_id = @campaignId AND status IN ('pending', 'in_review')
  `;
  const existingApproval = await executeQuery(existingApprovalQuery, { campaignId });
  
  if (existingApproval.recordset.length > 0) {
    return res.status(400).json({
      success: false,
      message: '此電子報已在審核中'
    });
  }

  // 獲取預設工作流程（如果未指定）
  let finalWorkflowId = workflowId;
  if (!finalWorkflowId) {
    // 1. 優先檢查使用者是否已分配特定工作流程
    try {
        const userWorkflowQuery = `
            SELECT u.assigned_workflow_id, aw.is_active
            FROM Users u
            LEFT JOIN ApprovalWorkflows aw ON u.assigned_workflow_id = aw.id
            WHERE u.id = @userId
        `;
        const userWorkflowResult = await executeQuery(userWorkflowQuery, { userId });
        
        if (userWorkflowResult.recordset.length > 0) {
            const assignment = userWorkflowResult.recordset[0];
            if (assignment.assigned_workflow_id && assignment.is_active) {
                finalWorkflowId = assignment.assigned_workflow_id;
                console.log(`Using assigned workflow ${finalWorkflowId} for user ${userId}`);
            }
        }
    } catch (err) {
        console.warn('Error checking assigned workflow:', err);
        // Continue to default fallback
    }

    // 2. 如果沒有分配或流程無效，使用系統預設
    if (!finalWorkflowId) {
        const defaultWorkflowQuery = `
        SELECT id 
        FROM ApprovalWorkflows 
        WHERE is_active = 1
        ORDER BY is_default DESC, created_at DESC
        `;
        const defaultWorkflowResult = await executeQuery(defaultWorkflowQuery);
        
        if (defaultWorkflowResult.recordset.length === 0) {
        return res.status(400).json({
            success: false,
            message: '找不到可用的審核工作流程'
        });
        }
        
        finalWorkflowId = defaultWorkflowResult.recordset[0].id;
    }
  }

  // 獲取工作流程的步驟總數
  const stepsCountQuery = `
    SELECT COUNT(*) as total_steps
    FROM WorkflowSteps 
    WHERE workflow_id = @workflowId
  `;
  const stepsCountResult = await executeQuery(stepsCountQuery, { workflowId: finalWorkflowId });
  
  if (stepsCountResult.recordset.length === 0 || stepsCountResult.recordset[0].total_steps === 0) {
    return res.status(400).json({
      success: false,
      message: '工作流程沒有可用的審核步驟'
    });
  }

  const totalSteps = stepsCountResult.recordset[0].total_steps;

  // 開始事務
  const operations = [
    {
      query: `
        INSERT INTO ApprovalItems (campaign_id, workflow_id, current_step, total_steps, status, priority, submitted_by)
        OUTPUT INSERTED.id
        VALUES (@campaignId, @workflowId, 1, @totalSteps, 'pending', @priority, @submittedBy)
      `,
      params: {
        campaignId,
        workflowId: finalWorkflowId,
        totalSteps,
        priority: priority.toLowerCase(),
        submittedBy: userId
      }
    },
    {
      query: `
        UPDATE Campaigns 
        SET status = 'pending_approval'
        WHERE id = @campaignId
      `,
      params: { campaignId }
    }
  ];

  const result = await executeTransaction(operations);
  const approvalId = result[0].recordset[0].id;

  // 發送通知給第一步的審批人
  // 不使用 await 以免阻塞響應，或者使用 await 確保通知發送
  notificationService.sendApprovalNotification(approvalId).catch(err => console.error('發送通知失敗:', err));

  res.status(201).json({
    success: true,
    message: '審核請求已成功提交',
    data: {
      approvalId,
      campaignId,
      workflowId: finalWorkflowId,
      status: 'Pending'
    }
  });
}));

// 1.5 獲取所有審核列表 (Generic List)
router.get('/', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sort = 'created_date', order = 'desc', status, priority, search } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const userRole = req.user.role || '';

  let whereConditions = [];
  let queryParams = { offset: parseInt(offset), limit: parseInt(limit) };

  // 權限控制
  if (userRole.toLowerCase() !== 'admin') {
    whereConditions.push(`(
      ai.submitted_by = @userId 
      OR 
      (ai.status IN ('pending', 'in_review') AND EXISTS (
        SELECT 1 FROM WorkflowSteps ws 
        WHERE ws.workflow_id = ai.workflow_id 
        AND ws.step_order = ai.current_step 
        AND (
          ((ws.approver_type = 'SpecificUser' OR ws.approver_type = 'User') AND ws.approver_id = @userId) OR
          (ws.approver_type = 'Manager' AND u.manager_id = @userId) OR
          (ws.approver_type = 'Role' AND ws.approver_role = @userRole)
        )
      ))
    )`);
    queryParams.userId = userId;
    queryParams.userRole = userRole;
  }

  if (status) {
    if (status === 'active') {
      whereConditions.push("ai.status IN ('pending', 'in_review')");
    } else {
      whereConditions.push('ai.status = @status');
      queryParams.status = status;
    }
  }

  if (priority) {
    whereConditions.push('ai.priority = @priority');
    queryParams.priority = priority;
  }
  
  if (search) {
    whereConditions.push('(c.name LIKE @search OR c.subject LIKE @search)');
    queryParams.search = `%${search}%`;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // 排序映射
  const sortMap = {
    'created_date': 'ai.submitted_at',
    'submitted_at': 'ai.submitted_at',
    'priority': 'ai.priority',
    'status': 'ai.status'
  };
  const sortCol = sortMap[sort] || 'ai.submitted_at';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const query = `
    SELECT 
      ai.id as ApprovalID,
      ai.campaign_id,
      c.name as CampaignName,
      c.subject,
      c.type,
      c.recipient_count,
      c.target_audience,
      c.target_filter,
      c.scheduled_at,
      ai.status,
      ai.priority,
      ai.submitted_at as SubmittedAt,
      ai.current_step,
      ai.total_steps,
      aw.name as WorkflowName,
      ws.step_name as StepName,
      ws.approver_type,
      ws.approver_id,
      ws.approver_role,
      u.full_name AS SubmitterName,
      u.email AS SubmitterEmail,
      u.manager_id,
      CASE 
        WHEN ws.approver_type = 'Manager' THEN manager.full_name
        WHEN ws.approver_type IN ('SpecificUser', 'User') THEN (SELECT full_name FROM Users WHERE id = ws.approver_id)
        WHEN ws.approver_type = 'Role' THEN ws.approver_role
        ELSE NULL
      END as CurrentApprover
    FROM ApprovalItems ai
    INNER JOIN Campaigns c ON ai.campaign_id = c.id
    INNER JOIN ApprovalWorkflows aw ON ai.workflow_id = aw.id
    LEFT JOIN WorkflowSteps ws ON aw.id = ws.workflow_id AND ws.step_order = ai.current_step
    INNER JOIN Users u ON ai.submitted_by = u.id
    LEFT JOIN Users manager ON u.manager_id = manager.id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM ApprovalItems ai
    INNER JOIN Campaigns c ON ai.campaign_id = c.id
    INNER JOIN ApprovalWorkflows aw ON ai.workflow_id = aw.id
    LEFT JOIN WorkflowSteps ws ON aw.id = ws.workflow_id AND ws.step_order = ai.current_step
    INNER JOIN Users u ON ai.submitted_by = u.id
    LEFT JOIN Users manager ON u.manager_id = manager.id
    ${whereClause}
  `;

  const [approvals, countResult] = await Promise.all([
    executeQuery(query, queryParams),
    executeQuery(countQuery, queryParams)
  ]);

  const total = countResult.recordset[0].total;

  // Process approvals to add IsCurrentApprover flag and calculate recipient count
  const items = await Promise.all(approvals.recordset.map(async item => {
    let isCurrentApprover = false;
    const userIdInt = parseInt(userId);
    
    // Admin always has permission
    if (userRole === 'admin') {
      isCurrentApprover = true;
    } else {
      // Check based on approver type
      if (item.approver_type === 'Manager') {
        // If approver is manager, check if current user is the submitter's manager
        // Need to select manager_id in the query
        if (item.manager_id === userIdInt) isCurrentApprover = true;
      } else if (item.approver_type === 'SpecificUser' || item.approver_type === 'User') {
        if (item.approver_id === userIdInt) isCurrentApprover = true;
      } else if (item.approver_type === 'Role') {
        if (userRole === item.approver_role) isCurrentApprover = true;
      }
    }

    // Calculate recipient count
    let recipient_count = item.recipient_count || 0;
    try {
        const debugLog = []; // Accumulate debug info
        debugLog.push(`Processing ApprovalID: ${item.ApprovalID}, Audience: ${item.target_audience}, Filter: ${item.target_filter}`);

        if ((item.target_audience || '').toLowerCase() === 'category') {
            let ids = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '[]') : item.target_filter;
            if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
                ids = [ids];
            }
            
            if (Array.isArray(ids) && ids.length > 0) {
                 const safeIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
                 if (safeIds.length > 0) {
                     // Count unique subscribers in these categories
                     const countSql = `
                        SELECT 
                            COUNT(DISTINCT sc.subscriber_id) as total_count,
                            COUNT(DISTINCT CASE WHEN s.status IN ('active', 'subscribed') THEN s.id END) as active_count,
                            COUNT(DISTINCT CASE WHEN s.status = 'unsubscribed' THEN s.id END) as unsubscribed_count,
                            COUNT(DISTINCT CASE WHEN s.status = 'bounced' THEN s.id END) as bounced_count,
                            COUNT(DISTINCT CASE WHEN s.status = 'deleted' THEN s.id END) as deleted_count
                        FROM SubscriberCategories sc
                        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id
                        WHERE sc.category_id IN (${safeIds.join(',')})
                     `;
                     const countRes = await executeQuery(countSql);
                     if (countRes.recordset.length > 0) {
                         const { total_count, active_count, unsubscribed_count, bounced_count, deleted_count } = countRes.recordset[0];
                         recipient_count = active_count;
                         item.recipient_count_details = {
                             total: total_count,
                             active: active_count,
                             inactive: total_count - active_count,
                             unsubscribed: unsubscribed_count || 0,
                             bounced: bounced_count || 0,
                             deleted: deleted_count || 0
                         };
                         debugLog.push(`Calculated count: Active ${active_count}, Total ${total_count}`);
                     }
                 }
            }
        } else if ((item.target_audience || '').toLowerCase() === 'custom') {
            const filter = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '{}') : item.target_filter;
            if (filter && Array.isArray(filter.emails)) {
                recipient_count = filter.emails.length;
            }
        }

        // Write debug log for this item if it is campaign 60 (Approval 22) or any item to verify
        if (item.campaign_id === 60 || item.ApprovalID === 22) {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(__dirname, 'debug_approvals.log');
            fs.appendFileSync(logPath, `${new Date().toISOString()} - ${debugLog.join(' | ')}\n`);
        }

    } catch (e) {
        console.error(`Error calculating recipient count for approval ${item.ApprovalID}:`, e);
    }

    return {
      ...item,
      IsCurrentApprover: isCurrentApprover,
      recipient_count
    };
  }));

  // DEBUG: Write to file (Remove this after verification)
  // try {
  //     const fs = require('fs');
  //     const path = require('path');
  //     const debugPath = path.join(__dirname, '../../debug_response.json');
  //     fs.writeFileSync(debugPath, JSON.stringify(items, null, 2));
  // } catch(e) { console.error('Write debug file failed', e); }

  res.json({
    success: true,
    data: {
      items: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 2. 獲取待審核列表
router.get('/pending', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, priority, workflowId } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const userRole = req.user.role || '';

  let whereConditions = ["ai.status IN ('pending', 'in_review')"];
  let queryParams = { offset: parseInt(offset), limit: parseInt(limit), userId };

  // 根據用戶角色過濾 - 只顯示需要我審核的項目
  if (userRole.toLowerCase() !== 'admin') {
    whereConditions.push(`(
      ((ws.approver_type = 'SpecificUser' OR ws.approver_type = 'User') AND ws.approver_id = @userId) OR
      (ws.approver_type = 'Manager' AND u.manager_id = @userId) OR
      (ws.approver_type = 'Role' AND ws.approver_role = @userRole) 
    )`);
    // Note: approver_id for 'Role' type might store the role name string, but here we assume logic.
    // Given the schema, let's assume specific logic.
    queryParams.userRole = userRole;
  }

  if (priority) {
    whereConditions.push('ai.priority = @priority');
    queryParams.priority = priority;
  }

  if (workflowId) {
    whereConditions.push('ai.workflow_id = @workflowId');
    queryParams.workflowId = workflowId;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  const query = `
    SELECT 
      ai.id as ApprovalID,
      ai.campaign_id as CampaignID,
      c.name as CampaignName,
      c.subject,
      ai.status as Status,
      ai.priority as Priority,
      ai.submitted_at as SubmittedAt,
      ai.current_step,
      ai.total_steps,
      c.target_audience,
      c.target_filter,
      c.scheduled_at,
      aw.name as WorkflowName,
      ws.step_name as StepName,
      ws.approver_type as ApproverType,
      ws.approver_id as ApproverID,
      ws.approver_role as ApproverRole,
      u.full_name AS SubmitterName,
      u.email AS SubmitterEmail,
      u.manager_id as SubmitterManagerID,
      manager.full_name AS ManagerName,
      specific.full_name AS SpecificApproverName
    FROM ApprovalItems ai
    INNER JOIN Campaigns c ON ai.campaign_id = c.id
    INNER JOIN ApprovalWorkflows aw ON ai.workflow_id = aw.id
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    INNER JOIN Users u ON ai.submitted_by = u.id
    LEFT JOIN Users manager ON u.manager_id = manager.id
    LEFT JOIN Users specific ON ws.approver_id = specific.id
    ${whereClause}
    ORDER BY 
      CASE ai.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
      END,
      ai.submitted_at ASC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM ApprovalItems ai
    INNER JOIN Campaigns c ON ai.campaign_id = c.id
    INNER JOIN ApprovalWorkflows aw ON ai.workflow_id = aw.id
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    INNER JOIN Users u ON ai.submitted_by = u.id
    LEFT JOIN Users manager ON u.manager_id = manager.id
    ${whereClause}
  `;

  const [approvals, countResult] = await Promise.all([
    executeQuery(query, queryParams),
    executeQuery(countQuery, queryParams)
  ]);

  const total = countResult.recordset[0].total;

  // Process approvals to add Current Approver display and calculate recipient count
  const items = await Promise.all(approvals.recordset.map(async item => {
    let currentApprover = 'Unknown';
    if (item.ApproverType === 'Manager') {
      currentApprover = item.ManagerName || '未分配主管';
    } else if (item.ApproverType === 'SpecificUser' || item.ApproverType === 'User') {
      currentApprover = item.SpecificApproverName;
    } else {
      currentApprover = item.ApproverType;
    }

    // Calculate recipient count
    let recipient_count = 0;
    try {
        const debugLog = []; // Accumulate debug info
        
        if ((item.target_audience || '').toLowerCase() === 'category') {
            let ids = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '[]') : item.target_filter;
            if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
                ids = [ids];
            }
            
            if (Array.isArray(ids) && ids.length > 0) {
                 const safeIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
                 if (safeIds.length > 0) {
                     // Count unique subscribers in these categories (Total and Active)
                     const countSql = `
                        SELECT 
                            COUNT(DISTINCT sc.subscriber_id) as total_count,
                            COUNT(DISTINCT CASE WHEN s.status IN ('active', 'subscribed') THEN s.id END) as active_count
                        FROM SubscriberCategories sc
                        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id
                        WHERE sc.category_id IN (${safeIds.join(',')})
                     `;
                     const countRes = await executeQuery(countSql);
                     if (countRes.recordset.length > 0) {
                         const { total_count, active_count } = countRes.recordset[0];
                         recipient_count = active_count;
                         item.recipient_count_details = {
                             total: total_count,
                             active: active_count,
                             inactive: total_count - active_count
                         };
                         debugLog.push(`Calculated count (Pending): Active ${active_count}, Total ${total_count}`);
                     }
                 }
            }
        } else if ((item.target_audience || '').toLowerCase() === 'custom') {
            const filter = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '{}') : item.target_filter;
            if (filter && Array.isArray(filter.emails)) {
                recipient_count = filter.emails.length;
            }
        }
        
        // Write debug log for pending items too if needed
        if (item.campaign_id === 60 || item.ApprovalID === 22) {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(__dirname, 'debug_approvals.log');
            fs.appendFileSync(logPath, `${new Date().toISOString()} [Pending] - ${debugLog.join(' | ')}\n`);
        }

    } catch (e) {
        console.error(`Error calculating recipient count for approval ${item.ApprovalID}:`, e);
    }

    return {
      ...item,
      CurrentApprover: currentApprover,
      recipient_count
    };
  }));

  res.json({
    success: true,
    data: {
      approvals: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 2.5 批量審核
router.post('/bulk-approve', authenticateToken, asyncHandler(async (req, res) => {
    const { ids, comment } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const reviewerName = req.user.full_name || req.user.username || '審核人員';

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            success: false,
            message: '請提供要審核的項目ID列表'
        });
    }

    const results = {
        success: [],
        failed: []
    };

    // Process sequentially
    for (const id of ids) {
        try {
            await processApprovalLogic(id, userId, userRole, 'Approved', comment || '批量操作審核通過', reviewerName);
            results.success.push(id);
        } catch (error) {
            console.error(`Bulk approve failed for ${id}:`, error);
            results.failed.push({ id, reason: error.message });
        }
    }

    res.json({
        success: true,
        message: `批量審核完成: 成功 ${results.success.length}, 失敗 ${results.failed.length}`,
        data: results
    });
}));

// 2.6 批量拒絕
router.post('/bulk-reject', authenticateToken, asyncHandler(async (req, res) => {
    const { ids, comment } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const reviewerName = req.user.full_name || req.user.username || '審核人員';

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            success: false,
            message: '請提供要審核的項目ID列表'
        });
    }

    const results = {
        success: [],
        failed: []
    };

    // Process sequentially
    for (const id of ids) {
        try {
            await processApprovalLogic(id, userId, userRole, 'Rejected', comment || '批量操作審核拒絕', reviewerName);
            results.success.push(id);
        } catch (error) {
            console.error(`Bulk reject failed for ${id}:`, error);
            results.failed.push({ id, reason: error.message });
        }
    }

    res.json({
        success: true,
        message: `批量拒絕完成: 成功 ${results.success.length}, 失敗 ${results.failed.length}`,
        data: results
    });
}));

// 3. 獲取審核詳情
router.get('/:approvalId', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
  const { approvalId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const query = `
    SELECT 
      ca.id AS id,
      ca.campaign_id AS campaignId,
      ca.workflow_id AS workflowId,
      ca.current_step AS currentStepId,
      ca.status AS status,
      ca.priority AS priority,
      ca.submitted_at AS created_date,
      ca.submitted_by AS submittedBy,
      
      c.name AS title,
       c.subject AS subject,
       c.html_content AS content,
       c.text_content AS plainTextContent,
      c.sender_name AS senderName,
      c.sender_email AS senderEmail,
      c.target_audience AS targetAudience,
      c.target_filter AS targetFilter,
      c.scheduled_at AS scheduledAt,
      
      aw.name AS workflowName,
      aw.description AS workflowDescription,
      
      s.step_name AS stepName,
      s.step_order AS stepOrder,
      s.approver_role AS requiredRole,
      s.approver_id AS requiredUserId,
      
      submitter.full_name AS submitter,
      submitter.email AS submitterEmail,
      submitter.manager_id AS submitterManagerId
    FROM ApprovalItems ca
    INNER JOIN Campaigns c ON ca.campaign_id = c.id
    INNER JOIN ApprovalWorkflows aw ON ca.workflow_id = aw.id
    LEFT JOIN WorkflowSteps s ON ca.workflow_id = s.workflow_id AND ca.current_step = s.step_order
    INNER JOIN Users submitter ON ca.submitted_by = submitter.id
    WHERE ca.id = @approvalId
  `;

  const result = await executeQuery(query, { approvalId });

  if (result.recordset.length === 0) {
    return res.status(404).json({
      success: false,
      message: '找不到指定的審核記錄'
    });
  }

  const approval = result.recordset[0];
  console.log(`[ApprovalDetail] ID: ${approvalId}, Audience: ${approval.targetAudience}, Filter: ${approval.targetFilter}`);

  // 如果是分類受眾，獲取分類名稱
  if ((approval.targetAudience || '').toLowerCase() === 'category') {
      try {
          let ids = typeof approval.targetFilter === 'string' ? JSON.parse(approval.targetFilter || '[]') : approval.targetFilter;
          
          // 處理單一 ID 的情況 (非陣列)
          if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
              ids = [ids];
          }

          if (Array.isArray(ids) && ids.length > 0) {
              const safeIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
              if (safeIds.length > 0) {
                   const categoriesQuery = `
                     SELECT c.id, c.name, COUNT(sc.subscriber_id) as subscriber_count 
                     FROM Categories c 
                     LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id 
                     WHERE c.id IN (${safeIds.join(',')})
                     GROUP BY c.id, c.name
                   `;
                   const categoriesResult = await executeQuery(categoriesQuery);
                   approval.categoryNames = categoriesResult.recordset.map(c => `${c.name} (${c.subscriber_count})`).join(', ');
              }
          }
      } catch (e) {
          console.error('Error fetching category names:', e);
      }
  }

  // 檢查權限
  let hasPermission = userRole === 'Admin' || 
                       approval.submittedBy === userId ||
                       approval.requiredRole === userRole ||
                       approval.requiredUserId === userId;

  if (!hasPermission) {
    // 檢查委派權限 (暫時省略或保留)
    // ...
    // 如果確實沒有權限
    /*
    return res.status(403).json({
        success: false,
        message: '您沒有權限查看此審核記錄'
    });
    */
    // 暫時允許查看，但前端可能隱藏操作按鈕
  }

  // 獲取審核歷史 (ApprovalSteps table used as history/records)
  const historyQuery = `
    SELECT 
      as_rec.id,
      as_rec.status,
      as_rec.comments,
      as_rec.approved_at,
      as_rec.created_at,
      ws.step_name as StepName,
      ws.step_order as StepOrder,
      u.full_name as ReviewerName,
      u.email as ReviewerEmail
    FROM ApprovalSteps as_rec
                LEFT JOIN WorkflowSteps ws ON as_rec.workflow_step_id = ws.id
                LEFT JOIN Users u ON CAST(as_rec.approver_id AS NVARCHAR(50)) = CAST(u.id AS NVARCHAR(50))
    WHERE as_rec.approval_item_id = @approvalId
    ORDER BY as_rec.created_at ASC
  `;

  const historyResult = await executeQuery(historyQuery, { approvalId });

  res.json({
    success: true,
    data: {
      approval,
      history: historyResult.recordset
    }
  });
}));

// 4. 執行審核操作
router.post('/:approvalId/action', authenticateToken, asyncHandler(async (req, res) => {
  const { approvalId } = req.params;
  const { error, value } = approvalActionSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: '輸入資料驗證失敗',
      errors: error.details
    });
  }

  const { action, comments, delegateToUserId, force_send } = value;
  const userId = req.user.id;
  const userRole = req.user.role;

  // 獲取審核詳情
  const approvalQuery = `
    SELECT 
      ai.*,
      ws.id as StepID,
      ws.step_name as StepName,
      ws.step_order as StepOrder,
      ws.approver_type as ApproverType,
      ws.approver_id as RequiredUserID,
      ws.approver_role as RequiredRole,
      ws.workflow_id as WorkflowID,
      u.manager_id as SubmitterManagerID
    FROM ApprovalItems ai
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    LEFT JOIN Users u ON ai.submitted_by = u.id
    WHERE ai.id = @approvalId
  `;

  console.log(`[Decision] Processing approvalId: ${approvalId}, Decision: ${action}, UserId: ${userId}, Role: ${userRole}`);

  const approvalResult = await executeQuery(approvalQuery, { approvalId });

  if (approvalResult.recordset.length === 0) {
    // Check if it's just the item missing or the join failed
    const checkItemQuery = 'SELECT status FROM ApprovalItems WHERE id = @approvalId';
    const checkResult = await executeQuery(checkItemQuery, { approvalId });
    
    if (checkResult.recordset.length === 0) {
        console.log(`[Decision] Approval item ${approvalId} not found`);
        return res.status(404).json({
            success: false,
            message: '找不到審核記錄'
        });
    } else {
        console.log(`[Decision] Approval item ${approvalId} exists but join failed (Step mismatch?)`);
        return res.status(500).json({
            success: false,
            message: '審核記錄資料異常 (找不到對應的流程步驟)'
        });
    }
  }

  const approval = approvalResult.recordset[0];
  console.log(`[Decision] Found item. Status: ${approval.status}, Step: ${approval.current_step}`);

  if (approval.status !== 'pending' && approval.status !== 'in_review') {
      console.log(`[Decision] Invalid status: ${approval.status}`);
      return res.status(400).json({
          success: false,
          message: `此審核項目已被處理 (目前狀態: ${approval.status})`
      });
  }

  // 防止重複審核 (Idempotency Check)
  // 檢查是否已經有針對此步驟的審核記錄
  const historyQuery = `
    SELECT id FROM ApprovalSteps 
    WHERE approval_item_id = @approvalId 
    AND step_order = @stepOrder 
    AND approver_id = @userId
    AND status = 'Approved'
  `;
  const historyResult = await executeQuery(historyQuery, { 
    approvalId, 
    stepOrder: approval.current_step, 
    userId 
  });

  let skipHistoryInsert = false;

  if (historyResult.recordset.length > 0 && action === 'Approved') {
      console.log(`[Decision] Duplicate approval attempt detected for user ${userId} on step ${approval.current_step}`);
      // 發現歷史記錄已有審核，但狀態未推進 (Idempotency handling)
      // 不返回錯誤，而是標記跳過插入歷史記錄，並繼續執行狀態更新邏輯
      console.warn('Idempotency check: Step already approved in history but re-submitted. Proceeding to sync workflow state.');
      skipHistoryInsert = true;
  }

  // 檢查權限
  let hasPermission = (userRole && userRole.toLowerCase() === 'admin');
  if (!hasPermission) {
    if (approval.ApproverType === 'Manager') {
      if (approval.SubmitterManagerID === userId) hasPermission = true;
    } else if (approval.ApproverType === 'SpecificUser' || approval.ApproverType === 'User') {
      // Use loose comparison or normalize strings for ID comparison
      if (approval.RequiredUserID == userId || (typeof approval.RequiredUserID === 'string' && typeof userId === 'string' && approval.RequiredUserID.toLowerCase() === userId.toLowerCase())) {
        hasPermission = true;
      }
    } else if (approval.ApproverType === 'Role') {
      if (userRole && approval.RequiredRole && userRole.toLowerCase() === approval.RequiredRole.toLowerCase()) {
        hasPermission = true;
      }
    }
  }

  if (!hasPermission) {
    console.log(`[Permission Denied] User: ${userId} (${userRole}), Required: ${approval.RequiredUserID} (${approval.ApproverType})`);
    return res.status(403).json({
      success: false,
      message: `您沒有權限執行此審核操作 (User: ${userId}, Required: ${approval.RequiredUserID})`
    });
  }

  let operations = [];
  let newStatus = approval.status;
  let nextStepOrder = approval.current_step;
  let isCompleted = false;

  // 記錄審核操作 - Insert into ApprovalSteps (history)
  if (!skipHistoryInsert) {
    operations.push({
      query: `
        INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
        VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, @action, @comments, GETDATE())
      `,
      params: {
        approvalId,
        stepId: approval.StepID,
        stepOrder: approval.StepOrder,
        reviewerId: userId,
        action,
        comments
      }
    });
  }

  if (action === 'Approved') {
    console.log(`[Decision] Action is Approved. Checking for auto-approval on subsequent steps.`);
    // 查找剩餘步驟並檢查是否可以自動通過
    const remainingStepsQuery = `
      SELECT id, step_order, approver_type, approver_id, approver_role
      FROM WorkflowSteps 
      WHERE workflow_id = @workflowId 
      AND step_order > @currentStepOrder 
      ORDER BY step_order ASC
    `;
    const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
      workflowId: approval.WorkflowID, 
      currentStepOrder: approval.StepOrder 
    });
    
    const remainingSteps = remainingStepsResult.recordset;
    
    // 預設為已完成，除非遇到無法自動通過的步驟
    isCompleted = true; 
    newStatus = 'approved';
    console.log(`[Decision] Initial assumption: All subsequent steps auto-approved. NewStatus set to 'approved'.`);

    for (let i = 0; i < remainingSteps.length; i++) {
        const step = remainingSteps[i];
        let autoApprove = false;
        console.log(`[Decision] Checking step ${step.step_order} (ID: ${step.id}) for auto-approval.`);

        // 檢查當前用戶是否符合該步驟的審核條件
        if (step.approver_type === 'SpecificUser' || step.approver_type === 'User') {
            if (step.approver_id === userId) autoApprove = true;
        } else if (step.approver_type === 'Role') {
             if (userRole && step.approver_role && userRole.toLowerCase() === step.approver_role.toLowerCase()) {
                 autoApprove = true;
             }
        } else if (step.approver_type === 'Manager') {
             if (approval.SubmitterManagerID === userId) autoApprove = true;
        }

        if (autoApprove) {
             console.log(`[Decision] Step ${step.step_order} auto-approved.`);
             // 記錄自動審核操作
             operations.push({
                query: `
                  INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
                  VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Approved', 'Auto-approved (Same Approver)', GETDATE())
                `,
                params: {
                  approvalId,
                  stepId: step.id,
                  stepOrder: step.step_order,
                  reviewerId: userId
                }
             });
             // 繼續檢查下一個步驟
        } else {
             // 找到無法自動通過的步驟，停止
             console.log(`[Decision] Step ${step.step_order} cannot be auto-approved. Stopping auto-approval loop.`);
             isCompleted = false;
             newStatus = 'in_review';
             nextStepOrder = step.step_order;
             
             // 驗證主管設置
             if (step.approver_type === 'Manager' && !approval.SubmitterManagerID) {
                 return res.status(400).json({
                     success: false,
                     message: '無法進入下一階段：提交者未設定直屬主管，請聯繫管理員設置'
                 });
             }
             
             break; // 停止循環
        }
    }
  } else if (action === 'EmergencyApprove') {
    // 特殊審核：緊急放行
    // 僅允許 Admin 且 priority 為 urgent 的情況下使用
    if (userRole.toLowerCase() !== 'admin') {
        throw new Error('只有管理員可以使用緊急放行功能');
    }
    if (approval.priority !== 'urgent') {
        throw new Error('只有標記為緊急的項目可以使用緊急放行功能');
    }
    
    console.log(`[Approval] Emergency Approve triggered for ID ${approvalId} by User ${userId}`);
    
    // 直接標記為完成
    isCompleted = true;
    newStatus = 'approved';
    
    // 查找剩餘步驟並記錄 skipped
    const remainingStepsQuery = `
      SELECT id, step_order 
      FROM WorkflowSteps 
      WHERE workflow_id = @workflowId 
      AND step_order > @currentStepOrder 
      ORDER BY step_order ASC
    `;
    const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
      workflowId: approval.WorkflowID, 
      currentStepOrder: approval.StepOrder 
    });
    
    const remainingSteps = remainingStepsResult.recordset;
    for (const step of remainingSteps) {
         operations.push({
            query: `
              INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
              VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Skipped', 'Skipped due to Emergency Approval', GETDATE())
            `,
            params: {
              approvalId,
              stepId: step.id,
              stepOrder: step.step_order,
              reviewerId: userId
            }
         });
    }

    // 將下一步設為大於總步驟數，表示流程結束
    nextStepOrder = approval.total_steps + 1;

  } else if (action === 'Rejected') {
    console.log(`[Decision] Action is Rejected. Setting status to rejected.`);
    newStatus = 'rejected';
    isCompleted = true; // Rejected ends the flow
  } else if (action === 'Returned') {
    // 退回到提交者 (Reset to Step 1, Status = returned)
    // 無論當前在哪一步，都退回到起點，讓提交者重新修改
    nextStepOrder = 1;
    newStatus = 'returned';
  }

  // 更新 ApprovalItems
  operations.push({
    query: `
      UPDATE ApprovalItems 
      SET status = @status, 
          current_step = @nextStepOrder,
          ${isCompleted ? 'completed_at = GETDATE(),' : ''}
          updated_at = GETDATE()
      WHERE id = @approvalId AND current_step = @currentStepCheck AND status = @currentStatusCheck;

      IF @@ROWCOUNT = 0
      BEGIN
        IF EXISTS (SELECT 1 FROM ApprovalItems WHERE id = @approvalId)
        BEGIN
            THROW 51000, 'Concurrent update detected: Status or step changed by another user.', 1;
        END
        ELSE
        BEGIN
            THROW 51000, 'Approval item not found.', 1;
        END
      END
    `,
    params: {
      approvalId,
      status: newStatus,
      nextStepOrder,
      currentStepCheck: approval.current_step,
      currentStatusCheck: approval.status
    }
  });

  // 更新電子報狀態
  let campaignApprovalStatus = 'pending_approval';
  if (newStatus === 'approved') {
    campaignApprovalStatus = 'approved';
  } else if (newStatus === 'rejected') {
    campaignApprovalStatus = 'rejected';
  } else if (newStatus === 'returned') {
    campaignApprovalStatus = 'returned';
  }

  let updateCampaignSql = `
      UPDATE Campaigns 
      SET status = @approvalStatus,
          updated_at = GETDATE()
  `;
  const campaignParams = {
      campaignId: approval.campaign_id,
      approvalStatus: campaignApprovalStatus
  };

  if (force_send !== undefined) {
      updateCampaignSql += `, force_send = @forceSend`;
      campaignParams.forceSend = force_send;
  }
  
  updateCampaignSql += ` WHERE id = @campaignId`;

  operations.push({
    query: updateCampaignSql,
    params: campaignParams
  });

  try {
      await executeTransaction(operations);
  } catch (err) {
      if (err.message && err.message.includes('Concurrent update detected')) {
           console.warn(`[Idempotency] Concurrent update ignored for approvalId: ${approvalId}`);
           return res.json({
               success: true,
               message: '此審核已被處理',
               data: { approvalId, action, newStatus, nextStepOrder }
           });
      }
      throw err;
  }

  // 發送通知 (非阻塞)
  const reviewerName = req.user.full_name || req.user.username || '審核人員';
  
  console.log(`[Decision] Notification check - Action: '${action}', NewStatus: '${newStatus}'`);

  if (newStatus === 'approved') {
    console.log(`[Decision] Status became 'approved'. Sending completion notification.`);
    notificationService.sendCompletionNotification(approvalId).catch(err => console.error('發送完成通知失敗:', err));
  } else if (action === 'Rejected' || action === 'Returned') {
    console.log(`[Decision] Action is '${action}'. Sending rejection/return notification.`);
    notificationService.sendRejectionNotification(approvalId, reviewerName, comments, action).catch(err => console.error('發送拒絕/退回通知失敗:', err));
  } else if (newStatus === 'in_review') {
    notificationService.sendApprovalNotification(approvalId).catch(err => console.error('發送下一關通知失敗:', err));
  }

  res.json({
    success: true,
    message: `審核操作 "${action}" 執行成功`,
    data: {
      approvalId,
      action,
      newStatus,
      nextStepOrder
    }
  });
}));

// 5. 處理審核決定 (Frontend helper route)
router.post('/:approvalId/decision', authenticateToken, asyncHandler(async (req, res) => {
  const { approvalId } = req.params;
  const { decision, reason, revisionNotes } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Map decision to action
  let action;
  switch (decision) {
    case 'approve':
      action = 'Approved';
      break;
    case 'reject':
      action = 'Rejected';
      break;
    case 'revision':
      action = 'Returned';
      break;
    default:
      return res.status(400).json({
        success: false,
        message: '無效的審核決定'
      });
  }

  console.log(`[Decision] Mapped decision '${decision}' to action '${action}'`);


  // Combine comments
  const comments = reason + (revisionNotes ? `\n修改說明：${revisionNotes}` : '');

  // 獲取審核詳情
  const approvalQuery = `
    SELECT 
      ai.*,
      ws.id as StepID,
      ws.step_name as StepName,
      ws.step_order as StepOrder,
      ws.approver_type as ApproverType,
      ws.approver_id as RequiredUserID,
      ws.approver_role as RequiredRole,
      ws.workflow_id as WorkflowID,
      u.manager_id as SubmitterManagerID
    FROM ApprovalItems ai
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    LEFT JOIN Users u ON ai.submitted_by = u.id
    WHERE ai.id = @approvalId
  `;

  console.log(`[Decision] Processing approvalId: ${approvalId}, Decision: ${decision}`);

  const approvalResult = await executeQuery(approvalQuery, { approvalId });

  if (approvalResult.recordset.length === 0) {
    // Check if it's just the item missing or the join failed
    const checkItemQuery = 'SELECT status FROM ApprovalItems WHERE id = @approvalId';
    const checkResult = await executeQuery(checkItemQuery, { approvalId });
    
    if (checkResult.recordset.length === 0) {
        console.log(`[Decision] Approval item ${approvalId} not found`);
        return res.status(404).json({
            success: false,
            message: '找不到審核記錄'
        });
    } else {
        console.log(`[Decision] Approval item ${approvalId} exists but join failed (Step mismatch?)`);
        return res.status(500).json({
            success: false,
            message: '審核記錄資料異常 (找不到對應的流程步驟)'
        });
    }
  }

  const approval = approvalResult.recordset[0];
  console.log(`[Decision] Found item. Status: ${approval.status}, Step: ${approval.current_step}`);

  if (approval.status !== 'pending' && approval.status !== 'in_review') {
      console.log(`[Decision] Invalid status: ${approval.status}`);
      return res.status(400).json({
          success: false,
          message: `此審核項目已被處理 (目前狀態: ${approval.status})`
      });
  }

  // 檢查權限
  let hasPermission = (userRole && userRole.toLowerCase() === 'admin');
  if (!hasPermission) {
    if (approval.ApproverType === 'Manager') {
      if (approval.SubmitterManagerID === userId) hasPermission = true;
    } else if (approval.ApproverType === 'SpecificUser' || approval.ApproverType === 'User') {
      // Use loose comparison or normalize strings for ID comparison
      if (approval.RequiredUserID == userId || (typeof approval.RequiredUserID === 'string' && typeof userId === 'string' && approval.RequiredUserID.toLowerCase() === userId.toLowerCase())) {
        hasPermission = true;
      }
    } else if (approval.ApproverType === 'Role') {
      if (userRole && approval.RequiredRole && userRole.toLowerCase() === approval.RequiredRole.toLowerCase()) {
        hasPermission = true;
      }
    }
  }

  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: '您沒有權限執行此審核操作'
    });
  }

  let operations = [];
  let newStatus = approval.status;
  let nextStepOrder = approval.current_step;
  let isCompleted = false;

  // 記錄審核操作 - Insert into ApprovalSteps (history)
  operations.push({
    query: `
      INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
      VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, @action, @comments, GETDATE())
    `,
    params: {
      approvalId,
      stepId: approval.StepID,
      stepOrder: approval.StepOrder,
      reviewerId: userId,
      action,
      comments
    }
  });

  if (action === 'Approved') {
    console.log(`[Decision] Action is Approved. Checking for auto-approval on subsequent steps.`);
    // 查找剩餘步驟並檢查是否可以自動通過
    const remainingStepsQuery = `
      SELECT id, step_order, approver_type, approver_id, approver_role
      FROM WorkflowSteps 
      WHERE workflow_id = @workflowId 
      AND step_order > @currentStepOrder 
      ORDER BY step_order ASC
    `;
    const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
      workflowId: approval.WorkflowID, 
      currentStepOrder: approval.StepOrder 
    });
    
    const remainingSteps = remainingStepsResult.recordset;
    
    // 預設為已完成，除非遇到無法自動通過的步驟
    isCompleted = true; 
    newStatus = 'approved';

    for (let i = 0; i < remainingSteps.length; i++) {
        const step = remainingSteps[i];
        let autoApprove = false;
        console.log(`[Decision] Checking step ${step.step_order} (ID: ${step.id}) for auto-approval.`);

        // 檢查當前用戶是否符合該步驟的審核條件
        if (step.approver_type === 'SpecificUser' || step.approver_type === 'User') {
            if (step.approver_id === userId) autoApprove = true;
        } else if (step.approver_type === 'Role') {
             if (userRole && step.approver_role && userRole.toLowerCase() === step.approver_role.toLowerCase()) {
                 autoApprove = true;
             }
        } else if (step.approver_type === 'Manager') {
             if (approval.SubmitterManagerID === userId) autoApprove = true;
        }

        if (autoApprove) {
             console.log(`[Decision] Step ${step.step_order} auto-approved.`);
             // 記錄自動審核操作
             operations.push({
                query: `
                  INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
                  VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Approved', 'Auto-approved (Same Approver)', GETDATE())
                `,
                params: {
                  approvalId,
                  stepId: step.id,
                  stepOrder: step.step_order,
                  reviewerId: userId
                }
             });
             // 繼續檢查下一個步驟
        } else {
             // 找到無法自動通過的步驟，停止
             isCompleted = false;
             newStatus = 'in_review';
             nextStepOrder = step.step_order;
             
             // 驗證主管設置
             if (step.approver_type === 'Manager' && !approval.SubmitterManagerID) {
                 return res.status(400).json({
                     success: false,
                     message: '無法進入下一階段：提交者未設定直屬主管，請聯繫管理員設置'
                 });
             }
             
             break; // 停止循環
        }
    }
  } else if (action === 'EmergencyApprove') {
    // 特殊審核：緊急放行
    // 僅允許 Admin 且 priority 為 urgent 的情況下使用
    if (userRole.toLowerCase() !== 'admin') {
        throw new Error('只有管理員可以使用緊急放行功能');
    }
    if (approval.priority !== 'urgent') {
        throw new Error('只有標記為緊急的項目可以使用緊急放行功能');
    }
    
    console.log(`[Approval] Emergency Approve triggered for ID ${approvalId} by User ${userId}`);
    
    // 直接標記為完成
    isCompleted = true;
    newStatus = 'approved';
    
    // 查找剩餘步驟並記錄 skipped
    const remainingStepsQuery = `
      SELECT id, step_order 
      FROM WorkflowSteps 
      WHERE workflow_id = @workflowId 
      AND step_order > @currentStepOrder 
      ORDER BY step_order ASC
    `;
    const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
      workflowId: approval.WorkflowID, 
      currentStepOrder: approval.StepOrder 
    });
    
    const remainingSteps = remainingStepsResult.recordset;
    for (const step of remainingSteps) {
         operations.push({
            query: `
              INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
              VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Skipped', 'Skipped due to Emergency Approval', GETDATE())
            `,
            params: {
              approvalId,
              stepId: step.id,
              stepOrder: step.step_order,
              reviewerId: userId
            }
         });
    }

    // 將下一步設為大於總步驟數，表示流程結束
    nextStepOrder = approval.total_steps + 1;
  } else if (action === 'Rejected') {
    console.log(`[Decision] Action is Rejected. Setting status to rejected.`);
    newStatus = 'rejected';
    isCompleted = true; 
  } else if (action === 'Returned') {
    // 退回到提交者 (Reset to Step 1, Status = returned)
    nextStepOrder = 1;
    newStatus = 'returned';
  }

  // 更新 ApprovalItems
  operations.push({
    query: `
      UPDATE ApprovalItems 
      SET status = @status, 
          current_step = @nextStepOrder,
          ${isCompleted ? 'completed_at = GETDATE(),' : ''}
          updated_at = GETDATE()
      WHERE id = @approvalId AND current_step = @currentStepCheck AND status = @currentStatusCheck;

      IF @@ROWCOUNT = 0
      BEGIN
        IF EXISTS (SELECT 1 FROM ApprovalItems WHERE id = @approvalId)
        BEGIN
            THROW 51000, 'Concurrent update detected: Status or step changed by another user.', 1;
        END
        ELSE
        BEGIN
            THROW 51000, 'Approval item not found.', 1;
        END
      END
    `,
    params: {
      approvalId,
      status: newStatus,
      nextStepOrder,
      currentStepCheck: approval.current_step,
      currentStatusCheck: approval.status
    }
  });

  // 更新電子報狀態
  let campaignApprovalStatus = 'pending_approval';
  if (newStatus === 'approved') {
    campaignApprovalStatus = 'approved';
  } else if (newStatus === 'rejected') {
    campaignApprovalStatus = 'rejected';
  }

  operations.push({
    query: `
      UPDATE Campaigns 
      SET status = @approvalStatus,
          updated_at = GETDATE()
      WHERE id = @campaignId
    `,
    params: {
      campaignId: approval.campaign_id,
      approvalStatus: campaignApprovalStatus
    }
  });

  try {
      await executeTransaction(operations);
  } catch (err) {
      if (err.message && err.message.includes('Concurrent update detected')) {
           console.warn(`[Idempotency] Concurrent update ignored for approvalId: ${approvalId}`);
           return res.json({
               success: true,
               message: '此審核已被處理',
               data: { approvalId, decision, action, newStatus, nextStepOrder }
           });
      }
      throw err;
  }

  // 發送通知 (非阻塞)
  const reviewerName = req.user.full_name || req.user.username || '審核人員';
  
  if (newStatus === 'approved') {
    console.log(`[Decision] Status became 'approved'. Sending completion notification.`);
    notificationService.sendCompletionNotification(approvalId).catch(err => console.error('發送完成通知失敗:', err));
  } else if (action === 'Rejected' || action === 'Returned') {
    console.log(`[Decision] Action is '${action}'. Sending rejection/return notification.`);
    notificationService.sendRejectionNotification(approvalId, reviewerName, comments, action).catch(err => console.error('發送拒絕/退回通知失敗:', err));
  } else if (newStatus === 'in_review') {
    notificationService.sendApprovalNotification(approvalId).catch(err => console.error('發送下一關通知失敗:', err));
  }

  res.json({
    success: true,
    message: `審核決定 "${decision}" 執行成功`,
    data: {
      approvalId,
      decision,
      action,
      newStatus,
      nextStepOrder
    }
  });
}));

// 5. Add a comment
router.post('/:approvalId/comments', authenticateToken, asyncHandler(async (req, res) => {
  const { approvalId } = req.params;
  const { content } = req.body;

  if (!content || content.length < 2) {
    return res.status(400).json({
      success: false,
      message: '評論內容不能為空且至少需要2個字符'
    });
  }

  const userId = req.user.id;

  // 獲取審核詳情以確認存在和獲取當前步驟
  const approvalQuery = `
    SELECT 
      ai.*,
      ws.id as StepID,
      ws.step_name as StepName,
      ws.step_order as StepOrder
    FROM ApprovalItems ai
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    WHERE ai.id = @approvalId
  `;

  const approvalResult = await executeQuery(approvalQuery, { approvalId });

  if (approvalResult.recordset.length === 0) {
    return res.status(404).json({
      success: false,
      message: '找不到指定的審核記錄'
    });
  }

  const approval = approvalResult.recordset[0];

  // 記錄評論 - Insert into ApprovalSteps (history)
  // Status/Action 使用 'Comment'
  const query = `
    INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
    OUTPUT INSERTED.id
    VALUES (@approvalId, @stepId, @stepOrder, @userId, 'Comment', @content, GETDATE())
  `;

  const result = await executeQuery(query, {
    approvalId,
    stepId: approval.StepID,
    stepOrder: approval.StepOrder,
    userId,
    content
  });

  const newCommentId = result.recordset[0].id;

  res.status(201).json({
    success: true,
    message: '評論添加成功',
    data: {
      id: newCommentId,
      approvalId,
      content,
      created_at: new Date()
    }
  });
}));

// 6. 獲取審核統計數據
router.get('/stats/summary', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role || '';
    
    let permissionClause = '';
    const queryParams = {};

    if (userRole.toLowerCase() !== 'admin') {
        permissionClause = `
            AND (
                ai.submitted_by = @userId 
                OR 
                (ai.status IN ('pending', 'in_review') AND EXISTS (
                    SELECT 1 FROM WorkflowSteps ws 
                    WHERE ws.workflow_id = ai.workflow_id 
                    AND ws.step_order = ai.current_step 
                    AND (
                        ((ws.approver_type = 'SpecificUser' OR ws.approver_type = 'User') AND ws.approver_id = @userId) OR
                        (ws.approver_type = 'Manager' AND (SELECT manager_id FROM Users WHERE id = ai.submitted_by) = @userId) OR
                        (ws.approver_type = 'Role' AND ws.approver_role = @userRole)
                    )
                ))
            )
        `;
        queryParams.userId = userId;
        queryParams.userRole = userRole;
    }

    // 獲取統計數據
    const query = `
        SELECT
            (SELECT COUNT(*) FROM ApprovalItems ai WHERE status IN ('pending', 'in_review') ${permissionClause}) as pending_count,
            
            (SELECT COUNT(*) FROM ApprovalItems ai 
             WHERE ai.status = 'approved' 
             ${permissionClause}
             AND EXISTS (
                 SELECT 1 FROM ApprovalSteps s 
                 WHERE s.approval_item_id = ai.id 
                 AND CAST(s.approved_at AS DATE) = CAST(GETDATE() AS DATE)
                 AND s.status = 'Approved'
             )) as approved_today,
             
            (SELECT COUNT(*) FROM ApprovalItems ai 
             WHERE ai.status = 'rejected' 
             ${permissionClause}
             AND EXISTS (
                 SELECT 1 FROM ApprovalSteps s 
                 WHERE s.approval_item_id = ai.id 
                 AND CAST(s.approved_at AS DATE) = CAST(GETDATE() AS DATE)
                 AND s.status = 'Rejected'
             )) as rejected_today
    `;

    // 平均處理時間 (小時) - 計算所有已完成 (Approved) 的項目
    // 時間差 = 最後一次 Approved 時間 - 提交時間
    // 使用分鐘計算更精確，然後轉換為小時 (保留1位小數)
    
    let avgTimeClause = '';
    if (userRole.toLowerCase() !== 'admin') {
        avgTimeClause = 'AND ai.submitted_by = @userId';
    }

    const avgTimeQuery = `
        SELECT CAST(AVG(DATEDIFF(MINUTE, ai.submitted_at, last_step.approved_at)) / 60.0 AS DECIMAL(10,1)) as avg_hours
        FROM ApprovalItems ai
        CROSS APPLY (
            SELECT TOP 1 approved_at 
            FROM ApprovalSteps 
            WHERE approval_item_id = ai.id 
            AND status = 'Approved' 
            ORDER BY created_at DESC
        ) last_step
        WHERE ai.status = 'approved'
        ${avgTimeClause}
    `;

    const [countsResult, avgResult] = await Promise.all([
        executeQuery(query, queryParams),
        executeQuery(avgTimeQuery, queryParams)
    ]);

    const stats = countsResult.recordset[0];
    const avgStats = avgResult.recordset[0];

    res.json({
        success: true,
        data: {
            pendingCount: stats.pending_count || 0,
            approvedToday: stats.approved_today || 0,
            rejectedToday: stats.rejected_today || 0,
            avgProcessTime: avgStats.avg_hours || 0
        }
    });
}));

// Helper function for processing approval logic
async function processApprovalLogic(approvalId, userId, userRole, action, comments, reviewerName) {
  // 獲取審核詳情
  const approvalQuery = `
    SELECT 
      ai.*,
      ws.id as StepID,
      ws.step_name as StepName,
      ws.step_order as StepOrder,
      ws.approver_type as ApproverType,
      ws.approver_id as RequiredUserID,
      ws.approver_role as RequiredRole,
      ws.workflow_id as WorkflowID,
      u.manager_id as SubmitterManagerID
    FROM ApprovalItems ai
    INNER JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
    LEFT JOIN Users u ON ai.submitted_by = u.id
    WHERE ai.id = @approvalId
  `;

  const approvalResult = await executeQuery(approvalQuery, { approvalId });

  if (approvalResult.recordset.length === 0) {
     throw new Error('找不到審核記錄或流程步驟不匹配');
  }

  const approval = approvalResult.recordset[0];

  if (approval.status !== 'pending' && approval.status !== 'in_review') {
      throw new Error(`此審核項目已被處理 (目前狀態: ${approval.status})`);
  }

  // 檢查權限
  let hasPermission = (userRole && userRole.toLowerCase() === 'admin');
  if (!hasPermission) {
    if (approval.ApproverType === 'Manager') {
      if (approval.SubmitterManagerID === userId) hasPermission = true;
    } else if (approval.ApproverType === 'SpecificUser' || approval.ApproverType === 'User') {
      // Use loose comparison or normalize strings for ID comparison
      if (approval.RequiredUserID == userId || (typeof approval.RequiredUserID === 'string' && typeof userId === 'string' && approval.RequiredUserID.toLowerCase() === userId.toLowerCase())) {
        hasPermission = true;
      }
    } else if (approval.ApproverType === 'Role') {
      if (userRole && approval.RequiredRole && userRole.toLowerCase() === approval.RequiredRole.toLowerCase()) {
        hasPermission = true;
      }
    }
  }

  if (!hasPermission) {
    throw new Error('您沒有權限執行此審核操作');
  }

  let operations = [];
  let newStatus = approval.status;
  let nextStepOrder = approval.current_step;
  let isCompleted = false;

  // 記錄審核操作
  let stepStatus = action;
  if (action === 'EmergencyApprove') {
      stepStatus = 'EmergencyApproved';
  }

  operations.push({
    query: `
      INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
      VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, @stepStatus, @comments, GETDATE())
    `,
    params: {
      approvalId,
      stepId: approval.StepID,
      stepOrder: approval.StepOrder,
      reviewerId: userId,
      stepStatus,
      comments
    }
  });

  if (action === 'Approved' || action === 'EmergencyApprove') {
    if (action === 'EmergencyApprove') {
        // 特殊審核：緊急放行
        // 僅允許 Admin 且 priority 為 urgent 的情況下使用
        if (!userRole || userRole.toLowerCase() !== 'admin') {
            throw new Error('只有管理員可以使用緊急放行功能');
        }
        if (approval.priority !== 'urgent') {
            throw new Error('只有標記為緊急的項目可以使用緊急放行功能');
        }
        
        console.log(`[Approval] Emergency Approve triggered for ID ${approvalId} by User ${userId}`);
        
        // 直接標記為完成
        isCompleted = true;
        newStatus = 'approved';
        nextStepOrder = approval.total_steps + 1;

        // 自動跳過剩餘步驟並記錄
        const remainingStepsQuery = `
          SELECT id, step_order 
          FROM WorkflowSteps 
          WHERE workflow_id = @workflowId 
          AND step_order > @currentStepOrder 
          ORDER BY step_order ASC
        `;
        const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
          workflowId: approval.WorkflowID, 
          currentStepOrder: approval.StepOrder 
        });
        
        const remainingSteps = remainingStepsResult.recordset;
        for (const step of remainingSteps) {
             operations.push({
                query: `
                  INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
                  VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Skipped', 'Skipped due to Emergency Approval', GETDATE())
                `,
                params: {
                  approvalId,
                  stepId: step.id,
                  stepOrder: step.step_order,
                  reviewerId: userId
                }
             });
        }
    } else {
        console.log(`[Bulk/Process] Action is Approved. Checking for auto-approval on subsequent steps.`);
        // 查找剩餘步驟並檢查是否可以自動通過
        const remainingStepsQuery = `
          SELECT id, step_order, approver_type, approver_id, approver_role
          FROM WorkflowSteps 
          WHERE workflow_id = @workflowId 
          AND step_order > @currentStepOrder 
          ORDER BY step_order ASC
        `;
        const remainingStepsResult = await executeQuery(remainingStepsQuery, { 
          workflowId: approval.WorkflowID, 
          currentStepOrder: approval.StepOrder 
        });
        
        const remainingSteps = remainingStepsResult.recordset;
        
        isCompleted = true; 
        newStatus = 'approved';

        for (let i = 0; i < remainingSteps.length; i++) {
            const step = remainingSteps[i];
            let autoApprove = false;
            console.log(`[Bulk/Process] Checking step ${step.step_order} (ID: ${step.id}) for auto-approval.`);

            if (step.approver_type === 'SpecificUser' || step.approver_type === 'User') {
                if (step.approver_id === userId) autoApprove = true;
            } else if (step.approver_type === 'Role') {
                if (userRole && step.approver_role && userRole.toLowerCase() === step.approver_role.toLowerCase()) {
                    autoApprove = true;
                }
            } else if (step.approver_type === 'Manager') {
                if (approval.SubmitterManagerID === userId) autoApprove = true;
            }

            if (autoApprove) {
                console.log(`[Bulk/Process] Step ${step.step_order} auto-approved.`);
                operations.push({
                    query: `
                    INSERT INTO ApprovalSteps (approval_item_id, workflow_step_id, step_order, approver_id, status, comments, approved_at)
                    VALUES (@approvalId, @stepId, @stepOrder, @reviewerId, 'Approved', 'Auto-approved (Same Approver)', GETDATE())
                    `,
                    params: {
                    approvalId,
                    stepId: step.id,
                    stepOrder: step.step_order,
                    reviewerId: userId
                    }
                });
            } else {
                isCompleted = false;
                newStatus = 'in_review';
                nextStepOrder = step.step_order;
                
                if (step.approver_type === 'Manager' && !approval.SubmitterManagerID) {
                    throw new Error('無法進入下一階段：提交者未設定直屬主管');
                }
                
                break;
            }
        }
    }
  } else if (action === 'Rejected') {
    console.log(`[Bulk/Process] Action is Rejected. Setting status to rejected.`);
    newStatus = 'rejected';
    isCompleted = true; 
  } else if (action === 'Returned') {
    nextStepOrder = 1;
    newStatus = 'pending';
  }

  operations.push({
    query: `
      UPDATE ApprovalItems 
      SET status = @status, 
          current_step = @nextStepOrder,
          ${isCompleted ? 'completed_at = GETDATE(),' : ''}
          updated_at = GETDATE()
      WHERE id = @approvalId
    `,
    params: {
      approvalId,
      status: newStatus,
      nextStepOrder
    }
  });

  let campaignApprovalStatus = 'pending_approval';
  if (newStatus === 'approved') {
    campaignApprovalStatus = 'approved';
  } else if (newStatus === 'rejected') {
    campaignApprovalStatus = 'rejected';
  }

  operations.push({
    query: `
      UPDATE Campaigns 
      SET status = @approvalStatus,
          updated_at = GETDATE()
      WHERE id = @campaignId
    `,
    params: {
      campaignId: approval.campaign_id,
      approvalStatus: campaignApprovalStatus
    }
  });

  await executeTransaction(operations);

  // Send Notifications
  if (newStatus === 'approved') {
    console.log(`[Bulk/Process] Status became 'approved'. Sending completion notification.`);
    notificationService.sendCompletionNotification(approvalId).catch(err => console.error('發送完成通知失敗:', err));
  } else if (action === 'Rejected' || action === 'Returned') {
    console.log(`[Bulk/Process] Action is '${action}'. Sending rejection/return notification.`);
    notificationService.sendRejectionNotification(approvalId, reviewerName, comments, action).catch(err => console.error('發送拒絕/退回通知失敗:', err));
  } else if (newStatus === 'in_review') {
    notificationService.sendApprovalNotification(approvalId).catch(err => console.error('發送下一關通知失敗:', err));
  }

  return { approvalId, action, newStatus };
}

module.exports = router;
