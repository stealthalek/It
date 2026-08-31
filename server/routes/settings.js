const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate, requireRole, JWT_SECRET } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

async function resolveGroupDisplayName(groupId) {
  let currentId = groupId;
  let guard = 0;
  while (currentId && guard < 20) {
    guard += 1;
    const group = await db.get('SELECT display_name, parent_id FROM groups WHERE id = ?', [currentId]);
    if (!group) return null;
    if (group.display_name) return group.display_name;
    currentId = group.parent_id;
  }
  return null;
}

const router = express.Router();

const DEFAULT_INVITE_TEMPLATES = {
  it: {
    subject: 'Il tuo accesso a {{org}}',
    body: [
      'Ciao {{name}},',
      '',
      'è stato creato per te un account su {{org}}.',
      '',
      'Email di accesso: {{email}}',
      'Password temporanea: {{password}}',
      '',
      'Accedi e cambia la password dal tuo profilo appena possibile.',
      '',
      '— {{org}}',
    ].join('\n'),
  },
  en: {
    subject: 'Your access to {{org}}',
    body: [
      'Hi {{name}},',
      '',
      'an account has been created for you on {{org}}.',
      '',
      'Login email: {{email}}',
      'Temporary password: {{password}}',
      '',
      'Sign in and change your password from your profile as soon as possible.',
      '',
      '— {{org}}',
    ].join('\n'),
  },
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT org_name, org_logo FROM app_settings WHERE id = 1');
    const defaultOrgName = (row && row.org_name) || 'Ticketing';
    let orgName = defaultOrgName;

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT group_id FROM users WHERE id = ?', [payload.sub]);
        if (user && user.group_id) {
          const groupDisplayName = await resolveGroupDisplayName(user.group_id);
          if (groupDisplayName) orgName = groupDisplayName;
        }
      } catch {}
    }

    res.json({ orgName, orgLogo: (row && row.org_logo) || null });
  })
);

router.patch(
  '/logo',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { orgLogo } = req.body || {};
    if (orgLogo) {
      if (typeof orgLogo !== 'string' || !orgLogo.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Formato immagine non valido' });
      }
      if (orgLogo.length > 400000) {
        return res.status(400).json({ error: 'Immagine troppo grande (max 300 KB circa)' });
      }
    }
    await db.run('UPDATE app_settings SET org_logo = ? WHERE id = 1', [orgLogo || null]);
    logAudit(req.user.id, 'settings', null, orgLogo ? 'Logo organizzazione aggiornato' : 'Logo organizzazione rimosso').catch(() => {});
    res.json({ orgLogo: orgLogo || null });
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
    logAudit(req.user.id, 'settings', null, `Nome organizzazione aggiornato a "${orgName.trim()}"`).catch(() => {});
    res.json({ orgName: orgName.trim() });
  })
);

router.get(
  '/invite-template',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const row = await db.get(
      'SELECT invite_subject_it, invite_body_it, invite_subject_en, invite_body_en FROM app_settings WHERE id = 1'
    );
    res.json({
      it: { subject: row?.invite_subject_it || '', body: row?.invite_body_it || '' },
      en: { subject: row?.invite_subject_en || '', body: row?.invite_body_en || '' },
      defaults: DEFAULT_INVITE_TEMPLATES,
    });
  })
);

router.patch(
  '/invite-template',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { locale, subject, body } = req.body || {};
    if (!['it', 'en'].includes(locale)) {
      return res.status(400).json({ error: 'Lingua non valida' });
    }
    await db.run(
      `UPDATE app_settings SET invite_subject_${locale} = ?, invite_body_${locale} = ? WHERE id = 1`,
      [subject && subject.trim() ? subject.trim() : null, body && body.trim() ? body.trim() : null]
    );
    logAudit(req.user.id, 'settings', null, `Modello email di invito (${locale}) aggiornato`).catch(() => {});
    res.json({ ok: true });
  })
);

module.exports = router;
