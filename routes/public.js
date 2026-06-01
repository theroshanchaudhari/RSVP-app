'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rsvpController');

router.get('/', ctrl.showLanding);
router.post('/event-access', ctrl.verifyEventPassword);
router.get('/rsvp', ctrl.showRsvpForm);
router.post('/rsvp', ctrl.submitRsvp);
router.get('/rsvp/edit/:token', ctrl.showEditForm);
router.post('/rsvp/edit/:token', ctrl.updateRsvp);

module.exports = router;
