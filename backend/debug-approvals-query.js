const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Wint0n2k00',
    server: process.env.DB_SERVER || 'edm2022',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'WintonEDM',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

async function debugQuery() {
    try {
        await sql.connect(config);
        
        // Get an approval ID
        const approval = await sql.query`SELECT TOP 1 id FROM ApprovalItems`;
        if (approval.recordset.length === 0) {
            console.log('No approvals found.');
            return;
        }
        const approvalId = approval.recordset[0].id;
        console.log('Testing with Approval ID:', approvalId);

        const query = `
            SELECT 
              ca.id AS ApprovalID,
              ca.campaign_id AS CampaignID,
              ca.workflow_id AS WorkflowID,
              ca.current_step AS CurrentStepID,
              ca.status AS Status,
              ca.priority AS Priority,
              ca.submitted_at AS SubmittedAt,
              ca.submitted_by AS SubmittedBy,
              
              c.name AS CampaignName,
              c.subject AS Subject,
              c.html_content AS HTMLContent,
              c.text_content AS PlainTextContent,
              c.sender_name AS FromName,
              c.sender_email AS FromEmail,
              
              aw.name AS WorkflowName,
              aw.description AS WorkflowDescription,
              
              s.step_name AS StepName,
              s.step_order AS StepOrder,
              s.approver_role AS RequiredRole,
              s.approver_id AS RequiredUserID,
              
              submitter.full_name AS SubmitterName,
              submitter.email AS SubmitterEmail,
              submitter.manager_id AS SubmitterManagerID
            FROM ApprovalItems ca
            INNER JOIN Campaigns c ON ca.campaign_id = c.id
            INNER JOIN ApprovalWorkflows aw ON ca.workflow_id = aw.id
            LEFT JOIN WorkflowSteps s ON ca.workflow_id = s.workflow_id AND ca.current_step = s.step_order
            INNER JOIN Users submitter ON ca.submitted_by = submitter.id
            WHERE ca.id = @approvalId
        `;

        const request = new sql.Request();
        request.input('approvalId', approvalId);
        const result = await request.query(query);

        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            console.log('Keys:', Object.keys(row));
            console.log('HTMLContent length:', row.HTMLContent ? row.HTMLContent.length : 'null');
            console.log('PlainTextContent length:', row.PlainTextContent ? row.PlainTextContent.length : 'null');
        } else {
            console.log('Query returned no results.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

debugQuery();
