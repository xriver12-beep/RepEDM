const { executeQuery, connectDB } = require('./src/config/database');

async function run() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // Find approval for campaign 60
        const approvalQuery = `
            SELECT 
                ai.id as ApprovalID,
                ai.campaign_id,
                c.target_audience,
                c.target_filter
            FROM ApprovalItems ai
            INNER JOIN Campaigns c ON ai.campaign_id = c.id
            WHERE ai.campaign_id = 60
        `;
        
        const result = await executeQuery(approvalQuery);
        if (result.recordset.length === 0) {
            console.log('No approval found for campaign 60');
            return;
        }

        const item = result.recordset[0];
        console.log('Found item:', JSON.stringify(item, null, 2));

        // Logic from approvals.js
        let recipient_count = 0;
        try {
            if ((item.target_audience || '').toLowerCase() === 'category') {
                let ids = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '[]') : item.target_filter;
                console.log('Parsed IDs (initial):', ids, typeof ids);

                if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
                    ids = [ids];
                }
                
                console.log('Normalized IDs:', ids);

                if (Array.isArray(ids) && ids.length > 0) {
                     const safeIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
                     console.log('Safe IDs:', safeIds);

                     if (safeIds.length > 0) {
                         const countSql = `
                            SELECT COUNT(DISTINCT subscriber_id) as count 
                            FROM SubscriberCategories 
                            WHERE category_id IN (${safeIds.join(',')})
                         `;
                         console.log('Running count SQL:', countSql);
                         const countRes = await executeQuery(countSql);
                         if (countRes.recordset.length > 0) {
                             recipient_count = countRes.recordset[0].count;
                         }
                     }
                }
            } else if ((item.target_audience || '').toLowerCase() === 'custom') {
                const filter = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '{}') : item.target_filter;
                if (filter && Array.isArray(filter.emails)) {
                    recipient_count = filter.emails.length;
                }
            }
        } catch (e) {
            console.error(`Error calculating recipient count for approval ${item.ApprovalID}:`, e);
        }

        console.log('Calculated recipient_count:', recipient_count);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

run();
