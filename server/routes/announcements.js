const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const ANNOUNCEMENT_SELECT = `
  SELECT a.id, a.title, a.body, a.pinned, a.company_id, a.created_at, a.updated_at,
    u.name AS created_by_name,
    EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS is_read
  FROM announcements a
  LEFT JOIN users u ON u.id = a.created_by
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE a.company_id IS NULL OR a.company_id = ?';
    const params = req.user.is_super_admin ? [req.user.id] : [req.user.id, req.user.company_id];
    const announcements = await db.all(`${ANNOUNCEMENT_SELECT} ${where} ORDER BY a.pinned DESC, a.created_at DESC`, params);
    res.json({ announcements: announcements.map((a) => ({ ...a, pinned: !!a.pinned, is_read: !!a.is_read })) });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'AND (a.company_id IS NULL OR a.company_id = ?)';
    const params = req.user.is_super_admin ? [req.user.id] : [req.user.id, req.user.company_id];
    const row = await db.get(
      `SELECT COUNT(*) AS n FROM announcements a
       WHERE NOT EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) ${where}`,
      params
    );
    res.json({ unreadCount: row.n });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, req.params.id]);
    if (!announcement || (!req.user.is_super_admin && announcement.company_id && announcement.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    res.json({ announcement: { ...announcement, pinned: !!announcement.pinned, is_read: !!announcement.is_read } });
  })
);

router.post(
  '/',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const { title, body, pinned } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Il testo dell\'annuncio è obbligatorio' });
    }

    const companyId = req.user.company_id || null;
    const info = await db.run('INSERT INTO announcements (title, body, pinned, created_by, company_id) VALUES (?, ?, ?, ?, ?)', [
      title.trim(),
      body.trim(),
      pinned ? 1 : 0,
      req.user.id,
      companyId,
    ]);
    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'announcement', announcement.id, `Pubblicato annuncio "${announcement.title}"`).catch(() => {});
    res.status(201).json({ announcement: { ...announcement, pinned: !!announcement.pinned, is_read: !!announcement.is_read } });
  })
);

router.patch(
  '/:id',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
    if (!existing || (!req.user.is_super_admin && existing.company_id && existing.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }

    const { title, body, pinned } = req.body || {};
    const nextTitle = title !== undefined ? title.trim() : existing.title;
    const nextBody = body !== undefined ? body.trim() : existing.body;
    if (!nextTitle) return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    if (!nextBody) return res.status(400).json({ error: 'Il testo dell\'annuncio è obbligatorio' });

    await db.run("UPDATE announcements SET title = ?, body = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?", [
      nextTitle,
      nextBody,
      pinned !== undefined ? (pinned ? 1 : 0) : existing.pinned,
      req.params.id,
    ]);
    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, req.params.id]);
    logAudit(req.user.id, 'announcement', announcement.id, `Modificato annuncio "${announcement.title}"`).catch(() => {});
    res.json({ announcement: { ...announcement, pinned: !!announcement.pinned, is_read: !!announcement.is_read } });
  })
);

router.delete(
  '/:id',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT title, company_id FROM announcements WHERE id = ?', [req.params.id]);
    if (!existing || (!req.user.is_super_admin && existing.company_id && existing.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    await db.run('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'announcement', Number(req.params.id), `Annuncio "${existing.title}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const announcement = await db.get('SELECT id, company_id FROM announcements WHERE id = ?', [req.params.id]);
    if (!announcement || (!req.user.is_super_admin && announcement.company_id && announcement.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    await db.run('INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

module.exports = router;
