const { sequelize } = require('../Config/DB');
const Transaction = require('../Models/transaction.model');
const User = require('../Models/user.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const { createWalletLedgerEntry } = require('../utils/walletLedger.util');

// Create new transaction
const createTransaction = async (req, res) => {
    const dbTransaction = await sequelize.transaction();
    
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
        const userId = req.user?.id; // Get user ID from authenticated user

        if (!userId) {
            await dbTransaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Check if screenshot file is uploaded
        if (!req.file) {
            await dbTransaction.rollback();
            return res.status(400).json({ message: 'Screenshot is required' });
        }

        // Required fields check
        if (!transactionId || !amount || !accountName || !status) {
            await dbTransaction.rollback();
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        // Validate amount is a valid number
        if (isNaN(amount) || Number(amount) <= 0) {
            await dbTransaction.rollback();
            return res.status(400).json({ message: 'Amount must be a valid positive number' });
        }

        // Check if transaction already exists
        const existingTransaction = await Transaction.findOne({
            where: { transaction_id: transactionId },
            transaction: dbTransaction
        });
        if (existingTransaction) {
            await dbTransaction.rollback();
            return res.status(400).json({
                message: 'Transaction already exists with provided transaction ID'
            });
        }

        // Upload screenshot to Cloudinary
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        const screenshotUrl = uploadResult.secure_url;

        // Create new transaction
        const transaction = await Transaction.create({
            transaction_id: transactionId,
            user_id: userId,
            screenshot_url: screenshotUrl,
            amount: parseFloat(amount),
            account_name: accountName,
            bank_account_number: bankAccountNumber || null,
            bank_name: bankName || null,
            status: status
        }, { transaction: dbTransaction });

        await dbTransaction.commit();

        res.status(201).json({
            message: 'Transaction created successfully',
            transaction: {
                id: transaction.id,
                transactionId: transaction.transaction_id,
                userId: transaction.user_id,
                screenshotUrl: transaction.screenshot_url,
                amount: parseFloat(transaction.amount),
                accountName: transaction.account_name,
                bankAccountNumber: transaction.bank_account_number,
                bankName: transaction.bank_name,
                status: transaction.status,
                createdAt: transaction.createdAt,
                updatedAt: transaction.updatedAt
            }
        });
    } catch (error) {
        await dbTransaction.rollback();
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};

const getAllTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findAll({
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'full_name', 'email']
            }],
            order: [['created_at', 'DESC']]
        });

        // Format response for backward compatibility
        const formattedTransactions = transactions.map(txn => ({
            id: txn.id,
            transactionId: txn.transaction_id,
            user: txn.user ? {
                id: txn.user.id,
                fullName: txn.user.full_name,
                email: txn.user.email
            } : null,
            screenshotUrl: txn.screenshot_url,
            amount: parseFloat(txn.amount),
            accountName: txn.account_name,
            bankAccountNumber: txn.bank_account_number,
            bankName: txn.bank_name,
            status: txn.status,
            createdAt: txn.createdAt,
            updatedAt: txn.updatedAt
        }));

        res.status(200).json(formattedTransactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get transaction history for a specific user
const getUserTransactionHistory = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.id;

        const transactions = await Transaction.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']]
        });

        // Format the response with all required fields
        const formattedTransactions = transactions.map(txn => {
            let dateObj = null;
            if (txn.createdAt) {
                // If it's a string and not ISO, convert 'YYYY-MM-DD HH:mm:ss' to ISO
                if (typeof txn.createdAt === 'string') {
                    // If it already contains 'T', it's ISO
                    if (txn.createdAt.includes('T')) {
                        dateObj = new Date(txn.createdAt);
                    } else {
                        dateObj = new Date(txn.createdAt.replace(' ', 'T'));
                    }
                } else {
                    dateObj = new Date(txn.createdAt);
                }
            }
            const isValidDate = dateObj && !isNaN(dateObj.getTime());
            return {
                transactionId: txn.transaction_id,
                date: isValidDate ? dateObj.toLocaleDateString() : String(txn.createdAt),
                time: isValidDate ? dateObj.toLocaleTimeString() : String(txn.createdAt),
                amount: parseFloat(txn.amount),
                accountName: txn.account_name,
                bankAccountNumber: txn.bank_account_number || 'N/A',
                bankName: txn.bank_name || 'N/A',
                status: txn.status,
                screenshotUrl: txn.screenshot_url,
                createdAt: txn.createdAt,
                updatedAt: txn.updatedAt
            };
        });

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
    const dbTransaction = await sequelize.transaction();
    
    try {
        const transactionId = req.params.id;
        const { status } = req.body;

        // Validate status
        if (!status) {
            await dbTransaction.rollback();
            return res.status(400).json({ message: 'Status is required' });
        }

        // Find the transaction first with lock for update
        const transaction = await Transaction.findByPk(transactionId, {
            transaction: dbTransaction,
            lock: true
        });

        if (!transaction) {
            await dbTransaction.rollback();
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // If approving a pending transaction, add amount to user's accountBalance
        if (status === 'approved' && transaction.status !== 'approved' && transaction.user_id) {
            // Validate transaction.amount is a valid number
            const amountToAdd = parseFloat(transaction.amount);
            if (isNaN(amountToAdd) || amountToAdd <= 0) {
                await dbTransaction.rollback();
                return res.status(400).json({ message: 'Transaction amount is invalid. Cannot update account balance.' });
            }
            
            const user = await User.findByPk(transaction.user_id, {
                transaction: dbTransaction,
                lock: true
            });
            
            if (user) {
                const previousBalance = parseFloat(user.account_balance) || 0;
                const newBalance = previousBalance + amountToAdd;
                await user.update({ account_balance: newBalance }, { transaction: dbTransaction });

                await createWalletLedgerEntry({
                    userId: user.id,
                    walletType: 'account_balance',
                    entryType: 'credit',
                    amount: amountToAdd,
                    balanceBefore: previousBalance,
                    balanceAfter: newBalance,
                    sourceType: 'deposit_approved',
                    sourceId: transaction.transaction_id,
                    description: 'Deposit approved and credited to main wallet',
                    metadata: {
                        transactionDbId: transaction.id,
                        statusFrom: transaction.status,
                        statusTo: status
                    },
                    transaction: dbTransaction
                });

                console.log(`Added ${amountToAdd} to user ${user.id} accountBalance. New balance: ${newBalance}`);
            } else {
                await dbTransaction.rollback();
                return res.status(404).json({ message: 'User not found' });
            }
        }

        // Update transaction status
        await transaction.update({ status }, { transaction: dbTransaction });

        await dbTransaction.commit();

        res.status(200).json({
            message: 'Transaction status updated successfully',
            transaction: {
                id: transaction.id,
                transactionId: transaction.transaction_id,
                status: transaction.status,
                amount: parseFloat(transaction.amount)
            }
        });
    } catch (error) {
        await dbTransaction.rollback();
        console.error('Error updating transaction status:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createTransaction,
    getAllTransactions,
    getUserTransactionHistory,
    updateTransactionStatus
};