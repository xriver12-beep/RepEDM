
const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Wint0n2k00',
    server: 'edm2022',
    database: 'WintonEDM',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkCount() {
    try {
        await sql.connect(config);
        const result = await sql.query("SELECT COUNT(*) as count FROM Subscribers WHERE status = 'unsubscribed'");
        console.log('Unsubscribed Count:', result.recordset[0].count);
        
        // Also check if there are any with status 'unsubscribed'
        const rows = await sql.query("SELECT TOP 5 id, email, status, bounce_reason FROM Subscribers WHERE status = 'unsubscribed'");
        console.log('Sample rows:', rows.recordset);
        
    } catch (err) {
        console.error('SQL error', err);
    } finally {
        await sql.close();
    }
}

checkCount();
