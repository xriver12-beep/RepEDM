const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function checkTable() {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Subscribers'
            ORDER BY ORDINAL_POSITION
        `);
        console.log('Subscribers 表結構:');
        result.recordset.forEach(col => {
            console.log(`- ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
        });
        await pool.close();
    } catch (error) {
        console.error('錯誤:', error.message);
    }
}

checkTable();