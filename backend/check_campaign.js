const { executeQuery, connectDB } = require('./src/config/database');

async function checkCampaign() {
    try {
        await connectDB();
        const query = `
            SELECT c.id, c.name, c.status, c.created_at, u.full_name as submitter
            FROM Campaigns c
            LEFT JOIN Users u ON c.created_by = u.id
            WHERE c.name LIKE '%春季促銷活動郵件 4%'
        `;
        const result = await executeQuery(query);
        console.log('Campaign Info:', result.recordset);

        if (result.recordset && result.recordset.length > 0) {
            const campaignId = result.recordset[0].id;
            const approvalQuery = `
                SELECT * FROM ApprovalItems WHERE campaign_id = ${campaignId}
            `;
            const approvalResult = await executeQuery(approvalQuery);
            console.log('Approval Info:', approvalResult.recordset);
        } else {
             console.log('No campaign found');
        }
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit();
}

checkCampaign();
