(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('ticketing_token') || null,
    user: null,
  };

  let ticketSocket = null;
  function teardownTicketSocket() {
    if (ticketSocket) {
      try {
        ticketSocket.emit('ticket:leave');
        ticketSocket.disconnect();
      } catch {}
      ticketSocket = null;
    }
  }

  async function connectTicketSocket(ticketId) {
    teardownTicketSocket();
    try {
      const base = getApiBase();
      await loadScriptOnce(`${base}/socket.io/socket.io.js`);
      if (!window.io) return null;
      const socket = window.io(base || undefined, {
        auth: { token: state.token },
        transports: ['websocket', 'polling'],
      });
      socket.on('connect', () => socket.emit('ticket:join', ticketId));
      ticketSocket = socket;
      return socket;
    } catch {
      return null;
    }
  }

  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  const userBadge = document.getElementById('userBadge');
  const logoutBtn = document.getElementById('logoutBtn');

  const STATUS_LABELS = {
    open: 'Aperto',
    in_progress: 'In lavorazione',
    resolved: 'Risolto',
    closed: 'Chiuso',
  };
  const PRIORITY_LABELS = { low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
  const TYPE_LABELS = { incident: 'Incident', task: 'Task' };
  const SLA_LABELS = { on_track: 'SLA in linea', at_risk: 'SLA a rischio', breached: 'SLA superata' };
  const ASSET_TYPE_LABELS = { laptop: 'Laptop', desktop: 'Desktop', monitor: 'Monitor', telefono: 'Telefono', altro: 'Altro' };
  const ASSET_STATUS_LABELS = { disponibile: 'Disponibile', in_uso: 'In uso', in_riparazione: 'In riparazione', dismesso: 'Dismesso' };
  const ROLE_LABELS = { customer: 'Cliente', agent: 'Agente', admin: 'Amministratore' };

  const ICON_PATHS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    refresh: '<polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.66V19a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1.66"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    activity: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
    incident: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    task: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  };

  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
  }

  function msLogo() {
    return `<svg class="icon" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function showToast(message, type = '') {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (type ? ` ${type}` : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
  }

  function guardForm(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.dataset.submitting === '1') return;
      form.dataset.submitting = '1';
      const buttons = [...form.querySelectorAll('button[type="submit"]')];
      buttons.forEach((b) => { b.disabled = true; });
      try {
        await handler(e);
      } finally {
        form.dataset.submitting = '';
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  }

  const TRANSLATIONS = {
    it: {
      nav_dashboard: 'Ticket', nav_new: 'Nuovo ticket', nav_search: 'Ricerca', nav_backlog: 'Backlog',
      nav_assets: 'Asset', nav_report: 'Report', nav_admin: 'Amministrazione', nav_profile: 'Profilo', logout: 'Esci',
      login_title: 'Accedi', login_hint: 'Entra nella piattaforma di ticketing.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Accedi', login_no_account: 'Non hai un account?', login_register_link: 'Registrati',
      register_title: 'Crea un account', register_submit: 'Registrati',
      register_has_account: 'Hai già un account?', register_login_link: 'Accedi',
      dashboard_title_staff: 'Tutti i ticket', dashboard_title_customer: 'I miei ticket',
      dashboard_hint_staff: 'Gestisci e rispondi alle richieste di assistenza.',
      dashboard_hint_customer: 'Consulta lo stato delle tue richieste.',
      new_ticket_btn: 'Nuovo ticket',
    },
    en: {
      nav_dashboard: 'Tickets', nav_new: 'New ticket', nav_search: 'Search', nav_backlog: 'Backlog',
      nav_assets: 'Assets', nav_report: 'Report', nav_admin: 'Administration', nav_profile: 'Profile', logout: 'Log out',
      login_title: 'Sign in', login_hint: 'Enter the ticketing platform.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Sign in', login_no_account: "Don't have an account?", login_register_link: 'Register',
      register_title: 'Create an account', register_submit: 'Register',
      register_has_account: 'Already have an account?', register_login_link: 'Sign in',
      dashboard_title_staff: 'All tickets', dashboard_title_customer: 'My tickets',
      dashboard_hint_staff: 'Manage and respond to support requests.',
      dashboard_hint_customer: 'Check the status of your requests.',
      new_ticket_btn: 'New ticket',
    },
  };
  const LANG_LABELS = { it: 'Italiano', en: 'English' };

  function getLang() {
    return localStorage.getItem('ticketing_lang') || 'it';
  }

  function setLang(lang) {
    localStorage.setItem('ticketing_lang', lang);
  }

  function t(key) {
    const lang = getLang();
    return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.it[key] || key;
  }

  const NAV_KEY_BY_ROUTE = {
    dashboard: 'nav_dashboard', new: 'nav_new', search: 'nav_search', backlog: 'nav_backlog',
    assets: 'nav_assets', report: 'nav_report', admin: 'nav_admin', profile: 'nav_profile',
  };

  function applyChromeTranslations() {
    document.querySelectorAll('.main-nav a[data-nav]').forEach((a) => {
      const key = NAV_KEY_BY_ROUTE[a.dataset.nav];
      if (key) a.textContent = t(key);
    });
    logoutBtn.innerHTML = `${icon('logout')} ${t('logout')}`;
  }

  const ACCENT_PRESETS = {
    bordeaux: { primary: '#8f2436', primaryDark: '#711c2b', primarySoft: '#f7e6e6', label: 'Bordeaux' },
    blu: { primary: '#1868a8', primaryDark: '#124e80', primarySoft: '#e1ecf5', label: 'Blu' },
    verde: { primary: '#1f7a4d', primaryDark: '#175c3a', primarySoft: '#e1f0e6', label: 'Verde' },
    viola: { primary: '#6a3fa0', primaryDark: '#52317d', primarySoft: '#ece3f7', label: 'Viola' },
  };

  function getAccent() {
    return localStorage.getItem('ticketing_accent') || 'bordeaux';
  }

  function applyAccent(key) {
    const preset = ACCENT_PRESETS[key] || ACCENT_PRESETS.bordeaux;
    const root = document.documentElement.style;
    root.setProperty('--primary', preset.primary);
    root.setProperty('--primary-dark', preset.primaryDark);
    root.setProperty('--primary-soft', preset.primarySoft);
  }

  function setAccent(key) {
    localStorage.setItem('ticketing_accent', key);
    applyAccent(key);
  }

  const HOSTED_DEFAULT_API_BASE = 'https://it-ticketing-api-2g68.onrender.com';

  function getApiBase() {
    const stored = localStorage.getItem('ticketing_api_base');
    if (stored) return stored.replace(/\/+$/, '');
    if (location.hostname.endsWith('github.io')) return HOSTED_DEFAULT_API_BASE;
    return '';
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const res = await fetch(`${getApiBase()}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }

    if (!res.ok) {
      const message = (data && data.error) || `Errore ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  function setSession(token, user) {
    state.token = token;
    state.user = user;
    if (token) localStorage.setItem('ticketing_token', token);
    else localStorage.removeItem('ticketing_token');
    updateChrome();
  }

  function updateChrome() {
    document.body.classList.remove('role-customer', 'role-agent', 'role-admin');
    if (state.user) {
      document.body.classList.add(`role-${state.user.role}`);
      userBadge.innerHTML = `${icon('userCircle')} ${escapeHtml(state.user.name)} · ${ROLE_LABELS[state.user.role] || state.user.role}`;
      userBadge.style.display = '';
      logoutBtn.style.display = '';
    } else {
      userBadge.style.display = 'none';
      logoutBtn.style.display = 'none';
    }
  }

  let ssoConfigPromise = null;
  function fetchSsoConfig() {
    if (!ssoConfigPromise) {
      ssoConfigPromise = api('/auth/sso-config').catch(() => ({ google: null, microsoft: null }));
    }
    return ssoConfigPromise;
  }

  const loadedScripts = new Map();
  function loadScriptOnce(src) {
    if (!loadedScripts.has(src)) {
      loadedScripts.set(src, new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = reject;
        document.head.appendChild(el);
      }));
    }
    return loadedScripts.get(src);
  }

  async function handleSsoSuccess(data) {
    setSession(data.token, data.user);
    showToast(`Bentornato, ${data.user.name}`, 'success');
    location.hash = '#/dashboard';
    route();
  }

  async function renderSsoButtons(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const config = await fetchSsoConfig();
    if (!config.google && !config.microsoft) return;

    container.innerHTML = `
      <div class="sso-divider"><span>oppure</span></div>
      <div class="sso-buttons">
        ${config.google ? '<div id="googleBtnMount" class="google-btn-mount"></div>' : ''}
        ${config.microsoft ? `<button type="button" id="microsoftBtn" class="btn btn-ghost btn-block sso-btn">${msLogo()} Accedi con Microsoft</button>` : ''}
      </div>`;

    if (config.google) {
      try {
        await loadScriptOnce('https://accounts.google.com/gsi/client');
        window.google.accounts.id.initialize({
          client_id: config.google.clientId,
          callback: async (response) => {
            try {
              const data = await api('/auth/google', { method: 'POST', body: { credential: response.credential } });
              handleSsoSuccess(data);
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
        });
        window.google.accounts.id.renderButton(document.getElementById('googleBtnMount'), {
          theme: 'outline', size: 'large', shape: 'pill', width: 320, text: 'continue_with',
        });
      } catch {
        document.getElementById('googleBtnMount').remove();
      }
    }

    if (config.microsoft) {
      try {
        await loadScriptOnce('https://alcdn.msauth.net/browser/3.7.1/js/msal-browser.min.js');
        const msalInstance = new window.msal.PublicClientApplication({
          auth: {
            clientId: config.microsoft.clientId,
            authority: `https://login.microsoftonline.com/${config.microsoft.tenant || 'common'}`,
          },
        });
        if (msalInstance.initialize) await msalInstance.initialize();
        document.getElementById('microsoftBtn').addEventListener('click', async () => {
          try {
            const result = await msalInstance.loginPopup({ scopes: ['openid', 'profile', 'email'] });
            const data = await api('/auth/microsoft', { method: 'POST', body: { idToken: result.idToken } });
            handleSsoSuccess(data);
          } catch (err) {
            showToast(err.message || 'Accesso con Microsoft non riuscito', 'error');
          }
        });
      } catch {
        const btn = document.getElementById('microsoftBtn');
        if (btn) btn.remove();
      }
    }
  }

  function attachPasswordToggle(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;
    toggle.innerHTML = icon('eye');
    toggle.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.innerHTML = isPassword ? icon('eyeOff') : icon('eye');
    });
  }

  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav.addEventListener('click', (e) => {
    if (e.target.closest('a')) mainNav.classList.remove('open');
  });

  logoutBtn.addEventListener('click', () => {
    setSession(null, null);
    location.hash = '#/login';
  });

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.innerHTML = icon('settings');
  settingsBtn.addEventListener('click', () => { location.hash = '#/settings'; });

  const PUBLIC_ROUTES = new Set(['login', 'register']);
  const OPEN_ROUTES = new Set(['login', 'register', 'settings']);

  async function route() {
    const hash = location.hash.replace(/^#\//, '') || 'dashboard';
    const [page, param] = hash.split('/');

    if (state.token && !state.user) {
      try {
        const { user } = await api('/auth/me');
        state.user = user;
        updateChrome();
      } catch {
        setSession(null, null);
      }
    }

    if (!OPEN_ROUTES.has(page) && !state.user) {
      location.hash = '#/login';
      return;
    }
    if (PUBLIC_ROUTES.has(page) && state.user) {
      location.hash = '#/dashboard';
      return;
    }

    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === page);
    });

    if (page !== 'ticket') teardownTicketSocket();

    try {
      switch (page) {
        case 'login': return renderLogin();
        case 'register': return renderRegister();
        case 'dashboard': return renderDashboard();
        case 'new': return renderNewTicket();
        case 'ticket': return renderTicketDetail(param);
        case 'admin': return renderAdmin();
        case 'profile': return renderProfile();
        case 'settings': return renderSettings();
        case 'backlog': return renderBacklog();
        case 'assets': return renderAssets();
        case 'search': return renderSearch();
        case 'report': return renderReport();
        default: return renderNotFound();
      }
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.addEventListener('hashchange', route);

  function renderLogin() {
    appEl.innerHTML = `
      <div class="auth-wrap">
        <div class="card auth-card">
          <h1>${icon('lock')} ${t('login_title')}</h1>
          <p class="hint">${t('login_hint')}</p>
          <form id="loginForm" class="form-grid">
            <div class="field">
              <label for="email">${t('login_email')}</label>
              <input id="email" type="email" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="password">${t('login_password')}</label>
              <div class="password-field">
                <input id="password" type="password" required autocomplete="current-password" />
                <button type="button" id="pwToggle" class="icon-btn password-toggle" aria-label="Mostra password"></button>
              </div>
            </div>
            <p class="error-text" id="loginError"></p>
            <button class="btn btn-block" type="submit">${t('login_submit')}</button>
          </form>
          <div id="ssoContainer"></div>
          <p class="hint">${t('login_no_account')} <a href="#/register">${t('login_register_link')}</a></p>
        </div>
      </div>`;

    attachPasswordToggle('password', 'pwToggle');
    renderSsoButtons('ssoContainer');

    guardForm(document.getElementById('loginForm'), async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errEl = document.getElementById('loginError');
      errEl.textContent = '';
      try {
        const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
        setSession(token, user);
        showToast(`Bentornato, ${user.name}`, 'success');
        location.hash = '#/dashboard';
        route();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function renderRegister() {
    appEl.innerHTML = `
      <div class="auth-wrap">
        <div class="card auth-card">
          <h1>${icon('userCircle')} ${t('register_title')}</h1>
          <form id="registerForm" class="form-grid">
            <div class="field">
              <label for="name">Nome</label>
              <input id="name" type="text" required autocomplete="name" />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <div class="password-field">
                <input id="password" type="password" required minlength="6" autocomplete="new-password" />
                <button type="button" id="pwToggle" class="icon-btn password-toggle" aria-label="Mostra password"></button>
              </div>
              <span class="hint">Almeno 6 caratteri</span>
            </div>
            <div class="field">
              <label for="password2">Conferma password</label>
              <div class="password-field">
                <input id="password2" type="password" required minlength="6" autocomplete="new-password" />
                <button type="button" id="pwToggle2" class="icon-btn password-toggle" aria-label="Mostra password"></button>
              </div>
            </div>
            <p class="error-text" id="registerError"></p>
            <button class="btn btn-block" type="submit">${t('register_submit')}</button>
          </form>
          <div id="ssoContainer"></div>
          <p class="hint">${t('register_has_account')} <a href="#/login">${t('register_login_link')}</a></p>
        </div>
      </div>`;

    attachPasswordToggle('password', 'pwToggle');
    attachPasswordToggle('password2', 'pwToggle2');
    renderSsoButtons('ssoContainer');

    guardForm(document.getElementById('registerForm'), async () => {
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;
      const errEl = document.getElementById('registerError');
      errEl.textContent = '';
      if (password !== password2) {
        errEl.textContent = 'Le password non coincidono';
        return;
      }
      try {
        const { token, user } = await api('/auth/register', { method: 'POST', body: { name, email, password } });
        setSession(token, user);
        showToast(`Account creato, benvenuto ${user.name}`, 'success');
        location.hash = '#/dashboard';
        route();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function isStaff() {
    return state.user && (state.user.role === 'agent' || state.user.role === 'admin');
  }

  function barChart(rows, total, opts = {}) {
    const suffix = opts.suffix || '';
    const showPct = opts.showPct !== false && total > 0;
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `
      <div class="bar-chart" role="img" aria-label="${rows.map((r) => `${r.label}: ${r.value}`).join(', ')}">
        ${rows.map((r) => {
          const pct = total ? Math.round((r.value / total) * 100) : 0;
          const width = Math.round((r.value / max) * 100);
          return `
            <div class="bar-row">
              <span class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${width}%;background:${r.color}"></div>
              </div>
              <span class="bar-value">${r.value}${suffix} ${showPct ? `<span class="bar-pct">(${pct}%)</span>` : ''}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  function groupStaffByGroup(users) {
    const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
    const groups = new Map();
    staffUsers.forEach((u) => {
      const key = u.group_name ? (u.group_parent_name ? `${u.group_parent_name} / ${u.group_name}` : u.group_name) : 'Senza gruppo';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(u);
    });
    const sortedGroups = [...groups.keys()].sort((a, b) => {
      if (a === 'Senza gruppo') return 1;
      if (b === 'Senza gruppo') return -1;
      return a.localeCompare(b);
    });
    return sortedGroups.map((group) => ({ group, members: groups.get(group) }));
  }

  function buildGroupTree(groups) {
    const byParent = new Map();
    groups.forEach((g) => {
      const key = g.parent_id || 0;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(g);
    });
    byParent.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    function attach(parentId) {
      return (byParent.get(parentId) || []).map((g) => ({ ...g, children: attach(g.id) }));
    }
    return attach(0);
  }

  function flattenGroupTree(tree, depth = 0) {
    const out = [];
    tree.forEach((node) => {
      out.push({ ...node, depth });
      out.push(...flattenGroupTree(node.children, depth + 1));
    });
    return out;
  }

  function groupLabel(obj) {
    if (!obj.group_name) return null;
    return obj.group_parent_name ? `${obj.group_parent_name} / ${obj.group_name}` : obj.group_name;
  }

  function groupOptionsHtml(groups, selectedId, emptyLabel) {
    const flat = flattenGroupTree(buildGroupTree(groups));
    const emptyOption = emptyLabel !== null ? `<option value="">${escapeHtml(emptyLabel || 'Nessun gruppo')}</option>` : '';
    return emptyOption + flat.map((g) => `
      <option value="${g.id}" ${Number(selectedId) === g.id ? 'selected' : ''}>${'  '.repeat(g.depth)}${g.depth ? '– ' : ''}${escapeHtml(g.name)}</option>
    `).join('');
  }

  async function renderDashboard() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${isStaff() ? t('dashboard_title_staff') : t('dashboard_title_customer')}</h1>
          <p class="hint">${isStaff() ? t('dashboard_hint_staff') : t('dashboard_hint_customer')}</p>
        </div>
        <a class="btn" href="#/new">${icon('plus')} ${t('new_ticket_btn')}</a>
      </div>
      <div id="personalCounter"></div>
      <div id="statsRow" class="stat-row"></div>
      <div id="chartsRow" class="charts-row"></div>
      <div class="filters">
        <select id="fType">
          <option value="">Tutti i tipi</option>
          ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="fStatus">
          <option value="">Tutti gli stati</option>
          ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="fPriority">
          <option value="">Tutte le priorità</option>
          ${Object.entries(PRIORITY_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        ${isStaff() ? `
        <select id="fAssigned">
          <option value="">Tutti gli assegnatari</option>
          <option value="me">Assegnati a me</option>
          <option value="unassigned">Non assegnati</option>
        </select>` : ''}
        <input id="fQuery" type="search" placeholder="${isStaff() ? 'Cerca per testo, numero ticket o richiedente...' : 'Cerca per testo o numero ticket...'}" />
      </div>
      <div id="ticketList" class="skeleton-grid">
        ${Array(4).fill('<div class="skeleton-card"></div>').join('')}
      </div>`;

    const listEl = document.getElementById('ticketList');
    const statsEl = document.getElementById('statsRow');
    const personalEl = document.getElementById('personalCounter');
    const chartsEl = document.getElementById('chartsRow');
    const fType = document.getElementById('fType');
    const fStatus = document.getElementById('fStatus');
    const fPriority = document.getElementById('fPriority');
    const fAssigned = document.getElementById('fAssigned');
    const fQuery = document.getElementById('fQuery');

    if (fAssigned) {
      api('/users').then(({ users }) => {
        const staffGroups = groupStaffByGroup(users).map(({ group, members }) => ({
          group,
          members: members.filter((u) => u.id !== state.user.id),
        })).filter((g) => g.members.length);
        fAssigned.insertAdjacentHTML('beforeend', staffGroups.map(({ group, members }) => `
          <optgroup label="${escapeHtml(group)}">
            ${members.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}
          </optgroup>`).join(''));
      }).catch(() => {});
    }

    function renderStats(tickets) {
      const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0 };
      tickets.forEach((t) => {
        counts[t.status] = (counts[t.status] || 0) + 1;
        if (t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved') counts.urgent += 1;
      });
      statsEl.innerHTML = `
        <div class="stat-card accent-open"><div class="stat-value">${counts.open}</div><div class="stat-label">Aperti</div></div>
        <div class="stat-card accent-in_progress"><div class="stat-value">${counts.in_progress}</div><div class="stat-label">In lavorazione</div></div>
        <div class="stat-card accent-resolved"><div class="stat-value">${counts.resolved}</div><div class="stat-label">Risolti</div></div>
        <div class="stat-card accent-urgent"><div class="stat-value">${counts.urgent}</div><div class="stat-label">Urgenti aperti</div></div>`;
    }

    function renderPersonalCounter(tickets) {
      let value, label;
      if (isStaff()) {
        value = tickets.filter((t) => t.assigned_to === state.user.id && t.status !== 'resolved' && t.status !== 'closed').length;
        label = 'Assegnati a te, ancora aperti';
      } else {
        value = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
        label = 'Tuoi ticket in corso';
      }
      personalEl.innerHTML = `
        <div class="personal-counter">
          ${icon('userCircle', 'personal-counter-icon')}
          <div>
            <div class="personal-counter-value">${value}</div>
            <div class="personal-counter-label">${label}</div>
          </div>
        </div>`;
    }

    const CHART_DIMENSIONS = { status: 'Stato', priority: 'Priorità', type: 'Tipo', category: 'Categoria', assigned: 'Assegnatario' };
    let currentChartDim = 'status';

    function computeBreakdown(tickets, dim) {
      if (dim === 'status') {
        const order = ['open', 'in_progress', 'resolved', 'closed'];
        const colors = { open: 'var(--primary)', in_progress: 'var(--warning)', resolved: 'var(--success)', closed: 'var(--muted)' };
        return order.map((k) => ({ key: k, label: STATUS_LABELS[k], value: tickets.filter((t) => t.status === k).length, color: colors[k] }));
      }
      if (dim === 'priority') {
        const order = ['low', 'medium', 'high', 'urgent'];
        const colors = { low: 'var(--muted)', medium: 'var(--primary)', high: 'var(--warning)', urgent: 'var(--danger)' };
        return order.map((k) => ({ key: k, label: PRIORITY_LABELS[k], value: tickets.filter((t) => t.priority === k).length, color: colors[k] }));
      }
      if (dim === 'type') {
        const order = ['incident', 'task'];
        const colors = { incident: 'var(--type-incident)', task: 'var(--type-task)' };
        return order.map((k) => ({ key: k, label: TYPE_LABELS[k], value: tickets.filter((t) => t.type === k).length, color: colors[k] }));
      }
      if (dim === 'category') {
        const counts = new Map();
        tickets.forEach((t) => counts.set(t.category, (counts.get(t.category) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));
      }
      if (dim === 'assigned') {
        const counts = new Map();
        tickets.forEach((t) => {
          const label = t.assignee_name || 'Non assegnato';
          counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));
      }
      return [];
    }

    function renderCharts(tickets) {
      chartsEl.innerHTML = '';
      if (!tickets.length) return;

      const rows = computeBreakdown(tickets, currentChartDim);
      chartsEl.innerHTML = `
        <div class="card chart-card chart-card-wide">
          <div class="chart-card-head">
            <h3 class="section-title" style="margin:0">Grafico</h3>
            <select id="chartDim">
              ${Object.entries(CHART_DIMENSIONS).map(([v, l]) => `<option value="${v}" ${v === currentChartDim ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${barChart(rows, tickets.length)}
        </div>`;

      document.getElementById('chartDim').addEventListener('change', (e) => {
        currentChartDim = e.target.value;
        renderCharts(tickets);
      });
    }

    let debounceTimer;
    async function load() {
      const params = new URLSearchParams();
      if (fType && fType.value) params.set('type', fType.value);
      if (fStatus.value) params.set('status', fStatus.value);
      if (fPriority.value) params.set('priority', fPriority.value);
      if (fAssigned && fAssigned.value) params.set('assigned', fAssigned.value);
      if (fQuery.value.trim()) params.set('q', fQuery.value.trim());

      try {
        const { tickets } = await api(`/tickets?${params.toString()}`);
        renderStats(tickets);
        renderPersonalCounter(tickets);
        renderCharts(tickets);
        renderTicketList(listEl, tickets);
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    [fType, fStatus, fPriority, fAssigned].forEach((el) => el && el.addEventListener('change', load));
    fQuery.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 300);
    });

    load();
  }

  function renderTicketList(container, tickets) {
    if (!tickets.length) {
      container.className = '';
      container.innerHTML = `<div class="empty-state">${icon('inbox')}<span>Nessun ticket trovato.</span></div>`;
      return;
    }
    container.className = 'ticket-grid';
    container.innerHTML = tickets.map((t) => `
      <a class="ticket-card prio-${t.priority}" href="#/ticket/${t.id}">
        <div class="badges">
          <span class="badge badge-type-${t.type}">${icon(t.type, 'badge-icon')}${TYPE_LABELS[t.type] || t.type}</span>
          <span class="badge badge-${t.status}">${STATUS_LABELS[t.status]}</span>
          <span class="badge badge-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
          ${t.sla_status && t.sla_status !== 'on_track' ? `<span class="badge badge-sla-${t.sla_status}">${SLA_LABELS[t.sla_status]}</span>` : ''}
        </div>
        <h3>#${t.id} ${escapeHtml(t.subject)}</h3>
        <p class="ticket-desc">${escapeHtml(t.description)}</p>
        <div class="ticket-meta">
          Di ${escapeHtml(t.creator_name)} · ${formatDate(t.updated_at)}
          ${t.assignee_name ? ` · Assegnato a ${escapeHtml(t.assignee_name)}` : ''}
          ${groupLabel(t) ? ` · ${escapeHtml(groupLabel(t))}` : ''}
        </div>
      </a>`).join('');
  }

  async function renderNewTicket() {
    let categories = [];
    try {
      const data = await api('/categories');
      categories = data.categories;
    } catch { categories = []; }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('plus')} Nuovo ticket</h1>
          <p class="hint">Raccontaci il problema: bastano pochi campi, il resto lo segue il nostro team.</p>
        </div>
      </div>
      <div class="card" style="max-width:560px">
        <form id="newTicketForm" class="form-grid">
          <div class="field">
            <label for="type">Tipo di richiesta</label>
            <select id="type">
              <option value="incident">${TYPE_LABELS.incident} — qualcosa non funziona</option>
              <option value="task">${TYPE_LABELS.task} — richiesta pianificabile</option>
            </select>
          </div>
          <div class="field">
            <label for="category">Categoria</label>
            <select id="category">
              ${categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="subject">Oggetto</label>
            <input id="subject" type="text" required maxlength="200" placeholder="Un breve titolo per il problema" />
          </div>
          <div class="field">
            <label for="priority">Quanto è urgente?</label>
            <select id="priority">
              ${Object.entries(PRIORITY_LABELS).map(([v, l]) => `<option value="${v}" ${v === 'medium' ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="description">Descrizione</label>
            <textarea id="description" required placeholder="Descrivi il problema in dettaglio"></textarea>
          </div>
          <p class="error-text" id="newTicketError"></p>
          <div>
            <button class="btn" type="submit">Invia richiesta</button>
          </div>
        </form>
      </div>`;

    guardForm(document.getElementById('newTicketForm'), async () => {
      const errEl = document.getElementById('newTicketError');
      errEl.textContent = '';
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: document.getElementById('category').value,
        priority: document.getElementById('priority').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value.trim(),
      };
      try {
        const { ticket } = await api('/tickets', { method: 'POST', body });
        showToast('Richiesta inviata con successo', 'success');
        location.hash = `#/ticket/${ticket.id}`;
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  async function renderTicketDetail(id) {
    appEl.innerHTML = `<div class="spinner-row">Caricamento...</div>`;
    let data;
    try {
      data = await api(`/tickets/${id}`);
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    const { ticket, activity } = data;
    const isOwner = ticket.created_by === state.user.id;
    const canEditFields = isOwner && !isStaff() && ticket.status === 'open';
    const canReopen = isOwner && !isStaff() && ['resolved', 'closed'].includes(ticket.status);

    let staffPanel = '';
    let assigneesOptions = '';
    let groupOptions = '';
    let assetOptions = '';
    if (isStaff()) {
      try {
        const { users } = await api('/users');
        const staffGroups = groupStaffByGroup(users);
        assigneesOptions = `<option value="">Non assegnato</option>` +
          staffGroups.map(({ group, members }) => `
            <optgroup label="${escapeHtml(group)}">
              ${members.map((u) => `<option value="${u.id}" ${ticket.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
            </optgroup>`).join('');
      } catch { assigneesOptions = ''; }

      try {
        const { groups } = await api('/groups');
        groupOptions = groupOptionsHtml(groups, ticket.group_id, 'Nessun gruppo');
      } catch { groupOptions = ''; }

      try {
        const { assets } = await api('/assets');
        assetOptions = `<option value="">Nessun asset</option>` +
          assets.map((a) => `<option value="${a.id}" ${ticket.asset_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)}${a.tag ? ` (${escapeHtml(a.tag)})` : ''}</option>`).join('');
      } catch { assetOptions = ''; }

      staffPanel = `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('shield')} Gestione</h3>
          <div class="side-field">
            <label for="statusSel">Stato</label>
            <select id="statusSel">
              ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${ticket.status === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="prioritySel">Priorità</label>
            <select id="prioritySel">
              ${Object.entries(PRIORITY_LABELS).map(([v, l]) => `<option value="${v}" ${ticket.priority === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="typeSel">Tipo</label>
            <select id="typeSel">
              ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${ticket.type === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="groupSel">Gruppo di assegnazione</label>
            <select id="groupSel">${groupOptions}</select>
          </div>
          <div class="side-field">
            <label for="assignedSel">Assegnato a</label>
            <select id="assignedSel">${assigneesOptions}</select>
          </div>
          <div class="side-field">
            <label for="assetSel">Asset collegato</label>
            <select id="assetSel">${assetOptions}</select>
          </div>
          <button id="saveMgmtBtn" class="btn btn-sm btn-block">Salva modifiche</button>
          ${state.user.role === 'admin' ? `<button id="deleteBtn" class="btn btn-sm btn-outline-danger btn-block" style="margin-top:0.5rem">Elimina ticket</button>` : ''}
        </div>`;
    }

    appEl.innerHTML = `
      <div class="view-header">
        <h1>#${ticket.id} ${escapeHtml(ticket.subject)}</h1>
        <a class="btn btn-ghost" href="#/dashboard">${icon('arrowLeft')} Torna alla lista</a>
      </div>
      <div id="presenceBanner" class="presence-banner" hidden></div>
      <div class="ticket-detail-grid">
        <div>
          <div class="card" style="margin-bottom:1rem">
            <div class="badges" style="margin-bottom:0.75rem">
              <span class="badge badge-type-${ticket.type}">${icon(ticket.type, 'badge-icon')}${TYPE_LABELS[ticket.type] || ticket.type}</span>
              <span class="badge badge-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
              <span class="badge badge-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
              <span class="badge">${escapeHtml(ticket.category)}</span>
              ${ticket.sla_status ? `<span class="badge badge-sla-${ticket.sla_status}">${SLA_LABELS[ticket.sla_status]}</span>` : ''}
            </div>
            ${canEditFields ? `
              <form id="editForm" class="form-grid" style="max-width:none">
                <div class="field">
                  <label for="editSubject">Oggetto</label>
                  <input id="editSubject" type="text" value="${escapeHtml(ticket.subject)}" />
                </div>
                <div class="field">
                  <label for="editDescription">Descrizione</label>
                  <textarea id="editDescription">${escapeHtml(ticket.description)}</textarea>
                </div>
                <div><button class="btn btn-sm" type="submit">Aggiorna</button></div>
              </form>
            ` : `<p style="white-space:pre-wrap">${escapeHtml(ticket.description)}</p>`}
            <p class="ticket-meta">
              Creato da ${escapeHtml(ticket.creator_name)} il ${formatDate(ticket.created_at)}
              ${ticket.assignee_name ? ` · Assegnato a ${escapeHtml(ticket.assignee_name)}` : ''}
              ${groupLabel(ticket) ? ` · Gruppo ${escapeHtml(groupLabel(ticket))}` : ''}
              ${ticket.asset_name ? ` · Asset ${escapeHtml(ticket.asset_name)}` : ''}
            </p>
            ${canReopen ? `<button id="reopenBtn" class="btn btn-sm btn-ghost">${icon('refresh')} Riapri ticket</button>` : ''}
          </div>

          <div class="card">
            <h3 class="section-title" style="margin-top:0">Attività</h3>
            <div id="activityList">
              ${activity.length ? activity.map(renderActivityItem).join('') : '<p class="hint">Nessuna attività ancora.</p>'}
            </div>
            <form id="commentForm" class="form-grid" style="max-width:none;margin-top:1rem">
              <div class="field">
                <label for="commentMsg">Aggiungi un commento</label>
                <textarea id="commentMsg" required placeholder="Scrivi una risposta..."></textarea>
              </div>
              ${isStaff() ? `
              <label class="checkbox-field">
                <input type="checkbox" id="internalCheck" />
                Nota interna (visibile solo allo staff)
              </label>` : ''}
              <div><button class="btn btn-sm" type="submit">Invia</button></div>
            </form>
          </div>
        </div>
        <div>${staffPanel}</div>
      </div>`;

    guardForm(document.getElementById('commentForm'), async () => {
      const msgEl = document.getElementById('commentMsg');
      const internalEl = document.getElementById('internalCheck');
      if (!msgEl.value.trim()) return;
      try {
        const { activity: updated } = await api(`/tickets/${ticket.id}/comments`, {
          method: 'POST', body: { message: msgEl.value.trim(), is_internal: internalEl ? internalEl.checked : false },
        });
        document.getElementById('activityList').innerHTML = updated.map(renderActivityItem).join('');
        msgEl.value = '';
        if (internalEl) internalEl.checked = false;
        showToast('Commento aggiunto', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const editForm = document.getElementById('editForm');
    if (editForm) {
      guardForm(editForm, async () => {
        try {
          await api(`/tickets/${ticket.id}`, {
            method: 'PATCH',
            body: {
              subject: document.getElementById('editSubject').value.trim(),
              description: document.getElementById('editDescription').value.trim(),
            },
          });
          showToast('Ticket aggiornato', 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const reopenBtn = document.getElementById('reopenBtn');
    if (reopenBtn) {
      reopenBtn.addEventListener('click', async () => {
        try {
          await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { status: 'open' } });
          showToast('Ticket riaperto', 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const saveMgmtBtn = document.getElementById('saveMgmtBtn');
    if (saveMgmtBtn) {
      saveMgmtBtn.addEventListener('click', async () => {
        const assignedRaw = document.getElementById('assignedSel').value;
        const groupRaw = document.getElementById('groupSel').value;
        const assetRaw = document.getElementById('assetSel').value;
        try {
          await api(`/tickets/${ticket.id}`, {
            method: 'PATCH',
            body: {
              status: document.getElementById('statusSel').value,
              priority: document.getElementById('prioritySel').value,
              type: document.getElementById('typeSel').value,
              assigned_to: assignedRaw ? Number(assignedRaw) : null,
              group_id: groupRaw ? Number(groupRaw) : null,
              asset_id: assetRaw ? Number(assetRaw) : null,
            },
          });
          showToast('Ticket aggiornato', 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Eliminare definitivamente questo ticket?')) return;
        try {
          await api(`/tickets/${ticket.id}`, { method: 'DELETE' });
          showToast('Ticket eliminato', 'success');
          location.hash = '#/dashboard';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    setupTicketRealtime(ticket.id);
  }

  function setupTicketRealtime(ticketId) {
    const presence = { staff: new Set(), customer: new Set() };

    function updatePresenceBanner() {
      const banner = document.getElementById('presenceBanner');
      if (!banner) return;
      const parts = [];
      if (presence.staff.size && !isStaff()) {
        parts.push(`${icon('shield')} Un tecnico sta seguendo questo ticket in questo momento`);
      }
      if (presence.customer.size && isStaff()) {
        parts.push(`${icon('userCircle')} Il richiedente sta visualizzando questo ticket in questo momento`);
      }
      if (parts.length) {
        banner.hidden = false;
        banner.innerHTML = parts.join(' · ');
      } else {
        banner.hidden = true;
      }
    }

    connectTicketSocket(ticketId).then((socket) => {
      if (!socket) return;

      socket.on('activity:new', (item) => {
        const list = document.getElementById('activityList');
        if (!list) return;
        if (list.querySelector('.hint')) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', renderActivityItem(item));
        if (item.kind === 'comment' && item.author_role !== state.user.role) {
          showToast('Nuovo messaggio nel ticket', '');
        }
      });

      socket.on('ticket:updated', (updated) => {
        const badgesWrap = document.querySelector('.ticket-detail-grid .badges');
        if (badgesWrap) {
          badgesWrap.innerHTML = `
            <span class="badge badge-type-${updated.type}">${icon(updated.type, 'badge-icon')}${TYPE_LABELS[updated.type] || updated.type}</span>
            <span class="badge badge-${updated.status}">${STATUS_LABELS[updated.status]}</span>
            <span class="badge badge-${updated.priority}">${PRIORITY_LABELS[updated.priority]}</span>
            <span class="badge">${escapeHtml(updated.category)}</span>
            ${updated.sla_status ? `<span class="badge badge-sla-${updated.sla_status}">${SLA_LABELS[updated.sla_status]}</span>` : ''}`;
        }
        const statusSel = document.getElementById('statusSel');
        if (statusSel) statusSel.value = updated.status;
        const prioritySel = document.getElementById('prioritySel');
        if (prioritySel) prioritySel.value = updated.priority;
        const typeSel = document.getElementById('typeSel');
        if (typeSel) typeSel.value = updated.type;
        const assignedSel = document.getElementById('assignedSel');
        if (assignedSel) assignedSel.value = updated.assigned_to || '';
        const groupSel = document.getElementById('groupSel');
        if (groupSel) groupSel.value = updated.group_id || '';
        const assetSel = document.getElementById('assetSel');
        if (assetSel) assetSel.value = updated.asset_id || '';
      });

      socket.on('presence:staff-joined', ({ name }) => { presence.staff.add(name); updatePresenceBanner(); });
      socket.on('presence:staff-left', ({ name }) => { presence.staff.delete(name); updatePresenceBanner(); });
      socket.on('presence:customer-joined', ({ name }) => { presence.customer.add(name); updatePresenceBanner(); });
      socket.on('presence:customer-left', ({ name }) => { presence.customer.delete(name); updatePresenceBanner(); });
    });
  }

  function renderActivityItem(item) {
    if (item.kind === 'event') {
      return `
        <div class="activity-event">
          ${icon('activity')}
          <span>${escapeHtml(item.message)}${item.actor_name ? ` — ${escapeHtml(item.actor_name)}` : ''}</span>
          <span class="activity-event-time">${formatDate(item.created_at)}</span>
        </div>`;
    }
    return `
      <div class="comment ${item.is_internal ? 'is-internal' : ''}">
        <div class="comment-head">
          <span>${escapeHtml(item.author_name)} (${ROLE_LABELS[item.author_role] || item.author_role})${item.is_internal ? ' <span class="badge badge-internal">Nota interna</span>' : ''}</span>
          <span>${formatDate(item.created_at)}</span>
        </div>
        <div class="comment-body">${escapeHtml(item.message)}</div>
      </div>`;
  }

  async function renderAdmin() {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    const isAdmin = state.user.role === 'admin';
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('shield')} Amministrazione</h1></div>
      ${isAdmin ? `
      <div class="admin-grid" style="margin-bottom:1.25rem">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} Crea account staff</h3>
          <form id="createStaffForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="newName">Nome</label><input id="newName" required /></div>
            <div class="field"><label for="newEmail">Email</label><input id="newEmail" type="email" required /></div>
            <div class="field">
              <label for="newRole">Ruolo</label>
              <select id="newRole">
                <option value="agent">Agente</option>
                <option value="admin">Amministratore</option>
              </select>
            </div>
            <div class="field">
              <label for="newGroup">Gruppo di assegnazione (opzionale)</label>
              <select id="newGroup"><option value="">Nessun gruppo</option></select>
              <span class="hint">I membri dello stesso gruppo si vedono a vicenda nell'assegnazione dei ticket</span>
            </div>
            <p class="error-text" id="createStaffError"></p>
            <div><button class="btn btn-sm" type="submit">Crea account</button></div>
          </form>
          <div id="tempPasswordBox"></div>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('ticket')} Categorie ticket</h3>
          <p class="hint">Personalizza le categorie disponibili nel modulo di apertura ticket.</p>
          <form id="newCategoryForm" style="display:flex;gap:0.5rem;margin:0.75rem 0">
            <input id="newCategoryName" placeholder="Nuova categoria" style="flex:1;padding:0.55rem 0.7rem;border:1px solid var(--border);border-radius:var(--radius-sm)" />
            <button class="btn btn-sm" type="submit">Aggiungi</button>
          </form>
          <p class="error-text" id="categoryError"></p>
          <div id="categoriesList" class="spinner-row">Caricamento...</div>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('users')} Gruppi di assegnazione</h3>
          <p class="hint">Ogni gruppo ha un proprio SLA (ore per risposta/risoluzione), usato per calcolare lo stato SLA dei ticket.</p>
          <form id="newGroupForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <input id="newGroupName" placeholder="Nome gruppo" />
            <select id="newGroupParent"><option value="">Nessuno (gruppo di primo livello)</option></select>
            <div style="display:flex;gap:0.5rem">
              <input id="newGroupResponse" type="number" min="1" placeholder="SLA risposta (ore)" style="flex:1" />
              <input id="newGroupResolve" type="number" min="1" placeholder="SLA risoluzione (ore)" style="flex:1" />
            </div>
            <button class="btn btn-sm" type="submit">Crea gruppo</button>
          </form>
          <p class="error-text" id="groupError"></p>
          <div id="groupsList" class="spinner-row">Caricamento...</div>
        </div>
      </div>` : ''}
      <div id="usersWrap" class="card spinner-row">Caricamento...</div>`;

    if (isAdmin) {
      let groupOptionsCache = [];

      async function loadGroupOptions() {
        try {
          const { groups } = await api('/groups');
          groupOptionsCache = groups;
          const select = document.getElementById('newGroup');
          if (select) select.innerHTML = groupOptionsHtml(groups, '', 'Nessun gruppo');
          const parentSelect = document.getElementById('newGroupParent');
          if (parentSelect) parentSelect.innerHTML = groupOptionsHtml(groups, '', 'Nessuno (gruppo di primo livello)');
        } catch { groupOptionsCache = []; }
      }

      async function loadGroups() {
        const listEl = document.getElementById('groupsList');
        listEl.className = 'spinner-row';
        listEl.textContent = 'Caricamento...';
        try {
          const { groups } = await api('/groups');
          groupOptionsCache = groups;
          const flat = flattenGroupTree(buildGroupTree(groups));
          listEl.className = '';
          listEl.innerHTML = flat.length ? flat.map((g) => `
            <div class="group-row" style="padding-left:${g.depth * 1.25}rem">
              <span class="group-row-name">${g.depth ? '– ' : ''}${escapeHtml(g.name)}</span>
              <input type="number" min="1" class="slaInput" data-group-id="${g.id}" data-field="slaResponseHours" value="${g.sla_response_hours ?? ''}" placeholder="Risposta (h)" />
              <input type="number" min="1" class="slaInput" data-group-id="${g.id}" data-field="slaResolveHours" value="${g.sla_resolve_hours ?? ''}" placeholder="Risoluzione (h)" />
              <button type="button" class="icon-btn deleteGroupBtn" data-id="${g.id}" title="Elimina gruppo">${icon('trash')}</button>
            </div>`).join('') : '<p class="hint">Nessun gruppo.</p>';

          listEl.querySelectorAll('.slaInput').forEach((input) => {
            input.addEventListener('change', async () => {
              const groupId = input.dataset.groupId;
              const row = listEl.querySelector(`[data-group-id="${groupId}"][data-field="slaResponseHours"]`);
              const row2 = listEl.querySelector(`[data-group-id="${groupId}"][data-field="slaResolveHours"]`);
              try {
                await api(`/groups/${groupId}`, {
                  method: 'PATCH',
                  body: { slaResponseHours: row.value || null, slaResolveHours: row2.value || null },
                });
                showToast('SLA aggiornata', 'success');
                loadGroupOptions();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });

          listEl.querySelectorAll('.deleteGroupBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm('Eliminare questo gruppo?')) return;
              try {
                await api(`/groups/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Gruppo eliminato', 'success');
                loadGroups();
                loadGroupOptions();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
        } catch (err) {
          listEl.className = '';
          listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
      }

      guardForm(document.getElementById('newGroupForm'), async () => {
        const errEl = document.getElementById('groupError');
        errEl.textContent = '';
        const name = document.getElementById('newGroupName').value.trim();
        if (!name) return;
        try {
          await api('/groups', {
            method: 'POST',
            body: {
              name,
              parentId: document.getElementById('newGroupParent').value || null,
              slaResponseHours: document.getElementById('newGroupResponse').value || null,
              slaResolveHours: document.getElementById('newGroupResolve').value || null,
            },
          });
          document.getElementById('newGroupForm').reset();
          showToast('Gruppo creato', 'success');
          loadGroups();
          loadGroupOptions();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadGroupOptions();
      loadGroups();

      guardForm(document.getElementById('createStaffForm'), async (e) => {
        const errEl = document.getElementById('createStaffError');
        errEl.textContent = '';
        const body = {
          name: document.getElementById('newName').value.trim(),
          email: document.getElementById('newEmail').value.trim(),
          role: document.getElementById('newRole').value,
          groupId: document.getElementById('newGroup').value || null,
        };
        try {
          const { user, tempPassword } = await api('/users', { method: 'POST', body });
          document.getElementById('tempPasswordBox').innerHTML = `
            <div class="divider"></div>
            <p class="success-text">Account creato per ${escapeHtml(user.name)}.</p>
            <p class="hint">Password temporanea (comunicala in modo sicuro, non sarà più visibile):</p>
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-block">${escapeHtml(tempPassword)}</p>`;
          e.target.reset();
          showToast('Account staff creato', 'success');
          loadUsersTable();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      async function loadCategories() {
        const listEl = document.getElementById('categoriesList');
        listEl.className = 'spinner-row';
        listEl.textContent = 'Caricamento...';
        try {
          const { categories } = await api('/categories');
          listEl.className = '';
          listEl.innerHTML = categories.length ? categories.map((c) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-top:1px solid var(--border)">
              <span>${escapeHtml(c.name)}</span>
              <button type="button" class="icon-btn deleteCategoryBtn" data-id="${c.id}" title="Elimina categoria">${icon('trash')}</button>
            </div>`).join('') : '<p class="hint">Nessuna categoria.</p>';

          listEl.querySelectorAll('.deleteCategoryBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/categories/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Categoria eliminata', 'success');
                loadCategories();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
        } catch (err) {
          listEl.className = '';
          listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
      }

      guardForm(document.getElementById('newCategoryForm'), async () => {
        const input = document.getElementById('newCategoryName');
        const errEl = document.getElementById('categoryError');
        errEl.textContent = '';
        if (!input.value.trim()) return;
        try {
          await api('/categories', { method: 'POST', body: { name: input.value.trim() } });
          input.value = '';
          showToast('Categoria aggiunta', 'success');
          loadCategories();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadCategories();
    }

    async function loadUsersTable() {
      const wrap = document.getElementById('usersWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = 'Caricamento...';
      try {
        const { users } = await api('/users');
        const groups = isAdmin ? (await api('/groups')).groups : [];
        wrap.className = 'card';
        wrap.innerHTML = `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Gruppo</th><th>Registrato</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${users.map((u) => `
                  <tr>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td><span class="role-tag">${ROLE_LABELS[u.role] || u.role}</span></td>
                    <td>
                      ${isAdmin && u.role !== 'customer' ? `
                        <select class="groupSel" data-user-id="${u.id}">${groupOptionsHtml(groups, u.group_id, 'Nessun gruppo')}</select>
                      ` : escapeHtml(u.group_name ? (u.group_parent_name ? `${u.group_parent_name} / ${u.group_name}` : u.group_name) : '—')}
                    </td>
                    <td>${formatDate(u.created_at)}</td>
                    ${isAdmin ? `
                      <td>
                        ${u.id === state.user.id ? '' : `
                        <select data-user-id="${u.id}" class="roleSel">
                          ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select>`}
                      </td>` : ''}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;

        wrap.querySelectorAll('.groupSel').forEach((select) => {
          select.addEventListener('change', async () => {
            try {
              await api(`/users/${select.dataset.userId}/group`, { method: 'PATCH', body: { groupId: select.value || null } });
              showToast('Gruppo aggiornato', 'success');
            } catch (err) {
              showToast(err.message, 'error');
              loadUsersTable();
            }
          });
        });

        wrap.querySelectorAll('.roleSel').forEach((sel) => {
          sel.addEventListener('change', async () => {
            try {
              await api(`/users/${sel.dataset.userId}/role`, { method: 'PATCH', body: { role: sel.value } });
              showToast('Ruolo aggiornato', 'success');
            } catch (err) {
              showToast(err.message, 'error');
              loadUsersTable();
            }
          });
        });
      } catch (err) {
        wrap.className = '';
        wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    loadUsersTable();
  }

  async function renderBacklog() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('inbox')} Backlog</h1>
          <p class="hint">Ticket non assegnati, in ordine di urgenza SLA.</p>
        </div>
      </div>
      <div id="ticketList" class="skeleton-grid">
        ${Array(4).fill('<div class="skeleton-card"></div>').join('')}
      </div>`;

    const listEl = document.getElementById('ticketList');
    try {
      const { tickets } = await api('/tickets?assigned=unassigned');
      const open = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
      const order = { breached: 0, at_risk: 1, on_track: 2 };
      open.sort((a, b) => {
        const sa = order[a.sla_status] ?? 3;
        const sb = order[b.sla_status] ?? 3;
        if (sa !== sb) return sa - sb;
        return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
      });
      renderTicketList(listEl, open);
    } catch (err) {
      listEl.className = '';
      listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderAssets() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('ticket')} Asset</h1>
          <p class="hint">Inventario dispositivi, assegnazioni permanenti e prestiti.</p>
        </div>
      </div>
      <div class="card" style="margin-bottom:1.25rem;max-width:640px">
        <h3 class="section-title" style="margin-top:0">Nuovo asset</h3>
        <form id="newAssetForm" class="form-grid" style="max-width:none">
          <div class="field"><label for="assetName">Nome</label><input id="assetName" required placeholder="es. Laptop Dell XPS #12" /></div>
          <div style="display:flex;gap:0.75rem">
            <div class="field" style="flex:1">
              <label for="assetType">Tipo</label>
              <select id="assetType">${Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
            </div>
            <div class="field" style="flex:1"><label for="assetTag">Tag/matricola</label><input id="assetTag" placeholder="es. IT-0012" /></div>
          </div>
          <div><button class="btn btn-sm" type="submit">Aggiungi asset</button></div>
        </form>
      </div>
      <div class="filters">
        <select id="assetStatusFilter">
          <option value="">Tutti gli stati</option>
          ${Object.entries(ASSET_STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div id="assetsWrap" class="card spinner-row">Caricamento...</div>`;

    let usersCache = [];
    try {
      usersCache = (await api('/users')).users.filter((u) => u.role !== 'customer');
    } catch { usersCache = []; }

    const statusFilter = document.getElementById('assetStatusFilter');

    async function loadAssets() {
      const wrap = document.getElementById('assetsWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = 'Caricamento...';
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        const { assets } = await api(`/assets?${params.toString()}`);
        wrap.className = 'card';
        wrap.innerHTML = assets.length ? `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th>Nome</th><th>Tipo</th><th>Tag</th><th>Stato</th><th>Assegnazione</th><th>Assegnato a</th><th>Scadenza</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${assets.map((a) => `
                  <tr>
                    <td>${escapeHtml(a.name)}</td>
                    <td>${ASSET_TYPE_LABELS[a.asset_type] || a.asset_type}</td>
                    <td>${escapeHtml(a.tag || '—')}</td>
                    <td>
                      <select class="assetStatusSel groupSel" data-id="${a.id}">
                        ${Object.entries(ASSET_STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${a.status === v ? 'selected' : ''}>${l}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <select class="assetAssignTypeSel groupSel" data-id="${a.id}">
                        <option value="permanente" ${a.assignment_type === 'permanente' ? 'selected' : ''}>Permanente</option>
                        <option value="prestito" ${a.assignment_type === 'prestito' ? 'selected' : ''}>Prestito</option>
                      </select>
                    </td>
                    <td>
                      <select class="assetAssigneeSel groupSel" data-id="${a.id}">
                        <option value="">Nessuno</option>
                        ${usersCache.map((u) => `<option value="${u.id}" ${a.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
                      </select>
                    </td>
                    <td><input type="date" class="assetDueInput" data-id="${a.id}" value="${a.due_date || ''}" ${a.assignment_type !== 'prestito' ? 'disabled' : ''} /></td>
                    ${state.user.role === 'admin' ? `<td><button type="button" class="icon-btn deleteAssetBtn" data-id="${a.id}" title="Elimina asset">${icon('trash')}</button></td>` : ''}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p class="hint">Nessun asset trovato.</p>';

        wrap.querySelectorAll('.assetStatusSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { status: sel.value } });
            showToast('Stato asset aggiornato', 'success');
          } catch (err) { showToast(err.message, 'error'); loadAssets(); }
        }));
        wrap.querySelectorAll('.assetAssignTypeSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { assignmentType: sel.value } });
            showToast('Assegnazione aggiornata', 'success');
            loadAssets();
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.assetAssigneeSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { assignedTo: sel.value ? Number(sel.value) : null } });
            showToast('Assegnatario aggiornato', 'success');
            loadAssets();
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.assetDueInput').forEach((input) => input.addEventListener('change', async () => {
          try {
            await api(`/assets/${input.dataset.id}`, { method: 'PATCH', body: { dueDate: input.value || null } });
            showToast('Scadenza aggiornata', 'success');
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.deleteAssetBtn').forEach((btn) => btn.addEventListener('click', async () => {
          if (!confirm('Eliminare questo asset?')) return;
          try {
            await api(`/assets/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('Asset eliminato', 'success');
            loadAssets();
          } catch (err) { showToast(err.message, 'error'); }
        }));
      } catch (err) {
        wrap.className = '';
        wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    statusFilter.addEventListener('change', loadAssets);

    guardForm(document.getElementById('newAssetForm'), async () => {
      try {
        await api('/assets', {
          method: 'POST',
          body: {
            name: document.getElementById('assetName').value.trim(),
            assetType: document.getElementById('assetType').value,
            tag: document.getElementById('assetTag').value.trim(),
          },
        });
        document.getElementById('newAssetForm').reset();
        showToast('Asset creato', 'success');
        loadAssets();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    loadAssets();
  }

  async function renderSearch() {
    let groups = [];
    try { groups = (await api('/groups')).groups; } catch { groups = []; }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('inbox')} Ricerca</h1>
          <p class="hint">Cerca per numero ticket, parola chiave o richiedente: i risultati compaiono mentre scrivi.</p>
        </div>
      </div>
      <div class="filters">
        <input id="searchQuery" type="search" placeholder="Numero ticket, parola chiave, richiedente..." style="flex:2 1 260px" autofocus />
        <select id="searchType">
          <option value="">Tutti i tipi</option>
          ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchStatus">
          <option value="">Tutti gli stati</option>
          ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchPriority">
          <option value="">Tutte le priorità</option>
          ${Object.entries(PRIORITY_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchGroup">${groupOptionsHtml(groups, '', 'Tutti i gruppi')}</select>
      </div>
      <div id="searchResults" class="ticket-grid"></div>`;

    const resultsEl = document.getElementById('searchResults');
    const qEl = document.getElementById('searchQuery');
    const typeEl = document.getElementById('searchType');
    const statusEl = document.getElementById('searchStatus');
    const priorityEl = document.getElementById('searchPriority');
    const groupEl = document.getElementById('searchGroup');

    let debounceTimer;
    async function runSearch() {
      const params = new URLSearchParams();
      if (qEl.value.trim()) params.set('q', qEl.value.trim());
      if (typeEl.value) params.set('type', typeEl.value);
      if (statusEl.value) params.set('status', statusEl.value);
      if (priorityEl.value) params.set('priority', priorityEl.value);
      if (groupEl.value) params.set('group', groupEl.value);
      try {
        const { tickets } = await api(`/tickets?${params.toString()}`);
        renderTicketList(resultsEl, tickets);
      } catch (err) {
        resultsEl.className = '';
        resultsEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    qEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 200);
    });
    [typeEl, statusEl, priorityEl, groupEl].forEach((el) => el.addEventListener('change', runSearch));

    runSearch();
  }

  async function renderReport() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('activity')} Report</h1>
          <p class="hint">Volumi, tempi di risoluzione e rispetto SLA per gruppo e per agente.</p>
        </div>
      </div>
      <div id="reportCharts" class="charts-row spinner-row">Caricamento...</div>`;

    const chartsEl = document.getElementById('reportCharts');
    try {
      const { tickets } = await api('/tickets');

      const groupCounts = new Map();
      tickets.forEach((t) => {
        const key = groupLabel(t) || 'Senza gruppo';
        groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
      });
      const volumeRows = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));

      const resolved = tickets.filter((t) => t.resolved_at);
      const avgByGroup = new Map();
      resolved.forEach((t) => {
        const key = groupLabel(t) || 'Senza gruppo';
        const hours = (new Date(t.resolved_at.replace(' ', 'T') + 'Z') - new Date(t.created_at.replace(' ', 'T') + 'Z')) / 3600000;
        if (!avgByGroup.has(key)) avgByGroup.set(key, []);
        avgByGroup.get(key).push(hours);
      });
      const avgRows = [...avgByGroup.entries()].map(([label, values]) => ({
        key: label, label, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, color: 'var(--warning)',
      })).sort((a, b) => b.value - a.value);

      const slaByGroup = new Map();
      resolved.filter((t) => t.sla_status).forEach((t) => {
        const key = groupLabel(t) || 'Senza gruppo';
        if (!slaByGroup.has(key)) slaByGroup.set(key, { met: 0, total: 0 });
        const entry = slaByGroup.get(key);
        entry.total += 1;
        if (t.sla_status === 'on_track') entry.met += 1;
      });
      const slaRows = [...slaByGroup.entries()].map(([label, { met, total }]) => ({
        key: label, label, value: Math.round((met / total) * 100), color: 'var(--success)',
      })).sort((a, b) => b.value - a.value);

      const agentCounts = new Map();
      tickets.forEach((t) => {
        if (!t.assignee_name) return;
        agentCounts.set(t.assignee_name, (agentCounts.get(t.assignee_name) || 0) + 1);
      });
      const agentRows = [...agentCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));

      chartsEl.className = 'charts-row';
      chartsEl.innerHTML = `
        <div class="card chart-card">
          <h3 class="section-title" style="margin-top:0">Volume ticket per gruppo</h3>
          ${volumeRows.length ? barChart(volumeRows, tickets.length) : '<p class="hint">Nessun dato.</p>'}
        </div>
        <div class="card chart-card">
          <h3 class="section-title" style="margin-top:0">Tempo medio di risoluzione (ore) per gruppo</h3>
          ${avgRows.length ? barChart(avgRows, 0, { showPct: false, suffix: ' h' }) : '<p class="hint">Nessun ticket risolto ancora.</p>'}
        </div>
        <div class="card chart-card">
          <h3 class="section-title" style="margin-top:0">SLA rispettata per gruppo (%)</h3>
          ${slaRows.length ? barChart(slaRows, 0, { showPct: false, suffix: '%' }) : '<p class="hint">Nessun gruppo con SLA configurata.</p>'}
        </div>
        <div class="card chart-card">
          <h3 class="section-title" style="margin-top:0">Carico ticket per agente</h3>
          ${agentRows.length ? barChart(agentRows, tickets.length) : '<p class="hint">Nessun ticket assegnato.</p>'}
        </div>`;
    } catch (err) {
      chartsEl.className = '';
      chartsEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderProfile() {
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('userCircle')} Profilo</h1></div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">Il tuo account</h3>
          <p><strong>${escapeHtml(state.user.name)}</strong></p>
          <p class="hint">${escapeHtml(state.user.email)}</p>
          <p><span class="role-tag">${ROLE_LABELS[state.user.role] || state.user.role}</span></p>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('lock')} Cambia password</h3>
          <form id="pwForm" class="form-grid" style="max-width:none">
            <div class="field">
              <label for="currentPassword">Password attuale</label>
              <input id="currentPassword" type="password" required autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="newPassword">Nuova password</label>
              <input id="newPassword" type="password" required minlength="6" autocomplete="new-password" />
            </div>
            <div class="field">
              <label for="newPassword2">Conferma nuova password</label>
              <input id="newPassword2" type="password" required minlength="6" autocomplete="new-password" />
            </div>
            <p class="error-text" id="pwError"></p>
            <div><button class="btn btn-sm" type="submit">Aggiorna password</button></div>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('userCircle')} Cambia email</h3>
          <form id="emailForm" class="form-grid" style="max-width:none">
            <div class="field">
              <label for="currentPasswordForEmail">Password attuale</label>
              <input id="currentPasswordForEmail" type="password" required autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="newEmail">Nuova email</label>
              <input id="newEmail" type="email" required autocomplete="email" />
            </div>
            <p class="error-text" id="emailError"></p>
            <div><button class="btn btn-sm" type="submit">Aggiorna email</button></div>
          </form>
        </div>
      </div>`;

    guardForm(document.getElementById('pwForm'), async (e) => {
      const errEl = document.getElementById('pwError');
      errEl.textContent = '';
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const newPassword2 = document.getElementById('newPassword2').value;
      if (newPassword !== newPassword2) {
        errEl.textContent = 'Le nuove password non coincidono';
        return;
      }
      try {
        await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
        showToast('Password aggiornata', 'success');
        e.target.reset();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    guardForm(document.getElementById('emailForm'), async () => {
      const errEl = document.getElementById('emailError');
      errEl.textContent = '';
      const currentPassword = document.getElementById('currentPasswordForEmail').value;
      const newEmail = document.getElementById('newEmail').value.trim();
      try {
        const { user } = await api('/auth/change-email', { method: 'POST', body: { currentPassword, newEmail } });
        state.user = user;
        updateChrome();
        showToast('Email aggiornata', 'success');
        renderProfile();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function renderSettings() {
    const currentLang = getLang();
    const currentAccent = getAccent();
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('plug')} Impostazioni</h1></div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">Lingua</h3>
          <p class="hint">Scegli la lingua dell'interfaccia.</p>
          <div class="field">
            <label for="langSel">Lingua</label>
            <select id="langSel">
              ${Object.entries(LANG_LABELS).map(([v, l]) => `<option value="${v}" ${currentLang === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">Personalizzazione</h3>
          <p class="hint">Scegli il colore principale dell'interfaccia.</p>
          <div class="accent-swatches">
            ${Object.entries(ACCENT_PRESETS).map(([key, preset]) => `
              <button type="button" class="accent-swatch ${currentAccent === key ? 'active' : ''}" data-accent="${key}" style="background:${preset.primary}" title="${escapeHtml(preset.label)}"></button>
            `).join('')}
          </div>
        </div>
      </div>`;

    document.getElementById('langSel').addEventListener('change', (e) => {
      setLang(e.target.value);
      applyChromeTranslations();
      showToast('Lingua aggiornata', 'success');
      route();
    });

    document.querySelectorAll('.accent-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        setAccent(btn.dataset.accent);
        document.querySelectorAll('.accent-swatch').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        showToast('Colore aggiornato', 'success');
      });
    });
  }

  function renderNotFound() {
    appEl.innerHTML = `<div class="card"><p>Pagina non trovata. <a href="#/dashboard">Torna alla dashboard</a></p></div>`;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').then((registration) => {
        registration.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update();
        });
      }).catch(() => {});
    });

    let hasReloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      window.location.reload();
    });
  }

  const installBtn = document.getElementById('installBtn');
  let deferredInstallPrompt = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  installBtn.innerHTML = icon('download');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.style.display = '';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
    showToast('App installata con successo', 'success');
  });

  if (isIos && !isStandalone) {
    installBtn.style.display = '';
  }

  installBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice.outcome === 'accepted') installBtn.style.display = 'none';
      return;
    }
    if (isIos) {
      showToast('Per installare: tocca Condividi, poi "Aggiungi alla schermata Home"', '');
    }
  });

  applyAccent(getAccent());
  applyChromeTranslations();
  updateChrome();
  route();
})();
