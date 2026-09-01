const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const ATTACHMENT_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/json',
]);

function attachmentMeta(row) {
  return {
    id: row.id, announcement_id: row.announcement_id, uploaded_by: row.uploaded_by,
    file_name: row.file_name, mime_type: row.mime_type, size_bytes: row.size_bytes,
    created_at: row.created_at, uploader_name: row.uploader_name,
  };
}

const ANNOUNCEMENT_SELECT = `
  SELECT a.id, a.title, a.body, a.pinned, a.company_id, a.created_at, a.updated_at,
    u.name AS created_by_name,
    EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS is_read
  FROM announcements a
  LEFT JOIN users u ON u.id = a.created_by
`;

function visibleToUserSql(alias) {
  return `(
    NOT EXISTS(SELECT 1 FROM announcement_targets t WHERE t.announcement_id = ${alias}.id)
    OR EXISTS(SELECT 1 FROM announcement_targets t WHERE t.announcement_id = ${alias}.id AND t.target_type = 'user' AND t.target_id = ?)
    OR EXISTS(SELECT 1 FROM announcement_targets t WHERE t.announcement_id = ${alias}.id AND t.target_type = 'group' AND t.target_id = ?)
  )`;
}

async function getVisibleAnnouncement(req, id) {
  const where = req.user.is_super_admin
    ? 'WHERE a.id = ?'
    : `WHERE a.id = ? AND (a.company_id IS NULL OR a.company_id = ?) AND ${visibleToUserSql('a')}`;
  const params = req.user.is_super_admin
    ? [id]
    : [id, req.user.company_id, req.user.id, req.user.group_id];
  return db.get(`SELECT a.id, a.company_id, a.title FROM announcements a ${where}`, params);
}

async function listTargets(announcementId) {
  const rows = await db.all(
    `SELECT t.id, t.target_type, t.target_id,
       CASE WHEN t.target_type = 'user' THEN u.name ELSE g.name END AS target_name
     FROM announcement_targets t
     LEFT JOIN users u ON t.target_type = 'user' AND u.id = t.target_id
     LEFT JOIN groups g ON t.target_type = 'group' AND g.id = t.target_id
     WHERE t.announcement_id = ?`,
    [announcementId]
  );
  return rows;
}

async function computeRecipients(companyId, targetGroupIds, targetUserIds) {
  const recipients = new Set();
  if ((!targetGroupIds || !targetGroupIds.length) && (!targetUserIds || !targetUserIds.length)) {
    const rows = await db.all('SELECT id FROM users WHERE company_id = ? AND is_super_admin = 0', [companyId]);
    rows.forEach((r) => recipients.add(r.id));
    return recipients;
  }
  if (targetUserIds && targetUserIds.length) {
    targetUserIds.forEach((id) => recipients.add(Number(id)));
  }
  if (targetGroupIds && targetGroupIds.length) {
    const placeholders = targetGroupIds.map(() => '?').join(',');
    const rows = await db.all(`SELECT id FROM users WHERE group_id IN (${placeholders})`, targetGroupIds);
    rows.forEach((r) => recipients.add(r.id));
  }
  return recipients;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin
      ? ''
      : `WHERE (a.company_id IS NULL OR a.company_id = ?) AND ${visibleToUserSql('a')}`;
    const params = req.user.is_super_admin
      ? [req.user.id]
      : [req.user.id, req.user.company_id, req.user.id, req.user.group_id];
    const announcements = await db.all(`${ANNOUNCEMENT_SELECT} ${where} ORDER BY a.pinned DESC, a.created_at DESC`, params);
    res.json({ announcements: announcements.map((a) => ({ ...a, pinned: !!a.pinned, is_read: !!a.is_read })) });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin
      ? ''
      : `AND (a.company_id IS NULL OR a.company_id = ?) AND ${visibleToUserSql('a')}`;
    const params = req.user.is_super_admin
      ? [req.user.id]
      : [req.user.id, req.user.company_id, req.user.id, req.user.group_id];
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
    const visible = await getVisibleAnnouncement(req, req.params.id);
    if (!visible) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, req.params.id]);
    const targets = await listTargets(announcement.id);
    res.json({ announcement: { ...announcement, pinned: !!announcement.pinned, is_read: !!announcement.is_read, targets } });
  })
);

