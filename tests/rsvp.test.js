'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Set up test environment
process.env.ADMIN_EMAIL = 'testadmin@example.com';
process.env.ADMIN_PASSWORD = 'testpassword';
process.env.NODE_ENV = 'test';

const TEST_DATA_DIR = path.join(__dirname, '..', 'data_test');

let db;

before(() => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  const testDbPath = path.join(TEST_DATA_DIR, 'test_rsvp.db');
  db = new DatabaseSync(testDbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Test Event',
      date TEXT, time TEXT, venue_name TEXT, venue_address TEXT,
      city TEXT, state TEXT, zip TEXT, google_maps_url TEXT,
      parking_info TEXT, dress_code TEXT, schedule TEXT DEFAULT '[]',
      puja_timing TEXT, lunch_timing TEXT, contact_name TEXT,
      contact_phone TEXT, contact_email TEXT, faq TEXT DEFAULT '[]',
      rsvp_deadline TEXT, max_guests INTEGER, invite_only INTEGER DEFAULT 0,
      event_password TEXT, password_protected INTEGER DEFAULT 0,
      admin_email TEXT NOT NULL, admin_password TEXT NOT NULL,
      description TEXT, banner_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL, email TEXT, phone TEXT,
      attending TEXT DEFAULT 'pending',
      adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
      meal_preference TEXT, dietary_restrictions TEXT,
      arrival_time TEXT, message TEXT,
      edit_token TEXT UNIQUE, invite_token TEXT,
      private_notes TEXT, is_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL, email TEXT, phone TEXT,
      invite_token TEXT UNIQUE NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );
  `);

  // Insert test event
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('testpassword', 10);
  db.prepare(`
    INSERT OR IGNORE INTO events (id, name, admin_email, admin_password)
    VALUES (1, 'Test Event', 'testadmin@example.com', ?)
  `).run(hash);
});

after(() => {
  if (db) db.close();
  // Clean up test DB
  const testDbPath = path.join(TEST_DATA_DIR, 'test_rsvp.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ─── Unit Tests: DB Queries ────────────────────────────────────────────────────

test('creates a guest record', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO guests (event_id, name, email, phone, attending, adults, children, edit_token, is_manual)
    VALUES (1, 'Alice Test', 'alice@test.com', '555-1111', 'yes', 2, 1, ?, 0)
  `);
  const info = stmt.run(token);
  assert.ok(info.lastInsertRowid > 0, 'Guest ID should be positive');

  const guest = db.prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
  assert.equal(guest.name, 'Alice Test');
  assert.equal(guest.attending, 'yes');
  assert.equal(guest.adults, 2);
  assert.equal(guest.children, 1);
});

test('retrieves guest by edit token', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  db.prepare(`INSERT INTO guests (event_id, name, email, edit_token, is_manual)
              VALUES (1, 'Bob Test', 'bob@test.com', ?, 0)`).run(token);
  const guest = db.prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
  assert.ok(guest, 'Guest should be found');
  assert.equal(guest.name, 'Bob Test');
});

test('detects duplicate by email', () => {
  const { v4: uuidv4 } = require('uuid');
  const email = `dup_${Date.now()}@test.com`;
  const token1 = uuidv4();
  db.prepare(`INSERT INTO guests (event_id, name, email, edit_token, is_manual)
              VALUES (1, 'Dup One', ?, ?, 0)`).run(email, token1);

  const existing = db.prepare('SELECT * FROM guests WHERE event_id = 1 AND email = ?').get(email);
  assert.ok(existing, 'Duplicate should be found by email');
  assert.equal(existing.email, email);
});

test('updates a guest record', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  db.prepare(`INSERT INTO guests (event_id, name, email, attending, edit_token, is_manual)
              VALUES (1, 'Charlie Test', 'charlie@test.com', 'pending', ?, 0)`).run(token);

  db.prepare(`UPDATE guests SET attending = 'yes', adults = 3 WHERE edit_token = ?`).run(token);
  const updated = db.prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
  assert.equal(updated.attending, 'yes');
  assert.equal(updated.adults, 3);
});

