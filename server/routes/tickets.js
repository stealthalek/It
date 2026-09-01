const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const realtime = require('../realtime');
const mailer = require('../mailer');
const { notifyUser } = require('../notifications');
const { businessMillisBetween, computeSlaStatus, computeSlaRemaining, withSla } = require('../sla');
const { formatTicketNumber } = require('../lib/ticketNumber');
const { hasPermission } = require('../lib/permissions');
const { syncRequestStatus: syncOnboardingRequestStatus } = require('./onboarding');

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
    asset.name AS asset_name,
    asset.tag AS asset_tag,
    onBehalf.name AS on_behalf_name,
    onBehalf.email AS on_behalf_email,
    obReq.id AS onboarding_request_id,
    obReq.employee_name AS onboarding_employee_name,
    (SELECT GROUP_CONCAT(tg.name, ',') FROM ticket_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.ticket_id = t.id) AS tag_names
  FROM tickets t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  LEFT JOIN groups grp ON grp.id = t.group_id
  LEFT JOIN groups grpParent ON grpParent.id = grp.parent_id
  LEFT JOIN assets asset ON asset.id = t.asset_id
  LEFT JOIN users onBehalf ON onBehalf.id = t.on_behalf_of
  LEFT JOIN onboarding_items obItem ON obItem.ticket_id = t.id
  LEFT JOIN onboarding_requests obReq ON obReq.id = obItem.request_id
