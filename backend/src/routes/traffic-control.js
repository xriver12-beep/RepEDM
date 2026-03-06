const express = require('express');
const router = express.Router();
const { executeQuery, executeTransaction } = require('../config/database');
const { authenticateAdmin, requireAnyAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Middleware to ensure admin access
router.use(authenticateAdmin, requireAnyAdmin);

// --- Domain Throttling Routes ---

// Get all domain rules
router.get('/domains', asyncHandler(async (req, res) => {
    const query = 'SELECT * FROM DomainThrottling ORDER BY domain ASC';
    const result = await executeQuery(query);
    res.json({
        success: true,
        data: result.recordset
    });
}));

// Add or Update a domain rule
router.post('/domains', asyncHandler(async (req, res) => {
    const { domain, max_per_minute, max_per_hour } = req.body;

    if (!domain || !max_per_minute || !max_per_hour) {
        return res.status(400).json({
            success: false,
            message: '缺少必要欄位 (domain, max_per_minute, max_per_hour)'
        });
    }

    // Use MERGE to Insert or Update
    const query = `
        MERGE DomainThrottling AS target
        USING (SELECT @domain as domain) AS source
        ON (target.domain = source.domain)
        WHEN MATCHED THEN
            UPDATE SET max_per_minute = @max_per_minute, max_per_hour = @max_per_hour, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (domain, max_per_minute, max_per_hour, created_at, updated_at)
            VALUES (@domain, @max_per_minute, @max_per_hour, GETDATE(), GETDATE());
    `;

    await executeQuery(query, { domain, max_per_minute, max_per_hour });

    res.json({
        success: true,
        message: '網域規則已更新'
    });
}));

// Delete a domain rule
router.delete('/domains/:domain', asyncHandler(async (req, res) => {
    const { domain } = req.params;

    const query = 'DELETE FROM DomainThrottling WHERE domain = @domain';
    await executeQuery(query, { domain });

    res.json({
        success: true,
        message: '網域規則已刪除'
    });
}));

// --- IP Warmup Settings Routes ---

// Get warmup settings
router.get('/warmup', asyncHandler(async (req, res) => {
    const query = 'SELECT TOP 1 * FROM IPWarmupSettings WHERE is_active = 1';
    const result = await executeQuery(query);
    
    if (result.recordset.length > 0) {
        res.json({
            success: true,
            data: result.recordset[0]
        });
    } else {
        res.json({
            success: true,
            data: null
        });
    }
}));

// Update warmup settings
router.put('/warmup', asyncHandler(async (req, res) => {
    const { start_date, daily_limit, multiplier, is_active } = req.body;

    // Validation
    if (daily_limit === undefined || multiplier === undefined) {
        return res.status(400).json({
            success: false,
            message: '缺少必要欄位'
        });
    }

    // We assume there's only one active setting row we care about, or we create one if none exists.
    // For simplicity, let's just clear table and insert one, or update the existing one.
    // A better approach is to keep history but mark only one as active.
    // Let's try to update the active one, or insert if empty.

    const operations = [
        // Deactivate all others (if we want to keep history, but for now let's just assume one row policy or update all)
        // actually let's just have one row in this table for simplicity as per service logic
        { 
            query: `
                MERGE IPWarmupSettings AS target
                USING (SELECT 1 as id) AS source
                ON (target.is_active = 1)
                WHEN MATCHED THEN
                    UPDATE SET 
                        start_date = @start_date,
                        daily_limit = @daily_limit,
                        multiplier = @multiplier,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (start_date, daily_limit, multiplier, is_active, created_at, updated_at)
                    VALUES (@start_date, @daily_limit, @multiplier, 1, GETDATE(), GETDATE());
            `,
            params: { start_date, daily_limit, multiplier }
        }
    ];
    
    // If user wants to deactivate, we might need a separate flag or handle it.
    // But the service queries `WHERE is_active = 1`.
    // If we want to turn it off, we can set is_active = 0.
    
    if (is_active === false) {
         await executeQuery('UPDATE IPWarmupSettings SET is_active = 0');
         return res.json({ success: true, message: '預熱機制已停用' });
    }

    await executeTransaction(operations);

    res.json({
        success: true,
        message: '預熱設定已更新'
    });
}));

module.exports = router;
