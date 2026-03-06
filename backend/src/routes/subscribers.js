const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authenticateAdmin, authenticateUserOrAdmin } = require('../middleware/admin-auth');
const { validate, subscriberValidations, queryValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const bounceService = require('../services/bounce-service');
const unsubscribeService = require('../services/unsubscribe-service');

const router = express.Router();

// Debug log to confirm router is loaded
console.log('Subscriber routes loaded');

// 立即檢查退訂信箱
router.post('/unsubscribe/check',
    authenticateUserOrAdmin,
    asyncHandler(async (req, res) => {
        console.log('Received unsubscribe check request');
        const config = req.body;
        
        // Basic validation
        if (!config.user || !config.password) {
            throw new AppError('請提供帳號和密碼', 400);
        }
        
        // Default host if not provided
        if (!config.host) {
            config.host = 'mail.winton.com.tw';
        }

        try {
            console.log('Processing unsubscribe check with config:', { ...config, password: '***' });
            const result = await unsubscribeService.processUnsubscribes(config);
            res.json({
                success: true,
                message: `檢查完成，共處理 ${result.count} 封退訂信件`,
                data: result
            });
        } catch (error) {
            console.error('Unsubscribe check error:', error);
            throw new AppError('檢查退訂信箱失敗: ' + error.message, 500);
        }
    })
);

// 立即檢查退信 (僅管理員或經理)
router.post('/bounces/check',
    authenticateToken,
    asyncHandler(async (req, res) => {
        try {
            // Await the process and return results
            console.log('Starting manual bounce check...');
            
            // 1. Process Bounces
            const bounceStats = await bounceService.processBounces();
            console.log('Bounce check completed:', JSON.stringify(bounceStats));
            
            // 2. Process Unsubscribes
            console.log('Starting manual unsubscribe check...');
            
            // Check noedm@winton.com.tw (Main Unsubscribe Box)
            const unsubConfigNoEdm = {
                user: process.env.UNSUBSCRIBE_USER,
                password: process.env.UNSUBSCRIBE_PASSWORD,
                host: process.env.UNSUBSCRIBE_HOST,
                port: parseInt(process.env.UNSUBSCRIBE_PORT) || 993,
                tls: process.env.UNSUBSCRIBE_TLS === 'true',
                authTimeout: 10000,
                tlsOptions: { rejectUnauthorized: false }
            };
            
            // Check Unsubscribe@winton.com.tw (Secondary Unsubscribe Box)
            // Hardcoded for now as requested, ideally should be in env or config
            const unsubConfigUnsubscribe = {
                user: 'Unsubscribe@winton.com.tw',
                password: 'Wint0n2k00', // Assuming same password, or needs to be provided
                host: process.env.UNSUBSCRIBE_HOST, // Assuming same host
                port: parseInt(process.env.UNSUBSCRIBE_PORT) || 993,
                tls: process.env.UNSUBSCRIBE_TLS === 'true',
                authTimeout: 10000,
                tlsOptions: { rejectUnauthorized: false }
            };

            let unsubStats = { count: 0, details: [] };
            
            // Function to check a single account
            const checkAccount = async (config) => {
                try {
                    console.log(`Checking unsubscribe email: ${config.user}`);
                    // Force debug logging in processUnsubscribes if possible
                    const stats = await unsubscribeService.processUnsubscribes(config);
                    
                    if (stats.count === 0) {
                        console.warn(`[DEBUG] No unsubscribes found for ${config.user}. Stats:`, JSON.stringify(stats));
                    }
                    
                    console.log(`Check for ${config.user} completed:`, JSON.stringify(stats));
                    return { user: config.user, ...stats, success: true };
                } catch (err) {
                    console.error(`Check for ${config.user} failed:`, err.message);
                    return { user: config.user, error: err.message, success: false, count: 0 };
                }
            };

            try {
                // Run checks sequentially or in parallel
                const results = await Promise.all([
                    checkAccount(unsubConfigNoEdm),
                    checkAccount(unsubConfigUnsubscribe)
                ]);

                // Aggregate results
                unsubStats.count = results.reduce((acc, curr) => acc + (curr.count || 0), 0);
                unsubStats.details = results;
                
                // If all failed, throw error? Or just report partial success?
                // Reporting errors in details
                
            } catch (unsubError) {
                console.error('Manual unsubscribe check failed:', unsubError);
                unsubStats.error = unsubError.message;
            }

            res.json({
                success: true,
                message: '檢查完成',
                data: {
                    ...bounceStats,
                    unsubscribes: unsubStats
                }
            });
        } catch (error) {
            console.error('Manual check failed:', error);
            res.json({
                success: false,
                message: '檢查失敗: ' + error.message
            });
        }
    })
);

// 手動匯入取消訂閱清單
router.post('/unsubscribe/import',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { emails } = req.body;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            throw new AppError('請提供有效的 Email 列表', 400);
        }

        // Filter valid emails and normalize to objects
        const validItems = emails
            .map(e => {
                if (typeof e === 'string') return { email: e.trim(), reason: '手動匯入' };
                if (typeof e === 'object' && e.email) return { email: e.email.trim(), reason: e.reason || '手動匯入' };
                return null;
            })
            .filter(item => item && item.email && item.email.includes('@'));

        if (validItems.length === 0) {
            throw new AppError('沒有有效的 Email', 400);
        }
        
        let updatedCount = 0;
        let notFoundEmails = [];

        // Group by reason to batch updates efficiently
        const groups = {};
        validItems.forEach(item => {
            if (!groups[item.reason]) groups[item.reason] = [];
            groups[item.reason].push(item.email);
        });

        // Process each reason group
        for (const reason of Object.keys(groups)) {
            const groupEmails = groups[reason];
            
            // Batch processing
            const batchSize = 200;
            for (let i = 0; i < groupEmails.length; i += batchSize) {
                const batch = groupEmails.slice(i, i + batchSize);
                const params = { reason };
                const paramNames = batch.map((email, index) => {
                    const paramName = `email${index}`;
                    params[paramName] = email;
                    return `@${paramName}`;
                });

                if (paramNames.length === 0) continue;

                const query = `
                    UPDATE Subscribers
                    SET status = 'unsubscribed', 
                        unsubscribe_reason = @reason, 
                        unsubscribed_at = GETDATE(),
                        updated_at = GETDATE()
                    OUTPUT inserted.email
                    WHERE email IN (${paramNames.join(',')})
                `;

                const result = await executeQuery(query, params);
                updatedCount += result.rowsAffected[0];
                
                // Calculate not found for this batch
                const foundEmails = result.recordset.map(r => r.email.toLowerCase());
                batch.forEach(email => {
                    if (!foundEmails.includes(email.toLowerCase())) {
                        // Check if we haven't added this email to notFound yet (though batch ensures uniqueness within group, globally need check if same email in multiple groups? Frontend dedups, so ok)
                        notFoundEmails.push(email);
                    }
                });
            }
        }

        res.json({
            success: true,
            message: `成功標記 ${updatedCount} 筆取消訂閱`,
            data: {
                updatedCount,
                notFoundCount: notFoundEmails.length,
                notFoundEmails
            }
        });
    })
);

