const mongoose = require('mongoose');

const bonusTransactionSchema = new mongoose.Schema(
  {
    // Who receives the bonus (upline user)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // Who made the investment (downline user)
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Which stake entry triggered this bonus
    stakeEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    // Original investment/stake amount
    investmentAmount: {
      type: Number,
      required: true
    },
    // Bonus percentage for this level (e.g., 9, 4, 3, 2, 1, 1)
    bonusPercentage: {
      type: Number,
      required: true
    },
    // Actual bonus amount earned
    bonusAmount: {
      type: Number,
      required: true
    },
    // Level in the referral chain (1-6)
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 6
    },
    // Active direct referrals at the time of bonus
    activeDirectReferralsAtTime: {
      type: Number,
      default: 0
    },
    // Whether this bonus has been claimed
    isClaimed: {
      type: Boolean,
      default: false
    },
    // Date when bonus was claimed
    claimedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Index for efficient queries
bonusTransactionSchema.index({ userId: 1, createdAt: -1 });
bonusTransactionSchema.index({ fromUserId: 1 });
bonusTransactionSchema.index({ stakeEntryId: 1 });

module.exports = mongoose.model('BonusTransaction', bonusTransactionSchema);
