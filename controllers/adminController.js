'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const {
  getEvent, updateEvent,
  getAllGuests, getGuestById, createGuest, updateGuest, deleteGuest, getGuestStats,
  getAllInvitations, createInvitation, deleteInvitation
} = require('../models/queries');
const { sendReminderEmail } = require('../services/emailService');
const { generateQRCode } = require('../services/qrService');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function showLogin(req, res) {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  const event = getEvent(1);
  res.render('admin/login', { event, error: null });
}

async function login(req, res) {
  const { email, password } = req.body;
  const event = getEvent(1);

  if (!email || !password) {
    return res.render('admin/login', { event, error: 'Email and password are required.' });
  }

  if (!event || event.admin_email !== email) {
    return res.render('admin/login', { event, error: 'Invalid email or password.' });
  }

  let match = false;
  try {
    match = await bcrypt.compare(password, event.admin_password);
  } catch (err) {
    return res.render('admin/login', { event, error: 'Login failed. Please try again.' });
  }

  if (!match) {
    return res.render('admin/login', { event, error: 'Invalid email or password.' });
  }

  req.session.adminId = event.id;
  const returnTo = req.session.returnTo || '/admin';
  delete req.session.returnTo;
  res.redirect(returnTo);
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/admin/login'));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function dashboard(req, res) {
  const event = getEvent(1);
  const stats = getGuestStats(1);
  const recentGuests = getAllGuests(1).slice(0, 10);
  const rsvpUrl = `${APP_URL}/rsvp`;
  let qrCode = null;
  try { qrCode = await generateQRCode(rsvpUrl); } catch (_) {}
  res.render('admin/dashboard', { event, stats, recentGuests, qrCode, rsvpUrl });
}

// ─── Guests ───────────────────────────────────────────────────────────────────

function guestList(req, res) {
  const event = getEvent(1);
  const { search, attending, meal_preference } = req.query;
  const filters = {};
  if (search) filters.search = search;
  if (attending) filters.attending = attending;
  if (meal_preference) filters.meal_preference = meal_preference;

  const guests = getAllGuests(1, filters);
  const stats = getGuestStats(1);
  res.render('admin/guests', { event, guests, stats, filters: req.query });
}

function showGuest(req, res) {
  const event = getEvent(1);
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).render('error', { event, message: 'Guest not found.' });
  const editUrl = `${APP_URL}/rsvp/edit/${guest.edit_token}`;
  res.render('admin/guest-detail', { event, guest, editUrl });
}

function showAddGuest(req, res) {
  const event = getEvent(1);
  res.render('admin/add-guest', { event, errors: [], formData: {} });
}

async function addGuest(req, res) {
  const event = getEvent(1);
  const {
    name, email, phone, attending, adults, children,
    meal_preference, dietary_restrictions, arrival_time, message, private_notes
  } = req.body;

  const errors = [];
  if (!name || !name.trim()) errors.push('Name is required.');

  if (errors.length > 0) {
    return res.render('admin/add-guest', { event, errors, formData: req.body });
  }

  const editToken = uuidv4();
  createGuest({
    event_id: 1,
    name: name.trim(),
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    attending: attending || 'yes',
    adults: parseInt(adults) || 1,
    children: parseInt(children) || 0,
    meal_preference: meal_preference || null,
    dietary_restrictions: dietary_restrictions || null,
    arrival_time: arrival_time || null,
    message: message || null,
    edit_token: editToken,
    invite_token: null,
    is_manual: 1
  });

  if (private_notes) {
    const guests = getAllGuests(1);
    const g = guests.find(x => x.edit_token === editToken);
    if (g) updateGuest(g.id, { private_notes });
  }

  res.redirect('/admin/guests?added=1');
}

function showEditGuest(req, res) {
  const event = getEvent(1);
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).render('error', { event, message: 'Guest not found.' });
  res.render('admin/edit-guest', { event, guest, errors: [] });
}

function editGuest(req, res) {
  const event = getEvent(1);
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).render('error', { event, message: 'Guest not found.' });

  const {
    name, email, phone, attending, adults, children,
    meal_preference, dietary_restrictions, arrival_time, message, private_notes
  } = req.body;

  const errors = [];
  if (!name || !name.trim()) errors.push('Name is required.');
  if (errors.length > 0) {
    return res.render('admin/edit-guest', { event, guest, errors });
  }

  updateGuest(guest.id, {
    name: name.trim(),
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    attending: attending || guest.attending,
    adults: parseInt(adults) || 1,
    children: parseInt(children) || 0,
    meal_preference: meal_preference || null,
    dietary_restrictions: dietary_restrictions || null,
    arrival_time: arrival_time || null,
    message: message || null,
    private_notes: private_notes || null
  });

  res.redirect(`/admin/guests/${guest.id}?updated=1`);
}

function deleteGuestHandler(req, res) {
  deleteGuest(req.params.id);
  res.redirect('/admin/guests?deleted=1');
}

