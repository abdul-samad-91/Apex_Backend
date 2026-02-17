const { Op } = require('sequelize');
const { sequelize } = require('../Config/DB');
const User = require('../Models/user.model');
const LockedCoinsEntry = require('../Models/lockedCoinsEntry.model');
const ApexCoinRate = require('../Models/apexCoinRate.model');
const Roi = require('../Models/roi.model');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/generateToken');
const { generateOTP, sendOTPEmail } = require('../utils/sendEmail');
const generateReferralCode = require('../utils/generateReferalCode');
const {
    distributeStakingBonus,
    countActiveDirectReferrals,
    BONUS_PERCENTAGES,
    PROFIT_SHARE_PERCENTAGES
} = require('./referralBonus.controller');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

// Create new user
const createUser = async (req, res) => {
    const transaction = await sequelize.transaction();
    
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
            await transaction.rollback();
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Password match check
        if (password !== confirmPassword) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        // Check if user already exists by email
        const existingUser = await User.findOne({
            where: { email: email.toLowerCase() },
            transaction
        });
        if (existingUser) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'User already exists with provided email'
            });
        }

        // Check if the phone number is already registered
        const existingPhone = await User.findOne({
            where: { phone_number: phoneNumber },
            transaction
        });
        if (existingPhone) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'User already exists with provided phone number'
            });
        }

        // Check if this is the first user (root user)
        const userCount = await User.count({ transaction });
        const isRootUser = userCount === 0;

        // If not the first user, referral code is mandatory
        if (!isRootUser && !referralCode) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Referral code is required. Please use a valid referral code to register.',
                isRootUser: false
            });
        }

        if (referralCode) {
            referredByUser = await User.findOne({
                where: { referral_code: referralCode },
                transaction
            });
            if (!referredByUser) {
                await transaction.rollback();
                return res.status(400).json({ message: 'Invalid referral code' });
            }
            // Build the referral chain: direct referrer + their chain
            const referrerChain = referredByUser.getReferralChainArray();
            referralChain = [referredByUser.id, ...referrerChain];
        }

        // Handle profile picture upload
        let profilePictureUrl = null;
        if (req.file) {
            try {
                const uploadResult = await uploadToCloudinary(req.file.buffer);
                profilePictureUrl = uploadResult.secure_url;
            } catch (err) {
                await transaction.rollback();
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
            const existingCode = await User.findOne({
                where: { referral_code: uniqueReferralCode },
                transaction
            });
            if (!existingCode) {
                isUnique = true;
            }
        }

        // Create new user (password will be hashed by hook)
        const user = await User.create({
            full_name: fullName,
            email: email.toLowerCase(),
            phone_number: phoneNumber,
            password: password,
            profile_picture_url: profilePictureUrl,
            role: role || 'user',
            is_verified: isVerified || false,
            referral_code: uniqueReferralCode,
            referred_by: referredByUser ? referredByUser.id : null,
            referral_chain: JSON.stringify(referralChain),
            otp,
            otp_expiry: otpExpiry
        }, { transaction });

        await transaction.commit();

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, fullName);
        if (!emailResult.success) {
            console.error('Failed to send OTP email:', emailResult.error);
        }

        const token = generateToken(user.id, user.role);
        console.log(token);
        
        res.status(201).json({
            message: isRootUser
                ? 'Root user created successfully. You are the first user and the start of the referral tree!'
                : 'User created successfully. Please verify your email with the OTP sent.',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    isVerified: user.is_verified,
                    referralCode: user.referral_code,
                    isRootUser: isRootUser
                },
                token
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        res.status(500).json({
            message: 'Error creating user',
            error: error.message
        });
    }
};

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password', 'otp', 'otp_expiry'] }
        });

        res.status(200).json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: { exclude: ['password', 'otp', 'otp_expiry'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get locked coins entries for this user
        const lockedCoinsEntries = await LockedCoinsEntry.findAll({
            where: { user_id: user.id, status: 'active' },
            order: [['created_at', 'DESC']]
        });

        // Calculate ROI profits for each locked coins entry
        let lockedEntriesData = [];
        let totalLockedAmount = 0;

        // Get current ROI rate
        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });
        const currentRoiRate = currentRoi ? parseFloat(currentRoi.rate) : 0;

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });
        const apexCoinToDollarRate = coinRate ? parseFloat(coinRate.rate) : 1;

        if (lockedCoinsEntries && lockedCoinsEntries.length > 0) {
            const now = new Date();
            const millisecondsPerDay = 1000 * 60 * 60 * 24;

            lockedCoinsEntries.forEach((entry) => {
                const entryAmount = parseFloat(entry.amount);
                totalLockedAmount += entryAmount;

                // Calculate days elapsed since this entry's lock start
                const lockStart = new Date(entry.lock_start_date);
                const daysElapsed = Math.max(0, Math.floor((now - lockStart) / millisecondsPerDay));

                // Calculate months completed
                const monthsDiff = (now.getFullYear() - lockStart.getFullYear()) * 12 +
                    (now.getMonth() - lockStart.getMonth());
                const monthsCompleted = Math.max(0, monthsDiff);

                // Use the current ROI rate set by admin
                const entryRoiRate = currentRoiRate;

                // Calculate monthly profit: (lockedCoins * ROI%) / 100
                const monthlyProfitInCoins = (entryAmount * entryRoiRate) / 100;
                const monthlyProfitInDollars = monthlyProfitInCoins * apexCoinToDollarRate;

                // Calculate daily profit (assuming 30 days per month)
                const dailyProfitInCoins = monthlyProfitInCoins / 30;
                const dailyProfitInDollars = dailyProfitInCoins * apexCoinToDollarRate;

                // Calculate total profit earned so far (daily accrual)
                const totalProfitInCoins = dailyProfitInCoins * daysElapsed;
                const totalProfitInDollars = totalProfitInCoins * apexCoinToDollarRate;

                // Calculate claimable profit (since last claim or lock start)
                const lastClaim = entry.last_claim_date ? new Date(entry.last_claim_date) : lockStart;
                const daysSinceLastClaim = Math.max(0, Math.floor((now - lastClaim) / millisecondsPerDay));
                const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;

                lockedEntriesData.push({
                    entryId: entry.id,
                    amount: entryAmount,
                    lockStartDate: entry.lock_start_date,
                    lockEndDate: entry.lock_end_date,
                    status: entry.status,
                    roiRateAtLock: parseFloat(entry.roi_rate_at_lock) || 0,
                    currentRoiRate: entryRoiRate,
                    monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                    dailyProfit: parseFloat(dailyProfitInDollars.toFixed(2)),
                    totalProfit: parseFloat(totalProfitInDollars.toFixed(2)),
                    claimableProfit: parseFloat(claimableProfitInDollars.toFixed(2)),
                    daysSinceLastClaim: daysSinceLastClaim,
                    lastClaimDate: entry.last_claim_date,
                    totalClaimedProfit: parseFloat(entry.total_claimed_profit) || 0,
                    daysElapsed: daysElapsed,
                    monthsCompleted: monthsCompleted
                });
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

        // Convert to plain object for response
        const userObj = user.toJSON();

        res.status(200).json({
            user: {
                ...userObj,
                // Map snake_case to camelCase for backward compatibility
                fullName: userObj.full_name,
                phoneNumber: userObj.phone_number,
                profilePictureUrl: userObj.profile_picture_url,
                isActive: userObj.is_active,
                apexCoins: parseFloat(userObj.apex_coins),
                accountBalance: parseFloat(userObj.account_balance),
                p2pWallet: parseFloat(userObj.p2p_wallet),
                lockedApexCoins: parseFloat(userObj.locked_apex_coins),
                lockStartDate: userObj.lock_start_date,
                lockEndDate: userObj.lock_end_date,
                lastLockDate: userObj.last_lock_date,
                totalRoiEarned: parseFloat(userObj.total_roi_earned),
                totalBonusEarned: parseFloat(userObj.total_bonus_earned),
                totalProfitShareEarned: parseFloat(userObj.total_profit_share_earned),
                isVerified: userObj.is_verified,
                referralCode: userObj.referral_code,
                referredBy: userObj.referred_by,
                referralChain: user.getReferralChainArray(),
                currentRoiRate: currentRoiRate,
                roiData,
                lockedCoinsEntries: lockedEntriesData
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

// Update user (fullName, phoneNumber, profilePicture)
const updateUser = async (req, res) => {
    try {
        const { fullName, phoneNumber } = req.body;
        const userId = req.params.id;

        const updateData = {};
        if (fullName) updateData.full_name = fullName;
        if (phoneNumber) updateData.phone_number = phoneNumber;

        // Handle profile picture upload if file is present
        if (req.file) {
            try {
                const uploadResult = await uploadToCloudinary(req.file.buffer);
                updateData.profile_picture_url = uploadResult.secure_url;
            } catch (err) {
                return res.status(500).json({ message: 'Profile image upload failed', error: err.message });
            }
        }

        const [updatedCount] = await User.update(updateData, {
            where: { id: userId }
        });

        if (updatedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password', 'otp', 'otp_expiry'] }
        });

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
        const deletedCount = await User.destroy({
            where: { id: req.params.id }
        });

        if (deletedCount === 0) {
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
        
        const user = await User.scope('withPassword').findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Update password (will be hashed by hook)
        user.password = newPassword;
        await user.save();

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
};

// Get referral levels up to 12 for the authenticated user
const getReferralLevels = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'User not authenticated' });

        const MAX_LEVELS = 12;
        const levels = {};
        let totalCount = 0;
        let totalActive = 0;
        let totalInactive = 0;

        // Calculate how many earning levels are unlocked
        const activeDirectReferralsCount = await countActiveDirectReferrals(userId);
        const unlockedEarningLevels = Math.min(activeDirectReferralsCount, 12);

        // Start with direct referrals (level 1)
        let prevLevelIds = [userId];

        for (let level = 1; level <= MAX_LEVELS; level++) {
            // Find users whose referred_by is in prevLevelIds
            const users = await User.findAll({
                where: { referred_by: { [Op.in]: prevLevelIds } },
                attributes: { exclude: ['password', 'otp', 'otp_expiry'] },
                raw: true
            });

            // Map concise data with active status
            const mapped = users.map(u => {
                const lockedCoins = parseFloat(u.locked_apex_coins) || 0;
                const isActive = lockedCoins > 0;
                return {
                    id: u.id,
                    fullName: u.full_name,
                    email: u.email,
                    isActive: isActive,
                    lockedApexCoins: lockedCoins,
                    createdAt: u.created_at
                };
            });

            // Count active and inactive users at this level
            const activeUsers = mapped.filter(u => u.isActive);
            const inactiveUsers = mapped.filter(u => !u.isActive);

            // Check if this earning level is unlocked
            const isEarningLevelUnlocked = level <= unlockedEarningLevels;

            // Calculate total locked amount at this level
            const totalLockedAtLevel = mapped.reduce((sum, u) => sum + u.lockedApexCoins, 0);

            levels[`level${level}`] = {
                level: level,
                levelName: level === 1 ? 'Direct Referrals' : level === 2 ? 'Indirect Network' : 'Deep Network',
                isUnlocked: isEarningLevelUnlocked,
                unlockStatus: isEarningLevelUnlocked ? 'UNLOCKED' : 'LOCKED',
                requiredActiveDirectReferrals: level,
                currentActiveDirectReferrals: activeDirectReferralsCount,
                canEarnFromThisLevel: isEarningLevelUnlocked,
                commission: {
                    bonusPercentage: level <= 6 ? `${BONUS_PERCENTAGES[level]}%` : 'N/A',
                    profitSharePercentage: `${PROFIT_SHARE_PERCENTAGES[level]}%`
                },
                members: {
                    total: mapped.length,
                    active: activeUsers.length,
                    inactive: inactiveUsers.length,
                    totalLockedCoins: totalLockedAtLevel
                },
                users: mapped,
                statusMessage: isEarningLevelUnlocked
                    ? `✓ You can earn ${level <= 6 ? BONUS_PERCENTAGES[level] + '% bonus + ' : ''}${PROFIT_SHARE_PERCENTAGES[level]}% profit share from this level`
                    : `✗ Locked - Refer ${level - activeDirectReferralsCount} more active member${level - activeDirectReferralsCount > 1 ? 's' : ''} to unlock`
            };

            totalCount += mapped.length;
            totalActive += activeUsers.length;
            totalInactive += inactiveUsers.length;

            // Prepare for next level
            if (users.length === 0) break;
            prevLevelIds = users.map(u => u.id);
        }

        return res.status(200).json({
            message: 'Referral levels retrieved successfully',
            data: {
                userInfo: {
                    activeDirectReferrals: activeDirectReferralsCount,
                    totalTeamMembers: totalCount,
                    totalActiveMembers: totalActive,
                    totalInactiveMembers: totalInactive
                },
                earningStatus: {
                    unlockedLevels: unlockedEarningLevels,
                    maxLevels: 12,
                    unlockedLevelsText: `${unlockedEarningLevels}/12 Unlocked`,
                    nextUnlockRequirement: unlockedEarningLevels < 12
                        ? `Refer ${unlockedEarningLevels + 1 - activeDirectReferralsCount} more active member(s) to unlock Level ${unlockedEarningLevels + 1}`
                        : 'All levels unlocked!',
                    description: `With ${activeDirectReferralsCount} active direct referrals, you can earn commissions from ${unlockedEarningLevels} network levels.`
                },
                levels: levels
            }
        });
    } catch (error) {
        console.error('Error fetching referral levels:', error);
        return res.status(500).json({ message: 'Error fetching referral levels', error: error.message });
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
        const user = await User.scope('withOtp').findOne({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.is_verified) {
            return res.status(400).json({ message: 'User is already verified' });
        }

        // Check if OTP exists
        if (!user.otp) {
            return res.status(400).json({ message: 'No OTP found. Please request a new OTP.' });
        }

        // Check if OTP has expired
        if (user.otp_expiry < new Date()) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new OTP.' });
        }

        // Verify OTP
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Mark user as verified and clear OTP
        await user.update({
            is_verified: true,
            otp: null,
            otp_expiry: null
        });

        res.status(200).json({
            message: 'Email verified successfully',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    isVerified: true
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

        const user = await User.findOne({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.is_verified) {
            return res.status(400).json({ message: 'User is already verified' });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user with new OTP
        await user.update({ otp, otp_expiry: otpExpiry });

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, user.full_name);
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
    const transaction = await sequelize.transaction();
    
    try {
        const { apexCoinsAmount } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validate apexCoinsAmount
        if (!apexCoinsAmount) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Apex amount is required' });
        }

        const coinsAmount = parseFloat(apexCoinsAmount);
        if (isNaN(coinsAmount) || coinsAmount <= 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Apex amount must be a valid positive number' });
        }

        // Get current apex coin rate
        const currentRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!currentRate) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Apex coin rate not set. Please contact admin.' });
        }

        // Calculate dollar amount needed (apexCoins * rate = dollars)
        const dollarAmount = coinsAmount * parseFloat(currentRate.rate);

        // Find user with lock for update
        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has sufficient accountBalance
        const currentBalance = parseFloat(user.account_balance) || 0;
        if (currentBalance < dollarAmount) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Insufficient account balance',
                currentBalance: currentBalance,
                requiredAmount: dollarAmount,
                apexCoinsRequested: coinsAmount,
                currentRate: parseFloat(currentRate.rate)
            });
        }

        // Deduct from accountBalance and add to apexCoins
        const newBalance = currentBalance - dollarAmount;
        const newApexCoins = (parseFloat(user.apex_coins) || 0) + coinsAmount;

        await user.update({
            account_balance: newBalance,
            apex_coins: newApexCoins
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'Apex purchased successfully',
            data: {
                apexCoinsPurchased: coinsAmount,
                dollarsPaid: dollarAmount,
                rate: parseFloat(currentRate.rate),
                newAccountBalance: newBalance,
                newApexCoins: newApexCoins
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error purchasing Apex:', error);
        res.status(500).json({ message: 'Error purchasing Apex', error: error.message });
    }
};

// Lock ApexCoins for 14 months to earn ROI
const lockApexCoins = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { amount } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validate amount
        if (!amount) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Amount is required' });
        }

        const lockAmount = parseFloat(amount);
        if (isNaN(lockAmount) || lockAmount <= 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Amount must be a valid positive number' });
        }
        // Enforce minimum lock amount restriction
        if (lockAmount < 50) {
            await transaction.rollback();
            return res.status(400).json({ message: 'The minimum tokens that you can stake is 50' });
        }

        // Find user with lock for update
        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user can lock coins again (must wait 24 hours from last lock)
        if (user.last_lock_date) {
            const now = new Date();
            const lastLock = new Date(user.last_lock_date);
            const hoursSinceLastLock = (now - lastLock) / (1000 * 60 * 60);

            if (hoursSinceLastLock < 24) {
                await transaction.rollback();
                const hoursRemaining = Math.ceil(24 - hoursSinceLastLock);
                const minutesRemaining = Math.ceil((24 - hoursSinceLastLock) * 60);

                return res.status(400).json({
                    message: `You can stake Apex again in ${hoursRemaining} hour(s)`,
                    hoursRemaining: hoursRemaining,
                    minutesRemaining: minutesRemaining,
                    lastLockDate: user.last_lock_date,
                    nextLockAvailable: new Date(lastLock.getTime() + (24 * 60 * 60 * 1000))
                });
            }
        }

        // Check if user has sufficient apexCoins
        const currentCoins = parseFloat(user.apex_coins) || 0;
        if (currentCoins < lockAmount) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Insufficient Apex',
                currentApexCoins: currentCoins,
                requestedAmount: lockAmount
            });
        }

        // Get current ROI rate to show to user
        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!currentRoi) {
            await transaction.rollback();
            return res.status(400).json({ message: 'ROI rate not set yet.' });
        }

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!coinRate) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Apex rate not set yet.' });
        }

        // Lock the coins - create a new entry
        const lockStartDate = new Date();
        const lockEndDate = new Date();
        lockEndDate.setMonth(lockEndDate.getMonth() + 14); // 14 months from now

        // Create new lock entry
        const newLockEntry = await LockedCoinsEntry.create({
            user_id: userId,
            amount: lockAmount,
            lock_start_date: lockStartDate,
            lock_end_date: lockEndDate,
            status: 'active',
            roi_rate_at_lock: parseFloat(currentRoi.rate)
        }, { transaction });

        // Update user
        const newApexCoins = currentCoins - lockAmount;
        const newLockedApexCoins = (parseFloat(user.locked_apex_coins) || 0) + lockAmount;

        await user.update({
            apex_coins: newApexCoins,
            locked_apex_coins: newLockedApexCoins,
            lock_start_date: lockStartDate,
            lock_end_date: lockEndDate,
            last_lock_date: lockStartDate
        }, { transaction });

        await transaction.commit();

        // Distribute one-time bonus to upline (6 levels) - outside transaction
        const bonusResult = await distributeStakingBonus(userId, lockAmount, newLockEntry.id);
        console.log('Bonus distribution result:', bonusResult);

        // Calculate monthly profit in apex coins then convert to dollars
        const monthlyProfitInCoins = (lockAmount * parseFloat(currentRoi.rate)) / 100;
        const monthlyProfitInDollars = monthlyProfitInCoins * parseFloat(coinRate.rate);

        // Count total entries
        const totalEntries = await LockedCoinsEntry.count({
            where: { user_id: userId }
        });

        res.status(200).json({
            message: 'Apex staked successfully',
            data: {
                lockedAmount: lockAmount,
                lockStartDate: lockStartDate,
                lockEndDate: lockEndDate,
                monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
                estimatedTotalProfit: parseFloat((monthlyProfitInDollars * 14).toFixed(2)),
                remainingApexCoins: newApexCoins,
                apexCoinToDollarRate: parseFloat(coinRate.rate),
                totalLockedEntries: totalEntries,
                bonusDistribution: bonusResult
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error staking Apex:', error);
        res.status(500).json({ message: 'Error staking Apex', error: error.message });
    }
};

// Request to unlock a specific locked ApexCoins entry
const requestUnlockApexCoins = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { entryId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!entryId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Entry ID is required' });
        }

        // Find the specific locked entry
        const entry = await LockedCoinsEntry.findOne({
            where: { id: entryId, user_id: userId },
            transaction,
            lock: true
        });

        if (!entry) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Locked entry not found' });
        }

        // Check if entry is active
        if (entry.status !== 'active') {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot unlock. Entry status is: ${entry.status}`,
                currentStatus: entry.status
            });
        }

        // Calculate days elapsed since lock start
        const now = new Date();
        const lockStart = new Date(entry.lock_start_date);
        const millisecondsPerDay = 1000 * 60 * 60 * 24;
        const daysElapsed = Math.floor((now - lockStart) / millisecondsPerDay);

        // Check if 60 days have passed
        if (daysElapsed < 60) {
            await transaction.rollback();
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
        const entryAmount = parseFloat(entry.amount);
        const penaltyAmount = (entryAmount * penaltyPercentage) / 100;
        const amountAfterPenalty = entryAmount - penaltyAmount;

        // Set processing period (7 days from now)
        const processAfter = new Date();
        processAfter.setDate(processAfter.getDate() + 7);

        // Update the entry with unlock request details
        await entry.update({
            status: 'unlock-pending',
            unlock_requested_at: now,
            unlock_process_after: processAfter,
            penalty_percentage: penaltyPercentage,
            penalty_amount: penaltyAmount,
            amount_after_penalty: amountAfterPenalty,
            days_elapsed_at_request: daysElapsed
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'Unlock request submitted successfully. Admin will process within 7 days.',
            data: {
                entryId: entry.id,
                originalAmount: entryAmount,
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
        await transaction.rollback();
        console.error('Error requesting unlock:', error);
        res.status(500).json({ message: 'Error requesting unlock', error: error.message });
    }
};

// Admin: Approve unlock request and migrate coins
const approveUnlockRequest = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { userId, entryId } = req.body;
        const adminId = req.user?.id;

        if (!adminId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'Admin not authenticated' });
        }

        if (!userId || !entryId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'User ID and Entry ID are required' });
        }

        // Find the user
        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Find the specific locked entry
        const entry = await LockedCoinsEntry.findOne({
            where: { id: entryId, user_id: userId },
            transaction,
            lock: true
        });

        if (!entry) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Locked entry not found' });
        }

        // Check if entry is pending unlock
        if (entry.status !== 'unlock-pending') {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot approve. Entry status is: ${entry.status}`,
                currentStatus: entry.status
            });
        }

        // Check if 7-day processing period has passed
        const now = new Date();
        const processAfter = new Date(entry.unlock_process_after);

        if (now < processAfter) {
            await transaction.rollback();
            const hoursRemaining = Math.ceil((processAfter - now) / (1000 * 60 * 60));
            return res.status(400).json({
                message: `Processing period not completed. ${hoursRemaining} hours remaining.`,
                processAfter: processAfter,
                hoursRemaining: hoursRemaining
            });
        }

        // Get the amount after penalty
        const amountAfterPenalty = parseFloat(entry.amount_after_penalty);
        const originalAmount = parseFloat(entry.amount);
        const penaltyAmount = parseFloat(entry.penalty_amount);

        // Update entry status to unlocked
        await entry.update({
            status: 'unlocked',
            unlock_approved_at: now,
            unlock_approved_by: adminId
        }, { transaction });

        // Migrate coins to user's apexCoins (after penalty deduction)
        const newApexCoins = (parseFloat(user.apex_coins) || 0) + amountAfterPenalty;
        const newLockedApexCoins = Math.max(0, (parseFloat(user.locked_apex_coins) || 0) - originalAmount);

        await user.update({
            apex_coins: newApexCoins,
            locked_apex_coins: newLockedApexCoins
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'Unlock request approved successfully. Apex migrated to user account.',
            data: {
                entryId: entry.id,
                originalAmount: originalAmount,
                penaltyPercentage: parseFloat(entry.penalty_percentage),
                penaltyDeducted: penaltyAmount,
                amountCredited: amountAfterPenalty,
                newApexCoinsBalance: newApexCoins,
                approvedAt: now,
                approvedBy: adminId
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error approving unstake:', error);
        res.status(500).json({ message: 'Error approving unstake request', error: error.message });
    }
};

// Admin: Get all pending unlock requests
const getPendingUnlockRequests = async (req, res) => {
    try {
        // Find all pending unlock entries with user info
        const pendingEntries = await LockedCoinsEntry.findAll({
            where: { status: 'unlock-pending' },
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'full_name', 'email', 'phone_number']
            }],
            order: [['unlock_requested_at', 'ASC']]
        });

        // Format pending requests
        const pendingRequests = pendingEntries.map(entry => {
            const now = new Date();
            const processAfter = new Date(entry.unlock_process_after);
            const canApprove = now >= processAfter;

            return {
                userId: entry.user.id,
                userName: entry.user.full_name,
                userEmail: entry.user.email,
                entryId: entry.id,
                originalAmount: parseFloat(entry.amount),
                lockStartDate: entry.lock_start_date,
                daysElapsedAtRequest: entry.days_elapsed_at_request,
                penaltyPercentage: parseFloat(entry.penalty_percentage),
                penaltyAmount: parseFloat(entry.penalty_amount),
                amountAfterPenalty: parseFloat(entry.amount_after_penalty),
                requestedAt: entry.unlock_requested_at,
                processAfter: entry.unlock_process_after,
                canApprove: canApprove
            };
        });

        res.status(200).json({
            message: 'Pending unstake requests retrieved successfully',
            count: pendingRequests.length,
            data: pendingRequests
        });
    } catch (error) {
        console.error('Error fetching pending unstake requests:', error);
        res.status(500).json({ message: 'Error fetching pending unstake requests', error: error.message });
    }
};

