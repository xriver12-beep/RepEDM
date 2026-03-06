const express = require('express');
const { executeQuery, sql, getDbConfig } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const os = require('os');

const router = express.Router();

// 獲取伺服器 IP
function getServerIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Helper to build geo filter
const buildGeoFilter = (country, city, alias = 's') => {
    let clauses = [];
    const params = {};
    
    // Parse comma-separated values
    const parse = (str) => str ? str.split(',').map(s => s.trim()).filter(s => s) : [];
    
    const countries = parse(country);
    if (countries.length > 0) {
        const pNames = countries.map((_, i) => `country_${i}`);
        clauses.push(`${alias}.country IN (${pNames.map(p => '@' + p).join(',')})`);
        countries.forEach((c, i) => params[`country_${i}`] = c);
    }
    
    const cities = parse(city);
    if (cities.length > 0) {
        const pNames = cities.map((_, i) => `city_${i}`);
        clauses.push(`${alias}.city IN (${pNames.map(p => '@' + p).join(',')})`);
        cities.forEach((c, i) => params[`city_${i}`] = c);
    }
    
    return { 
        // Note: The JOIN clause needs to be constructed by the caller because the ON condition depends on the main table
        where: (clauses.length > 0) ? ' AND ' + clauses.join(' AND ') : '', 
        params,
        hasFilter: clauses.length > 0
    };
};

