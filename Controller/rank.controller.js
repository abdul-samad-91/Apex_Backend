const User = require('../Models/user.model');
const Rank = require('../Models/rank.model');
const RankHistory = require('../Models/rankHistory.model');
const RankReward = require('../Models/rankReward.model');
const { sequelize } = require('../Config/DB');
const {
    calculateUserRank,
    updateUserRank,
    checkRankDowngradeWarning,
    getUsersForRankRecalculation,
    RANK_LEVELS
} = require('../utils/rankCalculator');
const {
    rebalanceLegsByStake,
    getAllLegsSummary
} = require('../utils/legAssignment');

const isSelfOrAdmin = (req, userId) => req.user && (req.user.role === 'admin' || req.user.id === userId);

const getCurrentRewardPeriod = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
};

const ensureRankRewardForUpgrade = async (userId, rankName) => {
    const rank = await Rank.findOne({
        where: {
            rank_name: rankName,
            status: 'active'
        }
    });

    if (!rank) {
        return { reward: null, created: false };
    }

    const rewardPeriod = getCurrentRewardPeriod();
    const [reward, created] = await RankReward.findOrCreate({
        where: {
            user_id: userId,
            rank_id: rank.id,
            reward_period: rewardPeriod
        },
        defaults: {
            reward_amount: rank.monthly_reward,
            status: 'pending'
        }
    });

    return { reward, created };
};

/**
 * Get user's current rank and rank details
 * GET /api/ranks/user/:userId
 */
