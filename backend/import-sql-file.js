const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 資料庫配置
const dbConfig = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 30000,
        connectionTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// 工具函數
function cleanEmailAddress(email) {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase().replace(/['"]/g, '');
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function splitName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return { firstName: '', lastName: '' };
    }
    
    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/);
    
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    } else {
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
}

function parseValue(value) {
    if (!value || value === 'NULL') return null;
    
    // 移除引號
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1);
    }
    
    return value;
}

function parseValuesLine(line) {
    // 匹配 (value1, value2, value3, ...) 格式
    const match = line.match(/^\s*\((.*)\),?\s*$/);
    if (!match) return null;
    
    const valuesString = match[1];
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let parenLevel = 0;
    
    for (let i = 0; i < valuesString.length; i++) {
        const char = valuesString[i];
        const nextChar = valuesString[i + 1];
        
        // 處理轉義字符
        if (char === '\\' && nextChar) {
            current += char + nextChar;
            i++; // 跳過下一個字符
            continue;
        }
        
        // 處理引號
        if (!inQuotes && (char === "'" || char === '"')) {
            inQuotes = true;
            quoteChar = char;
            current += char;
            continue;
        }
        
        if (inQuotes && char === quoteChar) {
            // 檢查是否是轉義的引號
            if (nextChar === quoteChar) {
                current += char + nextChar;
                i++; // 跳過下一個字符
                continue;
            } else {
                inQuotes = false;
                quoteChar = '';
                current += char;
                continue;
            }
        }
        
        // 處理括號
        if (!inQuotes && char === '(') {
            parenLevel++;
        } else if (!inQuotes && char === ')') {
            parenLevel--;
        }
        
        // 處理逗號分隔
        if (!inQuotes && char === ',' && parenLevel === 0) {
            values.push(parseValue(current.trim()));
            current = '';
            continue;
        }
        
        current += char;
    }
    
    // 添加最後一個值
    if (current.trim()) {
        values.push(parseValue(current.trim()));
    }
    
    return values;
}

