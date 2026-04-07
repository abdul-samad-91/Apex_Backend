const User = require('../Models/user.model');
const LockedCoinsEntry = require('../Models/lockedCoinsEntry.model');

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

/**
 * Get total staked amount for a user and their downline
 * Used to determine which leg a new member should join
 * @param {string} userId - User ID
 * @returns {Promise<number>} Total staked amount
 */
const getTotalStakedAmount = async (userId) => {
    try {
        const totalStaked = await LockedCoinsEntry.sum('amount', {
            where: {
                user_id: userId,
                status: 'active'
            }
        });

        return totalStaked || 0;
    } catch (error) {
        console.error('Error calculating total staked amount:', error);
        return 0;
    }
};

/**
 * Get total stake amount for a leg (including all downline members in that leg)
 * @param {Array} legUserIds - Array of user IDs in the leg
 * @returns {Promise<number>} Total staked amount for the leg
 */
const getLegTotalStake = async (legUserIds) => {
    try {
        const normalizedLegUsers = normalizeLegUsers(legUserIds);

        if (normalizedLegUsers.length === 0) {
            return 0;
        }

        let totalStake = 0;

        for (const userId of normalizedLegUsers) {
            const stakes = await LockedCoinsEntry.sum('amount', {
                where: {
                    user_id: userId,
                    status: 'active'
                }
            });
            totalStake += stakes || 0;
        }

        return totalStake;
    } catch (error) {
        console.error('Error calculating leg total stake:', error);
        return 0;
    }
};

/**
 * Assign a new user to a leg based on current staking amounts
 * User is assigned to the leg with the lowest total stake
 * This ensures balanced distribution based on stake amounts
 *
 * @param {string} rootUserId - Root/Parent user ID
 * @param {string} newUserId - New user ID to assign
 * @returns {Promise<Object>} Assignment result with assigned leg number
 */
const assignUserToLeg = async (rootUserId, newUserId) => {
    try {
        const rootUser = await User.findByPk(rootUserId);
        if (!rootUser) {
            throw new Error('Root user not found');
        }

        // Get current leg assignments
        const legsData = [
            { legNumber: 1, users: normalizeLegUsers(rootUser.leg_1_users) },
            { legNumber: 2, users: normalizeLegUsers(rootUser.leg_2_users) },
            { legNumber: 3, users: normalizeLegUsers(rootUser.leg_3_users) },
            { legNumber: 4, users: normalizeLegUsers(rootUser.leg_4_users) }
        ];

        // Calculate total stake for each leg
        let legStakes = [];
        for (const leg of legsData) {
            const totalStake = await getLegTotalStake(leg.users);
            legStakes.push({
                legNumber: leg.legNumber,
                totalStake,
                users: leg.users
            });
        }

        // Sort by stake amount to find the leg with lowest stake
        legStakes.sort((a, b) => a.totalStake - b.totalStake);

        // Assign user to the leg with lowest stake
        const assignedLeg = legStakes[0];
        const updatedLegUsers = [...assignedLeg.users, newUserId];

        // Update the root user's leg assignment
        const updateData = {};
        updateData[`leg_${assignedLeg.legNumber}_users`] = updatedLegUsers;

        await rootUser.update(updateData);

        return {
            success: true,
            assignedLeg: assignedLeg.legNumber,
            newUserId,
            rootUserId,
            legTotalStake: assignedLeg.totalStake
        };
    } catch (error) {
        console.error('Error assigning user to leg:', error);
        throw error;
    }
};

/**
 * Rebalance legs for a user based on current staking amounts
 * This shuffles users between legs to maintain balance
 * Called weekly as part of rank recalculation
 *
 * @param {string} rootUserId - Root/Parent user ID
 * @returns {Promise<Object>} Rebalancing result
 */
