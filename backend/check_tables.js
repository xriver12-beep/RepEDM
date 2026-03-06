require('dotenv').config();
const { executeQuery, connectDB } = require('./src/config/database');

async function checkTables() {
    try {
        await connectDB();
        
        console.log('--- Settings Table (smtp%) ---');
        try {
            const settings = await executeQuery("SELECT * FROM Settings WHERE setting_key LIKE 'smtp%'");
            console.log(settings.recordset);
        } catch (e) {
            console.log('Settings table error:', e.message);
        }

        console.log('--- SystemSettings Table (smtp%) ---');
        try {
            const sysSettings = await executeQuery("SELECT * FROM SystemSettings WHERE SettingKey LIKE 'smtp%'");
            console.log(sysSettings.recordset);
        } catch (e) {
            console.log('SystemSettings table error:', e.message);
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkTables();