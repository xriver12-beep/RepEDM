const { connectDB, executeQuery, closeDB } = require('./src/config/database');

// Mock function from settings.js
async function saveSettingsToDB(section, settings, userId) {
  try {
    console.log(`正在保存設定 [${section}] User: ${userId}`);
    const promises = [];
    
    function flattenSettings(obj, prefix = '') {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const sectionKey = section ? `${section}.${fullKey}` : fullKey;
        
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          flattenSettings(obj[key], fullKey);
        } else {
          const value = typeof obj[key] === 'object' ? JSON.stringify(obj[key]) : String(obj[key]);
          
          console.log(`Saving key: ${sectionKey}, Value: ${value}`);

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
    }
    
    flattenSettings(settings);
    await Promise.all(promises);
    console.log(`設定 [${section}] 保存成功`);
    return true;
  } catch (error) {
    console.error('保存設定到資料庫失敗:', error);
    throw error;
  }
}

async function runTest() {
    try {
        await connectDB();

        const userId = 'C417260A-7182-4BE0-9C99-16488F8CE1F1'; // Use a valid-looking UUID

        // Test General Settings
        console.log('--- Testing General Settings Save ---');
        const generalSettings = {
            companyName: 'Test Company',
            timezone: 'Asia/Taipei',
            language: 'zh-TW',
            dateFormat: 'YYYY-MM-DD',
            timeFormat: '24h'
        };
        await saveSettingsToDB('general', generalSettings, userId);

        // Test Email Settings
        console.log('--- Testing Email Settings Save ---');
        const emailSettings = {
            fromName: 'Test Sender',
            fromEmail: 'test@example.com',
            replyToEmail: 'reply@example.com',
            unsubscribeUrl: 'http://example.com/unsub',
            trackingEnabled: true,
            openTracking: true,
            clickTracking: false
        };
        await saveSettingsToDB('email', emailSettings, userId);

        // Test SMTP Settings
        console.log('--- Testing SMTP Settings Save ---');
        const smtpSettings = {
            host: 'smtp.test.com',
            port: 587,
            username: 'testuser',
            password: 'testpassword',
            secure: false
        };
        await saveSettingsToDB('smtp', smtpSettings, userId);

        console.log('All tests completed successfully.');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await closeDB();
    }
}

runTest();
