const mongoose = require('mongoose');

const gatewaySchema = new mongoose.Schema(
  {
    bankImageUrl: { type: String },
    bankName: { type: String, trim: true },
    bankAccountNumber: { type: String, trim: true },
    bankRoutingNumber: { type: String, trim: true },
    bankBranchName: { type: String, trim: true },
    gatewayCurrency: { type: String, trim: true },
    conversionRate: { type: Number, default: 1 },
    charge: { type: Number, default: 0 },
    allowAsPaymentMethod: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gateway', gatewaySchema);
