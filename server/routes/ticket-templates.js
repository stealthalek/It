const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TYPES = ['incident', 'task'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE company_id IS NULL OR company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const templates = await db.all(`SELECT * FROM ticket_templates ${where} ORDER BY position ASC, id ASC`, params);
    res.json({ templates });
  })
);

router.post(
  '/',
  requirePermission('templates_manage'),
  asyncHandler(async (req, res) => {
    const { name, category, subject, description, priority, type } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del modello è obbligatorio' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'L\'oggetto è obbligatorio' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descrizione è obbligatoria' });
    }
    if (priority && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Priorità non valida' });
    }
    if (type && !TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo non valido' });
    }

    const posRow = await db.get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM ticket_templates');
    const info = await db.run(
      'INSERT INTO ticket_templates (name, category, subject, description, priority, type, position, created_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name.trim(), category && category.trim() ? category.trim() : null, subject.trim(), description.trim(),
        priority || null, type || null, posRow.maxPos + 1, req.user.id, req.user.company_id || null,
      ]
    );

    const template = await db.get('SELECT * FROM ticket_templates WHERE id = ?', [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'ticket_template', template.id, `Creato modello ticket "${template.name}"`).catch(() => {});
    res.status(201).json({ template });
  })
);

router.delete(
  '/:id',
  requirePermission('templates_manage'),
  asyncHandler(async (req, res) => {
    const template = await db.get('SELECT name, company_id FROM ticket_templates WHERE id = ?', [req.params.id]);
    if (!template || (!req.user.is_super_admin && template.company_id && template.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Modello non trovato' });
    }
    await db.run('DELETE FROM ticket_templates WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'ticket_template', Number(req.params.id), `Modello ticket "${template.name}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
