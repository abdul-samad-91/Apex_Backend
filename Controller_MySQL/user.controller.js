const { User, LockedCoinsEntry, Roi, ApexCoinRate, UserReferral, UserReferralChain, sequelize } = require('../Models_MySQL');
const bcrypt = require('bcrypt');
const { generateToken } = require("../utils/generateToken");
const { generateOTP, sendOTPEmail } = require('../utils/sendEmail');
const generateReferralCode = require('../utils/generateReferalCode');
const { distributeStakingBonus, distributeProfitShare } = require('./referralBonus.controller');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const { Op } = require('sequelize');

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
      where: { email: email.toLowerCase() }
    });
    
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with provided email",
      });
    }

    // Check if this is the first user (root user)
    const userCount = await User.count();
    const isRootUser = userCount === 0;

    // If not the first user, referral code is mandatory
    if (!isRootUser && !referralCode) {
      return res.status(400).json({ 
        message: "Referral code is required. Please use a valid referral code to register.",
        isRootUser: false
      });
    }

    if (referralCode) {
      referredByUser = await User.findOne({ where: { referralCode } });
      if (!referredByUser) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
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
      const existingCode = await User.findOne({ where: { referralCode: uniqueReferralCode } });
      if (!existingCode) {
        isUnique = true;
      }
    }

    // Create new user
    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      password, // Will be hashed by hook
      profilePictureUrl,
      role: role || 'user',
      isVerified: isVerified || false,
      referralCode: uniqueReferralCode,
      referredById: referredByUser ? referredByUser.id : null,
      otp,
      otpExpiry
    }, { transaction });

    // Handle referral relationships
    if (referredByUser) {
      // Add to UserReferral junction table (direct referral)
      await UserReferral.create({
        userId: referredByUser.id,
        referralId: user.id
      }, { transaction });

      // Build the referral chain
      // Get the referrer's chain first
      const referrerChain = await UserReferralChain.findAll({
        where: { userId: referredByUser.id },
        order: [['level', 'ASC']],
        transaction
      });

      // Add direct referrer at level 1
      await UserReferralChain.create({
        userId: user.id,
        ancestorId: referredByUser.id,
        level: 1
      }, { transaction });

      // Add all ancestors from referrer's chain (incrementing their level)
      for (const chainEntry of referrerChain) {
        await UserReferralChain.create({
          userId: user.id,
          ancestorId: chainEntry.ancestorId,
          level: chainEntry.level + 1
        }, { transaction });
      }
    }

    await transaction.commit();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, fullName);
    if (!emailResult.success) {
      console.error('Failed to send OTP email:', emailResult.error);
    }

    const token = generateToken(user.id, user.role);
    
    res.status(201).json({
      message: isRootUser 
        ? "Root user created successfully. You are the first user and the start of the referral tree!" 
        : "User created successfully. Please verify your email with the OTP sent.",
      data: {
        user: {
          id: user.id,
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
    await transaction.rollback();
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
    const users = await User.findAll({
      attributes: { exclude: ['password', 'otp', 'otpExpiry'] }
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
      attributes: { exclude: ['password', 'otp', 'otpExpiry'] }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get locked coins entries for this user
    const lockedCoinsEntries = await LockedCoinsEntry.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']]
    });

    // Calculate ROI profits for each locked coins entry
    let lockedEntriesData = [];
    let totalLockedAmount = 0;

    // Get current ROI rate
    const currentRoi = await Roi.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    const currentRoiRate = currentRoi ? parseFloat(currentRoi.rate) : 0;

    // Get current ApexCoin to dollar rate
    const coinRate = await ApexCoinRate.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    const apexCoinToDollarRate = coinRate ? parseFloat(coinRate.rate) : 1;

    if (lockedCoinsEntries && lockedCoinsEntries.length > 0) {
      const now = new Date();
      const millisecondsPerDay = 1000 * 60 * 60 * 24;

      lockedCoinsEntries.forEach((entry) => {
        if (entry.status === 'active') {
          const amount = parseFloat(entry.amount);
          totalLockedAmount += amount;

          // Calculate days elapsed since this entry's lock start
          const lockStart = new Date(entry.lockStartDate);
          const daysElapsed = Math.max(0, Math.floor((now - lockStart) / millisecondsPerDay));

          // Calculate months completed
          const monthsDiff = (now.getFullYear() - lockStart.getFullYear()) * 12 + 
                           (now.getMonth() - lockStart.getMonth());
          const monthsCompleted = Math.max(0, monthsDiff);

          const entryRoiRate = currentRoiRate;

          // Calculate monthly profit: (lockedCoins * ROI%) / 100
          const monthlyProfitInCoins = (amount * entryRoiRate) / 100;
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
            entryId: entry.id,
            amount: amount,
            lockStartDate: entry.lockStartDate,
            lockEndDate: entry.lockEndDate,
            status: entry.status,
            roiRateAtLock: parseFloat(entry.roiRateAtLock || 0),
            currentRoiRate: entryRoiRate,
            monthlyProfit: parseFloat(monthlyProfitInDollars.toFixed(2)),
            dailyProfit: parseFloat(dailyProfitInDollars.toFixed(2)),
            totalProfit: parseFloat(totalProfitInDollars.toFixed(2)),
            claimableProfit: parseFloat(claimableProfitInDollars.toFixed(2)),
            daysSinceLastClaim: daysSinceLastClaim,
            lastClaimDate: entry.lastClaimDate,
            totalClaimedProfit: parseFloat(entry.totalClaimedProfit || 0),
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
        ...user.toJSON(),
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
    if (name) updateData.fullName = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await User.update(updateData, {
      where: { id: req.params.id }
    });

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'otp', 'otpExpiry'] }
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
    const deleted = await User.destroy({ where: { id: req.params.id } });

    if (!deleted) {
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

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword }, { hooks: false });

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
    const user = await User.findOne({ 
      where: { email: email.toLowerCase() },
      attributes: { include: ['otp', 'otpExpiry'] }
    });

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
    await user.update({
      isVerified: true,
      otp: null,
      otpExpiry: null
    });

    res.status(200).json({
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
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

    const user = await User.findOne({ where: { email: email.toLowerCase() } });

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
    await user.update({ otp, otpExpiry });

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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!apexCoinsAmount) {
      return res.status(400).json({ message: 'ApexCoins amount is required' });
    }

    const coinsAmount = parseFloat(apexCoinsAmount);
    if (isNaN(coinsAmount) || coinsAmount <= 0) {
      return res.status(400).json({ message: 'ApexCoins amount must be a valid positive number' });
    }

    // Get current apex coin rate
    const currentRate = await ApexCoinRate.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    
    if (!currentRate) {
      return res.status(400).json({ message: 'Apex coin rate not set. Please contact admin.' });
    }

    // Calculate dollar amount needed
    const dollarAmount = coinsAmount * parseFloat(currentRate.rate);

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has sufficient accountBalance
    const currentBalance = parseFloat(user.accountBalance || 0);
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
    await user.update({
      accountBalance: currentBalance - dollarAmount,
      apexCoins: parseFloat(user.apexCoins || 0) + coinsAmount
    });

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
  const transaction = await sequelize.transaction();
  
  try {
    const { amount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    const lockAmount = parseFloat(amount);
    if (isNaN(lockAmount) || lockAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a valid positive number' });
    }

    if (lockAmount < 50) {
      return res.status(400).json({ message: 'The minimum coins that you can stack is 50' });
    }

    // Find user
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user can lock coins again (must wait 24 hours from last lock)
    if (user.lastLockDate) {
      const now = new Date();
      const lastLock = new Date(user.lastLockDate);
      const hoursSinceLastLock = (now - lastLock) / (1000 * 60 * 60);
      
      if (hoursSinceLastLock < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastLock);
        const minutesRemaining = Math.ceil((24 - hoursSinceLastLock) * 60);
        
        await transaction.rollback();
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
    const currentCoins = parseFloat(user.apexCoins || 0);
    if (currentCoins < lockAmount) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Insufficient apex coins',
        currentApexCoins: currentCoins,
        requestedAmount: lockAmount
      });
    }

    // Get current ROI rate
    const currentRoi = await Roi.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']],
      transaction
    });
    
    if (!currentRoi) {
      await transaction.rollback();
      return res.status(400).json({ message: 'ROI rate not set yet.' });
    }

    // Get current ApexCoin to dollar rate
    const coinRate = await ApexCoinRate.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']],
      transaction
    });
    
    if (!coinRate) {
      await transaction.rollback();
      return res.status(400).json({ message: 'ApexCoin rate not set yet.' });
    }

    // Lock the coins - create a new entry
    const lockStartDate = new Date();
    const lockEndDate = new Date();
    lockEndDate.setMonth(lockEndDate.getMonth() + 14);

    // Create new locked coins entry
    const newLockEntry = await LockedCoinsEntry.create({
      userId: user.id,
      amount: lockAmount,
      lockStartDate: lockStartDate,
      lockEndDate: lockEndDate,
      status: 'active',
      roiRateAtLock: currentRoi.rate,
      entryCreatedAt: new Date()
    }, { transaction });

    // Update user
    await user.update({
      apexCoins: currentCoins - lockAmount,
      lockedApexCoins: parseFloat(user.lockedApexCoins || 0) + lockAmount,
      lockStartDate: lockStartDate,
      lockEndDate: lockEndDate,
      lastLockDate: lockStartDate
    }, { transaction });

    await transaction.commit();

    // Distribute one-time bonus to upline (6 levels)
    const bonusResult = await distributeStakingBonus(userId, lockAmount, newLockEntry.id);
    console.log('Bonus distribution result:', bonusResult);

    // Calculate monthly profit
    const monthlyProfitInCoins = (lockAmount * parseFloat(currentRoi.rate)) / 100;
    const monthlyProfitInDollars = monthlyProfitInCoins * parseFloat(coinRate.rate);

    // Get total locked entries count
    const totalLockedEntries = await LockedCoinsEntry.count({ where: { userId: user.id } });

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
        totalLockedEntries: totalLockedEntries,
        bonusDistribution: bonusResult
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error locking ApexCoins:', error);
    res.status(500).json({ message: 'Error locking ApexCoins', error: error.message });
  }
};

