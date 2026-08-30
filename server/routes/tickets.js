const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const realtime = require('../realtime');
const mailer = require('../mailer');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TYPES = ['incident', 'task'];

const STATUS_LABELS = { open: 'Aperto', in_progress: 'In lavorazione', waiting_customer: 'In attesa del richiedente', resolved: 'Risolto', closed: 'Chiuso' };
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
    grp.work_start_hour AS work_start_hour,
    grp.work_end_hour AS work_end_hour,
    asset.name AS asset_name
  FROM tickets t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  LEFT JOIN groups grp ON grp.id = t.group_id
  LEFT JOIN groups grpParent ON grpParent.id = grp.parent_id
  LEFT JOIN assets asset ON asset.id = t.asset_id
`;

function businessMillisBetween(startMs, endMs, startHour, endHour) {
  if (endMs <= startMs || endHour <= startHour) return 0;
  const MS_PER_DAY = 24 * 3600 * 1000;
  let total = 0;
  let dayStart = new Date(startMs);
  dayStart.setUTCHours(0, 0, 0, 0);
  let cursor = dayStart.getTime();
  while (cursor < endMs) {
    const dayOfWeek = new Date(cursor).getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const windowStart = cursor + startHour * 3600 * 1000;
      const windowEnd = cursor + endHour * 3600 * 1000;
      const overlapStart = Math.max(windowStart, startMs);
      const overlapEnd = Math.min(windowEnd, endMs);
      if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    }
    cursor += MS_PER_DAY;
  }
  return total;
}

function pausedMillisSoFar(ticket, workStart, workEnd) {
  let paused = ticket.sla_paused_ms || 0;
  if (ticket.status === 'waiting_customer' && ticket.waiting_since) {
    const since = new Date(ticket.waiting_since.replace(' ', 'T') + 'Z').getTime();
    paused += businessMillisBetween(since, Date.now(), workStart, workEnd);
  }
  return paused;
}

function computeSlaStatus(ticket) {
  if (!ticket.sla_resolve_hours || !ticket.created_at) return null;
  const workStart = ticket.work_start_hour ?? 9;
  const workEnd = ticket.work_end_hour ?? 18;
  const created = new Date(ticket.created_at.replace(' ', 'T') + 'Z').getTime();
  const resolveMs = ticket.sla_resolve_hours * 3600 * 1000;
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    if (!ticket.resolved_at) return null;
    const resolved = new Date(ticket.resolved_at.replace(' ', 'T') + 'Z').getTime();
    const elapsed = businessMillisBetween(created, resolved, workStart, workEnd) - (ticket.sla_paused_ms || 0);
    return elapsed > resolveMs ? 'breached' : 'on_track';
  }
  const elapsed = Math.max(0, businessMillisBetween(created, Date.now(), workStart, workEnd) - pausedMillisSoFar(ticket, workStart, workEnd));
  const ratio = elapsed / resolveMs;
  if (ratio >= 1) return 'breached';
  if (ratio >= 0.75) return 'at_risk';
  return 'on_track';
}

function computeSlaRemaining(ticket) {
  if (!ticket.sla_resolve_hours || !ticket.created_at) return null;
  if (ticket.status === 'resolved' || ticket.status === 'closed') return null;
  const workStart = ticket.work_start_hour ?? 9;
  const workEnd = ticket.work_end_hour ?? 18;
  const created = new Date(ticket.created_at.replace(' ', 'T') + 'Z').getTime();
  const resolveMs = ticket.sla_resolve_hours * 3600 * 1000;
  const elapsed = Math.max(0, businessMillisBetween(created, Date.now(), workStart, workEnd) - pausedMillisSoFar(ticket, workStart, workEnd));
  return resolveMs - elapsed;
}

function withSla(ticket) {
  return { ...ticket, sla_status: computeSlaStatus(ticket), sla_remaining_ms: computeSlaRemaining(ticket) };
}

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
}

function canAccessTicket(user, ticket) {
  if (!isStaff(user)) return ticket.created_by === user.id;
  if (user.is_super_admin) return true;
  if (!ticket.group_id) return true;
  return ticket.group_id === user.group_id;
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

function parseFieldOptions(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function applicableCustomFields(categoryName) {
  const category = categoryName ? await db.get('SELECT id FROM categories WHERE name = ?', [categoryName]) : null;
  const fields = category
    ? await db.all('SELECT * FROM custom_fields WHERE category_id IS NULL OR category_id = ? ORDER BY position ASC', [category.id])
    : await db.all('SELECT * FROM custom_fields WHERE category_id IS NULL ORDER BY position ASC');
  return fields;
}

async function validateCustomFieldValues(categoryName, customFieldsInput) {
  const fields = await applicableCustomFields(categoryName);
  const values = customFieldsInput && typeof customFieldsInput === 'object' ? customFieldsInput : {};

  for (const field of fields) {
    const raw = values[field.id];
    const provided = raw !== undefined && raw !== null && String(raw).trim() !== '';

    if (field.required && field.field_type !== 'checkbox' && !provided) {
      return `Il campo "${field.name}" è obbligatorio`;
    }
    if (field.field_type === 'select' && provided) {
      const options = parseFieldOptions(field.options);
      if (!options.includes(String(raw))) {
        return `Valore non valido per il campo "${field.name}"`;
      }
    }
    if (field.field_type === 'number' && provided && Number.isNaN(Number(raw))) {
      return `Il campo "${field.name}" deve essere numerico`;
    }
  }
  return null;
}

async function saveCustomFieldValues(ticketId, categoryName, customFieldsInput) {
  const fields = await applicableCustomFields(categoryName);
  const values = customFieldsInput && typeof customFieldsInput === 'object' ? customFieldsInput : {};

  for (const field of fields) {
    const raw = values[field.id];
    if (raw === undefined) continue;
    const stored = field.field_type === 'checkbox' ? (raw ? '1' : '0') : String(raw).trim();
    await db.run(
      `INSERT INTO ticket_custom_values (ticket_id, field_id, value) VALUES (?, ?, ?)
       ON CONFLICT(ticket_id, field_id) DO UPDATE SET value = excluded.value`,
      [ticketId, field.id, stored]
    );
  }
}

async function listCustomValues(ticketId) {
  return db.all(
    `SELECT f.id AS field_id, f.name, f.field_type, f.options, f.required, v.value
     FROM ticket_custom_values v
     JOIN custom_fields f ON f.id = v.field_id
     WHERE v.ticket_id = ?
     ORDER BY f.position ASC`,
    [ticketId]
  ).then((rows) => rows.map((r) => ({ ...r, options: parseFieldOptions(r.options) })));
}

async function notifyStaffOfNewTicket(ticket) {
  const staff = await db.all("SELECT id, group_id, is_super_admin FROM users WHERE role IN ('agent', 'admin')");
  const recipients = staff.filter((u) => u.id !== ticket.created_by && (u.is_super_admin || !ticket.group_id || u.group_id === ticket.group_id));
  for (const u of recipients) {
    notifyUser(u.id, ticket.id, {
      it: `Nuovo ticket #${ticket.id}: ${ticket.subject}`,
      en: `New ticket #${ticket.id}: ${ticket.subject}`,
    }).catch(() => {});
  }
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

