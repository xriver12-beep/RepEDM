require('dotenv').config();
const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkSubscribersCategoryFields() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log('✅ 資料庫連接成功');

        // 1. 檢查 Subscribers 表中 f1-f6 欄位的資料分布
        console.log('\n1. 檢查 f1-f6 欄位的資料分布:');
        
        for (let i = 1; i <= 6; i++) {
            const fieldName = `f${i}`;
            const result = await pool.request().query(`
                SELECT 
                    COUNT(*) as total_count,
                    COUNT(CASE WHEN ${fieldName} IS NOT NULL AND ${fieldName} != '' THEN 1 END) as non_empty_count,
                    COUNT(DISTINCT ${fieldName}) as distinct_values
                FROM Subscribers
                WHERE ${fieldName} IS NOT NULL AND ${fieldName} != ''
            `);
            
            const stats = result.recordset[0];
            console.log(`${fieldName}: ${stats.non_empty_count} 筆非空資料, ${stats.distinct_values} 個不同值`);
            
            // 顯示前10個最常見的值
            const topValues = await pool.request().query(`
                SELECT TOP 10 
                    ${fieldName} as value,
                    COUNT(*) as count
                FROM Subscribers
                WHERE ${fieldName} IS NOT NULL AND ${fieldName} != ''
                GROUP BY ${fieldName}
                ORDER BY COUNT(*) DESC
            `);
            
            if (topValues.recordset.length > 0) {
                console.log(`  最常見的值:`);
                topValues.recordset.forEach(row => {
                    console.log(`    ${row.value}: ${row.count} 次`);
                });
            }
            console.log('');
        }

        // 2. 檢查 original_id 欄位
        console.log('2. 檢查 original_id 欄位:');
        const originalIdResult = await pool.request().query(`
            SELECT 
                COUNT(*) as total_count,
                COUNT(CASE WHEN original_id IS NOT NULL THEN 1 END) as non_null_count,
                MIN(original_id) as min_id,
                MAX(original_id) as max_id
            FROM Subscribers
        `);
        
        const originalStats = originalIdResult.recordset[0];
        console.log(`original_id: ${originalStats.non_null_count} 筆非空資料 (範圍: ${originalStats.min_id} - ${originalStats.max_id})`);

        // 3. 檢查 Categories 表中的分類類型
        console.log('\n3. 檢查 Categories 表中的分類類型:');
        const categoriesResult = await pool.request().query(`
            SELECT 
                category_type,
                COUNT(*) as count
            FROM Categories
            WHERE category_type IS NOT NULL
            GROUP BY category_type
            ORDER BY category_type
        `);
        
        if (categoriesResult.recordset.length > 0) {
            console.log('分類類型統計:');
            categoriesResult.recordset.forEach(row => {
                console.log(`  ${row.category_type}: ${row.count} 個分類`);
            });
        } else {
            console.log('❌ Categories 表中沒有 category_type 資料');
        }

        // 4. 檢查是否有 t1-t6 類型的分類
        console.log('\n4. 檢查 t1-t6 類型的分類:');
        for (let i = 1; i <= 6; i++) {
            const tType = `t${i}`;
            const tResult = await pool.request().query(`
                SELECT COUNT(*) as count
                FROM Categories
                WHERE category_type = '${tType}'
            `);
            console.log(`${tType} 類型分類: ${tResult.recordset[0].count} 個`);
        }

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkSubscribersCategoryFields();