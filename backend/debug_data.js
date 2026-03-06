
const { executeQuery, connectDB } = require('./src/config/database');

async function debug() {
    try {
        await connectDB();
        
        const campaignId = 119;
        console.log(`Testing query for campaignId: ${campaignId}`);

        const query = `
              SELECT TOP 10
                  SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                  COUNT(*) as total_sent,
                  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success_count,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failure_count
              FROM EmailSends
              WHERE campaign_id = @campaignId AND CHARINDEX('@', email) > 0
              GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
              ORDER BY total_sent DESC
            `;
            
        const result = await executeQuery(query, { campaignId });
        console.log('Query result:', result.recordset);
        
        // Also check if status is strictly 'sent' or 'failed' or something else
        const statuses = await executeQuery('SELECT DISTINCT status FROM EmailSends WHERE campaign_id = @campaignId', { campaignId });
        console.log('Statuses found:', statuses.recordset);

    } catch (err) {
        console.error('Error:', err);
    }
    process.exit();
}

debug();
