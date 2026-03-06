require('dotenv').config();
const sql = require('mssql');
const mysql = require('mysql2/promise');

// 資料庫配置
const newDbConfig = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

// 舊資料庫配置（從環境變數讀取）
const oldDbConfig = {
    host: process.env.OLD_DB_SERVER || 'localhost',
    port: parseInt(process.env.OLD_DB_PORT) || 3306,
    database: process.env.OLD_DB_NAME || 'old_edm_database',
    user: process.env.OLD_DB_USER || 'root',
    password: process.env.OLD_DB_PASSWORD || 'password'
};

class MemberDataImporter {
  constructor() {
    this.newDbPool = null;
    this.oldDbPool = null;
    this.batchSize = 1000; // 每批處理1000筆資料
    this.totalProcessed = 0;
    this.totalErrors = 0;
  }

  async connect() {
    try {
      console.log('🔗 連接到新資料庫...');
      this.newDbPool = await sql.connect(newDbConfig);
      console.log('✅ 新資料庫連接成功');

      console.log('🔗 連接到舊資料庫...');
      this.oldDbPool = await mysql.createConnection(oldDbConfig);
      console.log('✅ 舊資料庫連接成功');
    } catch (error) {
      console.error('❌ 資料庫連接失敗:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.newDbPool) {
        await this.newDbPool.close();
        console.log('🔌 新資料庫連接已關閉');
      }
      if (this.oldDbPool) {
        await this.oldDbPool.end();
        console.log('🔌 舊資料庫連接已關閉');
      }
    } catch (error) {
      console.error('❌ 關閉資料庫連接時發生錯誤:', error);
    }
  }

