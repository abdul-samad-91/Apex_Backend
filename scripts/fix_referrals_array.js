/**
 * Script to fix referrals array for existing users
 * This script will populate the referrals array for all users based on their referred_by relationships
 */

const { sequelize } = require('../Config/DB');
const User = require('../Models/user.model');

async function fixReferralsArray() {
    try {
        // console.log('Starting referrals array fix...');
        
        // Get all users who have referred someone (referred_by is not null)
        const referredUsers = await User.findAll({
            where: {
                referred_by: { [require('sequelize').Op.not]: null }
            },
            attributes: ['id', 'referred_by', 'full_name']
        });

        // console.log(`Found ${referredUsers.length} users who were referred by someone`);

        // Build a map of referrer_id -> [referred_user_ids]
        const referralsMap = new Map();

        for (const user of referredUsers) {
            const referrerId = user.referred_by;
            if (!referralsMap.has(referrerId)) {
                referralsMap.set(referrerId, []);
            }
            referralsMap.get(referrerId).push(user.id);
        }

        // console.log(`Found ${referralsMap.size} users who have referrals`);

        // Update each referrer's referrals array
        let updatedCount = 0;
        for (const [referrerId, referralIds] of referralsMap.entries()) {
            const referrer = await User.findByPk(referrerId);
            if (referrer) {
                // Get existing referrals
                const existingReferrals = referrer.getReferralsArray();
                
                // Merge with new referrals (avoid duplicates)
                const mergedReferrals = [...new Set([...existingReferrals, ...referralIds])];
                
                // Update the referrals array
                referrer.referrals = mergedReferrals;
                referrer.changed('referrals', true);
                await referrer.save();
                // console.log(`Updated user ${referrerId} (${referrer.full_name}): added ${mergedReferrals.length} referrals`);    
                // console.log(`Updated user ${referrerId} (${referrer.full_name}): added ${mergedReferrals.length} referrals`);
                updatedCount++;
            }
        }

        // console.log(`\n✅ Successfully updated ${updatedCount} users' referrals arrays`);
        // console.log('Referrals array fix completed!');
        
    } catch (error) {
        // console.error('Error fixing referrals array:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
}

// Run the script
fixReferralsArray()
    .then(() => {
        // console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        // console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
