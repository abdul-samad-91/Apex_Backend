const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Rank extends Model {}

Rank.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        rank_name: {
            type: DataTypes.ENUM(
                'apex_associate',
                'apex_manager',
                'apex_sapphire',
                'apex_crown',
                'apex_diamond',
                'apex_legend',
                'global_partner'
            ),
            allowNull: false,
            unique: true
        },
        rank_level: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            validate: {
                min: 1,
                max: 7
            }
        },
        // Required total sales amount from all 4 legs combined (8 levels each)
        required_sales: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        // Per-leg minimum sales targets
        leg_1_min: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        leg_2_min: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        leg_3_min: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        leg_4_min: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        // Monthly reward amount for this rank
        monthly_reward: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        // Minimum number of direct referrals
        min_direct_requirement: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // Minimum stake per direct ($50)
        min_stake_per_direct: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 50
        },
        // Description
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            defaultValue: 'active'
        }
    },
    {
        sequelize,
        modelName: 'Rank',
        tableName: 'ranks',
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ['rank_name'] },
            { unique: true, fields: ['rank_level'] },
            { fields: ['required_sales'] }
        ]
    }
);

module.exports = Rank;
