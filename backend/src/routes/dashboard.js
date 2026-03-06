const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');
const { authenticateUserOrAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/errorHandler');

// 所有路由都需要認證
router.use(authenticateUserOrAdmin);

// 獲取儀表板活動記錄
router.get('/activities', asyncHandler(async (req, res) => {
    // 獲取最近的活動 (限制 20 筆)
    // 這裡我們聚合不同來源的活動：
    // 1. 新增訂閱者
    // 2. 建立/發送活動
    // 3. 更新EDM
    
    const query = `
        SELECT TOP 20 * FROM (
            -- 訂閱者活動
            SELECT 
                'subscriber_added' as type,
                '新訂閱者加入' as title,
                CONCAT('訂閱者 ', email, ' 已加入') as description,
                created_at as timestamp,
                'green' as color,
                id as reference_id
            FROM Subscribers
            WHERE status IN ('active', 'subscribed')

            UNION ALL

            -- 活動(Campaign)相關
            SELECT 
                CASE 
                    WHEN status = 'sent' THEN 'email_sent'
                    WHEN status = 'draft' THEN 'campaign_created'
                    ELSE 'campaign_updated'
                    END as type,
                CASE 
                    WHEN status = 'sent' THEN '電子報已發送'
                    WHEN status = 'draft' THEN '建立新活動'
                    ELSE '活動狀態更新'
                END as title,
                name as description,
                updated_at as timestamp,
                CASE 
                    WHEN status = 'sent' THEN 'blue'
                    WHEN status = 'draft' THEN 'gray'
                    ELSE 'purple'
                END as color,
                id as reference_id
            FROM Campaigns

            UNION ALL

            -- EDM相關
            SELECT 
                'template_updated' as type,
                'EDM已更新' as title,
                name as description,
                updated_at as timestamp,
                'orange' as color,
                id as reference_id
            FROM Templates
        ) AS AllActivities
        ORDER BY timestamp DESC
    `;

    const result = await executeQuery(query);

    // 格式化數據以符合前端需求
    const activities = result.recordset.map((item, index) => {
        // 計算相對時間 (簡單實作)
        const date = new Date(item.timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        let timeStr = '';
        if (diffDays > 0) timeStr = `${diffDays} 天前`;
        else if (diffHours > 0) timeStr = `${diffHours} 小時前`;
        else if (diffMins > 0) timeStr = `${diffMins} 分鐘前`;
        else timeStr = '剛剛';

        return {
            id: index + 1, // 前端需要唯一 ID
            type: item.type,
            title: item.title,
            description: item.description,
            time: timeStr,
            color: item.color,
            timestamp: date.getTime(),
            reference_id: item.reference_id
        };
    });

    res.json({
        success: true,
        data: activities
    });
}));

module.exports = router;
