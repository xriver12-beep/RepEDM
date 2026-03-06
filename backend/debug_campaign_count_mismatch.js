const { executeQuery, connectDB } = require('./src/config/database');

async function run() {
    try {
        await connectDB();
        
        // Check Campaign 60
        const campaignQuery = `
            SELECT id, name, recipient_count, target_audience, target_filter 
            FROM Campaigns 
            WHERE id = 60
        `;
        const campaignResult = await executeQuery(campaignQuery);
        const campaign = campaignResult.recordset[0];
        console.log('Campaign 60:', JSON.stringify(campaign, null, 2));

        // Parse target_filter to get category ID
        let categoryIds = [];
        try {
            const filter = JSON.parse(campaign.target_filter || '[]');
            if (Array.isArray(filter)) {
                categoryIds = filter;
            } else if (typeof filter === 'number') {
                categoryIds = [filter];
            } else if (typeof filter === 'string') {
                 // It might be double encoded or just a string
                 if (filter.startsWith('[')) {
                     categoryIds = JSON.parse(filter);
                 } else {
                     categoryIds = [filter];
                 }
            }
        } catch (e) {
            console.log('Error parsing filter:', e);
        }
        
        console.log('Category IDs:', categoryIds);

        if (categoryIds.length > 0) {
            // Check actual subscriber count for these categories
            const safeIds = categoryIds.map(id => parseInt(id)).filter(id => !isNaN(id));
            if (safeIds.length > 0) {
                 const countSql = `
                    SELECT COUNT(DISTINCT subscriber_id) as count 
                    FROM SubscriberCategories 
                    WHERE category_id IN (${safeIds.join(',')})
                 `;
                 const countRes = await executeQuery(countSql);
                 console.log('Actual Subscriber Count (DISTINCT):', countRes.recordset[0].count);
                 
                 // Also check just count(*)
                 const countAllSql = `
                    SELECT COUNT(*) as count 
                    FROM SubscriberCategories 
                    WHERE category_id IN (${safeIds.join(',')})
                 `;
                 const countAllRes = await executeQuery(countAllSql);
                 console.log('Actual Subscriber Count (All):', countAllRes.recordset[0].count);
            }
            
            // Check Category Name
            const catSql = `SELECT id, name FROM Categories WHERE id IN (${safeIds.join(',')})`;
            const catRes = await executeQuery(catSql);
            console.log('Categories:', catRes.recordset);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

run();
