const User = require('../Models/user.model');
const BonusTransaction = require('../Models/bonusTransaction.model');
const ProfitShareTransaction = require('../Models/profitShareTransaction.model');

// Bonus percentages for each level (1-6)
const BONUS_PERCENTAGES = {
  1: 9,   // Level 1 (Direct) - 9%
  2: 4,   // Level 2 - 4%
  3: 3,   // Level 3 - 3%
  4: 2,   // Level 4 - 2%
  5: 1,   // Level 5 - 1%
  6: 1    // Level 6 - 1%
};

// Profit share percentages for each level (1-12)
const PROFIT_SHARE_PERCENTAGES = {
  1: 10,    // Level 1 - 10%
  2: 7,     // Level 2 - 7%
  3: 6,     // Level 3 - 6%
  4: 5,     // Level 4 - 5%
  5: 2,     // Level 5 - 2%
  6: 1,     // Level 6 - 1%
  7: 1,     // Level 7 - 1%
  8: 0.5,   // Level 8 - 0.5%
  9: 0.5,   // Level 9 - 0.5%
  10: 0.5,  // Level 10 - 0.5%
  11: 0.5,    // Level 11 - 0.5%
  12: 0.5    // Level 12 - 0.5%
};

/**
 * Build referral path from root user to end user
 * @param {ObjectId} rootUserId - The root user (e.g., logged-in user)
 * @param {ObjectId} endUserId - The end user (e.g., fromUserId)
 * @returns {Array} Array of user objects showing the path
 */
const buildReferralPath = async (rootUserId, endUserId) => {
  try {
    // If root and end are the same, return just that user
    if (rootUserId.toString() === endUserId.toString()) {
      const user = await User.findById(rootUserId).select('fullName email');
      return [{ 
        userId: user._id, 
        fullName: user.fullName, 
        email: user.email,
        level: 0 
      }];
    }

    const endUser = await User.findById(endUserId);
    if (!endUser) {
      return [];
    }

    // Build path from end user up to root user
    const path = [];
    let currentUser = endUser;
    let level = 0;

    // Add the end user first
    path.unshift({
      userId: currentUser._id,
      fullName: currentUser.fullName,
      email: currentUser.email,
      level: level
    });

    // Traverse up the referral chain until we reach the root user
    while (currentUser.referredBy && currentUser.referredBy.toString() !== rootUserId.toString()) {
      currentUser = await User.findById(currentUser.referredBy).select('fullName email referredBy');
      if (!currentUser) break;
      
      level++;
      path.unshift({
        userId: currentUser._id,
        fullName: currentUser.fullName,
        email: currentUser.email,
        level: level
      });
    }

    // Add the root user at the beginning if we successfully traced back
    if (currentUser && currentUser.referredBy && currentUser.referredBy.toString() === rootUserId.toString()) {
      const rootUser = await User.findById(rootUserId).select('fullName email');
      level++;
      path.unshift({
        userId: rootUser._id,
        fullName: rootUser.fullName,
        email: rootUser.email,
        level: level
      });
    }

    // Reverse levels so root is at highest level
    const maxLevel = level;
    return path.map(item => ({
      ...item,
      level: maxLevel - item.level
    }));

  } catch (error) {
    console.error('Error building referral path:', error);
    return [];
  }
};

/**
 * Count active DIRECT referrals for a user (only users directly referred, not downchain)
 * Active = has lockedApexCoins > 0
 */
const countActiveDirectReferrals = async (userId) => {
  try {
    // Count users where referredBy === userId AND lockedApexCoins > 0
    const activeDirectCount = await User.countDocuments({
      referredBy: userId,
      lockedApexCoins: { $gt: 0 }
    });
    
    return activeDirectCount;
  } catch (error) {
    console.error('Error counting active direct referrals:', error);
    return 0;
  }
};

/**
 * Distribute one-time bonus to upline when user stakes/locks coins
 * @param {ObjectId} stakingUserId - User who is staking
 * @param {Number} stakeAmount - Amount being staked
 * @param {ObjectId} stakeEntryId - The locked entry ID
 */
