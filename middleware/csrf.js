'use strict';

const crypto = require('crypto');

/**
 * Simple session-based CSRF protection.
 * - Generates a per-session token and exposes it as res.locals.csrfToken.
 * - Validates the token on state-mutating requests (POST/PUT/PATCH/DELETE).
 */
function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (mutating.includes(req.method)) {
    const submitted = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
    if (!submitted || submitted !== req.session.csrfToken) {
      const { getEvent } = require('../models/queries');
      let event = { name: 'RSVP App' };
      try { event = getEvent(1); } catch (_) {}
      return res.status(403).render('error', {
        event,
        message: 'Invalid security token. Please go back, refresh the page, and try again.'
      });
    }
  }
  next();
}

module.exports = { csrfProtection };
