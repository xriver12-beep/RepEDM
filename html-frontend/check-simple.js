const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 監聽導航事件
    page.on('framenavigated', frame => {
        console.log('🔄 頁面導航:', frame.url());
    });
    
    // 監聽請求
    page.on('request', request => {
        if (request.url().includes('campaigns.html')) {
            console.log('📄 請求 campaigns.html:', request.url());
        }
    });
    
    // 監聽響應
    page.on('response', response => {
        if (response.url().includes('campaigns.html')) {
            console.log('📄 響應 campaigns.html:', response.status(), response.url());
        }
    });
    
    try {
        console.log('🌐 正在載入頁面...');
        await page.goto('http://localhost:3002/campaigns.html', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        console.log('📍 當前 URL:', page.url());
        
        // 等待一段時間
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('📍 3秒後 URL:', page.url());
        
        // 檢查頁面標題
        const title = await page.title();
        console.log('📄 頁面標題:', title);
        
        // 檢查是否有 #campaignsList
        const hasElement = await page.evaluate(() => {
            return !!document.querySelector('#campaignsList');
        });
        
        console.log('📦 #campaignsList 存在:', hasElement);
        
        // 檢查頁面 HTML 的一部分
        const bodyContent = await page.evaluate(() => {
            const body = document.body;
            return body ? body.innerHTML.substring(0, 500) : 'No body';
        });
        
        console.log('📝 頁面內容預覽:', bodyContent);
        
        // 再等待一段時間看是否有變化
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('📍 8秒後 URL:', page.url());
        
        const hasElementAfter = await page.evaluate(() => {
            return !!document.querySelector('#campaignsList');
        });
        
        console.log('📦 8秒後 #campaignsList 存在:', hasElementAfter);
        
    } catch (error) {
        console.error('❌ 檢查過程中發生錯誤:', error);
    } finally {
        console.log('✅ 檢查完成');
        await browser.close();
    }
})();