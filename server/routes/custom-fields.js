const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const FIELD_TYPES = ['text', 'number', 'textarea', 'select', 'checkbox'];

const FIELD_SELECT = `
  SELECT f.id, f.name, f.field_type, f.options, f.category_id, f.required, f.position, cat.name AS category_name
  FROM custom_fields f
  LEFT JOIN categories cat ON cat.id = f.category_id
`;

function parseOptions(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function serializeField(field) {
  return { ...field, options: parseOptions(field.options) };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE f.company_id IS NULL OR f.company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const fields = await db.all(`${FIELD_SELECT} ${where} ORDER BY f.position ASC, f.id ASC`, params);
    res.json({ fields: fields.map(serializeField) });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, fieldType, options, categoryId, required } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del campo è obbligatorio' });
    }
    if (!FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ error: 'Tipo di campo non valido' });
    }
    if (fieldType === 'select' && (!Array.isArray(options) || options.filter((o) => o && o.trim()).length < 2)) {
      return res.status(400).json({ error: 'Le opzioni a scelta richiedono almeno due valori' });
    }

    let finalCategoryId = null;
    if (categoryId) {
      const category = await db.get('SELECT id, company_id FROM categories WHERE id = ?', [categoryId]);
      if (!category || (!req.user.is_super_admin && category.company_id && category.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Categoria non valida' });
      }
      finalCategoryId = category.id;
    }

    const posRow = await db.get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM custom_fields');
    const info = await db.run(
      'INSERT INTO custom_fields (name, field_type, options, category_id, required, position, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        name.trim(),
        fieldType,
        fieldType === 'select' ? JSON.stringify(options.map((o) => o.trim()).filter(Boolean)) : null,
        finalCategoryId,
        required ? 1 : 0,
        posRow.maxPos + 1,
        req.user.company_id || null,
      ]
    );

    const field = await db.get(`${FIELD_SELECT} WHERE f.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'custom_field', field.id, `Creato campo personalizzato "${field.name}"`).catch(() => {});
    res.status(201).json({ field: serializeField(field) });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const field = await db.get('SELECT name, company_id FROM custom_fields WHERE id = ?', [req.params.id]);
    if (!field || (!req.user.is_super_admin && field.company_id && field.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Campo non trovato' });
    }
    await db.run('DELETE FROM custom_fields WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'custom_field', Number(req.params.id), `Campo personalizzato "${field.name}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
