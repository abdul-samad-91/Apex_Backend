const User = require('../Models/user.model');
const bcrypt = require('bcrypt');
const {generateToken} = require("../utils/generateToken");
const { generateOTP, sendOTPEmail } = require('../utils/sendEmail');
const generateReferralCode = require('../utils/generateReferalCode');
const ApexCoinRate = require('../Models/apexCoinRate.model');
const Roi = require('../Models/roi.model');

const uploadToCloudinary = require('../utils/uploadToCloudinary');
// Create new user
const createUser = async (req, res) => {
    try {
        const {
            fullName,
            email,
            phoneNumber,
            password,
            confirmPassword,
            role,
            isVerified,
            referralCode 
        } = req.body;

        let referredByUser = null;
        let referralChain = [];

        // Required fields check
        if (!fullName || !email || !phoneNumber || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Password match check
        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }],
        });
        if (existingUser) {
            return res.status(400).json({
                message: "User already exists with provided email",
            });
        }

        if (referralCode) {
            referredByUser = await User.findOne({ referralCode });
            if (!referredByUser) {
                return res.status(400).json({ message: "Invalid referral code" });
            }
            // Build the referral chain: direct referrer + their chain
            referralChain = [
                referredByUser._id,
                ...(referredByUser.referralChain || [])
            ];
        }

        // Handle profile picture upload
        let profilePictureUrl = null;
        if (req.file) {
            try {
                const uploadResult = await uploadToCloudinary(req.file.buffer);
                profilePictureUrl = uploadResult.secure_url;
            } catch (err) {
                return res.status(500).json({ message: 'Profile image upload failed', error: err.message });
            }
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

        // Create new user (password will be hashed by pre-save hook)

                const user = new User({
                        fullName,
                        email,
                        phoneNumber,
                        password,
                        profilePictureUrl,
                        role,
                        isVerified,
                        // referralCode: generateReferralCode(),
                        referralCode: null,
                        referredBy: referredByUser ? referredByUser._id : null,
                        referralChain,
                        otp,
                        otpExpiry
                });

    await user.save();

    // Add new user to referrer's referrals array and update referral chain
    if (referredByUser) {
        // Add new user ID to the direct referrer's referrals array
        await User.findByIdAndUpdate(
            referredByUser._id,
            { $push: { referrals: user._id } }
        );

        // Update referral chain for all users in the chain
        // Each user in the chain should have this new user in their referrals
        if (referralChain.length > 1) {
            // Update all users in the referral chain (except the direct referrer, already updated)
            for (let i = 1; i < referralChain.length; i++) {
                await User.findByIdAndUpdate(
                    referralChain[i],
                    { $addToSet: { referrals: user._id } } // $addToSet prevents duplicates
                );
            }
        }
    }

    // 🔹 Send OTP email
    const emailResult = await sendOTPEmail(email, otp, fullName);
    if (!emailResult.success) {
      console.error('Failed to send OTP email:', emailResult.error);
    }

    const token = generateToken(user._id, role);
    console.log(token);
    res.status(201).json({
      message: "User created successfully. Please verify your email with the OTP sent.",
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isVerified: user.isVerified
        },
        token
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error creating user",
      error: error.message,
    });
  }
};


// Get all users
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Calculate ROI profits if coins are locked
        let roiData = {
            monthlyProfit: 0,
            totalProfit: 0,
            monthsCompleted: 0,
            currentRoiRate: 0
        };

        if (user.lockedApexCoins > 0 && user.lockStartDate) {
            // Get current ROI rate
            const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
            const roiRate = currentRoi ? currentRoi.rate : 0;

            // Get current ApexCoin to dollar rate
            const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
            const apexCoinToDollarRate = coinRate ? coinRate.rate : 1;

            // Calculate days elapsed since lock start
            const now = new Date();
            const lockStart = new Date(user.lockStartDate);
            const millisecondsPerDay = 1000 * 60 * 60 * 24;
            const daysElapsed = Math.max(0, Math.floor((now - lockStart) / millisecondsPerDay));

            // Calculate months completed
            const monthsDiff = (now.getFullYear() - lockStart.getFullYear()) * 12 + 
                             (now.getMonth() - lockStart.getMonth());
            const monthsCompleted = Math.max(0, monthsDiff);

            // Calculate monthly profit: (lockedCoins * ROI%) / 100
            const monthlyProfitInCoins = (user.lockedApexCoins * roiRate) / 100;
            const monthlyProfitInDollars = monthlyProfitInCoins * apexCoinToDollarRate;
            
            // Calculate daily profit (assuming 30 days per month)
            const dailyProfitInCoins = monthlyProfitInCoins / 30;
            const dailyProfitInDollars = dailyProfitInCoins * apexCoinToDollarRate;
            
            // Calculate total profit earned so far (daily accrual)
            const totalProfitInCoins = (dailyProfitInCoins * daysElapsed) + (user.totalRoiEarned || 0);
            const totalProfitInDollars = totalProfitInCoins * apexCoinToDollarRate;

            roiData = {
                monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                dailyProfit: parseFloat(dailyProfitInDollars.toFixed(2)),
                totalProfit: parseFloat(totalProfitInDollars.toFixed(2)),
                daysElapsed: daysElapsed,
                monthsCompleted: monthsCompleted,
                currentRoiRate: roiRate,
                apexCoinToDollarRate: apexCoinToDollarRate
            };
        }

        res.status(200).json({ 
            user: {
                ...user.toObject(),
                roiData
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { name, email, role, isActive } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ 
            message: 'User updated successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

// Update password
const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
};

// Verify OTP
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Find user with OTP fields
        const user = await User.findOne({ email }).select('+otp +otpExpiry');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: 'User is already verified' });
        }

        // Check if OTP exists
        if (!user.otp) {
            return res.status(400).json({ message: 'No OTP found. Please request a new OTP.' });
        }

        // Check if OTP has expired
        if (user.otpExpiry < new Date()) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new OTP.' });
        }

        // Verify OTP
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Mark user as verified and clear OTP
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        res.status(200).json({
            message: 'Email verified successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    isVerified: user.isVerified
                }
            }
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ message: 'Error verifying OTP', error: error.message });
    }
};

