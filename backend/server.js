const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwttokenkey';
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001/analyze';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads and data directories exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Database connection
const db = require('./db');
db.connectDB().then(() => {
  seedAdmin();
});

// Import schemas (for mongoose mode)
const User = require('./models/User');
const Paper = require('./models/Paper');
const Result = require('./models/Result');
const Settings = require('./models/Settings');
const Log = require('./models/Log');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Multer File Filter: Skip .md files silently without throwing errors
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.md') {
    console.log(`[BACKEND] Multer skipped .md file silently: ${file.originalname}`);
    return cb(null, false); // false tells Multer to skip this file silently
  }
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// --- HELPER: SYSTEM AUDIT LOGGER ---
const logSystemAction = async (action, userEmail, details) => {
  const logMsg = `[LOG] ${new Date().toISOString()} | ${action} | ${userEmail} | ${details}`;
  console.log(logMsg);
  
  if (db.isConnected()) {
    try {
      await Log.create({ action, userEmail, details });
    } catch (e) {
      console.error('Failed to log to MongoDB:', e);
    }
  } else {
    db.fallbackDb.logs.push({
      action,
      userEmail,
      details,
      timestamp: new Date()
    });
  }
};

// --- HELPER: SEED DEFAULT ADMIN ---
async function seedAdmin() {
  const adminEmail = 'PP@admin.com';
  const adminPass = 'PP@access.com';
  const hashedPassword = await bcrypt.hash(adminPass, 10);

  if (db.isConnected()) {
    try {
      const existingAdmin = await User.findOne({ email: adminEmail });
      if (!existingAdmin) {
        await User.create({
          name: 'System Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
          isActive: true
        });
        console.log('Seeded default Admin to MongoDB: PP@admin.com');
      }
    } catch (e) {
      console.error('Failed to seed admin in MongoDB:', e);
    }
  } else {
    // Check in-memory DB
    const existingAdmin = db.fallbackDb.users.find(u => u.email === adminEmail);
    if (!existingAdmin) {
      db.fallbackDb.users.push({
        _id: 'admin-fallback-id',
        name: 'System Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        uploadsCount: 0,
        isActive: true,
        createdAt: new Date()
      });
      console.log('Seeded default Admin to Fallback Memory: PP@admin.com');
    }
  }
}

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>
  
  if (!token) {
    req.user = null; // Let them act as guests
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  } );
};

// Admin Guard
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// --- ROUTES ---

