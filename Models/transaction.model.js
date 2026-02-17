const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Transaction extends Model {}

Transaction.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        transaction_id: {
            type: DataTypes.STRING(100),
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
        screenshot_url: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        account_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        bank_account_number: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        bank_name: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            defaultValue: 'pending'
        }
    },
    {
        sequelize,
        modelName: 'Transaction',
        tableName: 'transactions',
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ['transaction_id'] },
            { fields: ['user_id'] },
            { fields: ['status'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = Transaction;