const nodemailer = require('nodemailer');

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

async function notifyTicketResolved(ticket) {
  if (!ticket.creator_email) return;
  const subject = `Ticket #${ticket.id} risolto: ${ticket.subject}`;
  const text = [
    `Ciao ${ticket.creator_name || ''},`,
    '',
    `il tuo ticket #${ticket.id} "${ticket.subject}" è stato contrassegnato come risolto.`,
    'Se il problema persiste puoi riaprirlo direttamente dalla piattaforma di ticketing.',
  ].join('\n');
  await sendMail({ to: ticket.creator_email, subject, text });
}

module.exports = { sendMail, notifyTicketResolved, isConfigured };
