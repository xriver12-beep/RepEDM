require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'edm2022',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'WintonEDM_bak',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Wint0n2k00',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000 
    }
};

const FILES_TO_PROCESS = [
    'C:\\WintonEDM\\sqlbak\\epaper_member (2).sql',
    'C:\\WintonEDM\\sqlbak\\epaper_member (5).sql'
];

async function syncData() {
    let pool;
    try {
        console.log('Connecting to database...');
        pool = await sql.connect(config);
        console.log('Connected.');

        // 1. Load existing emails
        console.log('Loading existing subscribers...');
        const existingResult = await pool.request().query('SELECT id, email FROM Subscribers');
        const emailMap = new Map();
        existingResult.recordset.forEach(row => {
            if (row.email) emailMap.set(row.email.trim().toLowerCase(), row.id);
        });
        console.log(`Loaded ${emailMap.size} existing subscribers.`);

        // 2. Process each file
        for (const filePath of FILES_TO_PROCESS) {
            if (fs.existsSync(filePath)) {
                await processFile(filePath, pool, emailMap);
            } else {
                console.error(`File not found: ${filePath}`);
            }
        }

        console.log('All files processed.');

        // 3. Final Verification
        console.log('Verifying counts...');
        const result = await pool.request().query(`
            SELECT 
                SUM(CASE WHEN f1 = 11 THEN 1 ELSE 0 END) as count_11,
                SUM(CASE WHEN f1 = 12 THEN 1 ELSE 0 END) as count_12
            FROM Subscribers
        `);
        console.log('Final Counts:');
        console.log(`f1=11 (Target: 5764): ${result.recordset[0].count_11}`);
        console.log(`f1=12 (Target: 20215): ${result.recordset[0].count_12}`);

        // 4. Sync to SubscriberCategories
        console.log('Syncing Subscribers.f1 to SubscriberCategories...');
        await pool.request().query(`
            INSERT INTO SubscriberCategories (subscriber_id, category_id, assigned_at)
            SELECT id, f1, GETDATE()
            FROM Subscribers
            WHERE f1 IS NOT NULL AND f1 <> 0
            AND NOT EXISTS (
                SELECT 1 FROM SubscriberCategories sc 
                WHERE sc.subscriber_id = Subscribers.id AND sc.category_id = Subscribers.f1
            );
        `);
        console.log('SubscriberCategories sync complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (pool) await pool.close();
    }
}

async function processFile(filePath, pool, emailMap) {
    console.log(`\nProcessing file: ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let inInsert = false;
    let processedCount = 0;
    let updateCount = 0;
    let insertCount = 0;
    let batchUpdates = [];
    let batchInserts = [];
    const BATCH_SIZE = 1000;

    for await (const line of rl) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('INSERT INTO `epaper_member`')) {
            inInsert = true;
            if (trimmed.endsWith('VALUES')) continue;
        }
        
        if (inInsert) {
            if (trimmed.startsWith('(')) {
                let record = trimmed.replace(/[,;]$/, '');
                record = record.replace(/^\(/, '').replace(/\)$/, '');
                
                const parts = parseCSV(record);
                
                if (parts.length >= 11) {
                    const data = {
                        original_id: parseInt(parts[0]),
                        company: parts[1].replace(/'/g, ''),
                        name: parts[2].replace(/'/g, ''),
                        email: parts[3].replace(/'/g, ''),
                        birthday: parts[4].replace(/'/g, ''),
                        f1: parseInt(parts[5]),
                        f2: parseInt(parts[6]),
                        f3: parseInt(parts[7]),
                        f4: parseInt(parts[8]),
                        f5: parseInt(parts[9]),
                        f6: parts[10].replace(/'/g, ''),
                        cust_id: parts[11] ? parts[11].replace(/'/g, '') : ''
                    };

                    if (!data.email || data.email === '') continue;

                    const normalizedEmail = data.email.toLowerCase().trim();
                    if (emailMap.has(normalizedEmail)) {
                        batchUpdates.push({
                            ...data,
                            id: emailMap.get(normalizedEmail)
                        });
                    } else {
                        batchInserts.push(data);
                    }

                    processedCount++;
                }
            }
            
            if (trimmed.endsWith(';')) {
                inInsert = false;
            }
        }

        if (batchUpdates.length >= BATCH_SIZE) {
            await processBatchUpdates(pool, batchUpdates);
            updateCount += batchUpdates.length;
            batchUpdates = [];
            process.stdout.write(`U${updateCount} `);
        }

        if (batchInserts.length >= BATCH_SIZE) {
            await processBatchInserts(pool, batchInserts, emailMap);
            insertCount += batchInserts.length;
            batchInserts = [];
            process.stdout.write(`I${insertCount} `);
        }
    }

    if (batchUpdates.length > 0) {
        await processBatchUpdates(pool, batchUpdates);
        updateCount += batchUpdates.length;
    }
    if (batchInserts.length > 0) {
        await processBatchInserts(pool, batchInserts, emailMap);
        insertCount += batchInserts.length;
    }

    console.log(`\nFile completed: ${filePath}`);
    console.log(`Total processed from file: ${processedCount}`);
    console.log(`Updated: ${updateCount}`);
    console.log(`Inserted: ${insertCount}`);
}

async function processBatchUpdates(pool, items) {
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        
        for (const item of items) {
             const request = new sql.Request(transaction);
             request.input('id', sql.Int, item.id);
             request.input('company', sql.NVarChar, item.company);
             request.input('name', sql.NVarChar, item.name);
             request.input('f1', sql.Int, item.f1 || 0);
             request.input('f2', sql.Int, item.f2 || 0);
             request.input('f3', sql.Int, item.f3 || 0);
             request.input('f4', sql.Int, item.f4 || 0);
             request.input('f5', sql.Int, item.f5 || 0);
             request.input('f6', sql.NVarChar, item.f6);
             request.input('cust_id', sql.NVarChar, item.cust_id);
             
             let birthday = item.birthday;
             if (birthday === '0000-00-00') birthday = null;
             request.input('birthday', sql.Date, birthday);

             await request.query(`
                 UPDATE Subscribers SET 
                    company = @company,
                    first_name = @name,
                    f1 = @f1, f2 = @f2, f3 = @f3, f4 = @f4, f5 = @f5, f6 = @f6,
                    cust_id = @cust_id,
                    birthday = @birthday,
                    updated_at = GETDATE()
                 WHERE id = @id
             `);
        }

        await transaction.commit();
    } catch (err) {
        console.error('Update batch failed:', err);
        await transaction.rollback();
    }
}

async function processBatchInserts(pool, items, emailMap) {
    // console.log('Processing insert batch of size', items.length);
    for (const item of items) {
         try {
             const request = new sql.Request(pool);
             request.input('email', sql.NVarChar, item.email);
             request.input('company', sql.NVarChar, item.company);
             request.input('name', sql.NVarChar, item.name);
             request.input('f1', sql.Int, item.f1 || 0);
             request.input('f2', sql.Int, item.f2 || 0);
             request.input('f3', sql.Int, item.f3 || 0);
             request.input('f4', sql.Int, item.f4 || 0);
             request.input('f5', sql.Int, item.f5 || 0);
             request.input('f6', sql.NVarChar, item.f6);
             request.input('cust_id', sql.NVarChar, item.cust_id);
             request.input('original_id', sql.Int, item.original_id || null);
             
             let birthday = item.birthday;
             if (birthday === '0000-00-00') birthday = null;
             request.input('birthday', sql.Date, birthday);

             const result = await request.query(`
                 INSERT INTO Subscribers (
                    email, first_name, company, birthday,
                    f1, f2, f3, f4, f5, f6, cust_id, original_id,
                    status, created_at, updated_at
                 ) OUTPUT inserted.id VALUES (
                    @email, @name, @company, @birthday,
                    @f1, @f2, @f3, @f4, @f5, @f6, @cust_id, @original_id,
                    'active', GETDATE(), GETDATE()
                 )
             `);
             
             if (result.recordset && result.recordset[0] && result.recordset[0].id) {
                 emailMap.set(item.email.trim().toLowerCase(), result.recordset[0].id);
             }
             
         } catch (e) {
             // console.error('Single insert failed:', e.message);
         }
    }
}

function parseCSV(text) {
    const result = [];
    let current = '';
    let inQuote = false;
    let escape = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (escape) {
            current += char;
            escape = false;
        } else if (char === '\\') {
             current += char; 
        } else if (char === "'" && !inQuote) {
            inQuote = true;
        } else if (char === "'" && inQuote) {
            if (i + 1 < text.length && text[i+1] === "'") {
                current += "'";
                i++;
            } else {
                inQuote = false;
            }
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

syncData();
