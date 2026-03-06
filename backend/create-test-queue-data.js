const { executeQuery, connectDB, sql } = require('./src/config/database');
require('dotenv').config();

async function createTestData() {
    try {
        await connectDB();
        console.log('Database connected.');
        
        console.log('Clearing old queue data...');
        await executeQuery("DELETE FROM EmailQueue"); 
        await executeQuery("DELETE FROM EmailSends");

        console.log('Checking Subscribers...');
        // Ensure we have enough subscribers
        const subCountResult = await executeQuery("SELECT COUNT(*) as count FROM Subscribers");
        const currentCount = subCountResult.recordset[0].count;
        const targetCount = 2000;
        
        if (currentCount < targetCount) {
            const needed = targetCount - currentCount;
            console.log(`Creating ${needed} dummy subscribers...`);
            
            const batchSize = 500;
            let remaining = needed;
            let batchCount = 0;
            
            while (remaining > 0) {
                const currentBatch = Math.min(remaining, batchSize);
                const values = [];
                
                for (let i = 0; i < currentBatch; i++) {
                    const uniqueNum = Date.now() + batchCount * batchSize + i;
                    values.push(`('user${uniqueNum}@example.com', 'Test', 'User', 'active', GETDATE())`);
                }
                
                const query = `
                    INSERT INTO Subscribers (email, first_name, last_name, status, created_at)
                    VALUES ${values.join(',')}
                `;
                await executeQuery(query);
                
                remaining -= currentBatch;
                batchCount++;
                console.log(`Inserted batch of ${currentBatch} subscribers.`);
            }
        }
        
        console.log('Fetching Subscriber IDs...');
        const subIdsResult = await executeQuery("SELECT TOP 3000 id FROM Subscribers ORDER BY id DESC");
        const subIds = subIdsResult.recordset.map(r => r.id);
        
        if (subIds.length === 0) {
            throw new Error("No subscribers found!");
        }
        console.log(`Loaded ${subIds.length} subscriber IDs.`);

        console.log('Creating test campaigns...');
        // Get admin ID
        const adminUserResult = await executeQuery("SELECT TOP 1 id FROM Users WHERE role = 'admin'");
        let userId = 1;
        if (adminUserResult.recordset.length > 0) {
            userId = adminUserResult.recordset[0].id;
        }

        // 1. Create Active Campaign
        const activeCampaignResult = await executeQuery(`
            INSERT INTO Campaigns (name, subject, sender_name, sender_email, html_content, status, recipient_count, scheduled_at, created_at, created_by)
            OUTPUT INSERTED.ID
            VALUES ('Test Campaign - Active 10k', 'Huge Sale!', 'Marketing Team', 'marketing@example.com', '<html><body>Sale!</body></html>', 'sending', 10000, GETDATE(), GETDATE(), ${userId})
        `);
        const activeCampaignId = activeCampaignResult.recordset[0].ID;

        // 2. Create Pending Campaign
        await executeQuery(`
            INSERT INTO Campaigns (name, subject, sender_name, sender_email, html_content, status, recipient_count, scheduled_at, created_at, created_by)
            VALUES ('Test Campaign - Pending', 'Weekly Newsletter', 'Editor', 'news@example.com', '<html><body>News</body></html>', 'approved', 5000, DATEADD(hour, 2, GETDATE()), GETDATE(), ${userId})
        `);

        console.log('Populating EmailQueue...');
        
        const statuses = [
            { status: 'sent', count: 500 },
            { status: 'failed', count: 100, error: 'Mailbox full' },
            { status: 'deferred', count: 200, error: 'Connection timed out' },
            { status: 'processing', count: 50 },
            { status: 'held', count: 20 },
            { status: 'pending', count: 1000 }
        ];

        let subIndex = 0;
        
        for (const s of statuses) {
            const batchSize = 100;
            let remaining = s.count;
            
            while (remaining > 0) {
                const currentBatch = Math.min(remaining, batchSize);
                const values = [];
                
                for (let i = 0; i < currentBatch; i++) {
                    const subId = subIds[subIndex % subIds.length];
                    subIndex++;
                    
                    values.push(`(${activeCampaignId}, ${subId}, 'user${subId}@example.com', '${s.status}', '${s.error || ''}', GETDATE())`);
                }
                
                const query = `
                    INSERT INTO EmailQueue (campaign_id, subscriber_id, email, status, error_message, created_at)
                    VALUES ${values.join(',')}
                `;
                await executeQuery(query);
                remaining -= currentBatch;
            }
            console.log(`Inserted ${s.count} ${s.status} records into Queue.`);
        }

        console.log('Populating EmailSends for Traffic Trend...');
        // Insert dummy sends for the last 24 hours
        // Batch insert to avoid too many calls
        const sendBatchSize = 100;
        let allSends = [];
        
        for (let i = 0; i < 24; i++) {
            const count = Math.floor(Math.random() * 50) + 10; // 10-60 sends per hour
            
            for (let j = 0; j < count; j++) {
                const subId = subIds[subIndex % subIds.length];
                subIndex++;
                
                // Use date string to be safe with SQL
                // DATEADD is standard SQL Server
                allSends.push(`(${activeCampaignId}, ${subId}, 'sent_user_${subId}@example.com', DATEADD(hour, -${i}, GETDATE()))`);
            }
        }

        // Split into batches
        for (let i = 0; i < allSends.length; i += sendBatchSize) {
            const batch = allSends.slice(i, i + sendBatchSize);
            const query = `
                INSERT INTO EmailSends (campaign_id, subscriber_id, email, sent_at)
                VALUES ${batch.join(',')}
            `;
            await executeQuery(query);
            console.log(`Inserted batch of ${batch.length} sends.`);
        }
        
        console.log('Test data created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating test data:', error);
        process.exit(1);
    }
}

createTestData();
