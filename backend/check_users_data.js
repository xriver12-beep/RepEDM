const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkUsers() {
  try {
    await connectDB();
    
    console.log('=== USERS DATA ===');
    const usersData = await executeQuery("SELECT TOP 5 id, username, role FROM Users");
    console.table(usersData.recordset);
    
    console.log('=== WORKFLOW STEPS DATA ===');
    const stepsData = await executeQuery("SELECT TOP 5 id, approver_id FROM WorkflowSteps");
    console.table(stepsData.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDB();
    process.exit();
  }
}

checkUsers();
