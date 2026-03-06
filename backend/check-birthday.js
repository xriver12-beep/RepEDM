const sql = require('mssql');
require('dotenv').config();

async function checkBirthdays() {
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

  await sql.connect(config);
  
  const result = await sql.query(`
    SELECT TOP 10 id, custom_fields 
    FROM subscribers 
    WHERE custom_fields IS NOT NULL 
    AND custom_fields LIKE '%birthday%'
  `);
  
  console.log('Birthday data in custom_fields:');
  result.recordset.forEach(record => {
    const cf = JSON.parse(record.custom_fields);
    console.log(`ID ${record.id}: birthday = '${cf.birthday}'`);
  });
  
  await sql.close();
}

checkBirthdays();