async function runAutomationRules(ticketId, triggerEvent, actorId) {
  const rules = await db.all(
    `SELECT r.*, grpAction.name AS action_assign_group_name, u.name AS action_assign_user_name
     FROM automation_rules r
     LEFT JOIN groups grpAction ON grpAction.id = r.action_assign_group_id
     LEFT JOIN users u ON u.id = r.action_assign_user_id
     WHERE r.enabled = 1 AND r.trigger_event = ?
     ORDER BY r.position ASC, r.id ASC`,
    [triggerEvent]
  );
  if (!rules.length) return;

  for (const rule of rules) {
    const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
    if (!ticket) return;
    if (rule.cond_status && rule.cond_status !== ticket.status) continue;
    if (rule.cond_priority && rule.cond_priority !== ticket.priority) continue;
    if (rule.cond_category && rule.cond_category !== ticket.category) continue;
    if (rule.cond_type && rule.cond_type !== ticket.type) continue;
    if (rule.cond_group_id && rule.cond_group_id !== ticket.group_id) continue;

    const updates = [];
    const params = [];
    const events = [];

    if (rule.action_set_status && rule.action_set_status !== ticket.status) {
      updates.push('status = ?');
      params.push(rule.action_set_status);
      events.push(`Stato impostato automaticamente a "${STATUS_LABELS[rule.action_set_status]}" (regola "${rule.name}")`);
      if (rule.action_set_status === 'resolved') updates.push("resolved_at = datetime('now')");
    }
    if (rule.action_set_priority && rule.action_set_priority !== ticket.priority) {
      updates.push('priority = ?');
      params.push(rule.action_set_priority);
      events.push(`Priorità impostata automaticamente a "${PRIORITY_LABELS[rule.action_set_priority]}" (regola "${rule.name}")`);
    }
    if (rule.action_assign_group_id && rule.action_assign_group_id !== ticket.group_id) {
      updates.push('group_id = ?');
      params.push(rule.action_assign_group_id);
      events.push(`Gruppo impostato automaticamente a "${rule.action_assign_group_name || rule.action_assign_group_id}" (regola "${rule.name}")`);
    }
    if (rule.action_assign_user_id && rule.action_assign_user_id !== ticket.assigned_to) {
      updates.push('assigned_to = ?');
      params.push(rule.action_assign_user_id);
      events.push(`Assegnato automaticamente a "${rule.action_assign_user_name || rule.action_assign_user_id}" (regola "${rule.name}")`);
    }

    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      params.push(ticketId);
      await db.run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);
      for (const message of events) {
        await logEvent(ticketId, actorId, message);
      }
    }
    if (rule.action_note) {
      await db.run('INSERT INTO comments (ticket_id, user_id, message, is_internal) VALUES (?, ?, ?, 1)', [
        ticketId, actorId, `${rule.action_note} (nota automatica — regola "${rule.name}")`,
      ]);
    }
  }

  const finalTicket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
  if (finalTicket) realtime.broadcastTicketUpdate(ticketId, withSla(finalTicket));
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

    if (isStaff(req.user) && !req.user.is_super_admin) {
      if (req.user.group_id) {
        clauses.push('(t.group_id IS NULL OR t.group_id = ?)');
        params.push(req.user.group_id);
      } else {
        clauses.push('t.group_id IS NULL');
      }
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
    const { subject, description, priority, category, type, customFields } = req.body || {};

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

    const customFieldsError = await validateCustomFieldValues(finalCategory, customFields);
    if (customFieldsError) {
      return res.status(400).json({ error: customFieldsError });
    }

    const info = await db.run(
      'INSERT INTO tickets (subject, description, priority, type, category, created_by, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [subject.trim(), description.trim(), finalPriority, finalType, finalCategory, req.user.id, autoGroupId]
    );

    const ticketId = Number(info.lastInsertRowid);
    await saveCustomFieldValues(ticketId, finalCategory, customFields);
    await logEvent(ticketId, req.user.id, 'Ticket creato');
    await runAutomationRules(ticketId, 'created', req.user.id);

    const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
    notifyStaffOfNewTicket(ticket).catch(() => {});
    res.status(201).json({ ticket: withSla(ticket) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const activity = await listActivity(ticket.id, isStaff(req.user));
    const customFieldValues = await listCustomValues(ticket.id);
    res.json({ ticket: withSla(ticket), activity, customFieldValues });
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
    let justSetWaiting = false;

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
          if (body.status === 'waiting_customer') {
            updates.push("waiting_since = datetime('now')");
            justSetWaiting = true;
          } else if (ticket.status === 'waiting_customer' && ticket.waiting_since) {
            const workStart = ticket.work_start_hour ?? 9;
            const workEnd = ticket.work_end_hour ?? 18;
            const since = new Date(ticket.waiting_since.replace(' ', 'T') + 'Z').getTime();
            const pausedNow = businessMillisBetween(since, Date.now(), workStart, workEnd);
            updates.push('sla_paused_ms = sla_paused_ms + ?');
            params.push(pausedNow);
            updates.push('waiting_since = NULL');
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
              notifyUser(assignee.id, ticket.id, {
                it: `Ti è stato assegnato il ticket #${ticket.id}: ${ticket.subject}`,
                en: `Ticket #${ticket.id} has been assigned to you: ${ticket.subject}`,
              }).catch(() => {});
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

    let customFieldsUpdated = false;
    if ((isOwner || isStaff(req.user)) && body.customFields !== undefined) {
      const targetCategory = updates.some((u) => u.startsWith('category')) ? await resolveCategory(body.category.trim()) : ticket.category;
      const customFieldsError = await validateCustomFieldValues(targetCategory, body.customFields);
      if (customFieldsError) {
        return res.status(400).json({ error: customFieldsError });
      }
      customFieldsUpdated = true;
    }

    if (updates.length === 0 && !customFieldsUpdated) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(ticket.id);
      await db.run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    if (customFieldsUpdated) {
      const targetCategory = updates.some((u) => u.startsWith('category')) ? await resolveCategory(body.category.trim()) : ticket.category;
      await saveCustomFieldValues(ticket.id, targetCategory, body.customFields);
    }
    for (const message of events) {
      await logEvent(ticket.id, req.user.id, message);
    }
    await runAutomationRules(ticket.id, 'updated', req.user.id);

    const updated = withSla(await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticket.id]));
    realtime.broadcastTicketUpdate(ticket.id, updated);
    if (justResolved) {
      mailer.notifyTicketResolved(updated).catch((err) => console.error('Invio email fallito:', err.message));
      if (ticket.created_by !== req.user.id) {
        notifyUser(ticket.created_by, ticket.id, {
          it: `Il ticket #${ticket.id} è stato risolto: ${ticket.subject}`,
          en: `Ticket #${ticket.id} has been resolved: ${ticket.subject}`,
        }).catch(() => {});
      }
    }
    if (justSetWaiting && ticket.created_by !== req.user.id) {
      notifyUser(ticket.created_by, ticket.id, {
        it: `Il ticket #${ticket.id} è in attesa di una tua risposta: ${ticket.subject}`,
        en: `Ticket #${ticket.id} is awaiting your reply: ${ticket.subject}`,
      }).catch(() => {});
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
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
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

    const autoReopened = !internal && ticket.status === 'waiting_customer' && ticket.created_by === req.user.id;
    if (autoReopened) {
      const workStart = ticket.work_start_hour ?? 9;
      const workEnd = ticket.work_end_hour ?? 18;
      const since = ticket.waiting_since ? new Date(ticket.waiting_since.replace(' ', 'T') + 'Z').getTime() : Date.now();
      const pausedNow = businessMillisBetween(since, Date.now(), workStart, workEnd);
      await db.run(
        "UPDATE tickets SET status = 'in_progress', waiting_since = NULL, sla_paused_ms = sla_paused_ms + ? WHERE id = ?",
        [pausedNow, ticket.id]
      );
      await logEvent(ticket.id, req.user.id, `Stato cambiato automaticamente da "${STATUS_LABELS.waiting_customer}" a "${STATUS_LABELS.in_progress}" (risposta del richiedente)`);
      await runAutomationRules(ticket.id, 'updated', req.user.id);
      const updated = withSla(await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticket.id]));
      realtime.broadcastTicketUpdate(ticket.id, updated);
    }

    const notifyTargets = new Set();
    if (!internal) {
      if (ticket.created_by !== req.user.id) notifyTargets.add(ticket.created_by);
      if (ticket.assigned_to && ticket.assigned_to !== req.user.id && !autoReopened) notifyTargets.add(ticket.assigned_to);
    } else if (ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      notifyTargets.add(ticket.assigned_to);
    }
    for (const targetId of notifyTargets) {
      notifyUser(targetId, ticket.id, {
        it: `Nuovo messaggio sul ticket #${ticket.id}: ${ticket.subject}`,
        en: `New message on ticket #${ticket.id}: ${ticket.subject}`,
      }).catch(() => {});
    }
    if (autoReopened && ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      notifyUser(ticket.assigned_to, ticket.id, {
        it: `Il richiedente ha risposto: il ticket #${ticket.id} è tornato in lavorazione`,
        en: `The requester replied: ticket #${ticket.id} is back in progress`,
      }).catch(() => {});
    }

    const activity = await listActivity(ticket.id, isStaff(req.user));
    res.status(201).json({ activity });
  })
);

