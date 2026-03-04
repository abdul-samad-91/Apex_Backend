    const express = require('express');
    require('dotenv').config();
    const cors = require('cors');
    const connectDB = require('./Config/DB');
    const userRoutes = require('./Routes/user.routes');
    const transactionRoutes = require('./Routes/transaction.routes');
    const gatewayRoutes = require('./Routes/gateway.routes');
    const roiRoutes = require('./Routes/roi.routes');
    const apexCoinRateRoutes = require('./Routes/apexCoinRate.routes');
    const withdrawalRoutes = require('./Routes/withdrawal.routes');
    const p2pTransferRoutes = require('./Routes/p2pTransfer.routes');
    const { 
        requestLogger, 
        errorHandler, 
        notFound 
    } = require('./Middleware/middleware');
    const path = require("path")


    const globalLogger = (req, res, next) => {
    console.log("✅ Middleware called");
    console.log(`📌 Method: ${req.method}`);
    console.log(`📌 URL: ${req.originalUrl}`);
    console.log(`📌 Time: ${new Date().toISOString()}`);
    console.log("----------------------------------");
    res.status(200).json("Middleware executed successfully");

};


    const app = express();
    const PORT = process.env.PORT || 5000;

    // Middleware
    app.use(globalLogger);
    app.use(cors({
        origin: ['http://localhost:5173'
            ,'https://apex-admin-gules.vercel.app'
        ],
        // origin: 'https://apex-admin-gules.vercel.app',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(requestLogger);
    app.use(express.static(path.join(__dirname ,"public")))

    connectDB();

    // Routes
    app.get('/', (req, res) => {
        // res.json({ message: 'Welcome to Apex Backend API' });
        res.sendFile(path.join(__dirname , "public" , "index.html"));
    });

    app.use('/api/users', userRoutes);
    app.use("/api/transactions", transactionRoutes);
    app.use('/api/gateways', gatewayRoutes);
    app.use('/api/roi', roiRoutes);
    app.use('/api/apexcoinRate', apexCoinRateRoutes);
    app.use('/api/withdrawals', withdrawalRoutes);
    app.use('/api/p2p', p2pTransferRoutes);

    // Error handling middleware (must be after routes)
    app.use(notFound);
    app.use(errorHandler);

    // Start server immediately
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);

    });