// 1. AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    if (db.isConnected()) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      const user = await User.create({ name, email, password: hashedPassword });
      await logSystemAction('USER_REGISTER', email, 'Registered successfully');
      
      const token = jwt.sign({ id: user._id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } else {
      // In-Memory Fallback
      const existingUser = db.fallbackDb.users.find(u => u.email === email);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      const newUser = {
        _id: 'user-' + Date.now(),
        name,
        email,
        password: hashedPassword,
        role: 'user',
        uploadsCount: 0,
        isActive: true,
        createdAt: new Date()
      };
      db.fallbackDb.users.push(newUser);
      await logSystemAction('USER_REGISTER', email, 'Registered in fallback memory');

      const token = jwt.sign({ id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role } });
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    let user;
    if (db.isConnected()) {
      user = await User.findOne({ email });
    } else {
      user = db.fallbackDb.users.find(u => u.email === email);
    }

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    await logSystemAction('USER_LOGIN', email, 'Logged in successfully');

    const token = jwt.sign({ id: user._id || user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: {
        id: user._id || user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  
  try {
    let user;
    if (db.isConnected()) {
      user = await User.findById(req.user.id).select('-password');
    } else {
      user = db.fallbackDb.users.find(u => u._id === req.user.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 2. FILE UPLOADS AND AI ANALYSIS RUN
app.post('/api/upload', authenticateToken, upload.array('files'), async (req, res) => {
  const files = req.files;
  const { subject, board } = req.body;

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, message: 'Please upload at least one valid file (PDF or image). Note that Markdown (.md) files are skipped.' });
  }

  if (!subject || !board) {
    return res.status(400).json({ success: false, message: 'Subject and Board are required parameters' });
  }

  const userEmail = req.user ? req.user.email : 'Guest';
  const userId = req.user ? req.user.id : null;

  console.log(`[BACKEND] User "${userEmail}" is uploading ${files.length} papers for Subject: ${subject}, Board: ${board}`);

  // Fetch prediction settings (weights)
  let weights = { frequency: 0.7, recency: 0.3 };
  if (db.isConnected()) {
    try {
      const dbSettings = await Settings.findOne({ key: 'global_settings' });
      if (dbSettings) {
        weights.frequency = dbSettings.frequencyWeight;
        weights.recency = dbSettings.recencyWeight;
      }
    } catch (e) {
      console.error('Failed to load weights from MongoDB, using defaults:', e);
    }
  } else {
    weights.frequency = db.fallbackDb.settings.frequency;
    weights.recency = db.fallbackDb.settings.recency;
  }

  // Get absolute paths to pass to Python Engine
  // Rule: skip any analysis on questions derived from .md files. 
  // We've already filtered out .md files in multer fileFilter, but we double-check here.
  const validFilePaths = files
    .filter(file => !file.originalname.toLowerCase().endsWith('.md'))
    .map(file => path.resolve(file.path));

  if (validFilePaths.length === 0) {
    return res.status(400).json({ success: false, message: 'No valid non-markdown files uploaded.' });
  }

  // Save Paper Records in DB
  const paperRecords = [];
  for (const file of files) {
    const absolutePath = path.resolve(file.path);
    if (db.isConnected()) {
      try {
        const paper = await Paper.create({
          subject,
          board,
          fileName: file.originalname,
          filePath: absolutePath,
          uploadedBy: userId
        });
        paperRecords.push(paper);
      } catch (err) {
        console.error('Failed to save paper record:', err);
      }
    } else {
      const fallbackPaper = {
        _id: 'paper-' + Date.now() + '-' + Math.random(),
        subject,
        board,
        fileName: file.originalname,
        filePath: absolutePath,
        uploadedBy: userId,
        uploadedAt: new Date()
      };
      db.fallbackDb.papers.push(fallbackPaper);
      paperRecords.push(fallbackPaper);
    }
  }

  // Increment uploads count for authenticated users
  if (userId) {
    if (db.isConnected()) {
      try {
        await User.findByIdAndUpdate(userId, { $inc: { uploadsCount: files.length } });
      } catch (err) {
        console.error('Failed to update uploads count:', err);
      }
    } else {
      const u = db.fallbackDb.users.find(u => u._id === userId);
      if (u) {
        u.uploadsCount = (u.uploadsCount || 0) + files.length;
      }
    }
  }

  await logSystemAction('PAPER_UPLOAD', userEmail, `Uploaded ${files.length} papers for ${subject} (${board})`);

  // Call Python Service or fallback to simulated analysis
  try {
    console.log(`[BACKEND] Sending paths to Python AI Service: ${PYTHON_SERVICE_URL}`);
    const aiResponse = await axios.post(PYTHON_SERVICE_URL, {
      file_paths: validFilePaths,
      subject: subject,
      board: board,
      weights: weights
    });

    const aiData = aiResponse.data;

    // Save Results to DB
    let resultRecord;
    if (db.isConnected()) {
      resultRecord = await Result.create({
        user: userId,
        subject,
        board,
        processedFilesCount: aiData.processed_files_count,
        totalQuestionsExtracted: aiData.total_questions_extracted,
        topicDistribution: aiData.topic_distribution,
        predictions: aiData.predictions,
        repeatedQuestions: aiData.repeated_questions,
        studyPlan: aiData.study_plan
      });
    } else {
      resultRecord = {
        _id: 'res-' + Date.now(),
        user: userId,
        subject,
        board,
        processedFilesCount: aiData.processed_files_count,
        totalQuestionsExtracted: aiData.total_questions_extracted,
        topicDistribution: aiData.topic_distribution,
        predictions: aiData.predictions,
        repeatedQuestions: aiData.repeated_questions,
        studyPlan: aiData.study_plan,
        createdAt: new Date()
      };
      db.fallbackDb.results.push(resultRecord);
    }

    await logSystemAction('ANALYSIS_RUN', userEmail, `Successfully analyzed paper set. Result ID: ${resultRecord._id}`);

    return res.json({
      success: true,
      resultId: resultRecord._id,
      analysis: resultRecord
    });

  } catch (error) {
    console.warn(`\n⚠️  Python AI Engine error or offline: ${error.message}`);
    console.warn('Backend generating an intelligent mocked report for demonstration...\n');

    // MOCKED REPORT GENERATOR (so app is immediately interactive without Python engine)
    const topicDist = {};
    let predictions = [];
    let repeated = [];
    let studyPlan = [];

    // Craft Mock data depending on the subject
    const subLower = subject.toLowerCase();
    if (subLower.includes('math')) {
      topicDist = { "Algebra": 14, "Trigonometry": 9, "Geometry": 5, "Calculus": 2, "Statistics & Probability": 8 };
      predictions = [
        { topic: "Algebra", count: 14, score: 78.5, importance: "HIGH", color: "🔴" },
        { topic: "Trigonometry", count: 9, score: 62.1, importance: "HIGH", color: "🔴" },
        { topic: "Statistics & Probability", count: 8, score: 54.3, importance: "MEDIUM", color: "🟡" },
        { topic: "Geometry", count: 5, score: 38.0, importance: "MEDIUM", color: "🟡" },
        { topic: "Calculus", count: 2, score: 12.5, importance: "LOW", color: "🟢" }
      ];
      repeated = [
        { question: "Solve the quadratic equation x^2 - 5x + 6 = 0.", count: 5, topic: "Algebra" },
        { question: "Prove that sin^2(θ) + cos^2(θ) = 1.", count: 4, topic: "Trigonometry" },
        { question: "Find the inverse of the matrix A = [[2, 1], [1, 3]].", count: 3, topic: "Algebra" },
        { question: "Calculate the mean and standard deviation of the following frequency table.", count: 2, topic: "Statistics & Probability" }
      ];
      studyPlan = [
        { day: "Day 1 - 2", topic: "Algebra", importance: "HIGH", duration: "2 Days (Deep Dive)", task: "Study core concepts of Algebra, solve quadratic systems, cramer rule, and matrices." },
        { day: "Day 3 - 4", topic: "Trigonometry", importance: "HIGH", duration: "2 Days (Deep Dive)", task: "Revise trigonometric proofs, formulas for angles, heights & distances." },
        { day: "Day 5", topic: "Statistics & Probability", importance: "MEDIUM", duration: "1 Day (Review)", task: "Revise calculation of mean/std deviation, probability distributions." },
        { day: "Day 6", topic: "Geometry", importance: "MEDIUM", duration: "1 Day (Review)", task: "Review circle theorems, tangent lines, and area/volume definitions." }
      ];
    } else if (subLower.includes('physics')) {
      topicDist = { "Mechanics": 12, "Electricity & Magnetism": 10, "Waves & Optics": 7, "Thermodynamics": 4, "Atomic Physics": 3 };
      predictions = [
        { topic: "Mechanics", count: 12, score: 72.1, importance: "HIGH", color: "🔴" },
        { topic: "Electricity & Magnetism", count: 10, score: 65.4, importance: "HIGH", color: "🔴" },
        { topic: "Waves & Optics", count: 7, score: 48.2, importance: "MEDIUM", color: "🟡" },
        { topic: "Thermodynamics", count: 4, score: 28.1, importance: "MEDIUM", color: "🟡" },
        { topic: "Atomic Physics", count: 3, score: 18.0, importance: "LOW", color: "🟢" }
      ];
      repeated = [
        { question: "State Newton's Second Law of Motion and derive F = ma.", count: 6, topic: "Mechanics" },
        { question: "Explain the construction and working of a step-up Transformer.", count: 4, topic: "Electricity & Magnetism" },
        { question: "Define simple harmonic motion (SHM) and prove that the motion of a simple pendulum is SHM.", count: 3, topic: "Mechanics" },
        { question: "Derive the lens maker's formula 1/f = (n-1)(1/R1 - 1/R2).", count: 2, topic: "Waves & Optics" }
      ];
      studyPlan = [
        { day: "Day 1 - 2", topic: "Mechanics", importance: "HIGH", duration: "2 Days (Deep Dive)", task: "Focus on F=ma derivations, projectile motion equations, and laws of conservation." },
        { day: "Day 3 - 4", topic: "Electricity & Magnetism", importance: "HIGH", duration: "2 Days (Deep Dive)", task: "Practice transformer diagrams, Ohm's law circuits, and electromagnetic induction." },
        { day: "Day 5", topic: "Waves & Optics", importance: "MEDIUM", duration: "1 Day (Review)", task: "Solve refraction index problems and mirror/lens equations." },
        { day: "Day 6", topic: "Thermodynamics", importance: "MEDIUM", duration: "1 Day (Review)", task: "Review Carnot heat engine efficiency and laws of thermodynamics." }
      ];
    } else {
      // General Subject Fallback
      topicDist = { "Topic Alpha": 10, "Topic Beta": 7, "Topic Gamma": 3 };
      predictions = [
        { topic: "Topic Alpha", count: 10, score: 68.0, importance: "HIGH", color: "🔴" },
        { topic: "Topic Beta", count: 7, score: 49.0, importance: "MEDIUM", color: "🟡" },
        { topic: "Topic Gamma", count: 3, score: 21.0, importance: "LOW", color: "🟢" }
      ];
      repeated = [
        { question: "Describe the primary functions and components of Topic Alpha.", count: 4, topic: "Topic Alpha" },
        { question: "Differentiate between Topic Alpha and Topic Beta with examples.", count: 2, topic: "Topic Beta" }
      ];
      studyPlan = [
        { day: "Day 1 - 2", topic: "Topic Alpha", importance: "HIGH", duration: "2 Days (Deep Dive)", task: "Complete revision of Topic Alpha fundamentals and questions." },
        { day: "Day 3", topic: "Topic Beta", importance: "MEDIUM", duration: "1 Day (Review)", task: "Analyze sample questions and review notes for Topic Beta." }
      ];
    }

    let resultRecord;
    if (db.isConnected()) {
      resultRecord = await Result.create({
        user: userId,
        subject,
        board,
        processedFilesCount: files.length,
        totalQuestionsExtracted: files.length * 8, // simulated
        topicDistribution: topicDist,
        predictions: predictions,
        repeatedQuestions: repeated,
        studyPlan: studyPlan
      });
    } else {
      resultRecord = {
        _id: 'res-mock-' + Date.now(),
        user: userId,
        subject,
        board,
        processedFilesCount: files.length,
        totalQuestionsExtracted: files.length * 8,
        topicDistribution: topicDist,
        predictions: predictions,
        repeatedQuestions: repeated,
        studyPlan: studyPlan,
        createdAt: new Date()
      };
      db.fallbackDb.results.push(resultRecord);
    }

    await logSystemAction('ANALYSIS_RUN', userEmail, `Successfully generated simulated analysis. Result ID: ${resultRecord._id}`);

    return res.json({
      success: true,
      resultId: resultRecord._id,
      analysis: resultRecord,
      warning: "Running on simulated analysis (Python AI Engine offline)"
    });
  }
});

// 3. RETRIEVE ANALYSIS HISTORIES
app.get('/api/results', authenticateToken, async (req, res) => {
  const userId = req.user ? req.user.id : null;
  if (!userId) {
    return res.json({ success: true, results: [] }); // Guest users have no saved history
  }

  try {
    let results;
    if (db.isConnected()) {
      results = await Result.find({ user: userId }).sort({ createdAt: -1 });
    } else {
      results = db.fallbackDb.results
        .filter(r => r.user === userId)
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching results' });
  }
});

app.get('/api/results/:id', async (req, res) => {
  try {
    let result;
    if (db.isConnected()) {
      result = await Result.findById(req.params.id);
    } else {
      result = db.fallbackDb.results.find(r => r._id === req.params.id);
    }

    if (!result) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching report details' });
  }
});

// 4. ADMIN ROUTINGS
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let totalUsers, totalPapers, totalAnalyses, activeUsersToday;

    if (db.isConnected()) {
      totalUsers = await User.countDocuments();
      totalPapers = await Paper.countDocuments();
      totalAnalyses = await Result.countDocuments();
      
      // Active users today: we count users created today or who logged in today (simulation based on logs)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      activeUsersToday = await Log.distinct('userEmail', {
        action: 'USER_LOGIN',
        timestamp: { $gte: startOfDay }
      });
      activeUsersToday = activeUsersToday.length || 1; // Default min 1
    } else {
      totalUsers = db.fallbackDb.users.length;
      totalPapers = db.fallbackDb.papers.length;
      totalAnalyses = db.fallbackDb.results.length;
      activeUsersToday = db.fallbackDb.logs.filter(l => {
        const today = new Date();
        today.setHours(0,0,0,0);
        return l.action === 'USER_LOGIN' && l.timestamp >= today;
      }).length || 1;
    }

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPapers,
        totalAnalyses,
        activeUsersToday
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading stats' });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let usersList;
    if (db.isConnected()) {
      usersList = await User.find().select('-password').sort({ createdAt: -1 });
    } else {
      usersList = db.fallbackDb.users.map(({password, ...u}) => u);
    }
    res.json({ success: true, users: usersList });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading users' });
  }
});

