require('dotenv').config();
const sql = require('mssql');

async function checkTables() {
  let pool;
  try {
    console.log('正在檢查資料庫表...');
    
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

    // 檢查所有表
    const tablesQuery = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;
    
    const result = await pool.request().query(tablesQuery);
    console.log('\n📊 資料庫中的表:');
    result.recordset.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.TABLE_NAME}`);
    });

    // 檢查 Subscribers 表的列
    const columnsQuery = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Subscribers'
      ORDER BY ORDINAL_POSITION
    `;
    
    const columnsResult = await pool.request().query(columnsQuery);
    if (columnsResult.recordset.length > 0) {
      console.log('\n📋 Subscribers 表的列:');
      columnsResult.recordset.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.COLUMN_NAME} (${row.DATA_TYPE})`);
      });
    } else {
      console.log('\n⚠️  Subscribers 表不存在或沒有列');
    }
    
    if (pool) {
      await pool.close();
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ 檢查失敗:', error);
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  }
}

checkTables();