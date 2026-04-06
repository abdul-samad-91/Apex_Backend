const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class RankHistory extends Model {}

RankHistory.init(
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
        previous_rank: {
            type: DataTypes.ENUM(
                'none',
                'apex_associate',
                'apex_manager',
                'apex_sapphire',
                'apex_crown',
                'apex_diamond',
                'apex_legend',
                'global_partner'
            ),
            defaultValue: 'none'
        },
        new_rank: {
            type: DataTypes.ENUM(
                'none',
                'apex_associate',
                'apex_manager',
                'apex_sapphire',
                'apex_crown',
                'apex_diamond',
                'apex_legend',
                'global_partner'
            ),
            allowNull: false
        },
        // Type of change: upgrade, downgrade, notification
        change_type: {
            type: DataTypes.ENUM('upgrade', 'downgrade', 'notification'),
            allowNull: false
        },
        // Reason for change
        reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Total sales at time of change
        total_sales_at_change: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        // Timestamp of change
        changed_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    },
    {
        sequelize,
        modelName: 'RankHistory',
        tableName: 'rank_history',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id'] },
            { fields: ['change_type'] },
            { fields: ['created_at'] },
            { fields: ['user_id', 'created_at'] }
        ]
    }
);

module.exports = RankHistory;
