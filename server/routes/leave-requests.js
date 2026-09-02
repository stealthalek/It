const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEAVE_SELECT = `
  SELECT lr.id, lr.user_id, u.name AS user_name, lr.type, lr.start_date, lr.end_date, lr.note,
    lr.status, lr.reviewed_by, reviewer.name AS reviewed_by_name, lr.reviewed_at, lr.review_note,
    lr.company_id, lr.created_at
  FROM leave_requests lr
  JOIN users u ON u.id = lr.user_id
  LEFT JOIN users reviewer ON reviewer.id = lr.reviewed_by
`;

async function reportIds(managerId) {
  const rows = await db.all(
    `WITH RECURSIVE reports(id) AS (
       SELECT id FROM users WHERE manager_id = ?
       UNION ALL
       SELECT u.id FROM users u JOIN reports r ON u.manager_id = r.id
     )
     SELECT id FROM reports`,
    [managerId]
  );
  return rows.map((r) => r.id);
}

async function canReview(reviewer, record) {
  if (reviewer.is_super_admin) return true;
  if (reviewer.role === 'admin') return record.company_id === reviewer.company_id;
  const ids = await reportIds(reviewer.id);
  return ids.includes(record.user_id);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const requests = await db.all(`${LEAVE_SELECT} WHERE lr.user_id = ? ORDER BY lr.created_at DESC`, [req.user.id]);
    res.json({ requests });
  })
);

router.get(
  '/team',
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'admin' || req.user.is_super_admin;
    const conditions = [];
    const params = [];

    if (isAdmin) {
      if (!req.user.is_super_admin) {
        conditions.push('lr.company_id = ?');
        params.push(req.user.company_id);
      }
    } else {
      const ids = await reportIds(req.user.id);
      if (!ids.length) {
        return res.status(403).json({ error: 'Permessi insufficienti' });
      }
      conditions.push(`lr.user_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    if (req.query.status) {
      conditions.push('lr.status = ?');
      params.push(req.query.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const requests = await db.all(`${LEAVE_SELECT} ${where} ORDER BY lr.created_at DESC LIMIT 1000`, params);
    res.json({ requests });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { type, startDate, endDate, note } = req.body || {};
    if (!['vacation', 'permit'].includes(type)) {
      return res.status(400).json({ error: 'Tipo non valido' });
    }
    if (!startDate || !DATE_RE.test(startDate) || !endDate || !DATE_RE.test(endDate)) {
      return res.status(400).json({ error: 'Date non valide (formato AAAA-MM-GG)' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'La data di fine non può precedere quella di inizio' });
    }

    const info = await db.run(
      'INSERT INTO leave_requests (user_id, type, start_date, end_date, note, company_id) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, type, startDate, endDate, note && note.trim() ? note.trim().slice(0, 500) : null, req.user.company_id || null]
    );
    const request = await db.get(`${LEAVE_SELECT} WHERE lr.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'leave_request', request.id, `Richiesta ${type === 'vacation' ? 'ferie' : 'permesso'} (${startDate} → ${endDate})`).catch(() => {});

    const requester = await db.get('SELECT manager_id FROM users WHERE id = ?', [req.user.id]);
    if (requester && requester.manager_id) {
      notifyUser(requester.manager_id, null, {
        it: `${req.user.name} ha inviato una richiesta di ${type === 'vacation' ? 'ferie' : 'permesso'}`,
        en: `${req.user.name} submitted a ${type === 'vacation' ? 'vacation' : 'leave'} request`,
      }).catch(() => {});
    }
    res.status(201).json({ request });
  })
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    if (!(await canReview(req.user, existing))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Richiesta già gestita' });
    }

    await db.run(
      "UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?",
      [status, req.user.id, reviewNote && reviewNote.trim() ? reviewNote.trim().slice(0, 500) : null, req.params.id]
    );
    const request = await db.get(`${LEAVE_SELECT} WHERE lr.id = ?`, [req.params.id]);
    logAudit(
      req.user.id, 'leave_request', request.id,
      `Richiesta di "${request.user_name}" ${status === 'approved' ? 'approvata' : 'respinta'}`
    ).catch(() => {});

    notifyUser(request.user_id, null, {
      it: `La tua richiesta di ${request.type === 'vacation' ? 'ferie' : 'permesso'} è stata ${status === 'approved' ? 'approvata' : 'respinta'}`,
      en: `Your ${request.type === 'vacation' ? 'vacation' : 'leave'} request was ${status === 'approved' ? 'approved' : 'rejected'}`,
    }).catch(() => {});

    res.json({ request });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Non puoi annullare una richiesta già gestita' });
    }
    await db.run('DELETE FROM leave_requests WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'leave_request', Number(req.params.id), 'Richiesta ritirata').catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
