// Node.js script to convert all JSON data files to SQL INSERT statements for MySQL
// This script converts all MongoDB JSON exports to MySQL-compatible SQL statements
// Run: node convert_all_to_sql.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========================================
// Configuration and Utilities
// ========================================

// Load existing MongoDB ObjectId to UUID mapping
let objectIdToUuidMap = {};
const mappingPath = path.join(__dirname, 'objectid_uuid_mapping.json');
if (fs.existsSync(mappingPath)) {
    objectIdToUuidMap = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    console.log(`✓ Loaded ${Object.keys(objectIdToUuidMap).length} existing UUID mappings`);
}

// Generate deterministic UUID from MongoDB ObjectId
function generateUuidFromObjectId(mongoId) {
    if (objectIdToUuidMap[mongoId]) {
        return objectIdToUuidMap[mongoId];
    }
    const hash = crypto.createHash('sha256').update(mongoId).digest('hex');
    const uuid = [
        hash.substr(0, 8),
        hash.substr(8, 4),
        '4' + hash.substr(13, 3),
        (parseInt(hash.substr(16, 2), 16) & 0x3f | 0x80).toString(16) + hash.substr(18, 2),
        hash.substr(20, 12)
    ].join('-');
    objectIdToUuidMap[mongoId] = uuid;
    return uuid;
}

// Helper functions
function getDate(obj) {
    if (!obj || !obj.$date) return 'NULL';
    return `'${new Date(obj.$date).toISOString().slice(0, 19).replace('T', ' ')}'`;
}

function getId(obj) {
    if (!obj || !obj.$oid) return 'NULL';
    const mongoId = obj.$oid;
    return `'${generateUuidFromObjectId(mongoId)}'`;
}

function getIdRaw(obj) {
    if (!obj || !obj.$oid) return null;
    return generateUuidFromObjectId(obj.$oid);
}

function escape(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 1 : 0;
    const str = String(val).replace(/'/g, "''").replace(/\\/g, '\\\\');
    return `'${str}'`;
}

function escapeNumber(val) {
    if (val === null || val === undefined) return 0;
    return Number(val) || 0;
}

// ========================================
// Load All JSON Files
// ========================================

console.log('\n--- Loading JSON files ---');

const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
console.log(`✓ users.json: ${users.length} records`);

const transactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'transactions.json'), 'utf8'));
console.log(`✓ transactions.json: ${transactions.length} records`);

const withdrawals = JSON.parse(fs.readFileSync(path.join(__dirname, 'withdrawals.json'), 'utf8'));
console.log(`✓ withdrawals.json: ${withdrawals.length} records`);

const apexCoinRates = JSON.parse(fs.readFileSync(path.join(__dirname, 'apexcoinrates.json'), 'utf8'));
console.log(`✓ apexcoinrates.json: ${apexCoinRates.length} records`);

const rois = JSON.parse(fs.readFileSync(path.join(__dirname, 'rois.json'), 'utf8'));
console.log(`✓ rois.json: ${rois.length} records`);

const gateways = JSON.parse(fs.readFileSync(path.join(__dirname, 'gateways.json'), 'utf8'));
console.log(`✓ gateways.json: ${gateways.length} records`);

const p2pTransfers = JSON.parse(fs.readFileSync(path.join(__dirname, 'p2ptransfers.json'), 'utf8'));
console.log(`✓ p2ptransfers.json: ${p2pTransfers.length} records`);

const bonusTransactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'bonustransactions.json'), 'utf8'));
console.log(`✓ bonustransactions.json: ${bonusTransactions.length} records`);

const profitShareTransactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'profitsharetransactions.json'), 'utf8'));
console.log(`✓ profitsharetransactions.json: ${profitShareTransactions.length} records`);

const dailyRoiEarnings = JSON.parse(fs.readFileSync(path.join(__dirname, 'dailyroiearnings.json'), 'utf8'));
console.log(`✓ dailyroiearnings.json: ${dailyRoiEarnings.length} records`);