const distributeStakingBonus = async (stakingUserId, stakeAmount, stakeEntryId) => {
  try {
    const stakingUser = await User.findById(stakingUserId);
    if (!stakingUser || !stakingUser.referralChain || stakingUser.referralChain.length === 0) {
      console.log('No referral chain for bonus distribution');
      return { success: true, bonusesDistributed: 0, details: [] };
    }

    const bonusDetails = [];
    let bonusesDistributed = 0;

    // Traverse referral chain up to 6 levels
    const maxLevels = Math.min(6, stakingUser.referralChain.length);
    
    for (let level = 1; level <= maxLevels; level++) {
      const uplineUserId = stakingUser.referralChain[level - 1]; // 0-indexed array
      
      // Check if upline user exists
      const uplineUser = await User.findById(uplineUserId);
      if (!uplineUser) {
        console.log(`Upline user not found at level ${level}`);
        continue;
      }

      // Count active direct referrals for this upline
      const activeDirectReferrals = await countActiveDirectReferrals(uplineUserId);
      
      // Check if upline has enough active referrals to unlock this level
      // Each level requires that many active direct referrals
      if (activeDirectReferrals < level) {
        console.log(`Level ${level} not unlocked for user ${uplineUserId}. Active referrals: ${activeDirectReferrals}, Required: ${level}`);
        continue;
      }

      // Calculate bonus
      const bonusPercentage = BONUS_PERCENTAGES[level];
      const bonusAmount = (stakeAmount * bonusPercentage) / 100;

      // Record the bonus transaction (not automatically claimed)
      const bonusTransaction = new BonusTransaction({
        userId: uplineUserId,
        fromUserId: stakingUserId,
        stakeEntryId: stakeEntryId,
        investmentAmount: stakeAmount,
        bonusPercentage: bonusPercentage,
        bonusAmount: bonusAmount,
        level: level,
        activeDirectReferralsAtTime: activeDirectReferrals
      });
      await bonusTransaction.save();

      bonusDetails.push({
        uplineUserId: uplineUserId,
        level: level,
        bonusPercentage: bonusPercentage,
        bonusAmount: parseFloat(bonusAmount.toFixed(2)),
        activeDirectReferrals: activeDirectReferrals
      });

      bonusesDistributed++;
      console.log(`Bonus distributed: Level ${level}, User ${uplineUserId}, Amount ${bonusAmount}`);
    }

    return {
      success: true,
      bonusesDistributed: bonusesDistributed,
      details: bonusDetails
    };
  } catch (error) {
    console.error('Error distributing staking bonus:', error);
    return {
      success: false,
      error: error.message,
      bonusesDistributed: 0,
      details: []
    };
  }
};

/**
 * Distribute profit share to upline when user claims daily ROI
 * @param {ObjectId} claimingUserId - User who is claiming ROI
 * @param {Number} roiAmount - The ROI amount being claimed (in dollars)
 */
const distributeProfitShare = async (claimingUserId, roiAmount) => {
  try {
    const claimingUser = await User.findById(claimingUserId);
    if (!claimingUser || !claimingUser.referralChain || claimingUser.referralChain.length === 0) {
      console.log('No referral chain for profit share distribution');
      return { success: true, sharesDistributed: 0, details: [] };
    }

    const shareDetails = [];
    let sharesDistributed = 0;
    const claimDate = new Date();

    // Traverse referral chain up to 12 levels
    const maxLevels = Math.min(12, claimingUser.referralChain.length);
    
    for (let level = 1; level <= maxLevels; level++) {
      const uplineUserId = claimingUser.referralChain[level - 1]; // 0-indexed array
      
      // Check if upline user exists
      const uplineUser = await User.findById(uplineUserId);
      if (!uplineUser) {
        console.log(`Upline user not found at level ${level}`);
        continue;
      }

      // Count active direct referrals for this upline
      const activeDirectReferrals = await countActiveDirectReferrals(uplineUserId);
      
      // Check if upline has enough active referrals to unlock this level
      if (activeDirectReferrals < level) {
        console.log(`Level ${level} not unlocked for user ${uplineUserId}. Active referrals: ${activeDirectReferrals}, Required: ${level}`);
        continue;
      }

      // Calculate profit share
      const sharePercentage = PROFIT_SHARE_PERCENTAGES[level];
      const shareAmount = (roiAmount * sharePercentage) / 100;

      // Record the profit share transaction (not automatically claimed)
      const profitShareTransaction = new ProfitShareTransaction({
        userId: uplineUserId,
        fromUserId: claimingUserId,
        roiAmount: roiAmount,
        sharePercentage: sharePercentage,
        shareAmount: shareAmount,
        level: level,
        activeDirectReferralsAtTime: activeDirectReferrals,
        claimDate: claimDate
      });
      await profitShareTransaction.save();

      shareDetails.push({
        uplineUserId: uplineUserId,
        level: level,
        sharePercentage: sharePercentage,
        shareAmount: parseFloat(shareAmount.toFixed(2)),
        activeDirectReferrals: activeDirectReferrals
      });

      sharesDistributed++;
      console.log(`Profit share distributed: Level ${level}, User ${uplineUserId}, Amount ${shareAmount}`);
    }

    return {
      success: true,
      sharesDistributed: sharesDistributed,
      totalRoiShared: roiAmount,
      details: shareDetails
    };
  } catch (error) {
    console.error('Error distributing profit share:', error);
    return {
      success: false,
      error: error.message,
      sharesDistributed: 0,
      details: []
    };
  }
};

