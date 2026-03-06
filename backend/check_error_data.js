
const { connectDB, executeQuery } = require('./src/config/database');

async function checkErrorData() {
    try {
        await connectDB();
        
        // Get sample failed logs to see error patterns
        const result = await executeQuery(`
            SELECT TOP 20 recipient_email, error_message, smtp_response, error_code 
            FROM EmailLogs 
            WHERE status = 'failed'
            ORDER BY created_at DESC
        `);
        
        console.log('Sample failed logs:');
        console.table(result.recordset);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkErrorData();
