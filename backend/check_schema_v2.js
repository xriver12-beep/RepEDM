const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkSchema() {
  try {
    await connectDB();
    
    console.log('--- USERS SCHEMA ---');
    const users = await executeQuery("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    console.table(users.recordset);

    console.log('--- WORKFLOW STEPS SCHEMA ---');
    const steps = await executeQuery("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WorkflowSteps'");
    console.table(steps.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDB();
    process.exit();
  }
}

checkSchema();
