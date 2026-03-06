const { sql, executeQuery, connectDB } = require('./src/config/database');

async function run() {
    try {
        await connectDB();
        const res = await executeQuery("SELECT id, name FROM Categories WHERE id = 22");
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
