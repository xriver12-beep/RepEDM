const { connectDB, executeQuery } = require('./src/config/database');

async function checkTable() {
    try {
        await connectDB();
        console.log("Checking table campaign_stats...");
        const result = await executeQuery(`
            SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'campaign_stats'
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkTable();
