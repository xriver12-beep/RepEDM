const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function clearSubscribers() {
    try {
        console.log('正在連接到資料庫...');
        await sql.connect(config);
        
        // 先檢查目前的記錄數量
        const countResult = await sql.query('SELECT COUNT(*) as count FROM [WintonEDM].[dbo].[Subscribers]');
        const currentCount = countResult.recordset[0].count;
        console.log(`目前 Subscribers 表中有 ${currentCount} 筆記錄`);
        
        if (currentCount > 0) {
            // 使用 TRUNCATE 快速清除所有資料（比 DELETE 更快）
            console.log('正在清除 Subscribers 資料...');
            try {
                await sql.query('TRUNCATE TABLE [WintonEDM].[dbo].[Subscribers]');
                console.log('✅ Subscribers 資料已成功清除（使用 TRUNCATE）');
            } catch (truncateError) {
                console.log('TRUNCATE 失敗，改用批次刪除...');
                // 如果 TRUNCATE 失敗，使用批次刪除
                let deletedCount = 0;
                const batchSize = 10000;
                
                while (true) {
                    const result = await sql.query(`
                        DELETE TOP (${batchSize}) FROM [WintonEDM].[dbo].[Subscribers]
                    `);
                    
                    if (result.rowsAffected[0] === 0) {
                        break;
                    }
                    
                    deletedCount += result.rowsAffected[0];
                    console.log(`已刪除 ${deletedCount} 筆記錄...`);
                    
                    // 短暫暫停避免資料庫負載過重
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 重置自動遞增 ID
                await sql.query('DBCC CHECKIDENT (\'[WintonEDM].[dbo].[Subscribers]\', RESEED, 0)');
                console.log('✅ ID 自動遞增已重置為 0');
            }
        } else {
            console.log('ℹ️  Subscribers 表已經是空的');
        }
        
        // 再次確認清除結果
        const finalCountResult = await sql.query('SELECT COUNT(*) as count FROM [WintonEDM].[dbo].[Subscribers]');
        const finalCount = finalCountResult.recordset[0].count;
        console.log(`清除後 Subscribers 表中有 ${finalCount} 筆記錄`);
        
    } catch (error) {
        console.error('清除 Subscribers 資料時發生錯誤:', error);
    } finally {
        await sql.close();
        console.log('資料庫連接已關閉');
    }
}

clearSubscribers();