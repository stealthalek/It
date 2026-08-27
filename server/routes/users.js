const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ROLES = ['customer', 'agent', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', requireRole('agent', 'admin'), (req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name ASC')
    .all();
  res.json({ users });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, email, role } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome è obbligatorio' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }
  if (!['agent', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Ruolo non valido: usa agent o admin' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Email già registrata' });
  }

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const hash = bcrypt.hashSync(tempPassword, 10);

  const info = db
    .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), hash, role);

  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user, tempPassword });
});

router.patch('/:id/role', requireRole('admin'), (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Ruolo non valido' });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Non puoi modificare il tuo stesso ruolo' });
  }

  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

module.exports = router;
