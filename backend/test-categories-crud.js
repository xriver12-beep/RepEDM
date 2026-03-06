const axios = require('axios');
// const { expect } = require('chai'); 
// If chai is not available, I'll use simple console.assert or throw Error

const BASE_URL = 'http://localhost:3001/api';
// Assuming we have a way to get a token. 
// For now, we'll assume the test environment has a helper or we mock it.
// Actually, I need a token. I'll use the login endpoint if available or hardcode if I can't.
// I'll try to login as admin first.

let authToken = '';

async function login() {
    try {
        // Try admin login default
        const response = await axios.post(`${BASE_URL}/admin-auth/login`, {
            username: 'admin',
            password: 'admin123' 
        });
        authToken = response.data.token;
        console.log('✅ Login successful');
    } catch (error) {
        console.log('⚠️ Login failed:', error.response ? error.response.data : error.message);
        // Try alternate credentials if first fails
        try {
             const response = await axios.post(`${BASE_URL}/admin-auth/login`, {
                email: 'admin@example.com',
                password: 'password123'
            });
            authToken = response.data.token;
            console.log('✅ Login successful (alternate)');
        } catch (e) {
             console.log('⚠️ Alternate login failed too.');
        }
    }
}

// Simple assertion helper
function assert(condition, message) {
    if (!condition) {
        throw new Error(`❌ Assertion Failed: ${message}`);
    }
    console.log(`✅ ${message}`);
}

async function testCRUD() {
    console.log('=== Starting Category CRUD Tests ===');

    // Headers
    const config = {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    };

    const timestamp = Date.now();
    const testName = `Test_Category_${timestamp}`;
    let createdId = null;

    // 1. Create
    console.log('\n--- Test 1: Create Category ---');
    try {
        const payload = {
            name: testName,
            categoryType: 'customer',
            hierarchyType: 'customer',
            description: 'Unit Test Category',
            sortOrder: 1
        };
        const res = await axios.post(`${BASE_URL}/categories`, payload, config);
        console.log(`Status: ${res.status}`);
        if (res.status !== 200 && res.status !== 201) {
             console.log('Response:', res.data);
        }
        assert(res.status === 200 || res.status === 201, 'Create status should be 200 or 201');
        assert(res.data.success === true, 'Response should be success');
        createdId = res.data.data.id || res.data.data; // Adjust based on actual response
        // If response.data.data is just the ID or an object
        if (typeof createdId === 'object') createdId = createdId.id;
        
        console.log(`Created category ID: ${createdId}`);
    } catch (err) {
        console.error('Create failed:', err.response ? err.response.data : err.message);
        return;
    }

    // 2. Read (Get All)
    console.log('\n--- Test 2: Read Categories ---');
    try {
        const res = await axios.get(`${BASE_URL}/categories?hierarchyType=customer`, config);
        assert(res.status === 200, 'Get status should be 200');
        const found = res.data.data.categories.find(c => c.id == createdId);
        assert(found, 'Created category should be in the list');
        assert(found.name === testName, 'Name should match');
    } catch (err) {
        console.error('Read failed:', err.response ? err.response.data : err.message);
    }

    // 3. Update
    console.log('\n--- Test 3: Update Category ---');
    try {
        const updatePayload = {
            name: `${testName}_Updated`,
            description: 'Updated Description'
        };
        const res = await axios.put(`${BASE_URL}/categories/${createdId}`, updatePayload, config);
        assert(res.status === 200, 'Update status should be 200');
        
        // Verify update
        const verifyRes = await axios.get(`${BASE_URL}/categories?hierarchyType=customer`, config);
        const found = verifyRes.data.data.categories.find(c => c.id == createdId);
        assert(found.name === `${testName}_Updated`, 'Name should be updated');
    } catch (err) {
        console.error('Update failed:', err.response ? err.response.data : err.message);
    }

    // 4. Validation Check (Duplicate Name)
    console.log('\n--- Test 4: Duplicate Name Check ---');
    try {
        const payload = {
            name: `${testName}_Updated`, // Same name as currently exists
            categoryType: 'customer',
            hierarchyType: 'customer'
        };
        await axios.post(`${BASE_URL}/categories`, payload, config);
        throw new Error('Should have failed with duplicate name');
    } catch (err) {
        if (err.response && err.response.status === 400) {
            console.log('✅ Correctly rejected duplicate name');
        } else {
            console.error('❌ Failed to catch duplicate name or wrong error:', err.message);
        }
    }

    // 5. Delete
    console.log('\n--- Test 5: Delete Category ---');
    try {
        const res = await axios.delete(`${BASE_URL}/categories/${createdId}`, config);
        assert(res.status === 200, 'Delete status should be 200');
        
        // Verify delete
        const verifyRes = await axios.get(`${BASE_URL}/categories?hierarchyType=customer`, config);
        const found = verifyRes.data.data.categories.find(c => c.id == createdId);
        assert(!found, 'Category should not exist after delete');
    } catch (err) {
        console.error('Delete failed:', err.response ? err.response.data : err.message);
    }

    console.log('\n=== All CRUD Tests Completed ===');
}

// Run
(async () => {
    // Attempt login if needed, or just run
    // I'll skip login for now and assume headers are handled or auth is disabled for dev, 
    // OR I will implement a quick login helper if I find the creds.
    // Based on previous interactions, I might need a token.
    // I'll use the hardcoded admin token if I can find one, or try to login.
    // Let's try to login with common defaults.
    await login();
    if (!authToken) {
        console.log('Warning: No auth token. Tests might fail 401.');
    }
    await testCRUD();
})();
