// Script to remove old fields from all Gateway documents
// Usage: node scripts/clean_gateway_fields.js

require('dotenv').config();
const mongoose = require('mongoose');
const Gateway = require('../Models/gateway.model');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/apex_db';

async function cleanGatewayFields() {
  await mongoose.connect(MONGO_URI);

  const unsetFields = {
    bankImageUrl: 1,
    bankName: 1,
    bankAccountNumber: 1,
    bankRoutingNumber: 1,
    bankBranchName: 1,
    gatewayCurrency: 1,
    conversionRate: 1,
    charge: 1,
    allowAsPaymentMethod: 1
  };

  // Get all gateways first
  const allGateways = await Gateway.find({});
  console.log(`Found ${allGateways.length} gateway documents.`);

  // Use direct MongoDB collection update to force removal
  const result = await Gateway.collection.updateMany({}, { $unset: unsetFields });
  console.log(`Matched ${result.matchedCount} documents.`);
  console.log(`Modified ${result.modifiedCount} documents.`);

  // Verify the cleanup
  const remainingWithOldFields = await Gateway.find({
    $or: [
      { bankImageUrl: { $exists: true } },
      { bankName: { $exists: true } },
      { conversionRate: { $exists: true } },
      { charge: { $exists: true } },
      { allowAsPaymentMethod: { $exists: true } }
    ]
  });
  
  if (remainingWithOldFields.length > 0) {
    console.log(`Warning: ${remainingWithOldFields.length} documents still have old fields!`);
  } else {
    console.log('All old fields successfully removed!');
  }

  await mongoose.disconnect();
}

cleanGatewayFields().catch(err => {
  console.error('Error cleaning gateway fields:', err);
  process.exit(1);
});
