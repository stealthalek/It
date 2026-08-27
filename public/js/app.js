(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('ticketing_token') || null,
    user: null,
  };

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
    devices: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    building: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1"/><path d="M14 9h1"/><path d="M9 13h1"/><path d="M14 13h1"/><path d="M9 17h1"/><path d="M14 17h1"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
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

  const HOSTED_DEFAULT_API_BASE = 'https://it-ticketing-api-2g68.onrender.com';

  function getApiBase() {
    const stored = localStorage.getItem('ticketing_api_base');
    if (stored) return stored.replace(/\/+$/, '');
    if (location.hostname.endsWith('github.io')) return HOSTED_DEFAULT_API_BASE;
    return '';
  }

  function setApiBase(url) {
    if (url) localStorage.setItem('ticketing_api_base', url.replace(/\/+$/, ''));
    else localStorage.removeItem('ticketing_api_base');
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

  logoutBtn.innerHTML = `${icon('logout')} Esci`;
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

    try {
      switch (page) {
        case 'login': return renderLogin();
        case 'register': return renderRegister();
        case 'dashboard': return renderDashboard();
        case 'new': return renderNewTicket();
        case 'ticket': return renderTicketDetail(param);
        case 'admin': return renderAdmin();
        case 'directory': return renderDirectory();
        case 'devices': return renderDevices();
        case 'profile': return renderProfile();
        case 'settings': return renderSettings();
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
          <h1>${icon('lock')} Accedi</h1>
          <p class="hint">Entra nella piattaforma di ticketing.</p>
          <form id="loginForm" class="form-grid">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <div class="password-field">
                <input id="password" type="password" required autocomplete="current-password" />
                <button type="button" id="pwToggle" class="icon-btn password-toggle" aria-label="Mostra password"></button>
              </div>
            </div>
            <p class="error-text" id="loginError"></p>
            <button class="btn btn-block" type="submit">Accedi</button>
          </form>
          <div id="ssoContainer"></div>
          <p class="hint">Non hai un account? <a href="#/register">Registrati</a></p>
        </div>
      </div>`;

    attachPasswordToggle('password', 'pwToggle');
    renderSsoButtons('ssoContainer');

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
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
          <h1>${icon('userCircle')} Crea un account</h1>
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
            <button class="btn btn-block" type="submit">Registrati</button>
          </form>
          <div id="ssoContainer"></div>
          <p class="hint">Hai già un account? <a href="#/login">Accedi</a></p>
        </div>
      </div>`;

    attachPasswordToggle('password', 'pwToggle');
    attachPasswordToggle('password2', 'pwToggle2');
    renderSsoButtons('ssoContainer');

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
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

  async function renderDashboard() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${isStaff() ? 'Tutti i ticket' : 'I miei ticket'}</h1>
          <p class="hint">${isStaff() ? 'Gestisci e rispondi alle richieste di assistenza.' : 'Consulta lo stato delle tue richieste.'}</p>
        </div>
        <a class="btn" href="#/new">${icon('plus')} Nuovo ticket</a>
      </div>
      <div id="statsRow" class="stat-row"></div>
      <div class="filters">
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
        <input id="fQuery" type="search" placeholder="Cerca..." />
      </div>
      <div id="ticketList" class="skeleton-grid">
        ${Array(4).fill('<div class="skeleton-card"></div>').join('')}
      </div>`;

    const listEl = document.getElementById('ticketList');
    const statsEl = document.getElementById('statsRow');
    const fStatus = document.getElementById('fStatus');
    const fPriority = document.getElementById('fPriority');
    const fAssigned = document.getElementById('fAssigned');
    const fQuery = document.getElementById('fQuery');

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

    let debounceTimer;
    async function load() {
      const params = new URLSearchParams();
      if (fStatus.value) params.set('status', fStatus.value);
      if (fPriority.value) params.set('priority', fPriority.value);
      if (fAssigned && fAssigned.value) params.set('assigned', fAssigned.value);
      if (fQuery.value.trim()) params.set('q', fQuery.value.trim());

      try {
        const { tickets } = await api(`/tickets?${params.toString()}`);
        renderStats(tickets);
        renderTicketList(listEl, tickets);
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    [fStatus, fPriority, fAssigned].forEach((el) => el && el.addEventListener('change', load));
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
          <span class="badge badge-${t.status}">${STATUS_LABELS[t.status]}</span>
          <span class="badge badge-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        </div>
        <h3>#${t.id} ${escapeHtml(t.subject)}</h3>
        <p class="ticket-desc">${escapeHtml(t.description)}</p>
        <div class="ticket-meta">
          Di ${escapeHtml(t.creator_name)} · ${formatDate(t.updated_at)}
          ${t.assignee_name ? ` · Assegnato a ${escapeHtml(t.assignee_name)}` : ''}
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

    document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('newTicketError');
      errEl.textContent = '';
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: document.getElementById('category').value,
        priority: document.getElementById('priority').value,
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
    let deviceOptions = '';
    if (isStaff()) {
      try {
        const { users } = await api('/users');
        const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
        assigneesOptions = `<option value="">Non assegnato</option>` +
          staffUsers.map((u) => `<option value="${u.id}" ${ticket.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
      } catch { assigneesOptions = ''; }

      try {
        const { devices } = await api('/devices');
        deviceOptions = `<option value="">Nessuno</option>` +
          devices.map((d) => `<option value="${d.id}" ${ticket.device_id === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');
      } catch { deviceOptions = ''; }

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
            <label for="assignedSel">Assegnato a</label>
            <select id="assignedSel">${assigneesOptions}</select>
          </div>
          <div class="side-field">
            <label for="deviceSel">${icon('devices')} Dispositivo collegato</label>
            <select id="deviceSel">${deviceOptions}</select>
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
      <div class="ticket-detail-grid">
        <div>
          <div class="card" style="margin-bottom:1rem">
            <div class="badges" style="margin-bottom:0.75rem">
              <span class="badge badge-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
              <span class="badge badge-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
              <span class="badge">${escapeHtml(ticket.category)}</span>
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
              ${ticket.device_name ? ` · Dispositivo: ${escapeHtml(ticket.device_name)}` : ''}
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

    document.getElementById('commentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
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
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
        const deviceRaw = document.getElementById('deviceSel').value;
        try {
          await api(`/tickets/${ticket.id}`, {
            method: 'PATCH',
            body: {
              status: document.getElementById('statusSel').value,
              priority: document.getElementById('prioritySel').value,
              assigned_to: assignedRaw ? Number(assignedRaw) : null,
              device_id: deviceRaw ? Number(deviceRaw) : null,
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
      <div class="two-col" style="margin-bottom:1.25rem">
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
          <h3 class="section-title" style="margin-top:0">${icon('building')} Reparti</h3>
          <p class="hint">Organizza gli utenti in reparti, visibili nella Directory aziendale.</p>
          <form id="newGroupForm" style="display:flex;gap:0.5rem;margin:0.75rem 0">
            <input id="newGroupName" placeholder="Nuovo reparto" style="flex:1;padding:0.55rem 0.7rem;border:1px solid var(--border);border-radius:var(--radius-sm)" />
            <button class="btn btn-sm" type="submit">Aggiungi</button>
          </form>
          <p class="error-text" id="groupError"></p>
          <div id="groupsList" class="spinner-row">Caricamento...</div>
        </div>
      </div>` : ''}
      <div id="usersWrap" class="card spinner-row">Caricamento...</div>`;

    if (isAdmin) {
      document.getElementById('createStaffForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('createStaffError');
        errEl.textContent = '';
        const body = {
          name: document.getElementById('newName').value.trim(),
          email: document.getElementById('newEmail').value.trim(),
          role: document.getElementById('newRole').value,
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

      document.getElementById('newCategoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
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

      async function loadGroups() {
        const listEl = document.getElementById('groupsList');
        listEl.className = 'spinner-row';
        listEl.textContent = 'Caricamento...';
        try {
          const { groups } = await api('/groups');
          listEl.className = '';
          listEl.innerHTML = groups.length ? groups.map((g) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-top:1px solid var(--border)">
              <span>${escapeHtml(g.name)} <span class="hint">(${g.member_count})</span></span>
              <button type="button" class="icon-btn deleteGroupBtn" data-id="${g.id}" title="Elimina reparto">${icon('trash')}</button>
            </div>`).join('') : '<p class="hint">Nessun reparto.</p>';

          listEl.querySelectorAll('.deleteGroupBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/groups/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Reparto eliminato', 'success');
                loadGroups();
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

      document.getElementById('newGroupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('newGroupName');
        const errEl = document.getElementById('groupError');
        errEl.textContent = '';
        if (!input.value.trim()) return;
        try {
          await api('/groups', { method: 'POST', body: { name: input.value.trim() } });
          input.value = '';
          showToast('Reparto aggiunto', 'success');
          loadGroups();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadGroups();
    }

    async function loadUsersTable() {
      const wrap = document.getElementById('usersWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = 'Caricamento...';
      try {
        const { users } = await api('/users');
        wrap.className = 'card';
        wrap.innerHTML = `
          <table class="users-table">
            <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Registrato</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr>
                  <td>${escapeHtml(u.name)}</td>
                  <td>${escapeHtml(u.email)}</td>
                  <td><span class="role-tag">${ROLE_LABELS[u.role] || u.role}</span></td>
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
          </table>`;

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

  async function renderDirectory() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('building')} Directory</h1>
          <p class="hint">Organigramma aziendale: utenti, reparti e responsabili.</p>
        </div>
      </div>
      <div class="filters">
        <input id="dirSearch" type="search" placeholder="Cerca per nome, reparto o ruolo..." style="flex:1;min-width:220px" />
      </div>
      <div id="directoryWrap" class="card spinner-row">Caricamento...</div>`;

    const isAdmin = state.user.role === 'admin';
    let users = [];
    let groups = [];
    try {
      const [usersData, groupsData] = await Promise.all([api('/users'), api('/groups')]);
      users = usersData.users;
      groups = groupsData.groups;
    } catch (err) {
      document.getElementById('directoryWrap').innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      return;
    }

    function renderTable(filterText) {
      const wrap = document.getElementById('directoryWrap');
      const term = (filterText || '').toLowerCase();
      const filtered = users.filter((u) =>
        !term ||
        u.name.toLowerCase().includes(term) ||
        (u.group_name || '').toLowerCase().includes(term) ||
        ROLE_LABELS[u.role].toLowerCase().includes(term)
      );

      wrap.className = 'card';
      wrap.innerHTML = `
        <table class="users-table">
          <thead><tr><th>Nome</th><th>Reparto</th><th>Ruolo</th><th>Titolo</th><th>Responsabile</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${filtered.map((u) => `
              <tr>
                <td>${escapeHtml(u.name)}<div class="hint">${escapeHtml(u.email)}</div></td>
                <td>${u.group_name ? escapeHtml(u.group_name) : '<span class="hint">—</span>'}</td>
                <td><span class="role-tag">${ROLE_LABELS[u.role] || u.role}</span></td>
                <td>${u.job_title ? escapeHtml(u.job_title) : '<span class="hint">—</span>'}</td>
                <td>${u.manager_name ? escapeHtml(u.manager_name) : '<span class="hint">—</span>'}</td>
                ${isAdmin ? `<td><button type="button" class="icon-btn editUserBtn" data-id="${u.id}" title="Modifica profilo">${icon('edit')}</button></td>` : ''}
              </tr>
              ${isAdmin ? `
              <tr id="editRow-${u.id}" class="edit-row" style="display:none">
                <td colspan="6">
                  <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;padding:0.5rem 0">
                    <div class="field" style="min-width:160px">
                      <label>Reparto</label>
                      <select id="groupSel-${u.id}">
                        <option value="">Nessuno</option>
                        ${groups.map((g) => `<option value="${g.id}" ${u.group_id === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field" style="min-width:160px">
                      <label>Titolo</label>
                      <input id="titleInput-${u.id}" value="${escapeHtml(u.job_title || '')}" />
                    </div>
                    <div class="field" style="min-width:160px">
                      <label>Responsabile</label>
                      <select id="managerSel-${u.id}">
                        <option value="">Nessuno</option>
                        ${users.filter((m) => m.id !== u.id).map((m) => `<option value="${m.id}" ${u.manager_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
                      </select>
                    </div>
                    <button type="button" class="btn btn-sm saveProfileBtn" data-id="${u.id}">Salva</button>
                  </div>
                </td>
              </tr>` : ''}
            `).join('')}
          </tbody>
        </table>`;

      wrap.querySelectorAll('.editUserBtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = document.getElementById(`editRow-${btn.dataset.id}`);
          row.style.display = row.style.display === 'none' ? '' : 'none';
        });
      });

      wrap.querySelectorAll('.saveProfileBtn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const groupVal = document.getElementById(`groupSel-${id}`).value;
          const managerVal = document.getElementById(`managerSel-${id}`).value;
          const titleVal = document.getElementById(`titleInput-${id}`).value;
          try {
            await api(`/users/${id}/profile`, {
              method: 'PATCH',
              body: {
                group_id: groupVal ? Number(groupVal) : null,
                manager_id: managerVal ? Number(managerVal) : null,
                job_title: titleVal,
              },
            });
            showToast('Profilo aggiornato', 'success');
            renderDirectory();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    renderTable('');
    document.getElementById('dirSearch').addEventListener('input', (e) => renderTable(e.target.value));
  }

  async function renderDevices() {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }

    let users = [];
    try {
      users = (await api('/users')).users;
    } catch { users = []; }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('devices')} Dispositivi</h1>
          <p class="hint">Inventario di laptop, desktop, telefoni e tablet aziendali.</p>
        </div>
      </div>
      <div class="card" style="margin-bottom:1.25rem;max-width:640px">
        <h3 class="section-title" style="margin-top:0">${icon('plus')} Nuovo dispositivo</h3>
        <form id="newDeviceForm" class="form-grid" style="max-width:none;grid-template-columns:1fr 1fr" >
          <div class="field"><label>Nome</label><input id="devName" required placeholder="es. Laptop Marketing 03" /></div>
          <div class="field"><label>Tipo</label>
            <select id="devType">
              <option value="laptop">Laptop</option>
              <option value="desktop">Desktop</option>
              <option value="telefono">Telefono</option>
              <option value="tablet">Tablet</option>
              <option value="altro">Altro</option>
            </select>
          </div>
          <div class="field"><label>Sistema operativo</label><input id="devOs" placeholder="es. Windows 11" /></div>
          <div class="field"><label>Numero seriale</label><input id="devSerial" /></div>
          <div class="field"><label>Assegnato a</label>
            <select id="devAssignee"><option value="">Non assegnato</option>${users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Stato</label>
            <select id="devStatus">
              <option value="in_uso">In uso</option>
              <option value="in_magazzino">In magazzino</option>
              <option value="in_riparazione">In riparazione</option>
              <option value="dismesso">Dismesso</option>
            </select>
          </div>
          <p class="error-text" id="deviceError" style="grid-column:1/-1"></p>
          <div style="grid-column:1/-1"><button class="btn btn-sm" type="submit">Aggiungi dispositivo</button></div>
        </form>
      </div>
      <div class="filters">
        <select id="devFilterStatus">
          <option value="">Tutti gli stati</option>
          <option value="in_uso">In uso</option>
          <option value="in_magazzino">In magazzino</option>
          <option value="in_riparazione">In riparazione</option>
          <option value="dismesso">Dismesso</option>
        </select>
        <input id="devFilterQuery" type="search" placeholder="Cerca per nome, tag, seriale..." />
      </div>
      <div id="devicesList" class="card spinner-row">Caricamento...</div>`;

    const DEVICE_STATUS_LABELS = { in_uso: 'In uso', in_magazzino: 'In magazzino', in_riparazione: 'In riparazione', dismesso: 'Dismesso' };
    const DEVICE_TYPE_LABELS = { laptop: 'Laptop', desktop: 'Desktop', telefono: 'Telefono', tablet: 'Tablet', altro: 'Altro' };

    async function loadDevices() {
      const wrap = document.getElementById('devicesList');
      wrap.className = 'card spinner-row';
      wrap.textContent = 'Caricamento...';
      const params = new URLSearchParams();
      const status = document.getElementById('devFilterStatus').value;
      const q = document.getElementById('devFilterQuery').value.trim();
      if (status) params.set('status', status);
      if (q) params.set('q', q);

      try {
        const { devices } = await api(`/devices?${params.toString()}`);
        wrap.className = 'card';
        wrap.innerHTML = devices.length ? `
          <table class="users-table">
            <thead><tr><th>Nome</th><th>Tipo</th><th>SO</th><th>Assegnato a</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              ${devices.map((d) => `
                <tr>
                  <td>${escapeHtml(d.name)}${d.serial_number ? `<div class="hint">${escapeHtml(d.serial_number)}</div>` : ''}</td>
                  <td>${DEVICE_TYPE_LABELS[d.type] || d.type}</td>
                  <td>${d.os ? escapeHtml(d.os) : '<span class="hint">—</span>'}</td>
                  <td>${d.assignee_name ? escapeHtml(d.assignee_name) : '<span class="hint">Non assegnato</span>'}</td>
                  <td>
                    <select data-device-id="${d.id}" class="devStatusSel">
                      ${Object.entries(DEVICE_STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${d.status === v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                  </td>
                  <td><button type="button" class="icon-btn deleteDeviceBtn" data-id="${d.id}" title="Elimina dispositivo">${icon('trash')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="empty-state">' + icon('devices') + '<span>Nessun dispositivo trovato.</span></div>';

        wrap.querySelectorAll('.devStatusSel').forEach((sel) => {
          sel.addEventListener('change', async () => {
            try {
              await api(`/devices/${sel.dataset.deviceId}`, { method: 'PATCH', body: { status: sel.value } });
              showToast('Stato aggiornato', 'success');
            } catch (err) {
              showToast(err.message, 'error');
              loadDevices();
            }
          });
        });
        wrap.querySelectorAll('.deleteDeviceBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Eliminare questo dispositivo?')) return;
            try {
              await api(`/devices/${btn.dataset.id}`, { method: 'DELETE' });
              showToast('Dispositivo eliminato', 'success');
              loadDevices();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      } catch (err) {
        wrap.className = '';
        wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    document.getElementById('devFilterStatus').addEventListener('change', loadDevices);
    let devDebounce;
    document.getElementById('devFilterQuery').addEventListener('input', () => {
      clearTimeout(devDebounce);
      devDebounce = setTimeout(loadDevices, 300);
    });

    document.getElementById('newDeviceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('deviceError');
      errEl.textContent = '';
      const assignee = document.getElementById('devAssignee').value;
      try {
        await api('/devices', {
          method: 'POST',
          body: {
            name: document.getElementById('devName').value.trim(),
            type: document.getElementById('devType').value,
            os: document.getElementById('devOs').value.trim(),
            serial_number: document.getElementById('devSerial').value.trim(),
            status: document.getElementById('devStatus').value,
            assigned_to: assignee ? Number(assignee) : null,
          },
        });
        e.target.reset();
        showToast('Dispositivo aggiunto', 'success');
        loadDevices();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    loadDevices();
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
      </div>`;

    document.getElementById('pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
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
  }

  function renderSettings() {
    const current = getApiBase();
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('plug')} Impostazioni connessione</h1></div>
      <div class="card" style="max-width:560px">
        <p class="hint">
          Questa pagina statica deve sapere a quale server API parlare. Sul sito pubblico è già
          impostato un indirizzo predefinito che funziona automaticamente su ogni dispositivo,
          senza bisogno di configurare nulla. Cambia questo campo solo se vuoi collegarti a un
          backend diverso (es. un tuo ambiente locale, Docker, o un'altra istanza).
        </p>
        <form id="settingsForm" class="form-grid" style="max-width:none">
          <div class="field">
            <label for="apiBaseInput">Indirizzo server API</label>
            <input id="apiBaseInput" type="url" placeholder="https://tuo-backend.onrender.com" value="${escapeHtml(current)}" />
            <span class="hint">Esempio: https://it-ticketing-api.onrender.com (senza slash finale, senza /api)</span>
          </div>
          <p id="settingsMsg" class="hint"></p>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button class="btn btn-sm" type="submit">Salva</button>
            <button class="btn btn-sm btn-ghost" type="button" id="testConnBtn">Verifica connessione</button>
            <button class="btn btn-sm btn-ghost" type="button" id="clearBaseBtn">Usa stesso dominio</button>
          </div>
        </form>
      </div>`;

    const input = document.getElementById('apiBaseInput');
    const msgEl = document.getElementById('settingsMsg');

    async function testConnection(base) {
      msgEl.className = 'hint';
      msgEl.textContent = 'Verifica in corso...';
      try {
        const res = await fetch(`${base}/api/health`);
        if (!res.ok) throw new Error(`Risposta HTTP ${res.status}`);
        const data = await res.json();
        msgEl.className = 'success-text';
        msgEl.textContent = `Connesso correttamente (server: ${data.time}).`;
      } catch (err) {
        msgEl.className = 'error-text';
        msgEl.textContent = `Impossibile raggiungere il server: ${err.message}`;
      }
    }

    document.getElementById('testConnBtn').addEventListener('click', () => {
      testConnection(input.value.trim().replace(/\/+$/, ''));
    });

    document.getElementById('clearBaseBtn').addEventListener('click', () => {
      input.value = '';
    });

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      setApiBase(input.value.trim());
      showToast('Indirizzo server salvato', 'success');
      await testConnection(getApiBase());
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

  updateChrome();
  route();
})();
