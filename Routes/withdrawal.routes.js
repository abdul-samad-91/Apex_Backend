const express = require('express');
const router = express.Router();
const {
    requestWithdrawal,
    getUserWithdrawals,
    getAllWithdrawals,
    getPendingWithdrawals,
    updateWithdrawalStatus
} = require('../Controller/withdrawal.controller');
const { protect, isAdmin } = require('../Middleware/authorization.middleware');

// User routes
// Request a new withdrawal
router.post('/requestWithdrawal', protect, requestWithdrawal);

// Get user's withdrawal history
router.get('/myWithdrawals', protect, getUserWithdrawals);

// Admin routes
// Get all withdrawals
router.get('/all', protect, isAdmin, getAllWithdrawals);

// Get pending withdrawals only
router.get('/pending', protect, isAdmin, getPendingWithdrawals);

// Update withdrawal status (approve/reject)
router.put('/:withdrawalId/status', protect, isAdmin, updateWithdrawalStatus);

module.exports = router;
