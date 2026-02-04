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
    // unlockApexCoins
} = require('../Controller/user.controller');
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

// Lock ApexCoins for 6 months to earn ROI (user only)
router.post('/lockApexCoins', protect, lockApexCoins);

// Unlock/Delete current locked ApexCoins (user only)
// router.delete('/unlockApexCoins', protect, unlockApexCoins);

// Get user by ID
router.get('/:id', protect  , getUserById);

// Update user
router.put('/:id' , protect , updateUser);

// Delete user
router.delete('/:id' , protect , isAdmin , deleteUser);

module.exports = router;
