const mongoose = require('mongoose');
require('dotenv').config();

// Import DB configuration
const connectDB = require('../Config/DB');

async function checkUserActiveStatus() {
  try {
    // Connect to database
    await connectDB();
    
    // Find all users and their isActive status
    const allUsers = await mongoose.connection.db.collection('users').find({}).toArray();
    
    // console.log(`\n📊 Database Status Check - Total Users: ${allUsers.length}\n`);
    
    const activeUsers = allUsers.filter(user => user.isActive === true);
    const inactiveUsers = allUsers.filter(user => user.isActive === false);
    
    // console.log(`✅ Active Users: ${activeUsers.length}`);
    // console.log(`❌ Inactive Users: ${inactiveUsers.length}\n`);
    
    if (inactiveUsers.length > 0) {
      // console.log(`Inactive Users List:`);
      inactiveUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.fullName} (${user.email}) - isActive: ${user.isActive}`);
      });
    }
    
    // console.log(`\nAll Users Status:`);
    allUsers.forEach((user, index) => {
      const status = user.isActive ? '✅' : '❌';
      console.log(`   ${status} ${user.fullName} (${user.email}) - isActive: ${user.isActive}`);
    });
    
    // Close connection
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUserActiveStatus();
