const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await db.all('SELECT id, name FROM categories ORDER BY name ASC');
    res.json({ categories });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome della categoria è obbligatorio' });
    }

    const existing = await db.get('SELECT id FROM categories WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Categoria già esistente' });
    }

    const info = await db.run('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    const category = await db.get('SELECT id, name FROM categories WHERE id = ?', [Number(info.lastInsertRowid)]);
    res.status(201).json({ category });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category) {
      return res.status(404).json({ error: 'Categoria non trovata' });
    }

    const inUse = await db.get('SELECT COUNT(*) AS n FROM tickets WHERE category = ?', [category.name]);
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Categoria in uso su uno o più ticket, non può essere eliminata' });
    }

    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
