require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'edm2022',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'WintonEDM',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Wint0n2k00',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 300000 // 5 minutes
    }
};

async function restoreData() {
    let pool;
    try {
        console.log('Connecting to MSSQL...');
        pool = await sql.connect(config);
        console.log('Connected.');

        // Truncate table
        console.log('Truncating Subscribers table...');
        await pool.request().query('TRUNCATE TABLE Subscribers');
        console.log('Truncated.');

        // Enable Identity Insert
        // Note: IDENTITY_INSERT is session scoped. We must execute INSERTs in the same connection/session.
        // mssql pool might use different connections.
        // So we should use a single Transaction or verify we use the same connection.
        // Actually, it's safer to use `pool.request()` which acquires a connection.
        // But for IDENTITY_INSERT, it must be the SAME connection.
        // We should use a Transaction.
        
        // But transaction for 100k rows is heavy.
        // Alternative: Use a single connection from the pool?
        // Or just don't set IDENTITY_INSERT if we map `id` -> `original_id`.
        // The dump has `id`. `Subscribers` has `original_id` and `id`.
        // `id` in Subscribers is likely the PK.
        // If I map dump `id` -> `original_id`, I can let MS SQL generate new `id`.
        // This is safer and easier.
        // AND `Subscribers` schema has `original_id`. It seems designed for this.
        // So I will map `id` (dump) -> `original_id` (db).
        // And I won't touch `id` (db).
        
        console.log('Starting import...');
        
        const fileStream = fs.createReadStream('C:\\WintonEDM\\sqlbak\\epaper_member.sql');
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let inInsert = false;
        let batch = [];
        const BATCH_SIZE = 1000;
        let totalInserted = 0;

        for await (const line of rl) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('INSERT INTO `epaper_member`')) {
                inInsert = true;
                if (trimmed.endsWith('VALUES')) continue;
            }
            
            if (inInsert) {
                if (trimmed.startsWith('(')) {
                    // Parse line
                    let recordStr = trimmed.replace(/[,;]$/, '');
                    recordStr = recordStr.replace(/^\(/, '').replace(/\)$/, '');
                    
                    const parts = parseCSV(recordStr);
                    
                    if (parts.length >= 11) {
                        // Map fields
                        // Dump: id, company, name, email, birthday, f1, f2, f3, f4, f5, f6, cust_id
                        const original_id = parseInt(parts[0]);
                        const company = parts[1];
                        const name = parts[2];
                        const email = parts[3];
                        let birthday = parts[4];
                        const f1 = parseInt(parts[5]) || 0;
                        const f2 = parseInt(parts[6]) || 0;
                        const f3 = parseInt(parts[7]) || 0;
                        const f4 = parseInt(parts[8]) || 0;
                        const f5 = parseInt(parts[9]) || 0;
                        const f6 = parts[10];
                        const cust_id = parts[11];

                        // Handle date
                        if (birthday === '0000-00-00') birthday = null;
                        
                        // Handle name split
                        let firstName = name;
                        let lastName = '';
                        if (name) {
                            if (/[\u4e00-\u9fff]/.test(name)) {
                                if (name.length > 1) {
                                    lastName = name.substring(0, 1);
                                    firstName = name.substring(1);
                                }
                            } else {
                                const spaceIdx = name.indexOf(' ');
                                if (spaceIdx > 0) {
                                    firstName = name.substring(0, spaceIdx);
                                    lastName = name.substring(spaceIdx + 1);
                                }
                            }
                        }

                        batch.push({
                            original_id, company, firstName, lastName, email, birthday,
                            f1, f2, f3, f4, f5, f6, cust_id
                        });

                        if (batch.length >= BATCH_SIZE) {
                            await insertBatch(pool, batch);
                            totalInserted += batch.length;
                            process.stdout.write(`\rInserted: ${totalInserted}`);
                            batch = [];
                        }
                    }
                }
                
                if (trimmed.endsWith(';')) {
                    inInsert = false;
                }
            }
        }

        if (batch.length > 0) {
            await insertBatch(pool, batch);
            totalInserted += batch.length;
            console.log(`\rInserted: ${totalInserted}`);
        }

        console.log('\nImport completed successfully.');

    } catch (err) {
        console.error('\nError:', err);
    } finally {
        if (pool) await pool.close();
    }
}

async function insertBatch(pool, batch) {
    const table = new sql.Table('Subscribers');
    table.create = false;
    
    // Define columns strictly matching the table
    // We only populate columns we have data for
    // But `sql.Table` bulk insert requires defining columns.
    // And columns must match the target table? Or just the ones we insert?
    // Bulk insert usually requires matching structure or mapping.
    // With `mssql`, we add columns to the table object.
    
    table.columns.add('original_id', sql.Int, { nullable: true });
    table.columns.add('company', sql.NVarChar(255), { nullable: true });
    table.columns.add('first_name', sql.NVarChar(100), { nullable: true });
    table.columns.add('last_name', sql.NVarChar(100), { nullable: true });
    table.columns.add('email', sql.NVarChar(255), { nullable: true });
    table.columns.add('birthday', sql.Date, { nullable: true });
    table.columns.add('f1', sql.Int, { nullable: true });
    table.columns.add('f2', sql.Int, { nullable: true });
    table.columns.add('f3', sql.Int, { nullable: true });
    table.columns.add('f4', sql.Int, { nullable: true });
    table.columns.add('f5', sql.Int, { nullable: true });
    table.columns.add('f6', sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add('cust_id', sql.NVarChar(100), { nullable: true });
    table.columns.add('status', sql.NVarChar(50), { nullable: true });
    table.columns.add('created_at', sql.DateTime2, { nullable: true });
    table.columns.add('updated_at', sql.DateTime2, { nullable: true });

    const now = new Date();

    batch.forEach(row => {
        table.rows.add(
            row.original_id,
            row.company,
            row.firstName,
            row.lastName,
            row.email,
            row.birthday,
            row.f1,
            row.f2,
            row.f3,
            row.f4,
            row.f5,
            row.f6,
            row.cust_id,
            'Confirmed', // status
            now, // created_at
            now  // updated_at
        );
    });

    const request = pool.request();
    await request.bulk(table);
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
            escape = true;
            current += char; // Keep escape for now, or handle it?
            // If I keep it, strings might have \.
            // But JSON.parse or SQL insert handles it?
            // Let's just keep it to avoid dropping chars.
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

restoreData().catch(console.error);
