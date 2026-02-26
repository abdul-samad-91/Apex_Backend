const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Gateway extends Model {}

Gateway.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        image: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        wallet_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        wallet_address: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        created_by: {
            type: DataTypes.STRING(36),
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
        modelName: 'Gateway',
        tableName: 'gateways',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['created_by'] }
        ]
    }
);

module.exports = Gateway;