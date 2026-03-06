const sql = require('mssql');
const config = require('./src/config/database');

async function checkAdminRole() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .query("SELECT email, role FROM Users WHERE email = 'admin@example.com'");
        
        console.log('Admin user role:', result.recordset[0]);
        await pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkAdminRole();
