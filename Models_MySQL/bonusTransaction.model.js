const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

const BonusTransaction = sequelize.define('BonusTransaction', {
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
  // Who receives the bonus (upline user)
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // Who made the investment (downline user)
  fromUserId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // Which stake entry triggered this bonus
  stakeEntryId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'LockedCoinsEntries',
      key: 'id'
    }
  },
  // Store original MongoDB stakeEntryId for migration reference
  mongoStakeEntryId: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  // Original investment/stake amount
  investmentAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  // Bonus percentage for this level (e.g., 9, 4, 3, 2, 1, 1)
  bonusPercentage: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  // Actual bonus amount earned
  bonusAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  // Level in the referral chain (1-6)
  level: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    validate: {
      min: 1,
      max: 6
    }
  },
  // Active direct referrals at the time of bonus
  activeDirectReferralsAtTime: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0
  }
}, {
  tableName: 'BonusTransactions',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['fromUserId'] },
    { fields: ['stakeEntryId'] },
    { fields: ['level'] }
  ]
});

module.exports = BonusTransaction;
