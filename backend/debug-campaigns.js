const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Wint0n2k00',
    server: process.env.DB_SERVER || 'edm2022',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'WintonEDM',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

async function checkCampaignsColumns() {
    try {
        await sql.connect(config);
        
        console.log('Checking Campaigns columns...');
        const cols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Campaigns'
        `;
        console.log(cols.recordset.map(c => c.COLUMN_NAME));

        console.log('Sample Campaign Content:');
        const sample = await sql.query`SELECT TOP 1 id, name, html_content, text_content FROM Campaigns ORDER BY created_at DESC`;
        console.log(sample.recordset[0]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkCampaignsColumns();
