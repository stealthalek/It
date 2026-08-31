require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const db = require('./db/database');
const { initRealtime } = require('./realtime');
const { startAutoCloseScheduler } = require('./scheduler');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const groupRoutes = require('./routes/groups');
const assetRoutes = require('./routes/assets');
const settingsRoutes = require('./routes/settings');
const notificationRoutes = require('./routes/notifications');
const auditRoutes = require('./routes/audit');
const automationRoutes = require('./routes/automations');
const customFieldRoutes = require('./routes/custom-fields');
const cannedResponseRoutes = require('./routes/canned-responses');
const tagRoutes = require('./routes/tags');
const ticketTemplateRoutes = require('./routes/ticket-templates');
const holidayRoutes = require('./routes/holidays');
const onboardingRoutes = require('./routes/onboarding');
const roleRoutes = require('./routes/roles');
const adminStatusRoutes = require('./routes/admin-status');
const assetLetterRoutes = require('./routes/asset-letters');
const { loadHolidays } = require('./sla');
const { recordRequest } = require('./lib/requestStats');

process.on('unhandledRejection', (reason) => {
  console.error('Rejection non gestita:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Eccezione non gestita:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '80mb' }));

app.use('/api', (req, res, next) => {
  recordRequest();
  next();
});

function apiLimiterKey(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.decode(token);
      if (payload && payload.sub) return `user:${payload.sub}`;
    } catch {}
  }
  return rateLimit.ipKeyGenerator(req.ip);
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiLimiterKey,
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/canned-responses', cannedResponseRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/ticket-templates', ticketTemplateRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/admin/status', adminStatusRoutes);
app.use('/api/asset-letters', assetLetterRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Risorsa non trovata' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const httpServer = http.createServer(app);
initRealtime(httpServer);

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('JWT_SECRET non impostato in produzione: avvio bloccato per sicurezza. Imposta la variabile d\'ambiente JWT_SECRET.');
    process.exit(1);
  }
  await db.initDb();
  await loadHolidays();
  startAutoCloseScheduler();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Piattaforma di ticketing in ascolto su http://0.0.0.0:${PORT}`);
    console.log('Raggiungibile da qualsiasi dispositivo sulla stessa rete tramite l\'IP di questa macchina.');
  });
}

main().catch((err) => {
  console.error('Avvio del server fallito:', err);
  process.exit(1);
});
