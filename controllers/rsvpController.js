'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  getEvent,
  createGuest,
  updateGuest,
  getGuestByEditToken,
  getGuestByEmailOrPhone,
  getInvitationByToken,
  markInvitationUsed
} = require('../models/queries');
const { sendConfirmationEmail, sendHostNotification } = require('../services/emailService');
const { generateQRCode } = require('../services/qrService');
const { getAppUrl } = require('../utils/appUrl');

function safeReturnTo(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

async function showLanding(req, res) {
  const event = getEvent(1);
  const appUrl = getAppUrl(req);
  const { token } = req.query;
  const invitation = token ? getInvitationByToken(token) : null;
  const inviteQuery = invitation ? `?token=${encodeURIComponent(invitation.invite_token)}` : '';
  const rsvpUrl = `${appUrl}/rsvp${inviteQuery}`;
  let qrCode = null;
  try {
    qrCode = await generateQRCode(rsvpUrl);
  } catch (_) {}

  let schedule = [];
  let faq = [];
  try { schedule = JSON.parse(event.schedule || '[]'); } catch (_) {}
  try { faq = JSON.parse(event.faq || '[]'); } catch (_) {}

  // Check event password
  if (event.password_protected && !req.session.eventAccessGranted) {
    return res.render('event-password', { event, error: null, returnTo: req.originalUrl });
  }

  res.render('index', { event, invitation, qrCode, rsvpUrl, schedule, faq, APP_URL: appUrl });
}

function verifyEventPassword(req, res) {
  const event = getEvent(1);
  const { password, returnTo } = req.body;
  if (password === event.event_password) {
    req.session.eventAccessGranted = true;
    return res.redirect(safeReturnTo(returnTo));
  }
  res.render('event-password', {
    event,
    error: 'Incorrect password. Please try again.',
    returnTo: safeReturnTo(returnTo)
  });
}

async function showRsvpForm(req, res) {
  const event = getEvent(1);
  const { token } = req.query;

  // Deadline check
  if (event.rsvp_deadline) {
    const deadline = new Date(event.rsvp_deadline);
    if (new Date() > deadline) {
      return res.render('rsvp-closed', { event });
    }
  }

  // Invite-only check
  let invitation = null;
  if (event.invite_only) {
    if (!token) return res.render('rsvp-invite-only', { event });
    invitation = getInvitationByToken(token);
    if (!invitation) return res.render('rsvp-invite-only', { event });
    if (invitation.used) return res.render('rsvp-already-used', { event, invitation });
  } else if (token) {
    invitation = getInvitationByToken(token);
  }

  res.render('rsvp', { event, invitation, token: token || null, errors: [], formData: {} });
}

async function submitRsvp(req, res) {
  const event = getEvent(1);
  const {
    name, email, phone, attending, adults, children,
    meal_preference, dietary_restrictions, arrival_time, message,
    invite_token
  } = req.body;

  const errors = [];
  if (!name || !name.trim()) errors.push('Name is required.');
  if (!attending) errors.push('Please select whether you are attending.');
  if (!email && !phone) errors.push('Please provide at least an email or phone number.');

  if (errors.length > 0) {
    const invitation = invite_token ? getInvitationByToken(invite_token) : null;
    return res.render('rsvp', {
      event,
      invitation,
      token: invite_token || null,
      errors,
      formData: req.body
    });
  }

  // Duplicate detection
  const existing = getGuestByEmailOrPhone(email || null, phone || null, 1);
  if (existing) {
    return res.redirect(`/rsvp/edit/${existing.edit_token}?duplicate=1`);
  }

  const editToken = uuidv4();
  const guestId = createGuest({
    event_id: 1,
    name: name.trim(),
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    attending,
    adults: parseInt(adults) || 1,
    children: parseInt(children) || 0,
    meal_preference: meal_preference || null,
    dietary_restrictions: dietary_restrictions || null,
    arrival_time: arrival_time || null,
    message: message || null,
    edit_token: editToken,
    invite_token: invite_token || null,
    is_manual: 0
  });

  // Mark invitation used if applicable
  if (invite_token) {
    markInvitationUsed(invite_token);
  }

  const guest = getGuestByEditToken(editToken);
  const appUrl = getAppUrl(req);
  const editUrl = `${appUrl}/rsvp/edit/${editToken}`;

  // Send emails (non-blocking)
  sendConfirmationEmail(guest, event, appUrl).catch(console.error);
  sendHostNotification(guest, event, appUrl).catch(console.error);

  res.render('rsvp-confirm', { event, guest, editUrl });
}

async function showEditForm(req, res) {
  const { token } = req.params;
  const event = getEvent(1);
  const guest = getGuestByEditToken(token);

  if (!guest) {
    return res.status(404).render('error', { event, message: 'RSVP not found. The edit link may be invalid.' });
  }

  const isDuplicate = req.query.duplicate === '1';
  res.render('rsvp-edit', { event, guest, errors: [], isDuplicate });
}

async function updateRsvp(req, res) {
  const { token } = req.params;
  const event = getEvent(1);
  const guest = getGuestByEditToken(token);

  if (!guest) {
    return res.status(404).render('error', { event, message: 'RSVP not found.' });
  }

  const {
    name, email, phone, attending, adults, children,
    meal_preference, dietary_restrictions, arrival_time, message
  } = req.body;

  const errors = [];
  if (!name || !name.trim()) errors.push('Name is required.');
  if (!attending) errors.push('Please select whether you are attending.');
  if (!email && !phone) errors.push('Please provide at least an email or phone number.');

  if (errors.length > 0) {
    return res.render('rsvp-edit', { event, guest, errors, isDuplicate: false });
  }

  updateGuest(guest.id, {
    name: name.trim(),
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    attending,
    adults: parseInt(adults) || 1,
    children: parseInt(children) || 0,
    meal_preference: meal_preference || null,
    dietary_restrictions: dietary_restrictions || null,
    arrival_time: arrival_time || null,
    message: message || null
  });

  const updatedGuest = getGuestByEditToken(token);
  const appUrl = getAppUrl(req);
  const editUrl = `${appUrl}/rsvp/edit/${token}`;

  // Send updated confirmation
  sendConfirmationEmail(updatedGuest, event, appUrl).catch(console.error);

  res.render('rsvp-confirm', { event, guest: updatedGuest, editUrl });
}

module.exports = { showLanding, verifyEventPassword, showRsvpForm, submitRsvp, showEditForm, updateRsvp };
