const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

async function testFrontendAPI() {
    try {
        console.log('=== 測試前端 API 調用 ===\n');

        // 1. 測試登入 API
        console.log('1. 測試登入 API...');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@winton.com.tw',
            password: 'admin123'
        });

        console.log('登入響應:', loginResponse.data);
        
        if (loginResponse.data.success) {
            console.log('✅ 登入成功');
            console.log('Token:', loginResponse.data.data.token);
            
            const token = loginResponse.data.data.token;
            
            // 2. 測試用戶資料 API
            console.log('\n2. 測試用戶資料 API...');
            const userResponse = await axios.get(`${BASE_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('用戶響應:', userResponse.data);
            
            if (userResponse.data.success) {
                console.log('✅ 用戶資料獲取成功');
                if (userResponse.data.data && userResponse.data.data.user) {
                    console.log('用戶信息:', {
                        id: userResponse.data.data.user.id,
                        email: userResponse.data.data.user.email,
                        role: userResponse.data.data.user.role
                    });
                } else {
                    console.log('用戶數據:', userResponse.data);
                }
            }
            
            // 3. 測試活動 API (使用前端相同的端點)
            console.log('\n3. 測試活動 API...');
            const campaignsResponse = await axios.get(`${BASE_URL}/campaigns`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('活動響應:', campaignsResponse.data);
            
            if (campaignsResponse.data.success) {
                console.log('✅ 活動 API 調用成功');
                console.log('活動總數:', campaignsResponse.data.data?.pagination?.total);
                
                const campaigns = campaignsResponse.data.data?.campaigns || [];
                console.log('活動列表長度:', campaigns.length);
                
                if (campaigns.length > 0) {
                    console.log('\n活動列表:');
                    campaigns.forEach((campaign, index) => {
                        console.log(`  ${index + 1}. ${campaign.name} (狀態: ${campaign.status})`);
                    });
                } else {
                    console.log('⚠️  活動列表為空');
                }
            } else {
                console.log('❌ 活動 API 調用失敗:', campaignsResponse.data.message);
            }
            
            // 4. 測試不帶認證的活動 API (模擬開發模式)
            console.log('\n4. 測試不帶認證的活動 API (開發模式)...');
            const devCampaignsResponse = await axios.get(`${BASE_URL}/campaigns`);
            
            console.log('開發模式活動響應:', devCampaignsResponse.data);
            
            if (devCampaignsResponse.data.success) {
                console.log('✅ 開發模式活動 API 調用成功');
                console.log('活動總數:', devCampaignsResponse.data.data?.pagination?.total);
                
                const devCampaigns = devCampaignsResponse.data.data?.campaigns || [];
                console.log('活動列表長度:', devCampaigns.length);
                
                if (devCampaigns.length > 0) {
                    console.log('\n開發模式活動列表:');
                    devCampaigns.forEach((campaign, index) => {
                        console.log(`  ${index + 1}. ${campaign.name} (狀態: ${campaign.status})`);
                    });
                }
            } else {
                console.log('❌ 開發模式活動 API 調用失敗:', devCampaignsResponse.data.message);
            }
            
        } else {
            console.log('❌ 登入失敗:', loginResponse.data.message);
        }
        
    } catch (error) {
        console.error('❌ 測試過程中發生錯誤:', error.message);
        if (error.response) {
            console.error('響應狀態:', error.response.status);
            console.error('響應數據:', error.response.data);
        }
    }
}

testFrontendAPI();