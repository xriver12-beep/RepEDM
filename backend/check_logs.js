const { connectDB, executeQuery } = require('./src/config/database');

async function checkLogs() {
    try {
        await connectDB();
        const result = await executeQuery(`
            SELECT TOP 5 email_type, subject, status, error_message, created_at 
            FROM EmailLogs 
            WHERE email_type = 'campaign' 
            ORDER BY created_at DESC
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLogs();
