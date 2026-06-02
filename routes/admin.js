'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/adminAuth');

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many export requests. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false
});

// Auth
router.get('/login', ctrl.showLogin);
router.post('/login', loginLimiter, ctrl.login);
router.post('/logout', requireAdmin, ctrl.logout);

// Dashboard
router.get('/', requireAdmin, ctrl.dashboard);

// Guests
router.get('/guests', requireAdmin, ctrl.guestList);
router.get('/guests/add', requireAdmin, ctrl.showAddGuest);
router.post('/guests/add', requireAdmin, ctrl.addGuest);
router.get('/guests/:id', requireAdmin, ctrl.showGuest);
router.get('/guests/:id/edit', requireAdmin, ctrl.showEditGuest);
router.post('/guests/:id/edit', requireAdmin, ctrl.editGuest);
router.post('/guests/:id/delete', requireAdmin, ctrl.deleteGuestHandler);
router.post('/guests/:id/remind', requireAdmin, ctrl.sendReminder);

// CSV Export
router.get('/guests/export/csv', requireAdmin, exportLimiter, ctrl.exportCsv);

// Invitations
router.get('/invitations', requireAdmin, ctrl.invitationList);
router.get('/invitations/add', requireAdmin, ctrl.showAddInvitation);
router.post('/invitations/add', requireAdmin, ctrl.addInvitation);
router.post('/invitations/:id/delete', requireAdmin, ctrl.deleteInvitationHandler);
router.get('/invitations/:id/qr', requireAdmin, ctrl.getInvitationQR);

// Settings
router.get('/settings', requireAdmin, ctrl.showSettings);
router.post('/settings', requireAdmin, ctrl.updateSettings);

module.exports = router;
