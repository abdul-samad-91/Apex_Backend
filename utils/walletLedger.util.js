const WalletLedger = require('../Models/walletLedger.model');

const toAmount = (value) => {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const createWalletLedgerEntry = async ({
    userId,
    walletType,
    entryType,
    amount,
    balanceBefore,
    balanceAfter,
    sourceType,
    sourceId = null,
    counterpartyUserId = null,
    status = 'completed',
    description = null,
    metadata = {},
    happenedAt = new Date(),
    transaction = undefined
}) => {
    if (!userId || !walletType || !entryType || !sourceType) {
        throw new Error('Missing required wallet ledger fields');
    }

    return WalletLedger.create(
        {
            user_id: userId,
            wallet_type: walletType,
            entry_type: entryType,
            amount: toAmount(amount),
            balance_before: toAmount(balanceBefore),
            balance_after: toAmount(balanceAfter),
            source_type: sourceType,
            source_id: sourceId,
            counterparty_user_id: counterpartyUserId,
            status,
            description,
            metadata: metadata || {},
            happened_at: happenedAt
        },
        transaction ? { transaction } : undefined
    );
};

module.exports = {
    createWalletLedgerEntry
};
