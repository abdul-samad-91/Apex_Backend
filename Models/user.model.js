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

    cnic: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: function(v) {
          // Remove all non-digit characters and check if it's exactly 13 digits
          const digitsOnly = v.replace(/\D/g, '');
          return digitsOnly.length === 13;
        },
        message: 'CNIC must contain exactly 13 digits'
      }
    },

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
    }
  },
  {
    timestamps: true,
  }
);

// Format CNIC to add dashes if not present
userSchema.pre("save", function () {
  if (this.isModified("cnic") && this.cnic) {
    // Remove all non-digit characters first
    const cnicWithoutDashes = this.cnic.replace(/\D/g, "");
    
    // Check if it's exactly 13 digits
    if (/^\d{13}$/.test(cnicWithoutDashes)) {
      // Format as: 12345-1234567-1
      this.cnic = `${cnicWithoutDashes.slice(0, 5)}-${cnicWithoutDashes.slice(5, 12)}-${cnicWithoutDashes.slice(12)}`;
    }
  }
});

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
