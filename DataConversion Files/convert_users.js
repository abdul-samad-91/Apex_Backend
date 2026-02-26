// Node.js script to convert users.json (MongoDB export) to users_mysql.csv with UUID support
// Place this script in the same folder as users.json and run: node convert_users.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read users.json
const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));

// Create mapping from MongoDB ObjectId to UUID (deterministic conversion)
const objectIdToUuidMap = {};
users.forEach(user => {
  const mongoId = user._id.$oid;
  // Generate deterministic UUID from MongoDB ObjectId using SHA-256
  const hash = crypto.createHash('sha256').update(mongoId).digest('hex');
  const uuid = [
    hash.substr(0, 8),
    hash.substr(8, 4),
    '4' + hash.substr(13, 3), // Version 4 UUID
    (parseInt(hash.substr(16, 2), 16) & 0x3f | 0x80).toString(16) + hash.substr(18, 2),
    hash.substr(20, 12)
  ].join('-');
  objectIdToUuidMap[mongoId] = uuid;
});

// Helper to safely get nested date
function getDate(obj) {
  if (!obj || !obj.$date) return '';
  return new Date(obj.$date).toISOString().slice(0, 19).replace('T', ' ');
}

// Helper to flatten ObjectId to UUID
function getId(obj) {
  if (!obj || !obj.$oid) return '';
  const mongoId = obj.$oid;
  return objectIdToUuidMap[mongoId] || mongoId;
}

// Map MongoDB user to MySQL user row
function mapUser(user) {
  const mongoId = user._id.$oid;
  const uuid = objectIdToUuidMap[mongoId];
  
  return {
    id: uuid,
    full_name: user.fullName || '',
    profile_picture_url: user.profilePictureUrl || '',
    email: user.email || '',
    phone_number: user.phoneNumber || '',
    password: user.password || '',
    role: user.role || 'user',
    is_active: user.isActive ? 1 : 0,
    apex_coins: user.apexCoins || 0,
    account_balance: user.accountBalance || 0,
    p2p_wallet: user.p2pWallet || 0,
    locked_apex_coins: user.lockedApexCoins || 0,
    lock_start_date: getDate(user.lockStartDate),
    lock_end_date: getDate(user.lockEndDate),
    last_lock_date: getDate(user.lastLockDate),
    total_roi_earned: user.totalRoiEarned || 0,
    total_bonus_earned: user.totalBonusEarned || 0,
    total_profit_share_earned: user.totalProfitShareEarned || 0,
    p2p_system_fees: user.p2pSystemFees || 0,
    withdrawal_system_fees: user.withdrawalSystemFees || 0,
    last_profit_share_claim_dates: JSON.stringify(user.lastProfitShareClaimDates || {}),
    is_verified: user.isVerified ? 1 : 0,
    otp: user.otp || '',
    otp_expiry: getDate(user.otpExpiry),
    referral_code: user.referralCode || '',
    referred_by: user.referredBy ? getId(user.referredBy) : '',
    referrals: JSON.stringify((user.referrals || []).map(ref => {
      const refId = ref.$oid;
      return objectIdToUuidMap[refId] || refId;
    })),
    referral_chain: JSON.stringify((user.referralChain || []).map(ref => {
      const refId = ref.$oid;
      return objectIdToUuidMap[refId] || refId;
    })),
    last_login: '', // Not available in MongoDB export
    created_at: getDate(user.createdAt),
    updated_at: getDate(user.updatedAt)
  };
}

// CSV header (match MySQL table columns)
const header = [
  'id','full_name','profile_picture_url','email','phone_number','password','role','is_active','apex_coins','account_balance','p2p_wallet','locked_apex_coins','lock_start_date','lock_end_date','last_lock_date','total_roi_earned','total_bonus_earned','total_profit_share_earned','p2p_system_fees','withdrawal_system_fees','last_profit_share_claim_dates','is_verified','otp','otp_expiry','referral_code','referred_by','referrals','referral_chain','last_login','created_at','updated_at'
];

const rows = users.map(mapUser);

// Convert to CSV
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const csv = [header.join(',')]
  .concat(rows.map(row => header.map(col => escapeCSV(row[col])).join(',')))
  .join('\n');

fs.writeFileSync(path.join(__dirname, 'users_mysql.csv'), csv);

// Also save the UUID mapping for reference
const mappingJson = JSON.stringify(objectIdToUuidMap, null, 2);
fs.writeFileSync(path.join(__dirname, 'objectid_uuid_mapping.json'), mappingJson);

console.log('✓ users_mysql.csv generated with UUID support');
console.log('✓ objectid_uuid_mapping.json created for reference');
console.log('You can now import this file into phpMyAdmin.');
