const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const { executeQuery } = require('../config/database');
require('dotenv').config();

class BounceService {
    constructor() {
        this.config = {
            imap: {
                user: process.env.IMAP_USER,
                password: process.env.IMAP_PASSWORD,
                host: process.env.IMAP_HOST,
                port: parseInt(process.env.IMAP_PORT || '143'),
                tls: process.env.IMAP_TLS === 'true',
                autotls: 'always',
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 10000
            }
        };
    }

    async processBounces() {
        const stats = {
            checkedFolders: 0,
            foundMessages: 0,
            processedBounces: 0,
            invalidatedSubscribers: 0,
            ignoredSubscribers: 0,
            errors: []
        };

        if (!this.config.imap.user || !this.config.imap.password || !this.config.imap.host) {
            console.log('Bounce processing skipped: Missing IMAP configuration.');
            stats.errors.push('Missing IMAP configuration');
            return stats;
        }

        console.log('Starting bounce mailbox check...');
        let connection;

        try {
            connection = await imap.connect(this.config);
            
            // Define folders to check: INBOX and Junk/Spam
            // Common names for spam folders: 'Junk', 'Spam', 'Junk E-mail', 'Junk Email'
            // Chinese names: '垃圾郵件', '趨勢科技垃圾郵件匣'
            // DSN folder: '傳遞狀態通知'
            const foldersToCheck = [
                'INBOX', 
                'Junk', 
                'Spam', 
                'Junk E-mail', 
                '垃圾郵件', 
                '趨勢科技垃圾郵件匣', 
                '傳遞狀態通知'
            ];
            
            // Get list of all folders to match correct spam folder name
            const boxes = await connection.getBoxes();
            
            for (const folderName of foldersToCheck) {
                // Recursively search for the folder (simple check for top-level)
                // Note: imap-simple getBoxes returns an object tree
                
                let targetBox = null;
                
                // Helper to find folder path
                const findBox = (boxList, name) => {
                    for (const key in boxList) {
                        if (key.toLowerCase() === name.toLowerCase()) {
                            return key;
                        }
                        // Check children if any
                        if (boxList[key].children) {
                            const childKey = findBox(boxList[key].children, name);
                            if (childKey) return `${key}${boxList[key].delimiter}${childKey}`;
                        }
                    }
                    return null;
                };

                // Check if folder exists
                if (folderName === 'INBOX' || findBox(boxes, folderName)) {
                    const actualFolderName = folderName === 'INBOX' ? 'INBOX' : findBox(boxes, folderName);
                    
                    try {
                        console.log(`Checking folder: ${actualFolderName}...`);
                        await connection.openBox(actualFolderName);
                        stats.checkedFolders++;

                        // Fetch UNSEEN messages
                        const searchCriteria = ['UNSEEN'];
                        const fetchOptions = {
                            bodies: ['HEADER', 'TEXT', ''],
                            markSeen: true
                        };

                        const messages = await connection.search(searchCriteria, fetchOptions);

                        if (messages.length > 0) {
                            console.log(`Found ${messages.length} new bounce messages in ${actualFolderName}.`);
                            stats.foundMessages += messages.length;
                            
                            for (const item of messages) {
                                try {
                                    const all = item.parts.find(part => part.which === '');
                                    const id = item.attributes.uid;
                                    const idHeader = "Imap-Id: " + id + "\r\n";
                                    
                                    if (all) {
                                        const parsed = await simpleParser(idHeader + all.body);
                                        const result = await this.handleBounceMessage(parsed);
                                        if (result.status === 'invalidated') stats.invalidatedSubscribers++;
                                        if (result.status === 'ignored') stats.ignoredSubscribers++;
                                        if (result.status === 'processed') stats.processedBounces++;
                                    }
                                } catch (err) {
                                    console.error(`Error parsing bounce message in ${actualFolderName}:`, err);
                                    stats.errors.push(`Error parsing message in ${actualFolderName}: ${err.message}`);
                                }
                            }
                        } else {
                            console.log(`No new bounce messages in ${actualFolderName}.`);
                        }
                    } catch (boxError) {
                        console.warn(`Could not open or scan folder ${actualFolderName}:`, boxError.message);
                        stats.errors.push(`Error accessing folder ${actualFolderName}: ${boxError.message}`);
                    }
                }
            }

            connection.end();
            console.log('Bounce processing completed.', stats);
            return stats;

        } catch (error) {
            console.error('Error connecting to IMAP:', error);
            stats.errors.push(`IMAP connection error: ${error.message}`);
            if (connection) {
                connection.end();
            }
            return stats;
        }
    }

