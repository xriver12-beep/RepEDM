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
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 30000
    },
    pool: {
        max: 20,
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

function parseValuesLine(line) {
    // 移除開頭的 "(" 和結尾的 ")," 或 ");"
    let content = line.trim();
    if (content.startsWith('(')) content = content.substring(1);
    if (content.endsWith('),')) content = content.substring(0, content.length - 2);
    else if (content.endsWith(');')) content = content.substring(0, content.length - 2);
    else if (content.endsWith(')')) content = content.substring(0, content.length - 1);
    
    const values = [];
    let currentVal = '';
    let inQuote = false;
    let escape = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        
        if (escape) {
            currentVal += char;
            escape = false;
            continue;
        }
        
        if (char === '\\') {
            escape = true;
            continue;
        }
        
        if (char === "'") {
            inQuote = !inQuote;
            continue;
        }
        
        if (char === ',' && !inQuote) {
            values.push(currentVal.trim());
            currentVal = '';
            continue;
        }
        
        currentVal += char;
    }
    values.push(currentVal.trim());
    
    return values.map(v => {
        if (v === 'NULL') return null;
        return v.replace(/^'|'$/g, ''); // 移除周圍的引號
    });
}

async function processBatch(batch, batchNumber, pool) {
    console.log(`📦 處理第 ${batchNumber} 批，共 ${batch.length} 筆資料`);
    
    let successCount = 0;
    let updateCount = 0;
    let errorCount = 0;
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
        for (const memberData of batch) {
            try {
                const cleanEmail = cleanEmailAddress(memberData.email);
                if (!cleanEmail || !isValidEmail(cleanEmail)) {
                    errorCount++;
                    continue;
                }
                
                // 準備資料
                const { firstName, lastName } = splitName(memberData.name || '');
                const customFields = {
                    company: memberData.company || '',
                    birthday: memberData.birthday || null,
                    f1: parseInt(memberData.f1) || 0,
                    f2: parseInt(memberData.f2) || 0,
                    f3: parseInt(memberData.f3) || 0,
                    f4: parseInt(memberData.f4) || 0,
                    f5: parseInt(memberData.f5) || 0,
                    f6: memberData.f6 || '',
                    cust_id: memberData.cust_id || '',
                    original_id: memberData.id
                };

                // 檢查是否已存在
                const existingCheck = await transaction.request()
                    .input('email', sql.VarChar, cleanEmail)
                    .query('SELECT id, custom_fields FROM Subscribers WHERE email = @email');
                
                if (existingCheck.recordset.length > 0) {
                    // 更新現有記錄
                    const existingId = existingCheck.recordset[0].id;
                    let existingCustomFields = {};
                    try {
                        existingCustomFields = JSON.parse(existingCheck.recordset[0].custom_fields || '{}');
                    } catch (e) {}

                    // 合併 custom_fields (優先使用新資料)
                    const mergedCustomFields = { ...existingCustomFields, ...customFields };
                    
                    // 特別確保 f1 更新
                    mergedCustomFields.f1 = customFields.f1;

                    await transaction.request()
                        .input('id', sql.Int, existingId)
                        .input('f1', sql.Int, customFields.f1)
                        .input('customFields', sql.NVarChar, JSON.stringify(mergedCustomFields))
                        .query(`
                            UPDATE Subscribers 
                            SET f1 = @f1, 
                                custom_fields = @customFields,
                                updated_at = GETDATE()
                            WHERE id = @id
                        `);
                    
                    updateCount++;
                } else {
                    // 插入新記錄
                    await transaction.request()
                        .input('email', sql.VarChar, cleanEmail)
                        .input('firstName', sql.VarChar, firstName)
                        .input('lastName', sql.VarChar, lastName)
                        .input('status', sql.VarChar, 'subscribed')
                        .input('f1', sql.Int, customFields.f1)
                        .input('customFields', sql.NVarChar, JSON.stringify(customFields))
                        .query(`
                            INSERT INTO Subscribers (email, first_name, last_name, status, f1, custom_fields, created_at, updated_at, subscribed_at)
                            VALUES (@email, @firstName, @lastName, @status, @f1, @customFields, GETDATE(), GETDATE(), GETDATE())
                        `);
                    
                    successCount++;
                }
                
            } catch (error) {
                console.log(`⚠️  處理記錄時發生錯誤 (${memberData.email}): ${error.message}`);
                errorCount++;
            }
        }
        
        await transaction.commit();
        console.log(`✅ 第 ${batchNumber} 批 - 新增: ${successCount}, 更新: ${updateCount}, 錯誤: ${errorCount}`);
        
    } catch (error) {
        await transaction.rollback();
        console.error(`❌ 第 ${batchNumber} 批交易失敗:`, error.message);
        errorCount = batch.length;
    }
    
    return { success: successCount, updated: updateCount, errors: errorCount };
}

