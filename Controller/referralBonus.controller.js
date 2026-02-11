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
 * Count active direct referrals for a user
 * Active = has lockedApexCoins > 0
 */
const countActiveDirectReferrals = async (userId) => {
  try {
    const user = await User.findById(userId).populate('referrals', 'lockedApexCoins');
    if (!user || !user.referrals) {
      return 0;
    }
    
    // Count referrals who have locked coins (active investors)
    const activeCount = user.referrals.filter(ref => ref.lockedApexCoins > 0).length;
    return activeCount;
  } catch (error) {
    console.error('Error counting active referrals:', error);
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

      // Add bonus to upline's accountBalance
      uplineUser.accountBalance = (uplineUser.accountBalance || 0) + bonusAmount;
      uplineUser.totalBonusEarned = (uplineUser.totalBonusEarned || 0) + bonusAmount;
      await uplineUser.save();

      // Record the bonus transaction
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

      // Add profit share to upline's accountBalance
      uplineUser.accountBalance = (uplineUser.accountBalance || 0) + shareAmount;
      uplineUser.totalProfitShareEarned = (uplineUser.totalProfitShareEarned || 0) + shareAmount;
      await uplineUser.save();

      // Record the profit share transaction
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

    const totalCount = await BonusTransaction.countDocuments({ userId });

    // Get summary
    const user = await User.findById(userId);
    const totalBonusEarned = user?.totalBonusEarned || 0;

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
        bonuses: bonuses,
        summary: {
          totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
          totalTransactions: totalCount,
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

    const totalCount = await ProfitShareTransaction.countDocuments({ userId });

    // Get summary
    const user = await User.findById(userId);
    const totalProfitShareEarned = user?.totalProfitShareEarned || 0;

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
        profitShares: profitShares,
        summary: {
          totalProfitShareEarned: parseFloat(totalProfitShareEarned.toFixed(2)),
          totalTransactions: totalCount,
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

    const user = await User.findById(userId)
      .populate('referrals', 'fullName email lockedApexCoins isActive createdAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count active direct referrals
    const activeDirectReferrals = await countActiveDirectReferrals(userId);
    const totalDirectReferrals = user.referrals?.length || 0;

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

    // Get referral details
    const referralDetails = user.referrals?.map(ref => ({
      id: ref._id,
      fullName: ref.fullName,
      email: ref.email,
      isActive: ref.lockedApexCoins > 0,
      lockedAmount: ref.lockedApexCoins || 0,
      joinedAt: ref.createdAt
    })) || [];

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
        referrals: referralDetails
      }
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Error fetching referral statistics', error: error.message });
  }
};

module.exports = {
  // Helper functions for use in other controllers
  countActiveDirectReferrals,
  distributeStakingBonus,
  distributeProfitShare,
  BONUS_PERCENTAGES,
  PROFIT_SHARE_PERCENTAGES,
  
  // API endpoints
  getBonusHistory,
  getProfitShareHistory,
  getReferralStats
};
