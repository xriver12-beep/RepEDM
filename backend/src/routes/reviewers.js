const express = require('express');
const router = express.Router();
const { executeQuery, executeTransaction } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authenticateUserOrAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all reviewers (users with role admin, manager, or approver)
router.get('/', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
    const query = `
        SELECT id, username, email, full_name, role, department
        FROM Users
        WHERE role IN ('admin', 'manager', 'Approver')
        ORDER BY full_name ASC
    `;
    const result = await executeQuery(query);
    
    res.json({
        success: true,
        data: result.recordset
    });
}));

// Search users to add as reviewer
router.get('/search', authenticateUserOrAdmin, asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.json({ success: true, data: [] });
    }

    const query = `
        SELECT id, username, email, full_name, role, department
        FROM Users
        WHERE (username LIKE @search OR email LIKE @search OR full_name LIKE @search)
        AND role = 'user' -- Only search regular users to promote
    `;
    const result = await executeQuery(query, { search: `%${q}%` });

    res.json({
        success: true,
        data: result.recordset
    });
}));

// Add a reviewer (promote user to Approver)
router.post('/', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const query = `
        UPDATE Users
        SET role = 'Approver', updated_at = GETDATE()
        WHERE id = @userId AND role = 'user'
    `;
    
    await executeQuery(query, { userId });
    
    res.json({
        success: true,
        message: 'Reviewer added successfully'
    });
}));

// Remove a reviewer (demote to user)
router.delete('/:id', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    // Prevent removing self if admin
    if (req.user.id == userId) {
        return res.status(400).json({ success: false, message: 'Cannot remove yourself' });
    }

    const query = `
        UPDATE Users
        SET role = 'user', updated_at = GETDATE()
        WHERE id = @userId AND role IN ('manager', 'Approver')
    `;
    
    await executeQuery(query, { userId });
    
    res.json({
        success: true,
        message: 'Reviewer removed successfully'
    });
}));

module.exports = router;
