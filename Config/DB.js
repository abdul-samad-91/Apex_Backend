require('dotenv').config();
const { Sequelize } = require('sequelize');

// Database connection configuration
const sequelize = new Sequelize(
    process.env.MYSQL_DATABASE || 'apex_db',
    process.env.MYSQL_USER || 'root',
    process.env.MYSQL_PASSWORD || '',
    {
        host: process.env.MYSQL_HOST || 'localhost',
        port: process.env.MYSQL_PORT || 3306,
        dialect: 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: true, // Use snake_case for column names
            freezeTableName: true
        },
        timezone: '+00:00' // UTC timezone for consistency
    }
);

// Test connection and sync models
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to MySQL successfully');
        
        // Sync all models (in production, use migrations instead)
        if (process.env.NODE_ENV !== 'production') {
            await sequelize.sync({ alter: true });
            console.log('Database synchronized');
        }
    } catch (error) {
        console.error('MySQL connection error:', error);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };