const Gateway = require('../Models/gateway.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

const createGateway = async (req, res) => {
    try {
        const { walletName, walletAddress } = req.body;

        if (!walletName || !walletAddress) {
            return res.status(400).json({ message: 'walletName and walletAddress are required' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Image is required' });
        }

        const uploadResult = await uploadToCloudinary(req.file.buffer);
        const image = uploadResult.secure_url;

        const gateway = await Gateway.create({
            image,
            wallet_name: walletName,
            wallet_address: walletAddress,
            created_by: req.user ? req.user.id : null
        });

        res.status(201).json({
            message: 'Gateway created',
            gateway: {
                id: gateway.id,
                image: gateway.image,
                walletName: gateway.wallet_name,
                walletAddress: gateway.wallet_address,
                createdBy: gateway.created_by,
                createdAt: gateway.created_at,
                updatedAt: gateway.updated_at
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const getGateways = async (req, res) => {
    try {
        const gateways = await Gateway.findAll({
            order: [['created_at', 'DESC']]
        });

        // Format response for backward compatibility
        const formattedGateways = gateways.map(g => ({
            id: g.id,
            _id: g.id, // For backward compatibility
            image: g.image,
            walletName: g.wallet_name,
            walletAddress: g.wallet_address,
            createdBy: g.created_by,
            createdAt: g.created_at,
            updatedAt: g.updated_at
        }));

        res.status(200).json(formattedGateways);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteGateway = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await Gateway.destroy({
            where: { id }
        });

        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Gateway not found' });
        }
        
        res.status(200).json({ message: 'Gateway deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createGateway, getGateways, deleteGateway };