  // 檢查舊資料庫member表結構
  async checkOldTableStructure() {
    try {
      console.log('🔍 檢查舊資料庫member表結構...');
      const [result] = await this.oldDbPool.execute(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE,
          COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'epaper_member'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('📋 Member表欄位結構:');
      result.forEach(column => {
        console.log(`  - ${column.COLUMN_NAME}: ${column.DATA_TYPE}${column.CHARACTER_MAXIMUM_LENGTH ? `(${column.CHARACTER_MAXIMUM_LENGTH})` : ''} ${column.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      
      return result;
    } catch (error) {
      console.error('❌ 檢查表結構失敗:', error);
      throw error;
    }
  }

  // 獲取舊資料總數
  async getTotalCount() {
    try {
      const [result] = await this.oldDbPool.execute('SELECT COUNT(*) as total FROM epaper_member');
      const total = result[0].total;
      console.log(`📊 舊資料庫中共有 ${total.toLocaleString()} 筆member資料`);
      return total;
    } catch (error) {
      console.error('❌ 獲取資料總數失敗:', error);
      throw error;
    }
  }

  // 清理和驗證email格式
  cleanEmail(email) {
    if (!email || typeof email !== 'string') return null;
    
    const cleaned = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    return emailRegex.test(cleaned) ? cleaned : null;
  }

  // 處理自定義欄位
  processCustomFields(memberData) {
    const customFields = {};
    
    // 處理f1-f6欄位
    for (let i = 1; i <= 6; i++) {
      const fieldName = `f${i}`;
      if (memberData[fieldName] !== null && memberData[fieldName] !== undefined && memberData[fieldName] !== '') {
        customFields[fieldName] = memberData[fieldName];
      }
    }
    
    // 添加其他有用的欄位
    if (memberData.company) customFields.company = memberData.company;
    if (memberData.cust_id) customFields.cust_id = memberData.cust_id;
    if (memberData.birthday) customFields.birthday = memberData.birthday;
    
    return Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null;
  }

  // 分割姓名
  splitName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
      return { firstName: null, lastName: null };
    }
    
    const trimmed = fullName.trim();
    if (trimmed.length === 0) {
      return { firstName: null, lastName: null };
    }
    
    // 如果是中文姓名，通常第一個字是姓，其餘是名
    if (/[\u4e00-\u9fff]/.test(trimmed)) {
      if (trimmed.length === 1) {
        return { firstName: trimmed, lastName: null };
      } else {
        return { 
          lastName: trimmed.charAt(0), 
          firstName: trimmed.substring(1) 
        };
      }
    } else {
      // 英文姓名，以空格分割
      const parts = trimmed.split(/\s+/);
      if (parts.length === 1) {
        return { firstName: parts[0], lastName: null };
      } else {
        return { 
          firstName: parts.slice(0, -1).join(' '), 
          lastName: parts[parts.length - 1] 
        };
      }
    }
  }

  // 批次匯入資料
  async importBatch(offset, batchSize) {
    try {
      // 從舊資料庫獲取一批資料
      const [oldResult] = await this.oldDbPool.execute(`
        SELECT *
        FROM epaper_member
        ORDER BY id
        LIMIT ${batchSize} OFFSET ${offset}
      `);

      if (oldResult.length === 0) {
        return 0; // 沒有更多資料
      }

      console.log(`📦 處理第 ${offset + 1} - ${offset + oldResult.length} 筆資料...`);

      // 準備新資料庫的插入語句
      const newRequest = this.newDbPool.request();
      let successCount = 0;
      let errorCount = 0;

      for (const member of oldResult) {
        try {
          // 清理和驗證email
          const cleanedEmail = this.cleanEmail(member.email);
          if (!cleanedEmail) {
            console.warn(`⚠️  跳過無效email: ${member.email} (ID: ${member.id})`);
            errorCount++;
            continue;
          }

          // 檢查email是否已存在
          const checkRequest = this.newDbPool.request();
          checkRequest.input('email', sql.NVarChar, cleanedEmail);
          const existingResult = await checkRequest.query('SELECT id FROM Subscribers WHERE email = @email');
          
          if (existingResult.recordset.length > 0) {
            console.warn(`⚠️  Email已存在，跳過: ${cleanedEmail} (ID: ${member.id})`);
            errorCount++;
            continue;
          }

          // 分割姓名
          const { firstName, lastName } = this.splitName(member.name);

          // 處理自定義欄位
          const customFields = this.processCustomFields(member);

          // 插入新記錄
          const insertRequest = this.newDbPool.request();
          insertRequest.input('email', sql.NVarChar, cleanedEmail);
          insertRequest.input('firstName', sql.NVarChar, firstName);
          insertRequest.input('lastName', sql.NVarChar, lastName);
          insertRequest.input('status', sql.NVarChar, 'active');
          insertRequest.input('customFields', sql.NVarChar, customFields);
          insertRequest.input('subscribedAt', sql.DateTime2, new Date());

          await insertRequest.query(`
            INSERT INTO Subscribers (email, first_name, last_name, status, custom_fields, subscribed_at)
            VALUES (@email, @firstName, @lastName, @status, @customFields, @subscribedAt)
          `);

          successCount++;
        } catch (error) {
          console.error(`❌ 處理記錄失敗 (ID: ${member.id}):`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ 批次完成: 成功 ${successCount} 筆, 錯誤 ${errorCount} 筆`);
      this.totalProcessed += successCount;
      this.totalErrors += errorCount;

      return oldResult.length;
    } catch (error) {
      console.error('❌ 批次匯入失敗:', error);
      throw error;
    }
  }

  // 執行完整匯入
  async executeImport() {
    try {
      await this.connect();
      
      // 檢查表結構
      await this.checkOldTableStructure();
      
      // 獲取總數
      const totalCount = await this.getTotalCount();
      
      console.log(`🚀 開始匯入資料，每批處理 ${this.batchSize} 筆...`);
      
      let offset = 0;
      let processedInBatch = 0;
      
      do {
        processedInBatch = await this.importBatch(offset, this.batchSize);
        offset += this.batchSize;
        
        // 顯示進度
        const progress = Math.min(100, (this.totalProcessed / totalCount) * 100);
        console.log(`📈 進度: ${progress.toFixed(1)}% (${this.totalProcessed.toLocaleString()}/${totalCount.toLocaleString()})`);
        
        // 短暫暫停，避免資料庫負載過重
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } while (processedInBatch > 0);
      
      console.log('\n🎉 匯入完成！');
      console.log(`📊 總計: 成功匯入 ${this.totalProcessed.toLocaleString()} 筆, 錯誤 ${this.totalErrors.toLocaleString()} 筆`);
      
    } catch (error) {
      console.error('❌ 匯入過程發生錯誤:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  // 驗證匯入結果
  async validateImport() {
    try {
      await this.connect();
      
      const request = this.newDbPool.request();
      const result = await request.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
          COUNT(CASE WHEN custom_fields IS NOT NULL THEN 1 END) as with_custom_fields
        FROM Subscribers
      `);
      
      const stats = result.recordset[0];
      console.log('\n📊 匯入結果驗證:');
      console.log(`  總訂閱者數: ${stats.total.toLocaleString()}`);
      console.log(`  活躍訂閱者: ${stats.active_count.toLocaleString()}`);
      console.log(`  有自定義欄位: ${stats.with_custom_fields.toLocaleString()}`);
      
    } catch (error) {
      console.error('❌ 驗證失敗:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// 主執行函數
async function main() {
  const importer = new MemberDataImporter();
  
  try {
    console.log('🎯 開始Member資料匯入程序...\n');
    
    // 執行匯入
    await importer.executeImport();
    
    // 驗證結果
    await importer.validateImport();
    
    console.log('\n✨ 所有操作完成！');
    
  } catch (error) {
    console.error('💥 程序執行失敗:', error);
    process.exit(1);
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  main();
}

module.exports = MemberDataImporter;