const db = require('./db/database');
const realtime = require('./realtime');
const { computeSlaStatus } = require('./sla');
const { notifyUser } = require('./notifications');

const AUTO_CLOSE_HOURS = 72;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

async function autoCloseResolvedTickets() {
  const candidates = await db.all(
    `SELECT id FROM tickets
     WHERE status = 'resolved'
       AND resolved_at IS NOT NULL
       AND resolved_at <= datetime('now', ?)`,
    [`-${AUTO_CLOSE_HOURS} hours`]
  );

  for (const { id } of candidates) {
    await db.run("UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ?", [id]);
    const info = await db.run(
      "INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES (?, NULL, ?)",
      [id, `Chiuso automaticamente dopo ${AUTO_CLOSE_HOURS} ore di inattività`]
    );
    const row = await db.get(
      `SELECT e.id, e.message, e.created_at, u.name AS actor_name
       FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    realtime.broadcastActivityItem(id, { kind: 'event', ...row });

    const updated = await db.get(
      `SELECT t.*, grp.sla_resolve_hours AS sla_resolve_hours
       FROM tickets t LEFT JOIN groups grp ON grp.id = t.group_id
       WHERE t.id = ?`,
      [id]
    );
    realtime.broadcastTicketUpdate(id, updated);
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

  for (const ticket of candidates) {
    const status = computeSlaStatus(ticket);
    if (status !== 'at_risk' && status !== 'breached') continue;

    await db.run("UPDATE tickets SET sla_warned_at = datetime('now') WHERE id = ?", [ticket.id]);

    const label = status === 'breached' ? 'SLA superata' : 'SLA a rischio (75% del tempo trascorso)';
    const info = await db.run('INSERT INTO ticket_events (ticket_id, actor_id, message) VALUES (?, NULL, ?)', [
      ticket.id, label,
    ]);
    const row = await db.get(
      `SELECT e.id, e.message, e.created_at, u.name AS actor_name
       FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    realtime.broadcastActivityItem(ticket.id, { kind: 'event', ...row });

    const recipients = new Set();
    if (ticket.assigned_to) {
      recipients.add(ticket.assigned_to);
    } else {
      const groupStaff = await db.all("SELECT id FROM users WHERE group_id = ? AND role IN ('agent', 'admin')", [ticket.group_id]);
      groupStaff.forEach((u) => recipients.add(u.id));
    }
    const messageKey = status === 'breached'
      ? { it: `SLA superata sul ticket #${ticket.id}: ${ticket.subject}`, en: `SLA breached on ticket #${ticket.id}: ${ticket.subject}` }
      : { it: `SLA a rischio sul ticket #${ticket.id}: ${ticket.subject}`, en: `SLA at risk on ticket #${ticket.id}: ${ticket.subject}` };
    for (const userId of recipients) {
      notifyUser(userId, ticket.id, messageKey).catch(() => {});
    }
  }
}

function startAutoCloseScheduler() {
  autoCloseResolvedTickets().catch((err) => console.error('Auto-chiusura ticket fallita:', err.message));
  checkSlaWarnings().catch((err) => console.error('Verifica SLA fallita:', err.message));
  setInterval(() => {
    autoCloseResolvedTickets().catch((err) => console.error('Auto-chiusura ticket fallita:', err.message));
    checkSlaWarnings().catch((err) => console.error('Verifica SLA fallita:', err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startAutoCloseScheduler, autoCloseResolvedTickets, checkSlaWarnings };
