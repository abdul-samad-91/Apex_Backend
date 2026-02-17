const { sequelize } = require('../Config/DB');
const Roi = require('../Models/roi.model');
const User = require('../Models/user.model');

// Admin: set or update ROI (creates a new ROI document)
const setRoi = async (req, res) => {
    try {
        const { rate, isActive } = req.body;

        if (rate === undefined || rate === null) {
            return res.status(400).json({ message: 'rate is required' });
        }

        const roi = await Roi.create({
            rate: Number(rate),
            is_active: isActive === undefined ? true : Boolean(isActive),
            created_by: req.user ? req.user.id : null
        });

        res.status(201).json({
            message: 'ROI set',
            roi: {
                id: roi.id,
                rate: parseFloat(roi.rate),
                isActive: roi.is_active,
                createdBy: roi.created_by,
                createdAt: roi.created_at,
                updatedAt: roi.updated_at
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// Public: get latest active ROI
const getRoi = async (req, res) => {
    try {
        const roi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });
        
        if (!roi) {
            return res.status(404).json({ message: 'No active ROI found' });
        }
        
        res.status(200).json({
            id: roi.id,
            _id: roi.id, // For backward compatibility
            rate: parseFloat(roi.rate),
            isActive: roi.is_active,
            createdBy: roi.created_by,
            createdAt: roi.created_at,
            updatedAt: roi.updated_at
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// User: claim ROI if apexCoins > 50
const claimRoi = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const userId = req.user?.id;
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const user = await User.findByPk(userId, { transaction, lock: true });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        const currentRoi = await Roi.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            transaction
        });
        if (!currentRoi) {
            await transaction.rollback();
            return res.status(400).json({ message: 'ROI not set by admin' });
        }

        const apexCoins = parseFloat(user.apex_coins) || 0;
        if (apexCoins <= 50) {
            await transaction.rollback();
            return res.status(400).json({ message: 'You must have more than 50 Apex coins to claim ROI' });
        }

        const rate = parseFloat(currentRoi.rate);
        const roiAmount = parseFloat(((apexCoins * rate) / 100).toFixed(2));

        const newApexCoins = parseFloat((apexCoins + roiAmount).toFixed(2));
        await user.update({ apex_coins: newApexCoins }, { transaction });

        await transaction.commit();

        res.status(200).json({
            message: 'ROI claimed',
            roiAmount,
            apexCoins: newApexCoins
        });
    } catch (error) {
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { setRoi, getRoi, claimRoi };