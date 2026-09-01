const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

const RESPONSE_SELECT = `
  SELECT r.id, r.title, r.body, r.created_at, u.name AS created_by_name
  FROM canned_responses r
  LEFT JOIN users u ON u.id = r.created_by
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE r.company_id IS NULL OR r.company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const responses = await db.all(`${RESPONSE_SELECT} ${where} ORDER BY r.title ASC`, params);
    res.json({ responses });
  })
);

router.post(
  '/',
  requirePermission('canned_responses_manage'),
  asyncHandler(async (req, res) => {
    const { title, body } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Il testo della risposta è obbligatorio' });
    }

    const info = await db.run('INSERT INTO canned_responses (title, body, created_by, company_id) VALUES (?, ?, ?, ?)', [
      title.trim(),
      body.trim(),
      req.user.id,
      req.user.company_id || null,
    ]);
    const response = await db.get(`${RESPONSE_SELECT} WHERE r.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'canned_response', response.id, `Creata risposta rapida "${response.title}"`).catch(() => {});
    res.status(201).json({ response });
  })
);

router.delete(
  '/:id',
  requirePermission('canned_responses_manage'),
  asyncHandler(async (req, res) => {
    const response = await db.get('SELECT title, company_id FROM canned_responses WHERE id = ?', [req.params.id]);
    if (!response || (!req.user.is_super_admin && response.company_id && response.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Risposta rapida non trovata' });
    }
    await db.run('DELETE FROM canned_responses WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'canned_response', Number(req.params.id), `Risposta rapida "${response.title}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
