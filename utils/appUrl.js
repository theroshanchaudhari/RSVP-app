'use strict';

const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

function normalizeUrl(url) {
  return url ? url.replace(/\/+$/, '') : '';
}

function getConfiguredAppUrl() {
  return normalizeUrl(process.env.APP_URL || '');
}

function getAppUrl(req) {
  const configured = getConfiguredAppUrl();
  if (configured && !LOCALHOST_RE.test(configured)) {
    return configured;
  }

  if (req) {
    const host = req.get('host');
    if (host) {
      const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
      const protocol = forwardedProto || req.protocol;
      return `${protocol}://${host}`;
    }
  }

  return configured || 'http://localhost:3000';
}

module.exports = { getAppUrl, getConfiguredAppUrl };
