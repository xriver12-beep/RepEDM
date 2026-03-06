require('dotenv').config();
const { executeQuery, connectDB } = require('./src/config/database');

async function checkSettings() {
    try {
        await connectDB();
        console.log('Checking SystemSettings table for smtp keys...');
        const result = await executeQuery("SELECT * FROM SystemSettings WHERE SettingKey LIKE 'smtp.%'");
        console.log('SMTP Settings found:', result.recordset);
        
        console.log('Checking SystemSettings table for email keys...');
        const emailResult = await executeQuery("SELECT * FROM SystemSettings WHERE SettingKey LIKE 'email.%'");
        console.log('Email Settings found:', emailResult.recordset);
    } catch (error) {
        console.error('Error querying database:', error);
    }
}

checkSettings();
