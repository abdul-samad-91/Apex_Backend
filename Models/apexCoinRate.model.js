const mongoose = require('mongoose');

const apexCoinRateSchema = new mongoose.Schema(
  {
    rate: {
      type: Number,
      required: true,
      min: 0,
      default: 1
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApexCoinRate', apexCoinRateSchema);