async function importSqlFile(sqlFilePath) {
    let pool;
    try {
        console.log('🔌 連接資料庫...');
        pool = await sql.connect(dbConfig);
        console.log('✅ 資料庫連接成功');
        
        console.log(`📖 讀取 SQL 文件: ${sqlFilePath}`);
        const content = fs.readFileSync(sqlFilePath, 'utf8');
        const lines = content.split('\n');
        
        let totalProcessed = 0;
        let successCount = 0;
        let updateCount = 0;
        let errorCount = 0;
        let currentBatch = [];
        let batchNumber = 1;
        let inInsertStatement = false;
        let columnOrder = [];
        
        const BATCH_SIZE = 500;
        
        // Hardcoded column order from schema
        const defaultColumns = ['id', 'company', 'name', 'email', 'birthday', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'cust_id'];
        columnOrder = defaultColumns;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('--') || line.startsWith('/*') || line.startsWith('*/') || 
                line.toUpperCase().startsWith('SET ') || line.toUpperCase().startsWith('/*!') ||
                line.toUpperCase().startsWith('CREATE TABLE') || line.toUpperCase().startsWith('DROP TABLE') ||
                line.toUpperCase().startsWith('LOCK TABLES') || line.toUpperCase().startsWith('UNLOCK TABLES') ||
                line.toUpperCase().startsWith('ALTER TABLE')) {
                continue;
            }
            
            // Handle INSERT INTO lines - just to detect we are in data section, but we rely on line format
            if (line.toUpperCase().startsWith('INSERT INTO')) {
                continue;
            }

            // Identify value lines: start with ( and end with ), or );
            // Also ensure it's not a CREATE TABLE part (which might have parens)
            if (line.startsWith('(') && (line.endsWith('),') || line.endsWith(');'))) {
                const values = parseValuesLine(line);
                
                // Flexible column matching: 
                // If values match defaultColumns length (12), use it.
                // If not, log warning but try to process if it has enough critical fields (email is index 3)
                
                if (values && values.length === defaultColumns.length) {
                    const memberData = {};
                    defaultColumns.forEach((col, index) => {
                        memberData[col] = values[index];
                    });
                    
                    currentBatch.push(memberData);
                    totalProcessed++;
                    
                    if (currentBatch.length >= BATCH_SIZE) {
                        const result = await processBatch(currentBatch, batchNumber, pool);
                        successCount += result.success;
                        updateCount += result.updated;
                        errorCount += result.errors;
                        currentBatch = [];
                        batchNumber++;
                    }
                } else {
                    console.log(`⚠️ 跳過格式不符的行 (欄位數: ${values ? values.length : 0}, 預期: ${defaultColumns.length}): ${line.substring(0, 50)}...`);
                }
            }
        }
        
        if (currentBatch.length > 0) {
            const result = await processBatch(currentBatch, batchNumber, pool);
            successCount += result.success;
            updateCount += result.updated;
            errorCount += result.errors;
        }
        
        console.log('\n=== 匯入統計 ===');
        console.log(`總處理: ${totalProcessed}`);
        console.log(`新增: ${successCount}`);
        console.log(`更新: ${updateCount}`);
        console.log(`錯誤: ${errorCount}`);
        
    } catch (err) {
        console.error('執行錯誤:', err);
    } finally {
        if (pool) await pool.close();
    }
}

// 執行
const filePath = process.argv[2];
if (!filePath) {
    console.error('請提供 SQL 文件路徑');
    process.exit(1);
}

importSqlFile(filePath);
