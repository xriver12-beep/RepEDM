const { connectDB, executeQuery } = require('./src/config/database');

async function checkQueueQuery() {
    try {
        await connectDB();
        const query = `
            SELECT TOP 50 q.*, c.subject as campaign_subject
            FROM EmailQueue q
            JOIN Campaigns c ON q.campaign_id = c.id
            WHERE (q.status = 'pending' AND (q.next_retry_at IS NULL OR q.next_retry_at <= GETDATE()))
        `;
        const result = await executeQuery(query);
        console.log('Query Result Count:', result.recordset.length);
        if (result.recordset.length > 0) {
            console.log('First item:', JSON.stringify(result.recordset[0], null, 2));
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQueueQuery();
