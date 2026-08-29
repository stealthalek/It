const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await db.all(
      'SELECT id, ticket_id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    const unread = await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ notifications, unreadCount: unread.n });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ ok: true });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const result = await db.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Notifica non trovata' });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
