const { sql, connectDB, executeQuery } = require('./backend/src/config/database');

async function fixCampaignCount() {
    try {
        await connectDB();
        console.log('Connected to database');

        const campaignId = 60;
        
        // 1. Calculate correct count (21)
        const countQuery = `
            SELECT COUNT(DISTINCT subscriber_id) as count 
            FROM SubscriberCategories 
            WHERE category_id = 20
        `;
        const countResult = await executeQuery(countQuery);
        const correctCount = countResult.recordset[0].count;
        console.log(`Calculated correct count for Category 20: ${correctCount}`);

        // 2. Update Campaign 60 regardless of current value, to ensure it matches
        const updateQuery = `
            UPDATE Campaigns 
            SET recipient_count = @count, updated_at = GETDATE()
            WHERE id = @id
        `;
        await executeQuery(updateQuery, { count: correctCount, id: campaignId });
        console.log(`Updated Campaign ${campaignId} recipient_count to ${correctCount}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (sql) await sql.close();
    }
}

fixCampaignCount();
