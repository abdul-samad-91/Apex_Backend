const { DataTypes } = require('sequelize');
const { sequelize } = require('../Config/MySQL_DB');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  // Store original MongoDB _id for migration reference
  mongoId: {
    type: DataTypes.STRING(24),
    allowNull: true,
    unique: true
  },
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [3, 100]
    }
  },
  profilePictureUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    defaultValue: null
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    },
    set(value) {
      this.setDataValue('email', value.toLowerCase().trim());
    }
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [6, 255]
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  apexCoins: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  accountBalance: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  lockedApexCoins: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  lockStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  lockEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  lastLockDate: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  totalRoiEarned: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  totalBonusEarned: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  totalProfitShareEarned: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  otp: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  otpExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  referralCode: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true
  },
  // Self-referencing foreign key for referredBy
  referredById: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  tableName: 'Users',
  timestamps: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['phoneNumber'] },
    { fields: ['referralCode'] },
    { fields: ['referredById'] },
    { fields: ['isActive'] }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password && !user.password.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && !user.password.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Instance method to compare password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Class method to find user with password
User.findByCredentials = async function(email, password) {
  const user = await User.findOne({ where: { email } });
  if (!user) return null;
  const isMatch = await user.comparePassword(password);
  return isMatch ? user : null;
};

// Default scope to exclude password
User.addScope('defaultScope', {
  attributes: { exclude: ['password', 'otp', 'otpExpiry'] }
}, { override: true });

// Scope to include password for auth
User.addScope('withPassword', {
  attributes: { include: ['password'] }
});

module.exports = User;
