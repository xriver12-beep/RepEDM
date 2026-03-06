const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function optimizeDatabase() {
    try {
        await connectDB();
        console.log('Connected to database. Checking EmailQueue table and indexes...');

        // 1. Ensure EmailQueue table exists (if not created by other means)
        const checkTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailQueue' AND xtype='U')
            CREATE TABLE EmailQueue (
                id INT IDENTITY(1,1) PRIMARY KEY,
                campaign_id INT NOT NULL,
                subscriber_id INT,
                email NVARCHAR(255) NOT NULL,
                status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed, deferred
                priority INT DEFAULT 5, -- 1-10
                retry_count INT DEFAULT 0,
                max_retries INT DEFAULT 3,
                next_retry_at DATETIME2,
                error_message NVARCHAR(MAX),
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE
            );
        `;
        await executeQuery(checkTableQuery);
        console.log('Verified EmailQueue table.');

        // 2. Add Indexes for Performance
        // Index for the main queue fetch query: WHERE status='pending' ORDER BY priority DESC, created_at ASC
        const index1 = `
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_EmailQueue_Process' AND object_id = OBJECT_ID('EmailQueue'))
            CREATE INDEX IX_EmailQueue_Process ON EmailQueue (status, priority DESC, created_at ASC) INCLUDE (next_retry_at, retry_count);
        `;
        await executeQuery(index1);
        console.log('Verified IX_EmailQueue_Process index.');

        // Index for campaign stats
        const index2 = `
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_EmailQueue_CampaignId' AND object_id = OBJECT_ID('EmailQueue'))
            CREATE INDEX IX_EmailQueue_CampaignId ON EmailQueue (campaign_id, status);
        `;
        await executeQuery(index2);
        console.log('Verified IX_EmailQueue_CampaignId index.');

        console.log('Database optimization completed successfully.');
    } catch (error) {
        console.error('Database optimization failed:', error);
    } finally {
        await closeDB();
    }
}

optimizeDatabase();