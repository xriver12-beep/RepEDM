
const sql = require('mssql');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

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

async function listAllUsers() {
    try {
        await sql.connect(config);
        console.log('Connected to database');

        console.log('--- AdminUsers ---');
        const resultAdmin = await sql.query`SELECT AdminUserID, Username, DisplayName, FirstName, LastName FROM AdminUsers`;
        console.table(resultAdmin.recordset);

        console.log('--- Users ---');
        const resultUser = await sql.query`SELECT id, username, full_name, email FROM Users`;
        console.table(resultUser.recordset);

    } catch (err) {
        console.error('Database error:', err);
    } finally {
        await sql.close();
    }
}

listAllUsers();
