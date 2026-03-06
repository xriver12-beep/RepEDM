require('dotenv').config({ path: 'c:\\WintonEDM\\backend\\.env' });
const { executeQuery, connectDB } = require('./src/config/database');

async function restoreSubscriber() {
    try {
        await connectDB();
        const email = 'e38sam@gmail.com';
        
        console.log(`Restoring subscriber ${email}...`);
        
        const updateQuery = `
            UPDATE Subscribers 
            SET status = 'active', 
                unsubscribed_at = NULL, 
                unsubscribe_reason = NULL,
                updated_at = GETDATE()
            WHERE email = @email
        `;
        
        await executeQuery(updateQuery, { email });
        
        // Verify update
        const selectQuery = `SELECT id, email, status, unsubscribed_at FROM Subscribers WHERE email = @email`;
        const result = await executeQuery(selectQuery, { email });
        
        if (result.recordset.length > 0) {
            console.log('Subscriber restored successfully:');
            console.log(JSON.stringify(result.recordset[0], null, 2));
        } else {
            console.log('Subscriber not found.');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

restoreSubscriber();
