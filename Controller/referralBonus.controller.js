const { Op } = require('sequelize');
const { sequelize } = require('../Config/DB');
const User = require('../Models/user.model');
const LockedCoinsEntry = require('../Models/lockedCoinsEntry.model');
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
    11: 0.5,  // Level 11 - 0.5%
    12: 0.5   // Level 12 - 0.5%
};

/**
 * Build referral path from root user to end user
 */
const buildReferralPath = async (rootUserId, endUserId) => {
    try {
        if (rootUserId.toString() === endUserId.toString()) {
            const user = await User.findByPk(rootUserId, {
                attributes: ['id', 'full_name', 'email']
            });
            return [{
                userId: user.id,
                fullName: user.full_name,
                email: user.email,
                level: 0
            }];
        }

        const endUser = await User.findByPk(endUserId);
        if (!endUser) {
            return [];
        }

        // Build path from end user up to root user
        const path = [];
        let currentUser = endUser;
        let level = 0;

        // Add the end user first
        path.unshift({
            userId: currentUser.id,
            fullName: currentUser.full_name,
            email: currentUser.email,
            level: level
        });

        // Traverse up the referral chain until we reach the root user
        while (currentUser.referred_by && currentUser.referred_by !== rootUserId) {
            currentUser = await User.findByPk(currentUser.referred_by, {
                attributes: ['id', 'full_name', 'email', 'referred_by']
            });
            if (!currentUser) break;

            level++;
            path.unshift({
                userId: currentUser.id,
                fullName: currentUser.full_name,
                email: currentUser.email,
                level: level
            });
        }

        // Add the root user at the beginning
        if (currentUser && currentUser.referred_by && currentUser.referred_by === rootUserId) {
            const rootUser = await User.findByPk(rootUserId, {
                attributes: ['id', 'full_name', 'email']
            });
            level++;
            path.unshift({
                userId: rootUser.id,
                fullName: rootUser.full_name,
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
 * Count active DIRECT referrals for a user
 * Active = has locked_apex_coins > 0
 */
const countActiveDirectReferrals = async (userId) => {
    try {
        const activeDirectCount = await User.count({
            where: {
                referred_by: userId,
                locked_apex_coins: { [Op.gt]: 0 }
            }
        });
        return activeDirectCount;
    } catch (error) {
        console.error('Error counting active direct referrals:', error);
        return 0;
    }
};

/**
 * Distribute one-time bonus to upline when user stakes/locks coins
 */
const distributeStakingBonus = async (stakingUserId, stakeAmount, stakeEntryId) => {
    try {
        const stakingUser = await User.findByPk(stakingUserId);
        if (!stakingUser) {
            console.log('Staking user not found');
            return { success: true, bonusesDistributed: 0, details: [] };
        }

        const referralChain = stakingUser.getReferralChainArray();
        if (!referralChain || referralChain.length === 0) {
            console.log('No referral chain for bonus distribution');
            return { success: true, bonusesDistributed: 0, details: [] };
        }

        const bonusDetails = [];
        let bonusesDistributed = 0;

        // Traverse referral chain up to 6 levels
        const maxLevels = Math.min(6, referralChain.length);

        for (let level = 1; level <= maxLevels; level++) {
            const uplineUserId = referralChain[level - 1];

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

            // Record the bonus transaction
            await BonusTransaction.create({
                user_id: uplineUserId,
                from_user_id: stakingUserId,
                stake_entry_id: stakeEntryId,
                investment_amount: stakeAmount,
                bonus_percentage: bonusPercentage,
                bonus_amount: bonusAmount,
                level: level,
                active_direct_referrals_at_time: activeDirectReferrals
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
        const claimingUser = await User.findByPk(claimingUserId);
        if (!claimingUser) {
            console.log('Claiming user not found');
            return { success: true, sharesDistributed: 0, details: [] };
        }

        const referralChain = claimingUser.getReferralChainArray();
        if (!referralChain || referralChain.length === 0) {
            console.log('No referral chain for profit share distribution');
            return { success: true, sharesDistributed: 0, details: [] };
        }

        const shareDetails = [];
        let sharesDistributed = 0;
        const claimDate = new Date();

        // Traverse referral chain up to 12 levels
        const maxLevels = Math.min(12, referralChain.length);

        for (let level = 1; level <= maxLevels; level++) {
            const uplineUserId = referralChain[level - 1]; // 0-indexed array

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

            // Record the profit share transaction (not automatically claimed)
            await ProfitShareTransaction.create({
                user_id: uplineUserId,
                from_user_id: claimingUserId,
                roi_amount: roiAmount,
                share_percentage: sharePercentage,
                share_amount: shareAmount,
                level: level,
                active_direct_referrals_at_time: activeDirectReferrals,
                claim_date: claimDate
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
            where: { user_id: userId },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name', 'email']
            }],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // Group bonuses by fromUser and build referral path once per user
        const groupedByUser = {};
        const referralPaths = {};

        for (const bonus of bonuses) {
            if (!bonus.fromUser) {
                const deletedKey = 'deleted_user';
                if (!groupedByUser[deletedKey]) {
                    groupedByUser[deletedKey] = {
                        fromUserId: { id: null, fullName: 'Deleted User', email: 'N/A' },
                        referralPath: [],
                        transactions: []
                    };
                }

                groupedByUser[deletedKey].transactions.push({
                    id: bonus.id,
                    stakeEntryId: bonus.stake_entry_id,
                    investmentAmount: parseFloat(bonus.investment_amount),
                    bonusPercentage: parseFloat(bonus.bonus_percentage),
                    bonusAmount: parseFloat(bonus.bonus_amount),
                    level: bonus.level,
                    activeDirectReferralsAtTime: bonus.active_direct_referrals_at_time,
                    isClaimed: bonus.is_claimed,
                    claimedAt: bonus.claimed_at,
                    createdAt: bonus.created_at,
                    updatedAt: bonus.updated_at
                });
                continue;
            }

            const fromUserIdStr = bonus.fromUser.id.toString();

            if (!referralPaths[fromUserIdStr]) {
                referralPaths[fromUserIdStr] = await buildReferralPath(userId, bonus.fromUser.id);
            }

            if (!groupedByUser[fromUserIdStr]) {
                groupedByUser[fromUserIdStr] = {
                    fromUserId: {
                        id: bonus.fromUser.id,
                        fullName: bonus.fromUser.full_name,
                        email: bonus.fromUser.email
                    },
                    referralPath: referralPaths[fromUserIdStr],
                    transactions: []
                };
            }

            groupedByUser[fromUserIdStr].transactions.push({
                id: bonus.id,
                stakeEntryId: bonus.stake_entry_id,
                investmentAmount: parseFloat(bonus.investment_amount),
                bonusPercentage: parseFloat(bonus.bonus_percentage),
                bonusAmount: parseFloat(bonus.bonus_amount),
                level: bonus.level,
                activeDirectReferralsAtTime: bonus.active_direct_referrals_at_time,
                isClaimed: bonus.is_claimed,
                claimedAt: bonus.claimed_at,
                createdAt: bonus.created_at,
                updatedAt: bonus.updated_at
            });
        }

        const bonusesGrouped = Object.values(groupedByUser);

        // Get user summary
        const user = await User.findByPk(userId);
        const totalBonusEarned = parseFloat(user?.total_bonus_earned) || 0;

        // Get claimed vs unclaimed summary
        const claimedResult = await BonusTransaction.findAll({
            where: { user_id: userId, is_claimed: true },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('bonus_amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const unclaimedResult = await BonusTransaction.findAll({
            where: { user_id: userId, is_claimed: false },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('bonus_amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const claimedTotal = parseFloat(claimedResult[0]?.total) || 0;
        const claimedCount = parseInt(claimedResult[0]?.count) || 0;
        const unclaimedTotal = parseFloat(unclaimedResult[0]?.total) || 0;
        const unclaimedCount = parseInt(unclaimedResult[0]?.count) || 0;

        // Get level-wise breakdown
        const levelBreakdown = await BonusTransaction.findAll({
            where: { user_id: userId },
            attributes: [
                'level',
                [sequelize.fn('SUM', sequelize.col('bonus_amount')), 'totalAmount'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['level'],
            order: [['level', 'ASC']],
            raw: true
        });

        res.status(200).json({
            message: 'Bonus history retrieved',
            data: {
                bonuses: bonusesGrouped,
                summary: {
                    totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
                    totalTransactions: count,
                    claimed: {
                        amount: parseFloat(claimedTotal.toFixed(2)),
                        count: claimedCount
                    },
                    unclaimed: {
                        amount: parseFloat(unclaimedTotal.toFixed(2)),
                        count: unclaimedCount
                    },
                    levelBreakdown: levelBreakdown.map(l => ({
                        _id: l.level,
                        totalAmount: parseFloat(l.totalAmount) || 0,
                        count: parseInt(l.count) || 0
                    }))
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
            where: { user_id: userId },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name', 'email']
            }],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // Group profit shares by fromUser
        const groupedByUser = {};
        const referralPaths = {};

        for (const share of profitShares) {
            if (!share.fromUser) {
                const deletedKey = 'deleted_user';
                if (!groupedByUser[deletedKey]) {
                    groupedByUser[deletedKey] = {
                        fromUserId: { id: null, fullName: 'Deleted User', email: 'N/A' },
                        referralPath: [],
                        transactions: []
                    };
                }

                groupedByUser[deletedKey].transactions.push({
                    id: share.id,
                    roiAmount: parseFloat(share.roi_amount),
                    sharePercentage: parseFloat(share.share_percentage),
                    shareAmount: parseFloat(share.share_amount),
                    level: share.level,
                    activeDirectReferralsAtTime: share.active_direct_referrals_at_time,
                    isClaimed: share.is_claimed,
                    claimedAt: share.claimed_at,
                    claimDate: share.claim_date,
                    createdAt: share.created_at,
                    updatedAt: share.updated_at
                });
                continue;
            }

            const fromUserIdStr = share.fromUser.id.toString();

            if (!referralPaths[fromUserIdStr]) {
                referralPaths[fromUserIdStr] = await buildReferralPath(userId, share.fromUser.id);
            }

            if (!groupedByUser[fromUserIdStr]) {
                groupedByUser[fromUserIdStr] = {
                    fromUserId: {
                        id: share.fromUser.id,
                        fullName: share.fromUser.full_name,
                        email: share.fromUser.email
                    },
                    referralPath: referralPaths[fromUserIdStr],
                    transactions: []
                };
            }

            groupedByUser[fromUserIdStr].transactions.push({
                id: share.id,
                roiAmount: parseFloat(share.roi_amount),
                sharePercentage: parseFloat(share.share_percentage),
                shareAmount: parseFloat(share.share_amount),
                level: share.level,
                activeDirectReferralsAtTime: share.active_direct_referrals_at_time,
                isClaimed: share.is_claimed,
                claimedAt: share.claimed_at,
                claimDate: share.claim_date,
                createdAt: share.created_at,
                updatedAt: share.updated_at
            });
        }

        const profitSharesGrouped = Object.values(groupedByUser);

        // Get user summary
        const user = await User.findByPk(userId);
        const totalProfitShareEarned = parseFloat(user?.total_profit_share_earned) || 0;

        // Get claimed vs unclaimed summary
        const claimedResult = await ProfitShareTransaction.findAll({
            where: { user_id: userId, is_claimed: true },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('share_amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const unclaimedResult = await ProfitShareTransaction.findAll({
            where: { user_id: userId, is_claimed: false },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('share_amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const claimedTotal = parseFloat(claimedResult[0]?.total) || 0;
        const claimedCount = parseInt(claimedResult[0]?.count) || 0;
        const unclaimedTotal = parseFloat(unclaimedResult[0]?.total) || 0;
        const unclaimedCount = parseInt(unclaimedResult[0]?.count) || 0;

        // Get level-wise breakdown
        const levelBreakdown = await ProfitShareTransaction.findAll({
            where: { user_id: userId },
            attributes: [
                'level',
                [sequelize.fn('SUM', sequelize.col('share_amount')), 'totalAmount'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['level'],
            order: [['level', 'ASC']],
            raw: true
        });

        res.status(200).json({
            message: 'Profit share history retrieved',
            data: {
                profitShares: profitSharesGrouped,
                summary: {
                    totalProfitShareEarned: parseFloat(totalProfitShareEarned.toFixed(2)),
                    totalTransactions: count,
                    claimed: {
                        amount: parseFloat(claimedTotal.toFixed(2)),
                        count: claimedCount
                    },
                    unclaimed: {
                        amount: parseFloat(unclaimedTotal.toFixed(2)),
                        count: unclaimedCount
                    },
                    levelBreakdown: levelBreakdown.map(l => ({
                        _id: l.level,
                        totalAmount: parseFloat(l.totalAmount) || 0,
                        count: parseInt(l.count) || 0
                    }))
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

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get direct referrals
        const directReferrals = await User.findAll({
            where: { referred_by: userId },
            attributes: ['id', 'full_name', 'email', 'locked_apex_coins', 'is_active', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        // Count active direct referrals
        const activeDirectReferrals = await countActiveDirectReferrals(userId);
        const totalDirectReferrals = directReferrals.length;

        // Determine unlocked levels
        const unlockedBonusLevels = Math.min(activeDirectReferrals, 6);
        const unlockedProfitShareLevels = Math.min(activeDirectReferrals, 12);

        // Get earning summaries
        const totalBonusEarned = parseFloat(user.total_bonus_earned) || 0;
        const totalProfitShareEarned = parseFloat(user.total_profit_share_earned) || 0;

        // Get recent bonus earnings
        const recentBonuses = await BonusTransaction.findAll({
            where: { user_id: userId },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name']
            }],
            order: [['created_at', 'DESC']],
            limit: 5
        });

        // Get recent profit share earnings
        const recentProfitShares = await ProfitShareTransaction.findAll({
            where: { user_id: userId },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name']
            }],
            order: [['created_at', 'DESC']],
            limit: 5
        });

        // Get referral details
        const referralDetails = directReferrals.map(ref => ({
            id: ref.id,
            fullName: ref.full_name,
            email: ref.email,
            isActive: parseFloat(ref.locked_apex_coins) > 0,
            lockedAmount: parseFloat(ref.locked_apex_coins) || 0,
            joinedAt: ref.created_at
        }));

        res.status(200).json({
            message: 'Referral statistics retrieved',
            data: {
                referralCode: user.referral_code,
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
                    bonuses: recentBonuses.map(b => ({
                        id: b.id,
                        fromUser: b.fromUser ? { id: b.fromUser.id, fullName: b.fromUser.full_name } : null,
                        bonusAmount: parseFloat(b.bonus_amount),
                        level: b.level,
                        createdAt: b.created_at
                    })),
                    profitShares: recentProfitShares.map(p => ({
                        id: p.id,
                        fromUser: p.fromUser ? { id: p.fromUser.id, fullName: p.fromUser.full_name } : null,
                        shareAmount: parseFloat(p.share_amount),
                        level: p.level,
                        createdAt: p.created_at
                    }))
                },
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
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const unclaimedBonuses = await BonusTransaction.findAll({
            where: { user_id: userId, is_claimed: false },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name', 'email']
            }]
        });

        const totalUnclaimed = unclaimedBonuses.reduce((sum, bonus) => sum + parseFloat(bonus.bonus_amount), 0);

        res.status(200).json({
            message: 'Unclaimed bonuses retrieved',
            data: {
                totalUnclaimedAmount: parseFloat(totalUnclaimed.toFixed(2)),
                unclaimedCount: unclaimedBonuses.length,
                bonuses: unclaimedBonuses.map(b => ({
                    id: b.id,
                    fromUserId: b.fromUser ? {
                        id: b.fromUser.id,
                        fullName: b.fromUser.full_name,
                        email: b.fromUser.email
                    } : null,
                    bonusAmount: parseFloat(b.bonus_amount),
                    level: b.level,
                    createdAt: b.created_at
                }))
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
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Get all unclaimed profit shares
        const unclaimedShares = await ProfitShareTransaction.findAll({
            where: { user_id: userId, is_claimed: false },
            include: [{
                model: User,
                as: 'fromUser',
                attributes: ['id', 'full_name', 'email']
            }]
        });

        // Calculate total unclaimed amount
        const totalUnclaimed = unclaimedShares.reduce((sum, share) => sum + parseFloat(share.share_amount), 0);

        res.status(200).json({
            message: 'Unclaimed profit shares retrieved',
            data: {
                totalUnclaimedAmount: parseFloat(totalUnclaimed.toFixed(2)),
                unclaimedCount: unclaimedShares.length,
                profitShares: unclaimedShares.map(s => ({
                    id: s.id,
                    fromUserId: s.fromUser ? {
                        id: s.fromUser.id,
                        fullName: s.fromUser.full_name,
                        email: s.fromUser.email
                    } : null,
                    shareAmount: parseFloat(s.share_amount),
                    roiAmount: parseFloat(s.roi_amount),
                    level: s.level,
                    sharePercentage: parseFloat(s.share_percentage),
                    createdAt: s.created_at
                }))
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
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user?.id;
        
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { bonusIds } = req.body || {};

        // Build query
        const whereClause = { user_id: userId, is_claimed: false };
        if (bonusIds && Array.isArray(bonusIds) && bonusIds.length > 0) {
            whereClause.id = { [Op.in]: bonusIds };
        }

        // Find unclaimed bonuses
        const unclaimedBonuses = await BonusTransaction.findAll({
            where: whereClause,
            transaction,
            lock: true
        });

        if (unclaimedBonuses.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'No unclaimed bonuses found' });
        }

        // Calculate total amount
        const totalAmount = unclaimedBonuses.reduce((sum, bonus) => sum + parseFloat(bonus.bonus_amount), 0);

        // Split: 30% to P2P Wallet, 70% to Account Balance
        const p2pAmount = parseFloat((totalAmount * 0.30).toFixed(2));
        const accountAmount = parseFloat((totalAmount * 0.70).toFixed(2));

        // Update user balances
        console.log('Looking up user with ID:', userId);
        const user = await User.findByPk(userId, { transaction, lock: true });
        console.log('User found:', user ? 'YES' : 'NO');
        if (user) {
            console.log('User data:', { id: user.id, fullName: user.full_name, email: user.email });
        }
        
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        const newP2pWallet = (parseFloat(user.p2p_wallet) || 0) + p2pAmount;
        const newAccountBalance = (parseFloat(user.account_balance) || 0) + accountAmount;
        const newTotalBonusEarned = (parseFloat(user.total_bonus_earned) || 0) + totalAmount;

        await user.update({
            p2p_wallet: newP2pWallet,
            account_balance: newAccountBalance,
            total_bonus_earned: newTotalBonusEarned
        }, { transaction });

        // Mark bonuses as claimed
        const claimedAt = new Date();
        await BonusTransaction.update(
            { is_claimed: true, claimed_at: claimedAt },
            { where: whereClause, transaction }
        );

        await transaction.commit();

        res.status(200).json({
            message: 'Bonuses claimed successfully',
            data: {
                totalClaimedAmount: parseFloat(totalAmount.toFixed(2)),
                p2pWalletAmount: p2pAmount,
                accountBalanceAmount: accountAmount,
                claimedCount: unclaimedBonuses.length,
                newP2PWallet: parseFloat(newP2pWallet.toFixed(2)),
                newAccountBalance: parseFloat(newAccountBalance.toFixed(2))
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error claiming bonuses:', error);
        res.status(500).json({ message: 'Error claiming bonuses', error: error.message });
    }
};

/**
 * Get available downchain profit shares
 */
const getAvailableDownchainProfitShares = async (req, res) => {
    try {
        const userId = req.user?.id;
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
 * Calculate available profit shares from entire downchain
 */
const calculateDownchainProfitShares = async (uplineUserId) => {
    try {
        const Roi = require('../Models/roi.model');
        const ApexCoinRate = require('../Models/apexCoinRate.model');

        const uplineUser = await User.findByPk(uplineUserId);
        if (!uplineUser) {
            return { success: false, error: 'User not found', totalClaimable: 0, details: [] };
        }

        // Get current ROI rate and coin rate
        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });
        const coinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });

        if (!currentRoi || !coinRate) {
            return { success: false, error: 'ROI or coin rate not set', totalClaimable: 0, details: [] };
        }

        const currentRoiRate = parseFloat(currentRoi.rate);
        const apexCoinToDollarRate = parseFloat(coinRate.rate);
        const now = new Date();
        const millisecondsPerDay = 1000 * 60 * 60 * 24;

        // Find all users who have this upline user in their referral chain
        // We need to search users where their referral_chain JSON contains this userId
        const allUsers = await User.findAll({
            where: {
                referral_chain: {
                    [Op.like]: `%${uplineUserId}%`
                }
            }
        });

        // Filter to get actual downchain users
        const downchainUsers = allUsers.filter(u => {
            const chain = u.getReferralChainArray();
            return chain.includes(uplineUserId);
        });

        if (!downchainUsers || downchainUsers.length === 0) {
            return { success: true, totalClaimable: 0, details: [], message: 'No downchain users found' };
        }

        let totalClaimableShare = 0;
        const shareDetails = [];

        // Count active direct referrals
        const activeDirectReferrals = await countActiveDirectReferrals(uplineUserId);

        // Get last profit share claim dates
        const lastClaimDates = uplineUser.getLastProfitShareClaimDatesMap();

        for (const downchainUser of downchainUsers) {
            const chain = downchainUser.getReferralChainArray();
            const levelIndex = chain.indexOf(uplineUserId);

            if (levelIndex === -1) continue;

            const level = levelIndex + 1;

            if (level > 12 || activeDirectReferrals < level) {
                continue;
            }

            // Get active locked entries for this downchain user
            const activeEntries = await LockedCoinsEntry.findAll({
                where: { user_id: downchainUser.id, status: 'active' }
            });

            let downchainUserTotalClaimable = 0;

            for (const entry of activeEntries) {
                const lockStart = new Date(entry.lock_start_date);
                const lastClaimKey = `${downchainUser.id}_${entry.id}`;
                const lastClaimDateForThisUser = lastClaimDates.get(lastClaimKey) || lockStart;

                const daysSinceLastClaim = Math.max(0, Math.floor((now - new Date(lastClaimDateForThisUser)) / millisecondsPerDay));

                if (daysSinceLastClaim > 0) {
                    const entryAmount = parseFloat(entry.amount);
                    const monthlyProfitInCoins = (entryAmount * currentRoiRate) / 100;
                    const dailyProfitInCoins = monthlyProfitInCoins / 30;
                    const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                    const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;

                    downchainUserTotalClaimable += claimableProfitInDollars;
                }
            }

            if (downchainUserTotalClaimable > 0) {
                const sharePercentage = PROFIT_SHARE_PERCENTAGES[level];
                const shareAmount = (downchainUserTotalClaimable * sharePercentage) / 100;

                totalClaimableShare += shareAmount;

                shareDetails.push({
                    downchainUserId: downchainUser.id,
                    downchainUserName: downchainUser.full_name,
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
 * Claim profit shares from downchain
 */
const claimDownchainProfitShares = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user?.id;
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const Roi = require('../Models/roi.model');
        const ApexCoinRate = require('../Models/apexCoinRate.model');

        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Get current ROI rate and coin rate
        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        const coinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });

        if (!currentRoi || !coinRate) {
            await transaction.rollback();
            return res.status(400).json({ message: 'ROI or coin rate not set' });
        }

        const currentRoiRate = parseFloat(currentRoi.rate);
        const apexCoinToDollarRate = parseFloat(coinRate.rate);
        const now = new Date();
        const millisecondsPerDay = 1000 * 60 * 60 * 24;

        // Find all downchain users
        const allUsers = await User.findAll({
            where: {
                referral_chain: {
                    [Op.like]: `%${userId}%`
                }
            },
            transaction
        });

        const downchainUsers = allUsers.filter(u => {
            const chain = u.getReferralChainArray();
            return chain.includes(userId);
        });

        if (!downchainUsers || downchainUsers.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'No downchain users found',
                claimableAmount: 0
            });
        }

        let totalClaimedShare = 0;
        const claimDetails = [];
        const profitShareTransactions = [];

        const activeDirectReferrals = await countActiveDirectReferrals(userId);

        // Get and update last claim dates
        const lastClaimDates = user.getLastProfitShareClaimDatesMap();

        for (const downchainUser of downchainUsers) {
            const chain = downchainUser.getReferralChainArray();
            const levelIndex = chain.indexOf(userId);

            if (levelIndex === -1) continue;

            const level = levelIndex + 1;

            if (level > 12 || activeDirectReferrals < level) {
                continue;
            }

            const activeEntries = await LockedCoinsEntry.findAll({
                where: { user_id: downchainUser.id, status: 'active' },
                transaction
            });

            let downchainUserTotalClaimable = 0;
            const entryDetails = [];

            for (const entry of activeEntries) {
                const lockStart = new Date(entry.lock_start_date);
                const lastClaimKey = `${downchainUser.id}_${entry.id}`;
                const lastClaimDateForThisUser = lastClaimDates.get(lastClaimKey) || lockStart;

                const daysSinceLastClaim = Math.max(0, Math.floor((now - new Date(lastClaimDateForThisUser)) / millisecondsPerDay));

                if (daysSinceLastClaim > 0) {
                    const entryAmount = parseFloat(entry.amount);
                    const monthlyProfitInCoins = (entryAmount * currentRoiRate) / 100;
                    const dailyProfitInCoins = monthlyProfitInCoins / 30;
                    const claimableProfitInCoins = dailyProfitInCoins * daysSinceLastClaim;
                    const claimableProfitInDollars = claimableProfitInCoins * apexCoinToDollarRate;

                    downchainUserTotalClaimable += claimableProfitInDollars;

                    entryDetails.push({
                        entryId: entry.id,
                        amount: entryAmount,
                        daysSinceLastClaim: daysSinceLastClaim,
                        claimableProfit: parseFloat(claimableProfitInDollars.toFixed(2))
                    });

                    // Update last claim date
                    lastClaimDates.set(lastClaimKey, now);
                }
            }

            if (downchainUserTotalClaimable > 0) {
                const sharePercentage = PROFIT_SHARE_PERCENTAGES[level];
                const shareAmount = (downchainUserTotalClaimable * sharePercentage) / 100;

                totalClaimedShare += shareAmount;

                claimDetails.push({
                    downchainUserId: downchainUser.id,
                    downchainUserName: downchainUser.full_name,
                    level: level,
                    sharePercentage: sharePercentage,
                    downchainClaimableAmount: parseFloat(downchainUserTotalClaimable.toFixed(2)),
                    shareAmount: parseFloat(shareAmount.toFixed(2)),
                    entries: entryDetails
                });

                // Create profit share transaction record
                profitShareTransactions.push({
                    user_id: userId,
                    from_user_id: downchainUser.id,
                    roi_amount: downchainUserTotalClaimable,
                    share_percentage: sharePercentage,
                    share_amount: shareAmount,
                    level: level,
                    active_direct_referrals_at_time: activeDirectReferrals,
                    claim_date: now,
                    is_claimed: true,
                    claimed_at: now
                });
            }
        }

        if (totalClaimedShare === 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'No profit shares available to claim yet.',
                claimableAmount: 0
            });
        }

        // Save all profit share transactions
        await ProfitShareTransaction.bulkCreate(profitShareTransactions, { transaction });

        // Split the amount: 30% to P2P Wallet, 70% to Account Balance
        const p2pAmount = parseFloat((totalClaimedShare * 0.30).toFixed(2));
        const accountAmount = parseFloat((totalClaimedShare * 0.70).toFixed(2));

        // Update user's balances and total profit share earned
        const newP2PWallet = (parseFloat(user.p2p_wallet) || 0) + p2pAmount;
        const newAccountBalance = (parseFloat(user.account_balance) || 0) + accountAmount;
        const newTotalProfitShareEarned = (parseFloat(user.total_profit_share_earned) || 0) + totalClaimedShare;

        user.setLastProfitShareClaimDatesMap(lastClaimDates);

        await user.update({
            p2p_wallet: newP2PWallet,
            account_balance: newAccountBalance,
            total_profit_share_earned: newTotalProfitShareEarned,
            last_profit_share_claim_dates: user.last_profit_share_claim_dates
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'Downchain profit shares claimed successfully',
            data: {
                totalClaimedAmount: parseFloat(totalClaimedShare.toFixed(2)),
                p2pWalletAmount: p2pAmount,
                accountBalanceAmount: accountAmount,
                newP2PWallet: parseFloat(newP2PWallet.toFixed(2)),
                newAccountBalance: parseFloat(newAccountBalance.toFixed(2)),
                totalProfitShareEarned: parseFloat(newTotalProfitShareEarned.toFixed(2)),
                claimDetails: claimDetails,
                claimedAt: now,
                activeDirectReferrals: activeDirectReferrals,
                unlockedLevels: Math.min(activeDirectReferrals, 12),
                downchainUsersProcessed: claimDetails.length
            }
        });
    } catch (error) {
        await transaction.rollback();
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
