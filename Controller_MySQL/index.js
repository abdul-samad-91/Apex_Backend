// MySQL Controllers - Export all controllers
const authController = require('./auth.controller');
const userController = require('./user.controller');
const transactionController = require('./transaction.controller');
const roiController = require('./roi.controller');
const gatewayController = require('./gateway.controller');
const apexCoinRateController = require('./apexCoinRate.controller');
const referralBonusController = require('./referralBonus.controller');

module.exports = {
  // Auth
  login: authController.login,
  
  // User
  createUser: userController.createUser,
  getAllUsers: userController.getAllUsers,
  getUserById: userController.getUserById,
  updateUser: userController.updateUser,
  deleteUser: userController.deleteUser,
  updatePassword: userController.updatePassword,
  verifyOTP: userController.verifyOTP,
  resendOTP: userController.resendOTP,
  purchaseApexCoins: userController.purchaseApexCoins,
  lockApexCoins: userController.lockApexCoins,
  requestUnlockApexCoins: userController.requestUnlockApexCoins,
  approveUnlockRequest: userController.approveUnlockRequest,
  getPendingUnlockRequests: userController.getPendingUnlockRequests,
  claimDailyProfits: userController.claimDailyProfits,
  
  // Transaction
  createTransaction: transactionController.createTransaction,
  getAllTransactions: transactionController.getAllTransactions,
  getUserTransactionHistory: transactionController.getUserTransactionHistory,
  updateTransactionStatus: transactionController.updateTransactionStatus,
  
  // ROI
  setRoi: roiController.setRoi,
  getRoi: roiController.getRoi,
  claimRoi: roiController.claimRoi,
  
  // Gateway
  createGateway: gatewayController.createGateway,
  getGateways: gatewayController.getGateways,
  deleteGateway: gatewayController.deleteGateway,
  
  // ApexCoinRate
  setApexCoinRate: apexCoinRateController.setApexCoinRate,
  getApexCoinRate: apexCoinRateController.getApexCoinRate,
  getAllApexCoinRates: apexCoinRateController.getAllApexCoinRates,
  
  // Referral Bonus
  getBonusHistory: referralBonusController.getBonusHistory,
  getProfitShareHistory: referralBonusController.getProfitShareHistory,
  getReferralStats: referralBonusController.getReferralStats,
  
  // Export individual controllers for more specific imports
  authController,
  userController,
  transactionController,
  roiController,
  gatewayController,
  apexCoinRateController,
  referralBonusController
};