router.post(
  '/',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const { title, body, pinned, targetGroupIds, targetUserIds } = req.body || {};
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
    const announcementId = Number(info.lastInsertRowid);

    const groupIds = Array.isArray(targetGroupIds) ? targetGroupIds.map(Number).filter(Boolean) : [];
    const userIds = Array.isArray(targetUserIds) ? targetUserIds.map(Number).filter(Boolean) : [];
    for (const groupId of groupIds) {
      await db.run('INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, ?, ?)', [announcementId, 'group', groupId]);
    }
    for (const userId of userIds) {
      await db.run('INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, ?, ?)', [announcementId, 'user', userId]);
    }

    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, announcementId]);
    logAudit(req.user.id, 'announcement', announcement.id, `Pubblicato annuncio "${announcement.title}"`).catch(() => {});

    const recipients = await computeRecipients(companyId, groupIds, userIds);
    recipients.delete(req.user.id);
    for (const userId of recipients) {
      notifyUser(userId, null, { it: `Nuovo annuncio: ${announcement.title}`, en: `New announcement: ${announcement.title}` }).catch(() => {});
    }

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

    const { title, body, pinned, targetGroupIds, targetUserIds } = req.body || {};
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

    if (targetGroupIds !== undefined || targetUserIds !== undefined) {
      await db.run('DELETE FROM announcement_targets WHERE announcement_id = ?', [req.params.id]);
      const groupIds = Array.isArray(targetGroupIds) ? targetGroupIds.map(Number).filter(Boolean) : [];
      const userIds = Array.isArray(targetUserIds) ? targetUserIds.map(Number).filter(Boolean) : [];
      for (const groupId of groupIds) {
        await db.run('INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, ?, ?)', [req.params.id, 'group', groupId]);
      }
      for (const userId of userIds) {
        await db.run('INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, ?, ?)', [req.params.id, 'user', userId]);
      }
    }

    const announcement = await db.get(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [req.user.id, req.params.id]);
    const targets = await listTargets(req.params.id);
    logAudit(req.user.id, 'announcement', announcement.id, `Modificato annuncio "${announcement.title}"`).catch(() => {});
    res.json({ announcement: { ...announcement, pinned: !!announcement.pinned, is_read: !!announcement.is_read, targets } });
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
    const visible = await getVisibleAnnouncement(req, req.params.id);
    if (!visible) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    await db.run('INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    const visible = await getVisibleAnnouncement(req, req.params.id);
    if (!visible) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    const rows = await db.all(
      `SELECT a.id, a.announcement_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM announcement_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.announcement_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ attachments: rows.map(attachmentMeta) });
  })
);

router.get(
  '/:id/attachments/:attId',
  asyncHandler(async (req, res) => {
    const visible = await getVisibleAnnouncement(req, req.params.id);
    if (!visible) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    const row = await db.get('SELECT * FROM announcement_attachments WHERE id = ? AND announcement_id = ?', [req.params.attId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    res.json({ attachment: { ...attachmentMeta(row), data: row.data } });
  })
);

router.post(
  '/:id/attachments',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const announcement = await db.get('SELECT id, title, company_id FROM announcements WHERE id = ?', [req.params.id]);
    if (!announcement || (!req.user.is_super_admin && announcement.company_id && announcement.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }

    const { fileName, dataUrl } = req.body || {};
    if (!fileName || !fileName.trim()) {
      return res.status(400).json({ error: 'Nome del file mancante' });
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'File mancante' });
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ error: 'Formato file non valido' });
    }
    const [, mimeType, base64Data] = match;
    if (!ATTACHMENT_ALLOWED_MIME.has(mimeType)) {
      return res.status(400).json({ error: 'Tipo di file non consentito' });
    }
    const sizeBytes = Buffer.byteLength(base64Data, 'base64');
    if (sizeBytes > ATTACHMENT_MAX_BYTES) {
      return res.status(400).json({ error: 'File troppo grande (max 50 MB)' });
    }

    const info = await db.run(
      'INSERT INTO announcement_attachments (announcement_id, uploaded_by, file_name, mime_type, size_bytes, data) VALUES (?, ?, ?, ?, ?, ?)',
      [announcement.id, req.user.id, fileName.trim().slice(0, 255), mimeType, sizeBytes, dataUrl]
    );
    const row = await db.get(
      `SELECT a.id, a.announcement_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM announcement_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    res.status(201).json({ attachment: attachmentMeta(row) });
  })
);

router.delete(
  '/:id/attachments/:attId',
  requirePermission('announcements_manage'),
  asyncHandler(async (req, res) => {
    const announcement = await db.get('SELECT id, company_id FROM announcements WHERE id = ?', [req.params.id]);
    if (!announcement || (!req.user.is_super_admin && announcement.company_id && announcement.company_id !== req.user.company_id)) {
      return res.status(404).json({ error: 'Annuncio non trovato' });
    }
    const row = await db.get('SELECT * FROM announcement_attachments WHERE id = ? AND announcement_id = ?', [req.params.attId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    await db.run('DELETE FROM announcement_attachments WHERE id = ?', [row.id]);
    res.status(204).end();
  })
);

module.exports = router;