router.post(
  '/:id/rating',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    if (ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo il richiedente può valutare il ticket' });
    }
    if (!['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Il ticket deve essere risolto per poter essere valutato' });
    }
    const { rating, comment } = req.body || {};
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Valutazione non valida (1-5)' });
    }

    const finalComment = comment && comment.trim() ? comment.trim().slice(0, 1000) : null;
    await db.run("UPDATE tickets SET rating = ?, rating_comment = ?, rated_at = datetime('now') WHERE id = ?", [
      ratingNum, finalComment, ticket.id,
    ]);
    await logEvent(ticket.id, req.user.id, `Ticket valutato: ${ratingNum}/5${finalComment ? ` — "${finalComment}"` : ''}`);

    const updated = withSla(await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticket.id]));
    realtime.broadcastTicketUpdate(ticket.id, updated);
    res.json({ ticket: updated });
  })
);

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/json',
]);

function attachmentMeta(row) {
  return {
    id: row.id, ticket_id: row.ticket_id, comment_id: row.comment_id, uploaded_by: row.uploaded_by,
    file_name: row.file_name, mime_type: row.mime_type, size_bytes: row.size_bytes,
    created_at: row.created_at, uploader_name: row.uploader_name,
  };
}

router.get(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    const rows = await db.all(
      `SELECT a.id, a.ticket_id, a.comment_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM ticket_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.ticket_id = ? ORDER BY a.created_at ASC`,
      [ticket.id]
    );
    res.json({ attachments: rows.map(attachmentMeta) });
  })
);