// ========================================
// First Pass: Generate all UUIDs
// ========================================

console.log('\n--- Generating UUIDs for all ObjectIds ---');

// Process all users first to ensure their IDs are mapped
users.forEach(user => {
    generateUuidFromObjectId(user._id.$oid);
    // Also process referrals and referralChain
    (user.referrals || []).forEach(ref => {
        if (ref && ref.$oid) generateUuidFromObjectId(ref.$oid);
    });
    (user.referralChain || []).forEach(ref => {
        if (ref && ref.$oid) generateUuidFromObjectId(ref.$oid);
    });
    if (user.referredBy && user.referredBy.$oid) {
        generateUuidFromObjectId(user.referredBy.$oid);
    }
    // Process lockedCoinsEntries
    (user.lockedCoinsEntries || []).forEach(entry => {
        if (entry._id && entry._id.$oid) {
            generateUuidFromObjectId(entry._id.$oid);
        }
        if (entry.unlockRequest && entry.unlockRequest.approvedBy && entry.unlockRequest.approvedBy.$oid) {
            generateUuidFromObjectId(entry.unlockRequest.approvedBy.$oid);
        }
    });
});

// Process all other collections
transactions.forEach(t => {
    generateUuidFromObjectId(t._id.$oid);
    if (t.user && t.user.$oid) generateUuidFromObjectId(t.user.$oid);
});

withdrawals.forEach(w => {
    generateUuidFromObjectId(w._id.$oid);
    if (w.user && w.user.$oid) generateUuidFromObjectId(w.user.$oid);
    if (w.processedBy && w.processedBy.$oid) generateUuidFromObjectId(w.processedBy.$oid);
});

apexCoinRates.forEach(r => {
    generateUuidFromObjectId(r._id.$oid);
    if (r.createdBy && r.createdBy.$oid) generateUuidFromObjectId(r.createdBy.$oid);
});

rois.forEach(r => {
    generateUuidFromObjectId(r._id.$oid);
    if (r.createdBy && r.createdBy.$oid) generateUuidFromObjectId(r.createdBy.$oid);
});

gateways.forEach(g => {
    generateUuidFromObjectId(g._id.$oid);
    if (g.createdBy && g.createdBy.$oid) generateUuidFromObjectId(g.createdBy.$oid);
});

p2pTransfers.forEach(p => {
    generateUuidFromObjectId(p._id.$oid);
    if (p.sender && p.sender.$oid) generateUuidFromObjectId(p.sender.$oid);
    if (p.recipient && p.recipient.$oid) generateUuidFromObjectId(p.recipient.$oid);
});

bonusTransactions.forEach(b => {
    generateUuidFromObjectId(b._id.$oid);
    if (b.userId && b.userId.$oid) generateUuidFromObjectId(b.userId.$oid);
    if (b.fromUserId && b.fromUserId.$oid) generateUuidFromObjectId(b.fromUserId.$oid);
    if (b.stakeEntryId && b.stakeEntryId.$oid) generateUuidFromObjectId(b.stakeEntryId.$oid);
});

profitShareTransactions.forEach(p => {
    generateUuidFromObjectId(p._id.$oid);
    if (p.userId && p.userId.$oid) generateUuidFromObjectId(p.userId.$oid);
    if (p.fromUserId && p.fromUserId.$oid) generateUuidFromObjectId(p.fromUserId.$oid);
});

console.log(`✓ Total UUID mappings: ${Object.keys(objectIdToUuidMap).length}`);

// ========================================
// Convert Users (already done, but keeping for completeness)
// ========================================

console.log('\n--- Generating SQL files ---');

