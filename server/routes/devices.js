const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const TYPES = ['laptop', 'desktop', 'telefono', 'tablet', 'altro'];
const STATUSES = ['in_uso', 'in_magazzino', 'in_riparazione', 'dismesso'];

const DEVICE_SELECT = `
  SELECT d.*, u.name AS assignee_name
  FROM devices d
  LEFT JOIN users u ON u.id = d.assigned_to
`;

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, type, assigned, q } = req.query;
    const clauses = [];
    const params = [];

    if (!isStaff(req.user)) {
      clauses.push('d.assigned_to = ?');
      params.push(req.user.id);
    } else if (assigned === 'unassigned') {
      clauses.push('d.assigned_to IS NULL');
    } else if (assigned) {
      clauses.push('d.assigned_to = ?');
      params.push(assigned);
    }

    if (status && STATUSES.includes(status)) {
      clauses.push('d.status = ?');
      params.push(status);
    }
    if (type && TYPES.includes(type)) {
      clauses.push('d.type = ?');
      params.push(type);
    }
    if (q && q.trim()) {
      clauses.push('(d.name LIKE ? OR d.asset_tag LIKE ? OR d.serial_number LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const devices = await db.all(`${DEVICE_SELECT} ${where} ORDER BY d.name ASC`, params);
    res.json({ devices });
  })
);

router.post(
  '/',
  requireRole('agent', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, asset_tag, type, os, serial_number, status, assigned_to, notes } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del dispositivo è obbligatorio' });
    }
    const finalType = TYPES.includes(type) ? type : 'altro';
    const finalStatus = STATUSES.includes(status) ? status : 'in_uso';

    let finalAssignedTo = null;
    if (assigned_to) {
      const user = await db.get('SELECT id FROM users WHERE id = ?', [assigned_to]);
      if (!user) return res.status(400).json({ error: 'Utente assegnatario non valido' });
      finalAssignedTo = user.id;
    }

    const info = await db.run(
      `INSERT INTO devices (name, asset_tag, type, os, serial_number, status, assigned_to, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        (asset_tag || '').trim() || null,
        finalType,
        (os || '').trim() || null,
        (serial_number || '').trim() || null,
        finalStatus,
        finalAssignedTo,
        (notes || '').trim(),
      ]
    );

    const device = await db.get(`${DEVICE_SELECT} WHERE d.id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ device });
  })
);

router.patch(
  '/:id',
  requireRole('agent', 'admin'),
  asyncHandler(async (req, res) => {
    const device = await db.get('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (!device) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }

    const body = req.body || {};
    const updates = [];
    const params = [];

    if (body.name !== undefined && body.name.trim()) {
      updates.push('name = ?');
      params.push(body.name.trim());
    }
    if (body.asset_tag !== undefined) {
      updates.push('asset_tag = ?');
      params.push(body.asset_tag.trim() || null);
    }
    if (body.type !== undefined && TYPES.includes(body.type)) {
      updates.push('type = ?');
      params.push(body.type);
    }
    if (body.os !== undefined) {
      updates.push('os = ?');
      params.push(body.os.trim() || null);
    }
    if (body.serial_number !== undefined) {
      updates.push('serial_number = ?');
      params.push(body.serial_number.trim() || null);
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return res.status(400).json({ error: 'Stato non valido' });
      }
      updates.push('status = ?');
      params.push(body.status);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(body.notes.trim());
    }
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === null) {
        updates.push('assigned_to = NULL');
      } else {
        const user = await db.get('SELECT id FROM users WHERE id = ?', [body.assigned_to]);
        if (!user) return res.status(400).json({ error: 'Utente assegnatario non valido' });
        updates.push('assigned_to = ?');
        params.push(user.id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await db.run(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await db.get(`${DEVICE_SELECT} WHERE d.id = ?`, [req.params.id]);
    res.json({ device: updated });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await db.run('DELETE FROM devices WHERE id = ?', [req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Dispositivo non trovato' });
    }
    res.status(204).end();
  })
);

module.exports = router;
