const imap = require('imap-simple');
require('dotenv').config();

const config = {
    imap: {
        user: 'edm_unsubscribe@winton.com.tw', // Trying the new account
        password: 'Wint0n2k00', // Assuming same password
        host: 'mail.winton.com.tw',
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function testConnection() {
    try {
        console.log('Connecting to IMAP...');
        const connection = await imap.connect(config);
        console.log('Connected successfully!');
        
        const boxes = await connection.getBoxes();
        console.log('Available boxes:', Object.keys(boxes));
        
        connection.end();
    } catch (err) {
        console.error('Connection failed:', err);
    }
}

testConnection();
