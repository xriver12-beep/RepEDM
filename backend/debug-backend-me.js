const { sql, connectDB } = require('./src/config/database');

async function debugLoginAndMe() {
    try {
        await connectDB();
        
        console.log('--- Simulating /api/auth/me for User ID 11 (xriver11) ---');
        
        const userId = 11; 
        
        const query = `
          SELECT id, username, email, full_name, role, is_active, updated_at, created_at
          FROM Users 
          WHERE id = ${userId}
        `;
    
        const request = new sql.Request();
        const result2 = await request.query(query);
        
        console.log('DB Result for ID 11:', result2.recordset[0]);
        
        if (result2.recordset[0] && result2.recordset[0].full_name.includes('吳山姆')) {
            console.error('CRITICAL: User ID 11 returned "吳山姆" (Sam Wu)! Database ID mismatch or data corruption?');
        } else if (result2.recordset[0]) {
            console.log('User ID 11 correctly returns:', result2.recordset[0].full_name);
        } else {
            console.log('User ID 11 not found in DB');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (sql) await sql.close();
    }
}

debugLoginAndMe();
