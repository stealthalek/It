const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['travel', 'meals', 'accommodation', 'supplies', 'other'];

const EXPENSE_SELECT = `
  SELECT e.id, e.user_id, u.name AS user_name, e.description, e.amount, e.expense_date, e.category,
    e.status, e.reviewed_by, reviewer.name AS reviewed_by_name, e.reviewed_at, e.review_note,
    e.company_id, e.created_at
  FROM expense_reports e
  JOIN users u ON u.id = e.user_id
  LEFT JOIN users reviewer ON reviewer.id = e.reviewed_by
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
    const reports = await db.all(`${EXPENSE_SELECT} WHERE e.user_id = ? ORDER BY e.created_at DESC`, [req.user.id]);
    res.json({ reports });
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
        conditions.push('e.company_id = ?');
        params.push(req.user.company_id);
      }
    } else {
      const ids = await reportIds(req.user.id);
      if (!ids.length) {
        return res.status(403).json({ error: 'Permessi insufficienti' });
      }
      conditions.push(`e.user_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    if (req.query.status) {
      conditions.push('e.status = ?');
      params.push(req.query.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const reports = await db.all(`${EXPENSE_SELECT} ${where} ORDER BY e.created_at DESC LIMIT 1000`, params);
    res.json({ reports });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { description, amount, expenseDate, category } = req.body || {};
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descrizione è obbligatoria' });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!expenseDate || !DATE_RE.test(expenseDate)) {
      return res.status(400).json({ error: 'Data non valida (formato AAAA-MM-GG)' });
    }
    const finalCategory = CATEGORIES.includes(category) ? category : 'other';

    const info = await db.run(
      'INSERT INTO expense_reports (user_id, description, amount, expense_date, category, company_id) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, description.trim().slice(0, 500), numAmount, expenseDate, finalCategory, req.user.company_id || null]
    );
    const report = await db.get(`${EXPENSE_SELECT} WHERE e.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'expense_report', report.id, `Nota spese inviata (${numAmount.toFixed(2)})`).catch(() => {});

    const requester = await db.get('SELECT manager_id FROM users WHERE id = ?', [req.user.id]);
    if (requester && requester.manager_id) {
      notifyUser(requester.manager_id, null, {
        it: `${req.user.name} ha inviato una nota spese`,
        en: `${req.user.name} submitted an expense report`,
      }).catch(() => {});
    }
    res.status(201).json({ report });
  })
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM expense_reports WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Nota spese non trovata' });
    }
    if (!(await canReview(req.user, existing))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Nota spese già gestita' });
    }

    await db.run(
      "UPDATE expense_reports SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?",
      [status, req.user.id, reviewNote && reviewNote.trim() ? reviewNote.trim().slice(0, 500) : null, req.params.id]
    );
    const report = await db.get(`${EXPENSE_SELECT} WHERE e.id = ?`, [req.params.id]);
    logAudit(
      req.user.id, 'expense_report', report.id,
      `Nota spese di "${report.user_name}" ${status === 'approved' ? 'approvata' : 'respinta'}`
    ).catch(() => {});

    notifyUser(report.user_id, null, {
      it: `La tua nota spese è stata ${status === 'approved' ? 'approvata' : 'respinta'}`,
      en: `Your expense report was ${status === 'approved' ? 'approved' : 'rejected'}`,
    }).catch(() => {});

    res.json({ report });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM expense_reports WHERE id = ?', [req.params.id]);
    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Nota spese non trovata' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Non puoi ritirare una nota spese già gestita' });
    }
    await db.run('DELETE FROM expense_reports WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'expense_report', Number(req.params.id), 'Nota spese ritirata').catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
