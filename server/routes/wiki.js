const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requirePermission } = require('../lib/permissions');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const PAGE_JOINS = `
  FROM wiki_pages w
  LEFT JOIN users author ON author.id = w.author_id
  LEFT JOIN users editor ON editor.id = w.updated_by
`;

const PAGE_LIST_SELECT = `
  SELECT w.id, w.title, w.author_id, author.name AS author_name, w.updated_by,
    editor.name AS updated_by_name, w.company_id, w.created_at, w.updated_at
  ${PAGE_JOINS}
`;

const PAGE_SELECT = `
  SELECT w.id, w.title, w.content, w.author_id, author.name AS author_name, w.updated_by,
    editor.name AS updated_by_name, w.company_id, w.created_at, w.updated_at
  ${PAGE_JOINS}
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    if (!req.user.is_super_admin) {
      conditions.push('w.company_id = ?');
      params.push(req.user.company_id);
    } else if (req.query.companyId) {
      conditions.push('w.company_id = ?');
      params.push(Number(req.query.companyId));
    }
    if (req.query.q && req.query.q.trim()) {
      conditions.push('w.title LIKE ?');
      params.push(`%${req.query.q.trim()}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const pages = await db.all(`${PAGE_LIST_SELECT} ${where} ORDER BY w.title ASC`, params);
    res.json({ pages });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const page = await db.get(`${PAGE_SELECT} WHERE w.id = ?`, [req.params.id]);
    if (!page) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    if (!req.user.is_super_admin && page.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    res.json({ page });
  })
);

router.post(
  '/',
  requirePermission('wiki_manage'),
  asyncHandler(async (req, res) => {
    const { title, content } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo è obbligatorio' });
    }
    const info = await db.run(
      'INSERT INTO wiki_pages (title, content, author_id, updated_by, company_id) VALUES (?, ?, ?, ?, ?)',
      [title.trim().slice(0, 200), content && content.trim() ? content.trim() : null, req.user.id, req.user.id, req.user.company_id]
    );
    const page = await db.get(`${PAGE_SELECT} WHERE w.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'wiki_page', page.id, `Creata pagina wiki "${page.title}"`).catch(() => {});
    res.status(201).json({ page });
  })
);

router.patch(
  '/:id',
  requirePermission('wiki_manage'),
  asyncHandler(async (req, res) => {
    const page = await db.get('SELECT * FROM wiki_pages WHERE id = ?', [req.params.id]);
    if (!page) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    if (!req.user.is_super_admin && page.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }

    const { title, content } = req.body || {};
    const updates = ['updated_by = ?', 'updated_at = datetime(\'now\')'];
    const params = [req.user.id];
    if (title !== undefined) {
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Il titolo è obbligatorio' });
      }
      updates.push('title = ?');
      params.push(title.trim().slice(0, 200));
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content && content.trim() ? content.trim() : null);
    }

    params.push(req.params.id);
    await db.run(`UPDATE wiki_pages SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${PAGE_SELECT} WHERE w.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'wiki_page', updated.id, `Pagina wiki "${updated.title}" aggiornata`).catch(() => {});
    res.json({ page: updated });
  })
);

router.delete(
  '/:id',
  requirePermission('wiki_manage'),
  asyncHandler(async (req, res) => {
    const page = await db.get('SELECT * FROM wiki_pages WHERE id = ?', [req.params.id]);
    if (!page) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    if (!req.user.is_super_admin && page.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    await db.run('DELETE FROM wiki_pages WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'wiki_page', Number(req.params.id), `Pagina wiki "${page.title}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
