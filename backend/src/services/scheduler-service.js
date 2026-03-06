const { executeQuery, executeTransaction, sql } = require('../config/database');
const emailService = require('./email-service');
const bounceService = require('./bounce-service');
const unsubscribeService = require('./unsubscribe-service');
const throttlingService = require('./throttling-service');
const notificationService = require('./notification-service');
const frequencyService = require('./frequency-service');
const recipientService = require('./recipient-service');
const { v4: uuidv4 } = require('uuid');

class SchedulerService {
    constructor() {
        this.emailService = emailService;
        this.bounceService = bounceService;
        this.unsubscribeService = unsubscribeService;
        this.throttlingService = throttlingService;
        this.notificationService = notificationService;
        this.isRunning = false;
        this.interval = null;
        this.queueInterval = null;
        this.lastBounceCheck = 0;
        this.lastUnsubscribeCheck = 0;
        this.lastApprovalCheck = 0;
        this.isProcessingQueue = false;
    }

    start() {
        if (this.isRunning) return;
        
        console.log('Starting campaign scheduler...');
        this.isRunning = true;
        
        // Check immediately on start
        this.processApprovedCampaigns();
        
        // Check bounces immediately on start (in background)
        this.bounceService.processBounces().catch(err => console.error('Initial bounce check failed:', err));
        this.lastBounceCheck = Date.now();

        // Check unsubscribes immediately on start (in background)
        this.unsubscribeService.processUnsubscribes().catch(err => console.error('Initial unsubscribe check failed:', err));
        this.lastUnsubscribeCheck = Date.now();

        // Then check every minute for new campaigns
        this.interval = setInterval(() => {
            this.processApprovedCampaigns();
            
            // Check for completed campaigns periodically (in case queue is busy with other campaigns)
            this.checkCampaignCompletion().catch(err => console.error('Campaign completion check failed:', err));

            const now = Date.now();
            
            // Check bounces every 10 minutes
            if (now - this.lastBounceCheck >= 10 * 60 * 1000) {
                this.lastBounceCheck = now;
                this.bounceService.processBounces().catch(err => console.error('Bounce check failed:', err));
            }

            // Check unsubscribes every 60 minutes
            if (now - this.lastUnsubscribeCheck >= 60 * 60 * 1000) {
                this.lastUnsubscribeCheck = now;
                this.unsubscribeService.processUnsubscribes().catch(err => console.error('Unsubscribe check failed:', err));
            }
            
            // Check overdue approvals every 60 minutes
            // We use modulo or a separate timer, here reusing the minute interval to check a counter or just check every hour
            // Let's use a timestamp check like above
            if (!this.lastApprovalCheck || now - this.lastApprovalCheck >= 60 * 60 * 1000) {
                this.lastApprovalCheck = now;
                this.processOverdueApprovals().catch(err => console.error('Overdue approval check failed:', err));
            }
        }, 60 * 1000);

        // Process Queue every 2 seconds (High frequency for smooth sending)
        this.queueInterval = setInterval(() => {
            this.processQueue();
        }, 2000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.queueInterval) {
            clearInterval(this.queueInterval);
            this.queueInterval = null;
        }
        this.isRunning = false;
        console.log('Campaign scheduler stopped.');
    }

    async processApprovedCampaigns() {
        try {
            // Find campaigns that are approved and ready to send
            const query = `
                SELECT * FROM Campaigns 
                WHERE status = 'approved' 
                AND (scheduled_at IS NULL OR scheduled_at <= GETDATE())
                ORDER BY 
                    CASE priority 
                        WHEN 'urgent' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'normal' THEN 3 
                        ELSE 4 
                    END,
                    created_at ASC
            `;
            
            const result = await executeQuery(query);
            const campaigns = result.recordset;

            if (campaigns.length === 0) return;

            console.log(`Found ${campaigns.length} campaigns to send.`);

            for (const campaign of campaigns) {
                await this.sendCampaign(campaign);
            }

        } catch (error) {
            console.error('Error in scheduler process:', error);
        }
    }

