'use strict';

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  throw new Error(
    'This app requires Node.js 22.5+ because it uses node:sqlite. ' +
    `Current runtime: ${process.version}. Original error: ${err.message}`
  );
}
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'rsvp.db');

let db;

function getDB() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Vastu Pooja',
      date TEXT,
      time TEXT,
      venue_name TEXT,
      venue_address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      google_maps_url TEXT,
      parking_info TEXT,
      dress_code TEXT,
      schedule TEXT DEFAULT '[]',
      puja_timing TEXT,
      lunch_timing TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      faq TEXT DEFAULT '[]',
      rsvp_deadline TEXT,
      max_guests INTEGER,
      invite_only INTEGER DEFAULT 0,
      event_password TEXT,
      password_protected INTEGER DEFAULT 0,
      admin_email TEXT NOT NULL,
      admin_password TEXT NOT NULL,
      description TEXT,
      banner_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      attending TEXT DEFAULT 'pending',
      adults INTEGER DEFAULT 1,
      children INTEGER DEFAULT 0,
      meal_preference TEXT,
      dietary_restrictions TEXT,
      arrival_time TEXT,
      message TEXT,
      edit_token TEXT UNIQUE,
      invite_token TEXT,
      private_notes TEXT,
      is_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      invite_token TEXT UNIQUE NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );
  `);

  // Seed default event if none exists
  const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
  if (eventCount.count === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const hashed = bcrypt.hashSync(adminPassword, 10);

    db.prepare(`
      INSERT INTO events (name, admin_email, admin_password, description, banner_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'My Event',
      adminEmail,
      hashed,
      'Join us for a wonderful celebration!',
      'We are so excited to celebrate with you!'
    );
  }

  return db;
}

module.exports = { getDB, initDB };
