const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testCategoriesAPI() {
    try {
        console.log('🧪 測試分類 API...\n');

        // 1. 測試獲取所有分類
        console.log('1. 測試獲取所有分類:');
        const categoriesResponse = await axios.get(`${API_BASE}/categories`);
        console.log(`✅ 狀態: ${categoriesResponse.status}`);
        console.log('回應資料結構:', typeof categoriesResponse.data);
        console.log('回應資料:', JSON.stringify(categoriesResponse.data, null, 2).substring(0, 500) + '...');
        
        // 檢查資料格式
        let categories = categoriesResponse.data;
        if (categories.success && categories.data && categories.data.categories) {
            categories = categories.data.categories;
        } else if (categories.data && Array.isArray(categories.data)) {
            categories = categories.data;
        } else if (!Array.isArray(categories)) {
            console.log('❌ 分類資料不是陣列格式');
            return;
        }
        
        console.log(`📊 分類總數: ${categories.length}`);
        
        // 顯示前5個分類
        if (categories.length > 0) {
            console.log('前5個分類:');
            categories.slice(0, 5).forEach(cat => {
                console.log(`  - ID: ${cat.id}, 名稱: ${cat.name}, 類型: ${cat.categoryType || cat.category_type || 'N/A'}`);
            });
        }

        // 2. 測試按類型獲取分類
        console.log('\n2. 測試按類型獲取分類 (t1):');
        try {
            const t1Response = await axios.get(`${API_BASE}/categories?type=t1`);
            let t1Categories = t1Response.data;
            if (t1Categories.data && Array.isArray(t1Categories.data)) {
                t1Categories = t1Categories.data;
            }
            console.log(`✅ t1 分類數量: ${Array.isArray(t1Categories) ? t1Categories.length : 'N/A'}`);
        } catch (error) {
            console.log('❌ 按類型獲取分類失敗:', error.message);
        }

        // 3. 測試獲取訂閱者資料
        console.log('\n3. 測試獲取訂閱者資料:');
        try {
            const subscribersResponse = await axios.get(`${API_BASE}/subscribers?limit=1`);
            console.log('訂閱者回應結構:', typeof subscribersResponse.data);
            
            let subscribers = subscribersResponse.data;
            if (subscribers.data && Array.isArray(subscribers.data)) {
                subscribers = subscribers.data;
            }
            
            if (Array.isArray(subscribers) && subscribers.length > 0) {
                const firstSubscriber = subscribers[0];
                console.log(`測試訂閱者: ${firstSubscriber.email} (ID: ${firstSubscriber.id})`);
                
                // 檢查訂閱者是否有分類資訊
                if (firstSubscriber.categories) {
                    console.log(`該訂閱者的分類數量: ${firstSubscriber.categories.length}`);
                } else {
                    console.log('該訂閱者沒有分類資訊');
                }
            }
        } catch (error) {
            console.log('❌ 獲取訂閱者資料失敗:', error.message);
        }

        console.log('\n✅ 分類 API 基本測試完成！');

    } catch (error) {
        console.error('❌ API 測試錯誤:', error.message);
        if (error.response) {
            console.error('回應狀態:', error.response.status);
            console.error('回應資料:', error.response.data);
        }
    }
}

testCategoriesAPI();