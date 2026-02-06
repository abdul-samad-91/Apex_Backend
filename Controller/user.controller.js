const User = require('../Models/user.model');
const bcrypt = require('bcrypt');
const {generateToken} = require("../utils/generateToken");
const { generateOTP, sendOTPEmail } = require('../utils/sendEmail');
const generateReferralCode = require('../utils/generateReferalCode');
const ApexCoinRate = require('../Models/apexCoinRate.model');
const Roi = require('../Models/roi.model');

const uploadToCloudinary = require('../utils/uploadToCloudinary');

// Helper function to update user status based on locked apex coins
const updateUserStatus = async (user) => {
    if (user.lockedApexCoins > 0) {
        user.isActive = true;
    } else {
        user.isActive = false;
    }
};

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

        // Check if this is the first user (root user)
        const userCount = await User.countDocuments();
        const isRootUser = userCount === 0;

        // If not the first user, referral code is mandatory
        if (!isRootUser && !referralCode) {
            return res.status(400).json({ 
                message: "Referral code is required. Please use a valid referral code to register.",
                isRootUser: false
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

        // Generate unique referral code for this user
        let uniqueReferralCode;
        let isUnique = false;
        while (!isUnique) {
            uniqueReferralCode = generateReferralCode();
            const existingCode = await User.findOne({ referralCode: uniqueReferralCode });
            if (!existingCode) {
                isUnique = true;
            }
        }

        // Create new user (password will be hashed by pre-save hook)

                const user = new User({
                        fullName,
                        email,
                        phoneNumber,
                        password,
                        profilePictureUrl,
                        role,
                        isVerified,
                        referralCode: uniqueReferralCode,
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
      message: isRootUser 
        ? "Root user created successfully. You are the first user and the start of the referral tree!" 
        : "User created successfully. Please verify your email with the OTP sent.",
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isVerified: user.isVerified,
          referralCode: user.referralCode,
          isRootUser: isRootUser
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
        
        // Update status for all users based on locked apex coins
        const updatePromises = users.map(async (user) => {
            const previousStatus = user.isActive;
            updateUserStatus(user);
            
            // Save only if status changed
            if (previousStatus !== user.isActive) {
                await user.save();
            }
        });
        
        await Promise.all(updatePromises);
        
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

        // Update user status based on locked apex coins
        const previousStatus = user.isActive;
        updateUserStatus(user);
        
        // Save only if status changed
        if (previousStatus !== user.isActive) {
            await user.save();
        }

        // Calculate ROI profits for each locked coins entry
        let lockedEntriesData = [];
        let totalLockedAmount = 0;

        // Get current ROI rate (for display purposes)
        const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
        const currentRoiRate = currentRoi ? currentRoi.rate : 0;

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
        const apexCoinToDollarRate = coinRate ? coinRate.rate : 1;

        if (user.lockedCoinsEntries && user.lockedCoinsEntries.length > 0) {
            const now = new Date();
            const millisecondsPerDay = 1000 * 60 * 60 * 24;

            user.lockedCoinsEntries.forEach((entry, index) => {
                if (entry.status === 'active') {
                    totalLockedAmount += entry.amount;

                    // Calculate days elapsed since this entry's lock start
                    const lockStart = new Date(entry.lockStartDate);
                    const daysElapsed = Math.max(0, Math.floor((now - lockStart) / millisecondsPerDay));

                    // Calculate months completed
                    const monthsDiff = (now.getFullYear() - lockStart.getFullYear()) * 12 + 
                                     (now.getMonth() - lockStart.getMonth());
                    const monthsCompleted = Math.max(0, monthsDiff);

                    // Use the current ROI rate set by admin (not the historical rate)
                    const entryRoiRate = currentRoiRate;

                    // Calculate monthly profit: (lockedCoins * ROI%) / 100
                    const monthlyProfitInCoins = (entry.amount * entryRoiRate) / 100;
                    const monthlyProfitInDollars = monthlyProfitInCoins * apexCoinToDollarRate;
                    
                    // Calculate daily profit (assuming 30 days per month)
                    const dailyProfitInCoins = monthlyProfitInCoins / 30;
                    const dailyProfitInDollars = dailyProfitInCoins * apexCoinToDollarRate;
                    
                    // Calculate total profit earned so far (daily accrual)
                    const totalProfitInCoins = dailyProfitInCoins * daysElapsed;
                    const totalProfitInDollars = totalProfitInCoins * apexCoinToDollarRate;

                    // Calculate claimable profit (since last claim or lock start)
                    const lastClaim = entry.lastClaimDate ? new Date(entry.lastClaimDate) : lockStart;
                    const daysSinceLastClaim = Math.max(0, Math.floor((now - lastClaim) / millisecondsPerDay));
                    const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                    const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;

                    lockedEntriesData.push({
                        entryId: entry._id,
                        amount: entry.amount,
                        lockStartDate: entry.lockStartDate,
                        lockEndDate: entry.lockEndDate,
                        status: entry.status,
                        roiRateAtLock: entry.roiRateAtLock || 0, // Historical rate when locked
                        currentRoiRate: entryRoiRate, // Current rate used for calculations
                        monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                        dailyProfit: parseFloat(dailyProfitInDollars.toFixed(2)),
                        totalProfit: parseFloat(totalProfitInDollars.toFixed(2)),
                        claimableProfit: parseFloat(claimableProfitInDollars.toFixed(2)),
                        daysSinceLastClaim: daysSinceLastClaim,
                        lastClaimDate: entry.lastClaimDate,
                        totalClaimedProfit: entry.totalClaimedProfit || 0,
                        daysElapsed: daysElapsed,
                        monthsCompleted: monthsCompleted
                    });
                }
            });
        }

        // Calculate total claimable amount across all entries
        const totalClaimableAmount = lockedEntriesData.reduce((sum, entry) => sum + entry.claimableProfit, 0);

        const roiData = {
            lockedEntries: lockedEntriesData,
            totalLockedAmount: totalLockedAmount,
            totalClaimableAmount: parseFloat(totalClaimableAmount.toFixed(2)),
            currentRoiRate: currentRoiRate,
            apexCoinToDollarRate: apexCoinToDollarRate
        };

        res.status(200).json({ 
            user: {
                ...user.toObject(),
                currentRoiRate: currentRoiRate,
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

// Lock ApexCoins for 14 months to earn ROI
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

        // Check if user can lock coins again (must wait 24 hours from last lock)
        if (user.lastLockDate) {
            const now = new Date();
            const lastLock = new Date(user.lastLockDate);
            const hoursSinceLastLock = (now - lastLock) / (1000 * 60 * 60); // Convert milliseconds to hours
            
            if (hoursSinceLastLock < 24) {
                const hoursRemaining = Math.ceil(24 - hoursSinceLastLock);
                const minutesRemaining = Math.ceil((24 - hoursSinceLastLock) * 60);
                
                return res.status(400).json({ 
                    message: `You can lock apex coins again in ${hoursRemaining} hour(s)`,
                    hoursRemaining: hoursRemaining,
                    minutesRemaining: minutesRemaining,
                    lastLockDate: user.lastLockDate,
                    nextLockAvailable: new Date(lastLock.getTime() + (24 * 60 * 60 * 1000))
                });
            }
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

        // Lock the coins - create a new entry
        const lockStartDate = new Date();
        const lockEndDate = new Date();
        lockEndDate.setMonth(lockEndDate.getMonth() + 14); // 14 months from now

        // Create new lock entry
        const newLockEntry = {
            amount: lockAmount,
            lockStartDate: lockStartDate,
            lockEndDate: lockEndDate,
            status: 'active',
            roiRateAtLock: currentRoi.rate,
            createdAt: new Date()
        };

        user.apexCoins = currentCoins - lockAmount;
        user.lockedApexCoins = (user.lockedApexCoins || 0) + lockAmount; // Update total for backward compatibility
        user.lockStartDate = lockStartDate; // Keep for backward compatibility
        user.lockEndDate = lockEndDate; // Keep for backward compatibility
        user.lastLockDate = lockStartDate; // Track when the user last locked coins
        
        // Add the new entry to the array
        if (!user.lockedCoinsEntries) {
            user.lockedCoinsEntries = [];
        }
        user.lockedCoinsEntries.push(newLockEntry);
        
        // Update user status to active since they now have locked coins
        updateUserStatus(user);
        
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
                monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                estimatedTotalProfit: parseFloat((monthlyProfitInDollars * 14).toFixed(2)),
                remainingApexCoins: user.apexCoins,
                apexCoinToDollarRate: coinRate.rate,
                totalLockedEntries: user.lockedCoinsEntries.length
            }
        });
    } catch (error) {
        console.error('Error locking ApexCoins:', error);
        res.status(500).json({ message: 'Error locking ApexCoins', error: error.message });
    }
};

// Request to unlock a specific locked ApexCoins entry
const requestUnlockApexCoins = async (req, res) => {
    try {
        const { entryId } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!entryId) {
            return res.status(400).json({ message: 'Entry ID is required' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find the specific locked entry
        const entryIndex = user.lockedCoinsEntries.findIndex(
            entry => entry._id.toString() === entryId
        );

        if (entryIndex === -1) {
            return res.status(404).json({ message: 'Locked entry not found' });
        }

        const entry = user.lockedCoinsEntries[entryIndex];

        // Check if entry is active
        if (entry.status !== 'active') {
            return res.status(400).json({ 
                message: `Cannot unlock. Entry status is: ${entry.status}`,
                currentStatus: entry.status
            });
        }

        // Calculate days elapsed since lock start
        const now = new Date();
        const lockStart = new Date(entry.lockStartDate);
        const millisecondsPerDay = 1000 * 60 * 60 * 24;
        const daysElapsed = Math.floor((now - lockStart) / millisecondsPerDay);

        // Check if 60 days have passed
        if (daysElapsed < 60) {
            const daysRemaining = 60 - daysElapsed;
            return res.status(400).json({ 
                message: `Cannot unlock before 60 days. ${daysRemaining} days remaining.`,
                daysElapsed: daysElapsed,
                daysRemaining: daysRemaining,
                unlockEligibleDate: new Date(lockStart.getTime() + (60 * millisecondsPerDay))
            });
        }

        // Determine penalty percentage based on days elapsed
        let penaltyPercentage;
        if (daysElapsed >= 180) {
            penaltyPercentage = 10;
        } else if (daysElapsed >= 90) {
            penaltyPercentage = 20;
        } else {
            // 60-89 days
            penaltyPercentage = 25;
        }

        // Calculate penalty and amount after penalty
        const penaltyAmount = (entry.amount * penaltyPercentage) / 100;
        const amountAfterPenalty = entry.amount - penaltyAmount;

        // Set processing period (7 days from now)
        const processAfter = new Date();
        processAfter.setDate(processAfter.getDate() + 7);

        // Update the entry with unlock request details
        user.lockedCoinsEntries[entryIndex].status = 'unlock-pending';
        user.lockedCoinsEntries[entryIndex].unlockRequest = {
            requestedAt: now,
            processAfter: processAfter,
            penaltyPercentage: penaltyPercentage,
            penaltyAmount: penaltyAmount,
            amountAfterPenalty: amountAfterPenalty,
            daysElapsedAtRequest: daysElapsed,
            approvedAt: null,
            approvedBy: null
        };

        await user.save();

        res.status(200).json({
            message: 'Unlock request submitted successfully. Admin will process within 7 days.',
            data: {
                entryId: entry._id,
                originalAmount: entry.amount,
                daysElapsed: daysElapsed,
                penaltyPercentage: penaltyPercentage,
                penaltyAmount: penaltyAmount,
                amountAfterPenalty: amountAfterPenalty,
                requestedAt: now,
                processAfter: processAfter,
                status: 'unlock-pending'
            }
        });
    } catch (error) {
        console.error('Error requesting unlock:', error);
        res.status(500).json({ message: 'Error requesting unlock', error: error.message });
    }
};

// Admin: Approve unlock request and migrate coins
const approveUnlockRequest = async (req, res) => {
    try {
        const { userId, entryId } = req.body;
        const adminId = req.user?._id;

        if (!adminId) {
            return res.status(401).json({ message: 'Admin not authenticated' });
        }

        if (!userId || !entryId) {
            return res.status(400).json({ message: 'User ID and Entry ID are required' });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find the specific locked entry
        const entryIndex = user.lockedCoinsEntries.findIndex(
            entry => entry._id.toString() === entryId
        );

        if (entryIndex === -1) {
            return res.status(404).json({ message: 'Locked entry not found' });
        }

        const entry = user.lockedCoinsEntries[entryIndex];

        // Check if entry is pending unlock
        if (entry.status !== 'unlock-pending') {
            return res.status(400).json({ 
                message: `Cannot approve. Entry status is: ${entry.status}`,
                currentStatus: entry.status
            });
        }

        // Check if 7-day processing period has passed
        const now = new Date();
        const processAfter = new Date(entry.unlockRequest.processAfter);
        
        if (now < processAfter) {
            const hoursRemaining = Math.ceil((processAfter - now) / (1000 * 60 * 60));
            return res.status(400).json({ 
                message: `Processing period not completed. ${hoursRemaining} hours remaining.`,
                processAfter: processAfter,
                hoursRemaining: hoursRemaining
            });
        }

        // Get the amount after penalty
        const amountAfterPenalty = entry.unlockRequest.amountAfterPenalty;
        const originalAmount = entry.amount;
        const penaltyAmount = entry.unlockRequest.penaltyAmount;

        // Update entry status to unlocked
        user.lockedCoinsEntries[entryIndex].status = 'unlocked';
        user.lockedCoinsEntries[entryIndex].unlockRequest.approvedAt = now;
        user.lockedCoinsEntries[entryIndex].unlockRequest.approvedBy = adminId;

        // Migrate coins to user's apexCoins (after penalty deduction)
        user.apexCoins = (user.apexCoins || 0) + amountAfterPenalty;
        
        // Reduce lockedApexCoins total
        user.lockedApexCoins = Math.max(0, (user.lockedApexCoins || 0) - originalAmount);
        
        // Update user status based on remaining locked coins
        updateUserStatus(user);

        await user.save();

        res.status(200).json({
            message: 'Unlock request approved successfully. Coins migrated to user account.',
            data: {
                entryId: entry._id,
                originalAmount: originalAmount,
                penaltyPercentage: entry.unlockRequest.penaltyPercentage,
                penaltyDeducted: penaltyAmount,
                amountCredited: amountAfterPenalty,
                newApexCoinsBalance: user.apexCoins,
                approvedAt: now,
                approvedBy: adminId
            }
        });
    } catch (error) {
        console.error('Error approving unlock:', error);
        res.status(500).json({ message: 'Error approving unlock', error: error.message });
    }
};

// Admin: Get all pending unlock requests
const getPendingUnlockRequests = async (req, res) => {
    try {
        // Find all users with pending unlock requests
        const usersWithPendingUnlocks = await User.find({
            'lockedCoinsEntries.status': 'unlock-pending'
        }).select('fullName email phoneNumber lockedCoinsEntries');

        // Extract and format pending requests
        const pendingRequests = [];

        usersWithPendingUnlocks.forEach(user => {
            user.lockedCoinsEntries.forEach(entry => {
                if (entry.status === 'unlock-pending') {
                    const now = new Date();
                    const processAfter = new Date(entry.unlockRequest.processAfter);
                    const canApprove = now >= processAfter;

                    pendingRequests.push({
                        userId: user._id,
                        userName: user.fullName,
                        userEmail: user.email,
                        entryId: entry._id,
                        originalAmount: entry.amount,
                        lockStartDate: entry.lockStartDate,
                        daysElapsedAtRequest: entry.unlockRequest.daysElapsedAtRequest,
                        penaltyPercentage: entry.unlockRequest.penaltyPercentage,
                        penaltyAmount: entry.unlockRequest.penaltyAmount,
                        amountAfterPenalty: entry.unlockRequest.amountAfterPenalty,
                        requestedAt: entry.unlockRequest.requestedAt,
                        processAfter: entry.unlockRequest.processAfter,
                        canApprove: canApprove
                    });
                }
            });
        });

        res.status(200).json({
            message: 'Pending unlock requests retrieved successfully',
            count: pendingRequests.length,
            data: pendingRequests
        });
    } catch (error) {
        console.error('Error fetching pending unlocks:', error);
        res.status(500).json({ message: 'Error fetching pending unlock requests', error: error.message });
    }
};

// Claim accumulated daily profits from all active locked entries
const claimDailyProfits = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has any active locked entries
        const activeEntries = user.lockedCoinsEntries?.filter(entry => entry.status === 'active') || [];
        if (activeEntries.length === 0) {
            return res.status(400).json({ 
                message: 'No active locked entries found',
                claimableAmount: 0
            });
        }

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (!coinRate) {
            return res.status(400).json({ message: 'ApexCoin rate not set yet.' });
        }

        // Get current ROI rate set by admin
        const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (!currentRoi) {
            return res.status(400).json({ message: 'ROI rate not set by admin.' });
        }

        const apexCoinToDollarRate = coinRate.rate;
        const currentRoiRate = currentRoi.rate;
        const now = new Date();
        const millisecondsPerDay = 1000 * 60 * 60 * 24;
        
        let totalClaimableAmount = 0;
        const claimDetails = [];

        // Calculate claimable profit for each active entry
        user.lockedCoinsEntries.forEach((entry, index) => {
            if (entry.status === 'active') {
                const lockStart = new Date(entry.lockStartDate);
                const lastClaim = entry.lastClaimDate ? new Date(entry.lastClaimDate) : lockStart;
                
                // Calculate days since last claim (or since lock start if never claimed)
                const daysSinceLastClaim = Math.max(0, Math.floor((now - lastClaim) / millisecondsPerDay));
                
                if (daysSinceLastClaim > 0) {
                    // Use current ROI rate for calculations
                    const monthlyProfitInCoins = (entry.amount * currentRoiRate) / 100;
                    const dailyProfitInCoins = monthlyProfitInCoins / 30;
                    
                    // Calculate claimable profit in coins for this entry
                    const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                    const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;
                    
                    totalClaimableAmount += claimableProfitInDollars;
                    
                    // Update entry
                    entry.unclaimedProfit = 0; // Reset unclaimed profit
                    entry.lastClaimDate = now;
                    entry.totalClaimedProfit = (entry.totalClaimedProfit || 0) + claimableProfitInDollars;
                    
                    claimDetails.push({
                        entryId: entry._id,
                        amount: entry.amount,
                        daysSinceLastClaim: daysSinceLastClaim,
                        claimedAmount: parseFloat(claimableProfitInDollars.toFixed(2)),
                        dailyRate: parseFloat((dailyProfitInCoins * apexCoinToDollarRate).toFixed(2))
                    });
                }
            }
        });

        if (totalClaimableAmount === 0) {
            return res.status(400).json({ 
                message: 'No profits available to claim yet. Please wait at least one day since your last claim.',
                claimableAmount: 0
            });
        }

        // Transfer profits to accountBalance
        user.accountBalance = (user.accountBalance || 0) + totalClaimableAmount;
        user.totalRoiEarned = (user.totalRoiEarned || 0) + totalClaimableAmount;
        
        await user.save();

        res.status(200).json({
            message: 'Daily profits claimed successfully',
            data: {
                totalClaimedAmount: parseFloat(totalClaimableAmount.toFixed(2)),
                newAccountBalance: parseFloat(user.accountBalance.toFixed(2)),
                totalRoiEarned: parseFloat(user.totalRoiEarned.toFixed(2)),
                claimDetails: claimDetails,
                claimedAt: now
            }
        });
    } catch (error) {
        console.error('Error claiming daily profits:', error);
        res.status(500).json({ message: 'Error claiming daily profits', error: error.message });
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
    lockApexCoins,
    requestUnlockApexCoins,
    approveUnlockRequest,
    getPendingUnlockRequests,
    claimDailyProfits
};
