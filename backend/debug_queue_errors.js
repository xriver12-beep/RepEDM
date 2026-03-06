const { sql, poolPromise } = require('./src/config/database');

async function checkQueueErrors() {
    try {
        const pool = await poolPromise;
        
        // Check EmailQueue for failures
        console.log('--- Checking EmailQueue for failures ---');
        const queueResult = await pool.request().query(`
            SELECT TOP 20 id, campaign_id, email, status, error, created_at, updated_at, retry_count
            FROM EmailQueue 
            WHERE status = 'failed' OR error IS NOT NULL
            ORDER BY updated_at DESC
        `);
        
        if (queueResult.recordset.length === 0) {
            console.log('No failed items found in EmailQueue.');
        } else {
            console.log(JSON.stringify(queueResult.recordset, null, 2));
        }

        // Check EmailLogs for recent errors
        console.log('\n--- Checking EmailLogs for recent errors ---');
        const logsResult = await pool.request().query(`
            SELECT TOP 20 id, campaign_id, recipient_email, status, error_message, smtp_response, created_at
            FROM EmailLogs 
            WHERE status = 'failed' OR error_message IS NOT NULL
            ORDER BY created_at DESC
        `);

        if (logsResult.recordset.length === 0) {
            console.log('No failed items found in EmailLogs.');
        } else {
            console.log(JSON.stringify(logsResult.recordset, null, 2));
        }

    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        process.exit();
    }
}

checkQueueErrors();
