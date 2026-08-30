const db = require('./db/database');

async function logAudit(actorId, targetType, targetId, message) {
  await db.run(
    'INSERT INTO audit_log (actor_id, target_type, target_id, message) VALUES (?, ?, ?, ?)',
    [actorId || null, targetType || null, targetId || null, message]
  );
}

module.exports = { logAudit };