const getUserRank = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!isSelfOrAdmin(req, userId)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId, {
            attributes: [
                'id',
                'full_name',
                'current_rank',
                'current_rank_level',
                'rank_achieved_date',
                'total_sales_amount',
                'leg_1_sales',
                'leg_2_sales',
                'leg_3_sales',
                'leg_4_sales',
                'direct_count',
                'min_direct_requirement_met',
                'total_rank_rewards_earned'
            ]
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get rank details from database
        let rankDetails = null;
        if (user.current_rank && user.current_rank !== 'none') {
            rankDetails = await Rank.findOne({
                where: { rank_name: user.current_rank }
            });
        }

        // Calculate next rank and progress information
        let nextRankData = null;
        if (user.current_rank !== 'global_partner') {
            // Find next rank level
            const currentRankLevel = RANK_LEVELS[user.current_rank] || 0;
            const nextRankLevel = currentRankLevel + 1;
            
            // Find next rank name by level
            const nextRankName = Object.keys(RANK_LEVELS).find(
                rank => RANK_LEVELS[rank] === nextRankLevel
            );

            if (nextRankName) {
                const nextRank = await Rank.findOne({
                    where: { rank_name: nextRankName }
                });

                if (nextRank) {
                    const leg1Sales = parseFloat(user.leg_1_sales) || 0;
                    const leg2Sales = parseFloat(user.leg_2_sales) || 0;
                    const leg3Sales = parseFloat(user.leg_3_sales) || 0;
                    const leg4Sales = parseFloat(user.leg_4_sales) || 0;

                    const leg1Min = parseFloat(nextRank.leg_1_min) || 0;
                    const leg2Min = parseFloat(nextRank.leg_2_min) || 0;
                    const leg3Min = parseFloat(nextRank.leg_3_min) || 0;
                    const leg4Min = parseFloat(nextRank.leg_4_min) || 0;

                    // Calculate how much each leg needs
                    const leg1Remaining = Math.max(0, leg1Min - leg1Sales);
                    const leg2Remaining = Math.max(0, leg2Min - leg2Sales);
                    const leg3Remaining = Math.max(0, leg3Min - leg3Sales);
                    const leg4Remaining = Math.max(0, leg4Min - leg4Sales);

                    // Total remaining across all legs
                    const totalRemaining = leg1Remaining + leg2Remaining + leg3Remaining + leg4Remaining;
                    const requiredTotal = leg1Min + leg2Min + leg3Min + leg4Min;
                    const currentTotal = leg1Sales + leg2Sales + leg3Sales + leg4Sales;

                    // Calculate overall progress percentage
                    const overallProgressPercentage = Math.min(
                        Math.round(((currentTotal / requiredTotal) * 100) * 100) / 100,
                        100
                    );

                    nextRankData = {
                        name: nextRankName,
                        progressPercentage: overallProgressPercentage,
                        remainingNeeded: parseFloat(totalRemaining.toFixed(8)),
                        progressLabel: `$${totalRemaining.toFixed(2)} more Team Volume needed`
                    };
                }
            }
        }

        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                name: user.full_name,
                currentRank: user.current_rank,
                rankLevel: user.current_rank_level,
                rankAchievedDate: user.rank_achieved_date,
                totalSales: parseFloat(user.total_sales_amount) || 0,
                legSales: {
                    leg1: parseFloat(user.leg_1_sales) || 0,
                    leg2: parseFloat(user.leg_2_sales) || 0,
                    leg3: parseFloat(user.leg_3_sales) || 0,
                    leg4: parseFloat(user.leg_4_sales) || 0
                },
                directCount: user.direct_count,
                meetsMinDirectRequirement: user.min_direct_requirement_met,
                totalRewardsEarned: parseFloat(user.total_rank_rewards_earned) || 0
            },
            rankDetails: rankDetails
                ? {
                      name: rankDetails.rank_name,
                      level: rankDetails.rank_level,
                      requiredSales: parseFloat(rankDetails.required_sales),
                      monthlyReward: parseFloat(rankDetails.monthly_reward),
                      description: rankDetails.description
                  }
                : null,
            progressBar: nextRankData
        });
    } catch (error) {
        console.error('Error getting user rank:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Get all rank thresholds and descriptions
 * GET /api/ranks/all
 */
const getAllRanks = async (req, res) => {
    try {
        const ranks = await Rank.findAll({
            where: { status: 'active' },
            order: [['rank_level', 'ASC']]
        });

        return res.status(200).json({
            success: true,
            ranks: ranks.map(rank => ({
                id: rank.id,
                name: rank.rank_name,
                level: rank.rank_level,
                requiredSales: parseFloat(rank.required_sales),
                monthlyReward: parseFloat(rank.monthly_reward),
                minDirectRequirement: rank.min_direct_requirement,
                minStakePerDirect: parseFloat(rank.min_stake_per_direct),
                description: rank.description
            }))
        });
    } catch (error) {
        console.error('Error getting ranks:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Manually trigger rank recalculation for a user
 * POST /api/ranks/recalculate/:userId
 */
const recalculateUserRank = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!isSelfOrAdmin(req, userId)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Keep leg balancing consistent with weekly processing.
        await rebalanceLegsByStake(userId);

        // Update the user's rank
        const rankUpdate = await updateUserRank(userId);

        let rewardIssued = null;
        if (rankUpdate.changed && rankUpdate.changeType === 'upgrade') {
            const rewardResult = await ensureRankRewardForUpgrade(userId, rankUpdate.newRank);
            if (rewardResult.reward) {
                rewardIssued = {
                    id: rewardResult.reward.id,
                    rewardPeriod: rewardResult.reward.reward_period,
                    amount: parseFloat(rewardResult.reward.reward_amount),
                    status: rewardResult.reward.status,
                    created: rewardResult.created
                };
            }
        }

        // Check for downgrade warning
        const warning = await checkRankDowngradeWarning(userId);

        // Get updated user info
        const updatedUser = await User.findByPk(userId, {
            attributes: [
                'current_rank',
                'current_rank_level',
                'total_sales_amount',
                'leg_1_sales',
                'leg_2_sales',
                'leg_3_sales',
                'leg_4_sales'
            ]
        });

        return res.status(200).json({
            success: true,
            message: 'Rank recalculated',
            rankUpdate,
            rewardIssued,
            warning,
            userInfo: {
                currentRank: updatedUser.current_rank,
                rankLevel: updatedUser.current_rank_level,
                totalSales: parseFloat(updatedUser.total_sales_amount),
                legSales: {
                    leg1: parseFloat(updatedUser.leg_1_sales),
                    leg2: parseFloat(updatedUser.leg_2_sales),
                    leg3: parseFloat(updatedUser.leg_3_sales),
                    leg4: parseFloat(updatedUser.leg_4_sales)
                }
            }
        });
    } catch (error) {
        console.error('Error recalculating user rank:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Get user's leg information (members and their details)
 * GET /api/ranks/legs/:userId
 */
const getUserLegs = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!isSelfOrAdmin(req, userId)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get all legs summary
        const legsSummary = await getAllLegsSummary(userId);

        return res.status(200).json({
            success: true,
            legs: legsSummary
        });
    } catch (error) {
        console.error('Error getting user legs:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Get rank history for a user
 * GET /api/ranks/history/:userId
 */
const getUserRankHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        if (!isSelfOrAdmin(req, userId)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const history = await RankHistory.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const total = await RankHistory.count({ where: { user_id: userId } });

        return res.status(200).json({
            success: true,
            history: history.map(h => ({
                id: h.id,
                previousRank: h.previous_rank,
                newRank: h.new_rank,
                changeType: h.change_type,
                reason: h.reason,
                totalSalesAtChange: parseFloat(h.total_sales_at_change),
                timestamp: h.changed_at
            })),
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Error getting rank history:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Get pending rank rewards for a user
 * GET /api/ranks/rewards/:userId
 */
const getUserRankRewards = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status = 'pending' } = req.query; // pending or claimed

        if (!isSelfOrAdmin(req, userId)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const whereClause = { user_id: userId };
        if (status) {
            whereClause.status = status;
        }

        const rewards = await RankReward.findAll({
            where: whereClause,
            include: [
                {
                    model: Rank,
                    as: 'rank',
                    attributes: ['rank_name', 'rank_level']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            rewards: rewards.map(r => ({
                id: r.id,
                rewardPeriod: r.reward_period,
                rank: r.rank ? r.rank.rank_name : null,
                rankLevel: r.rank ? r.rank.rank_level : null,
                amount: parseFloat(r.reward_amount),
                status: r.status,
                claimedAt: r.claimed_at
            }))
        });
    } catch (error) {
        console.error('Error getting user rank rewards:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Claim pending rank reward (manual claim)
 * 30% goes to p2p_wallet, 70% goes to account_balance
 * POST /api/ranks/rewards/claim/:rewardId
 */
const claimRankReward = async (req, res) => {
    let transaction;

    try {
        transaction = await sequelize.transaction();
        const { rewardId } = req.params;
        const userId = req.user.id;

        const reward = await RankReward.findByPk(rewardId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!reward) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Reward not found' });
        }

        // Verify user owns this reward
        if (reward.user_id !== userId) {
            await transaction.rollback();
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if already claimed
        if (reward.status === 'claimed') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Reward already claimed' });
        }

        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Update reward status
        const claimedAt = new Date();
        await reward.update({
            status: 'claimed',
            claimed_at: claimedAt,
            claimed_by: userId
        }, { transaction });

        // Split reward: 30% to p2p_wallet, 70% to account_balance
        const rewardAmount = parseFloat(reward.reward_amount);
        const p2pAmount = parseFloat((rewardAmount * 0.3).toFixed(8));
        const accountAmount = parseFloat((rewardAmount * 0.7).toFixed(8));

        const newAccountBalance = parseFloat(user.account_balance) + accountAmount;
        const newP2PBalance = parseFloat(user.p2p_wallet) + p2pAmount;
        const newTotalEarned = parseFloat(user.total_rank_rewards_earned) + rewardAmount;

        await user.update({
            account_balance: newAccountBalance,
            p2p_wallet: newP2PBalance,
            total_rank_rewards_earned: newTotalEarned
        }, { transaction });

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Reward claimed successfully',
            reward: {
                id: reward.id,
                totalAmount: rewardAmount,
                p2pAmount: p2pAmount,
                accountAmount: accountAmount,
                status: 'claimed',
                claimedAt: claimedAt
            },
            userBalance: {
                accountBalance: parseFloat(newAccountBalance.toFixed(8)),
                p2pWallet: parseFloat(newP2PBalance.toFixed(8)),
                totalRewardsEarned: parseFloat(newTotalEarned.toFixed(8))
            }
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error claiming reward:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Admin: Process weekly rank recalculation for all users
 * POST /api/ranks/admin/process-weekly-recalculation
 * This should be called once weekly via cron job
 */
const processWeeklyRankRecalculation = async (req, res) => {
    try {
        const results = {
            processed: 0,
            upgraded: 0,
            downgraded: 0,
            warned: 0,
            rewardsCreated: 0,
            errors: 0,
            details: []
        };

        const batchSize = 500;
        let offset = 0;

        while (true) {
            const users = await getUsersForRankRecalculation({
                limit: batchSize,
                offset
            });

            if (users.length === 0) {
                break;
            }

            for (const user of users) {
                try {
                    // Rebalance legs based on current stakes.
                    await rebalanceLegsByStake(user.id);

                    // Recalculate rank.
                    const rankUpdate = await updateUserRank(user.id);

                    // Create pending reward when user upgrades to a new rank.
                    if (rankUpdate.changed && rankUpdate.changeType === 'upgrade') {
                        const rewardResult = await ensureRankRewardForUpgrade(user.id, rankUpdate.newRank);
                        if (rewardResult.created) {
                            results.rewardsCreated++;
                        }
                    }

                    // Check for downgrade warning.
                    const warning = await checkRankDowngradeWarning(user.id);

                    // Track result.
                    if (rankUpdate.changed) {
                        if (rankUpdate.changeType === 'upgrade') {
                            results.upgraded++;
                        } else {
                            results.downgraded++;
                        }
                        results.details.push({
                            userId: user.id,
                            change: rankUpdate.changeType,
                            from: rankUpdate.previousRank,
                            to: rankUpdate.newRank
                        });
                    }

                    if (warning) {
                        results.warned++;
                        results.details.push({
                            userId: user.id,
                            warning: warning.warningMessage
                        });
                    }

                    results.processed++;
                } catch (error) {
                    console.error(`Error processing user ${user.id}:`, error);
                    results.errors++;
                }
            }

            offset += users.length;
        }

        return res.status(200).json({
            success: true,
            message: 'Weekly rank recalculation completed',
            results,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error processing weekly rank recalculation:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Admin: Initialize rank configuration in database
 * POST /api/ranks/admin/initialize-ranks
 * Call once during setup
 */
const initializeRanks = async (req, res) => {
    try {
        // Check if ranks already exist
        const existingRanks = await Rank.count();
        if (existingRanks > 0) {
            return res.status(400).json({
                message: 'Ranks already initialized'
            });
        }

        const rankData = [
            {
                rank_name: 'apex_associate',
                rank_level: 1,
                required_sales: 1000,
                leg_1_min: 400,
                leg_2_min: 300,
                leg_3_min: 150,
                leg_4_min: 150,
                monthly_reward: 100,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Entry level rank'
            },
            {
                rank_name: 'apex_manager',
                rank_level: 2,
                required_sales: 6000,
                leg_1_min: 2400,
                leg_2_min: 1800,
                leg_3_min: 900,
                leg_4_min: 900,
                monthly_reward: 360,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Manager level rank'
            },
            {
                rank_name: 'apex_sapphire',
                rank_level: 3,
                required_sales: 15000,
                leg_1_min: 6000,
                leg_2_min: 4500,
                leg_3_min: 2250,
                leg_4_min: 2250,
                monthly_reward: 900,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Sapphire level rank'
            },
            {
                rank_name: 'apex_crown',
                rank_level: 4,
                required_sales: 30000,
                leg_1_min: 12000,
                leg_2_min: 9000,
                leg_3_min: 4500,
                leg_4_min: 4500,
                monthly_reward: 1800,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Crown level rank'
            },
            {
                rank_name: 'apex_diamond',
                rank_level: 5,
                required_sales: 50000,
                leg_1_min: 20000,
                leg_2_min: 15000,
                leg_3_min: 7500,
                leg_4_min: 7500,
                monthly_reward: 3000,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Diamond level rank'
            },
            {
                rank_name: 'apex_legend',
                rank_level: 6,
                required_sales: 100000,
                leg_1_min: 40000,
                leg_2_min: 30000,
                leg_3_min: 15000,
                leg_4_min: 15000,
                monthly_reward: 6000,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Legend level rank'
            },
            {
                rank_name: 'global_partner',
                rank_level: 7,
                required_sales: 250000,
                leg_1_min: 100000,
                leg_2_min: 75000,
                leg_3_min: 37500,
                leg_4_min: 37500,
                monthly_reward: 15000,
                min_direct_requirement: 8,
                min_stake_per_direct: 50,
                description: 'Highest level rank'
            }
        ];

        const createdRanks = await Rank.bulkCreate(rankData);

        return res.status(201).json({
            success: true,
            message: 'Ranks initialized successfully',
            ranksCreated: createdRanks.length,
            ranks: createdRanks
        });
    } catch (error) {
        console.error('Error initializing ranks:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getUserRank,
    getAllRanks,
    recalculateUserRank,
    getUserLegs,
    getUserRankHistory,
    getUserRankRewards,
    claimRankReward,
    processWeeklyRankRecalculation,
    initializeRanks
};
