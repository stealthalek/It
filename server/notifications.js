const db = require('./db/database');
const realtime = require('./realtime');

async function notifyUser(userId, ticketId, message) {
  if (!userId) return;
  return notifyUsers([userId], ticketId, message);
}

async function notifyUsers(userIds, ticketId, message) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;

  const textById = new Map();
  if (message && typeof message === 'object') {
    const placeholders = ids.map(() => '?').join(',');
    const users = await db.all(`SELECT id, locale FROM users WHERE id IN (${placeholders})`, ids);
    const localeById = new Map(users.map((u) => [u.id, u.locale === 'en' ? 'en' : 'it']));
    for (const id of ids) {
      const locale = localeById.get(id) || 'it';
      textById.set(id, message[locale] || message.it || message.en);
    }
  } else {
    for (const id of ids) textById.set(id, message);
  }

  const insertValues = ids.map(() => '(?, ?, ?)').join(', ');
  const insertParams = ids.flatMap((id) => [id, ticketId, textById.get(id)]);
  const result = await db.run(
    `INSERT INTO notifications (user_id, ticket_id, message) VALUES ${insertValues} RETURNING id, user_id, ticket_id, message, is_read, created_at`,
    insertParams
  );
  for (const row of result.rows) {
    realtime.broadcastNotification(row.user_id, { id: row.id, ticket_id: row.ticket_id, message: row.message, is_read: row.is_read, created_at: row.created_at });
  }
}

module.exports = { notifyUser, notifyUsers };
