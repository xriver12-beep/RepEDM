const sql = require('mssql');
require('dotenv').config({ path: 'c:\\WintonEDM\\backend\\.env' });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function checkData() {
    try {
        await sql.connect(config);
        console.log('Connected to database.');

        // Check Subscribers
        const subs = await sql.query`SELECT TOP 5 email FROM Subscribers`;
        console.log('Subscribers (Top 5):');
        console.table(subs.recordset);

        // Check Domain Stats Query (Simulation of what backend does)
        const domainStats = await sql.query`
            SELECT TOP 10
                SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                COUNT(*) as count
            FROM Subscribers
            WHERE CHARINDEX('@', email) > 0
            GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
            ORDER BY count DESC
        `;
        console.log('Domain Stats:');
        console.table(domainStats.recordset);

        // Check Interactions
        const sends = await sql.query`SELECT COUNT(*) as count FROM EmailSends`;
        console.log('EmailSends Count:', sends.recordset[0].count);

        const opens = await sql.query`SELECT COUNT(*) as count FROM EmailOpens`;
        console.log('EmailOpens Count:', opens.recordset[0].count);

        const clicks = await sql.query`SELECT COUNT(*) as count FROM EmailClicks`;
        console.log('EmailClicks Count:', clicks.recordset[0].count);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
