// Validation middleware for user registration
const validateUserRegistration = (req, res, next) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ 
            message: 'Name, email, and password are required' 
        });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ 
            message: 'Please provide a valid email address' 
        });
    }

    // Password length validation
    if (password.length < 6) {
        return res.status(400).json({ 
            message: 'Password must be at least 6 characters long' 
        });
    }

    next();
};

// Validation middleware for user update
const validateUserUpdate = (req, res, next) => {
    const { email } = req.body;

    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Please provide a valid email address' 
            });
        }
    }

    next();
};

// Validation middleware for password update
const validatePasswordUpdate = (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
            message: 'Current password and new password are required' 
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ 
            message: 'New password must be at least 6 characters long' 
        });
    }

    next();
};

// MongoDB ObjectId validation middleware
const validateObjectId = (req, res, next) => {
    const { id } = req.params;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;

    if (!objectIdRegex.test(id)) {
        return res.status(400).json({ 
            message: 'Invalid user ID format' 
        });
    }

    next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Not found middleware
const notFound = (req, res, next) => {
    res.status(404).json({ 
        message: `Route ${req.originalUrl} not found` 
    });
};

module.exports = {
    validateUserRegistration,
    validateUserUpdate,
    validatePasswordUpdate,
    validateObjectId,
    requestLogger,
    errorHandler,
    notFound
};
