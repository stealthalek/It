(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('ticketing_token') || null,
    user: null,
    viewAs: null,
  };

  let dashboardAutoTimer = null;
  function teardownDashboardAutoUpdate() {
    if (dashboardAutoTimer) {
      clearInterval(dashboardAutoTimer);
      dashboardAutoTimer = null;
    }
  }

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
  const sidebarEl = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');

  function statusLabels() {
    return {
      open: t('status_open'),
      in_progress: t('status_in_progress'),
      waiting_customer: t('status_waiting_customer'),
      resolved: t('status_resolved'),
      closed: t('status_closed'),
    };
  }
  function priorityLabels() {
    return { low: t('priority_low'), medium: t('priority_medium'), high: t('priority_high'), urgent: t('priority_urgent') };
  }
  function typeLabels() {
    return { incident: t('type_incident'), task: t('type_task') };
  }
  function slaLabels() {
    return { on_track: t('sla_on_track'), at_risk: t('sla_at_risk'), breached: t('sla_breached') };
  }
  function assetTypeLabels() {
    return { laptop: t('asset_type_laptop'), desktop: t('asset_type_desktop'), monitor: t('asset_type_monitor'), telefono: t('asset_type_phone'), altro: t('asset_type_other') };
  }
  function assetStatusLabels() {
    return { disponibile: t('asset_status_available'), in_uso: t('asset_status_in_use'), in_riparazione: t('asset_status_repair'), dismesso: t('asset_status_retired') };
  }
  function roleLabels() {
    return { customer: t('role_customer'), agent: t('role_agent'), admin: t('role_admin') };
  }

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
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9"/><path d="M2 16h20l1.28 2.55a1 1 0 0 1-.9 1.45H1.62a1 1 0 0 1-.9-1.45L2 16z"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    bulb: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-1-2-1-2 1 2 2 3 2 5a4 4 0 0 1-8 0c0-5 4-6 4-11z"/>',
    truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a3 3 0 0 1 0 6"/><path d="M17.5 5.5a7 7 0 0 1 0 11"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  };

  const CATEGORY_ICON_CHOICES = ['ticket', 'wifi', 'globe', 'printer', 'mail', 'monitor', 'server', 'phone', 'grid', 'lock', 'shield', 'users', 'laptop', 'tablet', 'package', 'bulb', 'flame', 'truck', 'megaphone'];

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

  function exportFilename(base, ext) {
    return `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  function csvEscape(value) {
    const str = String(value ?? '');
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message, type = '', duration = 3200) {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (type ? ` ${type}` : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.className = 'toast'; }, duration);
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
      nav_assets: 'Asset', nav_report: 'Report', nav_audit: 'Audit', nav_admin: 'Amministrazione', nav_profile: 'Profilo', logout: 'Esci',
      login_title: 'Accedi', login_hint: 'Entra nella piattaforma di ticketing.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Accedi', login_no_account: 'Non hai un account?', login_register_link: 'Registrati',
      register_title: 'Crea un account', register_submit: 'Registrati',
      register_has_account: 'Hai già un account?', register_login_link: 'Accedi',
      dashboard_title_staff: 'Tutti i ticket', dashboard_title_customer: 'I miei ticket',
      dashboard_hint_staff: 'Gestisci e rispondi alle richieste di assistenza.',
      dashboard_hint_customer: 'Consulta lo stato delle tue richieste.',
      new_ticket_btn: 'Nuovo ticket',
      status_open: 'Aperto', status_in_progress: 'In lavorazione', status_waiting_customer: 'In attesa del richiedente', status_resolved: 'Risolto', status_closed: 'Chiuso',
      priority_low: 'Bassa', priority_medium: 'Media', priority_high: 'Alta', priority_urgent: 'Urgente',
      type_incident: 'Incident', type_task: 'Task',
      sla_on_track: 'SLA in linea', sla_at_risk: 'SLA a rischio', sla_breached: 'SLA superata',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Telefono', asset_type_other: 'Altro',
      asset_status_available: 'Disponibile', asset_status_in_use: 'In uso', asset_status_repair: 'In riparazione', asset_status_retired: 'Dismesso',
      role_customer: 'Cliente', role_agent: 'Agente', role_admin: 'Amministratore',
      filter_all_types: 'Tutti i tipi', filter_all_statuses: 'Tutti gli stati', filter_all_priorities: 'Tutte le priorità',
      filter_all_assignees: 'Tutti gli assegnatari', filter_assigned_me: 'Assegnati a me', filter_unassigned: 'Non assegnati',
      search_placeholder_staff: 'Cerca per testo, numero ticket o richiedente...', search_placeholder_customer: 'Cerca per testo o numero ticket...',
      stat_open: 'Aperti', stat_in_progress: 'In lavorazione', stat_waiting_customer: 'In attesa', stat_resolved: 'Risolti', stat_urgent: 'Urgenti aperti',
      stat_incidents: 'Incident', stat_tasks: 'Task',
      personal_counter_staff: 'Assegnati a te, ancora aperti', personal_counter_customer: 'Tuoi ticket in corso',
      chart_title: 'Grafico', chart_distribution: 'Distribuzione', chart_total: 'Totale',
      chart_mine_title: 'I miei ticket', chart_team_title: 'Il mio team', chart_no_team: 'Non fai parte di nessun gruppo',
      dim_status: 'Stato', dim_sla: 'SLA', dim_priority: 'Priorità', dim_type: 'Tipo', dim_category: 'Categoria', dim_assigned: 'Assegnatario',
      auto_update: 'Aggiornamento automatico', auto_update_on: 'Aggiornamento automatico attivo', impersonate: 'Immedesimati',
      btn_save: 'Salva', btn_cancel: 'Annulla', btn_delete: 'Elimina', btn_add: 'Aggiungi', btn_search: 'Cerca', btn_download: 'Scarica',
      attachments_title: 'Allegati', btn_add_attachment: 'Aggiungi allegato', no_attachments_hint: 'Nessun allegato.',
      attachment_too_large: 'File troppo grande (max 5 MB)', toast_attachment_added: 'Allegato aggiunto', toast_attachment_deleted: 'Allegato eliminato',
      rating_title: 'Valutazione', rated_on_label: 'Valutato il', btn_edit_rating: 'Modifica valutazione',
      rating_comment_placeholder: 'Un commento facoltativo sul servizio ricevuto...', btn_submit_rating: 'Invia valutazione',
      rating_required_hint: 'Seleziona una valutazione da 1 a 5 stelle', toast_rating_submitted: 'Valutazione inviata, grazie!',
      loading: 'Caricamento...', no_results: 'Nessun risultato.', unassigned_label: 'Non assegnato',
      lang_updated: 'Lingua aggiornata', by_label: 'Di', assigned_to_label: 'Assegnato a', no_tickets_found: 'Nessun ticket trovato.',
      back_to_list: 'Torna alla lista', edit_subject_desc: 'Modifica oggetto e descrizione',
      field_subject: 'Oggetto', field_description: 'Descrizione', btn_save_changes: 'Salva modifiche',
      created_by: 'Creato da', on_date: 'il', reopen_ticket: 'Riapri ticket',
      activity_title: 'Attività', no_activity: 'Nessuna attività ancora.',
      readonly_no_comments: 'Modalità sola lettura: non è possibile inviare commenti.',
      add_comment_label: 'Aggiungi un commento', comment_placeholder: 'Scrivi una risposta...',
      internal_note_label: 'Nota interna (visibile solo allo staff)', btn_send: 'Invia',
      management_title: 'Gestione', field_group: 'Gruppo di assegnazione', field_linked_asset: 'Asset collegato',
      delete_ticket_btn: 'Elimina ticket', no_group_option: 'Nessun gruppo', no_asset_option: 'Nessun asset',
      confirm_delete_ticket: 'Eliminare definitivamente questo ticket?',
      toast_ticket_updated: 'Ticket aggiornato', toast_ticket_reopened: 'Ticket riaperto', toast_ticket_deleted: 'Ticket eliminato',
      toast_comment_added: 'Commento aggiunto', new_message_toast: 'Nuovo messaggio nel ticket',
      presence_staff: 'Un tecnico sta seguendo questo ticket in questo momento',
      presence_customer: 'Il richiedente sta visualizzando questo ticket in questo momento',
      group_label_prefix: 'Gruppo', viewing_as_title: 'Vista di', viewing_as_hint: 'Stai visualizzando i ticket di questa persona in sola lettura.',
      viewas_banner_text: 'Stai vedendo la piattaforma come', viewas_readonly_suffix: 'sola lettura', viewas_exit: 'Esci dalla modalità',
      backlog_hint: 'Ticket non assegnati, in ordine di urgenza SLA.',
      bulk_assign_placeholder: 'Assegna a...', bulk_status_placeholder: 'Cambia stato...', bulk_clear_selection: 'Deseleziona',
      bulk_selected_count: 'Selezionati:', toast_bulk_assigned: 'Ticket assegnati', toast_bulk_status_updated: 'Stato aggiornato sui ticket selezionati',
      add_tag_placeholder: 'Aggiungi etichetta e premi invio',
      linked_tickets_title: 'Ticket collegati', link_ticket_placeholder: 'Numero ticket (es. 12)', btn_link_ticket: 'Collega',
      no_linked_tickets_hint: 'Nessun ticket collegato.',
      btn_watch: 'Segui', btn_unwatch: 'Non seguire più', toast_now_watching: 'Ora segui questo ticket', toast_stopped_watching: 'Non segui più questo ticket',
      assets_hint: 'Inventario dispositivi, assegnazioni permanenti e prestiti.', new_asset_title: 'Nuovo asset',
      field_name: 'Nome', field_tag: 'Tag/matricola', btn_add_asset: 'Aggiungi asset',
      table_type: 'Tipo', table_tag: 'Tag', table_status: 'Stato', table_assignment: 'Assegnazione', table_due_date: 'Scadenza',
      assignment_permanent: 'Permanente', assignment_loan: 'Prestito', none_option: 'Nessuno', no_assets_found: 'Nessun asset trovato.',
      toast_asset_status_updated: 'Stato asset aggiornato', toast_assignment_updated: 'Assegnazione aggiornata',
      toast_assignee_updated: 'Assegnatario aggiornato', toast_due_date_updated: 'Scadenza aggiornata',
      confirm_delete_asset: 'Eliminare questo asset?', toast_asset_deleted: 'Asset eliminato', delete_asset_title: 'Elimina asset',
      search_hint: 'Cerca per numero ticket, parola chiave o richiedente: i risultati compaiono mentre scrivi.',
      search_placeholder_full: 'Numero ticket, parola chiave, richiedente...', all_groups_option: 'Tutti i gruppi', all_tags_option: 'Tutte le etichette',
      report_hint: 'Volumi, tempi di risoluzione e rispetto SLA per gruppo e per agente.',
      chart_volume_by_group: 'Volume ticket per gruppo', chart_avg_resolution: 'Tempo medio di risoluzione (ore) per gruppo',
      chart_sla_compliance: 'SLA rispettata per gruppo (%)', chart_load_by_agent: 'Carico ticket per agente',
      chart_csat: 'Soddisfazione media per gruppo (su 5)', no_ratings_yet: 'Nessuna valutazione ancora.', report_col_rating: 'Valutazione',
      no_data: 'Nessun dato.', no_resolved_yet: 'Nessun ticket risolto ancora.',
      no_group_sla_configured: 'Nessun gruppo con SLA configurata.', no_assigned_tickets: 'Nessun ticket assegnato.',
      no_group_label: 'Senza gruppo',
      filter_all_teams: 'Tutti i team', filter_all_members: 'Tutti i membri', report_chart_type_label: 'Tipo di grafico',
      chart_type_bar: 'A barre', chart_type_donut: 'A ciambella',
      report_date_from: 'Da', report_date_to: 'A',
      btn_export_csv: 'Esporta CSV', btn_export_excel: 'Esporta Excel',
      report_export_count_label: 'Ticket nel filtro:',
      toast_export_no_data: 'Nessun ticket corrisponde ai filtri selezionati',
      toast_export_failed: 'Esportazione non riuscita',
      report_col_number: 'Numero', report_col_subject: 'Oggetto', report_col_type: 'Tipo', report_col_status: 'Stato',
      report_col_priority: 'Priorità', report_col_group: 'Gruppo', report_col_requester: 'Richiedente',
      report_col_requester_email: 'Email richiedente', report_col_assignee: 'Assegnatario',
      report_col_created: 'Creato il', report_col_resolved: 'Risolto il', report_col_resolution_hours: 'Ore di risoluzione',
      report_col_sla: 'SLA',
      audit_hint: 'Traccia completa di ogni modifica e messaggio su tutti i ticket, incluse le note interne — pensata per revisioni e controlli esterni.',
      audit_search_placeholder: 'Cerca per testo, autore o numero ticket...',
      audit_kind_event: 'Modifica', audit_kind_comment: 'Messaggio', audit_kind_internal_note: 'Nota interna',
      audit_kind_admin: 'Amministrazione',
      audit_filter_all: 'Tutta l\'attività', audit_filter_ticket: 'Solo ticket', audit_filter_admin: 'Solo amministrazione',
      audit_col_date: 'Data e ora', audit_col_ticket: 'Ticket', audit_col_subject: 'Oggetto ticket', audit_col_kind: 'Tipo',
      audit_col_actor: 'Autore', audit_col_message: 'Dettaglio',
      your_account_title: 'Il tuo account', change_password_title: 'Cambia password',
      current_password_label: 'Password attuale', new_password_label: 'Nuova password',
      confirm_new_password_label: 'Conferma nuova password', btn_update_password: 'Aggiorna password',
      change_email_title: 'Cambia email', new_email_label: 'Nuova email', btn_update_email: 'Aggiorna email',
      passwords_dont_match: 'Le nuove password non coincidono',
      toast_password_updated: 'Password aggiornata', toast_email_updated: 'Email aggiornata',
      settings_language_title: 'Lingua', settings_lang_hint: 'Scegli la lingua dell\'interfaccia.',
      personalization_title: 'Personalizzazione', personalization_hint: 'Scegli il colore principale dell\'interfaccia.',
      cold_start_hint: 'Il server si sta risvegliando dopo un periodo di inattività, un momento...',
      admin_title: 'Amministrazione', access_denied: 'Accesso non consentito.', person_card_title: 'Scheda persona',
      org_open_tickets: 'aperti', org_sla_breach: 'in ritardo', org_node_hint: 'Clic per vedere i ticket del team',
      admin_create_staff_title: 'Crea account staff', admin_group_optional_label: 'Gruppo di assegnazione (opzionale)',
      admin_group_hint: 'I membri dello stesso gruppo si vedono a vicenda nell\'assegnazione dei ticket',
      account_locale_label: 'Lingua account', account_locale_hint: 'Le email inviate a questo account useranno questa lingua',
      btn_create_account: 'Crea account', role_agent_option: 'Agente', role_admin_option: 'Amministratore',
      admin_categories_title: 'Categorie ticket', admin_categories_hint: 'Personalizza le categorie disponibili nel modulo di apertura ticket, la loro icona e il team a cui vengono assegnate di default.',
      field_category_name: 'Nome categoria', field_icon: 'Icona', field_default_team: 'Team predefinito', option_none: 'Nessuno', option_select_placeholder: 'Seleziona...', btn_add: 'Aggiungi', yes_label: 'Sì', no_label: 'No',
      canned_picker_placeholder: 'Risposta rapida...', btn_insert: 'Inserisci',
      admin_groups_title: 'Gruppi di assegnazione', admin_groups_hint: 'Ogni gruppo ha un proprio SLA (ore per risposta/risoluzione) e orario di lavoro: fuori da quella fascia, e nel weekend, l\'SLA resta in pausa e riprende al turno successivo.',
      admin_automations_title: 'Automazioni', admin_automations_hint: 'Regole "se succede X allora fai Y": alla creazione o aggiornamento di un ticket, se le condizioni combaciano, le azioni scelte vengono applicate automaticamente.',
      field_rule_name: 'Nome regola', field_rule_trigger: 'Quando si attiva', trigger_created: 'Alla creazione del ticket', trigger_updated: 'Quando il ticket viene aggiornato',
      rule_conditions_label: 'Condizioni (tutte opzionali)', field_group_condition: 'Gruppo del ticket',
      rule_actions_label: 'Azioni', action_set_status: 'Imposta stato', action_set_priority: 'Imposta priorità',
      action_assign_group: 'Assegna al gruppo', action_assign_user: 'Assegna all\'utente',
      action_add_note: 'Aggiungi nota interna', action_add_note_placeholder: 'Testo della nota interna da aggiungere automaticamente',
      btn_create_rule: 'Crea regola', rule_no_conditions: 'Nessuna condizione (si applica sempre)', no_rules_hint: 'Nessuna regola di automazione configurata.',
      toast_rule_updated: 'Regola aggiornata', toast_rule_deleted: 'Regola eliminata', toast_rule_added: 'Regola creata',
      admin_custom_fields_title: 'Campi personalizzati', admin_custom_fields_hint: 'Aggiungi campi extra al modulo di apertura ticket, globali oppure specifici per una categoria.',
      field_field_name: 'Nome campo', field_field_type: 'Tipo', field_type_text: 'Testo', field_type_number: 'Numero', field_type_textarea: 'Testo lungo', field_type_select: 'Scelta', field_type_checkbox: 'Casella di spunta',
      field_field_options: 'Opzioni (separate da virgola)', field_field_options_placeholder: 'Es: Bassa, Media, Alta', field_field_category: 'Categoria', field_global_option: 'Globale (tutte le categorie)',
      field_required_label: 'Obbligatorio', btn_add_field: 'Aggiungi campo', no_fields_hint: 'Nessun campo personalizzato configurato.',
      toast_field_added: 'Campo aggiunto', toast_field_deleted: 'Campo eliminato',
      admin_canned_title: 'Risposte rapide', admin_canned_hint: 'Testi pronti che il personale può inserire velocemente nei commenti dei ticket.',
      field_canned_title: 'Titolo', field_canned_body: 'Testo della risposta', btn_add_canned: 'Aggiungi risposta rapida', no_canned_hint: 'Nessuna risposta rapida configurata.',
      toast_canned_added: 'Risposta rapida aggiunta', toast_canned_deleted: 'Risposta rapida eliminata',
      admin_templates_title: 'Modelli ticket', admin_templates_hint: 'Modelli predefiniti per velocizzare l\'apertura di richieste ricorrenti, selezionabili dall\'utente nel modulo di nuovo ticket.',
      field_template_name: 'Nome modello', btn_add_template: 'Aggiungi modello', no_templates_hint: 'Nessun modello configurato.',
      toast_template_added: 'Modello aggiunto', toast_template_deleted: 'Modello eliminato',
      admin_holidays_title: 'Giorni festivi', admin_holidays_hint: 'Le date qui indicate vengono escluse dal calcolo delle ore lavorative per l\'SLA, oltre ai fine settimana.',
      field_date: 'Data', field_holiday_name: 'Nome festività', btn_add_holiday: 'Aggiungi festività', no_holidays_hint: 'Nessuna festività configurata.',
      toast_holiday_added: 'Festività aggiunta', toast_holiday_deleted: 'Festività rimossa',
      field_group_name: 'Nome gruppo', field_parent_group: 'Gruppo padre', option_no_parent: 'Nessuno (primo livello)',
      field_response_hours: 'Risposta (h)', field_resolve_hours: 'Risoluzione (h)', field_shift_start: 'Inizio turno', field_shift_end: 'Fine turno',
      btn_create_group: 'Crea gruppo', delete_group_title: 'Elimina gruppo', shift_from_label: 'Turno dalle', shift_to_label: 'alle',
      confirm_delete_group: 'Eliminare questo gruppo?', toast_sla_updated: 'SLA aggiornata', toast_work_hours_updated: 'Orario di lavoro aggiornato',
      toast_group_deleted: 'Gruppo eliminato', toast_group_created: 'Gruppo creato', toast_default_team_updated: 'Team predefinito aggiornato',
      org_drop_root_hint: 'Trascina qui un gruppo per renderlo di primo livello', toast_group_reparented: 'Gruppo riorganizzato',
      assign_to_me_btn: 'Assegna a me', toast_ticket_assigned_to_you: 'Ticket assegnato a te',
      group_by_team_label: 'Raggruppa per team',
      toast_category_deleted: 'Categoria eliminata', toast_category_added: 'Categoria aggiunta', delete_category_title: 'Elimina categoria',
      no_categories_hint: 'Nessuna categoria.', no_groups_hint: 'Nessun gruppo.', account_created_for: 'Account creato per',
      temp_password_hint: 'Password temporanea (comunicala in modo sicuro, non sarà più visibile):', toast_staff_created: 'Account staff creato',
      search_person_label: 'Cerca persona', search_person_placeholder: 'Nome o email...', no_people_found: 'Nessuna persona trovata.',
      th_name: 'Nome', th_email: 'Email', th_role: 'Ruolo', th_group: 'Gruppo', th_registered: 'Registrato',
      org_section_title: 'Organizzazione', org_section_hint: 'Il nome scelto compare nell\'intestazione e nelle email inviate agli utenti.',
      field_org_name: 'Nome organizzazione', btn_save: 'Salva', toast_org_updated: 'Nome organizzazione aggiornato',
      field_org_logo: 'Logo aziendale', logo_hint: 'PNG o JPG, viene ridimensionato automaticamente.', btn_remove_logo: 'Rimuovi logo',
      toast_logo_updated: 'Logo aggiornato', toast_logo_removed: 'Logo rimosso',
      field_manager: 'Manager', field_is_external: 'Esterno (consulente/fornitore, non dipendente)',
      external_badge: 'Esterno', direct_reports_title: 'Riporti diretti', no_direct_reports: 'Nessun riporto diretto.',
      manager_label: 'Manager', no_manager_label: 'Nessun manager', toast_external_updated: 'Classificazione aggiornata',
      toast_manager_updated: 'Manager aggiornato',
      invite_email_title: 'Email di invito account',
      invite_email_hint: 'Personalizza l\'oggetto e il testo dell\'email automatica inviata quando crei un nuovo account staff. Lasciala vuota per usare il testo predefinito. Segnaposto disponibili:',
      field_subject: 'Oggetto', field_email_body: 'Testo email', btn_save_template: 'Salva modello', toast_template_updated: 'Modello email aggiornato',
      not_found_text: 'Pagina non trovata.', back_to_dashboard: 'Torna alla dashboard', placeholder_default: '(predefinito)',
      impersonate_search_label: 'Cerca una persona da vedere in sola lettura',
      notifications_title: 'Notifiche', mark_all_read: 'Segna tutte come lette', no_notifications: 'Nessuna notifica.',
      confirm_password_label: 'Conferma password', no_data_available: 'Nessun dato disponibile.', send_request_btn: 'Invia richiesta',
      show_password_label: 'Mostra password', password_min_hint: 'Almeno 8 caratteri, con lettere e numeri',
      passwords_mismatch: 'Le password non coincidono', toast_welcome_back: 'Bentornato', toast_account_created: 'Account creato, benvenuto',
      new_ticket_title: 'Nuovo ticket', new_ticket_hint: 'Raccontaci il problema: bastano pochi campi, il resto lo segue il nostro team.',
      field_request_type: 'Tipo di richiesta', type_incident_suffix: '— qualcosa non funziona', type_task_suffix: '— richiesta pianificabile',
      field_template: 'Parti da un modello', template_blank_option: 'Nessun modello (parti da zero)',
      field_category: 'Categoria', field_subject_placeholder: 'Un breve titolo per il problema', field_urgency: 'Quanto è urgente?',
      category_search_placeholder: 'Cerca una categoria (es. laptop, arredamento, marketing...)',
      category_selected_label: 'Categoria selezionata:', field_parent_category: 'Categoria principale',
      option_top_level_category: '— Categoria principale (nessun genitore) —',
      field_description_placeholder: 'Descrivi il problema in dettaglio', toast_request_sent: 'Richiesta inviata con successo',
      toast_asset_created: 'Asset creato', toast_app_installed: 'App installata con successo',
      ios_install_hint: 'Per installare: tocca Condividi, poi "Aggiungi alla schermata Home"',
      microsoft_login_failed: 'Accesso con Microsoft non riuscito',
      account_details_title: 'Dettagli account', registered_on_label: 'Registrato il', field_role: 'Ruolo', field_locale: 'Lingua',
      reset_password_btn: 'Reimposta password', ticket_activity_title: 'Attività ticket',
      opened_by_person: 'Aperti da questa persona', assigned_to_person: 'Assegnati a questa persona',
      toast_role_updated: 'Ruolo aggiornato', toast_group_updated: 'Gruppo aggiornato', toast_locale_updated: 'Lingua aggiornata',
      confirm_reset_password_prefix: 'Generare una nuova password temporanea per', confirm_reset_password_suffix: '?',
      password_reset_success_msg: 'Password reimpostata.',
      new_temp_password_hint: 'Nuova password temporanea (comunicala in modo sicuro, non sarà più visibile):',
      toast_password_reset: 'Password reimpostata', settings_title: 'Impostazioni',
      motion_fluid_label: 'Animazioni fluide', toast_accent_updated: 'Colore aggiornato', toast_motion_updated: 'Preferenza animazioni aggiornata',
      desktop_notif_label: 'Notifiche desktop', desktop_notif_hint: 'Ricevi un avviso pop-up del sistema operativo per nuovi ticket e commenti, anche a scheda non attiva.',
      toast_desktop_notif_enabled: 'Notifiche desktop attivate', toast_desktop_notif_disabled: 'Notifiche desktop disattivate',
      toast_desktop_notif_denied: 'Permesso negato dal browser: abilita le notifiche per questo sito nelle impostazioni del browser',
    },
    en: {
      nav_dashboard: 'Tickets', nav_new: 'New ticket', nav_search: 'Search', nav_backlog: 'Backlog',
      nav_assets: 'Assets', nav_report: 'Report', nav_audit: 'Audit', nav_admin: 'Administration', nav_profile: 'Profile', logout: 'Log out',
      login_title: 'Sign in', login_hint: 'Enter the ticketing platform.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Sign in', login_no_account: "Don't have an account?", login_register_link: 'Register',
      register_title: 'Create an account', register_submit: 'Register',
      register_has_account: 'Already have an account?', register_login_link: 'Sign in',
      dashboard_title_staff: 'All tickets', dashboard_title_customer: 'My tickets',
      dashboard_hint_staff: 'Manage and respond to support requests.',
      dashboard_hint_customer: 'Check the status of your requests.',
      new_ticket_btn: 'New ticket',
      status_open: 'Open', status_in_progress: 'In progress', status_waiting_customer: 'Awaiting requester', status_resolved: 'Resolved', status_closed: 'Closed',
      priority_low: 'Low', priority_medium: 'Medium', priority_high: 'High', priority_urgent: 'Urgent',
      type_incident: 'Incident', type_task: 'Task',
      sla_on_track: 'SLA on track', sla_at_risk: 'SLA at risk', sla_breached: 'SLA breached',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Phone', asset_type_other: 'Other',
      asset_status_available: 'Available', asset_status_in_use: 'In use', asset_status_repair: 'Under repair', asset_status_retired: 'Retired',
      role_customer: 'Customer', role_agent: 'Agent', role_admin: 'Administrator',
      filter_all_types: 'All types', filter_all_statuses: 'All statuses', filter_all_priorities: 'All priorities',
      filter_all_assignees: 'All assignees', filter_assigned_me: 'Assigned to me', filter_unassigned: 'Unassigned',
      search_placeholder_staff: 'Search by text, ticket number or requester...', search_placeholder_customer: 'Search by text or ticket number...',
      stat_open: 'Open', stat_in_progress: 'In progress', stat_waiting_customer: 'Awaiting reply', stat_resolved: 'Resolved', stat_urgent: 'Open urgent',
      stat_incidents: 'Incidents', stat_tasks: 'Tasks',
      personal_counter_staff: 'Assigned to you, still open', personal_counter_customer: 'Your ongoing tickets',
      chart_title: 'Chart', chart_distribution: 'Distribution', chart_total: 'Total',
      chart_mine_title: 'My tickets', chart_team_title: 'My team', chart_no_team: 'You are not part of any group',
      dim_status: 'Status', dim_sla: 'SLA', dim_priority: 'Priority', dim_type: 'Type', dim_category: 'Category', dim_assigned: 'Assignee',
      auto_update: 'Auto update', auto_update_on: 'Auto update active', impersonate: 'View as',
      btn_save: 'Save', btn_cancel: 'Cancel', btn_delete: 'Delete', btn_add: 'Add', btn_search: 'Search', btn_download: 'Download',
      attachments_title: 'Attachments', btn_add_attachment: 'Add attachment', no_attachments_hint: 'No attachments.',
      attachment_too_large: 'File too large (max 5 MB)', toast_attachment_added: 'Attachment added', toast_attachment_deleted: 'Attachment deleted',
      rating_title: 'Rating', rated_on_label: 'Rated on', btn_edit_rating: 'Edit rating',
      rating_comment_placeholder: 'An optional comment about the service received...', btn_submit_rating: 'Submit rating',
      rating_required_hint: 'Select a rating from 1 to 5 stars', toast_rating_submitted: 'Rating submitted, thank you!',
      loading: 'Loading...', no_results: 'No results.', unassigned_label: 'Unassigned',
      lang_updated: 'Language updated', by_label: 'By', assigned_to_label: 'Assigned to', no_tickets_found: 'No tickets found.',
      back_to_list: 'Back to list', edit_subject_desc: 'Edit subject and description',
      field_subject: 'Subject', field_description: 'Description', btn_save_changes: 'Save changes',
      created_by: 'Created by', on_date: 'on', reopen_ticket: 'Reopen ticket',
      activity_title: 'Activity', no_activity: 'No activity yet.',
      readonly_no_comments: 'Read-only mode: comments cannot be sent.',
      add_comment_label: 'Add a comment', comment_placeholder: 'Write a reply...',
      internal_note_label: 'Internal note (staff only)', btn_send: 'Send',
      management_title: 'Management', field_group: 'Assignment group', field_linked_asset: 'Linked asset',
      delete_ticket_btn: 'Delete ticket', no_group_option: 'No group', no_asset_option: 'No asset',
      confirm_delete_ticket: 'Permanently delete this ticket?',
      toast_ticket_updated: 'Ticket updated', toast_ticket_reopened: 'Ticket reopened', toast_ticket_deleted: 'Ticket deleted',
      toast_comment_added: 'Comment added', new_message_toast: 'New message on the ticket',
      presence_staff: 'A technician is currently viewing this ticket',
      presence_customer: 'The requester is currently viewing this ticket',
      group_label_prefix: 'Group', viewing_as_title: 'View of', viewing_as_hint: "You're viewing this person's tickets in read-only mode.",
      viewas_banner_text: "You're viewing the platform as", viewas_readonly_suffix: 'read-only', viewas_exit: 'Exit this mode',
      backlog_hint: 'Unassigned tickets, ordered by SLA urgency.',
      bulk_assign_placeholder: 'Assign to...', bulk_status_placeholder: 'Change status...', bulk_clear_selection: 'Clear selection',
      bulk_selected_count: 'Selected:', toast_bulk_assigned: 'Tickets assigned', toast_bulk_status_updated: 'Status updated on selected tickets',
      add_tag_placeholder: 'Add a tag and press enter',
      linked_tickets_title: 'Linked tickets', link_ticket_placeholder: 'Ticket number (e.g. 12)', btn_link_ticket: 'Link',
      no_linked_tickets_hint: 'No linked tickets.',
      btn_watch: 'Watch', btn_unwatch: 'Unwatch', toast_now_watching: 'You are now watching this ticket', toast_stopped_watching: 'You stopped watching this ticket',
      assets_hint: 'Device inventory, permanent assignments and loans.', new_asset_title: 'New asset',
      field_name: 'Name', field_tag: 'Tag/asset number', btn_add_asset: 'Add asset',
      table_type: 'Type', table_tag: 'Tag', table_status: 'Status', table_assignment: 'Assignment', table_due_date: 'Due date',
      assignment_permanent: 'Permanent', assignment_loan: 'Loan', none_option: 'None', no_assets_found: 'No assets found.',
      toast_asset_status_updated: 'Asset status updated', toast_assignment_updated: 'Assignment updated',
      toast_assignee_updated: 'Assignee updated', toast_due_date_updated: 'Due date updated',
      confirm_delete_asset: 'Delete this asset?', toast_asset_deleted: 'Asset deleted', delete_asset_title: 'Delete asset',
      search_hint: 'Search by ticket number, keyword or requester: results appear as you type.',
      search_placeholder_full: 'Ticket number, keyword, requester...', all_groups_option: 'All groups', all_tags_option: 'All tags',
      report_hint: 'Volumes, resolution times and SLA compliance by group and agent.',
      chart_volume_by_group: 'Ticket volume by group', chart_avg_resolution: 'Average resolution time (hours) by group',
      chart_sla_compliance: 'SLA compliance by group (%)', chart_load_by_agent: 'Ticket load by agent',
      chart_csat: 'Average satisfaction by group (out of 5)', no_ratings_yet: 'No ratings yet.', report_col_rating: 'Rating',
      no_data: 'No data.', no_resolved_yet: 'No resolved tickets yet.',
      no_group_sla_configured: 'No group with SLA configured.', no_assigned_tickets: 'No assigned tickets.',
      no_group_label: 'No group',
      filter_all_teams: 'All teams', filter_all_members: 'All members', report_chart_type_label: 'Chart type',
      chart_type_bar: 'Bar', chart_type_donut: 'Donut',
      report_date_from: 'From', report_date_to: 'To',
      btn_export_csv: 'Export CSV', btn_export_excel: 'Export Excel',
      report_export_count_label: 'Tickets in filter:',
      toast_export_no_data: 'No tickets match the selected filters',
      toast_export_failed: 'Export failed',
      report_col_number: 'Number', report_col_subject: 'Subject', report_col_type: 'Type', report_col_status: 'Status',
      report_col_priority: 'Priority', report_col_group: 'Group', report_col_requester: 'Requester',
      report_col_requester_email: 'Requester email', report_col_assignee: 'Assignee',
      report_col_created: 'Created at', report_col_resolved: 'Resolved at', report_col_resolution_hours: 'Resolution hours',
      report_col_sla: 'SLA',
      audit_hint: 'Complete trail of every change and message across all tickets, including internal notes — built for review and external audits.',
      audit_search_placeholder: 'Search by text, author, or ticket number...',
      audit_kind_event: 'Change', audit_kind_comment: 'Message', audit_kind_internal_note: 'Internal note',
      audit_kind_admin: 'Administration',
      audit_filter_all: 'All activity', audit_filter_ticket: 'Tickets only', audit_filter_admin: 'Administration only',
      audit_col_date: 'Date & time', audit_col_ticket: 'Ticket', audit_col_subject: 'Ticket subject', audit_col_kind: 'Type',
      audit_col_actor: 'Author', audit_col_message: 'Detail',
      your_account_title: 'Your account', change_password_title: 'Change password',
      current_password_label: 'Current password', new_password_label: 'New password',
      confirm_new_password_label: 'Confirm new password', btn_update_password: 'Update password',
      change_email_title: 'Change email', new_email_label: 'New email', btn_update_email: 'Update email',
      passwords_dont_match: 'The new passwords do not match',
      toast_password_updated: 'Password updated', toast_email_updated: 'Email updated',
      settings_language_title: 'Language', settings_lang_hint: 'Choose the interface language.',
      personalization_title: 'Personalization', personalization_hint: 'Choose the main interface color.',
      cold_start_hint: 'The server is waking up after a period of inactivity, one moment...',
      admin_title: 'Administration', access_denied: 'Access not allowed.', person_card_title: 'Person profile',
      org_open_tickets: 'open', org_sla_breach: 'overdue', org_node_hint: 'Click to see the team\'s tickets',
      admin_create_staff_title: 'Create staff account', admin_group_optional_label: 'Assignment group (optional)',
      admin_group_hint: 'Members of the same group can see each other for ticket assignment',
      account_locale_label: 'Account language', account_locale_hint: 'Emails sent to this account will use this language',
      btn_create_account: 'Create account', role_agent_option: 'Agent', role_admin_option: 'Administrator',
      admin_categories_title: 'Ticket categories', admin_categories_hint: 'Customize the categories available in the ticket form, their icon, and the team they are assigned to by default.',
      field_category_name: 'Category name', field_icon: 'Icon', field_default_team: 'Default team', option_none: 'None', option_select_placeholder: 'Select...', btn_add: 'Add', yes_label: 'Yes', no_label: 'No',
      canned_picker_placeholder: 'Canned response...', btn_insert: 'Insert',
      admin_groups_title: 'Assignment groups', admin_groups_hint: 'Each group has its own SLA (response/resolution hours) and working hours: outside that window, and on weekends, the SLA pauses and resumes on the next shift.',
      admin_automations_title: 'Automations', admin_automations_hint: '"If X happens then do Y" rules: on ticket creation or update, if the conditions match, the chosen actions are applied automatically.',
      field_rule_name: 'Rule name', field_rule_trigger: 'When it fires', trigger_created: 'On ticket creation', trigger_updated: 'When the ticket is updated',
      rule_conditions_label: 'Conditions (all optional)', field_group_condition: 'Ticket group',
      rule_actions_label: 'Actions', action_set_status: 'Set status', action_set_priority: 'Set priority',
      action_assign_group: 'Assign to group', action_assign_user: 'Assign to user',
      action_add_note: 'Add internal note', action_add_note_placeholder: 'Internal note text to add automatically',
      btn_create_rule: 'Create rule', rule_no_conditions: 'No conditions (always applies)', no_rules_hint: 'No automation rules configured.',
      toast_rule_updated: 'Rule updated', toast_rule_deleted: 'Rule deleted', toast_rule_added: 'Rule created',
      admin_custom_fields_title: 'Custom fields', admin_custom_fields_hint: 'Add extra fields to the ticket creation form, either global or scoped to a specific category.',
      field_field_name: 'Field name', field_field_type: 'Type', field_type_text: 'Text', field_type_number: 'Number', field_type_textarea: 'Long text', field_type_select: 'Choice', field_type_checkbox: 'Checkbox',
      field_field_options: 'Options (comma-separated)', field_field_options_placeholder: 'E.g: Low, Medium, High', field_field_category: 'Category', field_global_option: 'Global (all categories)',
      field_required_label: 'Required', btn_add_field: 'Add field', no_fields_hint: 'No custom fields configured.',
      toast_field_added: 'Field added', toast_field_deleted: 'Field deleted',
      admin_canned_title: 'Canned responses', admin_canned_hint: 'Ready-made text that staff can quickly insert into ticket comments.',
      field_canned_title: 'Title', field_canned_body: 'Response text', btn_add_canned: 'Add canned response', no_canned_hint: 'No canned responses configured.',
      toast_canned_added: 'Canned response added', toast_canned_deleted: 'Canned response deleted',
      admin_templates_title: 'Ticket templates', admin_templates_hint: 'Preset templates to speed up opening recurring requests, selectable by users on the new-ticket form.',
      field_template_name: 'Template name', btn_add_template: 'Add template', no_templates_hint: 'No templates configured.',
      toast_template_added: 'Template added', toast_template_deleted: 'Template deleted',
      admin_holidays_title: 'Holidays', admin_holidays_hint: 'Dates listed here are excluded from SLA business-hours calculations, in addition to weekends.',
      field_date: 'Date', field_holiday_name: 'Holiday name', btn_add_holiday: 'Add holiday', no_holidays_hint: 'No holidays configured.',
      toast_holiday_added: 'Holiday added', toast_holiday_deleted: 'Holiday removed',
      field_group_name: 'Group name', field_parent_group: 'Parent group', option_no_parent: 'None (top level)',
      field_response_hours: 'Response (h)', field_resolve_hours: 'Resolution (h)', field_shift_start: 'Shift start', field_shift_end: 'Shift end',
      btn_create_group: 'Create group', delete_group_title: 'Delete group', shift_from_label: 'Shift from', shift_to_label: 'to',
      confirm_delete_group: 'Delete this group?', toast_sla_updated: 'SLA updated', toast_work_hours_updated: 'Work hours updated',
      toast_group_deleted: 'Group deleted', toast_group_created: 'Group created', toast_default_team_updated: 'Default team updated',
      org_drop_root_hint: 'Drag a group here to make it top-level', toast_group_reparented: 'Group reorganized',
      assign_to_me_btn: 'Assign to me', toast_ticket_assigned_to_you: 'Ticket assigned to you',
      group_by_team_label: 'Group by team',
      toast_category_deleted: 'Category deleted', toast_category_added: 'Category added', delete_category_title: 'Delete category',
      no_categories_hint: 'No categories.', no_groups_hint: 'No groups.', account_created_for: 'Account created for',
      temp_password_hint: 'Temporary password (share it securely, it won\'t be shown again):', toast_staff_created: 'Staff account created',
      search_person_label: 'Search person', search_person_placeholder: 'Name or email...', no_people_found: 'No people found.',
      th_name: 'Name', th_email: 'Email', th_role: 'Role', th_group: 'Group', th_registered: 'Registered',
      org_section_title: 'Organization', org_section_hint: 'The chosen name appears in the header and in emails sent to users.',
      field_org_name: 'Organization name', btn_save: 'Save', toast_org_updated: 'Organization name updated',
      field_org_logo: 'Company logo', logo_hint: 'PNG or JPG, resized automatically.', btn_remove_logo: 'Remove logo',
      toast_logo_updated: 'Logo updated', toast_logo_removed: 'Logo removed',
      field_manager: 'Manager', field_is_external: 'External (contractor/vendor, not an employee)',
      external_badge: 'External', direct_reports_title: 'Direct reports', no_direct_reports: 'No direct reports.',
      manager_label: 'Manager', no_manager_label: 'No manager', toast_external_updated: 'Classification updated',
      toast_manager_updated: 'Manager updated',
      invite_email_title: 'Account invite email',
      invite_email_hint: 'Customize the subject and text of the automatic email sent when you create a new staff account. Leave it empty to use the default text. Available placeholders:',
      field_subject: 'Subject', field_email_body: 'Email text', btn_save_template: 'Save template', toast_template_updated: 'Template updated',
      not_found_text: 'Page not found.', back_to_dashboard: 'Back to dashboard', placeholder_default: '(default)',
      impersonate_search_label: 'Search for a person to view read-only',
      notifications_title: 'Notifications', mark_all_read: 'Mark all as read', no_notifications: 'No notifications.',
      confirm_password_label: 'Confirm password', no_data_available: 'No data available.', send_request_btn: 'Send request',
      show_password_label: 'Show password', password_min_hint: 'At least 8 characters, with letters and numbers',
      passwords_mismatch: 'Passwords do not match', toast_welcome_back: 'Welcome back', toast_account_created: 'Account created, welcome',
      new_ticket_title: 'New ticket', new_ticket_hint: 'Tell us about the problem: just a few fields, our team takes care of the rest.',
      field_request_type: 'Request type', type_incident_suffix: '— something isn\'t working', type_task_suffix: '— schedulable request',
      field_template: 'Start from a template', template_blank_option: 'No template (start from scratch)',
      field_category: 'Category', field_subject_placeholder: 'A short title for the issue', field_urgency: 'How urgent is it?',
      category_search_placeholder: 'Search a category (e.g. laptop, furniture, marketing...)',
      category_selected_label: 'Selected category:', field_parent_category: 'Parent category',
      option_top_level_category: '— Top-level category (no parent) —',
      field_description_placeholder: 'Describe the problem in detail', toast_request_sent: 'Request sent successfully',
      toast_asset_created: 'Asset created', toast_app_installed: 'App installed successfully',
      ios_install_hint: 'To install: tap Share, then "Add to Home Screen"',
      microsoft_login_failed: 'Microsoft sign-in failed',
      account_details_title: 'Account details', registered_on_label: 'Registered on', field_role: 'Role', field_locale: 'Language',
      reset_password_btn: 'Reset password', ticket_activity_title: 'Ticket activity',
      opened_by_person: 'Opened by this person', assigned_to_person: 'Assigned to this person',
      toast_role_updated: 'Role updated', toast_group_updated: 'Group updated', toast_locale_updated: 'Language updated',
      confirm_reset_password_prefix: 'Generate a new temporary password for', confirm_reset_password_suffix: '?',
      password_reset_success_msg: 'Password reset.',
      new_temp_password_hint: 'New temporary password (share it securely, it will not be shown again):',
      toast_password_reset: 'Password reset', settings_title: 'Settings',
      motion_fluid_label: 'Smooth animations', toast_accent_updated: 'Color updated', toast_motion_updated: 'Animation preference updated',
      desktop_notif_label: 'Desktop notifications', desktop_notif_hint: 'Get an OS-level pop-up alert for new tickets and comments, even when the tab is not active.',
      toast_desktop_notif_enabled: 'Desktop notifications enabled', toast_desktop_notif_disabled: 'Desktop notifications disabled',
      toast_desktop_notif_denied: 'Permission denied by the browser: enable notifications for this site in your browser settings',
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
    assets: 'nav_assets', report: 'nav_report', audit: 'nav_audit', admin: 'nav_admin', profile: 'nav_profile',
  };
  const NAV_ICON_BY_ROUTE = {
    dashboard: 'ticket', new: 'plus', search: 'inbox', backlog: 'check',
    assets: 'monitor', report: 'activity', audit: 'eye', admin: 'shield', profile: 'userCircle',
  };

  function applyChromeTranslations() {
    document.querySelectorAll('.main-nav a[data-nav]').forEach((a) => {
      const key = NAV_KEY_BY_ROUTE[a.dataset.nav];
      const iconName = NAV_ICON_BY_ROUTE[a.dataset.nav];
      if (key) a.innerHTML = `${icon(iconName, 'nav-icon')}<span class="nav-label">${t(key)}</span>`;
    });
    logoutBtn.innerHTML = `${icon('logout')} <span class="nav-label">${t('logout')}</span>`;
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

  let coldStartToastShown = false;
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const wakeTimer = setTimeout(() => {
      if (!coldStartToastShown) {
        coldStartToastShown = true;
        showToast(t('cold_start_hint'), '', 20000);
      }
    }, 4000);

    let res;
    try {
      res = await fetch(`${getApiBase()}/api${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } finally {
      clearTimeout(wakeTimer);
    }

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
    document.body.classList.remove('role-customer', 'role-agent', 'role-admin', 'super-admin');
    if (state.user) {
      document.body.classList.add(`role-${state.user.role}`);
      if (state.user.is_super_admin) document.body.classList.add('super-admin');
      userBadge.innerHTML = `${icon('userCircle')} <span>${escapeHtml(state.user.name)} · ${roleLabels()[state.user.role] || state.user.role}</span>`;
      userBadge.style.display = '';
      logoutBtn.style.display = '';
      notifBtn.style.display = '';
      if (!notifSocket) {
        loadNotifications();
        connectNotifSocket();
      }
    } else {
      userBadge.style.display = 'none';
      logoutBtn.style.display = 'none';
      notifBtn.style.display = 'none';
      notifDropdown.hidden = true;
      notifBadge.hidden = true;
      teardownNotifSocket();
    }
  }

  function getMotionPref() {
    const stored = localStorage.getItem('ticketing_motion');
    if (stored === 'full' || stored === 'reduced') return stored;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  }
  function applyMotion(pref) {
    document.documentElement.classList.toggle('reduce-motion', pref === 'reduced');
  }
  function setMotion(pref) {
    localStorage.setItem('ticketing_motion', pref);
    applyMotion(pref);
  }

  function desktopNotifSupported() {
    return typeof Notification !== 'undefined';
  }
  function desktopNotifEnabled() {
    return desktopNotifSupported() && localStorage.getItem('ticketing_desktop_notif') === 'on' && Notification.permission === 'granted';
  }
  async function setDesktopNotifPref(on) {
    if (!desktopNotifSupported()) return false;
    if (!on) {
      localStorage.setItem('ticketing_desktop_notif', 'off');
      return false;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') {
      localStorage.setItem('ticketing_desktop_notif', 'on');
      return true;
    }
    localStorage.setItem('ticketing_desktop_notif', 'off');
    return false;
  }
  function showDesktopNotification(notification) {
    if (!desktopNotifEnabled()) return;
    try {
      const popup = new Notification(getOrgNameCached() || 'Ticketing', {
        body: notification.message,
        icon: localStorage.getItem('ticketing_org_logo') || 'img/icon.svg',
        tag: `ticket-${notification.ticket_id}`,
      });
      popup.onclick = () => {
        window.focus();
        if (notification.ticket_id) location.hash = `#/ticket/${notification.ticket_id}`;
        popup.close();
      };
    } catch {}
  }
  function getOrgNameCached() {
    return localStorage.getItem('ticketing_org_name') || '';
  }

  function applyOrgName(name) {
    if (!name) return;
    const brandEl = document.querySelector('.brand span');
    if (brandEl) brandEl.textContent = name;
    document.title = document.title.replace(/^[^·]+/, `${name} `);
  }

  function applyOrgLogo(logoDataUri) {
    document.querySelectorAll('.brand img').forEach((img) => {
      img.src = logoDataUri || 'img/icon.svg';
    });
  }

  async function loadOrgBranding() {
    const cachedName = localStorage.getItem('ticketing_org_name');
    if (cachedName) applyOrgName(cachedName);
    const cachedLogo = localStorage.getItem('ticketing_org_logo');
    if (cachedLogo) applyOrgLogo(cachedLogo);
    try {
      const { orgName, orgLogo } = await api('/settings');
      applyOrgName(orgName);
      localStorage.setItem('ticketing_org_name', orgName);
      applyOrgLogo(orgLogo);
      if (orgLogo) localStorage.setItem('ticketing_org_logo', orgLogo);
      else localStorage.removeItem('ticketing_org_logo');
    } catch {}
  }

  const viewAsBanner = document.getElementById('viewAsBanner');
  function renderViewAsBanner() {
    if (state.viewAs) {
      viewAsBanner.hidden = false;
      viewAsBanner.innerHTML = `${icon('eye')} <span>${t('viewas_banner_text')} <strong>${escapeHtml(state.viewAs.name)}</strong> · ${t('viewas_readonly_suffix')}</span> <button type="button" id="stopImpersonateBtn" class="btn btn-sm">${t('viewas_exit')}</button>`;
      document.getElementById('stopImpersonateBtn').addEventListener('click', stopImpersonation);
    } else {
      viewAsBanner.hidden = true;
      viewAsBanner.innerHTML = '';
    }
  }

  function startImpersonation(user) {
    state.viewAs = { id: user.id, name: user.name, role: user.role, group_id: user.group_id || null, is_super_admin: !!user.is_super_admin };
    renderViewAsBanner();
    showToast(`${t('viewas_banner_text')} ${user.name}`, '');
    location.hash = '#/dashboard';
    route();
  }

  function stopImpersonation() {
    state.viewAs = null;
    renderViewAsBanner();
    route();
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
            showToast(err.message || t('microsoft_login_failed'), 'error');
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

  function setSidebarOpen(open) {
    sidebarEl.classList.toggle('open', open);
    sidebarBackdrop.hidden = !open;
    navToggle.setAttribute('aria-expanded', String(open));
  }
  navToggle.addEventListener('click', () => {
    setSidebarOpen(!sidebarEl.classList.contains('open'));
  });
  sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
  mainNav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setSidebarOpen(false);
  });

  function setSidebarCollapsed(collapsed) {
    sidebarEl.classList.toggle('collapsed', collapsed);
    sidebarCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem('ticketing_sidebar_collapsed', collapsed ? '1' : '0');
  }
  sidebarCollapseBtn.addEventListener('click', () => {
    setSidebarCollapsed(!sidebarEl.classList.contains('collapsed'));
  });
  sidebarCollapseBtn.innerHTML = icon('arrowLeft');
  setSidebarCollapsed(localStorage.getItem('ticketing_sidebar_collapsed') === '1');

  logoutBtn.addEventListener('click', () => {
    state.viewAs = null;
    renderViewAsBanner();
    setSession(null, null);
    location.hash = '#/login';
  });

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.innerHTML = icon('settings');
  settingsBtn.addEventListener('click', () => { location.hash = '#/settings'; });

  const notifBtn = document.getElementById('notifBtn');
  const notifBadge = document.getElementById('notifBadge');
  const notifDropdown = document.getElementById('notifDropdown');
  notifBtn.insertAdjacentHTML('afterbegin', icon('bell'));

  let notifItems = [];
  let notifSocket = null;

  function updateNotifBadge() {
    const unread = notifItems.filter((n) => !n.is_read).length;
    if (unread > 0) {
      notifBadge.hidden = false;
      notifBadge.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      notifBadge.hidden = true;
    }
  }

  function renderNotifDropdown() {
    notifDropdown.innerHTML = `
      <div class="notif-header">
        <span>${t('notifications_title')}</span>
        ${notifItems.some((n) => !n.is_read) ? `<button type="button" id="notifMarkAllBtn" class="btn-link">${t('mark_all_read')}</button>` : ''}
      </div>
      <div class="notif-list">
        ${notifItems.length ? notifItems.map((n) => `
          <button type="button" class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-ticket-id="${n.ticket_id || ''}">
            <span>${escapeHtml(n.message)}</span>
            <span class="notif-time">${formatDate(n.created_at)}</span>
          </button>`).join('') : `<p class="hint" style="padding:0.75rem">${t('no_notifications')}</p>`}
      </div>`;

    const markAllBtn = document.getElementById('notifMarkAllBtn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await api('/notifications/read-all', { method: 'POST' }); } catch { return; }
        notifItems = notifItems.map((n) => ({ ...n, is_read: 1 }));
        updateNotifBadge();
        renderNotifDropdown();
      });
    }

    notifDropdown.querySelectorAll('.notif-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const ticketId = btn.dataset.ticketId;
        try { await api(`/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
        notifItems = notifItems.map((n) => (String(n.id) === id ? { ...n, is_read: 1 } : n));
        updateNotifBadge();
        notifDropdown.hidden = true;
        if (ticketId) location.hash = `#/ticket/${ticketId}`;
      });
    });
  }

  async function loadNotifications() {
    try {
      const { notifications } = await api('/notifications');
      notifItems = notifications;
      updateNotifBadge();
      renderNotifDropdown();
    } catch {}
  }

  function teardownNotifSocket() {
    if (notifSocket) {
      try { notifSocket.disconnect(); } catch {}
      notifSocket = null;
    }
  }

  async function connectNotifSocket() {
    teardownNotifSocket();
    try {
      const base = getApiBase();
      await loadScriptOnce(`${base}/socket.io/socket.io.js`);
      if (!window.io) return;
      const socket = window.io(base || undefined, {
        auth: { token: state.token },
        transports: ['websocket', 'polling'],
      });
      socket.on('notification:new', (notification) => {
        notifItems = [notification, ...notifItems].slice(0, 30);
        updateNotifBadge();
        renderNotifDropdown();
        showToast(notification.message, '');
        showDesktopNotification(notification);
      });
      notifSocket = socket;
    } catch {}
  }

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.hidden = !notifDropdown.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!notifDropdown.hidden && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.hidden = true;
    }
  });

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
    if (page !== 'dashboard') teardownDashboardAutoUpdate();

    appEl.classList.remove('route-fade');
    void appEl.offsetWidth;
    appEl.classList.add('route-fade');

    try {
      switch (page) {
        case 'login': return renderLogin();
        case 'register': return renderRegister();
        case 'dashboard': return renderDashboard();
        case 'new': return renderNewTicket();
        case 'ticket': return renderTicketDetail(param);
        case 'admin': return renderAdmin();
        case 'users': return renderUserDetail(param);
        case 'profile': return renderProfile();
        case 'settings': return renderSettings();
        case 'backlog': return renderBacklog();
        case 'assets': return renderAssets();
        case 'search': return renderSearch();
        case 'report': return renderReport();
        case 'audit': return renderAudit();
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
                <button type="button" id="pwToggle" class="icon-btn password-toggle" aria-label="${t('show_password_label')}"></button>
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
        showToast(`${t('toast_welcome_back')}, ${user.name}`, 'success');
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
              <label for="name">${t('field_name')}</label>
              <input id="name" type="text" required autocomplete="name" />
            </div>
            <div class="field">
              <label for="email">${t('login_email')}</label>
              <input id="email" type="email" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="password">${t('login_password')}</label>
              <div class="password-field">
                <input id="password" type="password" required minlength="8" autocomplete="new-password" />
                <button type="button" id="pwToggle" class="icon-btn password-toggle" aria-label="${t('show_password_label')}"></button>
              </div>
              <span class="hint">${t('password_min_hint')}</span>
            </div>
            <div class="field">
              <label for="password2">${t('confirm_password_label')}</label>
              <div class="password-field">
                <input id="password2" type="password" required minlength="8" autocomplete="new-password" />
                <button type="button" id="pwToggle2" class="icon-btn password-toggle" aria-label="${t('show_password_label')}"></button>
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
        errEl.textContent = t('passwords_mismatch');
        return;
      }
      try {
        const { token, user } = await api('/auth/register', { method: 'POST', body: { name, email, password } });
        setSession(token, user);
        showToast(`${t('toast_account_created')} ${user.name}`, 'success');
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

  function resolveCssColor(value) {
    if (!value || !value.startsWith('var(')) return value;
    const varName = value.slice(4, -1).trim();
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return resolved || '#8f2436';
  }

  function getCustomChartColor(dim, key) {
    try {
      const stored = JSON.parse(localStorage.getItem('ticketing_chart_colors') || '{}');
      return stored[`${dim}:${key}`] || null;
    } catch { return null; }
  }

  function setCustomChartColor(dim, key, color) {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('ticketing_chart_colors') || '{}'); } catch { stored = {}; }
    stored[`${dim}:${key}`] = color;
    localStorage.setItem('ticketing_chart_colors', JSON.stringify(stored));
  }

  function donutChart(rows, total, opts = {}) {
    const activeRows = rows.filter((r) => r.value > 0).map((r) => ({ ...r, color: resolveCssColor(getCustomChartColor(opts.dim, r.key) || r.color) }));
    if (!total || !activeRows.length) return `<p class="hint">${t('no_data_available')}</p>`;
    let cumulative = 0;
    const stops = activeRows.map((r) => {
      const startPct = (cumulative / total) * 100;
      cumulative += r.value;
      const endPct = (cumulative / total) * 100;
      return `${r.color} ${startPct}% ${endPct}%`;
    }).join(', ');
    const selectable = !!opts.onSelect;
    return `
      <div class="donut-wrap">
        <div class="donut-chart" style="background:conic-gradient(${stops})" role="img" aria-label="${activeRows.map((r) => `${r.label}: ${r.value}`).join(', ')}">
          <div class="donut-center"><span class="donut-total">${total}</span><span class="donut-total-label">${t('chart_total')}</span></div>
        </div>
        <div class="donut-legend">
          ${activeRows.map((r) => `
            <div class="donut-legend-item ${selectable ? 'selectable' : ''}" data-key="${escapeHtml(r.key)}">
              <input type="color" class="donut-color-input" data-key="${escapeHtml(r.key)}" value="${r.color.startsWith('#') ? r.color : '#8f2436'}" title="Personalizza colore" />
              <span class="donut-legend-label">${escapeHtml(r.label)}</span>
              <span class="donut-legend-value">${r.value} · ${Math.round((r.value / total) * 100)}%</span>
            </div>`).join('')}
        </div>
      </div>`;
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
    const noGroupLabel = t('no_group_label');
    const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
    const groups = new Map();
    staffUsers.forEach((u) => {
      const key = u.group_name ? (u.group_parent_name ? `${u.group_parent_name} / ${u.group_name}` : u.group_name) : noGroupLabel;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(u);
    });
    const sortedGroups = [...groups.keys()].sort((a, b) => {
      if (a === noGroupLabel) return 1;
      if (b === noGroupLabel) return -1;
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
    const emptyOption = emptyLabel !== null ? `<option value="">${escapeHtml(emptyLabel || t('no_group_option'))}</option>` : '';
    return emptyOption + flat.map((g) => `
      <option value="${g.id}" ${Number(selectedId) === g.id ? 'selected' : ''}>${'  '.repeat(g.depth)}${g.depth ? '– ' : ''}${escapeHtml(g.name)}</option>
    `).join('');
  }

  async function renderDashboard() {
    const viewingAs = state.viewAs;
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${viewingAs ? `${t('viewing_as_title')} ${escapeHtml(viewingAs.name)}` : (isStaff() ? t('dashboard_title_staff') : t('dashboard_title_customer'))}</h1>
          <p class="hint">${viewingAs ? t('viewing_as_hint') : (isStaff() ? t('dashboard_hint_staff') : t('dashboard_hint_customer'))}</p>
        </div>
        <div style="display:flex;gap:0.6rem;align-items:center">
          ${!viewingAs ? `
          <button type="button" id="autoUpdateBtn" class="btn btn-ghost">
            <span id="autoUpdateDot" class="live-dot"></span>
            <span id="autoUpdateLabel">${t('auto_update')}</span>
          </button>
          <a class="btn" href="#/new">${icon('plus')} ${t('new_ticket_btn')}</a>` : ''}
          ${state.user.is_super_admin && !viewingAs ? `<button type="button" id="dashImpersonateBtn" class="btn btn-ghost">${icon('eye')} ${t('impersonate')}</button>` : ''}
          ${state.user.is_super_admin && !viewingAs ? `<button type="button" id="groupByTeamBtn" class="btn btn-ghost">${icon('users')} ${t('group_by_team_label')}</button>` : ''}
        </div>
      </div>
      <div id="dashImpersonatePanel" hidden></div>
      <div id="personalCounter"></div>
      <div id="statsRow" class="stat-row"></div>
      <div id="chartsRow" class="charts-row"></div>
      <div id="scopedChartsRow" class="charts-row"></div>
      <div class="filters">
        <select id="fType">
          <option value="">${t('filter_all_types')}</option>
          ${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="fStatus">
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="fPriority">
          <option value="">${t('filter_all_priorities')}</option>
          ${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        ${isStaff() && !viewingAs ? `
        <select id="fAssigned">
          <option value="">${t('filter_all_assignees')}</option>
          <option value="me">${t('filter_assigned_me')}</option>
          <option value="unassigned">${t('filter_unassigned')}</option>
        </select>` : ''}
        <input id="fQuery" type="search" placeholder="${isStaff() ? t('search_placeholder_staff') : t('search_placeholder_customer')}" />
      </div>
      <div id="ticketList" class="skeleton-grid">
        ${Array(4).fill('<div class="skeleton-card"></div>').join('')}
      </div>`;

    const dashImpersonateBtn = document.getElementById('dashImpersonateBtn');
    if (dashImpersonateBtn) {
      dashImpersonateBtn.addEventListener('click', async () => {
        const panel = document.getElementById('dashImpersonatePanel');
        if (!panel.hidden) { panel.hidden = true; return; }
        panel.hidden = false;
        panel.innerHTML = `
          <div class="card" style="margin-bottom:1.25rem">
            <div class="field"><label for="impersonateSearch">${t('impersonate_search_label')}</label>
              <input id="impersonateSearch" type="search" placeholder="${t('search_person_placeholder')}" /></div>
            <div id="impersonateResults" class="impersonate-results"></div>
          </div>`;
        const { users } = await api('/users');
        const searchInput = document.getElementById('impersonateSearch');
        const resultsEl = document.getElementById('impersonateResults');
        function renderResults(list) {
          resultsEl.innerHTML = list.length ? list.slice(0, 8).map((u) => `
            <button type="button" class="impersonate-result" data-user-id="${u.id}">
              <span>${escapeHtml(u.name)}</span>
              <span class="hint">${escapeHtml(u.email)} · ${roleLabels()[u.role] || u.role}</span>
            </button>`).join('') : `<p class="hint">${t('no_people_found')}</p>`;
          resultsEl.querySelectorAll('.impersonate-result').forEach((btn) => {
            btn.addEventListener('click', () => {
              const target = list.find((u) => u.id === Number(btn.dataset.userId));
              if (target) startImpersonation(target);
            });
          });
        }
        renderResults(users.filter((u) => u.id !== state.user.id));
        searchInput.addEventListener('input', () => {
          const q = searchInput.value.trim().toLowerCase();
          const filtered = users.filter((u) => u.id !== state.user.id && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
          renderResults(filtered);
        });
        searchInput.focus();
      });
    }

    const listEl = document.getElementById('ticketList');
    const statsEl = document.getElementById('statsRow');
    const personalEl = document.getElementById('personalCounter');
    const chartsEl = document.getElementById('chartsRow');
    const scopedChartsEl = document.getElementById('scopedChartsRow');
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
      const counts = { open: 0, in_progress: 0, waiting_customer: 0, resolved: 0, closed: 0, urgent: 0, incident: 0, task: 0 };
      tickets.forEach((tk) => {
        counts[tk.status] = (counts[tk.status] || 0) + 1;
        counts[tk.type] = (counts[tk.type] || 0) + 1;
        if (tk.priority === 'urgent' && tk.status !== 'closed' && tk.status !== 'resolved') counts.urgent += 1;
      });
      statsEl.innerHTML = `
        <button type="button" class="stat-card accent-open" data-status="open"><div class="stat-value">${counts.open}</div><div class="stat-label">${t('stat_open')}</div></button>
        <button type="button" class="stat-card accent-in_progress" data-status="in_progress"><div class="stat-value">${counts.in_progress}</div><div class="stat-label">${t('stat_in_progress')}</div></button>
        <button type="button" class="stat-card accent-waiting_customer" data-status="waiting_customer"><div class="stat-value">${counts.waiting_customer}</div><div class="stat-label">${t('stat_waiting_customer')}</div></button>
        <button type="button" class="stat-card accent-resolved" data-status="resolved"><div class="stat-value">${counts.resolved}</div><div class="stat-label">${t('stat_resolved')}</div></button>
        <button type="button" class="stat-card accent-urgent" data-priority="urgent"><div class="stat-value">${counts.urgent}</div><div class="stat-label">${t('stat_urgent')}</div></button>
        <button type="button" class="stat-card accent-incident" data-type="incident"><div class="stat-value">${counts.incident}</div><div class="stat-label">${t('stat_incidents')}</div></button>
        <button type="button" class="stat-card accent-task" data-type="task"><div class="stat-value">${counts.task}</div><div class="stat-label">${t('stat_tasks')}</div></button>`;

      statsEl.querySelectorAll('.stat-card').forEach((card) => {
        card.addEventListener('click', () => {
          if (card.dataset.status !== undefined) fStatus.value = card.dataset.status;
          if (card.dataset.priority !== undefined) fPriority.value = card.dataset.priority;
          if (card.dataset.type !== undefined) fType.value = card.dataset.type;
          load();
        });
      });
    }

    function renderPersonalCounter(tickets) {
      let value, label;
      const asId = viewingAs ? viewingAs.id : state.user.id;
      const asStaff = viewingAs ? viewingAs.role !== 'customer' : isStaff();
      if (asStaff) {
        value = tickets.filter((tk) => tk.assigned_to === asId && tk.status !== 'resolved' && tk.status !== 'closed').length;
        label = viewingAs ? `${viewingAs.name} — ${t('personal_counter_staff')}` : t('personal_counter_staff');
      } else {
        value = tickets.filter((tk) => tk.status === 'open' || tk.status === 'in_progress').length;
        label = viewingAs ? `${viewingAs.name} — ${t('personal_counter_customer')}` : t('personal_counter_customer');
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

    function chartDimensions() {
      return { status: t('dim_status'), sla: t('dim_sla'), priority: t('dim_priority'), type: t('dim_type'), category: t('dim_category'), assigned: t('dim_assigned') };
    }
    let currentChartDim = 'status';
    let lastTickets = [];

    function computeBreakdown(tickets, dim) {
      if (dim === 'status') {
        const order = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
        const colors = { open: 'var(--success)', in_progress: 'var(--warning)', waiting_customer: 'var(--waiting)', resolved: 'var(--type-task)', closed: 'var(--muted)' };
        return order.map((k) => ({ key: k, label: statusLabels()[k], value: tickets.filter((t) => t.status === k).length, color: colors[k] }));
      }
      if (dim === 'sla') {
        const order = ['on_track', 'at_risk', 'breached'];
        const colors = { on_track: 'var(--success)', at_risk: 'var(--warning)', breached: 'var(--danger)' };
        return order.map((k) => ({ key: k, label: slaLabels()[k], value: tickets.filter((t) => t.sla_status === k).length, color: colors[k] }));
      }
      if (dim === 'priority') {
        const order = ['low', 'medium', 'high', 'urgent'];
        const colors = { low: 'var(--muted)', medium: 'var(--primary)', high: 'var(--warning)', urgent: 'var(--danger)' };
        return order.map((k) => ({ key: k, label: priorityLabels()[k], value: tickets.filter((t) => t.priority === k).length, color: colors[k] }));
      }
      if (dim === 'type') {
        const order = ['incident', 'task'];
        const colors = { incident: 'var(--type-incident)', task: 'var(--type-task)' };
        return order.map((k) => ({ key: k, label: typeLabels()[k], value: tickets.filter((t) => t.type === k).length, color: colors[k] }));
      }
      if (dim === 'category') {
        const counts = new Map();
        tickets.forEach((t) => counts.set(t.category, (counts.get(t.category) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));
      }
      if (dim === 'assigned') {
        const counts = new Map();
        tickets.forEach((tk) => {
          const label = tk.assignee_name || t('unassigned_label');
          counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));
      }
      return [];
    }

    const donutDims = ['status', 'sla', 'priority', 'type'];
    const filterableDims = ['status', 'priority', 'type'];

    function renderCharts(tickets) {
      chartsEl.innerHTML = '';
      if (!tickets.length) return;

      const rows = computeBreakdown(tickets, currentChartDim);
      chartsEl.innerHTML = `
        <div class="card chart-card chart-card-wide">
          <div class="chart-card-head">
            <h3 class="section-title" style="margin:0">${t('chart_title')}</h3>
            <select id="chartDim">
              ${Object.entries(chartDimensions()).map(([v, l]) => `<option value="${v}" ${v === currentChartDim ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${barChart(rows, tickets.length)}
        </div>
        ${donutDims.map((dim) => `
          <div class="card chart-card" data-dim="${dim}">
            <div class="chart-card-head">
              <h3 class="section-title" style="margin:0">${chartDimensions()[dim]}</h3>
            </div>
            ${donutChart(computeBreakdown(tickets, dim), tickets.length, { dim, onSelect: filterableDims.includes(dim) })}
          </div>`).join('')}`;

      document.getElementById('chartDim').addEventListener('change', (e) => {
        currentChartDim = e.target.value;
        renderCharts(tickets);
      });

      chartsEl.querySelectorAll('.chart-card[data-dim]').forEach((card) => {
        const dim = card.dataset.dim;
        card.querySelectorAll('.donut-legend-item.selectable').forEach((item) => {
          item.addEventListener('click', (e) => {
            if (e.target.classList.contains('donut-color-input')) return;
            const key = item.dataset.key;
            if (dim === 'status') fStatus.value = key;
            else if (dim === 'priority') fPriority.value = key;
            else if (dim === 'type') fType.value = key;
            load();
          });
        });
      });
      chartsEl.querySelectorAll('.chart-card[data-dim] .donut-color-input').forEach((input) => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('input', (e) => {
          const dim = input.closest('.chart-card[data-dim]').dataset.dim;
          setCustomChartColor(dim, input.dataset.key, e.target.value);
          renderCharts(tickets);
          if (dim === 'status' || dim === 'type') renderScopedCharts();
        });
      });
    }

    function scopedChartCard(dim, title, rows, total, emptyHint) {
      return `
        <div class="card chart-card" data-dim="${dim}">
          <div class="chart-card-head">
            <h3 class="section-title" style="margin:0">${escapeHtml(title)}</h3>
          </div>
          ${total ? donutChart(rows, total, { dim }) : `<p class="hint">${escapeHtml(emptyHint)}</p>`}
        </div>`;
    }

    async function renderScopedCharts() {
      const targetId = viewingAs ? viewingAs.id : state.user.id;
      const targetRole = viewingAs ? viewingAs.role : state.user.role;
      if (targetRole === 'customer') { scopedChartsEl.innerHTML = ''; return; }

      let groupId = null;
      let groupName = '';
      try {
        const { users } = await api('/users');
        const me = users.find((u) => u.id === targetId);
        if (me && me.group_id) {
          groupId = me.group_id;
          groupName = me.group_parent_name ? `${me.group_parent_name} / ${me.group_name}` : me.group_name;
        }
      } catch {}

      const [mineData, teamData] = await Promise.all([
        api(`/tickets?assigned=${targetId}`).catch(() => ({ tickets: [] })),
        groupId ? api(`/tickets?group=${groupId}`).catch(() => ({ tickets: [] })) : Promise.resolve({ tickets: [] }),
      ]);

      const mineRows = computeBreakdown(mineData.tickets, 'type');
      const teamRows = computeBreakdown(teamData.tickets, 'status');

      scopedChartsEl.innerHTML =
        scopedChartCard('type', t('chart_mine_title'), mineRows, mineData.tickets.length, t('no_tickets_found')) +
        scopedChartCard('status', groupName || t('chart_team_title'), teamRows, teamData.tickets.length, t('chart_no_team'));

      scopedChartsEl.querySelectorAll('.chart-card[data-dim] .donut-color-input').forEach((input) => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('input', (e) => {
          const dim = input.closest('.chart-card[data-dim]').dataset.dim;
          setCustomChartColor(dim, input.dataset.key, e.target.value);
          renderCharts(lastTickets);
          renderScopedCharts();
        });
      });
    }

    let groupByTeam = false;
    function renderGroupedTicketList(container, tickets) {
      if (!tickets.length) {
        container.className = '';
        container.innerHTML = `<div class="empty-state">${icon('inbox')}<span>${t('no_tickets_found')}</span></div>`;
        return;
      }
      const groups = new Map();
      tickets.forEach((tk) => {
        const key = groupLabel(tk) || t('no_group_label');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tk);
      });
      const noGroupKey = t('no_group_label');
      const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === noGroupKey) return 1;
        if (b === noGroupKey) return -1;
        return a.localeCompare(b);
      });
      container.className = '';
      container.innerHTML = sortedKeys.map((key) => `
        <div class="group-section">
          <h3 class="group-section-title">${escapeHtml(key)} <span class="group-section-count">${groups.get(key).length}</span></h3>
          <div class="ticket-grid">${groups.get(key).map(ticketCardHtml).join('')}</div>
        </div>`).join('');
      wireTicketCardActions(container);
    }

    let debounceTimer;
    async function load() {
      const params = new URLSearchParams();
      if (fType && fType.value) params.set('type', fType.value);
      if (fStatus.value) params.set('status', fStatus.value);
      if (fPriority.value) params.set('priority', fPriority.value);
      if (fAssigned && fAssigned.value) params.set('assigned', fAssigned.value);
      if (fQuery.value.trim()) params.set('q', fQuery.value.trim());
      if (viewingAs && viewingAs.role === 'customer') {
        params.set('createdBy', viewingAs.id);
      }

      try {
        const { tickets: fetched } = await api(`/tickets?${params.toString()}`);
        const tickets = (viewingAs && viewingAs.role !== 'customer' && !viewingAs.is_super_admin)
          ? fetched.filter((tk) => !tk.group_id || tk.group_id === viewingAs.group_id)
          : fetched;
        lastTickets = tickets;
        renderStats(tickets);
        renderPersonalCounter(tickets);
        renderCharts(tickets);
        renderScopedCharts();
        if (groupByTeam) renderGroupedTicketList(listEl, tickets);
        else renderTicketList(listEl, tickets);
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    const groupByTeamBtn = document.getElementById('groupByTeamBtn');
    if (groupByTeamBtn) {
      groupByTeamBtn.addEventListener('click', () => {
        groupByTeam = !groupByTeam;
        groupByTeamBtn.classList.toggle('active', groupByTeam);
        load();
      });
    }

    [fType, fStatus, fPriority, fAssigned].forEach((el) => el && el.addEventListener('change', load));
    fQuery.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 300);
    });

    const autoUpdateBtn = document.getElementById('autoUpdateBtn');
    if (autoUpdateBtn) {
      const setAutoUpdate = (enabled) => {
        teardownDashboardAutoUpdate();
        autoUpdateBtn.classList.toggle('active', enabled);
        document.getElementById('autoUpdateLabel').textContent = enabled ? t('auto_update_on') : t('auto_update');
        localStorage.setItem('ticketing_autoupdate', enabled ? '1' : '0');
        if (enabled) dashboardAutoTimer = setInterval(load, 15000);
      };
      autoUpdateBtn.addEventListener('click', () => {
        setAutoUpdate(!autoUpdateBtn.classList.contains('active'));
      });
      setAutoUpdate(localStorage.getItem('ticketing_autoupdate') === '1');
    }

    load();
  }

  function formatSlaCountdown(ms) {
    if (ms === null || ms === undefined || ms < 0) return null;
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }

  function ticketCardHtml(tk, opts = {}) {
    const countdown = formatSlaCountdown(tk.sla_remaining_ms);
    return `
      <a class="ticket-card prio-${tk.priority} ${opts.selectable ? 'selectable-card' : ''}" href="#/ticket/${tk.id}">
        ${opts.selectable ? `<label class="ticket-select-check" onclick="event.stopPropagation()"><input type="checkbox" class="ticketSelectBox" data-id="${tk.id}" /></label>` : ''}
        <div class="badges">
          <span class="badge badge-type-${tk.type}">${icon(tk.type, 'badge-icon')}${typeLabels()[tk.type] || tk.type}</span>
          <span class="badge badge-${tk.status}">${statusLabels()[tk.status]}</span>
          <span class="badge badge-${tk.priority}">${priorityLabels()[tk.priority]}</span>
          ${tk.sla_status && tk.sla_status !== 'on_track' ? `<span class="badge badge-sla-${tk.sla_status}">${slaLabels()[tk.sla_status]}</span>` : ''}
          ${countdown ? `<span class="badge badge-sla-countdown">${icon('activity', 'badge-icon')}${countdown}</span>` : ''}
        </div>
        <h3>#${tk.id} ${escapeHtml(tk.subject)}</h3>
        <p class="ticket-desc">${escapeHtml(tk.description)}</p>
        ${tk.tag_names ? `<div class="tag-chips">${tk.tag_names.split(',').map((n) => `<span class="tag-chip">${escapeHtml(n)}</span>`).join('')}</div>` : ''}
        <div class="ticket-meta">
          ${t('by_label')} ${escapeHtml(tk.creator_name)} · ${formatDate(tk.updated_at)}
          ${tk.assignee_name ? ` · ${t('assigned_to_label')} ${escapeHtml(tk.assignee_name)}` : ''}
          ${groupLabel(tk) ? ` · ${escapeHtml(groupLabel(tk))}` : ''}
        </div>
        ${!tk.assignee_name && isStaff() ? `<button type="button" class="btn btn-sm assignMeBtn" data-id="${tk.id}">${icon('userCircle', 'badge-icon')} ${t('assign_to_me_btn')}</button>` : ''}
      </a>`;
  }

  function wireTicketCardActions(container) {
    container.querySelectorAll('.assignMeBtn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await api(`/tickets/${btn.dataset.id}`, { method: 'PATCH', body: { assigned_to: state.user.id } });
          showToast(t('toast_ticket_assigned_to_you'), 'success');
          route();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function renderTicketList(container, tickets, opts = {}) {
    if (!tickets.length) {
      container.className = '';
      container.innerHTML = `<div class="empty-state">${icon('inbox')}<span>${t('no_tickets_found')}</span></div>`;
      return;
    }
    container.className = 'ticket-grid';
    container.innerHTML = tickets.map((tk) => ticketCardHtml(tk, opts)).join('');
    wireTicketCardActions(container);
  }

  async function renderNewTicket() {
    let categories = [];
    let customFields = [];
    let templates = [];
    try {
      const data = await api('/categories');
      categories = data.categories;
    } catch { categories = []; }
    try {
      const data = await api('/custom-fields');
      customFields = data.fields;
    } catch { customFields = []; }
    try {
      const data = await api('/ticket-templates');
      templates = data.templates;
    } catch { templates = []; }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('plus')} ${t('new_ticket_title')}</h1>
          <p class="hint">${t('new_ticket_hint')}</p>
        </div>
      </div>
      <div class="card" style="max-width:720px">
        <form id="newTicketForm" class="form-grid" style="max-width:none">
          ${templates.length ? `
          <div class="field">
            <label for="templateSelect">${t('field_template')}</label>
            <select id="templateSelect">
              <option value="">${t('template_blank_option')}</option>
              ${templates.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`).join('')}
            </select>
          </div>` : ''}
          <div class="field-row">
            <div class="field">
              <label for="type">${t('field_request_type')}</label>
              <select id="type">
                <option value="incident">${typeLabels().incident} ${t('type_incident_suffix')}</option>
                <option value="task">${typeLabels().task} ${t('type_task_suffix')}</option>
              </select>
            </div>
            <div class="field">
              <label for="priority">${t('field_urgency')}</label>
              <select id="priority">
                ${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}" ${v === 'medium' ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="categorySearch">${t('field_category')}</label>
            <input type="text" id="categorySearch" class="category-search-input" placeholder="${t('category_search_placeholder')}" autocomplete="off" />
            <p class="hint" id="categorySelectedHint"></p>
            <div id="categoryTree" class="category-tree"></div>
          </div>
          <div id="customFieldsContainer"></div>
          <div class="field">
            <label for="subject">${t('field_subject')}</label>
            <input id="subject" type="text" required maxlength="200" placeholder="${t('field_subject_placeholder')}" />
          </div>
          <div class="field">
            <label for="description">${t('field_description')}</label>
            <textarea id="description" required placeholder="${t('field_description_placeholder')}"></textarea>
          </div>
          <p class="error-text" id="newTicketError"></p>
          <div>
            <button class="btn" type="submit">${t('send_request_btn')}</button>
          </div>
        </form>
      </div>`;

    const macroCategories = categories.filter((c) => !c.parent_id);
    const subsByParent = new Map();
    categories.filter((c) => c.parent_id).forEach((c) => {
      if (!subsByParent.has(c.parent_id)) subsByParent.set(c.parent_id, []);
      subsByParent.get(c.parent_id).push(c);
    });

    let selectedCategory = '';
    let expandedMacroId = macroCategories[0] ? macroCategories[0].id : null;
    if (expandedMacroId) {
      const firstSubs = subsByParent.get(expandedMacroId) || [];
      selectedCategory = firstSubs.length ? firstSubs[0].name : macroCategories[0].name;
    }

    const treeEl = document.getElementById('categoryTree');
    const categorySearchInput = document.getElementById('categorySearch');
    const categorySelectedHint = document.getElementById('categorySelectedHint');

    function updateCategorySelectedHint() {
      categorySelectedHint.textContent = selectedCategory ? `${t('category_selected_label')} ${selectedCategory}` : '';
    }

    const customFieldsContainer = document.getElementById('customFieldsContainer');

    function renderCustomFieldInput(field) {
      const required = field.required ? 'required' : '';
      if (field.field_type === 'textarea') {
        return `<textarea id="cf-${field.id}" ${required}></textarea>`;
      }
      if (field.field_type === 'select') {
        return `<select id="cf-${field.id}" ${required}>
          <option value="">${t('option_select_placeholder')}</option>
          ${field.options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
        </select>`;
      }
      if (field.field_type === 'checkbox') {
        return `<label class="checkbox-field"><input type="checkbox" id="cf-${field.id}" /><span>${escapeHtml(field.name)}</span></label>`;
      }
      const inputType = field.field_type === 'number' ? 'number' : 'text';
      return `<input type="${inputType}" id="cf-${field.id}" ${required} />`;
    }

    function renderCustomFieldsSection() {
      const applicable = customFields.filter((f) => !f.category_id || f.category_name === selectedCategory);
      if (!applicable.length) {
        customFieldsContainer.innerHTML = '';
        return;
      }
      customFieldsContainer.innerHTML = applicable.map((field) => `
        <div class="field">
          ${field.field_type === 'checkbox' ? renderCustomFieldInput(field) : `
            <label for="cf-${field.id}">${escapeHtml(field.name)}${field.required ? ' *' : ''}</label>
            ${renderCustomFieldInput(field)}
          `}
        </div>`).join('');
    }

    function collectCustomFieldValues() {
      const applicable = customFields.filter((f) => !f.category_id || f.category_name === selectedCategory);
      const values = {};
      applicable.forEach((field) => {
        const el = document.getElementById(`cf-${field.id}`);
        if (!el) return;
        values[field.id] = field.field_type === 'checkbox' ? el.checked : el.value;
      });
      return values;
    }

    function renderCategoryTree(filterText) {
      const q = (filterText || '').trim().toLowerCase();
      const rows = macroCategories.map((macro) => {
        const subs = subsByParent.get(macro.id) || [];
        const macroMatches = !q || macro.name.toLowerCase().includes(q);
        const matchingSubs = subs.filter((s) => !q || s.name.toLowerCase().includes(q));
        if (q && !macroMatches && matchingSubs.length === 0) return '';
        const isExpanded = q ? true : expandedMacroId === macro.id;
        const visibleSubs = q ? matchingSubs : subs;
        const isDirectChoice = subs.length === 0;
        return `
          <div class="category-macro ${isExpanded ? 'expanded' : ''}" data-macro-id="${macro.id}">
            <button type="button" class="category-macro-head ${isDirectChoice && selectedCategory === macro.name ? 'active' : ''}" data-category="${isDirectChoice ? escapeHtml(macro.name) : ''}">
              ${icon(macro.icon || 'ticket')}
              <span>${escapeHtml(macro.name)}</span>
              ${!isDirectChoice ? `<span class="category-macro-count">${subs.length}</span>${icon('chevronDown', 'category-chevron')}` : ''}
            </button>
            ${!isDirectChoice ? `
            <div class="category-sub-grid" ${isExpanded ? '' : 'hidden'}>
              ${visibleSubs.map((s) => `
                <button type="button" class="category-choice ${selectedCategory === s.name ? 'active' : ''}" data-category="${escapeHtml(s.name)}">
                  ${icon(s.icon || 'ticket')}
                  <span>${escapeHtml(s.name)}</span>
                </button>`).join('')}
            </div>` : ''}
          </div>`;
      }).join('');
      treeEl.innerHTML = rows || `<p class="hint">${t('no_results')}</p>`;

      treeEl.querySelectorAll('.category-macro-head').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.category) {
            selectedCategory = btn.dataset.category;
            updateCategorySelectedHint();
            renderCategoryTree(categorySearchInput.value);
            renderCustomFieldsSection();
            return;
          }
          const macroId = Number(btn.closest('.category-macro').dataset.macroId);
          expandedMacroId = expandedMacroId === macroId ? null : macroId;
          renderCategoryTree(categorySearchInput.value);
        });
      });
      treeEl.querySelectorAll('.category-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedCategory = btn.dataset.category;
          updateCategorySelectedHint();
          renderCategoryTree(categorySearchInput.value);
          renderCustomFieldsSection();
        });
      });
    }

    updateCategorySelectedHint();
    renderCategoryTree('');
    renderCustomFieldsSection();
    categorySearchInput.addEventListener('input', () => renderCategoryTree(categorySearchInput.value));

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
      templateSelect.addEventListener('change', () => {
        const tpl = templates.find((t2) => String(t2.id) === templateSelect.value);
        if (!tpl) return;
        document.getElementById('subject').value = tpl.subject;
        document.getElementById('description').value = tpl.description;
        if (tpl.priority) document.getElementById('priority').value = tpl.priority;
        if (tpl.type) document.getElementById('type').value = tpl.type;
        const catRow = categories.find((c) => c.name === tpl.category);
        if (catRow) {
          selectedCategory = catRow.name;
          if (catRow.parent_id) expandedMacroId = catRow.parent_id;
          updateCategorySelectedHint();
          renderCategoryTree(categorySearchInput.value);
          renderCustomFieldsSection();
        }
      });
    }

    guardForm(document.getElementById('newTicketForm'), async () => {
      const errEl = document.getElementById('newTicketError');
      errEl.textContent = '';
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: selectedCategory,
        priority: document.getElementById('priority').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value.trim(),
        customFields: collectCustomFieldValues(),
      };
      try {
        const { ticket } = await api('/tickets', { method: 'POST', body });
        showToast(t('toast_request_sent'), 'success');
        location.hash = `#/ticket/${ticket.id}`;
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  async function renderTicketDetail(id) {
    appEl.innerHTML = `<div class="spinner-row">${t('loading')}</div>`;
    let data;
    try {
      data = await api(`/tickets/${id}`);
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    const { ticket, activity, customFieldValues, tags, links, watchers } = data;
    let ticketTags = tags || [];
    let ticketLinks = links || [];
    let isWatching = !!data.isWatching;
    let ticketWatchers = watchers || [];
    const readOnly = !!state.viewAs;
    const isOwner = ticket.created_by === state.user.id;
    const canEditFields = (isOwner || isStaff()) && !readOnly;
    const canReopen = isOwner && !isStaff() && ['resolved', 'closed'].includes(ticket.status) && !readOnly;

    let staffPanel = '';
    let assigneesOptions = '';
    let groupOptions = '';
    let assetOptions = '';
    if (isStaff() && !readOnly) {
      try {
        const { users } = await api('/users');
        const staffGroups = groupStaffByGroup(users);
        assigneesOptions = `<option value="">${t('unassigned_label')}</option>` +
          staffGroups.map(({ group, members }) => `
            <optgroup label="${escapeHtml(group)}">
              ${members.map((u) => `<option value="${u.id}" ${ticket.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
            </optgroup>`).join('');
      } catch { assigneesOptions = ''; }

      try {
        const { groups } = await api('/groups');
        groupOptions = groupOptionsHtml(groups, ticket.group_id, t('no_group_option'));
      } catch { groupOptions = ''; }

      try {
        const { assets } = await api('/assets');
        assetOptions = `<option value="">${t('no_asset_option')}</option>` +
          assets.map((a) => `<option value="${a.id}" ${ticket.asset_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)}${a.tag ? ` (${escapeHtml(a.tag)})` : ''}</option>`).join('');
      } catch { assetOptions = ''; }

      staffPanel = `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('shield')} ${t('management_title')}</h3>
          <div class="side-field">
            <label for="statusSel">${t('dim_status')}</label>
            <select id="statusSel">
              ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}" ${ticket.status === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="prioritySel">${t('dim_priority')}</label>
            <select id="prioritySel">
              ${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}" ${ticket.priority === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="typeSel">${t('dim_type')}</label>
            <select id="typeSel">
              ${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}" ${ticket.type === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="side-field">
            <label for="groupSel">${t('field_group')}</label>
            <select id="groupSel">${groupOptions}</select>
          </div>
          <div class="side-field">
            <label for="assignedSel">${t('assigned_to_label')}</label>
            <select id="assignedSel">${assigneesOptions}</select>
          </div>
          <div class="side-field">
            <label for="assetSel">${t('field_linked_asset')}</label>
            <select id="assetSel">${assetOptions}</select>
          </div>
          <button id="saveMgmtBtn" class="btn btn-sm btn-block">${t('btn_save_changes')}</button>
          ${state.user.role === 'admin' ? `<button id="deleteBtn" class="btn btn-sm btn-outline-danger btn-block" style="margin-top:0.5rem">${t('delete_ticket_btn')}</button>` : ''}
        </div>`;
    }

    appEl.innerHTML = `
      <div class="view-header">
        <h1>#${ticket.id} ${escapeHtml(ticket.subject)}</h1>
        <div style="display:flex;gap:0.5rem">
          ${isStaff() && !readOnly ? `<button type="button" id="watchToggleBtn" class="btn btn-ghost">${icon(isWatching ? 'eyeOff' : 'eye')} <span id="watchToggleLabel">${isWatching ? t('btn_unwatch') : t('btn_watch')}</span>${ticketWatchers.length ? ` (${ticketWatchers.length})` : ''}</button>` : ''}
          <a class="btn btn-ghost" href="#/dashboard">${icon('arrowLeft')} ${t('back_to_list')}</a>
        </div>
      </div>
      <div id="presenceBanner" class="presence-banner" hidden></div>
      <div class="ticket-detail-grid">
        <div>
          <div class="card" style="margin-bottom:1rem">
            <div class="badges" style="margin-bottom:0.75rem">
              <span class="badge badge-type-${ticket.type}">${icon(ticket.type, 'badge-icon')}${typeLabels()[ticket.type] || ticket.type}</span>
              <span class="badge badge-${ticket.status}">${statusLabels()[ticket.status]}</span>
              <span class="badge badge-${ticket.priority}">${priorityLabels()[ticket.priority]}</span>
              <span class="badge">${escapeHtml(ticket.category)}</span>
              ${ticket.sla_status ? `<span class="badge badge-sla-${ticket.sla_status}">${slaLabels()[ticket.sla_status]}</span>` : ''}
            </div>
            ${canEditFields ? `
              <div id="viewDescription">
                <p style="white-space:pre-wrap">${escapeHtml(ticket.description)}</p>
                <button type="button" id="editToggleBtn" class="btn btn-ghost btn-sm">${icon('edit', 'badge-icon')} ${t('edit_subject_desc')}</button>
              </div>
              <form id="editForm" class="form-grid" style="max-width:none" hidden>
                <div class="field">
                  <label for="editSubject">${t('field_subject')}</label>
                  <input id="editSubject" type="text" value="${escapeHtml(ticket.subject)}" />
                </div>
                <div class="field">
                  <label for="editDescription">${t('field_description')}</label>
                  <textarea id="editDescription">${escapeHtml(ticket.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                  <button class="btn btn-sm" type="submit">${t('btn_save_changes')}</button>
                  <button type="button" id="editCancelBtn" class="btn btn-sm btn-ghost">${t('btn_cancel')}</button>
                </div>
              </form>
            ` : `<p style="white-space:pre-wrap">${escapeHtml(ticket.description)}</p>`}
            <p class="ticket-meta">
              ${t('created_by')} ${escapeHtml(ticket.creator_name)} ${t('on_date')} ${formatDate(ticket.created_at)}
              ${ticket.assignee_name ? ` · ${t('assigned_to_label')} ${escapeHtml(ticket.assignee_name)}` : ''}
              ${groupLabel(ticket) ? ` · ${t('group_label_prefix')} ${escapeHtml(groupLabel(ticket))}` : ''}
              ${ticket.asset_name ? ` · ${t('field_linked_asset')} ${escapeHtml(ticket.asset_name)}` : ''}
            </p>
            <div id="tagsWrap" class="tags-wrap"></div>
            ${canReopen ? `<button id="reopenBtn" class="btn btn-sm btn-ghost">${icon('refresh')} ${t('reopen_ticket')}</button>` : ''}
            ${customFieldValues && customFieldValues.length ? `
              <div class="custom-fields-summary">
                ${customFieldValues.map((f) => `
                  <div class="custom-field-row">
                    <span class="custom-field-name">${escapeHtml(f.name)}</span>
                    <span class="custom-field-value">${f.field_type === 'checkbox' ? (f.value === '1' ? t('yes_label') : t('no_label')) : escapeHtml(f.value || '')}</span>
                  </div>`).join('')}
              </div>` : ''}
          </div>

          <div class="card" style="margin-bottom:1rem">
            <h3 class="section-title" style="margin-top:0">${icon('paperclip')} ${t('attachments_title')}</h3>
            <div id="attachmentsList" class="attachments-list spinner-row">${t('loading')}</div>
            ${!readOnly ? `
              <input type="file" id="attachmentInput" hidden />
              <button type="button" id="attachmentUploadBtn" class="btn btn-ghost btn-sm" style="margin-top:0.6rem">${icon('paperclip', 'badge-icon')} ${t('btn_add_attachment')}</button>
              <p class="error-text" id="attachmentError"></p>
            ` : ''}
          </div>

          ${(ticket.rating || (isOwner && !isStaff() && !readOnly && ['resolved', 'closed'].includes(ticket.status))) ? `
          <div class="card" style="margin-bottom:1rem">
            <h3 class="section-title" style="margin-top:0">${icon('star')} ${t('rating_title')}</h3>
            <div id="ratingContent"></div>
          </div>` : ''}

          ${isStaff() && !readOnly ? `
          <div class="card" style="margin-bottom:1rem">
            <h3 class="section-title" style="margin-top:0">${icon('package')} ${t('linked_tickets_title')}</h3>
            <div id="linkedTicketsList" class="linked-tickets-list spinner-row">${t('loading')}</div>
            <div class="link-ticket-form">
              <input type="number" min="1" id="linkTicketInput" placeholder="${t('link_ticket_placeholder')}" />
              <button type="button" id="linkTicketBtn" class="btn btn-ghost btn-sm">${t('btn_link_ticket')}</button>
            </div>
            <p class="error-text" id="linkTicketError"></p>
          </div>` : ''}

          <div class="card">
            <h3 class="section-title" style="margin-top:0">${t('activity_title')}</h3>
            <div id="activityList" class="activity-timeline">
              ${activity.length ? activity.map(renderActivityItem).join('') : `<p class="hint">${t('no_activity')}</p>`}
            </div>
            ${readOnly ? `<p class="hint">${t('readonly_no_comments')}</p>` : `
            <form id="commentForm" class="form-grid" style="max-width:none;margin-top:1rem">
              ${isStaff() ? `
              <div class="canned-picker" id="cannedPicker" hidden>
                <select id="cannedSelect"><option value="">${t('canned_picker_placeholder')}</option></select>
                <button type="button" id="cannedInsertBtn" class="btn btn-ghost btn-sm">${t('btn_insert')}</button>
              </div>` : ''}
              <div class="field">
                <label for="commentMsg">${t('add_comment_label')}</label>
                <textarea id="commentMsg" required placeholder="${t('comment_placeholder')}"></textarea>
              </div>
              ${isStaff() ? `
              <label class="checkbox-field">
                <input type="checkbox" id="internalCheck" />
                ${t('internal_note_label')}
              </label>` : ''}
              <div><button class="btn btn-sm" type="submit">${t('btn_send')}</button></div>
            </form>`}
          </div>
        </div>
        <div>${staffPanel}</div>
      </div>`;

    const cannedPicker = document.getElementById('cannedPicker');
    if (cannedPicker) {
      api('/canned-responses').then(({ responses }) => {
        if (!responses.length) return;
        const cannedSelect = document.getElementById('cannedSelect');
        cannedSelect.innerHTML = `<option value="">${t('canned_picker_placeholder')}</option>` +
          responses.map((r) => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join('');
        cannedPicker.hidden = false;
        document.getElementById('cannedInsertBtn').addEventListener('click', () => {
          const selected = responses.find((r) => String(r.id) === cannedSelect.value);
          if (!selected) return;
          const msgEl = document.getElementById('commentMsg');
          msgEl.value = msgEl.value ? `${msgEl.value}\n${selected.body}` : selected.body;
          msgEl.focus();
        });
      }).catch(() => {});
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function attachmentIconName(mimeType) {
      if (mimeType.startsWith('image/')) return 'monitor';
      if (mimeType === 'application/pdf') return 'inbox';
      if (mimeType === 'application/zip') return 'package';
      return 'file';
    }

    async function loadAttachments() {
      const listEl = document.getElementById('attachmentsList');
      if (!listEl) return;
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      try {
        const { attachments } = await api(`/tickets/${ticket.id}/attachments`);
        listEl.className = 'attachments-list';
        listEl.innerHTML = attachments.length ? attachments.map((a) => `
          <div class="attachment-row" data-id="${a.id}">
            ${icon(attachmentIconName(a.mime_type), 'attachment-icon')}
            <div class="attachment-info">
              <span class="attachment-name">${escapeHtml(a.file_name)}</span>
              <span class="attachment-meta">${formatFileSize(a.size_bytes)} · ${escapeHtml(a.uploader_name || '')} · ${formatDate(a.created_at)}</span>
            </div>
            <button type="button" class="icon-btn attachmentDownloadBtn" data-id="${a.id}" title="${t('btn_download')}">${icon('download')}</button>
            ${!readOnly && (a.uploaded_by === state.user.id || isStaff()) ? `<button type="button" class="icon-btn attachmentDeleteBtn" data-id="${a.id}" title="${t('btn_delete')}">${icon('trash')}</button>` : ''}
          </div>`).join('') : `<p class="hint">${t('no_attachments_hint')}</p>`;

        listEl.querySelectorAll('.attachmentDownloadBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const { attachment } = await api(`/tickets/${ticket.id}/attachments/${btn.dataset.id}`);
              const res = await fetch(attachment.data);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = attachment.file_name;
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('.attachmentDeleteBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/tickets/${ticket.id}/attachments/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_attachment_deleted'), 'success');
              loadAttachments();
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

    loadAttachments();

    const ratingContent = document.getElementById('ratingContent');
    if (ratingContent) {
      const canRate = isOwner && !isStaff() && !readOnly && ['resolved', 'closed'].includes(ticket.status);

      function renderStars(value, interactive) {
        return `<div class="star-rating ${interactive ? 'interactive' : ''}">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn ${n <= value ? 'filled' : ''}" data-star="${n}" ${interactive ? '' : 'disabled'}>${icon('star')}</button>`).join('')}
        </div>`;
      }

      function renderRatingReadonly() {
        ratingContent.innerHTML = `
          ${renderStars(ticket.rating, false)}
          ${ticket.rating_comment ? `<p class="hint" style="margin:0.4rem 0 0">"${escapeHtml(ticket.rating_comment)}"</p>` : ''}
          <p class="hint" style="margin:0.2rem 0 0">${t('rated_on_label')} ${formatDate(ticket.rated_at)}</p>
          ${canRate ? `<button type="button" id="editRatingBtn" class="btn btn-ghost btn-sm" style="margin-top:0.5rem">${t('btn_edit_rating')}</button>` : ''}
        `;
        const editBtn = document.getElementById('editRatingBtn');
        if (editBtn) editBtn.addEventListener('click', () => renderRatingForm(ticket.rating, ticket.rating_comment));
      }

      function renderRatingForm(initialValue, initialComment) {
        let selected = initialValue || 0;
        ratingContent.innerHTML = `
          ${renderStars(selected, true)}
          <textarea id="ratingComment" rows="2" placeholder="${t('rating_comment_placeholder')}" style="margin-top:0.5rem">${escapeHtml(initialComment || '')}</textarea>
          <p class="error-text" id="ratingError"></p>
          <div style="margin-top:0.4rem"><button type="button" id="submitRatingBtn" class="btn btn-sm">${t('btn_submit_rating')}</button></div>
        `;
        const starsEl = ratingContent.querySelector('.star-rating');
        starsEl.querySelectorAll('.star-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            selected = Number(btn.dataset.star);
            starsEl.querySelectorAll('.star-btn').forEach((b) => b.classList.toggle('filled', Number(b.dataset.star) <= selected));
          });
        });
        document.getElementById('submitRatingBtn').addEventListener('click', async () => {
          const errEl = document.getElementById('ratingError');
          errEl.textContent = '';
          if (!selected) { errEl.textContent = t('rating_required_hint'); return; }
          try {
            const { ticket: updated } = await api(`/tickets/${ticket.id}/rating`, {
              method: 'POST', body: { rating: selected, comment: document.getElementById('ratingComment').value },
            });
            ticket.rating = updated.rating;
            ticket.rating_comment = updated.rating_comment;
            ticket.rated_at = updated.rated_at;
            showToast(t('toast_rating_submitted'), 'success');
            renderRatingReadonly();
          } catch (err) {
            errEl.textContent = err.message;
          }
        });
      }

      if (ticket.rating) {
        renderRatingReadonly();
      } else {
        renderRatingForm(0, '');
      }
    }

    const tagsWrap = document.getElementById('tagsWrap');
    if (tagsWrap) {
      const canManageTags = isStaff() && !readOnly;

      function renderTags() {
        tagsWrap.innerHTML = `
          ${ticketTags.map((tg) => `
            <span class="tag-chip ${canManageTags ? 'tag-chip-removable' : ''}">
              ${escapeHtml(tg.name)}
              ${canManageTags ? `<button type="button" class="tagRemoveBtn" data-id="${tg.id}" aria-label="${t('btn_delete')}">&times;</button>` : ''}
            </span>`).join('')}
          ${canManageTags ? `<input type="text" id="newTagInput" class="tag-input" placeholder="${t('add_tag_placeholder')}" />` : ''}
        `;
        tagsWrap.querySelectorAll('.tagRemoveBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const res = await api(`/tickets/${ticket.id}/tags/${btn.dataset.id}`, { method: 'DELETE' });
              ticketTags = res.tags;
              renderTags();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        const newTagInput = document.getElementById('newTagInput');
        if (newTagInput) {
          newTagInput.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !newTagInput.value.trim()) return;
            e.preventDefault();
            try {
              const res = await api(`/tickets/${ticket.id}/tags`, { method: 'POST', body: { name: newTagInput.value.trim() } });
              ticketTags = res.tags;
              renderTags();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        }
      }
      renderTags();
    }

    const linkedTicketsList = document.getElementById('linkedTicketsList');
    if (linkedTicketsList) {
      function renderLinkedTickets() {
        linkedTicketsList.className = 'linked-tickets-list';
        linkedTicketsList.innerHTML = ticketLinks.length ? ticketLinks.map((link) => `
          <div class="linked-ticket-row">
            <a href="#/ticket/${link.linked_ticket_id}">#${link.linked_ticket_id} ${escapeHtml(link.linked_subject)}</a>
            <span class="badge badge-${link.linked_status}">${statusLabels()[link.linked_status] || link.linked_status}</span>
            <button type="button" class="icon-btn unlinkTicketBtn" data-id="${link.id}" title="${t('btn_delete')}">${icon('trash')}</button>
          </div>`).join('') : `<p class="hint">${t('no_linked_tickets_hint')}</p>`;

        linkedTicketsList.querySelectorAll('.unlinkTicketBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const res = await api(`/tickets/${ticket.id}/links/${btn.dataset.id}`, { method: 'DELETE' });
              ticketLinks = res.links;
              renderLinkedTickets();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      }
      renderLinkedTickets();

      const linkTicketInput = document.getElementById('linkTicketInput');
      const linkTicketBtn = document.getElementById('linkTicketBtn');
      linkTicketBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('linkTicketError');
        errEl.textContent = '';
        if (!linkTicketInput.value) return;
        try {
          const res = await api(`/tickets/${ticket.id}/links`, { method: 'POST', body: { linkedTicketId: Number(linkTicketInput.value) } });
          ticketLinks = res.links;
          linkTicketInput.value = '';
          renderLinkedTickets();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    const watchToggleBtn = document.getElementById('watchToggleBtn');
    if (watchToggleBtn) {
      watchToggleBtn.addEventListener('click', async () => {
        try {
          const res = await api(`/tickets/${ticket.id}/watch`, { method: isWatching ? 'DELETE' : 'POST' });
          isWatching = res.isWatching;
          ticketWatchers = res.watchers;
          watchToggleBtn.innerHTML = `${icon(isWatching ? 'eyeOff' : 'eye')} <span id="watchToggleLabel">${isWatching ? t('btn_unwatch') : t('btn_watch')}</span>${ticketWatchers.length ? ` (${ticketWatchers.length})` : ''}`;
          showToast(isWatching ? t('toast_now_watching') : t('toast_stopped_watching'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const attachmentInput = document.getElementById('attachmentInput');
    const attachmentUploadBtn = document.getElementById('attachmentUploadBtn');
    if (attachmentUploadBtn) {
      attachmentUploadBtn.addEventListener('click', () => attachmentInput.click());
      attachmentInput.addEventListener('change', () => {
        const file = attachmentInput.files[0];
        if (!file) return;
        const errEl = document.getElementById('attachmentError');
        errEl.textContent = '';
        if (file.size > 5 * 1024 * 1024) {
          errEl.textContent = t('attachment_too_large');
          attachmentInput.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await api(`/tickets/${ticket.id}/attachments`, {
              method: 'POST',
              body: { fileName: file.name, dataUrl: reader.result },
            });
            attachmentInput.value = '';
            showToast(t('toast_attachment_added'), 'success');
            loadAttachments();
          } catch (err) {
            errEl.textContent = err.message;
            attachmentInput.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (document.getElementById('commentForm')) guardForm(document.getElementById('commentForm'), async () => {
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
        showToast(t('toast_comment_added'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const editToggleBtn = document.getElementById('editToggleBtn');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const viewDescription = document.getElementById('viewDescription');
    const editForm = document.getElementById('editForm');
    if (editToggleBtn) {
      editToggleBtn.addEventListener('click', () => {
        viewDescription.hidden = true;
        editForm.hidden = false;
      });
    }
    if (editCancelBtn) {
      editCancelBtn.addEventListener('click', () => {
        editForm.hidden = true;
        viewDescription.hidden = false;
      });
    }
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
          showToast(t('toast_ticket_updated'), 'success');
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
          showToast(t('toast_ticket_reopened'), 'success');
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
          showToast(t('toast_ticket_updated'), 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_ticket'))) return;
        try {
          await api(`/tickets/${ticket.id}`, { method: 'DELETE' });
          showToast(t('toast_ticket_deleted'), 'success');
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
        parts.push(`${icon('shield')} ${t('presence_staff')}`);
      }
      if (presence.customer.size && isStaff()) {
        parts.push(`${icon('userCircle')} ${t('presence_customer')}`);
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
          showToast(t('new_message_toast'), '');
        }
      });

      socket.on('ticket:updated', (updated) => {
        const badgesWrap = document.querySelector('.ticket-detail-grid .badges');
        if (badgesWrap) {
          badgesWrap.innerHTML = `
            <span class="badge badge-type-${updated.type}">${icon(updated.type, 'badge-icon')}${typeLabels()[updated.type] || updated.type}</span>
            <span class="badge badge-${updated.status}">${statusLabels()[updated.status]}</span>
            <span class="badge badge-${updated.priority}">${priorityLabels()[updated.priority]}</span>
            <span class="badge">${escapeHtml(updated.category)}</span>
            ${updated.sla_status ? `<span class="badge badge-sla-${updated.sla_status}">${slaLabels()[updated.sla_status]}</span>` : ''}`;
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
        <div class="activity-row">
          <span class="activity-dot activity-dot-event">${icon('activity')}</span>
          <div class="activity-row-content activity-event">
            <span>${escapeHtml(item.message)}${item.actor_name ? ` — ${escapeHtml(item.actor_name)}` : ''}</span>
            <span class="activity-event-time">${formatDate(item.created_at)}</span>
          </div>
        </div>`;
    }
    return `
      <div class="activity-row">
        <span class="activity-dot activity-dot-comment"></span>
        <div class="activity-row-content comment ${item.is_internal ? 'is-internal' : ''}">
          <div class="comment-head">
            <span>${escapeHtml(item.author_name)} (${roleLabels()[item.author_role] || item.author_role})${item.is_internal ? ' <span class="badge badge-internal">Nota interna</span>' : ''}</span>
            <span>${formatDate(item.created_at)}</span>
          </div>
          <div class="comment-body">${escapeHtml(item.message)}</div>
        </div>
      </div>`;
  }

  async function renderAdmin() {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    const isAdmin = state.user.role === 'admin';
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('shield')} ${t('admin_title')}</h1></div>
      ${isAdmin ? `
      <div class="admin-grid" style="margin-bottom:1.25rem">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('admin_create_staff_title')}</h3>
          <form id="createStaffForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="newName">${t('field_name')}</label><input id="newName" required /></div>
            <div class="field"><label for="newEmail">Email</label><input id="newEmail" type="email" required /></div>
            <div class="field">
              <label for="newRole">${t('field_role')}</label>
              <select id="newRole">
                <option value="agent">${t('role_agent_option')}</option>
                <option value="admin">${t('role_admin_option')}</option>
              </select>
            </div>
            <div class="field">
              <label for="newGroup">${t('admin_group_optional_label')}</label>
              <select id="newGroup"><option value="">${t('no_group_option')}</option></select>
              <span class="hint">${t('admin_group_hint')}</span>
            </div>
            <div class="field">
              <label for="newLocale">${t('account_locale_label')}</label>
              <select id="newLocale">
                ${Object.entries(LANG_LABELS).map(([v, l]) => `<option value="${v}" ${v === 'it' ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
              <span class="hint">${t('account_locale_hint')}</span>
            </div>
            <div class="field">
              <label for="newManager">${t('field_manager')}</label>
              <select id="newManager"><option value="">${t('option_none')}</option></select>
            </div>
            <label class="checkbox-field">
              <input type="checkbox" id="newIsExternal" />
              ${t('field_is_external')}
            </label>
            <p class="error-text" id="createStaffError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_create_account')}</button></div>
          </form>
          <div id="tempPasswordBox"></div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('ticket')} ${t('admin_categories_title')}</h3>
          <p class="hint">${t('admin_categories_hint')}</p>
          <form id="newCategoryForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:1 1 12rem"><label for="newCategoryName">${t('field_category_name')}</label><input id="newCategoryName" /></div>
            <div class="field" style="flex:0 0 auto">
              <label>${t('field_icon')}</label>
              <div id="newCategoryIconPicker" class="icon-picker"></div>
            </div>
            <div class="field" style="flex:1 1 12rem"><label for="newCategoryGroup">${t('field_default_team')}</label><select id="newCategoryGroup"><option value="">${t('option_none')}</option></select></div>
            <div class="field" style="flex:1 1 12rem"><label for="newCategoryParent">${t('field_parent_category')}</label><select id="newCategoryParent"><option value="">${t('option_top_level_category')}</option></select></div>
            <button class="btn btn-sm" type="submit">${t('btn_add')}</button>
          </form>
          <p class="error-text" id="categoryError"></p>
          <div id="categoriesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('users')} ${t('admin_groups_title')}</h3>
          <p class="hint">${t('admin_groups_hint')}</p>
          <form id="newGroupForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:1 1 12rem"><label for="newGroupName">${t('field_group_name')}</label><input id="newGroupName" /></div>
            <div class="field" style="flex:1 1 12rem"><label for="newGroupParent">${t('field_parent_group')}</label><select id="newGroupParent"><option value="">${t('option_no_parent')}</option></select></div>
            <div class="field" style="flex:0 0 7rem"><label for="newGroupResponse">${t('field_response_hours')}</label><input id="newGroupResponse" type="number" min="1" /></div>
            <div class="field" style="flex:0 0 7rem"><label for="newGroupResolve">${t('field_resolve_hours')}</label><input id="newGroupResolve" type="number" min="1" /></div>
            <div class="field" style="flex:0 0 6rem"><label for="newGroupWorkStart">${t('field_shift_start')}</label><input id="newGroupWorkStart" type="number" min="0" max="24" value="9" /></div>
            <div class="field" style="flex:0 0 6rem"><label for="newGroupWorkEnd">${t('field_shift_end')}</label><input id="newGroupWorkEnd" type="number" min="0" max="24" value="18" /></div>
            <button class="btn btn-sm" type="submit">${t('btn_create_group')}</button>
          </form>
          <p class="error-text" id="groupError"></p>
          <div id="groupsList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('activity')} ${t('admin_automations_title')}</h3>
          <p class="hint">${t('admin_automations_hint')}</p>
          <form id="newRuleForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <div class="field-row">
              <div class="field"><label for="ruleName">${t('field_rule_name')}</label><input id="ruleName" required /></div>
              <div class="field"><label for="ruleTrigger">${t('field_rule_trigger')}</label>
                <select id="ruleTrigger">
                  <option value="created">${t('trigger_created')}</option>
                  <option value="updated">${t('trigger_updated')}</option>
                </select>
              </div>
            </div>
            <p class="hint" style="margin:0.2rem 0 0;font-weight:600">${t('rule_conditions_label')}</p>
            <div class="field-row">
              <div class="field"><label for="condStatus">${t('dim_status')}</label><select id="condStatus"><option value="">${t('option_none')}</option>${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="field"><label for="condPriority">${t('dim_priority')}</label><select id="condPriority"><option value="">${t('option_none')}</option>${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="condType">${t('dim_type')}</label><select id="condType"><option value="">${t('option_none')}</option>${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="field"><label for="condCategory">${t('field_category')}</label><select id="condCategory"><option value="">${t('option_none')}</option></select></div>
            </div>
            <div class="field"><label for="condGroup">${t('field_group_condition')}</label><select id="condGroup"><option value="">${t('option_none')}</option></select></div>
            <p class="hint" style="margin:0.2rem 0 0;font-weight:600">${t('rule_actions_label')}</p>
            <div class="field-row">
              <div class="field"><label for="actionStatus">${t('action_set_status')}</label><select id="actionStatus"><option value="">${t('option_none')}</option>${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="field"><label for="actionPriority">${t('action_set_priority')}</label><select id="actionPriority"><option value="">${t('option_none')}</option>${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="actionGroup">${t('action_assign_group')}</label><select id="actionGroup"><option value="">${t('option_none')}</option></select></div>
              <div class="field"><label for="actionUser">${t('action_assign_user')}</label><select id="actionUser"><option value="">${t('option_none')}</option></select></div>
            </div>
            <div class="field"><label for="actionNote">${t('action_add_note')}</label><textarea id="actionNote" rows="2" placeholder="${t('action_add_note_placeholder')}"></textarea></div>
            <p class="error-text" id="ruleError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_create_rule')}</button></div>
          </form>
          <div id="rulesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('edit')} ${t('admin_custom_fields_title')}</h3>
          <p class="hint">${t('admin_custom_fields_hint')}</p>
          <form id="newFieldForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:1 1 12rem"><label for="newFieldName">${t('field_field_name')}</label><input id="newFieldName" required /></div>
            <div class="field" style="flex:0 0 9rem"><label for="newFieldType">${t('field_field_type')}</label>
              <select id="newFieldType">
                <option value="text">${t('field_type_text')}</option>
                <option value="number">${t('field_type_number')}</option>
                <option value="textarea">${t('field_type_textarea')}</option>
                <option value="select">${t('field_type_select')}</option>
                <option value="checkbox">${t('field_type_checkbox')}</option>
              </select>
            </div>
            <div class="field" style="flex:1 1 12rem" id="newFieldOptionsWrap" hidden>
              <label for="newFieldOptions">${t('field_field_options')}</label>
              <input id="newFieldOptions" placeholder="${t('field_field_options_placeholder')}" />
            </div>
            <div class="field" style="flex:1 1 12rem"><label for="newFieldCategory">${t('field_field_category')}</label><select id="newFieldCategory"><option value="">${t('field_global_option')}</option></select></div>
            <label class="checkbox-field"><input type="checkbox" id="newFieldRequired" /><span>${t('field_required_label')}</span></label>
            <button class="btn btn-sm" type="submit">${t('btn_add_field')}</button>
          </form>
          <p class="error-text" id="fieldError"></p>
          <div id="fieldsList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('message')} ${t('admin_canned_title')}</h3>
          <p class="hint">${t('admin_canned_hint')}</p>
          <form id="newCannedForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <div class="field"><label for="newCannedTitle">${t('field_canned_title')}</label><input id="newCannedTitle" required /></div>
            <div class="field"><label for="newCannedBody">${t('field_canned_body')}</label><textarea id="newCannedBody" rows="3" required></textarea></div>
            <div><button class="btn btn-sm" type="submit">${t('btn_add_canned')}</button></div>
          </form>
          <p class="error-text" id="cannedError"></p>
          <div id="cannedList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('admin_templates_title')}</h3>
          <p class="hint">${t('admin_templates_hint')}</p>
          <form id="newTemplateForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <div class="field-row">
              <div class="field"><label for="newTemplateName">${t('field_template_name')}</label><input id="newTemplateName" required /></div>
              <div class="field"><label for="newTemplateCategory">${t('field_category')}</label><select id="newTemplateCategory"><option value="">${t('option_none')}</option></select></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="newTemplatePriority">${t('field_urgency')}</label><select id="newTemplatePriority"><option value="">${t('option_none')}</option>${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="field"><label for="newTemplateType">${t('field_request_type')}</label><select id="newTemplateType"><option value="">${t('option_none')}</option>${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            </div>
            <div class="field"><label for="newTemplateSubject">${t('field_subject')}</label><input id="newTemplateSubject" required /></div>
            <div class="field"><label for="newTemplateDescription">${t('field_description')}</label><textarea id="newTemplateDescription" rows="3" required></textarea></div>
            <div><button class="btn btn-sm" type="submit">${t('btn_add_template')}</button></div>
          </form>
          <p class="error-text" id="templateError"></p>
          <div id="templatesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('activity')} ${t('admin_holidays_title')}</h3>
          <p class="hint">${t('admin_holidays_hint')}</p>
          <form id="newHolidayForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:0 0 10rem"><label for="newHolidayDate">${t('field_date')}</label><input id="newHolidayDate" type="date" required /></div>
            <div class="field" style="flex:1 1 12rem"><label for="newHolidayName">${t('field_holiday_name')}</label><input id="newHolidayName" required placeholder="es. Ferragosto" /></div>
            <button class="btn btn-sm" type="submit">${t('btn_add_holiday')}</button>
          </form>
          <p class="error-text" id="holidayError"></p>
          <div id="holidaysList" class="spinner-row">${t('loading')}</div>
        </div>
      </div>` : ''}
      <div id="usersWrap" class="card spinner-row">${t('loading')}</div>`;

    if (isAdmin) {
      let groupOptionsCache = [];

      async function loadGroupOptions() {
        try {
          const { groups } = await api('/groups');
          groupOptionsCache = groups;
          const select = document.getElementById('newGroup');
          if (select) select.innerHTML = groupOptionsHtml(groups, '', t('no_group_option'));
          const parentSelect = document.getElementById('newGroupParent');
          if (parentSelect) parentSelect.innerHTML = groupOptionsHtml(groups, '', t('option_no_parent'));
        } catch { groupOptionsCache = []; }
      }

      async function loadManagerOptions() {
        const select = document.getElementById('newManager');
        if (!select) return;
        try {
          const { users } = await api('/users');
          const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
          select.innerHTML = `<option value="">${t('option_none')}</option>` +
            staffUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
        } catch {}
      }

      function renderOrgNode(node, statsById) {
        const stats = statsById.get(node.id) || { open: 0, breached: 0 };
        return `
          <div class="org-branch">
            <div class="org-node" draggable="true" data-group-id="${node.id}" data-group-name="${escapeHtml(node.name)}" title="${t('org_node_hint')}">
              <div class="org-node-head">
                <span class="org-node-name">${escapeHtml(node.name)}</span>
                <button type="button" class="icon-btn deleteGroupBtn" data-id="${node.id}" title="${t('delete_group_title')}">${icon('trash')}</button>
              </div>
              <div class="org-node-stats">
                <span class="org-node-badge ${stats.breached > 0 ? 'org-node-badge-danger' : 'org-node-badge-ok'}">${stats.open} ${t('org_open_tickets')}</span>
                ${stats.breached > 0 ? `<span class="org-node-badge org-node-badge-danger">${stats.breached} ${t('org_sla_breach')}</span>` : ''}
              </div>
              <div class="org-node-sla">
                <label>${t('field_response_hours')} <input type="number" min="1" class="slaInput" data-group-id="${node.id}" data-field="slaResponseHours" value="${node.sla_response_hours ?? ''}" /></label>
                <label>${t('field_resolve_hours')} <input type="number" min="1" class="slaInput" data-group-id="${node.id}" data-field="slaResolveHours" value="${node.sla_resolve_hours ?? ''}" /></label>
                <label>${t('shift_from_label')} <input type="number" min="0" max="24" class="workHourInput" data-group-id="${node.id}" data-field="workStartHour" value="${node.work_start_hour ?? 9}" /></label>
                <label>${t('shift_to_label')} <input type="number" min="0" max="24" class="workHourInput" data-group-id="${node.id}" data-field="workEndHour" value="${node.work_end_hour ?? 18}" /></label>
              </div>
            </div>
            ${node.children.length ? `<div class="org-children">${node.children.map((child) => renderOrgNode(child, statsById)).join('')}</div>` : ''}
          </div>`;
      }

      async function loadGroups() {
        const listEl = document.getElementById('groupsList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const [{ groups }, { tickets }] = await Promise.all([
            api('/groups'),
            api('/tickets').catch(() => ({ tickets: [] })),
          ]);
          groupOptionsCache = groups;
          const statsById = new Map();
          tickets.forEach((tk) => {
            if (!tk.group_id) return;
            const entry = statsById.get(tk.group_id) || { open: 0, breached: 0 };
            if (tk.status === 'open' || tk.status === 'in_progress') entry.open += 1;
            if (tk.sla_status === 'breached') entry.breached += 1;
            statsById.set(tk.group_id, entry);
          });
          const tree = buildGroupTree(groups);
          listEl.className = '';
          listEl.innerHTML = tree.length ? `
            <div id="orgRootDrop" class="org-root-drop">${t('org_drop_root_hint')}</div>
            <div class="org-chart">${tree.map((node) => renderOrgNode(node, statsById)).join('')}</div>` : `<p class="hint">${t('no_groups_hint')}</p>`;

          listEl.querySelectorAll('.org-node').forEach((nodeEl) => {
            nodeEl.addEventListener('click', (e) => {
              if (e.target.closest('input, button, label')) return;
              sessionStorage.setItem('ticketing_search_group', nodeEl.dataset.groupId);
              location.hash = '#/search';
            });
          });

          let draggedGroupId = null;
          async function reparentGroup(sourceId, parentId) {
            try {
              await api(`/groups/${sourceId}`, { method: 'PATCH', body: { parentId } });
              showToast(t('toast_group_reparented'), 'success');
              loadGroups();
              loadGroupOptions();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
          listEl.querySelectorAll('.org-node').forEach((nodeEl) => {
            nodeEl.addEventListener('dragstart', (e) => {
              draggedGroupId = nodeEl.dataset.groupId;
              nodeEl.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', draggedGroupId);
            });
            nodeEl.addEventListener('dragend', () => {
              nodeEl.classList.remove('dragging');
              listEl.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
              draggedGroupId = null;
            });
            nodeEl.addEventListener('dragover', (e) => {
              if (!draggedGroupId || draggedGroupId === nodeEl.dataset.groupId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              nodeEl.classList.add('drop-target');
            });
            nodeEl.addEventListener('dragleave', () => nodeEl.classList.remove('drop-target'));
            nodeEl.addEventListener('drop', (e) => {
              e.preventDefault();
              nodeEl.classList.remove('drop-target');
              const sourceId = draggedGroupId;
              const targetId = nodeEl.dataset.groupId;
              if (!sourceId || sourceId === targetId) return;
              reparentGroup(sourceId, Number(targetId));
            });
          });

          const rootDrop = document.getElementById('orgRootDrop');
          if (rootDrop) {
            rootDrop.addEventListener('dragover', (e) => {
              if (!draggedGroupId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              rootDrop.classList.add('drop-target');
            });
            rootDrop.addEventListener('dragleave', () => rootDrop.classList.remove('drop-target'));
            rootDrop.addEventListener('drop', (e) => {
              e.preventDefault();
              rootDrop.classList.remove('drop-target');
              const sourceId = draggedGroupId;
              if (!sourceId) return;
              reparentGroup(sourceId, null);
            });
          }

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
                showToast(t('toast_sla_updated'), 'success');
                loadGroupOptions();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });

          listEl.querySelectorAll('.workHourInput').forEach((input) => {
            input.addEventListener('change', async () => {
              const groupId = input.dataset.groupId;
              const startInput = listEl.querySelector(`[data-group-id="${groupId}"][data-field="workStartHour"]`);
              const endInput = listEl.querySelector(`[data-group-id="${groupId}"][data-field="workEndHour"]`);
              try {
                await api(`/groups/${groupId}`, {
                  method: 'PATCH',
                  body: { workStartHour: startInput.value, workEndHour: endInput.value },
                });
                showToast(t('toast_work_hours_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });

          listEl.querySelectorAll('.deleteGroupBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm(t('confirm_delete_group'))) return;
              try {
                await api(`/groups/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_group_deleted'), 'success');
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
              workStartHour: document.getElementById('newGroupWorkStart').value || null,
              workEndHour: document.getElementById('newGroupWorkEnd').value || null,
            },
          });
          document.getElementById('newGroupForm').reset();
          showToast(t('toast_group_created'), 'success');
          loadGroups();
          loadGroupOptions();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadGroupOptions();
      loadGroups();
      loadManagerOptions();

      guardForm(document.getElementById('createStaffForm'), async (e) => {
        const errEl = document.getElementById('createStaffError');
        errEl.textContent = '';
        const body = {
          name: document.getElementById('newName').value.trim(),
          email: document.getElementById('newEmail').value.trim(),
          role: document.getElementById('newRole').value,
          groupId: document.getElementById('newGroup').value || null,
          locale: document.getElementById('newLocale').value,
          managerId: document.getElementById('newManager').value || null,
          isExternal: document.getElementById('newIsExternal').checked,
        };
        try {
          const { user, tempPassword } = await api('/users', { method: 'POST', body });
          document.getElementById('tempPasswordBox').innerHTML = `
            <div class="divider"></div>
            <p class="success-text">${t('account_created_for')} ${escapeHtml(user.name)}.</p>
            <p class="hint">${t('temp_password_hint')}</p>
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-block">${escapeHtml(tempPassword)}</p>`;
          e.target.reset();
          showToast(t('toast_staff_created'), 'success');
          loadUsersTable();
          loadManagerOptions();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      let selectedNewCategoryIcon = 'ticket';
      function renderIconPicker(containerId, selected, onSelect) {
        const el = document.getElementById(containerId);
        el.innerHTML = CATEGORY_ICON_CHOICES.map((name) => `
          <button type="button" class="icon-choice ${name === selected ? 'active' : ''}" data-icon="${name}" title="${name}">${icon(name)}</button>
        `).join('');
        el.querySelectorAll('.icon-choice').forEach((btn) => {
          btn.addEventListener('click', () => {
            el.querySelectorAll('.icon-choice').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            onSelect(btn.dataset.icon);
          });
        });
      }
      renderIconPicker('newCategoryIconPicker', selectedNewCategoryIcon, (name) => { selectedNewCategoryIcon = name; });

      async function loadCategories() {
        const listEl = document.getElementById('categoriesList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { categories } = await api('/categories');
          const { groups } = await api('/groups');
          const groupSelect = document.getElementById('newCategoryGroup');
          groupSelect.innerHTML = groupOptionsHtml(groups, '', t('option_none'));

          const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
          const parentSelect = document.getElementById('newCategoryParent');
          parentSelect.innerHTML = `<option value="">${t('option_top_level_category')}</option>` +
            topLevel.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

          const subsByParent = new Map();
          categories.filter((c) => c.parent_id).forEach((c) => {
            if (!subsByParent.has(c.parent_id)) subsByParent.set(c.parent_id, []);
            subsByParent.get(c.parent_id).push(c);
          });
          subsByParent.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

          function categoryRowHtml(c) {
            return `
              <div class="category-row">
                <span class="category-row-icon">${icon(c.icon || 'ticket')}</span>
                <span class="category-row-name">${escapeHtml(c.name)}</span>
                <select class="categoryGroupSel" data-id="${c.id}">${groupOptionsHtml(groups, c.default_group_id, t('option_none'))}</select>
                <button type="button" class="icon-btn deleteCategoryBtn" data-id="${c.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>`;
          }

          listEl.className = '';
          listEl.innerHTML = topLevel.length ? topLevel.map((macro) => {
            const subs = subsByParent.get(macro.id) || [];
            if (!subs.length) return categoryRowHtml(macro);
            return `
              <details class="category-macro-block">
                <summary class="category-macro-summary">
                  ${icon(macro.icon || 'ticket')}
                  <span class="category-macro-summary-name">${escapeHtml(macro.name)}</span>
                  <span class="category-macro-count">${subs.length}</span>
                  ${icon('chevronDown', 'category-chevron')}
                </summary>
                <div class="category-sub-list">
                  ${categoryRowHtml(macro)}
                  ${subs.map(categoryRowHtml).join('')}
                </div>
              </details>`;
          }).join('') : `<p class="hint">${t('no_categories_hint')}</p>`;

          listEl.querySelectorAll('.categoryGroupSel').forEach((sel) => {
            sel.addEventListener('change', async () => {
              try {
                await api(`/categories/${sel.dataset.id}`, { method: 'PATCH', body: { defaultGroupId: sel.value || null } });
                showToast(t('toast_default_team_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
                loadCategories();
              }
            });
          });

          listEl.querySelectorAll('.deleteCategoryBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/categories/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_category_deleted'), 'success');
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
          await api('/categories', {
            method: 'POST',
            body: {
              name: input.value.trim(),
              icon: selectedNewCategoryIcon,
              defaultGroupId: document.getElementById('newCategoryGroup').value || null,
              parentId: document.getElementById('newCategoryParent').value || null,
            },
          });
          input.value = '';
          document.getElementById('newCategoryParent').value = '';
          showToast(t('toast_category_added'), 'success');
          loadCategories();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadCategories();

      function ruleBadge(labelKey) {
        return `<span class="badge badge-in_progress">${t(labelKey)}</span>`;
      }

      async function loadRuleFormOptions() {
        try {
          const [{ categories }, { groups }, { users }] = await Promise.all([api('/categories'), api('/groups'), api('/users')]);
          const catOptions = categories.slice().sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
          document.getElementById('condCategory').innerHTML = `<option value="">${t('option_none')}</option>${catOptions}`;

          const groupOpts = groupOptionsHtml(groups, '', t('option_none'));
          document.getElementById('condGroup').innerHTML = groupOpts;
          document.getElementById('actionGroup').innerHTML = groupOpts;

          const staff = users.filter((u) => u.role === 'agent' || u.role === 'admin').sort((a, b) => a.name.localeCompare(b.name));
          document.getElementById('actionUser').innerHTML = `<option value="">${t('option_none')}</option>` +
            staff.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
        } catch {}
      }

      function ruleConditionSummary(rule) {
        const parts = [];
        if (rule.cond_status) parts.push(`${t('dim_status')} = ${statusLabels()[rule.cond_status] || rule.cond_status}`);
        if (rule.cond_priority) parts.push(`${t('dim_priority')} = ${priorityLabels()[rule.cond_priority] || rule.cond_priority}`);
        if (rule.cond_type) parts.push(`${t('dim_type')} = ${typeLabels()[rule.cond_type] || rule.cond_type}`);
        if (rule.cond_category) parts.push(`${t('field_category')} = "${rule.cond_category}"`);
        if (rule.cond_group_name) parts.push(`${t('field_group_condition')} = "${rule.cond_group_name}"`);
        return parts.length ? parts.join(' · ') : t('rule_no_conditions');
      }

      function ruleActionSummary(rule) {
        const parts = [];
        if (rule.action_set_status) parts.push(`${t('action_set_status')} → ${statusLabels()[rule.action_set_status] || rule.action_set_status}`);
        if (rule.action_set_priority) parts.push(`${t('action_set_priority')} → ${priorityLabels()[rule.action_set_priority] || rule.action_set_priority}`);
        if (rule.action_assign_group_name) parts.push(`${t('action_assign_group')} → "${rule.action_assign_group_name}"`);
        if (rule.action_assign_user_name) parts.push(`${t('action_assign_user')} → "${rule.action_assign_user_name}"`);
        if (rule.action_note) parts.push(t('action_add_note'));
        return parts.join(' · ');
      }

      async function loadRules() {
        const listEl = document.getElementById('rulesList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { rules } = await api('/automations');
          listEl.className = '';
          listEl.innerHTML = rules.length ? rules.map((rule) => `
            <div class="rule-row ${rule.enabled ? '' : 'rule-disabled'}">
              <div class="rule-row-head">
                <label class="checkbox-field">
                  <input type="checkbox" class="ruleEnabledToggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''} />
                  <strong>${escapeHtml(rule.name)}</strong>
                </label>
                ${ruleBadge(rule.trigger_event === 'created' ? 'trigger_created' : 'trigger_updated')}
                <button type="button" class="icon-btn deleteRuleBtn" data-id="${rule.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>
              <p class="hint" style="margin:0.3rem 0 0"><strong>${t('rule_conditions_label')}:</strong> ${ruleConditionSummary(rule)}</p>
              <p class="hint" style="margin:0.15rem 0 0"><strong>${t('rule_actions_label')}:</strong> ${ruleActionSummary(rule)}</p>
            </div>`).join('') : `<p class="hint">${t('no_rules_hint')}</p>`;

          listEl.querySelectorAll('.ruleEnabledToggle').forEach((cb) => {
            cb.addEventListener('change', async () => {
              try {
                await api(`/automations/${cb.dataset.id}`, { method: 'PATCH', body: { enabled: cb.checked } });
                showToast(t('toast_rule_updated'), 'success');
                loadRules();
              } catch (err) {
                showToast(err.message, 'error');
                loadRules();
              }
            });
          });
          listEl.querySelectorAll('.deleteRuleBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/automations/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_rule_deleted'), 'success');
                loadRules();
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

      guardForm(document.getElementById('newRuleForm'), async () => {
        const errEl = document.getElementById('ruleError');
        errEl.textContent = '';
        const name = document.getElementById('ruleName').value.trim();
        if (!name) { errEl.textContent = t('field_rule_name'); return; }
        try {
          await api('/automations', {
            method: 'POST',
            body: {
              name,
              triggerEvent: document.getElementById('ruleTrigger').value,
              condStatus: document.getElementById('condStatus').value || null,
              condPriority: document.getElementById('condPriority').value || null,
              condType: document.getElementById('condType').value || null,
              condCategory: document.getElementById('condCategory').value || null,
              condGroupId: document.getElementById('condGroup').value || null,
              actionSetStatus: document.getElementById('actionStatus').value || null,
              actionSetPriority: document.getElementById('actionPriority').value || null,
              actionAssignGroupId: document.getElementById('actionGroup').value || null,
              actionAssignUserId: document.getElementById('actionUser').value || null,
              actionNote: document.getElementById('actionNote').value.trim() || null,
            },
          });
          document.getElementById('newRuleForm').reset();
          showToast(t('toast_rule_added'), 'success');
          loadRules();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadRuleFormOptions();
      loadRules();

      const fieldTypeLabelKeys = { text: 'field_type_text', number: 'field_type_number', textarea: 'field_type_textarea', select: 'field_type_select', checkbox: 'field_type_checkbox' };

      async function loadFieldFormOptions() {
        try {
          const { categories } = await api('/categories');
          const catOptions = categories.slice().sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
          document.getElementById('newFieldCategory').innerHTML = `<option value="">${t('field_global_option')}</option>${catOptions}`;
        } catch {}
      }

      async function loadFields() {
        const listEl = document.getElementById('fieldsList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { fields } = await api('/custom-fields');
          listEl.className = '';
          listEl.innerHTML = fields.length ? fields.map((field) => `
            <div class="rule-row">
              <div class="rule-row-head">
                <strong>${escapeHtml(field.name)}</strong>
                <span class="badge badge-in_progress">${t(fieldTypeLabelKeys[field.field_type] || 'field_type_text')}</span>
                ${field.required ? `<span class="badge badge-urgent">${t('field_required_label')}</span>` : ''}
                <button type="button" class="icon-btn deleteFieldBtn" data-id="${field.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>
              <p class="hint" style="margin:0.3rem 0 0">${field.category_name ? `${t('field_field_category')}: ${escapeHtml(field.category_name)}` : t('field_global_option')}${field.options.length ? ` · ${field.options.join(', ')}` : ''}</p>
            </div>`).join('') : `<p class="hint">${t('no_fields_hint')}</p>`;

          listEl.querySelectorAll('.deleteFieldBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/custom-fields/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_field_deleted'), 'success');
                loadFields();
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

      const newFieldTypeSel = document.getElementById('newFieldType');
      const newFieldOptionsWrap = document.getElementById('newFieldOptionsWrap');
      newFieldTypeSel.addEventListener('change', () => {
        newFieldOptionsWrap.hidden = newFieldTypeSel.value !== 'select';
      });

      guardForm(document.getElementById('newFieldForm'), async () => {
        const errEl = document.getElementById('fieldError');
        errEl.textContent = '';
        const name = document.getElementById('newFieldName').value.trim();
        const fieldType = newFieldTypeSel.value;
        const optionsRaw = document.getElementById('newFieldOptions').value;
        try {
          await api('/custom-fields', {
            method: 'POST',
            body: {
              name,
              fieldType,
              options: fieldType === 'select' ? optionsRaw.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
              categoryId: document.getElementById('newFieldCategory').value || null,
              required: document.getElementById('newFieldRequired').checked,
            },
          });
          document.getElementById('newFieldForm').reset();
          newFieldOptionsWrap.hidden = true;
          showToast(t('toast_field_added'), 'success');
          loadFields();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadFieldFormOptions();
      loadFields();

      async function loadCannedResponses() {
        const listEl = document.getElementById('cannedList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { responses } = await api('/canned-responses');
          listEl.className = '';
          listEl.innerHTML = responses.length ? responses.map((r) => `
            <div class="rule-row">
              <div class="rule-row-head">
                <strong>${escapeHtml(r.title)}</strong>
                <button type="button" class="icon-btn deleteCannedBtn" data-id="${r.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>
              <p class="hint" style="margin:0.3rem 0 0;white-space:pre-wrap">${escapeHtml(r.body)}</p>
            </div>`).join('') : `<p class="hint">${t('no_canned_hint')}</p>`;

          listEl.querySelectorAll('.deleteCannedBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/canned-responses/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_canned_deleted'), 'success');
                loadCannedResponses();
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

      guardForm(document.getElementById('newCannedForm'), async () => {
        const errEl = document.getElementById('cannedError');
        errEl.textContent = '';
        try {
          await api('/canned-responses', {
            method: 'POST',
            body: {
              title: document.getElementById('newCannedTitle').value.trim(),
              body: document.getElementById('newCannedBody').value.trim(),
            },
          });
          document.getElementById('newCannedForm').reset();
          showToast(t('toast_canned_added'), 'success');
          loadCannedResponses();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadCannedResponses();

      async function loadTemplateCategoryOptions() {
        try {
          const { categories: cats } = await api('/categories');
          const leafCats = cats.filter((c) => c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
          document.getElementById('newTemplateCategory').innerHTML = `<option value="">${t('option_none')}</option>` +
            leafCats.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
        } catch {}
      }

      async function loadTemplates() {
        const listEl = document.getElementById('templatesList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { templates } = await api('/ticket-templates');
          listEl.className = '';
          listEl.innerHTML = templates.length ? templates.map((tpl) => `
            <div class="rule-row">
              <div class="rule-row-head">
                <strong>${escapeHtml(tpl.name)}</strong>
                ${tpl.category ? `<span class="badge badge-in_progress">${escapeHtml(tpl.category)}</span>` : ''}
                <button type="button" class="icon-btn deleteTemplateBtn" data-id="${tpl.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>
              <p class="hint" style="margin:0.3rem 0 0">${escapeHtml(tpl.subject)}</p>
            </div>`).join('') : `<p class="hint">${t('no_templates_hint')}</p>`;

          listEl.querySelectorAll('.deleteTemplateBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/ticket-templates/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_template_deleted'), 'success');
                loadTemplates();
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

      guardForm(document.getElementById('newTemplateForm'), async () => {
        const errEl = document.getElementById('templateError');
        errEl.textContent = '';
        try {
          await api('/ticket-templates', {
            method: 'POST',
            body: {
              name: document.getElementById('newTemplateName').value.trim(),
              category: document.getElementById('newTemplateCategory').value || null,
              priority: document.getElementById('newTemplatePriority').value || null,
              type: document.getElementById('newTemplateType').value || null,
              subject: document.getElementById('newTemplateSubject').value.trim(),
              description: document.getElementById('newTemplateDescription').value.trim(),
            },
          });
          document.getElementById('newTemplateForm').reset();
          showToast(t('toast_template_added'), 'success');
          loadTemplates();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadTemplateCategoryOptions();
      loadTemplates();

      async function loadHolidays() {
        const listEl = document.getElementById('holidaysList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { holidays } = await api('/holidays');
          listEl.className = '';
          listEl.innerHTML = holidays.length ? holidays.map((h) => `
            <div class="rule-row">
              <div class="rule-row-head">
                <strong>${new Date(`${h.date}T00:00:00Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</strong>
                <span>${escapeHtml(h.name)}</span>
                <button type="button" class="icon-btn deleteHolidayBtn" data-id="${h.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
              </div>
            </div>`).join('') : `<p class="hint">${t('no_holidays_hint')}</p>`;

          listEl.querySelectorAll('.deleteHolidayBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/holidays/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_holiday_deleted'), 'success');
                loadHolidays();
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

      guardForm(document.getElementById('newHolidayForm'), async () => {
        const errEl = document.getElementById('holidayError');
        errEl.textContent = '';
        try {
          await api('/holidays', {
            method: 'POST',
            body: {
              date: document.getElementById('newHolidayDate').value,
              name: document.getElementById('newHolidayName').value.trim(),
            },
          });
          document.getElementById('newHolidayForm').reset();
          showToast(t('toast_holiday_added'), 'success');
          loadHolidays();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadHolidays();
    }

    let allUsersCache = [];
    async function loadUsersTable() {
      const wrap = document.getElementById('usersWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = t('loading');
      try {
        const { users } = await api('/users');
        allUsersCache = users;
        renderUsersTable(users);
      } catch (err) {
        wrap.className = '';
        wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    function renderUsersTable(users) {
      const wrap = document.getElementById('usersWrap');
      wrap.className = 'card';
      wrap.innerHTML = `
        <div class="field" style="max-width:320px;margin-bottom:1rem">
          <label for="userSearchInput">${t('search_person_label')}</label>
          <input id="userSearchInput" type="search" placeholder="${t('search_person_placeholder')}" />
        </div>
        <div class="table-scroll">
          <table class="users-table">
            <thead><tr><th>${t('th_name')}</th><th>${t('th_email')}</th><th>${t('th_role')}</th><th>${t('th_group')}</th><th>${t('th_registered')}</th></tr></thead>
            <tbody>
              ${users.length ? users.map((u) => `
                <tr class="user-row" data-user-id="${u.id}" tabindex="0" role="link">
                  <td>${escapeHtml(u.name)}</td>
                  <td>${escapeHtml(u.email)}</td>
                  <td><span class="role-tag">${roleLabels()[u.role] || u.role}</span> ${u.is_external ? `<span class="role-tag role-tag-external">${t('external_badge')}</span>` : ''}</td>
                  <td>${escapeHtml(groupLabel(u) || '—')}</td>
                  <td>${formatDate(u.created_at)}</td>
                </tr>`).join('') : `<tr><td colspan="5"><p class="hint">${t('no_people_found')}</p></td></tr>`}
            </tbody>
          </table>
        </div>`;

      wrap.querySelectorAll('.user-row').forEach((row) => {
        row.addEventListener('click', () => { location.hash = `#/users/${row.dataset.userId}`; });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') location.hash = `#/users/${row.dataset.userId}`;
        });
      });

      const searchInput = document.getElementById('userSearchInput');
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        const filtered = q ? allUsersCache.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : allUsersCache;
        renderUsersTable(filtered);
        document.getElementById('userSearchInput').focus();
      });
    }

    loadUsersTable();
  }

  async function renderUserDetail(id) {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${t('access_denied')}</p></div>`;
      return;
    }
    let user;
    try {
      const data = await api(`/users/${id}`);
      user = data.user;
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    const isAdmin = state.user.role === 'admin';
    const isSelf = user.id === state.user.id;
    const [groups, createdStats, assignedStats, allUsers] = await Promise.all([
      isAdmin ? api('/groups').then((d) => d.groups).catch(() => []) : Promise.resolve([]),
      api(`/tickets?createdBy=${user.id}`).then((d) => d.tickets).catch(() => []),
      user.role !== 'customer' ? api(`/tickets?assigned=${user.id}`).then((d) => d.tickets).catch(() => []) : Promise.resolve([]),
      user.role !== 'customer' ? api('/users').then((d) => d.users).catch(() => []) : Promise.resolve([]),
    ]);
    const directReports = allUsers.filter((u) => u.manager_id === user.id);

    const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('userCircle')} ${t('person_card_title')}</h1>
        <a class="btn btn-ghost" href="#/admin">${icon('arrowLeft')} ${t('back_to_list')}</a>
      </div>
      <div class="user-profile-grid">
        <div class="card user-profile-head">
          <div class="user-avatar">${escapeHtml(initials)}</div>
          <div>
            <h2 style="margin:0 0 0.2rem">${escapeHtml(user.name)}</h2>
            <p class="hint" style="margin:0">${escapeHtml(user.email)}</p>
            <span class="role-tag" style="margin-top:0.5rem;display:inline-block">${roleLabels()[user.role] || user.role}</span>
            ${user.is_external ? `<span class="role-tag role-tag-external" style="margin-top:0.5rem;display:inline-block">${t('external_badge')}</span>` : ''}
          </div>
          ${state.user.is_super_admin && !isSelf ? `<button type="button" id="impersonateBtn" class="btn btn-sm" style="margin-left:auto">${icon('eye')} ${t('impersonate')}</button>` : ''}
        </div>

        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('account_details_title')}</h3>
          <div class="field"><label>${t('registered_on_label')}</label><p>${formatDate(user.created_at)}</p></div>
          ${isAdmin ? `
          <div class="field">
            <label for="detailRole">${t('field_role')}</label>
            <select id="detailRole" ${isSelf ? 'disabled' : ''}>
              ${Object.entries(roleLabels()).map(([v, l]) => `<option value="${v}" ${user.role === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="detailGroup">${t('field_group')}</label>
            <select id="detailGroup">${groupOptionsHtml(groups, user.group_id, t('no_group_option'))}</select>
          </div>
          <div class="field">
            <label for="detailLocale">${t('field_locale')}</label>
            <select id="detailLocale">
              ${Object.entries(LANG_LABELS).map(([v, l]) => `<option value="${v}" ${user.locale === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${user.role !== 'customer' ? `
          <div class="field">
            <label for="detailManager">${t('field_manager')}</label>
            <select id="detailManager"><option value="">${t('option_none')}</option></select>
          </div>
          <label class="checkbox-field">
            <input type="checkbox" id="detailIsExternal" ${user.is_external ? 'checked' : ''} />
            ${t('field_is_external')}
          </label>
          ` : ''}
          <button type="button" id="detailResetPwBtn" class="btn btn-sm btn-outline-danger" style="margin-top:0.5rem">${icon('refresh')} ${t('reset_password_btn')}</button>
          <div id="detailResetPwBox"></div>
          ` : `
          <div class="field"><label>${t('field_group')}</label><p>${escapeHtml(groupLabel(user) || '—')}</p></div>
          <div class="field"><label>${t('field_locale')}</label><p>${escapeHtml(LANG_LABELS[user.locale] || user.locale || '—')}</p></div>
          ${user.role !== 'customer' ? `<div class="field"><label>${t('manager_label')}</label><p>${escapeHtml(user.manager_name || t('no_manager_label'))}</p></div>` : ''}
          `}
        </div>

        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('ticket_activity_title')}</h3>
          <div class="stat-row" style="grid-template-columns:1fr 1fr">
            <div class="stat-card"><div class="stat-value">${createdStats.length}</div><div class="stat-label">${t('opened_by_person')}</div></div>
            ${user.role !== 'customer' ? `<div class="stat-card"><div class="stat-value">${assignedStats.length}</div><div class="stat-label">${t('assigned_to_person')}</div></div>` : ''}
          </div>
        </div>
        ${user.role !== 'customer' ? `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('direct_reports_title')}</h3>
          ${directReports.length ? `<ul class="plain-list">${directReports.map((r) => `<li><a href="#/users/${r.id}">${escapeHtml(r.name)}</a> · ${roleLabels()[r.role] || r.role}${groupLabel(r) ? ' · ' + escapeHtml(groupLabel(r)) : ''}</li>`).join('')}</ul>` : `<p class="hint">${t('no_direct_reports')}</p>`}
        </div>` : ''}
      </div>`;

    if (isAdmin) {
      document.getElementById('detailRole').addEventListener('change', async (e) => {
        try {
          await api(`/users/${user.id}/role`, { method: 'PATCH', body: { role: e.target.value } });
          showToast(t('toast_role_updated'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
          renderUserDetail(id);
        }
      });
      document.getElementById('detailGroup').addEventListener('change', async (e) => {
        try {
          await api(`/users/${user.id}/group`, { method: 'PATCH', body: { groupId: e.target.value || null } });
          showToast(t('toast_group_updated'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
          renderUserDetail(id);
        }
      });
      document.getElementById('detailLocale').addEventListener('change', async (e) => {
        try {
          await api(`/users/${user.id}/locale`, { method: 'PATCH', body: { locale: e.target.value } });
          showToast(t('toast_locale_updated'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
          renderUserDetail(id);
        }
      });
      const detailManager = document.getElementById('detailManager');
      if (detailManager) {
        const managerOptions = allUsers.filter((u) => (u.role === 'agent' || u.role === 'admin') && u.id !== user.id);
        detailManager.innerHTML = `<option value="">${t('option_none')}</option>` +
          managerOptions.map((u) => `<option value="${u.id}" ${user.manager_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
        detailManager.addEventListener('change', async (e) => {
          try {
            await api(`/users/${user.id}/manager`, { method: 'PATCH', body: { managerId: e.target.value || null } });
            showToast(t('toast_manager_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
            renderUserDetail(id);
          }
        });
      }
      const detailIsExternal = document.getElementById('detailIsExternal');
      if (detailIsExternal) {
        detailIsExternal.addEventListener('change', async (e) => {
          try {
            await api(`/users/${user.id}/external`, { method: 'PATCH', body: { isExternal: e.target.checked } });
            showToast(t('toast_external_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
            renderUserDetail(id);
          }
        });
      }
      document.getElementById('detailResetPwBtn').addEventListener('click', async () => {
        if (!confirm(`${t('confirm_reset_password_prefix')} ${user.name}${t('confirm_reset_password_suffix')}`)) return;
        try {
          const { tempPassword } = await api(`/users/${user.id}/reset-password`, { method: 'POST' });
          document.getElementById('detailResetPwBox').innerHTML = `
            <div class="divider"></div>
            <p class="success-text">${t('password_reset_success_msg')}</p>
            <p class="hint">${t('new_temp_password_hint')}</p>
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-block">${escapeHtml(tempPassword)}</p>`;
          showToast(t('toast_password_reset'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const impersonateBtn = document.getElementById('impersonateBtn');
    if (impersonateBtn) {
      impersonateBtn.addEventListener('click', () => {
        startImpersonation(user);
      });
    }
  }

  async function renderBacklog() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('inbox')} Backlog</h1>
          <p class="hint">${t('backlog_hint')}</p>
        </div>
      </div>
      <div id="bulkBar" class="bulk-action-bar" hidden>
        <span id="bulkCount" class="hint"></span>
        <select id="bulkAssignSel"><option value="">${t('bulk_assign_placeholder')}</option></select>
        <select id="bulkStatusSel">
          <option value="">${t('bulk_status_placeholder')}</option>
          ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <button type="button" id="bulkClearBtn" class="btn btn-ghost btn-sm">${t('bulk_clear_selection')}</button>
      </div>
      <div id="ticketList" class="skeleton-grid">
        ${Array(4).fill('<div class="skeleton-card"></div>').join('')}
      </div>`;

    const listEl = document.getElementById('ticketList');
    const bulkBar = document.getElementById('bulkBar');
    const bulkCount = document.getElementById('bulkCount');
    const bulkAssignSel = document.getElementById('bulkAssignSel');
    const bulkStatusSel = document.getElementById('bulkStatusSel');
    const bulkClearBtn = document.getElementById('bulkClearBtn');
    const selected = new Set();

    try {
      const { users } = await api('/users');
      const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
      bulkAssignSel.innerHTML = `<option value="">${t('bulk_assign_placeholder')}</option>` +
        staffUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
    } catch {}

    function updateBulkBar() {
      bulkBar.hidden = selected.size === 0;
      bulkCount.textContent = `${t('bulk_selected_count')} ${selected.size}`;
    }

    function wireSelectionCheckboxes() {
      listEl.querySelectorAll('.ticketSelectBox').forEach((box) => {
        box.checked = selected.has(Number(box.dataset.id));
        box.addEventListener('change', () => {
          const id = Number(box.dataset.id);
          if (box.checked) selected.add(id); else selected.delete(id);
          updateBulkBar();
        });
      });
    }

    async function loadBacklog() {
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
        const openIds = new Set(open.map((t) => t.id));
        [...selected].forEach((id) => { if (!openIds.has(id)) selected.delete(id); });
        renderTicketList(listEl, open, { selectable: isStaff() });
        wireSelectionCheckboxes();
        updateBulkBar();
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    bulkClearBtn.addEventListener('click', () => {
      selected.clear();
      wireSelectionCheckboxes();
      updateBulkBar();
    });

    bulkAssignSel.addEventListener('change', async () => {
      if (!bulkAssignSel.value || !selected.size) return;
      const assignedTo = Number(bulkAssignSel.value);
      try {
        await Promise.all([...selected].map((id) => api(`/tickets/${id}`, { method: 'PATCH', body: { assigned_to: assignedTo } })));
        showToast(t('toast_bulk_assigned'), 'success');
        selected.clear();
        bulkAssignSel.value = '';
        loadBacklog();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    bulkStatusSel.addEventListener('change', async () => {
      if (!bulkStatusSel.value || !selected.size) return;
      const status = bulkStatusSel.value;
      try {
        await Promise.all([...selected].map((id) => api(`/tickets/${id}`, { method: 'PATCH', body: { status } })));
        showToast(t('toast_bulk_status_updated'), 'success');
        selected.clear();
        bulkStatusSel.value = '';
        loadBacklog();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    loadBacklog();
  }

  async function renderAssets() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('ticket')} ${t('nav_assets')}</h1>
          <p class="hint">${t('assets_hint')}</p>
        </div>
      </div>
      <div class="card" style="margin-bottom:1.25rem;max-width:640px">
        <h3 class="section-title" style="margin-top:0">${t('new_asset_title')}</h3>
        <form id="newAssetForm" class="form-grid" style="max-width:none">
          <div class="field"><label for="assetName">${t('field_name')}</label><input id="assetName" required placeholder="es. Laptop Dell XPS #12" /></div>
          <div style="display:flex;gap:0.75rem">
            <div class="field" style="flex:1">
              <label for="assetType">${t('table_type')}</label>
              <select id="assetType">${Object.entries(assetTypeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
            </div>
            <div class="field" style="flex:1"><label for="assetTag">${t('field_tag')}</label><input id="assetTag" placeholder="es. IT-0012" /></div>
          </div>
          <div><button class="btn btn-sm" type="submit">${t('btn_add_asset')}</button></div>
        </form>
      </div>
      <div class="filters">
        <select id="assetStatusFilter">
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(assetStatusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div id="assetsWrap" class="card spinner-row">${t('loading')}</div>`;

    let usersCache = [];
    try {
      usersCache = (await api('/users')).users.filter((u) => u.role !== 'customer');
    } catch { usersCache = []; }

    const statusFilter = document.getElementById('assetStatusFilter');

    async function loadAssets() {
      const wrap = document.getElementById('assetsWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = t('loading');
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        const { assets } = await api(`/assets?${params.toString()}`);
        wrap.className = 'card';
        wrap.innerHTML = assets.length ? `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th>${t('field_name')}</th><th>${t('table_type')}</th><th>${t('table_tag')}</th><th>${t('table_status')}</th><th>${t('table_assignment')}</th><th>${t('assigned_to_label')}</th><th>${t('table_due_date')}</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${assets.map((a) => `
                  <tr>
                    <td>${escapeHtml(a.name)}</td>
                    <td>${assetTypeLabels()[a.asset_type] || a.asset_type}</td>
                    <td>${escapeHtml(a.tag || '—')}</td>
                    <td>
                      <select class="assetStatusSel groupSel" data-id="${a.id}">
                        ${Object.entries(assetStatusLabels()).map(([v, l]) => `<option value="${v}" ${a.status === v ? 'selected' : ''}>${l}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <select class="assetAssignTypeSel groupSel" data-id="${a.id}">
                        <option value="permanente" ${a.assignment_type === 'permanente' ? 'selected' : ''}>${t('assignment_permanent')}</option>
                        <option value="prestito" ${a.assignment_type === 'prestito' ? 'selected' : ''}>${t('assignment_loan')}</option>
                      </select>
                    </td>
                    <td>
                      <select class="assetAssigneeSel groupSel" data-id="${a.id}">
                        <option value="">${t('none_option')}</option>
                        ${usersCache.map((u) => `<option value="${u.id}" ${a.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
                      </select>
                    </td>
                    <td><input type="date" class="assetDueInput" data-id="${a.id}" value="${a.due_date || ''}" ${a.assignment_type !== 'prestito' ? 'disabled' : ''} /></td>
                    ${state.user.role === 'admin' ? `<td><button type="button" class="icon-btn deleteAssetBtn" data-id="${a.id}" title="${t('delete_asset_title')}">${icon('trash')}</button></td>` : ''}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<p class="hint">${t('no_assets_found')}</p>`;

        wrap.querySelectorAll('.assetStatusSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { status: sel.value } });
            showToast(t('toast_asset_status_updated'), 'success');
          } catch (err) { showToast(err.message, 'error'); loadAssets(); }
        }));
        wrap.querySelectorAll('.assetAssignTypeSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { assignmentType: sel.value } });
            showToast(t('toast_assignment_updated'), 'success');
            loadAssets();
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.assetAssigneeSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { assignedTo: sel.value ? Number(sel.value) : null } });
            showToast(t('toast_assignee_updated'), 'success');
            loadAssets();
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.assetDueInput').forEach((input) => input.addEventListener('change', async () => {
          try {
            await api(`/assets/${input.dataset.id}`, { method: 'PATCH', body: { dueDate: input.value || null } });
            showToast(t('toast_due_date_updated'), 'success');
          } catch (err) { showToast(err.message, 'error'); }
        }));
        wrap.querySelectorAll('.deleteAssetBtn').forEach((btn) => btn.addEventListener('click', async () => {
          if (!confirm(t('confirm_delete_asset'))) return;
          try {
            await api(`/assets/${btn.dataset.id}`, { method: 'DELETE' });
            showToast(t('toast_asset_deleted'), 'success');
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
        showToast(t('toast_asset_created'), 'success');
        loadAssets();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    loadAssets();
  }

  async function renderSearch() {
    let groups = [];
    let tags = [];
    try { groups = (await api('/groups')).groups; } catch { groups = []; }
    try { tags = (await api('/tags')).tags; } catch { tags = []; }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('inbox')} ${t('nav_search')}</h1>
          <p class="hint">${t('search_hint')}</p>
        </div>
      </div>
      <div class="filters">
        <input id="searchQuery" type="search" placeholder="${t('search_placeholder_full')}" style="flex:2 1 260px" autofocus />
        <select id="searchType">
          <option value="">${t('filter_all_types')}</option>
          ${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchStatus">
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchPriority">
          <option value="">${t('filter_all_priorities')}</option>
          ${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="searchGroup">${groupOptionsHtml(groups, '', t('all_groups_option'))}</select>
        <select id="searchTag">
          <option value="">${t('all_tags_option')}</option>
          ${tags.map((tg) => `<option value="${escapeHtml(tg.name)}">${escapeHtml(tg.name)}</option>`).join('')}
        </select>
      </div>
      <div id="searchResults" class="ticket-grid"></div>`;

    const resultsEl = document.getElementById('searchResults');
    const qEl = document.getElementById('searchQuery');
    const typeEl = document.getElementById('searchType');
    const statusEl = document.getElementById('searchStatus');
    const priorityEl = document.getElementById('searchPriority');
    const groupEl = document.getElementById('searchGroup');
    const tagEl = document.getElementById('searchTag');

    let debounceTimer;
    async function runSearch() {
      const params = new URLSearchParams();
      if (qEl.value.trim()) params.set('q', qEl.value.trim());
      if (typeEl.value) params.set('type', typeEl.value);
      if (statusEl.value) params.set('status', statusEl.value);
      if (priorityEl.value) params.set('priority', priorityEl.value);
      if (groupEl.value) params.set('group', groupEl.value);
      if (tagEl.value) params.set('tag', tagEl.value);
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
    [typeEl, statusEl, priorityEl, groupEl, tagEl].forEach((el) => el.addEventListener('change', runSearch));

    const presetGroup = sessionStorage.getItem('ticketing_search_group');
    if (presetGroup) {
      sessionStorage.removeItem('ticketing_search_group');
      groupEl.value = presetGroup;
    }

    runSearch();
  }

  async function renderReport() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('activity')} ${t('nav_report')}</h1>
          <p class="hint">${t('report_hint')}</p>
        </div>
      </div>
      <div class="filters">
        <select id="reportTeam"><option value="">${t('filter_all_teams')}</option></select>
        <select id="reportMember"><option value="">${t('filter_all_members')}</option></select>
        <select id="reportStatus">
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="reportType">
          <option value="">${t('filter_all_types')}</option>
          ${Object.entries(typeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <input type="date" id="reportDateFrom" title="${t('report_date_from')}" />
        <input type="date" id="reportDateTo" title="${t('report_date_to')}" />
        <select id="reportChartType">
          <option value="bar">${t('chart_type_bar')}</option>
          <option value="donut">${t('chart_type_donut')}</option>
        </select>
      </div>
      <div class="report-export-bar">
        <button type="button" id="exportCsvBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_csv')}</button>
        <button type="button" id="exportExcelBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_excel')}</button>
        <span class="hint" id="reportExportCount"></span>
      </div>
      <div id="reportCharts" class="charts-row spinner-row">${t('loading')}</div>`;

    const chartsEl = document.getElementById('reportCharts');
    const teamSel = document.getElementById('reportTeam');
    const memberSel = document.getElementById('reportMember');
    const statusSel = document.getElementById('reportStatus');
    const typeSel = document.getElementById('reportType');
    const dateFromEl = document.getElementById('reportDateFrom');
    const dateToEl = document.getElementById('reportDateTo');
    const chartTypeSel = document.getElementById('reportChartType');
    const exportCountEl = document.getElementById('reportExportCount');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');

    let allTickets = [];
    let groups = [];
    let staffUsers = [];
    let filteredTickets = [];
    try {
      const [ticketsRes, groupsRes, usersRes] = await Promise.all([api('/tickets'), api('/groups'), api('/users')]);
      allTickets = ticketsRes.tickets;
      groups = groupsRes.groups;
      staffUsers = usersRes.users.filter((u) => u.role === 'agent' || u.role === 'admin');
    } catch (err) {
      chartsEl.className = '';
      chartsEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      return;
    }

    teamSel.innerHTML = `<option value="">${t('filter_all_teams')}</option>` + groupOptionsHtml(groups, '', null);

    function populateMemberOptions() {
      const teamId = teamSel.value ? Number(teamSel.value) : null;
      const members = teamId ? staffUsers.filter((u) => u.group_id === teamId) : staffUsers;
      const prev = memberSel.value;
      memberSel.innerHTML = `<option value="">${t('filter_all_members')}</option>` +
        members.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
      if (members.some((u) => String(u.id) === prev)) memberSel.value = prev;
    }
    populateMemberOptions();

    function renderChart(container, dim, rows, total, emptyHint, opts = {}) {
      if (!rows.length) { container.innerHTML = `<p class="hint">${emptyHint}</p>`; return; }
      if (chartTypeSel.value === 'donut') {
        container.innerHTML = donutChart(rows, opts.donutTotal ?? total, { dim });
      } else {
        container.innerHTML = barChart(rows, total, opts.barOpts || {});
      }
    }

    function passesDateFilter(tk) {
      if (!dateFromEl.value && !dateToEl.value) return true;
      const created = new Date(tk.created_at.replace(' ', 'T') + 'Z').getTime();
      if (dateFromEl.value && created < new Date(`${dateFromEl.value}T00:00:00Z`).getTime()) return false;
      if (dateToEl.value && created > new Date(`${dateToEl.value}T23:59:59Z`).getTime()) return false;
      return true;
    }

    function renderAll() {
      const teamId = teamSel.value ? Number(teamSel.value) : null;
      const memberId = memberSel.value ? Number(memberSel.value) : null;
      const statusVal = statusSel.value;
      const typeVal = typeSel.value;
      const tickets = allTickets.filter((tk) =>
        (!teamId || tk.group_id === teamId) &&
        (!memberId || tk.assigned_to === memberId) &&
        (!statusVal || tk.status === statusVal) &&
        (!typeVal || tk.type === typeVal) &&
        passesDateFilter(tk));
      filteredTickets = tickets;
      exportCountEl.textContent = `${t('report_export_count_label')} ${tickets.length}`;
      const noGroupLabel = t('no_group_label');

      const groupCounts = new Map();
      tickets.forEach((tk) => {
        const key = groupLabel(tk) || noGroupLabel;
        groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
      });
      const volumeRows = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));

      const resolved = tickets.filter((tk) => tk.resolved_at);
      const avgByGroup = new Map();
      resolved.forEach((tk) => {
        const key = groupLabel(tk) || noGroupLabel;
        const hours = (new Date(tk.resolved_at.replace(' ', 'T') + 'Z') - new Date(tk.created_at.replace(' ', 'T') + 'Z')) / 3600000;
        if (!avgByGroup.has(key)) avgByGroup.set(key, []);
        avgByGroup.get(key).push(hours);
      });
      const avgRows = [...avgByGroup.entries()].map(([label, values]) => ({
        key: label, label, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, color: 'var(--warning)',
      })).sort((a, b) => b.value - a.value);

      const slaByGroup = new Map();
      resolved.filter((tk) => tk.sla_status).forEach((tk) => {
        const key = groupLabel(tk) || noGroupLabel;
        if (!slaByGroup.has(key)) slaByGroup.set(key, { met: 0, total: 0 });
        const entry = slaByGroup.get(key);
        entry.total += 1;
        if (tk.sla_status === 'on_track') entry.met += 1;
      });
      const slaRows = [...slaByGroup.entries()].map(([label, { met, total }]) => ({
        key: label, label, value: Math.round((met / total) * 100), color: 'var(--success)',
      })).sort((a, b) => b.value - a.value);

      const ratedTickets = tickets.filter((tk) => tk.rating);
      const csatByGroup = new Map();
      ratedTickets.forEach((tk) => {
        const key = groupLabel(tk) || noGroupLabel;
        if (!csatByGroup.has(key)) csatByGroup.set(key, []);
        csatByGroup.get(key).push(tk.rating);
      });
      const csatRows = [...csatByGroup.entries()].map(([label, values]) => ({
        key: label, label, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, color: '#f5a623',
      })).sort((a, b) => b.value - a.value);

      const agentCounts = new Map();
      tickets.forEach((tk) => {
        if (!tk.assignee_name) return;
        agentCounts.set(tk.assignee_name, (agentCounts.get(tk.assignee_name) || 0) + 1);
      });
      const agentRows = [...agentCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ key: label, label, value, color: 'var(--primary)' }));

      chartsEl.className = 'charts-row';
      chartsEl.innerHTML = `
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_volume_by_group')}</h3><div id="reportChartVolume"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_avg_resolution')}</h3><div id="reportChartAvg"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_sla_compliance')}</h3><div id="reportChartSla"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_load_by_agent')}</h3><div id="reportChartAgent"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_csat')}</h3><div id="reportChartCsat"></div></div>`;

      renderChart(document.getElementById('reportChartVolume'), 'report_volume', volumeRows, tickets.length, t('no_data'));
      renderChart(document.getElementById('reportChartAvg'), 'report_avg', avgRows, 0, t('no_resolved_yet'), { barOpts: { showPct: false, suffix: ' h' }, donutTotal: avgRows.reduce((a, r) => a + r.value, 0) });
      renderChart(document.getElementById('reportChartSla'), 'report_sla', slaRows, 0, t('no_group_sla_configured'), { barOpts: { showPct: false, suffix: '%' }, donutTotal: slaRows.reduce((a, r) => a + r.value, 0) });
      renderChart(document.getElementById('reportChartAgent'), 'report_agent', agentRows, tickets.length, t('no_assigned_tickets'));
      renderChart(document.getElementById('reportChartCsat'), 'report_csat', csatRows, 0, t('no_ratings_yet'), { barOpts: { showPct: false, suffix: ' /5' }, donutTotal: csatRows.reduce((a, r) => a + r.value, 0) });
    }

    teamSel.addEventListener('change', () => { populateMemberOptions(); renderAll(); });
    memberSel.addEventListener('change', renderAll);
    statusSel.addEventListener('change', renderAll);
    typeSel.addEventListener('change', renderAll);
    dateFromEl.addEventListener('change', renderAll);
    dateToEl.addEventListener('change', renderAll);
    chartTypeSel.addEventListener('change', renderAll);

    function buildExportRows() {
      return filteredTickets.map((tk) => ({
        [t('report_col_number')]: `#${tk.id}`,
        [t('report_col_subject')]: tk.subject,
        [t('report_col_type')]: typeLabels()[tk.type] || tk.type,
        [t('report_col_status')]: statusLabels()[tk.status] || tk.status,
        [t('report_col_priority')]: priorityLabels()[tk.priority] || tk.priority,
        [t('report_col_group')]: tk.group_name || t('no_group_label'),
        [t('report_col_requester')]: tk.creator_name,
        [t('report_col_requester_email')]: tk.creator_email,
        [t('report_col_assignee')]: tk.assignee_name || '',
        [t('report_col_created')]: tk.created_at,
        [t('report_col_resolved')]: tk.resolved_at || '',
        [t('report_col_resolution_hours')]: tk.resolved_at
          ? Math.round(((new Date(tk.resolved_at.replace(' ', 'T') + 'Z') - new Date(tk.created_at.replace(' ', 'T') + 'Z')) / 3600000) * 10) / 10
          : '',
        [t('report_col_sla')]: tk.sla_status ? (slaLabels()[tk.sla_status] || tk.sla_status) : '',
        [t('report_col_rating')]: tk.rating || '',
      }));
    }

    exportCsvBtn.addEventListener('click', () => {
      const rows = buildExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')].concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')));
      const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, exportFilename('report-ticket', 'csv'));
    });

    exportExcelBtn.addEventListener('click', async () => {
      const rows = buildExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const originalLabel = exportExcelBtn.innerHTML;
      exportExcelBtn.disabled = true;
      exportExcelBtn.innerHTML = `${icon('download')} ${t('loading')}`;
      try {
        if (!window.XLSX) await loadScriptOnce('vendor/xlsx.full.min.js');
        const sheet = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, sheet, t('nav_report'));
        window.XLSX.writeFile(wb, exportFilename('report-ticket', 'xlsx'));
      } catch {
        showToast(t('toast_export_failed'), 'error');
      } finally {
        exportExcelBtn.disabled = false;
        exportExcelBtn.innerHTML = originalLabel;
      }
    });

    renderAll();
  }

  async function renderAudit() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('eye')} ${t('nav_audit')}</h1>
          <p class="hint">${t('audit_hint')}</p>
        </div>
      </div>
      <div class="filters">
        <input type="date" id="auditDateFrom" title="${t('report_date_from')}" />
        <input type="date" id="auditDateTo" title="${t('report_date_to')}" />
        <select id="auditKindFilter">
          <option value="">${t('audit_filter_all')}</option>
          <option value="ticket">${t('audit_filter_ticket')}</option>
          <option value="admin">${t('audit_filter_admin')}</option>
        </select>
        <input type="search" id="auditSearch" placeholder="${t('audit_search_placeholder')}" style="flex:1 1 16rem" />
      </div>
      <div class="report-export-bar">
        <button type="button" id="auditExportCsvBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_csv')}</button>
        <button type="button" id="auditExportExcelBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_excel')}</button>
        <span class="hint" id="auditResultCount"></span>
      </div>
      <div id="auditList" class="spinner-row">${t('loading')}</div>`;

    const listEl = document.getElementById('auditList');
    const dateFromEl = document.getElementById('auditDateFrom');
    const dateToEl = document.getElementById('auditDateTo');
    const kindFilterEl = document.getElementById('auditKindFilter');
    const searchEl = document.getElementById('auditSearch');
    const resultCountEl = document.getElementById('auditResultCount');
    const exportCsvBtn = document.getElementById('auditExportCsvBtn');
    const exportExcelBtn = document.getElementById('auditExportExcelBtn');

    let currentEntries = [];
    let debounceTimer;

    function kindLabel(e) {
      if (e.kind === 'admin') return t('audit_kind_admin');
      if (e.kind === 'comment') return e.is_internal ? t('audit_kind_internal_note') : t('audit_kind_comment');
      return t('audit_kind_event');
    }
    function kindBadgeClass(e) {
      if (e.kind === 'admin') return 'badge-waiting_customer';
      return e.kind === 'comment' ? 'badge-in_progress' : 'badge-closed';
    }
    function applyKindFilter(entries) {
      const kind = kindFilterEl.value;
      if (!kind) return entries;
      return entries.filter((e) => (kind === 'admin' ? e.kind === 'admin' : e.kind !== 'admin'));
    }

    function renderList() {
      const filtered = applyKindFilter(currentEntries);
      resultCountEl.textContent = `${t('report_export_count_label')} ${filtered.length}`;
      if (!filtered.length) {
        listEl.className = '';
        listEl.innerHTML = `<div class="empty-state">${icon('inbox')}<span>${t('no_results')}</span></div>`;
        return;
      }
      listEl.className = 'audit-list';
      listEl.innerHTML = filtered.map((e) => `
        <div class="audit-row">
          <div class="audit-row-time">${formatDate(e.created_at)}</div>
          <div class="audit-row-body">
            <div class="audit-row-head">
              ${e.ticket_id
                ? `<a href="#/ticket/${e.ticket_id}" class="audit-row-ticket">#${e.ticket_id} ${escapeHtml(e.ticket_subject)}</a>`
                : `<span class="audit-row-ticket">${t('audit_kind_admin')}</span>`}
              <span class="badge ${kindBadgeClass(e)}">${kindLabel(e)}</span>
            </div>
            <p class="audit-row-message">${escapeHtml(e.message)}</p>
            <p class="hint">${t('by_label')} ${escapeHtml(e.actor_name || t('unassigned_label'))}</p>
          </div>
        </div>`).join('');
    }

    async function load() {
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      const params = new URLSearchParams();
      if (dateFromEl.value) params.set('from', dateFromEl.value);
      if (dateToEl.value) params.set('to', dateToEl.value);
      if (searchEl.value.trim()) params.set('q', searchEl.value.trim());
      try {
        const { entries } = await api(`/audit?${params.toString()}`);
        currentEntries = entries;
        renderList();
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    dateFromEl.addEventListener('change', load);
    dateToEl.addEventListener('change', load);
    kindFilterEl.addEventListener('change', renderList);
    searchEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 300);
    });

    function buildExportRows() {
      return applyKindFilter(currentEntries).map((e) => ({
        [t('audit_col_date')]: e.created_at,
        [t('audit_col_ticket')]: e.ticket_id ? `#${e.ticket_id}` : '',
        [t('audit_col_subject')]: e.ticket_subject || '',
        [t('audit_col_kind')]: kindLabel(e),
        [t('audit_col_actor')]: e.actor_name || '',
        [t('audit_col_message')]: e.message,
      }));
    }

    exportCsvBtn.addEventListener('click', () => {
      const rows = buildExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')].concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')));
      const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, exportFilename('audit-log', 'csv'));
    });

    exportExcelBtn.addEventListener('click', async () => {
      const rows = buildExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const originalLabel = exportExcelBtn.innerHTML;
      exportExcelBtn.disabled = true;
      exportExcelBtn.innerHTML = `${icon('download')} ${t('loading')}`;
      try {
        if (!window.XLSX) await loadScriptOnce('vendor/xlsx.full.min.js');
        const sheet = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, sheet, t('nav_audit'));
        window.XLSX.writeFile(wb, exportFilename('audit-log', 'xlsx'));
      } catch {
        showToast(t('toast_export_failed'), 'error');
      } finally {
        exportExcelBtn.disabled = false;
        exportExcelBtn.innerHTML = originalLabel;
      }
    });

    load();
  }

  function renderProfile() {
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('userCircle')} ${t('nav_profile')}</h1></div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('your_account_title')}</h3>
          <p><strong>${escapeHtml(state.user.name)}</strong></p>
          <p class="hint">${escapeHtml(state.user.email)}</p>
          <p><span class="role-tag">${roleLabels()[state.user.role] || state.user.role}</span></p>
        </div>
        ${isStaff() ? `<div class="card" id="managerCard"></div><div class="card" id="reportsCard"></div>` : ''}
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('lock')} ${t('change_password_title')}</h3>
          <form id="pwForm" class="form-grid" style="max-width:none">
            <div class="field">
              <label for="currentPassword">${t('current_password_label')}</label>
              <input id="currentPassword" type="password" required autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="newPassword">${t('new_password_label')}</label>
              <input id="newPassword" type="password" required minlength="8" autocomplete="new-password" />
            </div>
            <div class="field">
              <label for="newPassword2">${t('confirm_new_password_label')}</label>
              <input id="newPassword2" type="password" required minlength="8" autocomplete="new-password" />
            </div>
            <p class="error-text" id="pwError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_update_password')}</button></div>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('userCircle')} ${t('change_email_title')}</h3>
          <form id="emailForm" class="form-grid" style="max-width:none">
            <div class="field">
              <label for="currentPasswordForEmail">${t('current_password_label')}</label>
              <input id="currentPasswordForEmail" type="password" required autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="newEmail">${t('new_email_label')}</label>
              <input id="newEmail" type="email" required autocomplete="email" />
            </div>
            <p class="error-text" id="emailError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_update_email')}</button></div>
          </form>
        </div>
      </div>`;

    if (isStaff()) {
      api('/users').then(({ users }) => {
        const me = users.find((u) => u.id === state.user.id);
        const reports = users.filter((u) => u.manager_id === state.user.id);
        const managerCard = document.getElementById('managerCard');
        if (managerCard) {
          managerCard.innerHTML = `
            <h3 class="section-title" style="margin-top:0">${t('manager_label')}</h3>
            <p>${me && me.manager_name ? escapeHtml(me.manager_name) : t('no_manager_label')}</p>
            ${me && me.is_external ? `<span class="role-tag role-tag-external">${t('external_badge')}</span>` : ''}`;
        }
        const reportsCard = document.getElementById('reportsCard');
        if (reportsCard) {
          reportsCard.innerHTML = `
            <h3 class="section-title" style="margin-top:0">${t('direct_reports_title')}</h3>
            ${reports.length ? `<ul class="plain-list">${reports.map((r) => `<li>${escapeHtml(r.name)} · ${roleLabels()[r.role] || r.role}${groupLabel(r) ? ' · ' + escapeHtml(groupLabel(r)) : ''}</li>`).join('')}</ul>` : `<p class="hint">${t('no_direct_reports')}</p>`}`;
        }
      }).catch(() => {});
    }

    guardForm(document.getElementById('pwForm'), async (e) => {
      const errEl = document.getElementById('pwError');
      errEl.textContent = '';
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const newPassword2 = document.getElementById('newPassword2').value;
      if (newPassword !== newPassword2) {
        errEl.textContent = t('passwords_dont_match');
        return;
      }
      try {
        await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
        showToast(t('toast_password_updated'), 'success');
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
        showToast(t('toast_email_updated'), 'success');
        renderProfile();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function renderSettings() {
    const currentLang = getLang();
    const currentAccent = getAccent();
    const isAdmin = state.user && state.user.role === 'admin';
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('plug')} ${t('settings_title')}</h1></div>
      <div class="admin-grid">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('settings_language_title')}</h3>
          <p class="hint">${t('settings_lang_hint')}</p>
          <div class="field">
            <label for="langSel">${t('settings_language_title')}</label>
            <select id="langSel">
              ${Object.entries(LANG_LABELS).map(([v, l]) => `<option value="${v}" ${currentLang === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('personalization_title')}</h3>
          <p class="hint">${t('personalization_hint')}</p>
          <div class="accent-swatches">
            ${Object.entries(ACCENT_PRESETS).map(([key, preset]) => `
              <button type="button" class="accent-swatch ${currentAccent === key ? 'active' : ''}" data-accent="${key}" style="background:${preset.primary}" title="${escapeHtml(preset.label)}"></button>
            `).join('')}
          </div>
          <label class="checkbox-field" style="margin-top:1rem">
            <input type="checkbox" id="motionToggle" ${getMotionPref() === 'full' ? 'checked' : ''} />
            ${t('motion_fluid_label')}
          </label>
          ${desktopNotifSupported() ? `
          <label class="checkbox-field" style="margin-top:0.6rem">
            <input type="checkbox" id="desktopNotifToggle" ${desktopNotifEnabled() ? 'checked' : ''} />
            ${t('desktop_notif_label')}
          </label>
          <p class="hint" id="desktopNotifHint">${t('desktop_notif_hint')}</p>` : ''}
        </div>
        ${isAdmin ? `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('shield')} ${t('org_section_title')}</h3>
          <p class="hint">${t('org_section_hint')}</p>
          <form id="orgForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="orgName">${t('field_org_name')}</label><input id="orgName" required /></div>
            <div><button class="btn btn-sm" type="submit">${t('btn_save')}</button></div>
          </form>
          <p class="error-text" id="orgError"></p>
          <div class="divider"></div>
          <div class="field">
            <label for="orgLogoInput">${t('field_org_logo')}</label>
            <div style="display:flex;align-items:center;gap:0.85rem">
              <img id="orgLogoPreview" src="img/icon.svg" alt="" width="44" height="44" style="border-radius:8px;object-fit:contain;background:var(--surface-alt)" />
              <input id="orgLogoInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" />
              <button type="button" id="orgLogoRemoveBtn" class="btn btn-sm btn-outline-danger" hidden>${t('btn_remove_logo')}</button>
            </div>
            <span class="hint">${t('logo_hint')}</span>
          </div>
          <p class="error-text" id="orgLogoError"></p>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('mail')} ${t('invite_email_title')}</h3>
          <p class="hint">${t('invite_email_hint')} <code>{{name}}</code>, <code>{{email}}</code>, <code>{{password}}</code>, <code>{{org}}</code>.</p>
          <div class="tab-row" id="inviteTemplateTabs">
            <button type="button" class="tab-btn active" data-locale="it">${LANG_LABELS.it}</button>
            <button type="button" class="tab-btn" data-locale="en">${LANG_LABELS.en}</button>
          </div>
          <form id="inviteTemplateForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="inviteSubject">${t('field_subject')}</label><input id="inviteSubject" placeholder="${t('placeholder_default')}" /></div>
            <div class="field"><label for="inviteBody">${t('field_email_body')}</label><textarea id="inviteBody" rows="6" placeholder="${t('placeholder_default')}"></textarea></div>
            <div><button class="btn btn-sm" type="submit">${t('btn_save_template')}</button></div>
          </form>
          <p class="error-text" id="inviteTemplateError"></p>
        </div>` : ''}
      </div>`;

    document.getElementById('langSel').addEventListener('change', (e) => {
      setLang(e.target.value);
      applyChromeTranslations();
      updateChrome();
      renderNotifDropdown();
      showToast(t('lang_updated'), 'success');
      route();
    });

    document.querySelectorAll('.accent-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        setAccent(btn.dataset.accent);
        document.querySelectorAll('.accent-swatch').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        showToast(t('toast_accent_updated'), 'success');
      });
    });

    document.getElementById('motionToggle').addEventListener('change', (e) => {
      setMotion(e.target.checked ? 'full' : 'reduced');
      showToast(t('toast_motion_updated'), 'success');
    });

    const desktopNotifToggle = document.getElementById('desktopNotifToggle');
    if (desktopNotifToggle) {
      desktopNotifToggle.addEventListener('change', async (e) => {
        const wanted = e.target.checked;
        const granted = await setDesktopNotifPref(wanted);
        e.target.checked = granted;
        if (wanted && !granted) {
          showToast(t('toast_desktop_notif_denied'), 'error');
        } else {
          showToast(granted ? t('toast_desktop_notif_enabled') : t('toast_desktop_notif_disabled'), 'success');
        }
      });
    }

    if (isAdmin) {
      const orgLogoPreview = document.getElementById('orgLogoPreview');
      const orgLogoRemoveBtn = document.getElementById('orgLogoRemoveBtn');
      api('/settings').then(({ orgName, orgLogo }) => {
        document.getElementById('orgName').value = orgName;
        if (orgLogo) {
          orgLogoPreview.src = orgLogo;
          orgLogoRemoveBtn.hidden = false;
        }
      }).catch(() => {});

      function resizeImageToDataUri(file, maxSize) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Lettura file fallita'));
          reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Immagine non valida'));
            img.onload = () => {
              const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/png'));
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(file);
        });
      }

      document.getElementById('orgLogoInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const errEl = document.getElementById('orgLogoError');
        errEl.textContent = '';
        try {
          const dataUri = await resizeImageToDataUri(file, 160);
          const { orgLogo } = await api('/settings/logo', { method: 'PATCH', body: { orgLogo: dataUri } });
          applyOrgLogo(orgLogo);
          if (orgLogo) localStorage.setItem('ticketing_org_logo', orgLogo);
          orgLogoPreview.src = orgLogo || 'img/icon.svg';
          orgLogoRemoveBtn.hidden = !orgLogo;
          showToast(t('toast_logo_updated'), 'success');
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      orgLogoRemoveBtn.addEventListener('click', async () => {
        try {
          await api('/settings/logo', { method: 'PATCH', body: { orgLogo: null } });
          applyOrgLogo(null);
          localStorage.removeItem('ticketing_org_logo');
          orgLogoPreview.src = 'img/icon.svg';
          orgLogoRemoveBtn.hidden = true;
          document.getElementById('orgLogoInput').value = '';
          showToast(t('toast_logo_removed'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      guardForm(document.getElementById('orgForm'), async () => {
        const errEl = document.getElementById('orgError');
        errEl.textContent = '';
        const name = document.getElementById('orgName').value.trim();
        if (!name) return;
        try {
          const { orgName } = await api('/settings', { method: 'PATCH', body: { orgName: name } });
          applyOrgName(orgName);
          localStorage.setItem('ticketing_org_name', orgName);
          showToast(t('toast_org_updated'), 'success');
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      let inviteTemplates = { it: { subject: '', body: '' }, en: { subject: '', body: '' } };
      let inviteTemplateLocale = 'it';
      api('/settings/invite-template').then((data) => {
        inviteTemplates = data;
        document.getElementById('inviteSubject').value = inviteTemplates.it.subject;
        document.getElementById('inviteBody').value = inviteTemplates.it.body;
      }).catch(() => {});

      document.querySelectorAll('#inviteTemplateTabs .tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#inviteTemplateTabs .tab-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          inviteTemplateLocale = btn.dataset.locale;
          document.getElementById('inviteSubject').value = inviteTemplates[inviteTemplateLocale].subject;
          document.getElementById('inviteBody').value = inviteTemplates[inviteTemplateLocale].body;
        });
      });

      guardForm(document.getElementById('inviteTemplateForm'), async () => {
        const errEl = document.getElementById('inviteTemplateError');
        errEl.textContent = '';
        const subject = document.getElementById('inviteSubject').value;
        const body = document.getElementById('inviteBody').value;
        try {
          await api('/settings/invite-template', { method: 'PATCH', body: { locale: inviteTemplateLocale, subject, body } });
          inviteTemplates[inviteTemplateLocale] = { subject, body };
          showToast(t('toast_template_updated'), 'success');
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }
  }

  function renderNotFound() {
    appEl.innerHTML = `<div class="card"><p>${t('not_found_text')} <a href="#/dashboard">${t('back_to_dashboard')}</a></p></div>`;
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
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloadedForUpdate || !hadController) return;
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
    showToast(t('toast_app_installed'), 'success');
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
      showToast(t('ios_install_hint'), '');
    }
  });

  applyAccent(getAccent());
  applyMotion(getMotionPref());
  applyChromeTranslations();
  updateChrome();
  loadOrgBranding();
  route();
})();
