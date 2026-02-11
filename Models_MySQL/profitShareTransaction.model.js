const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const ProfitShareTransaction = sequelize.define('ProfitShareTransaction', {
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
  // Who receives the profit share (upline user)
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // Who earned the ROI (downline user)
  fromUserId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // The ROI amount that triggered this share (daily profit claimed by downline)
  roiAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  // Share percentage for this level (e.g., 10, 7, 6, 5, 2, 1, 1, 0.5, 0.5, 0.5, 1, 1)
  sharePercentage: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  // Actual profit share amount earned
  shareAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  // Level in the referral chain (1-12)
  level: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  // Active direct referrals at the time of profit share
  activeDirectReferralsAtTime: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0
  },
  // Reference to the claim date for tracking
  claimDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'ProfitShareTransactions',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['fromUserId'] },
    { fields: ['claimDate'] },
    { fields: ['level'] }
  ]
});

module.exports = ProfitShareTransaction;