// 手動匯入無效信箱
router.post('/bounces/import',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { emails, campaignId } = req.body;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            throw new AppError('請提供有效的 Email 列表', 400);
        }

        // Filter valid emails and normalize to objects
        const validItems = emails
            .map(e => {
                if (typeof e === 'string') return { email: e.trim(), reason: '手動匯入無效信箱' };
                if (typeof e === 'object' && e && e.email && typeof e.email === 'string') {
                    return { email: e.email.trim(), reason: e.reason || '手動匯入無效信箱' };
                }
                return null;
            })
            .filter(item => item && item.email && item.email.includes('@'));

        if (validItems.length === 0) {
            throw new AppError('沒有有效的 Email', 400);
        }
        
        let updatedCount = 0;
        let notFoundEmails = [];

        // Group by reason
        const groups = {};
        validItems.forEach(item => {
            if (!groups[item.reason]) groups[item.reason] = [];
            groups[item.reason].push(item.email);
        });

        // Process each reason group
        for (const reason of Object.keys(groups)) {
            const groupEmails = groups[reason];
            
            // Batch processing
            const batchSize = 200;
            for (let i = 0; i < groupEmails.length; i += batchSize) {
                const batch = groupEmails.slice(i, i + batchSize);
                const params = { reason };
                const paramNames = batch.map((email, index) => {
                    const paramName = `email${index}`;
                    params[paramName] = email;
                    return `@${paramName}`;
                });

                if (paramNames.length === 0) continue;

                const query = `
                    UPDATE Subscribers
                    SET status = 'invalid', 
                        bounce_reason = @reason, 
                        updated_at = GETDATE()
                    OUTPUT inserted.email, inserted.id
                    WHERE email IN (${paramNames.join(',')})
                `;

                const result = await executeQuery(query, params);
                updatedCount += result.rowsAffected[0];
                
                // Process campaign stats updates for the invalidated subscribers
                // This ensures analytics are corrected when importing bounces from relay logs
                const updatedSubscribers = result.recordset;
                for (const sub of updatedSubscribers) {
                    const email = sub.email;
                    const subscriberId = sub.id;
                    try {
                        let emailLogQuery = '';
                        const logParams = { email, subscriberId };

                        if (campaignId) {
                            // If campaignId is provided, find the specific log for that campaign
                            emailLogQuery = `
                                SELECT TOP 1 id, campaign_id 
                                FROM EmailSends 
                                WHERE subscriber_id = @subscriberId AND campaign_id = @campaignId AND status = 'sent'
                            `;
                            logParams.campaignId = campaignId;
                        } else {
                            // Otherwise, find the most recent 'sent' email log for this subscriber
                            emailLogQuery = `
                                SELECT TOP 1 id, campaign_id 
                                FROM EmailSends 
                                WHERE subscriber_id = @subscriberId AND status = 'sent'
                                ORDER BY sent_at DESC
                            `;
                        }

                        const emailLogResult = await executeQuery(emailLogQuery, logParams);

                        if (emailLogResult.recordset.length > 0) {
                            const { id: emailLogId, campaign_id: targetCampaignId } = emailLogResult.recordset[0];

                            // Update EmailSends status to 'failed'
                            const updateEmailLogQuery = `
                                UPDATE EmailSends
                                SET status = 'failed',
                                    bounced_at = GETDATE(),
                                    bounce_reason = @reason
                                WHERE id = @id
                            `;
                            await executeQuery(updateEmailLogQuery, { id: emailLogId, reason: reason });

                            // Update Campaign bounce count
                            if (targetCampaignId) {
                                const updateCampaignQuery = `
                                    UPDATE Campaigns
                                    SET bounced_count = ISNULL(bounced_count, 0) + 1
                                    WHERE id = @id
                                `;
                                await executeQuery(updateCampaignQuery, { id: targetCampaignId });
                            }
                        }
                    } catch (statsError) {
                        console.error(`Failed to update stats for ${email}:`, statsError);
                        // Continue with next email, don't fail the whole request
                    }
                }
                
                // Calculate not found
                const foundEmails = result.recordset.map(r => r.email.toLowerCase());
                batch.forEach(email => {
                    if (!foundEmails.includes(email.toLowerCase())) {
                        notFoundEmails.push(email);
                    }
                });
            }
        }

        res.json({
            success: true,
            message: `成功標記 ${updatedCount} 筆無效信箱`,
            data: {
                updatedCount,
                notFoundCount: notFoundEmails.length,
                notFoundEmails
            }
        });
    })
);

// 配置文件上傳
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支援的檔案格式'), false);
    }
  }
});

// 所有路由都需要認證 (允許管理員和一般用戶)
router.use(authenticateUserOrAdmin);

