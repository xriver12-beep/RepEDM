const { executeQuery, connectDB } = require('./src/config/database');

async function checkCampaignLogs() {
    try {
        await connectDB();
        const campaignId = 133; // 資訊組-edm 測試04
        
        console.log('--- Campaign Details ---');
        const campaignQuery = `SELECT * FROM Campaigns WHERE id = ${campaignId}`;
        const campaignResult = await executeQuery(campaignQuery);
        console.log(campaignResult.recordset[0]);

        console.log('\n--- Email Logs Summary ---');
        const logSummaryQuery = `
            SELECT status, error_message, COUNT(*) as count 
            FROM EmailLogs 
            WHERE campaign_id = ${campaignId} 
            GROUP BY status, error_message
        `;
        const logSummaryResult = await executeQuery(logSummaryQuery);
        console.log(logSummaryResult.recordset);
        
        console.log('\n--- Recent Frequency Logs (EmailSends) ---');
        const emailSendsQuery = `
            SELECT TOP 10 * FROM EmailSends 
            WHERE campaign_id = ${campaignId}
        `;
        const emailSendsResult = await executeQuery(emailSendsQuery);
        console.log(emailSendsResult.recordset);

    } catch (err) {
        console.error('Error:', err);
    }
    process.exit();
}

checkCampaignLogs();
