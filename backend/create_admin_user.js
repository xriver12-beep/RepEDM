const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { connectDB } = require('./src/config/database');
require('dotenv').config();

async function createAdminUser() {
    try {
        const pool = await connectDB();
        
        const email = 'testadmin@winton.com';
        const username = 'testadmin';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 12);
        
        console.log(`Creating/Updating user ${email}...`);

        // Check if user exists by email OR username
        const check = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('username', sql.NVarChar, username)
            .query("SELECT id FROM Users WHERE email = @email OR username = @username");

        if (check.recordset.length > 0) {
            // Update
            await pool.request()
                .input('password_hash', sql.NVarChar, hashedPassword)
                .input('email', sql.NVarChar, email)
                .input('username', sql.NVarChar, username)
                .query("UPDATE Users SET password_hash = @password_hash, role = 'admin', email = @email WHERE username = @username");
            console.log('User updated.');
        } else {
            // Insert
            await pool.request()
                .input('username', sql.NVarChar, username)
                .input('email', sql.NVarChar, email)
                .input('password_hash', sql.NVarChar, hashedPassword)
                .input('full_name', sql.NVarChar, 'Test Admin')
                .query(`
                    INSERT INTO Users (username, email, password_hash, full_name, role, is_active)
                    VALUES (@username, @email, @password_hash, @full_name, 'admin', 1)
                `);
            console.log('User created.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

createAdminUser();
