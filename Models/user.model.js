const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    profilePictureUrl: {
      type: String,
      trim: true,
      default: null
    },

    // cnic: {
    //   type: String,
    //   // required: true,
    //   unique: true,
    //   sparse: true,  // Allows multiple null values
    //   trim: true,
    //   validate: {
    //     validator: function(v) {
    //       // Skip validation if CNIC is not provided
    //       if (!v) return true;
    //       // Remove all non-digit characters and check if it's exactly 13 digits
    //       const digitsOnly = v.replace(/\D/g, '');
    //       return digitsOnly.length === 13;
    //     },
    //     message: 'CNIC must contain exactly 13 digits'
    //   }
    // },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // match: /^\+?[1-9]\d{9,14}$/,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    apexCoins:{
      type: Number,
      default: 0
    },
    accountBalance: {
      type: Number,
      default: 0
    },
    lockedApexCoins: {
      type: Number,
      default: 0
    },
    lockStartDate: {
      type: Date,
      default: null
    },
    lockEndDate: {
      type: Date,
      default: null
    },
    totalRoiEarned: {
      type: Number,
      default: 0
    },
    isVerified:{
      type: Boolean,
      default: false
    },
    otp: {
      type: String,
      select: false
    },
    otpExpiry: {
      type: Date,
      select: false
    },
    
    referralCode: {
      type: String,
      unique: true
    },

    // DIRECT referrer
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // DIRECT referrals
    referrals: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],

    // INDIRECT chain (A → B → C → D)
    referralChain: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }]
  },
  {
    timestamps: true,
  }
);

// NOTE: `cnic` field removed from schema; any existing CNIC data
// should be removed from the database using the migration script
// located at `scripts/remove_cnic.js`.

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
