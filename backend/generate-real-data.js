const { executeQuery, connectDB, sql } = require('./src/config/database');

async function generateData() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // 1. Clear existing analytics data and subscribers
        console.log('Clearing old data...');
        await executeQuery('DELETE FROM EmailClicks');
        await executeQuery('DELETE FROM EmailOpens');
        await executeQuery('DELETE FROM EmailSends');
        await executeQuery('DELETE FROM Campaigns');
        await executeQuery('DELETE FROM Subscribers');
        
        // 2. Create Subscribers (50 users)
        console.log('Creating subscribers...');
        const domains = ['gmail.com', 'yahoo.com.tw', 'hotmail.com', 'outlook.com', 'company.com'];
        const cities = ['Taipei', 'New York', 'London', 'Tokyo', 'Sydney']; 
        const subscribers = [];

        for (let i = 1; i <= 50; i++) {
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const city = cities[Math.floor(Math.random() * cities.length)];
            const email = `user${i}@${domain}`;
            
            // Insert Subscriber (using lowercase 'city')
            const result = await executeQuery(`
                INSERT INTO Subscribers (email, first_name, last_name, status, created_at, city)
                OUTPUT INSERTED.id
                VALUES (@email, @firstName, @lastName, 'active', DATEADD(day, -@daysAgo, GETDATE()), @city)
            `, {
                email: email,
                firstName: `User${i}`,
                lastName: 'Test',
                daysAgo: Math.floor(Math.random() * 30),
                city: city
            });
            subscribers.push({ id: result.recordset[0].id, email });
        }
        console.log(`Created ${subscribers.length} subscribers.`);

        // 3. Create Campaigns (5 campaigns)
        console.log('Creating campaigns...');
        const campaigns = [];
        // Get Admin ID
        const adminUser = await executeQuery('SELECT TOP 1 id FROM Users');
        const adminUserId = adminUser.recordset.length > 0 ? adminUser.recordset[0].id : 1;

        for (let i = 1; i <= 5; i++) {
            const sentDate = new Date();
            sentDate.setDate(sentDate.getDate() - (6 - i) * 5); // Spread over last 30 days

            const result = await executeQuery(`
                INSERT INTO Campaigns (name, subject, html_content, sender_name, sender_email, created_by, status, sent_at, created_at, recipient_count, opened_count, clicked_count)
                OUTPUT INSERTED.id
                VALUES (@name, @subject, '<html><body>Test Content</body></html>', 'Admin', 'admin@example.com', @createdBy, 'sent', @sentAt, @sentAt, 0, 0, 0)
            `, {
                name: `Campaign ${i} - Newsletter`,
                subject: `Weekly Update #${i}`,
                createdBy: adminUserId,
                sentAt: sentDate
            });
            campaigns.push({ id: result.recordset[0].id, sentAt: sentDate });
        }

        // 4. Generate Interactions
        console.log('Generating interactions...');
        for (const campaign of campaigns) {
            let sentCount = 0;
            let openCount = 0;
            let clickCount = 0;

            for (const sub of subscribers) {
                // 80% chance to send
                if (Math.random() > 0.2) {
                    // EmailSends uses snake_case: campaign_id, subscriber_id
                    await executeQuery(`
                        INSERT INTO EmailSends (campaign_id, subscriber_id, sent_at, status, email)
                        VALUES (@campaignId, @subscriberId, @sentAt, 'sent', @email)
                    `, {
                        campaignId: campaign.id,
                        subscriberId: sub.id,
                        sentAt: campaign.sentAt,
                        email: sub.email
                    });
                    sentCount++;

                    // 40% open rate
                    if (Math.random() < 0.4) {
                        const openTime = new Date(campaign.sentAt.getTime() + Math.random() * 86400000); // within 24h
                        const devices = ['Desktop', 'Mobile', 'Tablet'];
                        const device = devices[Math.floor(Math.random() * devices.length)];
                        
                        // EmailOpens uses PascalCase: CampaignID, SubscriberID
                        await executeQuery(`
                            INSERT INTO EmailOpens (CampaignID, SubscriberID, OpenedAt, IPAddress, UserAgent, Device)
                            VALUES (@campaignId, @subscriberId, @openTime, '192.168.1.1', 'Mozilla/5.0', @device)
                        `, {
                            campaignId: campaign.id,
                            subscriberId: sub.id,
                            openTime: openTime,
                            device: device
                        });
                        openCount++;

                        // 20% click rate (of opens)
                        if (Math.random() < 0.2) {
                            const clickTime = new Date(openTime.getTime() + Math.random() * 3600000); // within 1h of open
                            
                            // EmailClicks uses PascalCase: CampaignID, SubscriberID
                            await executeQuery(`
                                INSERT INTO EmailClicks (CampaignID, SubscriberID, ClickedAt, URL, IPAddress, UserAgent)
                                VALUES (@campaignId, @subscriberId, @clickTime, 'http://example.com', '192.168.1.1', 'Mozilla/5.0')
                            `, {
                                campaignId: campaign.id,
                                subscriberId: sub.id,
                                clickTime: clickTime
                            });
                            clickCount++;
                        }
                    }
                }
            }

            // Update Campaign stats
            await executeQuery(`
                UPDATE Campaigns 
                SET recipient_count = @sent, opened_count = @opened, clicked_count = @clicked
                WHERE id = @id
            `, {
                sent: sentCount,
                opened: openCount,
                clicked: clickCount,
                id: campaign.id
            });
        }

        console.log('Data generation complete.');

    } catch (err) {
        console.error('Error generating data:', err);
    } finally {
        process.exit();
    }
}

generateData();
