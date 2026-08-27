const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await db.all(
      `SELECT g.id, g.name, g.description, COUNT(u.id) AS member_count
       FROM groups g LEFT JOIN users u ON u.group_id = g.id
       GROUP BY g.id ORDER BY g.name ASC`
    );
    res.json({ groups });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del reparto è obbligatorio' });
    }

    const existing = await db.get('SELECT id FROM groups WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Reparto già esistente' });
    }

    const info = await db.run('INSERT INTO groups (name, description) VALUES (?, ?)', [
      name.trim(),
      (description || '').trim(),
    ]);
    const group = await db.get('SELECT id, name, description FROM groups WHERE id = ?', [Number(info.lastInsertRowid)]);
    res.status(201).json({ group });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Reparto non trovato' });
    }

    const inUse = await db.get('SELECT COUNT(*) AS n FROM users WHERE group_id = ?', [req.params.id]);
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Reparto in uso da uno o più utenti, non può essere eliminato' });
    }

    await db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
