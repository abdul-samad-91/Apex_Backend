const express = require('express');
const router = express.Router();
const {
    createTransaction, getAllTransactions, getUserTransactionHistory, updateTransactionStatus
} = require('../Controller/transaction.controller');
const {protect , isAdmin} = require("../Middleware/authorization.middleware");
const upload = require('../Middleware/upload.middleware');
const { transactionLimiterMiddleware } = require('../Middleware/rateLimiter');

// Create new transaction (with file upload)
// limit transaction creation to prevent automated abuse
router.post('/createTransaction', protect, transactionLimiterMiddleware, upload.single('screenshot'), createTransaction);

// Get all transactions (admin only)
router.get('/getAllTransactions', protect, getAllTransactions);

// Get transaction history for logged-in user
router.get('/myTransactions', protect, getUserTransactionHistory);

// Get transaction history for a specific user (admin or own user)
router.get('/user/:userId/transactions', protect, getUserTransactionHistory);

// Update transaction status (admin only)
router.put("/updateTransactionStatus/:id", protect, isAdmin, updateTransactionStatus);


module.exports = router;