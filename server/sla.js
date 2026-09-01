const db = require('./db/database');

let globalHolidays = new Set();
let holidaysByCompany = new Map();

async function loadHolidays() {
  const rows = await db.all('SELECT date, company_id FROM holidays');
  const nextGlobal = new Set();
  const nextByCompany = new Map();
  rows.forEach((r) => {
    if (r.company_id == null) {
      nextGlobal.add(r.date);
    } else {
      if (!nextByCompany.has(r.company_id)) nextByCompany.set(r.company_id, new Set());
      nextByCompany.get(r.company_id).add(r.date);
    }
  });
  globalHolidays = nextGlobal;
  holidaysByCompany = nextByCompany;
}

function isHoliday(date, companyId) {
  if (globalHolidays.has(date)) return true;
  return !!(companyId && holidaysByCompany.get(companyId)?.has(date));
}

function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const MS_PER_DAY = 24 * 3600 * 1000;

function isBusinessDay(dayMs, companyId) {
  const dow = new Date(dayMs).getUTCDay();
  return dow >= 1 && dow <= 5 && !isHoliday(dateKey(dayMs), companyId);
}

function countWeekdays(fromDayMs, toDayMsInclusive) {
  if (toDayMsInclusive < fromDayMs) return 0;
  const totalDays = Math.round((toDayMsInclusive - fromDayMs) / MS_PER_DAY) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let weekdayCount = fullWeeks * 5;
  const remainder = totalDays - fullWeeks * 7;
  const startDow = new Date(fromDayMs).getUTCDay();
  for (let i = 0; i < remainder; i++) {
    const dow = (startDow + i) % 7;
    if (dow >= 1 && dow <= 5) weekdayCount++;
  }
  return weekdayCount;
}

function countHolidaysInRange(fromDayMs, toDayMsInclusive, companyId) {
  const fromKey = dateKey(fromDayMs);
  const toKey = dateKey(toDayMsInclusive);
  const dates = new Set(globalHolidays);
  if (companyId && holidaysByCompany.has(companyId)) {
    holidaysByCompany.get(companyId).forEach((d) => dates.add(d));
  }
  let count = 0;
  for (const h of dates) {
    if (h >= fromKey && h <= toKey) {
      const dow = new Date(`${h}T00:00:00Z`).getUTCDay();
      if (dow >= 1 && dow <= 5) count++;
    }
  }
  return count;
}

function businessMillisBetween(startMs, endMs, startHour, endHour, companyId) {
  if (endMs <= startMs || endHour <= startHour) return 0;
  const dayLenMs = (endHour - startHour) * 3600 * 1000;

  const firstDay = new Date(startMs);
  firstDay.setUTCHours(0, 0, 0, 0);
  const firstDayMs = firstDay.getTime();

  const lastDay = new Date(endMs - 1);
  lastDay.setUTCHours(0, 0, 0, 0);
  const lastDayMs = lastDay.getTime();

  if (firstDayMs === lastDayMs) {
    if (!isBusinessDay(firstDayMs, companyId)) return 0;
    const windowStart = firstDayMs + startHour * 3600 * 1000;
    const windowEnd = firstDayMs + endHour * 3600 * 1000;
    const overlapStart = Math.max(windowStart, startMs);
    const overlapEnd = Math.min(windowEnd, endMs);
    return overlapEnd > overlapStart ? overlapEnd - overlapStart : 0;
  }

  let total = 0;

  if (isBusinessDay(firstDayMs, companyId)) {
    const windowStart = firstDayMs + startHour * 3600 * 1000;
    const windowEnd = firstDayMs + endHour * 3600 * 1000;
    const overlapStart = Math.max(windowStart, startMs);
    const overlapEnd = Math.min(windowEnd, firstDayMs + MS_PER_DAY);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
  }

  if (isBusinessDay(lastDayMs, companyId)) {
    const windowStart = lastDayMs + startHour * 3600 * 1000;
    const windowEnd = lastDayMs + endHour * 3600 * 1000;
    const overlapStart = Math.max(windowStart, lastDayMs);
    const overlapEnd = Math.min(windowEnd, endMs);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
  }

  const middleFromMs = firstDayMs + MS_PER_DAY;
  const middleToMs = lastDayMs - MS_PER_DAY;
  if (middleToMs >= middleFromMs) {
    const weekdays = countWeekdays(middleFromMs, middleToMs);
    const holidays = countHolidaysInRange(middleFromMs, middleToMs, companyId);
    total += Math.max(0, weekdays - holidays) * dayLenMs;
  }

  return total;
}

function pausedMillisSoFar(ticket, workStart, workEnd) {
  let paused = ticket.sla_paused_ms || 0;
  if (ticket.status === 'waiting_customer' && ticket.waiting_since) {
    const since = new Date(ticket.waiting_since.replace(' ', 'T') + 'Z').getTime();
    paused += businessMillisBetween(since, Date.now(), workStart, workEnd, ticket.company_id);
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
    const elapsed = businessMillisBetween(created, resolved, workStart, workEnd, ticket.company_id) - (ticket.sla_paused_ms || 0);
    return elapsed > resolveMs ? 'breached' : 'on_track';
  }
  const elapsed = Math.max(0, businessMillisBetween(created, Date.now(), workStart, workEnd, ticket.company_id) - pausedMillisSoFar(ticket, workStart, workEnd));
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
  const elapsed = Math.max(0, businessMillisBetween(created, Date.now(), workStart, workEnd, ticket.company_id) - pausedMillisSoFar(ticket, workStart, workEnd));
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
    const elapsed = businessMillisBetween(created, responded, workStart, workEnd, ticket.company_id);
    return elapsed > responseMs ? 'breached' : 'on_track';
  }
  if (['resolved', 'closed'].includes(ticket.status)) return null;

  const elapsed = businessMillisBetween(created, Date.now(), workStart, workEnd, ticket.company_id);
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
