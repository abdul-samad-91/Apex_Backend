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
        
        // If approving a pending transaction, add coins to user
        if (status === "approved" && transaction.status !== "approved" && transaction.user) {
            const user = await User.findById(transaction.user);
            if (user) {
                // Convert amount to number and add to apexCoins
                const amountToAdd = parseFloat(transaction.amount);
                user.apexCoins = (user.apexCoins || 0) + amountToAdd;
                await user.save();
                console.log(`Added ${amountToAdd} apexCoins to user ${user._id}. New balance: ${user.apexCoins}`);
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
    updateTransactionStatus
};