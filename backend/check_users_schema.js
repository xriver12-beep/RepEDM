const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkUsers() {
  try {
    await connectDB();
    
    console.log('=== USERS TABLE SCHEMA ===');
    const usersSchema = await executeQuery("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    console.table(usersSchema.recordset);

    console.log('\n=== USERS TABLE DATA (Top 5) ===');
    const usersData = await executeQuery("SELECT TOP 5 id, email, full_name, role, department FROM Users");
    console.table(usersData.recordset);
    
    console.log('\n=== WorkflowSteps TABLE SCHEMA ===');
    const workflowStepsSchema = await executeQuery("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WorkflowSteps'");
    console.table(workflowStepsSchema.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDB();
    process.exit();
  }
}

checkUsers();
