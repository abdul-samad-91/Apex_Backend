const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class KycRequest extends Model {}

KycRequest.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            unique: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        full_name: {
            type: DataTypes.STRING(150),
            allowNull: false,
            validate: {
                len: [3, 150]
            }
        },
        id_passport_number: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: {
                len: [3, 120]
            }
        },
        id_front_image_url: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        id_back_image_url: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('under_review', 'verified', 'rejected'),
            allowNull: false,
            defaultValue: 'under_review'
        },
        rejection_reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
            defaultValue: null
        },
        submitted_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        reviewed_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        reviewed_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
            defaultValue: null,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        }
    },
    {
        sequelize,
        modelName: 'KycRequest',
        tableName: 'kyc_requests',
        timestamps: true,
        underscored: true,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        indexes: [
            { unique: true, fields: ['user_id'] },
            { fields: ['status'] },
            { fields: ['submitted_at'] },
            { fields: ['reviewed_by'] }
        ]
    }
);

module.exports = KycRequest;
