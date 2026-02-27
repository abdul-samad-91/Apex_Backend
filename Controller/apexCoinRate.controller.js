const ApexCoinRate = require('../Models/apexCoinRate.model');

// Admin: Set apex coin rate
const setApexCoinRate = async (req, res) => {
    try {
        const { rate } = req.body;

        if (rate === undefined || rate === null) {
            return res.status(400).json({ message: 'Rate is required' });
        }

        const rateValue = parseFloat(rate);
        if (isNaN(rateValue) || rateValue <= 0) {
            return res.status(400).json({ message: 'Rate must be a valid positive number' });
        }

        const apexCoinRate = await ApexCoinRate.create({
            rate: rateValue,
            is_active: true,
            created_by: req.user ? req.user.id : null
        });

        res.status(201).json({
            message: 'Apex coin rate set successfully',
            apexCoinRate: {
                id: apexCoinRate.id,
                rate: parseFloat(apexCoinRate.rate),
                isActive: apexCoinRate.is_active,
                createdBy: apexCoinRate.created_by,
                createdAt: apexCoinRate.createdAt,
                updatedAt: apexCoinRate.updatedAt
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// Get current active apex coin rate
const getApexCoinRate = async (req, res) => {
    try {
        const apexCoinRate = await ApexCoinRate.findOne({
            where: { is_active: true },
            order: [['created_at', 'DESC']]
        });

        if (!apexCoinRate) {
            return res.status(404).json({ message: 'No active apex coin rate found' });
        }

        res.status(200).json({
            id: apexCoinRate.id,
            _id: apexCoinRate.id, // For backward compatibility
            rate: parseFloat(apexCoinRate.rate),
            isActive: apexCoinRate.is_active,
            createdBy: apexCoinRate.created_by,
            createdAt: apexCoinRate.createdAt,
            updatedAt: apexCoinRate.updatedAt
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all apex coin rates (history)
const getAllApexCoinRates = async (req, res) => {
    try {
        const rates = await ApexCoinRate.findAll({
            order: [['created_at', 'DESC']]
        });

        const formattedRates = rates.map(r => ({
            id: r.id,
            _id: r.id, // For backward compatibility
            rate: parseFloat(r.rate),
            isActive: r.is_active,
            createdBy: r.created_by,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
        }));

        res.status(200).json(formattedRates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    setApexCoinRate,
    getApexCoinRate,
    getAllApexCoinRates
};