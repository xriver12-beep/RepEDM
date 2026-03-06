require('dotenv').config({ path: './backend/.env' });
const { connectDB, closeDB, executeQuery } = require('./backend/src/config/database');

async function checkCampaigns() {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Connected. Querying campaigns...');
        const result = await executeQuery('SELECT id, name, status FROM Campaigns');
        console.log('Campaigns:', result.recordset);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeDB();
    }
}

checkCampaigns();
