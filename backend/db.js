const mongoose = require('mongoose');

let isConnected = false;
let fallbackDb = {
  users: [],
  papers: [],
  results: [],
  settings: {
    frequency: 0.7,
    recency: 0.3
  },
  logs: []
};

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pastpaper_analyzer';
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    isConnected = true;
    console.log('=== MongoDB Connected Successfully ===');
  } catch (err) {
    console.warn('\n⚠️  WARNING: Could not connect to MongoDB.');
    console.warn('Running in Local In-Memory Mode. Data will not persist after server restarts.');
    console.warn(`Attempted URI: ${mongoURI}\n`);
    isConnected = false;
  }
};

module.exports = {
  connectDB,
  isConnected: () => isConnected,
  fallbackDb
};
