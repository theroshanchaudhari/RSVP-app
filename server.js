const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Admin credentials (hashed password for "admin123")
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'rsvp-app-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: isProd, httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
  })
);

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set in production');
}

// --- CSRF Protection (double-submit cookie) -----------------------------------

const CSRF_COOKIE = 'rsvp_csrf';
const CSRF_SECRET = process.env.CSRF_SECRET || 'rsvp-csrf-hmac-secret-2026';
if (isProd && !process.env.CSRF_SECRET) {
  throw new Error('CSRF_SECRET environment variable must be set in production');
}

function signCsrfToken(value) {
  return crypto.createHmac('sha256', CSRF_SECRET).update(value).digest('hex');
}

function generateCsrfToken(req, res) {
  const existing = req.cookies && req.cookies[CSRF_COOKIE];
  if (existing) {
    const [raw] = existing.split('.');
    if (raw && signCsrfToken(raw) === existing.split('.')[1]) {
      return raw;
    }
  }
  const raw = crypto.randomBytes(24).toString('hex');
  const signed = raw + '.' + signCsrfToken(raw);
  res.cookie(CSRF_COOKIE, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000,
  });
  return raw;
}

function verifyCsrfToken(req) {
  const cookieVal = req.cookies && req.cookies[CSRF_COOKIE];
  const formVal   = req.body && req.body._csrf;
  if (!cookieVal || !formVal) return false;
  const [raw, sig] = cookieVal.split('.');
  if (!raw || !sig) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signCsrfToken(raw)), Buffer.from(sig))) return false;
  return raw === formVal;
}

function csrfProtection(req, res, next) {
  if (!verifyCsrfToken(req)) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
}

// --- Rate Limiting -----------------------------------------------------------

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting globally
app.use('/admin', adminLimiter);
app.use('/invite', generalLimiter);
app.use('/rsvp', generalLimiter);

// Apply CSRF protection to all state-changing methods globally
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return csrfProtection(req, res, next);
  }
  next();
});

// --- Auth Middleware ----------------------------------------------------------

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// --- Home --------------------------------------------------------------------

app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

// --- Admin: Login ------------------------------------------------------------

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  const csrfToken = generateCsrfToken(req, res);
  res.render('admin/login', { error: null, csrfToken });
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  const csrfToken = generateCsrfToken(req, res);
  res.render('admin/login', { error: 'Invalid password. Please try again.', csrfToken });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// --- Admin: Dashboard --------------------------------------------------------

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  const guests = db.prepare('SELECT * FROM guests ORDER BY created_at DESC').all();
  const rsvpCount = db.prepare("SELECT COUNT(*) as count FROM rsvps WHERE attending = 'yes'").get();
  const totalRsvps = db.prepare('SELECT COUNT(*) as count FROM rsvps').get();
  const csrfToken = generateCsrfToken(req, res);

  res.render('admin/dashboard', {
    event,
    guests,
    rsvpCount: rsvpCount.count,
    totalRsvps: totalRsvps.count,
    successMessage: req.session.successMessage || null,
    errorMessage: req.session.errorMessage || null,
    csrfToken,
  });
  delete req.session.successMessage;
  delete req.session.errorMessage;
});

// --- Admin: Add Guest --------------------------------------------------------

app.post('/admin/guests/add', requireAdmin, (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    req.session.errorMessage = 'Name and email are required.';
    return res.redirect('/admin/dashboard');
  }
  try {
    db.prepare('INSERT INTO guests (name, email) VALUES (?, ?)').run(name.trim(), email.trim().toLowerCase());
    req.session.successMessage = `Guest "${name}" added successfully.`;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      req.session.errorMessage = `A guest with email "${email}" already exists.`;
    } else {
      req.session.errorMessage = 'Failed to add guest. Please try again.';
    }
  }
  res.redirect('/admin/dashboard');
});

// --- Admin: Delete Guest -----------------------------------------------------

app.post('/admin/guests/:id/delete', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM rsvps WHERE guest_id = ?').run(id);
  db.prepare('DELETE FROM guests WHERE id = ?').run(id);
  req.session.successMessage = 'Guest removed successfully.';
  res.redirect('/admin/dashboard');
});

// --- Admin: Send Invite -------------------------------------------------------
// Generates an invite token. In a real app this would email the link;
// here the link is displayed in the dashboard.

app.post('/admin/guests/:id/invite', requireAdmin, (req, res) => {
  const { id } = req.params;
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
  if (!guest) {
    req.session.errorMessage = 'Guest not found.';
    return res.redirect('/admin/dashboard');
  }

  const token = uuidv4();
  db.prepare('UPDATE guests SET invite_token = ?, invite_sent = 1 WHERE id = ?').run(token, id);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  // Invite link points to the LANDING PAGE first (not the RSVP form directly)
  const inviteLink = `${baseUrl}/invite/${token}`;

  req.session.successMessage = `Invite generated for ${guest.name}. Link: ${inviteLink}`;
  res.redirect('/admin/dashboard');
});

