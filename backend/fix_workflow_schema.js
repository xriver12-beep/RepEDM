const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function fixWorkflowSchema() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // 1. Drop constraints on WorkflowSteps.approver_id
        console.log('Checking constraints on WorkflowSteps.approver_id...');
        const constraints = await executeQuery(`
            SELECT 
                obj.name AS constraint_name,
                obj.type_desc AS constraint_type
            FROM sys.objects obj
            JOIN sys.columns col ON obj.parent_object_id = col.object_id
            JOIN sys.sysconstraints sc ON obj.object_id = sc.constid AND col.column_id = sc.colid
            WHERE obj.parent_object_id = OBJECT_ID('WorkflowSteps')
            AND col.name = 'approver_id'
        `);

        for (const row of constraints.recordset) {
            console.log(`Dropping constraint: ${row.constraint_name} (${row.constraint_type})`);
            await executeQuery(`ALTER TABLE WorkflowSteps DROP CONSTRAINT ${row.constraint_name}`);
        }

        // 2. Alter WorkflowSteps.approver_id to NVARCHAR(50)
        console.log('Altering WorkflowSteps.approver_id to NVARCHAR(50)...');
        await executeQuery('ALTER TABLE WorkflowSteps ALTER COLUMN approver_id NVARCHAR(50)');
        console.log('WorkflowSteps.approver_id altered successfully.');

        // 3. Drop constraints on ApprovalWorkflows.created_by
        console.log('Checking constraints on ApprovalWorkflows.created_by...');
        const wfConstraints = await executeQuery(`
            SELECT 
                obj.name AS constraint_name,
                obj.type_desc AS constraint_type
            FROM sys.objects obj
            JOIN sys.columns col ON obj.parent_object_id = col.object_id
            JOIN sys.sysconstraints sc ON obj.object_id = sc.constid AND col.column_id = sc.colid
            WHERE obj.parent_object_id = OBJECT_ID('ApprovalWorkflows')
            AND col.name = 'created_by'
        `);

        for (const row of wfConstraints.recordset) {
            console.log(`Dropping constraint: ${row.constraint_name} (${row.constraint_type})`);
            await executeQuery(`ALTER TABLE ApprovalWorkflows DROP CONSTRAINT ${row.constraint_name}`);
        }

        // 4. Alter ApprovalWorkflows.created_by to NVARCHAR(50)
        console.log('Altering ApprovalWorkflows.created_by to NVARCHAR(50)...');
        await executeQuery('ALTER TABLE ApprovalWorkflows ALTER COLUMN created_by NVARCHAR(50)');
        console.log('ApprovalWorkflows.created_by altered successfully.');

        console.log('Schema fix completed successfully.');

    } catch (err) {
        console.error('Error fixing schema:', err);
    } finally {
        await closeDB();
        process.exit();
    }
}

fixWorkflowSchema();
