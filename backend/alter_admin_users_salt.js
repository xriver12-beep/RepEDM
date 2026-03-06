const { executeQuery, closeDB, connectDB } = require('./src/config/database');

async function alterAdminUsersSalt() {
  try {
    await connectDB();
    console.log('Altering AdminUsers schema (Salt column)...');

    // Make Salt column nullable
    const alterSalt = `
      ALTER TABLE AdminUsers
      ALTER COLUMN Salt NVARCHAR(255) NULL
    `;
    await executeQuery(alterSalt);
    console.log('Salt column altered to allow NULL');
    
  } catch (error) {
    console.error('Error altering schema:', error);
  } finally {
    await closeDB();
  }
}

alterAdminUsersSalt();
