
const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function listCategories() {
    try {
        await connectDB();
        const result = await executeQuery('SELECT * FROM TemplateCategories');
        console.table(result.recordset);
        await closeDB();
    } catch (error) {
        console.error('Error:', error);
        await closeDB();
    }
}

listCategories();
