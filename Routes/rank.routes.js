const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const {
    getUserRank,
    getAllRanks,
    recalculateUserRank,
    getUserLegs,
    getUserRankHistory,
    getUserRankRewards,
    claimRankReward,
    processWeeklyRankRecalculation,
    initializeRanks
} = require('../Controller/rank.controller');

// Protected routes - to be used with auth middleware
// These routes require user to be authenticated

/**
 * Public Routes
 */

// Get all available ranks
router.get('/all', getAllRanks);

/**
 * User Routes - Protected
 */

// Get current user's rank information
router.get('/user/:userId', protect, getUserRank);

// Get user's leg information
router.get('/legs/:userId', protect, getUserLegs);

// Get rank history for user
router.get('/history/:userId', protect, getUserRankHistory);

// Get rank rewards for user
router.get('/rewards/:userId', protect, getUserRankRewards);

// Claim a rank reward
router.post('/rewards/claim/:rewardId', protect, claimRankReward);

// Manually trigger rank recalculation
router.post('/recalculate/:userId', protect, recalculateUserRank);

/**
 * Admin Routes - Should be protected with admin middleware
 */

// Initialize rank configuration (run once during setup)
router.post('/admin/initialize-ranks', protect, isAdmin, initializeRanks);

// Process weekly rank recalculation for all users
// Should be called via cron job
router.post('/admin/process-weekly-recalculation', protect, isAdmin, processWeeklyRankRecalculation);

module.exports = router;
