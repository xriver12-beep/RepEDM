const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const sql = require('mssql');
const { dbEncodingConfig } = require('./encoding');

console.log('Database Config - Loading from:', path.join(__dirname, '../../.env'));
console.log('Database Config - DB_NAME:', process.env.DB_NAME);

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'WintonEDM_bak', // Default to WintonEDM_bak if env missing
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000,
    instanceName: '', // 如果使用命名實例，在這裡指定
    ...dbEncodingConfig.mssql.options
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// 強制覆寫資料庫名稱，確保連接到正確的資料庫
// 這是為了防止環境變數被系統或其他配置覆蓋
// if (config.database === 'WintonEDM') {
//     console.log('⚠️ 檢測到舊的資料庫名稱 WintonEDM，強制切換到 WintonEDM_bak');
//     config.database = 'WintonEDM_bak';
// }
console.log('✅ 最終使用的資料庫:', config.database);

let pool;

async function connectDB() {
  try {
    if (pool) {
      return pool;
    }
    
    pool = await sql.connect(config);
    console.log('資料庫連接池建立成功');
    
    // 監聽連接事件
    pool.on('error', err => {
      console.error('資料庫連接池錯誤:', err);
    });
    
    return pool;
  } catch (error) {
    console.error('資料庫連接失敗:', error);
    throw error;
  }
}

async function closeDB() {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('資料庫連接已關閉');
    }
  } catch (error) {
    console.error('關閉資料庫連接時發生錯誤:', error);
  }
}

function getPool() {
  if (!pool) {
    throw new Error('資料庫連接池尚未初始化');
  }
  return pool;
}

// 執行查詢的輔助函數
async function executeQuery(query, params = {}) {
  try {
    const pool = getPool();
    const request = pool.request();
    
    // 添加參數
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (typeof value === 'string') {
        // 對於字串，強制使用 NVarChar 以支援中文
        request.input(key, sql.NVarChar, value);
      } else {
        request.input(key, value);
      }
    });
    
    const result = await request.query(query);
    return result;
  } catch (error) {
    console.error('查詢執行錯誤:', error);
    throw error;
  }
}

// 執行預存程序的輔助函數
async function executeProcedure(procedureName, params = {}) {
  try {
    const pool = getPool();
    const request = pool.request();
    
    // 添加參數
    Object.keys(params).forEach(key => {
      request.input(key, params[key]);
    });
    
    const result = await request.execute(procedureName);
    return result;
  } catch (error) {
    console.error('預存程序執行錯誤:', error);
    throw error;
  }
}

// 交易處理輔助函數
async function executeTransaction(operations) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    let results;

    if (typeof operations === 'function') {
      // 如果傳入的是函數，則將 transaction 物件傳給它執行
      // 函數需要自行處理 request 和 query
      results = await operations(transaction);
    } else if (Array.isArray(operations)) {
      // 如果傳入的是陣列，則執行預定義的操作列表
      results = [];
      for (const operation of operations) {
        const request = new sql.Request(transaction);
        
        // 添加參數
        if (operation.params) {
          Object.keys(operation.params).forEach(key => {
            request.input(key, operation.params[key]);
          });
        }
        
        const result = await request.query(operation.query);
        results.push(result);
      }
    } else {
      throw new Error('executeTransaction 參數錯誤: 必須是操作陣列或回調函數');
    }
    
    await transaction.commit();
    return results;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      // 忽略 rollback 錯誤 (可能交易已經結束)
    }
    console.error('交易執行錯誤:', error);
    throw error;
  }
}

function getDbConfig() {
  return {
    server: config.server,
    database: config.database
  };
}

module.exports = {
  connectDB,
  closeDB,
  getPool,
  executeQuery,
  executeProcedure,
  executeTransaction,
  getDbConfig,
  sql
};