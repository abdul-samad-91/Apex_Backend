const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class WalletLedger extends Model {}

WalletLedger.init(
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
        wallet_type: {
            type: DataTypes.ENUM('account_balance', 'p2p_wallet'),
            allowNull: false
        },
        entry_type: {
            type: DataTypes.ENUM('credit', 'debit'),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0
            }
        },
        balance_before: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        balance_after: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        source_type: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        source_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
            defaultValue: null
        },
        counterparty_user_id: {
            type: DataTypes.STRING(36),
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'failed', 'reversed'),
            defaultValue: 'completed'
        },
        description: {
            type: DataTypes.STRING(500),
            allowNull: true,
            defaultValue: null
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        happened_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    },
    {
        sequelize,
        modelName: 'WalletLedger',
        tableName: 'wallet_ledger',
        timestamps: true,
        underscored: true,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        indexes: [
            { fields: ['user_id'] },
            { fields: ['wallet_type'] },
            { fields: ['entry_type'] },
            { fields: ['source_type'] },
            { fields: ['source_id'] },
            { fields: ['counterparty_user_id'] },
            { fields: ['status'] },
            { fields: ['happened_at'] },
            { fields: ['user_id', 'wallet_type', 'happened_at'] }
        ]
    }
);

module.exports = WalletLedger;
