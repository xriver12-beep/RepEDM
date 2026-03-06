
const { connectDB, executeQuery } = require('./src/config/database');

async function checkSchema() {
    try {
        await connectDB();
        
        console.log('--- Checking Tables ---');
        const tables = await executeQuery(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        console.log('Tables:', tables.recordset.map(r => r.TABLE_NAME));

        console.log('--- Checking EmailLogs Columns ---');
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

checkSchema();
