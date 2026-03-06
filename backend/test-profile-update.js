
const axios = require('axios');
const https = require('https');

// Ignore SSL certificate errors
const agent = new https.Agent({  
  rejectUnauthorized: false
});

const BASE_URL = 'http://localhost:3001/api/auth';
// Or if you want to test HTTPS: 'https://localhost:3443/api/auth'

async function testProfileUpdate() {
  try {
    // 1. Register a temp user
    const tempUser = {
      username: 'test_user_' + Date.now(),
      email: 'test_user_' + Date.now() + '@example.com',
      password: 'Password123!',
      fullName: 'Test User'
    };
    
    console.log('Registering user:', tempUser.username);
    const registerRes = await axios.post(`${BASE_URL}/register`, tempUser, { httpsAgent: agent });
    const { token, user } = registerRes.data.data;
    console.log('Registered successfully. ID:', user.id);

    // 2. Login (optional, we have token)
    
    // 3. Update profile (username and email)
    const newProfile = {
      fullName: 'Updated Name',
      username: 'updated' + Date.now(),
      email: 'updated' + Date.now() + '@example.com'
    };
    
    console.log('Updating profile to:', newProfile);
    const updateRes = await axios.put(`${BASE_URL}/profile`, newProfile, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    
    console.log('Update response:', updateRes.data);

    // 4. Get profile to verify
    const meRes = await axios.get(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    
    const fetchedUser = meRes.data.data.user;
    console.log('Fetched user:', fetchedUser);

    if (fetchedUser.username === newProfile.username && fetchedUser.email === newProfile.email) {
      console.log('SUCCESS: Profile updated correctly.');
    } else {
      console.error('FAILURE: Profile did not update correctly.');
      console.error('Expected:', newProfile);
      console.error('Actual:', { username: fetchedUser.username, email: fetchedUser.email });
    }

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testProfileUpdate();
