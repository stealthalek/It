const express = require('express');
const os = require('os');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getStats, getEventLoopLagMs } = require('../lib/requestStats');
const { getOnlineUsers } = require('../realtime');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('admin'));

const STORAGE_TABLES = [
  'tickets', 'comments', 'ticket_events', 'ticket_attachments', 'onboarding_attachments',
  'notifications', 'audit_log', 'direct_messages', 'users',
];

async function getStorageStats() {
  const rowCounts = {};
  await Promise.all(STORAGE_TABLES.map(async (table) => {
    const row = await db.get(`SELECT COUNT(*) AS n FROM ${table}`).catch(() => null);
    rowCounts[table] = row ? row.n : null;
  }));

  const attachmentRow = await db.get(
    `SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM (
       SELECT size_bytes FROM ticket_attachments
       UNION ALL
       SELECT size_bytes FROM onboarding_attachments
     )`
  ).catch(() => ({ bytes: 0 }));

  let dbSizeBytes = null;
  try {
    const pageCount = await db.get('PRAGMA page_count');
    const pageSize = await db.get('PRAGMA page_size');
    if (pageCount && pageSize) dbSizeBytes = Number(pageCount.page_count) * Number(pageSize.page_size);
  } catch {}

  return { rowCounts, attachmentBytes: attachmentRow.bytes, dbSizeBytes };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mem = process.memoryUsage();
    const dbStart = Date.now();
    let dbLatencyMs = null;
    let dbError = null;
    try {
      await db.get('SELECT 1 AS ok');
      dbLatencyMs = Date.now() - dbStart;
    } catch (err) {
      dbError = err.message;
    }
    res.json({
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      },
      db: { mode: db.usingTurso ? 'turso' : 'local', latencyMs: dbLatencyMs, error: dbError },
      requestWindow: getStats(),
      cpuCount: os.cpus().length,
      loadAvg1m: Math.round(os.loadavg()[0] * 100) / 100,
      eventLoopLagMs: getEventLoopLagMs(),
      onlineUsers: getOnlineUsers(),
      storage: await getStorageStats(),
    });
  })
);

module.exports = router;
