const { executeQuery, connectDB } = require('./src/config/database');

async function run() {
    try {
        await connectDB();
        
        const query = `
            SELECT id, name, recipient_count, target_audience, target_filter 
            FROM Campaigns 
            WHERE id = 60
        `;
        
        const result = await executeQuery(query);
        console.log('Campaign 60 data:', JSON.stringify(result.recordset[0], null, 2));
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

run();
