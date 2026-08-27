const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ROLES = ['customer', 'agent', 'admin'];

// GET /api/users - staff only, used for assignment dropdowns and admin panel
router.get('/', requireRole('agent', 'admin'), (req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name ASC')
    .all();
  res.json({ users });
});

// PATCH /api/users/:id/role - admin only
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
