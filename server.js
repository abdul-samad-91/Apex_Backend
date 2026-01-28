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
app.use(express.static(path.join(__dirname ,"Public")))

// Routes
app.get('/', (req, res) => {
    // res.json({ message: 'Welcome to Apex Backend API' });
    res.sendFile(path.join(__dirname , "Public" , "index.html"));
});

app.use('/api/users', userRoutes);

// Error handling middleware (must be after routes)
app.use(notFound);
app.use(errorHandler);

// Connect to MongoDB and start server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});
