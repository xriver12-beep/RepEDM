require('dotenv').config();
const sql = require('mssql');

async function addResetColumns() {
    const config = {
        server: process.env.DB_SERVER,
        port: parseInt(process.env.DB_PORT) || 1433,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
            enableArithAbort: true
        }
    };

    try {
        await sql.connect(config);
        console.log('Connected to database');

        // Check if columns exist
        const checkQuery = `
            SELECT count(*) as count 
            FROM sys.columns 
            WHERE object_id = OBJECT_ID('Users') 
            AND name IN ('reset_token', 'reset_token_expires')
        `;
        const result = await sql.query(checkQuery);
        
        if (result.recordset[0].count < 2) {
            console.log('Adding reset columns...');
            await sql.query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'reset_token')
                BEGIN
                    ALTER TABLE Users ADD reset_token NVARCHAR(255) NULL;
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'reset_token_expires')
                BEGIN
                    ALTER TABLE Users ADD reset_token_expires DATETIME2 NULL;
                END
            `);
            console.log('Reset columns added successfully');
        } else {
            console.log('Reset columns already exist');
        }

    } catch (err) {
        console.error('Error adding columns:', err);
    } finally {
        await sql.close();
    }
}

addResetColumns();
