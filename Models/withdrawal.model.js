const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Withdrawal extends Model {}

Withdrawal.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        withdrawal_id: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
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
            defaultValue: 5
        },
        system_fee_amount: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        amount_after_fee: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        wallet_address: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        network: {
            type: DataTypes.ENUM('BEP20', 'TRC20'),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'completed', 'rejected'),
            defaultValue: 'pending'
        },
        rejection_reason: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: null
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        processed_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        transaction_hash: {
            type: DataTypes.STRING(255),
            allowNull: true,
            defaultValue: null
        }
    },
    {
        sequelize,
        modelName: 'Withdrawal',
        tableName: 'withdrawals',
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ['withdrawal_id'] },
            { fields: ['user_id'] },
            { fields: ['status'] },
            { fields: ['network'] },
            { fields: ['processed_by'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = Withdrawal;
