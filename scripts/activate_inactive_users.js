const mongoose = require('mongoose');
require('dotenv').config();

// Import DB configuration
const connectDB = require('../Config/DB');

async function activateInactiveUsers() {
  try {
    // Connect to database
    await connectDB();
    
    // Find all inactive users
    const inactiveUsers = await mongoose.connection.db.collection('users').find(
      { isActive: false }
    ).toArray();
    
    console.log(`\n📋 Found ${inactiveUsers.length} inactive user(s):`);
    inactiveUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.fullName} (${user.email})`);
    });
    
    // Update all inactive users to isActive: true
    const result = await mongoose.connection.db.collection('users').updateMany(
      { isActive: false },
      { $set: { isActive: true } }
    );
    
    console.log(`\n✅ Successfully activated ${result.modifiedCount} user(s)`);
    console.log(`   Total users matched: ${result.matchedCount}`);
    
    // Close connection
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

activateInactiveUsers();
