const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
const mailer = require('../mailer');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { revokeAllSessions } = require('../lib/sessions');
const { assertCompanyScoped } = require('../lib/companyGuard');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();
router.use(authenticate);

const ROLES = ['customer', 'agent', 'admin'];
const LOCALES = ['it', 'en'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.group_id, g.name AS group_name, gParent.name AS group_parent_name,
    u.locale, u.created_at, u.is_external, u.manager_id, manager.name AS manager_name,
    u.role_id, r.label_it AS role_label_it, r.label_en AS role_label_en, r.color AS role_color, r.read_only AS role_read_only,
    u.is_blocked, u.blocked_at, u.blocked_reason, u.company_id, c.display_name AS company_display_name, c.name AS company_name
  FROM users u
  LEFT JOIN groups g ON g.id = u.group_id
  LEFT JOIN groups gParent ON gParent.id = g.parent_id
  LEFT JOIN users manager ON manager.id = u.manager_id
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN companies c ON c.id = u.company_id
`;

function outOfScope(target, requester) {
  if (!target) return true;
  if (target.is_super_admin && !requester.is_super_admin) return true;
  if (!requester.is_super_admin && target.company_id !== requester.company_id) return true;
  return false;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    if (!req.user.is_super_admin) {
      conditions.push('u.is_super_admin = 0');
      conditions.push('u.company_id = ?');
      params.push(req.user.company_id);
    } else if (req.query.companyId) {
      conditions.push('u.company_id = ?');
      params.push(Number(req.query.companyId));
    }
    if (req.query.q && req.query.q.trim()) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${req.query.q.trim()}%`, `%${req.query.q.trim()}%`);
    }
    if (req.query.status === 'active') {
      conditions.push('u.is_blocked = 0');
    } else if (req.query.status === 'blocked') {
      conditions.push('u.is_blocked = 1');
    }
    if (req.query.role && ROLES.includes(req.query.role)) {
      conditions.push('u.role = ?');
      params.push(req.query.role);
    }
    if (req.query.groupId && /^\d+$/.test(req.query.groupId)) {
      conditions.push('u.group_id = ?');
      params.push(Number(req.query.groupId));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    if (req.query.page) {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
      const offset = (page - 1) * pageSize;
      const totalRow = await db.get(`SELECT COUNT(*) AS n FROM users u ${where}`, params);
      const users = await db.all(`${USER_SELECT} ${where} ORDER BY u.name ASC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
      assertCompanyScoped(users, req.user);
      return res.json({ users, total: totalRow.n, page, pageSize });
    }

    const users = await db.all(`${USER_SELECT} ${where} ORDER BY u.name ASC LIMIT 5000`, params);
    assertCompanyScoped(users, req.user);
    res.json({ users });
  })
);

router.get(
  '/:id',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    const full = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(full, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    res.json({ user: { ...user, is_super_admin: !!full.is_super_admin } });
  })
);

router.post(
  '/',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const { name, email, role, groupId, locale, isExternal, managerId, roleId, companyId } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    if (!['agent', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Ruolo non valido: usa agent o admin' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email già registrata' });
    }

    let finalCompanyId = req.user.company_id;
    if (req.user.is_super_admin && companyId) {
      const company = await db.get('SELECT id FROM companies WHERE id = ?', [companyId]);
      if (!company) {
        return res.status(400).json({ error: 'Azienda non valida' });
      }
      finalCompanyId = company.id;
    }

    let finalGroupId = null;
    if (groupId) {
      const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [groupId]);
      if (!group || group.company_id !== finalCompanyId) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }
    const finalLocale = LOCALES.includes(locale) ? locale : 'it';

    let finalManagerId = null;
    if (managerId) {
      const manager = await db.get('SELECT id, company_id FROM users WHERE id = ?', [managerId]);
      if (!manager || manager.company_id !== finalCompanyId) {
        return res.status(400).json({ error: 'Manager non valido' });
      }
      finalManagerId = manager.id;
    }

    let finalRoleId = null;
    if (roleId) {
      const roleRow = await db.get('SELECT id, company_id FROM roles WHERE id = ?', [roleId]);
      if (!roleRow || (!req.user.is_super_admin && roleRow.company_id && roleRow.company_id !== finalCompanyId)) {
        return res.status(400).json({ error: 'Ruolo specifico non valido' });
      }
      finalRoleId = roleRow.id;
    }

    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const hash = bcrypt.hashSync(tempPassword, 10);

    const info = await db.run(
      'INSERT INTO users (name, email, password, role, group_id, locale, is_external, manager_id, role_id, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase(), hash, role, finalGroupId, finalLocale, isExternal ? 1 : 0, finalManagerId, finalRoleId, finalCompanyId]
    );

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [Number(info.lastInsertRowid)]);
    mailer.sendInvite(user, tempPassword).catch((err) => console.error('Invio email di invito fallito:', err.message));
    logAudit(req.user.id, 'user', user.id, `Creato account staff "${user.name}" (${email.toLowerCase()}), ruolo ${role}`).catch(() => {});
    res.status(201).json({ user, tempPassword });
  })
);

router.patch(
  '/:id/role',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Ruolo non valido' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Non puoi modificare il tuo stesso ruolo' });
    }

    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const result = await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Ruolo di "${user.name}" cambiato in ${role}`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/role_id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const { roleId } = req.body || {};
    let finalRoleId = null;
    if (roleId) {
      const role = await db.get('SELECT id, company_id FROM roles WHERE id = ?', [roleId]);
      if (!role || (!req.user.is_super_admin && role.company_id && role.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Ruolo non valido' });
      }
      finalRoleId = role.id;
    }

    const result = await db.run('UPDATE users SET role_id = ? WHERE id = ?', [finalRoleId, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Ruolo specifico di "${user.name}" ${user.role_label_it ? `impostato a "${user.role_label_it}"` : 'rimosso'}`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/group',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const { groupId } = req.body || {};
    let finalGroupId = null;
    if (groupId) {
      const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [groupId]);
      if (!group || group.company_id !== target.company_id) {
        return res.status(400).json({ error: 'Gruppo non valido' });
      }
      finalGroupId = group.id;
    }

    const result = await db.run('UPDATE users SET group_id = ? WHERE id = ?', [finalGroupId, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Gruppo di "${user.name}" ${user.group_name ? `impostato a "${user.group_name}"` : 'rimosso'}`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/locale',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const { locale } = req.body || {};
    if (!LOCALES.includes(locale)) {
      return res.status(400).json({ error: 'Lingua non valida' });
    }

    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const result = await db.run('UPDATE users SET locale = ? WHERE id = ?', [locale, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Lingua di "${user.name}" impostata a ${locale}`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/external',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const isExternal = req.body && req.body.isExternal ? 1 : 0;
    const result = await db.run('UPDATE users SET is_external = ? WHERE id = ?', [isExternal, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Classificazione "esterno" di "${user.name}" impostata a ${isExternal ? 'sì' : 'no'}`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/company',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const target = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    const { companyId } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: 'Azienda obbligatoria' });
    }
    const company = await db.get('SELECT id FROM companies WHERE id = ?', [companyId]);
    if (!company) {
      return res.status(400).json({ error: 'Azienda non valida' });
    }
    await db.run('UPDATE users SET company_id = ?, group_id = NULL WHERE id = ?', [company.id, req.params.id]);

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Azienda di "${user.name}" impostata a "${user.company_name}"`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/manager',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    if (Number(req.params.id) === Number(req.body && req.body.managerId)) {
      return res.status(400).json({ error: 'Un utente non può essere il proprio manager' });
    }

    const { managerId } = req.body || {};
    let finalManagerId = null;
    if (managerId) {
      const manager = await db.get('SELECT id, company_id FROM users WHERE id = ?', [managerId]);
      if (!manager || manager.company_id !== target.company_id) {
        return res.status(400).json({ error: 'Manager non valido' });
      }
      finalManagerId = manager.id;
    }

    const result = await db.run('UPDATE users SET manager_id = ? WHERE id = ?', [finalManagerId, req.params.id]);
    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Manager di "${user.name}" ${user.manager_name ? `impostato a "${user.manager_name}"` : 'rimosso'}`).catch(() => {});
    res.json({ user });
  })
);

router.post(
  '/:id/reset-password',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target || (target.is_super_admin && !req.user.is_super_admin)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const hash = bcrypt.hashSync(tempPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.params.id]);

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    mailer.sendPasswordReset(user, tempPassword).catch((err) => console.error('Invio email di reset fallito:', err.message));
    logAudit(req.user.id, 'user', user.id, `Password di "${user.name}" reimpostata dall'amministratore`).catch(() => {});
    res.json({ user, tempPassword });
  })
);

