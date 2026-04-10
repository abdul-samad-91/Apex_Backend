const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const {
    getMyWalletHistory,
    getUserWalletHistory,
    getAllWalletHistory
} = require('../Controller/walletLedger.controller');

// Logged in user wallet history
router.get('/my', protect, getMyWalletHistory);

// Admin wallet history endpoints
router.get('/all', protect, isAdmin, getAllWalletHistory);
router.get('/user/:userId', protect, isAdmin, getUserWalletHistory);

module.exports = router;