// Claim accumulated daily profits from all active locked entries
const claimDailyProfits = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Find user with lock
        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Get active locked entries
        const activeEntries = await LockedCoinsEntry.findAll({
            where: { user_id: userId, status: 'active' },
            transaction,
            lock: true
        });

        if (activeEntries.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'No active staked entries found',
                claimableAmount: 0
            });
        }

        // Get current ApexCoin to dollar rate
        const coinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!coinRate) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Apex rate not set yet.' });
        }

        // Get current ROI rate set by admin
        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!currentRoi) {
            await transaction.rollback();
            return res.status(400).json({ message: 'ROI rate not set by admin.' });
        }

        const apexCoinToDollarRate = parseFloat(coinRate.rate);
        const currentRoiRate = parseFloat(currentRoi.rate);
        const now = new Date();
        const millisecondsPerDay = 1000 * 60 * 60 * 24;

        let totalClaimableAmount = 0;
        const claimDetails = [];

        // Calculate claimable profit for each active entry
        for (const entry of activeEntries) {
            const lockStart = new Date(entry.lock_start_date);
            const lastClaim = entry.last_claim_date ? new Date(entry.last_claim_date) : lockStart;

            // Calculate days since last claim (or since lock start if never claimed)
            const daysSinceLastClaim = Math.max(0, Math.floor((now - lastClaim) / millisecondsPerDay));

            if (daysSinceLastClaim > 0) {
                const entryAmount = parseFloat(entry.amount);
                // Use current ROI rate for calculations
                const monthlyProfitInCoins = (entryAmount * currentRoiRate) / 100;
                const dailyProfitInCoins = monthlyProfitInCoins / 30;

                // Calculate claimable profit in coins for this entry
                const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;

                totalClaimableAmount += claimableProfitInDollars;

                // Update entry
                const newTotalClaimed = (parseFloat(entry.total_claimed_profit) || 0) + claimableProfitInDollars;
                await entry.update({
                    unclaimed_profit: 0,
                    last_claim_date: now,
                    total_claimed_profit: newTotalClaimed
                }, { transaction });

                claimDetails.push({
                    entryId: entry.id,
                    amount: entryAmount,
                    daysSinceLastClaim: daysSinceLastClaim,
                    claimedAmount: parseFloat(claimableProfitInDollars.toFixed(2)),
                    dailyRate: parseFloat((dailyProfitInCoins * apexCoinToDollarRate).toFixed(2))
                });
            }
        }

        if (totalClaimableAmount === 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'No profits available to claim yet. Please wait at least one day since your last claim.',
                claimableAmount: 0
            });
        }

        // Transfer profits to accountBalance
        const newAccountBalance = (parseFloat(user.account_balance) || 0) + totalClaimableAmount;
        const newTotalRoiEarned = (parseFloat(user.total_roi_earned) || 0) + totalClaimableAmount;

        await user.update({
            account_balance: newAccountBalance,
            total_roi_earned: newTotalRoiEarned
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'Daily profits claimed successfully',
            data: {
                totalClaimedAmount: parseFloat(totalClaimableAmount.toFixed(2)),
                newAccountBalance: parseFloat(newAccountBalance.toFixed(2)),
                totalRoiEarned: parseFloat(newTotalRoiEarned.toFixed(2)),
                claimDetails: claimDetails,
                claimedAt: now
            }
        });
    } catch (error) {
        await transaction.rollback();
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
    claimDailyProfits,
    getReferralLevels
};
