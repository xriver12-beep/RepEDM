const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 監聽所有控制台消息
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`🖥️ 控制台 [${type}]:`, text);
    });
    
    // 監聽頁面錯誤
    page.on('pageerror', error => {
        console.log('❌ 頁面錯誤:', error.message);
    });
    
    // 監聽請求失敗
    page.on('requestfailed', request => {
        console.log('🚫 請求失敗:', request.url(), request.failure().errorText);
    });
    
    // 監聽響應
    page.on('response', response => {
        if (!response.ok()) {
            console.log(`⚠️ HTTP 錯誤: ${response.status()} ${response.url()}`);
        }
    });
    
    try {
        console.log('🌐 正在載入頁面...');
        await page.goto('http://localhost:3002/campaigns.html', { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        console.log('⏳ 等待頁面完全載入...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 檢查 JavaScript 是否載入
        const jsLoaded = await page.evaluate(() => {
            return {
                DOMUtils: typeof window.DOMUtils !== 'undefined',
                CampaignManager: typeof window.CampaignManager !== 'undefined',
                campaignManager: typeof window.campaignManager !== 'undefined',
                DataTable: typeof window.DataTable !== 'undefined'
            };
        });
        console.log('📦 JavaScript 載入狀態:', jsLoaded);
        
        // 檢查頁面元素
        const pageInfo = await page.evaluate(() => {
            // 檢查活動元素
            const campaignElements = document.querySelectorAll('.campaign-card, .campaign-item, [data-campaign]');
            
            // 檢查本地存儲
            const localStorageCampaigns = localStorage.getItem('campaigns');
            
            // 檢查 campaignsList 容器
            const campaignsList = document.querySelector('#campaignsList');
            const campaignsListInfo = {
                exists: !!campaignsList,
                innerHTML: campaignsList ? campaignsList.innerHTML.substring(0, 200) : null,
                children: campaignsList ? campaignsList.children.length : 0,
                tagName: campaignsList ? campaignsList.tagName : null,
                className: campaignsList ? campaignsList.className : null
            };
            
            // 檢查 DataTable
            const dataTableExists = document.querySelector('.data-table, table[data-table]');
            
            // 檢查表格行
            const tableRows = document.querySelectorAll('table tbody tr, .data-table tbody tr');
            
            // 檢查所有表格
            const allTables = Array.from(document.querySelectorAll('table')).map(table => ({
                id: table.id,
                className: table.className,
                rows: table.rows.length
            }));
            
            return {
                campaignElements: campaignElements.length,
                localStorageCampaigns: localStorageCampaigns ? JSON.parse(localStorageCampaigns).length : undefined,
                campaignsList: campaignsListInfo,
                dataTableExists: !!dataTableExists,
                tableRows: tableRows.length,
                allTables: allTables
            };
        });
        
        console.log('📋 頁面上的活動元素數量:', pageInfo.campaignElements);
        console.log('💾 本地存儲中的活動數量:', pageInfo.localStorageCampaigns);
        console.log('📦 campaignsList 容器:', pageInfo.campaignsList);
        console.log('📊 DataTable 是否存在:', pageInfo.dataTableExists);
        console.log('📋 表格行數:', pageInfo.tableRows);
        console.log('📊 所有表格元素:', pageInfo.allTables);
        
    } catch (error) {
        console.error('❌ 檢查過程中發生錯誤:', error);
    } finally {
        console.log('✅ 檢查完成');
        await browser.close();
    }
})();