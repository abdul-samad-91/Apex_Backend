require('dotenv').config();
const { Sequelize } = require('sequelize');

// Database connection configuration
// console.log('Database Configuration:');
// console.log('Host:', process.env.MYSQL_HOST);
// console.log('Database:', process.env.MYSQL_DATABASE);
// console.log('User:', process.env.MYSQL_USER);
// console.log('password:', process.env.MYSQL_PASSWORD);
// Note: Avoid logging sensitive information like passwords in production
const sequelize = new Sequelize(
    process.env.MYSQL_DATABASE || 'apex_db',
    process.env.MYSQL_USER || 'root',
    process.env.MYSQL_PASSWORD || 'hanzalah@9940',
    {
        host: process.env.MYSQL_HOST || 'localhost',
        dialect: 'mysql'
    }
);

// Test connection and sync models
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to MySQL successfully');
        
        // Sync all models (in production, use migrations instead)
        if (process.env.NODE_ENV !== 'production') {
            console.log('Database synchronized');
        }
    } catch (error) {
        // console.error('MySQL connection error:', error);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };