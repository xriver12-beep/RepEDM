require('dotenv').config();
const sql = require('mssql');

async function removeOriginalFields() {
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
        console.log('開始移除 original_ 欄位...\n');

        // 要移除的欄位列表
        const fieldsToRemove = [
            'original_id',
            'original_f1',
            'original_f2',
            'original_f3',
            'original_f4',
            'original_f5',
            'original_f6'
        ];

        // 逐一移除欄位
        for (const fieldName of fieldsToRemove) {
            try {
                console.log(`正在移除欄位: ${fieldName}`);
                
                // 檢查欄位是否存在
                const checkResult = await pool.request().query(`
                    SELECT COUNT(*) as count
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = 'dbo' 
                    AND TABLE_NAME = 'Subscribers' 
                    AND COLUMN_NAME = '${fieldName}'
                `);

                if (checkResult.recordset[0].count > 0) {
                    // 移除欄位
                    await pool.request().query(`
                        ALTER TABLE Subscribers 
                        DROP COLUMN ${fieldName}
                    `);
                    console.log(`✅ 成功移除欄位: ${fieldName}`);
                } else {
                    console.log(`⚠️  欄位 ${fieldName} 不存在，跳過`);
                }
                
            } catch (fieldError) {
                console.error(`❌ 移除欄位 ${fieldName} 時發生錯誤:`, fieldError.message);
            }
        }

        console.log('\n移除操作完成！');

        // 驗證移除結果
        console.log('\n驗證移除結果...');
        const verifyResult = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'Subscribers' 
            AND COLUMN_NAME LIKE 'original_%'
            ORDER BY COLUMN_NAME
        `);

        if (verifyResult.recordset.length === 0) {
            console.log('✅ 所有 original_ 欄位已成功移除');
        } else {
            console.log('⚠️  仍有以下 original_ 欄位存在:');
            verifyResult.recordset.forEach(row => {
                console.log(`   - ${row.COLUMN_NAME}`);
            });
        }

    } catch (error) {
        console.error('錯誤:', error.message);
    } finally {
        await pool.close();
    }
}

removeOriginalFields();