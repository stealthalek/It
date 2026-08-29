const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

const TYPES = ['laptop', 'desktop', 'monitor', 'telefono', 'altro'];
const STATUSES = ['disponibile', 'in_uso', 'in_riparazione', 'dismesso'];
const ASSIGNMENT_TYPES = ['permanente', 'prestito'];

const ASSET_SELECT = `
  SELECT a.*, u.name AS assignee_name
  FROM assets a
  LEFT JOIN users u ON u.id = a.assigned_to
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, q } = req.query;
    const clauses = [];
    const params = [];
    if (status && STATUSES.includes(status)) {
      clauses.push('a.status = ?');
      params.push(status);
    }
    if (q && q.trim()) {
      clauses.push('(a.name LIKE ? OR a.tag LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const assets = await db.all(`${ASSET_SELECT} ${where} ORDER BY a.created_at DESC`, params);
    res.json({ assets });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, assetType, tag, assignmentType, assignedTo, dueDate } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome dell\'asset è obbligatorio' });
    }
    const finalType = TYPES.includes(assetType) ? assetType : 'altro';
    const finalAssignmentType = ASSIGNMENT_TYPES.includes(assignmentType) ? assignmentType : 'permanente';

    const info = await db.run(
      `INSERT INTO assets (name, asset_type, tag, assignment_type, assigned_to, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        finalType,
        tag ? tag.trim() : null,
        finalAssignmentType,
        assignedTo || null,
        finalAssignmentType === 'prestito' && dueDate ? dueDate : null,
        assignedTo ? 'in_uso' : 'disponibile',
      ]
    );
    const asset = await db.get(`${ASSET_SELECT} WHERE a.id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ asset });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }

    const { status, assignmentType, assignedTo, dueDate } = req.body || {};
    const updates = [];
    const params = [];

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Stato non valido' });
      }
      updates.push('status = ?');
      params.push(status);
    }
    if (assignmentType !== undefined) {
      if (!ASSIGNMENT_TYPES.includes(assignmentType)) {
        return res.status(400).json({ error: 'Tipo di assegnazione non valido' });
      }
      updates.push('assignment_type = ?');
      params.push(assignmentType);
    }
    if (assignedTo !== undefined) {
      updates.push('assigned_to = ?');
      params.push(assignedTo || null);
      if (!assignedTo) {
        updates.push("status = 'disponibile'");
        updates.push('due_date = NULL');
      } else {
        updates.push("status = 'in_uso'");
      }
    }
    if (dueDate !== undefined) {
      updates.push('due_date = ?');
      params.push(dueDate || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${ASSET_SELECT} WHERE a.id = ?`, [req.params.id]);
    res.json({ asset: updated });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await db.run('DELETE FROM assets WHERE id = ?', [req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    res.status(204).end();
  })
);

module.exports = router;
