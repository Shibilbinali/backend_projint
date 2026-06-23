require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const { validateAndMigrateDb } = require('./config/dbValidation');

// Route imports
const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const categoriesRoutes = require('./routes/categories');
const inventoryRoutes = require('./routes/inventory');
const customersRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const dashboardRoutes = require('./routes/dashboard');
const usersRoutes = require('./routes/users');
const settingsRoutes = require('./routes/settings');
const catalogAuditRoutes = require('./routes/catalogAudit');

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'https://frontend-projint.vercel.app',
];

if (process.env.FRONTEND_URL) {
  const normalizedUrl = process.env.FRONTEND_URL.replace(/\/$/, '');
  if (!allowedOrigins.includes(normalizedUrl)) {
    allowedOrigins.push(normalizedUrl);
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked request from origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const pool = require('./config/db');

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT 1 as val');
    res.json({
      status: 'ok',
      database: 'connected',
      server: 'running',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      server: 'running',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/catalog-audit', catalogAuditRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found.` });
});

// Global error handler (verified)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Bookstore POS API running on http://localhost:${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  await validateAndMigrateDb();
});

module.exports = app;
