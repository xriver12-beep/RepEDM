const { executeQuery, connectDB } = require('./src/config/database');

async function switchSSLToPEM() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // Update the active certificate to use the PEM/Key files
        // cert: 1767201632010-server.cer
        // key: 1767223353659-winton2026.key
        
        const certFilename = '1767201632010-server.cer';
        const keyFilename = '1767223353659-winton2026.key';

        const query = `
            UPDATE SSLCertificates
            SET cert_filename = @certFilename,
                key_filename = @keyFilename,
                passphrase = NULL
            WHERE is_active = 1
        `;

        await executeQuery(query, {
            certFilename: certFilename,
            keyFilename: keyFilename
        });

        console.log(`Updated SSL configuration to use ${certFilename} and ${keyFilename}`);
        process.exit(0);
    } catch (err) {
        console.error('Error switching SSL to PEM:', err);
        process.exit(1);
    }
}

switchSSLToPEM();
