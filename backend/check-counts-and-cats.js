const sql = require('mssql');
require('dotenv').config();

async function check() {
    try {
        const config = process.env.DB_NAME ? {
            server: process.env.DB_SERVER,
            port: parseInt(process.env.DB_PORT),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            options: {
                encrypt: false,
                trustServerCertificate: true
            }
        } : process.env.DATABASE_URL;

        await sql.connect(config);
        console.log('Connected to database');

        const r1 = await sql.query('SELECT COUNT(*) as c FROM Subscribers WHERE f1 = 11');
        const r2 = await sql.query('SELECT COUNT(*) as c FROM Subscribers WHERE f1 = 12');
        console.log('Current f1=11 count:', r1.recordset[0].c);
        console.log('Current f1=12 count:', r2.recordset[0].c);

        const cats = await sql.query("SELECT * FROM Categories WHERE name LIKE N'%文中客戶%'");
        console.log('Matching Categories:');
        cats.recordset.forEach(c => {
            console.log(`ID: ${c.id}, Name: ${c.name}, ParentID: ${c.parent_id}`);
        });

        // Also check if there is a SubscriberCategories table
        try {
            const subCats = await sql.query('SELECT TOP 1 * FROM SubscriberCategories');
            console.log('SubscriberCategories table exists. Sample:', subCats.recordset);
        } catch (e) {
            console.log('SubscriberCategories table does not exist or error:', e.message);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

check();
