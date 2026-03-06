const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Wint0n2k00',
    server: 'edm2022',
    database: 'WintonEDM',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function addSecurityColumns() {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const columns = [
            { name: 'last_login_at', type: 'datetime2', nullable: true },
            { name: 'last_login_ip', type: 'nvarchar(45)', nullable: true },
            { name: 'failed_login_attempts', type: 'int', default: 0 },
            { name: 'locked_until', type: 'datetime2', nullable: true },
            { name: 'must_change_password', type: 'bit', default: 0 }
        ];

        for (const col of columns) {
            try {
                // Check if column exists
                const checkResult = await sql.query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = '${col.name}'
                `);

                if (checkResult.recordset.length === 0) {
                    console.log(`Adding column ${col.name}...`);
                    let query = `ALTER TABLE Users ADD ${col.name} ${col.type}`;
                    if (!col.nullable && col.default !== undefined) {
                        query += ` DEFAULT ${col.default} NOT NULL`; // Simplified for default
                        // Note: Adding NOT NULL with DEFAULT to existing table in SQL Server is usually:
                        // ALTER TABLE Users ADD col type NOT NULL DEFAULT val WITH VALUES
                        if (col.default !== undefined) {
                             query = `ALTER TABLE Users ADD ${col.name} ${col.type} DEFAULT ${col.default} WITH VALUES`;
                        }
                    } else if (col.default !== undefined) {
                        query = `ALTER TABLE Users ADD ${col.name} ${col.type} DEFAULT ${col.default}`;
                    }
                    
                    await sql.query(query);
                    console.log(`Column ${col.name} added successfully.`);
                } else {
                    console.log(`Column ${col.name} already exists.`);
                }
            } catch (err) {
                console.error(`Error adding column ${col.name}:`, err.message);
            }
        }

        console.log('Migration completed.');
    } catch (err) {
        console.error('Database connection error:', err);
    } finally {
        await sql.close();
    }
}

addSecurityColumns();
