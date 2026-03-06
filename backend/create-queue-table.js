const { executeQuery, connectDB } = require('./src/config/database');
require('dotenv').config();

async function createQueueTable() {
    try {
        await connectDB();
        console.log('Creating EmailQueue table...');
        
        const query = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailQueue' AND xtype='U')
            BEGIN
                CREATE TABLE EmailQueue (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    campaign_id INT NOT NULL,
                    subscriber_id INT NOT NULL,
                    email NVARCHAR(255) NOT NULL,
                    subject NVARCHAR(255),
                    status NVARCHAR(50) DEFAULT 'pending', -- pending, processing, sent, failed, deferred, held
                    priority INT DEFAULT 0,
                    retry_count INT DEFAULT 0,
                    max_retries INT DEFAULT 3,
                    next_retry_at DATETIME,
                    error_message NVARCHAR(MAX),
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME DEFAULT GETDATE()
                );
                
                CREATE INDEX IDX_EmailQueue_Status ON EmailQueue(status);
                CREATE INDEX IDX_EmailQueue_Campaign ON EmailQueue(campaign_id);
                CREATE INDEX IDX_EmailQueue_NextRetry ON EmailQueue(next_retry_at);
                
                PRINT 'EmailQueue table created successfully.';
            END
            ELSE
            BEGIN
                PRINT 'EmailQueue table already exists.';
            END
        `;

        await executeQuery(query);
        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

createQueueTable();
