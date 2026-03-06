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

async function checkSubscriberCategoriesData() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log('✅ 資料庫連接成功');

        // 1. 檢查 SubscriberCategories 表的資料數量
        console.log('\n1. SubscriberCategories 表資料統計:');
        const countResult = await pool.request().query(`
            SELECT COUNT(*) as total_count FROM SubscriberCategories
        `);
        console.log(`總記錄數: ${countResult.recordset[0].total_count}`);

        // 2. 檢查最近的資料
        console.log('\n2. 最近的 SubscriberCategories 資料 (前10筆):');
        const recentResult = await pool.request().query(`
            SELECT TOP 10 
                sc.id,
                sc.subscriber_id,
                sc.category_id,
                sc.assigned_at,
                c.name as category_name,
                s.email as subscriber_email
            FROM SubscriberCategories sc
            LEFT JOIN Categories c ON sc.category_id = c.id
            LEFT JOIN Subscribers s ON sc.subscriber_id = s.id
            ORDER BY sc.id DESC
        `);

        if (recentResult.recordset.length > 0) {
            recentResult.recordset.forEach(row => {
                console.log(`- ID: ${row.id}, 訂閱者: ${row.subscriber_email || 'N/A'}, 分類: ${row.category_name || 'N/A'}, 指派時間: ${row.assigned_at || 'N/A'}`);
            });
        } else {
            console.log('❌ 沒有找到任何 SubscriberCategories 資料');
        }

        // 3. 按分類統計訂閱者數量
        console.log('\n3. 各分類的訂閱者數量統計:');
        const categoryStatsResult = await pool.request().query(`
            SELECT 
                c.id as category_id,
                c.name as category_name,
                COUNT(sc.subscriber_id) as subscriber_count
            FROM Categories c
            LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
            GROUP BY c.id, c.name
            ORDER BY subscriber_count DESC
        `);

        categoryStatsResult.recordset.forEach(row => {
            console.log(`- ${row.category_name}: ${row.subscriber_count} 位訂閱者`);
        });

        // 4. 檢查是否有孤立的關聯記錄
        console.log('\n4. 檢查資料完整性:');
        const orphanResult = await pool.request().query(`
            SELECT 
                COUNT(*) as orphan_count
            FROM SubscriberCategories sc
            LEFT JOIN Subscribers s ON sc.subscriber_id = s.id
            LEFT JOIN Categories c ON sc.category_id = c.id
            WHERE s.id IS NULL OR c.id IS NULL
        `);
        
        if (orphanResult.recordset[0].orphan_count > 0) {
            console.log(`⚠️  發現 ${orphanResult.recordset[0].orphan_count} 筆孤立的關聯記錄`);
        } else {
            console.log('✅ 所有關聯記錄都有效');
        }

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkSubscriberCategoriesData();