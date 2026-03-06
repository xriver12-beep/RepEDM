const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'WintonEDM',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000,
    instanceName: '',
    useUTC: false,
    abortTransactionOnError: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function updatePasswordRequirement() {
    try {
        const pool = await sql.connect(config);
        
        // 更新所有管理員用戶，停用強制變更密碼
        const result = await pool.request().query(`
            UPDATE AdminUsers 
            SET MustChangePassword = 0, 
                UpdatedAt = GETDATE()
            WHERE MustChangePassword = 1
        `);
        
        console.log('已更新', result.rowsAffected[0], '個管理員用戶，停用強制變更密碼');
        
        // 顯示更新後的狀態
        const users = await pool.request().query(`
            SELECT Username, Email, MustChangePassword, IsActive 
            FROM AdminUsers
        `);
        
        console.log('\n管理員用戶狀態:');
        users.recordset.forEach(user => {
            console.log(`- ${user.Username}: 強制變更密碼=${user.MustChangePassword ? '是' : '否'}, 啟用=${user.IsActive ? '是' : '否'}`);
        });
        
        await pool.close();
    } catch (error) {
        console.error('錯誤:', error.message);
    }
}

updatePasswordRequirement();