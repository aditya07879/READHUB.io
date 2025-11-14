const mongoose = require('mongoose');

module.exports = async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }
 
  return mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
};