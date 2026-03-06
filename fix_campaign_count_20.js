require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const { sql, connectDB, executeQuery } = require('./backend/src/config/database');

async function fixCampaignCount() {
    try {
        await connectDB();
        console.log('Connected to database');

        const campaignId = 60;
        
        // Correct query to count only ACTIVE subscribers
        const countQuery = `
            SELECT COUNT(DISTINCT s.id) as count 
            FROM Subscribers s
            JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
            WHERE s.status IN ('active', 'subscribed') 
            AND sc.category_id = 20
        `;
        
        const countResult = await executeQuery(countQuery);
        const correctCount = countResult.recordset[0].count;
        
        console.log(`Calculated correct ACTIVE count for Category 20: ${correctCount}`);

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
