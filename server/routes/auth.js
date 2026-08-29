const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSsoConfig, verifyGoogleCredential, verifyMicrosoftToken } = require('../sso');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordError(password) {
  if (!password || password.length < 8) {
    return 'La password deve avere almeno 8 caratteri';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La password deve contenere almeno una lettera e un numero';
  }
  return null;
}

function makeAuthLimiter(max = 20) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi, riprova tra qualche minuto' },
  });
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, is_super_admin: !!user.is_super_admin };
}

async function findOrCreateSsoUser(email, name) {
  const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (existing) return existing;

  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = bcrypt.hashSync(randomPassword, 10);
  const info = await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
    name,
    email,
    hash,
    'customer',
  ]);
  return db.get('SELECT * FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
}

router.post(
  '/register',
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    const pwError = passwordError(password);
    if (pwError) {
      return res.status(400).json({ error: pwError });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email già registrata' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      name.trim(),
      email.toLowerCase(),
      hash,
      'customer',
    ]);

    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
    const token = issueToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  })
);

router.post(
  '/login',
  makeAuthLimiter(8),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatorie' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const token = issueToken(user);
    res.json({ token, user: publicUser(user) });
  })
);

router.get('/sso-config', (req, res) => {
  res.json(getSsoConfig());
});

router.post(
  '/google',
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: 'Credenziale Google mancante' });
    }
    try {
      const { email, name } = await verifyGoogleCredential(credential);
      const user = await findOrCreateSsoUser(email, name);
      const token = issueToken(user);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      res.status(401).json({ error: 'Accesso con Google non riuscito' });
    }
  })
);

router.post(
  '/microsoft',
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'Token Microsoft mancante' });
    }
    try {
      const { email, name } = await verifyMicrosoftToken(idToken);
      const user = await findOrCreateSsoUser(email, name);
      const token = issueToken(user);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      res.status(401).json({ error: 'Accesso con Microsoft non riuscito' });
    }
  })
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post(
  '/change-password',
  authenticate,
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Password attuale e nuova password sono obbligatorie' });
    }
    const pwError = passwordError(newPassword);
    if (pwError) {
      return res.status(400).json({ error: pwError });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Password attuale non corretta' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/change-email',
  authenticate,
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { currentPassword, newEmail } = req.body || {};
    if (!currentPassword || !newEmail) {
      return res.status(400).json({ error: 'Password attuale e nuova email sono obbligatorie' });
    }
    if (!EMAIL_RE.test(newEmail)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Password attuale non corretta' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail.toLowerCase(), user.id]);
    if (existing) {
      return res.status(409).json({ error: 'Email già in uso' });
    }

    await db.run('UPDATE users SET email = ? WHERE id = ?', [newEmail.toLowerCase(), user.id]);
    const updated = await db.get('SELECT id, name, email, role, is_super_admin FROM users WHERE id = ?', [user.id]);
    res.json({ user: updated });
  })
);

module.exports = router;
