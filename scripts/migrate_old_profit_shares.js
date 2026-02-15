/**
 * Migration Script: Claim all old unclaimed profit shares for all users
 * 
 * This script:
 * 1. Finds all unclaimed profit share transactions (isClaimed: false)
 * 2. Groups them by user
 * 3. Claims them all (transfers to user's account balance)
 * 4. Marks them as claimed
 * 
 * Run once to migrate from old system to new downchain profit share system.
 * 
 * Usage: node scripts/migrate_old_profit_shares.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../Models/user.model');
const ProfitShareTransaction = require('../Models/profitShareTransaction.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/apex_db';

const migrateOldProfitShares = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');

    // Find all unclaimed profit share transactions
    const unclaimedShares = await ProfitShareTransaction.find({ isClaimed: false });
    
    if (unclaimedShares.length === 0) {
      console.log('No unclaimed profit shares found. Nothing to migrate.');
      return;
    }

    console.log(`Found ${unclaimedShares.length} unclaimed profit share transactions`);

    // Group by userId
    const groupedByUser = {};
    for (const share of unclaimedShares) {
      const odIdStr = share.userId.toString();
      if (!groupedByUser[odIdStr]) {
        groupedByUser[odIdStr] = {
          userId: share.userId,
          shares: [],
          totalAmount: 0
        };
      }
      groupedByUser[odIdStr].shares.push(share);
      groupedByUser[odIdStr].totalAmount += share.shareAmount;
    }

    const userIds = Object.keys(groupedByUser);
    console.log(`Processing ${userIds.length} users with unclaimed profit shares`);

    const now = new Date();
    let totalMigrated = 0;
    let totalAmountMigrated = 0;

    // Process each user
    for (const odIdStr of userIds) {
      const userData = groupedByUser[odIdStr];
      
      try {
        // Find the user
        const user = await User.findById(userData.userId);
        if (!user) {
          console.log(`User ${userData.userId} not found, skipping ${userData.shares.length} transactions`);
          continue;
        }

        // Add profit shares to account balance (100% to account balance for migration)
        const totalAmount = userData.totalAmount;
        user.accountBalance = (user.accountBalance || 0) + totalAmount;
        user.totalProfitShareEarned = (user.totalProfitShareEarned || 0) + totalAmount;
        await user.save();

        // Mark all profit shares as claimed
        const shareIds = userData.shares.map(s => s._id);
        await ProfitShareTransaction.updateMany(
          { _id: { $in: shareIds } },
          { 
            $set: { 
              isClaimed: true, 
              claimedAt: now 
            } 
          }
        );

        totalMigrated += userData.shares.length;
        totalAmountMigrated += totalAmount;

        console.log(`✅ User ${user.fullName} (${user.email}): Claimed ${userData.shares.length} shares, Amount: $${totalAmount.toFixed(2)}`);
      } catch (err) {
        console.error(`❌ Error processing user ${userData.userId}:`, err.message);
      }
    }

    console.log('\n========== MIGRATION COMPLETE ==========');
    console.log(`Total transactions migrated: ${totalMigrated}`);
    console.log(`Total amount migrated: $${totalAmountMigrated.toFixed(2)}`);
    console.log(`Users processed: ${userIds.length}`);
    console.log('=========================================\n');

    // Verify no unclaimed shares remain
    const remainingUnclaimed = await ProfitShareTransaction.countDocuments({ isClaimed: false });
    if (remainingUnclaimed === 0) {
      console.log('✅ All old profit shares have been claimed successfully!');
    } else {
      console.log(`⚠️ ${remainingUnclaimed} unclaimed profit shares still remain`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration
migrateOldProfitShares();
