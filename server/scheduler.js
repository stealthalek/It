const db = require('./db/database');
const realtime = require('./realtime');
const { computeSlaStatus } = require('./sla');
const { notifyUser } = require('./notifications');
const { formatTicketNumber } = require('./lib/ticketNumber');

const AUTO_CLOSE_HOURS = 72;
const MESSAGE_TTL_DAYS = 14;
const READ_NOTIFICATION_TTL_DAYS = 90;
const AUDIT_LOG_TTL_DAYS = 365;
const SESSION_TTL_DAYS = 90;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const BATCH_SIZE = 200;

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function autoCloseResolvedTickets() {
  const candidates = await db.all(
    `SELECT id FROM tickets
     WHERE status = 'resolved'
       AND resolved_at IS NOT NULL
       AND resolved_at <= datetime('now', ?)`,
    [`-${AUTO_CLOSE_HOURS} hours`]
  );
  if (!candidates.length) return;

  const message = `Chiuso automaticamente dopo ${AUTO_CLOSE_HOURS} ore di inattività`;
  for (const batch of chunk(candidates.map((c) => c.id), BATCH_SIZE)) {
    const placeholders = batch.map(() => '?').join(',');

    await db.run(`UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id IN (${placeholders})`, batch);

    const insertValues = batch.map(() => '(?, NULL, ?)').join(', ');
    await db.run(
      `INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES ${insertValues}`,
      batch.flatMap((id) => [id, message])
    );

    const events = await db.all(
      `SELECT e.id, e.ticket_id, e.message, e.created_at, u.name AS actor_name
       FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.ticket_id IN (${placeholders}) AND e.message = ?
       ORDER BY e.id DESC`,
      [...batch, message]
    );
    const latestEventByTicket = new Map();
    for (const row of events) {
      if (!latestEventByTicket.has(row.ticket_id)) latestEventByTicket.set(row.ticket_id, row);
    }
    for (const id of batch) {
      const row = latestEventByTicket.get(id);
      if (row) realtime.broadcastActivityItem(id, { kind: 'event', id: row.id, message: row.message, created_at: row.created_at, actor_name: row.actor_name });
    }

    const updated = await db.all(
      `SELECT t.*, grp.sla_resolve_hours AS sla_resolve_hours
       FROM tickets t LEFT JOIN groups grp ON grp.id = t.group_id
       WHERE t.id IN (${placeholders})`,
      batch
    );
    for (const ticket of updated) {
      realtime.broadcastTicketUpdate(ticket.id, ticket);
    }
  }
}

