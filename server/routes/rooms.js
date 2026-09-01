const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requirePermission, hasPermission } = require('../lib/permissions');
const { logAudit } = require('../audit');
const { notifyUser } = require('../notifications');

const router = express.Router();
router.use(authenticate);

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;

function normalizeDatetime(value) {
  return value.replace('T', ' ');
}

const ROOM_SELECT = 'SELECT id, name, location, capacity, company_id, created_at FROM meeting_rooms';

const BOOKING_SELECT = `
  SELECT b.id, b.room_id, r.name AS room_name, b.user_id, u.name AS user_name, b.title,
    b.start_at, b.end_at, b.company_id, b.created_at
  FROM room_bookings b
  JOIN meeting_rooms r ON r.id = b.room_id
  JOIN users u ON u.id = b.user_id
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    if (!req.user.is_super_admin) {
      conditions.push('company_id = ?');
      params.push(req.user.company_id);
    } else if (req.query.companyId) {
      conditions.push('company_id = ?');
      params.push(Number(req.query.companyId));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rooms = await db.all(`${ROOM_SELECT} ${where} ORDER BY name ASC`, params);
    res.json({ rooms });
  })
);

router.post(
  '/',
  requirePermission('rooms_manage'),
  asyncHandler(async (req, res) => {
    const { name, location, capacity, companyId } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome della sala è obbligatorio' });
    }
    if (capacity !== undefined && capacity !== null && capacity !== '' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) {
      return res.status(400).json({ error: 'Capienza non valida' });
    }

    let finalCompanyId = req.user.company_id;
    if (req.user.is_super_admin && companyId) {
      const company = await db.get('SELECT id FROM companies WHERE id = ?', [companyId]);
      if (!company) {
        return res.status(400).json({ error: 'Azienda non valida' });
      }
      finalCompanyId = company.id;
    }

    const info = await db.run('INSERT INTO meeting_rooms (name, location, capacity, company_id) VALUES (?, ?, ?, ?)', [
      name.trim(),
      location && location.trim() ? location.trim() : null,
      capacity ? Number(capacity) : null,
      finalCompanyId,
    ]);
    const room = await db.get(`${ROOM_SELECT} WHERE id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'meeting_room', room.id, `Creata sala riunioni "${room.name}"`).catch(() => {});
    res.status(201).json({ room });
  })
);

router.patch(
  '/:id',
  requirePermission('rooms_manage'),
  asyncHandler(async (req, res) => {
    const room = await db.get(`${ROOM_SELECT} WHERE id = ?`, [req.params.id]);
    if (!room) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    if (!req.user.is_super_admin && room.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }

    const { name, location, capacity } = req.body || {};
    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Il nome della sala è obbligatorio' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (location !== undefined) {
      updates.push('location = ?');
      params.push(location && location.trim() ? location.trim() : null);
    }
    if (capacity !== undefined) {
      if (capacity !== null && capacity !== '' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) {
        return res.status(400).json({ error: 'Capienza non valida' });
      }
      updates.push('capacity = ?');
      params.push(capacity ? Number(capacity) : null);
    }
    if (!updates.length) {
      return res.status(400).json({ error: 'Nessuna modifica valida fornita' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE meeting_rooms SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.get(`${ROOM_SELECT} WHERE id = ?`, [req.params.id]);
    logAudit(req.user.id, 'meeting_room', updated.id, `Sala riunioni "${updated.name}" aggiornata`).catch(() => {});
    res.json({ room: updated });
  })
);

router.delete(
  '/:id',
  requirePermission('rooms_manage'),
  asyncHandler(async (req, res) => {
    const room = await db.get(`${ROOM_SELECT} WHERE id = ?`, [req.params.id]);
    if (!room) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    if (!req.user.is_super_admin && room.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    await db.run('DELETE FROM meeting_rooms WHERE id = ?', [req.params.id]);
    logAudit(req.user.id, 'meeting_room', Number(req.params.id), `Sala riunioni "${room.name}" eliminata`).catch(() => {});
    res.status(204).end();
  })
);

router.get(
  '/:id/bookings',
  asyncHandler(async (req, res) => {
    const room = await db.get(`${ROOM_SELECT} WHERE id = ?`, [req.params.id]);
    if (!room) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    if (!req.user.is_super_admin && room.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    const conditions = ['b.room_id = ?'];
    const params = [req.params.id];
    if (req.query.from) {
      conditions.push('b.end_at > ?');
      params.push(normalizeDatetime(req.query.from));
    }
    if (req.query.to) {
      conditions.push('b.start_at < ?');
      params.push(normalizeDatetime(req.query.to));
    }
    const bookings = await db.all(`${BOOKING_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY b.start_at ASC`, params);
    res.json({ bookings });
  })
);

router.post(
  '/:id/bookings',
  asyncHandler(async (req, res) => {
    const room = await db.get(`${ROOM_SELECT} WHERE id = ?`, [req.params.id]);
    if (!room) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }
    if (!req.user.is_super_admin && room.company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Sala non trovata' });
    }

    const { title, startAt, endAt } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Il titolo della prenotazione è obbligatorio' });
    }
    if (!startAt || !DATETIME_RE.test(startAt) || !endAt || !DATETIME_RE.test(endAt)) {
      return res.status(400).json({ error: 'Orari non validi' });
    }
    const start = normalizeDatetime(startAt);
    const end = normalizeDatetime(endAt);
    if (end <= start) {
      return res.status(400).json({ error: 'L\'orario di fine deve essere successivo a quello di inizio' });
    }

    const overlap = await db.get(
      'SELECT id FROM room_bookings WHERE room_id = ? AND start_at < ? AND end_at > ?',
      [room.id, end, start]
    );
    if (overlap) {
      return res.status(409).json({ error: 'La sala è già prenotata in questo orario' });
    }

    const info = await db.run(
      'INSERT INTO room_bookings (room_id, user_id, title, start_at, end_at, company_id) VALUES (?, ?, ?, ?, ?, ?)',
      [room.id, req.user.id, title.trim().slice(0, 200), start, end, room.company_id]
    );
    const booking = await db.get(`${BOOKING_SELECT} WHERE b.id = ?`, [Number(info.lastInsertRowid)]);
    logAudit(req.user.id, 'room_booking', booking.id, `Prenotata sala "${room.name}" (${start} → ${end})`).catch(() => {});
    res.status(201).json({ booking });
  })
);

router.delete(
  '/bookings/:bookingId',
  asyncHandler(async (req, res) => {
    const booking = await db.get('SELECT * FROM room_bookings WHERE id = ?', [req.params.bookingId]);
    if (!booking) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }
    if (booking.user_id !== req.user.id && !hasPermission(req.user, 'rooms_manage')) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    await db.run('DELETE FROM room_bookings WHERE id = ?', [req.params.bookingId]);
    logAudit(req.user.id, 'room_booking', Number(req.params.bookingId), 'Prenotazione sala annullata').catch(() => {});
    if (booking.user_id !== req.user.id) {
      notifyUser(booking.user_id, null, {
        it: `La tua prenotazione "${booking.title}" è stata annullata`,
        en: `Your booking "${booking.title}" was cancelled`,
      }).catch(() => {});
    }
    res.status(204).end();
  })
);

module.exports = router;
