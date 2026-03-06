
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'c:\\WintonEDM\\backend\\.env' });

const API_BASE_URL = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET;

async function testApi() {
    console.log('1. Generating mock token...');
    const token = jwt.sign(
        { userId: 1, email: 'sam@winton.com.tw', role: 'Admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    // Test 1: City (User says this works)
    try {
        const cityValue = '台北市';
        const url = `${API_BASE_URL}/subscribers?city=${encodeURIComponent(cityValue)}&limit=5`;
        console.log(`\nTesting City: ${cityValue}`);
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log(`Found: ${res.data.data.pagination.total}`);
        if (res.data.data.subscribers.length > 0) {
            console.log('Sample:', res.data.data.subscribers[0].city);
        }
    } catch (e) {
        console.error('City test failed:', e.message);
    }

    // Test 2: Country (User says this fails)
    try {
        const countryValue = '總公司';
        const url = `${API_BASE_URL}/subscribers?country=${encodeURIComponent(countryValue)}&limit=5`;
        console.log(`\nTesting Country: ${countryValue}`);
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log(`Found: ${res.data.data.pagination.total}`);
        if (res.data.data.subscribers.length > 0) {
            console.log('First Subscriber:', JSON.stringify(res.data.data.subscribers[0], null, 2));
        }
    } catch (e) {
        console.error('Country test failed:', e.message);
        if (e.response) console.error(e.response.data);
    }
}

testApi();
