const Withdrawal = require('../Models/withdrawal.model');
const User = require('../Models/user.model');

// Generate unique withdrawal ID
const generateWithdrawalId = () => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `WD-${timestamp}-${randomStr}`.toUpperCase();
};

// User: Request withdrawal from account balance
const requestWithdrawal = async (req, res) => {
    try {
        const { amount, walletAddress, network } = req.body;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validation
        if (!amount || !walletAddress || !network) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Validate amount
        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
            return res.status(400).json({ message: 'Invalid withdrawal amount' });
        }

        // Validate network
        if (!['BEP20', 'TRC20'].includes(network)) {
            return res.status(400).json({ message: 'Invalid network. Choose BEP20 or TRC20' });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has sufficient balance
        const availableBalance = user.accountBalance || 0;
        if (withdrawalAmount > availableBalance) {
            return res.status(400).json({ 
                message: 'Insufficient balance',
                availableBalance: parseFloat(availableBalance.toFixed(2)),
                requestedAmount: withdrawalAmount
            });
        }

        // Optional: Set minimum withdrawal amount
        const MIN_WITHDRAWAL = 5; // $5 minimum
        if (withdrawalAmount < MIN_WITHDRAWAL) {
            return res.status(400).json({ 
                message: `Minimum withdrawal amount is $${MIN_WITHDRAWAL}`,
                minAmount: MIN_WITHDRAWAL
            });
        }

        // Deduct amount from account balance
        user.accountBalance -= withdrawalAmount;
        await user.save();

        // Create withdrawal request
        const withdrawalId = generateWithdrawalId();
        const withdrawal = new Withdrawal({
            withdrawalId,
            user: userId,
            amount: withdrawalAmount,
            walletAddress,
            network,
            status: 'pending'
        });

        await withdrawal.save();

        res.status(201).json({
            message: 'Withdrawal request submitted successfully. Please allow 6-12 hours for processing.',
            data: {
                withdrawalId: withdrawal.withdrawalId,
                amount: withdrawalAmount,
                walletAddress: walletAddress,
                network: network,
                status: withdrawal.status,
                requestedAt: withdrawal.createdAt,
                newAccountBalance: parseFloat(user.accountBalance.toFixed(2))
            }
        });
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        res.status(500).json({ message: 'Error processing withdrawal request', error: error.message });
    }
};

