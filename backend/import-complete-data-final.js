const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    pool: {
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000
    },
    requestTimeout: 600000 // 10 分鐘超時
};

// 分類類型對應
const categoryTypes = {
    'epaper_member_t1': 't1',
    'epaper_member_t2': 't2',
    'epaper_member_t3': 't3',
    'epaper_member_t4': 't4',
    'epaper_member_t5': 't5',
    'epaper_member_t6': 't6'
};

// 清理和驗證 email
function cleanEmail(email) {
    if (!email || typeof email !== 'string') return null;
    email = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? email : null;
}

// 分割姓名
function splitName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return { firstName: '', lastName: '' };
    }
    
    const name = fullName.trim();
    if (name.length <= 2) {
        return { firstName: name, lastName: '' };
    } else {
        return { firstName: name.substring(1), lastName: name.substring(0, 1) };
    }
}

// 解析 SQL INSERT 語句中的值
function parseValues(valuesStr) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let parenLevel = 0;
    
    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        
        if (char === '(' && !inQuotes) {
            parenLevel++;
            if (parenLevel === 1) {
                current = '';
                continue;
            }
        } else if (char === ')' && !inQuotes) {
            parenLevel--;
            if (parenLevel === 0) {
                if (current.trim()) {
                    values.push(parseRow(current));
                }
                current = '';
                continue;
            }
        }
        
        if (parenLevel > 0) {
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
                if (i + 1 < valuesStr.length && valuesStr[i + 1] === quoteChar) {
                    current += char;
                    i++; // 跳過下一個引號
                } else {
                    inQuotes = false;
                    quoteChar = '';
                }
            } else {
                current += char;
            }
        }
    }
    
    return values;
}