// 匯出訂閱者 (放在列表路由之前)
router.get('/export',
  validate(queryValidations.subscriberFilter, 'query'),
  asyncHandler(async (req, res) => {
    const {
      sortBy = 'created_at',
      sortOrder = 'desc',
      status,
      search,
      category_ids,
      startDate,
      endDate,
      gender,
      city,
      country,
      birthdayMonth,
      tags,
      categoryGroup,
      format = 'csv'
    } = req.query;

    // Validate sort parameters
    const validSortFields = ['id', 'email', 'first_name', 'last_name', 'company', 'status', 'created_at', 'updated_at', 'subscribed_at'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Base query parts
    let fromClause = 'FROM Subscribers s';
    let whereClause = 'WHERE 1=1';
    const params = {};

    // --- Build WHERE clause (Same as list) ---
    let effectiveStatus = status;
    if (status === 'active') {
      effectiveStatus = 'subscribed';
    }

    if (effectiveStatus && effectiveStatus !== 'all') {
      whereClause += ' AND s.status = @status';
      params.status = effectiveStatus;
    }

    if (search && search.trim() !== '') {
      whereClause += ' AND (s.email LIKE @search OR s.first_name LIKE @search OR s.last_name LIKE @search OR s.company LIKE @search OR s.phone LIKE @search)';
      params.search = `%${search}%`;
    }

    if (startDate) {
        whereClause += ' AND s.subscribed_at >= @startDate';
        params.startDate = startDate;
    }

    if (endDate) {
        whereClause += ' AND s.subscribed_at <= @endDate';
        params.endDate = endDate;
    }

    if (gender && gender !== 'all') {
        whereClause += ' AND s.gender = @gender';
        params.gender = gender;
    }

    if (city && city.trim() !== '') {
        whereClause += ' AND s.city LIKE @city';
        params.city = `%${city}%`;
    }

    if (country && country.trim() !== '') {
        whereClause += ' AND s.country LIKE @country';
        params.country = `%${country}%`;
    }

    if (birthdayMonth && birthdayMonth !== 'all') {
        whereClause += ' AND MONTH(s.birthday) = @birthdayMonth';
        params.birthdayMonth = parseInt(birthdayMonth);
    }

    if (tags && tags.trim() !== '') {
        // Optimization: Find matching category IDs first to avoid expensive correlated subquery with LIKE
        const categorySearchQuery = `SELECT id FROM Categories WHERE name LIKE @tagSearch`;
        const categorySearchResult = await executeQuery(categorySearchQuery, { tagSearch: `%${tags}%` });
        const matchingCategoryIds = categorySearchResult.recordset.map(c => c.id);

        let categoryFilterClause = '';
        if (matchingCategoryIds.length > 0) {
            categoryFilterClause = `OR EXISTS (SELECT 1 FROM SubscriberCategories sc WHERE sc.subscriber_id = s.id AND sc.category_id IN (${matchingCategoryIds.join(',')}))`;
        }

        whereClause += ` AND (s.tags LIKE @tags ${categoryFilterClause})`;
        params.tags = `%${tags}%`;
    }

    if (categoryGroup && categoryGroup !== 'all') {
        whereClause += ' AND EXISTS (SELECT 1 FROM SubscriberCategories sc JOIN Categories c ON sc.category_id = c.id WHERE sc.subscriber_id = s.id AND c.hierarchy_type = @categoryGroup)';
        params.categoryGroup = categoryGroup;
    }

    if (category_ids) {
      const categoryIds = category_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        whereClause += ` AND EXISTS (SELECT 1 FROM SubscriberCategories sc WHERE sc.subscriber_id = s.id AND sc.category_id IN (${categoryIds.join(',')}))`;
      }
    }

    // --- Get All Subscribers (No Pagination) ---
    const mainQuery = `
      SELECT s.id, s.email, s.first_name, s.last_name, s.company, s.phone, s.status, 
             s.created_at, s.birthday, s.city, s.country, s.gender, s.tags,
             s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.cust_id, s.original_id, s.bounce_reason
      ${fromClause}
      ${whereClause}
      ORDER BY s.${safeSortBy} ${safeSortOrder}
    `;

    const result = await executeQuery(mainQuery, params);
    const subscribers = result.recordset;

    // --- Generate Output ---
    if (format === 'csv' || format === 'xlsx') {
        const data = subscribers.map(s => ({
            ID: s.id,
            Email: s.email,
            'First Name': s.first_name,
            'Last Name': s.last_name,
            Company: s.company,
            Phone: s.phone,
            Status: s.status,
            'Created At': s.created_at ? s.created_at.toISOString().split('T')[0] : '',
            Tags: s.tags,
            'Customer ID': s.cust_id,
            'Original ID': s.original_id,
            'Bounce Reason': s.bounce_reason
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        
        if (format === 'csv') {
            const csvContent = XLSX.utils.sheet_to_csv(worksheet);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=subscribers_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csvContent);
        } else {
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Subscribers');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=subscribers_${new Date().toISOString().split('T')[0]}.xlsx`);
            res.send(buffer);
        }
    } else {
        res.json({ success: true, data: subscribers });
    }
  })
);

// 獲取訂閱者列表
// 取得所有符合條件的訂閱者 ID (用於全選功能)
router.get('/ids',
  validate(queryValidations.subscriberFilter, 'query'),
  asyncHandler(async (req, res) => {
    const {
      status,
      search,
      category_ids,
      startDate,
      endDate,
      gender,
      city,
      country,
      birthdayMonth,
      tags,
      categoryGroup
    } = req.query;

    // Base query parts
    let fromClause = 'FROM Subscribers s';
    let whereClause = 'WHERE 1=1';
    const params = {};

    // --- Build WHERE clause (Same as GET /) ---
    let effectiveStatus = status;
    if (status === 'active') {
      effectiveStatus = 'subscribed';
    }

    if (effectiveStatus && effectiveStatus !== 'all') {
      whereClause += ' AND s.status = @status';
      params.status = effectiveStatus;
    } else {
      whereClause += " AND s.status != 'deleted'";
    }

    if (search && search.trim() !== '') {
      whereClause += ' AND (s.email LIKE @search OR s.first_name LIKE @search OR s.last_name LIKE @search OR s.company LIKE @search OR s.phone LIKE @search)';
      params.search = `%${search}%`;
    }

    if (startDate) {
        whereClause += ' AND s.subscribed_at >= @startDate';
        params.startDate = startDate;
    }

    if (endDate) {
        whereClause += ' AND s.subscribed_at <= @endDate';
        params.endDate = endDate;
    }

    if (gender && gender !== 'all') {
        whereClause += ' AND s.gender = @gender';
        params.gender = gender;
    }

    if (city && city.trim() !== '') {
        whereClause += ' AND s.city LIKE @city';
        params.city = `%${city}%`;
    }

    if (country && country.trim() !== '') {
        whereClause += ' AND s.country LIKE @country';
        params.country = `%${country}%`;
    }

    if (birthdayMonth && birthdayMonth !== 'all') {
        whereClause += ' AND MONTH(s.birthday) = @birthdayMonth';
        params.birthdayMonth = parseInt(birthdayMonth);
    }

    if (tags && tags.trim() !== '') {
        whereClause += ` AND (
            s.tags LIKE @tags 
            OR EXISTS (
                SELECT 1 
                FROM SubscriberCategories sc 
                JOIN Categories c ON sc.category_id = c.id 
                WHERE sc.subscriber_id = s.id 
                AND c.name LIKE @tags
            )
        )`;
        params.tags = `%${tags}%`;
    }

    if (categoryGroup && categoryGroup !== 'all') {
        whereClause += ' AND EXISTS (SELECT 1 FROM SubscriberCategories sc JOIN Categories c ON sc.category_id = c.id WHERE sc.subscriber_id = s.id AND c.hierarchy_type = @categoryGroup)';
        params.categoryGroup = categoryGroup;
    }

    if (category_ids) {
      const categoryIds = category_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        whereClause += ` AND EXISTS (SELECT 1 FROM SubscriberCategories sc WHERE sc.subscriber_id = s.id AND sc.category_id IN (${categoryIds.join(',')}))`;
      }
    }

    const query = `SELECT s.id ${fromClause} ${whereClause}`;
    const result = await executeQuery(query, params);
    
    res.json({
      success: true,
      data: result.recordset.map(r => r.id)
    });
  })
);

router.get('/',
  validate(queryValidations.subscriberFilter, 'query'),
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc',
      status,
      search,
      category_ids,
      startDate,
      endDate,
      gender,
      city,
      country,
      birthdayMonth,
      tags,
      categoryGroup
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sort parameters
    const validSortFields = ['id', 'email', 'first_name', 'last_name', 'company', 'status', 'created_at', 'updated_at', 'subscribed_at'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Base query parts
    let fromClause = 'FROM Subscribers s';
    let whereClause = 'WHERE 1=1';
    const params = {};

    // --- Build WHERE clause ---
    console.log('DEBUG_FILTER:', { country, city });
    let effectiveStatus = status;
    if (status === 'active') {
      effectiveStatus = 'subscribed';
    }

    if (effectiveStatus && effectiveStatus !== 'all') {
      whereClause += ' AND s.status = @status';
      params.status = effectiveStatus;
    } else {
      // 預設不顯示已刪除的用戶 (除非明確指定 status='deleted'，但在 all 模式下排除)
      whereClause += " AND s.status != 'deleted'";
    }
    // Removed default "subscribed" filter to allow fetching all subscribers when status is empty or 'all'

    if (search && search.trim() !== '') {
      whereClause += ' AND (s.email LIKE @search OR s.first_name LIKE @search OR s.last_name LIKE @search OR s.company LIKE @search OR s.phone LIKE @search)';
      params.search = `%${search}%`;
    }

    if (startDate) {
        whereClause += ' AND s.subscribed_at >= @startDate';
        params.startDate = startDate;
    }

    if (endDate) {
        whereClause += ' AND s.subscribed_at <= @endDate';
        params.endDate = endDate;
    }

    if (gender && gender !== 'all') {
        whereClause += ' AND s.gender = @gender';
        params.gender = gender;
    }

    if (city && city.trim() !== '') {
        whereClause += ' AND s.city LIKE @city';
        params.city = `%${city}%`;
    }

    if (country && country.trim() !== '') {
        whereClause += ' AND s.country LIKE @country';
        params.country = `%${country}%`;
    }

    if (birthdayMonth && birthdayMonth !== 'all') {
        whereClause += ' AND MONTH(s.birthday) = @birthdayMonth';
        params.birthdayMonth = parseInt(birthdayMonth);
    }

    if (tags && tags.trim() !== '') {
        // Search in both tags column AND associated category names
        whereClause += ` AND (
            s.tags LIKE @tags 
            OR EXISTS (
                SELECT 1 
                FROM SubscriberCategories sc 
                JOIN Categories c ON sc.category_id = c.id 
                WHERE sc.subscriber_id = s.id 
                AND c.name LIKE @tags
            )
        )`;
        params.tags = `%${tags}%`;
    }

    if (categoryGroup && categoryGroup !== 'all') {
        whereClause += ' AND EXISTS (SELECT 1 FROM SubscriberCategories sc JOIN Categories c ON sc.category_id = c.id WHERE sc.subscriber_id = s.id AND c.hierarchy_type = @categoryGroup)';
        params.categoryGroup = categoryGroup;
    }

    // --- Handle Category Filter ---
    if (category_ids) {
      const categoryIds = category_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        // Use EXISTS for better performance and to avoid duplicates
        whereClause += ` AND EXISTS (SELECT 1 FROM SubscriberCategories sc WHERE sc.subscriber_id = s.id AND sc.category_id IN (${categoryIds.join(',')}))`;
      }
    }

    // --- Get Total Count ---
    const countQuery = `SELECT COUNT(*) as total ${fromClause} ${whereClause}`;
      
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;
    console.log('Subscribers API - Calculated total:', total);

    // --- Get Paginated Subscribers ---
    const mainQuery = `
      SELECT s.id, s.email, s.first_name, s.last_name, s.company, s.status, s.created_at, s.updated_at,
             s.birthday, s.country, s.city, s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.cust_id, s.original_id, s.bounce_reason, s.tags,
             (SELECT TOP 1 c.name 
              FROM EmailSends es 
              JOIN Campaigns c ON es.campaign_id = c.id 
              WHERE es.subscriber_id = s.id 
              ORDER BY es.sent_at DESC) as last_bounced_campaign
      ${fromClause}
      ${whereClause}
      ORDER BY s.${safeSortBy} ${safeSortOrder}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(mainQuery, {
      ...params,
      offset,
      limit: parseInt(limit)
    });
    const subscribers = result.recordset;

    // --- Get Categories for the fetched subscribers ---
    if (subscribers.length > 0) {
      const subscriberIds = subscribers.map(s => s.id);
      const categoriesQuery = `
        SELECT sc.subscriber_id, c.id, c.name, c.category_type
        FROM SubscriberCategories sc
        JOIN Categories c ON sc.category_id = c.id
        WHERE sc.subscriber_id IN (${subscriberIds.join(',')})
      `;
      const categoriesResult = await executeQuery(categoriesQuery);
      const categoriesBySubscriber = categoriesResult.recordset.reduce((acc, cat) => {
        if (!acc[cat.subscriber_id]) {
          acc[cat.subscriber_id] = [];
        }
        acc[cat.subscriber_id].push(cat);
        return acc;
      }, {});

      subscribers.forEach(s => {
        s.categories = categoriesBySubscriber[s.id] || [];
      });
    }

    // --- Send Response ---
    res.json({
      success: true,
      data: {
        subscribers: subscribers.map(s => ({
          id: s.id,
          email: s.email,
          firstName: s.first_name,
          lastName: s.last_name,
          companyName: s.company,
          country: s.country,
          city: s.city,
          status: s.status,
          categories: s.categories,
          created_at: s.created_at,
          updated_at: s.updated_at,
          birthday: s.birthday,
          f1: s.f1,
          f2: s.f2,
          f3: s.f3,
          f4: s.f4,
          f5: s.f5,
          f6: s.f6,
          custId: s.cust_id,
          originalId: s.original_id,
          bounceReason: s.bounce_reason, // Include bounce_reason in response
          tags: s.tags,
          lastBouncedCampaign: s.last_bounced_campaign
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        },
        debug: {
            calculatedTotal: total
        }
      }
    });
  })
);

// 獲取所有分類 (支持層次結構)
router.get('/categories',
  asyncHandler(async (req, res) => {
    const { hierarchyType, parentId, includeChildren = 'true' } = req.query;
    
    let categoriesQuery;
    let queryParams = {};

    if (includeChildren === 'true') {
      // 獲取層次結構的分類
      categoriesQuery = `
        SELECT 
          c.id,
          c.category_type,
          c.name,
          c.parent_id,
          c.level,
          c.path,
          c.sort_order,
          c.is_leaf,
          c.hierarchy_type,
          c.is_active,
          (SELECT COUNT(*) FROM SubscriberCategories sc WHERE sc.category_id = c.id) as subscriber_count,
          p.name as parent_name,
          (SELECT COUNT(*) FROM Categories child WHERE child.parent_id = c.id AND child.is_active = 1) as child_count
        FROM Categories c
        LEFT JOIN Categories p ON c.parent_id = p.id
        WHERE c.is_active = 1
          ${hierarchyType ? 'AND c.hierarchy_type = @hierarchyType' : ''}
          ${parentId ? 'AND c.parent_id = @parentId' : ''}
        ORDER BY c.hierarchy_type, c.level, c.sort_order, c.name
      `;
      
      if (hierarchyType) queryParams.hierarchyType = hierarchyType;
      if (parentId) queryParams.parentId = parentId;
    } else {
      // 原有的平面結構查詢
      categoriesQuery = `
        SELECT 
          c.id,
          c.category_type,
          c.name,
          (SELECT COUNT(*) FROM SubscriberCategories sc WHERE sc.category_id = c.id) as subscriber_count
        FROM Categories c
        WHERE c.is_active = 1
        ORDER BY c.category_type, c.name
      `;
    }

    const result = await executeQuery(categoriesQuery, queryParams);

    res.json({
      success: true,
      data: {
        categories: result.recordset.map(cat => ({
          id: cat.id,
          categoryType: cat.category_type,
          name: cat.name,
          parentId: cat.parent_id || null,
          level: cat.level || 0,
          path: cat.path || '',
          sortOrder: cat.sort_order || 0,
          isLeaf: cat.is_leaf || false,
          hierarchyType: cat.hierarchy_type || cat.category_type,
          isActive: cat.is_active !== undefined ? cat.is_active : true,
          parentName: cat.parent_name || null,
          childCount: cat.child_count || 0,
          subscriberCount: cat.subscriber_count
        }))
      }
    });
  })
);

router.get('/unsubscribed-report',
  authorizeRoles('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;

    // Common CTE for data source
    const baseQuery = `
      WITH UnsubscribedData AS (
        SELECT 
          eu.UnsubscribedAt,
          eu.IPAddress,
          s.email,
          s.first_name,
          s.last_name,
          c.name as campaign_name,
          s.status
        FROM EmailUnsubscribes eu
        LEFT JOIN Subscribers s ON eu.SubscriberID = s.id
        LEFT JOIN Campaigns c ON eu.CampaignID = c.id
        
        UNION ALL
        
        SELECT 
          s.unsubscribed_at as UnsubscribedAt,
          'Manual/Admin' as IPAddress,
          s.email,
          s.first_name,
          s.last_name,
          NULL as campaign_name,
          s.status
        FROM Subscribers s
        WHERE s.status IN ('deleted', 'unsubscribed')
        AND s.id NOT IN (SELECT SubscriberID FROM EmailUnsubscribes)
      )
    `;

    const countQuery = `
      ${baseQuery}
      SELECT COUNT(*) as total
      FROM UnsubscribedData
      WHERE (@search IS NULL OR email LIKE @search OR first_name LIKE @search OR last_name LIKE @search)
    `;

    const dataQuery = `
      ${baseQuery}
      SELECT *
      FROM UnsubscribedData
      WHERE (@search IS NULL OR email LIKE @search OR first_name LIKE @search OR last_name LIKE @search)
      ORDER BY UnsubscribedAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const [countResult, dataResult] = await Promise.all([
      executeQuery(countQuery, { search }),
      executeQuery(dataQuery, { search, offset, limit })
    ]);

    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  })
);

