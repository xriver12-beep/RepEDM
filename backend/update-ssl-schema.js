const { connectDB, executeQuery } = require('./src/config/database');

async function updateSchema() {
    try {
        await connectDB();
        console.log('Database connected');

        const query = `
        IF NOT EXISTS (
            SELECT * FROM sys.columns 
            WHERE object_id = OBJECT_ID('SSLCertificates') 
            AND name = 'passphrase'
        )
        BEGIN
            ALTER TABLE SSLCertificates
            ADD passphrase NVARCHAR(255) NULL;
            PRINT 'Added passphrase column to SSLCertificates table';
        END
        ELSE
        BEGIN
            PRINT 'passphrase column already exists';
        END
        `;

        await executeQuery(query);
        console.log('Schema update completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Schema update failed:', error);
        process.exit(1);
    }
}

updateSchema();
