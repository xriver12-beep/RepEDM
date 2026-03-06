const { executeQuery, connectDB } = require('./src/config/database');

async function checkSubscribers() {
    try {
        await connectDB();
        console.log('Connected to database.');

        const result = await executeQuery('SELECT TOP 20 email FROM Subscribers');
        console.log('Subscribers emails:', result.recordset);

        // Also run the analytics query to see what it returns
        const analyticsResult = await executeQuery(`
            SELECT TOP 10
                SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                COUNT(*) as count
            FROM Subscribers
            WHERE CHARINDEX('@', email) > 0
            GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
            ORDER BY count DESC
        `);
        console.log('Analytics Query Result:', analyticsResult.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSubscribers();
