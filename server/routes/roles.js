const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { ALL_PERMISSIONS } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

const ROLE_SELECT = 'SELECT id, key, label_it, label_en, color, read_only, permissions, created_at FROM roles';

function serializeRole(row) {
  return { ...row, permissions: JSON.parse(row.permissions || '[]'), read_only: !!row.read_only };
}

function parsePermissions(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((key) => ALL_PERMISSIONS.includes(key));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE company_id IS NULL OR company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const rows = await db.all(`${ROLE_SELECT} ${where} ORDER BY label_it ASC`, params);
    res.json({ roles: rows.map(serializeRole), permissions: ALL_PERMISSIONS });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { key, labelIt, labelEn, color, readOnly, permissions } = req.body || {};
    if (!key || !key.trim() || !labelIt || !labelIt.trim() || !labelEn || !labelEn.trim()) {
      return res.status(400).json({ error: 'Chiave e nomi (IT/EN) obbligatori' });
    }
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const existing = await db.get('SELECT id FROM roles WHERE key = ?', [cleanKey]);
    if (existing) {
      return res.status(409).json({ error: 'Chiave già esistente' });
    }
    const info = await db.run(
      'INSERT INTO roles (key, label_it, label_en, color, read_only, permissions, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanKey, labelIt.trim(), labelEn.trim(), color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8f2436', readOnly ? 1 : 0, JSON.stringify(parsePermissions(permissions)), req.user.company_id || null]
    );
    const role = await db.get(`${ROLE_SELECT} WHERE id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'role', role.id, `Creato ruolo "${role.label_it}"`).catch(() => {});
    res.status(201).json({ role: serializeRole(role) });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!existing || (!req.user.is_super_admin && existing.company_id && existing.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Ruolo non trovato' });
    }

    const { labelIt, labelEn, color, readOnly, permissions } = req.body || {};
    const updates = [];
    const params = [];
    if (labelIt !== undefined) {
      if (!labelIt.trim()) return res.status(400).json({ error: 'Nome (IT) obbligatorio' });
      updates.push('label_it = ?');
      params.push(labelIt.trim());
    }
    if (labelEn !== undefined) {
      if (!labelEn.trim()) return res.status(400).json({ error: 'Nome (EN) obbligatorio' });
      updates.push('label_en = ?');
      params.push(labelEn.trim());
    }
    if (color !== undefined && /^#[0-9a-fA-F]{6}$/.test(color)) {
      updates.push('color = ?');
      params.push(color);
    }
    if (readOnly !== undefined) {
      updates.push('read_only = ?');
      params.push(readOnly ? 1 : 0);
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(parsePermissions(permissions)));
    }
    if (!updates.length) return res.status(400).json({ error: 'Nessuna modifica valida fornita' });

    params.push(req.params.id);
    await db.run(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${ROLE_SELECT} WHERE id = ?`, [req.params.id]);
    logAudit(req.user.id, 'role', updated.id, `Ruolo "${updated.label_it}" aggiornato`).catch(() => {});
    res.json({ role: serializeRole(updated) });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!existing || (!req.user.is_super_admin && existing.company_id && existing.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Ruolo non trovato' });
    }
    await db.run('DELETE FROM roles WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'role', Number(req.params.id), `Ruolo "${existing.label_it}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
