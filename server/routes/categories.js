const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const CATEGORY_SELECT = 'SELECT id, name, icon, default_group_id FROM categories';

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await db.all(`${CATEGORY_SELECT} ORDER BY name ASC`);
    res.json({ categories });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, icon, defaultGroupId } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome della categoria è obbligatorio' });
    }

    const existing = await db.get('SELECT id FROM categories WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Categoria già esistente' });
    }

    let finalGroupId = null;
    if (defaultGroupId) {
      const group = await db.get('SELECT id FROM groups WHERE id = ?', [defaultGroupId]);
      if (!group) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }

    const info = await db.run('INSERT INTO categories (name, icon, default_group_id) VALUES (?, ?, ?)', [
      name.trim(),
      icon && icon.trim() ? icon.trim() : 'ticket',
      finalGroupId,
    ]);
    const category = await db.get(`${CATEGORY_SELECT} WHERE id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ category });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category) {
      return res.status(404).json({ error: 'Categoria non trovata' });
    }

    const updates = [];
    const params = [];
    const { icon, defaultGroupId } = req.body || {};

    if (icon !== undefined && icon.trim()) {
      updates.push('icon = ?');
      params.push(icon.trim());
    }
    if (defaultGroupId !== undefined) {
      if (defaultGroupId === null) {
        updates.push('default_group_id = NULL');
      } else {
        const group = await db.get('SELECT id FROM groups WHERE id = ?', [defaultGroupId]);
        if (!group) {
          return res.status(400).json({ error: 'Gruppo non valido' });
        }
        updates.push('default_group_id = ?');
        params.push(group.id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${CATEGORY_SELECT} WHERE id = ?`, [req.params.id]);
    res.json({ category: updated });
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
