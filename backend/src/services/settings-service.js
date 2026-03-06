const { executeQuery } = require('../config/database');

// 預設設定結構
const defaultSettings = {
  general: {
    companyName: 'WintonEDM 公司',
    companyLogo: '',
    timezone: 'Asia/Taipei',
    language: 'zh-TW',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h'
  },
  email: {
    fromName: 'WintonEDM',
    fromEmail: 'noreply@wintonemail.com',
    replyToEmail: 'support@wintonemail.com',
    unsubscribeUrl: 'https://wintonemail.com/unsubscribe',
    trackingEnabled: true,
    openTracking: true,
    clickTracking: true
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    username: '',
    password: '',
    maxConnections: 5,
    rateDelta: 1000,
    rateLimit: 5
  },
  security: {
    sessionTimeout: 30,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    minPasswordLength: 8,
    twoFactorAuth: false,
    ipWhitelist: '',
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 30
  },
  notifications: {
    emailNotifications: true,
    reportEmail: 'admin@wintonemail.com',
    dailyReports: true,
    weeklyReports: true,
    monthlyReports: false,
    browserNotifications: true,
    desktopNotifications: false
  },
  integrations: {
    gaTrackingId: '',
    gaEnabled: false,
    fbPixelId: '',
    fbPixelEnabled: false,
    webhookUrl: '',
    webhookSecret: '',
    webhookCampaignSent: false,
    webhookSubscriberAdded: false,
    webhookUnsubscribe: false
  },
  frequencyCapping: {
    enabled: false,
    maxEmails: 4,
    periodDays: 30,
    excludeTestEmails: true,
    excludedDomains: [],
    excludedEmails: [],
    excludedTags: []
  },
  backup: {
    autoBackup: true,
    backupFrequency: 'daily',
    retentionDays: 30,
    backupLocation: 'local',
    s3Bucket: '',
    s3AccessKey: '',
    s3SecretKey: ''
  },
  advanced: {
    debugMode: false,
    cacheEnabled: true,
    cacheTimeout: 300,
    maxEmailsPerHour: 1000,
    apiRateLimit: 100,
    maintenanceMode: false
  }
};

// 深度合併設定物件
function mergeSettings(defaults, overrides) {
  const result = JSON.parse(JSON.stringify(defaults));
  
  function merge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        merge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  
  merge(result, overrides);
  return result;
}

class SettingsService {
  constructor() {
    this.cachedSettings = null;
    this.lastFetchTime = 0;
    this.cacheTTL = 60000; // 1分鐘緩存
  }

  // 從資料庫載入設定
  async getSettings(forceRefresh = false) {
    if (!forceRefresh && this.cachedSettings && (Date.now() - this.lastFetchTime < this.cacheTTL)) {
      return this.cachedSettings;
    }

    try {
      const result = await executeQuery('SELECT SettingKey, SettingValue FROM SystemSettings');
      const dbSettings = {};
      
      // 將資料庫中的設定轉換為結構化物件
      result.recordset.forEach(row => {
        const keys = row.SettingKey.split('.');
        let current = dbSettings;
        
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        
        // 嘗試解析 JSON 值，如果失敗則使用原始值
        try {
          current[keys[keys.length - 1]] = JSON.parse(row.SettingValue);
        } catch {
          current[keys[keys.length - 1]] = row.SettingValue;
        }
      });
      
      // 合併預設設定和資料庫設定
      this.cachedSettings = mergeSettings(defaultSettings, dbSettings);
      this.lastFetchTime = Date.now();
      return this.cachedSettings;
    } catch (error) {
      console.error('載入設定失敗，使用預設設定:', error);
      return defaultSettings;
    }
  }

  // 將設定保存到資料庫
  async updateSettings(section, settings, userId) {
    try {
      console.log(`正在保存設定 [${section}] User: ${userId}`);
      const promises = [];
      
      const flattenSettings = (obj, prefix = '') => {
        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          const sectionKey = section ? `${section}.${fullKey}` : fullKey;
          
          if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            flattenSettings(obj[key], fullKey);
          } else {
            const value = typeof obj[key] === 'object' ? JSON.stringify(obj[key]) : String(obj[key]);
            
            console.log(`Saving key: ${sectionKey}, Value length: ${value.length}`);

            promises.push(
              executeQuery(`
                MERGE SystemSettings AS target
                USING (SELECT @settingKey AS SettingKey, @settingValue AS SettingValue, @userId AS UpdatedBy) AS source
                ON target.SettingKey = source.SettingKey
                WHEN MATCHED THEN
                  UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE(), UpdatedBy = source.UpdatedBy
                WHEN NOT MATCHED THEN
                  INSERT (SettingKey, SettingValue, UpdatedBy, Description)
                  VALUES (source.SettingKey, source.SettingValue, source.UpdatedBy, '系統設定');
              `, {
                settingKey: sectionKey,
                settingValue: value,
                userId: userId
              })
            );
          }
        }
      };
      
      flattenSettings(settings);
      await Promise.all(promises);
      
      // 強制刷新緩存
      this.cachedSettings = null;
      console.log(`設定 [${section}] 保存成功`);
      return true;
    } catch (error) {
      console.error('保存設定到資料庫失敗:', error);
      throw error;
    }
  }
  
  getDefaultSettings() {
    return defaultSettings;
  }
}

module.exports = new SettingsService();