test('guest stats are calculated correctly', () => {
  // Insert known data
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`INSERT INTO guests (event_id, name, attending, adults, children, edit_token, is_manual)
              VALUES (1, 'Stats-Yes-1', 'yes', 2, 1, ?, 0)`).run(uuidv4());
  db.prepare(`INSERT INTO guests (event_id, name, attending, adults, children, edit_token, is_manual)
              VALUES (1, 'Stats-Yes-2', 'yes', 3, 0, ?, 0)`).run(uuidv4());
  db.prepare(`INSERT INTO guests (event_id, name, attending, edit_token, is_manual)
              VALUES (1, 'Stats-No-1', 'no', ?, 0)`).run(uuidv4());

  const attending = db.prepare("SELECT COUNT(*) as c FROM guests WHERE event_id = 1 AND attending = 'yes'").get();
  const notAttending = db.prepare("SELECT COUNT(*) as c FROM guests WHERE event_id = 1 AND attending = 'no'").get();
  assert.ok(attending.c >= 2, 'At least 2 attending');
  assert.ok(notAttending.c >= 1, 'At least 1 not attending');

  const adults = db.prepare("SELECT COALESCE(SUM(adults),0) as t FROM guests WHERE event_id = 1 AND attending = 'yes'").get();
  assert.ok(adults.t >= 5, 'Total adults should be at least 5');
});

test('creates an invitation with unique token', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  db.prepare(`INSERT INTO invitations (event_id, name, email, invite_token)
              VALUES (1, 'Invited Guest', 'inv@test.com', ?)`).run(token);

  const inv = db.prepare('SELECT * FROM invitations WHERE invite_token = ?').get(token);
  assert.ok(inv, 'Invitation should exist');
  assert.equal(inv.name, 'Invited Guest');
  assert.equal(inv.used, 0);
});

test('marks invitation as used', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  db.prepare(`INSERT INTO invitations (event_id, name, invite_token)
              VALUES (1, 'Used Guest', ?)`).run(token);
  db.prepare(`UPDATE invitations SET used = 1 WHERE invite_token = ?`).run(token);

  const inv = db.prepare('SELECT * FROM invitations WHERE invite_token = ?').get(token);
  assert.equal(inv.used, 1);
});

test('retrieves event settings', () => {
  const event = db.prepare('SELECT * FROM events WHERE id = 1').get();
  assert.ok(event, 'Event should exist');
  assert.equal(event.name, 'Test Event');
  assert.equal(event.admin_email, 'testadmin@example.com');
});

test('updates event settings', () => {
  db.prepare(`UPDATE events SET name = 'Updated Event', date = '2025-12-31' WHERE id = 1`).run();
  const event = db.prepare('SELECT * FROM events WHERE id = 1').get();
  assert.equal(event.name, 'Updated Event');
  assert.equal(event.date, '2025-12-31');
  // Reset
  db.prepare(`UPDATE events SET name = 'Test Event', date = NULL WHERE id = 1`).run();
});

test('deletes a guest', () => {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  db.prepare(`INSERT INTO guests (event_id, name, edit_token, is_manual)
              VALUES (1, 'Delete Me', ?, 0)`).run(token);
  const before = db.prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
  assert.ok(before, 'Guest should exist before deletion');

  db.prepare(`DELETE FROM guests WHERE edit_token = ?`).run(token);
  const after = db.prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
  assert.equal(after, undefined, 'Guest should not exist after deletion');
});

test('bcrypt password hashing and verification', async () => {
  const bcrypt = require('bcryptjs');
  const password = 'mysecretpassword';
  const hash = await bcrypt.hash(password, 10);
  const match = await bcrypt.compare(password, hash);
  const noMatch = await bcrypt.compare('wrongpassword', hash);
  assert.ok(match, 'Correct password should match');
  assert.ok(!noMatch, 'Wrong password should not match');
});

test('uuid generates unique tokens', () => {
  const { v4: uuidv4 } = require('uuid');
  const tokens = new Set();
  for (let i = 0; i < 100; i++) {
    tokens.add(uuidv4());
  }
  assert.equal(tokens.size, 100, 'All 100 UUIDs should be unique');
});

test('schedule JSON parsing handles malformed data gracefully', () => {
  let schedule = [];
  try {
    schedule = JSON.parse('not valid json');
  } catch (_) {
    schedule = [];
  }
  assert.deepEqual(schedule, [], 'Should default to empty array on parse error');
});
