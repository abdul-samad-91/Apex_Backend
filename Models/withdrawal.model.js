const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({
    withdrawalId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    systemFeePercentage: {
        type: Number,
        default: 5
    },
    systemFeeAmount: {
        type: Number,
        default: 0
    },
    amountAfterFee: {
        type: Number,
        default: 0
    },
    walletAddress: {
        type: String,
        required: true,
        trim: true
    },
    network: {
        type: String,
        enum: ["BEP20", "TRC20"],
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "processing", "completed", "rejected"],
        default: "pending"
    },
    rejectionReason: {
        type: String,
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    transactionHash: {
        type: String,
        default: null,
        trim: true
    },
    transactionID: {
        type: String,
        default: null,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
