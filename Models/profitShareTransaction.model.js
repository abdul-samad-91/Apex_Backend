const mongoose = require('mongoose');

const profitShareTransactionSchema = new mongoose.Schema(
  {
    // Who receives the profit share (upline user)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // Who earned the ROI (downline user)
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // The ROI amount that triggered this share (daily profit claimed by downline)
    roiAmount: {
      type: Number,
      required: true
    },
    // Share percentage for this level (e.g., 10, 7, 6, 5, 2, 1, 1, 0.5, 0.5, 0.5, 1, 1)
    sharePercentage: {
      type: Number,
      required: true
    },
    // Actual profit share amount earned
    shareAmount: {
      type: Number,
      required: true
    },
    // Level in the referral chain (1-12)
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    // Active direct referrals at the time of profit share
    activeDirectReferralsAtTime: {
      type: Number,
      default: 0
    },
    // Reference to the claim date for tracking
    claimDate: {
      type: Date,
      default: Date.now
    },
    // Whether this profit share has been claimed
    isClaimed: {
      type: Boolean,
      default: false
    },
    // Date when profit share was claimed
    claimedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Index for efficient queries
profitShareTransactionSchema.index({ userId: 1, createdAt: -1 });
profitShareTransactionSchema.index({ fromUserId: 1 });
profitShareTransactionSchema.index({ claimDate: -1 });

module.exports = mongoose.model('ProfitShareTransaction', profitShareTransactionSchema);
