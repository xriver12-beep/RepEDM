require('dotenv').config();
const sql = require('mssql');

async function checkOriginalFields() {
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
        console.log('檢查 subscribers 表中的 original_ 欄位...\n');

        // 查詢表結構
        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'Subscribers' 
            AND COLUMN_NAME LIKE 'original_%'
            ORDER BY COLUMN_NAME
        `);
        const columns = result.recordset;

        if (columns.length === 0) {
            console.log('❌ 沒有找到任何 original_ 開頭的欄位');
        } else {
            console.log('✅ 找到以下 original_ 欄位:');
            console.log('欄位名稱\t\t資料類型\t\t可為空\t\t預設值');
            console.log('─'.repeat(80));
            
            columns.forEach(col => {
                console.log(`${col.COLUMN_NAME.padEnd(20)}\t${col.DATA_TYPE.padEnd(15)}\t${col.IS_NULLABLE.padEnd(10)}\t${col.COLUMN_DEFAULT || 'NULL'}`);
            });
        }

        // 檢查這些欄位是否有資料
        if (columns.length > 0) {
            console.log('\n檢查欄位中的資料數量:');
            for (const col of columns) {
                const dataResult = await pool.request().query(`
                    SELECT COUNT(*) as count 
                    FROM Subscribers 
                    WHERE ${col.COLUMN_NAME} IS NOT NULL 
                    AND ${col.COLUMN_NAME} != ''
                `);
                console.log(`${col.COLUMN_NAME}: ${dataResult.recordset[0].count} 條非空記錄`);
            }
        }

    } catch (error) {
        console.error('錯誤:', error.message);
    } finally {
        await pool.close();
    }
}

checkOriginalFields();