`;

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
}

function canAccessTicket(user, ticket) {
  if (!isStaff(user)) return ticket.created_by === user.id || ticket.on_behalf_of === user.id;
  if (user.is_super_admin) return true;
  if (ticket.company_id && ticket.company_id !== user.company_id) return false;
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
  const staff = await db.all("SELECT id, group_id, company_id, is_super_admin FROM users WHERE role IN ('agent', 'admin')");
  const recipients = staff.filter((u) => u.id !== ticket.created_by
    && (u.is_super_admin || (!ticket.company_id || u.company_id === ticket.company_id))
    && (u.is_super_admin || !ticket.group_id || u.group_id === ticket.group_id));
  for (const u of recipients) {
    notifyUser(u.id, ticket.id, {
      it: `Nuovo ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`,
      en: `New ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`,
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
  const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
  if (!ticket) return;

  const rules = await db.all(
    `SELECT r.*, grpAction.name AS action_assign_group_name, u.name AS action_assign_user_name
     FROM automation_rules r
     LEFT JOIN groups grpAction ON grpAction.id = r.action_assign_group_id
     LEFT JOIN users u ON u.id = r.action_assign_user_id
     WHERE r.enabled = 1 AND r.trigger_event = ? AND (r.company_id IS NULL OR r.company_id = ?)
     ORDER BY r.position ASC, r.id ASC`,
    [triggerEvent, ticket.company_id || null]
  );
  if (!rules.length) return;

  for (const rule of rules) {
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
      if (rule.action_set_status) ticket.status = rule.action_set_status;
      if (rule.action_set_priority) ticket.priority = rule.action_set_priority;
      if (rule.action_assign_group_id) ticket.group_id = rule.action_assign_group_id;
      if (rule.action_assign_user_id) ticket.assigned_to = rule.action_assign_user_id;
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

async function listWatchers(ticketId) {
  return db.all(
    `SELECT u.id, u.name FROM ticket_watchers w JOIN users u ON u.id = w.user_id WHERE w.ticket_id = ? ORDER BY u.name ASC`,
    [ticketId]
  );
}

async function listTicketLinks(ticketId) {
  return db.all(
    `SELECT l.id, t.id AS linked_ticket_id, t.subject AS linked_subject, t.status AS linked_status
     FROM ticket_links l
     JOIN tickets t ON t.id = (CASE WHEN l.ticket_id = ? THEN l.linked_ticket_id ELSE l.ticket_id END)
     WHERE l.ticket_id = ? OR l.linked_ticket_id = ?
     ORDER BY l.created_at DESC`,
    [ticketId, ticketId, ticketId]
  );
}

async function listTicketTags(ticketId) {
  return db.all(
    `SELECT tg.id, tg.name FROM ticket_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.ticket_id = ? ORDER BY tg.name ASC`,
    [ticketId]
  );
}

const DEVICE_REQUEST_TYPE_TAGS = {
  problem: 'problema',
  new_device: 'nuovo dispositivo',
  replacement: 'sostituzione',
  loan: 'prestito',
  lost_stolen: 'smarrito o rubato',
};

async function attachTag(ticketId, tagName) {
  let tag = await db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
  if (!tag) {
    const info = await db.run('INSERT INTO tags (name) VALUES (?)', [tagName]);
    tag = { id: Number(info.lastInsertRowid) };
  }
  await db.run('INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)', [ticketId, tag.id]);
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
      clauses.push('(t.created_by = ? OR t.on_behalf_of = ?)');
      params.push(req.user.id, req.user.id);
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
      clauses.push('(t.company_id IS NULL OR t.company_id = ?)');
      params.push(req.user.company_id);
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
    if (req.query.tag && req.query.tag.trim()) {
      clauses.push('t.id IN (SELECT tt.ticket_id FROM ticket_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tg.name = ?)');
      params.push(req.query.tag.trim());
    }
    if (req.query.category && req.query.category.trim()) {
      clauses.push('t.category = ?');
      params.push(req.query.category.trim());
    }
    if (req.query.excludeId && /^\d+$/.test(req.query.excludeId)) {
      clauses.push('t.id != ?');
      params.push(Number(req.query.excludeId));
    }
    if (q && q.trim()) {
      const trimmed = q.trim();
      const normalizedId = trimmed.replace(/^#/, '').replace(/^tck-?/i, '').replace(/^0+(?=\d)/, '');
      const asId = /^\d+$/.test(normalizedId) ? Number(normalizedId) : null;
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

    if (req.query.page) {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
      const offset = (page - 1) * pageSize;
      const totalRow = await db.get(`SELECT COUNT(*) AS n FROM tickets t ${where}`, params);
      const tickets = await db.all(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
      return res.json({ tickets: tickets.map(withSla), total: totalRow.n, page, pageSize });
    }

    const tickets = await db.all(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC LIMIT 2000`, params);

    res.json({ tickets: tickets.map(withSla) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { subject, description, priority, category, type, customFields, onBehalfOf, deviceRequestType } = req.body || {};

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

    let beneficiary = null;
    if (onBehalfOf && Number(onBehalfOf) !== req.user.id) {
      beneficiary = await db.get('SELECT id, name FROM users WHERE id = ?', [Number(onBehalfOf)]);
      if (!beneficiary) {
        return res.status(400).json({ error: 'Utente selezionato non valido' });
      }
    }

    const info = await db.run(
      'INSERT INTO tickets (subject, description, priority, type, category, created_by, group_id, on_behalf_of, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        subject.trim(), description.trim(), finalPriority, finalType, finalCategory, req.user.id, autoGroupId,
        beneficiary ? beneficiary.id : null, req.user.company_id,
      ]
    );

    const ticketId = Number(info.lastInsertRowid);
    await saveCustomFieldValues(ticketId, finalCategory, customFields);
    if (deviceRequestType && DEVICE_REQUEST_TYPE_TAGS[deviceRequestType]) {
      await attachTag(ticketId, DEVICE_REQUEST_TYPE_TAGS[deviceRequestType]);
    }
    await logEvent(ticketId, req.user.id, beneficiary ? `Ticket aperto da ${req.user.name} per conto di ${beneficiary.name}` : 'Ticket creato');
    await runAutomationRules(ticketId, 'created', req.user.id);

    const ticket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [ticketId]);
    notifyStaffOfNewTicket(ticket).catch(() => {});
    if (beneficiary) {
      notifyUser(beneficiary.id, ticket.id, {
        it: `${req.user.name} ha aperto il ticket #${formatTicketNumber(ticket.id)} per tuo conto: ${ticket.subject}`,
        en: `${req.user.name} opened ticket #${formatTicketNumber(ticket.id)} on your behalf: ${ticket.subject}`,
      }).catch(() => {});
    }
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
    const tags = await listTicketTags(ticket.id);
    const links = await listTicketLinks(ticket.id);
    const watchers = await listWatchers(ticket.id);
    const isWatching = isStaff(req.user) && watchers.some((w) => w.id === req.user.id);
    res.json({ ticket: withSla(ticket), activity, customFieldValues, tags, links, watchers, isWatching });
  })
);

router.post(
  '/:id/watch',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    if (!isStaff(req.user)) {
      return res.status(403).json({ error: 'Solo lo staff può seguire un ticket' });
    }
    await db.run('INSERT OR IGNORE INTO ticket_watchers (ticket_id, user_id) VALUES (?, ?)', [ticket.id, req.user.id]);
    const watchers = await listWatchers(ticket.id);
    res.status(201).json({ watchers, isWatching: true });
  })
);

router.delete(
  '/:id/watch',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    await db.run('DELETE FROM ticket_watchers WHERE ticket_id = ? AND user_id = ?', [ticket.id, req.user.id]);
    const watchers = await listWatchers(ticket.id);
    res.json({ watchers, isWatching: false });
  })
);

