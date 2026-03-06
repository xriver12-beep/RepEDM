
const { executeQuery, connectDB } = require('./src/config/database');
require('dotenv').config();

async function verifyData() {
    try {
        await connectDB();
        console.log('Verifying data...');

        const queueStats = await executeQuery(`
            SELECT status, COUNT(*) as count 
            FROM EmailQueue 
            GROUP BY status
        `);
        console.log('Queue Stats:', queueStats.recordset);

        const sendsStats = await executeQuery(`
            SELECT COUNT(*) as count 
            FROM EmailSends 
            WHERE sent_at >= DATEADD(hour, -24, GETDATE())
        `);
        console.log('Last 24h Sends Total:', sendsStats.recordset[0]);

        const trendStats = await executeQuery(`
            SELECT 
                DATEPART(hour, sent_at) as hour,
                COUNT(*) as count
            FROM EmailSends
            WHERE sent_at >= DATEADD(hour, -24, GETDATE())
            GROUP BY DATEPART(hour, sent_at)
            ORDER BY hour
        `);
        console.log('Trend Data (by hour):', trendStats.recordset);

        const campaigns = await executeQuery(`
            SELECT id, name, status 
            FROM Campaigns 
            WHERE name LIKE 'Test Campaign%'
        `);
        console.log('Test Campaigns:', campaigns.recordset);

        process.exit(0);
    } catch (error) {
        console.error('Error verifying data:', error);
        process.exit(1);
    }
}

verifyData();
