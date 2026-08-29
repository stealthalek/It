const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

const GROUP_SELECT = `
  SELECT g.id, g.name, g.parent_id, parent.name AS parent_name, g.sla_response_hours, g.sla_resolve_hours,
    g.work_start_hour, g.work_end_hour
  FROM groups g
  LEFT JOIN groups parent ON parent.id = g.parent_id
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
    const groups = await db.all(`${GROUP_SELECT} ORDER BY g.name ASC`);
    res.json({ groups });
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, parentId, slaResponseHours, slaResolveHours, workStartHour, workEndHour } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome del gruppo è obbligatorio' });
    }
    if (workStartHour !== undefined && workStartHour !== null && !validWorkHour(workStartHour)) {
      return res.status(400).json({ error: 'Orario di inizio non valido' });
    }
    if (workEndHour !== undefined && workEndHour !== null && !validWorkHour(workEndHour)) {
      return res.status(400).json({ error: 'Orario di fine non valido' });
    }

    const existing = await db.get('SELECT id FROM groups WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Gruppo già esistente' });
    }

    let finalParentId = null;
    if (parentId) {
      const parent = await db.get('SELECT id FROM groups WHERE id = ?', [parentId]);
      if (!parent) {
        return res.status(400).json({ error: 'Gruppo padre non valido' });
      }
      finalParentId = parent.id;
    }

    const info = await db.run(
      'INSERT INTO groups (name, parent_id, sla_response_hours, sla_resolve_hours, work_start_hour, work_end_hour) VALUES (?, ?, ?, ?, ?, ?)',
      [
        name.trim(),
        finalParentId,
        slaResponseHours ? Number(slaResponseHours) : null,
        slaResolveHours ? Number(slaResolveHours) : null,
        workStartHour !== undefined && workStartHour !== null ? Number(workStartHour) : 9,
        workEndHour !== undefined && workEndHour !== null ? Number(workEndHour) : 18,
      ]
    );
    const group = await db.get(`${GROUP_SELECT} WHERE g.id = ?`, [Number(info.lastInsertRowid)]);
    res.status(201).json({ group });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }

    const { parentId, slaResponseHours, slaResolveHours, workStartHour, workEndHour } = req.body || {};
    const updates = [];
    const params = [];

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
        const parent = await db.get('SELECT id FROM groups WHERE id = ?', [parentIdNum]);
        if (!parent) {
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
    res.json({ group: updated });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) {
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
    res.status(204).end();
  })
);

module.exports = router;
