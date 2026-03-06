const { executeQuery, connectDB } = require('./src/config/database');

async function debug() {
    try {
        await connectDB();
        console.log('--- Checking Invalid Subscribers and their last campaign ---');
        const query = `
            SELECT TOP 5 s.id, s.email, s.status,
                   (SELECT TOP 1 c.name 
                    FROM EmailSends es 
                    JOIN Campaigns c ON es.campaign_id = c.id 
                    WHERE es.subscriber_id = s.id 
                      AND (es.status = 'failed' OR (s.status = 'invalid' AND es.status = 'sent'))
                    ORDER BY es.sent_at DESC) as last_bounced_campaign
            FROM Subscribers s
            WHERE s.status = 'invalid'
            ORDER BY s.updated_at DESC
        `;
        const result = await executeQuery(query);
        console.table(result.recordset);

        console.log('\n--- Checking EmailSends records for the first subscriber ---');
        if (result.recordset.length > 0) {
            const subId = result.recordset[0].id;
            const sendsQuery = `
                SELECT TOP 5 es.id, es.campaign_id, c.name, es.status, es.sent_at
                FROM EmailSends es
                JOIN Campaigns c ON es.campaign_id = c.id
                WHERE es.subscriber_id = @subId
                ORDER BY es.sent_at DESC
            `;
            const sendsResult = await executeQuery(sendsQuery, { subId });
            console.table(sendsResult.recordset);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();
