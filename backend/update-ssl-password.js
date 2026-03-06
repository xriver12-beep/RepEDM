const { executeQuery, connectDB } = require('./src/config/database');

async function updateSSLPassword() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // 1. Check if passphrase column exists
        const checkColumn = await executeQuery(`
            SELECT * FROM sys.columns 
            WHERE object_id = OBJECT_ID('SSLCertificates') AND name = 'passphrase'
        `);

        if (checkColumn.recordset.length === 0) {
            console.log('Adding passphrase column...');
            await executeQuery(`ALTER TABLE SSLCertificates ADD passphrase NVARCHAR(255) NULL`);
            console.log('passphrase column added.');
        } else {
            console.log('passphrase column already exists.');
        }

        // 2. Update the active certificate with the password
        console.log('Updating certificate password...');
        // Only update the one we likely just inserted or the active one
        await executeQuery(`
            UPDATE SSLCertificates 
            SET passphrase = @passphrase 
            WHERE is_active = 1
        `, {
            passphrase: 'winton'
        });

        console.log('Certificate password updated to "winton".');
        process.exit(0);
    } catch (err) {
        console.error('Error updating SSL password:', err);
        process.exit(1);
    }
}

updateSSLPassword();
