
const { connectDB, closeDB, executeQuery } = require('./src/config/database');

async function addAdminResetColumns() {
  try {
    await connectDB();
    console.log('Adding reset token columns to AdminUsers table...');

    try {
      await executeQuery(`
        ALTER TABLE AdminUsers
        ADD reset_token NVARCHAR(255) NULL,
            reset_token_expires DATETIME2 NULL
      `);
      console.log('Columns added successfully.');
    } catch (err) {
      if (err.message.includes('Column names in each table must be unique')) {
        console.log('Columns already exist.');
      } else {
        throw err;
      }
    }

  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    await closeDB();
  }
}

addAdminResetColumns();
