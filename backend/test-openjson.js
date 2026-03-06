const { executeQuery, connectDB, closeDB } = require('./src/config/database');

async function testOpenJson() {
    try {
        await connectDB();
        const json = JSON.stringify([{ email: 'test@example.com' }]);
        const query = `
            SELECT email 
            FROM OPENJSON(@json) 
            WITH (email nvarchar(255))
        `;
        const result = await executeQuery(query, { json });
        console.log('OPENJSON Test Result:', result.recordset);
    } catch (err) {
        console.error('OPENJSON Test Failed:', err.message);
    } finally {
        await closeDB();
    }
}

testOpenJson();
