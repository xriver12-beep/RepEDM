const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkWorkflowFKs() {
  try {
    await connectDB();
    console.log('--- FOREIGN KEYS on ApprovalWorkflows ---');
    const fks = await executeQuery(`
      SELECT 
        f.name AS constraint_name,
        OBJECT_NAME(f.parent_object_id) AS table_name,
        COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
        OBJECT_NAME(f.referenced_object_id) AS referenced_table_name,
        COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column_name
      FROM sys.foreign_keys AS f
      INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
      WHERE OBJECT_NAME(f.parent_object_id) = 'ApprovalWorkflows'
    `);
    console.table(fks.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDB();
    process.exit();
  }
}

checkWorkflowFKs();