// --- Admin: View RSVPs -------------------------------------------------------

app.get('/admin/rsvps', requireAdmin, (req, res) => {
  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  const rsvps = db.prepare(`
    SELECT r.*, g.name AS guest_name, g.email AS guest_email
    FROM rsvps r
    JOIN guests g ON g.id = r.guest_id
    ORDER BY r.submitted_at DESC
  `).all();
  res.render('admin/rsvps', { event, rsvps });
});

// --- Admin: Update Event -----------------------------------------------------

app.post('/admin/event/update', requireAdmin, (req, res) => {
  const { name, date, venue, description } = req.body;
  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  if (event) {
    db.prepare('UPDATE events SET name = ?, date = ?, venue = ?, description = ? WHERE id = ?')
      .run(name, date, venue, description, event.id);
  } else {
    db.prepare('INSERT INTO events (name, date, venue, description) VALUES (?, ?, ?, ?)')
      .run(name, date, venue, description);
  }
  req.session.successMessage = 'Event details updated successfully.';
  res.redirect('/admin/dashboard');
});

// --- Guest: Landing Page -----------------------------------------------------
// Guests land here FIRST when they click their invite link.

app.get('/invite/:token', generalLimiter, (req, res) => {
  const { token } = req.params;
  const guest = db.prepare('SELECT * FROM guests WHERE invite_token = ?').get(token);
  if (!guest) {
    return res.status(404).render('error', {
      title: 'Invite Not Found',
      message: 'This invite link is invalid or has expired.',
    });
  }

  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  const existingRsvp = db.prepare(
    'SELECT * FROM rsvps WHERE guest_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(guest.id);

  res.render('landing', { guest, event, existingRsvp });
});

// --- Guest: RSVP Form --------------------------------------------------------
// Guests arrive here FROM the landing page.

app.get('/rsvp/:token', generalLimiter, (req, res) => {
  const { token } = req.params;
  const guest = db.prepare('SELECT * FROM guests WHERE invite_token = ?').get(token);
  if (!guest) {
    return res.status(404).render('error', {
      title: 'Invite Not Found',
      message: 'This invite link is invalid or has expired.',
    });
  }

  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  const existingRsvp = db.prepare(
    'SELECT * FROM rsvps WHERE guest_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(guest.id);
  const csrfToken = generateCsrfToken(req, res);

  res.render('rsvp', { guest, event, existingRsvp, error: null, success: false, csrfToken });
});

app.post('/rsvp/:token', generalLimiter, (req, res) => {
  const { token } = req.params;
  const guest = db.prepare('SELECT * FROM guests WHERE invite_token = ?').get(token);
  if (!guest) {
    return res.status(404).render('error', {
      title: 'Invite Not Found',
      message: 'This invite link is invalid or has expired.',
    });
  }

  const event = db.prepare('SELECT * FROM events ORDER BY id LIMIT 1').get();
  const { attending, plus_ones, dietary_notes, message } = req.body;

  if (!['yes', 'no', 'maybe'].includes(attending)) {
    const csrfToken = generateCsrfToken(req, res);
    return res.render('rsvp', {
      guest,
      event,
      existingRsvp: null,
      error: 'Please select your attendance status.',
      success: false,
      csrfToken,
    });
  }

  const plusOnesCount = parseInt(plus_ones, 10) || 0;

  // Upsert: update existing RSVP or insert new one
  const existingRsvp = db.prepare(
    'SELECT * FROM rsvps WHERE guest_id = ? AND event_id = ?'
  ).get(guest.id, event.id);

  if (existingRsvp) {
    db.prepare(
      'UPDATE rsvps SET attending = ?, plus_ones = ?, dietary_notes = ?, message = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(attending, plusOnesCount, dietary_notes || '', message || '', existingRsvp.id);
  } else {
    db.prepare(
      'INSERT INTO rsvps (guest_id, event_id, attending, plus_ones, dietary_notes, message) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guest.id, event.id, attending, plusOnesCount, dietary_notes || '', message || '');
  }

  const updatedRsvp = db.prepare(
    'SELECT * FROM rsvps WHERE guest_id = ? AND event_id = ?'
  ).get(guest.id, event.id);

  res.render('rsvp', { guest, event, existingRsvp: updatedRsvp, error: null, success: true, csrfToken: '' });
});

// --- Start Server ------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`RSVP App running at http://localhost:${PORT}`);
  console.log(`Admin login: http://localhost:${PORT}/admin/login`);
  console.log(`Admin password: admin123`);
});

module.exports = app;
