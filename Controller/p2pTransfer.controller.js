const P2PTransfer = require('../Models/p2pTransfer.model');
const User = require('../Models/user.model');

// Generate unique transfer ID
const generateTransferId = () => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `P2P-${timestamp}-${randomStr}`.toUpperCase();
};

// Transfer P2P balance to another user
const transferP2P = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const { recipientEmail, amount, note } = req.body;
        const senderId = req.user?._id;

        if (!senderId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validation
        if (!recipientEmail || !amount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Recipient email and amount are required' });
        }

        // Validate amount
        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid transfer amount' });
        }

        // Set minimum transfer amount
        const MIN_TRANSFER = 5; // $5 minimum
        if (transferAmount < MIN_TRANSFER) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: `Minimum transfer amount is $${MIN_TRANSFER}`,
                minAmount: MIN_TRANSFER
            });
        }

        // Find sender
        const sender = await User.findById(senderId).session(session);
        if (!sender) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Sender not found' });
        }

        // Find recipient by email
        const recipient = await User.findOne({ email: recipientEmail.toLowerCase().trim() }).session(session);
        if (!recipient) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Recipient not found with this email' });
        }

        // Check if trying to transfer to self
        if (sender._id.toString() === recipient._id.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cannot transfer to yourself' });
        }

        // Check if sender has sufficient P2P balance
        const senderP2PBalance = sender.p2pWallet || 0;
        if (transferAmount > senderP2PBalance) {
            await session.abortTransaction();
            session.endSession();
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
        sender.p2pWallet -= transferAmount;
        recipient.p2pWallet = (recipient.p2pWallet || 0) + amountAfterFee;
        
        // Track system fees collected from P2P transfers
        sender.p2pSystemFees = (sender.p2pSystemFees || 0) + systemFeeAmount;

        await sender.save({ session });
        await recipient.save({ session });

        // Create transfer record
        const transferId = generateTransferId();
        const transfer = new P2PTransfer({
            transferId,
            sender: senderId,
            recipient: recipient._id,
            amount: transferAmount,
            systemFeePercentage: systemFeePercentage,
            systemFeeAmount: systemFeeAmount,
            amountAfterFee: amountAfterFee,
            note: note || null,
            status: 'completed'
        });

        await transfer.save({ session });

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: 'Transfer completed successfully',
            data: {
                transferId: transfer.transferId,
                recipient: recipient.fullName,
                recipientEmail: recipient.email,
                amount: parseFloat(transferAmount.toFixed(2)),
                systemFee: systemFeeAmount,
                amountReceived: amountAfterFee,
                note: note || null,
                newP2PBalance: parseFloat(sender.p2pWallet.toFixed(2)),
                transferredAt: transfer.createdAt
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error processing P2P transfer:', error);
        res.status(500).json({ message: 'Error processing transfer', error: error.message });
    }
};

// Get P2P transfer history (sent and received)
const getP2PTransferHistory = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { page = 1, limit = 20, type = 'all' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {};
        
        // Filter by type: sent, received, or all
        if (type === 'sent') {
            query.sender = userId;
        } else if (type === 'received') {
            query.recipient = userId;
        } else {
            // All transfers (sent or received)
            query.$or = [{ sender: userId }, { recipient: userId }];
        }

        const transfers = await P2PTransfer.find(query)
            .populate('sender', 'fullName email')
            .populate('recipient', 'fullName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalCount = await P2PTransfer.countDocuments(query);

        // Format transfers with type indicator
        const formattedTransfers = transfers.map(transfer => ({
            _id: transfer._id,
            transferId: transfer.transferId,
            type: transfer.sender._id.toString() === userId.toString() ? 'sent' : 'received',
            sender: {
                name: transfer.sender.fullName,
                email: transfer.sender.email
            },
            recipient: {
                name: transfer.recipient.fullName,
                email: transfer.recipient.email
            },
            amount: transfer.amount,
            systemFee: transfer.systemFeeAmount || 0,
            amountAfterFee: transfer.amountAfterFee || transfer.amount,
            note: transfer.note,
            status: transfer.status,
            createdAt: transfer.createdAt
        }));

        // Calculate summary statistics
        const sentTransfers = await P2PTransfer.aggregate([
            { $match: { sender: userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        const receivedTransfers = await P2PTransfer.aggregate([
            { $match: { recipient: userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        const summary = {
            sent: {
                amount: sentTransfers[0]?.total || 0,
                count: sentTransfers[0]?.count || 0
            },
            received: {
                amount: receivedTransfers[0]?.total || 0,
                count: receivedTransfers[0]?.count || 0
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