// 獲取單個訂閱者詳情
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const query = `
      SELECT 
        id, email, first_name, last_name, company, phone, gender, birth_date,
        country, city, tags, custom_fields, status, subscribed_at,
        unsubscribed_at, last_activity_at, created_at, updated_at,
        birthday, f1, f2, f3, f4, f5, f6, cust_id, original_id
      FROM Subscribers
      WHERE id = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    const subscriber = result.recordset[0];

    res.json({
      success: true,
      data: {
        subscriber: {
          id: subscriber.id,
          email: subscriber.email,
          firstName: subscriber.first_name,
          lastName: subscriber.last_name,
          companyName: subscriber.company,
          phone: subscriber.phone,
          gender: subscriber.gender,
          birthDate: subscriber.birth_date,
          country: subscriber.country,
          city: subscriber.city,
          tags: subscriber.tags ? subscriber.tags.split(',') : [],
          customFields: subscriber.custom_fields ? JSON.parse(subscriber.custom_fields) : {},
          status: subscriber.status,
          subscribedAt: subscriber.subscribed_at,
          unsubscribedAt: subscriber.unsubscribed_at,
          lastActivityAt: subscriber.last_activity_at,
          createdAt: subscriber.created_at,
          updatedAt: subscriber.updated_at,
          birthday: subscriber.birthday,
          f1: subscriber.f1,
          f2: subscriber.f2,
          f3: subscriber.f3,
          f4: subscriber.f4,
          f5: subscriber.f5,
          f6: subscriber.f6,
          custId: subscriber.cust_id,
          originalId: subscriber.original_id
        }
      }
    });
  })
);

// 創建新訂閱者
router.post('/',
  validate(subscriberValidations.create),
  asyncHandler(async (req, res) => {
    const {
      email,
      firstName,
      lastName,
      companyName,
      phone,
      gender,
      birthDate,
      country,
      city,
      tags,
      customFields
    } = req.body;

    // 檢查郵箱是否已存在 (排除已刪除的訂閱者)
    const existingSubscriber = await executeQuery(
      "SELECT id FROM Subscribers WHERE email = @email AND status != 'deleted'",
      { email }
    );

    if (existingSubscriber.recordset.length > 0) {
      throw new AppError('此郵箱已被註冊', 400);
    }

    // 創建新訂閱者
    const insertQuery = `
      INSERT INTO Subscribers (
        email, first_name, last_name, company, phone, gender, birth_date,
        country, city, tags, custom_fields, status, subscribed_at
      )
      OUTPUT INSERTED.id, INSERTED.email, INSERTED.first_name, INSERTED.last_name,
             INSERTED.company, INSERTED.status, INSERTED.subscribed_at, INSERTED.created_at
      VALUES (
        @email, @firstName, @lastName, @companyName, @phone, @gender, @birthDate,
        @country, @city, @tags, @customFields, 'active', GETDATE()
      )
    `;

    const result = await executeQuery(insertQuery, {
      email,
      firstName,
      lastName,
      companyName,
      phone,
      gender,
      birthDate,
      country,
      city,
      tags: tags ? tags.join(',') : null,
      customFields: customFields ? JSON.stringify(customFields) : null
    });

    const newSubscriber = result.recordset[0];

    res.status(201).json({
      success: true,
      message: '訂閱者創建成功',
      data: {
        subscriber: {
          id: newSubscriber.id,
          email: newSubscriber.email,
          firstName: newSubscriber.first_name,
          lastName: newSubscriber.last_name,
          companyName: newSubscriber.company,
          status: newSubscriber.status,
          subscribedAt: newSubscriber.subscribed_at,
          createdAt: newSubscriber.created_at
        }
      }
    });
  })
);

// 獲取訂閱者的分類
router.get('/:id/categories',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const query = `
      SELECT c.id, c.name, c.category_type
      FROM SubscriberCategories sc
      JOIN Categories c ON sc.category_id = c.id
      WHERE sc.subscriber_id = @id
    `;

    const result = await executeQuery(query, { id });

    res.json({
      success: true,
      data: {
        categories: result.recordset
      }
    });
  })
);

// 更新訂閱者的分類
router.put('/:id/categories',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds)) {
      throw new AppError('categoryIds 必須是陣列', 400);
    }

    // 檢查訂閱者是否存在
    const checkQuery = 'SELECT id FROM Subscribers WHERE id = @id';
    const checkResult = await executeQuery(checkQuery, { id });
    if (checkResult.recordset.length === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    // 刪除舊的分類關聯
    await executeQuery('DELETE FROM SubscriberCategories WHERE subscriber_id = @id', { id });

    // 如果有新的分類，則新增
    if (categoryIds.length > 0) {
      // 過濾無效的 ID
      const validIds = categoryIds.map(cid => parseInt(cid)).filter(cid => !isNaN(cid));
      
      if (validIds.length > 0) {
        // 建構批量插入語句
        const values = validIds.map(cid => `(${id}, ${cid})`).join(',');
        const insertQuery = `INSERT INTO SubscriberCategories (subscriber_id, category_id) VALUES ${values}`;
        await executeQuery(insertQuery);
      }
    }

    res.json({
      success: true,
      message: '分類更新成功'
    });
  })
);

// 更新訂閱者
router.put('/:id',
  validate(subscriberValidations.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      email,
      status,
      firstName,
      lastName,
      companyName,
      phone,
      gender,
      birthDate,
      country,
      city,
      tags,
      customFields
    } = req.body;

    // 檢查訂閱者是否存在
    const subscriberCheck = await executeQuery(
      'SELECT id, status FROM Subscribers WHERE id = @id',
      { id }
    );

    if (subscriberCheck.recordset.length === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    // 建構更新欄位
    const updateFields = [];
    const params = { id };

    if (email !== undefined) {
      // 檢查 Email 是否重複 (排除已刪除的訂閱者)
      const emailCheck = await executeQuery(
        "SELECT id FROM Subscribers WHERE email = @email AND id != @id AND status != 'deleted'",
        { email, id }
      );
      
      if (emailCheck.recordset.length > 0) {
        throw new AppError('此電子郵件已被其他訂閱者使用', 400);
      }
      
      updateFields.push('email = @email');
      params.email = email;
    }

    if (status !== undefined) {
      let dbStatus = status;
      if (status === 'active' || status === 'Active') dbStatus = 'subscribed';
      if (status === 'inactive' || status === 'Inactive') dbStatus = 'unsubscribed';
      
      updateFields.push('status = @status');
      params.status = dbStatus;
    }


    if (firstName !== undefined) {
      updateFields.push('first_name = @firstName');
      params.firstName = firstName;
    }

    if (lastName !== undefined) {
      updateFields.push('last_name = @lastName');
      params.lastName = lastName;
    }

    if (companyName !== undefined) {
      updateFields.push('company = @companyName');
      params.companyName = companyName;
    }

    if (phone !== undefined) {
      updateFields.push('phone = @phone');
      params.phone = phone;
    }

    if (gender !== undefined) {
      updateFields.push('gender = @gender');
      params.gender = gender;
    }

    if (birthDate !== undefined) {
      updateFields.push('birth_date = @birthDate');
      params.birthDate = birthDate;
    }

    if (country !== undefined) {
      updateFields.push('country = @country');
      params.country = country;
    }

    if (city !== undefined) {
      updateFields.push('city = @city');
      params.city = city;
    }

    if (tags !== undefined) {
      updateFields.push('tags = @tags');
      params.tags = tags ? tags.join(',') : null;
    }

    if (customFields !== undefined) {
      updateFields.push('custom_fields = @customFields');
      params.customFields = customFields ? JSON.stringify(customFields) : null;
    }

    if (updateFields.length === 0) {
      throw new AppError('沒有提供要更新的欄位', 400);
    }

    updateFields.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE Subscribers 
      SET ${updateFields.join(', ')}
      WHERE id = @id
    `;

    await executeQuery(updateQuery, params);

    res.json({
      success: true,
      message: '訂閱者更新成功'
    });
  })
);