    /**
     * 檢查並處理逾期審核項目
     */
    async processOverdueApprovals() {
        try {
            // 1. 檢查系統設定是否啟用提醒
            const settingsQuery = `
                SELECT SettingKey, SettingValue 
                FROM SystemSettings 
                WHERE SettingKey IN ('workflow.reminderNotifications', 'workflow.approvalTimeout')
            `;
            const settingsResult = await executeQuery(settingsQuery);
            
            let reminderEnabled = true; // 預設啟用
            let timeoutHours = 48; // 預設 48 小時

            settingsResult.recordset.forEach(row => {
                if (row.SettingKey === 'workflow.reminderNotifications') {
                    reminderEnabled = row.SettingValue === 'true' || row.SettingValue === '1';
                } else if (row.SettingKey === 'workflow.approvalTimeout') {
                    timeoutHours = parseInt(row.SettingValue, 10) || 48;
                }
            });

            if (!reminderEnabled) {
                return;
            }

            console.log('Checking for overdue approval items...');

            // 2. 查找逾期項目
            // 條件 A: 從未提醒過，且距離更新時間超過 timeout
            // 條件 B: 曾經提醒過，且距離上次提醒超過 24 小時
            const overdueQuery = `
                SELECT id 
                FROM ApprovalItems 
                WHERE status = 'pending' 
                AND (
                    (last_reminded_at IS NULL AND DATEDIFF(hour, updated_at, GETDATE()) >= @timeout)
                    OR 
                    (last_reminded_at IS NOT NULL AND DATEDIFF(hour, last_reminded_at, GETDATE()) >= 24)
                )
            `;

            const overdueResult = await executeQuery(overdueQuery, { timeout: timeoutHours });
            
            if (overdueResult.recordset.length === 0) {
                return;
            }

            console.log(`Found ${overdueResult.recordset.length} overdue approval items.`);

            // 3. 發送提醒
            for (const item of overdueResult.recordset) {
                await this.notificationService.sendReminderNotification(item.id);
            }

        } catch (error) {
            console.error('Error processing overdue approvals:', error);
        }
    }