// 獲取儀表板統計數據
router.get('/dashboard',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { country, city } = req.query;
    const geoFilter = buildGeoFilter(country, city);

    // 訂閱者統計
    let subStatsQuery = `
      SELECT 
        SUM(CASE WHEN s.status != 'deleted' THEN 1 ELSE 0 END) as totalSubscribers,
        SUM(CASE WHEN s.status = 'active' OR s.status = 'subscribed' THEN 1 ELSE 0 END) as activeSubscribers,
        SUM(CASE WHEN s.status = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribedCount,
        SUM(CASE WHEN s.status != 'deleted' AND DATEDIFF(day, s.created_at, GETDATE()) <= 30 THEN 1 ELSE 0 END) as newSubscribersThisMonth
      FROM Subscribers s
      WHERE 1=1
    `;
    
    if (geoFilter.hasFilter) {
        subStatsQuery += geoFilter.where;
    }

    const subscriberStats = await executeQuery(subStatsQuery, geoFilter.params);

    // 線上前台使用者 (最後活躍時間在5分鐘內且未登出)
    let onlineUserCount = 0;
    let recentLoginLogs = [];
    try {
        const onlineUsersResult = await executeQuery(`
          SELECT COUNT(DISTINCT user_id) as count 
          FROM UserLoginLogs 
          WHERE logout_time IS NULL 
          AND last_active_at >= DATEADD(minute, -5, GETDATE())
        `);
        onlineUserCount = onlineUsersResult.recordset[0]?.count || 0;

        // 最近登入記錄
        const loginLogsResult = await executeQuery(`
          SELECT TOP 10 
            l.login_time, 
            l.logout_time, 
            l.last_active_at,
            l.ip_address, 
            u.username, 
            u.full_name
          FROM UserLoginLogs l
          JOIN Users u ON l.user_id = u.id
          ORDER BY l.login_time DESC
        `);
        recentLoginLogs = loginLogsResult.recordset;
    } catch (logError) {
        console.warn('Error fetching login logs:', logError);
        // Ignore error if table doesn't exist yet or other issue
    }

    // 開放所有用戶查看全站數據
    const isGlobalViewer = true; // ['admin', 'manager'].includes(req.user.role);
    const userId = req.user.id;
    const queryParams = {}; // isGlobalViewer ? {} : { userId };

    // 活動統計
    let campaignStatsQuery = `
      SELECT 
        COUNT(*) as totalCampaigns,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentCampaigns,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draftCampaigns,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduledCampaigns
      FROM Campaigns
    `;
    
    // if (!isGlobalViewer) {
    //   campaignStatsQuery += ' WHERE created_by = @userId';
    // }
    const campaignStats = await executeQuery(campaignStatsQuery, queryParams);

    // 最近30天的發送統計
    let recentSendStats;
    let previousSendStats;

    if (geoFilter.hasFilter) {
        // 使用過濾條件查詢 (需要 JOIN Subscribers)
        const recentParams = { ...queryParams, ...geoFilter.params };
        
        const sentRes = await executeQuery(`
            SELECT COUNT(*) as cnt FROM EmailSends es 
            JOIN Subscribers s ON es.subscriber_id = s.id 
            WHERE es.sent_at >= DATEADD(day, -30, GETDATE()) ${geoFilter.where}
        `, recentParams);

        const openRes = await executeQuery(`
            SELECT COUNT(*) as cnt FROM EmailOpens eo 
            JOIN Subscribers s ON eo.SubscriberID = s.id 
            WHERE eo.OpenedAt >= DATEADD(day, -30, GETDATE()) ${geoFilter.where}
        `, recentParams);

        const clickRes = await executeQuery(`
            SELECT COUNT(*) as cnt FROM EmailClicks ec 
            JOIN Subscribers s ON ec.SubscriberID = s.id 
            WHERE ec.ClickedAt >= DATEADD(day, -30, GETDATE()) ${geoFilter.where}
        `, recentParams);

        recentSendStats = { recordset: [{ 
            totalSent: sentRes.recordset[0].cnt,
            totalOpened: openRes.recordset[0].cnt,
            totalClicked: clickRes.recordset[0].cnt
        }]};

        // Previous 30 days (簡易處理：若有過濾則設為0，因為計算比較重且歷史數據可能不準)
        // 或者也進行計算
        const prevParams = { ...queryParams, ...geoFilter.params };
        const sentPrev = await executeQuery(`
            SELECT COUNT(*) as cnt FROM EmailSends es 
            JOIN Subscribers s ON es.subscriber_id = s.id 
            WHERE es.sent_at >= DATEADD(day, -60, GETDATE()) AND es.sent_at < DATEADD(day, -30, GETDATE()) ${geoFilter.where}
        `, prevParams);
        
        const openPrev = await executeQuery(`
             SELECT COUNT(*) as cnt FROM EmailOpens eo 
             JOIN Subscribers s ON eo.SubscriberID = s.id 
             WHERE eo.OpenedAt >= DATEADD(day, -60, GETDATE()) AND eo.OpenedAt < DATEADD(day, -30, GETDATE()) ${geoFilter.where}
         `, prevParams);

        const clickPrev = await executeQuery(`
             SELECT COUNT(*) as cnt FROM EmailClicks ec 
             JOIN Subscribers s ON ec.SubscriberID = s.id 
             WHERE ec.ClickedAt >= DATEADD(day, -60, GETDATE()) AND ec.ClickedAt < DATEADD(day, -30, GETDATE()) ${geoFilter.where}
         `, prevParams);

        previousSendStats = { recordset: [{ 
            totalSent: sentPrev.recordset[0].cnt,
            totalOpened: openPrev.recordset[0].cnt,
            totalClicked: clickPrev.recordset[0].cnt
        }]};

    } else {
        let recentSendStatsQuery = `
          SELECT 
            COALESCE(SUM(recipient_count), 0) as totalSent,
            COALESCE(SUM(opened_count), 0) as totalOpened,
            COALESCE(SUM(clicked_count), 0) as totalClicked
          FROM Campaigns 
          WHERE sent_at >= DATEADD(day, -30, GETDATE())
        `;
        
        if (!isGlobalViewer) {
          recentSendStatsQuery += ' AND created_by = @userId';
        }
        recentSendStats = await executeQuery(recentSendStatsQuery, queryParams);

        // 上一個30天的統計 (用於計算變化率)
        let previousSendStatsQuery = `
          SELECT 
            COALESCE(SUM(recipient_count), 0) as totalSent,
            COALESCE(SUM(opened_count), 0) as totalOpened,
            COALESCE(SUM(clicked_count), 0) as totalClicked
          FROM Campaigns 
          WHERE sent_at >= DATEADD(day, -60, GETDATE()) AND sent_at < DATEADD(day, -30, GETDATE())
        `;
        
        if (!isGlobalViewer) {
          previousSendStatsQuery += ' AND created_by = @userId';
        }
        previousSendStats = await executeQuery(previousSendStatsQuery, queryParams);
    }

    // Recent Activities
    let activitiesQuery = `
      SELECT TOP 5 * FROM (
        SELECT 
          'email_sent' as type,
          name as title,
          subject as description,
          sent_at as timestamp,
          'blue' as color,
          id
        FROM Campaigns 
        WHERE status = 'sent' AND sent_at IS NOT NULL
    `;

    if (!isGlobalViewer) {
      activitiesQuery += ' AND created_by = @userId';
    }

    activitiesQuery += `
        UNION ALL
        
        SELECT 
          'subscriber_added' as type,
          email as title,
          '新訂閱者加入' as description,
          created_at as timestamp,
          'green' as color,
          id
        FROM Subscribers
      ) AS CombinedActivities
      ORDER BY timestamp DESC
    `;
    const activities = await executeQuery(activitiesQuery, queryParams);

    // Charts: Subscriber Growth
    let subGrowthQuery = `
      SELECT 
        FORMAT(created_at, 'MM/dd') as date,
        COUNT(*) as value
      FROM Subscribers s
      WHERE created_at >= DATEADD(day, -30, GETDATE()) AND status != 'deleted'
    `;
    
    if (geoFilter.hasFilter) {
        subGrowthQuery += geoFilter.where;
    }
    
    subGrowthQuery += `
      GROUP BY FORMAT(created_at, 'MM/dd')
      ORDER BY MIN(created_at)
    `;

    const subscriberGrowth = await executeQuery(subGrowthQuery, geoFilter.params);

    // 郵件發送統計 (最近30天)
    let emailSendStatsQuery = `
      SELECT 
        SUM(CASE WHEN es.status = 'sent' THEN 1 ELSE 0 END) as successfulSends,
        SUM(CASE WHEN es.status = 'failed' THEN 1 ELSE 0 END) as failedSends
      FROM EmailSends es
    `;
    
    if (geoFilter.hasFilter) {
        emailSendStatsQuery += ` JOIN Subscribers s ON es.subscriber_id = s.id `;
    }
    
    emailSendStatsQuery += ` WHERE sent_at >= DATEADD(day, -30, GETDATE()) `;
    
    if (geoFilter.hasFilter) {
        emailSendStatsQuery += geoFilter.where;
    }

    const emailSendStats = await executeQuery(emailSendStatsQuery, geoFilter.params);

    // Charts: Email Performance
    let emailPerfQuery = '';
    
    if (geoFilter.hasFilter) {
        emailPerfQuery = `
          SELECT 
            COALESCE(O.date, C.date) as date,
            ISNULL(O.opens, 0) as opens,
            ISNULL(C.clicks, 0) as clicks
          FROM (
            SELECT FORMAT(eo.OpenedAt, 'MM/dd') as date, COUNT(*) as opens
            FROM EmailOpens eo
            JOIN Subscribers s ON eo.SubscriberID = s.id
            WHERE eo.OpenedAt >= DATEADD(day, -30, GETDATE()) ${geoFilter.where}
            GROUP BY FORMAT(eo.OpenedAt, 'MM/dd')
          ) O
          FULL OUTER JOIN (
            SELECT FORMAT(ec.ClickedAt, 'MM/dd') as date, COUNT(*) as clicks
            FROM EmailClicks ec
            JOIN Subscribers s ON ec.SubscriberID = s.id
            WHERE ec.ClickedAt >= DATEADD(day, -30, GETDATE()) ${geoFilter.where}
            GROUP BY FORMAT(ec.ClickedAt, 'MM/dd')
          ) C ON O.date = C.date
          ORDER BY COALESCE(O.date, C.date)
        `;
    } else {
        emailPerfQuery = `
          SELECT 
            COALESCE(O.date, C.date) as date,
            ISNULL(O.opens, 0) as opens,
            ISNULL(C.clicks, 0) as clicks
          FROM (
            SELECT FORMAT(OpenedAt, 'MM/dd') as date, COUNT(*) as opens
            FROM EmailOpens
            WHERE OpenedAt >= DATEADD(day, -30, GETDATE())
            GROUP BY FORMAT(OpenedAt, 'MM/dd')
          ) O
          FULL OUTER JOIN (
            SELECT FORMAT(ClickedAt, 'MM/dd') as date, COUNT(*) as clicks
            FROM EmailClicks
            WHERE ClickedAt >= DATEADD(day, -30, GETDATE())
            GROUP BY FORMAT(ClickedAt, 'MM/dd')
          ) C ON O.date = C.date
          ORDER BY COALESCE(O.date, C.date)
        `;
    }

    const emailPerformance = await executeQuery(emailPerfQuery, geoFilter.params);

    // 格式化活動時間
    const formattedActivities = activities.recordset.map(item => {
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
            ...item,
            time: timeStr
        };
    });

    const serverIP = getServerIP();
    const hostname = os.hostname();
    const dbConfig = getDbConfig();

    res.json({
      success: true,
      data: {
        onlineUserCount,
        loginLogs: recentLoginLogs,
        subscribers: subscriberStats.recordset[0],
        campaigns: campaignStats.recordset[0],
        performance: recentSendStats.recordset[0],
        previousPerformance: previousSendStats.recordset[0],
        emailSendStats: emailSendStats.recordset[0],
        activities: formattedActivities,
        charts: {
            subscriberGrowth: subscriberGrowth.recordset,
            emailPerformance: emailPerformance.recordset
        },
        systemInfo: {
            hostname: hostname,
            ip: serverIP,
            dbHost: dbConfig.server,
            dbName: dbConfig.database,
            emailLink: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/dashboard.html` : `http://${serverIP}:3002`
        }
      }
    });
  })
);

