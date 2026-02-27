const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class BonusTransaction extends Model {}

BonusTransaction.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // Who receives the bonus (upline user)
        user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        // Who made the investment (downline user)
        from_user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        // Which stake entry triggered this bonus
        // NOTE: FK constraint removed because historical data has orphaned references
        stake_entry_id: {
            type: DataTypes.STRING(36),
            allowNull: false
        },
        // Original investment/stake amount
        investment_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Bonus percentage for this level (e.g., 9, 4, 3, 2, 1, 1)
        bonus_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false
        },
        // Actual bonus amount earned
        bonus_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Level in the referral chain (1-6)
        level: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            validate: {
                min: 1,
                max: 6
            }
        },
        // Active direct referrals at the time of bonus
        active_direct_referrals_at_time: {
            type: DataTypes.INTEGER.UNSIGNED,
            defaultValue: 0
        },
        // Whether this bonus has been claimed
        is_claimed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // Date when bonus was claimed
        claimed_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        }
    },
    {
        sequelize,
        modelName: 'BonusTransaction',
        tableName: 'bonus_transactions',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id', 'created_at'] },
            { fields: ['from_user_id'] },
            { fields: ['stake_entry_id'] },
            { fields: ['is_claimed'] },
            { fields: ['user_id', 'is_claimed'] }
        ]
    }
);

module.exports = BonusTransaction;