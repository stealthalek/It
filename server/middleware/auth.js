const jwt = require('jsonwebtoken');
const db = require('../db/database');

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
      `SELECT u.id, u.name, u.email, u.role, u.is_super_admin, u.group_id, u.totp_enabled,
         (SELECT COUNT(*) FROM users r WHERE r.manager_id = u.id) > 0 AS is_manager,
         s.revoked AS session_revoked
       FROM users u
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
