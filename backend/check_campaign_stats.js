const { connectDB, executeQuery } = require('./src/config/database');
require('dotenv').config();

async function checkCampaigns() {
    try {
        await connectDB();
        console.log("DB Connected");

        const query = `
            SELECT TOP 5
                id, name, status, recipient_count, opened_count, clicked_count, bounced_count, unsubscribed_count
            FROM Campaigns
            ORDER BY created_at DESC
        `;
        const res = await executeQuery(query);
        console.table(res.recordset);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkCampaigns();