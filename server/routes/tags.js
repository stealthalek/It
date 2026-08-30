const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await db.all('SELECT id, name FROM tags ORDER BY name ASC');
    res.json({ tags });
  })
);

module.exports = router;
