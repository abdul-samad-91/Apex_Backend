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

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    // Sequelize validation errors
    if (err.name === 'SequelizeValidationError') {
        const messages = err.errors.map(e => e.message);
        return res.status(400).json({
            message: 'Validation Error',
            errors: messages
        });
    }

    // Sequelize unique constraint errors
    if (err.name === 'SequelizeUniqueConstraintError') {
        const field = err.errors[0]?.path || 'field';
        return res.status(400).json({
            message: `Duplicate ${field}. This value already exists.`
        });
    }

    // Sequelize foreign key constraint errors
    if (err.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
            message: 'Foreign key constraint error. Referenced record does not exist.'
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            message: 'Token expired'
        });
    }

    res.status(500).json({
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
};

module.exports = {
    validateUserRegistration,
    validateUserUpdate,
    validatePasswordUpdate,
    errorHandler,
    requestLogger
};
