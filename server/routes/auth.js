const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSsoConfig, verifyGoogleCredential, verifyMicrosoftToken } = require('../sso');
const { generateSecret, verifyTotp, buildOtpauthUri } = require('../lib/totp');
const { createSession, listSessions, revokeSession, revokeOtherSessions } = require('../lib/sessions');
const { resolvePermissions } = require('../lib/permissions');
const { logAudit } = require('../audit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function isAccountLocked(user) {
  return !!(user.locked_until && new Date(`${user.locked_until.replace(' ', 'T')}Z`).getTime() > Date.now());
}

function lockedUntilMinutesLeft(user) {
  return Math.max(1, Math.ceil((new Date(`${user.locked_until.replace(' ', 'T')}Z`).getTime() - Date.now()) / 60000));
}

async function registerFailedLoginAttempt(user) {
  const count = (user.failed_login_count || 0) + 1;
  if (count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.run('UPDATE users SET failed_login_count = 0, locked_until = ? WHERE id = ?', [lockedUntil, user.id]);
    logAudit(user.id, 'user', user.id, `Account bloccato temporaneamente per ${LOCKOUT_MINUTES} minuti dopo ${MAX_FAILED_LOGIN_ATTEMPTS} tentativi di accesso falliti`).catch(() => {});
  } else {
    await db.run('UPDATE users SET failed_login_count = ? WHERE id = ?', [count, user.id]);
  }
}

async function clearFailedLoginAttempts(userId) {
  await db.run('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [userId]);
}

function passwordError(password) {
  if (!password || password.length < 8) {
    return 'La password deve avere almeno 8 caratteri';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La password deve contenere almeno una lettera e un numero';
  }
  return null;
}

function makeAuthLimiter(max = 60) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi, riprova tra qualche minuto' },
  });
}

function issueToken(user, sid) {
  return jwt.sign({ sub: user.id, role: user.role, sid }, JWT_SECRET, { expiresIn: '7d' });
}

function issueChallengeToken(user) {
  return jwt.sign({ sub: user.id, purpose: '2fa_pending' }, JWT_SECRET, { expiresIn: '5m' });
}

async function issueSessionToken(user, req) {
  const sid = await createSession(user.id, req);
  return issueToken(user, sid);
}

async function publicUser(user) {
  const rep = await db.get('SELECT COUNT(*) AS n FROM users WHERE manager_id = ?', [user.id]);
  let role = null;
  if (user.role_id) {
    role = await db.get('SELECT id, label_it, label_en, color, read_only, permissions FROM roles WHERE id = ?', [user.role_id]);
  }
  const rolePermissions = role ? JSON.parse(role.permissions || '[]') : [];
  const permissions = resolvePermissions({ role: user.role, role_id: user.role_id, role_permissions: rolePermissions });
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    is_super_admin: !!user.is_super_admin, is_manager: rep.n > 0,
    totp_enabled: !!user.totp_enabled,
    role_id: user.role_id || null,
    role_label_it: role ? role.label_it : null,
    role_label_en: role ? role.label_en : null,
    role_color: role ? role.color : null,
    read_only: role ? !!role.read_only : false,
    permissions,
  };
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
    const token = await issueSessionToken(user, req);
    res.status(201).json({ token, user: await publicUser(user) });
  })
);

router.post(
  '/login',
  makeAuthLimiter(30),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatorie' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    if (isAccountLocked(user)) {
      return res.status(423).json({ error: `Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${lockedUntilMinutesLeft(user)} minuti.` });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      await registerFailedLoginAttempt(user);
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    await clearFailedLoginAttempts(user.id);

    if (user.totp_enabled) {
      return res.json({ requires_2fa: true, challenge_token: issueChallengeToken(user) });
    }

    const token = await issueSessionToken(user, req);
    res.json({ token, user: await publicUser(user) });
  })
);

router.post(
  '/2fa/login',
  makeAuthLimiter(30),
  asyncHandler(async (req, res) => {
    const { challenge_token: challengeToken, code } = req.body || {};
    if (!challengeToken || !code) {
      return res.status(400).json({ error: 'Codice mancante' });
    }

    let payload;
    try {
      payload = jwt.verify(challengeToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Sessione di accesso scaduta, riprova' });
    }
    if (payload.purpose !== '2fa_pending') {
      return res.status(401).json({ error: 'Sessione di accesso non valida' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.totp_enabled) {
      return res.status(401).json({ error: 'Codice non valido' });
    }
    if (isAccountLocked(user)) {
      return res.status(423).json({ error: `Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${lockedUntilMinutesLeft(user)} minuti.` });
    }
    if (!verifyTotp(user.totp_secret, code)) {
      await registerFailedLoginAttempt(user);
      return res.status(401).json({ error: 'Codice non valido' });
    }
    await clearFailedLoginAttempts(user.id);

    const token = await issueSessionToken(user, req);
    res.json({ token, user: await publicUser(user) });
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
      const token = await issueSessionToken(user, req);
      res.json({ token, user: await publicUser(user) });
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
      const token = await issueSessionToken(user, req);
      res.json({ token, user: await publicUser(user) });
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

router.post(
  '/2fa/setup',
  authenticate,
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const secret = generateSecret();
    await db.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret, req.user.id]);
    res.json({ secret, otpauth_uri: buildOtpauthUri(secret, req.user.email, 'Ticketing IT') });
  })
);

router.post(
  '/2fa/verify',
  authenticate,
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { code } = req.body || {};
    const user = await db.get('SELECT totp_secret FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.totp_secret || !verifyTotp(user.totp_secret, code)) {
      return res.status(400).json({ error: 'Codice non valido' });
    }
    await db.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [req.user.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/2fa/disable',
  authenticate,
  makeAuthLimiter(),
  asyncHandler(async (req, res) => {
    const { currentPassword, code } = req.body || {};
    if (!currentPassword || !code) {
      return res.status(400).json({ error: 'Password e codice sono obbligatori' });
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Password attuale non corretta' });
    }
    if (!user.totp_enabled || !verifyTotp(user.totp_secret, code)) {
      return res.status(400).json({ error: 'Codice non valido' });
    }
    await db.run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [req.user.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessions = await listSessions(req.user.id);
    res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.sessionId })) });
  })
);

router.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const ok = await revokeSession(req.user.id, req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    res.json({ ok: true });
  })
);

router.post(
  '/sessions/revoke-others',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.sessionId) {
      return res.status(400).json({ error: 'Nessuna sessione corrente da preservare' });
    }
    await revokeOtherSessions(req.user.id, req.sessionId);
    res.json({ ok: true });
  })
);

module.exports = router;
