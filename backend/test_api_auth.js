const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = '5f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a';
// Use HTTP 3001 to bypass IIS/Proxy if any, to test Node.js directly
const BASE_URL = 'http://localhost:3001/api/subscribers'; 

async function test() {
    // 1. Generate Token (simulating Admin user)
    // admin-auth.js checks for adminUserID or userId
    const token = jwt.sign(
        { 
            userId: 1, 
            adminUserID: '12345678-1234-1234-1234-123456789012', // Fake UUID
            role: 'Admin',
            email: 'admin@example.com' 
        }, 
        JWT_SECRET, 
        { expiresIn: '1h' }
    );

    // 2. Test POST with INVALID token
    try {
        console.log('--- Testing POST /api/subscribers with INVALID token ---');
        await axios.post(BASE_URL, {
            email: 'test_auth_invalid@example.com'
        }, {
            headers: {
                'Authorization': `Bearer INVALID_TOKEN`
            }
        });
    } catch (err) {
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Content-Type:', err.response.headers['content-type']);
            console.log('Body:', err.response.data);
            console.log('Is Body String?', typeof err.response.data === 'string');
        } else {
            console.error('Error:', err.message);
        }
    }

    // 3. Test POST with NO token
    try {
        console.log('\n--- Testing POST /api/subscribers with NO token (HTTPS) ---');
        await axios.post(BASE_URL, {
            email: 'test_auth_no_token@example.com'
        }, {
            httpsAgent: agent
        });
    } catch (err) {
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Content-Type:', err.response.headers['content-type']);
            console.log('Body:', err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

(async () => {
    try {
        console.log('Starting test...');
        await test();
        console.log('Test finished.');
    } catch (e) {
        console.error('Fatal:', e);
    }
})();
