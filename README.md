# It — Piattaforma di Ticketing

Piattaforma di ticketing full-stack e realmente funzionante: gestione di richieste di assistenza con autenticazione, ruoli, stati, priorità, categorie e una timeline attività completa per ogni ticket. L'interfaccia è **responsive** (mobile-first) e installabile come app (PWA), utilizzabile da PC, tablet e smartphone.

## Stack tecnico

- **Backend:** Node.js + Express, REST API con autenticazione JWT
- **Tempo reale:** Socket.IO per chat live e presenza sui ticket
- **Database:** SQLite/libSQL (`@libsql/client`) — file locale zero-configurazione in sviluppo, oppure [Turso](https://turso.tech) per una copia remota persistente in produzione (vedi sotto)
- **Frontend:** SPA in JavaScript vanilla, nessun build step, CSS responsive
- **PWA:** manifest + service worker per installazione, cache degli asset statici e aggiornamento automatico

## Funzionalità

- Registrazione e login (JWT), più **accesso SSO con Google e Microsoft** (opzionale, vedi sotto)
- Tre ruoli: `customer` (cliente), `agent` (agente), `admin`
- Creazione, consultazione, modifica, riapertura e chiusura dei ticket
- Stati (`aperto`, `in lavorazione`, `risolto`, `chiuso`) e priorità (`bassa`…`urgente`)
- Categorie personalizzabili dall'amministratore, selezionabili dal cliente in fase di apertura
- **Timeline attività** su ogni ticket: commenti e cambi di stato/priorità/assegnazione in un unico flusso cronologico (in stile ITSM)
- **Tipo Incident / Task** per ogni ticket, con badge dedicato e filtro in dashboard
- **Gruppi di assegnazione gerarchici** (es. IT → Service Desk, Presidio, Endpoint, Network, Security, creati di default): l'amministratore può creare gruppi di primo livello (per altri reparti oltre l'IT, es. HR) o annidarli sotto un gruppo esistente; nel pannello di gestione del ticket l'elenco degli assegnatari è raggruppato per gruppo, così i membri dello stesso gruppo si vedono e si assegnano i ticket a vicenda con un colpo d'occhio
- **SLA per gruppo**: ogni gruppo ha un tempo di risposta e risoluzione (in ore) impostabile dall'admin; ogni ticket mostra un badge SLA calcolato automaticamente (in linea / a rischio / superata)
- **Backlog**: vista dedicata con i ticket non ancora assegnati, ordinati per urgenza SLA (i più a rischio in cima)
- **Chiusura automatica**: un ticket risolto viene chiuso automaticamente dopo 72 ore di inattività, con evento registrato in cronologia
- **Asset e prestiti**: inventario dispositivi (laptop, desktop, monitor, telefoni) con stato, assegnazione permanente o a prestito con scadenza, collegabile a un ticket
- **Pagina di ricerca dedicata**: cerca per numero ticket, parola chiave o richiedente con risultati istantanei mentre scrivi, filtrabili per tipo/stato/priorità/gruppo
- **Report di gestione** (admin): grafici su volume ticket per gruppo, tempo medio di risoluzione, percentuale SLA rispettata e carico per agente
- Assegnazione dei ticket agli agenti, filtri per stato/priorità/tipo e per un assegnatario specifico (ogni membro dello staff, non solo "assegnati a me"); ricerca testuale che trova anche un ticket per numero esatto (es. cercando `42` salta dritto al ticket #42) e, per lo staff, anche per nome o email del richiedente — così un admin trova subito i ticket di una persona specifica
- Dashboard con contatori in tempo reale (aperti, in lavorazione, risolti, urgenti), un **contatore personale** (carico assegnato per lo staff, ticket in corso per i clienti) e un **grafico personalizzabile** (cambia al volo la vista: stato, priorità, tipo, categoria o assegnatario)
- **Storico completo**: nessun ticket sparisce dalla dashboard quando viene risolto o chiuso, resta sempre consultabile e filtrabile per stato
- **Chat e attività in tempo reale**: commenti e cambi di stato appaiono istantaneamente su tutti i dispositivi collegati al ticket, senza ricaricare la pagina (Socket.IO)
- **Indicatore di presenza**: quando un tecnico apre un ticket il cliente lo vede in tempo reale, e viceversa
- **Notifica email** al cliente quando il suo ticket viene contrassegnato come risolto (richiede la configurazione SMTP opzionale, vedi sotto)
- **Note interne**, visibili solo allo staff
- Il cliente può riaprire un ticket risolto/chiuso se il problema persiste
- Pannello di amministrazione grafico: ruoli utente, creazione account staff con password temporanea, categorie ticket, gruppi con SLA
- **Amministratore globale nascosto**: il primo account admin creato all'avvio non è visibile né modificabile dagli altri amministratori, per proteggere l'account proprietario della piattaforma
- Profilo personale con cambio password e **cambio email** self-service
- **Lingua** (italiano/inglese) e **personalizzazione del colore** dell'interfaccia, dalla pagina Impostazioni
- Interfaccia responsive e curata graficamente, installabile come app (PWA) con **aggiornamento automatico** quando viene pubblicata una nuova versione

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

## Pubblicazione online: frontend su GitHub Pages + backend su Render

GitHub Pages ospita solo file statici e non può eseguire il backend Node/SQLite: per avere un link pubblico tipo `https://stealthalek.github.io/It/` con dati reali condivisi tra chi apre i ticket e chi li gestisce, il frontend (statico) va su GitHub Pages e il backend (API + database) va ospitato separatamente. Il frontend è già predisposto: nessun URL è hardcoded, l'indirizzo del backend si configura da un pannello **Impostazioni** (icona ingranaggio in alto) e viene salvato nel browser.

### 1. Pubblica il frontend su GitHub Pages

1. Nel repository su GitHub vai su **Settings → Pages**.
2. In "Build and deployment" imposta **Source: GitHub Actions**.
3. Il workflow incluso (`.github/workflows/deploy-pages.yml`) pubblica automaticamente il contenuto di `public/` a ogni push sul branch principale. Dopo il primo run, il sito è live su `https://<utente>.github.io/<nome-repo>/` (es. `https://stealthalek.github.io/It/`).

### 2. Pubblica il backend su Render (piano gratuito)

1. Crea un account su [render.com](https://render.com) (gratuito) e collega il tuo account GitHub.
2. Su Render scegli **New → Blueprint**, seleziona questo repository: viene letto automaticamente `render.yaml` incluso nel progetto, che compila l'immagine dal `Dockerfile` esistente.
3. Imposta la variabile `DEFAULT_ADMIN_PASSWORD` nel pannello Render prima del primo deploy (altrimenti resta il default `Admin123!`, da cambiare subito dopo il primo accesso).
4. A deploy completato Render fornisce un URL tipo `https://it-ticketing-api.onrender.com`.

> **Importante — persistenza dei dati:** le istanze web gratuite di Render hanno un filesystem effimero: **senza un database esterno, ogni nuovo deploy cancella tutti gli utenti e i ticket**. Segui subito la sezione successiva per collegare un database Turso gratuito e persistente, altrimenti i dati vengono ripristinati da zero a ogni pubblicazione di una modifica.

### 2bis. Rendi i dati persistenti con Turso (gratuito)

L'app usa [libSQL](https://turso.tech), compatibile con SQLite: senza configurazione usa un file locale (comodo in sviluppo), ma in produzione può appoggiarsi a un database [Turso](https://turso.tech) gratuito che sopravvive ad ogni deploy.

1. Crea un account gratuito su [turso.tech](https://turso.tech).
2. Crea un nuovo database (dal sito o con la CLI `turso db create it-ticketing`).
3. Recupera l'URL di connessione (`turso db show it-ticketing --url`, inizia con `libsql://`) e crea un token di accesso (`turso db tokens create it-ticketing`).
4. Su Render, apri il servizio → **Environment** e imposta:
   - `TURSO_DATABASE_URL` con l'URL del database
   - `TURSO_AUTH_TOKEN` con il token generato
5. Render riavvia automaticamente il servizio: da questo momento il database vive su Turso e **non viene più perso nei deploy successivi**.

Se le due variabili non sono impostate, il backend continua a funzionare con un file SQLite locale (utile per sviluppo/Docker), semplicemente non persistente tra un deploy Render e l'altro.

### 3. Collega il frontend al backend

1. Apri il sito GitHub Pages, clicca sull'icona ingranaggio in alto (Impostazioni connessione).
2. Incolla l'URL del backend Render (es. `https://it-ticketing-api.onrender.com`, senza slash finale) e premi **Salva**: il pulsante "Verifica connessione" conferma che tutto funziona.
3. Da questo momento login, registrazione e gestione ticket dal sito GitHub Pages parlano con il backend remoto, da qualunque dispositivo e rete.

Chi apre il sito da un altro dispositivo dovrà anch'esso impostare una volta sola lo stesso indirizzo backend nelle Impostazioni (il valore è salvato nel browser locale, non condiviso automaticamente tra dispositivi diversi).

## Accesso SSO con Google e Microsoft

L'accesso con account Google o Microsoft (personali o aziendali) è già implementato ma disattivato finché non fornisci le credenziali dell'applicazione OAuth: se non configurato, i relativi pulsanti semplicemente non compaiono nella pagina di login, senza alcun errore.

### Google

1. Vai su [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crea un progetto (o usane uno esistente).
2. **Crea credenziali → ID client OAuth**, tipo applicazione **Applicazione web**.
3. In "Origini JavaScript autorizzate" aggiungi l'indirizzo del tuo frontend (es. `https://stealthalek.github.io`).
4. Copia il **Client ID** generato.
5. Impostalo come variabile d'ambiente `GOOGLE_CLIENT_ID` sul backend (es. nel pannello Render → Environment).

### Microsoft

1. Vai su [Microsoft Entra ID (Azure Portal) → App registrations → New registration](https://portal.azure.com).
2. Come tipo di account scegli se limitare l'accesso alla tua sola organizzazione o consentirlo a qualsiasi account Microsoft (personale o aziendale).
3. In "Redirect URI" scegli tipo **SPA** e inserisci l'indirizzo del tuo frontend (es. `https://stealthalek.github.io/It/`).
4. Copia l'**Application (client) ID**.
5. Impostalo come variabile d'ambiente `MICROSOFT_CLIENT_ID` sul backend; se vuoi restringere l'accesso al solo tuo tenant aziendale imposta anche `MICROSOFT_TENANT_ID` con l'ID del tenant (altrimenti lascialo non impostato per accettare qualsiasi account Microsoft).

Dopo aver impostato le variabili e riavviato/ridistribuito il backend, i pulsanti "Accedi con Google" e "Accedi con Microsoft" compaiono automaticamente nella pagina di login: il primo accesso crea in automatico un account cliente collegato a quell'email.

## Installazione come app (PWA)

Aprendo il sito da un browser mobile è possibile installarlo come app (pulsante di installazione in alto, o "Aggiungi a schermata Home" su iOS/Safari dove il browser non espone un prompt automatico). Gli asset statici vengono messi in cache dal service worker per l'uso offline, mentre i dati dei ticket sono sempre recuperati in tempo reale dal server. Ad ogni apertura dell'app (o quando torna in primo piano), viene controllata automaticamente la presenza di una nuova versione: se disponibile, viene scaricata e l'app si aggiorna da sola.

## Chat in tempo reale e presenza

Ogni pagina di dettaglio ticket apre una connessione Socket.IO verso il backend: nuovi commenti, cambi di stato/priorità/tipo/assegnazione e la riapertura del ticket compaiono istantaneamente su tutti i dispositivi collegati a quel ticket, senza bisogno di ricaricare la pagina. Quando un tecnico apre un ticket, il cliente vede un avviso in tempo reale ("Un tecnico sta seguendo questo ticket"), e viceversa lo staff vede quando il cliente sta guardando il ticket. Le note interne restano visibili solo allo staff anche negli aggiornamenti live. Non serve alcuna configurazione: funziona automaticamente non appena backend e frontend sono collegati.

## Notifica email al completamento del ticket

Quando uno staff member contrassegna un ticket come **risolto**, il cliente può ricevere automaticamente un'email di notifica, oltre all'avviso già visibile nella piattaforma. La funzione è opzionale e disattivata finché non configuri un server SMTP: se le variabili non sono impostate, il backend continua a funzionare normalmente e semplicemente non invia email.

1. Scegli un provider SMTP. Alcune opzioni gratuite: il tuo stesso account Gmail (richiede una ["password per le app"](https://myaccount.google.com/apppasswords), disponibile se hai la verifica in due passaggi attiva), oppure un servizio email transazionale come [Brevo](https://www.brevo.com) o [Resend](https://resend.com) (piano gratuito, credenziali SMTP dedicate).
2. Su Render, apri il servizio → **Environment** e imposta:
   - `SMTP_HOST` (es. `smtp.gmail.com`)
   - `SMTP_PORT` (es. `465` per connessione SSL diretta, o `587`)
   - `SMTP_USER` (il tuo indirizzo email o l'utente fornito dal provider)
   - `SMTP_PASS` (la password per le app o la chiave SMTP del provider — mai la password normale dell'account)
   - `SMTP_FROM` (opzionale, indirizzo mittente mostrato al destinatario; se omesso usa `SMTP_USER`)
3. Render riavvia automaticamente il servizio: da questo momento, ogni volta che un ticket passa a "Risolto", il cliente riceve un'email.

### Esempio: instradare tutte le email tramite un account Gmail dedicato (es. infotickting@gmail.com)

Per far sì che tutte le email in uscita della piattaforma (inviti, notifiche di risoluzione, reset password) partano da un unico indirizzo Gmail aziendale:

1. Accedi a quell'account Gmail e attiva la verifica in due passaggi da [myaccount.google.com/security](https://myaccount.google.com/security), se non è già attiva (obbligatoria per generare una password per le app).
2. Vai su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), scegli un nome a piacere (es. "Ticketing") e genera la password: Google mostra una stringa di 16 caratteri, da copiare subito (non sarà più visibile dopo).
3. Su Render, servizio backend → **Environment**, imposta:
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `465`
   - `SMTP_USER` = l'indirizzo Gmail dedicato
   - `SMTP_PASS` = la password per le app da 16 caratteri appena generata (**mai** la password normale dell'account)
   - `SMTP_FROM` = lo stesso indirizzo, se vuoi che compaia esplicitamente come mittente
4. Salva: Render ridistribuisce il servizio e da quel momento ogni email automatica della piattaforma parte da quell'indirizzo.

La ricezione delle risposte (email in arrivo che diventano commenti automatici sul ticket) non è ancora implementata: al momento la piattaforma invia solo notifiche in uscita, il cliente risponde restando comunque sulla piattaforma stessa.

## Variabili d'ambiente

| Variabile | Descrizione | Default |
|---|---|---|
| `PORT` | Porta HTTP del server | `3000` |
| `JWT_SECRET` | Segreto per la firma dei token JWT — **obbligatorio in produzione** (l'avvio viene bloccato se manca) | `dev-secret-change-me` (solo in sviluppo locale) |
| `DEFAULT_ADMIN_EMAIL` | Email dell'admin creato al primo avvio | `admin@ticketing.local` |
| `DEFAULT_ADMIN_PASSWORD` | Password dell'admin creato al primo avvio | `Admin123!` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth Google, abilita l'accesso "Sign in with Google" | non impostato (SSO Google disattivato) |
| `MICROSOFT_CLIENT_ID` | Application ID Microsoft Entra, abilita l'accesso con Microsoft | non impostato (SSO Microsoft disattivato) |
| `MICROSOFT_TENANT_ID` | Limita l'accesso Microsoft a un singolo tenant aziendale | `common` (qualsiasi account Microsoft) |
| `TURSO_DATABASE_URL` | URL del database Turso (`libsql://...`), rende i dati persistenti tra i deploy | non impostato (usa file SQLite locale) |
| `TURSO_AUTH_TOKEN` | Token di accesso al database Turso | non impostato |
| `SMTP_HOST` | Host del server SMTP, abilita le email di notifica | non impostato (email disattivate) |
| `SMTP_PORT` | Porta del server SMTP | `587` |
| `SMTP_USER` | Utente/indirizzo per l'autenticazione SMTP | non impostato |
| `SMTP_PASS` | Password o chiave API SMTP | non impostato |
| `SMTP_FROM` | Indirizzo mittente mostrato nelle email | uguale a `SMTP_USER` |

## Struttura del progetto

```
server/
  index.js          # entry point Express, bootstrap async, binding su 0.0.0.0
  db/database.js     # client libSQL/Turso, schema, migrazioni, seed
  middleware/auth.js  # autenticazione JWT e controllo ruoli
  middleware/asyncHandler.js # inoltra gli errori async delle route a Express
  sso.js               # verifica token Google/Microsoft
  routes/auth.js       # registrazione, login, SSO, /me
  routes/tickets.js    # CRUD ticket, commenti, timeline attività
  routes/users.js      # elenco utenti, gestione ruoli (admin)
  routes/categories.js # elenco e gestione categorie ticket
public/
  index.html         # shell dell'app (percorsi relativi: funziona anche su sottopercorso)
  css/style.css       # stile responsive, tema chiaro/scuro
  js/app.js           # SPA (routing via hash, chiamate API, base URL configurabile)
  manifest.json        # manifest PWA
  service-worker.js    # cache offline degli asset statici
render.yaml           # blueprint di deploy del backend su Render
.github/workflows/
  deploy-pages.yml     # pubblica public/ su GitHub Pages a ogni push
```

## API principali

Tutte le richieste (tranne `register`/`login`) richiedono l'header `Authorization: Bearer <token>`.

| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Crea un account cliente |
| POST | `/api/auth/login` | Login, restituisce token JWT |
| GET | `/api/auth/sso-config` | Configurazione SSO pubblica (quali provider sono attivi) |
| POST | `/api/auth/google` | Login/registrazione tramite credenziale Google |
| POST | `/api/auth/microsoft` | Login/registrazione tramite token Microsoft |
| GET | `/api/auth/me` | Utente autenticato corrente |
| POST | `/api/auth/change-password` | Cambia la propria password |
| POST | `/api/auth/change-email` | Cambia la propria email |
| GET | `/api/tickets` | Elenco ticket (filtri: `status`, `priority`, `type`, `group`, `q`, `assigned`) |
| POST | `/api/tickets` | Crea un ticket |
| GET | `/api/tickets/:id` | Dettaglio ticket + timeline attività (le note interne sono escluse per i clienti) |
| PATCH | `/api/tickets/:id` | Aggiorna ticket: stato/priorità/tipo/gruppo/assegnazione/asset per lo staff; oggetto/descrizione per il proprietario se ancora aperto; riapertura (`status: "open"`) per il proprietario se risolto/chiuso |
| DELETE | `/api/tickets/:id` | Elimina ticket (solo admin) |
| POST | `/api/tickets/:id/comments` | Aggiunge un commento (`is_internal: true` per una nota visibile solo allo staff) |
| GET | `/api/users` | Elenco utenti (solo staff; l'amministratore globale nascosto è escluso per gli altri admin) |
| POST | `/api/users` | Crea un account agente/admin con password temporanea generata (solo admin) |
| PATCH | `/api/users/:id/role` | Cambia il ruolo di un utente (solo admin) |
| PATCH | `/api/users/:id/group` | Assegna o cambia il gruppo di un utente staff (solo admin) |
| GET | `/api/categories` | Elenco categorie ticket |
| POST | `/api/categories` | Crea una categoria (solo admin) |
| DELETE | `/api/categories/:id` | Elimina una categoria non in uso (solo admin) |
| GET | `/api/groups` | Elenco gruppi di assegnazione con gerarchia e SLA |
| POST | `/api/groups` | Crea un gruppo, opzionalmente sotto un gruppo padre (solo admin) |
| PATCH | `/api/groups/:id` | Aggiorna SLA o gruppo padre (solo admin) |
| DELETE | `/api/groups/:id` | Elimina un gruppo senza sotto-gruppi né ticket collegati (solo admin) |
| GET | `/api/assets` | Elenco asset (filtri: `status`, `q`) |
| POST | `/api/assets` | Crea un asset |
| PATCH | `/api/assets/:id` | Aggiorna stato, tipo di assegnazione, assegnatario o scadenza |
| DELETE | `/api/assets/:id` | Elimina un asset (solo admin) |

## Sicurezza

- Password hashate con bcrypt
- Autenticazione basata su JWT con scadenza a 7 giorni
- Controllo dei permessi per ruolo su ogni endpoint sensibile
- Header HTTP di sicurezza applicati automaticamente (Helmet): protezione da clickjacking, sniffing del MIME type, HSTS
- **Limite dei tentativi (rate limiting)**: login, registrazione, accesso SSO e cambio password sono limitati a 20 tentativi ogni 15 minuti per indirizzo IP, per rendere impraticabile un attacco a forza bruta sulle credenziali; l'intera API è comunque limitata a 300 richieste ogni 15 minuti per IP
- Impostare sempre un `JWT_SECRET` robusto e una password admin personalizzata prima di esporre l'app pubblicamente (su Render il `JWT_SECRET` viene già generato automaticamente in modo sicuro)

## Perché non Google Sheets

Per la ricerca dei ticket per numero e lo storico è stata scelta la ricerca integrata nel database (vedi sopra) invece di un foglio Google Sheets: è già in tempo reale, non richiede di collegare un account Google esterno né di gestire permessi/API aggiuntive, e resta coerente con la scelta già fatta di ridurre al minimo gli account e i servizi da configurare. Se in futuro serve comunque un'esportazione consultabile fuori dall'app, i dati restano comunque interrogabili direttamente dal database (Turso).
