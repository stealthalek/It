const db = require('./db/database');

async function logAudit(actorId, targetType, targetId, message) {
  let companyId = null;
  if (actorId) {
    const actor = await db.get('SELECT company_id FROM users WHERE id = ?', [actorId]);
    companyId = actor ? actor.company_id : null;
  }
  await db.run(
    'INSERT INTO audit_log (actor_id, target_type, target_id, message, company_id) VALUES (?, ?, ?, ?, ?)',
    [actorId || null, targetType || null, targetId || null, message, companyId]
  );
}

module.exports = { logAudit };
