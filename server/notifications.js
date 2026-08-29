const db = require('./db/database');
const realtime = require('./realtime');

async function notifyUser(userId, ticketId, message) {
  if (!userId) return;
  let text = message;
  if (message && typeof message === 'object') {
    const user = await db.get('SELECT locale FROM users WHERE id = ?', [userId]);
    const locale = user && user.locale === 'en' ? 'en' : 'it';
    text = message[locale] || message.it || message.en;
  }
  const info = await db.run(
    'INSERT INTO notifications (user_id, ticket_id, message) VALUES (?, ?, ?)',
    [userId, ticketId, text]
  );
  const notification = await db.get(
    'SELECT id, ticket_id, message, is_read, created_at FROM notifications WHERE id = ?',
    [Number(info.lastInsertRowid)]
  );
  realtime.broadcastNotification(userId, notification);
}

module.exports = { notifyUser };