// Resend OTP
const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: 'User is already verified' });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user with new OTP
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, user.fullName);
        if (!emailResult.success) {
            return res.status(500).json({ message: 'Failed to send OTP email', error: emailResult.error });
        }

        res.status(200).json({ message: 'OTP sent successfully to your email' });
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.status(500).json({ message: 'Error resending OTP', error: error.message });
    }
};

// Purchase ApexCoins using accountBalance
const purchaseApexCoins = async (req, res) => {
    try {
        const { apexCoinsAmount } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validate apexCoinsAmount
        if (!apexCoinsAmount) {
            return res.status(400).json({ message: 'ApexCoins amount is required' });
        }

        const coinsAmount = parseFloat(apexCoinsAmount);
        if (isNaN(coinsAmount) || coinsAmount <= 0) {
            return res.status(400).json({ message: 'ApexCoins amount must be a valid positive number' });
        }

        // Get current apex coin rate
        const currentRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (!currentRate) {
            return res.status(400).json({ message: 'Apex coin rate not set. Please contact admin.' });
        }

        // Calculate dollar amount needed (apexCoins * rate = dollars)
        const dollarAmount = coinsAmount * currentRate.rate;

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has sufficient accountBalance
        const currentBalance = user.accountBalance || 0;
        if (currentBalance < dollarAmount) {
            return res.status(400).json({ 
                message: 'Insufficient account balance',
                currentBalance: currentBalance,
                requiredAmount: dollarAmount,
                apexCoinsRequested: coinsAmount,
                currentRate: currentRate.rate
            });
        }

        // Deduct from accountBalance and add to apexCoins
        user.accountBalance = currentBalance - dollarAmount;
        user.apexCoins = (user.apexCoins || 0) + coinsAmount;
        
        await user.save();

        res.status(200).json({
            message: 'ApexCoins purchased successfully',
            data: {
                apexCoinsPurchased: coinsAmount,
                dollarsPaid: dollarAmount,
                rate: currentRate.rate,
                newAccountBalance: user.accountBalance,
                newApexCoins: user.apexCoins
            }
        });
    } catch (error) {
        console.error('Error purchasing ApexCoins:', error);
        res.status(500).json({ message: 'Error purchasing ApexCoins', error: error.message });
    }
};

// Lock ApexCoins for 6 months to earn ROI
const lockApexCoins = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validate amount
        if (!amount) {
            return res.status(400).json({ message: 'Amount is required' });
        }

        const lockAmount = parseFloat(amount);
        if (isNaN(lockAmount) || lockAmount <= 0) {
            return res.status(400).json({ message: 'Amount must be a valid positive number' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user already has locked coins
        if (user.lockedApexCoins > 0 && user.lockEndDate && new Date() < new Date(user.lockEndDate)) {
            return res.status(400).json({ 
                message: 'You already have locked apex coins. Please wait until the lock period ends.',
                lockEndDate: user.lockEndDate
            });
        }

        // Check if user has sufficient apexCoins
        const currentCoins = user.apexCoins || 0;
        if (currentCoins < lockAmount) {
            return res.status(400).json({ 
                message: 'Insufficient apex coins',
                currentApexCoins: currentCoins,
                requestedAmount: lockAmount
            });
        }

        // Get current ROI rate to show to user
        const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (!currentRoi) {
            return res.status(400).json({ message: 'ROI rate not set yet.' });
        }

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (!coinRate) {
            return res.status(400).json({ message: 'ApexCoin rate not set yet.' });
        }

        // Lock the coins
        const lockStartDate = new Date();
        const lockEndDate = new Date();
        lockEndDate.setMonth(lockEndDate.getMonth() + 6); // 6 months from now

        user.apexCoins = currentCoins - lockAmount;
        user.lockedApexCoins = lockAmount;
        user.lockStartDate = lockStartDate;
        user.lockEndDate = lockEndDate;
        
        await user.save();

        // Calculate monthly profit in apex coins then convert to dollars
        const monthlyProfitInCoins = (lockAmount * currentRoi.rate) / 100;
        const monthlyProfitInDollars = monthlyProfitInCoins * coinRate.rate;

        res.status(200).json({
            message: 'ApexCoins locked successfully',
            data: {
                lockedAmount: lockAmount,
                lockStartDate: lockStartDate,
                lockEndDate: lockEndDate,
                currentRoiRate: currentRoi.rate,
                monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                estimatedTotalProfit: parseFloat((monthlyProfitInDollars * 6).toFixed(2)),
                remainingApexCoins: user.apexCoins,
                apexCoinToDollarRate: coinRate.rate
            }
        });
    } catch (error) {
        console.error('Error locking ApexCoins:', error);
        res.status(500).json({ message: 'Error locking ApexCoins', error: error.message });
    }
};




module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    updatePassword,
    verifyOTP,
    resendOTP,
    purchaseApexCoins,
    lockApexCoins
};
