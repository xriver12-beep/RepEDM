require('dotenv').config();
const { connectDB, executeQuery } = require('./src/config/database');

async function checkUsers() {
    try {
        await connectDB();
        const result = await executeQuery('SELECT id, username, email, role, full_name, is_active FROM Users ORDER BY id');
        console.log('現有用戶:');
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (error) {
        console.error('錯誤:', error);
    }
}

checkUsers();