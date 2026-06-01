'use strict';

const nodemailer = require('nodemailer');
const { getEvent, getAllGuests, getGuestStats } = require('../models/queries');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM = process.env.EMAIL_FROM || 'RSVP App <noreply@rsvp-app.com>';

async function sendConfirmationEmail(guest, event) {
  if (!guest.email || !process.env.SMTP_USER) return;

  const transporter = createTransport();
  const editUrl = `${APP_URL}/rsvp/edit/${guest.edit_token}`;

  const attendingText = guest.attending === 'yes'
    ? `We're thrilled you're coming!`
    : guest.attending === 'no'
      ? `We're sorry you can't make it.`
      : `We'll keep your spot tentative.`;

  const guestInfo = guest.attending === 'yes' ? `
    <p><strong>Your RSVP Details:</strong></p>
    <ul>
      <li>Guests: ${guest.adults} adult(s), ${guest.children} child(ren)</li>
      ${guest.meal_preference ? `<li>Meal Preference: ${guest.meal_preference}</li>` : ''}
      ${guest.dietary_restrictions ? `<li>Dietary Restrictions: ${guest.dietary_restrictions}</li>` : ''}
      ${guest.arrival_time ? `<li>Estimated Arrival: ${guest.arrival_time}</li>` : ''}
    </ul>
  ` : '';

  await transporter.sendMail({
    from: FROM,
    to: guest.email,
    subject: `RSVP Confirmation – ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">RSVP Confirmed – ${event.name}</h2>
        <p>Dear ${guest.name},</p>
        <p>${attendingText}</p>
        ${event.date ? `<p><strong>Event Date:</strong> ${event.date}${event.time ? ' at ' + event.time : ''}</p>` : ''}
        ${event.venue_name ? `<p><strong>Venue:</strong> ${event.venue_name}${event.venue_address ? ', ' + event.venue_address : ''}</p>` : ''}
        ${guestInfo}
        <p>Need to make changes? <a href="${editUrl}" style="color: #7c3aed;">Edit your RSVP here</a></p>
        ${event.rsvp_deadline ? `<p><em>RSVP Deadline: ${event.rsvp_deadline}</em></p>` : ''}
        <hr/>
        <p style="color: #666; font-size: 12px;">You're receiving this because you RSVP'd to ${event.name}.</p>
      </div>
    `
  });
}

async function sendHostNotification(guest, event) {
  if (!event.admin_email || !process.env.SMTP_USER) return;

  const transporter = createTransport();
  const attendingLabel = guest.attending === 'yes' ? '✅ Attending' : guest.attending === 'no' ? '❌ Not Attending' : '⏳ Maybe';

  await transporter.sendMail({
    from: FROM,
    to: event.admin_email,
    subject: `New RSVP: ${guest.name} – ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">New RSVP Received</h2>
        <p>A new RSVP has been submitted for <strong>${event.name}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.name}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.email || '-'}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.phone || '-'}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${attendingLabel}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Adults</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.adults}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Children</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.children}</td></tr>
          ${guest.meal_preference ? `<tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Meal</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.meal_preference}</td></tr>` : ''}
          ${guest.dietary_restrictions ? `<tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Dietary</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.dietary_restrictions}</td></tr>` : ''}
          ${guest.message ? `<tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Message</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${guest.message}</td></tr>` : ''}
        </table>
        <p><a href="${APP_URL}/admin/guests/${guest.id}" style="color: #7c3aed;">View in Admin Dashboard</a></p>
      </div>
    `
  });
}

async function sendReminderEmail(guest, event) {
  if (!guest.email || !process.env.SMTP_USER) return;
  if (guest.attending !== 'pending' && guest.attending !== null) return;

  const transporter = createTransport();
  const rsvpUrl = guest.invite_token
    ? `${APP_URL}/rsvp?token=${guest.invite_token}`
    : `${APP_URL}/rsvp`;

  await transporter.sendMail({
    from: FROM,
    to: guest.email,
    subject: `Reminder: Please RSVP for ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Don't forget to RSVP!</h2>
        <p>Dear ${guest.name},</p>
        <p>We haven't heard from you yet! Please let us know if you'll be joining us for <strong>${event.name}</strong>.</p>
        ${event.date ? `<p><strong>Date:</strong> ${event.date}${event.time ? ' at ' + event.time : ''}</p>` : ''}
        ${event.rsvp_deadline ? `<p><strong>RSVP Deadline:</strong> ${event.rsvp_deadline}</p>` : ''}
        <p><a href="${rsvpUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">RSVP Now</a></p>
      </div>
    `
  });
}

async function sendDailySummary() {
  const event = getEvent(1);
  if (!event || !event.admin_email || !process.env.SMTP_USER) return;

  const stats = getGuestStats(1);
  const recentGuests = getAllGuests(1).slice(0, 5);
  const transporter = createTransport();

  await transporter.sendMail({
    from: FROM,
    to: event.admin_email,
    subject: `Daily RSVP Summary – ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Daily RSVP Summary</h2>
        <p>Here's your daily update for <strong>${event.name}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Total RSVPs</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.total}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Attending</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.attending}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Not Attending</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.notAttending}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Pending</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.pending}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Total Adults</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.adults}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><strong>Total Children</strong></td><td style="padding: 6px; border: 1px solid #ddd;">${stats.children}</td></tr>
        </table>
        <p><a href="${APP_URL}/admin" style="color: #7c3aed;">View Full Dashboard</a></p>
      </div>
    `
  });
}

module.exports = {
  sendConfirmationEmail,
  sendHostNotification,
  sendReminderEmail,
  sendDailySummary
};
