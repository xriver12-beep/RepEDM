const { executeQuery, connectDB } = require('./src/config/database');

async function migrateUploadedBy() {
    try {
        await connectDB();
        console.log('正在修改 SSLCertificates.uploaded_by 欄位類型...');
        
        // Check if column exists and its type
        // This is a simplified migration, assuming we can just alter it.
        // If there is data that is not compatible, it might fail.
        // But currently uploaded_by is likely null or INT.
        // If it's INT, we can convert to NVARCHAR.
        
        const query = `
        ALTER TABLE SSLCertificates
        ALTER COLUMN uploaded_by NVARCHAR(50) NULL;
        `;

        await executeQuery(query);
        console.log('SSLCertificates.uploaded_by 欄位類型修改成功');

    } catch (error) {
        console.error('遷移失敗:', error);
    } finally {
        process.exit();
    }
}

migrateUploadedBy();
