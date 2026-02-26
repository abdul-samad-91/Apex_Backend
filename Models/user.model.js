const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../Config/DB');
const bcrypt = require('bcryptjs');

class User extends Model {
    // Compare password method
    async comparePassword(candidatePassword) {
        return await bcrypt.compare(candidatePassword, this.password);
    }

    // Get referral chain as array of IDs
    getReferralChainArray() {
        if (!this.referral_chain) return [];
        try {
            return JSON.parse(this.referral_chain);
        } catch {
            return [];
        }
    }

    // Set referral chain from array
    setReferralChainArray(chainArray) {
        this.referral_chain = JSON.stringify(chainArray || []);
    }

    // Get direct referrals as array of IDs
    getReferralsArray() {
        if (!this.referrals) return [];
        try {
            if (Array.isArray(this.referrals)) return this.referrals;
            return JSON.parse(this.referrals);
        } catch {
            return [];
        }
    }

    // Set direct referrals from array
    setReferralsArray(referralsArray) {
        this.referrals = JSON.stringify(referralsArray || []);
    }

    // Add a referral to the referrals array
    addReferral(userId) {
        const referrals = this.getReferralsArray();
        if (!referrals.includes(userId)) {
            referrals.push(userId);
            this.referrals = referrals;
        }
    }

    // Get last profit share claim dates as Map
    getLastProfitShareClaimDatesMap() {
        if (!this.last_profit_share_claim_dates) return new Map();
        try {
            const obj = JSON.parse(this.last_profit_share_claim_dates);
            return new Map(Object.entries(obj).map(([k, v]) => [k, new Date(v)]));
        } catch {
            return new Map();
        }
    }

    // Set last profit share claim dates from Map
    setLastProfitShareClaimDatesMap(dateMap) {
        if (dateMap instanceof Map) {
            const obj = Object.fromEntries(dateMap);
            this.last_profit_share_claim_dates = JSON.stringify(obj);
        }
    }
}

User.init(
    {
        id: {
            type: DataTypes.STRING(36),
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        full_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            validate: {
                len: [3, 100]
            }
        },
        profile_picture_url: {
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
                this.setDataValue('email', value ? value.toLowerCase().trim() : value);
            }
        },
        phone_number: {
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
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        apex_coins: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        account_balance: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        p2p_wallet: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        locked_apex_coins: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        lock_start_date: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        lock_end_date: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        last_lock_date: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        total_roi_earned: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        total_bonus_earned: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        total_profit_share_earned: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        // Total system fees collected from P2P transfers
        p2p_system_fees: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        // Total system fees collected from withdrawals
        withdrawal_system_fees: {
            type: DataTypes.DECIMAL(20, 8),
            defaultValue: 0
        },
        // Store as JSON string for flexibility
        last_profit_share_claim_dates: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        is_verified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        otp: {
            type: DataTypes.STRING(10),
            allowNull: true
        },
        otp_expiry: {
            type: DataTypes.DATE,
            allowNull: true
        },
        referral_code: {
            type: DataTypes.STRING(20),
            unique: true
        },
        referred_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        // Store direct referrals as JSON array of user IDs
        referrals: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        // Store referral chain as JSON array of user IDs
        referral_chain: {
            // type: DataTypes.TEXT('long'),
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        last_login: {
            type: DataTypes.DATE,
            allowNull: true
        }
    },
    {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamps: true,
        underscored: true,
        hooks: {
            beforeCreate: async (user) => {
                if (user.password) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            }
        },
        indexes: [
            { unique: true, fields: ['email'] },
            { unique: true, fields: ['phone_number'] },
            { unique: true, fields: ['referral_code'] },
            { fields: ['referred_by'] },
            { fields: ['is_active'] },
            { fields: ['role'] }
        ],
        defaultScope: {
            attributes: { exclude: ['password', 'otp', 'otp_expiry'] }
        },
        scopes: {
            withPassword: {
                attributes: { include: ['password'] }
            },
            withOtp: {
                attributes: { include: ['otp', 'otp_expiry'] }
            },
            withAll: {
                attributes: { include: ['password', 'otp', 'otp_expiry'] }
            }
        }
    }
);

module.exports = User;
