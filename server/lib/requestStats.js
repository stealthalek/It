const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 3000;

let windowStart = Date.now();
let windowCount = 0;
let totalCount = 0;
const startedAt = Date.now();

function recordRequest() {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  totalCount += 1;
}

function getStats() {
  const now = Date.now();
  const elapsed = now - windowStart;
  const resetInSeconds = Math.max(0, Math.round((WINDOW_MS - elapsed) / 1000));
  return {
    windowCount,
    windowMax: MAX_REQUESTS,
    windowMinutes: WINDOW_MS / 60000,
    resetInSeconds,
    totalCount,
    startedAt,
  };
}

module.exports = { recordRequest, getStats, WINDOW_MS, MAX_REQUESTS };
