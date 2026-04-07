const User = require('../Models/user.model');
const LockedCoinsEntry = require('../Models/lockedCoinsEntry.model');
const Rank = require('../Models/rank.model');
const RankHistory = require('../Models/rankHistory.model');

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

// Rank thresholds based on the image provided
const RANK_THRESHOLDS = {
    apex_associate: 1000,
    apex_manager: 6000,
    apex_sapphire: 15000,
    apex_crown: 30000,
    apex_diamond: 50000,
    apex_legend: 100000,
    global_partner: 250000
};

// Rank levels mapping
const RANK_LEVELS = {
    none: 0,
    apex_associate: 1,
    apex_manager: 2,
    apex_sapphire: 3,
    apex_crown: 4,
    apex_diamond: 5,
    apex_legend: 6,
    global_partner: 7
};

/**
 * Calculate total sales from all 4 legs (8 levels deep per leg)
 * User must have met minimum direct requirement to count sales
 * @param {string} userId - Root user ID
 * @returns {Promise<Object>} Sales data for all 4 legs and total
 */
const calculateLegSales = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get all 4 legs
        const leg1Users = normalizeLegUsers(user.leg_1_users);
        const leg2Users = normalizeLegUsers(user.leg_2_users);
        const leg3Users = normalizeLegUsers(user.leg_3_users);
        const leg4Users = normalizeLegUsers(user.leg_4_users);

        // Calculate sales for each leg
        const leg1Sales = await calculateLegTotalSales(leg1Users);
        const leg2Sales = await calculateLegTotalSales(leg2Users);
        const leg3Sales = await calculateLegTotalSales(leg3Users);
        const leg4Sales = await calculateLegTotalSales(leg4Users);

        const totalSales = leg1Sales + leg2Sales + leg3Sales + leg4Sales;

        return {
            leg_1_sales: leg1Sales,
            leg_2_sales: leg2Sales,
            leg_3_sales: leg3Sales,
            leg_4_sales: leg4Sales,
            total_sales: totalSales
        };
    } catch (error) {
        console.error('Error calculating leg sales:', error);
        throw error;
    }
};

/**
 * Calculate total sales from a list of user IDs (8 levels deep)
 * @param {Array} userIds - Array of direct leg member IDs
 * @returns {Promise<number>} Total sales accumulated
 */
const calculateLegTotalSales = async (userIds) => {
    try {
        const normalizedUserIds = normalizeLegUsers(userIds);

        if (normalizedUserIds.length === 0) {
            return 0;
        }

        let totalSales = 0;
        const traversedUsers = new Set();

        // BFS to traverse 8 levels deep
        const queue = normalizedUserIds.map((id) => ({ userId: id, level: 1 }));

        while (queue.length > 0) {
            const { userId, level } = queue.shift();

            // Don't exceed 8 levels
            if (level > 8 || traversedUsers.has(userId)) {
                continue;
            }

            traversedUsers.add(userId);

            // Get user's active stakes (sales)
            const stakes = await LockedCoinsEntry.findAll({
                where: {
                    user_id: userId,
                    status: 'active' // Only count active stakes
                },
                attributes: ['amount']
            });

            // Sum up the stakes
            stakes.forEach(stake => {
                totalSales += parseFloat(stake.amount) || 0;
            });

            // Get user's direct referrals and add to queue for next level
            if (level < 8) {
                const referredUsers = await User.findAll({
                    where: {
                        referred_by: userId
                    },
                    attributes: ['id']
                });

                referredUsers.forEach(refUser => {
                    queue.push({ userId: refUser.id, level: level + 1 });
                });
            }
        }

        return totalSales;
    } catch (error) {
        console.error('Error calculating leg total sales:', error);
        return 0;
    }
};

/**
 * Check if user has met minimum direct requirement (8 directs with $50+ stake each)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Requirement details
 */
