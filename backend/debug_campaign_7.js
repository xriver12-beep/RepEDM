const { sql, executeQuery, connectDB } = require('./src/config/database');

async function checkCampaign7() {
    try {
        console.log('Connecting to database...');
        await connectDB();
        
        // Find "文中 EDM EDM7"
        const query = `
            SELECT id, name, target_audience, target_filter 
            FROM Campaigns 
            WHERE name LIKE N'%文中 EDM EDM7%'
        `;
        
        const result = await executeQuery(query);
        
        if (result.recordset.length === 0) {
            console.log('Campaign not found');
            return;
        }

        const campaign = result.recordset[0];
        console.log('Campaign Data:', campaign);
        
        // Try parsing target_filter
        try {
            const parsed = JSON.parse(campaign.target_filter);
            console.log('Parsed Filter:', parsed);
            
            // If it's category, check the count
            if (campaign.target_audience === 'category') {
                let ids = parsed;
                if (!Array.isArray(ids)) ids = [ids];
                // Filter invalid
                const validIds = ids.filter(id => !isNaN(parseInt(id)));
                console.log('Valid IDs:', validIds);
                
                if (validIds.length > 0) {
                    const countSql = `
                        SELECT COUNT(DISTINCT subscriber_id) as count 
                        FROM SubscriberCategories 
                        WHERE category_id IN (${validIds.join(',')})
                    `;
                    const countRes = await executeQuery(countSql);
                    console.log('Calculated Count:', countRes.recordset[0].count);
                }
            }
        } catch (e) {
            console.log('Parse Error:', e);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

checkCampaign7();
