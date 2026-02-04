const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const { 
  setApexCoinRate, 
  getApexCoinRate, 
  getAllApexCoinRates 
} = require('../Controller/apexCoinRate.controller');

// Admin: Set apex coin rate
router.post('/setRate', protect, isAdmin, setApexCoinRate);

// Public: Get current active apex coin rate
router.get('/currentRate', getApexCoinRate);

// Admin: Get all apex coin rates (history)
router.get('/allRates', protect, isAdmin, getAllApexCoinRates);

module.exports = router;
