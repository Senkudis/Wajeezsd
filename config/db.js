const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(
            'mongodb+srv://diaakardmash_db_user:t575rwL8lfCvGxRT@wassili-db.ty4o3dv.mongodb.net/?appName=wassili-db'
        );
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
