
const { connectDB, executeQuery } = require('./src/config/database');

async function checkData() {
    try {
        await connectDB();
        
        const count = await executeQuery(`
            SELECT COUNT(*) as count 
            FROM EmailLogs 
            WHERE campaign_id = 119
        `);
        console.log('EmailLogs count for campaign 119:', count.recordset[0].count);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkData();
