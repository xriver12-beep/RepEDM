const { connectDB, closeDB } = require('./src/config/database');
const sql = require('mssql');

async function checkData() {
    try {
        const pool = await connectDB();
        
        console.log('--- Users Data (First 5) ---');
        const users = await pool.request().query(`
            SELECT TOP 5 id, username, assigned_workflow_id FROM Users
        `);
        console.table(users.recordset);

        console.log('--- WorkflowSteps Data (First 5) ---');
        const steps = await pool.request().query(`
            SELECT TOP 5 id, workflow_id, step_name, approver_id FROM WorkflowSteps
        `);
        console.table(steps.recordset);

        console.log('--- ApprovalWorkflows Data (First 5) ---');
        const workflows = await pool.request().query(`
            SELECT TOP 5 id, name FROM ApprovalWorkflows
        `);
        console.table(workflows.recordset);

        await closeDB();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkData();
