const { connectDB, executeQuery } = require('./src/config/database');

async function checkAll() {
    try {
        await connectDB();
        console.log("Connected");
        const result = await executeQuery(`
            SELECT id, status FROM Campaigns
        `);
        console.log("Count:", result.recordset.length);
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkAll();
