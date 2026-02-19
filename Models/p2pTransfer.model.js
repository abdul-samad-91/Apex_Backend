const mongoose = require("mongoose");

const p2pTransferSchema = new mongoose.Schema({
    transferId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    note: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null
    },
    status: {
        type: String,
        enum: ["completed", "failed"],
        default: "completed"
    }
}, { timestamps: true });

module.exports = mongoose.model("P2PTransfer", p2pTransferSchema);
