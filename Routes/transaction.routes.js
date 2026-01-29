const express = require('express');
const router = express.Router();
const {
    createTransaction, getAllTransactions, updateTransactionStatus
} = require('../Controller/transaction.controller');
const {protect , isAdmin} = require("../Middleware/authorization.middleware");
const upload = require('../Middleware/upload.middleware');

// Create new transaction (with file upload)
router.post('/createTransaction', protect, upload.single('screenshot'), createTransaction);

// Get all transactions (admin only)
router.get('/getAllTransactions', protect, getAllTransactions);

// Update transaction status (admin only)
router.put("/updateTransactionStatus/:id", protect, isAdmin, updateTransactionStatus);


module.exports = router;