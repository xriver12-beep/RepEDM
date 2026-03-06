const sql = require('mssql');
const { config } = require('./src/config/database');

// Override config if needed, or just use what's in database.js if it exports it.
// Since database.js exports executeQuery, sql, etc., I might not be able to get config directly if not exported.
// I'll reconstruct the config based on check_schema_temp.js which seemed to work.

const dbConfig = {
    user: 'sa',
    password: 'Wint0n2k00',
    server: 'edm2022',
    database: 'WintonEDM',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkAdminUsersSchema() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to database');
        
        const result = await sql.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'AdminUsers'
        `);
        console.log('AdminUsers Schema:');
        console.table(result.recordset);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkAdminUsersSchema();
