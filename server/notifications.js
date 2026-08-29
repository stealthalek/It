const db = require('./db/database');
const realtime = require('./realtime');

async function notifyUser(userId, ticketId, message) {
  if (!userId) return;
  const info = await db.run(
    'INSERT INTO notifications (user_id, ticket_id, message) VALUES (?, ?, ?)',
    [userId, ticketId, message]
  );
  const notification = await db.get(
    'SELECT id, ticket_id, message, is_read, created_at FROM notifications WHERE id = ?',
    [Number(info.lastInsertRowid)]
  );
  realtime.broadcastNotification(userId, notification);
}

module.exports = { notifyUser };
