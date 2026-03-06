const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/admin-auth';

async function testAuthEndpoints() {
    console.log('Starting auth endpoints existence test...');
    
    // Test Change Password existence (expect 401 Unauthorized, not 404 Not Found)
    try {
        console.log('\nTesting Change Password existence (No Token)...');
        await axios.post(`${BASE_URL}/change-password`, {});
        console.error('❌ Should have failed with 401');
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                console.log('✅ Change Password endpoint exists (Got 401 as expected)');
            } else if (error.response.status === 404) {
                console.error('❌ Change Password endpoint NOT FOUND (Got 404)');
            } else {
                console.log(`⚠️ Got status ${error.response.status}:`, error.response.data);
            }
        } else {
            console.error('❌ Network error:', error.message);
        }
    }
    
     // Test Profile existence (expect 401 Unauthorized, not 404 Not Found)
    try {
        console.log('\nTesting Profile existence (No Token)...');
        await axios.put(`${BASE_URL}/profile`, {});
        console.error('❌ Should have failed with 401');
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                console.log('✅ Profile endpoint exists (Got 401 as expected)');
            } else if (error.response.status === 404) {
                console.error('❌ Profile endpoint NOT FOUND (Got 404)');
            } else {
                console.log(`⚠️ Got status ${error.response.status}:`, error.response.data);
            }
        } else {
            console.error('❌ Network error:', error.message);
        }
    }

}

testAuthEndpoints();
