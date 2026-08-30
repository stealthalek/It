const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('agent', 'admin'));

const KINDS = ['checkbox', 'license', 'copy_user', 'asset'];
const ASSET_TYPES = ['laptop', 'desktop', 'monitor', 'telefono', 'tablet', 'altro'];
const ITEM_STATUSES = ['pending', 'in_progress', 'done', 'skipped'];

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function isSuperAdmin(user) {
  return Boolean(user.is_super_admin);
}

const TYPE_SELECT = `
  SELECT it.*, g.name AS default_group_name
  FROM onboarding_item_types it
  LEFT JOIN groups g ON g.id = it.default_group_id
`;

router.get(
  '/item-types',
  asyncHandler(async (req, res) => {
    const types = await db.all(`${TYPE_SELECT} ORDER BY it.position ASC, it.id ASC`);
    res.json({ itemTypes: types });
  })
);

router.post(
  '/item-types',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { itemKey, labelIt, labelEn, kind, assetType, defaultGroupId } = req.body || {};
    if (!itemKey || !itemKey.trim() || !labelIt || !labelIt.trim() || !labelEn || !labelEn.trim()) {
      return res.status(400).json({ error: 'Chiave e nomi (IT/EN) obbligatori' });
    }
    if (!KINDS.includes(kind)) {
      return res.status(400).json({ error: 'Tipo di voce non valido' });
    }
    if (kind === 'asset' && !ASSET_TYPES.includes(assetType)) {
      return res.status(400).json({ error: 'Tipo di asset non valido' });
    }
    const key = itemKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const existing = await db.get('SELECT id FROM onboarding_item_types WHERE item_key = ?', [key]);
    if (existing) {
      return res.status(409).json({ error: 'Chiave già esistente' });
    }
    const posRow = await db.get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM onboarding_item_types');
    const info = await db.run(
      'INSERT INTO onboarding_item_types (item_key, label_it, label_en, kind, asset_type, default_group_id, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [key, labelIt.trim(), labelEn.trim(), kind, kind === 'asset' ? assetType : null, defaultGroupId || null, posRow.maxPos + 1]
    );
    const type = await db.get(`${TYPE_SELECT} WHERE it.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'onboarding_item_type', type.id, `Creata voce onboarding "${type.label_it}"`).catch(() => {});
    res.status(201).json({ itemType: type });
  })
);

router.patch(
  '/item-types/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM onboarding_item_types WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Voce non trovata' });

    const { labelIt, labelEn, defaultGroupId, enabled, position } = req.body || {};
    const updates = [];
    const params = [];
    if (labelIt !== undefined) {
      if (!labelIt.trim()) return res.status(400).json({ error: 'Nome (IT) obbligatorio' });
      updates.push('label_it = ?');
      params.push(labelIt.trim());
    }
    if (labelEn !== undefined) {
      if (!labelEn.trim()) return res.status(400).json({ error: 'Nome (EN) obbligatorio' });
      updates.push('label_en = ?');
      params.push(labelEn.trim());
    }
    if (defaultGroupId !== undefined) {
      updates.push('default_group_id = ?');
      params.push(defaultGroupId || null);
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }
    if (position !== undefined && Number.isInteger(Number(position))) {
      updates.push('position = ?');
      params.push(Number(position));
    }
    if (!updates.length) return res.status(400).json({ error: 'Nessuna modifica valida fornita' });

    params.push(req.params.id);
    await db.run(`UPDATE onboarding_item_types SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${TYPE_SELECT} WHERE it.id = ?`, [req.params.id]);
    logAudit(req.user.id, 'onboarding_item_type', updated.id, `Voce onboarding "${updated.label_it}" aggiornata`).catch(() => {});
    res.json({ itemType: updated });
  })
);

router.delete(
  '/item-types/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = await db.get('SELECT * FROM onboarding_item_types WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Voce non trovata' });
    const inUse = await db.get('SELECT COUNT(*) AS n FROM onboarding_items WHERE item_type_id = ?', [req.params.id]);
    if (inUse.n > 0) {
      return res.status(400).json({ error: 'Voce già utilizzata in richieste esistenti: disattivala invece di eliminarla' });
    }
    await db.run('DELETE FROM onboarding_item_types WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'onboarding_item_type', Number(req.params.id), `Voce onboarding "${existing.label_it}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

const REQUEST_SELECT = `
  SELECT r.*, requester.name AS requested_by_name, employee.name AS employee_user_name,
    (SELECT COUNT(*) FROM onboarding_items i WHERE i.request_id = r.id) AS item_count,
    (SELECT COUNT(*) FROM onboarding_items i WHERE i.request_id = r.id AND i.status IN ('done', 'skipped')) AS item_done_count
  FROM onboarding_requests r
  JOIN users requester ON requester.id = r.requested_by
  LEFT JOIN users employee ON employee.id = r.employee_user_id
`;

const ITEM_SELECT = `
  SELECT i.*, g.name AS group_name, copyUser.name AS copy_from_user_name, copyUser.email AS copy_from_user_email,
    completer.name AS completed_by_name, asset.name AS asset_name, asset.tag AS asset_tag
  FROM onboarding_items i
  LEFT JOIN groups g ON g.id = i.assigned_group_id
  LEFT JOIN users copyUser ON copyUser.id = i.copy_from_user_id
  LEFT JOIN users completer ON completer.id = i.completed_by
  LEFT JOIN assets asset ON asset.id = i.asset_id
`;

async function canAccessRequest(user, requestId) {
  if (isSuperAdmin(user) || user.role === 'admin') return true;
  const request = await db.get('SELECT requested_by FROM onboarding_requests WHERE id = ?', [requestId]);
  if (!request) return false;
  if (request.requested_by === user.id) return true;
  const own = await db.get('SELECT COUNT(*) AS n FROM onboarding_items WHERE request_id = ? AND assigned_group_id = ?', [requestId, user.group_id]);
  return own.n > 0;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, group, mine } = req.query;
    const clauses = [];
    const params = [];

    if (!isSuperAdmin(req.user) && req.user.role !== 'admin') {
      clauses.push('(r.requested_by = ? OR EXISTS (SELECT 1 FROM onboarding_items i2 WHERE i2.request_id = r.id AND i2.assigned_group_id = ?))');
      params.push(req.user.id, req.user.group_id || -1);
    }
    if (mine === '1') {
      clauses.push('r.requested_by = ?');
      params.push(req.user.id);
    }
    if (status && ['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      clauses.push('r.status = ?');
      params.push(status);
    }
    if (group && /^\d+$/.test(group)) {
      clauses.push('EXISTS (SELECT 1 FROM onboarding_items i3 WHERE i3.request_id = r.id AND i3.assigned_group_id = ?)');
      params.push(Number(group));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const requests = await db.all(`${REQUEST_SELECT} ${where} ORDER BY r.created_at DESC`, params);
    res.json({ requests });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { employeeName, employeeEmail, startDate, employeeUserId, notes, itemTypeIds } = req.body || {};
    if (!employeeName || !employeeName.trim()) {
      return res.status(400).json({ error: 'Il nome del nuovo assunto è obbligatorio' });
    }

    const info = await db.run(
      'INSERT INTO onboarding_requests (employee_name, employee_email, start_date, employee_user_id, requested_by, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [employeeName.trim(), employeeEmail ? employeeEmail.trim() : null, startDate || null, employeeUserId || null, req.user.id, notes ? notes.trim() : null]
    );
    const requestId = Number(info.lastInsertRowid);

    const types = await db.all(`${TYPE_SELECT} WHERE it.enabled = 1 ORDER BY it.position ASC, it.id ASC`);
    const selected = Array.isArray(itemTypeIds) && itemTypeIds.length
      ? types.filter((tItem) => itemTypeIds.includes(tItem.id))
      : types;

    for (const itemType of selected) {
      await db.run(
        `INSERT INTO onboarding_items (request_id, item_type_id, item_key, label_it, label_en, kind, asset_type, assigned_group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, itemType.id, itemType.item_key, itemType.label_it, itemType.label_en, itemType.kind, itemType.asset_type, itemType.default_group_id]
      );
    }

    const groupIds = [...new Set(selected.map((s) => s.default_group_id).filter(Boolean))];
    if (groupIds.length) {
      const placeholders = groupIds.map(() => '?').join(',');
      const staff = await db.all(
        `SELECT id FROM users WHERE role IN ('agent', 'admin') AND group_id IN (${placeholders}) AND id != ?`,
        [...groupIds, req.user.id]
      );
      for (const u of staff) {
        notifyUser(u.id, null, {
          it: `Nuovo onboarding: ${employeeName.trim()}`,
          en: `New onboarding: ${employeeName.trim()}`,
        }).catch(() => {});
      }
    }

    logAudit(req.user.id, 'onboarding_request', requestId, `Avviato onboarding per "${employeeName.trim()}"`).catch(() => {});
    const request = await db.get(`${REQUEST_SELECT} WHERE r.id = ?`, [requestId]);
    res.status(201).json({ request });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const request = await db.get(`${REQUEST_SELECT} WHERE r.id = ?`, [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Richiesta non trovata' });
    const items = await db.all(`${ITEM_SELECT} WHERE i.request_id = ? ORDER BY i.id ASC`, [req.params.id]);
    const attachments = await db.all(
      `SELECT a.id, a.request_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM onboarding_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.request_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ request, items, attachments });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const existing = await db.get('SELECT * FROM onboarding_requests WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Richiesta non trovata' });

    const { employeeName, employeeEmail, startDate, employeeUserId, notes, status } = req.body || {};
    const updates = ["updated_at = datetime('now')"];
    const params = [];
    if (employeeName !== undefined) {
      if (!employeeName.trim()) return res.status(400).json({ error: 'Il nome del nuovo assunto è obbligatorio' });
      updates.push('employee_name = ?');
      params.push(employeeName.trim());
    }
    if (employeeEmail !== undefined) {
      updates.push('employee_email = ?');
      params.push(employeeEmail ? employeeEmail.trim() : null);
    }
    if (startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(startDate || null);
    }
    if (employeeUserId !== undefined) {
      updates.push('employee_user_id = ?');
      params.push(employeeUserId || null);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes ? notes.trim() : null);
    }
    if (status !== undefined) {
      if (!['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Stato non valido' });
      }
      updates.push('status = ?');
      params.push(status);
    }

    params.push(req.params.id);
    await db.run(`UPDATE onboarding_requests SET ${updates.join(', ')} WHERE id = ?`, params);
    logAudit(req.user.id, 'onboarding_request', Number(req.params.id), 'Richiesta di onboarding aggiornata').catch(() => {});
    const updated = await db.get(`${REQUEST_SELECT} WHERE r.id = ?`, [req.params.id]);
    res.json({ request: updated });
  })
);

