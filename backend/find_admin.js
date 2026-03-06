const { sql, connectDB } = require('./src/config/database');
require('dotenv').config();

async function findAdmin() {
    try {
        const pool = await connectDB();
        
        console.log('Searching for admin users...');
        const query = `SELECT id, email, password_hash, full_name, role FROM Users WHERE role = 'admin' OR email LIKE '%admin%'`;
        const result = await pool.request().query(query);
        
        console.table(result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

findAdmin();
