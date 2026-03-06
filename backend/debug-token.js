const { sql, connectDB } = require('./src/config/database');

async function checkResetToken() {
    try {
        await connectDB();
        
        const result = await sql.query`
            SELECT id, email, reset_token, reset_token_expires 
            FROM Users 
            WHERE email = 'admin@example.com'
        `;
        
        if (result.recordset.length > 0) {
            console.log('User found:', result.recordset[0]);
            const token = result.recordset[0].reset_token;
            console.log(`Reset Link: https://edm2022.winton.com.tw:3443/reset-password.html?token=${token}`);
        } else {
            console.log('User admin@example.com not found. Trying to list all users...');
            const allUsers = await sql.query`SELECT id, email FROM Users`;
            console.table(allUsers.recordset);
        }

    } catch (err) {
        console.error('Database error:', err);
    } finally {
        process.exit(0);
    }
}

checkResetToken();