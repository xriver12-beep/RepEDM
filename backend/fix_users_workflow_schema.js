const { connectDB, closeDB } = require('./src/config/database');
const sql = require('mssql');

async function fixSchemaAndCheckData() {
    try {
        const pool = await connectDB();
        
        // 1. Check for non-integer approver_id in WorkflowSteps
        console.log('--- Checking for non-integer approver_id in WorkflowSteps ---');
        const invalidApprovers = await pool.request().query(`
            SELECT id, workflow_id, step_name, approver_id 
            FROM WorkflowSteps 
            WHERE TRY_CAST(approver_id AS INT) IS NULL AND approver_id IS NOT NULL
        `);
        
        if (invalidApprovers.recordset.length > 0) {
            console.log('Found non-integer approver_ids:', invalidApprovers.recordset);
        } else {
            console.log('All approver_ids are valid integers.');
        }

        // 2. Fix Users.assigned_workflow_id Schema
        console.log('--- Fixing Users.assigned_workflow_id Schema ---');
        
        // Check if constraint exists
        const constraintCheck = await pool.request().query(`
            SELECT name 
            FROM sys.foreign_keys 
            WHERE name = 'FK_Users_ApprovalWorkflows'
        `);

        if (constraintCheck.recordset.length > 0) {
            console.log('Dropping existing FK_Users_ApprovalWorkflows constraint...');
            await pool.request().query(`ALTER TABLE Users DROP CONSTRAINT FK_Users_ApprovalWorkflows`);
        }

        // Check current column type
        const colCheck = await pool.request().query(`
            SELECT DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'assigned_workflow_id'
        `);

        if (colCheck.recordset.length > 0) {
            const currentType = colCheck.recordset[0].DATA_TYPE;
            console.log(`Current assigned_workflow_id type: ${currentType}`);
            
            if (currentType !== 'int') {
                console.log('Dropping assigned_workflow_id column...');
                await pool.request().query(`ALTER TABLE Users DROP COLUMN assigned_workflow_id`);
                
                console.log('Adding assigned_workflow_id as INT...');
                await pool.request().query(`ALTER TABLE Users ADD assigned_workflow_id INT NULL`);
            } else {
                console.log('Column assigned_workflow_id is already INT.');
            }
        } else {
            console.log('Adding assigned_workflow_id as INT...');
            await pool.request().query(`ALTER TABLE Users ADD assigned_workflow_id INT NULL`);
        }

        // Re-add Constraint
        console.log('Adding FK_Users_ApprovalWorkflows constraint...');
        await pool.request().query(`
            ALTER TABLE Users
            ADD CONSTRAINT FK_Users_ApprovalWorkflows 
            FOREIGN KEY (assigned_workflow_id) 
            REFERENCES ApprovalWorkflows(id)
            ON DELETE SET NULL
        `);

        console.log('Schema fix completed successfully.');

        await closeDB();
    } catch (err) {
        console.error('Error:', err);
        // Ensure connection is closed even if error
        try { await closeDB(); } catch(e) {}
    }
}

fixSchemaAndCheckData();
