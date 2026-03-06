const express = require('express');
const router = express.Router();
const { authenticateAdmin, requireAnyAdmin } = require('../middleware/admin-auth');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const emailService = require('../services/email-service');
const settingsService = require('../services/settings-service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// 配置 Multer 用於 Logo 上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/logos';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 限制 2MB
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('只允許上傳圖片檔案 (jpeg, jpg, png, gif, webp)!'));
  }
});

// 配置 Multer 用於備份上傳
const backupStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/temp';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, 'restore-' + Date.now() + path.extname(file.originalname));
  }
});

const backupUpload = multer({ 
  storage: backupStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 限制 50MB
  fileFilter: function (req, file, cb) {
    // 寬鬆檢查 mimetype，主要依賴副檔名
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json') || file.originalname.endsWith('.zip')) {
      return cb(null, true);
    }
    cb(new Error('只允許上傳 JSON 或 ZIP 備份檔案!'));
  }
});





// --- 備份與還原路由 --- (Move to top to avoid being shadowed by /:section)

// 輔助函式：清理舊備份 (保留最新的 N 個)
function cleanupBackups(backupDir, maxBackups = 20) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json') || file.endsWith('.zip'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          filePath: filePath,
          created_at: stats.birthtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at); // 由新到舊排序

    if (files.length > maxBackups) {
      const filesToDelete = files.slice(maxBackups);
      filesToDelete.forEach(file => {
        try {
            fs.unlinkSync(file.filePath);
            console.log(`[Auto Cleanup] 已自動刪除舊備份: ${file.filename}`);
        } catch (e) {
            console.error(`刪除備份失敗 ${file.filename}:`, e);
        }
      });
    }
  } catch (error) {
    console.error('執行備份清理失敗:', error);
  }
}

// 獲取備份列表
router.get('/backups', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json') || file.endsWith('.zip'))
      .map(file => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          filename: file,
          size: stats.size,
          created_at: stats.birthtime,
          type: file.endsWith('.zip') ? 'Full Backup' : 'Settings Backup'
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error('獲取備份列表失敗:', error);
    res.status(500).json({ success: false, message: '獲取備份列表失敗' });
  }
});

// 建立備份
router.post('/backup/create', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filePath = path.join(backupDir, filename);

    // 獲取要備份的資料
    // 這裡我們備份 SystemSettings, Users (AdminUsers), Templates
    // 注意: 對於大型資料表 (Subscribers, Logs) 建議使用專門的資料庫工具或分批匯出
    
    const settings = await executeQuery('SELECT * FROM SystemSettings');
    const adminUsers = await executeQuery('SELECT AdminUserID, Email, FirstName, LastName, Role, IsActive FROM AdminUsers');
    // const templates = await executeQuery('SELECT * FROM Templates'); 

    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        systemSettings: settings.recordset,
        adminUsers: adminUsers.recordset,
        // templates: templates.recordset
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

    // 自動清理舊備份 (保留最近 20 份)
    cleanupBackups(backupDir, 20);

    res.json({
      success: true,
      message: '備份建立成功',
      data: { filename }
    });
  } catch (error) {
    console.error('建立備份失敗:', error);
    res.status(500).json({ success: false, message: '建立備份失敗: ' + error.message });
  }
});

// 下載備份
router.get('/backup/download/:filename', async (req, res) => {
  try {
    // 驗證 Token (因為是直接連結下載，使用 query string 傳遞 token)
    const token = req.query.token;
    if (!token) {
        return res.status(401).send('未授權的存取');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // 簡單檢查是否有管理員權限
        if (!decoded || !['Admin', 'Manager'].includes(decoded.role)) {
            return res.status(403).send('權限不足');
        }
    } catch (err) {
        return res.status(403).send('無效的憑證');
    }

    const { filename } = req.params;
    // 簡單的目錄遍歷防護
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).send('無效的檔案名稱');
    }

    const filePath = path.join(process.cwd(), 'backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('檔案不存在');
    }

    res.download(filePath);
  } catch (error) {
    console.error('下載備份失敗:', error);
    res.status(500).send('下載失敗');
  }
});

// 刪除備份
router.delete('/backup/:filename', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 防止路徑遍歷
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ success: false, message: '無效的檔案名稱' });
    }

    const filePath = path.join(process.cwd(), 'backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '備份檔案不存在' });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: '備份檔案已成功刪除'
    });
  } catch (error) {
    console.error('刪除備份失敗:', error);
    res.status(500).json({ success: false, message: '刪除備份失敗: ' + error.message });
  }
});

