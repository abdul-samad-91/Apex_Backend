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
    purchaseApexCoins,
    lockApexCoins,
    requestUnlockApexCoins,
    approveUnlockRequest,
    getPendingUnlockRequests,
    claimDailyProfits
    , getReferralLevels
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
// Create new user (with profile picture upload)
router.post('/register', upload.single('profilePicture'), createUser);

// Verify OTP
router.post('/verify-otp', verifyOTP);

// Resend OTP
router.post('/resend-otp', resendOTP);

// authenticate user/admin
router.post ('/auth' , login)

// Get all users (must be before /:id route)
router.get('/getAllUsers', protect, isAdmin , getAllUsers);

// Update password (must be before /:id route)
router.put('/:id/password', protect, updatePassword);

// Purchase ApexCoins (user only)
router.post('/purchaseApex', protect, purchaseApexCoins);

// Lock ApexCoins for 14 months to earn ROI (user only)
router.post('/lockApexCoins', protect, lockApexCoins);

// Request unlock of locked ApexCoins (user only)
router.post('/requestUnlock', protect, requestUnlockApexCoins);

// Claim accumulated daily profits (user only)
router.post('/claimDailyProfits', protect, claimDailyProfits);

// Admin: Get all pending unlock requests
router.get('/pendingUnlocks', protect, isAdmin, getPendingUnlockRequests);

// Admin: Approve unlock request
router.post('/approveUnlock', protect, isAdmin, approveUnlockRequest);

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
router.post('/claimBonuses', protect, claimBonuses);

// Get available downchain profit shares (view claimable amount)
router.get('/availableDownchainProfitShares', protect, getAvailableDownchainProfitShares);

// Claim downchain profit shares (independent of when downchain users claim)
router.post('/claimDownchainProfitShares', protect, claimDownchainProfitShares);

// ======================================================

// Get referral levels for authenticated user (levels 1..12)
router.get('/referralLevels', protect, getReferralLevels);

// Get user by ID
router.get('/:id', protect  , getUserById);

// Update user (with optional profile picture upload)
router.put('/:id' , protect , upload.single('profilePicture'), updateUser);

// Delete user
router.delete('/:id' , protect , isAdmin , deleteUser);

module.exports = router;
