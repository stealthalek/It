const db = require('./db/database');

let holidaySet = new Set();

async function loadHolidays() {
  const rows = await db.all('SELECT date FROM holidays');
  holidaySet = new Set(rows.map((r) => r.date));
}

function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function businessMillisBetween(startMs, endMs, startHour, endHour) {
  if (endMs <= startMs || endHour <= startHour) return 0;
  const MS_PER_DAY = 24 * 3600 * 1000;
  let total = 0;
  let dayStart = new Date(startMs);
  dayStart.setUTCHours(0, 0, 0, 0);
  let cursor = dayStart.getTime();
  while (cursor < endMs) {
    const dayOfWeek = new Date(cursor).getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidaySet.has(dateKey(cursor))) {
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

function computeResponseSlaStatus(ticket) {
  if (!ticket.sla_response_hours || !ticket.created_at) return null;
  const workStart = ticket.work_start_hour ?? 9;
  const workEnd = ticket.work_end_hour ?? 18;
  const created = new Date(ticket.created_at.replace(' ', 'T') + 'Z').getTime();
  const responseMs = ticket.sla_response_hours * 3600 * 1000;

  const respondedAt = ticket.first_response_at || (['resolved', 'closed'].includes(ticket.status) ? ticket.resolved_at : null);
  if (respondedAt) {
    const responded = new Date(respondedAt.replace(' ', 'T') + 'Z').getTime();
    const elapsed = businessMillisBetween(created, responded, workStart, workEnd);
    return elapsed > responseMs ? 'breached' : 'on_track';
  }
  if (['resolved', 'closed'].includes(ticket.status)) return null;

  const elapsed = businessMillisBetween(created, Date.now(), workStart, workEnd);
  const ratio = elapsed / responseMs;
  if (ratio >= 1) return 'breached';
  if (ratio >= 0.75) return 'at_risk';
  return 'on_track';
}

function withSla(ticket) {
  return {
    ...ticket,
    sla_status: computeSlaStatus(ticket),
    sla_remaining_ms: computeSlaRemaining(ticket),
    response_sla_status: computeResponseSlaStatus(ticket),
  };
}

module.exports = {
  businessMillisBetween, pausedMillisSoFar, computeSlaStatus, computeSlaRemaining, computeResponseSlaStatus, withSla, loadHolidays,
};
