const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_LABELS = { open: 'Aperto', in_progress: 'In lavorazione', resolved: 'Risolto', closed: 'Chiuso' };
const PRIORITY_LABELS = { low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente' };

const TICKET_SELECT = `
  SELECT
    t.*,
    creator.name AS creator_name,
    creator.email AS creator_email,
    assignee.name AS assignee_name,
    device.name AS device_name
  FROM tickets t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  LEFT JOIN devices device ON device.id = t.device_id
`;

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
}

function canAccessTicket(user, ticket) {
  return isStaff(user) || ticket.created_by === user.id;
}

async function getTicketOr404(req, res) {
  const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [req.params.id]);
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

async function resolveCategory(requested) {
  const categories = (await db.all('SELECT name FROM categories ORDER BY name ASC')).map((c) => c.name);
  if (requested && categories.includes(requested)) return requested;
  return categories.includes('Altro') ? 'Altro' : categories[0];
}

async function logEvent(ticketId, actorId, message) {
  await db.run('INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES (?, ?, ?)', [ticketId, actorId, message]);
}

async function listActivity(ticketId, includeInternal) {
  const internalClause = includeInternal ? '' : 'AND c.is_internal = 0';
  const comments = (
    await db.all(
      `SELECT c.id, c.message, c.is_internal, c.created_at, u.name AS author_name, u.role AS author_role
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.ticket_id = ? ${internalClause}`,
      [ticketId]
    )
  ).map((c) => ({ kind: 'comment', ...c }));

  const events = (
    await db.all(
      `SELECT e.id, e.message, e.created_at, u.name AS actor_name
       FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.ticket_id = ?`,
      [ticketId]
    )
  ).map((e) => ({ kind: 'event', ...e }));

  return [...comments, ...events].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, priority, q, assigned } = req.query;
    const clauses = [];
    const params = [];

    if (!isStaff(req.user)) {
      clauses.push('t.created_by = ?');
      params.push(req.user.id);
    } else if (assigned === 'me') {
      clauses.push('t.assigned_to = ?');
      params.push(req.user.id);
    } else if (assigned === 'unassigned') {
      clauses.push('t.assigned_to IS NULL');
    }

    if (status && STATUSES.includes(status)) {
      clauses.push('t.status = ?');
      params.push(status);
    }
    if (priority && PRIORITIES.includes(priority)) {
      clauses.push('t.priority = ?');
      params.push(priority);
    }
    if (q && q.trim()) {
      clauses.push('(t.subject LIKE ? OR t.description LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const tickets = await db.all(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC`, params);

    res.json({ tickets });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { subject, description, priority, category, device_id } = req.body || {};

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'L\'oggetto è obbligatorio' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descrizione è obbligatoria' });
    }
    const finalPriority = PRIORITIES.includes(priority) ? priority : 'medium';
    const finalCategory = await resolveCategory(category && category.trim());

    let finalDeviceId = null;
    if (device_id) {
      const device = await db.get('SELECT id FROM devices WHERE id = ?', [device_id]);
      if (device) finalDeviceId = device.id;
    }

    const info = await db.run(
      'INSERT INTO tickets (subject, description, priority, category, created_by, device_id) VALUES (?, ?, ?, ?, ?, ?)',
      [subject.trim(), description.trim(), finalPriority, finalCategory, req.user.id, finalDeviceId]
    );

    const ticketId = Number(info.lastInsertRowid);
    await logEvent(ticketId, req.user.id, 'Ticket creato');

    const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
    res.status(201).json({ ticket });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const activity = await listActivity(ticket.id, isStaff(req.user));
    res.json({ ticket, activity });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const updates = [];
    const params = [];
    const body = req.body || {};
    const events = [];

    if (isStaff(req.user)) {
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) {
          return res.status(400).json({ error: 'Stato non valido' });
        }
        if (body.status !== ticket.status) {
          updates.push('status = ?');
          params.push(body.status);
          events.push(`Stato cambiato da "${STATUS_LABELS[ticket.status]}" a "${STATUS_LABELS[body.status]}"`);
        }
      }
      if (body.priority !== undefined) {
        if (!PRIORITIES.includes(body.priority)) {
          return res.status(400).json({ error: 'Priorità non valida' });
        }
        if (body.priority !== ticket.priority) {
          updates.push('priority = ?');
          params.push(body.priority);
          events.push(`Priorità cambiata da "${PRIORITY_LABELS[ticket.priority]}" a "${PRIORITY_LABELS[body.priority]}"`);
        }
      }
      if (body.category !== undefined && body.category.trim()) {
        const resolvedCategory = await resolveCategory(body.category.trim());
        if (resolvedCategory !== ticket.category) {
          updates.push('category = ?');
          params.push(resolvedCategory);
        }
      }
      if (body.device_id !== undefined) {
        if (body.device_id === null) {
          if (ticket.device_id !== null) {
            updates.push('device_id = NULL');
            events.push('Dispositivo scollegato dal ticket');
          }
        } else {
          const device = await db.get('SELECT id, name FROM devices WHERE id = ?', [body.device_id]);
          if (!device) {
            return res.status(400).json({ error: 'Dispositivo non valido' });
          }
          if (device.id !== ticket.device_id) {
            updates.push('device_id = ?');
            params.push(device.id);
            events.push(`Collegato al dispositivo ${device.name}`);
          }
        }
      }
      if (body.assigned_to !== undefined) {
        if (body.assigned_to === null) {
          if (ticket.assigned_to !== null) {
            updates.push('assigned_to = NULL');
            events.push('Rimossa l\'assegnazione');
          }
        } else {
          const assignee = await db.get(
            "SELECT id, name FROM users WHERE id = ? AND role IN ('agent', 'admin')",
            [body.assigned_to]
          );
          if (!assignee) {
            return res.status(400).json({ error: 'Utente assegnatario non valido' });
          }
          if (assignee.id !== ticket.assigned_to) {
            updates.push('assigned_to = ?');
            params.push(body.assigned_to);
            events.push(`Assegnato a ${assignee.name}`);
          }
        }
      }
    }

    const isOwner = ticket.created_by === req.user.id;
    if (isOwner && !isStaff(req.user)) {
      const wantsReopen = body.status === 'open' && ['resolved', 'closed'].includes(ticket.status);
      if (wantsReopen) {
        updates.push('status = ?');
        params.push('open');
        events.push('Ticket riaperto dal richiedente');
      } else if (body.status !== undefined) {
        return res.status(403).json({ error: 'Non puoi impostare questo stato' });
      }

      if (body.subject !== undefined || body.description !== undefined) {
        if (ticket.status !== 'open') {
          return res.status(403).json({ error: 'Non è più possibile modificare un ticket già preso in carico' });
        }
        if (body.subject !== undefined && body.subject.trim()) {
          updates.push('subject = ?');
          params.push(body.subject.trim());
        }
        if (body.description !== undefined && body.description.trim()) {
          updates.push('description = ?');
          params.push(body.description.trim());
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(ticket.id);
    await db.run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);
    for (const message of events) {
      await logEvent(ticket.id, req.user.id, message);
    }

    const updated = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticket.id]);
    res.json({ ticket: updated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo un amministratore può eliminare un ticket' });
    }
    const result = await db.run('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Ticket non trovato' });
    }
    res.status(204).end();
  })
);

router.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const { message, is_internal } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Il messaggio non può essere vuoto' });
    }
    const internal = isStaff(req.user) && is_internal ? 1 : 0;

    await db.run('INSERT INTO comments (ticket_id, user_id, message, is_internal) VALUES (?, ?, ?, ?)', [
      ticket.id,
      req.user.id,
      message.trim(),
      internal,
    ]);
    await db.run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", [ticket.id]);

    const activity = await listActivity(ticket.id, isStaff(req.user));
    res.status(201).json({ activity });
  })
);

module.exports = router;
