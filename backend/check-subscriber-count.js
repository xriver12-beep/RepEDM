const sql = require('mssql');

const config = {
  server: 'edm2022',
  database: 'WintonEDM',
  user: 'sa',
  password: 'Wint0n2k00',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkCount() {
  try {
    await sql.connect(config);
    
    // 檢查總訂閱者數
    const result = await sql.query('SELECT COUNT(*) as total FROM Subscribers');
    console.log('總訂閱者數:', result.recordset[0].total);
    
    // 按狀態分組
    const statusResult = await sql.query('SELECT status, COUNT(*) as count FROM Subscribers GROUP BY status');
    console.log('按狀態分組:');
    statusResult.recordset.forEach(row => {
      console.log(`  ${row.status}: ${row.count}`);
    });
    
    // 檢查最近的記錄
    const recentResult = await sql.query('SELECT TOP 5 id, email, status, created_at FROM Subscribers ORDER BY id DESC');
    console.log('\n最近的5筆記錄:');
    recentResult.recordset.forEach(row => {
      console.log(`  ID: ${row.id}, Email: ${row.email}, Status: ${row.status}, Created: ${row.created_at}`);
    });
    
    await sql.close();
  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

checkCount();