const { executeQuery, connectDB } = require('./src/config/database');

async function checkColumns() {
    try {
        await connectDB();
        const tables = ['EmailSends', 'EmailOpens', 'EmailClicks'];
        for (const table of tables) {
            const result = await executeQuery(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
            console.log(`${table} Columns:`, result.recordset.map(c => c.COLUMN_NAME));
        }
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

checkColumns();
