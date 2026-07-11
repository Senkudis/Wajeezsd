const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri || !uri.trim()) {
        logger.error('FATAL: MONGO_URI is required but not set in environment variables');
        throw new Error('MONGO_URI is required');
    }

    try {
        const conn = await mongoose.connect(uri);
        logger.info('MongoDB Connected');
        return conn;
    } catch (error) {
        logger.error({ err: error }, 'MongoDB connection failed');
        process.exit(1);
    }
};

module.exports = connectDB;
