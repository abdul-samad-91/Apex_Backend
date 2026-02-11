const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const Roi = sequelize.define('Roi', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  // Store original MongoDB _id for migration reference
  mongoId: {
    type: DataTypes.STRING(24),
    allowNull: true,
    unique: true
  },
  rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    comment: 'ROI percentage, e.g., 5 for 5%'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdById: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  tableName: 'Rois',
  timestamps: true,
  indexes: [
    { fields: ['isActive'] },
    { fields: ['createdById'] }
  ]
});

module.exports = Roi;
