const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const TICKET_SELECT = `
  SELECT
    t.*,
    creator.name AS creator_name,
    creator.email AS creator_email,
    assignee.name AS assignee_name
  FROM tickets t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
`;

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
}

function canAccessTicket(user, ticket) {
  return isStaff(user) || ticket.created_by === user.id;
}

function getTicketOr404(req, res) {
  const ticket = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket non trovato' });
    return null;
  }
  if (!canAccessTicket(req.user, ticket)) {
    res.status(403).json({ error: 'Permessi insufficienti' });
    return null;
  }
  return ticket;
}

// GET /api/tickets - list, with filters
router.get('/', (req, res) => {
  const { status, priority, q, assigned } = req.query;
  const clauses = [];
  const params = {};

  if (!isStaff(req.user)) {
    clauses.push('t.created_by = @userId');
    params.userId = req.user.id;
  } else if (assigned === 'me') {
    clauses.push('t.assigned_to = @userId');
    params.userId = req.user.id;
  } else if (assigned === 'unassigned') {
    clauses.push('t.assigned_to IS NULL');
  }

  if (status && STATUSES.includes(status)) {
    clauses.push('t.status = @status');
    params.status = status;
  }
  if (priority && PRIORITIES.includes(priority)) {
    clauses.push('t.priority = @priority');
    params.priority = priority;
  }
  if (q && q.trim()) {
    clauses.push('(t.subject LIKE @q OR t.description LIKE @q)');
    params.q = `%${q.trim()}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const tickets = db
    .prepare(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC`)
    .all(params);

  res.json({ tickets });
});

// POST /api/tickets - create
router.post('/', (req, res) => {
  const { subject, description, priority, category } = req.body || {};

  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: 'L\'oggetto è obbligatorio' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'La descrizione è obbligatoria' });
  }
  const finalPriority = PRIORITIES.includes(priority) ? priority : 'medium';
  const finalCategory = category && category.trim() ? category.trim() : 'generale';

  const info = db
    .prepare(
      'INSERT INTO tickets (subject, description, priority, category, created_by) VALUES (?, ?, ?, ?, ?)'
    )
    .run(subject.trim(), description.trim(), finalPriority, finalCategory, req.user.id);

  const ticket = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ticket });
});

function listComments(ticketId, includeInternal) {
  const internalClause = includeInternal ? '' : 'AND c.is_internal = 0';
  return db
    .prepare(
      `SELECT c.id, c.message, c.is_internal, c.created_at, u.name AS author_name, u.role AS author_role
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.ticket_id = ? ${internalClause} ORDER BY c.created_at ASC`
    )
    .all(ticketId);
}

// GET /api/tickets/:id - detail with comments
router.get('/:id', (req, res) => {
  const ticket = getTicketOr404(req, res);
  if (!ticket) return;

  const comments = listComments(ticket.id, isStaff(req.user));
  res.json({ ticket, comments });
});

// PATCH /api/tickets/:id - update
router.patch('/:id', (req, res) => {
  const ticket = getTicketOr404(req, res);
  if (!ticket) return;

  const updates = [];
  const params = {};
  const body = req.body || {};

  if (isStaff(req.user)) {
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return res.status(400).json({ error: 'Stato non valido' });
      }
      updates.push('status = @status');
      params.status = body.status;
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) {
        return res.status(400).json({ error: 'Priorità non valida' });
      }
      updates.push('priority = @priority');
      params.priority = body.priority;
    }
    if (body.category !== undefined && body.category.trim()) {
      updates.push('category = @category');
      params.category = body.category.trim();
    }
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === null) {
        updates.push('assigned_to = NULL');
      } else {
        const assignee = db
          .prepare("SELECT id FROM users WHERE id = ? AND role IN ('agent', 'admin')")
          .get(body.assigned_to);
        if (!assignee) {
          return res.status(400).json({ error: 'Utente assegnatario non valido' });
        }
        updates.push('assigned_to = @assignedTo');
        params.assignedTo = body.assigned_to;
      }
    }
  }

  const isOwner = ticket.created_by === req.user.id;
  if (isOwner && !isStaff(req.user)) {
    const wantsReopen = body.status === 'open' && ['resolved', 'closed'].includes(ticket.status);
    if (wantsReopen) {
      updates.push('status = @status');
      params.status = 'open';
    } else if (body.status !== undefined) {
      return res.status(403).json({ error: 'Non puoi impostare questo stato' });
    }

    if (body.subject !== undefined || body.description !== undefined) {
      if (ticket.status !== 'open') {
        return res.status(403).json({ error: 'Non è più possibile modificare un ticket già preso in carico' });
      }
      if (body.subject !== undefined && body.subject.trim()) {
        updates.push('subject = @subject');
        params.subject = body.subject.trim();
      }
      if (body.description !== undefined && body.description.trim()) {
        updates.push('description = @description');
        params.description = body.description.trim();
      }
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
  }

  updates.push("updated_at = datetime('now')");
  params.id = ticket.id;
  db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = @id`).run(params);

  const updated = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticket.id);
  res.json({ ticket: updated });
});

// DELETE /api/tickets/:id - admin only
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo un amministratore può eliminare un ticket' });
  }
  const result = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Ticket non trovato' });
  }
  res.status(204).end();
});

// POST /api/tickets/:id/comments - add comment
router.post('/:id/comments', (req, res) => {
  const ticket = getTicketOr404(req, res);
  if (!ticket) return;

  const { message, is_internal } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Il messaggio non può essere vuoto' });
  }
  const internal = isStaff(req.user) && is_internal ? 1 : 0;

  db.prepare('INSERT INTO comments (ticket_id, user_id, message, is_internal) VALUES (?, ?, ?, ?)').run(
    ticket.id,
    req.user.id,
    message.trim(),
    internal
  );
  db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(ticket.id);

  const comments = listComments(ticket.id, isStaff(req.user));
  res.status(201).json({ comments });
});

module.exports = router;
