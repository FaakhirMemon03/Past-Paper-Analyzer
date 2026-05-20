import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  UploadCloud, 
  FileText, 
  LayoutDashboard, 
  Users, 
  Settings, 
  Activity, 
  LogOut, 
  LogIn, 
  UserPlus, 
  ChevronRight, 
  Calendar, 
  TrendingUp, 
  CheckCircle2, 
  Trash2, 
  Lock, 
  Shield, 
  Download, 
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  X
} from 'lucide-react';

const API_BASE = '/api';

export default function App() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [activePage, setActivePage] = useState('dashboard'); // dashboard, results, history, login, register, admin-stats, admin-users, admin-papers, admin-weights, admin-logs
  const [authError, setAuthError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Dashboard Upload Inputs
  const [subject, setSubject] = useState('Maths');
  const [board, setBoard] = useState('Karachi Board');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Analysis & Loading
  const [isUploading, setIsUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [selectedReport, setSelectedReport] = useState(null);
  const [historyReports, setHistoryReports] = useState([]);
  
  // Admin Data
  const [adminStats, setAdminStats] = useState({ totalUsers: 0, totalPapers: 0, totalAnalyses: 0, activeUsersToday: 0 });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminPapers, setAdminPapers] = useState([]);
  const [adminSettings, setAdminSettings] = useState({ frequency: 0.7, recency: 0.3 });
  const [adminLogs, setAdminLogs] = useState([]);
  
  const fileInputRef = useRef(null);

  // Loading Steps for the Wow Screen
  const loadingSteps = [
    { title: "Uploading past papers...", tip: "Scanning and mapping file arrays..." },
    { title: "Running OCR & Extracting Text...", tip: "Processing scanned images and PDFs using machine vision..." },
    { title: "Segmenting questions & cleaning syntax...", tip: "Parsing exam structure and stripping formatting noise..." },
    { title: "Analyzing question similarity matrices...", tip: "Grouping matching semantic items using Cosine Similarity..." },
    { title: "Running topic classification model...", tip: "Categorizing question strings against syllabus vectors..." },
    { title: "Predicting trending exam topics...", tip: "Calculating Weighted Frequency and Recency algorithms..." },
    { title: "Compiling study plan...", tip: "Building custom day-by-day exam prep roadmap..." }
  ];

  // --- INITIAL CHECK & EFFECTS ---
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      fetchProfile(storedToken);
      fetchHistory(storedToken);
    }
  }, []);

  // Sync weights values when switching to admin settings page
  useEffect(() => {
    if (activePage.startsWith('admin-') && token) {
      fetchAdminData();
    }
  }, [activePage, token]);

  const showToast = (type, msg) => {
    if (type === 'error') {
      setAuthError(msg);
      setTimeout(() => setAuthError(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // --- API CALLS ---
  const fetchProfile = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        logout();
      }
    } catch (e) {
      console.error("Profile check failed, operating in offline/local state.");
    }
  };

  const fetchHistory = async (authToken) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/results`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setHistoryReports(data.results);
      }
    } catch (e) {
      console.error("History fetch failed.");
    }
  };

  const fetchAdminData = async () => {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      // Load based on active tab
      if (activePage === 'admin-stats' || activePage === 'admin-dashboard') {
        const statsRes = await fetch(`${API_BASE}/admin/stats`, { headers });
        const statsData = await statsRes.json();
        if (statsData.success) setAdminStats(statsData.stats);
      }
      
      if (activePage === 'admin-users') {
        const usersRes = await fetch(`${API_BASE}/admin/users`, { headers });
        const usersData = await usersRes.json();
        if (usersData.success) setAdminUsers(usersData.users);
      }
      
      if (activePage === 'admin-papers') {
        const papersRes = await fetch(`${API_BASE}/admin/papers`, { headers });
        const papersData = await papersRes.json();
        if (papersData.success) setAdminPapers(papersData.papers);
      }
      
      if (activePage === 'admin-weights') {
        const settingsRes = await fetch(`${API_BASE}/admin/settings`, { headers });
        const settingsData = await settingsRes.json();
        if (settingsData.success) setAdminSettings(settingsData.settings);
      }
      
      if (activePage === 'admin-logs') {
        const logsRes = await fetch(`${API_BASE}/admin/logs`, { headers });
        const logsData = await logsRes.json();
        if (logsData.success) setAdminLogs(logsData.logs);
      }
    } catch (e) {
      console.error("Admin fetch error:", e);
    }
  };

  // --- ACTIONS ---
  const handleLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('success', 'Logged in successfully!');
        fetchHistory(data.token);
        setActivePage('dashboard');
      } else {
        showToast('error', data.message);
      }
    } catch (error) {
      showToast('error', 'Server authentication offline.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const name = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('success', 'Account created successfully!');
        fetchHistory(data.token);
        setActivePage('dashboard');
      } else {
        showToast('error', data.message);
      }
    } catch (error) {
      showToast('error', 'Registration service offline.');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setHistoryReports([]);
    setSelectedReport(null);
    setActivePage('dashboard');
    showToast('success', 'Logged out safely.');
  };

  // --- FILE HANDLING & PRE-UPLOAD FILTERING ---
  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const processSelectedFiles = (filesList) => {
    const list = Array.from(filesList);
    // IGNORE ALL .md FILES COMPLETELY AND SILENTLY
    const filtered = list.filter(file => !file.name.toLowerCase().endsWith('.md'));
    
    setUploadedFiles(prev => {
      // Deduplicate files by name
      const existingNames = new Set(prev.map(f => f.name));
      const newFiles = filtered.filter(f => !existingNames.has(f.name));
      return [...prev, ...newFiles];
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const onFileSelect = (e) => {
    if (e.target.files) {
      processSelectedFiles(e.target.files);
    }
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --- UPLOAD AND RUN PIPELINE ---
  const handleAnalyze = async () => {
    if (uploadedFiles.length === 0) {
      showToast('error', 'Please upload at least one past paper.');
      return;
    }

    setIsUploading(true);
    setProcessingStep(0);

    // Multi-step animated progress flow simulation (Wow moment)
    const stepIntervals = [1800, 2400, 1800, 2000, 1800, 1500, 1000];
    
    const triggerStepIncrement = (stepIdx) => {
      if (stepIdx < loadingSteps.length) {
        setTimeout(() => {
          setProcessingStep(stepIdx + 1);
          triggerStepIncrement(stepIdx + 1);
        }, stepIntervals[stepIdx]);
      }
    };
    triggerStepIncrement(0);

    // Prepare multipart upload data
    const formData = new FormData();
    uploadedFiles.forEach(file => {
      // Again, enforce markdown rejection at build stage
      if (!file.name.toLowerCase().endsWith('.md')) {
        formData.append('files', file);
      }
    });
    formData.append('subject', subject);
    formData.append('board', board);

    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: headers,
        body: formData
      });

      const data = await res.json();
      
      if (data.success) {
        // Clear inputs
        setUploadedFiles([]);
        setSelectedReport(data.analysis);
        
        // Refresh histories if logged in
        if (token) {
          fetchHistory(token);
        }

        // Wait to finish the animation cycle or immediately skip to results
        setTimeout(() => {
          setIsUploading(false);
          setActivePage('results');
        }, 1500);
      } else {
        setIsUploading(false);
        showToast('error', data.message);
      }
    } catch (e) {
      setIsUploading(false);
      showToast('error', 'Error connecting to analysis engine. Check backend server.');
    }
  };

  // --- ADMIN ACTIONS ---
  const toggleUserActive = async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'User status updated!');
        fetchAdminData();
      } else {
        showToast('error', data.message);
      }
    } catch (err) {
      showToast('error', 'Action failed');
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to permanently delete this user?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'User deleted successfully.');
        fetchAdminData();
      } else {
        showToast('error', data.message);
      }
    } catch (err) {
      showToast('error', 'Delete failed');
    }
  };

  const deletePaper = async (paperId) => {
    if (!window.confirm("Are you sure you want to delete this uploaded paper from storage?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/papers/${paperId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Paper deleted.');
        fetchAdminData();
      } else {
        showToast('error', data.message);
      }
    } catch (err) {
      showToast('error', 'Action failed');
    }
  };

  const saveWeights = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          frequency: adminSettings.frequency,
          recency: adminSettings.recency
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Prediction weights saved.');
      } else {
        showToast('error', data.message);
      }
    } catch (err) {
      showToast('error', 'Settings save failed.');
    }
  };

  const handleWeightSlider = (val) => {
    const freq = parseFloat(val);
    const rec = parseFloat((1.0 - freq).toFixed(2));
    setAdminSettings({ frequency: freq, recency: rec });
  };

  const printReport = () => {
    window.print();
  };

  // --- SUB-COMPONENTS (RENDER BLOCKS) ---

  // Side Navigation Menu
  const renderSidebar = () => (
    <aside className="sidebar no-print">
      <div className="logo-container">
        <BookOpen size={30} className="logo-icon" style={{color: 'var(--primary)'}} />
        <span className="logo-text">PastPaperAI</span>
      </div>
      
      <ul className="nav-links">
        <li>
          <div 
            onClick={() => setActivePage('dashboard')} 
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
          >
            <UploadCloud size={20} />
            <span>Upload & Analyze</span>
          </div>
        </li>
        {user && (
          <li>
            <div 
              onClick={() => { setActivePage('history'); fetchHistory(token); }} 
              className={`nav-item ${activePage === 'history' ? 'active' : ''}`}
            >
              <FileText size={20} />
              <span>Analysis History</span>
            </div>
          </li>
        )}
        
        {/* Admin Navigation Section */}
        {user && user.role === 'admin' && (
          <>
            <div style={{margin: '1.5rem 0 0.5rem 1rem', fontSize: '0.75rem', color: '#4B5563', fontWeight: 'bold', textTransform: 'uppercase'}}>Admin Panel</div>
            <li>
              <div 
                onClick={() => setActivePage('admin-stats')} 
                className={`nav-item ${activePage === 'admin-stats' ? 'active' : ''}`}
              >
                <LayoutDashboard size={18} />
                <span>Overview Stats</span>
              </div>
            </li>
            <li>
              <div 
                onClick={() => setActivePage('admin-users')} 
                className={`nav-item ${activePage === 'admin-users' ? 'active' : ''}`}
              >
                <Users size={18} />
                <span>Manage Users</span>
              </div>
            </li>
            <li>
              <div 
                onClick={() => setActivePage('admin-papers')} 
                className={`nav-item ${activePage === 'admin-papers' ? 'active' : ''}`}
              >
                <FileText size={18} />
                <span>Manage Papers</span>
              </div>
            </li>
            <li>
              <div 
                onClick={() => setActivePage('admin-weights')} 
                className={`nav-item ${activePage === 'admin-weights' ? 'active' : ''}`}
              >
                <Settings size={18} />
                <span>Prediction Calibration</span>
              </div>
            </li>
            <li>
              <div 
                onClick={() => setActivePage('admin-logs')} 
                className={`nav-item ${activePage === 'admin-logs' ? 'active' : ''}`}
              >
                <Activity size={18} />
                <span>System Logs</span>
              </div>
            </li>
          </>
        )}
      </ul>

      {/* User Session Widget at Bottom */}
      <div style={{marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)'}}>
        {user ? (
          <div>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem'}}>
              <div style={{width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'}}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{overflow: 'hidden'}}>
                <div style={{fontSize: '0.85rem', fontWeight: '600', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{user.name}</div>
                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{user.email}</div>
              </div>
            </div>
            <button onClick={logout} className="btn btn-outline" style={{width: '100%', padding: '0.5rem', fontSize: '0.85rem'}}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <button onClick={() => setActivePage('login')} className="btn btn-primary" style={{width: '100%', fontSize: '0.85rem', padding: '0.5rem'}}>
              <LogIn size={16} /> Sign In
            </button>
            <button onClick={() => setActivePage('register')} className="btn btn-outline" style={{width: '100%', fontSize: '0.85rem', padding: '0.5rem'}}>
              <UserPlus size={16} /> Register
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  // Custom SVG Bar Chart (Interactive, glowing, and lightweight)
  const renderSVGChart = (predictions) => {
    if (!predictions || predictions.length === 0) return null;
    
    const chartHeight = 220;
    const chartWidth = 500;
    const paddingLeft = 140;
    const paddingRight = 40;
    const paddingTop = 20;
    const paddingBottom = 20;
    
    const maxVal = Math.max(...predictions.map(p => p.count)) || 1;
    const barAreaWidth = chartWidth - paddingLeft - paddingRight;
    const rowHeight = (chartHeight - paddingTop - paddingBottom) / predictions.length;
    
    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="topic-chart" style={{width: '100%', height: 'auto', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', padding: '10px'}}>
        {/* Draw rows */}
        {predictions.map((p, idx) => {
          const y = paddingTop + (idx * rowHeight) + (rowHeight / 4);
          const barWidth = (p.count / maxVal) * barAreaWidth;
          const barFill = p.importance === 'HIGH' ? 'url(#highGrad)' : p.importance === 'MEDIUM' ? 'url(#medGrad)' : 'url(#lowGrad)';
          
          return (
            <g key={idx} style={{transition: 'all 0.5s ease'}}>
              <defs>
                <linearGradient id="highGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#B91C1C" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="medGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#D97706" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="lowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#047857" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              
              {/* Topic Label */}
              <text 
                x={paddingLeft - 15} 
                y={y + (rowHeight / 4) + 2} 
                fill="var(--text-muted)" 
                fontSize="11" 
                textAnchor="end"
                fontWeight="500"
              >
                {p.topic}
              </text>
              
              {/* Back Track */}
              <rect 
                x={paddingLeft} 
                y={y} 
                width={barAreaWidth} 
                height={rowHeight / 2} 
                fill="rgba(255,255,255,0.03)" 
                rx="4"
              />
              
              {/* Bar Fill */}
              <rect 
                x={paddingLeft} 
                y={y} 
                width={barWidth} 
                height={rowHeight / 2} 
                fill={barFill} 
                rx="4"
              />
              
              {/* Value Text */}
              <text 
                x={paddingLeft + barWidth + 8} 
                y={y + (rowHeight / 4) + 3} 
                fill="#FFF" 
                fontSize="10" 
                fontWeight="bold"
              >
                {p.count}x
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="app-container">
      {/* Toast Popups */}
      {authError && (
        <div style={{position: 'fixed', top: '20px', right: '20px', background: 'rgba(239, 68, 68, 0.95)', border: '1px solid #EF4444', color: '#FFF', padding: '1rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 9999, boxShadow: '0 10px 20px rgba(0,0,0,0.3)', animation: 'slideIn 0.2s ease'}}>
          <AlertCircle size={20} />
          <span>{authError}</span>
        </div>
      )}
      {successMsg && (
        <div style={{position: 'fixed', top: '20px', right: '20px', background: 'rgba(16, 185, 129, 0.95)', border: '1px solid #10B981', color: '#FFF', padding: '1rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 9999, boxShadow: '0 10px 20px rgba(0,0,0,0.3)', animation: 'slideIn 0.2s ease'}}>
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sidebar Layout */}
      {renderSidebar()}

      {/* Main Container */}
      <main className="main-content">
        
        {/* --- PAGE: LOADING/PROCESSING (Wow Moment) --- */}
        {isUploading && (
          <div className="processing-container">
            <div className="loader-ring"></div>
            
            <h2 style={{fontFamily: 'var(--font-heading)', fontSize: '2rem', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
              AI is Analyzing Past Papers...
            </h2>
            <p style={{color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '2.5rem'}}>
              Mapping question frequencies, trends, and extracting text models
            </p>

            {/* Glowing Step Checklist */}
            <div className="glass-card" style={{padding: '2rem', width: '100%', maxWidth: '500px', textAlign: 'left'}}>
              <h4 style={{marginBottom: '1rem', color: '#FFF', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem'}}>
                Analysis Stages
              </h4>
              <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                {loadingSteps.map((step, idx) => {
                  const isDone = processingStep > idx;
                  const isActive = processingStep === idx;
                  
                  return (
                    <div key={idx} style={{display: 'flex', alignItems: 'flex-start', gap: '0.75rem', opacity: isDone ? 1 : isActive ? 1 : 0.35, transition: 'opacity 0.3s ease'}}>
                      <div style={{marginTop: '2px'}}>
                        {isDone ? (
                          <CheckCircle2 size={18} style={{color: 'var(--accent)'}} />
                        ) : isActive ? (
                          <div className="pulsing-dot" style={{width: '18px', height: '18px', borderRadius: '50%', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><div style={{width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)'}}></div></div>
                        ) : (
                          <div style={{width: '18px', height: '18px', borderRadius: '50%', border: '2px solid var(--text-muted)'}}></div>
                        )}
                      </div>
                      <div>
                        <div style={{fontWeight: '600', fontSize: '0.95rem', color: isActive ? '#FFF' : isDone ? 'var(--text-muted)' : 'var(--text-muted)'}}>
                          {step.title}
                        </div>
                        {isActive && (
                          <div style={{fontSize: '0.8rem', color: 'var(--primary)', fontStyle: 'italic', marginTop: '0.2rem'}}>
                            {step.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: DASHBOARD (UPLOAD SCREEN) --- */}
        {!isUploading && activePage === 'dashboard' && (
          <div className="dashboard-view animate-fade">
            <header style={{marginBottom: '2.5rem'}}>
              <h1 style={{fontSize: '2.5rem', fontFamily: 'var(--font-heading)', fontWeight: '800', marginBottom: '0.5rem', background: 'linear-gradient(to right, #FFF, #9CA3AF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
                Past Paper Prediction Engine
              </h1>
              <p style={{color: 'var(--text-muted)', fontSize: '1.1rem'}}>
                Upload recent past papers to dissect syllabus patterns, frequent questions, and compile smart study roadmaps.
              </p>
            </header>

            <div style={{display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'flex-start'}}>
              {/* Upload Card */}
              <div className="glass-card" style={{padding: '2.5rem'}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem'}}>
                  <div className="input-group">
                    <label className="input-label">Select Subject</label>
                    <select 
                      value={subject} 
                      onChange={(e) => setSubject(e.target.value)} 
                      className="input-field"
                    >
                      <option value="Maths">Mathematics</option>
                      <option value="Physics">Physics</option>
                      <option value="Chemistry">Chemistry</option>
                      <option value="Biology">Biology</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Select Board</label>
                    <select 
                      value={board} 
                      onChange={(e) => setBoard(e.target.value)} 
                      className="input-field"
                    >
                      <option value="Karachi Board">Karachi Board (BIEK/BSEK)</option>
                      <option value="Punjab Board">Punjab Board (BISE)</option>
                      <option value="Federal Board">Federal Board (FBISE)</option>
                    </select>
                  </div>
                </div>

                {/* Drag and Drop Box */}
                <div 
                  className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={onFileSelect} 
                    multiple 
                    accept=".pdf, .docx, .doc, .txt, image/*" 
                    style={{display: 'none'}} 
                  />
                  <UploadCloud size={48} className="upload-icon" />
                  <h3 style={{marginBottom: '0.5rem'}}>Drag & drop past papers here</h3>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>
                    Supports PDF, DOCX, DOC, TXT, PNG, JPG (Max 20MB). Markdown (.md) files are skipped.
                  </p>
                </div>

                {/* Selected File list */}
                {uploadedFiles.length > 0 && (
                  <div className="file-list">
                    <h4 style={{fontSize: '0.9rem', color: '#FFF', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between'}}>
                      <span>Papers List ({uploadedFiles.length})</span>
                      <button onClick={() => setUploadedFiles([])} style={{background: 'none', border: 'none', color: '#EF4444', fontSize: '0.8rem', cursor: 'pointer'}}>Clear All</button>
                    </h4>
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="file-item">
                        <div className="file-info">
                          <CheckCircle2 size={16} className="file-success-tick" />
                          <span style={{fontSize: '0.9rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '300px'}}>{file.name}</span>
                        </div>
                        <button onClick={() => removeFile(idx)} style={{background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer'}}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  onClick={handleAnalyze} 
                  className="btn btn-primary" 
                  style={{width: '100%', marginTop: '2rem', height: '50px'}}
                >
                  Analyze Past Papers
                </button>
              </div>

              {/* Tips & Guides Column */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                <div className="glass-card" style={{padding: '1.5rem'}}>
                  <h3 style={{fontSize: '1.2rem', marginBottom: '0.75rem', color: '#FFF'}}>💡 Pakistani Exam Analyzer</h3>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5'}}>
                    Built to scan and cluster questions from boards like Karachi (BIEK), Punjab, and FBISE. Upload multiple years' papers to find the exact frequency of repeated questions and predicted high-yield topics.
                  </p>
                </div>
                <div className="glass-card" style={{padding: '1.5rem'}}>
                  <h3 style={{fontSize: '1.2rem', marginBottom: '0.75rem', color: '#FFF'}}>🔒 Authentication Benefit</h3>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem'}}>
                    Login or register to persist your reports history, view previous trends, and access unlimited document analysis records.
                  </p>
                  {!user && (
                    <div style={{display: 'flex', gap: '0.75rem'}}>
                      <button onClick={() => setActivePage('login')} className="btn btn-primary" style={{padding: '0.5rem 1rem', fontSize: '0.85rem'}}>Login</button>
                      <button onClick={() => setActivePage('register')} className="btn btn-outline" style={{padding: '0.5rem 1rem', fontSize: '0.85rem'}}>Register</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: RESULTS DASHBOARD (MAIN OUTPUT) --- */}
        {!isUploading && activePage === 'results' && selectedReport && (
          <div className="results-view animate-fade">
            <header className="no-print" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem'}}>
              <div>
                <button onClick={() => setActivePage('dashboard')} className="btn btn-outline" style={{padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: '1rem'}}>
                  <ArrowLeft size={16} /> Back to Upload
                </button>
                <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>
                  Analysis Report: {selectedReport.subject}
                </h1>
                <p style={{color: 'var(--text-muted)'}}>
                  Board: {selectedReport.board} | Extracted {selectedReport.totalQuestionsExtracted} questions from {selectedReport.processedFilesCount} papers
                </p>
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <button onClick={printReport} className="btn btn-primary">
                  <Download size={18} /> Download PDF Report
                </button>
              </div>
            </header>

            {/* Print Header */}
            <div className="print-only" style={{display: 'none', marginBottom: '2rem', textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem'}}>
              <h1 style={{fontSize: '24pt'}}>{selectedReport.subject} Past Paper Analysis</h1>
              <h3>Board: {selectedReport.board}</h3>
              <p>Generated by PastPaperAI System on {new Date(selectedReport.createdAt).toLocaleDateString()}</p>
            </div>

            {/* Results Grid */}
            <div className="results-grid">
              
              {/* 1. Important Topics Card */}
              <div className="glass-card">
                <div className="result-card-header">
                  <h3 style={{fontSize: '1.15rem'}}>🔥 Important Syllabus Topics</h3>
                  <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Weight-based Prediction</span>
                </div>
                <div className="result-card-body">
                  {selectedReport.predictions.length === 0 ? (
                    <div style={{color: 'var(--text-muted)', fontStyle: 'italic'}}>No topics classified.</div>
                  ) : (
                    selectedReport.predictions.map((p, idx) => (
                      <div key={idx} className="topic-row">
                        <div className="topic-row-header">
                          <span style={{fontWeight: '600', fontSize: '0.95rem'}}>{p.topic}</span>
                          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                            <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>{p.score}% weight</span>
                            <span className={`badge badge-${p.importance.toLowerCase()}`}>
                              {p.importance}
                            </span>
                          </div>
                        </div>
                        <div className="progress-track">
                          <div 
                            className="progress-bar" 
                            style={{
                              width: `${p.score}%`, 
                              background: p.importance === 'HIGH' ? 'var(--priority-high)' : p.importance === 'MEDIUM' ? 'var(--priority-medium)' : 'var(--priority-low)'
                            }}
                          ></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Custom animated Topic frequency chart */}
              <div className="glass-card">
                <div className="result-card-header">
                  <h3 style={{fontSize: '1.15rem'}}>📊 Topic Frequency Chart</h3>
                  <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Question Count</span>
                </div>
                <div className="result-card-body" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px'}}>
                  {renderSVGChart(selectedReport.predictions)}
                </div>
              </div>

              {/* 3. Repeated Questions Card */}
              <div className="glass-card" style={{gridColumn: '1 / -1'}}>
                <div className="result-card-header">
                  <h3 style={{fontSize: '1.15rem'}}>📌 Most Repeated Questions</h3>
                  <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Cluster Similarity Detection</span>
                </div>
                <div className="result-card-body" style={{padding: 0}}>
                  <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                    {selectedReport.repeatedQuestions.length === 0 ? (
                      <div style={{padding: '1.5rem', color: 'var(--text-muted)', fontStyle: 'italic'}}>No matching duplicate/similar questions identified. Try uploading more papers.</div>
                    ) : (
                      selectedReport.repeatedQuestions.map((q, idx) => (
                        <div key={idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', gap: '1.5rem'}}>
                          <div>
                            <p style={{fontSize: '0.95rem', fontWeight: '500', marginBottom: '0.25rem', color: '#FFF'}}>{q.question}</p>
                            <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Category: {q.topic}</span>
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0}}>
                            <span style={{background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'}}>
                              Repeated {q.count}x
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Automated Study Planner Timeline */}
              <div className="glass-card" style={{gridColumn: '1 / -1'}}>
                <div className="result-card-header">
                  <h3 style={{fontSize: '1.15rem'}}>📅 Customized Exam Preparation Planner</h3>
                  <span style={{fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'bold'}}>AUTO GENERATED</span>
                </div>
                <div className="result-card-body">
                  <div className="plan-timeline">
                    {selectedReport.studyPlan.map((item, idx) => (
                      <div key={idx} className="timeline-item">
                        <div className={`timeline-dot ${item.importance}`}></div>
                        <div className="timeline-content">
                          <div className="timeline-day">{item.day} — {item.duration}</div>
                          <h4 className="timeline-title">
                            {item.topic} 
                            <span className={`badge badge-${item.importance.toLowerCase()}`} style={{fontSize: '0.65rem'}}>
                              {item.importance} Priority
                            </span>
                          </h4>
                          <p className="timeline-text">{item.task}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* --- PAGE: ANALYSIS HISTORY (For Authenticated Users) --- */}
        {!isUploading && activePage === 'history' && (
          <div className="history-view animate-fade">
            <header style={{marginBottom: '2rem'}}>
              <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>Your Analysis History</h1>
              <p style={{color: 'var(--text-muted)'}}>Access reports of your uploaded files and check the predictions generated previously.</p>
            </header>

            {historyReports.length === 0 ? (
              <div className="glass-card" style={{padding: '3rem', textAlign: 'center'}}>
                <FileText size={48} style={{color: 'var(--text-muted)', marginBottom: '1rem'}} />
                <h3>No reports saved yet</h3>
                <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem'}}>Upload and analyze papers to start compiling your study logs.</p>
                <button onClick={() => setActivePage('dashboard')} className="btn btn-primary">Go to Dashboard</button>
              </div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem'}}>
                {historyReports.map((report) => (
                  <div 
                    key={report._id} 
                    className="glass-card" 
                    style={{padding: '1.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyBetween: 'space-between', gap: '1rem'}}
                    onClick={() => { setSelectedReport(report); setActivePage('results'); }}
                  >
                    <div>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
                        <h3 style={{fontSize: '1.25rem', color: '#FFF'}}>{report.subject}</h3>
                        <span style={{fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '4px', color: 'var(--text-muted)'}}>
                          {report.board}
                        </span>
                      </div>
                      <p style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>
                        Extracted {report.totalQuestionsExtracted} questions from {report.processedFilesCount} papers.
                      </p>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                      <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                      <span style={{color: 'var(--primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
                        View Report <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- PAGE: AUTH (LOGIN) --- */}
        {!isUploading && activePage === 'login' && (
          <div style={{display: 'flex', justifyContent: 'center', padding: '4rem 1rem'}}>
            <div className="glass-card" style={{width: '100%', maxWidth: '400px', padding: '2.5rem'}}>
              <h2 style={{fontSize: '1.75rem', fontFamily: 'var(--font-heading)', textAlign: 'center', marginBottom: '0.5rem'}}>Welcome Back</h2>
              <p style={{color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '2rem'}}>Sign in to save predictions to history</p>
              
              <form onSubmit={handleLogin}>
                <div className="input-group">
                  <label className="input-label">Email Address</label>
                  <input type="email" name="email" required className="input-field" placeholder="student@example.com" />
                </div>
                <div className="input-group" style={{marginBottom: '2rem'}}>
                  <label className="input-label">Password</label>
                  <input type="password" name="password" required className="input-field" placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary" style={{width: '100%', padding: '0.75rem'}}>Sign In</button>
              </form>
              <div style={{marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                New to PastPaperAI?{' '}
                <span onClick={() => setActivePage('register')} style={{color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold'}}>Create an account</span>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: AUTH (REGISTER) --- */}
        {!isUploading && activePage === 'register' && (
          <div style={{display: 'flex', justifyContent: 'center', padding: '4rem 1rem'}}>
            <div className="glass-card" style={{width: '100%', maxWidth: '400px', padding: '2.5rem'}}>
              <h2 style={{fontSize: '1.75rem', fontFamily: 'var(--font-heading)', textAlign: 'center', marginBottom: '0.5rem'}}>Create Account</h2>
              <p style={{color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '2rem'}}>Start tracking your study plans</p>
              
              <form onSubmit={handleRegister}>
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input type="text" name="username" required className="input-field" placeholder="Faakhir Memon" />
                </div>
                <div className="input-group">
                  <label className="input-label">Email Address</label>
                  <input type="email" name="email" required className="input-field" placeholder="student@example.com" />
                </div>
                <div className="input-group" style={{marginBottom: '2rem'}}>
                  <label className="input-label">Password</label>
                  <input type="password" name="password" required className="input-field" placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary" style={{width: '100%', padding: '0.75rem'}}>Create Account</button>
              </form>
              <div style={{marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                Already have an account?{' '}
                <span onClick={() => setActivePage('login')} style={{color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold'}}>Sign In</span>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: ADMIN OVERVIEW --- */}
        {!isUploading && activePage === 'admin-stats' && (
          <div className="admin-stats-view animate-fade">
            <header style={{marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>Admin Control Center</h1>
                <p style={{color: 'var(--text-muted)'}}>Overview metrics of system users, document uploads, and predictions load.</p>
              </div>
              <button onClick={fetchAdminData} className="btn btn-outline" style={{padding: '0.5rem'}}><RefreshCw size={16} /></button>
            </header>

            <div className="admin-stats-grid">
              <div className="glass-card stat-card">
                <div className="stat-icon"><Users size={24} /></div>
                <div>
                  <div className="stat-label">Total Registered Users</div>
                  <div className="stat-value">{adminStats.totalUsers}</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><FileText size={24} /></div>
                <div>
                  <div className="stat-label">Total Papers Uploaded</div>
                  <div className="stat-value">{adminStats.totalPapers}</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><Activity size={24} /></div>
                <div>
                  <div className="stat-label">Total AI Analyses Done</div>
                  <div className="stat-value">{adminStats.totalAnalyses}</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><CheckCircle2 size={24} style={{color: 'var(--accent)'}} /></div>
                <div>
                  <div className="stat-label">Active Logins Today</div>
                  <div className="stat-value">{adminStats.activeUsersToday}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="glass-card" style={{padding: '2rem'}}>
              <h3 style={{fontSize: '1.25rem', marginBottom: '1rem', color: '#FFF'}}>⚡ Immediate Actions</h3>
              <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                <button onClick={() => setActivePage('admin-users')} className="btn btn-outline">Manage User Accounts</button>
                <button onClick={() => setActivePage('admin-papers')} className="btn btn-outline">Browse Uploaded Papers</button>
                <button onClick={() => setActivePage('admin-weights')} className="btn btn-primary">Adjust AI Model Weights</button>
                <button onClick={() => setActivePage('admin-logs')} className="btn btn-outline">Inspect System Security Logs</button>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: ADMIN MANAGE USERS --- */}
        {!isUploading && activePage === 'admin-users' && (
          <div className="admin-users-view animate-fade">
            <header style={{marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>User Accounts Management</h1>
                <p style={{color: 'var(--text-muted)'}}>Review registrations, toggle active statuses, and delete accounts.</p>
              </div>
              <button onClick={fetchAdminData} className="btn btn-outline" style={{padding: '0.5rem'}}><RefreshCw size={16} /></button>
            </header>

            <div className="glass-card" style={{padding: '1.5rem'}}>
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Total Uploads</th>
                      <th>Created On</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => (
                      <tr key={u._id || u.id}>
                        <td><span style={{fontWeight: '600', color: '#FFF'}}>{u.name}</span></td>
                        <td>{u.email}</td>
                        <td>
                          <span style={{textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', color: u.role === 'admin' ? 'var(--primary)' : 'var(--text-muted)'}}>
                            {u.role}
                          </span>
                        </td>
                        <td>{u.uploadsCount || 0} files</td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge ${u.isActive ? 'badge-low' : 'badge-high'}`}>
                            {u.isActive ? 'ACTIVE' : 'BANNED'}
                          </span>
                        </td>
                        <td>
                          {u.role !== 'admin' && (
                            <div style={{display: 'flex', gap: '0.5rem'}}>
                              <button 
                                onClick={() => toggleUserActive(u._id || u.id)} 
                                className="btn btn-outline" 
                                style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: u.isActive ? 'var(--priority-high)' : 'var(--priority-low)', color: u.isActive ? 'var(--priority-high)' : 'var(--priority-low)'}}
                              >
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button 
                                onClick={() => deleteUser(u._id || u.id)} 
                                className="btn btn-outline" 
                                style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#EF4444', color: '#EF4444'}}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: ADMIN MANAGE PAPERS --- */}
        {!isUploading && activePage === 'admin-papers' && (
          <div className="admin-papers-view animate-fade">
            <header style={{marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>Uploaded Papers Manager</h1>
                <p style={{color: 'var(--text-muted)'}}>Scan file storage and delete spam or corrupt papers.</p>
              </div>
              <button onClick={fetchAdminData} className="btn btn-outline" style={{padding: '0.5rem'}}><RefreshCw size={16} /></button>
            </header>

            <div className="glass-card" style={{padding: '1.5rem'}}>
              {adminPapers.length === 0 ? (
                <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic'}}>No papers uploaded to storage yet.</div>
              ) : (
                <div className="table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Subject</th>
                        <th>Board</th>
                        <th>Uploaded By</th>
                        <th>Uploaded Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminPapers.map((paper) => (
                        <tr key={paper._id}>
                          <td style={{maxWidth: '300px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden'}}><span style={{fontWeight: '600', color: '#FFF'}}>{paper.fileName}</span></td>
                          <td>{paper.subject}</td>
                          <td>{paper.board}</td>
                          <td>{paper.uploadedBy ? paper.uploadedBy.name : <span style={{fontStyle: 'italic', color: 'var(--text-muted)'}}>Guest</span>}</td>
                          <td>{new Date(paper.uploadedAt).toLocaleDateString()}</td>
                          <td>
                            <button 
                              onClick={() => deletePaper(paper._id)} 
                              className="btn btn-outline" 
                              style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#EF4444', color: '#EF4444'}}
                            >
                              <Trash2 size={12} /> Delete File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PAGE: ADMIN CALIBRATE WEIGHTS --- */}
        {!isUploading && activePage === 'admin-weights' && (
          <div className="admin-weights-view animate-fade">
            <header style={{marginBottom: '2rem'}}>
              <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>AI Model Calibration</h1>
              <p style={{color: 'var(--text-muted)'}}>Calibrate prediction weights: Frequency Weight vs Recency Weight.</p>
            </header>

            <div style={{display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'flex-start'}}>
              <div className="glass-card" style={{padding: '2.5rem'}}>
                <form onSubmit={saveWeights}>
                  
                  {/* Frequency Slider */}
                  <div className="input-group" style={{marginBottom: '2rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
                      <label className="input-label" style={{fontWeight: 'bold'}}>Topic Frequency Weight</label>
                      <span style={{fontWeight: 'bold', color: 'var(--primary)'}}>{adminSettings.frequency}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="1.0" 
                      step="0.05"
                      value={adminSettings.frequency} 
                      onChange={(e) => handleWeightSlider(e.target.value)} 
                      style={{width: '100%', height: '6px', borderRadius: '5px', background: '#374151', outline: 'none'}} 
                    />
                    <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem'}}>
                      Determines how much weight the system places on how often a topic is tested overall.
                    </p>
                  </div>

                  {/* Recency Slider */}
                  <div className="input-group" style={{marginBottom: '2rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
                      <label className="input-label" style={{fontWeight: 'bold'}}>Topic Recency Weight</label>
                      <span style={{fontWeight: 'bold', color: 'var(--secondary)'}}>{adminSettings.recency}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="1.0" 
                      step="0.05"
                      value={adminSettings.recency} 
                      disabled
                      style={{width: '100%', height: '6px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', cursor: 'not-allowed', outline: 'none'}} 
                    />
                    <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem'}}>
                      Automatically balances as the inverse of Frequency Weight (Sum equals 1.0). Controls emphasis on topics from recent exam papers.
                    </p>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Save Calibration Configuration</button>
                </form>
              </div>

              <div className="glass-card" style={{padding: '1.5rem'}}>
                <h3 style={{fontSize: '1.15rem', marginBottom: '0.75rem', color: '#FFF'}}>📊 Weight Logic</h3>
                <p style={{color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: '1.5', marginBottom: '1rem'}}>
                  The final prediction rating score for any topic is determined by:
                </p>
                <div style={{background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem', border: '1px solid var(--border-color)', color: '#10B981', marginBottom: '1rem'}}>
                  Score = (FrequencyRatio × {adminSettings.frequency}) + (RecencyRatio × {adminSettings.recency})
                </div>
                <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4'}}>
                  Setting a higher frequency weight gives priority to topics tested persistently across all years. A higher recency weight increases focus on topics that are appearing repeatedly in latest years or have been missing recently.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* --- PAGE: ADMIN LOGS --- */}
        {!isUploading && activePage === 'admin-logs' && (
          <div className="admin-logs-view animate-fade">
            <header style={{marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <h1 style={{fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: '800'}}>Security Audit Logs</h1>
                <p style={{color: 'var(--text-muted)'}}>View the last 100 system operations, logins, uploads, and deletions.</p>
              </div>
              <button onClick={fetchAdminData} className="btn btn-outline" style={{padding: '0.5rem'}}><RefreshCw size={16} /></button>
            </header>

            <div className="glass-card" style={{padding: '1.5rem'}}>
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Operation Action</th>
                      <th>User Account</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td style={{whiteSpace: 'nowrap'}}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <span style={{background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold'}}>
                            {log.action}
                          </span>
                        </td>
                        <td>{log.userEmail}</td>
                        <td>{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