    async handleBounceMessage(email) {
        // Strategy 0: Check for X-Campaign-ID or X-Winton-Campaign-ID header
        // This is the most accurate method as we inject it during sending
        let campaignId = null;
        if (email.headers) {
            campaignId = email.headers.get('x-winton-campaign-id') || email.headers.get('x-campaign-id');
        }

        // Strategy 1: Check for X-Failed-Recipients header
        let failedEmail = email.headers.get('x-failed-recipients');

        // Strategy 2: Check for Final-Recipient in delivery-status part (requires deep parsing of multipart/report)
        // mailparser usually puts text content in email.text or email.html
        // We can regex the text body for common patterns if headers are missing.
        
        if (!failedEmail) {
            // Attempt to extract from text body using Regex
            const body = email.text || '';

            // 1. Standard DSN: "Final-Recipient: rfc822; <email>"
            let match = body.match(/Final-Recipient:\s*rfc822;\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
            
            // 2. Chinese/Exchange format: "傳送至下列收件者或群組失敗:\s*<email>"
            if (!match) {
                match = body.match(/傳送至下列收件者或群組失敗:[\s\r\n]*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
            }

            // 3. Generic "Delivery to the following recipient failed"
            if (!match) {
                // Modified to be more flexible (allow missing "permanently" and handle spaces)
                match = body.match(/Delivery to the following recipient failed(?: permanently)?\s*:[\s\r\n]*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
            }

            // 4. "Undelivered Mail Returned to Sender" with "failed:" pattern
            if (!match) {
                 match = body.match(/The following addresses had permanent fatal errors\s*-----[\s\r\n]*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
            }

            // 5. 163.com / Netease style "收件人: <email>"
            if (!match) {
                match = body.match(/(?:收件人|收信人)[:：]\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
            }

            if (match && match[1]) {
                failedEmail = match[1];
            }
        }

        // Strategy 3: Look for email addresses in the body near "550" or "undeliverable"
        if (!failedEmail) {
            const body = email.text || '';
            if (body.includes('550') || body.toLowerCase().includes('undeliverable') || body.toLowerCase().includes('failed')) {
                // Simple extraction of the first email that is NOT the sender
                // This is risky, so maybe just log it for manual review if we can't be sure.
                // For now, let's stick to Strategy 1 & 2 for safety.
            }
        }

        if (failedEmail) {
            failedEmail = failedEmail.trim();
            console.log(`Detected failed recipient: ${failedEmail}`);
            
            // Try to extract a more specific reason
            let reason = 'Bounce detected';
            const body = email.text || '';
            
            // Common SMTP error patterns
            const errorPatterns = [
                /Remote Server returned '(.+)'/i,
                /(550\s+.*)/i,
                /(554\s+.*)/i,
                /(User unknown)/i,
                /(No such user here)/i,
                /(Quota exceeded)/i,
                /(Domain not found)/i,
                /(Host unknown)/i,
                /(Host not found)/i,
                /(DMARC policy)/i,
                /(authentication checks)/i,
                /(User reject)/i,
                /(Connection timed out)/i,
                /(Connection refused)/i,
                /(Network is unreachable)/i,
                /(Name service error)/i,
                /(Message expired)/i,
                /(4\.4\.[0-9])/i 
            ];

            for (const pattern of errorPatterns) {
                const match = body.match(pattern);
                if (match && match[1]) {
                    // Truncate if too long (max 255 chars for database column usually)
                    reason = match[1].substring(0, 200).trim();
                    break;
                }
            }

            return await this.invalidateSubscriber(failedEmail, reason, campaignId);
        } else {
            console.log('Could not identify failed recipient in bounce message.');
            return { status: 'no_recipient_found' };
        }
    }

    async invalidateSubscriber(email, reason, specificCampaignId = null) {
        try {
            // Check if subscriber exists first
            const checkQuery = `SELECT id FROM Subscribers WHERE email = @email`;
            const result = await executeQuery(checkQuery, { email });

            if (result.recordset.length > 0) {
                const subscriberId = result.recordset[0].id;
                
                // Update status to invalid and record reason
                const updateQuery = `
                    UPDATE Subscribers 
                    SET status = 'invalid', 
                        bounce_reason = @reason, 
                        updated_at = GETDATE()
                    WHERE id = @id
                `;
                
                await executeQuery(updateQuery, { id: subscriberId, reason: reason });

                console.log(`Subscriber ${email} marked as invalid. Reason: ${reason}`);

                // Update EmailSends and Campaign stats
                try {
                    let emailLogQuery = '';
                    const logParams = { email };

                    if (specificCampaignId) {
                        // If we found a campaign ID in the headers, use it!
                        emailLogQuery = `
                            SELECT TOP 1 id, campaign_id 
                            FROM EmailSends 
                            WHERE subscriber_id = @subscriberId AND campaign_id = @campaignId AND status = 'sent'
                        `;
                        logParams.campaignId = specificCampaignId;
                        console.log(`Using specific campaign ID from header: ${specificCampaignId}`);
                    } else {
                        // Fallback: Find the most recent 'sent' email log for this subscriber
                        emailLogQuery = `
                            SELECT TOP 1 id, campaign_id 
                            FROM EmailSends 
                            WHERE subscriber_id = @subscriberId AND status = 'sent'
                            ORDER BY sent_at DESC
                        `;
                    }
                    
                    // Add subscriberId to params
                    logParams.subscriberId = subscriberId;
                    
                    const emailLogResult = await executeQuery(emailLogQuery, logParams);

                    if (emailLogResult.recordset.length > 0) {
                        const emailLogId = emailLogResult.recordset[0].id;
                        const campaignId = emailLogResult.recordset[0].campaign_id;

                        // Update EmailSends status to 'failed'
                        const updateEmailLogQuery = `
                            UPDATE EmailSends
                            SET status = 'failed',
                            bounced_at = GETDATE(),
                            bounce_reason = @reason
                            WHERE id = @id
                        `;
                        await executeQuery(updateEmailLogQuery, { id: emailLogId, reason: reason });
                        console.log(`Updated EmailSends log ${emailLogId} to failed.`);

                        // Update Campaign bounce count
                        if (campaignId) {
                            const updateCampaignQuery = `
                                UPDATE Campaigns
                                SET bounced_count = ISNULL(bounced_count, 0) + 1
                                WHERE id = @id
                            `;
                            await executeQuery(updateCampaignQuery, { id: campaignId });
                            console.log(`Updated Campaign ${campaignId} bounce count.`);
                        }
                    } else {
                        console.log(`No matching sent email log found for ${email} (CampaignID: ${specificCampaignId || 'auto'}). Stats not updated.`);
                    }
                } catch (logError) {
                    console.error(`Error updating email logs for ${email}:`, logError);
                }
                return { status: 'invalidated', email };
            } else {
                console.log(`Subscriber ${email} not found in database.`);
                return { status: 'ignored', email };
            }
        } catch (error) {
            console.error(`Error invalidating subscriber ${email}:`, error);
            return { status: 'error', email, error: error.message };
        }
    }
}

module.exports = new BounceService();
