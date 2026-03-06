require('dotenv').config();
const sql = require('mssql');

async function updateSubscribersTable() {
  let pool;
  try {
    console.log('正在更新 Subscribers 表結構...');
    
    // 初始化資料庫連接
    const config = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
      }
    };
    
    pool = await sql.connect(config);
    console.log('✅ 資料庫連接成功');

    // 檢查並添加缺失的列
    const columnsToAdd = [
      { name: 'phone', type: 'NVARCHAR(20)' },
      { name: 'gender', type: 'NVARCHAR(10)' },
      { name: 'birth_date', type: 'DATE' },
      { name: 'country', type: 'NVARCHAR(100)' },
      { name: 'city', type: 'NVARCHAR(100)' },
      { name: 'last_activity_at', type: 'DATETIME2' }
    ];

    for (const column of columnsToAdd) {
      try {
        // 檢查列是否存在
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'Subscribers' AND COLUMN_NAME = '${column.name}'
        `;
        
        const result = await pool.request().query(checkQuery);
        
        if (result.recordset[0].count === 0) {
          // 列不存在，添加它
          const alterQuery = `ALTER TABLE Subscribers ADD ${column.name} ${column.type}`;
          await pool.request().query(alterQuery);
          console.log(`✅ 添加列 ${column.name}`);
        } else {
          console.log(`⚠️  列 ${column.name} 已存在，跳過`);
        }
      } catch (error) {
        console.error(`❌ 添加列 ${column.name} 失敗:`, error.message);
      }
    }

    console.log('🎉 Subscribers 表結構更新完成！');
    
    if (pool) {
      await pool.close();
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ 更新失敗:', error);
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  }
}

updateSubscribersTable();