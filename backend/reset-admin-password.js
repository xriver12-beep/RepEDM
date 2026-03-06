require('dotenv').config();
const { connectDB, closeDB } = require('./src/config/database');
const sql = require('mssql');
const bcrypt = require('bcryptjs');

async function resetAdminPassword() {
  try {
    const pool = await connectDB();
    const username = 'admin';
    const password = 'admin123';
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    console.log(`Resetting password for user '${username}'...`);
    
    // Check if user exists
    const checkUser = await pool.request()
      .input('username', sql.NVarChar(50), username)
      .query('SELECT AdminUserID FROM AdminUsers WHERE Username = @username');
      
    if (checkUser.recordset.length === 0) {
        console.log(`User '${username}' not found. Creating new admin user...`);
        // Create new admin user
        await pool.request()
            .input('username', sql.NVarChar(50), username)
            .input('email', sql.NVarChar(100), 'admin@example.com')
            .input('passwordHash', sql.NVarChar(255), passwordHash)
            .input('salt', sql.NVarChar(255), salt)
            .input('firstName', sql.NVarChar(50), 'Admin')
            .input('lastName', sql.NVarChar(50), 'User')
            .input('displayName', sql.NVarChar(100), 'System Administrator')
            .input('role', sql.NVarChar(20), 'Admin')
            .query(`
                INSERT INTO AdminUsers (
                    Username, Email, PasswordHash, Salt, FirstName, LastName, 
                    DisplayName, Role, IsActive, IsEmailVerified, CreatedAt, UpdatedAt
                ) VALUES (
                    @username, @email, @passwordHash, @salt, @firstName, @lastName,
                    @displayName, @role, 1, 1, GETDATE(), GETDATE()
                )
            `);
        console.log('New admin user created successfully.');
    } else {
        // Update existing user
        await pool.request()
            .input('username', sql.NVarChar(50), username)
            .input('passwordHash', sql.NVarChar(255), passwordHash)
            .input('salt', sql.NVarChar(255), salt)
            .query(`
                UPDATE AdminUsers 
                SET PasswordHash = @passwordHash,
                    Salt = @salt,
                    LockedUntil = NULL, 
                    FailedLoginAttempts = 0,
                    IsActive = 1,
                    UpdatedAt = GETDATE()
                WHERE Username = @username
            `);
        console.log('Admin password updated successfully.');
    }
    
    // Verify login logic simulation
    const userResult = await pool.request()
        .input('username', sql.NVarChar(50), username)
        .query('SELECT PasswordHash, IsActive, LockedUntil FROM AdminUsers WHERE Username = @username');
        
    const user = userResult.recordset[0];
    const isMatch = await bcrypt.compare(password, user.PasswordHash);
    
    console.log('--- Verification ---');
    console.log('User Active:', user.IsActive);
    console.log('Locked:', user.LockedUntil);
    console.log('Password Match Check:', isMatch ? 'PASS' : 'FAIL');

  } catch (err) {
    console.error('Error resetting password:', err);
  } finally {
    await closeDB();
  }
}

resetAdminPassword();