// 獲取活動效果報告
router.get('/campaigns/:campaignId/report',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;

    // 基本統計
    const basicStats = await executeQuery(`
      SELECT 
        c.name as campaign_name,
        c.subject,
        c.sent_at,
        c.recipient_count as total_sent,
        c.opened_count as total_opened,
        c.clicked_count as total_clicked,
        c.bounced_count as total_bounced,
        c.unsubscribed_count as total_unsubscribed,
        (SELECT COUNT(*) FROM EmailSends WHERE campaign_id = c.id AND status = 'capped') as capped_count,
        CASE WHEN c.recipient_count > 0 THEN CAST(c.opened_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as open_rate,
        CASE WHEN c.opened_count > 0 THEN CAST(c.clicked_count AS FLOAT) / c.opened_count * 100 ELSE 0 END as click_rate,
        CASE WHEN c.recipient_count > 0 THEN CAST(c.bounced_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as bounce_rate,
        CASE WHEN c.recipient_count > 0 THEN CAST(c.unsubscribed_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as unsubscribe_rate
      FROM Campaigns c
      WHERE c.id = @campaignId
    `, { campaignId });

    if (basicStats.recordset.length === 0) {
      throw new AppError('活動不存在', 404);
    }

    // 點擊連結統計
    const linkStats = await executeQuery(`
      SELECT 
        URL as url,
        COUNT(*) as clickCount,
        COUNT(DISTINCT SubscriberID) as uniqueClicks
      FROM EmailClicks 
      WHERE CampaignID = @campaignId
      GROUP BY URL
      ORDER BY clickCount DESC
    `, { campaignId });
    
    // 網域發送統計 (改為查詢 EmailSends 表，確保數據完整性)
    const domainStats = await executeQuery(`
      SELECT TOP 10
          SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
          COUNT(*) as total_sent,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failure_count,
          SUM(CASE WHEN status = 'capped' THEN 1 ELSE 0 END) as capped_count
      FROM EmailSends
      WHERE campaign_id = @campaignId AND CHARINDEX('@', email) > 0
      GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
      ORDER BY total_sent DESC
    `, { campaignId });

    // 失敗原因統計 (改為查詢 EmailSends 表)
    const rawFailures = await executeQuery(`
      SELECT
          SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
          '' as smtp_response,
          bounce_reason as error_message
      FROM EmailSends
      WHERE campaign_id = @campaignId AND (status = 'failed' OR status = 'capped') AND CHARINDEX('@', email) > 0
    `, { campaignId });

    // 內存聚合邏輯
    const failureMap = new Map();
    // 簡單的 Email 正則表達式
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    // 匹配尖括號內容 <...> (常用於 SMTP 響應中的 Email)
    const bracketRegex = /<[^>]*>/g;

    rawFailures.recordset.forEach(row => {
        const domain = row.domain || 'Unknown';
        let reason = row.smtp_response || row.error_message || 'Unknown Error';
        
        // 清理錯誤訊息: 移除 Email 和尖括號內容，以便將相似錯誤歸類
        reason = reason.replace(emailRegex, '[EMAIL]')
                       .replace(bracketRegex, '')
                       .replace(/\s+/g, ' ') // 壓縮多餘空白
                       .trim();
                       
        // 如果清理後為空，回復原狀或標記
        if (!reason) reason = 'Unknown Error';

        // 組合鍵值
        const key = `${domain}|${reason}`;
        
        if (!failureMap.has(key)) {
            failureMap.set(key, { domain, reason, count: 0 });
        }
        failureMap.get(key).count++;
    });

    // 轉換為陣列，排序並限制數量
    const aggregatedFailures = Array.from(failureMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 100); // 限制返回前 100 筆主要錯誤，避免前端過載

    res.json({
        success: true,
        data: {
            stats: basicStats.recordset[0],
            links: linkStats.recordset,
            domains: domainStats.recordset,
            failures: aggregatedFailures // 使用聚合後的數據
        }
    });
  })
);

