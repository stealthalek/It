const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requirePermission, hasPermission } = require('../lib/permissions');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['new', 'under_review', 'planned', 'implemented', 'rejected'];

const IDEA_SELECT = `
  SELECT i.id, i.title, i.description, i.author_id, u.name AS author_name, i.status,
    i.company_id, i.created_at, i.updated_at,
    (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id) AS vote_count
  FROM ideas i
  JOIN users u ON u.id = i.author_id
`;

async function withHasVoted(ideas, userId) {
  if (!ideas.length) return ideas;
  const voted = await db.all(
    `SELECT idea_id FROM idea_votes WHERE user_id = ? AND idea_id IN (${ideas.map(() => '?').join(',')})`,
    [userId, ...ideas.map((i) => i.id)]
  );
  const votedSet = new Set(voted.map((v) => v.idea_id));
  return ideas.map((i) => ({ ...i, has_voted: votedSet.has(i.id) }));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    if (!req.user.is_super_admin) {
      conditions.push('i.company_id = ?');
      params.push(req.user.company_id);
    } else if (req.query.companyId) {
      conditions.push('i.company_id = ?');
      params.push(Number(req.query.companyId));
    }
    if (req.query.status && STATUSES.includes(req.query.status)) {
      conditions.push('i.status = ?');
      params.push(req.query.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = req.query.sort === 'new' ? 'i.created_at DESC' : 'vote_count DESC, i.created_at DESC';
    const ideas = await db.all(`${IDEA_SELECT} ${where} ORDER BY ${orderBy}`, params);
    res.json({ ideas: await withHasVoted(ideas, req.user.id) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, description } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    }
    const info = await db.run('INSERT INTO ideas (title, description, author_id, company_id) VALUES (?, ?, ?, ?)', [
      title.trim().slice(0, 200),
      description && description.trim() ? description.trim().slice(0, 4000) : null,
      req.user.id,
      req.user.company_id,
    ]);
    const idea = await db.get(`${IDEA_SELECT} WHERE i.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'idea', idea.id, `Proposta idea "${idea.title}"`).catch(() => {});
    res.status(201).json({ idea: { ...idea, has_voted: false } });
  })
);

router.post(
  '/:id/vote',
  asyncHandler(async (req, res) => {
    const idea = await db.get('SELECT * FROM ideas WHERE id = ?', [req.params.id]);
    if (!idea) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    if (!req.user.is_super_admin && idea.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    const existing = await db.get('SELECT 1 FROM idea_votes WHERE idea_id = ? AND user_id = ?', [idea.id, req.user.id]);
    if (existing) {
      await db.run('DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?', [idea.id, req.user.id]);
    } else {
      await db.run('INSERT INTO idea_votes (idea_id, user_id) VALUES (?, ?)', [idea.id, req.user.id]);
    }
    const updated = await db.get(`${IDEA_SELECT} WHERE i.id = ?`, [idea.id]);
    res.json({ idea: { ...updated, has_voted: !existing } });
  })
);

router.patch(
  '/:id/status',
  requirePermission('ideas_manage'),
  asyncHandler(async (req, res) => {
    const idea = await db.get('SELECT * FROM ideas WHERE id = ?', [req.params.id]);
    if (!idea) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    if (!req.user.is_super_admin && idea.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    await db.run('UPDATE ideas SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, idea.id]);
    const updated = await db.get(`${IDEA_SELECT} WHERE i.id = ?`, [idea.id]);
    logAudit(req.user.id, 'idea', idea.id, `Idea "${idea.title}" impostata a stato "${status}"`).catch(() => {});
    if (idea.author_id !== req.user.id) {
      notifyUser(idea.author_id, null, {
        it: `La tua idea "${idea.title}" è stata aggiornata: ${status}`,
        en: `Your idea "${idea.title}" was updated: ${status}`,
      }).catch(() => {});
    }
    const [voted] = await withHasVoted([updated], req.user.id);
    res.json({ idea: voted });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const idea = await db.get('SELECT * FROM ideas WHERE id = ?', [req.params.id]);
    if (!idea) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    if (!req.user.is_super_admin && idea.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Idea non trovata' });
    }
    if (idea.author_id !== req.user.id && !hasPermission(req.user, 'ideas_manage')) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    await db.run('DELETE FROM ideas WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'idea', Number(req.params.id), `Idea "${idea.title}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
