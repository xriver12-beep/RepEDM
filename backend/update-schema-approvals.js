const { executeQuery, connectDB } = require('./src/config/database');

async function updateSchema() {
  try {
    await connectDB();
    console.log('Updating schema for Multi-level Approvals...');

    // 1. Add manager_id to Users
    try {
      await executeQuery(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'manager_id')
        BEGIN
            ALTER TABLE Users ADD manager_id INT NULL;
            ALTER TABLE Users ADD CONSTRAINT FK_Users_Manager FOREIGN KEY (manager_id) REFERENCES Users(id);
            PRINT 'Added manager_id to Users table';
        END
      `);
    } catch (e) {
      console.log('Error adding manager_id:', e.message);
    }

    // 2. Add approver_type to WorkflowSteps
    try {
      await executeQuery(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WorkflowSteps') AND name = 'approver_type')
        BEGIN
            ALTER TABLE WorkflowSteps ADD approver_type NVARCHAR(20) NOT NULL DEFAULT 'SpecificUser';
            PRINT 'Added approver_type to WorkflowSteps table';
        END
      `);
    } catch (e) {
      console.log('Error adding approver_type:', e.message);
    }

    // 3. Make approver_id nullable in WorkflowSteps
    try {
        await executeQuery(`
            ALTER TABLE WorkflowSteps ALTER COLUMN approver_id INT NULL;
            PRINT 'Made approver_id nullable in WorkflowSteps table';
        `);
    } catch (e) {
        console.log('Error modifying approver_id:', e.message);
    }
    
    console.log('Schema update complete.');
    process.exit(0);
  } catch (error) {
    console.error('Schema update failed:', error);
    process.exit(1);
  }
}

updateSchema();