    async bulkInsertQueue(campaignId, recipients, priority = 1) {
        if (!recipients || recipients.length === 0) return;

        console.log(`Bulk inserting ${recipients.length} recipients into queue with priority ${priority}...`);
        const batchSize = 500;
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            const values = [];
            const params = { campaignId, priority };
            
            batch.forEach((r, idx) => {
                const pId = `subId_${i}_${idx}`;
                const pEmail = `email_${i}_${idx}`;
                
                params[pId] = r.id || 0;
                params[pEmail] = r.email;
                
                // Add domain grouping hint? No, just email.
                values.push(`(@campaignId, @${pId}, @${pEmail}, 'pending', @priority)`);
            });

            const query = `
                INSERT INTO EmailQueue (campaign_id, subscriber_id, email, status, priority)
                VALUES ${values.join(',')}
            `;

            try {
                await executeQuery(query, params);
            } catch (err) {
                console.error('Error bulk inserting into queue:', err);
            }
        }
    }

    async bulkRecordCapped(campaignId, recipients) {
        if (!recipients || recipients.length === 0) return;

        console.log(`Bulk recording ${recipients.length} capped recipients...`);
        const batchSize = 500;
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            const values = [];
            const params = { campaignId };
            
            batch.forEach((r, idx) => {
                const pId = `subId_${i}_${idx}`;
                const pEmail = `email_${i}_${idx}`;
                
                params[pId] = r.id || null;
                params[pEmail] = r.email;
                
                values.push(`(@campaignId, @${pId}, @${pEmail}, 'capped', GETDATE(), N'已達發送頻率上限')`);
            });

            const query = `
                INSERT INTO EmailSends (campaign_id, subscriber_id, email, status, sent_at, bounce_reason)
                VALUES ${values.join(',')}
            `;

            try {
                await executeQuery(query, params);
            } catch (err) {
                console.error('Error bulk recording capped recipients:', err);
            }
        }
    }

    async sendCampaign(campaign) {
        console.log(`Initializing campaign: ${campaign.name} (ID: ${campaign.id})`);
        
        // 1. Update status to 'preparing' to prevent race condition with checkCampaignCompletion
        // 'preparing' status indicates the campaign is being initialized (recipients calculated, queue populated)
        await executeQuery(`UPDATE Campaigns SET status = 'preparing', sent_at = GETDATE() WHERE id = @id`, { id: campaign.id });

        try {
            // 2. Get recipients
            const allRecipients = await this.getRecipients(campaign);
            
            // 2.1 Frequency Capping Check
            const subscriberIds = allRecipients.filter(r => r.id).map(r => r.id);
            const forceSend = campaign.force_send === true || campaign.force_send === 1; 
            const { allowed, capped } = await frequencyService.checkFrequency(subscriberIds, forceSend);
            
            const cappedSet = new Set(capped);
            const recipients = allRecipients.filter(r => !r.id || !cappedSet.has(r.id)); // Keep custom (no id) and allowed
            const cappedRecipients = allRecipients.filter(r => r.id && cappedSet.has(r.id));
            
            console.log(`Campaign ${campaign.id}: Total ${allRecipients.length}, Allowed ${recipients.length}, Capped ${cappedRecipients.length}`);

            // Record capped immediately
            await this.bulkRecordCapped(campaign.id, cappedRecipients);

            // Update recipient count
            await executeQuery(`UPDATE Campaigns SET recipient_count = @count WHERE id = @id`, {
                id: campaign.id,
                count: allRecipients.length // Total count includes capped
            });

            if (recipients.length === 0) {
                if (cappedRecipients.length > 0) {
                    console.warn(`Campaign ${campaign.id} has only capped recipients.`);
                    // Mark as sent (completed) because everyone was processed (capped)
                     await executeQuery(`UPDATE Campaigns SET status = 'sent', updated_at = GETDATE() WHERE id = @id`, { id: campaign.id });
                     return;
                }

                console.warn(`Campaign ${campaign.id} has no recipients.`);
                // Log to EmailLogs
                await this.emailService.logEmailActivity({
                    emailType: 'system_alert',
                    recipientEmail: 'system',
                    senderEmail: 'system',
                    senderName: 'System',
                    subject: `Campaign ${campaign.name} - No Recipients`,
                    status: 'failed',
                    messageId: `camp_${campaign.id}_no_recipients`,
                    errorMessage: 'No recipients found for this campaign.',
                    campaignId: campaign.id,
                    processingTimeMs: 0,
                    userId: campaign.created_by
                });

                // Mark as sent (completed)
                await executeQuery(`UPDATE Campaigns SET status = 'sent', updated_at = GETDATE() WHERE id = @id`, { id: campaign.id });
                
                // Send report even if 0 recipients (so creator knows it finished with 0)
                if (campaign.created_by) {
                     // Need to fetch creator email first? Or use NotificationService which fetches it.
                     // But we only have campaign object which might not have creator_email if not selected.
                     // The campaign object passed to sendCampaign comes from processApprovedCampaigns query: SELECT * FROM Campaigns
                     // It doesn't have joined user email.
                     // Let's leave it for now, 0 recipients is edge case.
                }
                return;
            }

            // 2.5 Populate EmailQueue
            // Map priority string to integer (Higher number = Higher priority in DESC sort)
            let priorityInt = 5; // Normal
            if (campaign.priority === 'urgent') priorityInt = 10;
            else if (campaign.priority === 'high') priorityInt = 8;
            else if (campaign.priority === 'low') priorityInt = 2;

            await this.bulkInsertQueue(campaign.id, recipients, priorityInt);
            console.log(`EmailQueue populated for campaign ${campaign.id} with priority ${priorityInt}. Logic handed over to Queue Processor.`);

            // 3. Update status to 'processing' to allow checkCampaignCompletion to monitor it
            await executeQuery(`UPDATE Campaigns SET status = 'processing' WHERE id = @id`, { id: campaign.id });

        } catch (error) {
            console.error(`Error initializing campaign ${campaign.id}:`, error);
            // Revert to approved or fail?
            // If failed to populate queue, maybe fail campaign.
            await executeQuery(`UPDATE Campaigns SET status = 'failed', updated_at = GETDATE() WHERE id = @id`, { id: campaign.id });
        }
    }

    async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        const CONCURRENCY = 5; // Parallel processing concurrency

        try {
            // 1. Fetch pending items (prioritize retries, then by priority/created)
            // Limit to 50 items to process in this cycle
            const query = `
                SELECT TOP 50 q.*, c.subject as campaign_subject, c.html_content, c.text_content, c.name as campaign_name
                FROM EmailQueue q
                JOIN Campaigns c ON q.campaign_id = c.id
                WHERE (q.status = 'pending' AND (q.next_retry_at IS NULL OR q.next_retry_at <= GETDATE()))
                OR (q.status = 'failed' AND q.retry_count < q.max_retries AND q.next_retry_at <= GETDATE())
                ORDER BY q.priority DESC, q.created_at ASC
            `;
            
            const result = await executeQuery(query);
            const items = result.recordset;

            if (items.length === 0) {
                await this.checkCampaignCompletion();
                this.isProcessingQueue = false;
                return;
            }

            // Determine Tracking Base URL & Asset Base URL (Pre-calculate for all items)
            let trackingBaseUrl;
            let publicAssetOrigin = null;
            
            if (process.env.TRACKING_URL) {
                trackingBaseUrl = process.env.TRACKING_URL;
                try {
                    const urlObj = new URL(trackingBaseUrl);
                    publicAssetOrigin = urlObj.origin;
                } catch (e) { console.error('Invalid TRACKING_URL format', e); }
                if (trackingBaseUrl.endsWith('/')) trackingBaseUrl = trackingBaseUrl.slice(0, -1);
            } else if (process.env.TRACKING_PORT) {
                const protocol = process.env.TRACKING_PROTOCOL || 'https';
                let domain = process.env.TRACKING_DOMAIN || process.env.BACKEND_URL || 'localhost';
                if (domain.startsWith('http')) {
                    try { domain = new URL(domain).hostname; } catch(e) {}
                }
                if (domain.includes(':')) domain = domain.split(':')[0];
                const port = process.env.TRACKING_PORT;
                publicAssetOrigin = `${protocol}://${domain}:${port}`;
                trackingBaseUrl = `${publicAssetOrigin}/api/tracking`;
            } else {
                trackingBaseUrl = (process.env.BACKEND_URL || 'http://localhost:3001') + '/api/tracking';
            }

            let internalOrigin = null;
            if (process.env.BACKEND_URL && publicAssetOrigin) {
                try {
                    let backendUrl = process.env.BACKEND_URL;
                    if (!backendUrl.startsWith('http')) backendUrl = 'https://' + backendUrl;
                    internalOrigin = new URL(backendUrl).origin;
                } catch (e) { console.error('Invalid BACKEND_URL format', e); }
            }

            // Helper function to process a single item
            const processItem = async (item) => {
                try {
                    // 2. Check Throttling
                    const check = await this.throttlingService.canSend(item.email);
                    
                    if (!check.allowed) {
                        const delaySeconds = check.reason === 'warmup_limit' ? 600 : 10;
                        await executeQuery(`
                            UPDATE EmailQueue 
                            SET next_retry_at = DATEADD(second, @delay, GETDATE())
                            WHERE id = @id
                        `, { id: item.id, delay: delaySeconds });
                        return; 
                    }

                    // 3. Send Email
                    await executeQuery(`UPDATE EmailQueue SET status = 'processing' WHERE id = @id`, { id: item.id });

                    // Generate Content
                    const trackingId = uuidv4();
                    let htmlContent = item.html_content || '';
                    const unsubscribeUrl = `${trackingBaseUrl}/unsubscribe/${trackingId}`;

                    if (internalOrigin && publicAssetOrigin && internalOrigin !== publicAssetOrigin) {
                        const escapedInternalOrigin = internalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escapedInternalOrigin, 'gi');
                        htmlContent = htmlContent.replace(regex, publicAssetOrigin);
                    }

                    if (process.env.TRACKING_PIXEL_ENABLED !== 'false') {
                        htmlContent = htmlContent.replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubscribeUrl);
                        htmlContent = htmlContent.replace(/\[\[\s*UNSUBSCRIBE_URL\s*\]\]/gi, unsubscribeUrl);

                        const pixelUrl = `${trackingBaseUrl}/open/${trackingId}`;
                        const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
                        
                        if (htmlContent.includes('</body>')) {
                            htmlContent = htmlContent.replace('</body>', `${pixelHtml}</body>`);
                        } else {
                            htmlContent += pixelHtml;
                        }

                        htmlContent = htmlContent.replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(http[^"']+)\1/gi, (match, quote, url) => {
                            const encodedUrl = encodeURIComponent(url);
                            const trackingUrl = `${trackingBaseUrl}/click/${trackingId}?url=${encodedUrl}`;
                            return match.replace(url, trackingUrl);
                        });
                    }

                    const sendResult = await this.emailService.sendEmail({
                        to: item.email,
                        subject: item.campaign_subject || item.subject,
                        html: htmlContent,
                        text: item.text_content,
                        emailType: 'campaign',
                        campaignId: item.campaign_id,
                        headers: {
                            'X-Campaign-ID': item.campaign_id.toString(),
                            'X-Winton-Campaign-ID': item.campaign_id.toString(),
                            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:noedm@winton.com.tw>`,
                            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                        }
                    });

                    if (sendResult.success) {
                        await this.recordEmailSend(item.campaign_id, item.subscriber_id, item.email, 'sent', null, trackingId);
                        await executeQuery(`
                            UPDATE EmailQueue 
                            SET status = 'sent', 
                                error_message = NULL,
                                updated_at = GETDATE() 
                            WHERE id = @id
                        `, { id: item.id });
                        await this.throttlingService.recordSent(item.email);
                    } else {
                        throw new Error(sendResult.message);
                    }

                } catch (err) {
                    console.error(`Failed to send to ${item.email}:`, err);
                    const errorMessage = err.message || 'Unknown error';
                    
                    const retryCount = item.retry_count + 1;
                    const maxRetries = item.max_retries;
                    let newStatus = 'failed';
                    let nextRetry = null;

                    if (retryCount < maxRetries) {
                        const delayMinutes = 5 * Math.pow(3, retryCount - 1); 
                        const nextRetryDate = new Date(Date.now() + delayMinutes * 60000);
                        nextRetry = nextRetryDate;
                    }

                    await this.recordEmailSend(item.campaign_id, item.subscriber_id, item.email, 'failed', errorMessage);
                    
                    await executeQuery(`
                        UPDATE EmailQueue 
                        SET status = @status, 
                            retry_count = @retryCount,
                            next_retry_at = @nextRetry,
                            error_message = @error, 
                            updated_at = GETDATE() 
                        WHERE id = @id
                    `, { 
                        id: item.id, 
                        status: newStatus,
                        retryCount: retryCount,
                        nextRetry: nextRetry,
                        error: errorMessage
                    });
                }
            };

            // Execute in parallel chunks
            for (let i = 0; i < items.length; i += CONCURRENCY) {
                const chunk = items.slice(i, i + CONCURRENCY);
                await Promise.all(chunk.map(item => processItem(item)));
            }

        } catch (error) {
            console.error('Error in processQueue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async checkCampaignCompletion() {
        // Find campaigns that are 'processing' but have no pending/processing queue items
        const query = `
            SELECT c.id, c.name, u.email as creator_email
            FROM Campaigns c
            LEFT JOIN Users u ON c.created_by = u.id
            WHERE c.status = 'processing'
            AND NOT EXISTS (
                SELECT 1 FROM EmailQueue q 
                WHERE q.campaign_id = c.id 
                AND (q.status = 'pending' OR q.status = 'processing' OR (q.status = 'failed' AND q.retry_count < q.max_retries))
            )
        `;

        const result = await executeQuery(query);
        const completedCampaigns = result.recordset;

        for (const c of completedCampaigns) {
            // Calculate final stats
            const statsQuery = `
                SELECT 
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
                FROM EmailQueue
                WHERE campaign_id = @id
            `;
            const stats = await executeQuery(statsQuery, { id: c.id });
            const { sent_count, failed_count } = stats.recordset[0];

            await executeQuery(`
                UPDATE Campaigns 
                SET status = 'sent', 
                    recipient_count = @sentCount,
                    updated_at = GETDATE()
                WHERE id = @id
            `, { id: c.id, sentCount: sent_count + failed_count });

            console.log(`Campaign ${c.id} finished processing. Sent: ${sent_count}, Failed: ${failed_count}`);

            // Send completion notification to creator
            if (c.creator_email) {
                console.log(`Sending completion report for campaign ${c.id} to ${c.creator_email}...`);
                await this.notificationService.sendCampaignReport(c.id, c.creator_email);
            }
        }
    }

    async getRecipients(campaign) {
        let audienceType = campaign.target_audience;
        let filter = campaign.target_filter;

        // Try to parse filter if it's a string
        if (typeof filter === 'string') {
            try {
                filter = JSON.parse(filter);
            } catch (e) {
                // console.error('Failed to parse target_filter JSON:', e);
                // If parsing fails, it might be that filter is empty or just a string
                if (!filter) filter = {};
            }
        }

        // Also try to parse target_audience if it looks like JSON (starts with {)
        let audienceObj = null;
        if (typeof audienceType === 'string' && audienceType.trim().startsWith('{')) {
            try {
                audienceObj = JSON.parse(audienceType);
                // If it's a JSON object, use its type
                if (audienceObj.type) audienceType = audienceObj.type;
                // And merge properties to filter if filter is empty?
                if (!filter || Object.keys(filter).length === 0) filter = audienceObj;
            } catch (e) {
                // Ignore
            }
        }

        if (!audienceType) return [];

        let recipients = [];
        console.log(`Getting recipients for type: ${audienceType}, filter:`, filter);

        if (audienceType === 'custom') {
            if (filter && filter.method === 'filters') {
                 // Handle custom filters
                 if (Array.isArray(filter.criteria)) {
                     let whereClause = "status IN ('active', 'subscribed')";
                     const params = {};
                     
                     filter.criteria.forEach((c, index) => {
                         const paramName = `val${index}`;
                         let condition = '';
                         let val = c.value;
                         
                         if (c.field === 'location') {
                             if (c.operator === 'equals') condition = `city = @${paramName}`;
                             else if (c.operator === 'contains') { condition = `city LIKE @${paramName}`; val = `%${val}%`; }
                         } else if (c.field === 'gender') {
                             if (c.operator === 'equals') condition = `gender = @${paramName}`;
                         } else if (c.field === 'age') {
                             const dateVal = new Date();
                             dateVal.setFullYear(dateVal.getFullYear() - parseInt(val));
                             const dateStr = dateVal.toISOString().split('T')[0];
                             
                             if (c.operator === 'greater') condition = `birth_date < @${paramName}`;
                             else if (c.operator === 'less') condition = `birth_date > @${paramName}`;
                             else if (c.operator === 'equals') {
                                 const nextYear = new Date(dateVal);
                                 nextYear.setFullYear(nextYear.getFullYear() + 1);
                                 const nextYearStr = nextYear.toISOString().split('T')[0];
                                 condition = `birth_date >= @${paramName} AND birth_date < '${nextYearStr}'`;
                             }
                             val = dateStr;
                         } else if (c.field === 'subscription_date') {
                             if (c.operator === 'greater') condition = `subscribed_at > @${paramName}`;
                             else if (c.operator === 'less') condition = `subscribed_at < @${paramName}`;
                             else if (c.operator === 'equals') condition = `CONVERT(date, subscribed_at) = @${paramName}`;
                         }
                         
                         if (condition) {
                             whereClause += ` AND (${condition})`;
                             params[paramName] = val;
                         }
                     });
                     
                     const query = `SELECT id, email FROM Subscribers WHERE ${whereClause}`;
                     const result = await executeQuery(query, params);
                     recipients = result.recordset;
                 }
            } else if (filter) {
                // Handle filter.emails which could be array or string
                let emailList = [];
                if (filter.emails) {
                    emailList = filter.emails;
                } else if (filter.method === 'emails' && filter.list) {
                     // Some formats might use 'list'
                     emailList = filter.list;
                }

                if (typeof emailList === 'string') {
                     emailList = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(e => e);
                }
                
                if (Array.isArray(emailList)) {
                    // Create initial list
                    let initialRecipients = emailList.map(email => ({ id: null, email }));
                    
                    // Filter out unsubscribed emails (Custom list should also respect unsubscribe status)
                    if (initialRecipients.length > 0) {
                        try {
                            const emailsToCheck = initialRecipients.map(r => r.email);
                            const jsonEmails = JSON.stringify(emailsToCheck.map(e => ({ email: e })));
                            
                            const checkQuery = `
                                SELECT email 
                                FROM Subscribers 
                                WHERE status = 'unsubscribed' 
                                AND email IN (
                                    SELECT email 
                                    FROM OPENJSON(@jsonEmails) 
                                    WITH (email nvarchar(255))
                                )
                            `;
                            
                            const result = await executeQuery(checkQuery, { jsonEmails });
                            const unsubscribedEmails = new Set(result.recordset.map(r => r.email.toLowerCase()));
                            
                            if (unsubscribedEmails.size > 0) {
                                console.log(`Filtered out ${unsubscribedEmails.size} unsubscribed emails from custom list.`);
                                recipients = initialRecipients.filter(r => !unsubscribedEmails.has(r.email.toLowerCase()));
                            } else {
                                recipients = initialRecipients;
                            }
                        } catch (err) {
                            console.warn('Error filtering unsubscribed emails (fallback to sending all):', err);
                            recipients = initialRecipients;
                        }
                    } else {
                        recipients = [];
                    }
                }
            }
        } else if (audienceType === 'active' || audienceType === 'all' || audienceType === 'all_subscribers') {
             const result = await executeQuery(`SELECT id, email FROM Subscribers WHERE status IN ('active', 'subscribed')`);
             recipients = result.recordset;
        } else if (audienceType === 'category' || audienceType === 'groups') {
             // Handle categories
             let categoryIds = [];
             
             if (Array.isArray(filter)) {
                 categoryIds = filter;
             } else if (filter) {
                 if (Array.isArray(filter.categories)) categoryIds = filter.categories;
                 else if (Array.isArray(filter.groups)) {
                     // Check for special groups
                     const groups = filter.groups;
                     if (groups.includes('all_subscribers') || groups.includes('active_users')) {
                         const result = await executeQuery(`SELECT id, email FROM Subscribers WHERE status IN ('active', 'subscribed')`);
                         return result.recordset;
                     }
                     categoryIds = groups;
                 }
             }
             
             // Filter out non-numeric IDs
             const validIds = categoryIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
             
             if (validIds.length > 0) {
                 const query = `
                    SELECT DISTINCT s.id, s.email 
                    FROM Subscribers s
                    JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
                    WHERE s.status IN ('active', 'subscribed') AND sc.category_id IN (${validIds.join(',')})
                 `;
                 const result = await executeQuery(query);
                 recipients = result.recordset;
             }
        } else {
             console.warn(`Unknown audience type: ${audienceType}`);
        }

        return recipients;
    }

    async recordEmailSend(campaignId, subscriberId, email, status, bounceReason = null, trackingId = null) {
        try {
            // Check if subscriber exists for ID if it's null (try to look up)
            let finalSubscriberId = subscriberId;
            if (!finalSubscriberId) {
                const subRes = await executeQuery('SELECT id FROM Subscribers WHERE email = @email', { email });
                if (subRes.recordset.length > 0) {
                    finalSubscriberId = subRes.recordset[0].id;
                } else {
                    // Subscriber doesn't exist in DB (custom email list).
                    // Create a guest subscriber to ensure the send is recorded in EmailSends.
                    try {
                        const insertRes = await executeQuery(`
                            INSERT INTO Subscribers (email, first_name, status, created_at)
                            OUTPUT INSERTED.id
                            VALUES (@email, 'Guest', 'active', GETDATE())
                        `, { email });
                        
                        if (insertRes.recordset && insertRes.recordset.length > 0) {
                            finalSubscriberId = insertRes.recordset[0].id;
                            console.log(`Created auto-subscriber for ${email} (ID: ${finalSubscriberId})`);
                        } else {
                            console.warn(`Failed to create auto-subscriber for ${email}, result empty.`);
                            return; 
                        }
                    } catch (err) {
                        console.error(`Error creating auto-subscriber for ${email}:`, err);
                        // Try to select again in case of race condition
                        const retryRes = await executeQuery('SELECT id FROM Subscribers WHERE email = @email', { email });
                        if (retryRes.recordset.length > 0) {
                            finalSubscriberId = retryRes.recordset[0].id;
                        } else {
                            return; // Give up
                        }
                    }
                }
            }

            if (!finalSubscriberId) return; // Should not happen if logic above works

            await executeQuery(`
                INSERT INTO EmailSends (
                    campaign_id, subscriber_id, email, status, sent_at, bounce_reason, TrackingID
                ) VALUES (
                    @campaignId, @subscriberId, @email, @status, GETDATE(), @bounceReason, @trackingId
                )
            `, {
                campaignId,
                subscriberId: finalSubscriberId,
                email,
                status,
                bounceReason,
                trackingId
            });
        } catch (e) {
            console.error('Error recording email send:', e);
        }
    }
}

module.exports = new SchedulerService();