const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();
router.use(authenticate);

const GROUP_SELECT = `
  SELECT g.id, g.name, g.parent_id, parent.name AS parent_name, g.sla_response_hours, g.sla_resolve_hours,
    g.work_start_hour, g.work_end_hour, g.manager_id, manager.name AS manager_name, g.display_name,
    g.company_id, c.display_name AS company_display_name, c.name AS company_name,
    (SELECT COUNT(*) FROM users mem WHERE mem.group_id = g.id) AS member_count
  FROM groups g
  LEFT JOIN groups parent ON parent.id = g.parent_id
  LEFT JOIN users manager ON manager.id = g.manager_id
  LEFT JOIN companies c ON c.id = g.company_id
`;

function validWorkHour(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 24;
}

async function isDescendant(candidateId, ofId) {
  let current = await db.get('SELECT parent_id FROM groups WHERE id = ?', [candidateId]);
  while (current && current.parent_id) {
    if (current.parent_id === ofId) return true;
    current = await db.get('SELECT parent_id FROM groups WHERE id = ?', [current.parent_id]);
  }
  return false;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    if (!req.user.is_super_admin) {
      conditions.push('g.company_id = ?');
      params.push(req.user.company_id);
    } else if (req.query.companyId) {
      conditions.push('g.company_id = ?');
      params.push(Number(req.query.companyId));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const groups = await db.all(`${GROUP_SELECT} ${where} ORDER BY g.name ASC`, params);
    res.json({ groups });
  })
);

router.post(
  '/',
  requirePermission('groups_manage'),
  asyncHandler(async (req, res) => {
    const { name, parentId, slaResponseHours, slaResolveHours, workStartHour, workEndHour, managerId, displayName, companyId } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del gruppo è obbligatorio' });
    }
    if (workStartHour !== undefined && workStartHour !== null && !validWorkHour(workStartHour)) {
      return res.status(400).json({ error: 'Orario di inizio non valido' });
    }
    if (workEndHour !== undefined && workEndHour !== null && !validWorkHour(workEndHour)) {
      return res.status(400).json({ error: 'Orario di fine non valido' });
    }

    let finalCompanyId = req.user.company_id;
    if (req.user.is_super_admin && companyId) {
      const company = await db.get('SELECT id FROM companies WHERE id = ?', [companyId]);
      if (!company) {
        return res.status(400).json({ error: 'Azienda non valida' });
      }
      finalCompanyId = company.id;
    }

    const existing = await db.get('SELECT id FROM groups WHERE name = ? AND company_id = ?', [name.trim(), finalCompanyId]);
    if (existing) {
      return res.status(409).json({ error: 'Gruppo già esistente' });
    }

    let finalParentId = null;
    if (parentId) {
      const parent = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [parentId]);
      if (!parent || parent.company_id !== finalCompanyId) {
        return res.status(400).json({ error: 'Gruppo padre non valido' });
      }
      finalParentId = parent.id;
    }

    const info = await db.run(
      'INSERT INTO groups (name, parent_id, sla_response_hours, sla_resolve_hours, work_start_hour, work_end_hour, manager_id, display_name, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name.trim(),
        finalParentId,
        slaResponseHours ? Number(slaResponseHours) : null,
        slaResolveHours ? Number(slaResolveHours) : null,
        workStartHour !== undefined && workStartHour !== null ? Number(workStartHour) : 9,
        workEndHour !== undefined && workEndHour !== null ? Number(workEndHour) : 18,
        managerId || null,
        displayName && displayName.trim() ? displayName.trim() : null,
        finalCompanyId,
      ]
    );
    const group = await db.get(`${GROUP_SELECT} WHERE g.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'group', group.id, `Creato gruppo "${group.name}"${group.parent_name ? ` sotto "${group.parent_name}"` : ''}`).catch(() => {});
    res.status(201).json({ group });
  })
);

router.patch(
  '/:id',
  requirePermission('groups_manage'),
  asyncHandler(async (req, res) => {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    if (!req.user.is_super_admin && group.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }

    const { parentId, slaResponseHours, slaResolveHours, workStartHour, workEndHour, managerId, name, displayName } = req.body || {};
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Il nome del gruppo è obbligatorio' });
      }
      const dup = await db.get('SELECT id FROM groups WHERE name = ? AND company_id = ? AND id != ?', [
        name.trim(), group.company_id, group.id,
      ]);
      if (dup) {
        return res.status(409).json({ error: 'Gruppo già esistente' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName && displayName.trim() ? displayName.trim() : null);
    }
    if (managerId !== undefined) {
      updates.push('manager_id = ?');
      params.push(managerId || null);
    }

    if (workStartHour !== undefined && workStartHour !== null && !validWorkHour(workStartHour)) {
      return res.status(400).json({ error: 'Orario di inizio non valido' });
    }
    if (workEndHour !== undefined && workEndHour !== null && !validWorkHour(workEndHour)) {
      return res.status(400).json({ error: 'Orario di fine non valido' });
    }

    if (parentId !== undefined) {
      if (parentId === null) {
        updates.push('parent_id = NULL');
      } else {
        const parentIdNum = Number(parentId);
        if (parentIdNum === group.id) {
          return res.status(400).json({ error: 'Un gruppo non può essere padre di se stesso' });
        }
        const parent = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [parentIdNum]);
        if (!parent || parent.company_id !== group.company_id) {
          return res.status(400).json({ error: 'Gruppo padre non valido' });
        }
        if (await isDescendant(parentIdNum, group.id)) {
          return res.status(400).json({ error: 'Non è possibile creare un ciclo nella gerarchia dei gruppi' });
        }
        updates.push('parent_id = ?');
        params.push(parentIdNum);
      }
    }
    if (slaResponseHours !== undefined) {
      updates.push('sla_response_hours = ?');
      params.push(slaResponseHours || null);
    }
    if (slaResolveHours !== undefined) {
      updates.push('sla_resolve_hours = ?');
      params.push(slaResolveHours || null);
    }
    if (workStartHour !== undefined && workStartHour !== null) {
      updates.push('work_start_hour = ?');
      params.push(Number(workStartHour));
    }
    if (workEndHour !== undefined && workEndHour !== null) {
      updates.push('work_end_hour = ?');
      params.push(Number(workEndHour));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${GROUP_SELECT} WHERE g.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'group', updated.id, `Gruppo "${updated.name}" aggiornato`).catch(() => {});
    res.json({ group: updated });
  })
);

router.delete(
  '/:id',
  requirePermission('groups_manage'),
  asyncHandler(async (req, res) => {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    if (!req.user.is_super_admin && group.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }

    const children = await db.get('SELECT COUNT(*) AS n FROM groups WHERE parent_id = ?', [req.params.id]);
    if (children.n > 0) {
      return res.status(400).json({ error: 'Il gruppo ha sotto-gruppi: spostali o eliminali prima' });
    }

    const inUse = await db.get('SELECT COUNT(*) AS n FROM tickets WHERE group_id = ?', [req.params.id]);
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Gruppo in uso su uno o più ticket, non può essere eliminato' });
    }

    await db.run('UPDATE users SET group_id = NULL WHERE group_id = ?', [req.params.id]);
    await db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'group', Number(req.params.id), `Gruppo "${group.name}" eliminato`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
