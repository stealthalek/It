const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('admin'));

async function resolveCompany(req) {
  const companyId = req.user.is_super_admin && req.query.companyId
    ? Number(req.query.companyId)
    : req.user.company_id;
  if (!companyId) return null;
  return db.get('SELECT id, name, display_name, is_active, created_at FROM companies WHERE id = ?', [companyId]);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const company = await resolveCompany(req);
    if (!company) {
      return res.status(400).json({ error: 'Nessuna azienda da esportare' });
    }
    const cid = company.id;

    const [
      users, groups, categories, roles, tickets, comments, ticketEvents,
      assets, customFields, cannedResponses, ticketTemplates, holidays,
      automationRules, auditLog, announcements, leaveRequests,
      meetingRooms, roomBookings, ideas, wikiPages, expenseReports,
      onboardingRequests, onboardingItems,
    ] = await Promise.all([
      db.all(
        `SELECT id, name, email, role, group_id, locale, is_external, manager_id, role_id, created_at
         FROM users WHERE company_id = ? ORDER BY id`,
        [cid]
      ),
      db.all('SELECT * FROM groups WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM categories WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT id, key, label_it, label_en, color, read_only, permissions, created_at FROM roles WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM tickets WHERE company_id = ? ORDER BY id', [cid]),
      db.all(
        `SELECT c.* FROM comments c JOIN tickets t ON t.id = c.ticket_id WHERE t.company_id = ? ORDER BY c.id`,
        [cid]
      ),
      db.all(
        `SELECT e.* FROM ticket_events e JOIN tickets t ON t.id = e.ticket_id WHERE t.company_id = ? ORDER BY e.id`,
        [cid]
      ),
      db.all('SELECT * FROM assets WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM custom_fields WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT id, title, body, created_by, created_at FROM canned_responses WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM ticket_templates WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM holidays WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM automation_rules WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT id, actor_id, target_type, target_id, message, created_at FROM audit_log WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT id, title, body, pinned, created_by, created_at, updated_at FROM announcements WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM leave_requests WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM meeting_rooms WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM room_bookings WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM ideas WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT id, title, content, author_id, updated_by, created_at, updated_at FROM wiki_pages WHERE company_id = ? ORDER BY id', [cid]),
      db.all('SELECT * FROM expense_reports WHERE company_id = ? ORDER BY id', [cid]),
      db.all(
        `SELECT r.* FROM onboarding_requests r JOIN users u ON u.id = r.requested_by WHERE u.company_id = ? ORDER BY r.id`,
        [cid]
      ),
      db.all(
        `SELECT i.* FROM onboarding_items i
         JOIN onboarding_requests r ON r.id = i.request_id
         JOIN users u ON u.id = r.requested_by
         WHERE u.company_id = ? ORDER BY i.id`,
        [cid]
      ),
    ]);

    logAudit(req.user.id, 'company', cid, `Esportati i dati dell'azienda "${company.name}"`).catch(() => {});

    const filename = `export-${company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json({
      exportedAt: new Date().toISOString(),
      company,
      excluded: [
        'password hash e segreti 2FA',
        'token di sessione',
        'messaggi diretti tra colleghi (comunicazioni private)',
        'notifiche (dati effimeri)',
        'contenuto binario degli allegati (solo metadati)',
      ],
      data: {
        users, groups, categories, roles, tickets, comments, ticketEvents,
        assets, customFields, cannedResponses, ticketTemplates, holidays,
        automationRules, auditLog, announcements, leaveRequests,
        meetingRooms, roomBookings, ideas, wikiPages, expenseReports,
        onboardingRequests, onboardingItems,
      },
    });
  })
);

module.exports = router;
