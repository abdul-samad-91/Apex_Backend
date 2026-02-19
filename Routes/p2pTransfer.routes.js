const express = require('express');
const router = express.Router();
const {
    transferP2P,
    getP2PTransferHistory
} = require('../Controller/p2pTransfer.controller');
const { protect } = require('../Middleware/authorization.middleware');

// Transfer P2P balance to another user
router.post('/transfer', protect, transferP2P);

// Get P2P transfer history (sent and received)
router.get('/history', protect, getP2PTransferHistory);

module.exports = router;
