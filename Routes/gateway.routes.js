const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const { createGateway, getGateways, deleteGateway } = require('../Controller/gateway.controller');
const upload = require('../Middleware/upload.middleware');


// Admin creates a gateway
router.post('/gateway', protect, isAdmin, upload.single('image'), createGateway);

// Public: list gateways
router.get('/getAllGateways', getGateways);

// Admin deletes a gateway
router.delete('/gateway/:id', protect, isAdmin, deleteGateway);

module.exports = router;
