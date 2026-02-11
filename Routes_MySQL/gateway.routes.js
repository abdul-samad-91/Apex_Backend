const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware_MySQL/authorization.middleware');
const { createGateway, getGateways, deleteGateway } = require('../Controller_MySQL/gateway.controller');
const upload = require('../Middleware_MySQL/upload.middleware');

// Admin creates a gateway
router.post('/gateway', protect, isAdmin, upload.single('image'), createGateway);

// Public: list gateways
router.get('/getAllGateways', getGateways);

// Admin deletes a gateway
router.delete('/gateway/:id', protect, isAdmin, deleteGateway);

module.exports = router;
