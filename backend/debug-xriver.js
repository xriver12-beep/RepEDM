const { sql, connectDB } = require('./src/config/database');

async function debugXriver() {
  try {
    await connectDB();
    
    console.log('Querying for xriver11...');
    const result = await sql.query`SELECT * FROM Users WHERE username = 'xriver11' OR email LIKE 'xriver11%'`;
    
    if (result.recordset.length > 0) {
      console.log('Found User:', result.recordset[0]);
    } else {
      console.log('User xriver11 not found.');
    }
    
    console.log('Querying for Sam Wu (吳山姆)...');
    const resultSam = await sql.query`SELECT * FROM Users WHERE full_name LIKE N'%吳山姆%'`;
    if (resultSam.recordset.length > 0) {
      console.log('Found Sam Wu:', resultSam.recordset[0]);
    } else {
      console.log('User Sam Wu not found.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (sql) await sql.close();
  }
}

debugXriver();
