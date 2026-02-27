// Model associations and exports
const User = require('./user.model');
const LockedCoinsEntry = require('./lockedCoinsEntry.model');
const Transaction = require('./transaction.model');
const Roi = require('./roi.model');
const Gateway = require('./gateway.model');
const ApexCoinRate = require('./apexCoinRate.model');
const BonusTransaction = require('./bonusTransaction.model');
const ProfitShareTransaction = require('./profitShareTransaction.model');
const P2PTransfer = require('./p2pTransfer.model');
const Withdrawal = require('./withdrawal.model');

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
BonusTransaction.belongsTo(LockedCoinsEntry, { as: 'stakeEntry', foreignKey: 'stake_entry_id', constraints: false });

// User - ProfitShareTransaction
User.hasMany(ProfitShareTransaction, { as: 'receivedProfitShares', foreignKey: 'user_id' });
User.hasMany(ProfitShareTransaction, { as: 'triggeredProfitShares', foreignKey: 'from_user_id' });
ProfitShareTransaction.belongsTo(User, { as: 'recipient', foreignKey: 'user_id' });
ProfitShareTransaction.belongsTo(User, { as: 'fromUser', foreignKey: 'from_user_id' });

// User - P2PTransfer
User.hasMany(P2PTransfer, { as: 'sentTransfers', foreignKey: 'sender_id' });
User.hasMany(P2PTransfer, { as: 'receivedTransfers', foreignKey: 'recipient_id' });
P2PTransfer.belongsTo(User, { as: 'sender', foreignKey: 'sender_id' });
P2PTransfer.belongsTo(User, { as: 'recipient', foreignKey: 'recipient_id' });

// User - Withdrawal
User.hasMany(Withdrawal, { as: 'withdrawals', foreignKey: 'user_id' });
Withdrawal.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
Withdrawal.belongsTo(User, { as: 'processedByUser', foreignKey: 'processed_by' });

module.exports = {
    User,
    LockedCoinsEntry,
    Transaction,
    Roi,
    Gateway,
    ApexCoinRate,
    BonusTransaction,
    ProfitShareTransaction,
    P2PTransfer,
    Withdrawal
};