async function syncRequestStatus(requestId) {
  const counts = await db.get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('done', 'skipped') THEN 1 ELSE 0 END) AS closed,
       SUM(CASE WHEN status IN ('in_progress', 'done') THEN 1 ELSE 0 END) AS started
     FROM onboarding_items WHERE request_id = ?`,
    [requestId]
  );
  const request = await db.get('SELECT status FROM onboarding_requests WHERE id = ?', [requestId]);
  if (!request || request.status === 'cancelled') return;
  let nextStatus = request.status;
  if (counts.total > 0 && Number(counts.closed) === Number(counts.total)) {
    nextStatus = 'completed';
  } else if (Number(counts.started) > 0) {
    nextStatus = 'in_progress';
  }
  if (nextStatus !== request.status) {
    await db.run("UPDATE onboarding_requests SET status = ?, updated_at = datetime('now') WHERE id = ?", [nextStatus, requestId]);
  }
}

router.patch(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const item = await db.get('SELECT * FROM onboarding_items WHERE id = ?', [req.params.itemId]);
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (!(await canAccessRequest(req.user, item.request_id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }

    const { status, copyFromUserId, licenseNote, notes } = req.body || {};
    const updates = [];
    const params = [];

    if (status !== undefined) {
      if (!ITEM_STATUSES.includes(status)) return res.status(400).json({ error: 'Stato non valido' });
      updates.push('status = ?');
      params.push(status);
      if (status === 'done' || status === 'skipped') {
        updates.push('completed_by = ?', "completed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')");
        params.push(req.user.id);
      } else {
        updates.push('completed_by = NULL', 'completed_at = NULL');
      }
    }
    if (copyFromUserId !== undefined) {
      updates.push('copy_from_user_id = ?');
      params.push(copyFromUserId || null);
    }
    if (licenseNote !== undefined) {
      updates.push('license_note = ?');
      params.push(licenseNote ? licenseNote.trim() : null);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes ? notes.trim() : null);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nessuna modifica valida fornita' });

    let generatedAssetId = null;
    if (status === 'done' && item.kind === 'asset' && !item.asset_id) {
      const request = await db.get('SELECT employee_name, employee_user_id FROM onboarding_requests WHERE id = ?', [item.request_id]);
      const assetInfo = await db.run(
        `INSERT INTO assets (name, asset_type, tag, assignment_type, assigned_to, status)
         VALUES (?, ?, NULL, 'permanente', ?, ?)`,
        [
          `${item.label_it} - ${request.employee_name}`,
          item.asset_type || 'altro',
          request.employee_user_id || null,
          request.employee_user_id ? 'in_uso' : 'disponibile',
        ]
      );
      generatedAssetId = Number(assetInfo.lastInsertRowid);
      updates.push('asset_id = ?');
      params.push(generatedAssetId);
    }

    params.push(req.params.itemId);
    await db.run(`UPDATE onboarding_items SET ${updates.join(', ')} WHERE id = ?`, params);

    if (status === 'done' || status === 'skipped') {
      const request = await db.get('SELECT requested_by, employee_name FROM onboarding_requests WHERE id = ?', [item.request_id]);
      if (request && request.requested_by !== req.user.id) {
        notifyUser(request.requested_by, null, {
          it: `"${item.label_it}" completato per l'onboarding di ${request.employee_name}`,
          en: `"${item.label_en}" completed for ${request.employee_name}'s onboarding`,
        }).catch(() => {});
      }
    }

    await syncRequestStatus(item.request_id);

    const updated = await db.get(`${ITEM_SELECT} WHERE i.id = ?`, [req.params.itemId]);
    logAudit(req.user.id, 'onboarding_item', updated.id, `Voce onboarding "${updated.label_it}" aggiornata${generatedAssetId ? `, asset #${generatedAssetId} creato` : ''}`).catch(() => {});
    res.json({ item: updated });
  })
);

