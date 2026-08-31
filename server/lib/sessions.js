const crypto = require('crypto');
const db = require('../db/database');

async function createSession(userId, req) {
  const id = crypto.randomUUID();
  const userAgent = (req.headers['user-agent'] || '').slice(0, 255) || null;
  const ipAddress = req.ip || null;
  await db.run('INSERT INTO user_sessions (id, user_id, user_agent, ip_address) VALUES (?, ?, ?, ?)', [
    id,
    userId,
    userAgent,
    ipAddress,
  ]);
  return id;
}

async function listSessions(userId) {
  return db.all(
    'SELECT id, user_agent, ip_address, created_at, last_active_at FROM user_sessions WHERE user_id = ? AND revoked = 0 ORDER BY last_active_at DESC',
    [userId]
  );
}

async function revokeSession(userId, sessionId) {
  const result = await db.run('UPDATE user_sessions SET revoked = 1 WHERE id = ? AND user_id = ?', [sessionId, userId]);
  return result.rowsAffected > 0;
}

async function revokeOtherSessions(userId, keepSessionId) {
  await db.run('UPDATE user_sessions SET revoked = 1 WHERE user_id = ? AND id != ?', [userId, keepSessionId]);
}

async function revokeAllSessions(userId) {
  await db.run('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?', [userId]);
}

module.exports = { createSession, listSessions, revokeSession, revokeOtherSessions, revokeAllSessions };
