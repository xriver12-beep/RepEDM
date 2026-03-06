require('dotenv').config();
const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'WintonEDM',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        await sql.connect(config);
        const result = await sql.query(`
            SELECT id, name, category_type, original_id 
            FROM Categories 
            WHERE category_type = 't1' AND original_id IN (11, 12)
        `);
        console.log(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
