const { executeQuery } = require('./src/config/database');
const { connectDB, closeDB } = require('./src/config/database');

async function checkSchema() {
    try {
        await connectDB();
        const checkColumnQuery = `
            SELECT Name FROM sys.columns 
            WHERE Name = N'assigned_workflow_id' 
            AND Object_ID = Object_ID(N'Users')
        `;
        const result = await executeQuery(checkColumnQuery);
        console.log('Result:', result.recordset);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeDB();
    }
}

checkSchema();
