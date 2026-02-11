const { Transaction, User } = require('../Models_MySQL');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

// Create new transaction
const createTransaction = async (req, res) => {
  try {
    const {
      transactionId,
      amount,
      accountName,
      bankAccountNumber,
      bankName,
      status
    } = req.body;
    
    console.log('req.user:', req.user);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: "Screenshot is required" });
    }

    if (!transactionId || !amount || !accountName || !status) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Amount must be a valid positive number" });
    }

    // Check if transaction already exists
    const existingTransaction = await Transaction.findOne({ 
      where: { transactionId } 
    });
    
    if (existingTransaction) {
      return res.status(400).json({
        message: "Transaction already exists with provided transaction ID",
      });
    }

    // Upload screenshot to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    const screenshotUrl = uploadResult.secure_url;

    // Create new transaction
    const transaction = await Transaction.create({
      transactionId,
      userId,
      screenshotUrl,
      amount,
      accountName,
      bankAccountNumber,
      bankName,
      status
    });

    res.status(201).json({ 
      message: "Transaction created successfully", 
      transaction 
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email'] }]
    });
    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get transaction history for a specific user
const getUserTransactionHistory = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    const transactions = await Transaction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'transactionId', 'amount', 'accountName', 'bankAccountNumber', 'bankName', 'status', 'createdAt', 'updatedAt', 'screenshotUrl']
    });
    
    const formattedTransactions = transactions.map(txn => ({
      id: txn.id,
      transactionId: txn.transactionId,
      date: new Date(txn.createdAt).toLocaleDateString(),
      time: new Date(txn.createdAt).toLocaleTimeString(),
      amount: txn.amount,
      accountName: txn.accountName,
      bankAccountNumber: txn.bankAccountNumber || 'N/A',
      bankName: txn.bankName || 'N/A',
      status: txn.status,
      screenshotUrl: txn.screenshotUrl,
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt
    }));
    
    res.status(200).json({
      message: 'Transaction history retrieved successfully',
      count: formattedTransactions.length,
      transactions: formattedTransactions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update transaction status
const updateTransactionStatus = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    // If approving a pending transaction, add amount to user's accountBalance
    if (status === "approved" && transaction.status !== "approved" && transaction.userId) {
      const amountToAdd = parseFloat(transaction.amount);
      if (isNaN(amountToAdd) || amountToAdd <= 0) {
        return res.status(400).json({ message: "Transaction amount is invalid. Cannot update account balance." });
      }
      
      const user = await User.findByPk(transaction.userId);
      if (user) {
        await user.update({
          accountBalance: parseFloat(user.accountBalance || 0) + amountToAdd
        });
        console.log(`Added ${amountToAdd} to user ${user.id} accountBalance. New balance: ${user.accountBalance}`);
      } else {
        return res.status(404).json({ message: "User not found" });
      }
    }
    
    // Update transaction status
    await transaction.update({ status });
    
    res.status(200).json({ 
      message: "Transaction status updated successfully", 
      transaction 
    });
  } catch (error) {
    console.error("Error updating transaction status:", error);
    res.status(500).json({ message: error.message });
  }   
};

module.exports = {
  createTransaction,
  getAllTransactions,
  getUserTransactionHistory,
  updateTransactionStatus
};
