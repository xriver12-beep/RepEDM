const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function fixApprovalWorkflowSchema() {
  try {
    await connectDB();
    console.log('Fixing ApprovalWorkflows schema...');

    // 1. Find FK constraint on created_by
    const findFkQuery = `
      SELECT f.name AS constraint_name
      FROM sys.foreign_keys AS f
      INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
      INNER JOIN sys.tables AS t ON t.object_id = fc.parent_object_id
      INNER JOIN sys.columns AS c ON c.object_id = t.object_id AND c.column_id = fc.parent_column_id
      WHERE t.name = 'ApprovalWorkflows' AND c.name = 'created_by'
    `;
    const fkResult = await executeQuery(findFkQuery);
    
    if (fkResult.recordset.length > 0) {
      const constraintName = fkResult.recordset[0].constraint_name;
      console.log(`Dropping FK constraint: ${constraintName}`);
      await executeQuery(`ALTER TABLE ApprovalWorkflows DROP CONSTRAINT ${constraintName}`);
    } else {
      console.log('No FK constraint found on created_by');
    }

    // 2. Alter created_by to NVARCHAR(50)
    console.log('Altering created_by to NVARCHAR(50)...');
    await executeQuery('ALTER TABLE ApprovalWorkflows ALTER COLUMN created_by NVARCHAR(50)');

    // 3. Alter updated_by to NVARCHAR(50) (just in case)
    // Check if updated_by exists first? Assuming it does based on schema.
    console.log('Altering updated_by to NVARCHAR(50)...');
    await executeQuery('ALTER TABLE ApprovalWorkflows ALTER COLUMN updated_by NVARCHAR(50)');

    console.log('Schema fix completed successfully.');

  } catch (err) {
    console.error('Error fixing schema:', err);
  } finally {
    await closeDB();
    process.exit();
  }
}

fixApprovalWorkflowSchema();
