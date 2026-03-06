
const { connectDB, closeDB, executeQuery } = require('./src/config/database');

async function checkUser() {
  try {
    await connectDB();
    
    console.log('Checking for users with email sam@winton.com.tw or username containing sam...');
    
    const result = await executeQuery(`
      SELECT id, username, email, password_hash, is_active, reset_token 
      FROM Users 
      WHERE email = 'sam@winton.com.tw' OR username LIKE '%sam%'
    `);
    
    console.log('Found users:', result.recordset);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await closeDB();
  }
}

checkUser();
