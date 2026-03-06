const { connectDB, executeQuery } = require('./src/config/database');

async function checkPending() {
    try {
        await connectDB();
        const result = await executeQuery(`
            SELECT id, name, status 
            FROM Campaigns 
            WHERE status LIKE '%pending%' OR status LIKE '%approval%'
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkPending();
