const { sql, connectDB } = require('./src/config/database');

async function debugApprovalContent() {
  try {
    await connectDB();
    
    console.log('Fetching recent approvals...');
    const result = await sql.query`
      SELECT TOP 5 
        ai.id, 
        c.name, 
        c.html_content, 
        c.text_content 
      FROM ApprovalItems ai
      JOIN Campaigns c ON ai.campaign_id = c.id
      ORDER BY ai.created_at DESC
    `;
    
    if (result.recordset.length > 0) {
      result.recordset.forEach(row => {
        console.log(`Approval ID: ${row.id}`);
        console.log(`Campaign Name: ${row.name}`);
        console.log(`HTML Content Length: ${row.html_content ? row.html_content.length : 'NULL'}`);
        console.log(`Text Content Length: ${row.text_content ? row.text_content.length : 'NULL'}`);
        console.log('---');
      });
    } else {
      console.log('No approvals found.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (sql) await sql.close();
  }
}

debugApprovalContent();
