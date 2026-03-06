const { executeQuery } = require('../config/database');

class ThrottlingService {
    constructor() {
        this.cache = {
            domainRules: {},
            warmupSettings: null,
            dailyStats: {
                global: 0,
                domains: {}
            },
            lastCacheUpdate: 0
        };
        this.CACHE_TTL = 60000; // 1 minute cache
    }

    async refreshCache() {
        const now = Date.now();
        if (now - this.cache.lastCacheUpdate < this.CACHE_TTL) {
            return;
        }

        try {
            // 1. Get Domain Rules
            const domainResult = await executeQuery('SELECT * FROM DomainThrottling');
            this.cache.domainRules = {};
            domainResult.recordset.forEach(row => {
                this.cache.domainRules[row.domain.toLowerCase()] = {
                    max_per_minute: row.max_per_minute,
                    max_per_hour: row.max_per_hour
                };
            });

            // 2. Get Warmup Settings
            const warmupResult = await executeQuery('SELECT TOP 1 * FROM IPWarmupSettings WHERE is_active = 1');
            if (warmupResult.recordset.length > 0) {
                const settings = warmupResult.recordset[0];
                
                // Calculate current limit based on days elapsed
                const startDate = new Date(settings.start_date);
                const today = new Date();
                const daysElapsed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
                
                // Calculate limit: base * (multiplier ^ days)
                // Cap it reasonably (e.g., 100k) to prevent overflow
                let currentLimit = settings.daily_limit * Math.pow(settings.multiplier, Math.max(0, daysElapsed));
                currentLimit = Math.floor(currentLimit);

                this.cache.warmupSettings = {
                    ...settings,
                    current_limit: currentLimit
                };
            } else {
                this.cache.warmupSettings = null; // No active warmup
            }

            // 3. Get Today's Stats from DB
            const statsResult = await executeQuery(`
                SELECT metric_type, metric_key, count 
                FROM DailyStats 
                WHERE stat_date = CAST(GETDATE() AS DATE)
            `);
            
            this.cache.dailyStats.global = 0;
            this.cache.dailyStats.domains = {};

            statsResult.recordset.forEach(row => {
                if (row.metric_type === 'global_sent') {
                    this.cache.dailyStats.global = row.count;
                } else if (row.metric_type === 'domain_sent') {
                    this.cache.dailyStats.domains[row.metric_key.toLowerCase()] = row.count;
                }
            });

            // 4. Get System Settings (Cache TTL)
            const settingsResult = await executeQuery("SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'advanced.cacheTimeout'");
            if (settingsResult.recordset.length > 0) {
                const val = parseInt(settingsResult.recordset[0].SettingValue, 10);
                if (!isNaN(val) && val > 0) {
                    this.CACHE_TTL = val * 1000; // Convert seconds to ms
                }
            }

            this.cache.lastCacheUpdate = now;
            // console.log('Throttling cache updated:', this.cache);

        } catch (error) {
            console.error('Error refreshing throttling cache:', error);
        }
    }

    async canSend(recipientEmail) {
        await this.refreshCache();
        
        const domain = recipientEmail.split('@')[1].toLowerCase();
        
        // 1. Check IP Warmup Limit
        if (this.cache.warmupSettings) {
            if (this.cache.dailyStats.global >= this.cache.warmupSettings.current_limit) {
                // console.log(`Warmup limit reached. Limit: ${this.cache.warmupSettings.current_limit}, Sent: ${this.cache.dailyStats.global}`);
                return { allowed: false, reason: 'warmup_limit' };
            }
        }

        // 2. Check Domain Throttling
        // Default rules if not specified: 60/min, 3600/hour (1/sec)
        const rules = this.cache.domainRules[domain] || { max_per_minute: 60, max_per_hour: 3600 };
        
        // Check hourly limit (based on daily stats roughly / 24? No, daily stats is daily.)
        // Ideally we need hourly stats. For simplicity, we assume daily limit is large enough, 
        // or we just trust the per-minute rate limiter for smoothness.
        // Let's implement a simple memory-based rate limiter for the minute window.
        
        // Note: For strict distributed throttling, we need Redis. 
        // Here we use in-memory estimation assuming single instance.
        
        if (!this.minuteStats) this.minuteStats = {};
        const nowMinute = Math.floor(Date.now() / 60000);
        
        if (this.currentMinute !== nowMinute) {
            this.minuteStats = {};
            this.currentMinute = nowMinute;
        }
        
        const currentMinuteCount = this.minuteStats[domain] || 0;
        
        if (currentMinuteCount >= rules.max_per_minute) {
            return { allowed: false, reason: 'domain_rate_limit' };
        }

        return { allowed: true };
    }

    async recordSent(recipientEmail) {
        const domain = recipientEmail.split('@')[1].toLowerCase();
        
        // Update Memory Stats
        this.cache.dailyStats.global++;
        this.cache.dailyStats.domains[domain] = (this.cache.dailyStats.domains[domain] || 0) + 1;
        
        if (!this.minuteStats) this.minuteStats = {};
        this.minuteStats[domain] = (this.minuteStats[domain] || 0) + 1;

        // Async Update Database (Fire and forget, or batched)
        // To avoid DB hammer, we could batch these updates.
        // For now, let's do direct update but wrap in try-catch
        try {
            await executeQuery(`
                -- Update Global Stats
                MERGE DailyStats AS target
                USING (SELECT CAST(GETDATE() AS DATE) as stat_date, 'global_sent' as metric_type, 'all' as metric_key) AS source
                ON (target.stat_date = source.stat_date AND target.metric_type = source.metric_type AND target.metric_key = source.metric_key)
                WHEN MATCHED THEN
                    UPDATE SET count = count + 1, updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (stat_date, metric_type, metric_key, count)
                    VALUES (source.stat_date, source.metric_type, source.metric_key, 1);

                -- Update Domain Stats
                MERGE DailyStats AS target
                USING (SELECT CAST(GETDATE() AS DATE) as stat_date, 'domain_sent' as metric_type, @domain as metric_key) AS source
                ON (target.stat_date = source.stat_date AND target.metric_type = source.metric_type AND target.metric_key = source.metric_key)
                WHEN MATCHED THEN
                    UPDATE SET count = count + 1, updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (stat_date, metric_type, metric_key, count)
                    VALUES (source.stat_date, source.metric_type, source.metric_key, 1);
            `, { domain });
        } catch (error) {
            console.error('Error recording stats:', error);
        }
    }
}

module.exports = new ThrottlingService();
