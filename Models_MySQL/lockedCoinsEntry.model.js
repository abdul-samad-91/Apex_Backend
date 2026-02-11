const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const LockedCoinsEntry = sequelize.define('LockedCoinsEntry', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  // Store original MongoDB entry id for migration reference
  mongoEntryId: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  lockStartDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lockEndDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'unlock-pending', 'unlocked'),
    defaultValue: 'active'
  },
  roiRateAtLock: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  // Unlock request fields (flattened from nested object)
  unlockRequestedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  unlockProcessAfter: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  penaltyPercentage: {
    type: DataTypes.DECIMAL(10, 4),
    defaultValue: 0
  },
  penaltyAmount: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  amountAfterPenalty: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  daysElapsedAtRequest: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  unlockApprovedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  unlockApprovedById: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // Profit tracking fields
  unclaimedProfit: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  lastClaimDate: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  totalClaimedProfit: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  entryCreatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'LockedCoinsEntries',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['lockStartDate'] },
    { fields: ['lockEndDate'] }
  ]
});

module.exports = LockedCoinsEntry;