// 刪除訂閱者 (軟刪除)
router.delete('/:id',
  authorizeRoles('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 改為軟刪除，將狀態設為 deleted
    const updateQuery = `
      UPDATE Subscribers 
      SET status = 'deleted', updated_at = GETDATE()
      WHERE id = @id
    `;
    const result = await executeQuery(updateQuery, { id });

    if (result.rowsAffected[0] === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    res.json({
      success: true,
      message: '訂閱者已標記為刪除'
    });
  })
);

// 批量刪除訂閱者 (軟刪除)
router.post('/bulk-delete',
  authorizeRoles('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError('請提供要刪除的訂閱者 ID 列表', 400);
    }

    // Convert IDs to integers and filter out invalids
    const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (validIds.length === 0) {
       throw new AppError('無效的訂閱者 ID', 400);
    }

    // 改為軟刪除
    const updateQuery = `
      UPDATE Subscribers 
      SET status = 'deleted', updated_at = GETDATE()
      WHERE id IN (${validIds.join(',')})
    `;
    const result = await executeQuery(updateQuery);

    res.json({
      success: true,
      message: `成功將 ${result.rowsAffected[0]} 位訂閱者標記為刪除`
    });
  })
);

// 取消訂閱
router.post('/:id/unsubscribe',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 1. Update Subscriber status
    const updateQuery = `
      UPDATE Subscribers 
      SET status = 'deleted', unsubscribed_at = GETDATE(), updated_at = GETDATE()
      WHERE id = @id
    `;

    const result = await executeQuery(updateQuery, { id });

    if (result.rowsAffected[0] === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    res.json({
      success: true,
      message: '取消訂閱成功'
    });
  })
);

// 重新訂閱
router.post('/:id/resubscribe',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const updateQuery = `
      UPDATE Subscribers 
      SET status = 'active', unsubscribed_at = NULL, updated_at = GETDATE()
      WHERE id = @id
    `;

    const result = await executeQuery(updateQuery, { id });

    if (result.rowsAffected[0] === 0) {
      throw new AppError('訂閱者不存在', 404);
    }

    res.json({
      success: true,
      message: '重新訂閱成功'
    });
  })
);

// 文件匯入訂閱者
router.post('/import',
  authorizeRoles('admin', 'manager', 'user'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('請選擇要匯入的檔案', 400);
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let data = [];
    
    try {
      // 根據檔案類型解析資料
      if (fileExtension === '.csv') {
        // 解析 CSV 檔案
        const csvData = fs.readFileSync(filePath, 'utf8');
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            data.push(row);
          }
        }
      } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        // 解析 Excel 檔案
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
      }

      // 清理上傳的檔案
      fs.unlinkSync(filePath);

      if (data.length === 0) {
        throw new AppError('檔案中沒有找到有效資料', 400);
      }

      // 返回解析後的資料供前端預覽
      res.json({
        success: true,
        message: '檔案解析成功',
        data: {
          headers: Object.keys(data[0]),
          preview: data.slice(0, 5), // 只返回前5筆作為預覽
          totalRows: data.length
        }
      });

    } catch (error) {
      // 清理上傳的檔案
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw new AppError(`檔案解析失敗: ${error.message}`, 400);
    }
  })
);

