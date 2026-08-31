const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();

router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const companies = await db.all(
      'SELECT id, name, display_name, logo FROM companies WHERE is_active = 1 ORDER BY name ASC'
    );
    res.json({ companies });
  })
);

router.use(authenticate);
router.use(requireRole('admin'));

function requireSuperAdmin(req, res, next) {
  if (!req.user.is_super_admin) {
    return res.status(403).json({ error: 'Permessi insufficienti' });
  }
  next();
}
router.use(requireSuperAdmin);

const COMPANY_SELECT = `
  SELECT c.id, c.name, c.display_name, c.logo, c.is_active, c.created_at,
    (SELECT COUNT(*) FROM users mem WHERE mem.company_id = c.id) AS member_count,
    (SELECT COUNT(*) FROM groups grp WHERE grp.company_id = c.id) AS group_count
  FROM companies c
`;

function validLogo(logo) {
  if (!logo) return true;
  return typeof logo === 'string' && logo.startsWith('data:image/') && logo.length <= 400000;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companies = await db.all(`${COMPANY_SELECT} ORDER BY c.name ASC`);
    res.json({ companies });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, displayName, logo } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome dell\'azienda è obbligatorio' });
    }
    if (!validLogo(logo)) {
      return res.status(400).json({ error: 'Logo non valido (max 300 KB circa)' });
    }
    const existing = await db.get('SELECT id FROM companies WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Azienda già esistente' });
    }
    const info = await db.run('INSERT INTO companies (name, display_name, logo) VALUES (?, ?, ?)', [
      name.trim(),
      displayName && displayName.trim() ? displayName.trim() : null,
      logo || null,
    ]);
    const company = await db.get(`${COMPANY_SELECT} WHERE c.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'company', company.id, `Creata azienda "${company.name}"`).catch(() => {});
    res.status(201).json({ company });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const company = await db.get('SELECT * FROM companies WHERE id = ?', [req.params.id]);
    if (!company) {
      return res.status(404).json({ error: 'Azienda non trovata' });
    }
    const { name, displayName, logo, isActive } = req.body || {};
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Il nome dell\'azienda è obbligatorio' });
      }
      const dup = await db.get('SELECT id FROM companies WHERE name = ? AND id != ?', [name.trim(), req.params.id]);
      if (dup) {
        return res.status(409).json({ error: 'Azienda già esistente' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName && displayName.trim() ? displayName.trim() : null);
    }
    if (logo !== undefined) {
      if (!validLogo(logo)) {
        return res.status(400).json({ error: 'Logo non valido (max 300 KB circa)' });
      }
      updates.push('logo = ?');
      params.push(logo || null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${COMPANY_SELECT} WHERE c.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'company', updated.id, `Azienda "${updated.name}" aggiornata`).catch(() => {});
    res.json({ company: updated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const company = await db.get('SELECT * FROM companies WHERE id = ?', [req.params.id]);
    if (!company) {
      return res.status(404).json({ error: 'Azienda non trovata' });
    }
    const inUse = await db.get(
      'SELECT (SELECT COUNT(*) FROM users WHERE company_id = ?) + (SELECT COUNT(*) FROM groups WHERE company_id = ?) AS n',
      [req.params.id, req.params.id]
    );
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Azienda in uso da utenti o gruppi: spostali prima di eliminarla' });
    }
    await db.run('DELETE FROM companies WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'company', Number(req.params.id), `Azienda "${company.name}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
