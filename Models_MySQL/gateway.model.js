const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const Gateway = sequelize.define('Gateway', {
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
  image: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  walletName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  walletAddress: {
    type: DataTypes.STRING(500),
    allowNull: true
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
  tableName: 'Gateways',
  timestamps: true,
  indexes: [
    { fields: ['createdById'] },
    { fields: ['walletName'] }
  ]
});

module.exports = Gateway;
