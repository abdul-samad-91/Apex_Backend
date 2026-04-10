const { sequelize } = require('../Config/DB');
const P2PTransfer = require('../Models/p2pTransfer.model');
const User = require('../Models/user.model');
const { Op } = require('sequelize');
const { createWalletLedgerEntry } = require('../utils/walletLedger.util');

// Generate unique transfer ID
const generateTransferId = () => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `P2P-${timestamp}-${randomStr}`.toUpperCase();
};

// Transfer P2P balance to another user
const transferP2P = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { recipientEmail, amount, note } = req.body;
        const senderId = req.user?.id;

        if (!senderId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validation
        if (!recipientEmail || !amount) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Recipient email and amount are required' });
        }

        // Validate amount
        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Invalid transfer amount' });
        }

        // Set minimum transfer amount
        const MIN_TRANSFER = 5; // $5 minimum
        if (transferAmount < MIN_TRANSFER) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: `Minimum transfer amount is $${MIN_TRANSFER}`,
                minAmount: MIN_TRANSFER
            });
        }

        // Find sender
        const sender = await User.findByPk(senderId, { transaction });
        if (!sender) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Sender not found' });
        }

        // Find recipient by email
        const recipient = await User.findOne({ 
            where: { email: recipientEmail.toLowerCase().trim() },
            transaction 
        });
        if (!recipient) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Recipient not found with this email' });
        }

        // Check if trying to transfer to self
        if (sender.id === recipient.id) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Cannot transfer to yourself' });
        }

        // Check if sender has sufficient P2P balance
        const senderP2PBalance = parseFloat(sender.p2p_wallet) || 0;
        if (transferAmount > senderP2PBalance) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: 'Insufficient P2P wallet balance',
                availableBalance: parseFloat(senderP2PBalance.toFixed(2)),
                requestedAmount: transferAmount
            });
        }

        // Calculate 3% system fee
        const systemFeePercentage = 3;
        const systemFeeAmount = parseFloat((transferAmount * systemFeePercentage / 100).toFixed(2));
        const amountAfterFee = parseFloat((transferAmount - systemFeeAmount).toFixed(2));

        // Perform transfer (sender pays full amount, recipient gets amount after fee)
        const senderPreviousBalance = parseFloat(sender.p2p_wallet) || 0;
        const recipientPreviousBalance = parseFloat(recipient.p2p_wallet) || 0;

        sender.p2p_wallet = parseFloat(sender.p2p_wallet) - transferAmount;
        recipient.p2p_wallet = (parseFloat(recipient.p2p_wallet) || 0) + amountAfterFee;
        
        // Track system fees collected from P2P transfers
        sender.p2p_system_fees = (parseFloat(sender.p2p_system_fees) || 0) + systemFeeAmount;

        await sender.save({ transaction });
        await recipient.save({ transaction });

        // Create transfer record
        const transferId = generateTransferId();
        const transfer = await P2PTransfer.create({
            transfer_id: transferId,
            sender_id: senderId,
            recipient_id: recipient.id,
            amount: transferAmount,
            system_fee_percentage: systemFeePercentage,
            system_fee_amount: systemFeeAmount,
            amount_after_fee: amountAfterFee,
            note: note || null,
            status: 'completed'
        }, { transaction });

        await createWalletLedgerEntry({
            userId: senderId,
            walletType: 'p2p_wallet',
            entryType: 'debit',
            amount: transferAmount,
            balanceBefore: senderPreviousBalance,
            balanceAfter: parseFloat(sender.p2p_wallet),
            sourceType: 'p2p_transfer_sent',
            sourceId: transfer.transfer_id,
            counterpartyUserId: recipient.id,
            description: 'P2P transfer sent',
            metadata: {
                transferAmount,
                systemFeeAmount,
                amountAfterFee
            },
            transaction
        });

        await createWalletLedgerEntry({
            userId: recipient.id,
            walletType: 'p2p_wallet',
            entryType: 'credit',
            amount: amountAfterFee,
            balanceBefore: recipientPreviousBalance,
            balanceAfter: parseFloat(recipient.p2p_wallet),
            sourceType: 'p2p_transfer_received',
            sourceId: transfer.transfer_id,
            counterpartyUserId: senderId,
            description: 'P2P transfer received',
            metadata: {
                transferAmount,
                systemFeeAmount,
                amountAfterFee
            },
            transaction
        });

        // Commit transaction
        await transaction.commit();

        res.status(200).json({
            message: 'Transfer completed successfully',
            data: {
                transferId: transfer.transfer_id,
                recipient: recipient.full_name,
                recipientEmail: recipient.email,
                amount: parseFloat(transferAmount.toFixed(2)),
                systemFee: systemFeeAmount,
                amountReceived: amountAfterFee,
                note: note || null,
                newP2PBalance: parseFloat(sender.p2p_wallet.toFixed(2)),
                transferredAt: transfer.created_at
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error processing P2P transfer:', error);
        res.status(500).json({ message: 'Error processing transfer', error: error.message });
    }
};

// Get P2P transfer history (sent and received)
const getP2PTransferHistory = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { page = 1, limit = 20, type = 'all' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClause = {};
        
        // Filter by type: sent, received, or all
        if (type === 'sent') {
            whereClause.sender_id = userId;
        } else if (type === 'received') {
            whereClause.recipient_id = userId;
        } else {
            // All transfers (sent or received)
            whereClause[Op.or] = [{ sender_id: userId }, { recipient_id: userId }];
        }

        const { count: totalCount, rows: transfers } = await P2PTransfer.findAndCountAll({
            where: whereClause,
            include: [
                { 
                    model: User, 
                    as: 'sender', 
                    attributes: ['id', 'full_name', 'email'] 
                },
                { 
                    model: User, 
                    as: 'recipient', 
                    attributes: ['id', 'full_name', 'email'] 
                }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // Format transfers with type indicator
        const formattedTransfers = transfers.map(transfer => ({
            id: transfer.id,
            transferId: transfer.transfer_id,
            type: transfer.sender_id === userId ? 'sent' : 'received',
            sender: {
                name: transfer.sender.full_name,
                email: transfer.sender.email
            },
            recipient: {
                name: transfer.recipient.full_name,
                email: transfer.recipient.email
            },
            amount: parseFloat(transfer.amount),
            systemFee: parseFloat(transfer.system_fee_amount) || 0,
            amountAfterFee: parseFloat(transfer.amount_after_fee) || parseFloat(transfer.amount),
            note: transfer.note,
            status: transfer.status,
            createdAt: transfer.created_at
        }));

        // Calculate summary statistics
        const sentSummary = await P2PTransfer.findOne({
            where: { sender_id: userId, status: 'completed' },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const receivedSummary = await P2PTransfer.findOne({
            where: { recipient_id: userId, status: 'completed' },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            raw: true
        });

        const summary = {
            sent: {
                amount: parseFloat(sentSummary?.total) || 0,
                count: parseInt(sentSummary?.count) || 0
            },
            received: {
                amount: parseFloat(receivedSummary?.total) || 0,
                count: parseInt(receivedSummary?.count) || 0
            }
        };

        res.status(200).json({
            message: 'P2P transfer history retrieved successfully',
            data: {
                transfers: formattedTransfers,
                summary: summary,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                    totalItems: totalCount,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching P2P transfer history:', error);
        res.status(500).json({ message: 'Error fetching transfer history', error: error.message });
    }
};

module.exports = {
    transferP2P,
    getP2PTransferHistory
};
