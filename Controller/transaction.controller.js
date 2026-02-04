const Transaction = require('../Models/transaction.model');
const User = require('../Models/user.model');
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
    
    console.log('req.user:', req.user); // Debug log
    const userId = req.user?._id; // Get user ID from authenticated user
    
    if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
    }
    
    // 🔹 Check if screenshot file is uploaded
    if (!req.file) {
        return res.status(400).json({ message: "Screenshot is required" });
    }

    // 🔹 Required fields check
    if (!transactionId || !amount || !accountName || !status) {
        return res.status(400).json({ message: "All fields are required" });
    }
    // 🔹 Validate amount is a valid number
    if (isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ message: "Amount must be a valid positive number" });
    }

    // 🔹 Check if transaction already exists
    const existingTransaction = await Transaction.findOne({ transactionId });
    if (existingTransaction) {
        return res.status(400).json({
            message: "Transaction already exists with provided transaction ID",
        });
    }

    // 🔹 Upload screenshot to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    const screenshotUrl = uploadResult.secure_url;

    // 🔹 Create new transaction
    const transaction = new Transaction({
        
        transactionId,
        user: userId,
        screenshotUrl,
        amount,
        accountName,
        bankAccountNumber,
        bankName,
        status
    });
    await transaction.save();
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
        const transactions = await Transaction.find();
        res.status(200).json(transactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get transaction history for a specific user
const getUserTransactionHistory = async (req, res) => {
    try {
        const userId = req.params.userId || req.user._id; // Support both route param and authenticated user
        
        const transactions = await Transaction.find({ user: userId })
            .sort({ createdAt: -1 }) // Most recent first
            .select('transactionId amount accountName bankAccountNumber bankName status createdAt updatedAt screenshotUrl')
            .lean();
        
        // Format the response with all required fields
        const formattedTransactions = transactions.map(txn => ({
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

//update transaction status
const updateTransactionStatus = async (req, res) => {
    try {
        const transactionId = req.params.id;
        const { status } = req.body;
        
        // Validate status
        if (!status) {
            return res.status(400).json({ message: "Status is required" });
        }

        // Find the transaction first to get the current status and amount
        const transaction = await Transaction.findById(transactionId);
        
        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found" });
        }
        
        // If approving a pending transaction, add amount to user's accountBalance
        if (status === "approved" && transaction.status !== "approved" && transaction.user) {
            // Validate transaction.amount is a valid number
            const amountToAdd = parseFloat(transaction.amount);
            if (isNaN(amountToAdd) || amountToAdd <= 0) {
                return res.status(400).json({ message: "Transaction amount is invalid. Cannot update account balance." });
            }
            const user = await User.findById(transaction.user);
            if (user) {
                user.accountBalance = (user.accountBalance || 0) + amountToAdd;
                await user.save();
                console.log(`Added ${amountToAdd} to user ${user._id} accountBalance. New balance: ${user.accountBalance}`);
            } else {
                return res.status(404).json({ message: "User not found" });
            }
        }
        
        // Update transaction status
        transaction.status = status;
        await transaction.save();
        
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