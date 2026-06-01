/**
 * Integration tests for RSVP App
 * Tests the full admin flow and guest invite flow (landing page → RSVP form)
 */
const http = require('http');
const request = require('supertest');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Remove test DB so each run starts fresh
const testDbPath = path.join(__dirname, '..', 'db', 'test_rsvp.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const app = require('../server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract name=value portion from a Set-Cookie header entry */
function cookieVal(setCookieHeader) {
  return setCookieHeader.split(';')[0].trim();
}

/** Build a single Cookie: header string from an array of Set-Cookie values */
function buildCookieHeader(setCookieArray) {
  return setCookieArray.map(cookieVal).join('; ');
}

/** Extract a specific cookie value by name from Set-Cookie headers */
function getCookieValue(setCookieArray, name) {
  for (const c of setCookieArray) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (k.trim() === name) return v;
  }
  return null;
}

/** Extract CSRF token from HTML form hidden input */
function extractCsrfToken(html) {
  const match = html.match(/<input[^>]+name="_csrf"[^>]+value="([^"]+)"/);
  return match ? match[1] : null;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  PASS: ${name}`);
    passed++;
  }).catch(err => {
    console.log(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  });
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

async function runTests() {
  const agent = request.agent(app);

  console.log('\n[1] Admin login page');
  await test('returns 200', async () => {
    const res = await agent.get('/admin/login');
    assert.strictEqual(res.status, 200);
  });
  await test('shows login form', async () => {
    const res = await agent.get('/admin/login');
    assert.ok(res.text.includes('<form'));
  });
  await test('has CSRF token in form', async () => {
    const res = await agent.get('/admin/login');
    const token = extractCsrfToken(res.text);
    assert.ok(token, 'CSRF token should be present in form');
  });

  console.log('\n[2] Auth protection');
  await test('dashboard redirects to login when unauthenticated', async () => {
    const fresh = request(app);
    const res = await fresh.get('/admin/dashboard');
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes('/admin/login'));
  });

  console.log('\n[3] Admin login (POST)');
  let csrfToken;
  await test('CSRF token present', async () => {
    const res = await agent.get('/admin/login');
    csrfToken = extractCsrfToken(res.text);
    assert.ok(csrfToken, 'CSRF token must exist before login POST');
  });
  await test('redirects on success', async () => {
    const creds = { _csrf: csrfToken, password: 'admin' + '123' };
    const res = await agent
      .post('/admin/login')
      .type('form')
      .send(new URLSearchParams(creds).toString());
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes('/admin/dashboard'));
  });
  await test('dashboard loads after login', async () => {
    const res = await agent.get('/admin/dashboard');
    assert.strictEqual(res.status, 200);
  });
  await test('dashboard has CSRF token', async () => {
    const res = await agent.get('/admin/dashboard');
    const token = extractCsrfToken(res.text);
    assert.ok(token, 'Dashboard should have a CSRF token');
    csrfToken = token; // update for next use
  });

  console.log('\n[4] Add guest');
  await test('redirects after add', async () => {
    const res = await agent
      .post('/admin/guests/add')
      .type('form')
      .send(`name=Test+Guest&email=test%40example.com&_csrf=${csrfToken}`);
    assert.strictEqual(res.status, 302);
  });

  console.log('\n[5] Send invite');
  let guestId;
  await test('guest was created', async () => {
    const res = await agent.get('/admin/dashboard');
    const match = res.text.match(/\/admin\/guests\/(\d+)\/invite/);
    assert.ok(match, 'Guest invite form should appear in dashboard');
    guestId = match[1];
  });
  await test('invite is generated', async () => {
    const dashRes = await agent.get('/admin/dashboard');
    const token = extractCsrfToken(dashRes.text);
    const res = await agent
      .post(`/admin/guests/${guestId}/invite`)
      .type('form')
      .send(`_csrf=${token}`);
    assert.strictEqual(res.status, 302);
  });

  console.log('\n[6] Guest landing page');
  let inviteToken;
  await test('invite token exists in dashboard', async () => {
    const res = await agent.get('/admin/dashboard');
    const match = res.text.match(/\/invite\/([0-9a-f-]{36})/);
    assert.ok(match, 'Invite link should appear in dashboard');
    inviteToken = match[1];
  });
  await test('landing page returns 200', async () => {
    const res = await agent.get(`/invite/${inviteToken}`);
    assert.strictEqual(res.status, 200);
  });
  await test('landing page shows guest name', async () => {
    const res = await agent.get(`/invite/${inviteToken}`);
    assert.ok(res.text.includes('Test Guest'));
  });
  await test('landing page links to RSVP form', async () => {
    const res = await agent.get(`/invite/${inviteToken}`);
    assert.ok(res.text.includes(`/rsvp/${inviteToken}`));
  });
  await test('landing page has no submit form', async () => {
    const res = await agent.get(`/invite/${inviteToken}`);
    assert.ok(!res.text.includes('name="attending"'), 'Landing page should NOT contain the RSVP form');
  });

  console.log('\n[7] Invalid invite token');
  await test('returns 404 for unknown token', async () => {
    const res = await agent.get('/invite/00000000-0000-0000-0000-000000000000');
    assert.strictEqual(res.status, 404);
  });

  console.log('\n[8] RSVP form');
  let rsvpCsrf;
  await test('RSVP form returns 200', async () => {
    const res = await agent.get(`/rsvp/${inviteToken}`);
    assert.strictEqual(res.status, 200);
  });
  await test('RSVP form shows guest name', async () => {
    const res = await agent.get(`/rsvp/${inviteToken}`);
    assert.ok(res.text.includes('Test Guest'));
  });
  await test('RSVP form has CSRF token', async () => {
    const res = await agent.get(`/rsvp/${inviteToken}`);
    rsvpCsrf = extractCsrfToken(res.text);
    assert.ok(rsvpCsrf, 'RSVP form should have a CSRF token');
  });
  await test('RSVP form has link back to landing page', async () => {
    const res = await agent.get(`/rsvp/${inviteToken}`);
    assert.ok(res.text.includes(`/invite/${inviteToken}`));
  });

  console.log('\n[9] Submit RSVP');
  await test('accepts valid submission', async () => {
    const res = await agent
      .post(`/rsvp/${inviteToken}`)
      .type('form')
      .send(`attending=yes&plus_ones=1&dietary_notes=&message=Looking+forward+to+it!&_csrf=${rsvpCsrf}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('success') || res.text.toLowerCase().includes('thank'));
  });
  await test('rejects submission without CSRF token', async () => {
    const res = await agent
      .post(`/rsvp/${inviteToken}`)
      .type('form')
      .send('attending=yes&plus_ones=0&dietary_notes=&message=');
    assert.strictEqual(res.status, 403);
  });

  console.log('\n[10] View RSVPs (admin)');
  await test('rsvps page loads', async () => {
    const res = await agent.get('/admin/rsvps');
    assert.strictEqual(res.status, 200);
  });
  await test('rsvps page shows submission', async () => {
    const res = await agent.get('/admin/rsvps');
    assert.ok(res.text.includes('Test Guest'));
  });

  console.log('\n[11] Admin logout');
  await test('logout redirects', async () => {
    const res = await agent.get('/admin/logout');
    assert.strictEqual(res.status, 302);
  });
  await test('dashboard inaccessible after logout', async () => {
    const res = await agent.get('/admin/dashboard');
    assert.strictEqual(res.status, 302);
  });

  // Summary
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(40)}`);

  // Cleanup
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