const checkMinimumDirectRequirement = async (userId) => {
    try {
        // Get all direct referrals
        const directs = await User.findAll({
            where: {
                referred_by: userId
            },
            attributes: ['id']
        });

        // Check if at least 8 of them have $50+ active stakes
        let qualifyingDirects = 0;

        for (const direct of directs) {
            const totalStake = await LockedCoinsEntry.sum('amount', {
                where: {
                    user_id: direct.id,
                    status: 'active'
                }
            });

            if ((totalStake || 0) >= 50) {
                qualifyingDirects++;
            }
        }

        return {
            totalDirects: directs.length,
            qualifyingDirects,
            meetsRequirement: qualifyingDirects >= 8
        };
    } catch (error) {
        console.error('Error checking minimum direct requirement:', error);
        return {
            totalDirects: 0,
            qualifyingDirects: 0,
            meetsRequirement: false
        };
    }
};

/**
 * Determine user's rank based on per-leg minimum requirements
 * All 4 legs must meet their minimum thresholds
 * @param {number} leg1 - Leg 1 sales
 * @param {number} leg2 - Leg 2 sales
 * @param {number} leg3 - Leg 3 sales
 * @param {number} leg4 - Leg 4 sales
 * @returns {Promise<string>} Rank name
 */
const determineRankByLegMinimums = async (leg1, leg2, leg3, leg4) => {
    try {
        // Get all ranks ordered by level (highest first)
        const ranks = await Rank.findAll({
            where: { status: 'active' },
            order: [['rank_level', 'DESC']]
        });

        // Check from highest rank down to find the highest rank user qualifies for
        for (const rank of ranks) {
            const allLegsQualified = 
                leg1 >= rank.leg_1_min &&
                leg2 >= rank.leg_2_min &&
                leg3 >= rank.leg_3_min &&
                leg4 >= rank.leg_4_min;

            if (allLegsQualified) {
                return rank.rank_name;
            }
        }

        return 'none';
    } catch (error) {
        console.error('Error determining rank by leg minimums:', error);
        return 'none';
    }
};

/**
 * Calculate user's current rank
 * User qualifies for rank only if minimum direct requirement is met
 * AND all 4 legs meet their individual minimum thresholds
 * @param {string} userId - User ID
 * @returns {Promise<Object>} New rank info
 */
const calculateUserRank = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Check minimum direct requirement
        const requirementData = await checkMinimumDirectRequirement(userId);
        const meetsRequirement = requirementData.meetsRequirement;

        let newRank = 'none';
        let newRankLevel = 0;
        let totalSales = 0;

        if (meetsRequirement) {
            // Calculate sales from all legs
            const legSales = await calculateLegSales(userId);
            totalSales = legSales.total_sales;

            // Determine rank based on per-leg minimums
            newRank = await determineRankByLegMinimums(
                legSales.leg_1_sales,
                legSales.leg_2_sales,
                legSales.leg_3_sales,
                legSales.leg_4_sales
            );
            newRankLevel = RANK_LEVELS[newRank] || 0;

            // Update user's leg sales
            await user.update({
                leg_1_sales: legSales.leg_1_sales,
                leg_2_sales: legSales.leg_2_sales,
                leg_3_sales: legSales.leg_3_sales,
                leg_4_sales: legSales.leg_4_sales,
                total_sales_amount: legSales.total_sales,
                min_direct_requirement_met: true,
                direct_count: requirementData.qualifyingDirects
            });
        } else {
            // User doesn't meet direct requirement - rank stays 'none'
            await user.update({
                min_direct_requirement_met: false,
                direct_count: requirementData.qualifyingDirects,
                total_sales_amount: 0,
                leg_1_sales: 0,
                leg_2_sales: 0,
                leg_3_sales: 0,
                leg_4_sales: 0
            });
        }

        return {
            newRank,
            newRankLevel,
            meetsRequirement,
            directCount: requirementData.qualifyingDirects,
            totalSales
        };
    } catch (error) {
        console.error('Error calculating user rank:', error);
        throw error;
    }
};

/**
 * Update user's rank and create history record if rank changed
 * Create notification if user's rank is about to drop
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Change info or null if no change
 */