router.post(
  '/:id/links',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    if (!isStaff(req.user)) {
      return res.status(403).json({ error: 'Solo lo staff può collegare i ticket' });
    }
    const linkedTicketId = Number(req.body && req.body.linkedTicketId);
    if (!linkedTicketId || linkedTicketId === ticket.id) {
      return res.status(400).json({ error: 'Ticket da collegare non valido' });
    }
    const linkedTicket = await db.get(`${TICKET_SELECT} WHERE t.id = ?`, [linkedTicketId]);
    if (!linkedTicket || !canAccessTicket(req.user, linkedTicket)) {
      return res.status(404).json({ error: 'Ticket da collegare non trovato' });
    }
    const existing = await db.get(
      'SELECT id FROM ticket_links WHERE (ticket_id = ? AND linked_ticket_id = ?) OR (ticket_id = ? AND linked_ticket_id = ?)',
      [ticket.id, linkedTicketId, linkedTicketId, ticket.id]
    );
    if (!existing) {
      await db.run('INSERT INTO ticket_links (ticket_id, linked_ticket_id, created_by) VALUES (?, ?, ?)', [
        ticket.id, linkedTicketId, req.user.id,
      ]);
      await logEvent(ticket.id, req.user.id, `Collegato al ticket #${linkedTicketId}: "${linkedTicket.subject}"`);
    }

    const links = await listTicketLinks(ticket.id);
    res.status(201).json({ links });
  })
);

router.delete(
  '/:id/links/:linkId',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    if (!isStaff(req.user)) {
      return res.status(403).json({ error: 'Solo lo staff può collegare i ticket' });
    }
    await db.run(
      'DELETE FROM ticket_links WHERE id = ? AND (ticket_id = ? OR linked_ticket_id = ?)',
      [req.params.linkId, ticket.id, ticket.id]
    );
    await logEvent(ticket.id, req.user.id, 'Collegamento rimosso');

    const links = await listTicketLinks(ticket.id);
    res.json({ links });
  })
);

router.post(
  '/:id/tags',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    if (!isStaff(req.user)) {
      return res.status(403).json({ error: 'Solo lo staff può gestire le etichette' });
    }
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome dell\'etichetta è obbligatorio' });
    }
    const finalName = name.trim().slice(0, 40).toLowerCase();

    let tag = await db.get('SELECT id, name FROM tags WHERE name = ?', [finalName]);
    if (!tag) {
      const info = await db.run('INSERT INTO tags (name) VALUES (?)', [finalName]);
      tag = { id: Number(info.lastInsertRowid), name: finalName };
    }
    await db.run('INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)', [ticket.id, tag.id]);
    await logEvent(ticket.id, req.user.id, `Etichetta aggiunta: "${tag.name}"`);

    const tags = await listTicketTags(ticket.id);
    res.status(201).json({ tags });
  })
);

