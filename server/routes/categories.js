const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const CATEGORY_SELECT = `
  SELECT
    cat.id, cat.name, cat.icon, cat.default_group_id, cat.parent_id,
    parent.name AS parent_name
  FROM categories cat
  LEFT JOIN categories parent ON parent.id = cat.parent_id
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE cat.company_id IS NULL OR cat.company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const categories = await db.all(`${CATEGORY_SELECT} ${where} ORDER BY cat.name ASC`, params);
    res.json({ categories });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, icon, defaultGroupId, parentId } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome della categoria è obbligatorio' });
    }

    const existing = await db.get('SELECT id FROM categories WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Categoria già esistente' });
    }

    let finalGroupId = null;
    if (defaultGroupId) {
      const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [defaultGroupId]);
      if (!group || (!req.user.is_super_admin && group.company_id && group.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }

    let finalParentId = null;
    if (parentId) {
      const parent = await db.get('SELECT id, parent_id, company_id FROM categories WHERE id = ?', [parentId]);
      if (!parent || (!req.user.is_super_admin && parent.company_id && parent.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Categoria principale non valida' });
      }
      if (parent.parent_id) {
        return res.status(400).json({ error: 'Non è possibile creare una sottocategoria di una sottocategoria' });
      }
      finalParentId = parent.id;
    }

    const info = await db.run('INSERT INTO categories (name, icon, default_group_id, parent_id, company_id) VALUES (?, ?, ?, ?, ?)', [
      name.trim(),
      icon && icon.trim() ? icon.trim() : 'ticket',
      finalGroupId,
      finalParentId,
      req.user.company_id || null,
    ]);
    const category = await db.get(`${CATEGORY_SELECT} WHERE cat.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'category', category.id, `Creata categoria "${category.name}"${category.parent_name ? ` sotto "${category.parent_name}"` : ''}`).catch(() => {});
    res.status(201).json({ category });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category || (!req.user.is_super_admin && category.company_id && category.company_id !== req.user.company_id)) {
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
        const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [defaultGroupId]);
        if (!group || (!req.user.is_super_admin && group.company_id && group.company_id !== req.user.company_id)) {
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
    const updated = await db.get(`${CATEGORY_SELECT} WHERE cat.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'category', updated.id, `Categoria "${updated.name}" aggiornata`).catch(() => {});
    res.json({ category: updated });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category || (!req.user.is_super_admin && category.company_id && category.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Categoria non trovata' });
    }

    const hasChildren = await db.get('SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?', [req.params.id]);
    if (hasChildren.n > 0) {
      return res.status(400).json({ error: 'Eliminare prima le sottocategorie' });
    }

    const inUse = await db.get('SELECT COUNT(*) AS n FROM tickets WHERE category = ?', [category.name]);
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Categoria in uso su uno o più ticket, non può essere eliminata' });
    }

    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'category', Number(req.params.id), `Categoria "${category.name}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
