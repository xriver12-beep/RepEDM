
const { connectDB, executeQuery, closeDB } = require('./src/config/database');

async function checkSchema() {
    try {
        await connectDB();
        
        const query = `
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLLATION_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Subscribers' AND COLUMN_NAME IN ('country', 'city');
        `;
        
        const result = await executeQuery(query);
        console.log('Schema Info:', result.recordset);

        // Also check a sample record
        const dataQuery = `
            SELECT TOP 5 id, email, country, city 
            FROM Subscribers 
            WHERE country IS NOT NULL AND country != ''
        `;
        const dataResult = await executeQuery(dataQuery);
        console.log('Sample Data:', dataResult.recordset);
        
        // Check specifically for '總公司'
        const specificQuery = `
            SELECT id, email, country, city 
            FROM Subscribers 
            WHERE country LIKE N'%總公司%'
        `;
        const specificResult = await executeQuery(specificQuery);
        console.log('Searching with N prefix count:', specificResult.recordset.length);

        const noNQuery = `
            SELECT id, email, country, city 
            FROM Subscribers 
            WHERE country LIKE '%總公司%'
        `;
        const noNResult = await executeQuery(noNQuery);
        console.log('Searching WITHOUT N prefix count:', noNResult.recordset.length);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await closeDB();
    }
}

checkSchema();
