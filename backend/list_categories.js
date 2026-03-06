require('dotenv').config();
const { executeQuery, connectDB } = require('./src/config/database');

async function listCategories() {
    try {
        await connectDB();
        console.log('--- Categories matching Test/Stress ---');
        const result = await executeQuery("SELECT name FROM Categories WHERE name LIKE 'Test%' OR name LIKE 'Stress%' OR name LIKE '%測試%'");
        console.log(result.recordset.map(c => c.name));
    } catch (error) {
        console.error('Error:', error);
    }
}

listCategories();