const express = require('express');
const { executeQuery, sql } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// 所有路由都需要認證
router.use(authenticateToken);
// 允許所有已認證用戶訪問（根據 Campaigns 路由的開放策略）
router.use(authorizeRoles('admin', 'manager', 'user'));

/**
 * @route GET /api/queue
 * @description 獲取郵件發送隊列詳細資訊 (Drill-down)
 */
router.get('/', asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20, 
        status, 
        campaign_id,
        search 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitVal = parseInt(limit);

    // 建構查詢條件
    // 主要查詢 EmailQueue，這是即時隊列
    // 如果需要歷史記錄，可能需要 UNION EmailSends，但目前專注於監控 "佇列"
    let whereClause = 'WHERE 1=1';
    const params = {
        offset,
        limit: limitVal
    };

    if (status) {
        whereClause += ' AND eq.status = @status';
        params.status = status;
    }

    if (campaign_id) {
        whereClause += ' AND eq.campaign_id = @campaign_id';
        params.campaign_id = campaign_id;
    }

    if (search) {
        whereClause += ' AND (eq.email LIKE @search OR c.name LIKE @search OR c.subject LIKE @search)';
        params.search = `%${search}%`;
    }

    // 查詢總數
    const countQuery = `
        SELECT COUNT(*) as total
        FROM EmailQueue eq
        LEFT JOIN Campaigns c ON eq.campaign_id = c.id
        ${whereClause}
    `;

    // 查詢數據 - 包含 Header Info (Sender, Recipient, Subject, Size, Arrival Time) & Error Logs
    // Sender 從 Campaign 或系統設定獲取 (這裡簡化顯示 Campaign Name)
    // Size 暫時無數據，可顯示 Subject 長度或預設
    const dataQuery = `
        SELECT 
            eq.id,
            eq.campaign_id,
            c.name as campaign_name,
            c.subject,
            c.sender_name as sender,
            eq.subscriber_id,
            eq.email as recipient,
            eq.status,
            eq.created_at as arrival_time,
            eq.updated_at,
            eq.next_retry_at,
            eq.retry_count,
            eq.error_message as error_log
        FROM EmailQueue eq
        LEFT JOIN Campaigns c ON eq.campaign_id = c.id
        ${whereClause}
        ORDER BY 
            CASE WHEN eq.status = 'processing' THEN 0 
                 WHEN eq.status = 'pending' THEN 1
                 WHEN eq.status = 'deferred' THEN 2
                 ELSE 3 END,
            eq.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const [countResult, dataResult] = await Promise.all([
        executeQuery(countQuery, params),
        executeQuery(dataQuery, params)
    ]);

    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limitVal);

    res.json({
        success: true,
        data: dataResult.recordset,
        pagination: {
            page: parseInt(page),
            limit: limitVal,
            total,
            totalPages
        }
    });
}));

/**
 * @route GET /api/queue/stats
 * @description 獲取隊列統計信息 (Real-time Dashboard)
 */
router.get('/stats', asyncHandler(async (req, res) => {
    // 1. 佇列總數與分類統計
    // Active (processing), Pending (pending), Deferred (deferred), Held (held), Failed (failed/corrupt)
    const queueStatsQuery = `
        SELECT 
            COUNT(*) as total_queue,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as active_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END) as deferred_count,
            SUM(CASE WHEN status = 'held' THEN 1 ELSE 0 END) as held_count,
            SUM(CASE WHEN status IN ('failed', 'corrupt') THEN 1 ELSE 0 END) as failed_count
        FROM EmailQueue
    `;

    // 2. 流量趨勢圖 (當日 00:00 ~ 23:59)
    // 使用 EmailSends 表，顯示當天的發送量
    const trendQuery = `
        SELECT 
            DATEPART(hour, sent_at) as hour,
            COUNT(*) as count
        FROM EmailSends
        WHERE CAST(sent_at AS DATE) = CAST(GETDATE() AS DATE)
        GROUP BY DATEPART(hour, sent_at)
        ORDER BY hour
    `;

    // 3. 活動進度 (Campaign Progress)
    // 顯示正在進行的活動及其進度
    const activeCampaignsQuery = `
        SELECT 
            c.id, 
            c.name, 
            c.status, 
            c.scheduled_at, 
            c.recipient_count as total_recipients,
            c.created_at,
            (SELECT COUNT(*) FROM EmailQueue eq WHERE eq.campaign_id = c.id AND eq.status = 'sent') as sent_count,
            (SELECT COUNT(*) FROM EmailQueue eq WHERE eq.campaign_id = c.id AND eq.status IN ('failed', 'deferred')) as failed_count,
            (SELECT COUNT(*) FROM EmailQueue eq WHERE eq.campaign_id = c.id AND eq.status IN ('pending', 'processing')) as pending_count
        FROM Campaigns c
        WHERE c.status IN ('approved', 'preparing', 'processing', 'sending')
        ORDER BY 
            CASE WHEN c.status IN ('processing', 'sending') THEN 0 
                 WHEN c.status = 'preparing' THEN 1
                 ELSE 2 END,
            c.scheduled_at ASC
    `;

    const [queueStatsResult, trendResult, activeCampaignsResult] = await Promise.all([
        executeQuery(queueStatsQuery),
        executeQuery(trendQuery),
        executeQuery(activeCampaignsQuery)
    ]);

    res.json({
        success: true,
        queueStats: queueStatsResult.recordset[0],
        trafficTrend: trendResult.recordset,
        activeCampaigns: activeCampaignsResult.recordset
    });
}));

module.exports = router;
