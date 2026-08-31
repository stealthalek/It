const express = require('express');
const os = require('os');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getStats, getEventLoopLagMs } = require('../lib/requestStats');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('admin'));

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
    });
  })
);

module.exports = router;
