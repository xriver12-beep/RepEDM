
const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function renameCategory() {
    try {
        await connectDB();
        console.log('Renaming category "文中標準範本" to "節日"...');

        const query = `
            UPDATE TemplateCategories 
            SET name = '節日', 
                description = '節日相關範本',
                updated_at = GETDATE()
            WHERE name = '文中標準範本'
        `;

        await executeQuery(query);
        console.log('Category renamed successfully.');
        
        // Verify
        const result = await executeQuery("SELECT * FROM TemplateCategories WHERE name = '節日'");
        console.log('Verification:', result.recordset);

        await closeDB();
    } catch (error) {
        console.error('Error:', error);
        await closeDB();
    }
}

renameCategory();
