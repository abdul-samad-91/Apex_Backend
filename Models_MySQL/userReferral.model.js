const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');

// Junction table for user referrals (one-to-many through separate table for flexibility)
const UserReferral = sequelize.define('UserReferral', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'The referrer (upline)'
  },
  referralId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'The referred user (direct downline)'
  }
}, {
  tableName: 'UserReferrals',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['referralId'], unique: true }
  ]
});

// Table for referral chain (indirect multi-level referrals)
const UserReferralChain = sequelize.define('UserReferralChain', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'The user whose chain this is'
  },
  ancestorId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'An ancestor (upline) in the chain'
  },
  level: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'Level in the chain (1 = direct upline, 2 = upline of upline, etc.)'
  }
}, {
  tableName: 'UserReferralChain',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['ancestorId'] },
    { fields: ['userId', 'level'] }
  ]
});

module.exports = { UserReferral, UserReferralChain };