const rebalanceLegsByStake = async (rootUserId) => {
    try {
        const rootUser = await User.findByPk(rootUserId);
        if (!rootUser) {
            throw new Error('Root user not found');
        }

        // Get all direct referrals
        const directs = await User.findAll({
            where: {
                referred_by: rootUserId
            },
            attributes: ['id']
        });

        if (directs.length === 0) {
            return {
                success: true,
                message: 'No directs to rebalance',
                changes: []
            };
        }

        // Calculate stake for each direct member
        const directStakes = [];
        for (const direct of directs) {
            const totalStake = await getTotalStakedAmount(direct.id);
            directStakes.push({
                userId: direct.id,
                stake: totalStake
            });
        }

        // Sort by stake (highest first)
        directStakes.sort((a, b) => b.stake - a.stake);

        // Create new leg assignments by distributing highest stakes
        // This ensures primary legs have more heavily staked members
        const newLegs = {
            leg_1_users: [],
            leg_2_users: [],
            leg_3_users: [],
            leg_4_users: []
        };

        // Distribute users in a round-robin fashion based on stake
        // Highest stakes go to primary legs first
        directStakes.forEach((item, index) => {
            const legIndex = `leg_${(index % 4) + 1}_users`;
            newLegs[legIndex].push(item.userId);
        });

        // Update root user with new leg assignments
        await rootUser.update(newLegs);

        // Log the changes (for reference)
        const changes = [];
        for (let i = 1; i <= 4; i++) {
            const legKey = `leg_${i}_users`;
            const oldLegUsers = normalizeLegUsers(rootUser[legKey]);
            if (JSON.stringify(oldLegUsers) !== JSON.stringify(newLegs[legKey])) {
                changes.push({
                    leg: i,
                    oldUsers: oldLegUsers,
                    newUsers: newLegs[legKey]
                });
            }
        }

        return {
            success: true,
            message: 'Legs rebalanced successfully',
            changes,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error rebalancing legs:', error);
        throw error;
    }
};

/**
 * Get detailed leg information including members and their stakes
 * @param {string} rootUserId - Root user ID
 * @param {number} legNumber - Leg number (1-4)
 * @returns {Promise<Object>} Leg details with members and stakes
 */
const getLegDetails = async (rootUserId, legNumber) => {
    try {
        const rootUser = await User.findByPk(rootUserId);
        if (!rootUser) {
            throw new Error('Root user not found');
        }

        // Validate leg number
        if (legNumber < 1 || legNumber > 4) {
            throw new Error('Invalid leg number. Must be 1-4');
        }

        const legUserIds = normalizeLegUsers(rootUser[`leg_${legNumber}_users`]);

        // Get details for each user in the leg
        const legMembers = [];
        for (const userId of legUserIds) {
            const user = await User.findByPk(userId, {
                attributes: [
                    'id',
                    'full_name',
                    'email',
                    'total_sales_amount',
                    'current_rank',
                    'locked_apex_coins'
                ]
            });

            if (user) {
                const totalStake = await getTotalStakedAmount(userId);
                legMembers.push({
                    userId: user.id,
                    name: user.full_name,
                    email: user.email,
                    totalSales: parseFloat(user.total_sales_amount) || 0,
                    rank: user.current_rank,
                    totalStaked: totalStake
                });
            }
        }

        // Calculate leg total stakes
        const legTotalStake = await getLegTotalStake(legUserIds);

        return {
            legNumber,
            rootUserId,
            memberCount: legMembers.length,
            totalStake: legTotalStake,
            members: legMembers
        };
    } catch (error) {
        console.error('Error getting leg details:', error);
        throw error;
    }
};

/**
 * Get all 4 legs summary for a user
 * @param {string} rootUserId - Root user ID
 * @returns {Promise<Object>} Summary of all 4 legs
 */
const getAllLegsSummary = async (rootUserId) => {
    try {
        const rootUser = await User.findByPk(rootUserId);
        if (!rootUser) {
            throw new Error('Root user not found');
        }

        const legsSummary = [];

        for (let legNum = 1; legNum <= 4; legNum++) {
            const legDetails = await getLegDetails(rootUserId, legNum);
            legsSummary.push({
                leg: legNum,
                memberCount: legDetails.memberCount,
                totalStake: legDetails.totalStake,
                members: legDetails.members
            });
        }

        const totalAllLegs = legsSummary.reduce((sum, leg) => sum + leg.totalStake, 0);

        return {
            rootUserId,
            totalMembers: legsSummary.reduce((sum, leg) => sum + leg.memberCount, 0),
            totalStakesAllLegs: totalAllLegs,
            legs: legsSummary
        };
    } catch (error) {
        console.error('Error getting all legs summary:', error);
        throw error;
    }
};

module.exports = {
    getTotalStakedAmount,
    getLegTotalStake,
    assignUserToLeg,
    rebalanceLegsByStake,
    getLegDetails,
    getAllLegsSummary
};
