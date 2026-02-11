/**
 * MongoDB to MySQL Migration Script
 * 
 * This script migrates all data from MongoDB to MySQL.
 * 
 * IMPORTANT: 
 * 1. Make sure both MongoDB and MySQL are accessible
 * 2. Run this script AFTER creating the MySQL database and tables
 * 3. Back up your MongoDB data before running this script
 * 
 * Usage: node scripts/migrate_mongodb_to_mysql.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Models
const MongoUser = require('../Models/user.model');
const MongoTransaction = require('../Models/transaction.model');
const MongoRoi = require('../Models/roi.model');
const MongoGateway = require('../Models/gateway.model');
const MongoApexCoinRate = require('../Models/apexCoinRate.model');
const MongoBonusTransaction = require('../Models/bonusTransaction.model');
const MongoProfitShareTransaction = require('../Models/profitShareTransaction.model');

// MySQL Models and connection
const {
  sequelize,
  User,
  LockedCoinsEntry,
  Transaction,
  Roi,
  Gateway,
  ApexCoinRate,
  BonusTransaction,
  ProfitShareTransaction,
  UserReferral,
  UserReferralChain
} = require('../Models_MySQL');

// Map to store MongoDB ObjectId -> MySQL ID mappings
const userIdMap = new Map(); // mongoId -> mysqlId
const lockedEntryIdMap = new Map(); // mongoId -> mysqlId

// Configuration
const BATCH_SIZE = 100;
const LOG_PROGRESS = true;

function log(message) {
  if (LOG_PROGRESS) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

async function connectMongoDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

async function connectMySQL() {
  try {
    await sequelize.authenticate();
    log('Connected to MySQL');
    
    // Sync all tables (this will create tables if they don't exist)
    await sequelize.sync({ force: false, alter: true });
    log('MySQL tables synchronized');
  } catch (error) {
    console.error('MySQL connection error:', error);
    throw error;
  }
}

async function migrateUsers() {
  log('Starting User migration...');
  
  // Fetch all users from MongoDB with password field
  const mongoUsers = await MongoUser.find({}).select('+password +otp +otpExpiry').lean();
  log(`Found ${mongoUsers.length} users to migrate`);
  
  let migrated = 0;
  let errors = 0;

  // First pass: Create all users without referredById (to avoid FK issues)
  for (const mongoUser of mongoUsers) {
    try {
      const mysqlUser = await User.create({
        mongoId: mongoUser._id.toString(),
        fullName: mongoUser.fullName,
        profilePictureUrl: mongoUser.profilePictureUrl,
        email: mongoUser.email,
        phoneNumber: mongoUser.phoneNumber,
        password: mongoUser.password, // Already hashed
        role: mongoUser.role || 'user',
        isActive: mongoUser.isActive !== false,
        apexCoins: mongoUser.apexCoins || 0,
        accountBalance: mongoUser.accountBalance || 0,
        lockedApexCoins: mongoUser.lockedApexCoins || 0,
        lockStartDate: mongoUser.lockStartDate,
        lockEndDate: mongoUser.lockEndDate,
        lastLockDate: mongoUser.lastLockDate,
        totalRoiEarned: mongoUser.totalRoiEarned || 0,
        totalBonusEarned: mongoUser.totalBonusEarned || 0,
        totalProfitShareEarned: mongoUser.totalProfitShareEarned || 0,
        isVerified: mongoUser.isVerified || false,
        otp: mongoUser.otp,
        otpExpiry: mongoUser.otpExpiry,
        referralCode: mongoUser.referralCode,
        referredById: null, // Will update in second pass
        createdAt: mongoUser.createdAt,
        updatedAt: mongoUser.updatedAt
      }, {
        hooks: false // Skip password hashing hook since password is already hashed
      });

      userIdMap.set(mongoUser._id.toString(), mysqlUser.id);
      migrated++;

      // Migrate locked coins entries for this user
      if (mongoUser.lockedCoinsEntries && mongoUser.lockedCoinsEntries.length > 0) {
        for (const entry of mongoUser.lockedCoinsEntries) {
          const lockedEntry = await LockedCoinsEntry.create({
            mongoEntryId: entry._id ? entry._id.toString() : null,
            userId: mysqlUser.id,
            amount: entry.amount,
            lockStartDate: entry.lockStartDate,
            lockEndDate: entry.lockEndDate,
            status: entry.status || 'active',
            roiRateAtLock: entry.roiRateAtLock || 0,
            unlockRequestedAt: entry.unlockRequest?.requestedAt,
            unlockProcessAfter: entry.unlockRequest?.processAfter,
            penaltyPercentage: entry.unlockRequest?.penaltyPercentage || 0,
            penaltyAmount: entry.unlockRequest?.penaltyAmount || 0,
            amountAfterPenalty: entry.unlockRequest?.amountAfterPenalty || 0,
            daysElapsedAtRequest: entry.unlockRequest?.daysElapsedAtRequest || 0,
            unlockApprovedAt: entry.unlockRequest?.approvedAt,
            unlockApprovedById: entry.unlockRequest?.approvedBy 
              ? userIdMap.get(entry.unlockRequest.approvedBy.toString()) 
              : null,
            unclaimedProfit: entry.unclaimedProfit || 0,
            lastClaimDate: entry.lastClaimDate,
            totalClaimedProfit: entry.totalClaimedProfit || 0,
            entryCreatedAt: entry.createdAt || new Date(),
            createdAt: entry.createdAt,
            updatedAt: mongoUser.updatedAt
          });

          if (entry._id) {
            lockedEntryIdMap.set(entry._id.toString(), lockedEntry.id);
          }
        }
      }

      if (migrated % 50 === 0) {
        log(`Users migrated: ${migrated}/${mongoUsers.length}`);
      }
    } catch (error) {
      console.error(`Error migrating user ${mongoUser.email}:`, error.message);
      errors++;
    }
  }

  // Second pass: Update referredById relationships
  log('Updating user referral relationships...');
  for (const mongoUser of mongoUsers) {
    if (mongoUser.referredBy) {
      const mysqlUserId = userIdMap.get(mongoUser._id.toString());
      const mysqlReferrerId = userIdMap.get(mongoUser.referredBy.toString());
      
      if (mysqlUserId && mysqlReferrerId) {
        await User.update(
          { referredById: mysqlReferrerId },
          { where: { id: mysqlUserId } }
        );
      }
    }
  }

  // Third pass: Migrate referrals array (direct referrals)
  log('Migrating user direct referrals...');
  for (const mongoUser of mongoUsers) {
    if (mongoUser.referrals && mongoUser.referrals.length > 0) {
      const mysqlUserId = userIdMap.get(mongoUser._id.toString());
      
      for (const referralId of mongoUser.referrals) {
        const mysqlReferralId = userIdMap.get(referralId.toString());
        
        if (mysqlUserId && mysqlReferralId) {
          try {
            await UserReferral.findOrCreate({
              where: {
                userId: mysqlUserId,
                referralId: mysqlReferralId
              }
            });
          } catch (e) {
            // Ignore duplicate errors
          }
        }
      }
    }
  }

  // Fourth pass: Migrate referral chain
  log('Migrating user referral chains...');
  for (const mongoUser of mongoUsers) {
    if (mongoUser.referralChain && mongoUser.referralChain.length > 0) {
      const mysqlUserId = userIdMap.get(mongoUser._id.toString());
      
      for (let i = 0; i < mongoUser.referralChain.length; i++) {
        const ancestorId = mongoUser.referralChain[i];
        const mysqlAncestorId = userIdMap.get(ancestorId.toString());
        
        if (mysqlUserId && mysqlAncestorId) {
          try {
            await UserReferralChain.findOrCreate({
              where: {
                userId: mysqlUserId,
                ancestorId: mysqlAncestorId
              },
              defaults: {
                level: i + 1
              }
            });
          } catch (e) {
            // Ignore duplicate errors
          }
        }
      }
    }
  }

  log(`User migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function migrateTransactions() {
  log('Starting Transaction migration...');
  
  const mongoTransactions = await MongoTransaction.find({}).lean();
  log(`Found ${mongoTransactions.length} transactions to migrate`);
  
  let migrated = 0;
  let errors = 0;

  for (const mongoTx of mongoTransactions) {
    try {
      const mysqlUserId = userIdMap.get(mongoTx.user.toString());
      
      if (!mysqlUserId) {
        console.error(`User not found for transaction ${mongoTx.transactionId}`);
        errors++;
        continue;
      }

      await Transaction.create({
        mongoId: mongoTx._id.toString(),
        transactionId: mongoTx.transactionId,
        userId: mysqlUserId,
        screenshotUrl: mongoTx.screenshotUrl,
        amount: mongoTx.amount,
        accountName: mongoTx.accountName,
        bankAccountNumber: mongoTx.bankAccountNumber,
        bankName: mongoTx.bankName,
        status: mongoTx.status || 'pending',
        createdAt: mongoTx.createdAt,
        updatedAt: mongoTx.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating transaction ${mongoTx.transactionId}:`, error.message);
      errors++;
    }
  }

  log(`Transaction migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function migrateRois() {
  log('Starting ROI migration...');
  
  const mongoRois = await MongoRoi.find({}).lean();
  log(`Found ${mongoRois.length} ROIs to migrate`);
  
  let migrated = 0;
  let errors = 0;

  for (const mongoRoi of mongoRois) {
    try {
      const mysqlCreatorId = mongoRoi.createdBy 
        ? userIdMap.get(mongoRoi.createdBy.toString()) 
        : null;

      await Roi.create({
        mongoId: mongoRoi._id.toString(),
        rate: mongoRoi.rate,
        isActive: mongoRoi.isActive !== false,
        createdById: mysqlCreatorId,
        createdAt: mongoRoi.createdAt,
        updatedAt: mongoRoi.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating ROI ${mongoRoi._id}:`, error.message);
      errors++;
    }
  }

  log(`ROI migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function migrateGateways() {
  log('Starting Gateway migration...');
  
  const mongoGateways = await MongoGateway.find({}).lean();
  log(`Found ${mongoGateways.length} gateways to migrate`);
  
  let migrated = 0;
  let errors = 0;

  for (const mongoGateway of mongoGateways) {
    try {
      const mysqlCreatorId = mongoGateway.createdBy 
        ? userIdMap.get(mongoGateway.createdBy.toString()) 
        : null;

      await Gateway.create({
        mongoId: mongoGateway._id.toString(),
        image: mongoGateway.image,
        walletName: mongoGateway.walletName,
        walletAddress: mongoGateway.walletAddress,
        createdById: mysqlCreatorId,
        createdAt: mongoGateway.createdAt,
        updatedAt: mongoGateway.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating gateway ${mongoGateway._id}:`, error.message);
      errors++;
    }
  }

  log(`Gateway migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function migrateApexCoinRates() {
  log('Starting ApexCoinRate migration...');
  
  const mongoRates = await MongoApexCoinRate.find({}).lean();
  log(`Found ${mongoRates.length} apex coin rates to migrate`);
  
  let migrated = 0;
  let errors = 0;

  for (const mongoRate of mongoRates) {
    try {
      const mysqlCreatorId = mongoRate.createdBy 
        ? userIdMap.get(mongoRate.createdBy.toString()) 
        : null;

      await ApexCoinRate.create({
        mongoId: mongoRate._id.toString(),
        rate: mongoRate.rate,
        isActive: mongoRate.isActive !== false,
        createdById: mysqlCreatorId,
        createdAt: mongoRate.createdAt,
        updatedAt: mongoRate.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating apex coin rate ${mongoRate._id}:`, error.message);
      errors++;
    }
  }

  log(`ApexCoinRate migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function migrateBonusTransactions() {
  log('Starting BonusTransaction migration...');
  
  const mongoBonus = await MongoBonusTransaction.find({}).lean();
  log(`Found ${mongoBonus.length} bonus transactions to migrate`);
  
  let migrated = 0;
  let errors = 0;
  let skipped = 0;

  for (const bonus of mongoBonus) {
    try {
      const mysqlUserId = userIdMap.get(bonus.userId.toString());
      const mysqlFromUserId = userIdMap.get(bonus.fromUserId.toString());
      const mysqlStakeEntryId = lockedEntryIdMap.get(bonus.stakeEntryId.toString());

      if (!mysqlUserId || !mysqlFromUserId) {
        console.error(`User not found for bonus transaction ${bonus._id}`);
        errors++;
        continue;
      }

      // If stake entry not found, we'll store the mongo ID but skip FK reference
      if (!mysqlStakeEntryId) {
        log(`Warning: Stake entry not found for bonus ${bonus._id}, storing mongo reference only`);
        skipped++;
        continue;
      }

      await BonusTransaction.create({
        mongoId: bonus._id.toString(),
        userId: mysqlUserId,
        fromUserId: mysqlFromUserId,
        stakeEntryId: mysqlStakeEntryId,
        mongoStakeEntryId: bonus.stakeEntryId.toString(),
        investmentAmount: bonus.investmentAmount,
        bonusPercentage: bonus.bonusPercentage,
        bonusAmount: bonus.bonusAmount,
        level: bonus.level,
        activeDirectReferralsAtTime: bonus.activeDirectReferralsAtTime || 0,
        createdAt: bonus.createdAt,
        updatedAt: bonus.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating bonus transaction ${bonus._id}:`, error.message);
      errors++;
    }
  }

  log(`BonusTransaction migration complete. Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
  return { migrated, errors, skipped };
}

async function migrateProfitShareTransactions() {
  log('Starting ProfitShareTransaction migration...');
  
  const mongoProfitShares = await MongoProfitShareTransaction.find({}).lean();
  log(`Found ${mongoProfitShares.length} profit share transactions to migrate`);
  
  let migrated = 0;
  let errors = 0;

  for (const profitShare of mongoProfitShares) {
    try {
      const mysqlUserId = userIdMap.get(profitShare.userId.toString());
      const mysqlFromUserId = userIdMap.get(profitShare.fromUserId.toString());

      if (!mysqlUserId || !mysqlFromUserId) {
        console.error(`User not found for profit share transaction ${profitShare._id}`);
        errors++;
        continue;
      }

      await ProfitShareTransaction.create({
        mongoId: profitShare._id.toString(),
        userId: mysqlUserId,
        fromUserId: mysqlFromUserId,
        roiAmount: profitShare.roiAmount,
        sharePercentage: profitShare.sharePercentage,
        shareAmount: profitShare.shareAmount,
        level: profitShare.level,
        activeDirectReferralsAtTime: profitShare.activeDirectReferralsAtTime || 0,
        claimDate: profitShare.claimDate,
        createdAt: profitShare.createdAt,
        updatedAt: profitShare.updatedAt
      });

      migrated++;
    } catch (error) {
      console.error(`Error migrating profit share transaction ${profitShare._id}:`, error.message);
      errors++;
    }
  }

  log(`ProfitShareTransaction migration complete. Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

async function runMigration() {
  console.log('='.repeat(60));
  console.log('MongoDB to MySQL Migration');
  console.log('='.repeat(60));

  const startTime = Date.now();
  const results = {};

  try {
    // Connect to both databases
    await connectMongoDB();
    await connectMySQL();

    // Run migrations in order (users first since other tables depend on user IDs)
    results.users = await migrateUsers();
    results.transactions = await migrateTransactions();
    results.rois = await migrateRois();
    results.gateways = await migrateGateways();
    results.apexCoinRates = await migrateApexCoinRates();
    results.bonusTransactions = await migrateBonusTransactions();
    results.profitShareTransactions = await migrateProfitShareTransactions();

    // Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration} seconds`);
    console.log('\nRecords migrated:');
    for (const [table, result] of Object.entries(results)) {
      console.log(`  ${table}: ${result.migrated} (${result.errors} errors${result.skipped ? `, ${result.skipped} skipped` : ''})`);
    }
    console.log('='.repeat(60));

    log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    await mongoose.disconnect();
    await sequelize.close();
    log('Database connections closed');
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
