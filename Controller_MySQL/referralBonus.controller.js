const { User, LockedCoinsEntry, BonusTransaction, ProfitShareTransaction, sequelize } = require('../Models_MySQL');
const { Op } = require('sequelize');

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
  11: 0.5,  // Level 11 - 0.5%
  12: 0.5   // Level 12 - 0.5%
};

/**
 * Count active direct referrals for a user
 * Active = has lockedApexCoins > 0
 */
const countActiveDirectReferrals = async (userId) => {
  try {
    const user = await User.findByPk(userId, {
      include: [{
        model: User,
        as: 'directReferrals',
        attributes: ['id', 'lockedApexCoins']
      }]
    });
    
    if (!user || !user.directReferrals) {
      return 0;
    }
    
    // Count referrals who have locked coins (active investors)
    const activeCount = user.directReferrals.filter(ref => 
      parseFloat(ref.lockedApexCoins || 0) > 0
    ).length;
    
    return activeCount;
  } catch (error) {
    console.error('Error counting active referrals:', error);
    return 0;
  }
};

/**
 * Get referral chain for a user (returns array of ancestor user IDs)
 */
const getReferralChain = async (userId) => {
  try {
    const { UserReferralChain } = require('../Models_MySQL');
    
    const chain = await UserReferralChain.findAll({
      where: { userId },
      order: [['level', 'ASC']],
      attributes: ['ancestorId', 'level']
    });
    
    return chain.map(c => ({ id: c.ancestorId, level: c.level }));
  } catch (error) {
    console.error('Error getting referral chain:', error);
    return [];
  }
};

/**
 * Distribute one-time bonus to upline when user stakes/locks coins
 * @param {Number} stakingUserId - User who is staking
 * @param {Number} stakeAmount - Amount being staked
 * @param {Number} stakeEntryId - The locked entry ID
 */
