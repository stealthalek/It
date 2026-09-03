const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const ENTRY_SELECT = `
  SELECT te.id, te.user_id, u.name AS user_name, te.clock_in, te.clock_out, te.notes, te.created_at
  FROM time_entries te
  JOIN users u ON u.id = te.user_id
`;

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const SELF_LIMIT = 500;
const TEAM_LIMIT = 1000;

function isTimeAdmin(user) {
  return user.role === 'admin' || user.is_super_admin;
}

async function flexibleEntryAllowed(user) {
  if (isTimeAdmin(user)) return true;
  if (user.company_id) {
    const company = await db.get('SELECT flexible_time_entry FROM companies WHERE id = ?', [user.company_id]);
    return !!(company && company.flexible_time_entry);
  }
  const row = await db.get('SELECT flexible_time_entry FROM app_settings WHERE id = 1');
  return !!(row && row.flexible_time_entry);
}

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const open = await db.get(`${ENTRY_SELECT} WHERE te.user_id = ? AND te.clock_out IS NULL`, [req.user.id]);
    res.json({ clockedIn: !!open, entry: open || null });
  })
);

router.post(
  '/clock-in',
  asyncHandler(async (req, res) => {
    const open = await db.get('SELECT id FROM time_entries WHERE user_id = ? AND clock_out IS NULL', [req.user.id]);
    if (open) {
      return res.status(409).json({ error: 'Hai già una timbratura in corso' });
    }
    const info = await db.run('INSERT INTO time_entries (user_id) VALUES (?)', [req.user.id]);
    const entry = await db.get(`${ENTRY_SELECT} WHERE te.id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ entry });
  })
);

router.post(
  '/clock-out',
  asyncHandler(async (req, res) => {
    const open = await db.get('SELECT id FROM time_entries WHERE user_id = ? AND clock_out IS NULL', [req.user.id]);
    if (!open) {
      return res.status(400).json({ error: 'Nessuna timbratura in corso' });
    }
    const { notes } = req.body || {};
    await db.run("UPDATE time_entries SET clock_out = datetime('now'), notes = ? WHERE id = ?", [
      notes && notes.trim() ? notes.trim().slice(0, 500) : null,
      open.id,
    ]);
    const entry = await db.get(`${ENTRY_SELECT} WHERE te.id = ?`, [open.id]);
    res.json({ entry });
  })
);

router.post(
  '/manual',
  asyncHandler(async (req, res) => {
    if (!(await flexibleEntryAllowed(req.user))) {
      return res.status(403).json({ error: 'Inserimento manuale non abilitato' });
    }
    const { clockIn, clockOut, notes } = req.body || {};
    if (!clockIn || !DATETIME_RE.test(clockIn) || !clockOut || !DATETIME_RE.test(clockOut)) {
      return res.status(400).json({ error: 'Data e ora di inizio/fine non valide' });
    }
    if (clockOut <= clockIn) {
      return res.status(400).json({ error: 'L\'orario di fine deve essere successivo a quello di inizio' });
    }
    const info = await db.run('INSERT INTO time_entries (user_id, clock_in, clock_out, notes) VALUES (?, ?, ?, ?)', [
      req.user.id,
      clockIn,
      clockOut,
      notes && notes.trim() ? notes.trim().slice(0, 500) : null,
    ]);
    const entry = await db.get(`${ENTRY_SELECT} WHERE te.id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ entry });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await db.get('SELECT * FROM time_entries WHERE id = ?', [req.params.id]);
    if (!entry) {
      return res.status(404).json({ error: 'Timbratura non trovata' });
    }
    if (entry.user_id !== req.user.id && !req.user.is_super_admin) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    if (entry.user_id === req.user.id && !(await flexibleEntryAllowed(req.user))) {
      return res.status(403).json({ error: 'Modifica manuale non abilitata' });
    }
    const { clockIn, clockOut, notes } = req.body || {};
    const nextClockIn = clockIn !== undefined ? clockIn : entry.clock_in;
    const nextClockOut = clockOut !== undefined ? clockOut : entry.clock_out;
    if (!DATETIME_RE.test(nextClockIn) || (nextClockOut !== null && !DATETIME_RE.test(nextClockOut))) {
      return res.status(400).json({ error: 'Data e ora non valide' });
    }
    if (nextClockOut !== null && nextClockOut <= nextClockIn) {
      return res.status(400).json({ error: 'L\'orario di fine deve essere successivo a quello di inizio' });
    }
    await db.run('UPDATE time_entries SET clock_in = ?, clock_out = ?, notes = ? WHERE id = ?', [
      nextClockIn,
      nextClockOut,
      notes !== undefined ? (notes && notes.trim() ? notes.trim().slice(0, 500) : null) : entry.notes,
      req.params.id,
    ]);
    const updated = await db.get(`${ENTRY_SELECT} WHERE te.id = ?`, [req.params.id]);
    res.json({ entry: updated });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const conditions = ['te.user_id = ?'];
    const params = [req.user.id];
    if (from) {
      conditions.push('te.clock_in >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('te.clock_in <= ?');
      params.push(to);
    }
    const entries = await db.all(
      `${ENTRY_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY te.clock_in DESC LIMIT ${SELF_LIMIT}`,
      params
    );

    let total = entries.length;
    let truncated = false;
    if (entries.length === SELF_LIMIT) {
      const totalRow = await db.get(`SELECT COUNT(*) AS n FROM time_entries te WHERE ${conditions.join(' AND ')}`, params);
      total = totalRow.n;
      truncated = total > SELF_LIMIT;
    }

    res.json({ entries, total, truncated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await db.get('SELECT * FROM time_entries WHERE id = ?', [req.params.id]);
    if (!entry) {
      return res.status(404).json({ error: 'Timbratura non trovata' });
    }
    if (entry.user_id !== req.user.id && !req.user.is_super_admin) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    await db.run('DELETE FROM time_entries WHERE id = ?', [req.params.id]);
    res.status(204).end();
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
        conditions.push('u.company_id = ?');
        params.push(req.user.company_id);
      }
    } else {
      const reports = await db.all(
        `WITH RECURSIVE reports(id) AS (
           SELECT id FROM users WHERE manager_id = ?
           UNION ALL
           SELECT u.id FROM users u JOIN reports r ON u.manager_id = r.id
         )
         SELECT id FROM reports`,
        [req.user.id]
      );
      if (!reports.length) {
        return res.status(403).json({ error: 'Permessi insufficienti' });
      }
      conditions.push(`te.user_id IN (${reports.map(() => '?').join(',')})`);
      params.push(...reports.map((r) => r.id));
    }

    const { from, to, userId } = req.query;
    if (userId) {
      conditions.push('te.user_id = ?');
      params.push(Number(userId));
    }
    if (from) {
      conditions.push('te.clock_in >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('te.clock_in <= ?');
      params.push(to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const entries = await db.all(`${ENTRY_SELECT} ${where} ORDER BY te.clock_in DESC LIMIT ${TEAM_LIMIT}`, params);

    let total = entries.length;
    let truncated = false;
    if (entries.length === TEAM_LIMIT) {
      const totalRow = await db.get(`SELECT COUNT(*) AS n FROM time_entries te ${where}`, params);
      total = totalRow.n;
      truncated = total > TEAM_LIMIT;
    }

    res.json({ entries, total, truncated });
  })
);

module.exports = router;
