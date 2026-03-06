const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function addReasonColumns() {
    try {
        await connectDB();
        console.log('Connected to database...');

        // Check if unsubscribe_reason column exists
        console.log('Checking for unsubscribe_reason column...');
        const checkUnsubReason = `
            SELECT COL_LENGTH('Subscribers', 'unsubscribe_reason') AS ColLength;
        `;
        const resultUnsub = await executeQuery(checkUnsubReason);
        
        if (resultUnsub.recordset[0].ColLength === null) {
            console.log('Adding unsubscribe_reason column...');
            const addUnsubReason = `
                ALTER TABLE Subscribers
                ADD unsubscribe_reason NVARCHAR(255);
            `;
            await executeQuery(addUnsubReason);
            console.log('unsubscribe_reason column added successfully.');
        } else {
            console.log('unsubscribe_reason column already exists.');
        }

        // Check if bounce_reason column exists
        console.log('Checking for bounce_reason column...');
        const checkBounceReason = `
            SELECT COL_LENGTH('Subscribers', 'bounce_reason') AS ColLength;
        `;
        const resultBounce = await executeQuery(checkBounceReason);

        if (resultBounce.recordset[0].ColLength === null) {
            console.log('Adding bounce_reason column...');
            const addBounceReason = `
                ALTER TABLE Subscribers
                ADD bounce_reason NVARCHAR(255);
            `;
            await executeQuery(addBounceReason);
            console.log('bounce_reason column added successfully.');
        } else {
            console.log('bounce_reason column already exists.');
        }

    } catch (error) {
        console.error('Error adding columns:', error);
    } finally {
        await closeDB();
        console.log('Database connection closed.');
    }
}

addReasonColumns();
