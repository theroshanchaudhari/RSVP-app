const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInviteParams, buildInviteLink, createInviteMessage } = require('../app');

test('parseInviteParams reads personalized query params', () => {
  const invite = parseInviteParams('?guest=Roshan&event=Launch%20Party&date=2026-12-01&host=Team');
  assert.deepEqual(invite, {
    guest: 'Roshan',
    event: 'Launch Party',
    date: '2026-12-01',
    host: 'Team'
  });
});

test('parseInviteParams falls back to defaults', () => {
  const invite = parseInviteParams('');
  assert.deepEqual(invite, {
    guest: 'Guest',
    event: 'Our Celebration',
    date: 'Soon',
    host: 'Your Host'
  });
});

test('buildInviteLink creates shareable personalized link', () => {
  const link = buildInviteLink('https://example.com/index.html', {
    guest: 'Maya',
    event: 'RSVP Dinner',
    date: '2026-08-12',
    host: 'Asha'
  });

  assert.equal(
    link,
    'https://example.com/index.html?guest=Maya&event=RSVP+Dinner&date=2026-08-12&host=Asha'
  );
});

test('createInviteMessage renders readable invite text', () => {
  const message = createInviteMessage({
    guest: 'Maya',
    event: 'RSVP Dinner',
    date: '2026-08-12',
    host: 'Asha'
  });

  assert.equal(message, "Maya, you're invited to RSVP Dinner by Asha on 2026-08-12.");
});
