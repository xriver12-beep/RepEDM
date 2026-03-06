const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkCampaignsData() {
  try {
    // 初始化資料庫連接
    await connectDB();
    console.log('✅ 資料庫連接成功');
    
    // 檢查活動數量
    const countResult = await executeQuery('SELECT COUNT(*) as count FROM Campaigns');
    console.log(`📊 活動總數: ${countResult.recordset[0].count}`);
    
    // 先檢查表結構
    const tableInfo = await executeQuery(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Campaigns'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\n🏗️ Campaigns 表結構:');
    const columns = [];
    tableInfo.recordset.forEach(col => {
      columns.push(col.COLUMN_NAME);
      console.log(`- ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}) ${col.COLUMN_DEFAULT ? `默認: ${col.COLUMN_DEFAULT}` : ''}`);
    });
    
    // 根據實際欄位查詢活動數據
    const selectFields = ['id'];
    if (columns.includes('name')) selectFields.push('name');
    if (columns.includes('campaignName')) selectFields.push('campaignName');
    if (columns.includes('subject')) selectFields.push('subject');
    if (columns.includes('status')) selectFields.push('status');
    if (columns.includes('type')) selectFields.push('type');
    if (columns.includes('created_by')) selectFields.push('created_by');
    if (columns.includes('created_at')) selectFields.push('created_at');
    if (columns.includes('updated_at')) selectFields.push('updated_at');
    
    const campaigns = await executeQuery(`
      SELECT ${selectFields.join(', ')}
      FROM Campaigns 
      ORDER BY ${columns.includes('created_at') ? 'created_at' : 'id'} DESC
    `);
    
    console.log('\n📋 活動列表:');
    if (campaigns.recordset.length === 0) {
      console.log('❌ 沒有找到任何活動數據');
    } else {
      campaigns.recordset.forEach((c, index) => {
        console.log(`${index + 1}. ID: ${c.id}`);
        if (c.name) console.log(`   名稱: ${c.name}`);
        if (c.campaignName) console.log(`   活動名稱: ${c.campaignName}`);
        if (c.subject) console.log(`   主旨: ${c.subject}`);
        if (c.status) console.log(`   狀態: ${c.status}`);
        if (c.type) console.log(`   類型: ${c.type}`);
        if (c.created_by !== undefined) console.log(`   創建者ID: ${c.created_by}`);
        if (c.created_at) console.log(`   建立時間: ${c.created_at}`);
        console.log('   ---');
      });
    }
    
  } catch (error) {
    console.error('❌ 查詢失敗:', error.message);
    console.error('詳細錯誤:', error);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

checkCampaignsData();