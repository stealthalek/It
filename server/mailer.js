const nodemailer = require('nodemailer');
const db = require('./db/database');
const { formatTicketNumber } = require('./lib/ticketNumber');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, text, html });
}

async function getOrgName() {
  try {
    const row = await db.get('SELECT org_name FROM app_settings WHERE id = 1');
    return (row && row.org_name) || 'Ticketing';
  } catch {
    return 'Ticketing';
  }
}

const STRINGS = {
  it: {
    resolvedSubject: (id, subject) => `Ticket ${formatTicketNumber(id)} risolto: ${subject}`,
    resolvedText: (name, id, subject, org) => [
      `Ciao ${name || ''},`,
      '',
      `il tuo ticket ${formatTicketNumber(id)} "${subject}" è stato contrassegnato come risolto.`,
      'Se il problema persiste puoi riaprirlo direttamente dalla piattaforma di ticketing.',
      '',
      `— ${org}`,
    ].join('\n'),
    inviteSubject: (org) => `Il tuo accesso a ${org}`,
    inviteText: (name, email, tempPassword, org) => [
      `Ciao ${name},`,
      '',
      `è stato creato per te un account su ${org}.`,
      '',
      `Email di accesso: ${email}`,
      `Password temporanea: ${tempPassword}`,
      '',
      'Accedi e cambia la password dal tuo profilo appena possibile.',
      '',
      `— ${org}`,
    ].join('\n'),
    resetSubject: (org) => `La tua password su ${org} è stata reimpostata`,
    resetText: (name, tempPassword, org) => [
      `Ciao ${name},`,
      '',
      `la tua password su ${org} è stata reimpostata da un amministratore.`,
      '',
      `Nuova password temporanea: ${tempPassword}`,
      '',
      'Accedi e cambiala dal tuo profilo appena possibile. Se non hai richiesto questa modifica, contatta subito un amministratore.',
      '',
      `— ${org}`,
    ].join('\n'),
  },
  en: {
    resolvedSubject: (id, subject) => `Ticket ${formatTicketNumber(id)} resolved: ${subject}`,
    resolvedText: (name, id, subject, org) => [
      `Hi ${name || ''},`,
      '',
      `your ticket ${formatTicketNumber(id)} "${subject}" has been marked as resolved.`,
      'If the issue persists, you can reopen it directly from the ticketing platform.',
      '',
      `— ${org}`,
    ].join('\n'),
    inviteSubject: (org) => `Your access to ${org}`,
    inviteText: (name, email, tempPassword, org) => [
      `Hi ${name},`,
      '',
      `an account has been created for you on ${org}.`,
      '',
      `Login email: ${email}`,
      `Temporary password: ${tempPassword}`,
      '',
      'Sign in and change your password from your profile as soon as possible.',
      '',
      `— ${org}`,
    ].join('\n'),
    resetSubject: (org) => `Your password on ${org} has been reset`,
    resetText: (name, tempPassword, org) => [
      `Hi ${name},`,
      '',
      `your password on ${org} has been reset by an administrator.`,
      '',
      `New temporary password: ${tempPassword}`,
      '',
      'Sign in and change it from your profile as soon as possible. If you did not request this, contact an administrator immediately.',
      '',
      `— ${org}`,
    ].join('\n'),
  },
};

function strings(locale) {
  return STRINGS[locale] || STRINGS.it;
}

async function notifyTicketResolved(ticket) {
  if (!ticket.creator_email) return;
  const org = await getOrgName();
  const s = strings(ticket.creator_locale);
  await sendMail({
    to: ticket.creator_email,
    subject: s.resolvedSubject(ticket.id, ticket.subject),
    text: s.resolvedText(ticket.creator_name, ticket.id, ticket.subject, org),
  });
}

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

async function sendInvite(user, tempPassword) {
  if (!user.email) return;
  const org = await getOrgName();
  const s = strings(user.locale);
  const locale = STRINGS[user.locale] ? user.locale : 'it';
  const custom = await db.get(
    `SELECT invite_subject_${locale} AS subject, invite_body_${locale} AS body FROM app_settings WHERE id = 1`
  );
  const vars = { name: user.name, email: user.email, password: tempPassword, org };
  const subject = custom?.subject ? fillTemplate(custom.subject, vars) : s.inviteSubject(org);
  const text = custom?.body ? fillTemplate(custom.body, vars) : s.inviteText(user.name, user.email, tempPassword, org);
  await sendMail({ to: user.email, subject, text });
}

async function sendPasswordReset(user, tempPassword) {
  if (!user.email) return;
  const org = await getOrgName();
  const s = strings(user.locale);
  await sendMail({
    to: user.email,
    subject: s.resetSubject(org),
    text: s.resetText(user.name, tempPassword, org),
  });
}

module.exports = { sendMail, notifyTicketResolved, sendInvite, sendPasswordReset, isConfigured };
