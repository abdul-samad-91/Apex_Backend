const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class RankReward extends Model {}

RankReward.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        rank_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'ranks',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        // Period for which reward is earned (e.g., "2026-04")
        reward_period: {
            type: DataTypes.STRING(7),
            allowNull: false
        },
        // Amount of reward for this period and rank
        reward_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Status: pending, claimed
        status: {
            type: DataTypes.ENUM('pending', 'claimed'),
            defaultValue: 'pending'
        },
        // When reward was claimed
        claimed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Claimed by user action
        claimed_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        }
    },
    {
        sequelize,
        modelName: 'RankReward',
        tableName: 'rank_rewards',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id'] },
            { fields: ['rank_id'] },
            { fields: ['reward_period'] },
            { fields: ['status'] },
            { unique: true, fields: ['user_id', 'rank_id', 'reward_period'] },
            { fields: ['user_id', 'reward_period'] },
            { fields: ['user_id', 'status'] }
        ]
    }
);

module.exports = RankReward;
