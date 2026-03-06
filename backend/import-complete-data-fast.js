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

// 批量匯入分類資料
async function importCategoriesFast() {
    console.log('\n📂 開始批量匯入分類資料...');
    
    const sqlbakPath = 'C:\\WintonEDM\\sqlbak';
    let totalCategories = 0;
    
    for (const [tableName, categoryType] of Object.entries(categoryTypes)) {
        const filePath = path.join(sqlbakPath, `${tableName}.sql`);
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  文件不存在: ${filePath}`);
            continue;
        }
        
        console.log(`處理 ${tableName} (${categoryType})...`);
        
        const content = fs.readFileSync(filePath, 'utf8');
        const insertMatches = content.match(/INSERT INTO[^;]+;/gs);
        
        if (!insertMatches) {
            console.log(`⚠️  未找到 INSERT 語句: ${tableName}`);
            continue;
        }
        
        const categories = [];
        
        for (const insertStatement of insertMatches) {
            const valuesMatch = insertStatement.match(/VALUES\s*(.+)/s);
            if (!valuesMatch) continue;
            
            const rows = parseValues(valuesMatch[1]);
            
            for (const row of rows) {
                if (row.length >= 3) {
                    const [originalId, name, displayOrder] = row;
                    categories.push({
                        categoryType,
                        originalId: parseInt(originalId),
                        name,
                        displayOrder: parseInt(displayOrder) || 0
                    });
                }
            }
        }
        
        // 批量插入分類
        if (categories.length > 0) {
            const categoryCount = await bulkInsertCategories(categories);
            console.log(`✅ ${tableName}: 匯入 ${categoryCount} 個分類`);
            totalCategories += categoryCount;
        }
    }
    
    console.log(`\n✅ 分類匯入完成，總計: ${totalCategories} 個分類`);
    return totalCategories;
}

// 批量插入分類
async function bulkInsertCategories(categories) {
    const table = new sql.Table('Categories');
    table.create = false;
    
    table.columns.add('category_type', sql.NVarChar(20), { nullable: false });
    table.columns.add('original_id', sql.Int, { nullable: false });
    table.columns.add('name', sql.NVarChar(100), { nullable: false });
    table.columns.add('display_order', sql.Int, { nullable: true });
    
    for (const category of categories) {
        table.rows.add(
            category.categoryType,
            category.originalId,
            category.name,
            category.displayOrder
        );
    }
    
    try {
        const request = new sql.Request();
        await request.bulk(table);
        return categories.length;
    } catch (error) {
        console.error('批量插入分類失敗:', error.message);
        return 0;
    }
}

// 批量匯入會員資料
async function importMembersFast() {
    console.log('\n👥 開始批量匯入會員資料...');
    
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
    
    const batchSize = 5000; // 增大批次大小
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
                    const inserted = await bulkInsertMembers(memberBatch);
                    successCount += inserted;
                    totalProcessed += memberBatch.length;
                    
                    if (totalProcessed % 10000 === 0) {
                        console.log(`已處理 ${totalProcessed} 筆記錄，成功匯入 ${successCount} 筆...`);
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
        const inserted = await bulkInsertMembers(memberBatch);
        successCount += inserted;
        totalProcessed += memberBatch.length;
    }
    
    console.log(`\n✅ 會員匯入完成:`);
    console.log(`   成功匯入: ${successCount} 筆`);
    console.log(`   跳過無效: ${skipCount} 筆`);
    console.log(`   總計處理: ${totalProcessed} 筆`);
    
    return { successCount, skipCount, totalProcessed };
}

// 批量插入會員
async function bulkInsertMembers(members) {
    const table = new sql.Table('Subscribers');
    table.create = false;
    
    table.columns.add('email', sql.NVarChar(255), { nullable: false });
    table.columns.add('first_name', sql.NVarChar(100), { nullable: true });
    table.columns.add('last_name', sql.NVarChar(100), { nullable: true });
    table.columns.add('company', sql.NVarChar(255), { nullable: true });
    table.columns.add('birth_date', sql.Date, { nullable: true });
    table.columns.add('status', sql.NVarChar(20), { nullable: false });
    table.columns.add('original_id', sql.Int, { nullable: true });
    table.columns.add('original_f1', sql.Int, { nullable: true });
    table.columns.add('original_f2', sql.Int, { nullable: true });
    table.columns.add('original_f3', sql.Int, { nullable: true });
    table.columns.add('original_f4', sql.Int, { nullable: true });
    table.columns.add('original_f5', sql.Int, { nullable: true });
    table.columns.add('original_f6', sql.NVarChar(255), { nullable: true });
    table.columns.add('cust_id', sql.NVarChar(100), { nullable: true });
    table.columns.add('subscribed_at', sql.DateTime2, { nullable: false });
    table.columns.add('created_at', sql.DateTime2, { nullable: false });
    
    const now = new Date();
    
    for (const member of members) {
        table.rows.add(
            member.email,
            member.firstName,
            member.lastName,
            member.company,
            member.birthDate,
            'subscribed',
            member.originalId,
            member.f1,
            member.f2,
            member.f3,
            member.f4,
            member.f5,
            member.f6,
            member.custId,
            now,
            now
        );
    }
    
    try {
        const request = new sql.Request();
        await request.bulk(table);
        return members.length;
    } catch (error) {
        console.error('批量插入會員失敗:', error.message);
        return 0;
    }
}

// 批量建立會員分類關聯
async function createMemberCategoryRelationsFast() {
    console.log('\n🔗 開始批量建立會員分類關聯...');
    
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
    
    const batchSize = 10000;
    let relationBatch = [];
    let relationCount = 0;
    
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
                    relationBatch.push({
                        subscriberId: member.id,
                        categoryId: categoryId
                    });
                    
                    if (relationBatch.length >= batchSize) {
                        const inserted = await bulkInsertCategoryRelations(relationBatch);
                        relationCount += inserted;
                        
                        if (relationCount % 50000 === 0) {
                            console.log(`已建立 ${relationCount} 個關聯...`);
                        }
                        
                        relationBatch = [];
                    }
                }
            }
        }
    }
    
    // 處理剩餘的批次
    if (relationBatch.length > 0) {
        const inserted = await bulkInsertCategoryRelations(relationBatch);
        relationCount += inserted;
    }
    
    console.log(`✅ 會員分類關聯建立完成，總計: ${relationCount} 個關聯`);
    return relationCount;
}

// 批量插入分類關聯
async function bulkInsertCategoryRelations(relations) {
    const table = new sql.Table('SubscriberCategories');
    table.create = false;
    
    table.columns.add('subscriber_id', sql.Int, { nullable: false });
    table.columns.add('category_id', sql.Int, { nullable: false });
    table.columns.add('assigned_at', sql.DateTime2, { nullable: false });
    
    const now = new Date();
    
    for (const relation of relations) {
        table.rows.add(
            relation.subscriberId,
            relation.categoryId,
            now
        );
    }
    
    try {
        const request = new sql.Request();
        await request.bulk(table);
        return relations.length;
    } catch (error) {
        console.error('批量插入分類關聯失敗:', error.message);
        return 0;
    }
}

// 主要匯入函數
async function importCompleteDataFast() {
    try {
        console.log('🚀 開始高效能完整資料匯入...');
        console.log('📅 開始時間:', new Date().toLocaleString());
        
        await sql.connect(config);
        console.log('✅ 資料庫連接成功');
        
        // 1. 批量匯入分類資料
        const categoryCount = await importCategoriesFast();
        
        // 2. 批量匯入會員資料
        const memberResult = await importMembersFast();
        
        // 3. 批量建立會員分類關聯
        const relationCount = await createMemberCategoryRelationsFast();
        
        // 4. 統計最終結果
        const finalStats = await sql.query`
            SELECT 
                (SELECT COUNT(*) FROM Subscribers) as total_subscribers,
                (SELECT COUNT(*) FROM Categories) as total_categories,
                (SELECT COUNT(*) FROM SubscriberCategories) as total_relations
        `;
        
        const stats = finalStats.recordset[0];
        
        console.log('\n🎉 高效能完整資料匯入完成！');
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
importCompleteDataFast().catch(console.error);