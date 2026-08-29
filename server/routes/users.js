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

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.group_id, g.name AS group_name, gParent.name AS group_parent_name, u.created_at
  FROM users u
  LEFT JOIN groups g ON g.id = u.group_id
  LEFT JOIN groups gParent ON gParent.id = g.parent_id
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE u.is_super_admin = 0';
    const users = await db.all(`${USER_SELECT} ${where} ORDER BY u.name ASC`);
    res.json({ users });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, email, role, groupId } = req.body || {};

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

    let finalGroupId = null;
    if (groupId) {
      const group = await db.get('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }

    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const hash = bcrypt.hashSync(tempPassword, 10);

    const info = await db.run('INSERT INTO users (name, email, password, role, group_id) VALUES (?, ?, ?, ?, ?)', [
      name.trim(),
      email.toLowerCase(),
      hash,
      role,
      finalGroupId,
    ]);

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [Number(info.lastInsertRowid)]);
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

    const target = await db.get('SELECT is_super_admin FROM users WHERE id = ?', [req.params.id]);
    if (target && target.is_super_admin && !req.user.is_super_admin) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const result = await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    res.json({ user });
  })
);

router.patch(
  '/:id/group',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin FROM users WHERE id = ?', [req.params.id]);
    if (target && target.is_super_admin && !req.user.is_super_admin) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const { groupId } = req.body || {};
    let finalGroupId = null;
    if (groupId) {
      const group = await db.get('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }

    const result = await db.run('UPDATE users SET group_id = ? WHERE id = ?', [finalGroupId, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    res.json({ user });
  })
);

module.exports = router;