// User: Get their withdrawal history
const getUserWithdrawals = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { page = 1, limit = 20, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build query
        const query = { user: userId };
        if (status && ['pending', 'processing', 'completed', 'rejected'].includes(status)) {
            query.status = status;
        }

        const withdrawals = await Withdrawal.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-__v');

        const totalCount = await Withdrawal.countDocuments(query);

        // Get summary statistics
        const summary = await Withdrawal.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const summaryData = {
            pending: { amount: 0, count: 0 },
            processing: { amount: 0, count: 0 },
            completed: { amount: 0, count: 0 },
            rejected: { amount: 0, count: 0 }
        };

        summary.forEach(item => {
            summaryData[item._id] = {
                amount: parseFloat(item.totalAmount.toFixed(2)),
                count: item.count
            };
        });

        res.status(200).json({
            message: 'Withdrawal history retrieved successfully',
            data: {
                withdrawals: withdrawals,
                summary: summaryData,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                    totalItems: totalCount,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching user withdrawals:', error);
        res.status(500).json({ message: 'Error fetching withdrawal history', error: error.message });
    }
};

// Admin: Get all withdrawals
const getAllWithdrawals = async (req, res) => {
    try {
        const { page = 1, limit = 50, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build query
        const query = {};
        if (status && ['pending', 'processing', 'completed', 'rejected'].includes(status)) {
            query.status = status;
        }

        const withdrawals = await Withdrawal.find(query)
            .populate('user', 'fullName email phoneNumber accountBalance')
            .populate('processedBy', 'fullName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalCount = await Withdrawal.countDocuments(query);

        // Get summary statistics
        const summary = await Withdrawal.aggregate([
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const summaryData = {
            pending: { amount: 0, count: 0 },
            processing: { amount: 0, count: 0 },
            completed: { amount: 0, count: 0 },
            rejected: { amount: 0, count: 0 }
        };

        summary.forEach(item => {
            summaryData[item._id] = {
                amount: parseFloat(item.totalAmount.toFixed(2)),
                count: item.count
            };
        });

        res.status(200).json({
            message: 'All withdrawals retrieved successfully',
            data: {
                withdrawals: withdrawals,
                summary: summaryData,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                    totalItems: totalCount,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching all withdrawals:', error);
        res.status(500).json({ message: 'Error fetching withdrawals', error: error.message });
    }
};

// Admin: Get pending withdrawals only
const getPendingWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ status: 'pending' })
            .populate('user', 'fullName email phoneNumber accountBalance')
            .sort({ createdAt: 1 }); // Oldest first

        const totalPendingAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);

        res.status(200).json({
            message: 'Pending withdrawals retrieved successfully',
            count: withdrawals.length,
            totalAmount: parseFloat(totalPendingAmount.toFixed(2)),
            data: withdrawals
        });
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({ message: 'Error fetching pending withdrawals', error: error.message });
    }
};

// Admin: Update withdrawal status (approve/reject)
const updateWithdrawalStatus = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { status, rejectionReason, transactionHash } = req.body;
        const adminId = req.user?._id;

        if (!adminId) {
            return res.status(401).json({ message: 'Admin not authenticated' });
        }

        // Validate status
        if (!status || !['processing', 'completed', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                message: 'Invalid status. Use: processing, completed, or rejected' 
            });
        }

        // Find withdrawal
        const withdrawal = await Withdrawal.findById(withdrawalId).populate('user', 'fullName email accountBalance');
        
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal request not found' });
        }

        // If rejecting, must provide reason and refund the user
        if (status === 'rejected') {
            if (!rejectionReason) {
                return res.status(400).json({ message: 'Rejection reason is required' });
            }

            // Refund the amount to user's account balance
            const user = await User.findById(withdrawal.user._id);
            if (user) {
                user.accountBalance = (user.accountBalance || 0) + withdrawal.amount;
                await user.save();
            }

            withdrawal.status = 'rejected';
            withdrawal.rejectionReason = rejectionReason;
            withdrawal.processedAt = new Date();
            withdrawal.processedBy = adminId;
            await withdrawal.save();

            return res.status(200).json({
                message: 'Withdrawal rejected and amount refunded to user',
                data: {
                    withdrawalId: withdrawal.withdrawalId,
                    amount: withdrawal.amount,
                    status: withdrawal.status,
                    rejectionReason: withdrawal.rejectionReason,
                    refundedToUser: withdrawal.user.fullName,
                    newUserBalance: parseFloat(user.accountBalance.toFixed(2))
                }
            });
        }

        // Update withdrawal status
        withdrawal.status = status;
        withdrawal.processedAt = new Date();
        withdrawal.processedBy = adminId;
        
        if (transactionHash) {
            withdrawal.transactionHash = transactionHash;
        }

        await withdrawal.save();

        res.status(200).json({
            message: `Withdrawal ${status} successfully`,
            data: {
                withdrawalId: withdrawal.withdrawalId,
                amount: withdrawal.amount,
                walletAddress: withdrawal.walletAddress,
                network: withdrawal.network,
                status: withdrawal.status,
                transactionHash: withdrawal.transactionHash,
                processedAt: withdrawal.processedAt,
                user: {
                    name: withdrawal.user.fullName,
                    email: withdrawal.user.email
                }
            }
        });
    } catch (error) {
        console.error('Error updating withdrawal status:', error);
        res.status(500).json({ message: 'Error updating withdrawal status', error: error.message });
    }
};

module.exports = {
    requestWithdrawal,
    getUserWithdrawals,
    getAllWithdrawals,
    getPendingWithdrawals,
    updateWithdrawalStatus
};
