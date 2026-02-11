const { Roi, User } = require('../Models_MySQL');

// Admin: set or update ROI (creates a new ROI document)
const setRoi = async (req, res) => {
  try {
    const { rate, isActive } = req.body;

    if (rate === undefined || rate === null) {
      return res.status(400).json({ message: 'rate is required' });
    }

    const roi = await Roi.create({
      rate: Number(rate),
      isActive: isActive === undefined ? true : Boolean(isActive),
      createdById: req.user ? req.user.id : null,
    });

    res.status(201).json({ message: 'ROI set', roi });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Public: get latest active ROI
const getRoi = async (req, res) => {
  try {
    const roi = await Roi.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    
    if (!roi) return res.status(404).json({ message: 'No active ROI found' });
    res.status(200).json(roi);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// User: claim ROI if apexCoins > 50
const claimRoi = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentRoi = await Roi.findOne({ 
      where: { isActive: true },
      order: [['createdAt', 'DESC']]
    });
    
    if (!currentRoi) return res.status(400).json({ message: 'ROI not set by admin' });

    const apexCoins = Number(user.apexCoins || 0);
    if (apexCoins <= 50) {
      return res.status(400).json({ message: 'You must have more than 50 Apex coins to claim ROI' });
    }

    const rate = Number(currentRoi.rate);
    const roiAmount = parseFloat(((apexCoins * rate) / 100).toFixed(2));

    await user.update({
      apexCoins: parseFloat((apexCoins + roiAmount).toFixed(2))
    });

    res.status(200).json({ message: 'ROI claimed', roiAmount, apexCoins: user.apexCoins });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { setRoi, getRoi, claimRoi };
