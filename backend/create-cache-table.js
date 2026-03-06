const { executeQuery, connectDB } = require('./src/config/database');

async function createCacheTable() {
    try {
        await connectDB();
        console.log('Connected to database.');

        const query = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DashboardCache' AND xtype='U')
            BEGIN
                CREATE TABLE DashboardCache (
                    cache_key NVARCHAR(100) PRIMARY KEY,
                    cache_value NVARCHAR(MAX),
                    created_at DATETIME DEFAULT GETDATE(),
                    expires_at DATETIME
                );
                PRINT 'DashboardCache table created successfully.';
            END
            ELSE
            BEGIN
                PRINT 'DashboardCache table already exists.';
            END
        `;

        await executeQuery(query);
        console.log('Cache table check completed.');
        process.exit(0);
    } catch (err) {
        console.error('Error creating cache table:', err);
        process.exit(1);
    }
}

createCacheTable();
