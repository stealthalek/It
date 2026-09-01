const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const realtime = require('../realtime');

const router = express.Router();
router.use(authenticate);

function outOfScope(target, requester) {
  if (!target) return true;
  if (requester.is_super_admin || target.is_super_admin) return false;
  return target.company_id !== requester.company_id;
}

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const rows = await db.all(
      `SELECT
         other.id AS user_id, other.name AS user_name, other.email AS user_email,
         lm.body AS last_body, lm.created_at AS last_created_at, lm.sender_id AS last_sender_id,
         (SELECT COUNT(*) FROM direct_messages WHERE recipient_id = ? AND sender_id = other.id AND read_at IS NULL) AS unread_count
       FROM (
         SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS other_id, MAX(id) AS last_id
         FROM direct_messages
         WHERE sender_id = ? OR recipient_id = ?
         GROUP BY other_id
       ) t
       JOIN users other ON other.id = t.other_id
       JOIN direct_messages lm ON lm.id = t.last_id
       ORDER BY lm.created_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json({ conversations: rows });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT COUNT(*) AS n FROM direct_messages WHERE recipient_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ unreadCount: row.n });
  })
);

router.get(
  '/thread/:userId',
  asyncHandler(async (req, res) => {
    const other = await db.get('SELECT id, name, is_super_admin, company_id FROM users WHERE id = ?', [req.params.userId]);
    if (!other || outOfScope(other, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    const messages = await db.all(
      `SELECT id, sender_id, recipient_id, body, edited_at, created_at
       FROM direct_messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC`,
      [req.user.id, other.id, other.id, req.user.id]
    );
    await db.run(
      "UPDATE direct_messages SET read_at = datetime('now') WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL",
      [req.user.id, other.id]
    );
    res.json({ messages, otherUser: { id: other.id, name: other.name } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { recipientId, body } = req.body || {};
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Il messaggio non può essere vuoto' });
    }
    if (Number(recipientId) === req.user.id) {
      return res.status(400).json({ error: 'Non puoi inviare un messaggio a te stesso' });
    }
    const recipient = await db.get('SELECT id, company_id, is_super_admin FROM users WHERE id = ?', [recipientId]);
    if (!recipient || outOfScope(recipient, req.user)) {
      return res.status(404).json({ error: 'Destinatario non trovato' });
    }
    const trimmed = body.trim().slice(0, 2000);
    const info = await db.run(
      'INSERT INTO direct_messages (sender_id, recipient_id, body, company_id) VALUES (?, ?, ?, ?)',
      [req.user.id, recipient.id, trimmed, req.user.company_id || null]
    );
    const message = await db.get(
      'SELECT id, sender_id, recipient_id, body, edited_at, created_at FROM direct_messages WHERE id = ?',
      [Number(info.lastInsertRowid)]
    );
    const sender = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    realtime.broadcastDirectMessage(recipient.id, { ...message, sender_name: sender.name });
    res.status(201).json({ message });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM direct_messages WHERE id = ?', [req.params.id]);
    if (!existing || existing.sender_id !== req.user.id) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    const { body } = req.body || {};
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Il messaggio non può essere vuoto' });
    }
    const trimmed = body.trim().slice(0, 2000);
    await db.run("UPDATE direct_messages SET body = ?, edited_at = datetime('now') WHERE id = ?", [trimmed, req.params.id]);
    const message = await db.get(
      'SELECT id, sender_id, recipient_id, body, edited_at, created_at FROM direct_messages WHERE id = ?',
      [req.params.id]
    );
    realtime.broadcastDirectMessageEdit(existing.recipient_id, message);
    res.json({ message });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM direct_messages WHERE id = ?', [req.params.id]);
    if (!existing || existing.sender_id !== req.user.id) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    await db.run('DELETE FROM direct_messages WHERE id = ?', [req.params.id]);
    realtime.broadcastDirectMessageDelete(existing.recipient_id, { id: existing.id, senderId: existing.sender_id });
    res.status(204).end();
  })
);

module.exports = router;