app.post('/api/admin/users/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (db.isConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot deactivate admin' });
      
      user.isActive = !user.isActive;
      await user.save();
      await logSystemAction('ADMIN_USER_TOGGLE', req.user.email, `Toggled active state of user ${user.email} to ${user.isActive}`);
      return res.json({ success: true, user });
    } else {
      const user = db.fallbackDb.users.find(u => u._id === req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot deactivate admin' });

      user.isActive = !user.isActive;
      await logSystemAction('ADMIN_USER_TOGGLE', req.user.email, `Toggled active state of user ${user.email} to ${user.isActive} (memory)`);
      return res.json({ success: true, user });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (db.isConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin' });

      await User.findByIdAndDelete(req.params.id);
      await logSystemAction('ADMIN_USER_DELETE', req.user.email, `Deleted user: ${user.email}`);
      return res.json({ success: true, message: 'User deleted' });
    } else {
      const index = db.fallbackDb.users.findIndex(u => u._id === req.params.id);
      if (index === -1) return res.status(404).json({ success: false, message: 'User not found' });
      const user = db.fallbackDb.users[index];
      if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin' });

      db.fallbackDb.users.splice(index, 1);
      await logSystemAction('ADMIN_USER_DELETE', req.user.email, `Deleted user: ${user.email} (memory)`);
      return res.json({ success: true, message: 'User deleted' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/papers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let papersList;
    if (db.isConnected()) {
      papersList = await Paper.find().populate('uploadedBy', 'name email').sort({ uploadedAt: -1 });
    } else {
      papersList = db.fallbackDb.papers.map(p => {
        const u = db.fallbackDb.users.find(u => u._id === p.uploadedBy);
        return {
          ...p,
          uploadedBy: u ? { name: u.name, email: u.email } : null
        };
      });
    }
    res.json({ success: true, papers: papersList });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading papers' });
  }
});

app.delete('/api/admin/papers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let paperPath = '';
    if (db.isConnected()) {
      const paper = await Paper.findById(req.params.id);
      if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });
      paperPath = paper.filePath;
      await Paper.findByIdAndDelete(req.params.id);
    } else {
      const index = db.fallbackDb.papers.findIndex(p => p._id === req.params.id);
      if (index === -1) return res.status(404).json({ success: false, message: 'Paper not found' });
      paperPath = db.fallbackDb.papers[index].filePath;
      db.fallbackDb.papers.splice(index, 1);
    }

    // Attempt to delete file from disk
    if (paperPath && fs.existsSync(paperPath)) {
      try {
        fs.unlinkSync(paperPath);
      } catch (err) {
        console.error('Failed to delete file from disk:', err);
      }
    }

    await logSystemAction('ADMIN_PAPER_DELETE', req.user.email, `Deleted paper file: ${path.basename(paperPath)}`);
    res.json({ success: true, message: 'Paper deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting paper' });
  }
});

