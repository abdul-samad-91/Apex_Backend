const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const { createGateway, getGateways } = require('../Controller/gateway.controller');
const upload = require('../Middleware/upload.middleware');


// Admin creates a gateway
router.post('/gateway', protect, isAdmin, protect, upload.single('accountImage'), createGateway);

// Public: list gateways
router.get('/getAllGateways', getGateways);

module.exports = router;
