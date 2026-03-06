const axios = require('axios');
const https = require('https');

// Ignore SSL certificate errors
const agent = new https.Agent({  
  rejectUnauthorized: false
});

const BASE_URL = 'http://localhost:3001/api';

async function testAdminUsersCRUD() {
  try {
    console.log('--- Starting AdminUsers CRUD Test ---');

    // 1. Register a temporary Admin user in Users table
    const adminUser = {
      username: 'admin_test_' + Date.now(),
      email: 'admin_test_' + Date.now() + '@example.com',
      password: 'Password123!',
      fullName: 'Test Admin User',
      role: 'Admin'
    };
    
    console.log('1. Registering temp Admin user:', adminUser.username);
    const registerRes = await axios.post(`${BASE_URL}/auth/register`, adminUser, { httpsAgent: agent });
    const { token, user } = registerRes.data.data;
    console.log('   Registered successfully. ID:', user.id, 'Role:', user.role);

    // 2. List AdminUsers
    console.log('\n2. Listing AdminUsers...');
    const listRes = await axios.get(`${BASE_URL}/admin-users`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    console.log('   Success. Total count:', listRes.data.data.pagination.total);

    // 2.5 Get Stats
console.log('\n2.5 Getting Admin Stats...');
try {
    const statsRes = await axios.get(`${BASE_URL}/admin-users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent
    });
    console.log('   Stats fetched successfully.');
    console.log('   Total Users:', statsRes.data.data.totalUsers);
    console.log('   Active Users:', statsRes.data.data.activeUsers);
    console.log('   Role Breakdown:', statsRes.data.data.roleBreakdown);
} catch (error) {
    console.error('   Failed to fetch stats:', error.response ? error.response.data : error.message);
}

// 3. Create a new AdminUser (in AdminUsers table)
    const newAdminUser = {
      username: 'new_admin_' + Date.now(),
      email: 'new_admin_' + Date.now() + '@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'Admin',
      role: 'Manager' // Creating a Manager
    };
    console.log('\n3. Creating new AdminUser:', newAdminUser.username);
    const createRes = await axios.post(`${BASE_URL}/admin-users`, newAdminUser, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    const createdId = createRes.data.data.id;
    console.log('   Created successfully. ID:', createdId);

    // 4. Get the created AdminUser details
    console.log('\n4. Getting AdminUser details...');
    const getRes = await axios.get(`${BASE_URL}/admin-users/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    console.log('   Fetched user:', getRes.data.data.user.username);

    // 5. Update the AdminUser
    const updateData = {
      firstName: 'Updated',
      lastName: 'Name'
    };
    console.log('\n5. Updating AdminUser...');
    const updateRes = await axios.put(`${BASE_URL}/admin-users/${createdId}`, updateData, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    console.log('   Updated successfully.');

    // 6. Delete the AdminUser (Soft Delete)
    console.log('\n6. Deleting AdminUser (Soft Delete)...');
    const deleteRes = await axios.delete(`${BASE_URL}/admin-users/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    console.log('   Soft deleted successfully.');

    // 7. Verify Soft Deletion
    console.log('\n7. Verifying soft deletion...');
    const checkSoftRes = await axios.get(`${BASE_URL}/admin-users/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    if (checkSoftRes.data.data.user.isActive === false) {
      console.log('   Success: User is inactive.');
    } else {
      console.error('   FAILURE: User is still active!');
    }

    // 8. Delete the AdminUser (Hard Delete)
    console.log('\n8. Deleting AdminUser (Hard Delete)...');
    await axios.delete(`${BASE_URL}/admin-users/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    console.log('   Hard deleted successfully.');

    // 9. Verify Hard Deletion
    console.log('\n9. Verifying hard deletion...');
    try {
      await axios.get(`${BASE_URL}/admin-users/${createdId}`, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent
      });
      console.error('   FAILURE: User still exists!');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('   Success: User not found (404).');
      } else {
        console.error('   Unexpected error:', error.message);
      }
    }

    console.log('\n--- Test Completed Successfully ---');

  } catch (error) {
    console.error('Test Failed:', error.response ? error.response.data : error.message);
  }
}

testAdminUsersCRUD();