const updateUserRank = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const currentRank = user.current_rank || 'none';
        const rankCalculation = await calculateUserRank(userId);
        const newRank = rankCalculation.newRank;
        const salesAtChange = parseFloat(rankCalculation.totalSales) || 0;

        // If rank changed, create history record
        if (currentRank !== newRank) {
            // Determine change type
            const currentRankLevel = RANK_LEVELS[currentRank] || 0;
            const newRankLevel = RANK_LEVELS[newRank] || 0;
            const changeType = newRankLevel > currentRankLevel ? 'upgrade' : 'downgrade';

            // Update user's current rank
            const achievedDate = changeType === 'upgrade' ? new Date() : user.rank_achieved_date;
            await user.update({
                current_rank: newRank,
                current_rank_level: newRankLevel,
                rank_achieved_date: achievedDate
            });

            // Create history record
            const reason =
                changeType === 'upgrade'
                    ? `Achieved ${newRank} with total sales: ${salesAtChange}`
                    : `Downgraded from ${currentRank} to ${newRank} due to insufficient sales`;

            await RankHistory.create({
                user_id: userId,
                previous_rank: currentRank,
                new_rank: newRank,
                change_type: changeType,
                reason,
                total_sales_at_change: salesAtChange
            });

            return {
                changed: true,
                previousRank: currentRank,
                newRank,
                changeType,
                reason
            };
        }

        return { changed: false };
    } catch (error) {
        console.error('Error updating user rank:', error);
        throw error;
    }
};

/**
 * Check if user should be notified about potential rank downgrade
 * Notify if sales dropping below next rank threshold
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Notification data or null
 */
const checkRankDowngradeWarning = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user || user.current_rank === 'none') {
            return null;
        }

        const currentRank = user.current_rank;
        const currentRankLevel = RANK_LEVELS[currentRank];
        const currentSales = user.total_sales_amount || 0;

        // Find the previous rank's threshold
        const rankEntries = Object.entries(RANK_LEVELS)
            .filter(([, level]) => level < currentRankLevel)
            .sort(([, levelA], [, levelB]) => levelB - levelA);

        if (rankEntries.length === 0) {
            return null; // Already at lowest rank
        }

        const previousRank = rankEntries[0][0];
        const previousThreshold = RANK_THRESHOLDS[previousRank] || 0;
        const warningThreshold = previousThreshold * 1.1; // 10% above the lower rank

        // If sales are between previous rank threshold and warning level, notify
        if (currentSales < warningThreshold && currentSales >= previousThreshold) {
            // Check if already notified recently (within 7 days)
            const lastNotification = user.last_rank_notification_date;
            const daysSinceNotification = lastNotification
                ? Math.floor((new Date() - lastNotification) / (1000 * 60 * 60 * 24))
                : 999;

            if (daysSinceNotification >= 7) {
                // Update notification date
                await user.update({
                    last_rank_notification_date: new Date()
                });

                // Create notification history
                await RankHistory.create({
                    user_id: userId,
                    previous_rank: currentRank,
                    new_rank: previousRank,
                    change_type: 'notification',
                    reason: `Warning: Sales dropping. Currently at $${currentSales}. Will drop to ${previousRank} if sales fall below $${previousThreshold}.`,
                    total_sales_at_change: currentSales
                });

                return {
                    warned: true,
                    currentRank,
                    currentSales,
                    potentialRank: previousRank,
                    requiredSales: previousThreshold,
                    warningMessage: `Your rank is at risk! You need $${previousThreshold} in sales to maintain ${currentRank}. Current sales: $${currentSales}`
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error checking rank downgrade warning:', error);
        return null;
    }
};

/**
 * Get users for rank recalculation in paginated batches
 * This is used for periodic (weekly) batch processing
 * @param {Object} options
 * @param {number} options.limit
 * @param {number} options.offset
 * @returns {Promise<Array>} Array of users
 */
const getUsersForRankRecalculation = async ({ limit = 1000, offset = 0 } = {}) => {
    try {
        return await User.findAll({
            where: {
                is_active: true
            },
            attributes: ['id', 'current_rank', 'total_sales_amount'],
            order: [['created_at', 'ASC']],
            limit,
            offset
        });
    } catch (error) {
        console.error('Error fetching users for rank recalculation:', error);
        return [];
    }
};

module.exports = {
    RANK_THRESHOLDS,
    RANK_LEVELS,
    calculateLegSales,
    calculateLegTotalSales,
    checkMinimumDirectRequirement,
    determineRankByLegMinimums,
    calculateUserRank,
    updateUserRank,
    checkRankDowngradeWarning,
    getUsersForRankRecalculation
};
