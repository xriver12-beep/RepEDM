
const { sql, connectDB } = require('./src/config/database');
require('dotenv').config();

async function checkUser() {
    try {
        const pool = await connectDB();
        
        // Check User ID 3
        const query = `SELECT * FROM Users WHERE id = 3`;
        const result = await pool.request().query(query);
        console.log('--- User 3 ---');
        console.table(result.recordset);
        
        // Check "吳山姆"
        const query2 = `SELECT * FROM Users WHERE full_name LIKE N'%吳山姆%'`;
        const result2 = await pool.request().query(query2);
        console.log('\n--- User 吳山姆 ---');
        console.table(result2.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkUser();
