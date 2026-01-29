const Transaction = require('../Models/transaction.model');
const cloudinary = require('../Config/cloudinary');

// Helper function to upload image to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'transactions',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Create new transaction
const createTransaction = async (req, res) => {
  try {
    const {
        transactionId,
        amount,
        accountName,
        status
    } = req.body;
    
    const userId = req.user._id; // Get user ID from authenticated user
    
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

module.exports = {
    createTransaction,
    getAllTransactions
};