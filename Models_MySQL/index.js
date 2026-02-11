const { sequelize } = require('../Config/MySQL_DB');

// Import all models
const User = require('./user.model');
const LockedCoinsEntry = require('./lockedCoinsEntry.model');
const Transaction = require('./transaction.model');
const Roi = require('./roi.model');
const Gateway = require('./gateway.model');
const ApexCoinRate = require('./apexCoinRate.model');
const BonusTransaction = require('./bonusTransaction.model');
const ProfitShareTransaction = require('./profitShareTransaction.model');
const { UserReferral, UserReferralChain } = require('./userReferral.model');

// ==================== ASSOCIATIONS ====================

// User self-referencing (referredBy)
User.belongsTo(User, { as: 'referrer', foreignKey: 'referredById' });
User.hasMany(User, { as: 'directReferrals', foreignKey: 'referredById' });

// User <-> LockedCoinsEntry (one-to-many)
User.hasMany(LockedCoinsEntry, { as: 'lockedCoinsEntries', foreignKey: 'userId' });
LockedCoinsEntry.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// LockedCoinsEntry approved by User
LockedCoinsEntry.belongsTo(User, { as: 'approver', foreignKey: 'unlockApprovedById' });

// User <-> Transaction (one-to-many)
User.hasMany(Transaction, { as: 'transactions', foreignKey: 'userId' });
Transaction.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// User <-> Roi (one-to-many, creator)
User.hasMany(Roi, { as: 'createdRois', foreignKey: 'createdById' });
Roi.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });

// User <-> Gateway (one-to-many, creator)
User.hasMany(Gateway, { as: 'createdGateways', foreignKey: 'createdById' });
Gateway.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });

// User <-> ApexCoinRate (one-to-many, creator)
User.hasMany(ApexCoinRate, { as: 'createdApexCoinRates', foreignKey: 'createdById' });
ApexCoinRate.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });

// User <-> BonusTransaction (receiver)
User.hasMany(BonusTransaction, { as: 'bonusesReceived', foreignKey: 'userId' });
BonusTransaction.belongsTo(User, { as: 'receiver', foreignKey: 'userId' });

// User <-> BonusTransaction (from user who invested)
User.hasMany(BonusTransaction, { as: 'bonusesCaused', foreignKey: 'fromUserId' });
BonusTransaction.belongsTo(User, { as: 'investor', foreignKey: 'fromUserId' });

// BonusTransaction <-> LockedCoinsEntry
LockedCoinsEntry.hasMany(BonusTransaction, { as: 'bonusTransactions', foreignKey: 'stakeEntryId' });
BonusTransaction.belongsTo(LockedCoinsEntry, { as: 'stakeEntry', foreignKey: 'stakeEntryId' });

// User <-> ProfitShareTransaction (receiver)
User.hasMany(ProfitShareTransaction, { as: 'profitSharesReceived', foreignKey: 'userId' });
ProfitShareTransaction.belongsTo(User, { as: 'receiver', foreignKey: 'userId' });

// User <-> ProfitShareTransaction (from user who earned ROI)
User.hasMany(ProfitShareTransaction, { as: 'profitSharesCaused', foreignKey: 'fromUserId' });
ProfitShareTransaction.belongsTo(User, { as: 'roiEarner', foreignKey: 'fromUserId' });

// User referrals (many-to-many through UserReferral)
User.belongsToMany(User, { 
  as: 'referrals', 
  through: UserReferral, 
  foreignKey: 'userId', 
  otherKey: 'referralId' 
});

// User referral chain (many-to-many through UserReferralChain)
User.belongsToMany(User, { 
  as: 'referralChain', 
  through: UserReferralChain, 
  foreignKey: 'userId', 
  otherKey: 'ancestorId' 
});
User.belongsToMany(User, { 
  as: 'downlineChain', 
  through: UserReferralChain, 
  foreignKey: 'ancestorId', 
  otherKey: 'userId' 
});

// Export all models and sequelize instance
module.exports = {
  sequelize,
  User,
  LockedCoinsEntry,
  Transaction,
  Roi,
  Gateway,
  ApexCoinRate,
  BonusTransaction,
  ProfitShareTransaction,
  UserReferral,
  UserReferralChain
};