// 檢查 Email 是否重複
router.post('/check-duplicates',
  authorizeRoles('admin', 'manager', 'user'),
  asyncHandler(async (req, res) => {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails)) {
      throw new AppError('請提供 Email 列表', 400);
    }

    if (emails.length === 0) {
      return res.json({
        success: true,
        data: {
          count: 0,
          duplicates: []
        }
      });
    }

    // 批量檢查重複
    // 為了效能，分批處理或使用 TVP (Table-Valued Parameters)，這裡使用簡單的 IN 查詢 (注意參數上限 2100)
    // 如果數量很大，應該分批
    const batchSize = 1000;
    const duplicates = [];
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      // 構建參數化查詢
      const params = {};
      const paramNames = batch.map((email, index) => {
        const pName = `email${index}`;
        params[pName] = email;
        return `@${pName}`;
      });

      const query = `
        SELECT email 
        FROM Subscribers 
        WHERE email IN (${paramNames.join(',')})
      `;

      const result = await executeQuery(query, params);
      duplicates.push(...result.recordset.map(r => r.email));
    }

    res.json({
      success: true,
      data: {
        count: duplicates.length,
        duplicates: duplicates
      }
    });
  })
);

// 批量匯入訂閱者
router.post('/bulk-import',
  authorizeRoles('admin', 'manager', 'user'),
  validate(subscriberValidations.bulkImport),
  asyncHandler(async (req, res) => {
    const { subscribers, overwrite = false, targetCategoryId } = req.body;

    // 預先獲取所有分類，建立名稱到ID的映射
    const categoryResult = await executeQuery('SELECT id, name FROM Categories');
    const categoryMap = {};
    categoryResult.recordset.forEach(c => categoryMap[c.name] = c.id);

    const results = {
      success: 0,
      updated: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    // 使用事務處理批量匯入
    await executeTransaction(async (transaction) => {
      for (const subscriber of subscribers) {
        try {
          // 檢查郵箱是否已存在
          const existingCheck = await transaction.request()
            .input('email', sql.VarChar, subscriber.email)
            .query('SELECT id, status FROM Subscribers WHERE email = @email');

          let subscriberId = null;

          if (existingCheck.recordset.length > 0) {
            const existing = existingCheck.recordset[0];
            // 如果已存在但被刪除，則恢復並更新
            if (existing.status === 'deleted') {
               subscriberId = existing.id;
               
               // 構建 UPDATE 語句 (恢復為 active 或匯入的狀態)
               const updateRequest = transaction.request()
                 .input('id', sql.Int, subscriberId)
                 .input('email', sql.VarChar, subscriber.email)
                 .input('firstName', sql.VarChar, subscriber.firstName || '')
                 .input('lastName', sql.VarChar, subscriber.lastName || '')
                 .input('phone', sql.VarChar, subscriber.phone || null)
                 .input('company', sql.VarChar, subscriber.company || null)
                 .input('city', sql.VarChar, subscriber.city || null)
                 .input('country', sql.VarChar, subscriber.country || null)
                 .input('gender', sql.VarChar, subscriber.gender || null)
                 .input('status', sql.VarChar, (subscriber.status || 'active').toLowerCase())
                 .input('tags', sql.VarChar, subscriber.tags ? (Array.isArray(subscriber.tags) ? subscriber.tags.join(',') : subscriber.tags) : null);

               await updateRequest.query(`
                 UPDATE Subscribers SET 
                   first_name = @firstName,
                   last_name = @lastName,
                   phone = @phone,
                   company = @company,
                   city = @city,
                   country = @country,
                   gender = @gender,
                   tags = @tags,
                   status = @status,
                   updated_at = GETDATE(),
                   unsubscribed_at = NULL -- 重置退訂時間
                 WHERE id = @id
               `);
               
               results.updated++;
            } else if (overwrite) {
               // 覆蓋模式：更新現有資料
               subscriberId = existing.id;
               
               // 構建 UPDATE 語句
               await transaction.request()
                .input('id', sql.Int, subscriberId)
                .input('firstName', sql.VarChar, subscriber.firstName || '')
                .input('lastName', sql.VarChar, subscriber.lastName || '')
                .input('phone', sql.VarChar, subscriber.phone || null)
                .input('company', sql.VarChar, subscriber.company || null)
                .input('city', sql.VarChar, subscriber.city || null)
                .input('country', sql.VarChar, subscriber.country || null)
                .input('gender', sql.VarChar, subscriber.gender || null)
                .input('status', sql.VarChar, (subscriber.status || 'active').toLowerCase())
                .input('tags', sql.VarChar, subscriber.tags ? (Array.isArray(subscriber.tags) ? subscriber.tags.join(',') : subscriber.tags) : null)
                .query(`
                  UPDATE Subscribers
                  SET 
                    first_name = @firstName,
                    last_name = @lastName,
                    phone = @phone,
                    company = @company,
                    city = @city,
                    country = @country,
                    gender = @gender,
                    tags = @tags,
                    status = @status,
                    updated_at = GETDATE()
                  WHERE id = @id
                `);
               
               results.updated++;
            } else {
               // 跳過模式
               results.duplicates++;
               continue;
            }
          } else {
             // 插入新訂閱者
             const insertResult = await transaction.request()
               .input('email', sql.VarChar, subscriber.email)
               .input('firstName', sql.VarChar, subscriber.firstName || '')
               .input('lastName', sql.VarChar, subscriber.lastName || '')
               .input('phone', sql.VarChar, subscriber.phone || null)
               .input('company', sql.VarChar, subscriber.company || null)
               .input('city', sql.VarChar, subscriber.city || null)
               .input('country', sql.VarChar, subscriber.country || null)
               .input('gender', sql.VarChar, subscriber.gender || null)
               .input('status', sql.VarChar, (subscriber.status || 'active').toLowerCase())
               .input('tags', sql.VarChar, subscriber.tags ? (Array.isArray(subscriber.tags) ? subscriber.tags.join(',') : subscriber.tags) : null)
               .query(`
                 INSERT INTO Subscribers (email, first_name, last_name, phone, company, city, country, gender, tags, status, subscribed_at)
                 VALUES (@email, @firstName, @lastName, @phone, @company, @city, @country, @gender, @tags, @status, GETDATE());
                 SELECT SCOPE_IDENTITY() AS id;
               `);
             
             subscriberId = insertResult.recordset[0].id;
             results.success++;
          }

          // 處理全域分類 (Global Category)
          if (targetCategoryId && subscriberId) {
             await transaction.request()
               .input('subId', sql.Int, subscriberId)
               .input('catId', sql.Int, targetCategoryId)
               .query(`
                   IF NOT EXISTS (SELECT 1 FROM SubscriberCategories WHERE subscriber_id = @subId AND category_id = @catId)
                   INSERT INTO SubscriberCategories (subscriber_id, category_id) VALUES (@subId, @catId)
               `);
          }

          // 處理個別分類 (Categories from file)
          if (subscriber.categories && subscriberId) {
            const catNames = subscriber.categories.split(',').map(s => s.trim()).filter(s => s);
            const catIds = catNames.map(name => categoryMap[name]).filter(id => id);
            
            if (catIds.length > 0) {
              for (const catId of catIds) {
                await transaction.request()
                   .input('subId', sql.Int, subscriberId)
                   .input('catId', sql.Int, catId)
                   .query(`
                       IF NOT EXISTS (SELECT 1 FROM SubscriberCategories WHERE subscriber_id = @subId AND category_id = @catId)
                       INSERT INTO SubscriberCategories (subscriber_id, category_id) VALUES (@subId, @catId)
                   `);
              }
            }
          }

        } catch (error) {
          results.failed++;
          results.errors.push(`${subscriber.email}: ${error.message}`);
        }
      }
    });

    res.json({
      success: true,
      message: '批量匯入完成',
      data: results
    });
  })
);

// 獲取訂閱者統計
router.get('/stats/overview',
  asyncHandler(async (req, res) => {
    const statsQuery = `
      SELECT 
        ISNULL(COUNT(*), 0) as total,
        ISNULL(SUM(CASE WHEN status = 'subscribed' THEN 1 ELSE 0 END), 0) as active,
        ISNULL(SUM(CASE WHEN status = 'unsubscribed' AND DATEDIFF(day, ISNULL(unsubscribed_at, '1900-01-01'), GETDATE()) <= 30 THEN 1 ELSE 0 END), 0) as unsubscribed,
        ISNULL(SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END), 0) as bounced,
        ISNULL(SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END), 0) as invalid,
        ISNULL(SUM(CASE WHEN DATEDIFF(day, ISNULL(created_at, GETDATE()), GETDATE()) <= 30 THEN 1 ELSE 0 END), 0) as newThisMonth
      FROM Subscribers
    `;

    const result = await executeQuery(statsQuery);
    const stats = result.recordset[0];

    res.json({
      success: true,
      data: {
        total: stats.total,
        active: stats.active,
        unsubscribed: stats.unsubscribed,
        bounced: stats.bounced,
        invalid: stats.invalid,
        newThisMonth: stats.newThisMonth
      }
    });
  })
);

// 獲取訂閱者的分類
router.get('/:id/categories',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const categoriesQuery = `
      SELECT 
        c.id,
        c.category_type,
        c.name
      FROM Categories c
      INNER JOIN SubscriberCategories sc ON c.id = sc.category_id
      WHERE sc.subscriber_id = @subscriberId
      ORDER BY c.category_type, c.name
    `;

    const result = await executeQuery(categoriesQuery, { subscriberId: id });

    res.json({
      success: true,
      data: {
        categories: result.recordset.map(cat => ({
          id: cat.id,
          categoryType: cat.category_type,
          name: cat.name,
          description: '' // 暫時設為空字符串，因為表中沒有此欄位
        }))
      }
    });
  })
);

