const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { resolvePermissions } = require('../lib/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }

  try {
    const row = await db.get(
      `SELECT u.id, u.name, u.email, u.role, u.is_super_admin, u.group_id, u.totp_enabled, u.role_id,
         r.label_it AS role_label_it, r.label_en AS role_label_en, r.color AS role_color,
         r.read_only AS role_read_only, r.permissions AS role_permissions_json,
         (SELECT COUNT(*) FROM users r2 WHERE r2.manager_id = u.id) > 0 AS is_manager,
         s.revoked AS session_revoked
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_sessions s ON s.id = ?
       WHERE u.id = ?`,
      [payload.sid || null, payload.sub]
    );
    if (!row) {
      return res.status(401).json({ error: 'Utente non valido' });
    }
    if (payload.sid && (row.session_revoked === null || row.session_revoked === 1)) {
      return res.status(401).json({ error: 'Sessione scaduta, effettua di nuovo l\'accesso' });
    }
    delete row.session_revoked;
    row.role_permissions = row.role_permissions_json ? JSON.parse(row.role_permissions_json) : [];
    row.read_only = !!row.role_read_only;
    delete row.role_permissions_json;
    delete row.role_read_only;
    row.permissions = resolvePermissions(row);
    req.user = row;
    req.sessionId = payload.sid || null;
    if (payload.sid) {
      db.run(
        "UPDATE user_sessions SET last_active_at = datetime('now') WHERE id = ? AND last_active_at < datetime('now', '-5 minutes')",
        [payload.sid]
      ).catch(() => {});
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, JWT_SECRET };
