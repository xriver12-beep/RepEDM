const { connectDB, executeQuery } = require('./src/config/database');

async function getFreqSettings() {
    try {
        await connectDB();
        
        const result = await executeQuery(`
            SELECT SettingKey, SettingValue 
            FROM SystemSettings 
            WHERE SettingKey LIKE 'frequencyCapping%'
        `);

        if (result.recordset.length === 0) {
            console.log('No frequencyCapping settings found in database (using defaults).');
        } else {
            console.log('Found frequencyCapping settings:');
            result.recordset.forEach(row => {
                console.log(`${row.SettingKey}: ${row.SettingValue}`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

getFreqSettings();
