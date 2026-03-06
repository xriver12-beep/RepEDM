const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 監聽所有控制台消息
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`🖥️ [${type}]:`, text);
    });
    
    // 監聽頁面錯誤
    page.on('pageerror', error => {
        console.log('❌ 頁面錯誤:', error.message);
    });
    
    try {
        console.log('🌐 正在載入頁面...');
        await page.goto('http://localhost:3002/campaigns.html', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        console.log('⏳ 等待 DOM 載入...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 檢查 #campaignsList 元素
        const campaignsListCheck = await page.evaluate(() => {
            const element = document.querySelector('#campaignsList');
            return {
                exists: !!element,
                tagName: element ? element.tagName : null,
                id: element ? element.id : null,
                className: element ? element.className : null,
                innerHTML: element ? element.innerHTML.substring(0, 200) : null,
                parentElement: element && element.parentElement ? element.parentElement.tagName : null
            };
        });
        
        console.log('📦 #campaignsList 檢查:', campaignsListCheck);
        
        // 等待數據載入完成
        console.log('⏳ 等待數據載入完成...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 執行我們之前的檢查
        const finalResults = await page.evaluate(() => {
            // 檢查活動元素
            const campaignElements = document.querySelectorAll('.campaign-card, .campaign-item, [data-campaign-id]');
            
            // 檢查本地存儲
            const localStorageCampaigns = localStorage.getItem('campaigns');
            let campaignsCount = 'undefined';
            if (localStorageCampaigns) {
                try {
                    const parsed = JSON.parse(localStorageCampaigns);
                    campaignsCount = Array.isArray(parsed) ? parsed.length : 'not_array';
                } catch (e) {
                    campaignsCount = 'parse_error';
                }
            }
            
            // 檢查容器
            const campaignsList = document.querySelector('#campaignsList');
            
            // 檢查 DataTable
            const dataTableExists = typeof window.DataTable !== 'undefined';
            
            // 檢查表格行
            const tableRows = document.querySelectorAll('#campaignsList table tbody tr');
            
            // 檢查 JavaScript 對象
            const jsObjects = {
                DOMUtils: typeof window.DOMUtils !== 'undefined',
                CampaignManager: typeof window.CampaignManager !== 'undefined',
                campaignManager: typeof window.campaignManager !== 'undefined',
                DataTable: typeof window.DataTable !== 'undefined'
            };
            
            return {
                campaignElements: campaignElements.length,
                localStorageCampaigns: campaignsCount,
                campaignsListExists: !!campaignsList,
                campaignsListContent: campaignsList ? campaignsList.innerHTML.substring(0, 300) : null,
                dataTableExists: dataTableExists,
                tableRows: tableRows.length,
                jsObjects: jsObjects
            };
        });
        
        console.log('🔍 最終檢查結果:');
        console.log('  📊 活動元素數量:', finalResults.campaignElements);
        console.log('  💾 本地存儲活動數量:', finalResults.localStorageCampaigns);
        console.log('  📦 campaignsList 容器存在:', finalResults.campaignsListExists);
        console.log('  📋 DataTable 存在:', finalResults.dataTableExists);
        console.log('  📄 表格行數:', finalResults.tableRows);
        console.log('  🔧 JavaScript 對象載入狀態:', finalResults.jsObjects);
        
        if (finalResults.campaignsListContent) {
            console.log('  📝 campaignsList 內容預覽:', finalResults.campaignsListContent);
        }
        
    } catch (error) {
        console.error('❌ 檢查過程中發生錯誤:', error);
    } finally {
        console.log('✅ 檢查完成');
        await browser.close();
    }
})();