    const express = require('express');
    const connectDB = require('./Config/DB');
    const userRoutes = require('./Routes/user.routes');
    const { 
        requestLogger, 
        errorHandler, 
        notFound 
    } = require('./Middleware/middleware');
    const path = require("path")

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Middleware
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

    // Error handling middleware (must be after routes)
    app.use(notFound);
    app.use(errorHandler);

    // Start server immediately
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);

    });