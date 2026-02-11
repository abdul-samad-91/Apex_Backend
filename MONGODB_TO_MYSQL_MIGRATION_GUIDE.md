# MongoDB to MySQL Migration Guide

This guide explains how to migrate your Apex Backend from MongoDB to MySQL.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Schema Changes Overview](#schema-changes-overview)
3. [Setup MySQL Database](#setup-mysql-database)
4. [Environment Configuration](#environment-configuration)
5. [Running the Migration](#running-the-migration)
6. [Updating Your Code](#updating-your-code)
7. [Verification Steps](#verification-steps)
8. [Rollback Plan](#rollback-plan)

---

## Prerequisites

1. **MySQL Server** installed and running (version 8.0+ recommended)
2. **Node.js** (your current version should work)
3. **Backup your MongoDB data** before starting

### Install MySQL Dependencies

```bash
npm install sequelize mysql2
```

---

## Schema Changes Overview

### MongoDB to MySQL Type Mappings

| MongoDB Type | MySQL Type (Sequelize) | Notes |
|-------------|----------------------|-------|
| `ObjectId` | `INTEGER UNSIGNED` (AUTO_INCREMENT) | Primary keys are now integers |
| `String` | `VARCHAR(n)` or `TEXT` | Specify max length |
| `Number` | `DECIMAL(20,8)` or `INTEGER` | Use DECIMAL for currency/coins |
| `Boolean` | `BOOLEAN` (TINYINT) | Same behavior |
| `Date` | `DATETIME` | Same behavior |
| `Array` (embedded docs) | Separate table | See LockedCoinsEntries |
| `Array` (ObjectIds) | Junction table | See UserReferrals |

### Structural Changes

1. **Embedded Arrays → Separate Tables**
   - `user.lockedCoinsEntries[]` → `LockedCoinsEntries` table
   - `user.referrals[]` → `UserReferrals` junction table
   - `user.referralChain[]` → `UserReferralChain` junction table

2. **Nested Objects → Flattened Columns**
   - `lockedCoinsEntry.unlockRequest.requestedAt` → `unlockRequestedAt`
   - `lockedCoinsEntry.unlockRequest.processAfter` → `unlockProcessAfter`

3. **References**
   - MongoDB `ObjectId` references → MySQL foreign key integers
   - All models have a `mongoId` column to store original MongoDB `_id` for reference

---

## Setup MySQL Database

### 1. Create the MySQL Database

```sql
-- Connect to MySQL as root or admin user
CREATE DATABASE apex_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create a dedicated user (recommended)
CREATE USER 'apex_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON apex_backend.* TO 'apex_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Tables Created Automatically

The Sequelize models will automatically create these tables:

- `Users`
- `LockedCoinsEntries`
- `Transactions`
- `Rois`
- `Gateways`
- `ApexCoinRates`
- `BonusTransactions`
- `ProfitShareTransactions`
- `UserReferrals`
- `UserReferralChain`

---

## Environment Configuration

Add these variables to your `.env` file:

```env
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=apex_backend
MYSQL_USER=apex_user
MYSQL_PASSWORD=your_secure_password

# Keep MongoDB URI for migration (can remove after migration)
MONGO_URI=mongodb://localhost:27017/apex_backend
```

---

## Running the Migration

### Step 1: Backup MongoDB Data (IMPORTANT!)

```bash
# Export all collections
mongodump --uri="your_mongodb_uri" --out=./backup_before_mysql_migration
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Run the Migration Script

```bash
node scripts/migrate_mongodb_to_mysql.js
```

The script will:
1. Connect to both MongoDB and MySQL
2. Create/sync MySQL tables
3. Migrate data in this order:
   - Users (including lockedCoinsEntries, referrals, referralChain)
   - Transactions
   - ROIs
   - Gateways
   - ApexCoinRates
   - BonusTransactions
   - ProfitShareTransactions
4. Print a summary of migrated records

### Expected Output

```
============================================================
MongoDB to MySQL Migration
============================================================
[2026-02-11T10:00:00.000Z] Connected to MongoDB
[2026-02-11T10:00:00.100Z] Connected to MySQL
[2026-02-11T10:00:00.200Z] MySQL tables synchronized
[2026-02-11T10:00:00.300Z] Starting User migration...
...
============================================================
Migration Summary
============================================================
Duration: 15.32 seconds

Records migrated:
  users: 150 (0 errors)
  transactions: 500 (0 errors)
  rois: 5 (0 errors)
  gateways: 3 (0 errors)
  apexCoinRates: 10 (0 errors)
  bonusTransactions: 1200 (0 errors)
  profitShareTransactions: 800 (0 errors)
============================================================
```

---

## Updating Your Code

### Import Changes

**Before (MongoDB/Mongoose):**
```javascript
const User = require('./Models/user.model');
const Transaction = require('./Models/transaction.model');
```

**After (MySQL/Sequelize):**
```javascript
const { User, Transaction, LockedCoinsEntry } = require('./Models_MySQL');
```

### Query Changes

**Find One:**
```javascript
// MongoDB
const user = await User.findById(userId);

// MySQL (Sequelize)
const user = await User.findByPk(userId);
// Or by mongoId for backward compatibility:
const user = await User.findOne({ where: { mongoId: oldMongoId } });
```

**Find with Conditions:**
```javascript
// MongoDB
const users = await User.find({ isActive: true, role: 'user' });

// MySQL (Sequelize)
const users = await User.findAll({ 
  where: { isActive: true, role: 'user' } 
});
```

**Find with Populated References:**
```javascript
// MongoDB
const user = await User.findById(id).populate('referredBy');

// MySQL (Sequelize)
const user = await User.findByPk(id, {
  include: [{ model: User, as: 'referrer' }]
});
```

**Find User with Locked Coins Entries:**
```javascript
// MongoDB (embedded array)
const user = await User.findById(id);
const entries = user.lockedCoinsEntries;

// MySQL (separate table)
const user = await User.findByPk(id, {
  include: [{ model: LockedCoinsEntry, as: 'lockedCoinsEntries' }]
});
const entries = user.lockedCoinsEntries;
```

**Create:**
```javascript
// MongoDB
const user = await User.create({ fullName, email, password });

// MySQL (Sequelize) - same syntax!
const user = await User.create({ fullName, email, password });
```

**Update:**
```javascript
// MongoDB
await User.findByIdAndUpdate(id, { isActive: false });

// MySQL (Sequelize)
await User.update({ isActive: false }, { where: { id } });
// Or:
const user = await User.findByPk(id);
await user.update({ isActive: false });
```

**Delete:**
```javascript
// MongoDB
await User.findByIdAndDelete(id);

// MySQL (Sequelize)
await User.destroy({ where: { id } });
```

### Working with Referrals

```javascript
// Get user with all referral data
const user = await User.findByPk(userId, {
  include: [
    { model: User, as: 'referrer' },
    { model: User, as: 'directReferrals' },
    { model: User, as: 'referralChain' }
  ]
});

// Add a referral
const { UserReferral } = require('./Models_MySQL');
await UserReferral.create({
  userId: referrerUserId,
  referralId: newUserMyId
});
```

### Working with Locked Coins Entries

```javascript
// Add a new locked coins entry
const entry = await LockedCoinsEntry.create({
  userId: user.id,
  amount: 1000,
  lockStartDate: new Date(),
  lockEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  roiRateAtLock: 5.0,
  status: 'active'
});

// Update user's lockedApexCoins total
await User.increment('lockedApexCoins', {
  by: 1000,
  where: { id: user.id }
});
```

---

## Verification Steps

After migration, verify data integrity:

### 1. Count Records

```javascript
// Compare counts
const mongoUserCount = await MongoUser.countDocuments();
const mysqlUserCount = await User.count();
console.log(`Users: MongoDB=${mongoUserCount}, MySQL=${mysqlUserCount}`);
```

### 2. Verify Relationships

```javascript
// Check a user's referrals exist
const user = await User.findByPk(1, {
  include: [{ model: User, as: 'directReferrals' }]
});
console.log(`User ${user.id} has ${user.directReferrals.length} referrals`);
```

### 3. Verify Financial Data

```javascript
// Sum all user balances
const { fn, col } = require('sequelize');
const totalBalance = await User.sum('accountBalance');
console.log(`Total account balance: ${totalBalance}`);
```

---

## Rollback Plan

If the migration fails or you need to revert:

### 1. Drop MySQL Tables

```sql
-- WARNING: This deletes all MySQL data
DROP DATABASE apex_backend;
CREATE DATABASE apex_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Restore MongoDB Backup

```bash
mongorestore --uri="your_mongodb_uri" ./backup_before_mysql_migration
```

### 3. Revert Code Changes

- Switch back to using `./Models/` instead of `./Models_MySQL/`

---

## File Structure After Migration

```
Models_MySQL/
├── index.js                    # Main entry, associations
├── user.model.js               # User table
├── lockedCoinsEntry.model.js   # Locked coins (was embedded)
├── transaction.model.js        # Transactions
├── roi.model.js                # ROI rates
├── gateway.model.js            # Payment gateways
├── apexCoinRate.model.js       # Apex coin rates
├── bonusTransaction.model.js   # Bonus transactions
├── profitShareTransaction.model.js  # Profit shares
└── userReferral.model.js       # Referral junction tables

Config/
├── DB.js                       # MongoDB config (keep for reference)
└── MySQL_DB.js                 # MySQL config (new)

scripts/
└── migrate_mongodb_to_mysql.js # Migration script
```

---

## Need Help?

Common issues:

1. **Connection refused**: Check MySQL is running and credentials are correct
2. **Duplicate key errors**: The migration may have been partially run. Drop and recreate tables.
3. **Foreign key errors**: Ensure migration runs in the correct order (users first)

For any issues, check the migration script's error output for specific record IDs that failed.
