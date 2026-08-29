const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const realtime = require('../realtime');
const mailer = require('../mailer');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TYPES = ['incident', 'task'];

const STATUS_LABELS = { open: 'Aperto', in_progress: 'In lavorazione', resolved: 'Risolto', closed: 'Chiuso' };
const PRIORITY_LABELS = { low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
const TYPE_LABELS = { incident: 'Incident', task: 'Task' };

const TICKET_SELECT = `
  SELECT
    t.*,
    creator.name AS creator_name,
    creator.email AS creator_email,
    creator.locale AS creator_locale,
    assignee.name AS assignee_name,
    grp.name AS group_name,
    grpParent.name AS group_parent_name,
    grp.sla_response_hours AS sla_response_hours,
    grp.sla_resolve_hours AS sla_resolve_hours,
    asset.name AS asset_name
  FROM tickets t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  LEFT JOIN groups grp ON grp.id = t.group_id
  LEFT JOIN groups grpParent ON grpParent.id = grp.parent_id
  LEFT JOIN assets asset ON asset.id = t.asset_id
`;

function computeSlaStatus(ticket) {
  if (!ticket.sla_resolve_hours || !ticket.created_at) return null;
  const created = new Date(ticket.created_at.replace(' ', 'T') + 'Z').getTime();
  const resolveMs = ticket.sla_resolve_hours * 3600 * 1000;
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    if (!ticket.resolved_at) return null;
    const resolved = new Date(ticket.resolved_at.replace(' ', 'T') + 'Z').getTime();
    return resolved - created > resolveMs ? 'breached' : 'on_track';
  }
  const ratio = (Date.now() - created) / resolveMs;
  if (ratio >= 1) return 'breached';
  if (ratio >= 0.75) return 'at_risk';
  return 'on_track';
}

function withSla(ticket) {
  return { ...ticket, sla_status: computeSlaStatus(ticket) };
}

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

async function defaultGroupForCategory(categoryName) {
  const row = await db.get('SELECT default_group_id FROM categories WHERE name = ?', [categoryName]);
  return row ? row.default_group_id : null;
}

