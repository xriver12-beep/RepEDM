const sql = require('mssql');
require('dotenv').config();

async function verifyMigration() {
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

    // 檢查各欄位的遷移結果
    const fields = ['company', 'birthday', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'cust_id', 'original_id'];
    
    console.log('=== Migration Verification ===');
    
    for (const field of fields) {
      const result = await sql.query(`
        SELECT COUNT(*) as count 
        FROM subscribers 
        WHERE ${field} IS NOT NULL 
        ${field === 'company' || field === 'f6' || field === 'cust_id' ? "AND " + field + " != ''" : ''}
      `);
      console.log(`${field}: ${result.recordset[0].count} records`);
    }

    // 顯示幾個範例
    console.log('\n=== Sample Records ===');
    const examples = await sql.query(`
      SELECT TOP 3 id, email, company, birthday, f1, f2, f3, f4, f5, f6, cust_id, original_id
      FROM subscribers 
      WHERE company IS NOT NULL AND company != ''
      ORDER BY id
    `);

    examples.recordset.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${record.id}`);
      console.log(`  Email: ${record.email}`);
      console.log(`  Company: ${record.company}`);
      console.log(`  Birthday: ${record.birthday}`);
      console.log(`  F1-F6: ${record.f1}, ${record.f2}, ${record.f3}, ${record.f4}, ${record.f5}, ${record.f6}`);
      console.log(`  Cust ID: ${record.cust_id}`);
      console.log(`  Original ID: ${record.original_id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.close();
  }
}

verifyMigration();