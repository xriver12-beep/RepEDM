const express = require('express');
const axios = require('axios');
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken, authorizeRoles, checkResourceOwner } = require('../middleware/auth');
const { validate, campaignValidations, queryValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const notificationService = require('../services/notification-service');

const router = express.Router();

// 所有路由都需要認證
router.use(authenticateToken);

// 獲取活動列表
router.get('/',
  validate(queryValidations.campaignFilter, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'created_at', 
      sortOrder = 'desc',
      status,
      type,
      search
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 建構查詢條件
    let whereClause = 'WHERE 1=1';
    const params = {};

    if (status) {
      whereClause += ' AND LOWER(c.status) = LOWER(@status)';
      params.status = status;
    }

    if (type) {
      whereClause += ' AND c.type = @type';
      params.type = type;
    }

    if (search) {
      whereClause += ' AND (c.name LIKE @search OR c.subject LIKE @search)';
      params.search = `%${search}%`;
    }

    // 調試日誌
    console.log('=== 活動查詢調試 ===');
    console.log('用戶角色:', req.user.role);
    console.log('用戶ID:', req.user.id);
    console.log('是否為管理員:', ['admin', 'manager'].includes(req.user.role));
    
    // 非管理員只能看到自己的活動 - 修改為所有人可見
    // if (!['admin', 'manager'].includes(req.user.role)) {
    //   whereClause += ' AND c.created_by = @userId';
    //   params.userId = req.user.id;
    //   console.log('添加用戶過濾條件');
    // } else {
    //   console.log('管理員可查看所有活動');
    // }
    console.log('開放所有用戶查看全站活動');

    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM Campaigns c ${whereClause}`;
    console.log('計數查詢:', countQuery);
    console.log('查詢參數:', params);
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;
    console.log('活動總數:', total);

    // 獲取活動列表
    const query = `
      SELECT 
        c.id, c.name, c.subject, c.status, c.type, c.priority,
        c.scheduled_at, c.sent_at, c.end_date, c.created_at, c.updated_at,
        c.target_audience, c.target_filter,
        c.created_by, u.full_name as created_by_name,
        t.name as template_name,
        c.recipient_count, c.opened_count, c.clicked_count, c.bounced_count, c.unsubscribed_count,
        ai.current_step, ai.total_steps, ws.step_name, COALESCE(latest_workflow.name, default_wf.name) as workflow_name,
        ws.approver_type, ws.approver_role,
        manager.full_name as manager_name,
        specific.full_name as specific_approver_name,
        last_rej.comments as rejection_reason,
        last_rej.approver_name as rejected_by,
        last_rej.action_type as rejection_action
      FROM Campaigns c
      LEFT JOIN Users u ON c.created_by = u.id
      LEFT JOIN Users manager ON u.manager_id = manager.id
      LEFT JOIN Templates t ON c.template_id = t.id
      LEFT JOIN ApprovalItems ai ON c.id = ai.campaign_id AND ai.status IN ('pending', 'in_review')
      LEFT JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ws.step_order = ai.current_step
      LEFT JOIN Users specific ON ws.approver_id = specific.id
      
      -- Join to get the latest applied workflow name (regardless of status)
      OUTER APPLY (
          SELECT TOP 1 aw_inner.name
          FROM ApprovalItems ai_inner
          JOIN ApprovalWorkflows aw_inner ON ai_inner.workflow_id = aw_inner.id
          WHERE ai_inner.campaign_id = c.id
          ORDER BY ai_inner.id DESC
      ) latest_workflow

      -- Join to get default workflow
      OUTER APPLY (
          SELECT TOP 1 name
          FROM ApprovalWorkflows
          WHERE is_default = 1
      ) default_wf
      
      -- Join to get latest rejection/return info
      OUTER APPLY (
          SELECT TOP 1 ast.comments, ru.full_name as approver_name, ast.status as action_type
          FROM ApprovalItems rai
          JOIN ApprovalSteps ast ON rai.id = ast.approval_item_id
          JOIN Users ru ON ast.approver_id = ru.id
          WHERE rai.campaign_id = c.id 
          AND ast.status IN ('Rejected', 'Returned')
          ORDER BY ast.created_at DESC
      ) last_rej

      ${whereClause}
      ORDER BY c.${sortBy} ${sortOrder}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(query, {
      ...params,
      offset,
      limit: parseInt(limit)
    });

    const campaigns = await Promise.all(result.recordset.map(async campaign => {
        let recipient_count_details = null;
        
        // Calculate details if it's a category audience
        if ((campaign.target_audience || '').toLowerCase() === 'category') {
             try {
                let ids = typeof campaign.target_filter === 'string' ? JSON.parse(campaign.target_filter || '[]') : campaign.target_filter;
                if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
                    ids = [ids];
                }
                
                if (Array.isArray(ids) && ids.length > 0) {
                     const safeIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
                     if (safeIds.length > 0) {
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
                             recipient_count_details = {
                                 total: total_count,
                                 active: active_count,
                                 inactive: total_count - active_count,
                                 unsubscribed: unsubscribed_count || 0,
                                 bounced: bounced_count || 0,
                                 deleted: deleted_count || 0
                             };
                         }
                     }
                }
             } catch (e) { console.error('Error calculating details', e); }
        }

        return {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          status: campaign.status,
          priority: campaign.priority,
          type: campaign.type || 'Regular', // 默認 Regular
          templateName: campaign.template_name,
          scheduledAt: campaign.scheduled_at,
          startDate: campaign.scheduled_at, // 映射到前端 startDate
          sentAt: campaign.sent_at,
          endDate: campaign.end_date, // 映射到前端 endDate
          targetAudience: campaign.target_audience, // 添加 targetAudience
          targetFilter: campaign.target_filter, // 添加 targetFilter
          recipient_count: recipient_count_details ? recipient_count_details.active : (campaign.recipient_count || 0),
          recipient_count_details, // Add details
          createdBy: campaign.created_by,
          createdByName: campaign.created_by_name,
          createdAt: campaign.created_at,
          updatedAt: campaign.updated_at,
          currentStep: campaign.current_step,
          totalSteps: campaign.total_steps,
          stepName: campaign.step_name,
          workflow_name: campaign.workflow_name,
          currentApprover: (() => {
              if (!campaign.current_step) return null;
              if (campaign.approver_type === 'Manager') {
                  return campaign.manager_name || '直屬主管';
              } else if (['SpecificUser', 'User'].includes(campaign.approver_type)) {
                  return campaign.specific_approver_name;
              } else if (campaign.approver_type === 'Role') {
                  return campaign.approver_role;
              }
              return campaign.approver_type;
          })(),
          rejectionReason: campaign.rejection_reason,
          rejectedBy: campaign.rejected_by,
          rejectionAction: campaign.rejection_action,
          stats: {
            totalRecipients: campaign.recipient_count || 0,
            sentCount: campaign.recipient_count || 0,
            openedCount: campaign.opened_count || 0,
            clickedCount: campaign.clicked_count || 0,
            bouncedCount: campaign.bounced_count || 0,
            unsubscribedCount: campaign.unsubscribed_count || 0
          }
        };
    }));

    res.json({
      success: true,
      data: {
        campaigns: campaigns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// 匯入外部 URL 內容
router.post('/fetch-url',
  asyncHandler(async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
      throw new AppError('請提供有效的網址', 400);
    }

    try {
      console.log('Fetching URL:', url);
      // 設定 timeout 和 header 避免被擋
      // 加入 responseType: 'text' 確保 axios 不會自動轉換 JSON，而是返回原始字串
      const response = await axios.get(url, {
        timeout: 10000,
        responseType: 'text',
        transformResponse: [data => data], // 防止 axios 自動嘗試解析 JSON
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      let content = response.data;
      
      // 處理相對路徑問題：將所有圖片與連結的相對路徑轉換為絕對路徑
      const baseUrl = new URL(url);
      const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // 替換 src="..." (圖片、腳本等)
      content = content.replace(/(src=["'])(?!http|\/\/|data:)([^"']+)(["'])/gi, (match, prefix, path, suffix) => {
          // 如果路徑以 / 開頭，則相對於根域名
          if (path.startsWith('/')) {
              return `${prefix}${baseUrl.origin}${path}${suffix}`;
          }
          // 否則相對於當前路徑
          return `${prefix}${basePath}${path}${suffix}`;
      });
      
      // 替換 href="..." (CSS、連結等)
      content = content.replace(/(href=["'])(?!http|\/\/|data:|#|mailto:)([^"']+)(["'])/gi, (match, prefix, path, suffix) => {
          if (path.startsWith('/')) {
              return `${prefix}${baseUrl.origin}${path}${suffix}`;
          }
          return `${prefix}${basePath}${path}${suffix}`;
      });
      
      res.json({
        success: true,
        data: {
            content: content
        }
      });
    } catch (error) {
      console.error('Error fetching URL:', error.message);
      throw new AppError(`無法讀取網址內容: ${error.message}`, 500);
    }
  })
);

// 獲取活動統計數據
router.get('/stats', asyncHandler(async (req, res) => {
    const query = `
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status IN ('processing', 'sending', 'pending_approval', 'in_review') THEN 1 END) as active,
            COUNT(CASE WHEN status = 'sent' THEN 1 END) as completed,
            COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled
        FROM Campaigns
    `;
    
    const result = await executeQuery(query);
    const stats = result.recordset[0];
    
    res.json({
        success: true,
        data: {
            total: stats.total || 0,
            active: stats.active || 0,
            completed: stats.completed || 0,
            scheduled: stats.scheduled || 0
        }
    });
}));

// 獲取單個活動詳情
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const query = `
      SELECT 
        c.*,
        u.full_name as created_by_name,
        t.name as template_name
      FROM Campaigns c
      LEFT JOIN Users u ON c.created_by = u.id
      LEFT JOIN Templates t ON c.template_id = t.id
      WHERE c.id = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('活動不存在', 404);
    }

    const campaign = result.recordset[0];

    // 檢查權限 - 開放所有用戶查看
    // if (!['admin', 'manager'].includes(userRole) && campaign.created_by !== userId) {
    //   throw new AppError('沒有權限查看此活動', 403);
    // }

    res.json({
      success: true,
      data: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        htmlContent: campaign.html_content,
        textContent: campaign.text_content,
        senderName: campaign.sender_name,
        senderEmail: campaign.sender_email,
        replyTo: campaign.reply_to,
        status: campaign.status,
        priority: campaign.priority,
        scheduledAt: campaign.scheduled_at,
        sentAt: campaign.sent_at,
        endDate: campaign.end_date,
        templateId: campaign.template_id,
        templateName: campaign.template_name,
        workflowId: campaign.workflow_id,
        createdBy: campaign.created_by,
        createdByName: campaign.created_by_name,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        targetAudience: campaign.target_audience,
        targetFilter: campaign.target_filter,
        trackOpens: campaign.track_opens,
        trackClicks: campaign.track_clicks,
        includeUnsubscribe: campaign.include_unsubscribe,
        previewText: campaign.preview_text,
        stats: {
          recipientCount: campaign.recipient_count || 0,
          openedCount: campaign.opened_count || 0,
          clickedCount: campaign.clicked_count || 0,
          bouncedCount: campaign.bounced_count || 0,
          unsubscribedCount: campaign.unsubscribed_count || 0
        }
      }
    });
  })
);

// 創建新活動
router.post('/',
  validate(campaignValidations.create),
  asyncHandler(async (req, res) => {
    const {
      name,
      subject,
      htmlContent,
      textContent,
      senderName,
      senderEmail,
      replyTo,
      templateId,
      priority = 'medium',
      recipientGroups = [],
      recipientEmails = [],
      scheduledAt,
      type = 'Regular',
      status = 'draft',
      requires_approval = false,
      targetAudience = 'all',
      targetFilter = null,
      trackOpens = true,
      trackClicks = true,
      includeUnsubscribe = true,
      previewText = null
    } = req.body;

    const userId = req.user.id;

    // 檢查活動名稱是否重複
    const existingQuery = `
      SELECT id FROM Campaigns WHERE name = @name AND created_by = @userId
    `;
    const existingResult = await executeQuery(existingQuery, { name, userId });

    if (existingResult.recordset.length > 0) {
      throw new AppError('活動名稱已存在', 400);
    }

    // 處理 targetFilter
    // 如果沒有明確提供 targetFilter，嘗試從 recipientGroups 或 recipientEmails 構建
    let finalTargetFilter = targetFilter;
    if (!finalTargetFilter) {
        if (recipientGroups && recipientGroups.length > 0) {
            finalTargetFilter = JSON.stringify(recipientGroups);
        } else if (recipientEmails && recipientEmails.length > 0) {
            // 對於 custom audience，targetFilter 應該是 { emails: [...] }
            finalTargetFilter = JSON.stringify({ emails: recipientEmails });
        }
    } else if (typeof targetFilter === 'object') {
        finalTargetFilter = JSON.stringify(targetFilter);
    }

    // 確保 templateId 是有效的整數，如果是字串（如 'newsletter'）則設為 null
    // 同時檢查是否超過 SQL INT 最大值 (2,147,483,647)，如果是 (例如 timestamp ID)，也設為 null
    const MAX_SQL_INT = 2147483647;
    let sanitizedTemplateId = null;
    if (templateId && !isNaN(parseInt(templateId))) {
        const parsedId = parseInt(templateId);
        if (parsedId <= MAX_SQL_INT) {
            sanitizedTemplateId = parsedId;
        }
    }
    
    // 如果 templateId 是字串且不是數字，可能應該作為 type 使用 (如果 type 是 'Regular' 默認值)
    const effectiveType = (templateId && isNaN(parseInt(templateId)) && type === 'Regular') ? templateId : type;

    console.log('🔍 Backend Debug - Received data:', {
      recipientGroups,
      recipientEmails,
      name,
      subject,
      targetAudience,
      finalTargetFilter,
      type,
      effectiveType,
      templateId,
      sanitizedTemplateId
    });

    // 計算收件人數量
    let recipientCount = 0;
    
    // 確保 effectiveRecipientGroups 有值，如果 recipientGroups 為空則嘗試從 targetFilter 解析 (針對分類受眾)
    let effectiveRecipientGroups = recipientGroups || [];
    if ((!effectiveRecipientGroups || effectiveRecipientGroups.length === 0) && (targetAudience || '').toLowerCase() === 'category' && finalTargetFilter) {
        try {
            const parsed = typeof finalTargetFilter === 'string' ? JSON.parse(finalTargetFilter) : finalTargetFilter;
            if (Array.isArray(parsed)) {
                effectiveRecipientGroups = parsed;
            } else if (typeof parsed === 'number' || (typeof parsed === 'string' && parsed.trim() !== '')) {
                effectiveRecipientGroups = [parsed];
            }
        } catch (e) {
            console.error('解析 targetFilter 失敗:', e);
        }
    }

    if (recipientEmails && recipientEmails.length > 0) {
      recipientCount = recipientEmails.length;
    } else if (effectiveRecipientGroups && effectiveRecipientGroups.length > 0) {
      // 根據不同的受眾群組查詢實際的訂閱者數量
      if (effectiveRecipientGroups.includes('all_subscribers')) {
        // 查詢所有活躍訂閱者
        const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed')`;
        const countResult = await executeQuery(countQuery);
        recipientCount = countResult.recordset[0].count;
      } else if (effectiveRecipientGroups.includes('active_users')) {
        // 查詢活躍用戶（有 active 標籤的訂閱者）
        const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed') AND tags LIKE '%active%'`;
        const countResult = await executeQuery(countQuery);
        recipientCount = countResult.recordset[0].count;
      } else {
        // 檢查是否包含數字ID（分類ID）
        const categoryIds = effectiveRecipientGroups.filter(id => !isNaN(parseInt(id)) && parseInt(id) > 0);
        
        if (categoryIds.length > 0) {
            // 查詢屬於這些分類的活躍訂閱者數量
            // 使用 DISTINCT 避免重複計算（如果訂閱者屬於多個選定分類）
            const countQuery = `
                SELECT COUNT(DISTINCT s.id) as count 
                FROM Subscribers s
                JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
                WHERE s.status IN ('active', 'subscribed') 
                AND sc.category_id IN (${categoryIds.map(id => parseInt(id)).join(',')})
            `;
            const countResult = await executeQuery(countQuery);
            recipientCount = countResult.recordset[0].count;
        } else {
            // 默認查詢所有活躍訂閱者 (如果沒有匹配的群組或分類)
            const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed')`;
            const countResult = await executeQuery(countQuery);
            recipientCount = countResult.recordset[0].count;
        }
      }
    } else if (targetAudience === 'custom' && finalTargetFilter) {
         try {
             const filterObj = typeof finalTargetFilter === 'string' ? JSON.parse(finalTargetFilter) : finalTargetFilter;
             if (filterObj.method === 'filters' && Array.isArray(filterObj.criteria)) {
                 let whereClause = "status IN ('active', 'subscribed')";
                 const params = {};
                 
                 filterObj.criteria.forEach((c, index) => {
                     const paramName = `val${index}`;
                     let condition = '';
                     let val = c.value;
                     
                     if (c.field === 'location') {
                         if (c.operator === 'equals') condition = `city = @${paramName}`;
                         else if (c.operator === 'contains') { condition = `city LIKE @${paramName}`; val = `%${val}%`; }
                     } else if (c.field === 'gender') {
                         if (c.operator === 'equals') condition = `gender = @${paramName}`;
                     } else if (c.field === 'age') {
                         // Age is tricky, assuming birth_date exists.
                         // Age > X means birth_date < (Now - X years)
                         const dateVal = new Date();
                         dateVal.setFullYear(dateVal.getFullYear() - parseInt(val));
                         const dateStr = dateVal.toISOString().split('T')[0];
                         
                         if (c.operator === 'greater') condition = `birth_date < @${paramName}`; // Older than X means born before
                         else if (c.operator === 'less') condition = `birth_date > @${paramName}`; // Younger than X means born after
                         else if (c.operator === 'equals') {
                             // Born between dateStr and dateStr+1year
                             const nextYear = new Date(dateVal);
                             nextYear.setFullYear(nextYear.getFullYear() + 1);
                             const nextYearStr = nextYear.toISOString().split('T')[0];
                             condition = `birth_date >= @${paramName} AND birth_date < '${nextYearStr}'`;
                         }
                         val = dateStr;
                     } else if (c.field === 'subscription_date') {
                         if (c.operator === 'greater') condition = `subscribed_at > @${paramName}`;
                         else if (c.operator === 'less') condition = `subscribed_at < @${paramName}`;
                         else if (c.operator === 'equals') {
                             // Same day
                             condition = `CONVERT(date, subscribed_at) = @${paramName}`;
                         }
                     }
                     
                     if (condition) {
                         whereClause += ` AND (${condition})`;
                         params[paramName] = val;
                     }
                 });
                 
                 const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE ${whereClause}`;
                 const countResult = await executeQuery(countQuery, params);
                 recipientCount = countResult.recordset[0].count;
             }
         } catch (e) {
             console.error('Failed to calculate recipient count for custom filters:', e);
         }
    }

    // 創建活動
    const insertQuery = `
      INSERT INTO Campaigns (
        name, subject, type, template_id, html_content, text_content,
        sender_name, sender_email, reply_to, status, priority, created_by,
        scheduled_at, recipient_count, target_audience, target_filter,
        track_opens, track_clicks, include_unsubscribe, preview_text
      )
      OUTPUT INSERTED.id
      VALUES (
        @name, @subject, @type, @templateId, @htmlContent, @textContent,
        @senderName, @senderEmail, @replyTo, @status, @priority, @userId,
        @scheduledAt, @recipientCount, @targetAudience, @targetFilter,
        @trackOpens, @trackClicks, @includeUnsubscribe, @previewText
      )
    `;

    // 處理 targetFilter (Use finalTargetFilter calculated above)
    const processedTargetFilter = finalTargetFilter || (typeof targetFilter === 'object' ? JSON.stringify(targetFilter) : (targetFilter || null));

    const result = await executeQuery(insertQuery, {
      name,
      subject,
      type: effectiveType,
      templateId: sanitizedTemplateId,
      htmlContent,
      textContent: textContent || null,
      senderName,
      senderEmail,
      replyTo: replyTo || null,
      status,
      priority,
      userId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      recipientCount,
      targetAudience,
      targetFilter: processedTargetFilter,
      trackOpens,
      trackClicks,
      includeUnsubscribe,
      previewText: previewText || null
    });

    const campaignId = result.recordset[0].id;

    // 如果狀態是待審核，自動建立審核項目
    if (status === 'pending_approval') {
      try {
        // 1. 檢查使用者是否有分配的審核工作流程
        const userWorkflowQuery = `
          SELECT assigned_workflow_id
          FROM Users
          WHERE id = @userId
        `;
        const userWorkflowResult = await executeQuery(userWorkflowQuery, { userId });
        
        let workflowId = null;

        if (userWorkflowResult.recordset.length > 0 && userWorkflowResult.recordset[0].assigned_workflow_id) {
          workflowId = userWorkflowResult.recordset[0].assigned_workflow_id;
        } else {
            // 2. 如果沒有分配，使用預設工作流程
            // 優先選擇 is_default = 1 的流程，若無則選擇最新的 active 流程
            const workflowQuery = `
              SELECT TOP 1 id 
              FROM ApprovalWorkflows 
              WHERE is_active = 1 
              ORDER BY is_default DESC, created_at DESC
            `;
            const workflowResult = await executeQuery(workflowQuery);
            if (workflowResult.recordset.length > 0) {
              workflowId = workflowResult.recordset[0].id;
            }
        }

        if (workflowId) {
          
          // 2. 獲取總步驟數
          const stepsQuery = `SELECT COUNT(*) as total FROM WorkflowSteps WHERE workflow_id = @workflowId`;
          const stepsResult = await executeQuery(stepsQuery, { workflowId });
          const totalSteps = stepsResult.recordset[0].total;
          
          if (totalSteps > 0) {
            // 3. 創建審核項目
            const createApprovalQuery = `
              INSERT INTO ApprovalItems (campaign_id, workflow_id, current_step, total_steps, status, priority, submitted_by)
              OUTPUT INSERTED.ID
              VALUES (@campaignId, @workflowId, 1, @totalSteps, 'pending', @priority, @submittedBy)
            `;
            const createResult = await executeQuery(createApprovalQuery, {
              campaignId,
              workflowId,
              totalSteps,
              priority: priority || 'normal',
              submittedBy: userId
            });
            
            if (createResult.recordset && createResult.recordset.length > 0) {
                const approvalId = createResult.recordset[0].ID;
                console.log('已自動為活動創建審核項目:', campaignId, 'ApprovalID:', approvalId);
                
                // 發送通知給第一關審核者
                notificationService.sendApprovalNotification(approvalId)
                    .catch(err => console.error('發送初始審核通知失敗:', err));
            }
          }
        }
      } catch (err) {
        console.error('創建審核項目失敗:', err);
        // 不中斷請求，但記錄錯誤
      }
    }

    res.status(201).json({
      success: true,
      message: '活動創建成功',
      data: { id: campaignId }
    });
  })
);

// 更新活動
router.put('/:id',
  validate(campaignValidations.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // 檢查活動是否存在
    const checkQuery = `
      SELECT id, created_by, status, target_audience FROM Campaigns WHERE id = @id
    `;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      throw new AppError('活動不存在', 404);
    }

    const campaign = checkResult.recordset[0];

    // 檢查權限 - 僅限建立者或管理員修改
    const normalizedRole = userRole ? userRole.toLowerCase() : '';
    if (!['admin', 'manager'].includes(normalizedRole) && campaign.created_by !== userId) {
      throw new AppError('沒有權限修改此活動', 403);
    }

    // 檢查狀態
    if (campaign.status === 'pending_approval') {
      throw new AppError('審核中的活動無法修改', 400);
    }
    // if (!['draft', 'rejected'].includes(campaign.status)) {
    //   throw new AppError('只能修改草稿或被拒絕的活動', 400);
    // }

    const {
      name,
      subject,
      htmlContent,
      textContent,
      senderName,
      senderEmail,
      replyTo,
      templateId,
      priority,
      scheduledAt,
      type, // 添加 type 參數
      status, // 添加 status 參數
      targetAudience,
      targetFilter,
      recipientEmails,
      recipientGroups,
      trackOpens,
      trackClicks,
      includeUnsubscribe,
      previewText
    } = req.body;

    // 檢查名稱重複
    if (name) {
      const duplicateQuery = `
        SELECT id FROM Campaigns WHERE name = @name AND id != @id AND created_by = @userId
      `;
      const duplicateResult = await executeQuery(duplicateQuery, { name, id, userId });

      if (duplicateResult.recordset.length > 0) {
        throw new AppError('活動名稱已存在', 400);
      }
    }

    let finalStatus = status;
    // 自動重審邏輯：如果活動處於已批准、已拒絕或待審核狀態，且被修改（且未明確指定新狀態），則強制重置為待審核
    if (status === undefined && ['approved', 'rejected', 'pending_approval', 'returned'].includes(campaign.status)) {
         finalStatus = 'pending_approval';
         console.log(`活動 ${id} 內容變更，自動重置為 pending_approval`);
    }

    // 建構更新查詢
    const updateFields = [];
    const params = { id };

    if (name !== undefined) {
      updateFields.push('name = @name');
      params.name = name;
    }
    if (type !== undefined) {
      updateFields.push('type = @type');
      params.type = type;
    }
    if (finalStatus !== undefined) {
      updateFields.push('status = @status');
      params.status = finalStatus;
    }
    if (subject !== undefined) {
      updateFields.push('subject = @subject');
      params.subject = subject;
    }
    if (htmlContent !== undefined) {
      updateFields.push('html_content = @htmlContent');
      params.htmlContent = htmlContent;
    }
    if (textContent !== undefined) {
      updateFields.push('text_content = @textContent');
      params.textContent = textContent || null;
    }
    if (senderName !== undefined) {
      updateFields.push('sender_name = @senderName');
      params.senderName = senderName;
    }
    if (senderEmail !== undefined) {
      updateFields.push('sender_email = @senderEmail');
      params.senderEmail = senderEmail;
    }
    if (replyTo !== undefined) {
      updateFields.push('reply_to = @replyTo');
      params.replyTo = replyTo || null;
    }
    if (templateId !== undefined) {
      // 確保 templateId 是有效的整數，如果是字串（如 'newsletter'）則設為 null
      const sanitizedTemplateId = (templateId && !isNaN(parseInt(templateId))) ? parseInt(templateId) : null;
      updateFields.push('template_id = @templateId');
      params.templateId = sanitizedTemplateId;
    }
    if (priority !== undefined) {
      updateFields.push('priority = @priority');
      params.priority = priority;
    }
    if (scheduledAt !== undefined) {
      updateFields.push('scheduled_at = @scheduledAt');
      params.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    }
    if (targetAudience !== undefined) {
      updateFields.push('target_audience = @targetAudience');
      params.targetAudience = targetAudience;
    }

    // Handle targetFilter logic similar to create
    let finalTargetFilter = targetFilter;
    if (!finalTargetFilter) {
         if (recipientGroups && recipientGroups.length > 0) {
             finalTargetFilter = JSON.stringify(recipientGroups);
         } else if (recipientEmails && recipientEmails.length > 0) {
             finalTargetFilter = JSON.stringify({ emails: recipientEmails });
         }
    }

    if (finalTargetFilter !== undefined) {
      updateFields.push('target_filter = @targetFilter');
      // 如果是物件，轉為 JSON 字串
      params.targetFilter = typeof finalTargetFilter === 'object' ? JSON.stringify(finalTargetFilter) : (finalTargetFilter || null);
      
      // Recalculate recipient count
      let recipientCount = 0;

      const effectiveTargetAudience = targetAudience !== undefined ? targetAudience : campaign.target_audience;

      // 確保 effectiveRecipientGroups 有值
       let effectiveRecipientGroups = recipientGroups || [];
       if ((!effectiveRecipientGroups || effectiveRecipientGroups.length === 0) && (effectiveTargetAudience || '').toLowerCase() === 'category' && finalTargetFilter) {
          try {
             const parsed = typeof finalTargetFilter === 'string' ? JSON.parse(finalTargetFilter) : finalTargetFilter;
             if (Array.isArray(parsed)) {
                 effectiveRecipientGroups = parsed;
             } else if (typeof parsed === 'number' || (typeof parsed === 'string' && parsed.trim() !== '')) {
                 effectiveRecipientGroups = [parsed];
             }
          } catch (e) {
              console.error('解析 targetFilter 失敗:', e);
          }
      }

      if (recipientEmails && recipientEmails.length > 0) {
        recipientCount = recipientEmails.length;
      } else if (effectiveRecipientGroups && effectiveRecipientGroups.length > 0) {
        if (effectiveRecipientGroups.includes('all_subscribers')) {
            const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed')`;
            const countResult = await executeQuery(countQuery);
            recipientCount = countResult.recordset[0].count;
        } else if (effectiveRecipientGroups.includes('active_users')) {
            const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed') AND tags LIKE '%active%'`;
            const countResult = await executeQuery(countQuery);
            recipientCount = countResult.recordset[0].count;
        } else {
            const categoryIds = effectiveRecipientGroups.filter(id => !isNaN(parseInt(id)) && parseInt(id) > 0);
            if (categoryIds.length > 0) {
                const countQuery = `
                    SELECT COUNT(DISTINCT s.id) as count 
                    FROM Subscribers s
                    JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
                    WHERE s.status IN ('active', 'subscribed') 
                    AND sc.category_id IN (${categoryIds.map(id => parseInt(id)).join(',')})
                `;
                const countResult = await executeQuery(countQuery);
                recipientCount = countResult.recordset[0].count;
            } else {
                const countQuery = `SELECT COUNT(*) as count FROM Subscribers WHERE status IN ('active', 'subscribed')`;
                const countResult = await executeQuery(countQuery);
                recipientCount = countResult.recordset[0].count;
            }
        }
      }
      
      if (recipientCount >= 0) {
          updateFields.push('recipient_count = @recipientCount');
          params.recipientCount = recipientCount;
      }
    }
    if (trackOpens !== undefined) {
      updateFields.push('track_opens = @trackOpens');
      params.trackOpens = trackOpens;
    }
    if (trackClicks !== undefined) {
      updateFields.push('track_clicks = @trackClicks');
      params.trackClicks = trackClicks;
    }
    if (includeUnsubscribe !== undefined) {
      updateFields.push('include_unsubscribe = @includeUnsubscribe');
      params.includeUnsubscribe = includeUnsubscribe;
    }
    if (previewText !== undefined) {
      updateFields.push('preview_text = @previewText');
      params.previewText = previewText || null;
    }

    if (updateFields.length === 0) {
      throw new AppError('沒有提供要更新的欄位', 400);
    }

    updateFields.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE Campaigns
      SET ${updateFields.join(', ')}
      WHERE id = @id
    `;

    await executeQuery(updateQuery, params);

    // 如果狀態更新為待審核，檢查並自動建立或重置審核項目
    if (finalStatus === 'pending_approval') {
      try {
        // 檢查是否已有審核項目 (任何狀態)
        const checkApprovalQuery = `
          SELECT id FROM ApprovalItems 
          WHERE campaign_id = @id
        `;
        const checkApprovalResult = await executeQuery(checkApprovalQuery, { id });

        if (checkApprovalResult.recordset.length > 0) {
            // 重置現有審核項目
            const approvalId = checkApprovalResult.recordset[0].id;
            await executeQuery(`
                UPDATE ApprovalItems 
                SET status = 'pending', current_step = 1, completed_at = NULL, updated_at = GETDATE()
                WHERE id = @approvalId
            `, { approvalId });
            
            console.log('已重置活動審核項目:', id);
            notificationService.sendApprovalNotification(approvalId).catch(err => console.error('發送通知失敗:', err));
        } else {
          // 1. 檢查使用者是否有分配的審核工作流程
          const userWorkflowQuery = `
            SELECT assigned_workflow_id
            FROM Users
            WHERE id = @userId
          `;
          const userWorkflowResult = await executeQuery(userWorkflowQuery, { userId });
          
          let workflowId = null;

          if (userWorkflowResult.recordset.length > 0 && userWorkflowResult.recordset[0].assigned_workflow_id) {
            workflowId = userWorkflowResult.recordset[0].assigned_workflow_id;
          } else {
            // 2. 如果沒有分配，使用預設工作流程
            // 優先選擇 is_default = 1 的流程，若無則選擇最新的 active 流程
            const workflowQuery = `
              SELECT TOP 1 id 
              FROM ApprovalWorkflows 
              WHERE is_active = 1 
              ORDER BY is_default DESC, created_at DESC
            `;
            const workflowResult = await executeQuery(workflowQuery);
            if (workflowResult.recordset.length > 0) {
              workflowId = workflowResult.recordset[0].id;
            }
          }

          if (workflowId) {
            // 3. 獲取總步驟數
            const stepsQuery = `SELECT COUNT(*) as total FROM WorkflowSteps WHERE workflow_id = @workflowId`;
            const stepsResult = await executeQuery(stepsQuery, { workflowId });
            const totalSteps = stepsResult.recordset[0].total;
            
            if (totalSteps > 0) {
              // 3. 創建審核項目
              const createApprovalQuery = `
                INSERT INTO ApprovalItems (campaign_id, workflow_id, current_step, total_steps, status, priority, submitted_by)
                OUTPUT inserted.id
                VALUES (@id, @workflowId, 1, @totalSteps, 'pending', @priority, @submittedBy)
              `;
              const createResult = await executeQuery(createApprovalQuery, {
                id,
                workflowId,
                totalSteps,
                priority: priority || campaign.priority || 'normal',
                submittedBy: userId
              });
              
              const newApprovalId = createResult.recordset[0].id;
              console.log('已自動為活動創建審核項目(更新時):', id);
              notificationService.sendApprovalNotification(newApprovalId).catch(err => console.error('發送通知失敗:', err));
            }
          }
        }
      } catch (err) {
        console.error('創建/重置審核項目失敗(更新時):', err);
        // 不中斷請求，但記錄錯誤
      }
    }

    res.json({
      success: true,
      message: '活動更新成功'
    });
  })
);

// 刪除活動
router.delete('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // 檢查活動是否存在
    const checkQuery = `
      SELECT id, created_by, status FROM Campaigns WHERE id = @id
    `;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      throw new AppError('活動不存在', 404);
    }

    const campaign = checkResult.recordset[0];

    // 檢查權限
    const normalizedRole = userRole ? userRole.toLowerCase() : '';
    if (!['admin', 'manager'].includes(normalizedRole) && campaign.created_by !== userId) {
      throw new AppError('沒有權限刪除此活動', 403);
    }

    // 刪除活動
    // 注意：我們會一併刪除相關的審核項目、郵件隊列和發送記錄
    const operations = [
      // 1. 刪除關聯的追蹤記錄
      { query: 'DELETE FROM EmailClicks WHERE CampaignID = @id', params: { id } },
      { query: 'DELETE FROM EmailOpens WHERE CampaignID = @id', params: { id } },
      { query: 'DELETE FROM EmailUnsubscribes WHERE CampaignID = @id', params: { id } },
      
      // 1.5 刪除郵件日誌 (如果存在)
      { query: "IF OBJECT_ID('EmailLogs', 'U') IS NOT NULL DELETE FROM EmailLogs WHERE campaign_id = @id", params: { id } },

      // 2. 刪除統計數據
      { query: "IF OBJECT_ID('campaign_stats', 'U') IS NOT NULL DELETE FROM campaign_stats WHERE campaign_id = @id", params: { id } },
      
      // 3. 刪除審核相關
      // 先刪除 ApprovalTokens (NO_ACTION constraint)
      { query: "IF OBJECT_ID('ApprovalTokens', 'U') IS NOT NULL DELETE FROM ApprovalTokens WHERE approval_id IN (SELECT id FROM ApprovalItems WHERE campaign_id = @id)", params: { id } },
      // 顯式刪除 ApprovalSteps 和 ApprovalHistory 以防止 CASCADE 缺失導致的錯誤
      { query: "IF OBJECT_ID('ApprovalSteps', 'U') IS NOT NULL DELETE FROM ApprovalSteps WHERE approval_item_id IN (SELECT id FROM ApprovalItems WHERE campaign_id = @id)", params: { id } },
      { query: "IF OBJECT_ID('ApprovalHistory', 'U') IS NOT NULL DELETE FROM ApprovalHistory WHERE approval_item_id IN (SELECT id FROM ApprovalItems WHERE campaign_id = @id)", params: { id } },
      
      { query: 'DELETE FROM ApprovalItems WHERE campaign_id = @id', params: { id } },
      // 嘗試刪除 CampaignApprovals (如果存在)
      { query: "IF OBJECT_ID('CampaignApprovals', 'U') IS NOT NULL DELETE FROM CampaignApprovals WHERE CampaignId = @id", params: { id } },

      // 4. 刪除郵件隊列和發送記錄
      { query: 'DELETE FROM EmailQueue WHERE campaign_id = @id', params: { id } },
      { query: 'DELETE FROM EmailSends WHERE campaign_id = @id', params: { id } },
      
      // 5. 刪除活動本身
      { query: 'DELETE FROM Campaigns WHERE id = @id', params: { id } }
    ];

    await executeTransaction(operations);

    res.json({
      success: true,
      message: '活動刪除成功'
    });
  })
);

// 取消活動 (停止發送)
router.post('/:id/cancel',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // 檢查活動是否存在
    const checkQuery = `
      SELECT id, created_by, status FROM Campaigns WHERE id = @id
    `;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      throw new AppError('活動不存在', 404);
    }

    const campaign = checkResult.recordset[0];

    // 檢查權限：只有管理員或活動建立者可以取消
    const normalizedRole = userRole ? userRole.toLowerCase() : '';
    if (!['admin', 'manager'].includes(normalizedRole) && campaign.created_by !== userId) {
      throw new AppError('沒有權限取消此活動', 403);
    }

    // 檢查狀態
    if (['cancelled', 'completed', 'failed'].includes(campaign.status)) {
      throw new AppError('此活動無法取消 (已結束或已取消)', 400);
    }

    // 執行取消操作 (Transaction)
    const operations = [
        // 1. 更新活動狀態
        {
            query: "UPDATE Campaigns SET status = 'cancelled', updated_at = GETDATE() WHERE id = @id",
            params: { id }
        },
        // 2. 取消佇列中尚未發送的郵件
        // 將 pending, processing, deferred, held 狀態的郵件設為 cancelled
        {
            query: "UPDATE EmailQueue SET status = 'cancelled', updated_at = GETDATE() WHERE campaign_id = @id AND status IN ('pending', 'processing', 'deferred', 'held')",
            params: { id }
        }
    ];

    await executeTransaction(operations);

    console.log(`活動 ${id} 已被用戶 ${userId} 取消`);

    res.json({
      success: true,
      message: '活動已取消，正在停止發送'
    });
  })
);

// 代理獲取外部 URL 內容
router.post('/fetch-url', 
  asyncHandler(async (req, res) => {
    const { url } = req.body;
    
    console.log('Fetching URL:', url); // Debug log

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000, // 10秒超時
        responseType: 'text' // 強制為文本
      });
      
      console.log('Fetch success, status:', response.status);
      console.log('Content type:', response.headers['content-type']);
      console.log('Content length:', response.data ? response.data.length : 0);

      res.json({ success: true, content: response.data });
    } catch (error) {
      console.error('Fetch URL error:', error.message);
      if (error.response) {
          console.error('Error status:', error.response.status);
          console.error('Error data:', error.response.data);
      }
      res.status(500).json({ success: false, error: '無法讀取網址內容: ' + (error.response?.statusText || error.message) });
    }
  })
);

// 發送活動成效報告給建立者
router.post('/:id/send-report',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // 檢查活動是否存在及權限
    const checkQuery = `
      SELECT c.*, u.email as creator_email, u.full_name as creator_name
      FROM Campaigns c
      JOIN Users u ON c.created_by = u.id
      WHERE c.id = @id
    `;
    const result = await executeQuery(checkQuery, { id });
    
    if (result.recordset.length === 0) {
      throw new AppError('找不到該活動', 404);
    }
    
    const campaign = result.recordset[0];
    
    // 檢查權限 (只有建立者或管理員可以發送報告)
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && campaign.created_by !== req.user.id) {
      throw new AppError('您沒有權限執行此操作', 403);
    }

    if (campaign.status !== 'sent') {
        throw new AppError('只能發送已完成活動的報告', 400);
    }
    
    // 發送報告
    await notificationService.sendCampaignReport(campaign.id, campaign.creator_email);
    
    res.json({
      success: true,
      message: `報告已發送至 ${campaign.creator_email}`
    });
  })
);

module.exports = router;