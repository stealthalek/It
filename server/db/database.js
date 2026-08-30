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
  if (!ticketCols3.some((c) => c.name === 'first_response_at')) {
    await run('ALTER TABLE tickets ADD COLUMN first_response_at TEXT');
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

async function seedDefaultAssets() {
  const row = await get('SELECT COUNT(*) AS n FROM assets');
  if (row.n > 0) return;

  const items = [
    ['Laptop Dell Latitude 5440', 'laptop', 'IT-LT-0001'],
    ['Laptop Dell Latitude 5440', 'laptop', 'IT-LT-0002'],
    ['Laptop Dell Latitude 5440', 'laptop', 'IT-LT-0003'],
    ['Laptop Lenovo ThinkPad T14', 'laptop', 'IT-LT-0004'],
    ['Laptop Lenovo ThinkPad T14', 'laptop', 'IT-LT-0005'],
    ['MacBook Pro 14"', 'laptop', 'IT-LT-0006'],
    ['MacBook Air 13"', 'laptop', 'IT-LT-0007'],
    ['Desktop HP EliteDesk 800', 'desktop', 'IT-DT-0001'],
    ['Desktop HP EliteDesk 800', 'desktop', 'IT-DT-0002'],
    ['Desktop Dell OptiPlex 7010', 'desktop', 'IT-DT-0003'],
    ['Workstation Dell Precision 3660', 'desktop', 'IT-DT-0004'],
    ['Monitor Dell UltraSharp 24"', 'monitor', 'IT-MN-0001'],
    ['Monitor Dell UltraSharp 24"', 'monitor', 'IT-MN-0002'],
    ['Monitor Dell UltraSharp 27"', 'monitor', 'IT-MN-0003'],
    ['Monitor LG 27" 4K', 'monitor', 'IT-MN-0004'],
    ['Monitor LG 27" 4K', 'monitor', 'IT-MN-0005'],
    ['iPhone 14', 'telefono', 'IT-PH-0001'],
    ['iPhone 14', 'telefono', 'IT-PH-0002'],
    ['iPhone 15 Pro', 'telefono', 'IT-PH-0003'],
    ['Samsung Galaxy S23', 'telefono', 'IT-PH-0004'],
    ['Samsung Galaxy A54', 'telefono', 'IT-PH-0005'],
    ['Stampante multifunzione HP LaserJet', 'altro', 'IT-PR-0001'],
    ['Stampante multifunzione Canon', 'altro', 'IT-PR-0002'],
    ['Router Wi-Fi Ubiquiti UniFi', 'altro', 'IT-NW-0001'],
    ['Switch di rete Cisco 24 porte', 'altro', 'IT-NW-0002'],
    ['Webcam Logitech Brio', 'altro', 'IT-AC-0001'],
    ['Cuffie Jabra Evolve2', 'altro', 'IT-AC-0002'],
    ['Docking station Dell WD19', 'altro', 'IT-AC-0003'],
    ['Tablet iPad Air', 'altro', 'IT-TB-0001'],
    ['Proiettore Epson sala riunioni', 'altro', 'IT-AC-0004'],
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
  await setupSchema();
  await migrate();
  await seedDefaultAdmin();
  await seedAppSettings();
  await seedDefaultContent();
  console.log(usingTurso ? 'Database: Turso (persistente)' : `Database: file locale (${url})`);
}

module.exports = { client, run, get, all, initDb, usingTurso };
