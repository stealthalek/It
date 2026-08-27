require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./db/database');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

async function main() {
  await db.initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Piattaforma di ticketing in ascolto su http://0.0.0.0:${PORT}`);
    console.log('Raggiungibile da qualsiasi dispositivo sulla stessa rete tramite l\'IP di questa macchina.');
  });
}

main().catch((err) => {
  console.error('Avvio del server fallito:', err);
  process.exit(1);
});
