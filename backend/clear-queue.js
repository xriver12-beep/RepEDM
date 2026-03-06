const { executeQuery, connectDB } = require('./src/config/database');
require('dotenv').config();

async function clearQueueData() {
    try {
        await connectDB();
        console.log('Connected to database.');
        
        console.log('Deleting all records from EmailQueue...');
        await executeQuery("DELETE FROM EmailQueue");
        
        console.log('Deleting all records from EmailSends...');
        await executeQuery("DELETE FROM EmailSends");

        console.log('Deleting Test Campaigns...');
        await executeQuery("DELETE FROM Campaigns WHERE name LIKE 'Test Campaign%'");
        
        console.log('Successfully cleared queue, history, and test campaigns.');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing data:', error);
        process.exit(1);
    }
}

clearQueueData();
