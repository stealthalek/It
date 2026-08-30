const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

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
    const { status, q, assignedTo } = req.query;
    const clauses = [];
    const params = [];
    if (status && STATUSES.includes(status)) {
      clauses.push('a.status = ?');
      params.push(status);
    }
    if (assignedTo && /^\d+$/.test(assignedTo)) {
      clauses.push('a.assigned_to = ?');
      params.push(Number(assignedTo));
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
    logAudit(req.user.id, 'asset', asset.id, `Creato asset "${asset.name}"${asset.assignee_name ? `, assegnato a "${asset.assignee_name}"` : ''}`).catch(() => {});
    res.status(201).json({ asset });
  })
);

router.patch(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { ids, status, assignmentType, tagPrefix } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => Number.isInteger(id))) {
      return res.status(400).json({ error: 'Elenco asset non valido' });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    if (assignmentType !== undefined && !ASSIGNMENT_TYPES.includes(assignmentType)) {
      return res.status(400).json({ error: 'Tipo di assegnazione non valido' });
    }
    const trimmedPrefix = tagPrefix && tagPrefix.trim();
    if (status === undefined && assignmentType === undefined && !trimmedPrefix) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(`SELECT id, tag FROM assets WHERE id IN (${placeholders})`, ids);

    await Promise.all(rows.map((row) => {
      const updates = [];
      const params = [];
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (assignmentType !== undefined) {
        updates.push('assignment_type = ?');
        params.push(assignmentType);
      }
      if (trimmedPrefix && row.tag) {
        const idx = row.tag.indexOf('-');
        const rest = idx >= 0 ? row.tag.slice(idx + 1) : row.tag;
        updates.push('tag = ?');
        params.push(`${trimmedPrefix}${rest}`);
      }
      if (!updates.length) return Promise.resolve();
      params.push(row.id);
      return db.run(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, params);
    }));

    const updated = await db.all(`${ASSET_SELECT} WHERE a.id IN (${placeholders})`, ids);
    logAudit(req.user.id, 'asset', null, `Modifica di massa su ${rows.length} asset`).catch(() => {});
    res.json({ assets: updated });
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
    logAudit(req.user.id, 'asset', updated.id, `Asset "${updated.name}" aggiornato${assignedTo !== undefined ? (updated.assignee_name ? `, assegnato a "${updated.assignee_name}"` : ', assegnazione rimossa') : ''}`).catch(() => {});
    res.json({ asset: updated });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const asset = await db.get('SELECT name FROM assets WHERE id = ?', [req.params.id]);
    const result = await db.run('DELETE FROM assets WHERE id = ?', [req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    logAudit(req.user.id, 'asset', Number(req.params.id), `Asset "${asset.name}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
