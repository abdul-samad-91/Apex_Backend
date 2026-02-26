// Node.js script to convert users.json to SQL INSERT statements for MySQL with UUID support
// This script generates UUIDs from MongoDB ObjectIds for consistency
// Place this script in the same folder as users.json and run: node convert_users_to_sql.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function getDate(obj) {
  if (!obj || !obj.$date) return 'NULL';
  return `'${new Date(obj.$date).toISOString().slice(0, 19).replace('T', ' ')}'`;
}

function getId(obj) {
  if (!obj || !obj.$oid) return 'NULL';
  const mongoId = obj.$oid;
  return `'${objectIdToUuidMap[mongoId] || mongoId}'`;
}

function escape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  const str = String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

function mapUser(user) {
  const mongoId = user._id.$oid;
  const uuid = objectIdToUuidMap[mongoId];
  
  return {
    id: `'${uuid}'`,
    full_name: escape(user.fullName),
    profile_picture_url: escape(user.profilePictureUrl),
    email: escape(user.email),
    phone_number: escape(user.phoneNumber),
    password: escape(user.password),
    role: escape(user.role),
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
    last_profit_share_claim_dates: escape(JSON.stringify(user.lastProfitShareClaimDates || {})),
    is_verified: user.isVerified ? 1 : 0,
    otp: escape(user.otp),
    otp_expiry: getDate(user.otpExpiry),
    referral_code: escape(user.referralCode),
    referred_by: user.referredBy ? getId(user.referredBy) : 'NULL',
    referrals: escape(JSON.stringify((user.referrals || []).map(ref => {
      const refId = ref.$oid;
      return objectIdToUuidMap[refId] || refId;
    }))),
    referral_chain: escape(JSON.stringify((user.referralChain || []).map(ref => {
      const refId = ref.$oid;
      return objectIdToUuidMap[refId] || refId;
    }))),
    last_login: 'NULL', // Not available
    created_at: getDate(user.createdAt),
    updated_at: getDate(user.updatedAt)
  };
}

const columns = [
  'id','full_name','profile_picture_url','email','phone_number','password','role','is_active','apex_coins','account_balance','p2p_wallet','locked_apex_coins','lock_start_date','lock_end_date','last_lock_date','total_roi_earned','total_bonus_earned','total_profit_share_earned','p2p_system_fees','withdrawal_system_fees','last_profit_share_claim_dates','is_verified','otp','otp_expiry','referral_code','referred_by','referrals','referral_chain','last_login','created_at','updated_at'
];

const sqlLines = users.map(user => {
  const row = mapUser(user);
  const values = columns.map(col => row[col]).join(', ');
  return `INSERT INTO users (${columns.join(', ')}) VALUES (${values});`;
});

// Add commands to disable/enable foreign key checks for bulk import
const sql = [
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
  ...sqlLines,
  '',
  'SET FOREIGN_KEY_CHECKS = 1;'
].join('\n');

fs.writeFileSync(path.join(__dirname, 'users_mysql.sql'), sql);

// Also save the UUID mapping for reference
const mappingJson = JSON.stringify(objectIdToUuidMap, null, 2);
fs.writeFileSync(path.join(__dirname, 'objectid_uuid_mapping.json'), mappingJson);

console.log('✓ users_mysql.sql generated with UUID support');
console.log('✓ objectid_uuid_mapping.json created for reference');
console.log('You can now import users_mysql.sql into phpMyAdmin.');
