const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { loadHolidays } = require('../sla');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE company_id IS NULL OR company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const holidays = await db.all(`SELECT * FROM holidays ${where} ORDER BY date ASC`, params);
    res.json({ holidays });
  })
);

router.post(
  '/',
  requirePermission('holidays_manage'),
  asyncHandler(async (req, res) => {
    const { date, name } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Data non valida (formato AAAA-MM-GG)' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome della festività è obbligatorio' });
    }

    const companyId = req.user.company_id || null;
    const existing = await db.get(
      'SELECT id FROM holidays WHERE date = ? AND (company_id IS NULL OR company_id = ?)',
      [date, companyId]
    );
    if (existing) {
      return res.status(409).json({ error: 'Data già presente nel calendario' });
    }

    const info = await db.run('INSERT INTO holidays (date, name, company_id) VALUES (?, ?, ?)', [date, name.trim(), companyId]);
    const holiday = await db.get('SELECT * FROM holidays WHERE id = ?', [Number(info.lastInsertRowid)]);
    await loadHolidays();
    logAudit(req.user.id, 'holiday', holiday.id, `Aggiunta festività "${holiday.name}" (${holiday.date})`).catch(() => {});
    res.status(201).json({ holiday });
  })
);

router.delete(
  '/:id',
  requirePermission('holidays_manage'),
  asyncHandler(async (req, res) => {
    const holiday = await db.get('SELECT * FROM holidays WHERE id = ?', [req.params.id]);
    if (!holiday || (!req.user.is_super_admin && holiday.company_id && holiday.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Festività non trovata' });
    }
    await db.run('DELETE FROM holidays WHERE id = ?', [req.params.id]);
    await loadHolidays();
    logAudit(req.user.id, 'holiday', Number(req.params.id), `Rimossa festività "${holiday.name}" (${holiday.date})`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
