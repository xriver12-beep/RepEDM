const { connectDB, executeQuery } = require('./src/config/database');

async function checkCustomFields() {
  try {
    await connectDB();
    
    // 檢查前 10 筆有 custom_fields 資料的訂閱者
    const result = await executeQuery(`
      SELECT id, email, first_name, last_name, company, birth_date, custom_fields 
      FROM Subscribers 
      WHERE custom_fields IS NOT NULL AND custom_fields != ''
      ORDER BY id
      OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
    `);
    
    console.log('找到', result.recordset.length, '筆有 custom_fields 的資料');
    console.log('');
    
    result.recordset.forEach((record, index) => {
      console.log(`=== 記錄 ${index + 1} (ID: ${record.id}) ===`);
      console.log('Email:', record.email);
      console.log('姓名:', record.first_name, record.last_name);
      console.log('目前 company 欄位:', record.company);
      console.log('目前 birth_date 欄位:', record.birth_date);
      console.log('custom_fields 內容:');
      
      try {
        const customFields = JSON.parse(record.custom_fields);
        console.log(JSON.stringify(customFields, null, 2));
      } catch (e) {
        console.log('無法解析 JSON:', record.custom_fields);
      }
      console.log('');
    });
    
    // 統計有 custom_fields 的總數
    const countResult = await executeQuery(`
      SELECT COUNT(*) as total_count
      FROM Subscribers 
      WHERE custom_fields IS NOT NULL AND custom_fields != ''
    `);
    
    console.log('總共有', countResult.recordset[0].total_count, '筆訂閱者有 custom_fields 資料');
    
    process.exit(0);
  } catch (error) {
    console.error('錯誤:', error);
    process.exit(1);
  }
}

checkCustomFields();