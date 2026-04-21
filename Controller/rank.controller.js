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
    checkMinimumDirectRequirement,
    RANK_LEVELS
} = require('../utils/rankCalculator');
const {
    rebalanceLegsByStake,
    getAllLegsSummary
} = require('../utils/legAssignment');
const { createWalletLedgerEntry } = require('../utils/walletLedger.util');

const isSelfOrAdmin = (req, userId) => req.user && (req.user.role === 'admin' || req.user.id === userId);

const LEG_PROGRESS_WEIGHTS = {
    leg1: 40,
    leg2: 30,
    leg3: 15,
    leg4: 15
};

const ONE_TIME_RANK_REWARD_PERIOD = 'onetime';

const normalizeLegUsers = (rawLegUsers) => {
    if (Array.isArray(rawLegUsers)) {
        return rawLegUsers.filter(Boolean);
    }

    if (typeof rawLegUsers === 'string') {
        const trimmed = rawLegUsers.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(Boolean);
            }
        } catch (error) {
            // Fall back to comma-separated parsing for malformed legacy values.
        }

        return trimmed
            .split(',')
            .map((item) => item.replace(/[\[\]"]+/g, '').trim())
            .filter(Boolean);
    }

    return [];
};

const getEmptyLegWiseBreakdown = () => ({
    leg1: { qualifyingCount: 0, nonQualifyingCount: 0, qualifyingUsers: [], nonQualifyingUsers: [] },
    leg2: { qualifyingCount: 0, nonQualifyingCount: 0, qualifyingUsers: [], nonQualifyingUsers: [] },
    leg3: { qualifyingCount: 0, nonQualifyingCount: 0, qualifyingUsers: [], nonQualifyingUsers: [] },
    leg4: { qualifyingCount: 0, nonQualifyingCount: 0, qualifyingUsers: [], nonQualifyingUsers: [] },
    unassigned: { qualifyingCount: 0, nonQualifyingCount: 0, qualifyingUsers: [], nonQualifyingUsers: [] }
});

const buildLegWiseDirectBreakdown = (rootUser, minimumDirectRequirement) => {
    if (!minimumDirectRequirement) {
        return getEmptyLegWiseBreakdown();
    }

    const legWise = getEmptyLegWiseBreakdown();
    const legSets = {
        leg1: new Set(normalizeLegUsers(rootUser?.leg_1_users).map((id) => String(id))),
        leg2: new Set(normalizeLegUsers(rootUser?.leg_2_users).map((id) => String(id))),
        leg3: new Set(normalizeLegUsers(rootUser?.leg_3_users).map((id) => String(id))),
        leg4: new Set(normalizeLegUsers(rootUser?.leg_4_users).map((id) => String(id)))
    };

    const getBucketKey = (userId) => {
        const normalizedUserId = String(userId);
        if (legSets.leg1.has(normalizedUserId)) return 'leg1';
        if (legSets.leg2.has(normalizedUserId)) return 'leg2';
        if (legSets.leg3.has(normalizedUserId)) return 'leg3';
        if (legSets.leg4.has(normalizedUserId)) return 'leg4';
        return 'unassigned';
    };

    const qualifyingUsers = minimumDirectRequirement.qualifyingDirectUsers || [];
    const nonQualifyingUsers = minimumDirectRequirement.nonQualifyingDirectUsers || [];

    qualifyingUsers.forEach((directUser) => {
        const bucketKey = getBucketKey(directUser.userId);
        legWise[bucketKey].qualifyingUsers.push(directUser);
        legWise[bucketKey].qualifyingCount += 1;
    });

    nonQualifyingUsers.forEach((directUser) => {
        const bucketKey = getBucketKey(directUser.userId);
        legWise[bucketKey].nonQualifyingUsers.push(directUser);
        legWise[bucketKey].nonQualifyingCount += 1;
    });

    return legWise;
};

const roundToTwo = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getLegCompletionRatio = (currentAmount, requiredAmount) => {
    if (requiredAmount <= 0) return 1;
    const ratio = currentAmount / requiredAmount;
    return Math.min(Math.max(ratio, 0), 1);
};

const calculateWeightedLegProgress = ({ legSales, legMins }) => {
    const legs = [
        {
            key: 'leg1',
            displayName: 'Leg 1',
            weight: LEG_PROGRESS_WEIGHTS.leg1,
            currentAmount: legSales.leg1,
            requiredAmount: legMins.leg1
        },
        {
            key: 'leg2',
            displayName: 'Leg 2',
            weight: LEG_PROGRESS_WEIGHTS.leg2,
            currentAmount: legSales.leg2,
            requiredAmount: legMins.leg2
        },
        {
            key: 'leg3',
            displayName: 'Leg 3',
            weight: LEG_PROGRESS_WEIGHTS.leg3,
            currentAmount: legSales.leg3,
            requiredAmount: legMins.leg3
        },
        {
            key: 'leg4',
            displayName: 'Leg 4',
            weight: LEG_PROGRESS_WEIGHTS.leg4,
            currentAmount: legSales.leg4,
            requiredAmount: legMins.leg4
        }
    ].map((leg) => {
        const completionRatio = getLegCompletionRatio(leg.currentAmount, leg.requiredAmount);
        const weightedContribution = roundToTwo(completionRatio * leg.weight);
        const remainingAmount = Math.max(0, leg.requiredAmount - leg.currentAmount);

        return {
            ...leg,
            completionPercentage: roundToTwo(completionRatio * 100),
            weightedContribution,
            remainingAmount: roundToTwo(remainingAmount)
        };
    });

    const progressPercentage = roundToTwo(
        Math.min(
            legs.reduce((sum, leg) => sum + leg.weightedContribution, 0),
            100
        )
    );

    return {
        progressPercentage,
        legs
    };
};

const hasMetRankLegRequirements = (user, rank) => {
    if (!user || !rank) {
        return false;
    }

    const leg1Sales = parseFloat(user.leg_1_sales) || 0;
    const leg2Sales = parseFloat(user.leg_2_sales) || 0;
    const leg3Sales = parseFloat(user.leg_3_sales) || 0;
    const leg4Sales = parseFloat(user.leg_4_sales) || 0;

    return (
        leg1Sales >= (parseFloat(rank.leg_1_min) || 0) &&
        leg2Sales >= (parseFloat(rank.leg_2_min) || 0) &&
        leg3Sales >= (parseFloat(rank.leg_3_min) || 0) &&
        leg4Sales >= (parseFloat(rank.leg_4_min) || 0)
    );
};

const ensureOneTimeRankReward = async (userId) => {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'current_rank', 'leg_1_sales', 'leg_2_sales', 'leg_3_sales', 'leg_4_sales']
    });

    if (!user || !user.current_rank || user.current_rank === 'none') {
        return { reward: null, created: false, eligible: false, reason: 'No active rank' };
    }

    const rank = await Rank.findOne({
        where: {
            rank_name: user.current_rank,
            status: 'active'
        }
    });

    if (!rank) {
        return { reward: null, created: false, eligible: false, reason: 'Active rank config not found' };
    }

    if (!hasMetRankLegRequirements(user, rank)) {
        return {
            reward: null,
            created: false,
            eligible: false,
            reason: 'Current rank leg requirements not met'
        };
    }

    // One-time rank reward: if any record already exists for the same user/rank,
    // do not create a duplicate even if user gets downgraded and re-upgraded later.
    const existingReward = await RankReward.findOne({
        where: {
            user_id: userId,
            rank_id: rank.id
        }
    });

    if (existingReward) {
        return {
            reward: existingReward,
            created: false,
            eligible: true,
            rewardPeriod: existingReward.reward_period
        };
    }

    const reward = await RankReward.create({
        user_id: userId,
        rank_id: rank.id,
        reward_period: ONE_TIME_RANK_REWARD_PERIOD,
        reward_amount: rank.monthly_reward,
        status: 'pending'
    });

    return {
        reward,
        created: true,
        eligible: true,
        rewardPeriod: reward.reward_period
    };
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
                'leg_1_users',
                'leg_2_users',
                'leg_3_users',
                'leg_4_users',
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

        // Get current direct requirement breakdown including the qualifying user list.
        const minimumDirectRequirement = await checkMinimumDirectRequirement(userId);
        const legWiseDirectBreakdown = buildLegWiseDirectBreakdown(user, minimumDirectRequirement);

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
                    const legSales = {
                        leg1: parseFloat(user.leg_1_sales) || 0,
                        leg2: parseFloat(user.leg_2_sales) || 0,
                        leg3: parseFloat(user.leg_3_sales) || 0,
                        leg4: parseFloat(user.leg_4_sales) || 0
                    };

                    const legMins = {
                        leg1: parseFloat(nextRank.leg_1_min) || 0,
                        leg2: parseFloat(nextRank.leg_2_min) || 0,
                        leg3: parseFloat(nextRank.leg_3_min) || 0,
                        leg4: parseFloat(nextRank.leg_4_min) || 0
                    };

                    // Calculate how much each leg needs
                    const leg1Remaining = Math.max(0, legMins.leg1 - legSales.leg1);
                    const leg2Remaining = Math.max(0, legMins.leg2 - legSales.leg2);
                    const leg3Remaining = Math.max(0, legMins.leg3 - legSales.leg3);
                    const leg4Remaining = Math.max(0, legMins.leg4 - legSales.leg4);

                    // Total remaining across all legs
                    const totalRemaining = leg1Remaining + leg2Remaining + leg3Remaining + leg4Remaining;
                    const weightedProgress = calculateWeightedLegProgress({ legSales, legMins });

                    nextRankData = {
                        name: nextRankName,
                        progressPercentage: weightedProgress.progressPercentage,
                        remainingNeeded: parseFloat(totalRemaining.toFixed(8)),
                        progressLabel: `$${totalRemaining.toFixed(2)} more Team Volume needed`,
                        calculationMethod: 'weighted_leg_completion',
                        legWeights: LEG_PROGRESS_WEIGHTS,
                        legProgress: weightedProgress.legs
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
            minimumDirectRequirement: {
                requiredDirects: minimumDirectRequirement.requiredDirects,
                minStakePerDirect: minimumDirectRequirement.minStakePerDirect,
                totalDirects: minimumDirectRequirement.totalDirects,
                qualifyingDirects: minimumDirectRequirement.qualifyingDirects,
                countingDepth: minimumDirectRequirement.countingDepth,
                remainingNeeded: Math.max(
                    0,
                    minimumDirectRequirement.requiredDirects - minimumDirectRequirement.qualifyingDirects
                ),
                meetsRequirement: minimumDirectRequirement.meetsRequirement,
                qualifyingDirectUsers: minimumDirectRequirement.qualifyingDirectUsers,
                nonQualifyingDirectUsers: minimumDirectRequirement.nonQualifyingDirectUsers,
                legWise: legWiseDirectBreakdown
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
        const rewardResult = await ensureOneTimeRankReward(userId);
        if (rewardResult.reward) {
            rewardIssued = {
                id: rewardResult.reward.id,
                rewardPeriod: rewardResult.reward.reward_period,
                amount: parseFloat(rewardResult.reward.reward_amount),
                status: rewardResult.reward.status,
                created: rewardResult.created
            };
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
                'leg_4_sales',
                'leg_1_users',
                'leg_2_users',
                'leg_3_users',
                'leg_4_users'
            ]
        });

        const minimumDirectRequirement = await checkMinimumDirectRequirement(userId);
        const legWiseDirectBreakdown = buildLegWiseDirectBreakdown(updatedUser, minimumDirectRequirement);

        return res.status(200).json({
            success: true,
            message: 'Rank recalculated',
            rankUpdate,
            rewardIssued,
            warning,
            minimumDirectRequirement: {
                requiredDirects: minimumDirectRequirement.requiredDirects,
                minStakePerDirect: minimumDirectRequirement.minStakePerDirect,
                totalDirects: minimumDirectRequirement.totalDirects,
                qualifyingDirects: minimumDirectRequirement.qualifyingDirects,
                countingDepth: minimumDirectRequirement.countingDepth,
                remainingNeeded: Math.max(
                    0,
                    minimumDirectRequirement.requiredDirects - minimumDirectRequirement.qualifyingDirects
                ),
                meetsRequirement: minimumDirectRequirement.meetsRequirement,
                qualifyingDirectUsers: minimumDirectRequirement.qualifyingDirectUsers,
                nonQualifyingDirectUsers: minimumDirectRequirement.nonQualifyingDirectUsers,
                legWise: legWiseDirectBreakdown
            },
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

        const user = await User.findByPk(userId, {
            attributes: [
                'id',
                'current_rank',
                'current_rank_level',
                'leg_1_sales',
                'leg_2_sales',
                'leg_3_sales',
                'leg_4_sales'
            ]
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get all legs summary
        const legsSummary = await getAllLegsSummary(userId);

        // Target the next rank for progression; if already top rank, target current rank for maintenance.
        const currentRankName = user.current_rank || 'none';
        const currentRankLevel = RANK_LEVELS[currentRankName] || 0;
        const nextRankName = Object.keys(RANK_LEVELS).find(
            (rankName) => RANK_LEVELS[rankName] === currentRankLevel + 1
        );
        const targetRankName = nextRankName || currentRankName;

        let targetRank = null;
        if (targetRankName && targetRankName !== 'none') {
            targetRank = await Rank.findOne({
                where: {
                    rank_name: targetRankName,
                    status: 'active'
                }
            });
        }

        const requiredByLeg = targetRank
            ? [
                  parseFloat(targetRank.leg_1_min) || 0,
                  parseFloat(targetRank.leg_2_min) || 0,
                  parseFloat(targetRank.leg_3_min) || 0,
                  parseFloat(targetRank.leg_4_min) || 0
              ]
            : [0, 0, 0, 0];

        const countedSalesByLeg = [
            parseFloat(user.leg_1_sales) || 0,
            parseFloat(user.leg_2_sales) || 0,
            parseFloat(user.leg_3_sales) || 0,
            parseFloat(user.leg_4_sales) || 0
        ];

        const legsWithCompletion = legsSummary.legs.map((leg, index) => {
            const requiredAmount = requiredByLeg[index] || 0;
            const currentAmount = countedSalesByLeg[index] || 0;
            const remainingAmount = Math.max(0, requiredAmount - currentAmount);
            const isCompleted = requiredAmount === 0 ? true : currentAmount >= requiredAmount;

            return {
                ...leg,
                completion: {
                    metric: 'counted_leg_sales',
                    requiredAmount,
                    currentAmount,
                    remainingAmount,
                    isCompleted,
                    completionRule: 'Leg is complete when currentAmount >= requiredAmount'
                }
            };
        });

        const completedLegs = legsWithCompletion.filter((leg) => leg.completion.isCompleted).length;

        return res.status(200).json({
            success: true,
            targetRankForLegCompletion: targetRank
                ? {
                      rankName: targetRank.rank_name,
                      rankLevel: targetRank.rank_level,
                      basedOn: nextRankName ? 'next_rank_progression' : 'current_rank_maintenance'
                  }
                : null,
            legCompletionSummary: {
                totalLegs: 4,
                completedLegs,
                allLegsCompleted: completedLegs === 4
            },
            legs: {
                ...legsSummary,
                legs: legsWithCompletion
            }
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

        const rewardRank = await Rank.findByPk(reward.rank_id, {
            transaction
        });

        if (!rewardRank || rewardRank.status !== 'active') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Reward rank is not active' });
        }

        // Reward can only be claimed for the user's current rank when that rank's leg requirements are met.
        if (user.current_rank !== rewardRank.rank_name) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Reward can only be claimed for your current rank' });
        }

        if (!hasMetRankLegRequirements(user, rewardRank)) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Current rank leg requirements are not met yet' });
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

        const previousAccountBalance = parseFloat(user.account_balance) || 0;
        const previousP2PBalance = parseFloat(user.p2p_wallet) || 0;
        const newAccountBalance = previousAccountBalance + accountAmount;
        const newP2PBalance = previousP2PBalance + p2pAmount;
        const newTotalEarned = parseFloat(user.total_rank_rewards_earned) + rewardAmount;

        await user.update({
            account_balance: newAccountBalance,
            p2p_wallet: newP2PBalance,
            total_rank_rewards_earned: newTotalEarned
        }, { transaction });

        await createWalletLedgerEntry({
            userId,
            walletType: 'account_balance',
            entryType: 'credit',
            amount: accountAmount,
            balanceBefore: previousAccountBalance,
            balanceAfter: newAccountBalance,
            sourceType: 'rank_reward_claim',
            sourceId: reward.id,
            description: 'Rank reward claimed to main wallet',
            metadata: {
                rankId: reward.rank_id,
                rewardPeriod: reward.reward_period,
                rewardAmount,
                split: '70_account_30_p2p'
            },
            transaction
        });

        await createWalletLedgerEntry({
            userId,
            walletType: 'p2p_wallet',
            entryType: 'credit',
            amount: p2pAmount,
            balanceBefore: previousP2PBalance,
            balanceAfter: newP2PBalance,
            sourceType: 'rank_reward_claim',
            sourceId: reward.id,
            description: 'Rank reward claimed to P2P wallet',
            metadata: {
                rankId: reward.rank_id,
                rewardPeriod: reward.reward_period,
                rewardAmount,
                split: '70_account_30_p2p'
            },
            transaction
        });

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

                    // Create pending reward only after a full reward period at the current rank is completed.
                    const rewardResult = await ensureOneTimeRankReward(user.id);
                    if (rewardResult.created) {
                        results.rewardsCreated++;
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
                min_direct_requirement: 4,
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
