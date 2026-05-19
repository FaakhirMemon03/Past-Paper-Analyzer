const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true
  },
  board: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Paper', PaperSchema);