// 獲取趨勢數據
router.get('/performance/trend',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { days, startDate, endDate, country, city } = req.query;
    let dateCondition = '';
    const params = {};

    if (startDate && endDate) {
        dateCondition = " >= @startDate AND date_col <= @endDate";
        params.startDate = startDate + ' 00:00:00';
        params.endDate = endDate + ' 23:59:59';
    } else {
        const d = parseInt(days) || 30;
        dateCondition = " >= DATEADD(day, -@days, GETDATE())";
        params.days = d;
    }

    const geoFilter = buildGeoFilter(country, city);
    const combinedParams = { ...params, ...geoFilter.params };

    const getQuery = (table, dateCol, subscriberCol) => `
      SELECT 
        CAST(${table}.${dateCol} AS DATE) as date,
        COUNT(*) as count
      FROM ${table}
      ${geoFilter.hasFilter ? `JOIN Subscribers s ON ${table}.${subscriberCol} = s.id` : ''}
      WHERE ${table}.${dateCol} ${dateCondition.replace('date_col', dateCol)}
      ${geoFilter.where}
      GROUP BY CAST(${table}.${dateCol} AS DATE)
      ORDER BY date
    `;

    const sentStats = await executeQuery(getQuery('EmailSends', 'sent_at', 'subscriber_id'), combinedParams);
    const openStats = await executeQuery(getQuery('EmailOpens', 'OpenedAt', 'SubscriberID'), combinedParams);
    const clickStats = await executeQuery(getQuery('EmailClicks', 'ClickedAt', 'SubscriberID'), combinedParams);
    const unsubscribeStats = await executeQuery(getQuery('EmailUnsubscribes', 'UnsubscribedAt', 'SubscriberID'), combinedParams);

    res.json({
      success: true,
      data: {
        sent: sentStats.recordset,
        opens: openStats.recordset,
        clicks: clickStats.recordset,
        unsubscribes: unsubscribeStats.recordset
      }
    });
  })
);

