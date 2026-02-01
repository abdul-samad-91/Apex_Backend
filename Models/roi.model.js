const mongoose = require('mongoose');

const roiSchema = new mongoose.Schema(
  {
    rate: { type: Number, required: true, default: 0 }, // percentage, e.g., 5 for 5%
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Roi', roiSchema);
