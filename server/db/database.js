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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
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
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        asset_tag TEXT,
        type TEXT NOT NULL DEFAULT 'altro' CHECK (type IN ('laptop', 'desktop', 'telefono', 'tablet', 'altro')),
        os TEXT,
        serial_number TEXT,
        status TEXT NOT NULL DEFAULT 'in_uso' CHECK (status IN ('in_uso', 'in_magazzino', 'in_riparazione', 'dismesso')),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_ticket_id ON ticket_events(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_devices_assigned_to ON devices(assigned_to)',
    ],
    'write'
  );
}

async function migrate() {
  const commentCols = await all('PRAGMA table_info(comments)');
  if (!commentCols.some((c) => c.name === 'is_internal')) {
    await run('ALTER TABLE comments ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0');
  }

  const userCols = await all('PRAGMA table_info(users)');
  if (!userCols.some((c) => c.name === 'group_id')) {
    await run('ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
  }
  if (!userCols.some((c) => c.name === 'job_title')) {
    await run("ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT ''");
  }
  if (!userCols.some((c) => c.name === 'manager_id')) {
    await run('ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }

  const ticketCols = await all('PRAGMA table_info(tickets)');
  if (!ticketCols.some((c) => c.name === 'device_id')) {
    await run('ALTER TABLE tickets ADD COLUMN device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL');
  }
}

async function seedDefaultCategories() {
  const row = await get('SELECT COUNT(*) AS n FROM categories');
  if (row.n > 0) return;
  const defaults = ['Hardware', 'Software', 'Rete', 'Account e accessi', 'Altro'];
  for (const name of defaults) {
    await run('INSERT INTO categories (name) VALUES (?)', [name]);
  }
}

async function seedDefaultAdmin() {
  const row = await get('SELECT COUNT(*) AS n FROM users');
  if (row.n > 0) return;

  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@ticketing.local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
  const hash = bcrypt.hashSync(password, 10);

  await run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
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

async function initDb() {
  await setupSchema();
  await migrate();
  await seedDefaultCategories();
  await seedDefaultAdmin();
  console.log(usingTurso ? 'Database: Turso (persistente)' : `Database: file locale (${url})`);
}

module.exports = { client, run, get, all, initDb, usingTurso };
