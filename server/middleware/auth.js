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
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [payload.sub]);
    if (!user) {
      return res.status(401).json({ error: 'Utente non valido' });
    }
    req.user = user;
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
