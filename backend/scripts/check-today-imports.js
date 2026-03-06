const { executeQuery, connectDB } = require('../src/config/database');

async function check() {
    try {
        await connectDB();
        console.log('Checking subscribers created on 2026-02-02...');
        const query = "SELECT COUNT(*) as count FROM Subscribers WHERE CAST(created_at AS DATE) = '2026-02-02' AND status != 'deleted'";
        const result = await executeQuery(query);
        console.log(`Found ${result.recordset[0].count} subscribers created on 2026-02-02.`);
        
        const catQuery = `
            SELECT COUNT(*) as count 
            FROM Subscribers s
            LEFT JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
            WHERE CAST(s.created_at AS DATE) = '2026-02-02' 
            AND s.status != 'deleted'
            AND sc.category_id IS NULL
        `;
        const catResult = await executeQuery(catQuery);
        console.log(`Of those, ${catResult.recordset[0].count} have no category assigned.`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

check();