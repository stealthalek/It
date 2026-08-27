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

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const res = await fetch(`/api${path}`, {
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
      userBadge.textContent = `${state.user.name} · ${ROLE_LABELS[state.user.role] || state.user.role}`;
      userBadge.style.display = '';
      logoutBtn.style.display = '';
    } else {
      userBadge.style.display = 'none';
      logoutBtn.style.display = 'none';
    }
  }

  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') mainNav.classList.remove('open');
  });

  logoutBtn.addEventListener('click', () => {
    setSession(null, null);
    location.hash = '#/login';
  });

  // ---------------- Router ----------------

  const PUBLIC_ROUTES = new Set(['login', 'register']);

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

    if (!PUBLIC_ROUTES.has(page) && !state.user) {
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
        default: return renderNotFound();
      }
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.addEventListener('hashchange', route);

  // ---------------- Views: auth ----------------

  function renderLogin() {
    appEl.innerHTML = `
      <div class="auth-wrap">
        <div class="card auth-card">
          <h1>Accedi</h1>
          <p class="hint">Entra nella piattaforma di ticketing.</p>
          <form id="loginForm" class="form-grid">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" type="password" required autocomplete="current-password" />
            </div>
            <p class="error-text" id="loginError"></p>
            <button class="btn" type="submit">Accedi</button>
          </form>
          <p class="hint">Non hai un account? <a href="#/register">Registrati</a></p>
        </div>
      </div>`;

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
          <h1>Crea un account</h1>
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
              <input id="password" type="password" required minlength="6" autocomplete="new-password" />
              <span class="hint">Almeno 6 caratteri</span>
            </div>
            <p class="error-text" id="registerError"></p>
            <button class="btn" type="submit">Registrati</button>
          </form>
          <p class="hint">Hai già un account? <a href="#/login">Accedi</a></p>
        </div>
      </div>`;

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errEl = document.getElementById('registerError');
      errEl.textContent = '';
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

  // ---------------- Views: dashboard ----------------

  function isStaff() {
    return state.user && (state.user.role === 'agent' || state.user.role === 'admin');
  }

  async function renderDashboard() {
    appEl.innerHTML = `
      <div class="view-header">
        <h1>${isStaff() ? 'Tutti i ticket' : 'I miei ticket'}</h1>
        <a class="btn" href="#/new">+ Nuovo ticket</a>
      </div>
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
      <div id="ticketList" class="spinner-row">Caricamento...</div>`;

    const listEl = document.getElementById('ticketList');
    const fStatus = document.getElementById('fStatus');
    const fPriority = document.getElementById('fPriority');
    const fAssigned = document.getElementById('fAssigned');
    const fQuery = document.getElementById('fQuery');

    let debounceTimer;
    async function load() {
      const params = new URLSearchParams();
      if (fStatus.value) params.set('status', fStatus.value);
      if (fPriority.value) params.set('priority', fPriority.value);
      if (fAssigned && fAssigned.value) params.set('assigned', fAssigned.value);
      if (fQuery.value.trim()) params.set('q', fQuery.value.trim());

      listEl.className = 'spinner-row';
      listEl.textContent = 'Caricamento...';
      try {
        const { tickets } = await api(`/tickets?${params.toString()}`);
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
      container.innerHTML = `<div class="empty-state">Nessun ticket trovato.</div>`;
      return;
    }
    container.className = 'ticket-grid';
    container.innerHTML = tickets.map((t) => `
      <a class="ticket-card" href="#/ticket/${t.id}">
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

  // ---------------- Views: new ticket ----------------

  function renderNewTicket() {
    appEl.innerHTML = `
      <div class="view-header"><h1>Nuovo ticket</h1></div>
      <div class="card" style="max-width:560px">
        <form id="newTicketForm" class="form-grid">
          <div class="field">
            <label for="subject">Oggetto</label>
            <input id="subject" type="text" required maxlength="200" />
          </div>
          <div class="field">
            <label for="category">Categoria</label>
            <input id="category" type="text" placeholder="es. hardware, software, rete" />
          </div>
          <div class="field">
            <label for="priority">Priorità</label>
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
            <button class="btn" type="submit">Crea ticket</button>
          </div>
        </form>
      </div>`;

    document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('newTicketError');
      errEl.textContent = '';
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: document.getElementById('category').value.trim(),
        priority: document.getElementById('priority').value,
        description: document.getElementById('description').value.trim(),
      };
      try {
        const { ticket } = await api('/tickets', { method: 'POST', body });
        showToast('Ticket creato con successo', 'success');
        location.hash = `#/ticket/${ticket.id}`;
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  // ---------------- Views: ticket detail ----------------

  async function renderTicketDetail(id) {
    appEl.innerHTML = `<div class="spinner-row">Caricamento...</div>`;
    let data;
    try {
      data = await api(`/tickets/${id}`);
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    const { ticket, comments } = data;
    const canEditFields = ticket.created_by === state.user.id && !isStaff() && ticket.status === 'open';

    let staffPanel = '';
    let assigneesOptions = '';
    if (isStaff()) {
      try {
        const { users } = await api('/users');
        const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
        assigneesOptions = `<option value="">Non assegnato</option>` +
          staffUsers.map((u) => `<option value="${u.id}" ${ticket.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
      } catch { /* ignore, dropdown just stays empty */ }

      staffPanel = `
        <div class="card">
          <h3 style="margin-top:0">Gestione</h3>
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
          <button id="saveMgmtBtn" class="btn btn-sm">Salva modifiche</button>
          ${state.user.role === 'admin' ? `<button id="deleteBtn" class="btn btn-sm btn-danger" style="margin-top:0.5rem">Elimina ticket</button>` : ''}
        </div>`;
    }

    appEl.innerHTML = `
      <div class="view-header">
        <h1>#${ticket.id} ${escapeHtml(ticket.subject)}</h1>
        <a class="btn btn-ghost" href="#/dashboard">← Torna alla lista</a>
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
            </p>
          </div>

          <div class="card">
            <h3 style="margin-top:0">Conversazione</h3>
            <div id="commentsList">
              ${comments.length ? comments.map(renderComment).join('') : '<p class="hint">Nessun commento ancora.</p>'}
            </div>
            <form id="commentForm" class="form-grid" style="max-width:none;margin-top:1rem">
              <div class="field">
                <label for="commentMsg">Aggiungi un commento</label>
                <textarea id="commentMsg" required placeholder="Scrivi una risposta..."></textarea>
              </div>
              <div><button class="btn btn-sm" type="submit">Invia</button></div>
            </form>
          </div>
        </div>
        <div>${staffPanel}</div>
      </div>`;

    document.getElementById('commentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('commentMsg');
      if (!msgEl.value.trim()) return;
      try {
        const { comments: updated } = await api(`/tickets/${ticket.id}/comments`, {
          method: 'POST', body: { message: msgEl.value.trim() },
        });
        document.getElementById('commentsList').innerHTML = updated.map(renderComment).join('');
        msgEl.value = '';
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

    const saveMgmtBtn = document.getElementById('saveMgmtBtn');
    if (saveMgmtBtn) {
      saveMgmtBtn.addEventListener('click', async () => {
        const assignedRaw = document.getElementById('assignedSel').value;
        try {
          await api(`/tickets/${ticket.id}`, {
            method: 'PATCH',
            body: {
              status: document.getElementById('statusSel').value,
              priority: document.getElementById('prioritySel').value,
              assigned_to: assignedRaw ? Number(assignedRaw) : null,
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

  function renderComment(c) {
    return `
      <div class="comment">
        <div class="comment-head">
          <span>${escapeHtml(c.author_name)} (${ROLE_LABELS[c.author_role] || c.author_role})</span>
          <span>${formatDate(c.created_at)}</span>
        </div>
        <div class="comment-body">${escapeHtml(c.message)}</div>
      </div>`;
  }

  // ---------------- Views: admin ----------------

  async function renderAdmin() {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    appEl.innerHTML = `<div class="view-header"><h1>Utenti</h1></div><div id="usersWrap" class="spinner-row">Caricamento...</div>`;
    const wrap = document.getElementById('usersWrap');
    try {
      const { users } = await api('/users');
      wrap.className = 'card';
      wrap.innerHTML = `
        <table class="users-table">
          <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Registrato</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td>${escapeHtml(u.name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${ROLE_LABELS[u.role] || u.role}</td>
                <td>${formatDate(u.created_at)}</td>
                ${state.user.role === 'admin' ? `
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
            renderAdmin();
          }
        });
      });
    } catch (err) {
      wrap.className = '';
      wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderNotFound() {
    appEl.innerHTML = `<div class="card"><p>Pagina non trovata. <a href="#/dashboard">Torna alla dashboard</a></p></div>`;
  }

  // ---------------- Boot ----------------

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => { /* offline support is best-effort */ });
    });
  }

  updateChrome();
  route();
})();
