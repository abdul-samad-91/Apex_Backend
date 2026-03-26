const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');

class Banner extends Model {}

Banner.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        image_url: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        action_link: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        action_type: {
            type: DataTypes.ENUM('none', 'external_url'),
            defaultValue: 'none',
        },
        start_date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        end_date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        priority: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        duration_seconds: {
            type: DataTypes.INTEGER,
            defaultValue: 3,
        },
        click_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        impression_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        created_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            onUpdate: DataTypes.NOW,
        },
    },
    {
        sequelize,
        modelName: 'Banner',
        tableName: 'banners',
        timestamps: true,
        underscored: true,
    }
);

module.exports = Banner;
