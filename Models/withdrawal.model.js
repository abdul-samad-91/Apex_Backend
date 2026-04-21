const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Withdrawal extends Model {}

Withdrawal.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        withdrawal_id: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
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
        verification_status: {
            type: DataTypes.ENUM('otp_pending', 'otp_verified'),
            defaultValue: 'otp_verified'
        },
        user_otp_hash: {
            type: DataTypes.STRING(255),
            allowNull: true,
            defaultValue: null
        },
        user_otp_expiry: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        otp_attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        otp_last_sent_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        user_otp_verified_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
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
            type: DataTypes.STRING(36),
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
        },
        transaction_id: {
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
            { fields: ['verification_status'] },
            { fields: ['network'] },
            { fields: ['processed_by'] },
            { fields: ['created_at'] }
        ]
    }
);

module.exports = Withdrawal;