// 解析單行資料
function parseRow(rowStr) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < rowStr.length; i++) {
        const char = rowStr[i];
        
        if ((char === '"' || char === "'") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
            if (i + 1 < rowStr.length && rowStr[i + 1] === quoteChar) {
                current += char;
                i++; // 跳過下一個引號
            } else {
                inQuotes = false;
                quoteChar = '';
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    if (current.trim()) {
        values.push(current.trim());
    }
    
    return values.map(val => {
        val = val.trim();
        if (val === 'NULL' || val === '') return null;
        if (val.startsWith("'") && val.endsWith("'")) {
            return val.slice(1, -1).replace(/''/g, "'");
        }
        if (val.startsWith('"') && val.endsWith('"')) {
            return val.slice(1, -1).replace(/""/g, '"');
        }
        return val;
    });
}

// 使用 MERGE 語句進行 UPSERT 會員資料
async function upsertMembersBatch(members) {
    if (members.length === 0) return 0;
    
    const request = new sql.Request();
    let successCount = 0;
    
    for (const member of members) {
        try {
            await request.query`
                MERGE Subscribers AS target
                USING (VALUES (
                    ${member.email},
                    ${member.firstName},
                    ${member.lastName},
                    ${member.company},
                    ${member.birthDate},
                    ${member.originalId},
                    ${member.f1},
                    ${member.f2},
                    ${member.f3},
                    ${member.f4},
                    ${member.f5},
                    ${member.f6},
                    ${member.custId}
                )) AS source (email, first_name, last_name, company, birth_date, original_id, original_f1, original_f2, original_f3, original_f4, original_f5, original_f6, cust_id)
                ON target.email = source.email
                WHEN MATCHED THEN
                    UPDATE SET
                        first_name = source.first_name,
                        last_name = source.last_name,
                        company = source.company,
                        birth_date = source.birth_date,
                        original_id = source.original_id,
                        original_f1 = source.original_f1,
                        original_f2 = source.original_f2,
                        original_f3 = source.original_f3,
                        original_f4 = source.original_f4,
                        original_f5 = source.original_f5,
                        original_f6 = source.original_f6,
                        cust_id = source.cust_id,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (email, first_name, last_name, company, birth_date, status, original_id, original_f1, original_f2, original_f3, original_f4, original_f5, original_f6, cust_id, subscribed_at, created_at, updated_at)
                    VALUES (source.email, source.first_name, source.last_name, source.company, source.birth_date, 'subscribed', source.original_id, source.original_f1, source.original_f2, source.original_f3, source.original_f4, source.original_f5, source.original_f6, source.cust_id, GETDATE(), GETDATE(), GETDATE());
            `;
            successCount++;
        } catch (error) {
            console.error(`UPSERT 會員失敗 (${member.email}):`, error.message);
        }
    }
    
    return successCount;
}

// 匯入會員資料（使用 UPSERT）
async function importMembersWithUpsert() {
    console.log('\n👥 開始 UPSERT 會員資料...');
    
    const filePath = 'C:\\WintonEDM\\sqlbak\\epaper_member.sql';
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`會員資料文件不存在: ${filePath}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const insertMatches = content.match(/INSERT INTO[^;]+;/gs);
    
    if (!insertMatches) {
        throw new Error('未找到會員資料 INSERT 語句');
    }
    
    console.log(`找到 ${insertMatches.length} 個 INSERT 語句`);
    
    let totalProcessed = 0;
    let successCount = 0;
    let skipCount = 0;
    
    const batchSize = 100; // 減小批次大小以避免超時
    let memberBatch = [];
    
    for (let i = 0; i < insertMatches.length; i++) {
        const insertStatement = insertMatches[i];
        const valuesMatch = insertStatement.match(/VALUES\s*(.+)/s);
        if (!valuesMatch) continue;
        
        const rows = parseValues(valuesMatch[1]);
        
        for (const row of rows) {
            if (row.length >= 12) {
                const [id, company, name, email, birthday, f1, f2, f3, f4, f5, f6, custId] = row;
                
                const cleanedEmail = cleanEmail(email);
                if (!cleanedEmail) {
                    skipCount++;
                    totalProcessed++;
                    continue;
                }
                
                const { firstName, lastName } = splitName(name);
                
                // 處理生日
                let birthDate = null;
                if (birthday && birthday !== '0000-00-00') {
                    try {
                        birthDate = new Date(birthday);
                        if (isNaN(birthDate.getTime())) birthDate = null;
                    } catch (e) {
                        birthDate = null;
                    }
                }
                
                memberBatch.push({
                    originalId: parseInt(id),
                    company: company || null,
                    firstName,
                    lastName,
                    email: cleanedEmail,
                    birthDate,
                    f1: parseInt(f1) || null,
                    f2: parseInt(f2) || null,
                    f3: parseInt(f3) || null,
                    f4: parseInt(f4) || null,
                    f5: parseInt(f5) || null,
                    f6: f6 || null,
                    custId: custId || null
                });
                
                if (memberBatch.length >= batchSize) {
                    const inserted = await upsertMembersBatch(memberBatch);
                    successCount += inserted;
                    totalProcessed += memberBatch.length;
                    
                    if (totalProcessed % 1000 === 0) {
                        console.log(`已處理 ${totalProcessed} 筆記錄，成功 UPSERT ${successCount} 筆...`);
                    }
                    
                    memberBatch = [];
                }
            }
        }
        
        if ((i + 1) % 50 === 0) {
            console.log(`已處理 ${i + 1}/${insertMatches.length} 個 INSERT 語句`);
        }
    }
    
    // 處理剩餘的批次
    if (memberBatch.length > 0) {
        const inserted = await upsertMembersBatch(memberBatch);
        successCount += inserted;
        totalProcessed += memberBatch.length;
    }
    
    console.log(`\n✅ 會員 UPSERT 完成:`);
    console.log(`   成功處理: ${successCount} 筆`);
    console.log(`   跳過無效: ${skipCount} 筆`);
    console.log(`   總計處理: ${totalProcessed} 筆`);
    
    return { successCount, skipCount, totalProcessed };
}

// 使用 INSERT 語句建立會員分類關聯
async function createMemberCategoryRelationsFixed() {
    console.log('\n🔗 開始建立會員分類關聯...');
    
    // 獲取所有分類的映射
    const categoryMap = new Map();
    const categoryResult = await sql.query`
        SELECT [id], [category_type], [original_id] 
        FROM Categories
    `;
    
    for (const cat of categoryResult.recordset) {
        const key = `${cat.category_type}_${cat.original_id}`;
        categoryMap.set(key, cat.id);
    }
    
    console.log(`載入 ${categoryMap.size} 個分類映射`);
    
    // 獲取所有會員
    const memberResult = await sql.query`
        SELECT [id], [original_f1], [original_f2], [original_f3], [original_f4], [original_f5]
        FROM Subscribers
        WHERE [original_id] IS NOT NULL
    `;
    
    console.log(`找到 ${memberResult.recordset.length} 個會員需要建立分類關聯`);
    
    const batchSize = 1000;
    let relationCount = 0;
    let currentBatch = [];
    
    for (const member of memberResult.recordset) {
        // 處理 f1-f5 分類關聯
        const categoryFields = [
            { type: 't1', value: member.original_f1 },
            { type: 't2', value: member.original_f2 },
            { type: 't3', value: member.original_f3 },
            { type: 't4', value: member.original_f4 },
            { type: 't5', value: member.original_f5 }
        ];
        
        for (const field of categoryFields) {
            if (field.value && field.value > 0) {
                const categoryKey = `${field.type}_${field.value}`;
                const categoryId = categoryMap.get(categoryKey);
                
                if (categoryId) {
                    currentBatch.push({
                        subscriberId: member.id,
                        categoryId: categoryId
                    });
                    
                    if (currentBatch.length >= batchSize) {
                        const inserted = await insertCategoryRelationsBatch(currentBatch);
                        relationCount += inserted;
                        
                        if (relationCount % 10000 === 0) {
                            console.log(`已建立 ${relationCount} 個關聯...`);
                        }
                        
                        currentBatch = [];
                    }
                }
            }
        }
    }
    
    // 處理剩餘的批次
    if (currentBatch.length > 0) {
        const inserted = await insertCategoryRelationsBatch(currentBatch);
        relationCount += inserted;
    }
    
    console.log(`✅ 會員分類關聯建立完成，總計: ${relationCount} 個關聯`);
    return relationCount;
}

// 批次插入分類關聯（使用 INSERT 語句）
async function insertCategoryRelationsBatch(relations) {
    if (relations.length === 0) return 0;
    
    try {
        const request = new sql.Request();
        const values = relations.map(r => `(${r.subscriberId}, ${r.categoryId}, GETDATE())`).join(',');
        
        const query = `
            INSERT INTO SubscriberCategories (subscriber_id, category_id, assigned_at)
            VALUES ${values}
        `;
        
        await request.query(query);
        return relations.length;
    } catch (error) {
        console.error('批次插入分類關聯失敗:', error.message);
        return 0;
    }
}

// 主要匯入函數
async function importCompleteDataFinal() {
    try {
        console.log('🚀 開始最終完整資料匯入...');
        console.log('📅 開始時間:', new Date().toLocaleString());
        
        await sql.connect(config);
        console.log('✅ 資料庫連接成功');
        
        // 1. 檢查分類是否已存在
        const categoryCount = await sql.query`SELECT COUNT(*) as count FROM Categories`;
        console.log(`📂 現有分類數量: ${categoryCount.recordset[0].count}`);
        
        // 2. UPSERT 會員資料
        const memberResult = await importMembersWithUpsert();
        
        // 3. 清理現有關聯（避免重複）
        console.log('\n🧹 清理現有分類關聯...');
        await sql.query`DELETE FROM SubscriberCategories`;
        
        // 4. 建立會員分類關聯
        const relationCount = await createMemberCategoryRelationsFixed();
        
        // 5. 統計最終結果
        const finalStats = await sql.query`
            SELECT 
                (SELECT COUNT(*) FROM Subscribers) as total_subscribers,
                (SELECT COUNT(*) FROM Categories) as total_categories,
                (SELECT COUNT(*) FROM SubscriberCategories) as total_relations
        `;
        
        const stats = finalStats.recordset[0];
        
        console.log('\n🎉 最終完整資料匯入完成！');
        console.log('📊 最終統計:');
        console.log(`   會員總數: ${stats.total_subscribers}`);
        console.log(`   分類總數: ${stats.total_categories}`);
        console.log(`   關聯總數: ${stats.total_relations}`);
        console.log('📅 完成時間:', new Date().toLocaleString());
        
    } catch (error) {
        console.error('❌ 匯入過程發生錯誤:', error);
        throw error;
    } finally {
        await sql.close();
        console.log('🔌 資料庫連接已關閉');
    }
}

// 執行匯入
importCompleteDataFinal().catch(console.error);