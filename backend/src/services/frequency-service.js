const { executeQuery } = require('../config/database');
const settingsService = require('./settings-service');

class FrequencyService {
    constructor() {
        this.settingsService = settingsService;
    }

    /**
     * Check frequency capping for a list of subscribers.
     * @param {Array<number>} subscriberIds - List of subscriber IDs to check.
     * @param {boolean} forceSend - Whether to ignore frequency limits.
     * @returns {Promise<Object>} - Result with allowed and capped subscribers.
     */
    async checkFrequency(subscriberIds, forceSend = false) {
        if (!subscriberIds || subscriberIds.length === 0) {
            return { allowed: [], capped: [] };
        }

        if (forceSend) {
            return { allowed: subscriberIds, capped: [] };
        }

        // 1. Get Global Settings
        const settings = await this.settingsService.getSettings();
        const fcSettings = settings.frequencyCapping || {};

        if (!fcSettings.enabled) {
            return { allowed: subscriberIds, capped: [] };
        }

        const maxEmails = parseInt(fcSettings.maxEmails) || 4;
        const periodDays = parseInt(fcSettings.periodDays) || 30;
        const excludeTestEmails = fcSettings.excludeTestEmails !== false; // Default true
        const excludedDomains = Array.isArray(fcSettings.excludedDomains) ? fcSettings.excludedDomains : [];
        const excludedEmails = Array.isArray(fcSettings.excludedEmails) ? fcSettings.excludedEmails : [];
        const excludedTags = Array.isArray(fcSettings.excludedTags) ? fcSettings.excludedTags : [];

        // 2. Identify Test Emails (if excluded)
        const exemptIds = new Set();
        
        if (excludeTestEmails && (excludedDomains.length > 0 || excludedTags.length > 0 || excludedEmails.length > 0)) {
            // Batch fetch subscriber details to check against exclusion rules
            const batchSize = 2000;
            for (let i = 0; i < subscriberIds.length; i += batchSize) {
                const batch = subscriberIds.slice(i, i + batchSize);
                if (batch.length === 0) continue;

                const query = `
                    SELECT 
                        s.id, 
                        s.email, 
                        s.tags,
                        (
                            SELECT c.name + ',' 
                            FROM SubscriberCategories sc 
                            JOIN Categories c ON sc.category_id = c.id 
                            WHERE sc.subscriber_id = s.id 
                            FOR XML PATH('')
                        ) AS category_names
                    FROM Subscribers s
                    WHERE s.id IN (${batch.join(',')})
                `;

                try {
                    const result = await executeQuery(query);
                    result.recordset.forEach(row => {
                        let isExempt = false;

                        // Check Domains
                        if (excludedDomains.length > 0 && row.email) {
                            const emailParts = row.email.split('@');
                            if (emailParts.length > 1) {
                                const emailDomain = emailParts[1].toLowerCase();
                                if (excludedDomains.some(d => emailDomain === d.toLowerCase() || emailDomain.endsWith('.' + d.toLowerCase()))) {
                                    isExempt = true;
                                }
                            }
                        }

                        // Check Emails
                        if (!isExempt && excludedEmails.length > 0 && row.email) {
                            if (excludedEmails.some(e => e.toLowerCase() === row.email.toLowerCase())) {
                                isExempt = true;
                            }
                        }

                        // Check Tags (Subscribers.tags OR SubscriberCategories)
                        if (!isExempt && excludedTags.length > 0) {
                            // 1. Check direct tags
                            if (row.tags) {
                                const subTags = row.tags.split(',').map(t => t.trim().toLowerCase());
                                if (subTags.some(t => excludedTags.some(et => et.toLowerCase() === t))) {
                                    isExempt = true;
                                }
                            }
                            
                            // 2. Check categories
                            if (!isExempt && row.category_names) {
                                const cats = row.category_names.split(',').map(c => c.trim().toLowerCase()).filter(c => c);
                                if (cats.some(c => excludedTags.some(et => et.toLowerCase() === c))) {
                                    isExempt = true;
                                }
                            }
                        }

                        if (isExempt) {
                            exemptIds.add(row.id);
                        }
                    });
                } catch (err) {
                    console.error('Error fetching subscriber details for frequency exemption:', err);
                }
            }
        }

        // 3. Query EmailSends History
        // We need to count how many emails each subscriber received in the last X days.
        // Optimization: Query only for non-exempt subscribers.
        const idsToCheck = subscriberIds.filter(id => !exemptIds.has(id));
        
        // Split into batches if too many subscribers
        const batchSize = 2000;
        const cappedSet = new Set();
        
        for (let i = 0; i < idsToCheck.length; i += batchSize) {
            const batch = idsToCheck.slice(i, i + batchSize);
            if (batch.length === 0) continue;

            const query = `
                SELECT subscriber_id, COUNT(*) as sent_count
                FROM EmailSends
                WHERE subscriber_id IN (${batch.join(',')})
                AND status IN ('sent', 'delivered')
                AND sent_at >= DATEADD(day, -@periodDays, GETDATE())
                GROUP BY subscriber_id
                HAVING COUNT(*) >= @maxEmails
            `;

            try {
                const result = await executeQuery(query, {
                    periodDays,
                    maxEmails
                });

                result.recordset.forEach(row => {
                    cappedSet.add(row.subscriber_id);
                });
            } catch (err) {
                console.error('Error checking frequency capping:', err);
                // Fail open or fail closed? 
                // Let's fail open (allow sending) to avoid blocking business, but log error.
            }
        }

        const allowed = [];
        const capped = [];

        subscriberIds.forEach(id => {
            if (exemptIds.has(id)) {
                allowed.push(id);
            } else if (cappedSet.has(id)) {
                capped.push(id);
            } else {
                allowed.push(id);
            }
        });

        return { allowed, capped };
    }
}

module.exports = new FrequencyService();
