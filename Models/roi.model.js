const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Roi extends Model {}

Roi.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        rate: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            defaultValue: 0,
            comment: 'Percentage rate, e.g., 5 for 5%'
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
        modelName: 'Roi',
        tableName: 'roi_rates',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['is_active'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = Roi;