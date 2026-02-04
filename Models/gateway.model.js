const mongoose = require('mongoose');

const gatewaySchema = new mongoose.Schema(
  {
    image: { type: String },
    walletId: { type: String, trim: true },
    walletAddress: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gateway', gatewaySchema);