app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let settings = { frequency: 0.7, recency: 0.3 };
    if (db.isConnected()) {
      const s = await Settings.findOne({ key: 'global_settings' });
      if (s) {
        settings.frequency = s.frequencyWeight;
        settings.recency = s.recencyWeight;
      }
    } else {
      settings.frequency = db.fallbackDb.settings.frequency;
      settings.recency = db.fallbackDb.settings.recency;
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  const { frequency, recency } = req.body;
  if (frequency === undefined || recency === undefined) {
    return res.status(400).json({ success: false, message: 'Weights are required' });
  }

  try {
    if (db.isConnected()) {
      let s = await Settings.findOne({ key: 'global_settings' });
      if (!s) {
        s = new Settings({ key: 'global_settings' });
      }
      s.frequencyWeight = frequency;
      s.recencyWeight = recency;
      s.updatedAt = new Date();
      await s.save();
    } else {
      db.fallbackDb.settings.frequency = frequency;
      db.fallbackDb.settings.recency = recency;
    }

    await logSystemAction('ADMIN_SETTINGS_UPDATE', req.user.email, `Updated prediction weights: frequency=${frequency}, recency=${recency}`);
    res.json({ success: true, message: 'Prediction weights updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let logsList;
    if (db.isConnected()) {
      logsList = await Log.find().sort({ timestamp: -1 }).limit(100);
    } else {
      logsList = [...db.fallbackDb.logs]
        .sort((a,b) => b.timestamp - a.timestamp)
        .slice(0, 100);
    }
    res.json({ success: true, logs: logsList });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Backend Server running on port ${PORT}`);
  console.log(`API base URL: http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