// 獲取設備統計
router.get('/campaigns/devices',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { days, startDate, endDate, country, city } = req.query;
    let whereClause = '';
    const params = {};

    if (startDate && endDate) {
        whereClause = "WHERE eo.OpenedAt >= @startDate AND eo.OpenedAt <= @endDate";
        params.startDate = startDate + ' 00:00:00';
        params.endDate = endDate + ' 23:59:59';
    } else {
        const d = parseInt(days) || 30;
        whereClause = "WHERE eo.OpenedAt >= DATEADD(day, -@days, GETDATE())";
        params.days = d;
    }

    const geoFilter = buildGeoFilter(country, city);
    const combinedParams = { ...params, ...geoFilter.params };

    const deviceStats = await executeQuery(`
      SELECT 
        ISNULL(eo.Device, 'Unknown') as device,
        COUNT(*) as openCount
      FROM EmailOpens eo
      ${geoFilter.hasFilter ? 'JOIN Subscribers s ON eo.SubscriberID = s.id' : ''}
      ${whereClause}
      ${geoFilter.where}
      GROUP BY eo.Device
      ORDER BY openCount DESC
    `, combinedParams);

    res.json({
      success: true,
      data: {
        devices: deviceStats.recordset
      }
    });
  })
);

// 獲取最佳發送時間統計
router.get('/optimal-send-time',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { days, startDate, endDate, country, city } = req.query;
    let whereClause = '';
    const params = {};

    if (startDate && endDate) {
        whereClause = "WHERE eo.OpenedAt >= @startDate AND eo.OpenedAt <= @endDate";
        params.startDate = startDate + ' 00:00:00';
        params.endDate = endDate + ' 23:59:59';
    } else {
        const d = parseInt(days) || 30;
        whereClause = "WHERE eo.OpenedAt >= DATEADD(day, -@days, GETDATE())";
        params.days = d;
    }

    const geoFilter = buildGeoFilter(country, city);
    const combinedParams = { ...params, ...geoFilter.params };

    const timeStats = await executeQuery(`
      SELECT 
        DATEPART(hour, eo.OpenedAt) as hour,
        COUNT(*) as openCount
      FROM EmailOpens eo
      ${geoFilter.hasFilter ? 'JOIN Subscribers s ON eo.SubscriberID = s.id' : ''}
      ${whereClause}
      ${geoFilter.where}
      GROUP BY DATEPART(hour, eo.OpenedAt)
      ORDER BY hour
    `, combinedParams);

    res.json({
      success: true,
      data: timeStats.recordset
    });
  })
);

