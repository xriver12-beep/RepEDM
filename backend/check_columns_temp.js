
const { connectDB, executeQuery } = require('./src/config/database');

async function checkColumns() {
    try {
        await connectDB();
        
        const result = await executeQuery(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EmailLogs'
        `);
        console.log('Columns in EmailLogs:', result.recordset.map(r => r.COLUMN_NAME));
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkColumns();
