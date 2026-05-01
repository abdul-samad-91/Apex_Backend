const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const { claimsLimiterMiddleware } = require('../Middleware/rateLimiter');
const { setRoi, getRoi, claimRoi } = require('../Controller/roi.controller');

// Admin: set ROI
router.post('/', protect, isAdmin, setRoi);

// Public: get current ROI
router.get('/', getRoi);

// User: claim ROI (requires auth)
router.post('/claim', protect, claimsLimiterMiddleware, claimRoi);

module.exports = router;
