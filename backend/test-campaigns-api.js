const axios = require('axios');

async function testCampaignsAPI() {
  try {
    console.log('🧪 開始測試活動 API...');
    
    // 測試登入
    console.log('1. 測試登入 API...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@winton.com.tw',
      password: 'admin123'
    });
    
    console.log('✅ 登入成功!');
    console.log('登入響應:', JSON.stringify(loginResponse.data, null, 2));
    
    const token = loginResponse.data.token || loginResponse.data.data?.token;
    console.log('Token:', token ? `${token.substring(0, 20)}...` : 'undefined');
    
    if (!token) {
      console.error('❌ 無法獲取認證令牌');
      return;
    }
    
    // 測試用戶資料 API
    console.log('\n2. 測試用戶資料 API...');
    const profileResponse = await axios.get('http://localhost:3001/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ 用戶資料 API 成功!');
    console.log('用戶資料:', JSON.stringify(profileResponse.data, null, 2));
    
    // 測試活動 API
    console.log('\n3. 測試活動 API...');
    const campaignsResponse = await axios.get('http://localhost:3001/api/campaigns', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ 活動 API 成功!');
    console.log('活動響應:', JSON.stringify(campaignsResponse.data, null, 2));
    
    console.log('🎉 活動 API 測試通過!');
    
  } catch (error) {
    console.error('❌ API 測試失敗:');
    if (error.response) {
      console.error('狀態碼:', error.response.status);
      console.error('響應數據:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('錯誤訊息:', error.message);
    }
  }
}

testCampaignsAPI();