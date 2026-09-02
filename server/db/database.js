const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

const usingTurso = Boolean(process.env.TURSO_DATABASE_URL);

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let url = process.env.TURSO_DATABASE_URL;
let syncUrl;
if (!usingTurso) {
  url = `file:${path.join(dataDir, 'ticketing.db')}`;
} else {
  syncUrl = url;
  url = `file:${path.join(dataDir, 'replica.db')}`;
}

const client = createClient({
  url,
  syncUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: usingTurso ? 60 : undefined,
});

let replicaDirty = false;
let replicaSyncInFlight = null;

async function ensureReplicaFresh() {
  if (!usingTurso) return;
  if (replicaDirty && !replicaSyncInFlight) {
    replicaDirty = false;
    replicaSyncInFlight = client.sync().catch(() => {}).finally(() => { replicaSyncInFlight = null; });
  }
  if (replicaSyncInFlight) await replicaSyncInFlight;
}

async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  if (usingTurso) replicaDirty = true;
  return result;
}

async function get(sql, args = []) {
  await ensureReplicaFresh();
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

async function all(sql, args = []) {
  await ensureReplicaFresh();
  const result = await client.execute({ sql, args });
  return result.rows;
}

async function setupSchema() {
  if (!usingTurso) {
    await client.execute('PRAGMA journal_mode = WAL');
  }
  await client.execute('PRAGMA foreign_keys = ON');

  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'agent', 'admin')),
        team TEXT,
        is_super_admin INTEGER NOT NULL DEFAULT 0,
        locale TEXT NOT NULL DEFAULT 'it',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        label_it TEXT NOT NULL,
        label_en TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#8f2436',
        read_only INTEGER NOT NULL DEFAULT 0,
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        type TEXT NOT NULL DEFAULT 'incident' CHECK (type IN ('incident', 'task')),
        category TEXT NOT NULL DEFAULT 'generale',
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_internal INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
      )`,
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
      )`,
      `CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        sla_response_hours INTEGER,
        sla_resolve_hours INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        org_name TEXT NOT NULL DEFAULT 'Ticketing'
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
      )`,
      `CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL DEFAULT 'altro' CHECK (asset_type IN ('laptop', 'desktop', 'monitor', 'telefono', 'altro')),
        tag TEXT,
        status TEXT NOT NULL DEFAULT 'disponibile' CHECK (status IN ('disponibile', 'in_uso', 'in_riparazione', 'dismesso')),
        assignment_type TEXT NOT NULL DEFAULT 'permanente' CHECK (assignment_type IN ('permanente', 'prestito')),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        due_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        target_type TEXT,
        target_id INTEGER,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
      )`,
      `CREATE TABLE IF NOT EXISTS automation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger_event TEXT NOT NULL CHECK (trigger_event IN ('created', 'updated')),
        cond_status TEXT,
        cond_priority TEXT,
        cond_category TEXT,
        cond_type TEXT,
        cond_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        action_set_status TEXT,
        action_set_priority TEXT,
        action_assign_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        action_assign_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action_note TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS custom_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'textarea', 'select', 'checkbox')),
        options TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        required INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_custom_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
        value TEXT,
        UNIQUE(ticket_id, field_id)
      )`,
      `CREATE TABLE IF NOT EXISTS canned_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_tags (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, tag_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        linked_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(ticket_id, linked_ticket_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_watchers (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ticket_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        type TEXT CHECK (type IN ('incident', 'task')),
        position INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS onboarding_item_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_key TEXT NOT NULL UNIQUE,
        label_it TEXT NOT NULL,
        label_en TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'checkbox' CHECK (kind IN ('checkbox', 'license', 'copy_user', 'asset')),
        asset_type TEXT,
        default_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        license_options TEXT,
        addon_label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS onboarding_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT NOT NULL,
        employee_email TEXT,
        start_date TEXT,
        employee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS onboarding_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES onboarding_requests(id) ON DELETE CASCADE,
        item_type_id INTEGER REFERENCES onboarding_item_types(id) ON DELETE SET NULL,
        item_key TEXT NOT NULL,
        label_it TEXT NOT NULL,
        label_en TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'checkbox' CHECK (kind IN ('checkbox', 'license', 'copy_user', 'asset')),
        asset_type TEXT,
        assigned_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
        copy_from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        copy_from_name_manual TEXT,
        license_note TEXT,
        addon_requested INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS onboarding_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES onboarding_requests(id) ON DELETE CASCADE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT,
        ip_address TEXT,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS announcement_reads (
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (announcement_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS announcement_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('group', 'user')),
        target_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS announcement_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'vacation' CHECK (type IN ('vacation', 'permit')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        review_note TEXT,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS direct_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        read_at TEXT,
        edited_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id)',
      'CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_id ON direct_messages(recipient_id)',
      'CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages(created_at)',
      `CREATE TABLE IF NOT EXISTS meeting_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        capacity INTEGER,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS room_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL REFERENCES meeting_rooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_meeting_rooms_company_id ON meeting_rooms(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_room_id ON room_bookings(room_id)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_user_id ON room_bookings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_company_id ON room_bookings(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_start_at ON room_bookings(start_at)',
      `CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'new',
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS idea_votes (
        idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (idea_id, user_id)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_ideas_company_id ON ideas(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_author_id ON ideas(author_id)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status)',
      'CREATE INDEX IF NOT EXISTS idx_idea_votes_idea_id ON idea_votes(idea_id)',
      `CREATE TABLE IF NOT EXISTS wiki_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_wiki_pages_company_id ON wiki_pages(company_id)',
      `CREATE TABLE IF NOT EXISTS expense_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('travel', 'meals', 'accommodation', 'supplies', 'other')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        review_note TEXT,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_expense_reports_user_id ON expense_reports(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_expense_reports_company_id ON expense_reports(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status)',
      'CREATE INDEX IF NOT EXISTS idx_announcements_company_id ON announcements(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_announcements_pinned_created ON announcements(pinned, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_announcement_targets_announcement_id ON announcement_targets(announcement_id)',
      'CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement_id ON announcement_attachments(announcement_id)',
      'CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON leave_requests(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_ticket_id ON ticket_events(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_ticket_custom_values_ticket_id ON ticket_custom_values(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag_id ON ticket_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_ticket_links_linked_ticket_id ON ticket_links(linked_ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_onboarding_items_request_id ON onboarding_items(request_id)',
      'CREATE INDEX IF NOT EXISTS idx_onboarding_items_group_id ON onboarding_items(assigned_group_id)',
      'CREATE INDEX IF NOT EXISTS idx_onboarding_items_ticket_id ON onboarding_items(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_onboarding_attachments_request_id ON onboarding_attachments(request_id)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_status_updated_at ON tickets(status, updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_created_by_updated_at ON tickets(created_by, updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_updated_at ON tickets(assigned_to, updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_category_updated_at ON tickets(category, updated_at)',
    ],
    'write'
  );
}

async function rebuildTableIfDangling(tableName, danglingRef, createSql, columns) {
  const info = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName]);
  if (!info || !info.sql.includes(danglingRef)) return;
  await run(createSql);
  await run(`INSERT INTO ${tableName}_fixed (${columns}) SELECT ${columns} FROM ${tableName}`);
  await run(`DROP TABLE ${tableName}`);
  await run(`ALTER TABLE ${tableName}_fixed RENAME TO ${tableName}`);
}

async function repairDanglingTicketReferences() {
  const stale = await all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%tickets_old%'"
  );
  if (!stale.length) return;

  await run('PRAGMA foreign_keys = OFF');
  await rebuildTableIfDangling(
    'comments', 'tickets_old',
    `CREATE TABLE comments_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    )`,
    'id, ticket_id, user_id, message, is_internal, created_at'
  );
  await rebuildTableIfDangling(
    'ticket_events', 'tickets_old',
    `CREATE TABLE ticket_events_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    )`,
    'id, ticket_id, actor_id, message, created_at'
  );
  await rebuildTableIfDangling(
    'notifications', 'tickets_old',
    `CREATE TABLE notifications_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    )`,
    'id, user_id, ticket_id, message, is_read, created_at'
  );
  await rebuildTableIfDangling(
    'ticket_custom_values', 'tickets_old',
    `CREATE TABLE ticket_custom_values_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT,
      UNIQUE(ticket_id, field_id)
    )`,
    'id, ticket_id, field_id, value'
  );
  await rebuildTableIfDangling(
    'ticket_attachments', 'tickets_old',
    `CREATE TABLE ticket_attachments_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'id, ticket_id, comment_id, uploaded_by, file_name, mime_type, size_bytes, data, created_at'
  );
  await rebuildTableIfDangling(
    'ticket_tags', 'tickets_old',
    `CREATE TABLE ticket_tags_fixed (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, tag_id)
    )`,
    'ticket_id, tag_id'
  );
  await rebuildTableIfDangling(
    'ticket_links', 'tickets_old',
    `CREATE TABLE ticket_links_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      linked_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ticket_id, linked_ticket_id)
    )`,
    'id, ticket_id, linked_ticket_id, created_by, created_at'
  );
  await rebuildTableIfDangling(
    'ticket_watchers', 'tickets_old',
    `CREATE TABLE ticket_watchers_fixed (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (ticket_id, user_id)
    )`,
    'ticket_id, user_id, created_at'
  );
  await run('PRAGMA foreign_keys = ON');
}

