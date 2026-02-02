const Gateway = require('../Models/gateway.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

const createGateway = async (req, res) => {
  try {
    const {
      bankName,
      bankAccountNumber,
      bankRoutingNumber,
      bankBranchName,
      gatewayCurrency,
      conversionRate,
      charge,
      allowAsPaymentMethod,
    } = req.body;

    if (!bankName || !bankAccountNumber || !gatewayCurrency) {
      return res
        .status(400)
        .json({ message: 'bankName, bankAccountNumber and gatewayCurrency are required' });
    }

        if (!req.file) {
        return res.status(400).json({ message: "bank image is required" });
    }


    
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    const bankImageUrl = uploadResult.secure_url;
    
    const gateway = new Gateway({
      bankImageUrl,
      bankName,
      bankAccountNumber,
      bankRoutingNumber,
      bankBranchName,
      gatewayCurrency,
      conversionRate: conversionRate || 1,
      charge: charge || 0,
      allowAsPaymentMethod: allowAsPaymentMethod === 'true' || allowAsPaymentMethod === true,
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

module.exports = { createGateway, getGateways };
