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

async function rebuildSubscriberCategories() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log('✅ 資料庫連接成功');

        // 1. 建立分類映射表
        console.log('\n📂 建立分類映射表...');
        const categoryMap = new Map();
        
        // 獲取所有分類，按 category_type 和 original_id 建立映射
        const categoriesResult = await pool.request().query(`
            SELECT id, category_type, original_id, name
            FROM Categories
            WHERE category_type IN ('t1', 't2', 't3', 't4', 't5', 't6')
            AND original_id IS NOT NULL
        `);
        
        for (const cat of categoriesResult.recordset) {
            const key = `${cat.category_type}_${cat.original_id}`;
            categoryMap.set(key, {
                id: cat.id,
                name: cat.name,
                type: cat.category_type
            });
        }
        
        console.log(`載入 ${categoryMap.size} 個分類映射`);

        // 2. 清空現有關聯（重新開始）
        console.log('\n🧹 清空現有 SubscriberCategories 資料...');
        await pool.request().query('DELETE FROM SubscriberCategories');

        // 3. 獲取所有訂閱者的分類資料
        console.log('\n👥 獲取訂閱者分類資料...');
        const subscribersResult = await pool.request().query(`
            SELECT id, f1, f2, f3, f4, f5, f6
            FROM Subscribers
            WHERE (f1 IS NOT NULL AND f1 != '') 
               OR (f2 IS NOT NULL AND f2 != '') 
               OR (f3 IS NOT NULL AND f3 != '') 
               OR (f4 IS NOT NULL AND f4 != '') 
               OR (f5 IS NOT NULL AND f5 != '') 
               OR (f6 IS NOT NULL AND f6 != '')
        `);
        
        console.log(`找到 ${subscribersResult.recordset.length} 個訂閱者有分類資料`);

        // 4. 批次建立關聯
        console.log('\n🔗 開始建立分類關聯...');
        const batchSize = 1000;
        let totalRelations = 0;
        let currentBatch = [];
        
        for (const subscriber of subscribersResult.recordset) {
            // 處理 f1-f6 欄位
            const fields = [
                { type: 't1', value: subscriber.f1 },
                { type: 't2', value: subscriber.f2 },
                { type: 't3', value: subscriber.f3 },
                { type: 't4', value: subscriber.f4 },
                { type: 't5', value: subscriber.f5 },
                { type: 't6', value: subscriber.f6 }
            ];
            
            for (const field of fields) {
                if (field.value && field.value !== '' && field.value !== '0') {
                    // 處理 f6 的特殊格式 (::Array:::, ::11:::, 等)
                    let categoryValues = [];
                    
                    if (field.type === 't6' && typeof field.value === 'string') {
                        if (field.value === '::Array:::') {
                            // 跳過空陣列
                            continue;
                        } else if (field.value.includes('::')) {
                            // 解析格式如 ::11:::, ::329:::, ::335::11:::
                            const matches = field.value.match(/::(\\d+)::/g);
                            if (matches) {
                                categoryValues = matches.map(match => match.replace(/::/g, ''));
                            }
                        } else {
                            categoryValues = [field.value];
                        }
                    } else {
                        categoryValues = [field.value];
                    }
                    
                    // 為每個分類值建立關聯
                    for (const categoryValue of categoryValues) {
                        if (categoryValue && categoryValue !== '0') {
                            const categoryKey = `${field.type}_${categoryValue}`;
                            const category = categoryMap.get(categoryKey);
                            
                            if (category) {
                                currentBatch.push({
                                    subscriber_id: subscriber.id,
                                    category_id: category.id,
                                    assigned_at: new Date()
                                });
                                
                                // 當批次達到指定大小時執行插入
                                if (currentBatch.length >= batchSize) {
                                    const inserted = await insertBatch(pool, currentBatch);
                                    totalRelations += inserted;
                                    
                                    if (totalRelations % 10000 === 0) {
                                        console.log(`已建立 ${totalRelations} 個關聯...`);
                                    }
                                    
                                    currentBatch = [];
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 處理剩餘的批次
        if (currentBatch.length > 0) {
            const inserted = await insertBatch(pool, currentBatch);
            totalRelations += inserted;
        }
        
        console.log(`\\n✅ 分類關聯重建完成！`);
        console.log(`總計建立 ${totalRelations} 個訂閱者分類關聯`);
        
        // 5. 驗證結果
        console.log('\\n📊 驗證結果:');
        const verifyResult = await pool.request().query(`
            SELECT 
                c.category_type,
                c.name,
                COUNT(sc.subscriber_id) as subscriber_count
            FROM Categories c
            LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
            WHERE c.category_type IN ('t1', 't2', 't3', 't4', 't5', 't6')
            GROUP BY c.category_type, c.name
            HAVING COUNT(sc.subscriber_id) > 0
            ORDER BY c.category_type, COUNT(sc.subscriber_id) DESC
        `);
        
        const typeStats = {};
        for (const row of verifyResult.recordset) {
            if (!typeStats[row.category_type]) {
                typeStats[row.category_type] = 0;
            }
            typeStats[row.category_type] += row.subscriber_count;
        }
        
        console.log('各分類類型的訂閱者數量:');
        for (const [type, count] of Object.entries(typeStats)) {
            console.log(`  ${type}: ${count} 個關聯`);
        }

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
        console.error(error.stack);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// 批次插入函數
async function insertBatch(pool, relations) {
    if (relations.length === 0) return 0;
    
    try {
        const table = new sql.Table('SubscriberCategories');
        table.create = false;
        table.columns.add('subscriber_id', sql.Int, { nullable: false });
        table.columns.add('category_id', sql.Int, { nullable: false });
        table.columns.add('assigned_at', sql.DateTime2, { nullable: true });
        
        for (const relation of relations) {
            table.rows.add(relation.subscriber_id, relation.category_id, relation.assigned_at);
        }
        
        const request = pool.request();
        await request.bulk(table);
        
        return relations.length;
    } catch (error) {
        console.error('批次插入錯誤:', error.message);
        return 0;
    }
}

rebuildSubscriberCategories();