router.post(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;

    const { fileName, dataUrl, commentId } = req.body || {};
    if (!fileName || !fileName.trim()) {
      return res.status(400).json({ error: 'Nome del file mancante' });
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'File mancante' });
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ error: 'Formato file non valido' });
    }
    const [, mimeType, base64Data] = match;
    if (!ATTACHMENT_ALLOWED_MIME.has(mimeType)) {
      return res.status(400).json({ error: 'Tipo di file non consentito' });
    }
    const sizeBytes = Buffer.byteLength(base64Data, 'base64');
    if (sizeBytes > ATTACHMENT_MAX_BYTES) {
      return res.status(400).json({ error: 'File troppo grande (max 5 MB)' });
    }

    if (commentId) {
      const comment = await db.get('SELECT id FROM comments WHERE id = ? AND ticket_id = ?', [commentId, ticket.id]);
      if (!comment) return res.status(400).json({ error: 'Commento non valido' });
    }

    const info = await db.run(
      'INSERT INTO ticket_attachments (ticket_id, comment_id, uploaded_by, file_name, mime_type, size_bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ticket.id, commentId || null, req.user.id, fileName.trim().slice(0, 255), mimeType, sizeBytes, dataUrl]
    );
    await logEvent(ticket.id, req.user.id, `Allegato aggiunto: "${fileName.trim().slice(0, 255)}"`);

    const row = await db.get(
      `SELECT a.id, a.ticket_id, a.comment_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM ticket_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    res.status(201).json({ attachment: attachmentMeta(row) });
  })
);

router.get(
  '/:id/attachments/:attId',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    const row = await db.get('SELECT * FROM ticket_attachments WHERE id = ? AND ticket_id = ?', [req.params.attId, ticket.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    res.json({ attachment: { ...attachmentMeta(row), data: row.data } });
  })
);

router.delete(
  '/:id/attachments/:attId',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    const row = await db.get('SELECT * FROM ticket_attachments WHERE id = ? AND ticket_id = ?', [req.params.attId, ticket.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    if (row.uploaded_by !== req.user.id && !isStaff(req.user)) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    await db.run('DELETE FROM ticket_attachments WHERE id = ?', [row.id]);
    await logEvent(ticket.id, req.user.id, `Allegato rimosso: "${row.file_name}"`);
    res.status(204).end();
  })
);

module.exports = router;
