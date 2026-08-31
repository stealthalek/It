const fs = require('fs');
const path = require('path');
const db = require('../db/database');

async function backupDb() {
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  const dump = {};
  for (const { name } of tables) {
    dump[name] = await db.all(`SELECT * FROM ${name}`);
  }

  const outDir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `backup-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2));

  const rowCount = Object.values(dump).reduce((sum, rows) => sum + rows.length, 0);
  console.log(`Backup scritto in ${outFile} (${tables.length} tabelle, ${rowCount} righe totali)`);
}

backupDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backup fallito:', err);
    process.exit(1);
  });
