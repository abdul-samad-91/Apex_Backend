require('dotenv').config();
const { connectDB, sequelize } = require('../Config/DB');
const RankReward = require('../Models/rankReward.model');

const ONE_TIME_REWARD_PERIOD = 'onetime';

const toTimestamp = (value) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const date = new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const isBetterRewardToKeep = (candidate, currentBest) => {
    const candidateClaimed = candidate.status === 'claimed';
    const currentClaimed = currentBest.status === 'claimed';

    if (candidateClaimed !== currentClaimed) {
        return candidateClaimed;
    }

    if (candidateClaimed && currentClaimed) {
        const candidateClaimedAt = toTimestamp(candidate.claimed_at);
        const currentClaimedAt = toTimestamp(currentBest.claimed_at);
        if (candidateClaimedAt !== currentClaimedAt) {
            return candidateClaimedAt < currentClaimedAt;
        }
    }

    const candidateCreatedAt = toTimestamp(candidate.created_at);
    const currentCreatedAt = toTimestamp(currentBest.created_at);
    if (candidateCreatedAt !== currentCreatedAt) {
        return candidateCreatedAt < currentCreatedAt;
    }

    return String(candidate.id) < String(currentBest.id);
};

const hasUserRankUniqueIndex = async (queryInterface) => {
    const indexes = await queryInterface.showIndex('rank_rewards');

    return indexes.some((index) => {
        if (!index.unique || !Array.isArray(index.fields)) {
            return false;
        }

        const fields = index.fields.map((field) => field.attribute).join(',');
        return fields === 'user_id,rank_id';
    });
};

const migrateRankRewardsToOneTime = async () => {
    try {
        await connectDB();

        const allRewards = await RankReward.findAll({
            order: [
                ['user_id', 'ASC'],
                ['rank_id', 'ASC'],
                ['created_at', 'ASC']
            ]
        });

        const bestRewardByKey = new Map();

        for (const reward of allRewards) {
            const key = `${reward.user_id}:${reward.rank_id}`;
            const currentBest = bestRewardByKey.get(key);

            if (!currentBest || isBetterRewardToKeep(reward, currentBest)) {
                bestRewardByKey.set(key, reward);
            }
        }

        const keepIds = new Set(Array.from(bestRewardByKey.values()).map((reward) => reward.id));
        const duplicateIds = allRewards
            .filter((reward) => !keepIds.has(reward.id))
            .map((reward) => reward.id);

        const transaction = await sequelize.transaction();

        try {
            if (duplicateIds.length > 0) {
                await RankReward.destroy({
                    where: { id: duplicateIds },
                    transaction
                });
            }

            await RankReward.update(
                { reward_period: ONE_TIME_REWARD_PERIOD },
                { where: {}, transaction }
            );

            const queryInterface = sequelize.getQueryInterface();
            const uniqueIndexExists = await hasUserRankUniqueIndex(queryInterface);

            if (!uniqueIndexExists) {
                await queryInterface.addIndex('rank_rewards', ['user_id', 'rank_id'], {
                    unique: true,
                    name: 'uq_rank_rewards_user_rank',
                    transaction
                });
            }

            await transaction.commit();

            // console.log('Rank rewards migration completed.');
            // console.log(`Total rewards scanned: ${allRewards.length}`);
            // console.log(`Duplicate rewards removed: ${duplicateIds.length}`);
            // console.log(`Unique user+rank entries kept: ${keepIds.size}`);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        await sequelize.close();
    } catch (error) {
        // console.error('Rank rewards migration failed:', error);
        process.exit(1);
    }
};

migrateRankRewardsToOneTime();
