const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const { executeQuery } = require('../config/database');

class UnsubscribeService {
    // Recursive function to get all box names
    getAllBoxNames(boxes, prefix = '') {
        let names = [];
        for (const key in boxes) {
            const box = boxes[key];
            const name = prefix + key;
            names.push(name);
            if (box.children) {
                names = names.concat(this.getAllBoxNames(box.children, name + box.delimiter));
            }
        }
        return names;
    }

    async processUnsubscribes(config = {}) {
        // Use provided config or fallback to env vars
        const finalConfig = {
            user: config.user || process.env.UNSUBSCRIBE_USER,
            password: config.password || process.env.UNSUBSCRIBE_PASSWORD,
            host: config.host || process.env.UNSUBSCRIBE_HOST,
            port: config.port || process.env.UNSUBSCRIBE_PORT || '143',
            tls: config.tls !== undefined ? config.tls : (process.env.UNSUBSCRIBE_TLS === 'true')
        };

        if (!finalConfig.user || !finalConfig.password || !finalConfig.host) {
            throw new Error('Missing IMAP configuration');
        }

        console.log('Starting unsubscribe mailbox check...');
        
        const imapConfig = {
            imap: {
                user: finalConfig.user,
                password: finalConfig.password,
                host: finalConfig.host,
                port: parseInt(finalConfig.port),
                tls: finalConfig.tls === true || finalConfig.tls === 'true',
                autotls: 'always',
                authTimeout: 10000,
                tlsOptions: { rejectUnauthorized: false }
            }
        };

        let connection;
        let processedCount = 0;

        try {
            connection = await imap.connect(imapConfig);
            
            // Get all boxes to find Spam/Junk folder
            const boxes = await connection.getBoxes();
            
            // Define folders to check
            // Use the same comprehensive list as BounceService, plus EDM_unsubscribe
            const foldersToCheck = [
                'INBOX', 
                'Junk', 
                'Spam', 
                'Junk E-mail', 
                'Junk Email',
                '垃圾郵件', 
                '趨勢科技垃圾郵件匣', 
                'EDM_unsubscribe',
                'Unsubscribe'
            ];
            
            console.log('Available boxes (top level):', Object.keys(boxes));

            // Helper to find folder path (copied from BounceService)
            const findBox = (boxList, name) => {
                for (const key in boxList) {
                    // Direct match (case-insensitive)
                    if (key.toLowerCase() === name.toLowerCase()) {
                        return key;
                    }
                    // Partial match for non-standard names (e.g. Trend Micro)
                    if (key.toLowerCase().includes(name.toLowerCase()) && name.length > 4) {
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

            const uniqueFolders = [];
            
            for (const folderName of foldersToCheck) {
                // Special handling for INBOX
                if (folderName === 'INBOX') {
                    uniqueFolders.push('INBOX');
                    continue;
                }
                
                const foundPath = findBox(boxes, folderName);
                if (foundPath) {
                    uniqueFolders.push(foundPath);
                }
            }
            
            // Remove duplicates
            const finalFolders = [...new Set(uniqueFolders)];
            
            console.log(`Scanning folders: ${finalFolders.join(', ')}`);

            for (const folder of finalFolders) {
                processedCount += await this.processFolder(connection, folder);
            }

            connection.end();
            return { success: true, count: processedCount };

        } catch (error) {
            console.error('Error connecting to IMAP:', error);
            if (connection) {
                connection.end();
            }
            throw error;
        }
    }

    async processFolder(connection, folderName) {
        let count = 0;
        try {
            await connection.openBox(folderName);
            
            // Determine search criteria based on folder name
            // Changed back to 'UNSEEN' as per user request to avoid re-processing read emails.
            // This prevents scenarios where a subscriber is manually reactivated but then
            // immediately unsubscribed again because the old email was re-scanned.
            let searchCriteria = ['UNSEEN'];
            
            console.log(`Searching UNSEEN messages in ${folderName}`);
            
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: true
            };

            const messages = await connection.search(searchCriteria, fetchOptions);

            if (messages.length > 0) {
                console.log(`Found ${messages.length} new messages in ${folderName}.`);
                
                for (const item of messages) {
                    try {
                        const all = item.parts.find(part => part.which === '');
                        const id = item.attributes.uid;
                        const idHeader = "Imap-Id: " + id + "\r\n";
                        
                        if (all) {
                            // Imap-simple body fetching
                            const parsed = await simpleParser(idHeader + all.body);
                            const isUnsubscribe = await this.checkForUnsubscribe(parsed);
                            
                            if (isUnsubscribe) {
                                // Prefer Reply-To if available, otherwise From
                                let fromAddress = null;
                                
                                if (parsed.replyTo && parsed.replyTo.value && parsed.replyTo.value.length > 0) {
                                    fromAddress = parsed.replyTo.value[0].address;
                                } else if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
                                    fromAddress = parsed.from.value[0].address;
                                }

                                if (fromAddress) {
                                    const result = await this.unsubscribeSubscriber(fromAddress, 'User requested unsubscribe via email');
                                    if (result) count++;
                                } else {
                                    console.warn(`Could not determine sender address for unsubscribe email (UID: ${id})`);
                                }
                            } else {
                                console.log(`Email (UID: ${id}) did not match unsubscribe criteria.`);
                            }
                        }
                    } catch (err) {
                        console.error(`Error parsing message in ${folderName}:`, err);
                    }
                }
            } else {
                console.log(`No new messages in ${folderName}.`);
            }
        } catch (err) {
            console.error(`Error processing folder ${folderName}:`, err);
        }
        return count;
    }

    async checkForUnsubscribe(email) {
        const subject = email.subject || '';
        const text = email.text || '';
        const html = email.html || '';
        
        console.log(`Checking email for unsubscribe keywords. Subject: "${subject}"`);

        // Keywords to check
        const keywords = [
            'unsubscribe', 
            '退訂', 
            '不要再收到', 
            '不想收到', 
            '取消訂閱', 
            'remove me', 
            'stop sending',
            '停止寄送',
            'noedm',
            '不要再寄給我',
            '不再收到',
            '別再寄',
            '請勿回信',
            '移除',
            '不想再收到',
            '我不要再收到商品訊息郵件',
            '商品訊息郵件'
        ];

        // Check Subject
        for (const keyword of keywords) {
            if (subject.toLowerCase().includes(keyword.toLowerCase())) {
                console.log(`Unsubscribe keyword "${keyword}" found in subject: ${subject}`);
                return true;
            }
        }

        // Check Body (Text) - limit length to avoid false positives in long threads?
        // Usually unsubscribe requests are short.
        const lowerText = text.toLowerCase();
        for (const keyword of keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                console.log(`Unsubscribe keyword "${keyword}" found in body.`);
                return true;
            }
        }
        
        console.log('No unsubscribe keywords found.');
        return false;
    }

