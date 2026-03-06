
const { connectDB, closeDB, executeQuery } = require('./src/config/database');

async function checkAdminUser() {
  try {
    await connectDB();
    
    console.log('Checking for AdminUsers with email sam@winton.com.tw or username containing sam...');
    
    const result = await executeQuery(`
      SELECT AdminUserID, Username, Email, PasswordHash, IsActive 
      FROM AdminUsers 
      WHERE Email = 'sam@winton.com.tw' OR Username LIKE '%sam%'
    `);
    
    console.log('Found AdminUsers:', result.recordset);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await closeDB();
  }
}

checkAdminUser();
