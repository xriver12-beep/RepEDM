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

async function checkColumns() {
    try {
        await sql.connect(config);
        
        console.log('Checking WorkflowSteps columns...');
        const stepsCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'WorkflowSteps'
        `;
        console.log(stepsCols.recordset.map(c => c.COLUMN_NAME));

        console.log('Checking ApprovalItems columns...');
        const approvalCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ApprovalItems'
        `;
        console.log(approvalCols.recordset.map(c => c.COLUMN_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkColumns();