async function sendReminder(req, res) {
  const event = getEvent(1);
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });
  try {
    await sendReminderEmail(guest, event);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

async function exportCsv(req, res) {
  const guests = getAllGuests(1);
  const tmpPath = path.join(process.cwd(), 'data', `guests_${Date.now()}.csv`);

  const csvWriter = createObjectCsvWriter({
    path: tmpPath,
    header: [
      { id: 'id', title: 'ID' },
      { id: 'name', title: 'Name' },
      { id: 'email', title: 'Email' },
      { id: 'phone', title: 'Phone' },
      { id: 'attending', title: 'Attending' },
      { id: 'adults', title: 'Adults' },
      { id: 'children', title: 'Children' },
      { id: 'meal_preference', title: 'Meal Preference' },
      { id: 'dietary_restrictions', title: 'Dietary Restrictions' },
      { id: 'arrival_time', title: 'Arrival Time' },
      { id: 'message', title: 'Message' },
      { id: 'created_at', title: 'RSVP Date' }
    ]
  });

  await csvWriter.writeRecords(guests);
  res.download(tmpPath, 'guests.csv', err => {
    fs.unlink(tmpPath, () => {});
    if (err) console.error('CSV download error:', err);
  });
}

// ─── Invitations ──────────────────────────────────────────────────────────────

async function invitationList(req, res) {
  const event = getEvent(1);
  const invitations = getAllInvitations(1);
  res.render('admin/invitations', { event, invitations, APP_URL });
}

async function showAddInvitation(req, res) {
  const event = getEvent(1);
  res.render('admin/add-invitation', { event, errors: [], formData: {} });
}

async function addInvitation(req, res) {
  const event = getEvent(1);
  const { name, email, phone } = req.body;

  const errors = [];
  if (!name || !name.trim()) errors.push('Name is required.');
  if (errors.length > 0) {
    return res.render('admin/add-invitation', { event, errors, formData: req.body });
  }

  const token = uuidv4();
  createInvitation({
    event_id: 1,
    name: name.trim(),
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    invite_token: token
  });

  res.redirect('/admin/invitations?added=1');
}

async function deleteInvitationHandler(req, res) {
  deleteInvitation(req.params.id);
  res.redirect('/admin/invitations?deleted=1');
}

async function getInvitationQR(req, res) {
  const { id } = req.params;
  const invitations = getAllInvitations(1);
  const inv = invitations.find(i => i.id === parseInt(id));
  if (!inv) return res.status(404).send('Not found');
  const url = `${APP_URL}/rsvp?token=${inv.invite_token}`;
  const qr = await generateQRCode(url);
  res.json({ qr, url });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function showSettings(req, res) {
  const event = getEvent(1);
  let schedule = [];
  let faq = [];
  try { schedule = JSON.parse(event.schedule || '[]'); } catch (_) {}
  try { faq = JSON.parse(event.faq || '[]'); } catch (_) {}
  res.render('admin/settings', { event, schedule, faq, success: req.query.saved === '1', errors: [] });
}

async function updateSettings(req, res) {
  const event = getEvent(1);
  const {
    name, date, time, venue_name, venue_address, city, state, zip,
    google_maps_url, parking_info, dress_code, description, banner_message,
    puja_timing, lunch_timing, contact_name, contact_phone, contact_email,
    rsvp_deadline, max_guests, invite_only, password_protected, event_password,
    admin_email, new_password, schedule_json, faq_json
  } = req.body;

  const data = {
    name: name || event.name,
    date: date || null,
    time: time || null,
    venue_name: venue_name || null,
    venue_address: venue_address || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    google_maps_url: google_maps_url || null,
    parking_info: parking_info || null,
    dress_code: dress_code || null,
    description: description || null,
    banner_message: banner_message || null,
    puja_timing: puja_timing || null,
    lunch_timing: lunch_timing || null,
    contact_name: contact_name || null,
    contact_phone: contact_phone || null,
    contact_email: contact_email || null,
    rsvp_deadline: rsvp_deadline || null,
    max_guests: max_guests ? parseInt(max_guests) : null,
    invite_only: invite_only === 'on' ? 1 : 0,
    password_protected: password_protected === 'on' ? 1 : 0,
    event_password: event_password || null,
    admin_email: admin_email || event.admin_email,
    schedule: schedule_json || '[]',
    faq: faq_json || '[]'
  };

  if (new_password && new_password.trim()) {
    data.admin_password = await bcrypt.hash(new_password.trim(), 10);
  }

  updateEvent(1, data);
  res.redirect('/admin/settings?saved=1');
}

module.exports = {
  showLogin, login, logout,
  dashboard,
  guestList, showGuest, showAddGuest, addGuest, showEditGuest, editGuest, deleteGuestHandler, sendReminder,
  exportCsv,
  invitationList, showAddInvitation, addInvitation, deleteInvitationHandler, getInvitationQR,
  showSettings, updateSettings
};
