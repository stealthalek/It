const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
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
    const responses = await db.all(`${RESPONSE_SELECT} ORDER BY r.title ASC`);
    res.json({ responses });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { title, body } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Il testo della risposta è obbligatorio' });
    }

    const info = await db.run('INSERT INTO canned_responses (title, body, created_by) VALUES (?, ?, ?)', [
      title.trim(),
      body.trim(),
      req.user.id,
    ]);
    const response = await db.get(`${RESPONSE_SELECT} WHERE r.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'canned_response', response.id, `Creata risposta rapida "${response.title}"`).catch(() => {});
    res.status(201).json({ response });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const response = await db.get('SELECT title FROM canned_responses WHERE id = ?', [req.params.id]);
    if (!response) return res.status(404).json({ error: 'Risposta rapida non trovata' });
    await db.run('DELETE FROM canned_responses WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'canned_response', Number(req.params.id), `Risposta rapida "${response.title}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
