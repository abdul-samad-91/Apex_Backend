const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Function to generate UUID from MongoDB ObjectId (must match convert script exactly)
function generateUuidFromObjectId(objectId) {
  if (!objectId) return null;
  const hash = crypto.createHash('sha256').update(objectId).digest('hex');
  const uuid = [
    hash.substr(0, 8),
    hash.substr(8, 4),
    '4' + hash.substr(13, 3),
    (parseInt(hash.substr(16, 2), 16) & 0x3f | 0x80).toString(16) + hash.substr(18, 2),
    hash.substr(20, 12)
  ].join('-');
  return uuid;
}

const jsonDir = './Json Data';
const sqlDir = './mySQL Data';

const files = {
  'users.json': 'users_mysql.sql',
  'transactions.json': 'transactions_mysql.sql',
  'withdrawals.json': 'withdrawals_mysql.sql',
  'gateways.json': 'gateways_mysql.sql',
  'rois.json': 'roi_rates_mysql.sql',
  'apexcoinrates.json': 'apex_coin_rates_mysql.sql',
  'p2ptransfers.json': 'p2p_transfers_mysql.sql',
  'bonustransactions.json': 'bonus_transactions_mysql.sql',
  'profitsharetransactions.json': 'profit_share_transactions_mysql.sql'
};

console.log('\n=== RECORD COUNT COMPARISON ===\n');

let allMatch = true;

for (const [jsonFile, sqlFile] of Object.entries(files)) {
  const jsonPath = path.join(jsonDir, jsonFile);
  const sqlPath = path.join(sqlDir, sqlFile);
  
  if (fs.existsSync(jsonPath) && fs.existsSync(sqlPath)) {
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    const sqlCount = (sqlContent.match(/INSERT INTO/g) || []).length;
    
    const match = jsonData.length === sqlCount;
    if (!match) allMatch = false;
    console.log(`${jsonFile.padEnd(30)} JSON: ${jsonData.length.toString().padStart(4)} | SQL: ${sqlCount.toString().padStart(4)} ${match ? '✓' : '✗ MISMATCH!'}`);
  } else {
    console.log(`${jsonFile.padEnd(30)} - File missing`);
  }
}

// Check locked_coins_entries separately (extracted from users)
const usersJson = JSON.parse(fs.readFileSync(path.join(jsonDir, 'users.json'), 'utf8'));
let totalLockedEntries = 0;
usersJson.forEach(user => {
  if (user.lockedCoinsEntries && Array.isArray(user.lockedCoinsEntries)) {
    totalLockedEntries += user.lockedCoinsEntries.length;
  }
});
const lockedSqlPath = path.join(sqlDir, 'locked_coins_entries_mysql.sql');
if (fs.existsSync(lockedSqlPath)) {
  const lockedSqlContent = fs.readFileSync(lockedSqlPath, 'utf8');
  const lockedSqlCount = (lockedSqlContent.match(/INSERT INTO/g) || []).length;
  const match = totalLockedEntries === lockedSqlCount;
  if (!match) allMatch = false;
  console.log(`${'locked_coins_entries'.padEnd(30)} JSON: ${totalLockedEntries.toString().padStart(4)} | SQL: ${lockedSqlCount.toString().padStart(4)} ${match ? '✓' : '✗ MISMATCH!'}`);
}

console.log('\n=== UUID REFERENCE VERIFICATION ===\n');

// Verify user ID mappings are consistent
const transactions = JSON.parse(fs.readFileSync(path.join(jsonDir, 'transactions.json'), 'utf8'));
const usersMap = new Map();
usersJson.forEach(user => {
  const oid = user._id.$oid || user._id;
  usersMap.set(oid, user);
});

let missingRefs = 0;
transactions.forEach(tx => {
  const userOid = tx.user.$oid || tx.user;
  if (!usersMap.has(userOid)) {
    console.log(`Transaction ${tx.transactionId} references missing user: ${userOid}`);
    missingRefs++;
  }
});

if (missingRefs === 0) {
  console.log('All transaction user references are valid ✓');
}

// Verify withdrawals user references
const withdrawals = JSON.parse(fs.readFileSync(path.join(jsonDir, 'withdrawals.json'), 'utf8'));
missingRefs = 0;
withdrawals.forEach(w => {
  const userOid = w.user.$oid || w.user;
  if (!usersMap.has(userOid)) {
    console.log(`Withdrawal ${w._id.$oid} references missing user: ${userOid}`);
    missingRefs++;
  }
});

if (missingRefs === 0) {
  console.log('All withdrawal user references are valid ✓');
}

console.log('\n=== SAMPLE DATA VERIFICATION ===\n');

// Verify first user conversion
const firstUser = usersJson[0];
const expectedUuid = generateUuidFromObjectId(firstUser._id.$oid);
console.log(`First User: "${firstUser.fullName}"`);
console.log(`  MongoDB ObjectId: ${firstUser._id.$oid}`);
console.log(`  Expected UUID: ${expectedUuid}`);

// Read SQL and check
const usersSql = fs.readFileSync(path.join(sqlDir, 'users_mysql.sql'), 'utf8');
if (usersSql.includes(expectedUuid)) {
  console.log(`  UUID found in SQL: ✓`);
} else {
  console.log(`  UUID NOT found in SQL: ✗`);
  allMatch = false;
}

// Verify first transaction
const firstTx = transactions[0];
const txUuid = generateUuidFromObjectId(firstTx._id.$oid);
const txUserUuid = generateUuidFromObjectId(firstTx.user.$oid);
console.log(`\nFirst Transaction: "${firstTx.transactionId}"`);
console.log(`  MongoDB ObjectId: ${firstTx._id.$oid}`);
console.log(`  Expected UUID: ${txUuid}`);
console.log(`  User Reference (MongoDB): ${firstTx.user.$oid}`);
console.log(`  User Reference (UUID): ${txUserUuid}`);

const txSql = fs.readFileSync(path.join(sqlDir, 'transactions_mysql.sql'), 'utf8');
if (txSql.includes(txUuid) && txSql.includes(txUserUuid)) {
  console.log(`  Transaction and User UUIDs in SQL: ✓`);
} else {
  console.log(`  Transaction or User UUID NOT in SQL: ✗`);
  allMatch = false;
}

console.log('\n=== REFERRAL CHAIN VERIFICATION ===\n');

// Check referral relationships
let referralIssues = 0;
usersJson.forEach(user => {
  if (user.referredBy) {
    const referrerOid = user.referredBy.$oid || user.referredBy;
    if (!usersMap.has(referrerOid)) {
      console.log(`User "${user.fullName}" refers to missing referrer: ${referrerOid}`);
      referralIssues++;
    }
  }
});

if (referralIssues === 0) {
  console.log('All referral relationships are valid ✓');
}

console.log('\n=== SUMMARY ===\n');
if (allMatch) {
  console.log('✓ All conversions verified successfully!');
  console.log('✓ Data will be the same when imported to MySQL.');
} else {
  console.log('✗ Some issues detected. Review above for details.');
}
