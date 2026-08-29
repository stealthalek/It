const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const ROLES = ['customer', 'agent', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await db.all('SELECT id, name, email, role, team, created_at FROM users ORDER BY name ASC');
    res.json({ users });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, email, role, team } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    if (!['agent', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Ruolo non valido: usa agent o admin' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email già registrata' });
    }

    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const hash = bcrypt.hashSync(tempPassword, 10);
    const finalTeam = team && team.trim() ? team.trim() : null;

    const info = await db.run('INSERT INTO users (name, email, password, role, team) VALUES (?, ?, ?, ?, ?)', [
      name.trim(),
      email.toLowerCase(),
      hash,
      role,
      finalTeam,
    ]);

    const user = await db.get('SELECT id, name, email, role, team, created_at FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
    res.status(201).json({ user, tempPassword });
  })
);

router.patch(
  '/:id/role',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Ruolo non valido' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Non puoi modificare il tuo stesso ruolo' });
    }

    const result = await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get('SELECT id, name, email, role, team, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json({ user });
  })
);

router.patch(
  '/:id/team',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { team } = req.body || {};
    const finalTeam = team && team.trim() ? team.trim() : null;

    const result = await db.run('UPDATE users SET team = ? WHERE id = ?', [finalTeam, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get('SELECT id, name, email, role, team, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json({ user });
  })
);

module.exports = router;
