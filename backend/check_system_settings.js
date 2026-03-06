const { connectDB, executeQuery } = require('./src/config/database');

async function checkSystemSettings() {
    try {
        await connectDB();
        
        // Check if SystemSettings table exists
        const result = await executeQuery(`
            SELECT * 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'SystemSettings'
        `);

        if (result.recordset.length === 0) {
            console.log('SystemSettings table does not exist. Creating it...');
            await executeQuery(`
                CREATE TABLE SystemSettings (
                    SettingKey NVARCHAR(100) PRIMARY KEY,
                    SettingValue NVARCHAR(MAX),
                    Description NVARCHAR(255),
                    UpdatedBy INT,
                    UpdatedAt DATETIME DEFAULT GETDATE()
                )
            `);
            console.log('SystemSettings table created.');
        } else {
            console.log('SystemSettings table exists.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSystemSettings();
