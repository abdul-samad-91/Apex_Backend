/**
 * Apex Backend Server - MySQL Version
 * 
 * This server uses MySQL with Sequelize ORM instead of MongoDB.
 * 
 * To switch from MongoDB to MySQL:
 * 1. Replace server.js with server_mysql.js content OR
 * 2. Rename this file to server.js
 * 3. Update .env with MySQL connection details
 * 4. Run: npm install sequelize mysql2
 */

const express = require('express');
require('dotenv').config();
const cors = require('cors');

// MySQL Database Connection
const { connectMySQL } = require('./Config/MySQL_DB');

// MySQL Routes
const userRoutes = require('./Routes_MySQL/user.routes');
const transactionRoutes = require('./Routes_MySQL/transaction.routes');
const gatewayRoutes = require('./Routes_MySQL/gateway.routes');
const roiRoutes = require('./Routes_MySQL/roi.routes');
const apexCoinRateRoutes = require('./Routes_MySQL/apexCoinRate.routes');

// Middleware
const { 
    requestLogger, 
    errorHandler 
} = require('./Middleware_MySQL/middleware');
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://apex-admin-gules.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(express.static(path.join(__dirname, "public")));

// Connect to MySQL Database
connectMySQL();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use('/api/users', userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use('/api/gateways', gatewayRoutes);
app.use('/api/roi', roiRoutes);
app.use('/api/apexcoinRate', apexCoinRateRoutes);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware (must be after routes)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT} (MySQL)`);
});
