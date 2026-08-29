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
  };

  const CATEGORY_ICON_CHOICES = ['ticket', 'wifi', 'globe', 'printer', 'mail', 'monitor', 'server', 'phone', 'grid', 'lock', 'shield', 'users'];

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
      nav_assets: 'Asset', nav_report: 'Report', nav_admin: 'Amministrazione', nav_profile: 'Profilo', logout: 'Esci',
      login_title: 'Accedi', login_hint: 'Entra nella piattaforma di ticketing.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Accedi', login_no_account: 'Non hai un account?', login_register_link: 'Registrati',
      register_title: 'Crea un account', register_submit: 'Registrati',
      register_has_account: 'Hai già un account?', register_login_link: 'Accedi',
      dashboard_title_staff: 'Tutti i ticket', dashboard_title_customer: 'I miei ticket',
      dashboard_hint_staff: 'Gestisci e rispondi alle richieste di assistenza.',
      dashboard_hint_customer: 'Consulta lo stato delle tue richieste.',
      new_ticket_btn: 'Nuovo ticket',
      status_open: 'Aperto', status_in_progress: 'In lavorazione', status_resolved: 'Risolto', status_closed: 'Chiuso',
      priority_low: 'Bassa', priority_medium: 'Media', priority_high: 'Alta', priority_urgent: 'Urgente',
      type_incident: 'Incident', type_task: 'Task',
      sla_on_track: 'SLA in linea', sla_at_risk: 'SLA a rischio', sla_breached: 'SLA superata',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Telefono', asset_type_other: 'Altro',
      asset_status_available: 'Disponibile', asset_status_in_use: 'In uso', asset_status_repair: 'In riparazione', asset_status_retired: 'Dismesso',
      role_customer: 'Cliente', role_agent: 'Agente', role_admin: 'Amministratore',
      filter_all_types: 'Tutti i tipi', filter_all_statuses: 'Tutti gli stati', filter_all_priorities: 'Tutte le priorità',
      filter_all_assignees: 'Tutti gli assegnatari', filter_assigned_me: 'Assegnati a me', filter_unassigned: 'Non assegnati',
      search_placeholder_staff: 'Cerca per testo, numero ticket o richiedente...', search_placeholder_customer: 'Cerca per testo o numero ticket...',
      stat_open: 'Aperti', stat_in_progress: 'In lavorazione', stat_resolved: 'Risolti', stat_urgent: 'Urgenti aperti',
      stat_incidents: 'Incident', stat_tasks: 'Task',
      personal_counter_staff: 'Assegnati a te, ancora aperti', personal_counter_customer: 'Tuoi ticket in corso',
      chart_title: 'Grafico', chart_distribution: 'Distribuzione', chart_total: 'Totale',
      chart_mine_title: 'I miei ticket', chart_team_title: 'Il mio team', chart_no_team: 'Non fai parte di nessun gruppo',
      dim_status: 'Stato', dim_sla: 'SLA', dim_priority: 'Priorità', dim_type: 'Tipo', dim_category: 'Categoria', dim_assigned: 'Assegnatario',
      auto_update: 'Aggiornamento automatico', auto_update_on: 'Aggiornamento automatico attivo', impersonate: 'Immedesimati',
      btn_save: 'Salva', btn_cancel: 'Annulla', btn_delete: 'Elimina', btn_add: 'Aggiungi', btn_search: 'Cerca',
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
      assets_hint: 'Inventario dispositivi, assegnazioni permanenti e prestiti.', new_asset_title: 'Nuovo asset',
      field_name: 'Nome', field_tag: 'Tag/matricola', btn_add_asset: 'Aggiungi asset',
      table_type: 'Tipo', table_tag: 'Tag', table_status: 'Stato', table_assignment: 'Assegnazione', table_due_date: 'Scadenza',
      assignment_permanent: 'Permanente', assignment_loan: 'Prestito', none_option: 'Nessuno', no_assets_found: 'Nessun asset trovato.',
      toast_asset_status_updated: 'Stato asset aggiornato', toast_assignment_updated: 'Assegnazione aggiornata',
      toast_assignee_updated: 'Assegnatario aggiornato', toast_due_date_updated: 'Scadenza aggiornata',
      confirm_delete_asset: 'Eliminare questo asset?', toast_asset_deleted: 'Asset eliminato', delete_asset_title: 'Elimina asset',
      search_hint: 'Cerca per numero ticket, parola chiave o richiedente: i risultati compaiono mentre scrivi.',
      search_placeholder_full: 'Numero ticket, parola chiave, richiedente...', all_groups_option: 'Tutti i gruppi',
      report_hint: 'Volumi, tempi di risoluzione e rispetto SLA per gruppo e per agente.',
      chart_volume_by_group: 'Volume ticket per gruppo', chart_avg_resolution: 'Tempo medio di risoluzione (ore) per gruppo',
      chart_sla_compliance: 'SLA rispettata per gruppo (%)', chart_load_by_agent: 'Carico ticket per agente',
      no_data: 'Nessun dato.', no_resolved_yet: 'Nessun ticket risolto ancora.',
      no_group_sla_configured: 'Nessun gruppo con SLA configurata.', no_assigned_tickets: 'Nessun ticket assegnato.',
      no_group_label: 'Senza gruppo',
      filter_all_teams: 'Tutti i team', filter_all_members: 'Tutti i membri', report_chart_type_label: 'Tipo di grafico',
      chart_type_bar: 'A barre', chart_type_donut: 'A ciambella',
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
      field_category_name: 'Nome categoria', field_icon: 'Icona', field_default_team: 'Team predefinito', option_none: 'Nessuno', btn_add: 'Aggiungi',
      admin_groups_title: 'Gruppi di assegnazione', admin_groups_hint: 'Ogni gruppo ha un proprio SLA (ore per risposta/risoluzione) e orario di lavoro: fuori da quella fascia, e nel weekend, l\'SLA resta in pausa e riprende al turno successivo.',
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
      field_category: 'Categoria', field_subject_placeholder: 'Un breve titolo per il problema', field_urgency: 'Quanto è urgente?',
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
      status_open: 'Open', status_in_progress: 'In progress', status_resolved: 'Resolved', status_closed: 'Closed',
      priority_low: 'Low', priority_medium: 'Medium', priority_high: 'High', priority_urgent: 'Urgent',
      type_incident: 'Incident', type_task: 'Task',
      sla_on_track: 'SLA on track', sla_at_risk: 'SLA at risk', sla_breached: 'SLA breached',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Phone', asset_type_other: 'Other',
      asset_status_available: 'Available', asset_status_in_use: 'In use', asset_status_repair: 'Under repair', asset_status_retired: 'Retired',
      role_customer: 'Customer', role_agent: 'Agent', role_admin: 'Administrator',
      filter_all_types: 'All types', filter_all_statuses: 'All statuses', filter_all_priorities: 'All priorities',
      filter_all_assignees: 'All assignees', filter_assigned_me: 'Assigned to me', filter_unassigned: 'Unassigned',
      search_placeholder_staff: 'Search by text, ticket number or requester...', search_placeholder_customer: 'Search by text or ticket number...',
      stat_open: 'Open', stat_in_progress: 'In progress', stat_resolved: 'Resolved', stat_urgent: 'Open urgent',
      stat_incidents: 'Incidents', stat_tasks: 'Tasks',
      personal_counter_staff: 'Assigned to you, still open', personal_counter_customer: 'Your ongoing tickets',
      chart_title: 'Chart', chart_distribution: 'Distribution', chart_total: 'Total',
      chart_mine_title: 'My tickets', chart_team_title: 'My team', chart_no_team: 'You are not part of any group',
      dim_status: 'Status', dim_sla: 'SLA', dim_priority: 'Priority', dim_type: 'Type', dim_category: 'Category', dim_assigned: 'Assignee',
      auto_update: 'Auto update', auto_update_on: 'Auto update active', impersonate: 'View as',
      btn_save: 'Save', btn_cancel: 'Cancel', btn_delete: 'Delete', btn_add: 'Add', btn_search: 'Search',
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
      assets_hint: 'Device inventory, permanent assignments and loans.', new_asset_title: 'New asset',
      field_name: 'Name', field_tag: 'Tag/asset number', btn_add_asset: 'Add asset',
      table_type: 'Type', table_tag: 'Tag', table_status: 'Status', table_assignment: 'Assignment', table_due_date: 'Due date',
      assignment_permanent: 'Permanent', assignment_loan: 'Loan', none_option: 'None', no_assets_found: 'No assets found.',
      toast_asset_status_updated: 'Asset status updated', toast_assignment_updated: 'Assignment updated',
      toast_assignee_updated: 'Assignee updated', toast_due_date_updated: 'Due date updated',
      confirm_delete_asset: 'Delete this asset?', toast_asset_deleted: 'Asset deleted', delete_asset_title: 'Delete asset',
      search_hint: 'Search by ticket number, keyword or requester: results appear as you type.',
      search_placeholder_full: 'Ticket number, keyword, requester...', all_groups_option: 'All groups',
      report_hint: 'Volumes, resolution times and SLA compliance by group and agent.',
      chart_volume_by_group: 'Ticket volume by group', chart_avg_resolution: 'Average resolution time (hours) by group',
      chart_sla_compliance: 'SLA compliance by group (%)', chart_load_by_agent: 'Ticket load by agent',
      no_data: 'No data.', no_resolved_yet: 'No resolved tickets yet.',
      no_group_sla_configured: 'No group with SLA configured.', no_assigned_tickets: 'No assigned tickets.',
      no_group_label: 'No group',
      filter_all_teams: 'All teams', filter_all_members: 'All members', report_chart_type_label: 'Chart type',
      chart_type_bar: 'Bar', chart_type_donut: 'Donut',
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
      field_category_name: 'Category name', field_icon: 'Icon', field_default_team: 'Default team', option_none: 'None', btn_add: 'Add',
      admin_groups_title: 'Assignment groups', admin_groups_hint: 'Each group has its own SLA (response/resolution hours) and working hours: outside that window, and on weekends, the SLA pauses and resumes on the next shift.',
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
      field_category: 'Category', field_subject_placeholder: 'A short title for the issue', field_urgency: 'How urgent is it?',
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
  const NAV_ICON_BY_ROUTE = {
    dashboard: 'ticket', new: 'plus', search: 'inbox', backlog: 'check',
    assets: 'monitor', report: 'activity', admin: 'shield', profile: 'userCircle',
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
    document.body.classList.remove('role-customer', 'role-agent', 'role-admin');
    if (state.user) {
      document.body.classList.add(`role-${state.user.role}`);
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
    state.viewAs = { id: user.id, name: user.name, role: user.role };
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
      const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0, incident: 0, task: 0 };
      tickets.forEach((tk) => {
        counts[tk.status] = (counts[tk.status] || 0) + 1;
        counts[tk.type] = (counts[tk.type] || 0) + 1;
        if (tk.priority === 'urgent' && tk.status !== 'closed' && tk.status !== 'resolved') counts.urgent += 1;
      });
      statsEl.innerHTML = `
        <button type="button" class="stat-card accent-open" data-status="open"><div class="stat-value">${counts.open}</div><div class="stat-label">${t('stat_open')}</div></button>
        <button type="button" class="stat-card accent-in_progress" data-status="in_progress"><div class="stat-value">${counts.in_progress}</div><div class="stat-label">${t('stat_in_progress')}</div></button>
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
        const order = ['open', 'in_progress', 'resolved', 'closed'];
        const colors = { open: 'var(--success)', in_progress: 'var(--warning)', resolved: 'var(--type-task)', closed: 'var(--muted)' };
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
        const { tickets } = await api(`/tickets?${params.toString()}`);
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

  function ticketCardHtml(tk) {
    const countdown = formatSlaCountdown(tk.sla_remaining_ms);
    return `
      <a class="ticket-card prio-${tk.priority}" href="#/ticket/${tk.id}">
        <div class="badges">
          <span class="badge badge-type-${tk.type}">${icon(tk.type, 'badge-icon')}${typeLabels()[tk.type] || tk.type}</span>
          <span class="badge badge-${tk.status}">${statusLabels()[tk.status]}</span>
          <span class="badge badge-${tk.priority}">${priorityLabels()[tk.priority]}</span>
          ${tk.sla_status && tk.sla_status !== 'on_track' ? `<span class="badge badge-sla-${tk.sla_status}">${slaLabels()[tk.sla_status]}</span>` : ''}
          ${countdown ? `<span class="badge badge-sla-countdown">${icon('activity', 'badge-icon')}${countdown}</span>` : ''}
        </div>
        <h3>#${tk.id} ${escapeHtml(tk.subject)}</h3>
        <p class="ticket-desc">${escapeHtml(tk.description)}</p>
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

  function renderTicketList(container, tickets) {
    if (!tickets.length) {
      container.className = '';
      container.innerHTML = `<div class="empty-state">${icon('inbox')}<span>${t('no_tickets_found')}</span></div>`;
      return;
    }
    container.className = 'ticket-grid';
    container.innerHTML = tickets.map(ticketCardHtml).join('');
    wireTicketCardActions(container);
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
          <h1>${icon('plus')} ${t('new_ticket_title')}</h1>
          <p class="hint">${t('new_ticket_hint')}</p>
        </div>
      </div>
      <div class="card" style="max-width:560px">
        <form id="newTicketForm" class="form-grid">
          <div class="field">
            <label for="type">${t('field_request_type')}</label>
            <select id="type">
              <option value="incident">${typeLabels().incident} ${t('type_incident_suffix')}</option>
              <option value="task">${typeLabels().task} ${t('type_task_suffix')}</option>
            </select>
          </div>
          <div class="field">
            <label>${t('field_category')}</label>
            <div id="categoryPicker" class="category-picker">
              ${categories.map((c, i) => `
                <button type="button" class="category-choice ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(c.name)}">
                  ${icon(c.icon || 'ticket')}
                  <span>${escapeHtml(c.name)}</span>
                </button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label for="subject">${t('field_subject')}</label>
            <input id="subject" type="text" required maxlength="200" placeholder="${t('field_subject_placeholder')}" />
          </div>
          <div class="field">
            <label for="priority">${t('field_urgency')}</label>
            <select id="priority">
              ${Object.entries(priorityLabels()).map(([v, l]) => `<option value="${v}" ${v === 'medium' ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
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

    let selectedCategory = categories[0] ? categories[0].name : '';
    document.querySelectorAll('.category-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-choice').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategory = btn.dataset.category;
      });
    });

    guardForm(document.getElementById('newTicketForm'), async () => {
      const errEl = document.getElementById('newTicketError');
      errEl.textContent = '';
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: selectedCategory,
        priority: document.getElementById('priority').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value.trim(),
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

    const { ticket, activity } = data;
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
        <a class="btn btn-ghost" href="#/dashboard">${icon('arrowLeft')} ${t('back_to_list')}</a>
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
            ${canReopen ? `<button id="reopenBtn" class="btn btn-sm btn-ghost">${icon('refresh')} ${t('reopen_ticket')}</button>` : ''}
          </div>

          <div class="card">
            <h3 class="section-title" style="margin-top:0">${t('activity_title')}</h3>
            <div id="activityList">
              ${activity.length ? activity.map(renderActivityItem).join('') : `<p class="hint">${t('no_activity')}</p>`}
            </div>
            ${readOnly ? `<p class="hint">${t('readonly_no_comments')}</p>` : `
            <form id="commentForm" class="form-grid" style="max-width:none;margin-top:1rem">
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
        <div class="activity-event">
          ${icon('activity')}
          <span>${escapeHtml(item.message)}${item.actor_name ? ` — ${escapeHtml(item.actor_name)}` : ''}</span>
          <span class="activity-event-time">${formatDate(item.created_at)}</span>
        </div>`;
    }
    return `
      <div class="comment ${item.is_internal ? 'is-internal' : ''}">
        <div class="comment-head">
          <span>${escapeHtml(item.author_name)} (${roleLabels()[item.author_role] || item.author_role})${item.is_internal ? ' <span class="badge badge-internal">Nota interna</span>' : ''}</span>
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

          listEl.className = '';
          listEl.innerHTML = categories.length ? categories.map((c) => `
            <div class="category-row">
              <span class="category-row-icon">${icon(c.icon || 'ticket')}</span>
              <span class="category-row-name">${escapeHtml(c.name)}</span>
              <select class="categoryGroupSel" data-id="${c.id}">${groupOptionsHtml(groups, c.default_group_id, t('option_none'))}</select>
              <button type="button" class="icon-btn deleteCategoryBtn" data-id="${c.id}" title="${t('delete_category_title')}">${icon('trash')}</button>
            </div>`).join('') : `<p class="hint">${t('no_categories_hint')}</p>`;

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
            },
          });
          input.value = '';
          showToast(t('toast_category_added'), 'success');
          loadCategories();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadCategories();
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
    try { groups = (await api('/groups')).groups; } catch { groups = []; }

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
        <select id="reportChartType">
          <option value="bar">${t('chart_type_bar')}</option>
          <option value="donut">${t('chart_type_donut')}</option>
        </select>
      </div>
      <div id="reportCharts" class="charts-row spinner-row">${t('loading')}</div>`;

    const chartsEl = document.getElementById('reportCharts');
    const teamSel = document.getElementById('reportTeam');
    const memberSel = document.getElementById('reportMember');
    const chartTypeSel = document.getElementById('reportChartType');

    let allTickets = [];
    let groups = [];
    let staffUsers = [];
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

    function renderAll() {
      const teamId = teamSel.value ? Number(teamSel.value) : null;
      const memberId = memberSel.value ? Number(memberSel.value) : null;
      const tickets = allTickets.filter((tk) =>
        (!teamId || tk.group_id === teamId) && (!memberId || tk.assigned_to === memberId));
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
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_load_by_agent')}</h3><div id="reportChartAgent"></div></div>`;

      renderChart(document.getElementById('reportChartVolume'), 'report_volume', volumeRows, tickets.length, t('no_data'));
      renderChart(document.getElementById('reportChartAvg'), 'report_avg', avgRows, 0, t('no_resolved_yet'), { barOpts: { showPct: false, suffix: ' h' }, donutTotal: avgRows.reduce((a, r) => a + r.value, 0) });
      renderChart(document.getElementById('reportChartSla'), 'report_sla', slaRows, 0, t('no_group_sla_configured'), { barOpts: { showPct: false, suffix: '%' }, donutTotal: slaRows.reduce((a, r) => a + r.value, 0) });
      renderChart(document.getElementById('reportChartAgent'), 'report_agent', agentRows, tickets.length, t('no_assigned_tickets'));
    }

    teamSel.addEventListener('change', () => { populateMemberOptions(); renderAll(); });
    memberSel.addEventListener('change', renderAll);
    chartTypeSel.addEventListener('change', renderAll);

    renderAll();
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