// 獲取已發送郵件的網域統計 (真實發送數據)
router.get('/sent-domains',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const forceRefresh = req.query.refresh === 'true'; 
    const { country, city } = req.query;
    const geoFilter = buildGeoFilter(country, city);
    
    // Updated to use EmailSends and shorter cache for better real-time feedback
    const CACHE_KEY = 'sent_email_domain_stats_v2';
    const CACHE_DURATION_SECONDS = 300; // 5 minutes

    let cachedData = null;
    const useCache = !forceRefresh && !geoFilter.hasFilter;

    // 1. 嘗試讀取緩存
    if (useCache) {
        try {
            const cacheResult = await executeQuery(
                `SELECT cache_value FROM DashboardCache 
                 WHERE cache_key = @key AND expires_at > GETDATE()`,
                { key: CACHE_KEY }
            );
            
            if (cacheResult.recordset.length > 0) {
                cachedData = JSON.parse(cacheResult.recordset[0].cache_value);
            }
        } catch (e) {
            console.error('Error reading/parsing cache:', e);
        }
    }

    let allDomains = [];
    let totalSent = 0;
    let lastUpdated = new Date();

    if (cachedData) {
        allDomains = cachedData.domains;
        totalSent = cachedData.totalSent;
        lastUpdated = cachedData.generatedAt;
    } else {
        // 2. 緩存未命中 - 從 EmailSends 統計 (改用 EmailSends 確保數據正確)
        console.log('Calculating sent domain stats from DB (Cache Miss or Filter Applied)...');
        
        try {
            const combinedParams = { ...geoFilter.params };
            const domainStatsResult = await executeQuery(`
                SELECT
                    SUBSTRING(es.email, CHARINDEX('@', es.email) + 1, LEN(es.email)) as domain,
                    COUNT(*) as count
                FROM EmailSends es
                ${geoFilter.hasFilter ? 'JOIN Subscribers s ON es.subscriber_id = s.id' : ''}
                WHERE es.status = 'sent' AND CHARINDEX('@', es.email) > 0
                ${geoFilter.where}
                GROUP BY SUBSTRING(es.email, CHARINDEX('@', es.email) + 1, LEN(es.email))
                ORDER BY count DESC
            `, combinedParams);
            
            const totalResult = await executeQuery(`
                SELECT COUNT(*) as total FROM EmailSends es
                ${geoFilter.hasFilter ? 'JOIN Subscribers s ON es.subscriber_id = s.id' : ''}
                WHERE es.status = 'sent'
                ${geoFilter.where}
            `, combinedParams);
            totalSent = totalResult.recordset[0].total;
            
            allDomains = domainStatsResult.recordset.map(item => ({
                domain: item.domain,
                count: item.count
            }));
        } catch (error) {
            console.warn('Error querying EmailSends:', error.message);
            allDomains = [];
            totalSent = 0;
        }

        // 3. 寫入緩存 (僅在無過濾條件時)
        if (!geoFilter.hasFilter) {
            try {
                const cachePayload = JSON.stringify({
                    totalSent,
                    domains: allDomains,
                    generatedAt: new Date().toISOString()
                });

                await executeQuery(`
                    IF EXISTS (SELECT 1 FROM DashboardCache WHERE cache_key = @key)
                    BEGIN
                        UPDATE DashboardCache 
                        SET cache_value = @value, 
                            expires_at = DATEADD(SECOND, @duration, GETDATE()), 
                            created_at = GETDATE()
                        WHERE cache_key = @key
                    END
                    ELSE
                    BEGIN
                        INSERT INTO DashboardCache (cache_key, cache_value, expires_at) 
                        VALUES (@key, @value, DATEADD(SECOND, @duration, GETDATE()))
                    END
                `, {
                    key: CACHE_KEY,
                    value: cachePayload,
                    duration: CACHE_DURATION_SECONDS
                });
            } catch (e) {
                console.error('Error saving cache:', e);
            }
        }
    }

    // 4. 內存分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagedDomains = allDomains.slice(startIndex, endIndex);

    const data = pagedDomains.map(item => ({
        domain: item.domain,
        count: item.count,
        percentage: totalSent > 0 ? Math.round((item.count / totalSent) * 100) : 0
    }));

    res.json({
        success: true,
        data: data,
        pagination: {
            page,
            limit,
            total: allDomains.length,
            totalPages: Math.ceil(allDomains.length / limit),
            lastUpdated: lastUpdated
        }
    });
  })
);