function mapUser(user) {
    const uuid = generateUuidFromObjectId(user._id.$oid);
    
    return {
        id: `'${uuid}'`,
        full_name: escape(user.fullName),
        profile_picture_url: escape(user.profilePictureUrl),
        email: escape(user.email),
        phone_number: escape(user.phoneNumber),
        password: escape(user.password),
        role: escape(user.role),
        is_active: user.isActive ? 1 : 0,
        apex_coins: escapeNumber(user.apexCoins),
        account_balance: escapeNumber(user.accountBalance),
        p2p_wallet: escapeNumber(user.p2pWallet),
        locked_apex_coins: escapeNumber(user.lockedApexCoins),
        lock_start_date: getDate(user.lockStartDate),
        lock_end_date: getDate(user.lockEndDate),
        last_lock_date: getDate(user.lastLockDate),
        total_roi_earned: escapeNumber(user.totalRoiEarned),
        total_bonus_earned: escapeNumber(user.totalBonusEarned),
        total_profit_share_earned: escapeNumber(user.totalProfitShareEarned),
        p2p_system_fees: escapeNumber(user.p2pSystemFees),
        withdrawal_system_fees: escapeNumber(user.withdrawalSystemFees),
        last_profit_share_claim_dates: escape(JSON.stringify(user.lastProfitShareClaimDates || {})),
        is_verified: user.isVerified ? 1 : 0,
        otp: escape(user.otp),
        otp_expiry: getDate(user.otpExpiry),
        referral_code: escape(user.referralCode),
        referred_by: user.referredBy ? getId(user.referredBy) : 'NULL',
        referrals: escape(JSON.stringify((user.referrals || []).map(ref => {
            return getIdRaw(ref) || ref;
        }))),
        referral_chain: escape(JSON.stringify((user.referralChain || []).map(ref => {
            return getIdRaw(ref) || ref;
        }))),
        last_login: 'NULL',
        created_at: getDate(user.createdAt),
        updated_at: getDate(user.updatedAt)
    };
}

const userColumns = ['id','full_name','profile_picture_url','email','phone_number','password','role','is_active','apex_coins','account_balance','p2p_wallet','locked_apex_coins','lock_start_date','lock_end_date','last_lock_date','total_roi_earned','total_bonus_earned','total_profit_share_earned','p2p_system_fees','withdrawal_system_fees','last_profit_share_claim_dates','is_verified','otp','otp_expiry','referral_code','referred_by','referrals','referral_chain','last_login','created_at','updated_at'];

const userSqlLines = users.map(user => {
    const row = mapUser(user);
    const values = userColumns.map(col => row[col]).join(', ');
    return `INSERT INTO users (${userColumns.join(', ')}) VALUES (${values});`;
});

// ========================================
// Extract and Convert Locked Coins Entries
// ========================================

const lockedCoinsEntries = [];
users.forEach(user => {
    const userId = generateUuidFromObjectId(user._id.$oid);
    (user.lockedCoinsEntries || []).forEach(entry => {
        if (entry._id && entry._id.$oid) {
            lockedCoinsEntries.push({
                user: user,
                userId: userId,
                entry: entry
            });
        }
    });
});

function mapLockedCoinsEntry(data) {
    const { userId, entry } = data;
    const uuid = generateUuidFromObjectId(entry._id.$oid);
    const unlockReq = entry.unlockRequest || {};
    
    return {
        id: `'${uuid}'`,
        user_id: `'${userId}'`,
        amount: escapeNumber(entry.amount),
        lock_start_date: getDate(entry.lockStartDate),
        lock_end_date: getDate(entry.lockEndDate),
        status: escape(entry.status || 'active'),
        roi_rate_at_lock: escapeNumber(entry.roiRateAtLock),
        unlock_requested_at: unlockReq.requestedAt ? getDate({ $date: unlockReq.requestedAt }) : 'NULL',
        unlock_process_after: unlockReq.processAfter ? getDate({ $date: unlockReq.processAfter }) : 'NULL',
        penalty_percentage: escapeNumber(unlockReq.penaltyPercentage),
        penalty_amount: escapeNumber(unlockReq.penaltyAmount),
        amount_after_penalty: escapeNumber(unlockReq.amountAfterPenalty),
        days_elapsed_at_request: escapeNumber(unlockReq.daysElapsedAtRequest),
        unlock_approved_at: unlockReq.approvedAt ? getDate({ $date: unlockReq.approvedAt }) : 'NULL',
        unlock_approved_by: unlockReq.approvedBy ? getId(unlockReq.approvedBy) : 'NULL',
        unclaimed_profit: escapeNumber(entry.unclaimedProfit),
        last_claim_date: getDate(entry.lastClaimDate),
        total_claimed_profit: escapeNumber(entry.totalClaimedProfit),
        created_at: getDate(entry.createdAt),
        updated_at: getDate(entry.createdAt) // Use createdAt as updatedAt if not available
    };
}