// 更新訂閱者的分類
router.put('/:id/categories',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { categoryIds } = req.body;

    // 準備事務操作
    const operations = [];

    // 先刪除現有的分類關聯
    operations.push({
      query: 'DELETE FROM SubscriberCategories WHERE subscriber_id = @subscriberId',
      params: { subscriberId: id }
    });

    // 添加新的分類關聯
    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        operations.push({
          query: 'INSERT INTO SubscriberCategories (subscriber_id, category_id) VALUES (@subscriberId, @categoryId)',
          params: { subscriberId: id, categoryId: categoryId }
        });
      }
    }

    // 執行事務
    await executeTransaction(operations);

    res.json({
      success: true,
      message: '訂閱者分類更新成功'
    });
  })
);

// 根據分類篩選訂閱者
router.get('/by-category/:categoryId',
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'created_at', 
      sortOrder = 'desc',
      search
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 建構查詢條件
    let whereClause = 'WHERE sc.category_id = @categoryId';
    const params = { categoryId };

    if (search) {
      whereClause += ` AND (s.email LIKE @search OR s.first_name LIKE @search OR s.last_name LIKE @search)`;
      params.search = `%${search}%`;
    }

    // 獲取總數
    const countQuery = `
      SELECT COUNT(*) as total
      FROM Subscribers s
      INNER JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
      ${whereClause}
    `;

    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取訂閱者列表
    const subscribersQuery = `
      SELECT 
        s.id, s.email, s.first_name, s.last_name, s.company, s.phone, s.gender, s.birth_date,
        s.country, s.city, s.tags, s.custom_fields, s.status, s.subscribed_at,
        s.unsubscribed_at, s.last_activity_at, s.created_at, s.updated_at
      FROM Subscribers s
      INNER JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
      ${whereClause}
      ORDER BY s.${sortBy} ${sortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    params.offset = offset;
    params.limit = limit;

    const result = await executeQuery(subscribersQuery, params);

    res.json({
      success: true,
      data: {
        subscribers: result.recordset.map(subscriber => ({
          id: subscriber.id,
          email: subscriber.email,
          firstName: subscriber.first_name,
          lastName: subscriber.last_name,
          companyName: subscriber.company,
          phone: subscriber.phone,
          gender: subscriber.gender,
          birthDate: subscriber.birth_date,
          country: subscriber.country,
          city: subscriber.city,
          tags: subscriber.tags ? subscriber.tags.split(',') : [],
          customFields: subscriber.custom_fields ? JSON.parse(subscriber.custom_fields) : {},
          status: subscriber.status,
          subscribedAt: subscriber.subscribed_at,
          unsubscribedAt: subscriber.unsubscribed_at,
          lastActivityAt: subscriber.last_activity_at,
          createdAt: subscriber.created_at,
          updatedAt: subscriber.updated_at
        })),
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

// 批量更新訂閱者分類
router.post('/bulk-update-categories',
  asyncHandler(async (req, res) => {
    const { subscriberIds, categoryIds, action } = req.body; // action: 'add' | 'remove' | 'replace'

    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new AppError('請提供有效的訂閱者ID列表', 400);
    }

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      throw new AppError('請提供有效的分類ID列表', 400);
    }

    await executeTransaction(async (transaction) => {
      for (const subscriberId of subscriberIds) {
        if (action === 'replace') {
          // 先刪除現有分類
          await transaction.request()
            .input('subscriberId', sql.Int, subscriberId)
            .query('DELETE FROM SubscriberCategories WHERE subscriber_id = @subscriberId');
        }

        if (action === 'add' || action === 'replace') {
          // 添加分類
          for (const categoryId of categoryIds) {
            await transaction.request()
              .input('subscriberId', sql.Int, subscriberId)
              .input('categoryId', sql.Int, categoryId)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM SubscriberCategories WHERE subscriber_id = @subscriberId AND category_id = @categoryId)
                INSERT INTO SubscriberCategories (subscriber_id, category_id)
                VALUES (@subscriberId, @categoryId)
              `);
          }
        } else if (action === 'remove') {
          // 移除分類
          for (const categoryId of categoryIds) {
            await transaction.request()
              .input('subscriberId', sql.Int, subscriberId)
              .input('categoryId', sql.Int, categoryId)
              .query('DELETE FROM SubscriberCategories WHERE subscriber_id = @subscriberId AND category_id = @categoryId');
          }
        }
      }
    });

    res.json({
      success: true,
      message: `批量${action === 'add' ? '添加' : action === 'remove' ? '移除' : '更新'}分類成功`,
      data: {
        affectedSubscribers: subscriberIds.length,
        affectedCategories: categoryIds.length
      }
    });
  })
);

// 獲取層次分類樹狀結構
router.get('/categories/tree',
  asyncHandler(async (req, res) => {
    const { hierarchyType } = req.query;
    
    const treeQuery = `
      WITH CategoryTree AS (
        -- 根節點
        SELECT 
          c.id, c.name, c.category_type, c.parent_id, c.level, c.path, 
          c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active,
          COUNT(sc.subscriber_id) as subscriber_count,
          0 as tree_level
        FROM Categories c
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        WHERE c.parent_id IS NULL 
          AND c.is_active = 1
          ${hierarchyType ? 'AND c.hierarchy_type = @hierarchyType' : ''}
        GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
                 c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active
        
        UNION ALL
        
        -- 子節點
        SELECT 
          c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
          c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active,
          COUNT(sc.subscriber_id) as subscriber_count,
          ct.tree_level + 1
        FROM Categories c
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        INNER JOIN CategoryTree ct ON c.parent_id = ct.id
        WHERE c.is_active = 1 AND ct.tree_level < 10
        GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
                 c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active
      )
      SELECT * FROM CategoryTree
      ORDER BY tree_level, sort_order, name
    `;

    const queryParams = hierarchyType ? { hierarchyType } : {};
    const result = await executeQuery(treeQuery, queryParams);

    res.json({
      success: true,
      data: {
        tree: result.recordset.map(cat => ({
          id: cat.id,
          name: cat.name,
          categoryType: cat.category_type,
          parentId: cat.parent_id,
          level: cat.level,
          path: cat.path,
          sortOrder: cat.sort_order,
          isLeaf: cat.is_leaf,
          hierarchyType: cat.hierarchy_type,
          subscriberCount: cat.subscriber_count,
          treeLevel: cat.tree_level
        }))
      }
    });
  })
);

// 獲取層次類型統計
router.get('/categories/hierarchy-stats',
  asyncHandler(async (req, res) => {
    try {
      // 獲取各層次類型的統計
      const statsQuery = `
        SELECT 
          hierarchy_type,
          COUNT(*) as count
        FROM Categories 
        WHERE hierarchy_type IS NOT NULL
        GROUP BY hierarchy_type
        ORDER BY hierarchy_type
      `;
      
      const result = await executeQuery(statsQuery);
      
      // 獲取總分類數
      const totalQuery = `SELECT COUNT(*) as total FROM Categories`;
      const totalResult = await executeQuery(totalQuery);
      
      // 構建統計對象
      const stats = {
        total_categories: totalResult.recordset[0].total
      };
      
      // 添加各層次類型的統計
      result.recordset.forEach(row => {
        stats[`${row.hierarchy_type}_count`] = row.count;
      });

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      console.error('獲取層次統計失敗:', error);
      res.status(500).json({
        success: false,
        message: '獲取層次統計失敗'
      });
    }
  })
);

