const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    transactionId:{
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    screenshotUrl:{
        type: String,
        required: true,
    },
    amount:{
        type: String,
        required: true,
    },
    accountName:{
        type: String,
        required: true,
        trim: true
    },
    status:{
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    }, { timestamps: true });

    module.exports = mongoose.model("Transaction", transactionSchema);