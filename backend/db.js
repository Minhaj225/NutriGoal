const mongoose = require('mongoose');

mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
let inFlight;

function connectDb(uri = process.env.MONGO_URI) {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!inFlight) {
    if (!uri) return Promise.reject(new Error('MONGO_URI is required'));
    inFlight = mongoose.connect(uri, { maxPoolSize: 5, minPoolSize: 0,
      serverSelectionTimeoutMS: 3000, socketTimeoutMS: 5000 })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

module.exports = { connectDb };
