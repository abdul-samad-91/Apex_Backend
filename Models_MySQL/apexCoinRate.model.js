const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const ApexCoinRate = sequelize.define('ApexCoinRate', {
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
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 0
    }
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
  tableName: 'ApexCoinRates',
  timestamps: true,
  indexes: [
    { fields: ['isActive'] },
    { fields: ['createdById'] }
  ]
});

module.exports = ApexCoinRate;
