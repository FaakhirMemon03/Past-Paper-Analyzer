const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'global_settings',
    unique: true
  },
  frequencyWeight: {
    type: Number,
    default: 0.7
  },
  recencyWeight: {
    type: Number,
    default: 0.3
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Settings', SettingsSchema);
