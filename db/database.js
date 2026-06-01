const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'rsvp.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    venue TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    invite_token TEXT UNIQUE,
    invite_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    attending TEXT NOT NULL CHECK(attending IN ('yes', 'no', 'maybe')),
    plus_ones INTEGER DEFAULT 0,
    dietary_notes TEXT,
    message TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );
`);

// Seed a default event if none exists
const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
if (eventCount.count === 0) {
  db.prepare(
    'INSERT INTO events (name, date, venue, description) VALUES (?, ?, ?, ?)'
  ).run(
    'Annual Celebration 2026',
    'July 15, 2026 at 7:00 PM',
    'Grand Ballroom, City Convention Center',
    'Join us for an evening of celebration, great food, and wonderful company. Dress code: Smart casual.'
  );
}

module.exports = db;
