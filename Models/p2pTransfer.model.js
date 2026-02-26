const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class P2PTransfer extends Model {}

P2PTransfer.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        transfer_id: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        sender_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        recipient_id: {
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
            allowNull: false,
            validate: {
                min: 0
            }
        },
        system_fee_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 3
        },
        system_fee_amount: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        amount_after_fee: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        note: {
            type: DataTypes.STRING(500),
            allowNull: true,
            defaultValue: null
        },
        status: {
            type: DataTypes.ENUM('completed', 'failed'),
            defaultValue: 'completed'
        }
    },
    {
        sequelize,
        modelName: 'P2PTransfer',
        tableName: 'p2p_transfers',
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ['transfer_id'] },
            { fields: ['sender_id'] },
            { fields: ['recipient_id'] },
            { fields: ['status'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = P2PTransfer;
