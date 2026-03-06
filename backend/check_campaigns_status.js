const { connectDB, executeQuery } = require('./src/config/database');

async function checkCampaigns() {
    try {
        await connectDB();
        const result = await executeQuery(`
            SELECT TOP 5 id, name, subject, status, created_at
            FROM Campaigns 
            ORDER BY created_at DESC
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCampaigns();
