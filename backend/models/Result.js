const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional for guest checkouts
  },
  subject: {
    type: String,
    required: true
  },
  board: {
    type: String,
    required: true
  },
  processedFilesCount: {
    type: Number,
    required: true
  },
  totalQuestionsExtracted: {
    type: Number,
    required: true
  },
  topicDistribution: {
    type: Map,
    of: Number
  },
  predictions: [{
    topic: String,
    count: Number,
    score: Number,
    importance: String,
    color: String
  }],
  repeatedQuestions: [{
    question: String,
    count: Number,
    variants: [String],
    topic: String
  }],
  studyPlan: [{
    day: String,
    topic: String,
    importance: String,
    duration: String,
    task: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Result', ResultSchema);
