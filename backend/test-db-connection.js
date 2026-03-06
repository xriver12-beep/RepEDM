require('dotenv').config();
const mysql = require('mysql2/promise');
const sql = require('mssql');

// 舊資料庫配置（MySQL）
const oldDbConfig = {
    host: process.env.OLD_DB_SERVER || 'localhost',
    port: parseInt(process.env.OLD_DB_PORT) || 3306,
    database: process.env.OLD_DB_NAME || 'old_edm_database',
    user: process.env.OLD_DB_USER || 'root',
    password: process.env.OLD_DB_PASSWORD || 'password'
};

// 新資料庫配置（SQL Server）
const newDbConfig = {
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

async function testConnections() {
    console.log('=== 資料庫連接測試 ===\n');
    
    // 測試新資料庫連接
    console.log('1. 測試新資料庫連接 (SQL Server)...');
    try {
        const newDbPool = await sql.connect(newDbConfig);
        console.log('✅ 新資料庫連接成功');
        
        // 檢查 Subscribers 表
        const subscribersCount = await newDbPool.request().query('SELECT COUNT(*) as count FROM Subscribers');
        console.log(`   目前 Subscribers 表中有 ${subscribersCount.recordset[0].count} 筆資料`);
        
        await newDbPool.close();
    } catch (error) {
        console.log('❌ 新資料庫連接失敗:', error.message);
        return false;
    }
    
    console.log();
    
    // 測試舊資料庫連接
    console.log('2. 測試舊資料庫連接 (MySQL)...');
    console.log('   配置信息:');
    console.log(`   - 主機: ${oldDbConfig.host}`);
    console.log(`   - 端口: ${oldDbConfig.port}`);
    console.log(`   - 資料庫: ${oldDbConfig.database}`);
    console.log(`   - 用戶: ${oldDbConfig.user}`);
    
    try {
        const oldDbConnection = await mysql.createConnection(oldDbConfig);
        console.log('✅ 舊資料庫連接成功');
        
        // 檢查 member 表是否存在
        try {
            const [tables] = await oldDbConnection.execute("SHOW TABLES LIKE 'member'");
            if (tables.length > 0) {
                console.log('✅ member 表存在');
                
                // 獲取表結構
                const [columns] = await oldDbConnection.execute(`
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'member'
                    ORDER BY ORDINAL_POSITION
                `, [oldDbConfig.database]);
                
                console.log('   表結構:');
                columns.forEach(col => {
                    console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
                });
                
                // 獲取資料數量
                const [countResult] = await oldDbConnection.execute('SELECT COUNT(*) as total FROM member');
                console.log(`   資料數量: ${countResult[0].total.toLocaleString()} 筆`);
                
                // 檢查有效 email 數量
                const [emailCountResult] = await oldDbConnection.execute(`
                    SELECT COUNT(*) as valid_emails 
                    FROM member 
                    WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%'
                `);
                console.log(`   有效 email 數量: ${emailCountResult[0].valid_emails.toLocaleString()} 筆`);
                
                // 顯示前 5 筆資料樣本
                const [sampleData] = await oldDbConnection.execute(`
                    SELECT id, company, name, email, birthday, f1, f2, f3, f4, f5, f6, cust_id
                    FROM member 
                    WHERE email IS NOT NULL AND email != ''
                    LIMIT 5
                `);
                
                console.log('   資料樣本:');
                sampleData.forEach((row, index) => {
                    console.log(`   ${index + 1}. ID: ${row.id}, Email: ${row.email}, Name: ${row.name || 'N/A'}, Company: ${row.company || 'N/A'}`);
                });
                
            } else {
                console.log('❌ member 表不存在');
                return false;
            }
        } catch (tableError) {
            console.log('❌ 檢查 member 表時發生錯誤:', tableError.message);
            return false;
        }
        
        await oldDbConnection.end();
        
    } catch (error) {
        console.log('❌ 舊資料庫連接失敗:', error.message);
        console.log('   請檢查以下配置:');
        console.log('   1. 資料庫服務器是否運行');
        console.log('   2. 連接參數是否正確');
        console.log('   3. 用戶權限是否足夠');
        console.log('   4. 防火牆設置是否允許連接');
        return false;
    }
    
    console.log('\n✅ 所有連接測試完成');
    return true;
}

// 執行測試
if (require.main === module) {
    testConnections()
        .then(success => {
            if (success) {
                console.log('\n🎉 資料庫連接測試成功！可以開始執行資料匯入。');
                process.exit(0);
            } else {
                console.log('\n❌ 資料庫連接測試失敗，請檢查配置後重試。');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 測試過程中發生未預期的錯誤:', error);
            process.exit(1);
        });
}

module.exports = { testConnections };