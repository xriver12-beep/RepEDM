const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkData() {
  try {
    await connectDB();
    console.log('--- ADMIN USERS DATA ---');
    const adminUsers = await executeQuery('SELECT TOP 1 * FROM AdminUsers');
    console.table(adminUsers.recordset);

    console.log('--- WORKFLOWS DATA ---');
    const workflows = await executeQuery('SELECT TOP 1 * FROM ApprovalWorkflows');
    console.table(workflows.recordset);

    console.log('--- WORKFLOW STEPS DATA ---');
    const steps = await executeQuery('SELECT TOP 1 * FROM WorkflowSteps');
    console.table(steps.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDB();
    process.exit();
  }
}

checkData();
