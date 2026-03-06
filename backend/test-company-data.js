const { connectDB, executeQuery } = require('./src/config/database');

async function testCompanyData() {
  try {
    console.log('正在連接資料庫...');
    await connectDB();
    console.log('資料庫連接成功');
    
    console.log('正在檢查 Subscribers 表中的公司名稱資料...');
    
    // 檢查是否有非空的公司名稱
    const companyQuery = `
      SELECT TOP 10 
        id, email, first_name, last_name, company, status
      FROM Subscribers 
      WHERE company IS NOT NULL AND company != ''
      ORDER BY id
    `;
    
    const result = await executeQuery(companyQuery);
    
    if (result.recordset.length > 0) {
      console.log('找到有公司名稱的訂閱者:');
      result.recordset.forEach(sub => {
        console.log(`ID: ${sub.id}, Email: ${sub.email}, 公司: ${sub.company}`);
      });
    } else {
      console.log('沒有找到有公司名稱的訂閱者');
      
      // 檢查總數和空值數量
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN company IS NULL OR company = '' THEN 1 ELSE 0 END) as empty_company,
          SUM(CASE WHEN company IS NOT NULL AND company != '' THEN 1 ELSE 0 END) as has_company
        FROM Subscribers
      `;
      
      const stats = await executeQuery(statsQuery);
      const stat = stats.recordset[0];
      console.log(`總訂閱者數: ${stat.total}`);
      console.log(`沒有公司名稱: ${stat.empty_company}`);
      console.log(`有公司名稱: ${stat.has_company}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('測試失敗:', error);
    process.exit(1);
  }
}

testCompanyData();