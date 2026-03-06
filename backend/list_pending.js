const { executeQuery, connectDB } = require('./src/config/database');

async function listPending() {
    try {
        await connectDB();
        const query = `
            SELECT 
                ai.id as approval_id, 
                c.id as campaign_id, 
                c.name, 
                c.status as campaign_status, 
                ai.status as approval_status,
                u.full_name as submitter,
                ai.submitted_at
            FROM ApprovalItems ai
            JOIN Campaigns c ON ai.campaign_id = c.id
            LEFT JOIN Users u ON ai.submitted_by = u.id
            WHERE ai.status IN ('pending', 'in_review')
        `;
        const result = await executeQuery(query);
        console.log('Pending Approvals:', result.recordset);
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit();
}

listPending();