const lockedCoinsColumns = ['id', 'user_id', 'amount', 'lock_start_date', 'lock_end_date', 'status', 'roi_rate_at_lock', 'unlock_requested_at', 'unlock_process_after', 'penalty_percentage', 'penalty_amount', 'amount_after_penalty', 'days_elapsed_at_request', 'unlock_approved_at', 'unlock_approved_by', 'unclaimed_profit', 'last_claim_date', 'total_claimed_profit', 'created_at', 'updated_at'];

const lockedCoinsSqlLines = lockedCoinsEntries.map(data => {
    const row = mapLockedCoinsEntry(data);
    const values = lockedCoinsColumns.map(col => row[col]).join(', ');
    return `INSERT INTO locked_coins_entries (${lockedCoinsColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ locked_coins_entries: ${lockedCoinsEntries.length} records extracted from users`);

// ========================================
// Convert Transactions
// ========================================

function mapTransaction(t) {
    const uuid = generateUuidFromObjectId(t._id.$oid);
    
    return {
        id: `'${uuid}'`,
        transaction_id: escape(t.transactionId),
        user_id: getId(t.user),
        screenshot_url: escape(t.screenshotUrl),
        amount: escapeNumber(t.amount),
        account_name: escape(t.accountName),
        bank_account_number: escape(t.bankAccountNumber),
        bank_name: escape(t.bankName),
        status: escape(t.status || 'pending'),
        created_at: getDate(t.createdAt),
        updated_at: getDate(t.updatedAt)
    };
}

const transactionColumns = ['id', 'transaction_id', 'user_id', 'screenshot_url', 'amount', 'account_name', 'bank_account_number', 'bank_name', 'status', 'created_at', 'updated_at'];

const transactionSqlLines = transactions.map(t => {
    const row = mapTransaction(t);
    const values = transactionColumns.map(col => row[col]).join(', ');
    return `INSERT INTO transactions (${transactionColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ transactions: ${transactions.length} records`);

// ========================================
// Convert Withdrawals
// ========================================

function mapWithdrawal(w) {
    const uuid = generateUuidFromObjectId(w._id.$oid);
    
    return {
        id: `'${uuid}'`,
        withdrawal_id: escape(w.withdrawalId),
        user_id: getId(w.user),
        amount: escapeNumber(w.amount),
        system_fee_percentage: escapeNumber(w.systemFeePercentage),
        system_fee_amount: escapeNumber(w.systemFeeAmount),
        amount_after_fee: escapeNumber(w.amountAfterFee),
        wallet_address: escape(w.walletAddress),
        network: escape(w.network),
        status: escape(w.status || 'pending'),
        rejection_reason: escape(w.rejectionReason),
        processed_at: getDate(w.processedAt),
        processed_by: getId(w.processedBy),
        transaction_hash: escape(w.transactionHash),
        transaction_id: escape(w.transactionID), // Note: some records have transactionID
        created_at: getDate(w.createdAt),
        updated_at: getDate(w.updatedAt)
    };
}

const withdrawalColumns = ['id', 'withdrawal_id', 'user_id', 'amount', 'system_fee_percentage', 'system_fee_amount', 'amount_after_fee', 'wallet_address', 'network', 'status', 'rejection_reason', 'processed_at', 'processed_by', 'transaction_hash', 'transaction_id', 'created_at', 'updated_at'];

const withdrawalSqlLines = withdrawals.map(w => {
    const row = mapWithdrawal(w);
    const values = withdrawalColumns.map(col => row[col]).join(', ');
    return `INSERT INTO withdrawals (${withdrawalColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ withdrawals: ${withdrawals.length} records`);

// ========================================
// Convert Apex Coin Rates
// ========================================

function mapApexCoinRate(r) {
    const uuid = generateUuidFromObjectId(r._id.$oid);
    
    return {
        id: `'${uuid}'`,
        rate: escapeNumber(r.rate),
        is_active: r.isActive ? 1 : 0,
        created_by: getId(r.createdBy),
        created_at: getDate(r.createdAt),
        updated_at: getDate(r.updatedAt)
    };
}

const apexCoinRateColumns = ['id', 'rate', 'is_active', 'created_by', 'created_at', 'updated_at'];

const apexCoinRateSqlLines = apexCoinRates.map(r => {
    const row = mapApexCoinRate(r);
    const values = apexCoinRateColumns.map(col => row[col]).join(', ');
    return `INSERT INTO apex_coin_rates (${apexCoinRateColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ apex_coin_rates: ${apexCoinRates.length} records`);

// ========================================
// Convert ROIs
// ========================================

function mapRoi(r) {
    const uuid = generateUuidFromObjectId(r._id.$oid);
    
    return {
        id: `'${uuid}'`,
        rate: escapeNumber(r.rate),
        is_active: r.isActive ? 1 : 0,
        created_by: getId(r.createdBy),
        created_at: getDate(r.createdAt),
        updated_at: getDate(r.updatedAt)
    };
}

const roiColumns = ['id', 'rate', 'is_active', 'created_by', 'created_at', 'updated_at'];

const roiSqlLines = rois.map(r => {
    const row = mapRoi(r);
    const values = roiColumns.map(col => row[col]).join(', ');
    return `INSERT INTO roi_rates (${roiColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ roi_rates: ${rois.length} records`);

// ========================================
// Convert Gateways
// ========================================

function mapGateway(g) {
    const uuid = generateUuidFromObjectId(g._id.$oid);
    
    return {
        id: `'${uuid}'`,
        image: escape(g.image),
        wallet_name: escape(g.walletName),
        wallet_address: escape(g.walletAddress),
        created_by: getId(g.createdBy),
        created_at: getDate(g.createdAt),
        updated_at: getDate(g.updatedAt)
    };
}

const gatewayColumns = ['id', 'image', 'wallet_name', 'wallet_address', 'created_by', 'created_at', 'updated_at'];

const gatewaySqlLines = gateways.map(g => {
    const row = mapGateway(g);
    const values = gatewayColumns.map(col => row[col]).join(', ');
    return `INSERT INTO gateways (${gatewayColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ gateways: ${gateways.length} records`);

// ========================================
// Convert P2P Transfers
// ========================================

function mapP2PTransfer(p) {
    const uuid = generateUuidFromObjectId(p._id.$oid);
    
    return {
        id: `'${uuid}'`,
        transfer_id: escape(p.transferId),
        sender_id: getId(p.sender),
        recipient_id: getId(p.recipient),
        amount: escapeNumber(p.amount),
        system_fee_percentage: escapeNumber(p.systemFeePercentage),
        system_fee_amount: escapeNumber(p.systemFeeAmount),
        amount_after_fee: escapeNumber(p.amountAfterFee),
        note: escape(p.note),
        status: escape(p.status || 'completed'),
        created_at: getDate(p.createdAt),
        updated_at: getDate(p.updatedAt)
    };
}

const p2pTransferColumns = ['id', 'transfer_id', 'sender_id', 'recipient_id', 'amount', 'system_fee_percentage', 'system_fee_amount', 'amount_after_fee', 'note', 'status', 'created_at', 'updated_at'];

const p2pTransferSqlLines = p2pTransfers.map(p => {
    const row = mapP2PTransfer(p);
    const values = p2pTransferColumns.map(col => row[col]).join(', ');
    return `INSERT INTO p2p_transfers (${p2pTransferColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ p2p_transfers: ${p2pTransfers.length} records`);

// ========================================
// Convert Bonus Transactions
// ========================================

function mapBonusTransaction(b) {
    const uuid = generateUuidFromObjectId(b._id.$oid);
    
    return {
        id: `'${uuid}'`,
        user_id: getId(b.userId),
        from_user_id: getId(b.fromUserId),
        stake_entry_id: getId(b.stakeEntryId),
        investment_amount: escapeNumber(b.investmentAmount),
        bonus_percentage: escapeNumber(b.bonusPercentage),
        bonus_amount: escapeNumber(b.bonusAmount),
        level: escapeNumber(b.level),
        active_direct_referrals_at_time: escapeNumber(b.activeDirectReferralsAtTime),
        is_claimed: b.isClaimed ? 1 : 0,
        claimed_at: getDate(b.claimedAt),
        created_at: getDate(b.createdAt),
        updated_at: getDate(b.updatedAt)
    };
}

const bonusTransactionColumns = ['id', 'user_id', 'from_user_id', 'stake_entry_id', 'investment_amount', 'bonus_percentage', 'bonus_amount', 'level', 'active_direct_referrals_at_time', 'is_claimed', 'claimed_at', 'created_at', 'updated_at'];

const bonusTransactionSqlLines = bonusTransactions.map(b => {
    const row = mapBonusTransaction(b);
    const values = bonusTransactionColumns.map(col => row[col]).join(', ');
    return `INSERT INTO bonus_transactions (${bonusTransactionColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ bonus_transactions: ${bonusTransactions.length} records`);

// ========================================
// Convert Profit Share Transactions
// ========================================

function mapProfitShareTransaction(p) {
    const uuid = generateUuidFromObjectId(p._id.$oid);
    
    return {
        id: `'${uuid}'`,
        user_id: getId(p.userId),
        from_user_id: getId(p.fromUserId),
        roi_amount: escapeNumber(p.roiAmount),
        share_percentage: escapeNumber(p.sharePercentage),
        share_amount: escapeNumber(p.shareAmount),
        level: escapeNumber(p.level),
        active_direct_referrals_at_time: escapeNumber(p.activeDirectReferralsAtTime),
        claim_date: getDate(p.claimDate),
        is_claimed: p.isClaimed ? 1 : 0,
        claimed_at: getDate(p.claimedAt),
        created_at: getDate(p.createdAt),
        updated_at: getDate(p.updatedAt)
    };
}

const profitShareTransactionColumns = ['id', 'user_id', 'from_user_id', 'roi_amount', 'share_percentage', 'share_amount', 'level', 'active_direct_referrals_at_time', 'claim_date', 'is_claimed', 'claimed_at', 'created_at', 'updated_at'];

const profitShareTransactionSqlLines = profitShareTransactions.map(p => {
    const row = mapProfitShareTransaction(p);
    const values = profitShareTransactionColumns.map(col => row[col]).join(', ');
    return `INSERT INTO profit_share_transactions (${profitShareTransactionColumns.join(', ')}) VALUES (${values});`;
});

console.log(`✓ profit_share_transactions: ${profitShareTransactions.length} records`);

// ========================================
// Write SQL Files
// ========================================

console.log('\n--- Writing SQL files ---');

// Complete SQL file with all tables
const allSql = [
    '-- ==============================================',
    '-- Complete MySQL Data Import Script',
    '-- Generated from MongoDB JSON exports',
    '-- ==============================================',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";',
    '',
    '-- ==============================================',
    '-- Users Table',
    '-- ==============================================',
    '',
    ...userSqlLines,
    '',
    '-- ==============================================',
    '-- Locked Coins Entries Table',
    '-- ==============================================',
    '',
    ...lockedCoinsSqlLines,
    '',
    '-- ==============================================',
    '-- Transactions Table',
    '-- ==============================================',
    '',
    ...transactionSqlLines,
    '',
    '-- ==============================================',
    '-- Withdrawals Table',
    '-- ==============================================',
    '',
    ...withdrawalSqlLines,
    '',
    '-- ==============================================',
    '-- Apex Coin Rates Table',
    '-- ==============================================',
    '',
    ...apexCoinRateSqlLines,
    '',
    '-- ==============================================',
    '-- ROI Rates Table',
    '-- ==============================================',
    '',
    ...roiSqlLines,
    '',
    '-- ==============================================',
    '-- Gateways Table',
    '-- ==============================================',
    '',
    ...gatewaySqlLines,
    '',
    '-- ==============================================',
    '-- P2P Transfers Table',
    '-- ==============================================',
    '',
    ...p2pTransferSqlLines,
    '',
    '-- ==============================================',
    '-- Bonus Transactions Table',
    '-- ==============================================',
    '',
    ...bonusTransactionSqlLines,
    '',
    '-- ==============================================',
    '-- Profit Share Transactions Table',
    '-- ==============================================',
    '',
    ...profitShareTransactionSqlLines,
    '',
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
    '-- ==============================================',
    '-- Import Complete',
    '-- =============================================='
].join('\n');

fs.writeFileSync(path.join(__dirname, 'all_data_mysql.sql'), allSql);
console.log('✓ all_data_mysql.sql - Complete data import file');

// Individual SQL files for each table
const individualFiles = [
    { name: 'transactions_mysql.sql', lines: transactionSqlLines },
    { name: 'withdrawals_mysql.sql', lines: withdrawalSqlLines },
    { name: 'locked_coins_entries_mysql.sql', lines: lockedCoinsSqlLines },
    { name: 'apex_coin_rates_mysql.sql', lines: apexCoinRateSqlLines },
    { name: 'roi_rates_mysql.sql', lines: roiSqlLines },
    { name: 'gateways_mysql.sql', lines: gatewaySqlLines },
    { name: 'p2p_transfers_mysql.sql', lines: p2pTransferSqlLines },
    { name: 'bonus_transactions_mysql.sql', lines: bonusTransactionSqlLines },
    { name: 'profit_share_transactions_mysql.sql', lines: profitShareTransactionSqlLines }
];

individualFiles.forEach(file => {
    const sql = [
        'SET FOREIGN_KEY_CHECKS = 0;',
        '',
        ...file.lines,
        '',
        'SET FOREIGN_KEY_CHECKS = 1;'
    ].join('\n');
    fs.writeFileSync(path.join(__dirname, file.name), sql);
    console.log(`✓ ${file.name}`);
});

// Update the UUID mapping file
fs.writeFileSync(mappingPath, JSON.stringify(objectIdToUuidMap, null, 2));
console.log('✓ objectid_uuid_mapping.json updated');

// ========================================
// Validation and Error Checking
// ========================================

console.log('\n--- Validation Report ---');

const errors = [];
const warnings = [];

// Check for missing user references
const userIds = new Set(users.map(u => generateUuidFromObjectId(u._id.$oid)));

// Validate transactions
transactions.forEach((t, idx) => {
    const userId = getIdRaw(t.user);
    if (!userId) {
        errors.push(`Transaction[${idx}] (${t.transactionId}): Missing user reference`);
    } else if (!userIds.has(userId)) {
        warnings.push(`Transaction[${idx}] (${t.transactionId}): User ${userId} not found in users collection`);
    }
});

// Validate withdrawals
withdrawals.forEach((w, idx) => {
    const userId = getIdRaw(w.user);
    if (!userId) {
        errors.push(`Withdrawal[${idx}] (${w.withdrawalId}): Missing user reference`);
    } else if (!userIds.has(userId)) {
        warnings.push(`Withdrawal[${idx}] (${w.withdrawalId}): User ${userId} not found in users collection`);
    }
    
    if (w.processedBy) {
        const processedById = getIdRaw(w.processedBy);
        if (processedById && !userIds.has(processedById)) {
            warnings.push(`Withdrawal[${idx}] (${w.withdrawalId}): ProcessedBy user ${processedById} not found`);
        }
    }
});

// Validate P2P transfers
p2pTransfers.forEach((p, idx) => {
    const senderId = getIdRaw(p.sender);
    const recipientId = getIdRaw(p.recipient);
    
    if (!senderId) {
        errors.push(`P2PTransfer[${idx}] (${p.transferId}): Missing sender reference`);
    } else if (!userIds.has(senderId)) {
        warnings.push(`P2PTransfer[${idx}] (${p.transferId}): Sender ${senderId} not found`);
    }
    
    if (!recipientId) {
        errors.push(`P2PTransfer[${idx}] (${p.transferId}): Missing recipient reference`);
    } else if (!userIds.has(recipientId)) {
        warnings.push(`P2PTransfer[${idx}] (${p.transferId}): Recipient ${recipientId} not found`);
    }
});

// Validate bonus transactions
const stakeEntryIds = new Set(lockedCoinsEntries.map(e => generateUuidFromObjectId(e.entry._id.$oid)));

bonusTransactions.forEach((b, idx) => {
    const userId = getIdRaw(b.userId);
    const fromUserId = getIdRaw(b.fromUserId);
    const stakeEntryId = getIdRaw(b.stakeEntryId);
    
    if (!userId || !userIds.has(userId)) {
        warnings.push(`BonusTransaction[${idx}]: User ${userId || 'NULL'} not found`);
    }
    if (!fromUserId || !userIds.has(fromUserId)) {
        warnings.push(`BonusTransaction[${idx}]: FromUser ${fromUserId || 'NULL'} not found`);
    }
    if (!stakeEntryId || !stakeEntryIds.has(stakeEntryId)) {
        warnings.push(`BonusTransaction[${idx}]: StakeEntry ${stakeEntryId || 'NULL'} not found`);
    }
});

// Validate profit share transactions
profitShareTransactions.forEach((p, idx) => {
    const userId = getIdRaw(p.userId);
    const fromUserId = getIdRaw(p.fromUserId);
    
    if (!userId || !userIds.has(userId)) {
        warnings.push(`ProfitShareTransaction[${idx}]: User ${userId || 'NULL'} not found`);
    }
    if (!fromUserId || !userIds.has(fromUserId)) {
        warnings.push(`ProfitShareTransaction[${idx}]: FromUser ${fromUserId || 'NULL'} not found`);
    }
});

// Print validation results
if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e}`));
}

if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    warnings.slice(0, 20).forEach(w => console.log(`  - ${w}`));
    if (warnings.length > 20) {
        console.log(`  ... and ${warnings.length - 20} more warnings`);
    }
}

if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ No errors or warnings found!');
}

// ========================================
// Summary
// ========================================

console.log('\n========================================');
console.log('CONVERSION SUMMARY');
console.log('========================================');
console.log(`Total Users: ${users.length}`);
console.log(`Total Locked Coins Entries: ${lockedCoinsEntries.length}`);
console.log(`Total Transactions: ${transactions.length}`);
console.log(`Total Withdrawals: ${withdrawals.length}`);
console.log(`Total Apex Coin Rates: ${apexCoinRates.length}`);
console.log(`Total ROI Rates: ${rois.length}`);
console.log(`Total Gateways: ${gateways.length}`);
console.log(`Total P2P Transfers: ${p2pTransfers.length}`);
console.log(`Total Bonus Transactions: ${bonusTransactions.length}`);
console.log(`Total Profit Share Transactions: ${profitShareTransactions.length}`);
console.log(`Total UUID Mappings: ${Object.keys(objectIdToUuidMap).length}`);
console.log('========================================');
console.log('\n✓ Conversion complete!');
console.log('You can now import the SQL files into MySQL/phpMyAdmin.');
console.log('\nIMPORTANT: Import in this order to respect foreign key constraints:');
console.log('  1. users_mysql.sql (already created)');
console.log('  2. locked_coins_entries_mysql.sql');
console.log('  3. All other tables');
console.log('\nOr use all_data_mysql.sql to import everything at once.');
