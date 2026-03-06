const puppeteer = require('puppeteer');

async function checkFrontendData() {
    let browser;
    try {
        console.log('啟動瀏覽器...');
        browser = await puppeteer.launch({
            headless: false,
            devtools: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // 監聽控制台日誌
        const logs = [];
        page.on('console', msg => {
            const text = msg.text();
            logs.push(text);
            console.log(`[瀏覽器控制台] ${msg.type()}: ${text}`);
        });
        
        // 監聽網路請求
        page.on('response', response => {
            if (response.url().includes('/api/campaigns')) {
                console.log(`[網路請求] ${response.status()} ${response.url()}`);
            }
        });
        
        console.log('導航到活動頁面...');
        await page.goto('http://localhost:3002/campaigns.html', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // 等待頁面載入完成
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 檢查是否有活動數據
        const campaignElements = await page.$$('.campaign-item, .table-row, [data-campaign-id]');
        console.log(`\n找到 ${campaignElements.length} 個活動元素`);
        
        // 檢查統計數據
        const statsElements = await page.$$('.stat-value, .stats-card .value');
        if (statsElements.length > 0) {
            console.log('\n統計數據:');
            for (let i = 0; i < statsElements.length; i++) {
                const value = await statsElements[i].textContent();
                console.log(`  統計 ${i + 1}: ${value}`);
            }
        }
        
        // 檢查是否顯示了"暫無活動數據"
        const emptyMessage = await page.$('.empty-message, .no-data');
        if (emptyMessage) {
            const text = await emptyMessage.textContent();
            console.log(`\n空數據訊息: ${text}`);
        }
        
        // 檢查本地存儲中的數據
        const localStorageData = await page.evaluate(() => {
            const data = localStorage.getItem('campaigns_data');
            return data ? JSON.parse(data) : null;
        });
        
        if (localStorageData) {
            console.log(`\n本地存儲中的活動數量: ${localStorageData.length}`);
            if (localStorageData.length > 0) {
                console.log('第一個活動:', localStorageData[0]);
            }
        }
        
        // 檢查控制台日誌中的關鍵信息
        console.log('\n=== 控制台日誌分析 ===');
        const apiLogs = logs.filter(log => log.includes('API 響應') || log.includes('成功載入活動') || log.includes('模擬數據'));
        apiLogs.forEach(log => console.log(`  ${log}`));
        
        // 等待一段時間以便觀察
        console.log('\n等待 5 秒以便觀察頁面...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('檢查失敗:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

checkFrontendData();