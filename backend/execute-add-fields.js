const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function executeSQL() {
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
    console.log('Connected to database');
    
    // 讀取 SQL 文件
    const sqlFile = path.join(__dirname, 'add-missing-fields.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    // 執行 SQL
    console.log('Executing SQL script...');
    const result = await sql.query(sqlContent);
    
    console.log('SQL script executed successfully');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.close();
  }
}

executeSQL();