    async unsubscribeSubscriber(email, reason) {
        try {
            // Check if subscriber exists
            const checkQuery = `SELECT id, status FROM Subscribers WHERE email = @email`;
            const result = await executeQuery(checkQuery, { email });

            if (result.recordset.length > 0) {
                const subscriber = result.recordset[0];
                
                // If already unsubscribed, don't count it as a new unsubscription
                if (subscriber.status === 'unsubscribed') {
                    console.log(`Subscriber ${email} is already unsubscribed. Skipping update.`);
                    return false;
                }

                const subscriberId = subscriber.id;
                
                // Update status to unsubscribed
                
                const updateQuery = `
                    UPDATE Subscribers 
                    SET status = 'unsubscribed', 
                        unsubscribe_reason = @reason,
                        unsubscribed_at = GETDATE(),
                        updated_at = GETDATE()
                    WHERE id = @id
                `;
                
                await executeQuery(updateQuery, { id: subscriberId, reason: reason || 'User requested unsubscribe via email' });

                // Also record in EmailUnsubscribes table for consistency with reports
                try {
                    const insertLogQuery = `
                        INSERT INTO EmailUnsubscribes (SubscriberID, UnsubscribedAt, IPAddress)
                        VALUES (@id, GETDATE(), 'System Check')
                    `;
                    await executeQuery(insertLogQuery, { id: subscriberId });
                } catch (logError) {
                    console.error('Failed to log to EmailUnsubscribes:', logError);
                    // Don't fail the operation just because logging failed
                }

                console.log(`Subscriber ${email} marked as unsubscribed.`);
                return true;

            } else {
                console.log(`Subscriber ${email} not found in database. Skipping.`);
                return false;
            }
        } catch (error) {
            console.error(`Error unsubscribing ${email}:`, error);
            return false;
        }
    }
}

module.exports = new UnsubscribeService();
