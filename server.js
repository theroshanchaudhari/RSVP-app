'use strict';

// Load environment variables if .env exists
try {
  const dotenv = require('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed; env vars must be set externally
}

const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const { initDB } = require('./config/database');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { sendDailySummary } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data dir exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Initialize database
initDB();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session store
app.use(session({
  store: new MemoryStore({ checkPeriod: 86400000 }),
  secret: process.env.SESSION_SECRET || 'rsvp-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Routes
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  const { getEvent } = require('./models/queries');
  const event = getEvent(1);
  res.status(404).render('error', { event, message: 'Page not found (404).' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  const { getEvent } = require('./models/queries');
  let event;
  try { event = getEvent(1); } catch (_) { event = { name: 'RSVP App' }; }
  res.status(500).render('error', { event, message: 'An unexpected error occurred.' });
});

// Daily summary cron (8 AM every day)
cron.schedule('0 8 * * *', () => {
  sendDailySummary().catch(console.error);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ RSVP App running at http://localhost:${PORT}`);
    console.log(`   Admin panel: http://localhost:${PORT}/admin`);
    console.log(`   Default admin: ${process.env.ADMIN_EMAIL || 'admin@example.com'} / ${process.env.ADMIN_PASSWORD || 'changeme123'}`);
  });
}

module.exports = app;
