
const { executeQuery, connectDB, closeDB } = require('./src/config/database');

async function testCategories() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // 1. Check Categories
        const categories = await executeQuery('SELECT TOP 10 * FROM Categories');
        console.log('Categories (Top 10):');
        console.table(categories.recordset);

        // 2. Check SubscriberCategories
        const subCategories = await executeQuery('SELECT TOP 10 * FROM SubscriberCategories');
        console.log('SubscriberCategories (Top 10):');
        console.table(subCategories.recordset);

        // 3. Test Query with category_ids
        // Find a category ID that is used in SubscriberCategories
        if (subCategories.recordset.length > 0) {
            const testCategoryId = subCategories.recordset[0].category_id;
            console.log(`Testing query with category_id: ${testCategoryId}`);

            const query = `
                SELECT count(*) as count 
                FROM Subscribers s 
                WHERE EXISTS (
                    SELECT 1 
                    FROM SubscriberCategories sc 
                    WHERE sc.subscriber_id = s.id 
                    AND sc.category_id IN (${testCategoryId})
                )
            `;
            const result = await executeQuery(query);
            console.log(`Subscribers with category ${testCategoryId}:`, result.recordset[0].count);
        } else {
            console.log('No SubscriberCategories found to test.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeDB();
    }
}

testCategories();