/**
 * Get user's bonus transaction history
 */
const getBonusHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bonuses = await BonusTransaction.find({ userId })
      .populate('fromUserId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Group bonuses by fromUserId and build referral path once per user
    const groupedByUser = {};
    const referralPaths = {};

    for (const bonus of bonuses) {
      const fromUserIdStr = bonus.fromUserId._id.toString();
      
      // If we haven't seen this user before, build their referral path
      if (!referralPaths[fromUserIdStr]) {
        referralPaths[fromUserIdStr] = await buildReferralPath(userId, bonus.fromUserId._id);
      }

      // Group transactions by user
      if (!groupedByUser[fromUserIdStr]) {
        groupedByUser[fromUserIdStr] = {
          fromUserId: bonus.fromUserId,
          referralPath: referralPaths[fromUserIdStr],
          transactions: []
        };
      }

      groupedByUser[fromUserIdStr].transactions.push({
        _id: bonus._id,
        stakeEntryId: bonus.stakeEntryId,
        investmentAmount: bonus.investmentAmount,
        bonusPercentage: bonus.bonusPercentage,
        bonusAmount: bonus.bonusAmount,
        level: bonus.level,
        activeDirectReferralsAtTime: bonus.activeDirectReferralsAtTime,
        isClaimed: bonus.isClaimed,
        claimedAt: bonus.claimedAt,
        createdAt: bonus.createdAt,
        updatedAt: bonus.updatedAt
      });
    }

    // Convert grouped object to array
    const bonusesGrouped = Object.values(groupedByUser);

    const totalCount = await BonusTransaction.countDocuments({ userId });

    // Get summary
    const user = await User.findById(userId);
    const totalBonusEarned = user?.totalBonusEarned || 0;

    // Get claimed vs unclaimed summary
    const claimedBonuses = await BonusTransaction.aggregate([
      { $match: { userId: userId, isClaimed: true } },
      { $group: { _id: null, total: { $sum: '$bonusAmount' }, count: { $sum: 1 } } }
    ]);
    
    const unclaimedBonuses = await BonusTransaction.aggregate([
      { $match: { userId: userId, isClaimed: false } },
      { $group: { _id: null, total: { $sum: '$bonusAmount' }, count: { $sum: 1 } } }
    ]);

    const claimedTotal = claimedBonuses[0]?.total || 0;
    const claimedCount = claimedBonuses[0]?.count || 0;
    const unclaimedTotal = unclaimedBonuses[0]?.total || 0;
    const unclaimedCount = unclaimedBonuses[0]?.count || 0;

    // Get level-wise breakdown
    const levelBreakdown = await BonusTransaction.aggregate([
      { $match: { userId: userId } },
      { 
        $group: { 
          _id: '$level', 
          totalAmount: { $sum: '$bonusAmount' },
          count: { $sum: 1 }
        } 
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      message: 'Bonus history retrieved',
      data: {
        bonuses: bonusesGrouped,
        summary: {
          totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
          totalTransactions: totalCount,
          claimed: {
            amount: parseFloat(claimedTotal.toFixed(2)),
            count: claimedCount
          },
          unclaimed: {
            amount: parseFloat(unclaimedTotal.toFixed(2)),
            count: unclaimedCount
          },
          levelBreakdown: levelBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching bonus history:', error);
    res.status(500).json({ message: 'Error fetching bonus history', error: error.message });
  }
};

/**
 * Get user's profit share transaction history
 */
const getProfitShareHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const profitShares = await ProfitShareTransaction.find({ userId })
      .populate('fromUserId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Group profit shares by fromUserId and build referral path once per user
    const groupedByUser = {};
    const referralPaths = {};

    for (const share of profitShares) {
      const fromUserIdStr = share.fromUserId._id.toString();
      
      // If we haven't seen this user before, build their referral path
      if (!referralPaths[fromUserIdStr]) {
        referralPaths[fromUserIdStr] = await buildReferralPath(userId, share.fromUserId._id);
      }

      // Group transactions by user
      if (!groupedByUser[fromUserIdStr]) {
        groupedByUser[fromUserIdStr] = {
          fromUserId: share.fromUserId,
          referralPath: referralPaths[fromUserIdStr],
          transactions: []
        };
      }

      groupedByUser[fromUserIdStr].transactions.push({
        _id: share._id,
        roiAmount: share.roiAmount,
        sharePercentage: share.sharePercentage,
        shareAmount: share.shareAmount,
        level: share.level,
        activeDirectReferralsAtTime: share.activeDirectReferralsAtTime,
        isClaimed: share.isClaimed,
        claimedAt: share.claimedAt,
        claimDate: share.claimDate,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt
      });
    }

    // Convert grouped object to array
    const profitSharesGrouped = Object.values(groupedByUser);

    const totalCount = await ProfitShareTransaction.countDocuments({ userId });

    // Get summary
    const user = await User.findById(userId);
    const totalProfitShareEarned = user?.totalProfitShareEarned || 0;

    // Get claimed vs unclaimed summary
    const claimedShares = await ProfitShareTransaction.aggregate([
      { $match: { userId: userId, isClaimed: true } },
      { $group: { _id: null, total: { $sum: '$shareAmount' }, count: { $sum: 1 } } }
    ]);
    
    const unclaimedShares = await ProfitShareTransaction.aggregate([
      { $match: { userId: userId, isClaimed: false } },
      { $group: { _id: null, total: { $sum: '$shareAmount' }, count: { $sum: 1 } } }
    ]);

    const claimedTotal = claimedShares[0]?.total || 0;
    const claimedCount = claimedShares[0]?.count || 0;
    const unclaimedTotal = unclaimedShares[0]?.total || 0;
    const unclaimedCount = unclaimedShares[0]?.count || 0;

    // Get level-wise breakdown
    const levelBreakdown = await ProfitShareTransaction.aggregate([
      { $match: { userId: userId } },
      { 
        $group: { 
          _id: '$level', 
          totalAmount: { $sum: '$shareAmount' },
          count: { $sum: 1 }
        } 
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      message: 'Profit share history retrieved',
      data: {
        profitShares: profitSharesGrouped,
        summary: {
          totalProfitShareEarned: parseFloat(totalProfitShareEarned.toFixed(2)),
          totalTransactions: totalCount,
          claimed: {
            amount: parseFloat(claimedTotal.toFixed(2)),
            count: claimedCount
          },
          unclaimed: {
            amount: parseFloat(unclaimedTotal.toFixed(2)),
            count: unclaimedCount
          },
          levelBreakdown: levelBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching profit share history:', error);
    res.status(500).json({ message: 'Error fetching profit share history', error: error.message });
  }
};

/**
 * Get user's referral network statistics
 */
const getReferralStats = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get only DIRECT referrals (users where referredBy === userId)
    const directReferrals = await User.find({ referredBy: userId })
      .select('fullName email lockedApexCoins isActive createdAt')
      .sort({ createdAt: -1 });

    // Count active direct referrals
    const activeDirectReferrals = await countActiveDirectReferrals(userId);
    const totalDirectReferrals = directReferrals.length;

    // Determine unlocked levels
    const unlockedBonusLevels = Math.min(activeDirectReferrals, 6);
    const unlockedProfitShareLevels = Math.min(activeDirectReferrals, 12);

    // Get earning summaries
    const totalBonusEarned = user.totalBonusEarned || 0;
    const totalProfitShareEarned = user.totalProfitShareEarned || 0;

    // Get recent bonus earnings
    const recentBonuses = await BonusTransaction.find({ userId })
      .populate('fromUserId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get recent profit share earnings
    const recentProfitShares = await ProfitShareTransaction.find({ userId })
      .populate('fromUserId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get referral details (only direct referrals)
    const referralDetails = directReferrals.map(ref => ({
      id: ref._id,
      fullName: ref.fullName,
      email: ref.email,
      isActive: ref.lockedApexCoins > 0,
      lockedAmount: ref.lockedApexCoins || 0,
      joinedAt: ref.createdAt
    }));

    res.status(200).json({
      message: 'Referral statistics retrieved',
      data: {
        referralCode: user.referralCode,
        directReferrals: {
          total: totalDirectReferrals,
          active: activeDirectReferrals,
          inactive: totalDirectReferrals - activeDirectReferrals
        },
        unlockedLevels: {
          bonus: unlockedBonusLevels,
          maxBonus: 6,
          profitShare: unlockedProfitShareLevels,
          maxProfitShare: 12
        },
        levelRequirements: {
          bonus: BONUS_PERCENTAGES,
          profitShare: PROFIT_SHARE_PERCENTAGES
        },
        earnings: {
          totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
          totalProfitShareEarned: parseFloat(totalProfitShareEarned.toFixed(2)),
          totalReferralEarnings: parseFloat((totalBonusEarned + totalProfitShareEarned).toFixed(2))
        },
        recentActivity: {
          bonuses: recentBonuses,
          profitShares: recentProfitShares
        },
  buildReferralPath,
        referrals: referralDetails
      }
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Error fetching referral statistics', error: error.message });
  }
};

/**
 * Get unclaimed bonuses summary for user
 */
const getUnclaimedBonuses = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Get all unclaimed bonuses
    const unclaimedBonuses = await BonusTransaction.find({ 
      userId, 
      isClaimed: false 
    }).populate('fromUserId', 'fullName email');

    // Calculate total unclaimed amount
    const totalUnclaimed = unclaimedBonuses.reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    res.status(200).json({
      message: 'Unclaimed bonuses retrieved',
      data: {
        totalUnclaimedAmount: parseFloat(totalUnclaimed.toFixed(2)),
        unclaimedCount: unclaimedBonuses.length,
        bonuses: unclaimedBonuses
      }
    });
  } catch (error) {
    console.error('Error fetching unclaimed bonuses:', error);
    res.status(500).json({ message: 'Error fetching unclaimed bonuses', error: error.message });
  }
};

/**
 * Get unclaimed profit shares summary for user
 */
const getUnclaimedProfitShares = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Get all unclaimed profit shares
    const unclaimedShares = await ProfitShareTransaction.find({ 
      userId, 
      isClaimed: false 
    }).populate('fromUserId', 'fullName email');

    // Calculate total unclaimed amount
    const totalUnclaimed = unclaimedShares.reduce((sum, share) => sum + share.shareAmount, 0);

    res.status(200).json({
      message: 'Unclaimed profit shares retrieved',
      data: {
        totalUnclaimedAmount: parseFloat(totalUnclaimed.toFixed(2)),
        unclaimedCount: unclaimedShares.length,
        profitShares: unclaimedShares
      }
    });
  } catch (error) {
    console.error('Error fetching unclaimed profit shares:', error);
    res.status(500).json({ message: 'Error fetching unclaimed profit shares', error: error.message });
  }
};

/**
 * Claim bonuses - transfer to P2P wallet (30%) and account balance (70%)
 */
const claimBonuses = async (req, res) => {
  const session = await BonusTransaction.startSession();
  session.startTransaction();
  
  try {
    const userId = req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { bonusIds } = req.body; // Optional: claim specific bonuses, or claim all if not provided

    // Build query
    const query = { userId, isClaimed: false };
    if (bonusIds && Array.isArray(bonusIds) && bonusIds.length > 0) {
      query._id = { $in: bonusIds };
    }

    // Find unclaimed bonuses within transaction
    const unclaimedBonuses = await BonusTransaction.find(query).session(session);

    if (unclaimedBonuses.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'No unclaimed bonuses found' });
    }

    // Calculate total amount to claim
    const totalAmount = unclaimedBonuses.reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    // Split the amount: 30% to P2P Wallet, 70% to Account Balance
    const p2pAmount = parseFloat((totalAmount * 0.30).toFixed(2));
    const accountAmount = parseFloat((totalAmount * 0.70).toFixed(2));

    // Update user's balances within transaction
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    user.p2pWallet = (user.p2pWallet || 0) + p2pAmount;
    user.accountBalance = (user.accountBalance || 0) + accountAmount;
    user.totalBonusEarned = (user.totalBonusEarned || 0) + totalAmount;
    await user.save({ session });

    // Mark bonuses as claimed within transaction
    const claimedAt = new Date();
    await BonusTransaction.updateMany(
      query,
      { 
        $set: { 
          isClaimed: true, 
          claimedAt: claimedAt 
        } 
      },
      { session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Bonuses claimed successfully',
      data: {
        totalClaimedAmount: parseFloat(totalAmount.toFixed(2)),
        p2pWalletAmount: p2pAmount,
        accountBalanceAmount: accountAmount,
        claimedCount: unclaimedBonuses.length,
        newP2PWallet: parseFloat(user.p2pWallet.toFixed(2)),
        newAccountBalance: parseFloat(user.accountBalance.toFixed(2))
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error claiming bonuses:', error);
    res.status(500).json({ message: 'Error claiming bonuses', error: error.message });
  }
};

/**
 * Claim profit shares - transfer to P2P wallet (30%) and account balance (70%)
 */
const claimProfitShares = async (req, res) => {
  const session = await ProfitShareTransaction.startSession();
  session.startTransaction();
  
  try {
    const userId = req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { profitShareIds } = req.body; // Optional: claim specific profit shares, or claim all if not provided

    // Build query
    const query = { userId, isClaimed: false };
    if (profitShareIds && Array.isArray(profitShareIds) && profitShareIds.length > 0) {
      query._id = { $in: profitShareIds };
    }

    // Find unclaimed profit shares within transaction
    const unclaimedShares = await ProfitShareTransaction.find(query).session(session);

    if (unclaimedShares.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'No unclaimed profit shares found' });
    }

    // Calculate total amount to claim
    const totalAmount = unclaimedShares.reduce((sum, share) => sum + share.shareAmount, 0);

    // Split the amount: 30% to P2P Wallet, 70% to Account Balance
    const p2pAmount = parseFloat((totalAmount * 0.30).toFixed(2));
    const accountAmount = parseFloat((totalAmount * 0.70).toFixed(2));

    // Update user's balances within transaction
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    user.p2pWallet = (user.p2pWallet || 0) + p2pAmount;
    user.accountBalance = (user.accountBalance || 0) + accountAmount;
    user.totalProfitShareEarned = (user.totalProfitShareEarned || 0) + totalAmount;
    await user.save({ session });

    // Mark profit shares as claimed within transaction
    const claimedAt = new Date();
    await ProfitShareTransaction.updateMany(
      query,
      { 
        $set: { 
          isClaimed: true, 
          claimedAt: claimedAt 
        } 
      },
      { session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Profit shares claimed successfully',
      data: {
        totalClaimedAmount: parseFloat(totalAmount.toFixed(2)),
        p2pWalletAmount: p2pAmount,
        accountBalanceAmount: accountAmount,
        claimedCount: unclaimedShares.length,
        newP2PWallet: parseFloat(user.p2pWallet.toFixed(2)),
        newAccountBalance: parseFloat(user.accountBalance.toFixed(2))
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error claiming profit shares:', error);
    res.status(500).json({ message: 'Error claiming profit shares', error: error.message });
  }
};

/**
 * Calculate available profit shares from entire downchain
 * This allows upline users to claim their share of downchain's claimable profits
 * WITHOUT waiting for those downline users to claim first
 * @param {ObjectId} uplineUserId - The upline user claiming profit shares
 */
const calculateDownchainProfitShares = async (uplineUserId) => {
  try {
    const Roi = require('../Models/roi.model');
    const ApexCoinRate = require('../Models/apexCoinRate.model');
    
    const uplineUser = await User.findById(uplineUserId);
    if (!uplineUser) {
      return { success: false, error: 'User not found', totalClaimable: 0, details: [] };
    }

    // Get current ROI rate and coin rate
    const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
    const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
    
    if (!currentRoi || !coinRate) {
      return { success: false, error: 'ROI or coin rate not set', totalClaimable: 0, details: [] };
    }

    const currentRoiRate = currentRoi.rate;
    const apexCoinToDollarRate = coinRate.rate;
    const now = new Date();
    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    // Find all users who have this upline user in their referral chain
    const downchainUsers = await User.find({
      referralChain: uplineUserId
    });

    if (!downchainUsers || downchainUsers.length === 0) {
      return { success: true, totalClaimable: 0, details: [], message: 'No downchain users found' };
    }

    let totalClaimableShare = 0;
    const shareDetails = [];

    // Count active direct referrals for this upline
    const activeDirectReferrals = await countActiveDirectReferrals(uplineUserId);

    // For each downchain user, calculate their claimable profit and this upline's share
    for (const downchainUser of downchainUsers) {
      // Determine the level of this downchain user relative to upline
      const levelIndex = downchainUser.referralChain.findIndex(
        id => id.toString() === uplineUserId.toString()
      );
      
      if (levelIndex === -1) continue; // User not in chain (shouldn't happen)
      
      const level = levelIndex + 1; // Level 1-12

      // Check if upline has unlocked this level
      if (level > 12 || activeDirectReferrals < level) {
        continue; // Level not unlocked
      }

      // Calculate this downchain user's claimable daily profits
      const activeEntries = downchainUser.lockedCoinsEntries?.filter(entry => entry.status === 'active') || [];
      
      let downchainUserTotalClaimable = 0;

      for (const entry of activeEntries) {
        const lockStart = new Date(entry.lockStartDate);
        
        // Get the last time THIS upline user claimed profit share from THIS downchain user's entry
        const lastClaimKey = `${downchainUser._id.toString()}_${entry._id.toString()}`;
        const lastClaimDateForThisUser = uplineUser.lastProfitShareClaimDates?.get(lastClaimKey) || lockStart;
        
        // Calculate days since last claim by THIS upline user
        const daysSinceLastClaim = Math.max(0, Math.floor((now - new Date(lastClaimDateForThisUser)) / millisecondsPerDay));
        
        if (daysSinceLastClaim > 0) {
          // Calculate claimable profit for THIS entry
          const monthlyProfitInCoins = (entry.amount * currentRoiRate) / 100;
          const dailyProfitInCoins = monthlyProfitInCoins / 30;
          const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
          const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;
          
          downchainUserTotalClaimable += claimableProfitInDollars;
        }
      }

      if (downchainUserTotalClaimable > 0) {
        // Calculate this upline's share based on the level
        const sharePercentage = PROFIT_SHARE_PERCENTAGES[level];
        const shareAmount = (downchainUserTotalClaimable * sharePercentage) / 100;
        
        totalClaimableShare += shareAmount;
        
        shareDetails.push({
          downchainUserId: downchainUser._id,
          downchainUserName: downchainUser.fullName,
          downchainUserEmail: downchainUser.email,
          level: level,
          sharePercentage: sharePercentage,
          downchainClaimableAmount: parseFloat(downchainUserTotalClaimable.toFixed(2)),
          uplineShareAmount: parseFloat(shareAmount.toFixed(2)),
          activeEntries: activeEntries.length
        });
      }
    }

    return {
      success: true,
      totalClaimable: parseFloat(totalClaimableShare.toFixed(2)),
      details: shareDetails,
      activeDirectReferrals: activeDirectReferrals,
      unlockedLevels: Math.min(activeDirectReferrals, 12)
    };
  } catch (error) {
    console.error('Error calculating downchain profit shares:', error);
    return {
      success: false,
      error: error.message,
      totalClaimable: 0,
      details: []
    };
  }
};

/**
 * Get available downchain profit shares (without claiming)
 */
const getAvailableDownchainProfitShares = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const result = await calculateDownchainProfitShares(userId);

    if (!result.success) {
      return res.status(400).json({ 
        message: result.error || 'Error calculating available profit shares',
        totalClaimable: 0
      });
    }

    res.status(200).json({
      message: 'Available downchain profit shares calculated',
      data: {
        totalClaimable: result.totalClaimable,
        details: result.details,
        activeDirectReferrals: result.activeDirectReferrals,
        unlockedLevels: result.unlockedLevels,
        downchainUsersCount: result.details.length
      }
    });
  } catch (error) {
    console.error('Error getting available downchain profit shares:', error);
    res.status(500).json({ message: 'Error getting available profit shares', error: error.message });
  }
};

/**
 * Claim profit shares from downchain (independent of when downchain users claim)
 */
const claimDownchainProfitShares = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const Roi = require('../Models/roi.model');
    const ApexCoinRate = require('../Models/apexCoinRate.model');
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get current ROI rate and coin rate
    const currentRoi = await Roi.findOne({ isActive: true }).sort({ createdAt: -1 });
    const coinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
    
    if (!currentRoi || !coinRate) {
      return res.status(400).json({ message: 'ROI or coin rate not set' });
    }

    const currentRoiRate = currentRoi.rate;
    const apexCoinToDollarRate = coinRate.rate;
    const now = new Date();
    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    // Find all users who have this user in their referral chain
    const downchainUsers = await User.find({
      referralChain: userId
    });

    if (!downchainUsers || downchainUsers.length === 0) {
      return res.status(400).json({ 
        message: 'No downchain users found',
        claimableAmount: 0
      });
    }

    let totalClaimedShare = 0;
    const claimDetails = [];
    const profitShareTransactions = [];

    // Count active direct referrals
    const activeDirectReferrals = await countActiveDirectReferrals(userId);

    // For each downchain user, calculate their claimable profit and this user's share
    for (const downchainUser of downchainUsers) {
      // Determine the level of this downchain user relative to claiming user
      const levelIndex = downchainUser.referralChain.findIndex(
        id => id.toString() === userId.toString()
      );
      
      if (levelIndex === -1) continue;
      
      const level = levelIndex + 1; // Level 1-12

      // Check if user has unlocked this level
      if (level > 12 || activeDirectReferrals < level) {
        continue;
      }

      // Calculate this downchain user's claimable daily profits
      const activeEntries = downchainUser.lockedCoinsEntries?.filter(entry => entry.status === 'active') || [];
      
      let downchainUserTotalClaimable = 0;
      const entryDetails = [];

      for (const entry of activeEntries) {
        const lockStart = new Date(entry.lockStartDate);
        
        // Get the last time THIS user claimed profit share from THIS downchain user's entry
        const lastClaimKey = `${downchainUser._id.toString()}_${entry._id.toString()}`;
        const lastClaimDateForThisUser = user.lastProfitShareClaimDates?.get(lastClaimKey) || lockStart;
        
        // Calculate days since last claim by THIS user
        const daysSinceLastClaim = Math.max(0, Math.floor((now - new Date(lastClaimDateForThisUser)) / millisecondsPerDay));
        
        if (daysSinceLastClaim > 0) {
          // Calculate claimable profit for THIS entry
          const monthlyProfitInCoins = (entry.amount * currentRoiRate) / 100;
          const dailyProfitInCoins = monthlyProfitInCoins / 30;
          const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
          const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;
          
          downchainUserTotalClaimable += claimableProfitInDollars;
          
          entryDetails.push({
            entryId: entry._id,
            amount: entry.amount,
            daysSinceLastClaim: daysSinceLastClaim,
            claimableProfit: parseFloat(claimableProfitInDollars.toFixed(2))
          });
          
          // Update last claim date for this user-entry combination
          if (!user.lastProfitShareClaimDates) {
            user.lastProfitShareClaimDates = new Map();
          }
          user.lastProfitShareClaimDates.set(lastClaimKey, now);
        }
      }

      if (downchainUserTotalClaimable > 0) {
        // Calculate this user's share based on the level
        const sharePercentage = PROFIT_SHARE_PERCENTAGES[level];
        const shareAmount = (downchainUserTotalClaimable * sharePercentage) / 100;
        
        totalClaimedShare += shareAmount;
        
        claimDetails.push({
          downchainUserId: downchainUser._id,
          downchainUserName: downchainUser.fullName,
          level: level,
          sharePercentage: sharePercentage,
          downchainClaimableAmount: parseFloat(downchainUserTotalClaimable.toFixed(2)),
          shareAmount: parseFloat(shareAmount.toFixed(2)),
          entries: entryDetails
        });

        // Create profit share transaction record
        const profitShareTransaction = new ProfitShareTransaction({
          userId: userId,
          fromUserId: downchainUser._id,
          roiAmount: downchainUserTotalClaimable,
          sharePercentage: sharePercentage,
          shareAmount: shareAmount,
          level: level,
          activeDirectReferralsAtTime: activeDirectReferrals,
          claimDate: now,
          isClaimed: true,
          claimedAt: now
        });
        
        profitShareTransactions.push(profitShareTransaction);
      }
    }

    if (totalClaimedShare === 0) {
      return res.status(400).json({ 
        message: 'No profit shares available to claim yet. Your downchain users may not have accumulated claimable profits since your last claim.',
        claimableAmount: 0
      });
    }

    // Save all profit share transactions
    await ProfitShareTransaction.insertMany(profitShareTransactions);

    // Update user's account balance and total profit share earned
    user.accountBalance = (user.accountBalance || 0) + totalClaimedShare;
    user.totalProfitShareEarned = (user.totalProfitShareEarned || 0) + totalClaimedShare;
    
    await user.save();

    res.status(200).json({
      message: 'Downchain profit shares claimed successfully',
      data: {
        totalClaimedAmount: parseFloat(totalClaimedShare.toFixed(2)),
        newAccountBalance: parseFloat(user.accountBalance.toFixed(2)),
        totalProfitShareEarned: parseFloat(user.totalProfitShareEarned.toFixed(2)),
        claimDetails: claimDetails,
        claimedAt: now,
        activeDirectReferrals: activeDirectReferrals,
        unlockedLevels: Math.min(activeDirectReferrals, 12),
        downchainUsersProcessed: claimDetails.length
      }
    });
  } catch (error) {
    console.error('Error claiming downchain profit shares:', error);
    res.status(500).json({ message: 'Error claiming downchain profit shares', error: error.message });
  }
};

module.exports = {
  // Helper functions for use in other controllers
  buildReferralPath,
  countActiveDirectReferrals,
  distributeStakingBonus,
  BONUS_PERCENTAGES,
  PROFIT_SHARE_PERCENTAGES,
  
  // API endpoints
  getBonusHistory,
  getProfitShareHistory,
  getReferralStats,
  getUnclaimedBonuses,
  claimBonuses,
  getAvailableDownchainProfitShares,
  claimDownchainProfitShares
};
