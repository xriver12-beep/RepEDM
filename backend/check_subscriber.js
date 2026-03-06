require('dotenv').config({ path: 'c:\\WintonEDM\\backend\\.env' });
const { executeQuery, connectDB } = require('./src/config/database');
const sql = require('mssql');

async function checkSubscriber() {
    try {
        await connectDB();
        const email = 'e38sam@gmail.com';
        const query = `
            SELECT * 
            FROM Subscribers 
            WHERE email = @email
        `;
        const result = await executeQuery(query, { email });
        
        if (result.recordset.length > 0) {
            console.log('Subscriber found:');
            console.log(JSON.stringify(result.recordset[0], null, 2));
            
            // Also check categories if needed, but basic info first
        } else {
            console.log(`Subscriber with email ${email} not found.`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSubscriber();
