const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

// 測試用的管理員 token (需要先登入獲取)
let adminToken = '';

async function loginAsAdmin() {
  try {
    const response = await axios.post(`${BASE_URL}/admin-auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    if (response.data.success) {
      adminToken = response.data.token;
      console.log('✅ 管理員登入成功');
      return true;
    }
  } catch (error) {
    console.error('❌ 管理員登入失敗:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testSubscribersList() {
  try {
    console.log('\n🔍 測試訂閱者列表 API...');
    
    const response = await axios.get(`${BASE_URL}/subscribers?limit=5`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (response.data.success && response.data.data.subscribers.length > 0) {
      const subscriber = response.data.data.subscribers[0];
      console.log('✅ 列表 API 回應成功');
      
      // 檢查新欄位是否存在
      const expectedFields = ['birthday', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'custId', 'originalId'];
      const missingFields = [];
      
      expectedFields.forEach(field => {
        if (!(field in subscriber)) {
          missingFields.push(field);
        }
      });
      
      if (missingFields.length === 0) {
        console.log('✅ 所有新欄位都存在於列表 API 回應中');
        console.log('📋 範例訂閱者資料:');
        console.log(`   ID: ${subscriber.id}`);
        console.log(`   Email: ${subscriber.email}`);
        console.log(`   Company: ${subscriber.companyName}`);
        console.log(`   Birthday: ${subscriber.birthday}`);
        console.log(`   F1: ${subscriber.f1}`);
        console.log(`   F2: ${subscriber.f2}`);
        console.log(`   F3: ${subscriber.f3}`);
        console.log(`   F4: ${subscriber.f4}`);
        console.log(`   F5: ${subscriber.f5}`);
        console.log(`   F6: ${subscriber.f6}`);
        console.log(`   Cust ID: ${subscriber.custId}`);
        console.log(`   Original ID: ${subscriber.originalId}`);
      } else {
        console.log('❌ 列表 API 缺少以下欄位:', missingFields.join(', '));
      }
      
      return subscriber.id; // 返回第一個訂閱者的 ID 用於詳細測試
    } else {
      console.log('❌ 列表 API 沒有返回訂閱者資料');
      return null;
    }
  } catch (error) {
    console.error('❌ 列表 API 測試失敗:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testSubscriberDetail(subscriberId) {
  try {
    console.log('\n🔍 測試訂閱者詳細 API...');
    
    const response = await axios.get(`${BASE_URL}/subscribers/${subscriberId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (response.data.success) {
      const subscriber = response.data.data.subscriber;
      console.log('✅ 詳細 API 回應成功');
      
      // 檢查新欄位是否存在
      const expectedFields = ['birthday', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'custId', 'originalId'];
      const missingFields = [];
      
      expectedFields.forEach(field => {
        if (!(field in subscriber)) {
          missingFields.push(field);
        }
      });
      
      if (missingFields.length === 0) {
        console.log('✅ 所有新欄位都存在於詳細 API 回應中');
        console.log('📋 詳細訂閱者資料:');
        console.log(`   ID: ${subscriber.id}`);
        console.log(`   Email: ${subscriber.email}`);
        console.log(`   Company: ${subscriber.companyName}`);
        console.log(`   Birthday: ${subscriber.birthday}`);
        console.log(`   F1: ${subscriber.f1}`);
        console.log(`   F2: ${subscriber.f2}`);
        console.log(`   F3: ${subscriber.f3}`);
        console.log(`   F4: ${subscriber.f4}`);
        console.log(`   F5: ${subscriber.f5}`);
        console.log(`   F6: ${subscriber.f6}`);
        console.log(`   Cust ID: ${subscriber.custId}`);
        console.log(`   Original ID: ${subscriber.originalId}`);
        console.log(`   Custom Fields: ${JSON.stringify(subscriber.customFields)}`);
      } else {
        console.log('❌ 詳細 API 缺少以下欄位:', missingFields.join(', '));
      }
    } else {
      console.log('❌ 詳細 API 沒有返回訂閱者資料');
    }
  } catch (error) {
    console.error('❌ 詳細 API 測試失敗:', error.response?.data?.message || error.message);
  }
}

async function runTests() {
  console.log('🚀 開始測試 API 欄位...\n');
  
  // 1. 登入管理員
  const loginSuccess = await loginAsAdmin();
  if (!loginSuccess) {
    console.log('❌ 無法登入，測試終止');
    return;
  }
  
  // 2. 測試列表 API
  const subscriberId = await testSubscribersList();
  
  // 3. 測試詳細 API
  if (subscriberId) {
    await testSubscriberDetail(subscriberId);
  }
  
  console.log('\n🎉 API 欄位測試完成！');
}

runTests().catch(console.error);