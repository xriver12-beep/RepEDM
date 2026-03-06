const { connectDB, executeQuery } = require('./src/config/database');

async function checkCompanyData() {
    try {
        // 初始化數據庫連接
        await connectDB();
        console.log('數據庫連接成功');

        // 檢查訂閱者表的公司名稱數據
        const result = await executeQuery(`
            SELECT TOP 10 id, email, first_name, last_name, company 
            FROM subscribers 
            WHERE company IS NOT NULL AND company != ''
        `);

        console.log('\n有公司名稱的訂閱者數據:');
        if (result.recordset && result.recordset.length > 0) {
            console.table(result.recordset);
        } else {
            console.log('沒有找到有公司名稱的訂閱者');
        }

        // 檢查總數
        const totalResult = await executeQuery(`
            SELECT 
                COUNT(*) as total_subscribers,
                COUNT(CASE WHEN company IS NOT NULL AND company != '' THEN 1 END) as with_company,
                COUNT(CASE WHEN company IS NULL OR company = '' THEN 1 END) as without_company
            FROM subscribers
        `);

        console.log('\n公司名稱統計:');
        if (totalResult.recordset && totalResult.recordset.length > 0) {
            console.table(totalResult.recordset);
        }

        // 檢查一些樣本數據
        const sampleResult = await executeQuery(`
            SELECT TOP 5 id, email, first_name, last_name, company 
            FROM subscribers
        `);

        console.log('\n前5筆訂閱者數據樣本:');
        if (sampleResult.recordset && sampleResult.recordset.length > 0) {
            console.table(sampleResult.recordset);
        } else {
            console.log('沒有找到訂閱者數據');
        }

    } catch (error) {
        console.error('檢查數據時發生錯誤:', error);
    } finally {
        process.exit(0);
    }
}

checkCompanyData();