async function checkSlaWarnings() {
  const candidates = await db.all(
    `SELECT t.*, grp.sla_resolve_hours AS sla_resolve_hours, grp.work_start_hour AS work_start_hour, grp.work_end_hour AS work_end_hour
     FROM tickets t
     JOIN groups grp ON grp.id = t.group_id
     WHERE t.status IN ('open', 'in_progress', 'waiting_customer')
       AND t.sla_warned_at IS NULL
       AND grp.sla_resolve_hours IS NOT NULL`
  );

  const flagged = candidates
    .map((ticket) => ({ ticket, status: computeSlaStatus(ticket) }))
    .filter(({ status }) => status === 'at_risk' || status === 'breached');
  if (!flagged.length) return;

  for (const batch of chunk(flagged, BATCH_SIZE)) {
    const ids = batch.map(({ ticket }) => ticket.id);
    const placeholders = ids.map(() => '?').join(',');

    await db.run(`UPDATE tickets SET sla_warned_at = datetime('now') WHERE id IN (${placeholders})`, ids);

    const insertValues = batch.map(() => '(?, NULL, ?)').join(', ');
    const insertParams = batch.flatMap(({ ticket, status }) => [
      ticket.id,
      status === 'breached' ? 'SLA superata' : 'SLA a rischio (75% del tempo trascorso)',
    ]);
    await db.run(`INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES ${insertValues}`, insertParams);

    const events = await db.all(
      `SELECT e.id, e.ticket_id, e.message, e.created_at, u.name AS actor_name
       FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.ticket_id IN (${placeholders})
       ORDER BY e.id DESC`,
      ids
    );
    const latestEventByTicket = new Map();
    for (const row of events) {
      if (!latestEventByTicket.has(row.ticket_id)) latestEventByTicket.set(row.ticket_id, row);
    }
    for (const id of ids) {
      const row = latestEventByTicket.get(id);
      if (row) realtime.broadcastActivityItem(id, { kind: 'event', id: row.id, message: row.message, created_at: row.created_at, actor_name: row.actor_name });
    }

    const unassignedGroupIds = [...new Set(batch.filter(({ ticket }) => !ticket.assigned_to).map(({ ticket }) => ticket.group_id))];
    const groupStaffByGroup = new Map();
    if (unassignedGroupIds.length) {
      const groupPlaceholders = unassignedGroupIds.map(() => '?').join(',');
      const staffRows = await db.all(
        `SELECT id, group_id FROM users WHERE group_id IN (${groupPlaceholders}) AND role IN ('agent', 'admin')`,
        unassignedGroupIds
      );
      for (const row of staffRows) {
        if (!groupStaffByGroup.has(row.group_id)) groupStaffByGroup.set(row.group_id, []);
        groupStaffByGroup.get(row.group_id).push(row.id);
      }
    }

    for (const { ticket, status } of batch) {
      const recipients = new Set();
      if (ticket.assigned_to) {
        recipients.add(ticket.assigned_to);
      } else {
        (groupStaffByGroup.get(ticket.group_id) || []).forEach((id) => recipients.add(id));
      }
      const messageKey = status === 'breached'
        ? { it: `SLA superata sul ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`, en: `SLA breached on ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}` }
        : { it: `SLA a rischio sul ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}`, en: `SLA at risk on ticket #${formatTicketNumber(ticket.id)}: ${ticket.subject}` };
      for (const userId of recipients) {
        notifyUser(userId, ticket.id, messageKey).catch(() => {});
      }
    }
  }
}

async function purgeExpiredMessages() {
  await db.run("DELETE FROM direct_messages WHERE created_at <= datetime('now', ?)", [`-${MESSAGE_TTL_DAYS} days`]);
}

async function purgeOldNotifications() {
  await db.run(
    "DELETE FROM notifications WHERE is_read = 1 AND created_at <= datetime('now', ?)",
    [`-${READ_NOTIFICATION_TTL_DAYS} days`]
  );
}

async function purgeOldAuditLog() {
  await db.run("DELETE FROM audit_log WHERE created_at <= datetime('now', ?)", [`-${AUDIT_LOG_TTL_DAYS} days`]);
}

async function purgeOldSessions() {
  await db.run(
    "DELETE FROM user_sessions WHERE revoked = 1 OR last_active_at <= datetime('now', ?)",
    [`-${SESSION_TTL_DAYS} days`]
  );
}

function runMaintenanceJobs() {
  autoCloseResolvedTickets().catch((err) => console.error('Auto-chiusura ticket fallita:', err.message));
  checkSlaWarnings().catch((err) => console.error('Verifica SLA fallita:', err.message));
  purgeExpiredMessages().catch((err) => console.error('Pulizia messaggi diretti fallita:', err.message));
  purgeOldNotifications().catch((err) => console.error('Pulizia notifiche fallita:', err.message));
  purgeOldAuditLog().catch((err) => console.error('Pulizia registro attività fallita:', err.message));
  purgeOldSessions().catch((err) => console.error('Pulizia sessioni fallita:', err.message));
}

function startAutoCloseScheduler() {
  runMaintenanceJobs();
  setInterval(runMaintenanceJobs, CHECK_INTERVAL_MS);
}

module.exports = {
  startAutoCloseScheduler, autoCloseResolvedTickets, checkSlaWarnings, purgeExpiredMessages,
  purgeOldNotifications, purgeOldAuditLog, purgeOldSessions,
  MESSAGE_TTL_DAYS, READ_NOTIFICATION_TTL_DAYS, AUDIT_LOG_TTL_DAYS, SESSION_TTL_DAYS,
};