// Request to unlock a specific locked ApexCoins entry
const requestUnlockApexCoins = async (req, res) => {
  try {
    const { entryId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!entryId) {
      return res.status(400).json({ message: 'Entry ID is required' });
    }

    // Find the specific locked entry
    const entry = await LockedCoinsEntry.findOne({
      where: { id: entryId, userId: userId }
    });

    if (!entry) {
      return res.status(404).json({ message: 'Locked entry not found' });
    }

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
      unlockRequestedAt: now,
      unlockProcessAfter: processAfter,
      penaltyPercentage: penaltyPercentage,
      penaltyAmount: penaltyAmount,
      amountAfterPenalty: amountAfterPenalty,
      daysElapsedAtRequest: daysElapsed
    });

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
      return res.status(401).json({ message: 'Admin not authenticated' });
    }

    if (!userId || !entryId) {
      return res.status(400).json({ message: 'User ID and Entry ID are required' });
    }

    // Find the user
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the specific locked entry
    const entry = await LockedCoinsEntry.findOne({
      where: { id: entryId, userId: userId },
      transaction
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
    const processAfter = new Date(entry.unlockProcessAfter);
    
    if (now < processAfter) {
      const hoursRemaining = Math.ceil((processAfter - now) / (1000 * 60 * 60));
      await transaction.rollback();
      return res.status(400).json({ 
        message: `Processing period not completed. ${hoursRemaining} hours remaining.`,
        processAfter: processAfter,
        hoursRemaining: hoursRemaining
      });
    }

    // Get the amount after penalty
    const amountAfterPenalty = parseFloat(entry.amountAfterPenalty);
    const originalAmount = parseFloat(entry.amount);
    const penaltyAmount = parseFloat(entry.penaltyAmount);

    // Update entry status to unlocked
    await entry.update({
      status: 'unlocked',
      unlockApprovedAt: now,
      unlockApprovedById: adminId
    }, { transaction });

    // Migrate coins to user's apexCoins (after penalty deduction)
    await user.update({
      apexCoins: parseFloat(user.apexCoins || 0) + amountAfterPenalty,
      lockedApexCoins: Math.max(0, parseFloat(user.lockedApexCoins || 0) - originalAmount)
    }, { transaction });

    await transaction.commit();

    res.status(200).json({
      message: 'Unlock request approved successfully. Coins migrated to user account.',
      data: {
        entryId: entry.id,
        originalAmount: originalAmount,
        penaltyPercentage: entry.penaltyPercentage,
        penaltyDeducted: penaltyAmount,
        amountCredited: amountAfterPenalty,
        newApexCoinsBalance: user.apexCoins,
        approvedAt: now,
        approvedBy: adminId
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving unlock:', error);
    res.status(500).json({ message: 'Error approving unlock', error: error.message });
  }
};

// Admin: Get all pending unlock requests
const getPendingUnlockRequests = async (req, res) => {
  try {
    // Find all locked entries with pending unlock status
    const pendingEntries = await LockedCoinsEntry.findAll({
      where: { status: 'unlock-pending' },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'fullName', 'email', 'phoneNumber']
      }]
    });

    const now = new Date();
    
    const pendingRequests = pendingEntries.map(entry => {
      const processAfter = new Date(entry.unlockProcessAfter);
      const canApprove = now >= processAfter;

      return {
        userId: entry.user.id,
        userName: entry.user.fullName,
        userEmail: entry.user.email,
        entryId: entry.id,
        originalAmount: parseFloat(entry.amount),
        lockStartDate: entry.lockStartDate,
        daysElapsedAtRequest: entry.daysElapsedAtRequest,
        penaltyPercentage: parseFloat(entry.penaltyPercentage),
        penaltyAmount: parseFloat(entry.penaltyAmount),
        amountAfterPenalty: parseFloat(entry.amountAfterPenalty),
        requestedAt: entry.unlockRequestedAt,
        processAfter: entry.unlockProcessAfter,
        canApprove: canApprove
      };
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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get active locked entries
    const activeEntries = await LockedCoinsEntry.findAll({
      where: { userId: userId, status: 'active' }
    });

    if (activeEntries.length === 0) {
      return res.status(400).json({ 
        message: 'No active locked entries found',
        claimableAmount: 0
      });
    }

    // Get current ApexCoin to dollar rate
    const coinRate = await ApexCoinRate.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    
    if (!coinRate) {
      return res.status(400).json({ message: 'ApexCoin rate not set yet.' });
    }

    // Get current ROI rate
    const currentRoi = await Roi.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    
    if (!currentRoi) {
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
      const lockStart = new Date(entry.lockStartDate);
      const lastClaim = entry.lastClaimDate ? new Date(entry.lastClaimDate) : lockStart;
      
      const daysSinceLastClaim = Math.max(0, Math.floor((now - lastClaim) / millisecondsPerDay));
      
      if (daysSinceLastClaim > 0) {
        const entryAmount = parseFloat(entry.amount);
        const monthlyProfitInCoins = (entryAmount * currentRoiRate) / 100;
        const dailyProfitInCoins = monthlyProfitInCoins / 30;
        
        const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
        const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;
        
        totalClaimableAmount += claimableProfitInDollars;
        
        // Update entry
        await entry.update({
          unclaimedProfit: 0,
          lastClaimDate: now,
          totalClaimedProfit: parseFloat(entry.totalClaimedProfit || 0) + claimableProfitInDollars
        });
        
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
      return res.status(400).json({ 
        message: 'No profits available to claim yet. Please wait at least one day since your last claim.',
        claimableAmount: 0
      });
    }

    // Transfer profits to accountBalance
    await user.update({
      accountBalance: parseFloat(user.accountBalance || 0) + totalClaimableAmount,
      totalRoiEarned: parseFloat(user.totalRoiEarned || 0) + totalClaimableAmount
    });

    // Distribute profit share to upline (12 levels)
    const profitShareResult = await distributeProfitShare(userId, totalClaimableAmount);
    console.log('Profit share distribution result:', profitShareResult);

    res.status(200).json({
      message: 'Daily profits claimed successfully',
      data: {
        totalClaimedAmount: parseFloat(totalClaimableAmount.toFixed(2)),
        newAccountBalance: parseFloat(user.accountBalance.toFixed(2)),
        totalRoiEarned: parseFloat(user.totalRoiEarned.toFixed(2)),
        claimDetails: claimDetails,
        claimedAt: now,
        profitShareDistribution: profitShareResult
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
