const puppeteer = require('puppeteer');

async function testApiConnection() {
    const browser = await puppeteer.launch({ 
        headless: false,
        devtools: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // 監聽控制台日誌
        page.on('console', msg => {
            console.log(`[CONSOLE ${msg.type()}]:`, msg.text());
        });
        
        // 監聽網路請求
        page.on('request', request => {
            if (request.url().includes('api')) {
                console.log(`[REQUEST]: ${request.method()} ${request.url()}`);
            }
        });
        
        // 監聽網路響應
        page.on('response', response => {
            if (response.url().includes('api')) {
                console.log(`[RESPONSE]: ${response.status()} ${response.url()}`);
            }
        });
        
        // 載入活動管理頁面
        console.log('載入活動管理頁面...');
        await page.goto('http://localhost:3002/campaigns.html', { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        // 等待頁面載入完成
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 檢查 API 連接狀態
        const apiStatus = await page.evaluate(() => {
            return new Promise((resolve) => {
                // 測試 API 連接
                fetch('http://localhost:3001/api/campaigns')
                    .then(response => {
                        console.log('API 響應狀態:', response.status);
                        return response.json();
                    })
                    .then(data => {
                        console.log('API 響應數據:', data);
                        resolve({
                            success: true,
                            status: 'connected',
                            data: data
                        });
                    })
                    .catch(error => {
                        console.error('API 連接失敗:', error);
                        resolve({
                            success: false,
                            status: 'failed',
                            error: error.message
                        });
                    });
            });
        });
        
        console.log('\n=== API 連接測試結果 ===');
        console.log('API 狀態:', apiStatus);
        
        // 檢查前端是否使用模擬數據
        const frontendStatus = await page.evaluate(() => {
            const campaignManager = window.campaignManager;
            if (campaignManager) {
                return {
                    campaignsCount: campaignManager.campaigns ? campaignManager.campaigns.length : 0,
                    isUsingMockData: campaignManager.campaigns && campaignManager.campaigns.some(c => c.id && typeof c.id === 'string' && c.id.startsWith('mock')),
                    campaigns: campaignManager.campaigns ? campaignManager.campaigns.slice(0, 3) : []
                };
            }
            return { error: 'CampaignManager 未載入' };
        });
        
        console.log('\n=== 前端狀態檢查 ===');
        console.log('前端狀態:', frontendStatus);
        
        // 等待一段時間觀察
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('測試過程中發生錯誤:', error);
    } finally {
        await browser.close();
    }
}

testApiConnection().catch(console.error);