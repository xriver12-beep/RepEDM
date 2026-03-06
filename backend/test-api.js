const axios = require('axios');

async function testAPI() {
  try {
    console.log('🧪 開始測試 API...');
    
    // 測試登入
    console.log('1. 測試登入 API...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@winton.com',
      password: 'admin123'
    });
    
    console.log('✅ 登入成功!');
    const token = loginResponse.data.data.token;
    
    // 測試 subscribers API
    console.log('2. 測試 subscribers API...');
    const subscribersResponse = await axios.get('http://localhost:3001/api/subscribers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Subscribers API 成功!');
    console.log(`📊 找到 ${subscribersResponse.data.data.length} 個訂閱者`);
    
    // 顯示第一個訂閱者的資料結構
    if (subscribersResponse.data.data.length > 0) {
      console.log('📋 第一個訂閱者的資料結構:');
      console.log(JSON.stringify(subscribersResponse.data.data[0], null, 2));
    }
    
    console.log('🎉 所有 API 測試通過!');
    
  } catch (error) {
    console.error('❌ API 測試失敗:', error.response?.data || error.message);
  }
}

testAPI();