// 獲取網域統計 (帶緩存機制)
router.get('/subscribers/geo',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const forceRefresh = req.query.refresh === 'true'; // 強制刷新參數
    
    // Updated cache key to invalidate old data with un-merged domains
    const CACHE_KEY = 'subscriber_domain_stats_v4';
    const CACHE_DURATION_HOURS = 4; // 緩存 4 小時
    
    console.log(`[Analytics] /subscribers/geo req: page=${page}, limit=${limit}, refresh=${forceRefresh}`);

    let cachedData = null;

    // 1. 嘗試讀取緩存
    if (!forceRefresh) {
        try {
            const cacheResult = await executeQuery(
                `SELECT cache_value FROM DashboardCache 
                 WHERE cache_key = @key AND expires_at > GETDATE()`,
                { key: CACHE_KEY }
            );
            
            if (cacheResult.recordset.length > 0) {
                cachedData = JSON.parse(cacheResult.recordset[0].cache_value);
                // console.log('Serving domain stats from cache');
            }
        } catch (e) {
            console.error('Error reading/parsing cache:', e);
            // 出錯時降級為即時查詢，不中斷服務
        }
    }

    let allDomains = [];
    let totalSubscribers = 0;
    let lastUpdated = new Date();

    if (cachedData) {
        allDomains = cachedData.domains;
        totalSubscribers = cachedData.totalSubscribers;
        lastUpdated = cachedData.generatedAt;
    } else {
        // 2. 緩存未命中 - 執行完整統計
        console.log('Calculating domain stats from DB (Cache Miss)...');
        
        // 獲取所有網域分組 (不分頁)
        const domainStatsResult = await executeQuery(`
            SELECT
                SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                COUNT(*) as count
            FROM Subscribers
            WHERE CHARINDEX('@', email) > 0
            GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
            ORDER BY count DESC
        `);
        
        // 獲取總訂閱數
        const totalResult = await executeQuery('SELECT COUNT(*) as total FROM Subscribers');
        totalSubscribers = totalResult.recordset[0].total;
        
        // 網域歸一化與聚合邏輯
        const domainMap = new Map();
        
        // 網域分組輔助函數
        const getGroupedDomain = (domain) => {
            if (!domain) return 'Unknown';
            domain = domain.toLowerCase().trim();
            const parts = domain.split('.');
            
            if (parts.length <= 2) return domain;

            const last = parts[parts.length - 1];
            const secondLast = parts[parts.length - 2];

            // 處理 .tw 網域
            if (last === 'tw') {
                const sld = ['com', 'net', 'org', 'edu', 'gov', 'idv'];
                if (sld.includes(secondLast)) {
                    // 例如 .com.tw, .net.tw => 保留前一級 (yahoo.com.tw)
                    if (parts.length >= 3) {
                         return parts.slice(-3).join('.');
                    }
                } else {
                     // 例如 .tw 直接結尾 => 保留前一級 (example.tw)
                     return parts.slice(-2).join('.');
                }
            } else {
                // 處理一般網域 (.com, .net, .org 等)
                // 例如 msa.hinet.net => hinet.net
                // 例如 mail.google.com => google.com
                
                // 特殊處理: 日本網域 .co.jp
                if (secondLast === 'co' && last === 'jp') return parts.slice(-3).join('.');
                
                return parts.slice(-2).join('.');
            }
            
            return domain;
        };
        
        domainStatsResult.recordset.forEach(item => {
            const rawDomain = item.domain || 'Unknown';
            const groupedDomain = getGroupedDomain(rawDomain);
            
            const currentCount = domainMap.get(groupedDomain) || 0;
            domainMap.set(groupedDomain, currentCount + item.count);
        });

        // 轉換回陣列並排序
        allDomains = Array.from(domainMap.entries())
            .map(([domain, count]) => ({ domain, count }))
            .sort((a, b) => b.count - a.count);

        // 3. 寫入緩存
        try {
            const cachePayload = JSON.stringify({
                totalSubscribers,
                domains: allDomains,
                generatedAt: new Date().toISOString()
            });

            // 使用 MERGE 語法 (如果 SQL Server 版本支持) 或 UPDATE/INSERT
            // 為確保兼容性，這裡使用 IF EXISTS
            await executeQuery(`
                IF EXISTS (SELECT 1 FROM DashboardCache WHERE cache_key = @key)
                BEGIN
                    UPDATE DashboardCache 
                    SET cache_value = @value, 
                        expires_at = DATEADD(HOUR, @duration, GETDATE()), 
                        created_at = GETDATE()
                    WHERE cache_key = @key
                END
                ELSE
                BEGIN
                    INSERT INTO DashboardCache (cache_key, cache_value, expires_at) 
                    VALUES (@key, @value, DATEADD(HOUR, @duration, GETDATE()))
                END
            `, {
                key: CACHE_KEY,
                value: cachePayload,
                duration: CACHE_DURATION_HOURS
            });
        } catch (e) {
            console.error('Error saving cache:', e);
            // 寫入緩存失敗不影響返回數據
        }
    }

    // 4. 內存分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagedDomains = allDomains.slice(startIndex, endIndex);

    console.log(`[Analytics] Paging: total=${allDomains.length}, start=${startIndex}, end=${endIndex}, result=${pagedDomains.length}`);

    const data = pagedDomains.map(item => ({
        domain: item.domain,
        count: item.count,
        percentage: totalSubscribers > 0 ? Math.round((item.count / totalSubscribers) * 100) : 0
    }));

    res.json({
        success: true,
        data: data,
        pagination: {
            page,
            limit,
            total: allDomains.length,
            totalPages: Math.ceil(allDomains.length / limit),
            lastUpdated: lastUpdated
        }
    });
  })
);

module.exports = router;
