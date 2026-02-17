// Model associations and exports
const User = require('./user.model');
const LockedCoinsEntry = require('./lockedCoinsEntry.model');
const Transaction = require('./transaction.model');
const Roi = require('./roi.model');
const Gateway = require('./gateway.model');
const ApexCoinRate = require('./apexCoinRate.model');
const BonusTransaction = require('./bonusTransaction.model');
const ProfitShareTransaction = require('./profitShareTransaction.model');

// Define associations

// User self-referential relationships
User.belongsTo(User, { as: 'referrer', foreignKey: 'referred_by' });
User.hasMany(User, { as: 'directReferrals', foreignKey: 'referred_by' });

// User - LockedCoinsEntry (one-to-many)
User.hasMany(LockedCoinsEntry, { as: 'lockedCoinsEntries', foreignKey: 'user_id' });
LockedCoinsEntry.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
LockedCoinsEntry.belongsTo(User, { as: 'approvedByUser', foreignKey: 'unlock_approved_by' });

// User - Transaction (one-to-many)
User.hasMany(Transaction, { as: 'transactions', foreignKey: 'user_id' });
Transaction.belongsTo(User, { as: 'user', foreignKey: 'user_id' });

// User - ROI (created by)
Roi.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// User - Gateway (created by)
Gateway.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// User - ApexCoinRate (created by)
ApexCoinRate.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// User - BonusTransaction
User.hasMany(BonusTransaction, { as: 'receivedBonuses', foreignKey: 'user_id' });
User.hasMany(BonusTransaction, { as: 'triggeredBonuses', foreignKey: 'from_user_id' });
BonusTransaction.belongsTo(User, { as: 'recipient', foreignKey: 'user_id' });
BonusTransaction.belongsTo(User, { as: 'fromUser', foreignKey: 'from_user_id' });
BonusTransaction.belongsTo(LockedCoinsEntry, { as: 'stakeEntry', foreignKey: 'stake_entry_id' });

// User - ProfitShareTransaction
User.hasMany(ProfitShareTransaction, { as: 'receivedProfitShares', foreignKey: 'user_id' });
User.hasMany(ProfitShareTransaction, { as: 'triggeredProfitShares', foreignKey: 'from_user_id' });
ProfitShareTransaction.belongsTo(User, { as: 'recipient', foreignKey: 'user_id' });
ProfitShareTransaction.belongsTo(User, { as: 'fromUser', foreignKey: 'from_user_id' });

module.exports = {
    User,
    LockedCoinsEntry,
    Transaction,
    Roi,
    Gateway,
    ApexCoinRate,
    BonusTransaction,
    ProfitShareTransaction
};
