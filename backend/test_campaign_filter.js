
require('dotenv').config();
const { executeQuery, connectDB, closeDB } = require('./src/config/database');

async function testCampaignFilter() {
    try {
        await connectDB();
        
        // 1. Get a campaign ID that has sends
        const campaigns = await executeQuery("SELECT TOP 1 id, name FROM Campaigns WHERE status = 'sent' ORDER BY sent_at DESC");
        if (campaigns.recordset.length === 0) {
            console.log('No sent campaigns found.');
            return;
        }
        const campaign = campaigns.recordset[0];
        console.log(`Testing with Campaign: ${campaign.name} (ID: ${campaign.id})`);

        // 2. Query without filter
        console.log('\n--- No Filter ---');
        // We simulate the query used in campaigns.js for counts
        const noFilterQuery = `
            SELECT 
                (SELECT COUNT(*) FROM EmailSends WHERE campaign_id = @id) as sent,
                (SELECT COUNT(*) FROM EmailOpens WHERE CampaignID = @id) as opens
        `;
        const res1 = await executeQuery(noFilterQuery, { id: campaign.id });
        console.log('Counts:', res1.recordset[0]);

        // 3. Query with filter (Head Office)
        console.log('\n--- With Filter (總公司) ---');
        const filterVal = '總公司';
        // Logic from campaigns.js
        const filterQuery = `
            SELECT 
                (SELECT COUNT(*) FROM EmailSends es JOIN Subscribers s ON es.subscriber_id = s.id WHERE es.campaign_id = @id AND s.country = @country) as sent,
                (SELECT COUNT(*) FROM EmailOpens eo JOIN Subscribers s ON eo.SubscriberID = s.id WHERE eo.CampaignID = @id AND s.country = @country) as opens
        `;
        const res2 = await executeQuery(filterQuery, { id: campaign.id, country: filterVal });
        console.log('Counts:', res2.recordset[0]);

        if (res1.recordset[0].sent !== res2.recordset[0].sent) {
            console.log('\n✅ Filter is working (counts changed).');
        } else {
            console.log('\n⚠️ Filter might not be working or all recipients are in Head Office.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeDB();
    }
}

testCampaignFilter();
