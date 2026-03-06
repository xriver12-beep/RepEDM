const sql = require('mssql');
require('dotenv').config();

async function checkSchema() {
  const config = {
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

  try {
    await sql.connect(config);
    const result = await sql.query(`
      SELECT 
        COLUMN_NAME as Field,
        DATA_TYPE as Type,
        IS_NULLABLE as [Null],
        COLUMN_DEFAULT as [Default]
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'subscribers'
      ORDER BY ORDINAL_POSITION
    `);
    const columns = result.recordset;
    console.log('Current subscribers table schema:');
    console.log('Field\t\t\tType\t\t\tNull\tDefault');
    console.log('='.repeat(60));
    columns.forEach(col => {
      console.log(`${col.Field.padEnd(20)}\t${col.Type.padEnd(15)}\t${col.Null}\t${col.Default || 'NULL'}`);
    });
    
    // 檢查需要的欄位
    const requiredFields = ['birthday', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'cust_id', 'original_id'];
    const existingFields = columns.map(col => col.Field);
    
    console.log('\n需要的欄位檢查:');
    requiredFields.forEach(field => {
      const exists = existingFields.includes(field);
      console.log(`${field}: ${exists ? '✓ 存在' : '✗ 不存在'}`);
    });
    
    // 列出缺失的欄位
    const missingFields = requiredFields.filter(field => !existingFields.includes(field));
    if (missingFields.length > 0) {
      console.log('\n缺失的欄位:', missingFields.join(', '));
    } else {
      console.log('\n所有欄位都已存在！');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.close();
  }
}

checkSchema();