# It — Piattaforma di Ticketing

Piattaforma di ticketing full-stack e realmente funzionante: gestione di richieste di assistenza con autenticazione, ruoli, stati, priorità e conversazioni sui ticket. L'interfaccia è **responsive** (mobile-first) e installabile come app (PWA), quindi utilizzabile da PC, tablet e smartphone tramite browser, sulla stessa rete o pubblicata online.

## Stack tecnico

- **Backend:** Node.js + Express, REST API con autenticazione JWT
- **Database:** SQLite (`better-sqlite3`), file locale in `data/ticketing.db` — zero configurazione
- **Frontend:** SPA in JavaScript vanilla, nessun build step, CSS responsive
- **PWA:** manifest + service worker per installazione e cache degli asset statici

## Funzionalità

- Registrazione e login (JWT), più **accesso SSO con Google e Microsoft** (opzionale, vedi sotto)
- Tre ruoli: `customer` (cliente), `agent` (agente), `admin`
- Creazione, consultazione, modifica, riapertura e chiusura dei ticket
- Stati (`aperto`, `in lavorazione`, `risolto`, `chiuso`) e priorità (`bassa`…`urgente`)
- Categorie personalizzabili dall'amministratore, selezionabili dal cliente in fase di apertura
- **Timeline attività** su ogni ticket: commenti e cambi di stato/priorità/assegnazione mostrati in un unico flusso cronologico (in stile ITSM)
- Assegnazione dei ticket agli agenti, filtri per stato/priorità/assegnatario, ricerca testuale
- Dashboard con contatori in tempo reale (aperti, in lavorazione, risolti, urgenti)
- **Note interne** sui ticket, visibili solo allo staff
- Il cliente può riaprire un ticket risolto/chiuso se il problema persiste
- Pannello di amministrazione grafico: gestione ruoli utente, creazione account staff con password temporanea, gestione categorie ticket
- Profilo personale con cambio password
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

> **Nota sul piano gratuito:** le istanze web gratuite di Render vanno in stop dopo inattività (si riattivano alla richiesta successiva, con qualche secondo di attesa) e il filesystem — quindi il database SQLite — **non è persistente tra un deploy e l'altro** (i dati sopravvivono a stop/riavvio ma vengono ripristinati da zero a ogni nuovo deploy). Per un uso realmente in produzione con dati permanenti, aggiungi un disco persistente a pagamento su Render (bastano pochi dollari al mese) oppure migra a un database gestito.

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

## Variabili d'ambiente

| Variabile | Descrizione | Default |
|---|---|---|
| `PORT` | Porta HTTP del server | `3000` |
| `JWT_SECRET` | Segreto per la firma dei token JWT — **da cambiare in produzione** | `dev-secret-change-me` |
| `DEFAULT_ADMIN_EMAIL` | Email dell'admin creato al primo avvio | `admin@ticketing.local` |
| `DEFAULT_ADMIN_PASSWORD` | Password dell'admin creato al primo avvio | `Admin123!` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth Google, abilita l'accesso "Sign in with Google" | non impostato (SSO Google disattivato) |
| `MICROSOFT_CLIENT_ID` | Application ID Microsoft Entra, abilita l'accesso con Microsoft | non impostato (SSO Microsoft disattivato) |
| `MICROSOFT_TENANT_ID` | Limita l'accesso Microsoft a un singolo tenant aziendale | `common` (qualsiasi account Microsoft) |

## Struttura del progetto

```
server/
  index.js          # entry point Express, binding su 0.0.0.0
  db/database.js     # schema SQLite + seed admin/categorie
  middleware/auth.js  # autenticazione JWT e controllo ruoli
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
| GET | `/api/tickets` | Elenco ticket (filtri: `status`, `priority`, `q`, `assigned`) |
| POST | `/api/tickets` | Crea un ticket |
| GET | `/api/tickets/:id` | Dettaglio ticket + timeline attività (le note interne sono escluse per i clienti) |
| PATCH | `/api/tickets/:id` | Aggiorna ticket: stato/priorità/assegnazione per lo staff; oggetto/descrizione per il proprietario se ancora aperto; riapertura (`status: "open"`) per il proprietario se risolto/chiuso |
| DELETE | `/api/tickets/:id` | Elimina ticket (solo admin) |
| POST | `/api/tickets/:id/comments` | Aggiunge un commento (`is_internal: true` per una nota visibile solo allo staff) |
| GET | `/api/users` | Elenco utenti (solo staff) |
| POST | `/api/users` | Crea un account agente/admin con password temporanea generata (solo admin) |
| PATCH | `/api/users/:id/role` | Cambia il ruolo di un utente (solo admin) |
| GET | `/api/categories` | Elenco categorie ticket |
| POST | `/api/categories` | Crea una categoria (solo admin) |
| DELETE | `/api/categories/:id` | Elimina una categoria non in uso (solo admin) |

## Sicurezza

- Password hashate con bcrypt
- Autenticazione basata su JWT con scadenza a 7 giorni
- Controllo dei permessi per ruolo su ogni endpoint sensibile
- Impostare sempre un `JWT_SECRET` robusto e una password admin personalizzata prima di esporre l'app pubblicamente
