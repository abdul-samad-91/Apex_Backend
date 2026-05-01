const express = require('express');
const router = express.Router();
const {login} = require('../Controller/auth.controller')
const {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    updatePassword,
    verifyOTP,
    resendOTP,
    forgotPassword,
    verifyForgotPasswordOTP,
    resetPassword,
    purchaseApexCoins,
    lockApexCoins,
    requestUnlockApexCoins,
    approveUnlockRequest,
    rejectUnlockRequest,
    getPendingUnlockRequests,
    getMyUnlockRequestStatus,
    claimDailyProfits,
    getReferralLevels,
    getSystemFeeHistory
} = require('../Controller/user.controller');
const {
    getBonusHistory,
    getProfitShareHistory,
    getReferralStats,
    getUnclaimedBonuses,
    claimBonuses,
    getAvailableDownchainProfitShares,
    claimDownchainProfitShares
} = require('../Controller/referralBonus.controller');
const {protect , isAdmin} = require("../Middleware/authorization.middleware")


const upload = require('../Middleware/upload.middleware');
const { authIpLimiterMiddleware, claimsLimiterMiddleware, otpLimiterMiddleware } = require('../Middleware/rateLimiter');
// Create new user (with profile picture upload)
router.post('/register', authIpLimiterMiddleware, upload.single('profilePicture'), createUser);

// Verify OTP
router.post('/verify-otp', otpLimiterMiddleware, verifyOTP);

// Resend OTP
router.post('/resend-otp', otpLimiterMiddleware, resendOTP);

// Forgot password flow (rate-limited by IP)
router.post('/forgot-password', authIpLimiterMiddleware, forgotPassword);
router.post('/verify-forgot-password-otp', authIpLimiterMiddleware, verifyForgotPasswordOTP);
router.post('/reset-password', authIpLimiterMiddleware, resetPassword);

// authenticate user/admin (rate-limited by IP)
router.post ('/auth', authIpLimiterMiddleware, login)

// Get all users (must be before /:id route)
router.get('/getAllUsers', protect, isAdmin , getAllUsers);

// Update password (must be before /:id route)
router.put('/:id/password', protect, updatePassword);

// Purchase ApexCoins (user only)
router.post('/purchaseApex', protect, claimsLimiterMiddleware, purchaseApexCoins);

// Lock ApexCoins for 14 months to earn ROI (user only)
router.post('/lockApexCoins', protect, claimsLimiterMiddleware, lockApexCoins);

// Request unlock of locked ApexCoins (user only)
router.post('/requestUnlock', protect, claimsLimiterMiddleware, requestUnlockApexCoins);

// User: Get pending unlock request status and processing time remaining
router.get('/myUnlockRequestStatus', protect, getMyUnlockRequestStatus);

// Claim accumulated daily profits (user only)
router.post('/claimDailyProfits', protect, claimsLimiterMiddleware, claimDailyProfits);

// Admin: Get all pending unlock requests
router.get('/pendingUnlocks', protect, isAdmin, getPendingUnlockRequests);

// Admin: Approve unlock request
router.post('/approveUnlock', protect, isAdmin, approveUnlockRequest);

// Admin: Reject unlock request
router.post('/rejectUnlock', protect, isAdmin, rejectUnlockRequest);

// ============ REFERRAL BONUS SYSTEM ROUTES ============

// Get user's one-time bonus (commission) history
router.get('/bonusHistory', protect, getBonusHistory);

// Get user's daily profit share (royalty) history
router.get('/profitShareHistory', protect, getProfitShareHistory);

// Get user's referral network statistics and earnings
router.get('/referralStats', protect, getReferralStats);

// Get unclaimed bonuses
router.get('/unclaimedBonuses', protect, getUnclaimedBonuses);

// Claim bonuses (transfer to account balance)
router.post('/claimBonuses', protect, claimsLimiterMiddleware, claimBonuses);

// Get available downchain profit shares (view claimable amount)
router.get('/availableDownchainProfitShares', protect, getAvailableDownchainProfitShares);

// Claim downchain profit shares (independent of when downchain users claim)
router.post('/claimDownchainProfitShares', protect, claimsLimiterMiddleware, claimDownchainProfitShares);

// ======================================================

// Get referral levels for authenticated user (levels 1..12)
router.get('/referralLevels', protect, getReferralLevels);

// Get system fee transaction history (P2P + Withdrawals)
router.get('/systemFeeHistory', protect, getSystemFeeHistory);

// Get user by ID
router.get('/:id', protect  , getUserById);

// Update user (with optional profile picture upload)
router.put('/:id' , protect , upload.single('profilePicture'), updateUser);

// Delete user
router.delete('/:id' , protect , isAdmin , deleteUser);

module.exports = router;
