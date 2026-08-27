const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all();
  res.json({ categories });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome della categoria è obbligatorio' });
  }

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim());
  if (existing) {
    return res.status(409).json({ error: 'Categoria già esistente' });
  }

  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim());
  const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ category });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'Categoria non trovata' });
  }

  const inUse = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE category = ?').get(category.name).n;
  if (inUse > 0) {
    return res.status(400).json({ error: 'Categoria in uso su uno o più ticket, non può essere eliminata' });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