router.delete(
  '/:id/tags/:tagId',
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req, res);
    if (!ticket) return;
    if (!isStaff(req.user)) {
      return res.status(403).json({ error: 'Solo lo staff può gestire le etichette' });
    }
    const tag = await db.get('SELECT name FROM tags WHERE id = ?', [req.params.tagId]);
    await db.run('DELETE FROM ticket_tags WHERE ticket_id = ? AND tag_id = ?', [ticket.id, req.params.tagId]);
    if (tag) await logEvent(ticket.id, req.user.id, `Etichetta rimossa: "${tag.name}"`);

    const tags = await listTicketTags(ticket.id);
    res.json({ tags });
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

    if (isStaff(req.user) && !req.user.read_only) {
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
          if (ticket.cancelled_at) {
            updates.push('cancelled_at = NULL', 'cancelled_reason = NULL');
          }
          if (body.status === 'waiting_customer') {
            updates.push("waiting_since = datetime('now')");
            justSetWaiting = true;
          } else if (ticket.status === 'waiting_customer' && ticket.waiting_since) {
            const workStart = ticket.work_start_hour ?? 9;
            const workEnd = ticket.work_end_hour ?? 18;
            const since = new Date(ticket.waiting_since.replace(' ', 'T') + 'Z').getTime();
            const pausedNow = businessMillisBetween(since, Date.now(), workStart, workEnd, ticket.company_id);
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
                it: `Ti è stato assegnato il ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`,
                en: `Ticket #${formatTicketNumber(ticket.id)} has been assigned to you: ${ticket.subject}`,
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

    const isOwner = ticket.created_by === req.user.id || ticket.on_behalf_of === req.user.id;
    if (isOwner && !isStaff(req.user)) {
      const wantsReopen = body.status === 'open' && ['resolved', 'closed'].includes(ticket.status);
      const wantsCancel = body.status === 'closed' && ['open', 'in_progress', 'waiting_customer'].includes(ticket.status);
      if (wantsReopen) {
        updates.push('status = ?');
        params.push('open');
        if (ticket.resolved_at) updates.push('resolved_at = NULL');
        events.push('Ticket riaperto dal richiedente');
      } else if (wantsCancel) {
        updates.push('status = ?');
        params.push('closed');
        events.push('Ticket annullato dal richiedente');
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
          it: `Il ticket #${formatTicketNumber(ticket.id)} è stato risolto: ${ticket.subject}`,
          en: `Ticket #${formatTicketNumber(ticket.id)} has been resolved: ${ticket.subject}`,
        }).catch(() => {});
      }
      const onboardingItem = await db.get('SELECT * FROM onboarding_items WHERE ticket_id = ?', [ticket.id]);
      if (onboardingItem && !['done', 'skipped'].includes(onboardingItem.status)) {
        let generatedAssetId = null;
        if (onboardingItem.kind === 'asset' && !onboardingItem.asset_id) {
          const onboardingRequest = await db.get(
            'SELECT employee_name, employee_user_id FROM onboarding_requests WHERE id = ?',
            [onboardingItem.request_id]
          );
          const assetInfo = await db.run(
            `INSERT INTO assets (name, asset_type, tag, assignment_type, assigned_to, status, company_id)
             VALUES (?, ?, NULL, 'permanente', ?, ?, ?)`,
            [
              `${onboardingItem.label_it} - ${onboardingRequest.employee_name}`,
              onboardingItem.asset_type || 'altro',
              onboardingRequest.employee_user_id || null,
              onboardingRequest.employee_user_id ? 'in_uso' : 'disponibile',
              req.user.company_id || null,
            ]
          );
          generatedAssetId = Number(assetInfo.lastInsertRowid);
        }
        await db.run(
          `UPDATE onboarding_items SET status = 'done', completed_by = ?, completed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')${generatedAssetId ? ', asset_id = ?' : ''} WHERE id = ?`,
          generatedAssetId ? [req.user.id, generatedAssetId, onboardingItem.id] : [req.user.id, onboardingItem.id]
        );
        await syncOnboardingRequestStatus(onboardingItem.request_id);
      }
    }
    if (justSetWaiting && ticket.created_by !== req.user.id) {
      notifyUser(ticket.created_by, ticket.id, {
        it: `Il ticket #${formatTicketNumber(ticket.id)} è in attesa di una tua risposta: ${ticket.subject}`,
        en: `Ticket #${formatTicketNumber(ticket.id)} is awaiting your reply: ${ticket.subject}`,
      }).catch(() => {});
    }
    if (events.length) {
      const watchers = await listWatchers(ticket.id);
      watchers.filter((w) => w.id !== req.user.id).forEach((w) => {
        notifyUser(w.id, ticket.id, {
          it: `Il ticket #${formatTicketNumber(ticket.id)} che segui è stato aggiornato: ${ticket.subject}`,
          en: `Ticket #${formatTicketNumber(ticket.id)} you follow was updated: ${ticket.subject}`,
        }).catch(() => {});
      });
    }
    res.json({ ticket: updated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'tickets_delete')) {
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

    if (isStaff(req.user) && req.user.read_only) {
      return res.status(403).json({ error: 'Il tuo ruolo consente solo la consultazione' });
    }

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

    if (!internal && isStaff(req.user) && !ticket.first_response_at) {
      await db.run("UPDATE tickets SET first_response_at = datetime('now') WHERE id = ?", [ticket.id]);
    }

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
      const pausedNow = businessMillisBetween(since, Date.now(), workStart, workEnd, ticket.company_id);
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
    const watchers = await listWatchers(ticket.id);
    watchers.forEach((w) => { if (w.id !== req.user.id) notifyTargets.add(w.id); });
    for (const targetId of notifyTargets) {
      notifyUser(targetId, ticket.id, {
        it: `Nuovo messaggio sul ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`,
        en: `New message on ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`,
      }).catch(() => {});
    }
    if (autoReopened && ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      notifyUser(ticket.assigned_to, ticket.id, {
        it: `Il richiedente ha risposto: il ticket #${formatTicketNumber(ticket.id)} è tornato in lavorazione`,
        en: `The requester replied: ticket #${formatTicketNumber(ticket.id)} is back in progress`,
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

const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
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
      return res.status(400).json({ error: 'File troppo grande (max 50 MB)' });
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
