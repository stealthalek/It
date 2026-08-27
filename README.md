# It — Piattaforma di Ticketing

Piattaforma di ticketing full-stack e realmente funzionante: gestione di richieste di assistenza con autenticazione, ruoli, stati, priorità e conversazioni sui ticket. L'interfaccia è **responsive** (mobile-first) e installabile come app (PWA), quindi utilizzabile da PC, tablet e smartphone tramite browser, sulla stessa rete o pubblicata online.

## Stack tecnico

- **Backend:** Node.js + Express, REST API con autenticazione JWT
- **Database:** SQLite (`better-sqlite3`), file locale in `data/ticketing.db` — zero configurazione
- **Frontend:** SPA in JavaScript vanilla, nessun build step, CSS responsive
- **PWA:** manifest + service worker per installazione e cache degli asset statici

## Funzionalità

- Registrazione e login (JWT), tre ruoli: `customer` (cliente), `agent` (agente), `admin`
- Creazione, consultazione, modifica, riapertura e chiusura dei ticket
- Stati (`aperto`, `in lavorazione`, `risolto`, `chiuso`) e priorità (`bassa`…`urgente`)
- Assegnazione dei ticket agli agenti, filtri per stato/priorità/assegnatario, ricerca testuale
- Dashboard con contatori in tempo reale (aperti, in lavorazione, risolti, urgenti)
- Conversazione a commenti su ogni ticket, con **note interne** visibili solo allo staff
- Il cliente può riaprire un ticket risolto/chiuso se il problema persiste
- Pannello amministrativo per la gestione dei ruoli utente e per creare direttamente account staff (agenti/admin) con password temporanea
- Profilo personale con cambio password
- Interfaccia responsive con tema chiaro/scuro automatico: utilizzabile da smartphone, tablet e desktop

## Avvio rapido (locale)

Requisiti: Node.js ≥ 18.

```bash
npm install
cp .env.example .env   # opzionale: personalizza JWT_SECRET e credenziali admin
npm start
```

Il server si mette in ascolto su `http://0.0.0.0:3000`, quindi è raggiungibile:

- dallo stesso computer: `http://localhost:3000`
- da **qualsiasi altro dispositivo sulla stessa rete** (telefono, tablet, altro PC): `http://<IP-del-computer>:3000` (trova l'IP con `ip addr` / `ifconfig` su Linux/Mac o `ipconfig` su Windows)

Al primo avvio, se non esistono utenti, viene creato automaticamente un account amministratore. Le credenziali vengono stampate nel log del server (di default `admin@ticketing.local` / `Admin123!`, sovrascrivibili in `.env`). **Cambia la password dopo il primo accesso.**

## Avvio con Docker (consigliato per l'uso "da qualsiasi dispositivo")

```bash
docker compose up -d --build
```

L'app sarà disponibile su `http://<IP-del-server>:3000` da qualunque dispositivo con accesso alla rete/host su cui gira il container. I dati SQLite persistono nel volume `ticketing-data`.

Per pubblicarla su Internet ed accedervi da qualsiasi luogo, esegui il deploy dell'immagine Docker (o del progetto Node) su un qualsiasi host/VPS/PaaS che supporti container o Node.js, esponendo la porta 3000 (o quella indicata da `PORT`).

## Installazione come app (PWA)

Aprendo il sito da un browser mobile (Chrome/Safari), è possibile "Aggiungi a schermata Home" per installarlo come app; gli asset statici vengono messi in cache dal service worker, mentre i dati dei ticket sono sempre recuperati in tempo reale dal server.

## Variabili d'ambiente

| Variabile | Descrizione | Default |
|---|---|---|
| `PORT` | Porta HTTP del server | `3000` |
| `JWT_SECRET` | Segreto per la firma dei token JWT — **da cambiare in produzione** | `dev-secret-change-me` |
| `DEFAULT_ADMIN_EMAIL` | Email dell'admin creato al primo avvio | `admin@ticketing.local` |
| `DEFAULT_ADMIN_PASSWORD` | Password dell'admin creato al primo avvio | `Admin123!` |

## Struttura del progetto

```
server/
  index.js          # entry point Express, binding su 0.0.0.0
  db/database.js     # schema SQLite + seed admin
  middleware/auth.js  # autenticazione JWT e controllo ruoli
  routes/auth.js       # registrazione, login, /me
  routes/tickets.js    # CRUD ticket + commenti
  routes/users.js      # elenco utenti, gestione ruoli (admin)
public/
  index.html         # shell dell'app
  css/style.css       # stile responsive
  js/app.js           # SPA (routing via hash, chiamate API)
  manifest.json        # manifest PWA
  service-worker.js    # cache offline degli asset statici
```

## API principali

Tutte le richieste (tranne `register`/`login`) richiedono l'header `Authorization: Bearer <token>`.

| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Crea un account cliente |
| POST | `/api/auth/login` | Login, restituisce token JWT |
| GET | `/api/auth/me` | Utente autenticato corrente |
| POST | `/api/auth/change-password` | Cambia la propria password |
| GET | `/api/tickets` | Elenco ticket (filtri: `status`, `priority`, `q`, `assigned`) |
| POST | `/api/tickets` | Crea un ticket |
| GET | `/api/tickets/:id` | Dettaglio ticket + commenti (le note interne sono escluse per i clienti) |
| PATCH | `/api/tickets/:id` | Aggiorna ticket: stato/priorità/assegnazione per lo staff; oggetto/descrizione per il proprietario se ancora aperto; riapertura (`status: "open"`) per il proprietario se risolto/chiuso |
| DELETE | `/api/tickets/:id` | Elimina ticket (solo admin) |
| POST | `/api/tickets/:id/comments` | Aggiunge un commento (`is_internal: true` per una nota visibile solo allo staff) |
| GET | `/api/users` | Elenco utenti (solo staff) |
| POST | `/api/users` | Crea un account agente/admin con password temporanea generata (solo admin) |
| PATCH | `/api/users/:id/role` | Cambia il ruolo di un utente (solo admin) |

## Sicurezza

- Password hashate con bcrypt
- Autenticazione basata su JWT con scadenza a 7 giorni
- Controllo dei permessi per ruolo su ogni endpoint sensibile
- Impostare sempre un `JWT_SECRET` robusto e una password admin personalizzata prima di esporre l'app pubblicamente
