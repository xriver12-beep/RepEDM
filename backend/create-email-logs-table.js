const { executeQuery, connectDB } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function createEmailLogsTable() {
    // 初始化資料庫連接
    await connectDB();
    try {
        console.log('開始創建郵件日誌表...');
        
        // 讀取 SQL 腳本
        const sqlScript = fs.readFileSync(
            path.join(__dirname, 'database', 'email-logs-schema.sql'), 
            'utf8'
        );
        
        // 分割 SQL 語句（以 GO 或分號分隔）
        const statements = sqlScript
            .split(/\bGO\b/gi)
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);
        
        // 執行每個語句
        for (const statement of statements) {
            if (statement.trim()) {
                console.log('執行 SQL:', statement.substring(0, 100) + '...');
                await executeQuery(statement);
            }
        }
        
        console.log('✅ 郵件日誌表創建成功！');
        
        // 驗證表是否創建成功
        const result = await executeQuery(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME IN ('EmailLogs')
        `);
        
        console.log('已創建的表:', result.recordset.map(r => r.TABLE_NAME));
        
        // 檢查視圖
        const viewResult = await executeQuery(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.VIEWS 
            WHERE TABLE_NAME IN ('EmailLogsSummary', 'DailyEmailStats')
        `);
        
        console.log('已創建的視圖:', viewResult.recordset.map(r => r.TABLE_NAME));
        
    } catch (error) {
        console.error('❌ 創建郵件日誌表失敗:', error);
        throw error;
    }
}

// 如果直接執行此腳本
if (require.main === module) {
    createEmailLogsTable()
        .then(() => {
            console.log('腳本執行完成');
            process.exit(0);
        })
        .catch(error => {
            console.error('腳本執行失敗:', error);
            process.exit(1);
        });
}

module.exports = { createEmailLogsTable };