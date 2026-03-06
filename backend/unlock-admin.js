require('dotenv').config();
const { connectDB, closeDB } = require('./src/config/database');
const sql = require('mssql');

async function unlockAdmin() {
  try {
    const pool = await connectDB();
    
    // Update admin user to unlock account and reset failed login attempts
    const result = await pool.request()
      .input('username', sql.NVarChar(50), 'admin')
      .query(`
        UPDATE AdminUsers 
        SET LockedUntil = NULL, 
            FailedLoginAttempts = 0 
        WHERE Username = @username
      `);
      
    if (result.rowsAffected[0] > 0) {
      console.log('Successfully unlocked admin account.');
    } else {
      console.log('Admin account not found or already unlocked.');
    }
    
    // Check current status
    const user = await pool.request()
        .input('username', sql.NVarChar(50), 'admin')
        .query('SELECT Username, LockedUntil, FailedLoginAttempts FROM AdminUsers WHERE Username = @username');
        
    console.log('Current Admin Status:', user.recordset[0]);

  } catch (err) {
    console.error('Error unlocking account:', err);
  } finally {
    await closeDB();
  }
}

unlockAdmin();
