const { executeQuery } = require('./src/config/database');
const { connectDB, closeDB } = require('./src/config/database');

async function updateSchema() {
    try {
        await connectDB();
        console.log('Connected to database');

        // Check if column exists
        const checkColumnQuery = `
            SELECT 1 FROM sys.columns 
            WHERE Name = N'assigned_workflow_id' 
            AND Object_ID = Object_ID(N'Users')
        `;
        const result = await executeQuery(checkColumnQuery);

        if (result.recordset.length === 0) {
            console.log('Adding assigned_workflow_id column to Users table...');
            
            // Add column
            await executeQuery(`
                ALTER TABLE Users 
                ADD assigned_workflow_id UNIQUEIDENTIFIER NULL
            `);

            // Add foreign key constraint
            await executeQuery(`
                ALTER TABLE Users
                ADD CONSTRAINT FK_Users_ApprovalWorkflows 
                FOREIGN KEY (assigned_workflow_id) 
                REFERENCES ApprovalWorkflows(id)
                ON DELETE SET NULL
            `);

            console.log('Column added successfully');
        } else {
            console.log('Column assigned_workflow_id already exists');
        }

    } catch (err) {
        console.error('Error updating schema:', err);
    } finally {
        await closeDB();
    }
}

updateSchema();
