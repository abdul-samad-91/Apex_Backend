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

    const apexCoinRate = new ApexCoinRate({
      rate: rateValue,
      isActive: true,
      createdBy: req.user ? req.user._id : null,
    });

    await apexCoinRate.save();
    res.status(201).json({ 
      message: 'Apex coin rate set successfully', 
      apexCoinRate 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get current active apex coin rate
const getApexCoinRate = async (req, res) => {
  try {
    const apexCoinRate = await ApexCoinRate.findOne({ isActive: true }).sort({ createdAt: -1 });
    
    if (!apexCoinRate) {
      return res.status(404).json({ message: 'No active apex coin rate found' });
    }

    res.status(200).json(apexCoinRate);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all apex coin rates (history)
const getAllApexCoinRates = async (req, res) => {
  try {
    const rates = await ApexCoinRate.find().sort({ createdAt: -1 });
    res.status(200).json(rates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  setApexCoinRate,
  getApexCoinRate,
  getAllApexCoinRates
};
