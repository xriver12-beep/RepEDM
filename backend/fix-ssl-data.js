const { executeQuery, connectDB } = require('./src/config/database');

async function fixSSLData() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // Check if there are any active certificates
        const checkResult = await executeQuery('SELECT * FROM SSLCertificates WHERE is_active = 1');
        if (checkResult.recordset.length > 0) {
            console.log('Active certificate already exists.');
            process.exit(0);
        }

        console.log('No active certificate found. Inserting default certificate record...');

        // Insert the latest PFX certificate found in the directory
        // Based on LS output: 1767223353659-winton2026.pfx seems to be the latest one matching the key
        const certFilename = '1767223353659-winton2026.pfx';
        const keyFilename = '1767223353659-winton2026.key'; // PFX usually doesn't need separate key file in this logic if handled as PFX, but DB schema might require it or not. 
        // Logic in app.js: 
        // if (cert.cert_filename.endsWith('.pfx') ... ) { ... }
        // else { const keyPath = path.join(certDir, cert.key_filename); ... }
        // So for PFX, key_filename is not used in the logic, but let's provide it if available just in case.

        const query = `
            INSERT INTO SSLCertificates (
                common_name, 
                issuer, 
                valid_from, 
                valid_to, 
                cert_filename, 
                key_filename, 
                is_active, 
                uploaded_at
            ) VALUES (
                'winton.com.tw', 
                'Winton CA', 
                GETDATE(), 
                DATEADD(YEAR, 1, GETDATE()), 
                @certFilename, 
                @keyFilename, 
                1, 
                GETDATE()
            )
        `;

        await executeQuery(query, {
            certFilename: certFilename,
            keyFilename: keyFilename
        });

        console.log(`Certificate ${certFilename} inserted and activated.`);
        process.exit(0);
    } catch (err) {
        console.error('Error fixing SSL data:', err);
        process.exit(1);
    }
}

fixSSLData();