// 還原備份
router.post('/backup/restore', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ success: false, message: '未指定檔案' });

    // 防止路徑遍歷
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ success: false, message: '無效的檔案名稱' });
    }

    const filePath = path.join(process.cwd(), 'backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '備份檔案不存在' });
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const backupData = JSON.parse(fileContent);

    if (!backupData.data || !backupData.data.systemSettings) {
        return res.status(400).json({ success: false, message: '無效的備份檔案格式' });
    }

    // 開始還原 SystemSettings
    // 使用 MERGE 或 DELETE/INSERT
    // 這裡我們簡單地逐條更新
    
    // Transaction support would be better here
    const settings = backupData.data.systemSettings;
    for (const setting of settings) {
        await executeQuery(`
            MERGE SystemSettings AS target
            USING (SELECT @key AS SettingKey, @val AS SettingValue, @desc AS Description) AS source
            ON target.SettingKey = source.SettingKey
            WHEN MATCHED THEN
                UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (SettingKey, SettingValue, Description, CreatedAt, UpdatedAt)
                VALUES (source.SettingKey, source.SettingValue, source.Description, GETDATE(), GETDATE());
        `, {
            key: setting.SettingKey,
            val: setting.SettingValue,
            desc: setting.Description || 'Restored Setting'
        });
    }

    res.json({
      success: true,
      message: '系統設定已還原 (僅包含系統設定與管理員資料)'
    });

  } catch (error) {
    console.error('還原備份失敗:', error);
    res.status(500).json({ success: false, message: '還原備份失敗: ' + error.message });
  }
});

// 上傳並還原
router.post('/backup/restore-upload', 
    authenticateAdmin, 
    requireAnyAdmin,
    backupUpload.single('backup'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: '未上傳檔案' });
            }

            const filePath = req.file.path;
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            // 嘗試解析 JSON
            let backupData;
            try {
                backupData = JSON.parse(fileContent);
            } catch (e) {
                return res.status(400).json({ success: false, message: '檔案格式錯誤 (必須是 JSON)' });
            }

            // 執行還原邏輯 (同上)
            if (backupData.data && backupData.data.systemSettings) {
                 const settings = backupData.data.systemSettings;
                 for (const setting of settings) {
                     await executeQuery(`
                         MERGE SystemSettings AS target
                         USING (SELECT @key AS SettingKey, @val AS SettingValue, @desc AS Description) AS source
                         ON target.SettingKey = source.SettingKey
                         WHEN MATCHED THEN
                             UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE()
                         WHEN NOT MATCHED THEN
                             INSERT (SettingKey, SettingValue, Description, CreatedAt, UpdatedAt)
                             VALUES (source.SettingKey, source.SettingValue, source.Description, GETDATE(), GETDATE());
                     `, {
                         key: setting.SettingKey,
                         val: setting.SettingValue,
                         desc: setting.Description || 'Restored Setting'
                     });
                 }
            }

            // 清理上傳的檔案
            fs.unlinkSync(filePath);

            res.json({
                success: true,
                message: '備份已成功還原'
            });

        } catch (error) {
            console.error('上傳還原失敗:', error);
            res.status(500).json({ success: false, message: '還原失敗: ' + error.message });
        }
    }
);

// 獲取所有設定
router.get('/', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const systemSettings = await settingsService.getSettings();
    res.json({
      success: true,
      data: systemSettings
    });
  } catch (error) {
    console.error('獲取設定失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取設定失敗'
    });
  }
});

