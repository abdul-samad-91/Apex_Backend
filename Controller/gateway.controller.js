const Gateway = require('../Models/gateway.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

const createGateway = async (req, res) => {
  try {
    const { walletId, walletAddress } = req.body;

    if (!walletId || !walletAddress) {
      return res.status(400).json({ message: 'walletId and walletAddress are required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer);
    const image = uploadResult.secure_url;

    const gateway = new Gateway({
      image,
      walletId,
      walletAddress,
      createdBy: req.user ? req.user._id : null,
    });

    await gateway.save();
    res.status(201).json({ message: 'Gateway created', gateway });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getGateways = async (req, res) => {
  try {
    const gateways = await Gateway.find();
    res.status(200).json(gateways);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteGateway = async (req, res) => {
  try {
    const { id } = req.params;  
    const gateway = await Gateway.findByIdAndDelete(id);

    if (!gateway) {
      return res.status(404).json({ message: 'Gateway not found' });
    }
    res.status(200).json({ message: 'Gateway deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createGateway, getGateways, deleteGateway };