async function logEvent(ticketId, actorId, message) {
  const info = await db.run('INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES (?, ?, ?)', [ticketId, actorId, message]);
  const row = await db.get(
    `SELECT e.id, e.message, e.created_at, u.name AS actor_name
     FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.id = ?`,
    [Number(info.lastInsertRowid)]
  );
  realtime.broadcastActivityItem(ticketId, { kind: 'event', ...row });
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
    const { status, priority, type, q, assigned, group } = req.query;
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
    } else if (assigned && /^\d+$/.test(assigned)) {
      clauses.push('t.assigned_to = ?');
      params.push(Number(assigned));
    }

    if (isStaff(req.user) && req.query.createdBy && /^\d+$/.test(req.query.createdBy)) {
      clauses.push('t.created_by = ?');
      params.push(Number(req.query.createdBy));
    }

    if (status && STATUSES.includes(status)) {
      clauses.push('t.status = ?');
      params.push(status);
    }
    if (priority && PRIORITIES.includes(priority)) {
      clauses.push('t.priority = ?');
      params.push(priority);
    }
    if (type && TYPES.includes(type)) {
      clauses.push('t.type = ?');
      params.push(type);
    }
    if (group === 'unassigned') {
      clauses.push('t.group_id IS NULL');
    } else if (group && /^\d+$/.test(group)) {
      clauses.push('t.group_id = ?');
      params.push(Number(group));
    }
    if (q && q.trim()) {
      const trimmed = q.trim();
      const asId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
      const requesterMatch = isStaff(req.user) ? ' OR creator.name LIKE ? OR creator.email LIKE ?' : '';
      if (asId !== null) {
        clauses.push(`(t.subject LIKE ? OR t.description LIKE ? OR t.id = ?${requesterMatch})`);
        params.push(`%${trimmed}%`, `%${trimmed}%`, asId);
      } else {
        clauses.push(`(t.subject LIKE ? OR t.description LIKE ?${requesterMatch})`);
        params.push(`%${trimmed}%`, `%${trimmed}%`);
      }
      if (isStaff(req.user)) {
        params.push(`%${trimmed}%`, `%${trimmed}%`);
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const tickets = await db.all(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC`, params);

    res.json({ tickets: tickets.map(withSla) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { subject, description, priority, category, type } = req.body || {};

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'L\'oggetto è obbligatorio' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descrizione è obbligatoria' });
    }
    const finalPriority = PRIORITIES.includes(priority) ? priority : 'medium';
    const finalType = TYPES.includes(type) ? type : 'incident';
    const finalCategory = await resolveCategory(category && category.trim());
    const autoGroupId = await defaultGroupForCategory(finalCategory);

    const info = await db.run(
      'INSERT INTO tickets (subject, description, priority, type, category, created_by, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [subject.trim(), description.trim(), finalPriority, finalType, finalCategory, req.user.id, autoGroupId]
    );

    const ticketId = Number(info.lastInsertRowid);
    await logEvent(ticketId, req.user.id, 'Ticket creato');

    const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
    res.status(201).json({ ticket: withSla(ticket) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const activity = await listActivity(ticket.id, isStaff(req.user));
    res.json({ ticket: withSla(ticket), activity });
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
    let justResolved = false;

    if (isStaff(req.user)) {
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) {
          return res.status(400).json({ error: 'Stato non valido' });
        }
        if (body.status !== ticket.status) {
          updates.push('status = ?');
          params.push(body.status);
          events.push(`Stato cambiato da "${STATUS_LABELS[ticket.status]}" a "${STATUS_LABELS[body.status]}"`);
          justResolved = body.status === 'resolved';
          if (justResolved) {
            updates.push("resolved_at = datetime('now')");
          } else if (ticket.resolved_at) {
            updates.push('resolved_at = NULL');
          }
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
      if (body.type !== undefined) {
        if (!TYPES.includes(body.type)) {
          return res.status(400).json({ error: 'Tipo non valido' });
        }
        if (body.type !== ticket.type) {
          updates.push('type = ?');
          params.push(body.type);
          events.push(`Tipo cambiato da "${TYPE_LABELS[ticket.type]}" a "${TYPE_LABELS[body.type]}"`);
        }
      }
      if (body.category !== undefined && body.category.trim()) {
        const resolvedCategory = await resolveCategory(body.category.trim());
        if (resolvedCategory !== ticket.category) {
          updates.push('category = ?');
          params.push(resolvedCategory);
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
            if (assignee.id !== req.user.id) {
              notifyUser(assignee.id, ticket.id, `Ti è stato assegnato il ticket #${ticket.id}: ${ticket.subject}`).catch(() => {});
            }
          }
        }
      }
      if (body.group_id !== undefined) {
        if (body.group_id === null) {
          if (ticket.group_id !== null) {
            updates.push('group_id = NULL');
            events.push('Rimosso il gruppo di assegnazione');
          }
        } else {
          const targetGroup = await db.get('SELECT id, name FROM groups WHERE id = ?', [body.group_id]);
          if (!targetGroup) {
            return res.status(400).json({ error: 'Gruppo non valido' });
          }
          if (targetGroup.id !== ticket.group_id) {
            updates.push('group_id = ?');
            params.push(body.group_id);
            events.push(`Gruppo di assegnazione impostato a "${targetGroup.name}"`);
          }
        }
      }
      if (body.asset_id !== undefined) {
        if (body.asset_id === null) {
          if (ticket.asset_id !== null) {
            updates.push('asset_id = NULL');
            events.push('Rimosso l\'asset collegato');
          }
        } else {
          const targetAsset = await db.get('SELECT id, name FROM assets WHERE id = ?', [body.asset_id]);
          if (!targetAsset) {
            return res.status(400).json({ error: 'Asset non valido' });
          }
          if (targetAsset.id !== ticket.asset_id) {
            updates.push('asset_id = ?');
            params.push(body.asset_id);
            events.push(`Collegato all'asset "${targetAsset.name}"`);
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
        if (ticket.resolved_at) updates.push('resolved_at = NULL');
        events.push('Ticket riaperto dal richiedente');
      } else if (body.status !== undefined) {
        return res.status(403).json({ error: 'Non puoi impostare questo stato' });
      }
    }

    if (isOwner || isStaff(req.user)) {
      if (body.subject !== undefined && body.subject.trim() && body.subject.trim() !== ticket.subject) {
        updates.push('subject = ?');
        params.push(body.subject.trim());
        events.push('Oggetto del ticket modificato');
      }
      if (body.description !== undefined && body.description.trim() && body.description.trim() !== ticket.description) {
        updates.push('description = ?');
        params.push(body.description.trim());
        events.push('Descrizione del ticket modificata');
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

    const updated = withSla(await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticket.id]));
    realtime.broadcastTicketUpdate(ticket.id, updated);
    if (justResolved) {
      mailer.notifyTicketResolved(updated).catch((err) => console.error('Invio email fallito:', err.message));
      if (ticket.created_by !== req.user.id) {
        notifyUser(ticket.created_by, ticket.id, `Il ticket #${ticket.id} è stato risolto: ${ticket.subject}`).catch(() => {});
      }
    }
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

    const info = await db.run('INSERT INTO comments (ticket_id, user_id, message, is_internal) VALUES (?, ?, ?, ?)', [
      ticket.id,
      req.user.id,
      message.trim(),
      internal,
    ]);
    await db.run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", [ticket.id]);

    const commentRow = await db.get(
      `SELECT c.id, c.message, c.is_internal, c.created_at, u.name AS author_name, u.role AS author_role
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    realtime.broadcastActivityItem(ticket.id, { kind: 'comment', ...commentRow });

    const notifyTargets = new Set();
    if (!internal) {
      if (ticket.created_by !== req.user.id) notifyTargets.add(ticket.created_by);
      if (ticket.assigned_to && ticket.assigned_to !== req.user.id) notifyTargets.add(ticket.assigned_to);
    } else if (ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      notifyTargets.add(ticket.assigned_to);
    }
    for (const targetId of notifyTargets) {
      notifyUser(targetId, ticket.id, `Nuovo messaggio sul ticket #${ticket.id}: ${ticket.subject}`).catch(() => {});
    }

    const activity = await listActivity(ticket.id, isStaff(req.user));
    res.status(201).json({ activity });
  })
);

module.exports = router;
