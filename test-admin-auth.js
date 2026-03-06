const BASE_URL = 'http://localhost:3001/api';

async function testAdminAuth() {
    try {
        console.log('1. Attempting login...');
        const loginResponse = await fetch(`${BASE_URL}/admin-auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });

        const loginData = await loginResponse.json();

        if (!loginData.success) {
            console.error('Login failed:', loginData);
            return;
        }

        const token = loginData.token;
        console.log('Login successful. Token:', token.substring(0, 20) + '...');

        console.log('\n2. Testing /api/admin-auth/me ...');
        const meResponse = await fetch(`${BASE_URL}/admin-auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const meData = await meResponse.json();
        console.log('Me response:', meData.success ? 'Success' : 'Failed', meResponse.status);
        if (!meData.success) console.error(meData);

        console.log('\n3. Testing /api/users/stats/overview (User Management API) ...');
        const statsResponse = await fetch(`${BASE_URL}/users/stats/overview`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const statsData = await statsResponse.json();
        console.log('Stats response:', statsData.success ? 'Success' : 'Failed', statsResponse.status);
        if (!statsData.success) console.error(statsData);

    } catch (error) {
        console.error('Test script error:', error);
    }
}

testAdminAuth();
