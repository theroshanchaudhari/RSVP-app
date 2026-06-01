'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/adminAuth');

// Auth
router.get('/login', ctrl.showLogin);
router.post('/login', ctrl.login);
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
router.get('/guests/export/csv', requireAdmin, ctrl.exportCsv);

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
