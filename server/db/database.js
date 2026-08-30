const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

const usingTurso = Boolean(process.env.TURSO_DATABASE_URL);

let url = process.env.TURSO_DATABASE_URL;
if (!usingTurso) {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  url = `file:${path.join(dataDir, 'ticketing.db')}`;
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run(sql, args = []) {
  return client.execute({ sql, args });
}

async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

async function all(sql, args = []) {
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
    ],
    'write'
  );
}

async function migrate() {
  const groupCols = await all('PRAGMA table_info(groups)');
  if (groupCols.length && !groupCols.some((c) => c.name === 'parent_id')) {
    await run('ALTER TABLE groups ADD COLUMN parent_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
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
    await run('ALTER TABLE tickets RENAME TO tickets_old');
    await run(`CREATE TABLE tickets (
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
    await run(`INSERT INTO tickets (id, subject, description, status, priority, type, category, created_by, assigned_to, created_at, updated_at, group_id, resolved_at, asset_id, waiting_since, sla_paused_ms)
      SELECT id, subject, description, status, priority, type, category, created_by, assigned_to, created_at, updated_at, group_id, resolved_at, asset_id, waiting_since, sla_paused_ms FROM tickets_old`);
    await run('DROP TABLE tickets_old');
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

async function initDb() {
  await setupSchema();
  await migrate();
  await seedDefaultAdmin();
  await seedAppSettings();
  console.log(usingTurso ? 'Database: Turso (persistente)' : `Database: file locale (${url})`);
}

module.exports = { client, run, get, all, initDb, usingTurso };
