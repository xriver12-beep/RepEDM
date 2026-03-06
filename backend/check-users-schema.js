require('dotenv').config();
const { executeQuery, connectDB } = require('./src/config/database');

async function check() {
    try {
        await connectDB();
        const result = await executeQuery("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
        console.log(result.recordset);
    } catch(e) {
        console.error(e);
    }
}
check();