const distributeStakingBonus = async (stakingUserId, stakeAmount, stakeEntryId) => {
  try {
    const referralChain = await getReferralChain(stakingUserId);
    
    if (referralChain.length === 0) {
      console.log('No referral chain for bonus distribution');
      return { success: true, bonusesDistributed: 0, details: [] };
    }

    const bonusDetails = [];
    let bonusesDistributed = 0;

    // Traverse referral chain up to 6 levels
    const maxLevels = Math.min(6, referralChain.length);
    
    for (let level = 1; level <= maxLevels; level++) {
      const chainEntry = referralChain.find(c => c.level === level);
      if (!chainEntry) continue;
      
      const uplineUserId = chainEntry.id;
      
      // Check if upline user exists
      const uplineUser = await User.findByPk(uplineUserId);
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

      // Calculate bonus
      const bonusPercentage = BONUS_PERCENTAGES[level];
      const bonusAmount = (stakeAmount * bonusPercentage) / 100;

      // Add bonus to upline's accountBalance
      await uplineUser.update({
        accountBalance: parseFloat(uplineUser.accountBalance || 0) + bonusAmount,
        totalBonusEarned: parseFloat(uplineUser.totalBonusEarned || 0) + bonusAmount
      });

      // Record the bonus transaction
      await BonusTransaction.create({
        userId: uplineUserId,
        fromUserId: stakingUserId,
        stakeEntryId: stakeEntryId,
        investmentAmount: stakeAmount,
        bonusPercentage: bonusPercentage,
        bonusAmount: bonusAmount,
        level: level,
        activeDirectReferralsAtTime: activeDirectReferrals
      });

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
 * @param {Number} claimingUserId - User who is claiming ROI
 * @param {Number} roiAmount - The ROI amount being claimed (in dollars)
 */
const distributeProfitShare = async (claimingUserId, roiAmount) => {
  try {
    const referralChain = await getReferralChain(claimingUserId);
    
    if (referralChain.length === 0) {
      console.log('No referral chain for profit share distribution');
      return { success: true, sharesDistributed: 0, details: [] };
    }

    const shareDetails = [];
    let sharesDistributed = 0;
    const claimDate = new Date();

    // Traverse referral chain up to 12 levels
    const maxLevels = Math.min(12, referralChain.length);
    
    for (let level = 1; level <= maxLevels; level++) {
      const chainEntry = referralChain.find(c => c.level === level);
      if (!chainEntry) continue;
      
      const uplineUserId = chainEntry.id;
      
      // Check if upline user exists
      const uplineUser = await User.findByPk(uplineUserId);
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
      await uplineUser.update({
        accountBalance: parseFloat(uplineUser.accountBalance || 0) + shareAmount,
        totalProfitShareEarned: parseFloat(uplineUser.totalProfitShareEarned || 0) + shareAmount
      });

      // Record the profit share transaction
      await ProfitShareTransaction.create({
        userId: uplineUserId,
        fromUserId: claimingUserId,
        roiAmount: roiAmount,
        sharePercentage: sharePercentage,
        shareAmount: shareAmount,
        level: level,
        activeDirectReferralsAtTime: activeDirectReferrals,
        claimDate: claimDate
      });

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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: bonuses } = await BonusTransaction.findAndCountAll({
      where: { userId },
      include: [{
        model: User,
        as: 'investor',
        attributes: ['id', 'fullName', 'email']
      }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });

    // Get summary
    const user = await User.findByPk(userId);
    const totalBonusEarned = parseFloat(user?.totalBonusEarned || 0);

    // Get level-wise breakdown
    const levelBreakdown = await BonusTransaction.findAll({
      where: { userId },
      attributes: [
        'level',
        [sequelize.fn('SUM', sequelize.col('bonusAmount')), 'totalAmount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['level'],
      order: [['level', 'ASC']],
      raw: true
    });

    res.status(200).json({
      message: 'Bonus history retrieved',
      data: {
        bonuses: bonuses,
        summary: {
          totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
          totalTransactions: count,
          levelBreakdown: levelBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit)),
          totalItems: count,
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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: profitShares } = await ProfitShareTransaction.findAndCountAll({
      where: { userId },
      include: [{
        model: User,
        as: 'roiEarner',
        attributes: ['id', 'fullName', 'email']
      }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });

    // Get summary
    const user = await User.findByPk(userId);
    const totalProfitShareEarned = parseFloat(user?.totalProfitShareEarned || 0);

    // Get level-wise breakdown
    const levelBreakdown = await ProfitShareTransaction.findAll({
      where: { userId },
      attributes: [
        'level',
        [sequelize.fn('SUM', sequelize.col('shareAmount')), 'totalAmount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['level'],
      order: [['level', 'ASC']],
      raw: true
    });

    res.status(200).json({
      message: 'Profit share history retrieved',
      data: {
        profitShares: profitShares,
        summary: {
          totalProfitShareEarned: parseFloat(totalProfitShareEarned.toFixed(2)),
          totalTransactions: count,
          levelBreakdown: levelBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit)),
          totalItems: count,
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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findByPk(userId, {
      include: [{
        model: User,
        as: 'directReferrals',
        attributes: ['id', 'fullName', 'email', 'lockedApexCoins', 'isActive', 'createdAt']
      }]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count active direct referrals
    const activeDirectReferrals = await countActiveDirectReferrals(userId);
    const totalDirectReferrals = user.directReferrals?.length || 0;

    // Determine unlocked levels
    const unlockedBonusLevels = Math.min(activeDirectReferrals, 6);
    const unlockedProfitShareLevels = Math.min(activeDirectReferrals, 12);

    // Get earning summaries
    const totalBonusEarned = parseFloat(user.totalBonusEarned || 0);
    const totalProfitShareEarned = parseFloat(user.totalProfitShareEarned || 0);

    // Get recent bonus earnings
    const recentBonuses = await BonusTransaction.findAll({
      where: { userId },
      include: [{
        model: User,
        as: 'investor',
        attributes: ['id', 'fullName']
      }],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Get recent profit share earnings
    const recentProfitShares = await ProfitShareTransaction.findAll({
      where: { userId },
      include: [{
        model: User,
        as: 'roiEarner',
        attributes: ['id', 'fullName']
      }],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Get referral details
    const referralDetails = user.directReferrals?.map(ref => ({
      id: ref.id,
      fullName: ref.fullName,
      email: ref.email,
      isActive: parseFloat(ref.lockedApexCoins || 0) > 0,
      lockedAmount: parseFloat(ref.lockedApexCoins || 0),
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
  getReferralChain,
  distributeStakingBonus,
  distributeProfitShare,
  BONUS_PERCENTAGES,
  PROFIT_SHARE_PERCENTAGES,
  
  // API endpoints
  getBonusHistory,
  getProfitShareHistory,
  getReferralStats
};
