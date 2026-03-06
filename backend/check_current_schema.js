const { connectDB, closeDB } = require('./src/config/database');
const sql = require('mssql');

async function checkSchema() {
    try {
        const pool = await connectDB();
        
        console.log('--- Users Table ---');
        const usersColumns = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users'
        `);
        console.table(usersColumns.recordset);

        console.log('--- WorkflowSteps Table ---');
        const stepsColumns = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'WorkflowSteps'
        `);
        console.table(stepsColumns.recordset);

        console.log('--- ApprovalWorkflows Table ---');
        const workflowsColumns = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ApprovalWorkflows'
        `);
        console.table(workflowsColumns.recordset);

        await closeDB();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSchema();
