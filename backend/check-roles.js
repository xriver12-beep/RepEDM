const { executeQuery, connectDB } = require('./src/config/database');

async function checkRoles() {
  try {
    console.log('Initializing database connection...');
    await connectDB();
    
    console.log('Checking user roles in database...');
    
    const rolesResult = await executeQuery(`
      SELECT DISTINCT role 
      FROM users 
      ORDER BY role
    `);
    
    console.log('\nDistinct roles in database:');
    rolesResult.recordset.forEach(row => {
      console.log(`- "${row.role}"`);
    });
    
    console.log('\nAll users and their roles:');
    const usersResult = await executeQuery(`
      SELECT username, email, role 
      FROM users 
      ORDER BY username
    `);
    
    usersResult.recordset.forEach(row => {
      console.log(`- ${row.username} (${row.email}): "${row.role}"`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

checkRoles();