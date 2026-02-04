// Script to rename walletId field to walletName in all Gateway documents
// Usage: node scripts/rename_walletId_to_walletName.js

require('dotenv').config();
const mongoose = require('mongoose');
const Gateway = require('../Models/gateway.model');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/apex_db';

async function renameWalletIdField() {
  await mongoose.connect(MONGO_URI);

  console.log('Connected to database...');

  // Get all gateways first to check current state
  const allGateways = await Gateway.find({});
  console.log(`Found ${allGateways.length} gateway documents.`);

  // Check how many have walletId field
  const gatewaysWithWalletId = await Gateway.find({ walletId: { $exists: true } });
  console.log(`${gatewaysWithWalletId.length} documents have walletId field.`);

  // Rename walletId to walletName in all documents
  const result = await Gateway.collection.updateMany(
    { walletId: { $exists: true } },
    { $rename: { walletId: 'walletName' } }
  );

  console.log(`Matched ${result.matchedCount} documents.`);
  console.log(`Modified ${result.modifiedCount} documents.`);

  // Verify the rename
  const remainingWithOldField = await Gateway.find({ walletId: { $exists: true } });
  
  if (remainingWithOldField.length > 0) {
    console.log(`Warning: ${remainingWithOldField.length} documents still have walletId field!`);
  } else {
    console.log('✓ All walletId fields successfully renamed to walletName!');
  }

  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

renameWalletIdField().catch(err => {
  console.error('Error renaming walletId field:', err);
  process.exit(1);
});
