const { sequelize } = require('../Config/DB');
const Withdrawal = require('../Models/withdrawal.model');
const User = require('../Models/user.model');
const { Op } = require('sequelize');

// Generate unique withdrawal ID
const generateWithdrawalId = () => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `WD-${timestamp}-${randomStr}`.toUpperCase();
};

// User: Request withdrawal from account balance
const requestWithdrawal = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { amount, walletAddress, network } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validation
        if (!amount || !walletAddress || !network) {
            await transaction.rollback();
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Validate amount
        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Invalid withdrawal amount' });
        }

        // Validate network
        if (!['BEP20', 'TRC20'].includes(network)) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Invalid network. Choose BEP20 or TRC20' });
        }

        // Get user
        const user = await User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has sufficient balance
        const availableBalance = parseFloat(user.account_balance) || 0;
        if (withdrawalAmount > availableBalance) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: 'Insufficient balance',
                availableBalance: parseFloat(availableBalance.toFixed(2)),
                requestedAmount: withdrawalAmount
            });
        }

        // Set minimum withdrawal amount
        const MIN_WITHDRAWAL = 10; // $10 minimum
        if (withdrawalAmount < MIN_WITHDRAWAL) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: `Minimum withdrawal amount is $${MIN_WITHDRAWAL}`,
                minAmount: MIN_WITHDRAWAL
            });
        }

        // Calculate 5% system fee
        const systemFeePercentage = 5;
        const systemFeeAmount = parseFloat((withdrawalAmount * systemFeePercentage / 100).toFixed(2));
        const amountAfterFee = parseFloat((withdrawalAmount - systemFeeAmount).toFixed(2));

        // Deduct amount from account balance
        user.account_balance = parseFloat(user.account_balance) - withdrawalAmount;
        
        // Track system fees collected from withdrawals
        user.withdrawal_system_fees = (parseFloat(user.withdrawal_system_fees) || 0) + systemFeeAmount;
        
        await user.save({ transaction });

        // Create withdrawal request
        const withdrawalId = generateWithdrawalId();
        const withdrawal = await Withdrawal.create({
            withdrawal_id: withdrawalId,
            user_id: userId,
            amount: withdrawalAmount,
            system_fee_percentage: systemFeePercentage,
            system_fee_amount: systemFeeAmount,
            amount_after_fee: amountAfterFee,
            wallet_address: walletAddress,
            network,
            status: 'pending'
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            message: 'Withdrawal request submitted successfully. Please allow 6-12 hours for processing.',
            data: {
                withdrawalId: withdrawal.withdrawal_id,
                amount: withdrawalAmount,
                systemFee: systemFeeAmount,
                amountToReceive: amountAfterFee,
                walletAddress: walletAddress,
                network: network,
                status: withdrawal.status,
                requestedAt: withdrawal.created_at,
                newAccountBalance: parseFloat(user.account_balance.toFixed(2))
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error requesting withdrawal:', error);
        res.status(500).json({ message: 'Error processing withdrawal request', error: error.message });
    }
};

// User: Get their withdrawal history
const getUserWithdrawals = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { page = 1, limit = 20, status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build query
        const whereClause = { user_id: userId };
        if (status && ['pending', 'processing', 'completed', 'rejected'].includes(status)) {
            whereClause.status = status;
        }

        const { count: totalCount, rows: withdrawals } = await Withdrawal.findAndCountAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // Get summary statistics by status
        const summaryResults = await Withdrawal.findAll({
            where: { user_id: userId },
            attributes: [
                'status',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
                [sequelize.fn('SUM', sequelize.col('system_fee_amount')), 'totalFees'],
                [sequelize.fn('SUM', sequelize.col('amount_after_fee')), 'totalAmountAfterFee'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        const summaryData = {
            pending: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            processing: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            completed: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            rejected: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 }
        };

        summaryResults.forEach(item => {
            if (summaryData[item.status]) {
                summaryData[item.status] = {
                    amount: parseFloat(parseFloat(item.totalAmount || 0).toFixed(2)),
                    fees: parseFloat(parseFloat(item.totalFees || 0).toFixed(2)),
                    amountAfterFee: parseFloat(parseFloat(item.totalAmountAfterFee || 0).toFixed(2)),
                    count: parseInt(item.count) || 0
                };
            }
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
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build query
        const whereClause = {};
        if (status && ['pending', 'processing', 'completed', 'rejected'].includes(status)) {
            whereClause.status = status;
        }

        const { count: totalCount, rows: withdrawals } = await Withdrawal.findAndCountAll({
            where: whereClause,
            include: [
                { 
                    model: User, 
                    as: 'user', 
                    attributes: ['id', 'full_name', 'email', 'phone_number', 'account_balance'] 
                },
                { 
                    model: User, 
                    as: 'processedByUser', 
                    attributes: ['id', 'full_name', 'email'] 
                }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // Get summary statistics
        const summaryResults = await Withdrawal.findAll({
            attributes: [
                'status',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
                [sequelize.fn('SUM', sequelize.col('system_fee_amount')), 'totalFees'],
                [sequelize.fn('SUM', sequelize.col('amount_after_fee')), 'totalAmountAfterFee'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        const summaryData = {
            pending: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            processing: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            completed: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 },
            rejected: { amount: 0, fees: 0, amountAfterFee: 0, count: 0 }
        };

        summaryResults.forEach(item => {
            if (summaryData[item.status]) {
                summaryData[item.status] = {
                    amount: parseFloat(parseFloat(item.totalAmount || 0).toFixed(2)),
                    fees: parseFloat(parseFloat(item.totalFees || 0).toFixed(2)),
                    amountAfterFee: parseFloat(parseFloat(item.totalAmountAfterFee || 0).toFixed(2)),
                    count: parseInt(item.count) || 0
                };
            }
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
        const withdrawals = await Withdrawal.findAll({
            where: { status: 'pending' },
            include: [
                { 
                    model: User, 
                    as: 'user', 
                    attributes: ['id', 'full_name', 'email', 'phone_number', 'account_balance'] 
                }
            ],
            order: [['created_at', 'ASC']] // Oldest first
        });

        const totalPendingAmount = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);
        const totalPendingFees = withdrawals.reduce((sum, w) => sum + (parseFloat(w.system_fee_amount) || 0), 0);
        const totalPendingAfterFee = withdrawals.reduce((sum, w) => sum + (parseFloat(w.amount_after_fee) || 0), 0);

        res.status(200).json({
            message: 'Pending withdrawals retrieved successfully',
            count: withdrawals.length,
            totalAmount: parseFloat(totalPendingAmount.toFixed(2)),
            totalFees: parseFloat(totalPendingFees.toFixed(2)),
            totalAmountAfterFee: parseFloat(totalPendingAfterFee.toFixed(2)),
            data: withdrawals
        });
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({ message: 'Error fetching pending withdrawals', error: error.message });
    }
};

// Admin: Update withdrawal status (approve/reject)
const updateWithdrawalStatus = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { withdrawalId } = req.params;
        const { status, rejectionReason, transactionHash } = req.body;
        const adminId = req.user?.id;

        if (!adminId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'Admin not authenticated' });
        }

        // Validate status
        if (!status || !['processing', 'completed', 'rejected'].includes(status)) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: 'Invalid status. Use: processing, completed, or rejected' 
            });
        }

        // Find withdrawal
        const withdrawal = await Withdrawal.findByPk(withdrawalId, {
            include: [
                { 
                    model: User, 
                    as: 'user', 
                    attributes: ['id', 'full_name', 'email', 'account_balance', 'withdrawal_system_fees'] 
                }
            ],
            transaction
        });
        
        if (!withdrawal) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Withdrawal request not found' });
        }

        // If rejecting, must provide reason and refund the user
        if (status === 'rejected') {
            if (!rejectionReason) {
                await transaction.rollback();
                return res.status(400).json({ message: 'Rejection reason is required' });
            }

            // Refund the amount to user's account balance and deduct fee from system
            const user = await User.findByPk(withdrawal.user_id, { transaction });
            if (user) {
                user.account_balance = (parseFloat(user.account_balance) || 0) + parseFloat(withdrawal.amount);
                // Deduct the fee from withdrawalSystemFees since withdrawal didn't happen
                user.withdrawal_system_fees = Math.max(0, (parseFloat(user.withdrawal_system_fees) || 0) - (parseFloat(withdrawal.system_fee_amount) || 0));
                await user.save({ transaction });
            }

            withdrawal.status = 'rejected';
            withdrawal.rejection_reason = rejectionReason;
            withdrawal.processed_at = new Date();
            withdrawal.processed_by = adminId;
            await withdrawal.save({ transaction });

            await transaction.commit();

            return res.status(200).json({
                message: 'Withdrawal rejected and amount refunded to user',
                data: {
                    withdrawalId: withdrawal.withdrawal_id,
                    amount: parseFloat(withdrawal.amount),
                    status: withdrawal.status,
                    rejectionReason: withdrawal.rejection_reason,
                    refundedToUser: withdrawal.user.full_name,
                    newUserBalance: parseFloat(user.account_balance.toFixed(2))
                }
            });
        }

        // Update withdrawal status
        withdrawal.status = status;
        withdrawal.processed_at = new Date();
        withdrawal.processed_by = adminId;
        
        if (transactionHash) {
            withdrawal.transaction_hash = transactionHash;
        }

        await withdrawal.save({ transaction });
        await transaction.commit();

        res.status(200).json({
            message: `Withdrawal ${status} successfully`,
            data: {
                withdrawalId: withdrawal.withdrawal_id,
                amount: parseFloat(withdrawal.amount),
                systemFee: parseFloat(withdrawal.system_fee_amount) || 0,
                amountAfterFee: parseFloat(withdrawal.amount_after_fee) || parseFloat(withdrawal.amount),
                walletAddress: withdrawal.wallet_address,
                network: withdrawal.network,
                status: withdrawal.status,
                transactionHash: withdrawal.transaction_hash,
                processedAt: withdrawal.processed_at,
                user: {
                    name: withdrawal.user.full_name,
                    email: withdrawal.user.email
                }
            }
        });
    } catch (error) {
        await transaction.rollback();
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
