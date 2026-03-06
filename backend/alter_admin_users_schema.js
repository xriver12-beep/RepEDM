const { executeQuery, closeDB, connectDB } = require('./src/config/database');

async function alterAdminUsersSchema() {
  try {
    await connectDB();
    console.log('Altering AdminUsers schema...');

    // Drop constraints if any (usually FKs, but here probably none for CreatedBy/UpdatedBy unless self-referencing)
    // Checking for FKs first would be safer, but let's assume simple audit columns for now.
    // If there are FKs, this will fail.

    const alterCreatedBy = `
      ALTER TABLE AdminUsers
      ALTER COLUMN CreatedBy NVARCHAR(100)
    `;
    await executeQuery(alterCreatedBy);
    console.log('CreatedBy column altered to NVARCHAR(100)');

    const alterUpdatedBy = `
      ALTER TABLE AdminUsers
      ALTER COLUMN UpdatedBy NVARCHAR(100)
    `;
    await executeQuery(alterUpdatedBy);
    console.log('UpdatedBy column altered to NVARCHAR(100)');
    
  } catch (error) {
    console.error('Error altering schema:', error);
  } finally {
    await closeDB();
  }
}

alterAdminUsersSchema();
