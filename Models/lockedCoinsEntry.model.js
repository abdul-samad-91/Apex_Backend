const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class LockedCoinsEntry extends Model {}

LockedCoinsEntry.init(
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
        amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        lock_start_date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        lock_end_date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('active', 'completed', 'unlock-pending', 'unlocked'),
            defaultValue: 'active'
        },
        roi_rate_at_lock: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            defaultValue: 0
        },
        // Unlock request fields
        unlock_requested_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        unlock_process_after: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        penalty_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0
        },
        penalty_amount: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        amount_after_penalty: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        days_elapsed_at_request: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        unlock_approved_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        unlock_approved_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        // Profit tracking
        unclaimed_profit: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        last_claim_date: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        total_claimed_profit: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        }
    },
    {
        sequelize,
        modelName: 'LockedCoinsEntry',
        tableName: 'locked_coins_entries',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id'] },
            { fields: ['status'] },
            { fields: ['user_id', 'status'] },
            { fields: ['lock_start_date'] },
            { fields: ['lock_end_date'] }
        ]
    }
);

module.exports = LockedCoinsEntry;
