const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class ProfitShareTransaction extends Model {}

ProfitShareTransaction.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // Who receives the profit share (upline user)
        user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        // Who earned the ROI (downline user)
        from_user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        // The ROI amount that triggered this share (daily profit claimed by downline)
        roi_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Share percentage for this level
        share_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false
        },
        // Actual profit share amount earned
        share_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Level in the referral chain (1-12)
        level: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            validate: {
                min: 1,
                max: 12
            }
        },
        // Active direct referrals at the time of profit share
        active_direct_referrals_at_time: {
            type: DataTypes.INTEGER.UNSIGNED,
            defaultValue: 0
        },
        // Reference to the claim date for tracking
        claim_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        // Whether this profit share has been claimed
        is_claimed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // Date when profit share was claimed
        claimed_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        }
    },
    {
        sequelize,
        modelName: 'ProfitShareTransaction',
        tableName: 'profit_share_transactions',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id', 'created_at'] },
            { fields: ['from_user_id'] },
            { fields: ['claim_date'] },
            { fields: ['is_claimed'] },
            { fields: ['user_id', 'is_claimed'] }
        ]
    }
);

module.exports = ProfitShareTransaction;