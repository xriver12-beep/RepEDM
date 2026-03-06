require('dotenv').config();
const sql = require('mssql');

async function checkCategoriesComplete() {
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

    const pool = await sql.connect(config);

    try {
        console.log('=== 檢查 Categories 表結構和資料 ===\n');

        // 1. 檢查 Categories 表結構
        console.log('1. Categories 表結構:');
        const structureResult = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'Categories'
            ORDER BY ORDINAL_POSITION
        `);

        if (structureResult.recordset.length > 0) {
            console.log('欄位名稱\t\t資料類型\t\t可為空\t\t預設值\t\t最大長度');
            console.log('─'.repeat(100));
            structureResult.recordset.forEach(col => {
                console.log(`${col.COLUMN_NAME.padEnd(20)}\t${col.DATA_TYPE.padEnd(15)}\t${col.IS_NULLABLE.padEnd(10)}\t${(col.COLUMN_DEFAULT || 'NULL').padEnd(15)}\t${col.CHARACTER_MAXIMUM_LENGTH || 'N/A'}`);
            });
        } else {
            console.log('❌ Categories 表不存在');
            return;
        }

        // 2. 檢查現有資料
        console.log('\n2. Categories 表資料:');
        const dataResult = await pool.request().query(`
            SELECT TOP 20 * FROM Categories ORDER BY id
        `);

        if (dataResult.recordset.length > 0) {
            console.log(`找到 ${dataResult.recordset.length} 條記錄:`);
            dataResult.recordset.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, Name: ${row.name || 'N/A'}, Description: ${row.description || 'N/A'}`);
            });
        } else {
            console.log('❌ Categories 表中沒有資料');
        }

        // 3. 檢查是否有 t1, t2 等分類
        console.log('\n3. 檢查 t1, t2 等分類:');
        const tCategoriesResult = await pool.request().query(`
            SELECT * FROM Categories 
            WHERE name LIKE '%t1%' OR name LIKE '%t2%' OR name LIKE '%t3%' OR name LIKE '%t4%' OR name LIKE '%t5%' OR name LIKE '%t6%'
            ORDER BY id
        `);

        if (tCategoriesResult.recordset.length > 0) {
            console.log('找到以下 t 系列分類:');
            tCategoriesResult.recordset.forEach(row => {
                console.log(`- ID ${row.id}: ${row.name} (${row.description || '無描述'})`);
            });
        } else {
            console.log('❌ 沒有找到 t1, t2 等分類');
        }

        // 4. 檢查訂閱者與分類的關聯表
        console.log('\n4. 檢查訂閱者分類關聯表:');
        const relationTablesResult = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            AND (TABLE_NAME LIKE '%subscriber%category%' OR TABLE_NAME LIKE '%category%subscriber%' OR TABLE_NAME LIKE '%SubscriberCategories%')
        `);

        if (relationTablesResult.recordset.length > 0) {
            console.log('找到以下關聯表:');
            relationTablesResult.recordset.forEach(row => {
                console.log(`- ${row.TABLE_NAME}`);
            });

            // 檢查關聯表結構
            for (const table of relationTablesResult.recordset) {
                console.log(`\n${table.TABLE_NAME} 表結構:`);
                const tableStructure = await pool.request().query(`
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = '${table.TABLE_NAME}'
                    ORDER BY ORDINAL_POSITION
                `);
                tableStructure.recordset.forEach(col => {
                    console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}, ${col.IS_NULLABLE === 'YES' ? '可為空' : '不可為空'})`);
                });
            }
        } else {
            console.log('❌ 沒有找到訂閱者分類關聯表');
        }

        // 5. 檢查 Subscribers 表中是否有分類相關欄位
        console.log('\n5. 檢查 Subscribers 表中的分類相關欄位:');
        const subscriberCategoryFields = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'Subscribers'
            AND (COLUMN_NAME LIKE '%category%' OR COLUMN_NAME LIKE '%t1%' OR COLUMN_NAME LIKE '%t2%' OR COLUMN_NAME LIKE '%t3%' OR COLUMN_NAME LIKE '%t4%' OR COLUMN_NAME LIKE '%t5%' OR COLUMN_NAME LIKE '%t6%')
            ORDER BY COLUMN_NAME
        `);

        if (subscriberCategoryFields.recordset.length > 0) {
            console.log('找到以下分類相關欄位:');
            subscriberCategoryFields.recordset.forEach(col => {
                console.log(`- ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
            });
        } else {
            console.log('❌ Subscribers 表中沒有分類相關欄位');
        }

    } catch (error) {
        console.error('錯誤:', error.message);
    } finally {
        await pool.close();
    }
}

checkCategoriesComplete();