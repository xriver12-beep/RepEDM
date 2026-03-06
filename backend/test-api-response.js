const http = require('http');

function testCategoriesAPI() {
    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/subscribers/categories',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const req = http.request(options, (res) => {
        console.log(`狀態碼: ${res.statusCode}`);
        console.log(`響應頭:`, res.headers);
        
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('\n📊 API 響應:');
                console.log(`Success: ${jsonData.success}`);
                console.log(`Categories 數量: ${jsonData.data?.categories?.length || 0}`);
                
                if (jsonData.data?.categories?.length > 0) {
                    console.log('\n前 5 個分類:');
                    jsonData.data.categories.slice(0, 5).forEach((cat, index) => {
                        console.log(`  ${index + 1}. ID: ${cat.id}, Type: ${cat.categoryType}, Name: ${cat.name}, Count: ${cat.subscriberCount}`);
                    });
                    
                    // 按類型統計
                    const typeStats = {};
                    jsonData.data.categories.forEach(cat => {
                        if (!typeStats[cat.categoryType]) {
                            typeStats[cat.categoryType] = 0;
                        }
                        typeStats[cat.categoryType]++;
                    });
                    
                    console.log('\n📈 按類型統計:');
                    Object.entries(typeStats).forEach(([type, count]) => {
                        console.log(`  ${type}: ${count} 個分類`);
                    });
                } else {
                    console.log('\n❌ Categories 數組為空');
                }
                
            } catch (error) {
                console.error('❌ JSON 解析錯誤:', error.message);
                console.log('原始響應:', data);
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ 請求錯誤:', error.message);
    });

    req.end();
}

console.log('正在測試分類 API...');
testCategoriesAPI();