// 獲取郵件日誌列表
router.get('/email-logs', authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      emailType, 
      startDate, 
      endDate,
      search 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // 構建查詢條件
    let whereConditions = [];
    let queryParams = {};
    
    if (status) {
      whereConditions.push('status = @status');
      queryParams.status = status;
    }
    
    if (emailType) {
      whereConditions.push('email_type = @emailType');
      queryParams.emailType = emailType;
    }
    
    if (startDate) {
      whereConditions.push('created_at >= @startDate');
      queryParams.startDate = startDate;
    }
    
    if (endDate) {
      whereConditions.push('created_at <= @endDate');
      queryParams.endDate = endDate + ' 23:59:59';
    }
    
    if (search) {
      whereConditions.push('(recipient_email LIKE @search OR sender_email LIKE @search OR subject LIKE @search)');
      queryParams.search = `%${search}%`;
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM EmailLogs ${whereClause}`;
    const countResult = await executeQuery(countQuery, queryParams);
    const total = countResult && countResult.recordset && countResult.recordset.length > 0 ? countResult.recordset[0].total : 0;
    
    // 獲取日誌列表
    const logsQuery = `
      SELECT 
        id,
        email_type,
        recipient_email,
        sender_email,
        sender_name,
        subject,
        smtp_host,
        smtp_port,
        status,
        message_id,
        error_message,
        error_code,
        processing_time_ms,
        smtp_response,
        created_at
      FROM EmailLogs 
      ${whereClause}
      ORDER BY created_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;
    
    const logsParams = { ...queryParams, offset: parseInt(offset), limit: parseInt(limit) };
    const logs = await executeQuery(logsQuery, logsParams);
    
    res.json({
      success: true,
      data: {
        logs: logs.recordset || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('獲取郵件日誌失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取郵件日誌失敗: ' + error.message
    });
  }
});

// 獲取郵件日誌統計
router.get('/email-logs/stats', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate, emailType } = req.query;
    
    let whereConditions = [];
    let queryParams = {};
    
    if (startDate) {
      whereConditions.push('created_at >= @startDate');
      queryParams.startDate = startDate;
    }
    
    if (endDate) {
      whereConditions.push('created_at <= @endDate');
      queryParams.endDate = endDate + ' 23:59:59';
    }

    if (emailType) {
      whereConditions.push('email_type = @emailType');
      queryParams.emailType = emailType;
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // 總體統計
    const totalStatsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(processing_time_ms) as avgProcessingTime
      FROM EmailLogs 
      ${whereClause}
    `;
    
    const totalStats = await executeQuery(totalStatsQuery, queryParams);
    
    // 按類型統計
    const typeStatsQuery = `
      SELECT 
        email_type,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM EmailLogs 
      ${whereClause}
      GROUP BY email_type
    `;
    
    const typeStats = await executeQuery(typeStatsQuery, queryParams);
    
    // 每日統計（最近7天）
    const dailyStatsQuery = `
      SELECT 
        CAST(created_at AS DATE) as date,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM EmailLogs 
      WHERE created_at >= DATEADD(day, -7, GETDATE())
      ${whereConditions.length > 0 ? 'AND ' + whereConditions.join(' AND ') : ''}
      GROUP BY CAST(created_at AS DATE)
      ORDER BY date DESC
    `;
    
    const dailyStats = await executeQuery(dailyStatsQuery, queryParams);
    
    res.json({
      success: true,
      data: {
        total: totalStats.recordset[0],
        byType: typeStats.recordset || [],
        daily: dailyStats.recordset || []
      }
    });
    
  } catch (error) {
    console.error('獲取郵件日誌統計失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取郵件日誌統計失敗: ' + error.message
    });
  }
});

// 獲取單個郵件日誌詳情
router.get('/email-logs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const logQuery = `
      SELECT 
        id,
        email_type,
        recipient_email,
        sender_email,
        sender_name,
        subject,
        smtp_host,
        smtp_port,
        status,
        message_id,
        error_message,
        error_code,
        processing_time_ms,
        smtp_response,
        created_at
      FROM EmailLogs 
      WHERE id = @id
    `;
    
    const logs = await executeQuery(logQuery, { id });
    
    if (!logs.recordset || logs.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的郵件日誌'
      });
    }
    
    res.json({
      success: true,
      data: logs.recordset[0]
    });
    
  } catch (error) {
    console.error('獲取郵件日誌詳情失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取郵件日誌詳情失敗: ' + error.message
    });
  }
});

// 獲取特定段設定
router.get('/:section', authenticateAdmin, requireAnyAdmin, async (req, res) => {
  try {
    const { section } = req.params;
    const systemSettings = await settingsService.getSettings();
    
    if (!systemSettings[section]) {
      return res.status(404).json({
        success: false,
        message: '設定段落不存在'
      });
    }

    res.json({
      success: true,
      data: systemSettings[section]
    });
  } catch (error) {
    console.error('獲取設定段落失敗:', error);
    res.status(500).json({
      success: false,
      message: '獲取設定段落失敗'
    });
  }
});

// 上傳公司 Logo
router.post('/upload-logo', 
  authenticateAdmin, 
  requireAnyAdmin, 
  upload.single('logo'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: '未上傳任何檔案' });
      }
      
      const fileUrl = `/uploads/logos/${req.file.filename}`;
      
      res.json({
        success: true,
        message: 'Logo上傳成功',
        data: {
          url: fileUrl
        }
      });
    } catch (error) {
      console.error('Logo upload error:', error);
      res.status(500).json({ success: false, message: 'Logo上傳失敗: ' + error.message });
    }
  }
);

// 更新一般設定
router.put('/general',
  authenticateAdmin,
  requireAnyAdmin,
  [
    body('companyName').notEmpty().withMessage('公司名稱不能為空'),
    body('timezone').notEmpty().withMessage('時區不能為空'),
    body('language').notEmpty().withMessage('語言不能為空'),
    body('dateFormat').notEmpty().withMessage('日期格式不能為空')
  ],
  async (req, res) => {
    try {
      console.log('接收到的一般設定資料:', req.body);
      console.log('Admin User:', req.admin);
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('一般設定驗證錯誤:', errors.array());
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array()
        });
      }

      const { companyName, companyLogo, timezone, language, dateFormat, timeFormat } = req.body;
      const systemSettings = await settingsService.getSettings();
      
      const updatedSettings = {
        ...systemSettings.general,
        companyName,
        companyLogo: companyLogo || systemSettings.general.companyLogo,
        timezone,
        language,
        dateFormat,
        timeFormat: timeFormat || systemSettings.general.timeFormat
      };

      // 保存到資料庫
      await settingsService.updateSettings('general', updatedSettings, req.admin.adminUserID);

      res.json({
        success: true,
        message: '一般設定更新成功',
        data: updatedSettings
      });
    } catch (error) {
      console.error('更新一般設定失敗:', error);
      res.status(500).json({
        success: false,
        message: '更新一般設定失敗'
      });
    }
  }
);

// 更新郵件設定
router.put('/email',
  authenticateAdmin,
  requireAnyAdmin,
  [
    body('fromName').notEmpty().withMessage('寄件者名稱不能為空'),
    body('fromEmail').isEmail().withMessage('寄件者郵箱格式不正確'),
    body('replyToEmail').optional().isEmail().withMessage('回覆郵箱格式不正確')
  ],
  async (req, res) => {
    try {
      console.log('接收到的郵件設定資料:', req.body);
      console.log('Admin User:', req.admin);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('郵件設定驗證錯誤:', errors.array());
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array()
        });
      }

      const { fromName, fromEmail, replyToEmail, unsubscribeUrl, trackingEnabled, openTracking, clickTracking } = req.body;
      const systemSettings = await settingsService.getSettings();
      
      const updatedSettings = {
        ...systemSettings.email,
        fromName,
        fromEmail,
        replyToEmail: replyToEmail || systemSettings.email.replyToEmail,
        unsubscribeUrl: unsubscribeUrl || systemSettings.email.unsubscribeUrl,
        trackingEnabled: trackingEnabled !== undefined ? trackingEnabled : systemSettings.email.trackingEnabled,
        openTracking: openTracking !== undefined ? openTracking : systemSettings.email.openTracking,
        clickTracking: clickTracking !== undefined ? clickTracking : systemSettings.email.clickTracking
      };

      // 保存到資料庫
      await settingsService.updateSettings('email', updatedSettings, req.admin.adminUserID);

      res.json({
        success: true,
        message: '郵件設定更新成功',
        data: updatedSettings
      });
    } catch (error) {
      console.error('更新郵件設定失敗:', error);
      res.status(500).json({
        success: false,
        message: '更新郵件設定失敗'
      });
    }
  }
);

// 更新 SMTP 設定
router.put('/smtp',
  authenticateAdmin,
  requireAnyAdmin,
  [
    body('host').notEmpty().withMessage('SMTP主機不能為空'),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('端口必須是1-65535之間的數字'),
    body('username').notEmpty().withMessage('用戶名不能為空')
  ],
  async (req, res) => {
    try {
      console.log('接收到的 SMTP 設定資料:', req.body);
      console.log('Admin User:', req.admin);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('SMTP 設定驗證錯誤:', errors.array());
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array()
        });
      }

      const { host, port, secure, security, username, password, maxConnections, rateDelta, rateLimit, enabled } = req.body;
      const systemSettings = await settingsService.getSettings();
      
      const updatedSettings = {
        ...systemSettings.smtp,
        host,
        port: parseInt(port),
        secure: secure !== undefined ? secure : systemSettings.smtp.secure,
        security: security || systemSettings.smtp.security || (secure ? 'ssl' : 'tls'), // Save security preference
        username,
        password: password || systemSettings.smtp.password,
        maxConnections: maxConnections !== undefined ? parseInt(maxConnections) : systemSettings.smtp.maxConnections,
        rateDelta: rateDelta !== undefined ? parseInt(rateDelta) : systemSettings.smtp.rateDelta,
        rateLimit: rateLimit !== undefined ? parseInt(rateLimit) : systemSettings.smtp.rateLimit,
        enabled: enabled !== undefined ? enabled : (systemSettings.smtp.enabled !== undefined ? systemSettings.smtp.enabled : false)
      };

      // 保存到資料庫
      await settingsService.updateSettings('smtp', updatedSettings, req.admin.adminUserID);

      res.json({
        success: true,
        message: 'SMTP設定更新成功',
        data: updatedSettings
      });
    } catch (error) {
      console.error('更新SMTP設定失敗:', error);
      res.status(500).json({
        success: false,
        message: '更新SMTP設定失敗'
      });
    }
  }
);

// 通用設定更新路由（支援所有設定段落）
router.put('/:section',
  authenticateAdmin,
  requireAnyAdmin,
  async (req, res) => {
    try {
      const { section } = req.params;
      const systemSettings = await settingsService.getSettings();
      
      // 檢查設定段落是否存在
      if (!settingsService.getDefaultSettings()[section]) {
        return res.status(404).json({
          success: false,
          message: '設定段落不存在'
        });
      }

      // 合併現有設定和新設定
      const updatedSettings = {
        ...systemSettings[section],
        ...req.body
      };

      // 保存到資料庫
      await settingsService.updateSettings(section, updatedSettings, req.admin.adminUserID);

      res.json({
        success: true,
        message: `${section}設定更新成功`,
        data: updatedSettings
      });
    } catch (error) {
      console.error(`更新${req.params.section}設定失敗:`, error);
      res.status(500).json({
        success: false,
        message: `更新${req.params.section}設定失敗`
      });
    }
  }
);

// 發送測試郵件
router.post('/email/test-send',
  authenticateAdmin,
  requireAnyAdmin,
  async (req, res) => {
    try {
      // Use provided email or fallback to admin's email
      const targetEmail = req.body.to || req.admin.email;
      
      console.log('正在發送測試郵件至:', targetEmail);

      const result = await emailService.sendEmail({
        to: targetEmail,
        subject: 'WintonEDM 系統測試郵件',
        html: `
          <h1>WintonEDM 系統測試郵件</h1>
          <p>您好：</p>
          <p>這是一封來自 WintonEDM 系統的測試郵件。</p>
          <p>如果您收到此郵件，表示您的郵件設定（SMTP 和 寄件者設定）運作正常。</p>
          <hr>
          <p><small>發送時間: ${new Date().toLocaleString()}</small></p>
        `
      });

      if (result.success) {
        res.json({
          success: true,
          message: '測試郵件已發送'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || '發送測試郵件失敗'
        });
      }
    } catch (error) {
      console.error('發送測試郵件失敗:', error);
      res.status(500).json({
        success: false,
        message: '發送測試郵件失敗: ' + (error.message || '未知錯誤')
      });
    }
  }
);

// 測試SMTP連接
router.post('/test-smtp',
  authenticateAdmin,
  requireAnyAdmin,
  [
    body('smtpSettings').isObject().withMessage('SMTP 設定是必需的')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '輸入驗證失敗',
          errors: errors.array()
        });
      }

      const { smtpSettings } = req.body;
      
      console.log('收到 SMTP 連接測試請求:', smtpSettings);

      // 測試 SMTP 連接
      const result = await emailService.testConnection(smtpSettings);
      
      if (result.success) {
        console.log('SMTP 連接測試成功');
        res.json({
          success: true,
          message: result.message
        });
      } else {
        console.log('SMTP 連接測試失敗:', result.message);
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('SMTP 連接測試錯誤:', error);
      res.status(500).json({
        success: false,
        message: '伺服器內部錯誤'
      });
    }
  }
);

// 測試郵件發送端點
router.post('/test-email',
  authenticateAdmin,
  [
    body('email').isEmail().withMessage('請提供有效的郵件地址'),
    body('smtpSettings').optional().isObject().withMessage('SMTP 設定必須是物件格式')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '輸入驗證失敗',
          errors: errors.array()
        });
      }

      const { email, smtpSettings } = req.body;
      
      console.log('收到測試郵件請求:', { email, hasSmtpSettings: !!smtpSettings });

      // 發送測試郵件
      const result = await emailService.sendTestEmail(email, smtpSettings);
      
      if (result.success) {
        console.log('測試郵件發送成功:', result.messageId);
        res.json({
          success: true,
          message: result.message,
          messageId: result.messageId
        });
      } else {
        console.log('測試郵件發送失敗:', result.message);
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('測試郵件發送錯誤:', error);
      
      let errorMessage = '伺服器內部錯誤';
      if (error.message) {
        if (error.message.includes('uniqueidentifier')) {
          errorMessage = '資料庫參數錯誤，請檢查系統設定';
        } else if (error.message.includes('SMTP')) {
          errorMessage = 'SMTP 連線錯誤: ' + error.message;
        } else {
          errorMessage = error.message;
        }
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  }
);

// 創建郵件日誌表的管理端點
router.post('/create-email-logs-table',
  authenticateAdmin,
  requireAnyAdmin,
  async (req, res) => {
    try {
      console.log('開始創建郵件日誌表...');
      
      // 創建 EmailLogs 表
      const createTableSQL = `
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailLogs' AND xtype='U')
        CREATE TABLE EmailLogs (
            id INT IDENTITY(1,1) PRIMARY KEY,
            email_type NVARCHAR(50) NOT NULL,
            recipient_email NVARCHAR(255) NOT NULL,
            sender_email NVARCHAR(255),
            sender_name NVARCHAR(255),
            subject NVARCHAR(500),
            smtp_host NVARCHAR(255),
            smtp_port INT,
            status NVARCHAR(20) NOT NULL,
            message_id NVARCHAR(500),
            error_message NVARCHAR(MAX),
            error_code NVARCHAR(50),
            retry_count INT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            sent_at DATETIME2,
            failed_at DATETIME2,
            campaign_id INT,
            user_id INT,
            template_id INT,
            processing_time_ms INT,
            smtp_response NVARCHAR(MAX)
        );
      `;
      
      await executeQuery(createTableSQL);
      console.log('EmailLogs 表創建成功');
      
      // 創建索引
      const createIndexes = [
        `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmailLogs_Status')
         CREATE INDEX IX_EmailLogs_Status ON EmailLogs (status);`,
        `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmailLogs_CreatedAt')
         CREATE INDEX IX_EmailLogs_CreatedAt ON EmailLogs (created_at);`,
        `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmailLogs_RecipientEmail')
         CREATE INDEX IX_EmailLogs_RecipientEmail ON EmailLogs (recipient_email);`,
        `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmailLogs_EmailType')
         CREATE INDEX IX_EmailLogs_EmailType ON EmailLogs (email_type);`
      ];
      
      for (const indexSQL of createIndexes) {
        await executeQuery(indexSQL);
      }
      console.log('索引創建成功');
      
      // 創建視圖
      const createViews = [
        `IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'EmailLogsSummary')
         EXEC('CREATE VIEW EmailLogsSummary AS
         SELECT 
             email_type,
             status,
             COUNT(*) as count,
             AVG(processing_time_ms) as avg_processing_time,
             MIN(created_at) as first_sent,
             MAX(created_at) as last_sent
         FROM EmailLogs
         GROUP BY email_type, status');`,
        `IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'DailyEmailStats')
         EXEC('CREATE VIEW DailyEmailStats AS
         SELECT 
             CAST(created_at AS DATE) as send_date,
             email_type,
             status,
             COUNT(*) as count,
             AVG(processing_time_ms) as avg_processing_time
         FROM EmailLogs
         GROUP BY CAST(created_at AS DATE), email_type, status');`
      ];
      
      for (const viewSQL of createViews) {
        await executeQuery(viewSQL);
      }
      console.log('視圖創建成功');
      
      res.json({
        success: true,
        message: '郵件日誌表創建成功'
      });
      
    } catch (error) {
      console.error('創建郵件日誌表失敗:', error);
      res.status(500).json({
        success: false,
        message: '創建郵件日誌表失敗: ' + error.message
      });
    }
  }
);

module.exports = router;
