require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./db/database');
const { initRealtime } = require('./realtime');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);

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
    console.warn('ATTENZIONE: JWT_SECRET non impostato in produzione, viene usato un valore di default non sicuro.');
  }
  await db.initDb();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Piattaforma di ticketing in ascolto su http://0.0.0.0:${PORT}`);
    console.log('Raggiungibile da qualsiasi dispositivo sulla stessa rete tramite l\'IP di questa macchina.');
  });
}

main().catch((err) => {
  console.error('Avvio del server fallito:', err);
  process.exit(1);
});
