const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class ApexCoinRate extends Model {}

ApexCoinRate.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        rate: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 0
            }
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        created_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        }
    },
    {
        sequelize,
        modelName: 'ApexCoinRate',
        tableName: 'apex_coin_rates',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['is_active'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = ApexCoinRate;