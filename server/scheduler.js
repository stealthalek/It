const db = require('./db/database');
const realtime = require('./realtime');

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

function startAutoCloseScheduler() {
  autoCloseResolvedTickets().catch((err) => console.error('Auto-chiusura ticket fallita:', err.message));
  setInterval(() => {
    autoCloseResolvedTickets().catch((err) => console.error('Auto-chiusura ticket fallita:', err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startAutoCloseScheduler, autoCloseResolvedTickets };
