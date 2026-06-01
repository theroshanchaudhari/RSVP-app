'use strict';

const { getDB } = require('../config/database');

// ─── Events ───────────────────────────────────────────────────────────────────

function getEvent(id = 1) {
  return getDB().prepare('SELECT * FROM events WHERE id = ?').get(id);
}

function updateEvent(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  getDB().prepare(`UPDATE events SET ${fields} WHERE id = ?`).run(...values, id);
}

// ─── Guests ───────────────────────────────────────────────────────────────────

function getAllGuests(eventId = 1, filters = {}) {
  let sql = 'SELECT * FROM guests WHERE event_id = ?';
  const params = [eventId];

  if (filters.attending) {
    sql += ' AND attending = ?';
    params.push(filters.attending);
  }
  if (filters.search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }
  if (filters.meal_preference) {
    sql += ' AND meal_preference = ?';
    params.push(filters.meal_preference);
  }

  sql += ' ORDER BY created_at DESC';
  return getDB().prepare(sql).all(...params);
}

function getGuestById(id) {
  return getDB().prepare('SELECT * FROM guests WHERE id = ?').get(id);
}

function getGuestByEditToken(token) {
  return getDB().prepare('SELECT * FROM guests WHERE edit_token = ?').get(token);
}

function getGuestByEmailOrPhone(email, phone, eventId = 1) {
  if (email && phone) {
    return getDB().prepare(
      'SELECT * FROM guests WHERE event_id = ? AND (email = ? OR phone = ?)'
    ).get(eventId, email, phone);
  }
  if (email) {
    return getDB().prepare(
      'SELECT * FROM guests WHERE event_id = ? AND email = ?'
    ).get(eventId, email);
  }
  if (phone) {
    return getDB().prepare(
      'SELECT * FROM guests WHERE event_id = ? AND phone = ?'
    ).get(eventId, phone);
  }
  return null;
}

function createGuest(data) {
  const stmt = getDB().prepare(`
    INSERT INTO guests
      (event_id, name, email, phone, attending, adults, children,
       meal_preference, dietary_restrictions, arrival_time, message,
       edit_token, invite_token, is_manual)
    VALUES
      (@event_id, @name, @email, @phone, @attending, @adults, @children,
       @meal_preference, @dietary_restrictions, @arrival_time, @message,
       @edit_token, @invite_token, @is_manual)
  `);
  const info = stmt.run(data);
  return info.lastInsertRowid;
}

function updateGuest(id, data) {
  data.updated_at = new Date().toISOString();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  getDB().prepare(`UPDATE guests SET ${fields} WHERE id = ?`).run(...values, id);
}

function deleteGuest(id) {
  getDB().prepare('DELETE FROM guests WHERE id = ?').run(id);
}

function getGuestStats(eventId = 1) {
  const db = getDB();
  const total = db.prepare('SELECT COUNT(*) as count FROM guests WHERE event_id = ?').get(eventId);
  const attending = db.prepare("SELECT COUNT(*) as count FROM guests WHERE event_id = ? AND attending = 'yes'").get(eventId);
  const notAttending = db.prepare("SELECT COUNT(*) as count FROM guests WHERE event_id = ? AND attending = 'no'").get(eventId);
  const pending = db.prepare("SELECT COUNT(*) as count FROM guests WHERE event_id = ? AND (attending = 'pending' OR attending IS NULL)").get(eventId);
  const adults = db.prepare("SELECT COALESCE(SUM(adults), 0) as total FROM guests WHERE event_id = ? AND attending = 'yes'").get(eventId);
  const children = db.prepare("SELECT COALESCE(SUM(children), 0) as total FROM guests WHERE event_id = ? AND attending = 'yes'").get(eventId);

  const mealSummary = db.prepare(`
    SELECT meal_preference, COUNT(*) as count
    FROM guests
    WHERE event_id = ? AND attending = 'yes' AND meal_preference IS NOT NULL AND meal_preference != ''
    GROUP BY meal_preference
  `).all(eventId);

  const dietarySummary = db.prepare(`
    SELECT dietary_restrictions, COUNT(*) as count
    FROM guests
    WHERE event_id = ? AND attending = 'yes' AND dietary_restrictions IS NOT NULL AND dietary_restrictions != ''
    GROUP BY dietary_restrictions
  `).all(eventId);

  return {
    total: total.count,
    attending: attending.count,
    notAttending: notAttending.count,
    pending: pending.count,
    adults: adults.total,
    children: children.total,
    mealSummary,
    dietarySummary
  };
}

// ─── Invitations ──────────────────────────────────────────────────────────────

function getAllInvitations(eventId = 1) {
  return getDB().prepare('SELECT * FROM invitations WHERE event_id = ? ORDER BY created_at DESC').all(eventId);
}

function getInvitationByToken(token) {
  return getDB().prepare('SELECT * FROM invitations WHERE invite_token = ?').get(token);
}

function createInvitation(data) {
  const stmt = getDB().prepare(`
    INSERT INTO invitations (event_id, name, email, phone, invite_token)
    VALUES (@event_id, @name, @email, @phone, @invite_token)
  `);
  const info = stmt.run(data);
  return info.lastInsertRowid;
}

function markInvitationUsed(token) {
  getDB().prepare('UPDATE invitations SET used = 1 WHERE invite_token = ?').run(token);
}

function deleteInvitation(id) {
  getDB().prepare('DELETE FROM invitations WHERE id = ?').run(id);
}

module.exports = {
  getEvent,
  updateEvent,
  getAllGuests,
  getGuestById,
  getGuestByEditToken,
  getGuestByEmailOrPhone,
  createGuest,
  updateGuest,
  deleteGuest,
  getGuestStats,
  getAllInvitations,
  getInvitationByToken,
  createInvitation,
  markInvitationUsed,
  deleteInvitation
};
