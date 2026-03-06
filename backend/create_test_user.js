const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Wint0n2k00',
    server: 'edm2022',
    database: 'WintonEDM',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function createTestUser() {
    try {
        await sql.connect(config);
        
        // Delete if exists
        await sql.query("DELETE FROM Users WHERE username = 'security_test'");
        
        // Insert
        await sql.query(`
            INSERT INTO Users (username, email, password_hash, full_name, role, is_active, created_at, updated_at)
            VALUES ('security_test', 'security_test@example.com', '$2a$12$Offn1OKUWNVlZsF9TtCpS.4M5wElRC9NpQSKMmj4egfVq0IP0LjI2', 'Security Test', 'Manager', 1, GETDATE(), GETDATE())
        `);
        
        console.log('Test user created.');
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

createTestUser();
