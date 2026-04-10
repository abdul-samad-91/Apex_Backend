const { Op } = require('sequelize');
const WalletLedger = require('../Models/walletLedger.model');
const User = require('../Models/user.model');

const buildWhereClause = ({ userId, walletType, entryType, sourceType, status, startDate, endDate }) => {
    const where = {};

    if (userId) {
        where.user_id = userId;
    }

    if (walletType && ['account_balance', 'p2p_wallet'].includes(walletType)) {
        where.wallet_type = walletType;
    }

    if (entryType && ['credit', 'debit'].includes(entryType)) {
        where.entry_type = entryType;
    }

    if (sourceType) {
        where.source_type = sourceType;
    }

    if (status && ['pending', 'completed', 'failed', 'reversed'].includes(status)) {
        where.status = status;
    }

    if (startDate || endDate) {
        where.happened_at = {};
        if (startDate) {
            where.happened_at[Op.gte] = new Date(startDate);
        }
        if (endDate) {
            where.happened_at[Op.lte] = new Date(endDate);
        }
    }

    return where;
};

const formatEntry = (entry) => ({
    id: entry.id,
    userId: entry.user_id,
    walletType: entry.wallet_type,
    entryType: entry.entry_type,
    amount: parseFloat(entry.amount),
    balanceBefore: parseFloat(entry.balance_before),
    balanceAfter: parseFloat(entry.balance_after),
    sourceType: entry.source_type,
    sourceId: entry.source_id,
    status: entry.status,
    description: entry.description,
    metadata: entry.metadata || {},
    happenedAt: entry.happened_at,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    counterparty: entry.counterpartyUser
        ? {
            id: entry.counterpartyUser.id,
            fullName: entry.counterpartyUser.full_name,
            email: entry.counterpartyUser.email
        }
        : null,
    user: entry.user
        ? {
            id: entry.user.id,
            fullName: entry.user.full_name,
            email: entry.user.email
        }
        : null
});

const fetchWalletHistory = async ({ whereClause, page, limit, includeUser = false }) => {
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (parsedPage - 1) * parsedLimit;

    const include = [
        {
            model: User,
            as: 'counterpartyUser',
            attributes: ['id', 'full_name', 'email'],
            required: false
        }
    ];

    if (includeUser) {
        include.push({
            model: User,
            as: 'user',
            attributes: ['id', 'full_name', 'email'],
            required: false
        });
    }

    const { count, rows } = await WalletLedger.findAndCountAll({
        where: whereClause,
        include,
        order: [['happened_at', 'DESC'], ['created_at', 'DESC']],
        offset,
        limit: parsedLimit
    });

    return {
        entries: rows.map(formatEntry),
        pagination: {
            currentPage: parsedPage,
            totalPages: Math.ceil(count / parsedLimit),
            totalItems: count,
            itemsPerPage: parsedLimit
        }
    };
};

const getMyWalletHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const whereClause = buildWhereClause({
            userId,
            walletType: req.query.walletType,
            entryType: req.query.entryType,
            sourceType: req.query.sourceType,
            status: req.query.status,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        });

        const data = await fetchWalletHistory({
            whereClause,
            page: req.query.page,
            limit: req.query.limit,
            includeUser: false
        });

        return res.status(200).json({
            message: 'Wallet history retrieved successfully',
            data
        });
    } catch (error) {
        console.error('Error fetching wallet history:', error);
        return res.status(500).json({ message: 'Error fetching wallet history', error: error.message });
    }
};

const getUserWalletHistory = async (req, res) => {
    try {
        const whereClause = buildWhereClause({
            userId: req.params.userId,
            walletType: req.query.walletType,
            entryType: req.query.entryType,
            sourceType: req.query.sourceType,
            status: req.query.status,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        });

        const data = await fetchWalletHistory({
            whereClause,
            page: req.query.page,
            limit: req.query.limit,
            includeUser: true
        });

        return res.status(200).json({
            message: 'User wallet history retrieved successfully',
            data
        });
    } catch (error) {
        console.error('Error fetching user wallet history:', error);
        return res.status(500).json({ message: 'Error fetching wallet history', error: error.message });
    }
};

const getAllWalletHistory = async (req, res) => {
    try {
        const whereClause = buildWhereClause({
            userId: req.query.userId,
            walletType: req.query.walletType,
            entryType: req.query.entryType,
            sourceType: req.query.sourceType,
            status: req.query.status,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        });

        const data = await fetchWalletHistory({
            whereClause,
            page: req.query.page,
            limit: req.query.limit,
            includeUser: true
        });

        return res.status(200).json({
            message: 'All wallet history retrieved successfully',
            data
        });
    } catch (error) {
        console.error('Error fetching all wallet history:', error);
        return res.status(500).json({ message: 'Error fetching wallet history', error: error.message });
    }
};

module.exports = {
    getMyWalletHistory,
    getUserWalletHistory,
    getAllWalletHistory
};
