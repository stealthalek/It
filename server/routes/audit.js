const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

function dateClause(alias, from, to, params) {
  const clauses = [];
  if (from) {
    clauses.push(`${alias}.created_at >= ?`);
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    clauses.push(`${alias}.created_at <= ?`);
    params.push(`${to} 23:59:59`);
  }
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: 'Accesso riservato all\'amministratore globale' });
    }

    const { from, to, q } = req.query;

    const commentParams = [];
    const comments = (
      await db.all(
        `SELECT c.id, c.ticket_id, t.subject AS ticket_subject, c.message, c.is_internal, c.created_at,
                u.name AS actor_name, u.role AS actor_role
         FROM comments c
         JOIN tickets t ON t.id = c.ticket_id
         JOIN users u ON u.id = c.user_id
         WHERE 1 = 1 ${dateClause('c', from, to, commentParams)}`,
        commentParams
      )
    ).map((c) => ({ kind: 'comment', ...c }));

    const eventParams = [];
    const events = (
      await db.all(
        `SELECT e.id, e.ticket_id, t.subject AS ticket_subject, e.message, e.created_at,
                u.name AS actor_name, u.role AS actor_role
         FROM ticket_events e
         JOIN tickets t ON t.id = e.ticket_id
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE 1 = 1 ${dateClause('e', from, to, eventParams)}`,
        eventParams
      )
    ).map((e) => ({ kind: 'event', ...e }));

    const adminParams = [];
    const adminActions = (
      await db.all(
        `SELECT a.id, a.target_type, a.target_id, a.message, a.created_at,
                u.name AS actor_name, u.role AS actor_role
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         WHERE 1 = 1 ${dateClause('a', from, to, adminParams)}`,
        adminParams
      )
    ).map((a) => ({ kind: 'admin', ticket_id: null, ticket_subject: null, ...a }));

    let entries = [...comments, ...events, ...adminActions].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      entries = entries.filter((row) =>
        (row.message || '').toLowerCase().includes(needle) ||
        (row.actor_name || '').toLowerCase().includes(needle) ||
        (row.ticket_subject || '').toLowerCase().includes(needle) ||
        String(row.ticket_id) === needle);
    }

    res.json({ entries: entries.slice(0, 2000), total: entries.length });
  })
);

module.exports = router;
