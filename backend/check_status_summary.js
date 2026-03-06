const { connectDB, executeQuery } = require('./src/config/database');

async function checkSummary() {
    try {
        await connectDB();
        const result = await executeQuery(`
            SELECT status, COUNT(*) as count
            FROM Campaigns 
            GROUP BY status
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSummary();