async function migrate() {
  await repairDanglingTicketReferences();

  const groupCols = await all('PRAGMA table_info(groups)');
  if (groupCols.length && !groupCols.some((c) => c.name === 'parent_id')) {
    await run('ALTER TABLE groups ADD COLUMN parent_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
  }

  const ticketAttachmentCols = await all('PRAGMA table_info(ticket_attachments)');
  if (ticketAttachmentCols.length && !ticketAttachmentCols.some((c) => c.name === 'storage_key')) {
    await run('ALTER TABLE ticket_attachments ADD COLUMN storage_key TEXT');
  }

  await seedDefaultGroups();

  const commentCols = await all('PRAGMA table_info(comments)');
  if (!commentCols.some((c) => c.name === 'is_internal')) {
    await run('ALTER TABLE comments ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0');
  }

  const ticketCols = await all('PRAGMA table_info(tickets)');
  if (!ticketCols.some((c) => c.name === 'type')) {
    await run("ALTER TABLE tickets ADD COLUMN type TEXT NOT NULL DEFAULT 'incident'");
  }

  const userCols = await all('PRAGMA table_info(users)');
  if (!userCols.some((c) => c.name === 'team')) {
    await run('ALTER TABLE users ADD COLUMN team TEXT');
  }
  if (!userCols.some((c) => c.name === 'group_id')) {
    await run('ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id)');
  if (!userCols.some((c) => c.name === 'is_super_admin')) {
    await run('ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.some((c) => c.name === 'locale')) {
    await run("ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'it'");
  }
  if (!userCols.some((c) => c.name === 'is_external')) {
    await run('ALTER TABLE users ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.some((c) => c.name === 'manager_id')) {
    await run('ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  const superAdminRow = await get("SELECT COUNT(*) AS n FROM users WHERE is_super_admin = 1");
  if (superAdminRow.n === 0) {
    const earliestAdmin = await get("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    if (earliestAdmin) {
      await run('UPDATE users SET is_super_admin = 1 WHERE id = ?', [earliestAdmin.id]);
    }
  }

  const ticketCols2 = await all('PRAGMA table_info(tickets)');
  if (!ticketCols2.some((c) => c.name === 'group_id')) {
    await run('ALTER TABLE tickets ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_tickets_group_id ON tickets(group_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_tickets_group_id_updated_at ON tickets(group_id, updated_at)');
  if (!ticketCols2.some((c) => c.name === 'resolved_at')) {
    await run('ALTER TABLE tickets ADD COLUMN resolved_at TEXT');
  }
  if (!ticketCols2.some((c) => c.name === 'asset_id')) {
    await run('ALTER TABLE tickets ADD COLUMN asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL');
  }
  if (!ticketCols2.some((c) => c.name === 'waiting_since')) {
    await run('ALTER TABLE tickets ADD COLUMN waiting_since TEXT');
  }
  if (!ticketCols2.some((c) => c.name === 'sla_paused_ms')) {
    await run('ALTER TABLE tickets ADD COLUMN sla_paused_ms INTEGER NOT NULL DEFAULT 0');
  }

  if (userCols.some((c) => c.name === 'team')) {
    const withTeam = await all("SELECT id, team FROM users WHERE team IS NOT NULL AND team != '' AND group_id IS NULL");
    for (const u of withTeam) {
      let g = await get('SELECT id FROM groups WHERE name = ?', [u.team]);
      if (!g) {
        const info = await run('INSERT INTO groups (name) VALUES (?)', [u.team]);
        g = { id: Number(info.lastInsertRowid) };
      }
      await run('UPDATE users SET group_id = ? WHERE id = ?', [g.id, u.id]);
    }
  }

  const settingsCols = await all('PRAGMA table_info(app_settings)');
  for (const col of ['invite_subject_it', 'invite_body_it', 'invite_subject_en', 'invite_body_en', 'org_logo']) {
    if (!settingsCols.some((c) => c.name === col)) {
      await run(`ALTER TABLE app_settings ADD COLUMN ${col} TEXT`);
    }
  }

  const groupCols2 = await all('PRAGMA table_info(groups)');
  if (!groupCols2.some((c) => c.name === 'work_start_hour')) {
    await run('ALTER TABLE groups ADD COLUMN work_start_hour INTEGER NOT NULL DEFAULT 9');
  }
  if (!groupCols2.some((c) => c.name === 'work_end_hour')) {
    await run('ALTER TABLE groups ADD COLUMN work_end_hour INTEGER NOT NULL DEFAULT 18');
  }

  const categoryCols = await all('PRAGMA table_info(categories)');
  if (!categoryCols.some((c) => c.name === 'icon')) {
    await run("ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'ticket'");
  }
  if (!categoryCols.some((c) => c.name === 'default_group_id')) {
    await run('ALTER TABLE categories ADD COLUMN default_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
  }
  if (!categoryCols.some((c) => c.name === 'parent_id')) {
    await run('ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE');
  }

  const deptDefaults = ['Facility Management', 'Marketing e Comunicazione', 'Acquisti e Fornitori'];
  for (const name of deptDefaults) {
    const existing = await get('SELECT id FROM groups WHERE name = ?', [name]);
    if (!existing) {
      await run('INSERT INTO groups (name, sla_response_hours, sla_resolve_hours) VALUES (?, 8, 48)', [name]);
    }
  }

  await seedExpandedCategories();

  const ticketsTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tickets'");
  if (ticketsTable && ticketsTable.sql && !ticketsTable.sql.includes('waiting_customer')) {
    await run('PRAGMA foreign_keys = OFF');
    await run(`CREATE TABLE tickets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      type TEXT NOT NULL DEFAULT 'incident' CHECK (type IN ('incident', 'task')),
      category TEXT NOT NULL DEFAULT 'generale',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      resolved_at TEXT,
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      waiting_since TEXT,
      sla_paused_ms INTEGER NOT NULL DEFAULT 0
    )`);
    await run(`INSERT INTO tickets_new (id, subject, description, status, priority, type, category, created_by, assigned_to, created_at, updated_at, group_id, resolved_at, asset_id, waiting_since, sla_paused_ms)
      SELECT id, subject, description, status, priority, type, category, created_by, assigned_to, created_at, updated_at, group_id, resolved_at, asset_id, waiting_since, sla_paused_ms FROM tickets`);
    await run('DROP TABLE tickets');
    await run('ALTER TABLE tickets_new RENAME TO tickets');
    await run('PRAGMA foreign_keys = ON');
  }

  const ticketCols3 = await all('PRAGMA table_info(tickets)');
  if (!ticketCols3.some((c) => c.name === 'rating')) {
    await run('ALTER TABLE tickets ADD COLUMN rating INTEGER');
  }
  if (!ticketCols3.some((c) => c.name === 'rating_comment')) {
    await run('ALTER TABLE tickets ADD COLUMN rating_comment TEXT');
  }
  if (!ticketCols3.some((c) => c.name === 'rated_at')) {
    await run('ALTER TABLE tickets ADD COLUMN rated_at TEXT');
  }
  if (!ticketCols3.some((c) => c.name === 'sla_warned_at')) {
    await run('ALTER TABLE tickets ADD COLUMN sla_warned_at TEXT');
  }
  if (!ticketCols3.some((c) => c.name === 'first_response_at')) {
    await run('ALTER TABLE tickets ADD COLUMN first_response_at TEXT');
  }
  if (!ticketCols3.some((c) => c.name === 'on_behalf_of')) {
    await run('ALTER TABLE tickets ADD COLUMN on_behalf_of INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!ticketCols3.some((c) => c.name === 'cancelled_at')) {
    await run('ALTER TABLE tickets ADD COLUMN cancelled_at TEXT');
  }
  if (!ticketCols3.some((c) => c.name === 'cancelled_reason')) {
    await run('ALTER TABLE tickets ADD COLUMN cancelled_reason TEXT');
  }

  const groupCols3 = await all('PRAGMA table_info(groups)');
  if (!groupCols3.some((c) => c.name === 'manager_id')) {
    await run('ALTER TABLE groups ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }

  const assetsTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assets'");
  if (assetsTable && assetsTable.sql && !assetsTable.sql.includes("'tablet'")) {
    await run('PRAGMA foreign_keys = OFF');
    await run(`CREATE TABLE assets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'altro' CHECK (asset_type IN ('laptop', 'desktop', 'monitor', 'telefono', 'tablet', 'altro')),
      tag TEXT,
      status TEXT NOT NULL DEFAULT 'disponibile' CHECK (status IN ('disponibile', 'in_uso', 'in_riparazione', 'dismesso')),
      assignment_type TEXT NOT NULL DEFAULT 'permanente' CHECK (assignment_type IN ('permanente', 'prestito')),
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await run(`INSERT INTO assets_new (id, name, asset_type, tag, status, assignment_type, assigned_to, due_date, created_at)
      SELECT id, name, asset_type, tag, status, assignment_type, assigned_to, due_date, created_at FROM assets`);
    await run('DROP TABLE assets');
    await run('ALTER TABLE assets_new RENAME TO assets');
    await run('PRAGMA foreign_keys = ON');
  }

  const onboardingTypeCount = await get('SELECT COUNT(*) AS n FROM onboarding_item_types');
  if (onboardingTypeCount.n === 0) {
    await seedOnboardingItemTypes();
  }

  const userCols4 = await all('PRAGMA table_info(users)');
  if (!userCols4.some((c) => c.name === 'totp_secret')) {
    await run('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  }
  if (!userCols4.some((c) => c.name === 'totp_enabled')) {
    await run('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
  }

  const onbTypeCols = await all('PRAGMA table_info(onboarding_item_types)');
  if (!onbTypeCols.some((c) => c.name === 'license_options')) {
    await run('ALTER TABLE onboarding_item_types ADD COLUMN license_options TEXT');
  }
  if (!onbTypeCols.some((c) => c.name === 'addon_label')) {
    await run('ALTER TABLE onboarding_item_types ADD COLUMN addon_label TEXT');
  }

  const onbItemCols = await all('PRAGMA table_info(onboarding_items)');
  if (!onbItemCols.some((c) => c.name === 'copy_from_name_manual')) {
    await run('ALTER TABLE onboarding_items ADD COLUMN copy_from_name_manual TEXT');
  }
  if (!onbItemCols.some((c) => c.name === 'addon_requested')) {
    await run('ALTER TABLE onboarding_items ADD COLUMN addon_requested INTEGER NOT NULL DEFAULT 0');
  }
  if (!onbItemCols.some((c) => c.name === 'ticket_id')) {
    await run('ALTER TABLE onboarding_items ADD COLUMN ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL');
  }

  const damType = await get("SELECT id FROM onboarding_item_types WHERE item_key = 'dam'");
  if (!damType) {
    const serviceDesk = await get("SELECT id FROM groups WHERE name = 'Service Desk'");
    const posRow = await get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM onboarding_item_types');
    await run(
      'INSERT INTO onboarding_item_types (item_key, label_it, label_en, kind, default_group_id, position) VALUES (?, ?, ?, ?, ?, ?)',
      ['dam', 'DAM', 'DAM', 'copy_user', serviceDesk ? serviceDesk.id : null, posRow.maxPos + 1]
    );
  }
  await run("UPDATE onboarding_item_types SET license_options = ? WHERE item_key = 'mailbox' AND license_options IS NULL", [
    JSON.stringify(['Nessuna', 'E5', 'F3', 'F3_1']),
  ]);
  await run("UPDATE onboarding_item_types SET addon_label = 'Dynamics' WHERE item_key = 'crm' AND addon_label IS NULL");

  const onboardingCategory = await get("SELECT id FROM categories WHERE name = 'Onboarding'");
  if (!onboardingCategory) {
    await run("INSERT INTO categories (name, icon) VALUES ('Onboarding', 'userCircle')");
  }

  const userCols5 = await all('PRAGMA table_info(users)');
  if (!userCols5.some((c) => c.name === 'role_id')) {
    await run('ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL');
  }
  if (!userCols5.some((c) => c.name === 'failed_login_count')) {
    await run('ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols5.some((c) => c.name === 'locked_until')) {
    await run('ALTER TABLE users ADD COLUMN locked_until TEXT');
  }

  const groupCols4 = await all('PRAGMA table_info(groups)');
  if (!groupCols4.some((c) => c.name === 'display_name')) {
    await run('ALTER TABLE groups ADD COLUMN display_name TEXT');
  }

  const roleCount = await get('SELECT COUNT(*) AS n FROM roles');
  if (roleCount.n === 0) {
    await seedDefaultRoles();
  }

  await run(`CREATE TABLE IF NOT EXISTS asset_assignment_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    signed_at TEXT,
    signed_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_asset_letters_user_id ON asset_assignment_letters(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_asset_letters_asset_id ON asset_assignment_letters(asset_id)');

  const userCols6 = await all('PRAGMA table_info(users)');
  if (!userCols6.some((c) => c.name === 'is_blocked')) {
    await run('ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols6.some((c) => c.name === 'blocked_at')) {
    await run('ALTER TABLE users ADD COLUMN blocked_at TEXT');
  }
  if (!userCols6.some((c) => c.name === 'blocked_reason')) {
    await run('ALTER TABLE users ADD COLUMN blocked_reason TEXT');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked)');

  await run(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    logo TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const groupCols5 = await all('PRAGMA table_info(groups)');
  if (!groupCols5.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE groups ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  const userCols7 = await all('PRAGMA table_info(users)');
  if (!userCols7.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  const groupsTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'groups'");
  if (groupsTable && groupsTable.sql && groupsTable.sql.includes('name TEXT NOT NULL UNIQUE')) {
    await run('PRAGMA foreign_keys = OFF');
    await run(`CREATE TABLE groups_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      sla_response_hours INTEGER,
      sla_resolve_hours INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      work_start_hour INTEGER NOT NULL DEFAULT 9,
      work_end_hour INTEGER NOT NULL DEFAULT 18,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      UNIQUE(name, company_id)
    )`);
    await run(`INSERT INTO groups_new (id, name, parent_id, sla_response_hours, sla_resolve_hours, created_at, work_start_hour, work_end_hour, manager_id, display_name, company_id)
      SELECT id, name, parent_id, sla_response_hours, sla_resolve_hours, created_at, work_start_hour, work_end_hour, manager_id, display_name, company_id FROM groups`);
    await run('DROP TABLE groups');
    await run('ALTER TABLE groups_new RENAME TO groups');
    await run('PRAGMA foreign_keys = ON');
  }

  await run('CREATE INDEX IF NOT EXISTS idx_groups_company_id ON groups(company_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id)');

  await run(`CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clock_in TEXT NOT NULL DEFAULT (datetime('now')),
    clock_out TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in)');

  const ticketCols4 = await all('PRAGMA table_info(tickets)');
  if (!ticketCols4.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE tickets ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON tickets(company_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_tickets_company_id_updated_at ON tickets(company_id, updated_at)');

  const auditLogCols = await all('PRAGMA table_info(audit_log)');
  if (auditLogCols.length && !auditLogCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE audit_log ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_audit_log_company_id ON audit_log(company_id)');

  const automationRuleCols = await all('PRAGMA table_info(automation_rules)');
  if (automationRuleCols.length && !automationRuleCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE automation_rules ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_automation_rules_company_id ON automation_rules(company_id)');

  const assetCols = await all('PRAGMA table_info(assets)');
  if (assetCols.length && !assetCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE assets ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_assets_company_id ON assets(company_id)');

  const roleCols = await all('PRAGMA table_info(roles)');
  if (roleCols.length && !roleCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE roles ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_roles_company_id ON roles(company_id)');

  const categoryCols2 = await all('PRAGMA table_info(categories)');
  if (categoryCols2.length && !categoryCols2.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE categories ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_categories_company_id ON categories(company_id)');

  const customFieldCols = await all('PRAGMA table_info(custom_fields)');
  if (customFieldCols.length && !customFieldCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE custom_fields ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_custom_fields_company_id ON custom_fields(company_id)');

  const cannedResponseCols = await all('PRAGMA table_info(canned_responses)');
  if (cannedResponseCols.length && !cannedResponseCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE canned_responses ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_canned_responses_company_id ON canned_responses(company_id)');

  const ticketTemplateCols = await all('PRAGMA table_info(ticket_templates)');
  if (ticketTemplateCols.length && !ticketTemplateCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE ticket_templates ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_ticket_templates_company_id ON ticket_templates(company_id)');

  const holidaysTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'holidays'");
  if (holidaysTable && holidaysTable.sql && holidaysTable.sql.includes('date TEXT NOT NULL UNIQUE')) {
    await run('PRAGMA foreign_keys = OFF');
    await run(`CREATE TABLE holidays_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      UNIQUE(date, company_id)
    )`);
    await run(`INSERT INTO holidays_new (id, date, name, created_at)
      SELECT id, date, name, created_at FROM holidays`);
    await run('DROP TABLE holidays');
    await run('ALTER TABLE holidays_new RENAME TO holidays');
    await run('PRAGMA foreign_keys = ON');
  }
  const holidayCols = await all('PRAGMA table_info(holidays)');
  if (holidayCols.length && !holidayCols.some((c) => c.name === 'company_id')) {
    await run('ALTER TABLE holidays ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_holidays_company_id ON holidays(company_id)');

  const settingsCols2 = await all('PRAGMA table_info(app_settings)');
  if (!settingsCols2.some((c) => c.name === 'flexible_time_entry')) {
    await run('ALTER TABLE app_settings ADD COLUMN flexible_time_entry INTEGER NOT NULL DEFAULT 1');
  }
  const companyCols = await all('PRAGMA table_info(companies)');
  if (companyCols.length && !companyCols.some((c) => c.name === 'flexible_time_entry')) {
    await run('ALTER TABLE companies ADD COLUMN flexible_time_entry INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsCols2.some((c) => c.name === 'flexible_time_entry_defaulted')) {
    await run('ALTER TABLE app_settings ADD COLUMN flexible_time_entry_defaulted INTEGER NOT NULL DEFAULT 0');
    await run('UPDATE app_settings SET flexible_time_entry = 1, flexible_time_entry_defaulted = 1 WHERE id = 1');
    await run('UPDATE companies SET flexible_time_entry = 1');
  }
}

async function seedDefaultCompany() {
  const anyUser = await get('SELECT id FROM users LIMIT 1');
  if (!anyUser) return;

  let defaultCompany = await get('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
  if (!defaultCompany) {
    const settingsRow = await get('SELECT org_name, org_logo FROM app_settings WHERE id = 1');
    const info = await run('INSERT INTO companies (name, display_name, logo) VALUES (?, ?, ?)', [
      'Azienda principale',
      (settingsRow && settingsRow.org_name) || null,
      (settingsRow && settingsRow.org_logo) || null,
    ]);
    defaultCompany = { id: Number(info.lastInsertRowid) };
  }
  await run('UPDATE users SET company_id = ? WHERE company_id IS NULL', [defaultCompany.id]);
  await run('UPDATE groups SET company_id = ? WHERE company_id IS NULL', [defaultCompany.id]);
  await run(`UPDATE tickets SET company_id = (
    SELECT company_id FROM users WHERE users.id = tickets.created_by
  ) WHERE company_id IS NULL`);
  await run(`UPDATE audit_log SET company_id = (
    SELECT company_id FROM users WHERE users.id = audit_log.actor_id
  ) WHERE company_id IS NULL AND actor_id IS NOT NULL`);
  await run(`UPDATE automation_rules SET company_id = (
    SELECT g.company_id FROM groups g WHERE g.id = COALESCE(automation_rules.cond_group_id, automation_rules.action_assign_group_id)
  ) WHERE company_id IS NULL AND (cond_group_id IS NOT NULL OR action_assign_group_id IS NOT NULL)`);
  await run(`UPDATE assets SET company_id = (
    SELECT company_id FROM users WHERE users.id = assets.assigned_to
  ) WHERE company_id IS NULL AND assigned_to IS NOT NULL`);
  await run(`UPDATE canned_responses SET company_id = (
    SELECT company_id FROM users WHERE users.id = canned_responses.created_by
  ) WHERE company_id IS NULL AND created_by IS NOT NULL`);
  await run(`UPDATE ticket_templates SET company_id = (
    SELECT company_id FROM users WHERE users.id = ticket_templates.created_by
  ) WHERE company_id IS NULL AND created_by IS NOT NULL`);
}

async function seedDefaultRoles() {
  const defaultRoles = [
    {
      key: 'supervisor', color: '#1868a8', readOnly: false,
      labelIt: 'Supervisore', labelEn: 'Supervisor',
      permissions: ['reports_view', 'automations_manage'],
    },
    {
      key: 'asset_manager', color: '#2e7d32', readOnly: false,
      labelIt: 'Gestore Risorse', labelEn: 'Asset Manager',
      permissions: ['assets_delete'],
    },
    {
      key: 'content_manager', color: '#b9822c', readOnly: false,
      labelIt: 'Gestore Contenuti', labelEn: 'Content Manager',
      permissions: ['canned_responses_manage', 'templates_manage'],
    },
    {
      key: 'onboarding_lead', color: '#6b5a8f', readOnly: false,
      labelIt: 'Responsabile Onboarding', labelEn: 'Onboarding Lead',
      permissions: ['onboarding_catalog_manage'],
    },
    {
      key: 'auditor', color: '#8a7565', readOnly: true,
      labelIt: 'Auditor (sola lettura)', labelEn: 'Auditor (read-only)',
      permissions: ['audit_view', 'reports_view'],
    },
  ];
  for (const role of defaultRoles) {
    await run(
      'INSERT INTO roles (key, label_it, label_en, color, read_only, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [role.key, role.labelIt, role.labelEn, role.color, role.readOnly ? 1 : 0, JSON.stringify(role.permissions)]
    );
  }
}

async function seedOnboardingItemTypes() {
  const groupIdByName = {};
  (await all('SELECT id, name FROM groups')).forEach((g) => { groupIdByName[g.name] = g.id; });
  const g = (name) => groupIdByName[name] || null;

  const mailboxLicenses = JSON.stringify(['Nessuna', 'E5', 'F3', 'F3_1']);

  const items = [
    ['active_directory', 'Active Directory', 'Active Directory', 'checkbox', null, g('Security'), null, null],
    ['mailbox', 'Mailbox', 'Mailbox', 'license', null, g('Service Desk'), mailboxLicenses, null],
    ['vpn', 'VPN', 'VPN', 'checkbox', null, g('Network'), null, null],
    ['jde', 'JDE', 'JDE', 'copy_user', null, g('Service Desk'), null, null],
    ['crm', 'CRM', 'CRM', 'copy_user', null, g('Service Desk'), null, 'Dynamics'],
    ['business_object', 'Business Object', 'Business Object', 'copy_user', null, g('Service Desk'), null, null],
    ['faberwam', 'FaberWAM', 'FaberWAM', 'copy_user', null, g('Service Desk'), null, null],
    ['dam', 'DAM', 'DAM', 'copy_user', null, g('Service Desk'), null, null],
    ['laptop', 'Laptop', 'Laptop', 'asset', 'laptop', g('Endpoint'), null, null],
    ['smartphone', 'Smartphone', 'Smartphone', 'asset', 'telefono', g('Endpoint'), null, null],
    ['tablet', 'Tablet', 'Tablet', 'asset', 'tablet', g('Endpoint'), null, null],
  ];
  for (let i = 0; i < items.length; i += 1) {
    const [key, labelIt, labelEn, kind, assetType, groupId, licenseOptions, addonLabel] = items[i];
    await run(
      'INSERT INTO onboarding_item_types (item_key, label_it, label_en, kind, asset_type, default_group_id, position, license_options, addon_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [key, labelIt, labelEn, kind, assetType, groupId, i, licenseOptions, addonLabel]
    );
  }
}

async function seedDefaultGroups() {
  const row = await get('SELECT COUNT(*) AS n FROM groups');
  if (row.n > 0) return;

  const itInfo = await run('INSERT INTO groups (name) VALUES (?)', ['IT']);
  const itId = Number(itInfo.lastInsertRowid);

  const defaults = [
    ['Service Desk', 4, 24],
    ['Presidio', 8, 48],
    ['Endpoint', 4, 24],
    ['Network', 2, 16],
    ['Security', 1, 8],
  ];
  for (const [name, responseHours, resolveHours] of defaults) {
    await run('INSERT INTO groups (name, parent_id, sla_response_hours, sla_resolve_hours) VALUES (?, ?, ?, ?)', [name, itId, responseHours, resolveHours]);
  }
}

async function seedExpandedCategories() {
  const groupIdByName = {};
  (await all('SELECT id, name FROM groups')).forEach((g) => { groupIdByName[g.name] = g.id; });

  const tree = [
    { name: 'Hardware', icon: 'monitor', children: [
      { name: 'Laptop', icon: 'laptop', group: 'Endpoint' },
      { name: 'Desktop', icon: 'monitor', group: 'Endpoint' },
      { name: 'Monitor', icon: 'monitor', group: 'Endpoint' },
      { name: 'Smartphone', icon: 'phone', group: 'Endpoint' },
      { name: 'Tablet', icon: 'tablet', group: 'Endpoint' },
      { name: 'Stampante', icon: 'printer', group: 'Endpoint' },
      { name: 'Periferiche (mouse, tastiera, cuffie)', icon: 'grid', group: 'Endpoint' },
    ] },
    { name: 'Software', icon: 'globe', children: [
      { name: 'Sistema operativo', icon: 'monitor', group: 'Endpoint' },
      { name: 'Applicativi aziendali', icon: 'grid', group: 'Service Desk' },
      { name: 'Browser', icon: 'globe', group: 'Service Desk' },
      { name: 'Licenze software', icon: 'lock', group: 'Service Desk' },
      { name: 'Email e posta elettronica', icon: 'mail', group: 'Service Desk' },
    ] },
    { name: 'Rete', icon: 'wifi', children: [
      { name: 'Wi-Fi', icon: 'wifi', group: 'Network' },
      { name: 'VPN', icon: 'shield', group: 'Network' },
      { name: 'Cablaggio di rete', icon: 'server', group: 'Network' },
      { name: 'Telefonia aziendale', icon: 'phone', group: 'Network' },
      { name: 'Router', icon: 'wifi', group: 'Network' },
      { name: 'Access point wireless', icon: 'wifi', group: 'Network' },
      { name: 'Storage (NAS/SAN)', icon: 'server', group: 'Network' },
      { name: 'Switch di storage', icon: 'server', group: 'Network' },
    ] },
    { name: 'Account e accessi', icon: 'lock', children: [
      { name: 'Reset password', icon: 'lock', group: 'Service Desk' },
      { name: 'Nuovo account', icon: 'users', group: 'Service Desk' },
      { name: 'Permessi e ruoli', icon: 'shield', group: 'Security' },
      { name: 'Accesso a sistemi esterni', icon: 'globe', group: 'Security' },
    ] },
    { name: 'Ufficio e Facility', icon: 'package', children: [
      { name: 'Arredamento (mobili, scrivanie, sedie)', icon: 'package', group: 'Facility Management' },
      { name: 'Cablaggio e impianti elettrici', icon: 'bulb', group: 'Facility Management' },
      { name: 'Illuminazione', icon: 'bulb', group: 'Facility Management' },
      { name: 'Climatizzazione', icon: 'refresh', group: 'Facility Management' },
      { name: 'Sicurezza antincendio (estintori)', icon: 'flame', group: 'Facility Management' },
      { name: 'Controllo accessi e badge', icon: 'lock', group: 'Facility Management' },
      { name: 'Pulizie e manutenzione', icon: 'check', group: 'Facility Management' },
    ] },
    { name: 'Marketing e Comunicazione', icon: 'megaphone', children: [
      { name: 'Materiali promozionali e stampe', icon: 'printer', group: 'Marketing e Comunicazione' },
      { name: 'Eventi e fiere', icon: 'users', group: 'Marketing e Comunicazione' },
      { name: 'Sito web e social media', icon: 'globe', group: 'Marketing e Comunicazione' },
      { name: 'Gadget aziendali', icon: 'package', group: 'Marketing e Comunicazione' },
    ] },
    { name: 'Fornitori e Acquisti', icon: 'truck', children: [
      { name: 'Nuovo fornitore', icon: 'users', group: 'Acquisti e Fornitori' },
      { name: 'Ordini e materiale di consumo', icon: 'package', group: 'Acquisti e Fornitori' },
      { name: 'Contratti e fatturazione', icon: 'mail', group: 'Acquisti e Fornitori' },
      { name: 'Spedizioni e logistica', icon: 'truck', group: 'Acquisti e Fornitori' },
    ] },
    { name: 'Applicativi e Servizi Aziendali', icon: 'grid', children: [
      { name: 'CRM', icon: 'users', group: 'Service Desk' },
      { name: 'ERP', icon: 'server', group: 'Service Desk' },
      { name: 'Business Intelligence', icon: 'activity', group: 'Service Desk' },
      { name: 'Fatturazione e abbonamenti', icon: 'mail', group: 'Service Desk' },
      { name: 'Produttività (Outlook, Teams, Excel, OneDrive, SharePoint)', icon: 'mail', group: 'Service Desk' },
      { name: 'Assistenza remota', icon: 'monitor', group: 'Service Desk' },
      { name: 'Progettazione e sviluppo', icon: 'laptop', group: 'Service Desk' },
      { name: 'Riproduzione media', icon: 'monitor', group: 'Service Desk' },
      { name: 'Sicurezza informatica (antivirus, SSO, WAF)', icon: 'shield', group: 'Security' },
      { name: 'Marketing digitale', icon: 'megaphone', group: 'Marketing e Comunicazione' },
      { name: 'Traduzioni', icon: 'globe', group: 'Service Desk' },
      { name: 'Fiscale e compliance', icon: 'check', group: 'Service Desk' },
      { name: 'Logistica e spedizioni', icon: 'truck', group: 'Acquisti e Fornitori' },
      { name: 'Prevenzione frodi', icon: 'shield', group: 'Security' },
      { name: 'Gestione documentale', icon: 'file', group: 'Service Desk' },
    ] },
    { name: 'Altro', icon: 'ticket', children: [] },
  ];

  for (const macro of tree) {
    const macroRow = await get('SELECT id FROM categories WHERE name = ?', [macro.name]);
    let macroId = macroRow ? macroRow.id : null;
    if (!macroId) {
      const info = await run('INSERT INTO categories (name, icon) VALUES (?, ?)', [macro.name, macro.icon]);
      macroId = Number(info.lastInsertRowid);
    }
    for (const sub of macro.children) {
      const existing = await get('SELECT id FROM categories WHERE name = ?', [sub.name]);
      if (existing) continue;
      await run('INSERT INTO categories (name, icon, parent_id, default_group_id) VALUES (?, ?, ?, ?)', [
        sub.name, sub.icon, macroId, groupIdByName[sub.group] || null,
      ]);
    }
  }
}

async function seedDefaultAdmin() {
  const row = await get('SELECT COUNT(*) AS n FROM users');
  if (row.n > 0) return;

  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@ticketing.local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
  const hash = bcrypt.hashSync(password, 10);

  await run('INSERT INTO users (name, email, password, role, is_super_admin) VALUES (?, ?, ?, ?, 1)', [
    'Amministratore',
    email,
    hash,
    'admin',
  ]);

  console.log('======================================================');
  console.log('Nessun utente trovato: creato account amministratore predefinito');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('Cambia la password dopo il primo accesso.');
  console.log('======================================================');
}

async function seedAppSettings() {
  const row = await get('SELECT id FROM app_settings WHERE id = 1');
  if (!row) {
    await run('INSERT INTO app_settings (id, org_name) VALUES (1, ?)', ['Ticketing']);
  }
}

async function seedDefaultAssets() {
  const row = await get('SELECT COUNT(*) AS n FROM assets');
  if (row.n > 0) return;

  const items = [
    ['Laptop Dell Latitude 5440', 'laptop', 'ITA-LT-0001'],
    ['Laptop Dell Latitude 5440', 'laptop', 'ITA-LT-0002'],
    ['Laptop Dell Latitude 5440', 'laptop', 'ITA-LT-0003'],
    ['Laptop Lenovo ThinkPad T14', 'laptop', 'ITA-LT-0004'],
    ['Laptop Lenovo ThinkPad T14', 'laptop', 'ITA-LT-0005'],
    ['MacBook Pro 14"', 'laptop', 'ITA-LT-0006'],
    ['MacBook Air 13"', 'laptop', 'ITA-LT-0007'],
    ['Desktop HP EliteDesk 800', 'desktop', 'ITA-DT-0001'],
    ['Desktop HP EliteDesk 800', 'desktop', 'ITA-DT-0002'],
    ['Desktop Dell OptiPlex 7010', 'desktop', 'ITA-DT-0003'],
    ['Workstation Dell Precision 3660', 'desktop', 'ITA-DT-0004'],
    ['Monitor Dell UltraSharp 24"', 'monitor', 'ITA-MN-0001'],
    ['Monitor Dell UltraSharp 24"', 'monitor', 'ITA-MN-0002'],
    ['Monitor Dell UltraSharp 27"', 'monitor', 'ITA-MN-0003'],
    ['Monitor LG 27" 4K', 'monitor', 'ITA-MN-0004'],
    ['Monitor LG 27" 4K', 'monitor', 'ITA-MN-0005'],
    ['iPhone 14', 'telefono', 'ITA-PH-0001'],
    ['iPhone 14', 'telefono', 'ITA-PH-0002'],
    ['iPhone 15 Pro', 'telefono', 'ITA-PH-0003'],
    ['Samsung Galaxy S23', 'telefono', 'ITA-PH-0004'],
    ['Samsung Galaxy A54', 'telefono', 'ITA-PH-0005'],
    ['Stampante multifunzione HP LaserJet', 'altro', 'ITA-PR-0001'],
    ['Stampante multifunzione Canon', 'altro', 'ITA-PR-0002'],
    ['Router Wi-Fi Ubiquiti UniFi', 'altro', 'ITA-NW-0001'],
    ['Switch di rete Cisco 24 porte', 'altro', 'ITA-NW-0002'],
    ['Webcam Logitech Brio', 'altro', 'ITA-AC-0001'],
    ['Cuffie Jabra Evolve2', 'altro', 'ITA-AC-0002'],
    ['Docking station Dell WD19', 'altro', 'ITA-AC-0003'],
    ['Tablet iPad Air', 'altro', 'ITA-TB-0001'],
    ['Proiettore Epson sala riunioni', 'altro', 'ITA-AC-0004'],
  ];

  for (let i = 0; i < items.length; i += 1) {
    const [name, assetType, tag] = items[i];
    const status = i % 11 === 0 ? 'in_riparazione' : i % 5 === 3 ? 'in_uso' : 'disponibile';
    await run('INSERT INTO assets (name, asset_type, tag, status, assignment_type) VALUES (?, ?, ?, ?, ?)', [
      name, assetType, tag, status, 'permanente',
    ]);
  }
}

async function seedDefaultTags() {
  const row = await get('SELECT COUNT(*) AS n FROM tags');
  if (row.n > 0) return;

  const tags = [
    'urgente', 'hardware', 'software', 'rete', 'sicurezza', 'vip',
    'recidivo', 'in-attesa-fornitore', 'da-verificare', 'escalation',
    'cambio-standard', 'post-implementazione', 'formazione', 'bug', 'accesso-remoto',
  ];
  for (const name of tags) {
    await run('INSERT INTO tags (name) VALUES (?)', [name]);
  }
}

async function seedDefaultCannedResponses(adminId) {
  const row = await get('SELECT COUNT(*) AS n FROM canned_responses');
  if (row.n > 0) return;

  const items = [
    ['Presa in carico', 'Gentile utente,\n\nla ringraziamo per la segnalazione. Il ticket è stato preso in carico dal nostro team e verrà gestito con la massima priorità possibile.\n\nCordiali saluti'],
    ['Richiesta informazioni aggiuntive', 'Gentile utente,\n\nper poter procedere con la risoluzione avremmo bisogno di alcune informazioni aggiuntive. Potrebbe fornirci maggiori dettagli sul problema riscontrato (es. screenshot, orario, dispositivo utilizzato)?\n\nGrazie per la collaborazione.'],
    ['Risoluzione: riavvio del dispositivo', "Gentile utente,\n\nla invitiamo a riavviare il dispositivo e verificare se il problema persiste. In molti casi questa operazione risolve l'anomalia segnalata.\n\nResto a disposizione."],
    ['Password reimpostata', 'Gentile utente,\n\nabbiamo reimpostato la password come richiesto. Le invieremo le nuove credenziali tramite canale sicuro. La invitiamo a modificarla al primo accesso.\n\nCordiali saluti'],
    ['Ticket risolto - richiesta conferma', 'Gentile utente,\n\nil problema segnalato è stato risolto. La invitiamo a verificare e confermarci l\'esito, in modo da poter chiudere il ticket.\n\nGrazie'],
    ['Escalation a livello 2', "Il ticket è stato inoltrato al team specialistico di secondo livello per un'analisi più approfondita. Verrà aggiornato non appena disponibili nuove informazioni."],
    ['In attesa di componente', "Gentile utente,\n\nla richiesta necessita di un componente/materiale non attualmente disponibile a magazzino. Abbiamo attivato l'ordine e la aggiorneremo non appena ricevuto.\n\nCi scusiamo per l'attesa."],
    ['Accesso VPN concesso', "Gentile utente,\n\nl'accesso VPN richiesto è stato configurato e attivato sul suo account. Troverà le istruzioni di connessione nella email dedicata.\n\nCordiali saluti"],
    ['Chiusura per inattività', 'Il ticket viene chiuso per assenza di riscontro da parte dell\'utente. Qualora il problema dovesse ripresentarsi, la invitiamo ad aprire una nuova segnalazione o a riaprire questo ticket.'],
    ['Segnalazione duplicata', 'Gentile utente,\n\nabbiamo rilevato che questa segnalazione risulta duplicata rispetto a un ticket già aperto. Procederemo con la gestione unificata sul ticket originale.\n\nGrazie per la comprensione.'],
  ];
  for (const [title, body] of items) {
    await run('INSERT INTO canned_responses (title, body, created_by) VALUES (?, ?, ?)', [title, body, adminId]);
  }
}

async function seedDefaultTicketTemplates(adminId) {
  const row = await get('SELECT COUNT(*) AS n FROM ticket_templates');
  if (row.n > 0) return;

  const items = [
    ['Nuovo dipendente - postazione completa', 'Nuovo account', 'Onboarding nuovo dipendente', 'Richiesta configurazione completa postazione di lavoro per nuovo assunto: account, PC, accessori, accessi software.', 'medium', 'task'],
    ['Guasto laptop', 'Laptop', 'Laptop non si accende', 'Il laptop aziendale non si accende / non risponde. Descrivere eventuali segnali (led, ventole, rumori) e da quando si verifica il problema.', 'high', 'incident'],
    ['Problema connessione Wi-Fi', 'Wi-Fi', 'Impossibile connettersi alla rete Wi-Fi aziendale', 'Il dispositivo non riesce a connettersi o si disconnette frequentemente dalla rete Wi-Fi aziendale.', 'medium', 'incident'],
    ['Richiesta VPN', 'VPN', 'Attivazione accesso VPN', 'Richiesta di attivazione/configurazione accesso VPN per lavoro da remoto.', 'medium', 'task'],
    ['Reset password account', 'Reset password', 'Impossibile accedere - password dimenticata', 'Richiesta di reimpostazione password per impossibilità di accesso all\'account aziendale.', 'high', 'incident'],
    ['Richiesta nuovo software', 'Licenze software', 'Richiesta installazione/licenza software', 'Richiesta di installazione o acquisto licenza per un nuovo software necessario per l\'attività lavorativa.', 'low', 'task'],
    ['Stampante non funzionante', 'Periferiche (mouse, tastiera, cuffie)', 'Stampante non stampa / errore', 'La stampante di reparto non stampa correttamente o segnala un errore. Indicare modello e messaggio di errore.', 'medium', 'incident'],
    ['Richiesta nuovo monitor', 'Monitor', 'Richiesta assegnazione monitor aggiuntivo', 'Richiesta di assegnazione di un monitor aggiuntivo per la postazione di lavoro.', 'low', 'task'],
    ['Segnalazione problema email', 'Email e posta elettronica', 'Problemi di invio/ricezione email', 'Impossibile inviare o ricevere email dall\'account aziendale. Specificare client utilizzato (webmail, Outlook, app mobile).', 'high', 'incident'],
    ['Richiesta accesso a sistema esterno', 'Accesso a sistemi esterni', 'Richiesta credenziali per portale/sistema esterno', 'Richiesta di attivazione accesso a un sistema o portale esterno necessario per l\'attività lavorativa.', 'medium', 'task'],
  ];
  for (let i = 0; i < items.length; i += 1) {
    const [name, category, subject, description, priority, type] = items[i];
    await run(
      'INSERT INTO ticket_templates (name, category, subject, description, priority, type, position, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, category, subject, description, priority, type, i, adminId]
    );
  }
}

async function seedDefaultHolidays() {
  const row = await get('SELECT COUNT(*) AS n FROM holidays');
  if (row.n > 0) return;

  const items = [
    ['2026-01-01', 'Capodanno'],
    ['2026-01-06', 'Epifania'],
    ['2026-04-05', 'Pasqua'],
    ['2026-04-06', "Lunedì dell'Angelo"],
    ['2026-04-25', 'Festa della Liberazione'],
    ['2026-05-01', 'Festa dei Lavoratori'],
    ['2026-06-02', 'Festa della Repubblica'],
    ['2026-08-15', 'Ferragosto'],
    ['2026-11-01', 'Ognissanti'],
    ['2026-12-08', 'Immacolata Concezione'],
    ['2026-12-25', 'Natale'],
    ['2026-12-26', 'Santo Stefano'],
    ['2027-01-01', 'Capodanno'],
    ['2027-01-06', 'Epifania'],
  ];
  for (const [date, name] of items) {
    await run('INSERT INTO holidays (date, name) VALUES (?, ?)', [date, name]);
  }
}

async function seedDefaultContent() {
  const admin = await get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  const adminId = admin ? admin.id : null;
  await seedDefaultAssets();
  await seedDefaultTags();
  await seedDefaultCannedResponses(adminId);
  await seedDefaultTicketTemplates(adminId);
  await seedDefaultHolidays();
}

async function initDb() {
  if (usingTurso) {
    try {
      await client.sync();
    } catch (err) {
      console.error('Sincronizzazione iniziale della replica locale fallita, riprovo alla prossima query:', err.message);
    }
  }
  await setupSchema();
  await migrate();
  await seedDefaultAdmin();
  await seedAppSettings();
  await seedDefaultCompany();
  await seedDefaultContent();
  console.log(usingTurso ? 'Database: Turso con replica locale embedded' : `Database: file locale (${url})`);
}

module.exports = { client, run, get, all, initDb, usingTurso };
