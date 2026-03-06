const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

async function testDashboard() {
  try {
    // 1. Login
    console.log('Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/admin-auth/login`, {
      username: 'admin',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.error('Login failed:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    console.log('Login successful. Token obtained.');

    // 2. Fetch Dashboard Data
    console.log('Fetching dashboard data...');
    const dashboardResponse = await axios.get(`${BASE_URL}/analytics/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (dashboardResponse.data.success) {
      console.log('Dashboard data fetched successfully!');
      console.log('Stats:', dashboardResponse.data.data.stats);
      console.log('Activities count:', dashboardResponse.data.data.activities?.length);
      console.log('Login Logs:', JSON.stringify(dashboardResponse.data.data.loginLogs, null, 2));
      console.log('Charts keys:', Object.keys(dashboardResponse.data.data.charts || {}));
      
      const charts = dashboardResponse.data.data.charts;
      if (charts) {
          console.log('Subscriber Growth Data Points:', charts.subscriberGrowth?.length);
          console.log('Email Performance Data Points:', charts.emailPerformance?.length);
      }
    } else {
      console.error('Failed to fetch dashboard data:', dashboardResponse.data);
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testDashboard();
