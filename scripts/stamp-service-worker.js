const fs = require('fs');
const path = require('path');

const commitRef = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || String(Date.now());
const swPath = path.join(__dirname, '..', 'dist', 'service-worker.js');
const content = fs.readFileSync(swPath, 'utf8');
const stamped = content.replace(/const CACHE_NAME = '.*';/, `const CACHE_NAME = 'ticketing-static-${commitRef.slice(0, 12)}';`);
fs.writeFileSync(swPath, stamped);