// 獲取指定分類的子分類
router.get('/categories/:id/children',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await executeQuery('EXEC GetCategoryChildren @ParentId', { ParentId: id });

    res.json({
      success: true,
      data: {
        children: result.recordset.map(cat => ({
          id: cat.id,
          name: cat.name,
          categoryType: cat.category_type,
          parentId: cat.parent_id,
          level: cat.level,
          path: cat.path,
          sortOrder: cat.sort_order,
          isLeaf: cat.is_leaf,
          hierarchyType: cat.hierarchy_type,
          subscriberCount: cat.subscriber_count
        }))
      }
    });
  })
);

// 搜索分類
router.get('/categories/search',
  asyncHandler(async (req, res) => {
    const { q: searchTerm, hierarchyType } = req.query;
    
    if (!searchTerm) {
      throw new AppError('請提供搜索關鍵字', 400);
    }

    const searchQuery = `
        SELECT 
          c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
          c.hierarchy_type, p.name as parent_name,
          COUNT(s.id) as subscriber_count
        FROM Categories c
        LEFT JOIN Categories p ON c.parent_id = p.id
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id AND s.status != 'deleted'
        WHERE c.is_active = 1
          AND c.name LIKE '%' + @searchTerm + '%'
          ${hierarchyType ? 'AND c.hierarchy_type = @hierarchyType' : ''}
        GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
                 c.hierarchy_type, p.name
        ORDER BY c.hierarchy_type, c.level, c.name
      `;

    const queryParams = { searchTerm };
    if (hierarchyType) queryParams.hierarchyType = hierarchyType;

    const result = await executeQuery(searchQuery, queryParams);

    res.json({
      success: true,
      data: {
        results: result.recordset.map(cat => ({
          id: cat.id,
          name: cat.name,
          categoryType: cat.category_type,
          parentId: cat.parent_id,
          parentName: cat.parent_name,
          level: cat.level,
          path: cat.path,
          hierarchyType: cat.hierarchy_type,
          subscriberCount: cat.subscriber_count
        }))
      }
    });
  })
);

// 批量修正 Email
router.post('/bulk-correct-emails',
  asyncHandler(async (req, res) => {
    const { subscriberIds, findStr, replaceStr } = req.body;

    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new AppError('請提供有效的訂閱者ID列表', 400);
    }

    if (!findStr || typeof findStr !== 'string' || findStr.length === 0) {
      throw new AppError('請提供要搜尋的字串', 400);
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    await executeTransaction(async (transaction) => {
      for (const subscriberId of subscriberIds) {
        // 先檢查是否包含要替換的字串，避免無效更新
        const checkResult = await transaction.request()
            .input('subscriberId', sql.Int, subscriberId)
            .input('findStr', sql.NVarChar, findStr)
            .query(`
                SELECT email FROM Subscribers 
                WHERE id = @subscriberId AND email LIKE '%' + @findStr + '%'
            `);

        if (checkResult.recordset.length > 0) {
            const currentEmail = checkResult.recordset[0].email;
            const newEmail = currentEmail.split(findStr).join(replaceStr || '');
            
            // 檢查新 Email 是否已存在 (排除自己)
            const duplicateCheck = await transaction.request()
                .input('newEmail', sql.NVarChar, newEmail)
                .input('subscriberId', sql.Int, subscriberId)
                .query(`
                    SELECT id FROM Subscribers 
                    WHERE email = @newEmail AND id != @subscriberId
                `);
            
            if (duplicateCheck.recordset.length > 0) {
                // 如果已存在，刪除該舊的錯誤帳號 (根據需求：Email 已存在的帳號就是錯的，是要 replace 這個錯誤)
                 const conflictingId = duplicateCheck.recordset[0].id;
                 
                 // 刪除相關聯的記錄 (因為部分表可能沒有設置 ON DELETE CASCADE)
                 // EmailSends, EmailOpens, EmailClicks, EmailUnsubscribes 等
                 await transaction.request()
                     .input('conflictingId', sql.Int, conflictingId)
                     .query(`
                        DELETE FROM EmailOpens WHERE SubscriberID = @conflictingId;
                        DELETE FROM EmailClicks WHERE SubscriberID = @conflictingId;
                        DELETE FROM EmailUnsubscribes WHERE SubscriberID = @conflictingId;
                        DELETE FROM EmailSends WHERE subscriber_id = @conflictingId;
                        DELETE FROM SubscriberCategories WHERE subscriber_id = @conflictingId;
                        DELETE FROM Subscribers WHERE id = @conflictingId;
                     `);
             }

            await transaction.request()
                .input('subscriberId', sql.Int, subscriberId)
                .input('newEmail', sql.NVarChar, newEmail)
                .query(`
                    UPDATE Subscribers
                    SET email = @newEmail,
                        updated_at = GETDATE()
                    WHERE id = @subscriberId
                `);
            
            updatedCount++;
        }
      }
    });

    let message = `成功更新 ${updatedCount} 筆訂閱者 Email`;
    if (skippedCount > 0) {
        message += `，跳過 ${skippedCount} 筆 (因為 Email 已存在)`;
    }

    res.json({
      success: true,
      message: message,
      data: {
        updatedCount,
        skippedCount,
        skippedDetails
      }
    });
  })
);

// 批量更新狀態
router.post('/bulk-update-status',
  asyncHandler(async (req, res) => {
    const { subscriberIds, status } = req.body;

    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new AppError('請提供有效的訂閱者ID列表', 400);
    }

    const validStatuses = ['subscribed', 'unsubscribed', 'bounced', 'complained', 'invalid'];
    if (!status || !validStatuses.includes(status)) {
        // Map display names to db values if necessary, or just validate strict values
        // Let's support mapped values just in case
        throw new AppError('請提供有效的狀態', 400);
    }

    await executeTransaction(async (transaction) => {
        // Use a single update query for better performance with IN clause if possible, 
        // but with many IDs, a loop or temp table might be safer. 
        // Given existing patterns, we can loop or use IN if list is small. 
        // For 50k items, IN clause might hit limits (2100 params).
        // Best approach for large updates is chunking or temporary table.
        // However, for simplicity and consistency with other endpoints, let's chunk it.
        
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < subscriberIds.length; i += CHUNK_SIZE) {
            const chunk = subscriberIds.slice(i, i + CHUNK_SIZE);
            const idList = chunk.join(','); // integer IDs are safe to join directly
            
            await transaction.request()
                .input('status', sql.NVarChar, status)
                .query(`
                    UPDATE Subscribers
                    SET status = @status,
                        updated_at = GETDATE()
                    WHERE id IN (${idList})
                `);
        }
    });

    res.json({
      success: true,
      message: `成功更新 ${subscriberIds.length} 位訂閱者狀態為 ${status}`
    });
  })
);

// 批量更新資料 (營業單位/城市)
router.post('/bulk-update-data',
  asyncHandler(async (req, res) => {
    const { subscriberIds, country, city } = req.body;

    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new AppError('請提供有效的訂閱者ID列表', 400);
    }

    // Validate IDs are integers to prevent SQL injection
    const validIds = subscriberIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    if (validIds.length === 0) {
        throw new AppError('無效的訂閱者 ID', 400);
    }

    if (country === undefined && city === undefined) {
        throw new AppError('請至少提供一個要更新的欄位', 400);
    }

    const updates = [];
    if (country !== undefined) updates.push("country = @country");
    if (city !== undefined) updates.push("city = @city");
    
    updates.push("updated_at = GETDATE()");

    await executeTransaction(async (transaction) => {
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
            const chunk = validIds.slice(i, i + CHUNK_SIZE);
            const idList = chunk.join(','); 
            
            const request = transaction.request();
            if (country !== undefined) request.input('country', sql.NVarChar, country);
            if (city !== undefined) request.input('city', sql.NVarChar, city);

            await request.query(`
                UPDATE Subscribers
                SET ${updates.join(', ')}
                WHERE id IN (${idList})
            `);
        }
    });

    res.json({
      success: true,
      message: `成功更新 ${validIds.length} 位訂閱者資料`
    });
  })
);

module.exports = router;