async function importSqlFile(sqlFilePath) {
    let newDbPool;
    
    try {
        console.log('🔌 連接到新資料庫...');
        newDbPool = await sql.connect(dbConfig);
        console.log('✅ 新資料庫連接成功');
        
        // 檢查 Subscribers 表是否存在
        const tableCheck = await newDbPool.request()
            .query("SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Subscribers'");
        
        if (tableCheck.recordset[0].count === 0) {
            throw new Error('Subscribers 表不存在，請先執行資料庫初始化');
        }
        
        console.log('📖 讀取 SQL 文件...');
        const content = fs.readFileSync(sqlFilePath, 'utf8');
        const lines = content.split('\n');
        
        console.log(`📄 SQL 文件共有 ${lines.length.toLocaleString()} 行`);
        
        let totalProcessed = 0;
        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        let currentBatch = [];
        let batchNumber = 1;
        let inInsertStatement = false;
        let columnOrder = [];
        
        const BATCH_SIZE = 500;
        
        console.log('🔍 開始解析 SQL 文件...');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 跳過空行和註釋
            if (!line || line.startsWith('--') || line.startsWith('/*') || line.startsWith('*/')) {
                continue;
            }
            
            // 跳過 SQL 設定語句
            if (line.toUpperCase().startsWith('SET ') || 
                line.toUpperCase().startsWith('/*!') ||
                line.toUpperCase().startsWith('CREATE TABLE') ||
                line.toUpperCase().startsWith('DROP TABLE')) {
                continue;
            }
            
            // 檢查是否為 INSERT INTO 語句的開始
            if (line.includes('INSERT INTO') && line.includes('epaper_member')) {
                console.log(`🔍 找到 INSERT INTO 語句: ${line.substring(0, 100)}...`);
                inInsertStatement = true;
                
                // 解析欄位順序
                const fieldsMatch = line.match(/\(`([^`]+)`(?:,\s*`([^`]+)`)*\)/);
                if (fieldsMatch) {
                    const fieldsStr = line.match(/\(([^)]+)\)/)[1];
                    columnOrder = fieldsStr.split(',').map(field => field.trim().replace(/`/g, ''));
                    console.log(`📋 欄位順序: ${columnOrder.join(', ')}`);
                }
                continue;
            }
            
            // 如果在 INSERT 語句中，處理 VALUES 行
            if (inInsertStatement) {
                // 檢查是否是語句結束
                if (line.includes(';')) {
                    inInsertStatement = false;
                    continue;
                }
                
                const values = parseValuesLine(line);
                
                if (values && values.length === columnOrder.length) {
                    // 建立資料對象
                    const memberData = {};
                    columnOrder.forEach((col, index) => {
                        memberData[col] = values[index];
                    });
                    
                    currentBatch.push(memberData);
                    totalProcessed++;
                    
                    // 當批次達到指定大小時處理
                    if (currentBatch.length >= BATCH_SIZE) {
                        const result = await processBatch(currentBatch, batchNumber, newDbPool);
                        successCount += result.success;
                        duplicateCount += result.duplicates;
                        errorCount += result.errors;
                        
                        currentBatch = [];
                        batchNumber++;
                        
                        // 批次間延遲
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
        }
        
        // 處理剩餘的批次
        if (currentBatch.length > 0) {
            const result = await processBatch(currentBatch, batchNumber, newDbPool);
            successCount += result.success;
            duplicateCount += result.duplicates;
            errorCount += result.errors;
        }
        
        // 獲取最終統計
        const finalCount = await newDbPool.request()
            .query('SELECT COUNT(*) as total FROM Subscribers');
        
        console.log('\n=== 匯入結果統計 ===');
        console.log(`✅ 成功匯入: ${successCount.toLocaleString()} 筆`);
        console.log(`🔄 重複跳過: ${duplicateCount.toLocaleString()} 筆`);
        console.log(`❌ 錯誤跳過: ${errorCount.toLocaleString()} 筆`);
        console.log(`📊 總處理: ${totalProcessed.toLocaleString()} 筆`);
        console.log(`🎯 資料庫中總訂閱者數量: ${finalCount.recordset[0].total.toLocaleString()}`);
        console.log(`📈 本次新增: ${successCount.toLocaleString()} 筆記錄`);
        
    } catch (error) {
        console.error('❌ 匯入過程中發生錯誤:', error.message);
        throw error;
    } finally {
        if (newDbPool) {
            await newDbPool.close();
            console.log('\n🔌 資料庫連接已關閉');
        }
    }
}

async function processBatch(batch, batchNumber, pool) {
    console.log(`📦 處理第 ${batchNumber} 批，共 ${batch.length} 筆資料`);
    
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
        for (const memberData of batch) {
            try {
                // 清理和驗證 email
                const cleanEmail = cleanEmailAddress(memberData.email);
                if (!cleanEmail || !isValidEmail(cleanEmail)) {
                    errorCount++;
                    continue;
                }
                
                // 檢查是否已存在
                const existingCheck = await transaction.request()
                    .input('email', sql.VarChar, cleanEmail)
                    .query('SELECT id FROM Subscribers WHERE email = @email');
                
                if (existingCheck.recordset.length > 0) {
                    duplicateCount++;
                    continue;
                }
                
                // 處理姓名分割
                const { firstName, lastName } = splitName(memberData.name || '');
                
                // 準備自定義欄位
                const customFields = {
                    company: memberData.company || '',
                    birthday: memberData.birthday || null,
                    f1: memberData.f1 || '',
                    f2: memberData.f2 || '',
                    f3: memberData.f3 || '',
                    f4: memberData.f4 || '',
                    f5: memberData.f5 || '',
                    f6: memberData.f6 || '',
                    cust_id: memberData.cust_id || '',
                    original_id: memberData.id
                };
                
                // 插入新記錄
                await transaction.request()
                    .input('email', sql.VarChar, cleanEmail)
                    .input('firstName', sql.VarChar, firstName)
                    .input('lastName', sql.VarChar, lastName)
                    .input('status', sql.VarChar, 'subscribed')
                    .input('customFields', sql.NVarChar, JSON.stringify(customFields))
                    .query(`
                        INSERT INTO Subscribers (email, first_name, last_name, status, custom_fields, created_at, updated_at, subscribed_at)
                        VALUES (@email, @firstName, @lastName, @status, @customFields, GETDATE(), GETDATE(), GETDATE())
                    `);
                
                successCount++;
                
            } catch (error) {
                console.log(`⚠️  處理記錄時發生錯誤: ${error.message}`);
                errorCount++;
            }
        }
        
        await transaction.commit();
        console.log(`✅ 第 ${batchNumber} 批處理完成 - 成功: ${successCount}, 重複: ${duplicateCount}, 錯誤: ${errorCount}`);
        
    } catch (error) {
        await transaction.rollback();
        console.error(`❌ 第 ${batchNumber} 批處理失敗:`, error.message);
        errorCount = batch.length;
    }
    
    return { success: successCount, duplicates: duplicateCount, errors: errorCount };
}

// 執行匯入
if (require.main === module) {
    const sqlFilePath = process.argv[2] || path.join(__dirname, 'epaper_member.sql');
    
    console.log('🚀 開始 SQL 文件匯入程序...');
    console.log(`📁 SQL 文件路徑: ${sqlFilePath}`);
    
    if (!fs.existsSync(sqlFilePath)) {
        console.error(`❌ 文件不存在: ${sqlFilePath}`);
        process.exit(1);
    }
    
    importSqlFile(sqlFilePath)
        .then(() => {
            console.log('\n🎉 SQL 文件匯入完成！');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 匯入失敗:', error.message);
            process.exit(1);
        });
}

module.exports = { importSqlFile };