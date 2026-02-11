const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const Transaction = sequelize.define('Transaction', {
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
  transactionId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  screenshotUrl: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  amount: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  accountName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  bankAccountNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  bankName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'Transactions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['transactionId'] },
    { fields: ['status'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = Transaction;
