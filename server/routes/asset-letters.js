const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const LETTER_SELECT = `
  SELECT l.*, a.name AS asset_name, a.asset_type, a.tag AS asset_tag, a.assignment_type, u.name AS user_name, u.email AS user_email, u.company_id AS user_company_id
  FROM asset_assignment_letters l
  JOIN assets a ON a.id = l.asset_id
  JOIN users u ON u.id = l.user_id
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { pending, mine } = req.query;
    const isStaff = req.user.role === 'agent' || req.user.role === 'admin';
    const clauses = [];
    const params = [];
    if (!isStaff || mine === '1') {
      clauses.push('l.user_id = ?');
      params.push(req.user.id);
    } else if (!req.user.is_super_admin) {
      clauses.push('u.company_id = ?');
      params.push(req.user.company_id);
    }
    if (pending === '1') clauses.push('l.signed_at IS NULL');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const letters = await db.all(`${LETTER_SELECT} ${where} ORDER BY l.created_at DESC`, params);
    res.json({ letters });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const letter = await db.get(`${LETTER_SELECT} WHERE l.id = ?`, [req.params.id]);
    if (!letter) return res.status(404).json({ error: 'Lettera non trovata' });
    const isStaff = req.user.role === 'agent' || req.user.role === 'admin';
    if (!isStaff && letter.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    if (isStaff && letter.user_id !== req.user.id && !req.user.is_super_admin && letter.user_company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    res.json({ letter });
  })
);

router.post(
  '/:id/sign',
  asyncHandler(async (req, res) => {
    const letter = await db.get('SELECT * FROM asset_assignment_letters WHERE id = ?', [req.params.id]);
    if (!letter) return res.status(404).json({ error: 'Lettera non trovata' });
    if (letter.user_id !== req.user.id) return res.status(403).json({ error: 'Permessi insufficienti' });
    if (letter.signed_at) return res.status(400).json({ error: 'Lettera già firmata' });

    const { fullName } = req.body || {};
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Il nome completo è obbligatorio per firmare' });
    }

    await db.run("UPDATE asset_assignment_letters SET signed_at = datetime('now'), signed_name = ? WHERE id = ?", [
      fullName.trim(), req.params.id,
    ]);
    const updated = await db.get(`${LETTER_SELECT} WHERE l.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'asset', updated.asset_id, `Lettera di assegnazione firmata per "${updated.asset_name}" da ${fullName.trim()}`).catch(() => {});
    res.json({ letter: updated });
  })
);

module.exports = router;
