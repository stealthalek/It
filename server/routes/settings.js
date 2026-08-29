const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT org_name FROM app_settings WHERE id = 1');
    res.json({ orgName: (row && row.org_name) || 'Ticketing' });
  })
);

router.patch(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { orgName } = req.body || {};
    if (!orgName || !orgName.trim()) {
      return res.status(400).json({ error: 'Il nome dell\'organizzazione è obbligatorio' });
    }
    await db.run('UPDATE app_settings SET org_name = ? WHERE id = 1', [orgName.trim()]);
    res.json({ orgName: orgName.trim() });
  })
);

module.exports = router;
