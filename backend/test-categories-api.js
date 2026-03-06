const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'WintonEDM',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

async function testCategoriesAPI() {
    try {
        console.log('正在測試分類 API 的 SQL 查詢...');
        await sql.connect(config);
        
        // 這是分類 API 中使用的查詢
        const categoriesQuery = `
          SELECT 
            c.id,
            c.category_type,
            c.name,
            COUNT(sc.subscriber_id) as subscriber_count
          FROM Categories c
          LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
          GROUP BY c.id, c.category_type, c.name
          ORDER BY c.category_type, c.name
        `;

        console.log('執行查詢:', categoriesQuery);
        const result = await sql.query(categoriesQuery);
        
        console.log(`\n📊 查詢結果: ${result.recordset.length} 筆數據`);
        
        if (result.recordset.length > 0) {
            console.log('\n前 10 筆數據:');
            result.recordset.slice(0, 10).forEach((cat, index) => {
                console.log(`  ${index + 1}. ID: ${cat.id}, Type: ${cat.category_type}, Name: ${cat.name}, Count: ${cat.subscriber_count}`);
            });
            
            // 按類型分組統計
            const typeStats = {};
            result.recordset.forEach(cat => {
                if (!typeStats[cat.category_type]) {
                    typeStats[cat.category_type] = 0;
                }
                typeStats[cat.category_type]++;
            });
            
            console.log('\n📈 按類型統計:');
            Object.entries(typeStats).forEach(([type, count]) => {
                console.log(`  ${type}: ${count} 個分類`);
            });
        } else {
            console.log('  查詢結果為空');
        }
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error('錯誤詳情:', error);
    } finally {
        await sql.close();
    }
}

testCategoriesAPI();