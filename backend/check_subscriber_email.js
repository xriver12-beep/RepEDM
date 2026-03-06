const { executeQuery, connectDB } = require('./src/config/database');

(async () => {
    try {
        await connectDB();
        
        console.log('Checking for email: e38sam@gmail.com');
        const result = await executeQuery("SELECT id, email, status FROM Subscribers WHERE email = 'e38sam@gmail.com'");
        console.log('Result:', result.recordset);
        
        console.log('Checking for email: e38sam2010@gmail.com');
        const result2 = await executeQuery("SELECT id, email, status FROM Subscribers WHERE email = 'e38sam2010@gmail.com'");
        console.log('Result2:', result2.recordset);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
})();