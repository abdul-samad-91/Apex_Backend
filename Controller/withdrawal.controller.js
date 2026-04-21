const { sequelize } = require('../Config/DB');
const Withdrawal = require('../Models/withdrawal.model');
const User = require('../Models/user.model');
const KycRequest = require('../Models/kycRequest.model');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { generateOTP, sendWithdrawalOTPEmail } = require('../utils/sendEmail');
const { createWalletLedgerEntry } = require('../utils/walletLedger.util');

const WITHDRAWAL_MIN_AMOUNT = 10;
const WITHDRAWAL_SYSTEM_FEE_PERCENTAGE = 5;
const WITHDRAWAL_OTP_EXPIRY_MS = 10 * 60 * 1000;
const WITHDRAWAL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const WITHDRAWAL_OTP_MAX_ATTEMPTS = 5;

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const getOtpExpirySeconds = () => Math.floor(WITHDRAWAL_OTP_EXPIRY_MS / 1000);

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

        // KYC verification is required for withdrawals.
        if (!user.is_kyc_verified) {
            const kycRequest = await KycRequest.findOne({
                where: { user_id: userId },
                transaction
            });

            const kycStatus = kycRequest ? kycRequest.status : 'pending';
            const statusMessages = {
                pending: 'KYC status is pending. Submit KYC to enable withdrawals.',
                under_review: 'KYC is under review. Withdrawal is not allowed yet.',
                rejected: 'KYC was rejected. Please resubmit your KYC details.',
                verified: 'KYC not verified yet. Withdrawal is not allowed.'
            };

            await transaction.rollback();
            return res.status(403).json({
                message: statusMessages[kycStatus] || statusMessages.pending,
                kycStatus,
                rejectionReason: kycStatus === 'rejected' ? kycRequest?.rejection_reason : null
            });
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
        if (withdrawalAmount < WITHDRAWAL_MIN_AMOUNT) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: `Minimum withdrawal amount is $${WITHDRAWAL_MIN_AMOUNT}`,
                minAmount: WITHDRAWAL_MIN_AMOUNT
            });
        }

        // Calculate 5% system fee
        const systemFeePercentage = WITHDRAWAL_SYSTEM_FEE_PERCENTAGE;
        const systemFeeAmount = parseFloat((withdrawalAmount * systemFeePercentage / 100).toFixed(2));
        const amountAfterFee = parseFloat((withdrawalAmount - systemFeeAmount).toFixed(2));

        const otp = generateOTP();
        const otpHash = hashOtp(otp);
        const otpExpiry = new Date(Date.now() + WITHDRAWAL_OTP_EXPIRY_MS);
        const now = new Date();

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
            status: 'pending',
            verification_status: 'otp_pending',
            user_otp_hash: otpHash,
            user_otp_expiry: otpExpiry,
            otp_attempts: 0,
            otp_last_sent_at: now,
            user_otp_verified_at: null
        }, { transaction });

        const emailResult = await sendWithdrawalOTPEmail(user.email, otp, user.full_name, {
            withdrawalId: withdrawal.withdrawal_id,
            amount: withdrawalAmount.toFixed(2),
            network
        });

        if (!emailResult.success) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Failed to send withdrawal OTP', error: emailResult.error });
        }

        await transaction.commit();

        res.status(202).json({
            message: 'Withdrawal request created. Verify OTP sent to your email to continue processing.',
            data: {
                withdrawalId: withdrawal.withdrawal_id,
                amount: withdrawalAmount,
                systemFee: systemFeeAmount,
                amountToReceive: amountAfterFee,
                walletAddress: walletAddress,
                network: network,
                status: withdrawal.status,
                verificationStatus: withdrawal.verification_status,
                requestedAt: withdrawal.created_at,
                otpExpiresInSeconds: getOtpExpirySeconds()
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error requesting withdrawal:', error);
        res.status(500).json({ message: 'Error processing withdrawal request', error: error.message });
    }
};

// User: Verify withdrawal OTP and finalize request submission
const verifyWithdrawalOTP = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { withdrawalId, otp } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!withdrawalId || !otp) {
            await transaction.rollback();
            return res.status(400).json({ message: 'withdrawalId and otp are required' });
        }

        const withdrawal = await Withdrawal.findOne({
            where: { withdrawal_id: withdrawalId, user_id: userId },
            transaction,
            lock: true
        });

        if (!withdrawal) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Withdrawal request not found' });
        }

        if (withdrawal.status !== 'pending') {
            await transaction.rollback();
            return res.status(400).json({ message: `Cannot verify OTP for withdrawal with status ${withdrawal.status}` });
        }

        if (withdrawal.verification_status === 'otp_verified') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Withdrawal OTP already verified' });
        }

        if (!withdrawal.user_otp_hash || !withdrawal.user_otp_expiry) {
            await transaction.rollback();
            return res.status(400).json({ message: 'No OTP found. Please resend OTP.' });
        }

        if (new Date(withdrawal.user_otp_expiry) < new Date()) {
            await transaction.rollback();
            return res.status(400).json({ message: 'OTP has expired. Please resend OTP.' });
        }

        if ((withdrawal.otp_attempts || 0) >= WITHDRAWAL_OTP_MAX_ATTEMPTS) {
            await transaction.rollback();
            return res.status(429).json({ message: 'Maximum OTP attempts reached. Please resend OTP.' });
        }

        const isOtpValid = hashOtp(otp) === withdrawal.user_otp_hash;
        if (!isOtpValid) {
            withdrawal.otp_attempts = (withdrawal.otp_attempts || 0) + 1;
            await withdrawal.save({ transaction });
            await transaction.commit();
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Validate balance and complete the debit only after OTP verification.
        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.is_kyc_verified) {
            await transaction.rollback();
            return res.status(403).json({ message: 'KYC verification is required to complete withdrawal verification' });
        }

        const withdrawalAmount = parseFloat(withdrawal.amount);
        const currentBalance = parseFloat(user.account_balance) || 0;
        if (withdrawalAmount > currentBalance) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Insufficient balance at verification time',
                availableBalance: parseFloat(currentBalance.toFixed(2)),
                requestedAmount: withdrawalAmount
            });
        }

        const previousBalance = currentBalance;
        user.account_balance = currentBalance - withdrawalAmount;
        user.withdrawal_system_fees = (parseFloat(user.withdrawal_system_fees) || 0) + (parseFloat(withdrawal.system_fee_amount) || 0);
        await user.save({ transaction });

        withdrawal.verification_status = 'otp_verified';
        withdrawal.user_otp_verified_at = new Date();
        withdrawal.user_otp_hash = null;
        withdrawal.user_otp_expiry = null;
        withdrawal.otp_attempts = 0;
        withdrawal.otp_last_sent_at = null;
        await withdrawal.save({ transaction });

        await createWalletLedgerEntry({
            userId,
            walletType: 'account_balance',
            entryType: 'debit',
            amount: withdrawalAmount,
            balanceBefore: previousBalance,
            balanceAfter: parseFloat(user.account_balance),
            sourceType: 'withdrawal_request',
            sourceId: withdrawal.withdrawal_id,
            status: 'pending',
            description: 'Withdrawal request submitted after OTP verification',
            metadata: {
                network: withdrawal.network,
                walletAddress: withdrawal.wallet_address,
                systemFeePercentage: parseFloat(withdrawal.system_fee_percentage) || WITHDRAWAL_SYSTEM_FEE_PERCENTAGE,
                systemFeeAmount: parseFloat(withdrawal.system_fee_amount) || 0,
                amountAfterFee: parseFloat(withdrawal.amount_after_fee) || 0
            },
            transaction
        });

        await transaction.commit();

        return res.status(200).json({
            message: 'Withdrawal OTP verified successfully. Request moved for admin processing.',
            data: {
                withdrawalId: withdrawal.withdrawal_id,
                status: withdrawal.status,
                verificationStatus: withdrawal.verification_status,
                amount: parseFloat(withdrawal.amount),
                systemFee: parseFloat(withdrawal.system_fee_amount) || 0,
                amountToReceive: parseFloat(withdrawal.amount_after_fee) || 0,
                newAccountBalance: parseFloat(parseFloat(user.account_balance).toFixed(2)),
                verifiedAt: withdrawal.user_otp_verified_at
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error verifying withdrawal OTP:', error);
        return res.status(500).json({ message: 'Error verifying withdrawal OTP', error: error.message });
    }
};

// User: Resend withdrawal OTP
const resendWithdrawalOTP = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { withdrawalId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!withdrawalId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'withdrawalId is required' });
        }

        const withdrawal = await Withdrawal.findOne({
            where: { withdrawal_id: withdrawalId, user_id: userId },
            transaction,
            lock: true
        });

        if (!withdrawal) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Withdrawal request not found' });
        }

        if (withdrawal.status !== 'pending') {
            await transaction.rollback();
            return res.status(400).json({ message: `Cannot resend OTP for withdrawal with status ${withdrawal.status}` });
        }

        if (withdrawal.verification_status === 'otp_verified') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Withdrawal is already OTP verified' });
        }

        if (withdrawal.otp_last_sent_at) {
            const elapsedMs = Date.now() - new Date(withdrawal.otp_last_sent_at).getTime();
            if (elapsedMs < WITHDRAWAL_OTP_RESEND_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((WITHDRAWAL_OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000);
                await transaction.rollback();
                return res.status(429).json({ message: `Please wait ${waitSeconds} seconds before resending OTP` });
            }
        }

        const user = await User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        const otp = generateOTP();
        withdrawal.user_otp_hash = hashOtp(otp);
        withdrawal.user_otp_expiry = new Date(Date.now() + WITHDRAWAL_OTP_EXPIRY_MS);
        withdrawal.otp_attempts = 0;
        withdrawal.otp_last_sent_at = new Date();

        await withdrawal.save({ transaction });

        const emailResult = await sendWithdrawalOTPEmail(user.email, otp, user.full_name, {
            withdrawalId: withdrawal.withdrawal_id,
            amount: parseFloat(withdrawal.amount).toFixed(2),
            network: withdrawal.network
        });

        if (!emailResult.success) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Failed to resend withdrawal OTP', error: emailResult.error });
        }

        await transaction.commit();

        return res.status(200).json({
            message: 'Withdrawal OTP resent successfully',
            data: {
                withdrawalId: withdrawal.withdrawal_id,
                otpExpiresInSeconds: getOtpExpirySeconds()
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error resending withdrawal OTP:', error);
        return res.status(500).json({ message: 'Error resending withdrawal OTP', error: error.message });
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

        // Transform withdrawals to camelCase
        const formattedWithdrawals = withdrawals.map(withdrawal => {
            const w = withdrawal.toJSON();
            return {
                id: w.id,
                withdrawalId: w.withdrawal_id,
                userId: w.user_id,
                amount: parseFloat(w.amount),
                systemFeePercentage: parseFloat(w.system_fee_percentage),
                systemFeeAmount: parseFloat(w.system_fee_amount),
                amountAfterFee: parseFloat(w.amount_after_fee),
                walletAddress: w.wallet_address,
                network: w.network,
                status: w.status,
                verificationStatus: w.verification_status || 'otp_verified',
                userOtpVerifiedAt: w.user_otp_verified_at,
                rejectionReason: w.rejection_reason,
                processedAt: w.processed_at,
                processedBy: w.processed_by,
                transactionHash: w.transaction_hash,
                transactionId: w.transaction_id,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt
            };
        });

        res.status(200).json({
            message: 'Withdrawal history retrieved successfully',
            data: {
                withdrawals: formattedWithdrawals,
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

        // Transform withdrawals to camelCase
        const formattedWithdrawals = withdrawals.map(withdrawal => {
            const w = withdrawal.toJSON();
            return {
                id: w.id,
                withdrawalId: w.withdrawal_id,
                userId: w.user_id,
                amount: parseFloat(w.amount),
                systemFeePercentage: parseFloat(w.system_fee_percentage),
                systemFeeAmount: parseFloat(w.system_fee_amount),
                amountAfterFee: parseFloat(w.amount_after_fee),
                walletAddress: w.wallet_address,
                network: w.network,
                status: w.status,
                verificationStatus: w.verification_status || 'otp_verified',
                userOtpVerifiedAt: w.user_otp_verified_at,
                rejectionReason: w.rejection_reason,
                processedAt: w.processed_at,
                processedBy: w.processed_by,
                transactionHash: w.transaction_hash,
                transactionId: w.transaction_id,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
                user: w.user ? {
                    id: w.user.id,
                    fullName: w.user.full_name,
                    email: w.user.email,
                    phoneNumber: w.user.phone_number,
                    accountBalance: parseFloat(w.user.account_balance)
                } : null,
                processedByUser: w.processedByUser ? {
                    id: w.processedByUser.id,
                    fullName: w.processedByUser.full_name,
                    email: w.processedByUser.email
                } : null
            };
        });

        res.status(200).json({
            message: 'All withdrawals retrieved successfully',
            data: {
                withdrawals: formattedWithdrawals,
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
            where: {
                status: 'pending',
                [Op.or]: [
                    { verification_status: 'otp_verified' },
                    { verification_status: null }
                ]
            },
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

        // Transform withdrawals to camelCase
        const formattedWithdrawals = withdrawals.map(withdrawal => {
            const w = withdrawal.toJSON();
            return {
                id: w.id,
                withdrawalId: w.withdrawal_id,
                userId: w.user_id,
                amount: parseFloat(w.amount),
                systemFeePercentage: parseFloat(w.system_fee_percentage),
                systemFeeAmount: parseFloat(w.system_fee_amount),
                amountAfterFee: parseFloat(w.amount_after_fee),
                walletAddress: w.wallet_address,
                network: w.network,
                status: w.status,
                verificationStatus: w.verification_status || 'otp_verified',
                userOtpVerifiedAt: w.user_otp_verified_at,
                rejectionReason: w.rejection_reason,
                processedAt: w.processed_at,
                processedBy: w.processed_by,
                transactionHash: w.transaction_hash,
                transactionId: w.transaction_id,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
                user: w.user ? {
                    id: w.user.id,
                    fullName: w.user.full_name,
                    email: w.user.email,
                    phoneNumber: w.user.phone_number,
                    accountBalance: parseFloat(w.user.account_balance)
                } : null
            };
        });

        res.status(200).json({
            message: 'Pending withdrawals retrieved successfully',
            count: withdrawals.length,
            totalAmount: parseFloat(totalPendingAmount.toFixed(2)),
            totalFees: parseFloat(totalPendingFees.toFixed(2)),
            totalAmountAfterFee: parseFloat(totalPendingAfterFee.toFixed(2)),
            data: formattedWithdrawals
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
        const { status, rejectionReason, transactionHash, transactionId } = req.body;
        const adminId = req.user?.id;

        console.log('Withdrawal approval request body:', req.body);
        console.log('Extracted transactionId:', transactionId);

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

        if (withdrawal.verification_status && withdrawal.verification_status !== 'otp_verified') {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Withdrawal is waiting for user OTP verification and cannot be processed yet',
                verificationStatus: withdrawal.verification_status
            });
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
                const previousBalance = parseFloat(user.account_balance) || 0;
                user.account_balance = (parseFloat(user.account_balance) || 0) + parseFloat(withdrawal.amount);
                // Deduct the fee from withdrawalSystemFees since withdrawal didn't happen
                user.withdrawal_system_fees = Math.max(0, (parseFloat(user.withdrawal_system_fees) || 0) - (parseFloat(withdrawal.system_fee_amount) || 0));
                await user.save({ transaction });

                await createWalletLedgerEntry({
                    userId: user.id,
                    walletType: 'account_balance',
                    entryType: 'credit',
                    amount: parseFloat(withdrawal.amount),
                    balanceBefore: previousBalance,
                    balanceAfter: parseFloat(user.account_balance),
                    sourceType: 'withdrawal_refund',
                    sourceId: withdrawal.withdrawal_id,
                    status: 'completed',
                    description: 'Withdrawal rejected and amount refunded',
                    metadata: {
                        rejectionReason,
                        rejectedBy: adminId,
                        originalStatus: withdrawal.status
                    },
                    transaction
                });
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
        if (transactionId) {
            withdrawal.transaction_id = transactionId;
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
                verificationStatus: withdrawal.verification_status || 'otp_verified',
                transactionHash: withdrawal.transaction_hash,
                transactionId: withdrawal.transaction_id,
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
    verifyWithdrawalOTP,
    resendWithdrawalOTP,
    getUserWithdrawals,
    getAllWithdrawals,
    getPendingWithdrawals,
    updateWithdrawalStatus
};
