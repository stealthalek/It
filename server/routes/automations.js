const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission } = require('../lib/permissions');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

const TRIGGER_EVENTS = ['created', 'updated'];
const STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TYPES = ['incident', 'task'];

const RULE_SELECT = `
  SELECT r.*, grpCond.name AS cond_group_name, grpAction.name AS action_assign_group_name, u.name AS action_assign_user_name
  FROM automation_rules r
  LEFT JOIN groups grpCond ON grpCond.id = r.cond_group_id
  LEFT JOIN groups grpAction ON grpAction.id = r.action_assign_group_id
  LEFT JOIN users u ON u.id = r.action_assign_user_id
`;

function parseRuleBody(body) {
  const {
    name, triggerEvent, condStatus, condPriority, condCategory, condType, condGroupId,
    actionSetStatus, actionSetPriority, actionAssignGroupId, actionAssignUserId, actionNote,
  } = body || {};

  if (!name || !name.trim()) return { error: 'Il nome della regola è obbligatorio' };
  if (!TRIGGER_EVENTS.includes(triggerEvent)) return { error: 'Evento non valido' };
  if (condStatus && !STATUSES.includes(condStatus)) return { error: 'Condizione di stato non valida' };
  if (condPriority && !PRIORITIES.includes(condPriority)) return { error: 'Condizione di priorità non valida' };
  if (condType && !TYPES.includes(condType)) return { error: 'Condizione di tipo non valida' };
  if (actionSetStatus && !STATUSES.includes(actionSetStatus)) return { error: 'Stato dell\'azione non valido' };
  if (actionSetPriority && !PRIORITIES.includes(actionSetPriority)) return { error: 'Priorità dell\'azione non valida' };

  const hasAction = actionSetStatus || actionSetPriority || actionAssignGroupId || actionAssignUserId || (actionNote && actionNote.trim());
  if (!hasAction) return { error: 'Definisci almeno un\'azione per la regola' };

  return {
    values: {
      name: name.trim(),
      triggerEvent,
      condStatus: condStatus || null,
      condPriority: condPriority || null,
      condCategory: condCategory && condCategory.trim() ? condCategory.trim() : null,
      condType: condType || null,
      condGroupId: condGroupId || null,
      actionSetStatus: actionSetStatus || null,
      actionSetPriority: actionSetPriority || null,
      actionAssignGroupId: actionAssignGroupId || null,
      actionAssignUserId: actionAssignUserId || null,
      actionNote: actionNote && actionNote.trim() ? actionNote.trim() : null,
    },
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.user.is_super_admin ? '' : 'WHERE r.company_id IS NULL OR r.company_id = ?';
    const params = req.user.is_super_admin ? [] : [req.user.company_id];
    const rules = await db.all(`${RULE_SELECT} ${where} ORDER BY r.position ASC, r.id ASC`, params);
    res.json({ rules });
  })
);

router.post(
  '/',
  requirePermission('automations_manage'),
  asyncHandler(async (req, res) => {
    const parsed = parseRuleBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const v = parsed.values;

    if (v.condGroupId) {
      const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [v.condGroupId]);
      if (!group || (!req.user.is_super_admin && group.company_id && group.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Gruppo (condizione) non valido' });
      }
    }
    if (v.actionAssignGroupId) {
      const group = await db.get('SELECT id, company_id FROM groups WHERE id = ?', [v.actionAssignGroupId]);
      if (!group || (!req.user.is_super_admin && group.company_id && group.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Gruppo (azione) non valido' });
      }
    }
    if (v.actionAssignUserId) {
      const user = await db.get("SELECT id, company_id FROM users WHERE id = ? AND role IN ('agent', 'admin')", [v.actionAssignUserId]);
      if (!user || (!req.user.is_super_admin && user.company_id && user.company_id !== req.user.company_id)) {
        return res.status(400).json({ error: 'Utente (azione) non valido' });
      }
    }

    const posRow = await db.get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM automation_rules');
    const info = await db.run(
      `INSERT INTO automation_rules
        (name, trigger_event, cond_status, cond_priority, cond_category, cond_type, cond_group_id,
         action_set_status, action_set_priority, action_assign_group_id, action_assign_user_id, action_note, position, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        v.name, v.triggerEvent, v.condStatus, v.condPriority, v.condCategory, v.condType, v.condGroupId,
        v.actionSetStatus, v.actionSetPriority, v.actionAssignGroupId, v.actionAssignUserId, v.actionNote,
        posRow.maxPos + 1, req.user.company_id || null,
      ]
    );

    const rule = await db.get(`${RULE_SELECT} WHERE r.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'automation_rule', rule.id, `Creata regola di automazione "${rule.name}"`).catch(() => {});
    res.status(201).json({ rule });
  })
);

router.patch(
  '/:id',
  requirePermission('automations_manage'),
  asyncHandler(async (req, res) => {
    const rule = await db.get('SELECT * FROM automation_rules WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ error: 'Regola non trovata' });
    if (!req.user.is_super_admin && rule.company_id && rule.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Regola non trovata' });
    }

    if (req.body && req.body.enabled !== undefined) {
      await db.run('UPDATE automation_rules SET enabled = ? WHERE id = ?', [req.body.enabled ? 1 : 0, req.params.id]);
      const updated = await db.get(`${RULE_SELECT} WHERE r.id = ?`, [req.params.id]);
      logAudit(req.user.id, 'automation_rule', updated.id, `Regola "${updated.name}" ${req.body.enabled ? 'attivata' : 'disattivata'}`).catch(() => {});
      return res.json({ rule: updated });
    }

    return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
  })
);

router.delete(
  '/:id',
  requirePermission('automations_manage'),
  asyncHandler(async (req, res) => {
    const rule = await db.get('SELECT name, company_id FROM automation_rules WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ error: 'Regola non trovata' });
    if (!req.user.is_super_admin && rule.company_id && rule.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Regola non trovata' });
    }
    await db.run('DELETE FROM automation_rules WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'automation_rule', Number(req.params.id), `Regola di automazione "${rule.name}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

module.exports = router;