router.patch(
  '/:id/profile',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    const target = await db.get('SELECT is_super_admin, company_id FROM users WHERE id = ?', [req.params.id]);
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const { name, email } = req.body || {};
    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Il nome è obbligatorio' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email non valida' });
      }
      const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), req.params.id]);
      if (existing) {
        return res.status(409).json({ error: 'Email già registrata' });
      }
      updates.push('email = ?');
      params.push(email.toLowerCase());
    }
    if (!updates.length) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'user', user.id, `Dati personali di "${user.name}" aggiornati`).catch(() => {});
    res.json({ user });
  })
);

router.patch(
  '/:id/block',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Non puoi bloccare il tuo stesso account' });
    }
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const { blocked, reason } = req.body || {};
    if (blocked) {
      await db.run("UPDATE users SET is_blocked = 1, blocked_at = datetime('now'), blocked_reason = ? WHERE id = ?", [
        reason && reason.trim() ? reason.trim().slice(0, 500) : null, req.params.id,
      ]);
      await revokeAllSessions(req.params.id);
    } else {
      await db.run("UPDATE users SET is_blocked = 0, blocked_at = NULL, blocked_reason = NULL WHERE id = ?", [req.params.id]);
    }

    const user = await db.get(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    logAudit(
      req.user.id, 'user', user.id,
      blocked ? `Account "${user.name}" bloccato${reason && reason.trim() ? `: ${reason.trim()}` : ''}` : `Account "${user.name}" sbloccato`
    ).catch(() => {});
    res.json({ user });
  })
);

router.delete(
  '/:id',
  requirePermission('users_manage'),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Non puoi eliminare il tuo stesso account' });
    }
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    if (outOfScope(target, req.user)) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'user', Number(req.params.id), `Account "${target.name}" (${target.email}) eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