router.get(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const rows = await db.all(
      `SELECT a.id, a.request_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM onboarding_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.request_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ attachments: rows });
  })
);

router.post(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const request = await db.get('SELECT id FROM onboarding_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Richiesta non trovata' });

    const { fileName, dataUrl } = req.body || {};
    if (!fileName || !fileName.trim()) return res.status(400).json({ error: 'Nome del file mancante' });
    if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'File mancante' });
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return res.status(400).json({ error: 'Formato file non valido' });
    const [, mimeType, base64Data] = match;
    if (!ATTACHMENT_ALLOWED_MIME.has(mimeType)) return res.status(400).json({ error: 'Tipo di file non consentito' });
    const sizeBytes = Buffer.byteLength(base64Data, 'base64');
    if (sizeBytes > ATTACHMENT_MAX_BYTES) return res.status(400).json({ error: 'File troppo grande (max 5 MB)' });

    const info = await db.run(
      'INSERT INTO onboarding_attachments (request_id, uploaded_by, file_name, mime_type, size_bytes, data) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, req.user.id, fileName.trim().slice(0, 255), mimeType, sizeBytes, dataUrl]
    );
    logAudit(req.user.id, 'onboarding_request', Number(req.params.id), `Allegato aggiunto: "${fileName.trim().slice(0, 255)}"`).catch(() => {});
    const row = await db.get(
      `SELECT a.id, a.request_id, a.uploaded_by, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploader_name
       FROM onboarding_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = ?`,
      [Number(info.lastInsertRowid)]
    );
    res.status(201).json({ attachment: row });
  })
);

router.get(
  '/:id/attachments/:attId',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const row = await db.get('SELECT * FROM onboarding_attachments WHERE id = ? AND request_id = ?', [req.params.attId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    res.json({ attachment: row });
  })
);

router.delete(
  '/:id/attachments/:attId',
  asyncHandler(async (req, res) => {
    if (!(await canAccessRequest(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    const row = await db.get('SELECT * FROM onboarding_attachments WHERE id = ? AND request_id = ?', [req.params.attId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
    if (row.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    await db.run('DELETE FROM onboarding_attachments WHERE id = ?', [row.id]);
    res.status(204).end();
  })
);

module.exports = router;
