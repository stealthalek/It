(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('ticketing_token') || null,
    user: null,
    viewAs: null,
    adminSection: null,
  };

  let dashboardAutoTimer = null;
  function teardownDashboardAutoUpdate() {
    if (dashboardAutoTimer) {
      clearInterval(dashboardAutoTimer);
      dashboardAutoTimer = null;
    }
  }

  let adminSystemStatusTimer = null;
  let systemStatusHistory = [];
  function teardownAdminSystemStatusPolling() {
    if (adminSystemStatusTimer) {
      clearInterval(adminSystemStatusTimer);
      adminSystemStatusTimer = null;
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
  const sidebarSystemStatus = document.getElementById('sidebarSystemStatus');
  if (sidebarSystemStatus) {
    sidebarSystemStatus.addEventListener('click', () => { state.adminSection = 'system'; });
  }

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
  function impactLabels() {
    return { low: t('impact_low'), medium: t('impact_medium'), high: t('impact_high') };
  }
  function typeLabels() {
    return { incident: t('type_incident'), task: t('type_task') };
  }
  function slaLabels() {
    return { on_track: t('sla_on_track'), at_risk: t('sla_at_risk'), breached: t('sla_breached') };
  }
  const DEVICE_REQUEST_TYPES = {
    problem: { type: 'incident' },
    new_device: { type: 'task' },
    replacement: { type: 'task' },
    loan: { type: 'task' },
    lost_stolen: { type: 'incident', priority: 'high' },
  };
  function deviceRequestTypeLabels() {
    return {
      problem: t('device_request_type_problem'),
      new_device: t('device_request_type_new_device'),
      replacement: t('device_request_type_replacement'),
      loan: t('device_request_type_loan'),
      lost_stolen: t('device_request_type_lost_stolen'),
    };
  }
  function categoryIsDeviceRelated(categories, categoryName) {
    const cat = categories.find((c) => c.name === categoryName);
    if (!cat) return false;
    if (!cat.parent_id) return cat.name === 'Hardware';
    const parent = categories.find((c) => c.id === cat.parent_id);
    return !!parent && parent.name === 'Hardware';
  }
  function formatTicketNumber(id) {
    return `TCK-${String(id).padStart(6, '0')}`;
  }
  function assetTypeLabels() {
    return { laptop: t('asset_type_laptop'), desktop: t('asset_type_desktop'), monitor: t('asset_type_monitor'), telefono: t('asset_type_phone'), tablet: t('asset_type_tablet'), altro: t('asset_type_other') };
  }
  function assetStatusLabels() {
    return { disponibile: t('asset_status_available'), in_uso: t('asset_status_in_use'), in_riparazione: t('asset_status_repair'), dismesso: t('asset_status_retired') };
  }
  function roleLabels() {
    return { customer: t('role_customer'), agent: t('role_agent'), admin: t('role_admin') };
  }
  function onboardingStatusLabels() {
    return { open: t('onboarding_status_open'), in_progress: t('onboarding_status_in_progress'), completed: t('onboarding_status_completed'), cancelled: t('onboarding_status_cancelled') };
  }
  function onboardingItemStatusLabels() {
    return { pending: t('onboarding_item_pending'), in_progress: t('onboarding_status_in_progress'), done: t('onboarding_item_done'), skipped: t('onboarding_item_skipped') };
  }
  function onboardingKindLabels() {
    return { checkbox: t('onboarding_kind_checkbox'), license: t('onboarding_kind_license'), copy_user: t('onboarding_kind_copy_user'), asset: t('onboarding_kind_asset') };
  }
  function ideaStatusLabels() {
    return {
      new: t('idea_status_new'),
      under_review: t('idea_status_under_review'),
      planned: t('idea_status_planned'),
      implemented: t('idea_status_implemented'),
      rejected: t('idea_status_rejected'),
    };
  }

  const ICON_PATHS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
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
    arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
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
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    creditCard: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
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

  function parseUserImportCsv(text) {
    const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const splitLine = (line) => {
      const cells = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
          else if (c === '"') { inQuotes = false; }
          else cur += c;
        } else if (c === '"') {
          inQuotes = true;
        } else if (c === ',' || c === ';') {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    };
    const header = splitLine(lines[0]).map((h) => h.toLowerCase());
    const colIndex = (names) => names.map((n) => header.indexOf(n)).find((i) => i !== -1);
    const nameCol = colIndex(['name', 'nome']);
    const emailCol = colIndex(['email']);
    const roleCol = colIndex(['role', 'ruolo']);
    const groupCol = colIndex(['group', 'gruppo', 'groupname']);
    const localeCol = colIndex(['locale', 'lingua']);
    if (nameCol === undefined || emailCol === undefined || roleCol === undefined) return [];
    return lines.slice(1).map((line) => {
      const cells = splitLine(line);
      const row = { name: cells[nameCol] || '', email: cells[emailCol] || '', role: (cells[roleCol] || '').toLowerCase() };
      if (groupCol !== undefined && cells[groupCol]) row.groupName = cells[groupCol];
      if (localeCol !== undefined && cells[localeCol]) row.locale = cells[localeCol].toLowerCase();
      return row;
    }).filter((r) => r.name || r.email);
  }

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

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function exportFilename(base, ext) {
    return `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function pctSeverity(pct) { return pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'ok'; }
  function dbLatencySeverity(ms) { return ms === null ? 'danger' : ms > 1500 ? 'danger' : ms > 600 ? 'warning' : 'ok'; }
  function eventLoopLagSeverity(ms) { return ms > 150 ? 'danger' : ms > 50 ? 'warning' : 'ok'; }
  function loadRatioSeverity(ratio) { return ratio > 1 ? 'danger' : ratio > 0.7 ? 'warning' : 'ok'; }

  function computeOverallSeverity(status) {
    const memPct = Math.min(100, Math.round((status.memory.rssMb / 512) * 100));
    const reqPct = Math.min(100, Math.round((status.requestWindow.windowCount / status.requestWindow.windowMax) * 100));
    const loadRatio = status.loadAvg1m / status.cpuCount;
    const severities = [
      pctSeverity(memPct),
      pctSeverity(reqPct),
      dbLatencySeverity(status.db.latencyMs),
      eventLoopLagSeverity(status.eventLoopLagMs),
      loadRatioSeverity(loadRatio),
    ];
    if (severities.includes('danger')) return 'danger';
    if (severities.includes('warning')) return 'warning';
    return 'ok';
  }

  function attachmentIconName(mimeType) {
    if (mimeType.startsWith('image/')) return 'monitor';
    if (mimeType === 'application/pdf') return 'inbox';
    if (mimeType === 'application/zip') return 'package';
    return 'file';
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

  function showMessagePopup(message) {
    const stack = document.getElementById('messagePopupStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'message-popup';
    el.innerHTML = `
      <div class="message-popup-icon">${icon('mail')}</div>
      <div class="message-popup-body">
        <strong class="message-popup-sender"></strong>
        <p class="message-popup-text"></p>
      </div>
      <button type="button" class="message-popup-close" aria-label="${t('close_btn')}">${icon('x')}</button>`;
    el.querySelector('.message-popup-sender').textContent = message.sender_name || '';
    el.querySelector('.message-popup-text').textContent = message.body || '';
    function dismiss() {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('.message-popup-close')) { dismiss(); return; }
      location.hash = `#/messages/${message.sender_id}`;
      dismiss();
    });
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(dismiss, 6000);
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
      nav_dashboard: 'Ticket', nav_new: 'Nuovo ticket', nav_search: 'Ricerca', nav_announcements: 'Bacheca', nav_directory: 'Rubrica', nav_messages: 'Messaggi',
      nav_section_work: 'Lavoro', nav_section_team: 'Team', nav_section_tools: 'Strumenti',
      directory_hint: 'Trova un collega per nome, ruolo o team.',
      send_message_btn: 'Messaggio', messages_inbox_hint: 'Le tue conversazioni dirette con i colleghi.',
      messages_you_prefix: 'Tu:', no_messages_yet: 'Nessun messaggio.',
      message_compose_placeholder: 'Scrivi un messaggio...', message_send_btn: 'Invia',
      message_ttl_hint: 'I messaggi vengono eliminati automaticamente dopo 14 giorni per non appesantire il server.',
      message_edited_label: 'modificato', message_edit_btn: 'Modifica messaggio', message_delete_btn: 'Elimina messaggio',
      message_edit_prompt: 'Modifica il messaggio', confirm_delete_message: 'Eliminare questo messaggio?',
      delete_conversation_title: 'Elimina chat', confirm_delete_conversation: 'Eliminare l\'intera chat con questa persona? Verranno rimossi tutti i messaggi in entrambe le direzioni, in modo permanente.',
      toast_conversation_deleted: 'Chat eliminata',
      confirm_bulk_delete_conversations_prefix: 'Eliminare definitivamente', confirm_bulk_delete_conversations_suffix: ' chat selezionate? Tutti i messaggi verranno rimossi in modo permanente.',
      toast_bulk_conversations_deleted: 'Chat eliminate',
      close_btn: 'Chiudi',
      leave_requests_hint: 'Richiedi ferie o permessi e tieni traccia delle tue richieste.',
      leave_new_request_title: 'Nuova richiesta', leave_field_type: 'Tipo', leave_field_start: 'Dal', leave_field_end: 'Al', leave_field_note: 'Motivo (facoltativo)',
      leave_submit_btn: 'Invia richiesta', leave_type_vacation: 'Ferie', leave_type_permit: 'Permesso',
      leave_status_pending: 'In attesa', leave_status_approved: 'Approvata', leave_status_rejected: 'Respinta',
      leave_my_requests_title: 'Le mie richieste', leave_team_title: 'Richieste del team', leave_none_found: 'Nessuna richiesta.',
      leave_cancel_btn: 'Ritira', leave_approve_btn: 'Approva', leave_reject_btn: 'Respingi', leave_review_note_label: 'Nota',
      toast_leave_request_created: 'Richiesta inviata', toast_leave_request_cancelled: 'Richiesta ritirata',
      toast_leave_request_approved: 'Richiesta approvata', toast_leave_request_rejected: 'Richiesta respinta',
      confirm_cancel_leave_request: 'Ritirare questa richiesta?',
      nav_rooms: 'Sale riunioni', rooms_hint: 'Prenota una sala riunioni e consulta le prenotazioni del giorno.',
      rooms_new_booking_title: 'Nuova prenotazione', rooms_field_room: 'Sala', rooms_field_title: 'Titolo riunione',
      rooms_field_start: 'Inizio', rooms_field_end: 'Fine', rooms_book_btn: 'Prenota',
      rooms_bookings_for: 'Prenotazioni', rooms_no_bookings: 'Nessuna prenotazione per questa sala.',
      rooms_cancel_btn: 'Annulla', rooms_no_rooms: 'Nessuna sala configurata.', rooms_capacity_label: 'posti',
      rooms_manage_title: 'Gestisci sale', rooms_field_room_name: 'Nome sala', rooms_field_location: 'Posizione (facoltativo)',
      rooms_field_capacity: 'Capienza (facoltativo)', rooms_add_room_btn: 'Aggiungi sala',
      toast_room_booked: 'Sala prenotata', toast_room_booking_cancelled: 'Prenotazione annullata',
      toast_room_created: 'Sala creata', toast_room_deleted: 'Sala eliminata',
      confirm_cancel_room_booking: 'Annullare questa prenotazione?', confirm_delete_room: 'Eliminare questa sala? Le prenotazioni collegate verranno rimosse.',
      delete_room_title: 'Elimina sala', rooms_col_name: 'Sala', rooms_col_location: 'Posizione', rooms_col_capacity: 'Capienza',
      nav_ideas: 'Bacheca idee', ideas_hint: 'Proponi un\'idea o vota quelle degli altri: le più votate salgono in cima.',
      ideas_new_title: 'Proponi un\'idea', ideas_field_title: 'Titolo', ideas_field_description: 'Descrizione (facoltativa)', ideas_submit_btn: 'Invia idea',
      ideas_list_title: 'Idee proposte', ideas_filter_all: 'Tutti gli stati', ideas_none: 'Nessuna idea per ora: proponi la prima!',
      ideas_vote_btn: 'Vota', ideas_delete_title: 'Elimina idea', confirm_delete_idea: 'Eliminare questa idea?',
      toast_idea_submitted: 'Idea inviata', toast_idea_deleted: 'Idea eliminata', toast_idea_status_updated: 'Stato idea aggiornato',
      idea_status_new: 'Nuova', idea_status_under_review: 'In valutazione', idea_status_planned: 'Pianificata', idea_status_implemented: 'Realizzata', idea_status_rejected: 'Non accolta',
      nav_wiki: 'Wiki interno', wiki_hint: 'Documentazione e procedure interne, consultabili da tutta l\'azienda.',
      wiki_new_page_btn: 'Nuova pagina', wiki_search_placeholder: 'Cerca una pagina...', wiki_field_title: 'Titolo', wiki_field_content: 'Contenuto',
      wiki_save_btn: 'Salva', wiki_none: 'Nessuna pagina ancora.', wiki_back_to_list: 'Torna al wiki', wiki_edit_btn: 'Modifica', wiki_delete_btn: 'Elimina',
      wiki_last_edited_by: 'Ultima modifica di', wiki_empty_page: 'Questa pagina non ha ancora contenuto.',
      confirm_delete_wiki_page: 'Eliminare questa pagina wiki?',
      toast_wiki_page_created: 'Pagina creata', toast_wiki_page_saved: 'Pagina salvata', toast_wiki_page_deleted: 'Pagina eliminata',
      nav_expenses: 'Note spese', expenses_hint: 'Invia una nota spese e segui lo stato di approvazione.',
      expense_new_title: 'Nuova nota spese', expense_field_description: 'Descrizione', expense_field_amount: 'Importo (€)', expense_field_date: 'Data spesa', expense_field_category: 'Categoria',
      expense_submit_btn: 'Invia nota spese', expense_mine_title: 'Le mie note spese', expense_team_title: 'Note spese del team',
      expense_none_found: 'Nessuna nota spese trovata.', expense_cancel_btn: 'Ritira', expense_approve_btn: 'Approva', expense_reject_btn: 'Respingi',
      expense_review_note_label: 'Nota del revisore', confirm_cancel_expense: 'Ritirare questa nota spese?',
      toast_expense_submitted: 'Nota spese inviata', toast_expense_cancelled: 'Nota spese ritirata', toast_expense_approved: 'Nota spese approvata', toast_expense_rejected: 'Nota spese respinta',
      expense_status_pending: 'In attesa', expense_status_approved: 'Approvata', expense_status_rejected: 'Respinta',
      expense_category_travel: 'Viaggio', expense_category_meals: 'Pasti', expense_category_accommodation: 'Alloggio', expense_category_supplies: 'Materiale', expense_category_other: 'Altro',
      nav_assets: 'Asset', nav_onboarding: 'Onboarding', nav_timesheet: 'Orari', nav_report: 'Report', nav_audit: 'Audit', nav_admin: 'Amministrazione', nav_profile: 'Profilo', logout: 'Esci',
      login_title: 'Accedi', login_hint: 'Entra nella piattaforma di ticketing.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Accedi', login_no_account: 'Non hai un account?', login_register_link: 'Registrati',
      twofa_login_title: 'Verifica in due passaggi', twofa_login_hint: 'Inserisci il codice a 6 cifre generato dalla tua app di autenticazione.',
      twofa_code_label: 'Codice di verifica', twofa_verify_submit: 'Verifica e accedi', twofa_back_link: 'Torna al login',
      twofa_settings_title: 'Autenticazione a due fattori', twofa_settings_hint_disabled: 'Aggiungi un livello di sicurezza in più: dopo la password ti verrà chiesto un codice generato da un\'app come Google Authenticator o Microsoft Authenticator.',
      twofa_settings_hint_enabled: 'Attiva. Per accedere ti verrà chiesto anche il codice dell\'app di autenticazione.',
      twofa_enable_button: 'Attiva 2FA', twofa_disable_button: 'Disattiva 2FA', twofa_enabled_badge: 'Attiva',
      twofa_secret_label: 'Codice segreto (inserimento manuale)', twofa_secret_hint: 'Apri la tua app di autenticazione, aggiungi un nuovo account e inserisci questo codice manualmente, oppure incolla l\'URI di configurazione.',
      twofa_confirm_code_label: 'Codice generato dall\'app', twofa_confirm_button: 'Conferma e attiva', twofa_cancel_button: 'Annulla',
      twofa_disable_password_label: 'Password attuale', twofa_disable_code_label: 'Codice dell\'app', twofa_disable_confirm_button: 'Conferma disattivazione',
      sessions_title: 'Sessioni attive', sessions_hint: 'Dispositivi e browser con accesso attivo al tuo account.',
      sessions_current_badge: 'Questo dispositivo', sessions_revoke_button: 'Termina', sessions_revoke_others_button: 'Termina tutte le altre sessioni',
      sessions_empty: 'Nessuna sessione attiva.', sessions_last_active_label: 'Ultima attività', sessions_created_label: 'Accesso effettuato',
      toast_2fa_enabled: 'Autenticazione a due fattori attivata', toast_2fa_disabled: 'Autenticazione a due fattori disattivata',
      toast_session_revoked: 'Sessione terminata', toast_sessions_revoked_others: 'Tutte le altre sessioni sono state terminate',
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
      response_sla_prefix: 'Prima risposta:',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Telefono', asset_type_tablet: 'Tablet', asset_type_other: 'Altro',
      asset_status_available: 'Disponibile', asset_status_in_use: 'In uso', asset_status_repair: 'In riparazione', asset_status_retired: 'Dismesso',
      role_customer: 'Cliente', role_agent: 'Agente', role_admin: 'Amministratore',
      filter_all_types: 'Tutti i tipi', filter_all_statuses: 'Tutti gli stati', filter_all_priorities: 'Tutte le priorità',
      onboarding_filter_active: 'Attivi',
      filter_chip_status: 'Stato', filter_chip_priority: 'Priorità', filter_chip_type: 'Tipo', filter_chip_remove_title: 'Rimuovi filtro',
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
      attachment_too_large: 'File troppo grande (max 50 MB)', toast_attachment_added: 'Allegato aggiunto', toast_attachment_deleted: 'Allegato eliminato',
      rating_title: 'Valutazione', rated_on_label: 'Valutato il', btn_edit_rating: 'Modifica valutazione',
      rating_comment_placeholder: 'Un commento facoltativo sul servizio ricevuto...', btn_submit_rating: 'Invia valutazione',
      rating_required_hint: 'Seleziona una valutazione da 1 a 5 stelle', toast_rating_submitted: 'Valutazione inviata, grazie!',
      loading: 'Caricamento...', no_results: 'Nessun risultato.', unassigned_label: 'Non assegnato',
      lang_updated: 'Lingua aggiornata', by_label: 'Di', assigned_to_label: 'Assegnato a', no_tickets_found: 'Nessun ticket trovato.',
      list_col_number: 'Numero', list_col_subject: 'Oggetto', list_col_requester: 'Richiedente', list_col_assignee: 'Assegnatario',
      list_col_group: 'Gruppo', list_col_priority: 'Priorità', list_col_status: 'Stato', list_col_updated: 'Aggiornato', list_unassigned: 'Non assegnato',
      list_col_resize_hint: 'Trascina per ridimensionare, doppio clic per ripristinare',
      back_to_list: 'Torna alla lista', edit_subject_desc: 'Modifica oggetto e descrizione',
      field_subject: 'Oggetto', field_description: 'Descrizione', btn_save_changes: 'Salva modifiche',
      created_by: 'Creato da', on_date: 'il', reopen_ticket: 'Riapri ticket',
      cancel_ticket_btn: 'Annulla richiesta', confirm_cancel_ticket: 'Annullare questa richiesta? Il ticket verrà chiuso.',
      activity_title: 'Attività', no_activity: 'Nessuna attività ancora.',
      readonly_no_comments: 'Modalità sola lettura: non è possibile inviare commenti.',
      add_comment_label: 'Aggiungi un commento', comment_placeholder: 'Scrivi una risposta...',
      internal_note_label: 'Nota interna (visibile solo allo staff)', btn_send: 'Invia',
      management_title: 'Gestione', field_group: 'Gruppo di assegnazione', field_linked_asset: 'Asset collegato',
      delete_ticket_btn: 'Elimina ticket', no_group_option: 'Nessun gruppo', no_asset_option: 'Nessun asset',
      group_search_placeholder: 'Cerca un gruppo…',
      confirm_delete_ticket: 'Eliminare definitivamente questo ticket?',
      ticket_cancelled_banner: 'Il ticket è stato cancellato.',
      toast_ticket_updated: 'Ticket aggiornato', toast_ticket_reopened: 'Ticket riaperto', toast_ticket_deleted: 'Ticket eliminato',
      toast_ticket_cancelled: 'Richiesta annullata',
      toast_comment_added: 'Commento aggiunto', new_message_toast: 'Nuovo messaggio nel ticket',
      presence_staff: 'Un tecnico sta seguendo questo ticket in questo momento',
      presence_customer: 'Il richiedente sta visualizzando questo ticket in questo momento',
      group_label_prefix: 'Gruppo', viewing_as_title: 'Vista di', viewing_as_hint: 'Stai visualizzando i ticket di questa persona in sola lettura.',
      viewas_banner_text: 'Stai vedendo la piattaforma come', viewas_readonly_suffix: 'sola lettura', viewas_exit: 'Esci dalla modalità',
      bulk_assign_placeholder: 'Assegna a...', bulk_status_placeholder: 'Cambia stato...', bulk_clear_selection: 'Deseleziona',
      bulk_selected_count: 'Selezionati:', toast_bulk_assigned: 'Ticket assegnati', toast_bulk_status_updated: 'Stato aggiornato sui ticket selezionati',
      bulk_delete_btn: 'Elimina selezionati', toast_bulk_deleted: 'Ticket eliminati',
      confirm_bulk_delete_tickets_prefix: 'Eliminare definitivamente', confirm_bulk_delete_tickets_suffix: ' ticket selezionati? L\'operazione non è reversibile.',
      filter_all_roles: 'Tutti i ruoli', filter_all_groups: 'Tutti i gruppi',
      page_prev: 'Precedente', page_next: 'Successivo',
      page_indicator_prefix: 'Pagina', page_indicator_of: 'di', page_indicator_results: 'risultati',
      bulk_user_role_placeholder: 'Cambia ruolo...', bulk_user_group_placeholder: 'Assegna a gruppo...',
      toast_bulk_user_updated: 'Utenti aggiornati', toast_bulk_users_deleted: 'Utenti eliminati',
      confirm_bulk_delete_users_prefix: 'Eliminare definitivamente', confirm_bulk_delete_users_suffix: ' utenti selezionati? L\'operazione non è reversibile.',
      bulk_assignment_placeholder: 'Cambia assegnazione...', bulk_tag_prefix_placeholder: 'es. ITA-', bulk_apply_prefix: 'Applica prefisso',
      toast_bulk_asset_updated: 'Asset selezionati aggiornati', toast_bulk_prefix_applied: 'Prefisso applicato agli asset selezionati',
      toast_bulk_assets_deleted: 'Asset eliminati',
      confirm_bulk_delete_assets_prefix: 'Eliminare definitivamente', confirm_bulk_delete_assets_suffix: ' asset selezionati? L\'operazione non è reversibile.',
      add_tag_placeholder: 'Aggiungi etichetta e premi invio',
      linked_tickets_title: 'Ticket collegati', link_ticket_placeholder: 'Numero ticket (es. 12)', btn_link_ticket: 'Collega',
      similar_tickets_title: 'Ticket simili', no_similar_tickets_hint: 'Nessun ticket simile trovato nella stessa categoria.', toast_ticket_linked: 'Ticket collegato',
      quick_jump_placeholder: 'Cerca ticket, persone, asset...', quick_jump_hint: 'Digita per cercare tra ticket, persone e asset.', quick_jump_empty: 'Nessun risultato.',
      quick_jump_tickets: 'Ticket', quick_jump_people: 'Persone', quick_jump_assets: 'Asset',
      no_linked_tickets_hint: 'Nessun ticket collegato.',
      btn_watch: 'Segui', btn_unwatch: 'Non seguire più', toast_now_watching: 'Ora segui questo ticket', toast_stopped_watching: 'Non segui più questo ticket',
      assets_hint: 'Inventario dispositivi, assegnazioni permanenti e prestiti.', new_asset_title: 'Nuovo asset',
      field_name: 'Nome', field_tag: 'Tag/matricola', btn_add_asset: 'Aggiungi asset',
      table_type: 'Tipo', table_tag: 'Tag', table_status: 'Stato', table_assignment: 'Assegnazione', table_due_date: 'Scadenza',
      assignment_permanent: 'Permanente', assignment_loan: 'Prestito', none_option: 'Nessuno', no_assets_found: 'Nessun asset trovato.',
      toast_asset_status_updated: 'Stato asset aggiornato', toast_assignment_updated: 'Assegnazione aggiornata',
      toast_asset_updated: 'Asset aggiornato', asset_name_required_error: 'Il nome dell\'asset è obbligatorio',
      toast_assignee_updated: 'Assegnatario aggiornato', toast_due_date_updated: 'Scadenza aggiornata',
      confirm_delete_asset: 'Eliminare questo asset?', toast_asset_deleted: 'Asset eliminato', delete_asset_title: 'Elimina asset',
      search_hint: 'Cerca per numero ticket, parola chiave o richiedente: i risultati compaiono mentre scrivi.',
      search_placeholder_full: 'Numero ticket, parola chiave, richiedente...', all_groups_option: 'Tutti i gruppi', all_tags_option: 'Tutte le etichette',
      filter_assigned_to_label: 'Assegnati a', filter_created_by_label: 'Aperti da', assets_assigned_title: 'Asset assegnati', no_assets_assigned: 'Nessun asset assegnato.',
      asset_letters_title: 'Lettere di assegnazione', no_asset_letters: 'Nessuna lettera di assegnazione.',
      asset_letter_pending_badge: 'Da firmare', asset_letter_signed_badge: 'Firmata',
      asset_letter_banner_one: 'Hai un asset da confermare: firma la lettera di assegnazione.',
      asset_letter_banner_many: 'Hai {n} asset da confermare: firma le lettere di assegnazione.',
      btn_review_and_sign: 'Vai alla firma',
      btn_sign_letter: 'Firma e accetto',
      asset_letter_signed_on: 'Firmata il',
      asset_letter_signed_by: 'da',
      field_full_name_sign: 'Nome e cognome (firma)',
      asset_letter_intro: 'Ti è stato assegnato il seguente dispositivo aziendale. Prima di poterlo utilizzare, ti chiediamo di leggere e firmare la lettera di assegnazione riportata di seguito.',
      asset_letter_body: 'Con la firma della presente, il sottoscritto dichiara di aver ricevuto il dispositivo sopra indicato in perfette condizioni di funzionamento e si impegna a: utilizzarlo esclusivamente per finalità lavorative, con la dovuta diligenza e nel rispetto delle policy aziendali; segnalare tempestivamente al Service Desk eventuali malfunzionamenti, danni, smarrimenti o furti; restituirlo, comprensivo di accessori, al termine del rapporto di lavoro, in caso di sostituzione o su richiesta dell\'azienda. La firma elettronica apposta di seguito ha valore di accettazione dei termini sopra descritti.',
      asset_letter_already_signed: 'Questa lettera è già stata firmata.',
      toast_letter_signed: 'Lettera firmata con successo',
      assets_search_placeholder: 'Cerca per nome o tag...',
      nav_insights: 'Report e Audit', insights_hint: 'Analisi delle prestazioni e traccia completa delle attività, in un unico posto.',
      report_hint: 'Volumi, tempi di risoluzione e rispetto SLA per gruppo e per agente.',
      chart_volume_by_group: 'Volume ticket per gruppo', chart_avg_resolution: 'Tempo medio di risoluzione (ore) per gruppo',
      chart_sla_compliance: 'SLA rispettata per gruppo (%)', chart_load_by_agent: 'Carico ticket per agente',
      chart_csat: 'Soddisfazione media per gruppo (su 5)', no_ratings_yet: 'Nessuna valutazione ancora.', report_col_rating: 'Valutazione',
      chart_ticket_trend: 'Andamento ticket nel tempo', trend_series_created: 'Creati', trend_series_resolved: 'Risolti',
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
      theme_mode_title: 'Aspetto', theme_mode_hint: 'Scegli l\'aspetto dell\'interfaccia.', theme_mode_light: 'Chiaro', theme_mode_dark: 'Scuro', theme_mode_auto: 'Sistema',
      cold_start_hint: 'Il server si sta risvegliando dopo un periodo di inattività, un momento...',
      admin_title: 'Amministrazione', access_denied: 'Accesso non consentito.', person_card_title: 'Scheda persona',
      org_open_tickets: 'aperti', org_sla_breach: 'in ritardo', org_node_hint: 'Clic per vedere i ticket del team',
      org_member_count: 'persone', org_no_manager: 'Nessun responsabile', org_toggle_branch: 'Espandi/comprimi ramo',
      org_drag_handle_hint: 'Trascina per spostare il team', org_add_child_title: 'Aggiungi sotto-team',
      toast_add_child_group_hint: 'Compila il nome: verrà creato sotto "{name}"',
      org_settings_toggle: 'Impostazioni team', org_expand_all: 'Espandi tutto', org_collapse_all: 'Comprimi tutto',
      org_settings_group_identity: 'Identità', org_settings_group_sla: 'SLA e orario',
      admin_create_staff_title: 'Crea account staff', admin_group_optional_label: 'Gruppo di assegnazione (opzionale)',
      admin_group_hint: 'I membri dello stesso gruppo si vedono a vicenda nell\'assegnazione dei ticket',
      admin_bulk_import_title: 'Importa utenti da CSV', admin_bulk_import_hint: 'Colonne: nome,email,ruolo (agent o admin), gruppo (facoltativo, nome esatto), locale (facoltativo, it o en).',
      admin_bulk_import_file_label: 'File CSV', admin_bulk_import_btn: 'Importa', admin_bulk_import_empty: 'Nessuna riga valida trovata nel file (verifica le colonne nome/email/ruolo).',
      admin_bulk_import_summary: '{created} creati, {failed} falliti.', admin_bulk_import_row_label: 'Riga', toast_bulk_import_done: 'Importazione completata',
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
      field_group_display_name: 'Nome visualizzato', field_group_display_name_placeholder: 'Usa il nome dell\'organizzazione',
      field_group_display_name_hint: 'Se impostato, sostituisce il nome dell\'organizzazione per i membri di questo gruppo e dei suoi sotto-gruppi.',
      toast_group_display_name_updated: 'Nome visualizzato aggiornato',
      field_group_name: 'Nome del team', toast_group_name_updated: 'Nome del team aggiornato',
      toast_group_deleted: 'Gruppo eliminato', toast_group_created: 'Gruppo creato', toast_default_team_updated: 'Team predefinito aggiornato',
      confirm_delete_user: 'Eliminare questo account?', toast_user_deleted: 'Account eliminato', delete_user_title: 'Elimina account',
      admin_delegate_hint: 'Accesso delegato: puoi gestire persone e/o gruppi in base ai permessi che ti sono stati assegnati.',
      admin_delegate_new_user_role_hint: 'Il nuovo account viene creato con ruolo Agente.',
      org_drop_root_hint: 'Trascina qui un gruppo per renderlo di primo livello', toast_group_reparented: 'Gruppo riorganizzato',
      toast_member_moved: 'Persona spostata di team', org_member_drag_hint: 'Trascina su un altro team per spostare la persona', org_no_members: 'Nessuna persona in questo team',
      assign_to_me_btn: 'Assegna a me', toast_ticket_assigned_to_you: 'Ticket assegnato a te',
      quick_resolve_btn: 'Chiudi ticket', toast_ticket_resolved_quick: 'Ticket chiuso',
      group_by_team_label: 'Raggruppa per team',
      widgets_section_title: 'Cruscotto di gestione', widgets_customize_btn: 'Personalizza',
      widgets_collapse_all_btn: 'Comprimi tutto', widgets_expand_all_btn: 'Espandi tutto', widget_collapse_toggle_title: 'Comprimi/espandi',
      widgets_all_hidden_hint: 'Nessun widget visibile. Usa "Personalizza" per riattivarli.',
      ticket_list_truncated_hint: 'Vengono mostrati solo i ticket più recenti: affina i filtri per una vista completa.',
      widget_unassigned_by_group_title: 'Non assegnati per gruppo', widget_unassigned_by_group_empty: 'Nessun ticket non assegnato al momento.',
      widget_sla_watch_title: 'Ticket a rischio SLA', widget_sla_watch_empty: 'Nessun ticket a rischio SLA al momento.',
      widget_sla_overdue_label: 'SLA superata', widget_sla_elapsed_label: 'del tempo SLA trascorso',
      toast_category_deleted: 'Categoria eliminata', toast_category_added: 'Categoria aggiunta', delete_category_title: 'Elimina categoria',
      no_categories_hint: 'Nessuna categoria.', no_groups_hint: 'Nessun gruppo.', account_created_for: 'Account creato per',
      temp_password_hint: 'Password temporanea (comunicala in modo sicuro, non sarà più visibile):', toast_staff_created: 'Account staff creato',
      search_person_label: 'Cerca persona', search_person_placeholder: 'Nome o email...', no_people_found: 'Nessuna persona trovata.',
      th_name: 'Nome', th_email: 'Email', th_role: 'Ruolo', th_group: 'Gruppo', th_registered: 'Registrato',
      org_section_title: 'Organizzazione', org_section_hint: 'Il nome scelto compare nell\'intestazione e nelle email inviate agli utenti.',
      flexible_time_entry_label: 'Inserimento manuale flessibile delle ore', flexible_time_entry_hint: 'Se attivo, ogni utente può aggiungere, modificare ed eliminare liberamente le proprie timbrature sul calendario, oltre alla timbratura automatica.',
      toast_flexible_time_entry_enabled: 'Inserimento manuale flessibile attivato', toast_flexible_time_entry_disabled: 'Inserimento manuale flessibile disattivato',
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
      btn_reset_default: 'Ripristina predefinito', toast_template_reset: 'Modello ripristinato al predefinito', default_template_title: 'Modello predefinito',
      not_found_text: 'Pagina non trovata.', back_to_dashboard: 'Torna alla dashboard', placeholder_default: '(predefinito)',
      impersonate_search_label: 'Cerca una persona da vedere in sola lettura',
      impersonate_role_label: 'Oppure visualizza per ruolo generico', impersonate_role_group_label: 'Team da simulare (opzionale)',
      viewing_as_role_no_personal_counter: 'Anteprima per ruolo: nessun contatore personale, nessuna identità specifica.',
      notifications_title: 'Notifiche', mark_all_read: 'Segna tutte come lette', no_notifications: 'Nessuna notifica.',
      confirm_password_label: 'Conferma password', no_data_available: 'Nessun dato disponibile.', send_request_btn: 'Invia richiesta',
      show_password_label: 'Mostra password',
      passwords_mismatch: 'Le password non coincidono', toast_welcome_back: 'Bentornato', toast_account_created: 'Account creato, benvenuto',
      passwords_match_ok: 'Le password coincidono', pw_strength_weak: 'Debole', pw_strength_medium: 'Media', pw_strength_strong: 'Forte',
      pw_req_length: 'Almeno 8 caratteri', pw_req_letter_number: 'Almeno una lettera e un numero',
      new_ticket_title: 'Nuovo ticket', new_ticket_hint: 'Raccontaci il problema: bastano pochi campi, il resto lo segue il nostro team.',
      field_request_type: 'Tipo di richiesta', type_incident_suffix: '— qualcosa non funziona', type_task_suffix: '— richiesta pianificabile',
      field_device_request_type: 'Motivo della richiesta', device_request_type_hint: 'Indica il motivo: verrà usato per instradare correttamente la richiesta.',
      device_request_type_problem: 'Ho un problema', device_request_type_new_device: 'Nuovo dispositivo', device_request_type_replacement: 'Sostituzione', device_request_type_loan: 'Prestito temporaneo', device_request_type_lost_stolen: 'Smarrito o rubato',
      field_template: 'Parti da un modello', template_blank_option: 'Nessun modello (parti da zero)',
      field_on_behalf_of: 'Apri per conto di', on_behalf_of_none: 'Per me stesso', on_behalf_of_label: 'per conto di',
      on_behalf_of_search_placeholder: 'Cerca una persona…',
      field_category: 'Categoria', field_subject_placeholder: 'Un breve titolo per il problema', field_urgency: 'Quanto è urgente?',
      field_impact: 'Chi riguarda questo problema?',
      impact_low: 'Solo me', impact_medium: 'Il mio ufficio/team', impact_high: 'Tutti/più uffici',
      impact_low_hint: 'Il problema riguarda solo il mio utilizzo personale', impact_medium_hint: 'Il problema riguarda anche colleghi del mio ufficio o team', impact_high_hint: 'Il problema blocca più persone o l\'intera azienda',
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
      field_specific_role: 'Ruolo specifico', specific_role_none_option: 'Nessuno (permessi base)',
      specific_role_hint: 'Assegna un ruolo con permessi aggiuntivi, oltre al ruolo base.',
      toast_specific_role_updated: 'Ruolo specifico aggiornato', toast_profile_updated: 'Dati account aggiornati',
      delete_account_btn: 'Elimina account', toast_account_deleted: 'Account eliminato',
      confirm_delete_account_prefix: 'Eliminare definitivamente l\'account di', confirm_delete_account_suffix: '? Questa azione non può essere annullata ed elimina anche i ticket aperti da questa persona.',
      btn_block_account: 'Blocca account', btn_unblock_account: 'Sblocca account',
      confirm_block_account_prefix: 'Bloccare l\'account di', confirm_block_account_suffix: '? Non potrà più accedere finché non lo sblocchi.',
      confirm_unblock_account_prefix: 'Sbloccare l\'account di', confirm_unblock_account_suffix: '?',
      block_reason_prompt: 'Motivo del blocco (opzionale):',
      toast_account_blocked: 'Account bloccato', toast_account_unblocked: 'Account sbloccato',
      blocked_badge: 'Bloccato', blocked_since_label: 'Bloccato il', blocked_reason_label: 'Motivo',
      filter_all_users: 'Tutti', filter_active_users: 'Attivi', filter_blocked_users: 'Blacklist',
      th_status: 'Stato',
      btn_copy: 'Copia', toast_copied: 'Copiato negli appunti', toast_copy_failed: 'Impossibile copiare',
      motion_fluid_label: 'Animazioni fluide', toast_accent_updated: 'Colore aggiornato', toast_motion_updated: 'Preferenza animazioni aggiornata', toast_theme_updated: 'Aspetto aggiornato',
      desktop_notif_label: 'Notifiche desktop', desktop_notif_hint: 'Ricevi un avviso pop-up del sistema operativo per nuovi ticket e commenti, anche a scheda non attiva.',
      toast_desktop_notif_enabled: 'Notifiche desktop attivate', toast_desktop_notif_disabled: 'Notifiche desktop disattivate',
      toast_desktop_notif_denied: 'Permesso negato dal browser: abilita le notifiche per questo sito nelle impostazioni del browser',
      onboarding_list_hint: 'Gestisci le pratiche di onboarding per i nuovi assunti e monitora l\'avanzamento di ogni voce.',
      btn_new_onboarding: 'Nuovo onboarding', field_employee_name: 'Nome del nuovo assunto', onboarding_progress: 'Avanzamento',
      field_requested_by: 'Richiesto da', table_created: 'Creato il', no_onboarding_found: 'Nessuna pratica di onboarding.',
      onboarding_form_hint: 'Inserisci i dati del nuovo assunto e seleziona le voci da attivare per la sua postazione.',
      field_employee_email: 'Email personale', field_start_date: 'Data di inizio', field_existing_user_optional: 'Utente piattaforma (se già esistente)',
      field_notes: 'Note', onboarding_checklist_label: 'Voci da attivare', onboarding_attachment_label: 'Modulo di onboarding (allegato)',
      onboarding_attachment_hint: 'Puoi allegare il modulo compilato (PDF o immagine): sarà consultabile dalla pratica.',
      btn_start_onboarding: 'Avvia onboarding', toast_onboarding_created: 'Onboarding avviato',
      onboarding_requested_by_label: 'Richiesto da', onboarding_details_title: 'Dettagli',
      onboarding_group_prefix: 'Onboarding:', onboarding_group_open_suffix: 'aperti', onboarding_group_done_suffix: 'completati',
      onboarding_group_all_done: 'Tutti completati', onboarding_ticket_link_label: 'Fa parte dell\'onboarding di',
      onboarding_copy_from_label: 'Copia utenza da', onboarding_license_label: 'Licenza',
      onboarding_license_placeholder: 'es. E3, Business Standard...', onboarding_asset_created_prefix: 'Asset generato:',
      onboarding_completed_by_prefix: 'Completato da', no_onboarding_items_hint: 'Nessuna voce.',
      toast_onboarding_item_updated: 'Voce aggiornata', toast_onboarding_updated: 'Onboarding aggiornato',
      btn_complete_all_onboarding: 'Completa tutto', confirm_complete_all_onboarding: 'Completare tutte le voci di questo onboarding? Tutti i ticket collegati ancora aperti verranno risolti.',
      toast_onboarding_completed_all: '{n} voci completate',
      btn_delete_onboarding: 'Elimina onboarding',
      confirm_delete_onboarding: 'Eliminare questo onboarding? Tutti i ticket collegati ancora aperti verranno cancellati.',
      toast_onboarding_deleted: 'Onboarding eliminato',
      admin_onboarding_title: 'Onboarding — voci checklist', admin_onboarding_hint: 'Definisci le voci disponibili per le pratiche di onboarding e a quale team vengono instradate.',
      field_label_it: 'Nome (IT)', field_label_en: 'Nome (EN)', onboarding_kind_label: 'Tipo di voce', onboarding_routed_to_label: 'Instradata a',
      btn_add_onboarding_item: 'Aggiungi voce', onboarding_enabled_label: 'Attiva', confirm_delete_onboarding_item: 'Eliminare questa voce?',
      toast_onboarding_item_type_updated: 'Voce aggiornata', toast_onboarding_item_type_created: 'Voce creata', toast_onboarding_item_type_deleted: 'Voce eliminata',
      onboarding_status_open: 'Aperto', onboarding_status_in_progress: 'In lavorazione', onboarding_status_completed: 'Completato', onboarding_status_cancelled: 'Annullato',
      onboarding_item_pending: 'Da fare', onboarding_item_done: 'Completato', onboarding_item_skipped: 'Saltato',
      onboarding_kind_checkbox: 'Attivazione semplice', onboarding_kind_license: 'Con licenza', onboarding_kind_copy_user: 'Copia utenza da collega', onboarding_kind_asset: 'Genera asset',
      onboarding_callout_title: 'Devi far entrare una nuova persona in azienda?', onboarding_callout_hint: 'Avvia una pratica di onboarding: postazione, accessi e account, tutto tracciato in un unico posto.',
      admin_section_overview: 'Panoramica', admin_section_users: 'Utenti', admin_section_groups: 'Gruppi e organigramma',
      admin_section_catalog: 'Catalogo e campi', admin_section_automation: 'Automazione', admin_section_onboarding: 'Onboarding',
      admin_section_org: 'Organizzazione', admin_section_roles: 'Ruoli', admin_section_system: 'Sistema',
      admin_section_companies: 'Aziende',
      admin_companies_title: 'Gestione aziende', admin_companies_hint: 'Ogni azienda ha una propria intestazione, logo, gruppi e utenti separati dalle altre.',
      field_company_name: 'Nome interno', field_company_display_name: 'Titolo mostrato (opzionale)',
      btn_create_company: 'Crea azienda', company_error_required: 'Il nome interno è obbligatorio',
      name_required_error: 'Il nome è obbligatorio',
      table_company: 'Azienda', table_members: 'Utenti', table_groups: 'Gruppi',
      company_active_label: 'Attiva', company_inactive_label: 'Disattivata',
      btn_deactivate: 'Disattiva', btn_activate: 'Attiva',
      toast_company_created: 'Azienda creata', toast_company_updated: 'Azienda aggiornata', toast_company_deleted: 'Azienda eliminata',
      confirm_delete_company: 'Eliminare questa azienda? L\'operazione è possibile solo se non ha più utenti o gruppi collegati.',
      company_logo_label: 'Logo', no_companies_hint: 'Nessuna azienda creata.',
      field_company_select: 'Azienda', option_select_company: 'Seleziona la tua azienda',
      company_select_required: 'Seleziona la tua azienda per continuare',
      timesheet_title: 'Orari', timesheet_hint: 'Registra l\'inizio e la fine del tuo orario di lavoro.',
      timesheet_status_in_prefix: 'In servizio dalle', timesheet_status_out: 'Non sei in servizio',
      btn_clock_in: 'Timbra entrata', btn_clock_out: 'Timbra uscita',
      timesheet_notes_placeholder: 'Note sul turno (opzionale)',
      timesheet_history_title: 'Storico timbrature', th_clock_in: 'Entrata', th_clock_out: 'Uscita', th_duration: 'Durata',
      timesheet_no_entries: 'Nessuna timbratura registrata.', timesheet_ongoing: 'in corso',
      timesheet_manual_title: 'Aggiungi ore manualmente', timesheet_manual_hint: 'Registra o correggi una timbratura scegliendo data e orario sul calendario.',
      timesheet_select_day_error: 'Seleziona prima un giorno dal calendario.',
      field_start_time: 'Ora inizio', field_end_time: 'Ora fine', btn_add_entry: 'Aggiungi',
      confirm_delete_time_entry: 'Eliminare questa timbratura?', toast_time_entry_added: 'Timbratura aggiunta',
      toast_time_entry_updated: 'Timbratura aggiornata', toast_time_entry_deleted: 'Timbratura eliminata',
      timesheet_team_title: 'Ore del team', timesheet_team_hint: 'Timbrature del tuo team: dei tuoi collaboratori diretti, oppure di tutta l\'azienda se sei amministratore.',
      timesheet_pay_title: 'Stima paga mensile', timesheet_pay_hint: 'Calcolo approssimativo in base alle ore timbrate questo mese e al guadagno orario che inserisci qui sotto. Il valore resta solo su questo dispositivo.',
      timesheet_pay_wage_label: 'Guadagno orario (€)', timesheet_pay_hours_label: 'Ore timbrate questo mese', timesheet_pay_estimate_label: 'Stima paga del mese',
      toast_clocked_in: 'Entrata registrata', toast_clocked_out: 'Uscita registrata',
      admin_system_title: 'Stato del server', admin_system_hint: 'Indicatori in tempo reale su carico, memoria e limiti tecnici della piattaforma (solo admin).',
      admin_section_privacy: 'Dati e Privacy',
      admin_privacy_title: 'Dati e privacy', admin_privacy_hint: 'Dove vengono conservati i dati aziendali, per quanto tempo, e come sono protetti.',
      privacy_db_label: 'Database', privacy_db_turso: 'Turso (gestito, persistente)', privacy_db_local: 'File locale (solo sviluppo, non persistente)',
      privacy_attachments_label: 'Allegati ticket', privacy_attachments_db: 'Nel database',
      privacy_backup_label: 'Backup', privacy_backup_pitr: 'Point-in-time recovery attivo (24 ore) + backup manuale disponibile',
      privacy_backup_none: 'Nessun backup automatico (ambiente di sviluppo)',
      privacy_categories_title: 'Categorie di dati trattati e conservazione',
      privacy_cat_identity: 'Anagrafica utenti (nome, email, ruolo, reparto)', privacy_cat_tickets: 'Ticket, commenti e allegati',
      privacy_cat_messages: 'Messaggi diretti tra colleghi', privacy_cat_notifications: 'Notifiche (una volta lette)',
      privacy_cat_audit: 'Registro attività (audit log)', privacy_cat_timesheet: 'Timbrature, ferie e permessi',
      privacy_ret_manual: 'Conservato finché non lo elimina un amministratore',
      privacy_ret_auto_after: 'Eliminato automaticamente dopo', privacy_days_unit: 'giorni',
      privacy_isolation_hint: 'Ogni azienda vede solo i propri dati: l\'isolamento è applicato su ogni lista, con un controllo automatico che blocca la risposta se una riga fuori perimetro dovesse comunque comparire, invece di restituirla.',
      privacy_transport_hint: 'Tutto il traffico tra dispositivo, applicazione e database viaggia cifrato via HTTPS.',
      system_uptime_label: 'Attivo da', system_memory_label: 'Memoria (RSS)', system_requests_label: 'Richieste API (15 min)',
      system_requests_reset_prefix: 'si azzera tra', system_requests_reset_suffix: 'min', system_requests_total_suffix: 'totali dall\'avvio',
      system_db_label: 'Latenza database', system_db_error: 'Errore', system_db_mode_turso: 'Turso con replica locale', system_db_mode_local: 'File locale (non persistente)',
      system_eventloop_label: 'Ritardo event loop', system_eventloop_hint: 'Indicatore diretto di sovraccarico del server',
      system_load_label: 'Carico CPU (1 min)', system_load_hint: 'su',
      system_online_users_label: 'Utenti online', system_online_staff_prefix: 'Staff:', system_online_customers_prefix: 'Utenti:',
      sidebar_status_ok: 'Sistema: operativo', sidebar_status_warning: 'Sistema: attenzione', sidebar_status_danger: 'Sistema: critico',
      system_overall_ok_title: 'Tutto operativo', system_overall_ok_hint: 'Tutti gli indicatori sono entro i valori normali.',
      system_overall_warning_title: 'Attenzione', system_overall_warning_hint: 'Uno o più indicatori si stanno avvicinando ai limiti: tenere sotto controllo.',
      system_overall_danger_title: 'Intervento necessario', system_overall_danger_hint: 'Uno o più indicatori hanno superato la soglia critica.',
      system_storage_title: 'Spazio e utilizzo', system_storage_hint: 'Dimensione del database e conteggio delle righe per le tabelle principali, per tenere sotto controllo la crescita nel tempo.',
      system_storage_db_size_label: 'Dimensione database', system_storage_attachments_label: 'Allegati (ticket + onboarding)',
      system_storage_retention_hint: 'Pulizia automatica in corso: messaggi diretti dopo 14 giorni, notifiche lette dopo 90 giorni, registro attività dopo 365 giorni.',
      storage_table_tickets: 'Ticket', storage_table_comments: 'Commenti', storage_table_ticket_events: 'Eventi ticket',
      storage_table_ticket_attachments: 'Allegati ticket', storage_table_onboarding_attachments: 'Allegati onboarding',
      storage_table_notifications: 'Notifiche', storage_table_audit_log: 'Registro attività', storage_table_direct_messages: 'Messaggi diretti',
      storage_table_users: 'Utenti',
      admin_roles_title: 'Ruoli personalizzati', admin_roles_hint: 'Crea ruoli con permessi specifici da assegnare al personale, oltre ad Agente e Amministratore.',
      field_color: 'Colore', field_role_read_only: 'Sola lettura (non può modificare i ticket)', field_role_permissions: 'Permessi',
      btn_add_role: 'Crea ruolo', no_roles_hint: 'Nessun ruolo personalizzato ancora creato.',
      confirm_delete_role: 'Eliminare definitivamente questo ruolo? Gli utenti che lo hanno assegnato torneranno ai permessi base.',
      toast_role_created: 'Ruolo creato', toast_role_deleted: 'Ruolo eliminato',
      perm_automations_manage: 'Gestire automazioni', perm_holidays_manage: 'Gestire festività e orari',
      perm_canned_responses_manage: 'Gestire risposte rapide', perm_templates_manage: 'Gestire modelli di ticket',
      perm_announcements_manage: 'Gestire la bacheca annunci',
      perm_users_manage: 'Gestire persone (creare, modificare, bloccare, eliminare)', perm_groups_manage: 'Gestire gruppi e organigramma',
      announcements_hint: 'Comunicazioni ufficiali dalla tua azienda.', btn_new_announcement: 'Nuovo annuncio',
      field_announcement_title: 'Titolo', field_announcement_body: 'Testo dell\'annuncio', announcement_pinned_label: 'Metti in evidenza (in cima alla bacheca)',
      format_bold: 'Grassetto', format_italic: 'Corsivo', format_heading: 'Titolo', format_list: 'Elenco puntato', format_link: 'Link',
      announcement_format_hint: 'Grassetto **così**, corsivo *così*, # per un titolo, - per un elenco, [testo](url) per un link',
      announcement_targets_label: 'Destinatari', announcement_targets_hint: 'Scegli gruppi e/o persone specifiche a cui inviare la notifica. Lascia vuoto per inviarla a tutta l\'azienda.',
      announcement_files_title: 'File allegati', dropzone_hint: 'Trascina qui i file o clicca per selezionarli',
      btn_pin: 'Metti in evidenza', btn_unpin: 'Rimuovi dall\'evidenza', btn_edit: 'Modifica',
      no_announcements_found: 'Nessun annuncio pubblicato.',
      toast_announcement_created: 'Annuncio pubblicato', toast_announcement_updated: 'Annuncio aggiornato', toast_announcement_deleted: 'Annuncio eliminato',
      confirm_delete_announcement: 'Eliminare definitivamente questo annuncio?',
      perm_onboarding_catalog_manage: 'Gestire catalogo onboarding', perm_assets_delete: 'Eliminare risorse',
      perm_audit_view: 'Vedere audit', perm_reports_view: 'Vedere report', perm_tickets_delete: 'Eliminare ticket',
      onboarding_license_options_label: 'Licenze selezionabili', onboarding_license_options_placeholder: 'Nessuna, E5, F3, F3_1...',
      onboarding_addon_label_label: 'Componente aggiuntivo', onboarding_addon_label_placeholder: 'es. Dynamics',
      onboarding_pick_existing_user: 'Seleziona utente esistente...', onboarding_new_person_placeholder: 'oppure inserisci il nome se non è ancora un account',
      onboarding_addon_checkbox_prefix: 'Richiedi anche la licenza',
      requester_context_title: 'Richiedente',
      nav_orgchart: 'Organigramma', orgchart_hint: 'Struttura dei team e gerarchia dei manager, visibile a tutti.',
      orgchart_search_placeholder: 'Cerca una persona per nome...', orgchart_view_members: 'Vedi membri', no_users_found: 'Nessuna persona trovata.',
      admin_block_drag_hint: 'Trascina per riordinare',
    },
    en: {
      nav_dashboard: 'Tickets', nav_new: 'New ticket', nav_search: 'Search', nav_announcements: 'Announcements', nav_directory: 'Directory', nav_messages: 'Messages',
      nav_section_work: 'Work', nav_section_team: 'Team', nav_section_tools: 'Tools',
      directory_hint: 'Find a colleague by name, role, or team.',
      send_message_btn: 'Message', messages_inbox_hint: 'Your direct conversations with colleagues.',
      messages_you_prefix: 'You:', no_messages_yet: 'No messages yet.',
      message_compose_placeholder: 'Write a message...', message_send_btn: 'Send',
      message_ttl_hint: 'Messages are automatically deleted after 14 days to keep the server light.',
      message_edited_label: 'edited', message_edit_btn: 'Edit message', message_delete_btn: 'Delete message',
      message_edit_prompt: 'Edit the message', confirm_delete_message: 'Delete this message?',
      delete_conversation_title: 'Delete chat', confirm_delete_conversation: 'Delete the entire chat with this person? All messages in both directions will be permanently removed.',
      toast_conversation_deleted: 'Chat deleted',
      confirm_bulk_delete_conversations_prefix: 'Permanently delete', confirm_bulk_delete_conversations_suffix: ' selected chats? All messages will be permanently removed.',
      toast_bulk_conversations_deleted: 'Chats deleted',
      close_btn: 'Close',
      leave_requests_hint: 'Request vacation or personal leave and track your requests.',
      leave_new_request_title: 'New request', leave_field_type: 'Type', leave_field_start: 'From', leave_field_end: 'To', leave_field_note: 'Reason (optional)',
      leave_submit_btn: 'Submit request', leave_type_vacation: 'Vacation', leave_type_permit: 'Personal leave',
      leave_status_pending: 'Pending', leave_status_approved: 'Approved', leave_status_rejected: 'Rejected',
      leave_my_requests_title: 'My requests', leave_team_title: 'Team requests', leave_none_found: 'No requests.',
      leave_cancel_btn: 'Withdraw', leave_approve_btn: 'Approve', leave_reject_btn: 'Reject', leave_review_note_label: 'Note',
      toast_leave_request_created: 'Request submitted', toast_leave_request_cancelled: 'Request withdrawn',
      toast_leave_request_approved: 'Request approved', toast_leave_request_rejected: 'Request rejected',
      confirm_cancel_leave_request: 'Withdraw this request?',
      nav_rooms: 'Meeting rooms', rooms_hint: 'Book a meeting room and check the day\'s bookings.',
      rooms_new_booking_title: 'New booking', rooms_field_room: 'Room', rooms_field_title: 'Meeting title',
      rooms_field_start: 'Start', rooms_field_end: 'End', rooms_book_btn: 'Book',
      rooms_bookings_for: 'Bookings', rooms_no_bookings: 'No bookings for this room.',
      rooms_cancel_btn: 'Cancel', rooms_no_rooms: 'No rooms configured.', rooms_capacity_label: 'seats',
      rooms_manage_title: 'Manage rooms', rooms_field_room_name: 'Room name', rooms_field_location: 'Location (optional)',
      rooms_field_capacity: 'Capacity (optional)', rooms_add_room_btn: 'Add room',
      toast_room_booked: 'Room booked', toast_room_booking_cancelled: 'Booking cancelled',
      toast_room_created: 'Room created', toast_room_deleted: 'Room deleted',
      confirm_cancel_room_booking: 'Cancel this booking?', confirm_delete_room: 'Delete this room? Linked bookings will be removed.',
      delete_room_title: 'Delete room', rooms_col_name: 'Room', rooms_col_location: 'Location', rooms_col_capacity: 'Capacity',
      nav_ideas: 'Ideas board', ideas_hint: 'Suggest an idea or vote for others\' ideas: the most popular rise to the top.',
      ideas_new_title: 'Suggest an idea', ideas_field_title: 'Title', ideas_field_description: 'Description (optional)', ideas_submit_btn: 'Submit idea',
      ideas_list_title: 'Suggested ideas', ideas_filter_all: 'All statuses', ideas_none: 'No ideas yet: suggest the first one!',
      ideas_vote_btn: 'Vote', ideas_delete_title: 'Delete idea', confirm_delete_idea: 'Delete this idea?',
      toast_idea_submitted: 'Idea submitted', toast_idea_deleted: 'Idea deleted', toast_idea_status_updated: 'Idea status updated',
      idea_status_new: 'New', idea_status_under_review: 'Under review', idea_status_planned: 'Planned', idea_status_implemented: 'Implemented', idea_status_rejected: 'Not accepted',
      nav_wiki: 'Internal wiki', wiki_hint: 'Internal documentation and procedures, available to the whole company.',
      wiki_new_page_btn: 'New page', wiki_search_placeholder: 'Search a page...', wiki_field_title: 'Title', wiki_field_content: 'Content',
      wiki_save_btn: 'Save', wiki_none: 'No pages yet.', wiki_back_to_list: 'Back to wiki', wiki_edit_btn: 'Edit', wiki_delete_btn: 'Delete',
      wiki_last_edited_by: 'Last edited by', wiki_empty_page: 'This page has no content yet.',
      confirm_delete_wiki_page: 'Delete this wiki page?',
      toast_wiki_page_created: 'Page created', toast_wiki_page_saved: 'Page saved', toast_wiki_page_deleted: 'Page deleted',
      nav_expenses: 'Expense reports', expenses_hint: 'Submit an expense report and track its approval status.',
      expense_new_title: 'New expense report', expense_field_description: 'Description', expense_field_amount: 'Amount (€)', expense_field_date: 'Expense date', expense_field_category: 'Category',
      expense_submit_btn: 'Submit report', expense_mine_title: 'My expense reports', expense_team_title: 'Team expense reports',
      expense_none_found: 'No expense reports found.', expense_cancel_btn: 'Withdraw', expense_approve_btn: 'Approve', expense_reject_btn: 'Reject',
      expense_review_note_label: 'Reviewer note', confirm_cancel_expense: 'Withdraw this expense report?',
      toast_expense_submitted: 'Expense report submitted', toast_expense_cancelled: 'Expense report withdrawn', toast_expense_approved: 'Expense report approved', toast_expense_rejected: 'Expense report rejected',
      expense_status_pending: 'Pending', expense_status_approved: 'Approved', expense_status_rejected: 'Rejected',
      expense_category_travel: 'Travel', expense_category_meals: 'Meals', expense_category_accommodation: 'Accommodation', expense_category_supplies: 'Supplies', expense_category_other: 'Other',
      nav_assets: 'Assets', nav_onboarding: 'Onboarding', nav_timesheet: 'Hours', nav_report: 'Report', nav_audit: 'Audit', nav_admin: 'Administration', nav_profile: 'Profile', logout: 'Log out',
      login_title: 'Sign in', login_hint: 'Enter the ticketing platform.', login_email: 'Email', login_password: 'Password',
      login_submit: 'Sign in', login_no_account: "Don't have an account?", login_register_link: 'Register',
      twofa_login_title: 'Two-factor verification', twofa_login_hint: 'Enter the 6-digit code generated by your authenticator app.',
      twofa_code_label: 'Verification code', twofa_verify_submit: 'Verify and sign in', twofa_back_link: 'Back to login',
      twofa_settings_title: 'Two-factor authentication', twofa_settings_hint_disabled: "Add an extra layer of security: after your password you'll be asked for a code generated by an app like Google Authenticator or Microsoft Authenticator.",
      twofa_settings_hint_enabled: "Enabled. Signing in will also ask for your authenticator app's code.",
      twofa_enable_button: 'Enable 2FA', twofa_disable_button: 'Disable 2FA', twofa_enabled_badge: 'Enabled',
      twofa_secret_label: 'Secret key (manual entry)', twofa_secret_hint: 'Open your authenticator app, add a new account and enter this key manually, or paste the setup URI.',
      twofa_confirm_code_label: 'Code from the app', twofa_confirm_button: 'Confirm and enable', twofa_cancel_button: 'Cancel',
      twofa_disable_password_label: 'Current password', twofa_disable_code_label: 'Code from the app', twofa_disable_confirm_button: 'Confirm disable',
      sessions_title: 'Active sessions', sessions_hint: 'Devices and browsers currently signed in to your account.',
      sessions_current_badge: 'This device', sessions_revoke_button: 'End', sessions_revoke_others_button: 'End all other sessions',
      sessions_empty: 'No active sessions.', sessions_last_active_label: 'Last active', sessions_created_label: 'Signed in',
      toast_2fa_enabled: 'Two-factor authentication enabled', toast_2fa_disabled: 'Two-factor authentication disabled',
      toast_session_revoked: 'Session ended', toast_sessions_revoked_others: 'All other sessions have been ended',
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
      response_sla_prefix: 'First response:',
      asset_type_laptop: 'Laptop', asset_type_desktop: 'Desktop', asset_type_monitor: 'Monitor', asset_type_phone: 'Phone', asset_type_tablet: 'Tablet', asset_type_other: 'Other',
      asset_status_available: 'Available', asset_status_in_use: 'In use', asset_status_repair: 'Under repair', asset_status_retired: 'Retired',
      role_customer: 'Customer', role_agent: 'Agent', role_admin: 'Administrator',
      filter_all_types: 'All types', filter_all_statuses: 'All statuses', filter_all_priorities: 'All priorities',
      onboarding_filter_active: 'Active',
      filter_chip_status: 'Status', filter_chip_priority: 'Priority', filter_chip_type: 'Type', filter_chip_remove_title: 'Remove filter',
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
      attachment_too_large: 'File too large (max 50 MB)', toast_attachment_added: 'Attachment added', toast_attachment_deleted: 'Attachment deleted',
      rating_title: 'Rating', rated_on_label: 'Rated on', btn_edit_rating: 'Edit rating',
      rating_comment_placeholder: 'An optional comment about the service received...', btn_submit_rating: 'Submit rating',
      rating_required_hint: 'Select a rating from 1 to 5 stars', toast_rating_submitted: 'Rating submitted, thank you!',
      loading: 'Loading...', no_results: 'No results.', unassigned_label: 'Unassigned',
      lang_updated: 'Language updated', by_label: 'By', assigned_to_label: 'Assigned to', no_tickets_found: 'No tickets found.',
      list_col_number: 'Number', list_col_subject: 'Subject', list_col_requester: 'Requester', list_col_assignee: 'Assignee',
      list_col_group: 'Group', list_col_priority: 'Priority', list_col_status: 'Status', list_col_updated: 'Updated', list_unassigned: 'Unassigned',
      list_col_resize_hint: 'Drag to resize, double-click to reset',
      back_to_list: 'Back to list', edit_subject_desc: 'Edit subject and description',
      field_subject: 'Subject', field_description: 'Description', btn_save_changes: 'Save changes',
      created_by: 'Created by', on_date: 'on', reopen_ticket: 'Reopen ticket',
      cancel_ticket_btn: 'Cancel request', confirm_cancel_ticket: 'Cancel this request? The ticket will be closed.',
      activity_title: 'Activity', no_activity: 'No activity yet.',
      readonly_no_comments: 'Read-only mode: comments cannot be sent.',
      add_comment_label: 'Add a comment', comment_placeholder: 'Write a reply...',
      internal_note_label: 'Internal note (staff only)', btn_send: 'Send',
      management_title: 'Management', field_group: 'Assignment group', field_linked_asset: 'Linked asset',
      delete_ticket_btn: 'Delete ticket', no_group_option: 'No group', no_asset_option: 'No asset',
      group_search_placeholder: 'Search a group…',
      confirm_delete_ticket: 'Permanently delete this ticket?',
      ticket_cancelled_banner: 'This ticket has been cancelled.',
      toast_ticket_updated: 'Ticket updated', toast_ticket_reopened: 'Ticket reopened', toast_ticket_deleted: 'Ticket deleted',
      toast_ticket_cancelled: 'Request cancelled',
      toast_comment_added: 'Comment added', new_message_toast: 'New message on the ticket',
      presence_staff: 'A technician is currently viewing this ticket',
      presence_customer: 'The requester is currently viewing this ticket',
      group_label_prefix: 'Group', viewing_as_title: 'View of', viewing_as_hint: "You're viewing this person's tickets in read-only mode.",
      viewas_banner_text: "You're viewing the platform as", viewas_readonly_suffix: 'read-only', viewas_exit: 'Exit this mode',
      bulk_assign_placeholder: 'Assign to...', bulk_status_placeholder: 'Change status...', bulk_clear_selection: 'Clear selection',
      bulk_selected_count: 'Selected:', toast_bulk_assigned: 'Tickets assigned', toast_bulk_status_updated: 'Status updated on selected tickets',
      bulk_delete_btn: 'Delete selected', toast_bulk_deleted: 'Tickets deleted',
      confirm_bulk_delete_tickets_prefix: 'Permanently delete', confirm_bulk_delete_tickets_suffix: ' selected tickets? This cannot be undone.',
      filter_all_roles: 'All roles', filter_all_groups: 'All groups',
      page_prev: 'Previous', page_next: 'Next',
      page_indicator_prefix: 'Page', page_indicator_of: 'of', page_indicator_results: 'results',
      bulk_user_role_placeholder: 'Change role...', bulk_user_group_placeholder: 'Assign to group...',
      toast_bulk_user_updated: 'Users updated', toast_bulk_users_deleted: 'Users deleted',
      confirm_bulk_delete_users_prefix: 'Permanently delete', confirm_bulk_delete_users_suffix: ' selected users? This cannot be undone.',
      bulk_assignment_placeholder: 'Change assignment...', bulk_tag_prefix_placeholder: 'e.g. ITA-', bulk_apply_prefix: 'Apply prefix',
      toast_bulk_asset_updated: 'Selected assets updated', toast_bulk_prefix_applied: 'Prefix applied to selected assets',
      toast_bulk_assets_deleted: 'Assets deleted',
      confirm_bulk_delete_assets_prefix: 'Permanently delete', confirm_bulk_delete_assets_suffix: ' selected assets? This cannot be undone.',
      add_tag_placeholder: 'Add a tag and press enter',
      linked_tickets_title: 'Linked tickets', link_ticket_placeholder: 'Ticket number (e.g. 12)', btn_link_ticket: 'Link',
      similar_tickets_title: 'Similar tickets', no_similar_tickets_hint: 'No similar tickets found in the same category.', toast_ticket_linked: 'Ticket linked',
      quick_jump_placeholder: 'Search tickets, people, assets...', quick_jump_hint: 'Type to search across tickets, people and assets.', quick_jump_empty: 'No results.',
      quick_jump_tickets: 'Tickets', quick_jump_people: 'People', quick_jump_assets: 'Assets',
      no_linked_tickets_hint: 'No linked tickets.',
      btn_watch: 'Watch', btn_unwatch: 'Unwatch', toast_now_watching: 'You are now watching this ticket', toast_stopped_watching: 'You stopped watching this ticket',
      assets_hint: 'Device inventory, permanent assignments and loans.', new_asset_title: 'New asset',
      field_name: 'Name', field_tag: 'Tag/asset number', btn_add_asset: 'Add asset',
      table_type: 'Type', table_tag: 'Tag', table_status: 'Status', table_assignment: 'Assignment', table_due_date: 'Due date',
      assignment_permanent: 'Permanent', assignment_loan: 'Loan', none_option: 'None', no_assets_found: 'No assets found.',
      toast_asset_updated: 'Asset updated', asset_name_required_error: 'Asset name is required',
      toast_asset_status_updated: 'Asset status updated', toast_assignment_updated: 'Assignment updated',
      toast_assignee_updated: 'Assignee updated', toast_due_date_updated: 'Due date updated',
      confirm_delete_asset: 'Delete this asset?', toast_asset_deleted: 'Asset deleted', delete_asset_title: 'Delete asset',
      search_hint: 'Search by ticket number, keyword or requester: results appear as you type.',
      search_placeholder_full: 'Ticket number, keyword, requester...', all_groups_option: 'All groups', all_tags_option: 'All tags',
      filter_assigned_to_label: 'Assigned to', filter_created_by_label: 'Opened by', assets_assigned_title: 'Assigned assets', no_assets_assigned: 'No assets assigned.',
      asset_letters_title: 'Assignment letters', no_asset_letters: 'No assignment letters.',
      asset_letter_pending_badge: 'To sign', asset_letter_signed_badge: 'Signed',
      asset_letter_banner_one: 'You have an asset to confirm: sign the assignment letter.',
      asset_letter_banner_many: 'You have {n} assets to confirm: sign the assignment letters.',
      btn_review_and_sign: 'Go to sign',
      btn_sign_letter: 'Sign and accept',
      asset_letter_signed_on: 'Signed on',
      asset_letter_signed_by: 'by',
      field_full_name_sign: 'Full name (signature)',
      asset_letter_intro: 'You have been assigned the following company device. Before you can use it, please read and sign the assignment letter below.',
      asset_letter_body: 'By signing this letter, the undersigned declares to have received the device indicated above in full working order and commits to: use it exclusively for work purposes, with due care and in compliance with company policies; promptly report to the Service Desk any malfunction, damage, loss or theft; return it, together with its accessories, at the end of employment, in case of replacement, or upon company request. The electronic signature below constitutes acceptance of the terms described.',
      asset_letter_already_signed: 'This letter has already been signed.',
      toast_letter_signed: 'Letter signed successfully',
      assets_search_placeholder: 'Search by name or tag...',
      nav_insights: 'Report & Audit', insights_hint: 'Performance analytics and a complete activity trail, in one place.',
      report_hint: 'Volumes, resolution times and SLA compliance by group and agent.',
      chart_volume_by_group: 'Ticket volume by group', chart_avg_resolution: 'Average resolution time (hours) by group',
      chart_sla_compliance: 'SLA compliance by group (%)', chart_load_by_agent: 'Ticket load by agent',
      chart_csat: 'Average satisfaction by group (out of 5)', no_ratings_yet: 'No ratings yet.', report_col_rating: 'Rating',
      chart_ticket_trend: 'Ticket trend over time', trend_series_created: 'Created', trend_series_resolved: 'Resolved',
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
      theme_mode_title: 'Appearance', theme_mode_hint: 'Choose the interface appearance.', theme_mode_light: 'Light', theme_mode_dark: 'Dark', theme_mode_auto: 'System',
      cold_start_hint: 'The server is waking up after a period of inactivity, one moment...',
      admin_title: 'Administration', access_denied: 'Access not allowed.', person_card_title: 'Person profile',
      org_open_tickets: 'open', org_sla_breach: 'overdue', org_node_hint: 'Click to see the team\'s tickets',
      org_member_count: 'people', org_no_manager: 'No manager', org_toggle_branch: 'Expand/collapse branch',
      org_drag_handle_hint: 'Drag to move this team', org_add_child_title: 'Add sub-team',
      toast_add_child_group_hint: 'Fill in the name: it will be created under "{name}"',
      org_settings_toggle: 'Team settings', org_expand_all: 'Expand all', org_collapse_all: 'Collapse all',
      org_settings_group_identity: 'Identity', org_settings_group_sla: 'SLA & hours',
      admin_create_staff_title: 'Create staff account', admin_group_optional_label: 'Assignment group (optional)',
      admin_group_hint: 'Members of the same group can see each other for ticket assignment',
      admin_bulk_import_title: 'Import users from CSV', admin_bulk_import_hint: 'Columns: name,email,role (agent or admin), group (optional, exact name), locale (optional, it or en).',
      admin_bulk_import_file_label: 'CSV file', admin_bulk_import_btn: 'Import', admin_bulk_import_empty: 'No valid rows found in the file (check the name/email/role columns).',
      admin_bulk_import_summary: '{created} created, {failed} failed.', admin_bulk_import_row_label: 'Row', toast_bulk_import_done: 'Import complete',
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
      field_group_display_name: 'Display name', field_group_display_name_placeholder: 'Use the organization name',
      field_group_display_name_hint: 'When set, it replaces the organization name for members of this group and its sub-groups.',
      toast_group_display_name_updated: 'Display name updated',
      field_group_name: 'Team name', toast_group_name_updated: 'Team name updated',
      toast_group_deleted: 'Group deleted', toast_group_created: 'Group created', toast_default_team_updated: 'Default team updated',
      confirm_delete_user: 'Delete this account?', toast_user_deleted: 'Account deleted', delete_user_title: 'Delete account',
      admin_delegate_hint: 'Delegated access: you can manage people and/or groups based on the permissions granted to you.',
      admin_delegate_new_user_role_hint: 'The new account is created with the Agent role.',
      org_drop_root_hint: 'Drag a group here to make it top-level', toast_group_reparented: 'Group reorganized',
      toast_member_moved: 'Person moved to another team', org_member_drag_hint: 'Drag onto another team to move this person', org_no_members: 'No one in this team yet',
      assign_to_me_btn: 'Assign to me', toast_ticket_assigned_to_you: 'Ticket assigned to you',
      quick_resolve_btn: 'Close ticket', toast_ticket_resolved_quick: 'Ticket closed',
      group_by_team_label: 'Group by team',
      widgets_section_title: 'Management dashboard', widgets_customize_btn: 'Customize',
      widgets_collapse_all_btn: 'Collapse all', widgets_expand_all_btn: 'Expand all', widget_collapse_toggle_title: 'Collapse/expand',
      widgets_all_hidden_hint: 'No widgets visible. Use "Customize" to turn them back on.',
      ticket_list_truncated_hint: 'Only the most recent tickets are shown: refine the filters for a complete view.',
      widget_unassigned_by_group_title: 'Unassigned by group', widget_unassigned_by_group_empty: 'No unassigned tickets right now.',
      widget_sla_watch_title: 'SLA at-risk tickets', widget_sla_watch_empty: 'No tickets at SLA risk right now.',
      widget_sla_overdue_label: 'SLA breached', widget_sla_elapsed_label: 'of SLA time elapsed',
      toast_category_deleted: 'Category deleted', toast_category_added: 'Category added', delete_category_title: 'Delete category',
      no_categories_hint: 'No categories.', no_groups_hint: 'No groups.', account_created_for: 'Account created for',
      temp_password_hint: 'Temporary password (share it securely, it won\'t be shown again):', toast_staff_created: 'Staff account created',
      search_person_label: 'Search person', search_person_placeholder: 'Name or email...', no_people_found: 'No people found.',
      th_name: 'Name', th_email: 'Email', th_role: 'Role', th_group: 'Group', th_registered: 'Registered',
      org_section_title: 'Organization', org_section_hint: 'The chosen name appears in the header and in emails sent to users.',
      flexible_time_entry_label: 'Flexible manual time entry', flexible_time_entry_hint: 'When on, every user can freely add, edit and delete their own calendar time entries, in addition to automatic clock-in/out.',
      toast_flexible_time_entry_enabled: 'Flexible manual entry enabled', toast_flexible_time_entry_disabled: 'Flexible manual entry disabled',
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
      btn_reset_default: 'Reset to default', toast_template_reset: 'Template reset to default', default_template_title: 'Default template',
      not_found_text: 'Page not found.', back_to_dashboard: 'Back to dashboard', placeholder_default: '(default)',
      impersonate_search_label: 'Search for a person to view read-only',
      impersonate_role_label: 'Or view as a generic role', impersonate_role_group_label: 'Team to simulate (optional)',
      viewing_as_role_no_personal_counter: 'Role preview: no personal counter, no specific identity.',
      notifications_title: 'Notifications', mark_all_read: 'Mark all as read', no_notifications: 'No notifications.',
      confirm_password_label: 'Confirm password', no_data_available: 'No data available.', send_request_btn: 'Send request',
      show_password_label: 'Show password',
      passwords_mismatch: 'Passwords do not match', toast_welcome_back: 'Welcome back', toast_account_created: 'Account created, welcome',
      passwords_match_ok: 'Passwords match', pw_strength_weak: 'Weak', pw_strength_medium: 'Medium', pw_strength_strong: 'Strong',
      pw_req_length: 'At least 8 characters', pw_req_letter_number: 'At least one letter and one number',
      new_ticket_title: 'New ticket', new_ticket_hint: 'Tell us about the problem: just a few fields, our team takes care of the rest.',
      field_request_type: 'Request type', type_incident_suffix: '— something isn\'t working', type_task_suffix: '— schedulable request',
      field_device_request_type: 'Reason for request', device_request_type_hint: 'Tell us why: this is used to route the request correctly.',
      device_request_type_problem: 'I have a problem', device_request_type_new_device: 'New device', device_request_type_replacement: 'Replacement', device_request_type_loan: 'Temporary loan', device_request_type_lost_stolen: 'Lost or stolen',
      field_template: 'Start from a template', template_blank_option: 'No template (start from scratch)',
      field_on_behalf_of: 'Open on behalf of', on_behalf_of_none: 'For myself', on_behalf_of_label: 'on behalf of',
      on_behalf_of_search_placeholder: 'Search for a person…',
      field_category: 'Category', field_subject_placeholder: 'A short title for the issue', field_urgency: 'How urgent is it?',
      field_impact: 'Who does this issue affect?',
      impact_low: 'Just me', impact_medium: 'My office/team', impact_high: 'Everyone/multiple offices',
      impact_low_hint: 'The issue only affects my own personal use', impact_medium_hint: 'The issue also affects colleagues in my office or team', impact_high_hint: 'The issue is blocking multiple people or the whole company',
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
      field_specific_role: 'Specific role', specific_role_none_option: 'None (base permissions)',
      specific_role_hint: 'Assign a role with extra permissions, on top of the base role.',
      toast_specific_role_updated: 'Specific role updated', toast_profile_updated: 'Account details updated',
      delete_account_btn: 'Delete account', toast_account_deleted: 'Account deleted',
      confirm_delete_account_prefix: 'Permanently delete the account for', confirm_delete_account_suffix: '? This cannot be undone and also deletes tickets opened by this person.',
      btn_block_account: 'Block account', btn_unblock_account: 'Unblock account',
      confirm_block_account_prefix: 'Block the account for', confirm_block_account_suffix: '? They will not be able to sign in until you unblock them.',
      confirm_unblock_account_prefix: 'Unblock the account for', confirm_unblock_account_suffix: '?',
      block_reason_prompt: 'Reason for the block (optional):',
      toast_account_blocked: 'Account blocked', toast_account_unblocked: 'Account unblocked',
      blocked_badge: 'Blocked', blocked_since_label: 'Blocked on', blocked_reason_label: 'Reason',
      filter_all_users: 'All', filter_active_users: 'Active', filter_blocked_users: 'Blacklist',
      th_status: 'Status',
      btn_copy: 'Copy', toast_copied: 'Copied to clipboard', toast_copy_failed: 'Could not copy',
      motion_fluid_label: 'Smooth animations', toast_accent_updated: 'Color updated', toast_motion_updated: 'Animation preference updated', toast_theme_updated: 'Appearance updated',
      desktop_notif_label: 'Desktop notifications', desktop_notif_hint: 'Get an OS-level pop-up alert for new tickets and comments, even when the tab is not active.',
      toast_desktop_notif_enabled: 'Desktop notifications enabled', toast_desktop_notif_disabled: 'Desktop notifications disabled',
      toast_desktop_notif_denied: 'Permission denied by the browser: enable notifications for this site in your browser settings',
      onboarding_list_hint: 'Manage onboarding requests for new hires and track progress on every checklist item.',
      btn_new_onboarding: 'New onboarding', field_employee_name: 'New hire name', onboarding_progress: 'Progress',
      field_requested_by: 'Requested by', table_created: 'Created on', no_onboarding_found: 'No onboarding requests.',
      onboarding_form_hint: 'Enter the new hire\'s details and pick the checklist items to activate for their setup.',
      field_employee_email: 'Personal email', field_start_date: 'Start date', field_existing_user_optional: 'Platform user (if already existing)',
      field_notes: 'Notes', onboarding_checklist_label: 'Items to activate', onboarding_attachment_label: 'Onboarding form (attachment)',
      onboarding_attachment_hint: 'You can attach the filled-in form (PDF or image): it will be viewable from the request.',
      btn_start_onboarding: 'Start onboarding', toast_onboarding_created: 'Onboarding started',
      onboarding_requested_by_label: 'Requested by', onboarding_details_title: 'Details',
      onboarding_group_prefix: 'Onboarding:', onboarding_group_open_suffix: 'open', onboarding_group_done_suffix: 'done',
      onboarding_group_all_done: 'All done', onboarding_ticket_link_label: 'Part of the onboarding for',
      onboarding_copy_from_label: 'Copy entitlements from', onboarding_license_label: 'License',
      onboarding_license_placeholder: 'e.g. E3, Business Standard...', onboarding_asset_created_prefix: 'Asset created:',
      onboarding_completed_by_prefix: 'Completed by', no_onboarding_items_hint: 'No items.',
      toast_onboarding_item_updated: 'Item updated', toast_onboarding_updated: 'Onboarding updated',
      btn_complete_all_onboarding: 'Complete all', confirm_complete_all_onboarding: 'Complete all items for this onboarding? All still-open linked tickets will be resolved.',
      toast_onboarding_completed_all: '{n} items completed',
      btn_delete_onboarding: 'Delete onboarding',
      confirm_delete_onboarding: 'Delete this onboarding? All still-open linked tickets will be cancelled.',
      toast_onboarding_deleted: 'Onboarding deleted',
      admin_onboarding_title: 'Onboarding — checklist items', admin_onboarding_hint: 'Define the items available for onboarding requests and which team they route to.',
      field_label_it: 'Name (IT)', field_label_en: 'Name (EN)', onboarding_kind_label: 'Item type', onboarding_routed_to_label: 'Routed to',
      btn_add_onboarding_item: 'Add item', onboarding_enabled_label: 'Enabled', confirm_delete_onboarding_item: 'Delete this item?',
      toast_onboarding_item_type_updated: 'Item updated', toast_onboarding_item_type_created: 'Item created', toast_onboarding_item_type_deleted: 'Item deleted',
      onboarding_status_open: 'Open', onboarding_status_in_progress: 'In progress', onboarding_status_completed: 'Completed', onboarding_status_cancelled: 'Cancelled',
      onboarding_item_pending: 'To do', onboarding_item_done: 'Done', onboarding_item_skipped: 'Skipped',
      onboarding_kind_checkbox: 'Simple activation', onboarding_kind_license: 'With license', onboarding_kind_copy_user: 'Copy entitlements from colleague', onboarding_kind_asset: 'Generate asset',
      onboarding_callout_title: 'Bringing a new person on board?', onboarding_callout_hint: 'Start an onboarding request: workstation, access and accounts, all tracked in one place.',
      admin_section_overview: 'Overview', admin_section_users: 'Users', admin_section_groups: 'Groups and org chart',
      admin_section_catalog: 'Catalog and fields', admin_section_automation: 'Automation', admin_section_onboarding: 'Onboarding',
      admin_section_org: 'Organization', admin_section_roles: 'Roles', admin_section_system: 'System',
      admin_section_companies: 'Companies',
      admin_companies_title: 'Company management', admin_companies_hint: 'Each company has its own title, logo, groups and users, separate from the others.',
      field_company_name: 'Internal name', field_company_display_name: 'Displayed title (optional)',
      btn_create_company: 'Create company', company_error_required: 'The internal name is required',
      name_required_error: 'The name is required',
      table_company: 'Company', table_members: 'Users', table_groups: 'Groups',
      company_active_label: 'Active', company_inactive_label: 'Deactivated',
      btn_deactivate: 'Deactivate', btn_activate: 'Activate',
      toast_company_created: 'Company created', toast_company_updated: 'Company updated', toast_company_deleted: 'Company deleted',
      confirm_delete_company: 'Delete this company? This is only possible if it has no users or groups left.',
      company_logo_label: 'Logo', no_companies_hint: 'No companies created yet.',
      field_company_select: 'Company', option_select_company: 'Select your company',
      company_select_required: 'Select your company to continue',
      timesheet_title: 'Hours', timesheet_hint: 'Log the start and end of your work shift.',
      timesheet_status_in_prefix: 'On the clock since', timesheet_status_out: 'You are not clocked in',
      btn_clock_in: 'Clock in', btn_clock_out: 'Clock out',
      timesheet_notes_placeholder: 'Notes for this shift (optional)',
      timesheet_history_title: 'Time entry history', th_clock_in: 'Clock in', th_clock_out: 'Clock out', th_duration: 'Duration',
      timesheet_no_entries: 'No time entries recorded yet.', timesheet_ongoing: 'ongoing',
      timesheet_manual_title: 'Add hours manually', timesheet_manual_hint: 'Record or correct a time entry by picking a date and time on the calendar.',
      timesheet_select_day_error: 'Select a day on the calendar first.',
      field_start_time: 'Start time', field_end_time: 'End time', btn_add_entry: 'Add',
      confirm_delete_time_entry: 'Delete this time entry?', toast_time_entry_added: 'Time entry added',
      toast_time_entry_updated: 'Time entry updated', toast_time_entry_deleted: 'Time entry deleted',
      timesheet_team_title: 'Team hours', timesheet_team_hint: 'Time entries for your team: your direct reports, or the whole company if you\'re an administrator.',
      timesheet_pay_title: 'Estimated monthly pay', timesheet_pay_hint: 'A rough estimate based on the hours clocked this month and the hourly wage you enter below. This value stays on this device only.',
      timesheet_pay_wage_label: 'Hourly wage', timesheet_pay_hours_label: 'Hours clocked this month', timesheet_pay_estimate_label: 'Estimated pay this month',
      toast_clocked_in: 'Clocked in', toast_clocked_out: 'Clocked out',
      admin_system_title: 'Server status', admin_system_hint: 'Real-time indicators of platform load, memory and technical limits (admin only).',
      admin_section_privacy: 'Data & Privacy',
      admin_privacy_title: 'Data and privacy', admin_privacy_hint: 'Where company data is stored, for how long, and how it is protected.',
      privacy_db_label: 'Database', privacy_db_turso: 'Turso (managed, persistent)', privacy_db_local: 'Local file (development only, not persistent)',
      privacy_attachments_label: 'Ticket attachments', privacy_attachments_db: 'In the database',
      privacy_backup_label: 'Backup', privacy_backup_pitr: 'Point-in-time recovery active (24 hours) + manual backup available',
      privacy_backup_none: 'No automatic backup (development environment)',
      privacy_categories_title: 'Categories of data handled and retention',
      privacy_cat_identity: 'User directory (name, email, role, department)', privacy_cat_tickets: 'Tickets, comments and attachments',
      privacy_cat_messages: 'Direct messages between colleagues', privacy_cat_notifications: 'Notifications (once read)',
      privacy_cat_audit: 'Activity log (audit log)', privacy_cat_timesheet: 'Time tracking, leave and permissions',
      privacy_ret_manual: 'Kept until an administrator deletes it',
      privacy_ret_auto_after: 'Automatically deleted after', privacy_days_unit: 'days',
      privacy_isolation_hint: 'Each company sees only its own data: isolation is enforced on every list, with an automatic check that blocks the response instead of returning it if a row outside the requester\'s scope were ever to appear.',
      privacy_transport_hint: 'All traffic between device, application and database travels encrypted over HTTPS.',
      system_uptime_label: 'Up for', system_memory_label: 'Memory (RSS)', system_requests_label: 'API requests (15 min)',
      system_requests_reset_prefix: 'resets in', system_requests_reset_suffix: 'min', system_requests_total_suffix: 'total since start',
      system_db_label: 'Database latency', system_db_error: 'Error', system_db_mode_turso: 'Turso with local replica', system_db_mode_local: 'Local file (not persistent)',
      system_eventloop_label: 'Event loop lag', system_eventloop_hint: 'Direct indicator of server overload',
      system_load_label: 'CPU load (1 min)', system_load_hint: 'of',
      system_online_users_label: 'Online users', system_online_staff_prefix: 'Staff:', system_online_customers_prefix: 'Users:',
      sidebar_status_ok: 'System: operational', sidebar_status_warning: 'System: attention', sidebar_status_danger: 'System: critical',
      system_overall_ok_title: 'All systems operational', system_overall_ok_hint: 'All indicators are within normal range.',
      system_overall_warning_title: 'Attention needed', system_overall_warning_hint: 'One or more indicators are approaching their limits: keep an eye on it.',
      system_overall_danger_title: 'Action required', system_overall_danger_hint: 'One or more indicators have crossed the critical threshold.',
      system_storage_title: 'Storage and usage', system_storage_hint: 'Database size and row counts for the main tables, to keep growth under control over time.',
      system_storage_db_size_label: 'Database size', system_storage_attachments_label: 'Attachments (tickets + onboarding)',
      system_storage_retention_hint: 'Automatic cleanup in place: direct messages after 14 days, read notifications after 90 days, activity log after 365 days.',
      storage_table_tickets: 'Tickets', storage_table_comments: 'Comments', storage_table_ticket_events: 'Ticket events',
      storage_table_ticket_attachments: 'Ticket attachments', storage_table_onboarding_attachments: 'Onboarding attachments',
      storage_table_notifications: 'Notifications', storage_table_audit_log: 'Activity log', storage_table_direct_messages: 'Direct messages',
      storage_table_users: 'Users',
      admin_roles_title: 'Custom roles', admin_roles_hint: 'Create roles with specific permissions to assign to staff, beyond Agent and Administrator.',
      field_color: 'Color', field_role_read_only: 'Read-only (cannot modify tickets)', field_role_permissions: 'Permissions',
      btn_add_role: 'Create role', no_roles_hint: 'No custom roles created yet.',
      confirm_delete_role: 'Permanently delete this role? Users with it assigned will revert to base permissions.',
      toast_role_created: 'Role created', toast_role_deleted: 'Role deleted',
      perm_automations_manage: 'Manage automations', perm_holidays_manage: 'Manage holidays and hours',
      perm_canned_responses_manage: 'Manage canned responses', perm_templates_manage: 'Manage ticket templates',
      perm_announcements_manage: 'Manage the announcements board',
      perm_users_manage: 'Manage people (create, edit, block, delete)', perm_groups_manage: 'Manage groups and org chart',
      announcements_hint: 'Official communications from your company.', btn_new_announcement: 'New announcement',
      field_announcement_title: 'Title', field_announcement_body: 'Announcement text', announcement_pinned_label: 'Pin to top of the board',
      format_bold: 'Bold', format_italic: 'Italic', format_heading: 'Heading', format_list: 'Bullet list', format_link: 'Link',
      announcement_format_hint: 'Bold **like this**, italic *like this*, # for a heading, - for a list, [text](url) for a link',
      announcement_targets_label: 'Recipients', announcement_targets_hint: 'Choose specific groups and/or people to notify. Leave empty to send it to the whole company.',
      announcement_files_title: 'Attached files', dropzone_hint: 'Drag files here or click to select',
      btn_pin: 'Pin', btn_unpin: 'Unpin', btn_edit: 'Edit',
      no_announcements_found: 'No announcements published yet.',
      toast_announcement_created: 'Announcement published', toast_announcement_updated: 'Announcement updated', toast_announcement_deleted: 'Announcement deleted',
      confirm_delete_announcement: 'Permanently delete this announcement?',
      perm_onboarding_catalog_manage: 'Manage onboarding catalog', perm_assets_delete: 'Delete assets',
      perm_audit_view: 'View audit', perm_reports_view: 'View reports', perm_tickets_delete: 'Delete tickets',
      onboarding_license_options_label: 'Selectable licenses', onboarding_license_options_placeholder: 'None, E5, F3, F3_1...',
      onboarding_addon_label_label: 'Add-on', onboarding_addon_label_placeholder: 'e.g. Dynamics',
      onboarding_pick_existing_user: 'Select an existing user...', onboarding_new_person_placeholder: 'or type the name if they are not an account yet',
      onboarding_addon_checkbox_prefix: 'Also request the',
      requester_context_title: 'Requester',
      nav_orgchart: 'Org chart', orgchart_hint: 'Team structure and manager hierarchy, visible to everyone.',
      orgchart_search_placeholder: 'Search a person by name...', orgchart_view_members: 'View members', no_users_found: 'No people found.',
      admin_block_drag_hint: 'Drag to reorder',
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
    dashboard: 'nav_dashboard', new: 'nav_new', search: 'nav_search', announcements: 'nav_announcements', directory: 'nav_directory', messages: 'nav_messages',
    assets: 'nav_assets', onboarding: 'nav_onboarding', timesheet: 'nav_timesheet', orgchart: 'nav_orgchart', rooms: 'nav_rooms', ideas: 'nav_ideas', wiki: 'nav_wiki', expenses: 'nav_expenses', report: 'nav_insights', admin: 'nav_admin', profile: 'nav_profile',
  };
  const NAV_ICON_BY_ROUTE = {
    dashboard: 'ticket', new: 'plus', search: 'inbox', announcements: 'megaphone', directory: 'users', messages: 'mail',
    assets: 'monitor', onboarding: 'userCircle', timesheet: 'clock', orgchart: 'globe', rooms: 'calendar', ideas: 'bulb', wiki: 'file', expenses: 'creditCard', report: 'activity', admin: 'shield', profile: 'userCircle',
  };

  const NAV_SECTION_KEY = { work: 'nav_section_work', team: 'nav_section_team', tools: 'nav_section_tools' };

  function applyChromeTranslations() {
    document.querySelectorAll('.main-nav a[data-nav]').forEach((a) => {
      const key = NAV_KEY_BY_ROUTE[a.dataset.nav];
      const iconName = NAV_ICON_BY_ROUTE[a.dataset.nav];
      if (key) a.innerHTML = `${icon(iconName, 'nav-icon')}<span class="nav-label">${t(key)}</span><span class="nav-dot" hidden></span>`;
    });
    document.querySelectorAll('.nav-section-label[data-nav-section]').forEach((el) => {
      const key = NAV_SECTION_KEY[el.dataset.navSection];
      if (key) el.textContent = t(key);
    });
    logoutBtn.innerHTML = `${icon('logout')} <span class="nav-label">${t('logout')}</span>`;
    refreshAnnouncementsNavDot();
    refreshMessagesNavDot();
    updateNavSectionVisibility();
  }

  function updateNavSectionVisibility() {
    document.querySelectorAll('.main-nav [data-nav-section]').forEach((label) => {
      const group = label.dataset.navSection;
      const links = document.querySelectorAll(`.main-nav a[data-nav-group="${group}"]`);
      const anyVisible = Array.from(links).some((a) => getComputedStyle(a).display !== 'none');
      label.hidden = !anyVisible;
    });
  }

  async function refreshAnnouncementsNavDot() {
    const dot = document.querySelector('.main-nav a[data-nav="announcements"] .nav-dot');
    if (!dot || !state.user) return;
    try {
      const { unreadCount } = await api('/announcements/unread-count');
      dot.hidden = !unreadCount;
    } catch {}
  }

  async function refreshMessagesNavDot() {
    const dot = document.querySelector('.main-nav a[data-nav="messages"] .nav-dot');
    if (!dot || !state.user) return;
    try {
      const { unreadCount } = await api('/messages/unread-count');
      dot.hidden = !unreadCount;
    } catch {}
  }

  const ACCENT_PRESETS = {
    bordeaux: {
      label: 'Bordeaux',
      light: { primary: '#8f2436', primaryDark: '#711c2b', primarySoft: '#f7e6e6' },
      dark: { primary: '#c9435c', primaryDark: '#e2758c', primarySoft: '#3d2228' },
    },
    blu: {
      label: 'Blu',
      light: { primary: '#1868a8', primaryDark: '#124e80', primarySoft: '#e1ecf5' },
      dark: { primary: '#4f9fd9', primaryDark: '#7cbdea', primarySoft: '#1c2e3d' },
    },
    verde: {
      label: 'Verde',
      light: { primary: '#1f7a4d', primaryDark: '#175c3a', primarySoft: '#e1f0e6' },
      dark: { primary: '#3fae76', primaryDark: '#6fcb98', primarySoft: '#1c3527' },
    },
    viola: {
      label: 'Viola',
      light: { primary: '#6a3fa0', primaryDark: '#52317d', primarySoft: '#ece3f7' },
      dark: { primary: '#9f75d1', primaryDark: '#bb9ce0', primarySoft: '#2b2440' },
    },
  };

  const THEME_MODES = ['light', 'dark', 'auto'];

  function getTheme() {
    const stored = localStorage.getItem('ticketing_theme');
    return THEME_MODES.includes(stored) ? stored : 'auto';
  }

  function resolveTheme() {
    const mode = getTheme();
    if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return mode;
  }

  function applyTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    applyAccent(getAccent());
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolveTheme() === 'dark' ? '#251e18' : '#8f2436');
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) toggleBtn.innerHTML = icon(resolveTheme() === 'dark' ? 'moon' : 'sun');
  }

  function setTheme(mode) {
    localStorage.setItem('ticketing_theme', mode);
    applyTheme(mode);
  }

  function getAccent() {
    return localStorage.getItem('ticketing_accent') || 'bordeaux';
  }

  function applyAccent(key) {
    const preset = ACCENT_PRESETS[key] || ACCENT_PRESETS.bordeaux;
    const variant = preset[resolveTheme()] || preset.light;
    const root = document.documentElement.style;
    root.setProperty('--primary', variant.primary);
    root.setProperty('--primary-dark', variant.primaryDark);
    root.setProperty('--primary-soft', variant.primarySoft);
  }

  function setAccent(key) {
    localStorage.setItem('ticketing_accent', key);
    applyAccent(key);
  }

  const HOSTED_DEFAULT_API_BASE = 'https://it-ticketing-api-2g68.onrender.com';

  function getApiBase() {
    const stored = localStorage.getItem('ticketing_api_base');
    if (stored) return stored.replace(/\/+$/, '');
    const host = location.hostname;
    if (host.endsWith('github.io') || host.endsWith('.pages.dev') || host === 'pages.dev' || host.endsWith('.workers.dev')) return HOSTED_DEFAULT_API_BASE;
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
    loadOrgBranding();
  }

  function updateChrome() {
    document.body.classList.remove('role-customer', 'role-agent', 'role-admin', 'super-admin', 'is-manager');
    document.body.className = document.body.className.replace(/\bperm-\S+/g, '').trim();
    if (state.user) {
      document.body.classList.add(`role-${state.user.role}`);
      if (state.user.is_super_admin) document.body.classList.add('super-admin');
      if (state.user.is_manager) document.body.classList.add('is-manager');
      if (Array.isArray(state.user.permissions)) {
        state.user.permissions.forEach((p) => document.body.classList.add(`perm-${p}`));
      }
      userBadge.innerHTML = `${icon('userCircle')} <span>${escapeHtml(state.user.name)} · ${roleLabels()[state.user.role] || state.user.role}</span>`;
      userBadge.style.display = '';
      logoutBtn.style.display = '';
      notifBtn.style.display = '';
      quickJumpBtn.style.display = '';
      if (!notifSocket) {
        loadNotifications();
        connectNotifSocket();
      }
      refreshAnnouncementsNavDot();
      if (state.user.role === 'admin') {
        if (!sidebarStatusTimer) startSidebarStatusPolling();
      } else {
        teardownSidebarStatusPolling();
      }
    } else {
      userBadge.style.display = 'none';
      logoutBtn.style.display = 'none';
      notifBtn.style.display = 'none';
      quickJumpBtn.style.display = 'none';
      notifDropdown.hidden = true;
      notifBadge.hidden = true;
      teardownNotifSocket();
      teardownSidebarStatusPolling();
      if (sidebarSystemStatus) sidebarSystemStatus.hidden = true;
    }
    updateNavSectionVisibility();
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
    state.viewAs = { id: user.id ?? null, name: user.name, role: user.role, group_id: user.group_id || null, is_super_admin: !!user.is_super_admin, roleOnly: !!user.roleOnly };
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
    setTicketTabs([]);
    renderTicketTabStrip();
    location.hash = '#/login';
  });

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.innerHTML = icon('settings');
  settingsBtn.addEventListener('click', () => { location.hash = '#/settings'; });

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  themeToggleBtn.addEventListener('click', () => {
    setTheme(resolveTheme() === 'dark' ? 'light' : 'dark');
    showToast(t('toast_theme_updated'), 'success');
  });

  const quickJumpBtn = document.getElementById('quickJumpBtn');
  const quickJumpOverlay = document.getElementById('quickJumpOverlay');
  const quickJumpInput = document.getElementById('quickJumpInput');
  const quickJumpResults = document.getElementById('quickJumpResults');
  quickJumpBtn.innerHTML = icon('search');

  let quickJumpDebounce;
  let quickJumpActiveIndex = -1;

  function openQuickJump() {
    if (!state.user) return;
    quickJumpOverlay.hidden = false;
    quickJumpInput.placeholder = t('quick_jump_placeholder');
    quickJumpInput.value = '';
    quickJumpResults.innerHTML = `<p class="cmdk-hint">${t('quick_jump_hint')}</p>`;
    quickJumpActiveIndex = -1;
    setTimeout(() => quickJumpInput.focus(), 0);
  }
  function closeQuickJump() {
    quickJumpOverlay.hidden = true;
  }
  quickJumpBtn.addEventListener('click', openQuickJump);
  quickJumpOverlay.addEventListener('click', (e) => { if (e.target === quickJumpOverlay) closeQuickJump(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (quickJumpOverlay.hidden) openQuickJump(); else closeQuickJump();
    } else if (e.key === 'Escape' && !quickJumpOverlay.hidden) {
      closeQuickJump();
    }
  });

  function updateQuickJumpActive(items) {
    items.forEach((it, i) => it.classList.toggle('cmdk-item-active', i === quickJumpActiveIndex));
    if (quickJumpActiveIndex >= 0) items[quickJumpActiveIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderQuickJumpResults(groups) {
    quickJumpActiveIndex = -1;
    if (!groups.length) {
      quickJumpResults.innerHTML = `<p class="cmdk-empty">${t('quick_jump_empty')}</p>`;
      return;
    }
    quickJumpResults.innerHTML = groups.map((g) => `
      <div class="cmdk-group">
        <div class="cmdk-group-label">${escapeHtml(g.label)}</div>
        ${g.items.map((item) => `<button type="button" class="cmdk-item" data-hash="${escapeHtml(item.hash)}" ${item.presetQuery ? `data-preset="${escapeHtml(item.presetQuery)}"` : ''}>${escapeHtml(item.label)}</button>`).join('')}
      </div>`).join('');

    quickJumpResults.querySelectorAll('.cmdk-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.preset) sessionStorage.setItem('ticketing_assets_query', btn.dataset.preset);
        location.hash = btn.dataset.hash;
        closeQuickJump();
      });
    });
  }

  async function runQuickJump(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      quickJumpResults.innerHTML = `<p class="cmdk-hint">${t('quick_jump_hint')}</p>`;
      return;
    }
    const groups = [];
    try {
      const { tickets } = await api(`/tickets?q=${encodeURIComponent(trimmed)}`);
      if (tickets.length) {
        groups.push({
          label: t('quick_jump_tickets'),
          items: tickets.slice(0, 5).map((tk) => ({ label: `#${formatTicketNumber(tk.id)} ${tk.subject}`, hash: `#/ticket/${tk.id}` })),
        });
      }
    } catch {}
    if (isStaff()) {
      try {
        const { users } = await api('/users');
        const lower = trimmed.toLowerCase();
        const matches = users.filter((u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower));
        if (matches.length) {
          groups.push({
            label: t('quick_jump_people'),
            items: matches.slice(0, 5).map((u) => ({ label: `${u.name} · ${u.email}`, hash: `#/users/${u.id}` })),
          });
        }
      } catch {}
      try {
        const { assets } = await api(`/assets?q=${encodeURIComponent(trimmed)}`);
        if (assets.length) {
          groups.push({
            label: t('quick_jump_assets'),
            items: assets.slice(0, 5).map((a) => ({ label: `${a.name}${a.tag ? ' · ' + a.tag : ''}`, hash: '#/assets', presetQuery: a.tag || a.name })),
          });
        }
      } catch {}
    }
    renderQuickJumpResults(groups);
  }

  quickJumpInput.addEventListener('input', () => {
    clearTimeout(quickJumpDebounce);
    quickJumpDebounce = setTimeout(() => runQuickJump(quickJumpInput.value), 200);
  });

  quickJumpInput.addEventListener('keydown', (e) => {
    const items = [...quickJumpResults.querySelectorAll('.cmdk-item')];
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      quickJumpActiveIndex = Math.min(quickJumpActiveIndex + 1, items.length - 1);
      updateQuickJumpActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      quickJumpActiveIndex = Math.max(quickJumpActiveIndex - 1, 0);
      updateQuickJumpActive(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = quickJumpActiveIndex >= 0 ? items[quickJumpActiveIndex] : items[0];
      if (target) target.click();
    }
  });

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
          <button type="button" class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-ticket-id="${n.ticket_id || ''}" data-kind="${n.kind || 'ticket'}" data-sender-id="${n.senderId || ''}">
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
        const kind = btn.dataset.kind;
        const senderId = btn.dataset.senderId;
        if (kind !== 'message') {
          try { await api(`/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
        }
        notifItems = notifItems.map((n) => (String(n.id) === id ? { ...n, is_read: 1 } : n));
        updateNotifBadge();
        notifDropdown.hidden = true;
        if (kind === 'message' && senderId) location.hash = `#/messages/${senderId}`;
        else if (ticketId) location.hash = `#/ticket/${ticketId}`;
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

  let sidebarStatusTimer = null;
  async function pollSidebarSystemStatus() {
    if (!sidebarSystemStatus) return;
    if (!state.user || state.user.role !== 'admin') {
      sidebarSystemStatus.hidden = true;
      return;
    }
    try {
      const status = await api('/admin/status');
      const severity = computeOverallSeverity(status);
      const dot = sidebarSystemStatus.querySelector('.sidebar-status-dot');
      const text = sidebarSystemStatus.querySelector('.sidebar-status-text');
      dot.className = `sidebar-status-dot${severity === 'ok' ? '' : ` status-${severity}`}`;
      text.textContent = t(`sidebar_status_${severity}`);
      sidebarSystemStatus.hidden = false;
    } catch {
      sidebarSystemStatus.hidden = true;
    }
  }
  function teardownSidebarStatusPolling() {
    if (sidebarStatusTimer) {
      clearInterval(sidebarStatusTimer);
      sidebarStatusTimer = null;
    }
  }
  function startSidebarStatusPolling() {
    teardownSidebarStatusPolling();
    pollSidebarSystemStatus();
    sidebarStatusTimer = setInterval(pollSidebarSystemStatus, 60000);
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
      socket.on('message:new', (message) => {
        showMessagePopup(message);
        refreshMessagesNavDot();
        notifItems = [{
          id: `msg-${message.id}`, kind: 'message', senderId: message.sender_id,
          message: `${message.sender_name}: ${message.body}`, is_read: 0, created_at: message.created_at,
        }, ...notifItems].slice(0, 30);
        updateNotifBadge();
        renderNotifDropdown();
        if (location.hash === `#/messages/${message.sender_id}`) route();
      });
      socket.on('message:edited', (message) => {
        if (location.hash === `#/messages/${message.sender_id}`) route();
      });
      socket.on('message:deleted', (payload) => {
        if (location.hash === `#/messages/${payload.senderId}`) route();
      });
      socket.on('conversation:deleted', (payload) => {
        if (location.hash === `#/messages/${payload.otherUserId}` || location.hash === '#/messages') route();
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

  const TICKET_TABS_KEY = 'ticketing_open_tabs';
  const TICKET_TABS_MAX = 10;

  function getTicketTabs() {
    try { return JSON.parse(localStorage.getItem(TICKET_TABS_KEY) || '[]'); } catch { return []; }
  }

  function setTicketTabs(tabs) {
    try { localStorage.setItem(TICKET_TABS_KEY, JSON.stringify(tabs)); } catch {}
  }

  function addTicketTab(ticket) {
    const tabs = getTicketTabs();
    const existing = tabs.find((tb) => tb.id === ticket.id);
    if (existing) {
      existing.subject = ticket.subject;
    } else {
      tabs.push({ id: ticket.id, subject: ticket.subject });
      if (tabs.length > TICKET_TABS_MAX) tabs.shift();
    }
    setTicketTabs(tabs);
    renderTicketTabStrip();
  }

  function removeTicketTab(id) {
    const tabs = getTicketTabs().filter((tb) => tb.id !== id);
    setTicketTabs(tabs);
    const hash = location.hash.replace(/^#\//, '');
    const [page, param] = hash.split('/');
    if (page === 'ticket' && Number(param) === id) {
      location.hash = tabs.length ? `#/ticket/${tabs[tabs.length - 1].id}` : '#/dashboard';
    } else {
      renderTicketTabStrip();
    }
  }

  function renderTicketTabStrip() {
    const stripEl = document.getElementById('ticketTabStrip');
    if (!stripEl) return;
    if (!state.user) { stripEl.hidden = true; return; }
    const tabs = getTicketTabs();
    if (!tabs.length) { stripEl.hidden = true; stripEl.innerHTML = ''; return; }
    const hash = location.hash.replace(/^#\//, '');
    const [page, param] = hash.split('/');
    const activeId = page === 'ticket' ? Number(param) : null;
    stripEl.hidden = false;
    stripEl.innerHTML = tabs.map((tb) => `
      <a href="#/ticket/${tb.id}" class="ticket-tab ${tb.id === activeId ? 'active' : ''}" title="${escapeHtml(tb.subject)}">
        <span class="ticket-tab-number">#${formatTicketNumber(tb.id)}</span>
        <span class="ticket-tab-subject">${escapeHtml(tb.subject)}</span>
        <span class="ticket-tab-close" data-close-tab="${tb.id}">${icon('x')}</span>
      </a>`).join('');
    stripEl.querySelectorAll('[data-close-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeTicketTab(Number(btn.dataset.closeTab));
      });
    });
  }

  async function route() {
    hideChartTooltip();
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
      const isInsightsLink = a.dataset.nav === 'report' && (page === 'report' || page === 'audit');
      a.classList.toggle('active', a.dataset.nav === page || isInsightsLink);
    });
    renderTicketTabStrip();

    if (page !== 'ticket') teardownTicketSocket();
    if (page !== 'dashboard') teardownDashboardAutoUpdate();
    if (page !== 'admin') teardownAdminSystemStatusPolling();

    appEl.classList.remove('route-fade');
    void appEl.offsetWidth;
    appEl.classList.add('route-fade');

    try {
      switch (page) {
        case 'login': return renderLogin();
        case 'register': return renderRegister();
        case 'dashboard': return renderDashboard();
        case 'new': return renderNewTicket();
        case 'announcements': return renderAnnouncements(param);
        case 'directory': return renderDirectory();
        case 'messages': return renderMessages(param);
        case 'ticket': return renderTicketDetail(param);
        case 'admin': return renderAdmin();
        case 'users': return renderUserDetail(param);
        case 'profile': return renderProfile();
        case 'settings': return renderSettings();
        case 'backlog':
          state.dashboardPresetFilter = 'unassigned';
          location.hash = '#/dashboard';
          return;
        case 'assets': return renderAssets();
        case 'onboarding': return renderOnboarding(param);
        case 'timesheet': return renderTimesheet();
        case 'orgchart': return renderOrgChartPublic();
        case 'rooms': return renderRooms();
        case 'ideas': return renderIdeas();
        case 'wiki': return renderWiki(param);
        case 'expenses': return renderExpenses();
        case 'search': return renderSearch();
        case 'report': return renderInsights('report');
        case 'audit': return renderInsights('audit');
        case 'asset-letters': return renderAssetLetterSign(param);
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
        const result = await api('/auth/login', { method: 'POST', body: { email, password } });
        if (result.requires_2fa) {
          renderLoginTwoFactorStep(result.challenge_token);
          return;
        }
        setSession(result.token, result.user);
        showToast(`${t('toast_welcome_back')}, ${result.user.name}`, 'success');
        location.hash = '#/dashboard';
        route();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function renderLoginTwoFactorStep(challengeToken) {
    const card = document.querySelector('.auth-card');
    if (!card) return;
    card.innerHTML = `
      <h1>${icon('shield')} ${t('twofa_login_title')}</h1>
      <p class="hint">${t('twofa_login_hint')}</p>
      <form id="twoFaLoginForm" class="form-grid">
        <div class="field">
          <label for="twoFaCode">${t('twofa_code_label')}</label>
          <input id="twoFaCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" required autocomplete="one-time-code" />
        </div>
        <p class="error-text" id="twoFaError"></p>
        <button class="btn btn-block" type="submit">${t('twofa_verify_submit')}</button>
      </form>
      <p class="hint"><a href="#" id="twoFaBack">${t('twofa_back_link')}</a></p>`;

    document.getElementById('twoFaBack').addEventListener('click', (e) => {
      e.preventDefault();
      renderLogin();
    });
    document.getElementById('twoFaCode').focus();

    guardForm(document.getElementById('twoFaLoginForm'), async () => {
      const code = document.getElementById('twoFaCode').value.trim();
      const errEl = document.getElementById('twoFaError');
      errEl.textContent = '';
      try {
        const { token, user } = await api('/auth/2fa/login', { method: 'POST', body: { challenge_token: challengeToken, code } });
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
            <div class="field" id="registerCompanyWrap" hidden>
              <label for="registerCompany">${t('field_company_select')}</label>
              <select id="registerCompany"></select>
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
              <div id="pwStrengthMeter" class="pw-strength-wrap"></div>
            </div>
            <div class="field">
              <label for="password2">${t('confirm_password_label')}</label>
              <div class="password-field">
                <input id="password2" type="password" required minlength="8" autocomplete="new-password" />
                <button type="button" id="pwToggle2" class="icon-btn password-toggle" aria-label="${t('show_password_label')}"></button>
              </div>
              <span class="hint" id="pwMatchHint"></span>
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
    attachPasswordStrength('password', 'pwStrengthMeter');
    attachPasswordMatch('password', 'password2', 'pwMatchHint');
    renderSsoButtons('ssoContainer');

    api('/companies/public').then(({ companies }) => {
      if (companies.length <= 1) return;
      const wrap = document.getElementById('registerCompanyWrap');
      const select = document.getElementById('registerCompany');
      select.innerHTML = `<option value="">${t('option_select_company')}</option>` +
        companies.map((c) => `<option value="${c.id}">${escapeHtml(c.display_name || c.name)}</option>`).join('');
      wrap.hidden = false;
    }).catch(() => {});

    guardForm(document.getElementById('registerForm'), async () => {
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;
      const companyWrap = document.getElementById('registerCompanyWrap');
      const companyId = companyWrap.hidden ? undefined : document.getElementById('registerCompany').value || undefined;
      const errEl = document.getElementById('registerError');
      errEl.textContent = '';
      if (password !== password2) {
        errEl.textContent = t('passwords_mismatch');
        return;
      }
      if (!companyWrap.hidden && !companyId) {
        errEl.textContent = t('company_select_required');
        return;
      }
      try {
        const { token, user } = await api('/auth/register', { method: 'POST', body: { name, email, password, companyId } });
        setSession(token, user);
        showToast(`${t('toast_account_created')} ${user.name}`, 'success');
        location.hash = '#/dashboard';
        route();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function passwordStrengthScore(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return score;
  }

  function attachPasswordStrength(inputId, meterId) {
    const input = document.getElementById(inputId);
    const meter = document.getElementById(meterId);
    if (!input || !meter) return;
    function update() {
      const pw = input.value;
      if (!pw) { meter.innerHTML = ''; return; }
      const score = passwordStrengthScore(pw);
      const level = score <= 1 ? { label: t('pw_strength_weak'), cls: 'pw-strength-weak', pct: 33 }
        : score <= 3 ? { label: t('pw_strength_medium'), cls: 'pw-strength-medium', pct: 66 }
        : { label: t('pw_strength_strong'), cls: 'pw-strength-strong', pct: 100 };
      meter.innerHTML = `
        <div class="pw-strength-bar"><div class="pw-strength-fill ${level.cls}" style="width:${level.pct}%"></div></div>
        <span class="pw-strength-label ${level.cls}">${level.label}</span>
        <ul class="pw-req-list">
          <li class="${pw.length >= 8 ? 'pw-req-met' : ''}">${icon('check', 'badge-icon')}${t('pw_req_length')}</li>
          <li class="${/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw) ? 'pw-req-met' : ''}">${icon('check', 'badge-icon')}${t('pw_req_letter_number')}</li>
        </ul>`;
    }
    input.addEventListener('input', update);
  }

  function attachPasswordMatch(pw1Id, pw2Id, targetId) {
    const pw1 = document.getElementById(pw1Id);
    const pw2 = document.getElementById(pw2Id);
    const target = document.getElementById(targetId);
    if (!pw1 || !pw2 || !target) return;
    function update() {
      if (!pw2.value) { target.textContent = ''; target.className = 'hint'; return; }
      if (pw1.value === pw2.value) {
        target.textContent = t('passwords_match_ok');
        target.className = 'success-text';
      } else {
        target.textContent = t('passwords_mismatch');
        target.className = 'error-text';
      }
    }
    pw1.addEventListener('input', update);
    pw2.addEventListener('input', update);
  }

  function isStaff() {
    return state.user && (state.user.role === 'agent' || state.user.role === 'admin');
  }

  function canAccessOnboarding() {
    return isStaff() || (state.user && state.user.is_manager);
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
    const selectable = !!opts.onSelect;
    const R = 15.9155;
    const CIRC = 2 * Math.PI * R;
    let cumulativeArc = 0;
    const segments = activeRows.map((r) => {
      const pct = (r.value / total) * 100;
      const dash = (pct / 100) * CIRC;
      const dashoffset = -cumulativeArc;
      cumulativeArc += dash;
      return { ...r, pct, dash, dashoffset };
    });
    return `
      <div class="donut-wrap">
        <div class="donut-chart-svg-wrap">
          <svg viewBox="0 0 42 42" class="donut-svg" role="img" aria-label="${activeRows.map((r) => `${r.label}: ${r.value}`).join(', ')}">
            <circle class="donut-ring-bg" cx="21" cy="21" r="${R}"></circle>
            ${segments.map((s) => `
              <circle class="donut-segment ${selectable ? 'selectable' : ''}" data-key="${escapeHtml(s.key)}" ${selectable ? 'tabindex="0" role="button"' : ''}
                cx="21" cy="21" r="${R}" stroke="${s.color}"
                stroke-dasharray="${s.dash} ${CIRC - s.dash}" stroke-dashoffset="${s.dashoffset}"><title>${escapeHtml(s.label)}: ${s.value} (${Math.round(s.pct)}%)</title></circle>`).join('')}
          </svg>
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
    const selectable = !!opts.onSelect;
    return `
      <div class="bar-chart" role="img" aria-label="${rows.map((r) => `${r.label}: ${r.value}`).join(', ')}">
        ${rows.map((r) => {
          const pct = total ? Math.round((r.value / total) * 100) : 0;
          const width = Math.round((r.value / max) * 100);
          return `
            <div class="bar-row ${selectable ? 'selectable' : ''}" data-key="${escapeHtml(r.key)}">
              <span class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${width}%;background:${r.color}"></div>
              </div>
              <span class="bar-value">${r.value}${suffix} ${showPct ? `<span class="bar-pct">(${pct}%)</span>` : ''}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  function lineChart(buckets, seriesDefs) {
    if (!buckets.length) return `<p class="hint">${t('no_data_available')}</p>`;
    const width = 720;
    const height = 220;
    const padding = 32;
    const maxVal = Math.max(1, ...buckets.flatMap((b) => seriesDefs.map((s) => b.values[s.key] || 0)));
    const stepX = buckets.length > 1 ? (width - padding * 2) / (buckets.length - 1) : 0;
    const scaleY = (v) => height - padding - (v / maxVal) * (height - padding * 2);
    const linesHtml = seriesDefs.map((s) => {
      const points = buckets.map((b, i) => `${padding + i * stepX},${scaleY(b.values[s.key] || 0)}`).join(' ');
      const dots = buckets.map((b, i) => `<circle cx="${padding + i * stepX}" cy="${scaleY(b.values[s.key] || 0)}" r="2.5" fill="${s.color}"><title>${escapeHtml(s.label)} · ${escapeHtml(b.label)}: ${b.values[s.key] || 0}</title></circle>`).join('');
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" />${dots}`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(buckets.length / 12));
    const xLabels = buckets.map((b, i) => (i % labelStep !== 0 && i !== buckets.length - 1) ? '' : `<text x="${padding + i * stepX}" y="${height - 8}" font-size="9" text-anchor="middle" fill="var(--muted)">${escapeHtml(b.label)}</text>`).join('');
    return `
      <div class="line-chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" role="img" aria-label="${seriesDefs.map((s) => s.label).join(', ')}">
          <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--border)" />
          ${linesHtml}
          ${xLabels}
        </svg>
        ${seriesDefs.length > 1 ? `
        <div class="line-chart-legend">
          ${seriesDefs.map((s) => `<span class="line-chart-legend-item"><span class="line-chart-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`).join('')}
        </div>` : ''}
      </div>`;
  }

  function dateBucketGranularity(spanDays) {
    if (spanDays <= 45) return 'day';
    if (spanDays <= 210) return 'week';
    return 'month';
  }

  function dateBucketKey(date, granularity) {
    if (granularity === 'day') return date.toISOString().slice(0, 10);
    if (granularity === 'week') {
      const monday = new Date(date);
      const dow = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - dow);
      return monday.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 7);
  }

  function enumerateDateBuckets(minDate, maxDate, granularity) {
    const keys = [];
    const cur = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate()));
    if (granularity === 'week') {
      const dow = (cur.getUTCDay() + 6) % 7;
      cur.setUTCDate(cur.getUTCDate() - dow);
    } else if (granularity === 'month') {
      cur.setUTCDate(1);
    }
    let guard = 0;
    while (cur <= maxDate && guard < 400) {
      keys.push(dateBucketKey(cur, granularity));
      if (granularity === 'day') cur.setUTCDate(cur.getUTCDate() + 1);
      else if (granularity === 'week') cur.setUTCDate(cur.getUTCDate() + 7);
      else cur.setUTCMonth(cur.getUTCMonth() + 1);
      guard += 1;
    }
    return keys;
  }

  function formatBucketLabel(key, granularity) {
    if (granularity === 'month') {
      const [y, m] = key.split('-');
      return `${m}/${y}`;
    }
    const [, m, d] = key.split('-');
    return `${d}/${m}`;
  }

  function wireChartInteractions(container, onRowClick) {
    container.querySelectorAll('.donut-legend-item.selectable, .donut-segment.selectable, .bar-row.selectable').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('donut-color-input')) return;
        onRowClick(el.dataset.key);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onRowClick(el.dataset.key);
      });
    });
    wireChartTooltips(container);
  }

  let chartTooltipEl = null;
  function getChartTooltip() {
    if (!chartTooltipEl) {
      chartTooltipEl = document.createElement('div');
      chartTooltipEl.className = 'chart-tooltip';
      document.body.appendChild(chartTooltipEl);
    }
    return chartTooltipEl;
  }

  function positionChartTooltip(el) {
    const tip = getChartTooltip();
    const rect = el.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top}px`;
  }

  function showChartTooltip(el, text) {
    if (!text) return;
    const tip = getChartTooltip();
    tip.textContent = text;
    positionChartTooltip(el);
    tip.classList.add('visible');
  }

  function hideChartTooltip() {
    if (chartTooltipEl) chartTooltipEl.classList.remove('visible');
  }

  function chartTooltipText(el) {
    if (el.classList.contains('donut-segment')) return el.querySelector('title')?.textContent || '';
    if (el.classList.contains('donut-legend-item')) {
      const label = el.querySelector('.donut-legend-label')?.textContent || '';
      const value = el.querySelector('.donut-legend-value')?.textContent || '';
      return label && value ? `${label}: ${value}` : '';
    }
    if (el.classList.contains('bar-row')) {
      const label = el.querySelector('.bar-label')?.textContent || '';
      const value = el.querySelector('.bar-value')?.textContent || '';
      return label && value ? `${label}: ${value}` : '';
    }
    return '';
  }

  function wireChartTooltips(container) {
    container.querySelectorAll('.donut-segment, .donut-legend-item, .bar-row').forEach((el) => {
      el.addEventListener('mouseenter', () => showChartTooltip(el, chartTooltipText(el)));
      el.addEventListener('mousemove', () => positionChartTooltip(el));
      el.addEventListener('mouseleave', hideChartTooltip);
      el.addEventListener('focus', () => showChartTooltip(el, chartTooltipText(el)));
      el.addEventListener('blur', hideChartTooltip);
    });
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
      <div id="assetLetterBanner" hidden></div>
      <div id="personalCounter"></div>
      <div id="statsRow" class="stat-row"></div>
      <div id="chartsRow" class="charts-row"></div>
      <div id="scopedChartsRow" class="charts-row"></div>
      ${isStaff() && !viewingAs ? `
      <div class="widgets-section-head">
        <h2 class="section-title">${t('widgets_section_title')}</h2>
        <button type="button" id="widgetsCollapseAllBtn" class="btn btn-ghost btn-sm">${icon('grid', 'badge-icon')} ${t('widgets_collapse_all_btn')}</button>
        <button type="button" id="widgetsCustomizeBtn" class="btn btn-ghost btn-sm">${icon('grid', 'badge-icon')} ${t('widgets_customize_btn')}</button>
      </div>
      <div id="widgetsPanel" class="widgets-customize-panel" hidden></div>
      <div id="dashboardWidgets" class="dashboard-widgets"></div>` : ''}
      <div class="filters">
        ${isStaff() && !viewingAs ? `
        <select id="fAssigned">
          <option value="">${t('filter_all_assignees')}</option>
          <option value="me">${t('filter_assigned_me')}</option>
          <option value="unassigned">${t('filter_unassigned')}</option>
        </select>` : ''}
        <input id="fQuery" type="search" placeholder="${isStaff() ? t('search_placeholder_staff') : t('search_placeholder_customer')}" />
      </div>
      <div id="activeFilterChips" class="active-filter-chips" hidden></div>
      ${isStaff() && !viewingAs ? `
      <div id="bulkBar" class="bulk-action-bar" hidden>
        <span id="bulkCount" class="hint"></span>
        <select id="bulkAssignSel"><option value="">${t('bulk_assign_placeholder')}</option></select>
        <select id="bulkStatusSel">
          <option value="">${t('bulk_status_placeholder')}</option>
          ${Object.entries(statusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        ${state.user.role === 'admin' ? `<button type="button" id="bulkDeleteBtn" class="btn btn-outline-danger btn-sm">${icon('trash')} ${t('bulk_delete_btn')}</button>` : ''}
        <button type="button" id="bulkClearBtn" class="btn btn-ghost btn-sm">${t('bulk_clear_selection')}</button>
      </div>` : ''}
      <div id="ticketTruncatedHint" class="hint" hidden></div>
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
            <div class="impersonate-role-section">
              <label>${t('impersonate_role_label')}</label>
              <div class="impersonate-role-buttons">
                <button type="button" class="btn btn-ghost btn-sm" data-role="customer">${roleLabels().customer}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-role="agent">${roleLabels().agent}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-role="admin">${roleLabels().admin}</button>
              </div>
              <div id="impersonateRoleGroupWrap" class="field" hidden>
                <label for="impersonateRoleGroup">${t('impersonate_role_group_label')}</label>
                <select id="impersonateRoleGroup"></select>
                <button type="button" id="impersonateRoleGroupConfirm" class="btn btn-sm" style="margin-top:0.5rem">${t('impersonate')}</button>
              </div>
            </div>
          </div>`;
        const { users } = await api('/users');
        const roleGroups = await api('/groups').then((r) => r.groups).catch(() => []);
        const roleGroupWrap = document.getElementById('impersonateRoleGroupWrap');
        const roleGroupSelect = document.getElementById('impersonateRoleGroup');
        panel.querySelectorAll('.impersonate-role-buttons button[data-role]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const role = btn.dataset.role;
            if (role === 'agent') {
              roleGroupSelect.innerHTML = groupOptionsHtml(roleGroups, '', t('all_groups_option'));
              roleGroupWrap.hidden = false;
              return;
            }
            startImpersonation({ id: null, name: roleLabels()[role], role, group_id: null, is_super_admin: false, roleOnly: true });
          });
        });
        document.getElementById('impersonateRoleGroupConfirm').addEventListener('click', () => {
          startImpersonation({ id: null, name: roleLabels().agent, role: 'agent', group_id: roleGroupSelect.value ? Number(roleGroupSelect.value) : null, is_super_admin: false, roleOnly: true });
        });
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

    if (!viewingAs) {
      api('/asset-letters?mine=1&pending=1').then(({ letters }) => {
        const banner = document.getElementById('assetLetterBanner');
        if (!banner || !letters.length) return;
        banner.hidden = false;
        banner.className = 'presence-banner asset-letter-banner';
        const text = letters.length === 1 ? t('asset_letter_banner_one') : t('asset_letter_banner_many').replace('{n}', letters.length);
        banner.innerHTML = `${icon('file', 'badge-icon')} <span>${text}</span> <a class="btn btn-ghost btn-sm" href="#/asset-letters/${letters[0].id}">${t('btn_review_and_sign')}</a>`;
      }).catch(() => {});
    }

    const listEl = document.getElementById('ticketList');
    const truncatedHintEl = document.getElementById('ticketTruncatedHint');
    const statsEl = document.getElementById('statsRow');
    const personalEl = document.getElementById('personalCounter');
    const chartsEl = document.getElementById('chartsRow');
    const scopedChartsEl = document.getElementById('scopedChartsRow');
    const fAssigned = document.getElementById('fAssigned');
    const fQuery = document.getElementById('fQuery');
    const activeFilterChipsEl = document.getElementById('activeFilterChips');
    const activeFilters = { status: '', priority: '', type: '' };

    function renderActiveFilterChips() {
      const dims = [
        { key: 'status', prefix: t('filter_chip_status'), labels: statusLabels() },
        { key: 'priority', prefix: t('filter_chip_priority'), labels: priorityLabels() },
        { key: 'type', prefix: t('filter_chip_type'), labels: typeLabels() },
      ].filter((d) => activeFilters[d.key]);
      activeFilterChipsEl.hidden = !dims.length;
      activeFilterChipsEl.innerHTML = dims.map((d) => `
        <span class="filter-chip">
          ${d.prefix}: ${escapeHtml(d.labels[activeFilters[d.key]] || activeFilters[d.key])}
          <button type="button" class="filter-chip-remove" data-dim="${d.key}" title="${t('filter_chip_remove_title')}">${icon('x')}</button>
        </span>`).join('');
      activeFilterChipsEl.querySelectorAll('.filter-chip-remove').forEach((btn) => {
        btn.addEventListener('click', () => setFilter(btn.dataset.dim, ''));
      });
    }

    function setFilter(dim, value) {
      activeFilters[dim] = activeFilters[dim] === value ? '' : value;
      renderActiveFilterChips();
      load();
    }

    if (fAssigned && state.dashboardPresetFilter) {
      fAssigned.value = state.dashboardPresetFilter;
      delete state.dashboardPresetFilter;
    }

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

    const bulkBar = document.getElementById('bulkBar');
    const bulkCount = document.getElementById('bulkCount');
    const bulkAssignSel = document.getElementById('bulkAssignSel');
    const bulkStatusSel = document.getElementById('bulkStatusSel');
    const bulkClearBtn = document.getElementById('bulkClearBtn');
    const selected = new Set();

    if (bulkAssignSel) {
      api('/users').then(({ users }) => {
        const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
        bulkAssignSel.innerHTML = `<option value="">${t('bulk_assign_placeholder')}</option>` +
          staffUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
      }).catch(() => {});
    }

    function updateBulkBar() {
      if (!bulkBar) return;
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

    if (bulkClearBtn) {
      bulkClearBtn.addEventListener('click', () => {
        selected.clear();
        wireSelectionCheckboxes();
        updateBulkBar();
      });
    }

    if (bulkAssignSel) {
      bulkAssignSel.addEventListener('change', async () => {
        if (!bulkAssignSel.value || !selected.size) return;
        const assignedTo = Number(bulkAssignSel.value);
        try {
          await Promise.all([...selected].map((id) => api(`/tickets/${id}`, { method: 'PATCH', body: { assigned_to: assignedTo } })));
          showToast(t('toast_bulk_assigned'), 'success');
          selected.clear();
          bulkAssignSel.value = '';
          load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    if (bulkStatusSel) {
      bulkStatusSel.addEventListener('change', async () => {
        if (!bulkStatusSel.value || !selected.size) return;
        const status = bulkStatusSel.value;
        try {
          await Promise.all([...selected].map((id) => api(`/tickets/${id}`, { method: 'PATCH', body: { status } })));
          showToast(t('toast_bulk_status_updated'), 'success');
          selected.clear();
          bulkStatusSel.value = '';
          load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', async () => {
        if (!selected.size) return;
        if (!confirm(`${t('confirm_bulk_delete_tickets_prefix')} ${selected.size}${t('confirm_bulk_delete_tickets_suffix')}`)) return;
        try {
          await Promise.all([...selected].map((id) => api(`/tickets/${id}`, { method: 'DELETE' })));
          showToast(t('toast_bulk_deleted'), 'success');
          selected.clear();
          load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const dashboardWidgetsEl = document.getElementById('dashboardWidgets');
    const widgetsPanel = document.getElementById('widgetsPanel');
    const widgetsCustomizeBtn = document.getElementById('widgetsCustomizeBtn');
    const widgetsCollapseAllBtn = document.getElementById('widgetsCollapseAllBtn');
    const DASHBOARD_WIDGETS = [
      { id: 'unassignedByGroup', title: t('widget_unassigned_by_group_title') },
      { id: 'slaWatch', title: t('widget_sla_watch_title') },
    ];
    let widgetsData = null;

    function getHiddenWidgets() {
      try { return new Set(JSON.parse(localStorage.getItem('ticketing_dashboard_widget_hidden') || '[]')); } catch { return new Set(); }
    }
    function setHiddenWidgets(set) {
      try { localStorage.setItem('ticketing_dashboard_widget_hidden', JSON.stringify([...set])); } catch {}
    }
    function getCollapsedWidgets() {
      try { return new Set(JSON.parse(localStorage.getItem('ticketing_dashboard_widget_collapsed') || '[]')); } catch { return new Set(); }
    }
    function setCollapsedWidgets(set) {
      try { localStorage.setItem('ticketing_dashboard_widget_collapsed', JSON.stringify([...set])); } catch {}
    }

    function renderUnassignedByGroupWidget(tickets) {
      const body = document.getElementById('widget-unassignedByGroup');
      if (!body) return;
      const unassigned = tickets.filter((tk) => !tk.assignee_name && tk.status !== 'resolved' && tk.status !== 'closed');
      if (!unassigned.length) {
        body.innerHTML = `<p class="hint">${t('widget_unassigned_by_group_empty')}</p>`;
        return;
      }
      const counts = new Map();
      unassigned.forEach((tk) => {
        const key = groupLabel(tk) || t('no_group_label');
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      body.innerHTML = `<div class="widget-tile-grid">${sorted.map(([name, count]) => `
        <div class="widget-tile">
          <div class="widget-tile-value">${count}</div>
          <div class="widget-tile-label">${escapeHtml(name)}</div>
        </div>`).join('')}</div>`;
    }

    function renderSlaWatchWidget(tickets) {
      const body = document.getElementById('widget-slaWatch');
      if (!body) return;
      const atRisk = tickets
        .filter((tk) => (tk.sla_status === 'at_risk' || tk.sla_status === 'breached') && tk.status !== 'resolved' && tk.status !== 'closed')
        .sort((a, b) => {
          if (a.sla_status !== b.sla_status) return a.sla_status === 'breached' ? -1 : 1;
          return (a.sla_remaining_ms ?? 0) - (b.sla_remaining_ms ?? 0);
        })
        .slice(0, 8);
      if (!atRisk.length) {
        body.innerHTML = `<p class="hint">${t('widget_sla_watch_empty')}</p>`;
        return;
      }
      body.innerHTML = `<div class="sla-watch-list">${atRisk.map((tk) => {
        const totalMs = (tk.sla_resolve_hours || 0) * 3600 * 1000;
        const overdue = tk.sla_status === 'breached';
        const elapsedPct = totalMs ? Math.max(0, Math.round((1 - (tk.sla_remaining_ms || 0) / totalMs) * 100)) : null;
        return `
        <a class="sla-watch-row" href="#/ticket/${tk.id}">
          <div class="sla-watch-row-top">
            <span class="sla-watch-number">#${formatTicketNumber(tk.id)}</span>
            <span class="sla-watch-subject">${escapeHtml(tk.subject)}</span>
            <span class="badge badge-sla-${tk.sla_status}">${slaLabels()[tk.sla_status]}</span>
          </div>
          ${elapsedPct !== null ? `
          <div class="sla-watch-bar">
            <div class="sla-watch-bar-fill ${overdue ? 'sla-watch-bar-over' : ''}" style="width:${Math.min(100, elapsedPct)}%"></div>
          </div>
          <div class="sla-watch-meta">
            ${tk.assignee_name ? escapeHtml(tk.assignee_name) : t('list_unassigned')} · ${overdue ? t('widget_sla_overdue_label') : `${elapsedPct}% ${t('widget_sla_elapsed_label')}`}
          </div>` : ''}
        </a>`;
      }).join('')}</div>`;
    }

    function refreshVisibleWidgets() {
      if (widgetsData) {
        renderUnassignedByGroupWidget(widgetsData);
        renderSlaWatchWidget(widgetsData);
      }
    }

    async function loadWidgetsData() {
      if (!dashboardWidgetsEl) return;
      try {
        const { tickets: allTickets } = await api('/tickets');
        widgetsData = allTickets;
        refreshVisibleWidgets();
      } catch (err) {
        DASHBOARD_WIDGETS.forEach((w) => {
          const body = document.getElementById(`widget-${w.id}`);
          if (body) body.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        });
      }
    }

    function renderDashboardWidgetsShell() {
      if (!dashboardWidgetsEl) return;
      const hidden = getHiddenWidgets();
      const collapsed = getCollapsedWidgets();
      const visible = DASHBOARD_WIDGETS.filter((w) => !hidden.has(w.id));
      if (!visible.length) {
        dashboardWidgetsEl.innerHTML = `<p class="hint">${t('widgets_all_hidden_hint')}</p>`;
        return;
      }
      dashboardWidgetsEl.innerHTML = visible.map((w) => `
        <div class="card widget-card ${collapsed.has(w.id) ? 'collapsed' : ''}" data-block-id="${w.id}">
          <div class="chart-card-head">
            <h3 class="section-title" style="margin:0">${escapeHtml(w.title)}</h3>
            <button type="button" class="icon-btn widget-collapse-toggle" data-widget-id="${w.id}" title="${t('widget_collapse_toggle_title')}">${icon('chevronDown')}</button>
          </div>
          <div id="widget-${w.id}" class="widget-body"><div class="spinner-row">${t('loading')}</div></div>
        </div>`).join('');
      applyBlockOrder('dashboard_widget_order', '#dashboardWidgets .widget-card');
      wireBlockDragging('dashboard_widget_order', '#dashboardWidgets .widget-card', '.chart-card-head', () => applyBlockOrder('dashboard_widget_order', '#dashboardWidgets .widget-card'));
      dashboardWidgetsEl.querySelectorAll('.widget-collapse-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const set = getCollapsedWidgets();
          if (set.has(btn.dataset.widgetId)) set.delete(btn.dataset.widgetId);
          else set.add(btn.dataset.widgetId);
          setCollapsedWidgets(set);
          btn.closest('.widget-card').classList.toggle('collapsed');
        });
      });
    }

    function renderWidgetsPanel() {
      if (!widgetsPanel) return;
      const hidden = getHiddenWidgets();
      widgetsPanel.innerHTML = DASHBOARD_WIDGETS.map((w) => `
        <label class="widget-toggle">
          <input type="checkbox" data-widget-id="${w.id}" ${hidden.has(w.id) ? '' : 'checked'} />
          ${escapeHtml(w.title)}
        </label>`).join('');
      widgetsPanel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const hiddenSet = getHiddenWidgets();
          if (cb.checked) hiddenSet.delete(cb.dataset.widgetId);
          else hiddenSet.add(cb.dataset.widgetId);
          setHiddenWidgets(hiddenSet);
          renderDashboardWidgetsShell();
          refreshVisibleWidgets();
        });
      });
    }

    if (widgetsCustomizeBtn) {
      widgetsCustomizeBtn.addEventListener('click', () => {
        widgetsPanel.hidden = !widgetsPanel.hidden;
        if (!widgetsPanel.hidden) renderWidgetsPanel();
      });
    }

    if (widgetsCollapseAllBtn) {
      widgetsCollapseAllBtn.addEventListener('click', () => {
        const hidden = getHiddenWidgets();
        const visible = DASHBOARD_WIDGETS.filter((w) => !hidden.has(w.id));
        const collapsed = getCollapsedWidgets();
        const allCollapsed = visible.length > 0 && visible.every((w) => collapsed.has(w.id));
        const next = new Set(allCollapsed ? [] : visible.map((w) => w.id));
        setCollapsedWidgets(next);
        dashboardWidgetsEl.querySelectorAll('.widget-card').forEach((card) => {
          card.classList.toggle('collapsed', next.has(card.dataset.blockId));
        });
        widgetsCollapseAllBtn.innerHTML = `${icon('grid', 'badge-icon')} ${allCollapsed ? t('widgets_collapse_all_btn') : t('widgets_expand_all_btn')}`;
      });
    }

    if (dashboardWidgetsEl) {
      renderDashboardWidgetsShell();
      loadWidgetsData();
    }

    function statsCountsFromTickets(tickets) {
      const counts = { open: 0, in_progress: 0, waiting_customer: 0, resolved: 0, closed: 0, urgent: 0, incident: 0, task: 0 };
      tickets.forEach((tk) => {
        counts[tk.status] = (counts[tk.status] || 0) + 1;
        counts[tk.type] = (counts[tk.type] || 0) + 1;
        if (tk.priority === 'urgent' && tk.status !== 'closed' && tk.status !== 'resolved') counts.urgent += 1;
      });
      return counts;
    }

    function renderStats(tickets, overrideCounts) {
      const counts = overrideCounts || statsCountsFromTickets(tickets);
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
          if (card.dataset.status !== undefined) setFilter('status', card.dataset.status);
          else if (card.dataset.priority !== undefined) setFilter('priority', card.dataset.priority);
          else if (card.dataset.type !== undefined) setFilter('type', card.dataset.type);
        });
      });
    }

    function renderPersonalCounter(tickets, overrideValue) {
      if (viewingAs && viewingAs.roleOnly) {
        personalEl.innerHTML = `<p class="hint">${t('viewing_as_role_no_personal_counter')}</p>`;
        return;
      }
      let value, label;
      const asId = viewingAs ? viewingAs.id : state.user.id;
      const asStaff = viewingAs ? viewingAs.role !== 'customer' : isStaff();
      if (asStaff) {
        value = overrideValue != null ? overrideValue : tickets.filter((tk) => tk.assigned_to === asId && tk.status !== 'resolved' && tk.status !== 'closed').length;
        label = viewingAs ? `${viewingAs.name} — ${t('personal_counter_staff')}` : t('personal_counter_staff');
      } else {
        value = overrideValue != null ? overrideValue : tickets.filter((tk) => tk.status === 'open' || tk.status === 'in_progress').length;
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
          ${barChart(rows, tickets.length, { onSelect: filterableDims.includes(currentChartDim) })}
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

      if (filterableDims.includes(currentChartDim)) {
        wireChartInteractions(chartsEl.querySelector('.chart-card-wide'), (key) => {
          setFilter(currentChartDim, key);
          listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else {
        wireChartTooltips(chartsEl.querySelector('.chart-card-wide'));
      }

      chartsEl.querySelectorAll('.chart-card[data-dim]').forEach((card) => {
        const dim = card.dataset.dim;
        if (filterableDims.includes(dim)) {
          wireChartInteractions(card, (key) => {
            setFilter(dim, key);
            listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        } else {
          wireChartTooltips(card);
        }
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
          ${total ? donutChart(rows, total, { dim, onSelect: true }) : `<p class="hint">${escapeHtml(emptyHint)}</p>`}
        </div>`;
    }

    async function renderScopedCharts() {
      const targetRole = viewingAs ? viewingAs.role : state.user.role;
      if (targetRole === 'customer') { scopedChartsEl.innerHTML = ''; return; }

      if (viewingAs && viewingAs.roleOnly) {
        if (!viewingAs.group_id) { scopedChartsEl.innerHTML = ''; return; }
        const { tickets } = await api(`/tickets?group=${viewingAs.group_id}`).catch(() => ({ tickets: [] }));
        const teamRows = computeBreakdown(tickets, 'status');
        const group = (await api('/groups').then((r) => r.groups).catch(() => [])).find((g) => g.id === viewingAs.group_id);
        const groupName = group ? (group.parent_name ? `${group.parent_name} / ${group.name}` : group.name) : t('chart_team_title');
        scopedChartsEl.innerHTML = scopedChartCard('status', groupName, teamRows, tickets.length, t('chart_no_team'));
        return;
      }

      const targetId = viewingAs ? viewingAs.id : state.user.id;
      const usersPromise = api('/users').catch(() => ({ users: [] }));
      const minePromise = api(`/tickets?assigned=${targetId}`).catch(() => ({ tickets: [] }));

      let groupId = null;
      let groupName = '';
      const { users } = await usersPromise;
      const me = users.find((u) => u.id === targetId);
      if (me && me.group_id) {
        groupId = me.group_id;
        groupName = me.group_parent_name ? `${me.group_parent_name} / ${me.group_name}` : me.group_name;
      }

      const [mineData, teamData] = await Promise.all([
        minePromise,
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
      scopedChartsEl.querySelectorAll('.chart-card[data-dim]').forEach((card) => {
        const dim = card.dataset.dim;
        if (!filterableDims.includes(dim)) return;
        wireChartInteractions(card, (key) => {
          setFilter(dim, key);
          listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    let groupByTeam = false;
    function renderGroupedTicketList(container, tickets, opts = {}) {
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
          <div class="ticket-list">${ticketListHeaderHtml()}${ticketRowsHtml(groups.get(key), opts)}</div>
        </div>`).join('');
      wireTicketCardActions(container);
      wireTicketListColumnResize(container);
    }

    let debounceTimer;
    async function load() {
      const params = new URLSearchParams();
      if (activeFilters.type) params.set('type', activeFilters.type);
      if (activeFilters.status) params.set('status', activeFilters.status);
      if (activeFilters.priority) params.set('priority', activeFilters.priority);
      if (fAssigned && fAssigned.value) params.set('assigned', fAssigned.value);
      if (fQuery.value.trim()) params.set('q', fQuery.value.trim());
      if (viewingAs && viewingAs.role === 'customer' && viewingAs.id != null) {
        params.set('createdBy', viewingAs.id);
      }

      try {
        const roleOnlyCustomerEmpty = viewingAs && viewingAs.role === 'customer' && viewingAs.id == null;
        const { tickets: fetched, truncated } = roleOnlyCustomerEmpty ? { tickets: [] } : await api(`/tickets?${params.toString()}`);
        const applyGroupFilter = viewingAs && viewingAs.role !== 'customer' && !viewingAs.is_super_admin && !(viewingAs.roleOnly && !viewingAs.group_id);
        const tickets = applyGroupFilter
          ? fetched.filter((tk) => !tk.group_id || tk.group_id === viewingAs.group_id)
          : fetched;
        if (fAssigned && fAssigned.value === 'unassigned') {
          const slaOrder = { breached: 0, at_risk: 1, on_track: 2 };
          tickets.sort((a, b) => {
            const sa = slaOrder[a.sla_status] ?? 3;
            const sb = slaOrder[b.sla_status] ?? 3;
            if (sa !== sb) return sa - sb;
            return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
          });
        }
        lastTickets = tickets;
        renderStats(tickets);
        renderPersonalCounter(tickets);
        renderCharts(tickets);
        renderScopedCharts();
        if (truncatedHintEl) {
          truncatedHintEl.hidden = !truncated || !!viewingAs;
          if (truncated && !viewingAs) truncatedHintEl.textContent = t('ticket_list_truncated_hint');
        }
        if (!viewingAs && !roleOnlyCustomerEmpty) {
          api(`/tickets/stats?${params.toString()}`)
            .then(({ counts, personalCount }) => {
              renderStats(tickets, counts);
              renderPersonalCounter(tickets, personalCount);
            })
            .catch(() => {});
        }
        const showClosed = activeFilters.status === 'resolved' || activeFilters.status === 'closed';
        const listTickets = showClosed ? tickets : tickets.filter((tk) => tk.status !== 'resolved' && tk.status !== 'closed');
        if (bulkBar) {
          const currentIds = new Set(listTickets.map((tk) => tk.id));
          [...selected].forEach((id) => { if (!currentIds.has(id)) selected.delete(id); });
        }
        const listOpts = { selectable: !!bulkBar };
        if (groupByTeam) renderGroupedTicketList(listEl, listTickets, listOpts);
        else renderTicketList(listEl, listTickets, listOpts);
        if (bulkBar) {
          wireSelectionCheckboxes();
          updateBulkBar();
        }
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

    if (fAssigned) fAssigned.addEventListener('change', load);
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

  const TICKET_LIST_COL_DEFAULT = { requester: 120, assignee: 120, group: 132, priority: 78, status: 126, updated: 150 };
  const TICKET_LIST_COL_MIN = { requester: 70, assignee: 70, group: 70, priority: 64, status: 96, updated: 110 };
  const TICKET_LIST_COL_MAX = 420;

  function getTicketListColWidths() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('ticketing_list_col_widths') || '{}'); } catch { stored = {}; }
    const widths = { ...TICKET_LIST_COL_DEFAULT };
    Object.keys(widths).forEach((key) => {
      if (typeof stored[key] === 'number' && stored[key] >= TICKET_LIST_COL_MIN[key] && stored[key] <= TICKET_LIST_COL_MAX) {
        widths[key] = stored[key];
      }
    });
    return widths;
  }

  function setTicketListColWidths(widths) {
    try { localStorage.setItem('ticketing_list_col_widths', JSON.stringify(widths)); } catch {}
  }

  function ticketListGridTemplateValue(widths) {
    return `22px 76px minmax(140px, 2fr) ${widths.requester}px ${widths.assignee}px ${widths.group}px ${widths.priority}px ${widths.status}px ${widths.updated}px 40px`;
  }

  function applyTicketListColWidths(widths) {
    document.documentElement.style.setProperty('--tl-grid', ticketListGridTemplateValue(widths || getTicketListColWidths()));
  }

  function wireTicketListColumnResize(container) {
    container.querySelectorAll('.col-resize-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const col = handle.dataset.col;
        const startX = e.clientX;
        const widths = getTicketListColWidths();
        const startWidth = widths[col];
        const min = TICKET_LIST_COL_MIN[col] || 60;
        handle.classList.add('col-resizing');
        document.body.classList.add('col-resizing-active');
        function onMove(ev) {
          const delta = ev.clientX - startX;
          widths[col] = Math.min(TICKET_LIST_COL_MAX, Math.max(min, startWidth + delta));
          applyTicketListColWidths(widths);
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          handle.classList.remove('col-resizing');
          document.body.classList.remove('col-resizing-active');
          setTicketListColWidths(widths);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      handle.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const col = handle.dataset.col;
        const widths = getTicketListColWidths();
        widths[col] = TICKET_LIST_COL_DEFAULT[col];
        applyTicketListColWidths(widths);
        setTicketListColWidths(widths);
      });
    });
  }

  function ticketListHeaderHtml() {
    applyTicketListColWidths();
    const resizeHandle = (col) => `<span class="col-resize-handle" data-col="${col}" title="${t('list_col_resize_hint')}"></span>`;
    return `
      <div class="ticket-list-header">
        <span class="ticket-row-col-type"></span>
        <span class="ticket-row-col-number">${t('list_col_number')}</span>
        <span class="ticket-row-col-subject">${t('list_col_subject')}</span>
        <span class="ticket-row-col-requester">${t('list_col_requester')}${resizeHandle('requester')}</span>
        <span class="ticket-row-col-assignee">${t('list_col_assignee')}${resizeHandle('assignee')}</span>
        <span class="ticket-row-col-group">${t('list_col_group')}${resizeHandle('group')}</span>
        <span class="ticket-row-col-priority">${t('list_col_priority')}${resizeHandle('priority')}</span>
        <span class="ticket-row-col-status">${t('list_col_status')}${resizeHandle('status')}</span>
        <span class="ticket-row-col-updated">${t('list_col_updated')}${resizeHandle('updated')}</span>
        <span class="ticket-row-col-actions"></span>
      </div>`;
  }

  function ticketRowHtml(tk, opts = {}) {
    const countdown = formatSlaCountdown(tk.sla_remaining_ms);
    return `
      <a class="ticket-row prio-${tk.priority} ${opts.selectable ? 'selectable-row' : ''}" href="#/ticket/${tk.id}">
        ${opts.selectable ? `<label class="ticket-select-check"><input type="checkbox" class="ticketSelectBox" data-id="${tk.id}" /></label>` : ''}
        <span class="ticket-row-col-type" title="${typeLabels()[tk.type] || tk.type}">${icon(tk.type, 'badge-icon')}</span>
        <span class="ticket-row-col-number">#${formatTicketNumber(tk.id)}</span>
        <span class="ticket-row-col-subject">
          <strong>${escapeHtml(tk.subject)}</strong>
          <span class="ticket-row-desc">${escapeHtml(tk.description)}</span>
          ${tk.onboarding_request_id ? `<span class="onboarding-chip" title="${escapeHtml(tk.onboarding_employee_name || '')}">${icon('userCircle')} ${escapeHtml(tk.onboarding_employee_name || '')}</span>` : ''}
          ${tk.tag_names ? `<span class="tag-chips">${tk.tag_names.split(',').map((n) => `<span class="tag-chip">${escapeHtml(n)}</span>`).join('')}</span>` : ''}
        </span>
        <span class="ticket-row-col-requester">${escapeHtml(tk.creator_name)}${tk.on_behalf_name ? `<span class="ticket-row-sub">${t('on_behalf_of_label')} ${escapeHtml(tk.on_behalf_name)}</span>` : ''}</span>
        <span class="ticket-row-col-assignee">${tk.assignee_name ? escapeHtml(tk.assignee_name) : `<span class="ticket-row-empty">${t('list_unassigned')}</span>`}</span>
        <span class="ticket-row-col-group">${groupLabel(tk) ? escapeHtml(groupLabel(tk)) : '—'}</span>
        <span class="ticket-row-col-priority"><span class="badge badge-${tk.priority}">${priorityLabels()[tk.priority]}</span></span>
        <span class="ticket-row-col-status">
          <span class="badge badge-${tk.status}">${statusLabels()[tk.status]}</span>
          ${tk.sla_status && tk.sla_status !== 'on_track' ? `<span class="badge badge-sla-${tk.sla_status}">${slaLabels()[tk.sla_status]}</span>` : ''}
          ${countdown ? `<span class="badge badge-sla-countdown">${icon('activity', 'badge-icon')}${countdown}</span>` : ''}
        </span>
        <span class="ticket-row-col-updated">${formatDate(tk.updated_at)}</span>
        <span class="ticket-row-col-actions">${!tk.assignee_name && isStaff() ? `<button type="button" class="btn btn-sm btn-icon-sm assignMeBtn" data-id="${tk.id}" data-status="${tk.status}" title="${t('assign_to_me_btn')}" aria-label="${t('assign_to_me_btn')}">${icon('userCircle')}</button>` : ''}</span>
      </a>`;
  }

  function onboardingGroupRowHtml(requestId, groupTickets, opts) {
    const employeeName = groupTickets[0].onboarding_employee_name || '';
    const openTickets = groupTickets.filter((tk) => tk.status !== 'resolved' && tk.status !== 'closed');
    const doneCount = groupTickets.length - openTickets.length;
    const latestUpdate = groupTickets.reduce((max, tk) => (tk.updated_at > max ? tk.updated_at : max), groupTickets[0].updated_at);
    return `
      <div class="ticket-row onboarding-group-row ${opts.selectable ? 'selectable-row' : ''}" data-onboarding-group="${requestId}" role="button" tabindex="0">
        <span class="ticket-row-col-type">${icon('userCircle')}</span>
        <span class="ticket-row-col-number">× ${groupTickets.length}</span>
        <span class="ticket-row-col-subject">
          <strong>${t('onboarding_group_prefix')} ${escapeHtml(employeeName)}</strong>
          <span class="ticket-row-desc">${openTickets.length} ${t('onboarding_group_open_suffix')} · ${doneCount} ${t('onboarding_group_done_suffix')}</span>
        </span>
        <span class="ticket-row-col-requester">—</span>
        <span class="ticket-row-col-assignee">—</span>
        <span class="ticket-row-col-group">—</span>
        <span class="ticket-row-col-priority">—</span>
        <span class="ticket-row-col-status">${openTickets.length ? `<span class="badge badge-open">${openTickets.length} ${t('onboarding_group_open_suffix')}</span>` : `<span class="badge badge-resolved">${t('onboarding_group_all_done')}</span>`}</span>
        <span class="ticket-row-col-updated">${formatDate(latestUpdate)}</span>
        <span class="ticket-row-col-actions"><span class="onboarding-group-chevron">${icon('chevronDown')}</span></span>
      </div>
      <div class="onboarding-group-children" data-group-children="${requestId}" hidden>
        ${groupTickets.map((tk) => ticketRowHtml(tk, opts)).join('')}
      </div>`;
  }

  function ticketRowsHtml(tickets, opts = {}) {
    const byRequest = new Map();
    tickets.forEach((tk) => {
      if (!tk.onboarding_request_id) return;
      if (!byRequest.has(tk.onboarding_request_id)) byRequest.set(tk.onboarding_request_id, []);
      byRequest.get(tk.onboarding_request_id).push(tk);
    });
    const groupedRequestIds = new Set([...byRequest.entries()].filter(([, list]) => list.length > 1).map(([id]) => id));
    const rendered = new Set();
    return tickets.map((tk) => {
      if (tk.onboarding_request_id && groupedRequestIds.has(tk.onboarding_request_id)) {
        if (rendered.has(tk.onboarding_request_id)) return '';
        rendered.add(tk.onboarding_request_id);
        return onboardingGroupRowHtml(tk.onboarding_request_id, byRequest.get(tk.onboarding_request_id), opts);
      }
      return ticketRowHtml(tk, opts);
    }).join('');
  }

  function wireOnboardingGroupToggles(container) {
    container.querySelectorAll('.onboarding-group-row').forEach((row) => {
      const groupId = row.dataset.onboardingGroup;
      const children = container.querySelector(`.onboarding-group-children[data-group-children="${groupId}"]`);
      if (!children) return;
      const toggle = () => {
        children.hidden = !children.hidden;
        row.classList.toggle('onboarding-group-expanded', !children.hidden);
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  function wireTicketCardActions(container) {
    container.querySelectorAll('.ticket-select-check').forEach((label) => {
      label.addEventListener('click', (e) => e.stopPropagation());
    });
    container.querySelectorAll('.assignMeBtn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const body = { assigned_to: state.user.id };
          if (btn.dataset.status === 'open') body.status = 'in_progress';
          await api(`/tickets/${btn.dataset.id}`, { method: 'PATCH', body });
          showToast(t('toast_ticket_assigned_to_you'), 'success');
          route();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
    wireOnboardingGroupToggles(container);
  }

  function renderTicketList(container, tickets, opts = {}) {
    if (!tickets.length) {
      container.className = '';
      container.innerHTML = `<div class="empty-state">${icon('inbox')}<span>${t('no_tickets_found')}</span></div>`;
      return;
    }
    container.className = 'ticket-list';
    container.innerHTML = ticketListHeaderHtml() + ticketRowsHtml(tickets, opts);
    wireTicketCardActions(container);
    wireTicketListColumnResize(container);
  }

  async function renderNewTicket() {
    const [categoriesData, customFieldsData, templatesData, usersData] = await Promise.all([
      api('/categories').catch(() => ({ categories: [] })),
      api('/custom-fields').catch(() => ({ fields: [] })),
      api('/ticket-templates').catch(() => ({ templates: [] })),
      api('/users').catch(() => ({ users: [] })),
    ]);
    const categories = categoriesData.categories;
    const customFields = customFieldsData.fields;
    const templates = templatesData.templates;
    const otherUsers = usersData.users.filter((u) => u.id !== state.user.id);

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('plus')} ${t('new_ticket_title')}</h1>
          <p class="hint">${t('new_ticket_hint')}</p>
        </div>
      </div>
      ${canAccessOnboarding() ? `
      <a href="#/onboarding/new" class="callout-link" style="margin-bottom:1.25rem">
        ${icon('userCircle', 'callout-link-icon')}
        <div>
          <strong>${t('onboarding_callout_title')}</strong>
          <p class="hint" style="margin:0.15rem 0 0">${t('onboarding_callout_hint')}</p>
        </div>
        ${icon('chevronDown', 'callout-link-arrow')}
      </a>` : ''}
      <div class="card" style="max-width:720px">
        <form id="newTicketForm" class="form-grid" style="max-width:none">
          ${otherUsers.length ? `
          <div class="field">
            <label for="onBehalfOfSearch">${t('field_on_behalf_of')}</label>
            <div class="person-combobox">
              <input type="text" id="onBehalfOfSearch" autocomplete="off" placeholder="${t('on_behalf_of_search_placeholder')}" value="${escapeHtml(t('on_behalf_of_none'))}" />
              <input type="hidden" id="onBehalfOfSelect" value="" />
              <div id="onBehalfOfResults" class="person-combobox-results" hidden></div>
            </div>
          </div>` : ''}
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
          </div>
          <div class="field">
            <label for="priority">${t('field_impact')}</label>
            <select id="priority">
              ${Object.entries(impactLabels()).map(([v, l]) => `<option value="${v}" ${v === 'low' ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <p class="hint" id="impactHint"></p>
          </div>
          <div class="field">
            <label for="categorySearch">${t('field_category')}</label>
            <input type="text" id="categorySearch" class="category-search-input" placeholder="${t('category_search_placeholder')}" autocomplete="off" />
            <p class="hint" id="categorySelectedHint"></p>
            <div id="categoryTree" class="category-tree"></div>
          </div>
          <div class="field" id="deviceRequestTypeField" hidden>
            <label for="deviceRequestType">${t('field_device_request_type')}</label>
            <select id="deviceRequestType">
              ${Object.entries(deviceRequestTypeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
            <p class="hint">${t('device_request_type_hint')}</p>
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

    const onBehalfOfSearch = document.getElementById('onBehalfOfSearch');
    const onBehalfOfHidden = document.getElementById('onBehalfOfSelect');
    const onBehalfOfResults = document.getElementById('onBehalfOfResults');
    if (onBehalfOfSearch) {
      function renderOnBehalfResults(list) {
        const rows = [`<button type="button" class="person-combobox-option" data-user-id="" data-user-name="${escapeHtml(t('on_behalf_of_none'))}"><span>${t('on_behalf_of_none')}</span></button>`]
          .concat(list.slice(0, 8).map((u) => `
            <button type="button" class="person-combobox-option" data-user-id="${u.id}" data-user-name="${escapeHtml(u.name)}">
              <span>${escapeHtml(u.name)}</span><span class="hint">${escapeHtml(u.email)}</span>
            </button>`));
        onBehalfOfResults.innerHTML = rows.join('');
        onBehalfOfResults.hidden = false;
        onBehalfOfResults.querySelectorAll('.person-combobox-option').forEach((btn) => {
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            onBehalfOfHidden.value = btn.dataset.userId;
            onBehalfOfSearch.value = btn.dataset.userName;
            onBehalfOfResults.hidden = true;
          });
        });
      }
      onBehalfOfSearch.addEventListener('focus', () => {
        onBehalfOfSearch.select();
        renderOnBehalfResults(otherUsers);
      });
      onBehalfOfSearch.addEventListener('input', () => {
        onBehalfOfHidden.value = '';
        const q = onBehalfOfSearch.value.trim().toLowerCase();
        const filtered = q ? otherUsers.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : otherUsers;
        renderOnBehalfResults(filtered);
      });
      onBehalfOfSearch.addEventListener('blur', () => {
        setTimeout(() => {
          onBehalfOfResults.hidden = true;
          if (!onBehalfOfHidden.value) onBehalfOfSearch.value = t('on_behalf_of_none');
        }, 150);
      });
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
      } else {
        customFieldsContainer.innerHTML = applicable.map((field) => `
          <div class="field">
            ${field.field_type === 'checkbox' ? renderCustomFieldInput(field) : `
              <label for="cf-${field.id}">${escapeHtml(field.name)}${field.required ? ' *' : ''}</label>
              ${renderCustomFieldInput(field)}
            `}
          </div>`).join('');
      }
      updateDeviceRequestTypeField();
    }

    const deviceRequestTypeField = document.getElementById('deviceRequestTypeField');
    const deviceRequestTypeSelect = document.getElementById('deviceRequestType');
    function updateDeviceRequestTypeField() {
      const isDevice = categoryIsDeviceRelated(categories, selectedCategory);
      deviceRequestTypeField.hidden = !isDevice;
      if (isDevice) applyDeviceRequestType();
    }
    function applyDeviceRequestType() {
      const rule = DEVICE_REQUEST_TYPES[deviceRequestTypeSelect.value];
      if (!rule) return;
      document.getElementById('type').value = rule.type;
      if (rule.priority) document.getElementById('priority').value = rule.priority;
      updateImpactHint();
    }
    deviceRequestTypeSelect.addEventListener('change', applyDeviceRequestType);

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

    const impactSelect = document.getElementById('priority');
    const impactHint = document.getElementById('impactHint');
    const impactHints = { low: t('impact_low_hint'), medium: t('impact_medium_hint'), high: t('impact_high_hint') };
    function updateImpactHint() {
      impactHint.textContent = impactHints[impactSelect.value] || '';
    }

    updateCategorySelectedHint();
    renderCategoryTree('');
    renderCustomFieldsSection();
    categorySearchInput.addEventListener('input', () => renderCategoryTree(categorySearchInput.value));

    updateImpactHint();
    impactSelect.addEventListener('change', updateImpactHint);

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
      templateSelect.addEventListener('change', () => {
        const tpl = templates.find((t2) => String(t2.id) === templateSelect.value);
        if (!tpl) return;
        document.getElementById('subject').value = tpl.subject;
        document.getElementById('description').value = tpl.description;
        if (tpl.priority) {
          document.getElementById('priority').value = tpl.priority === 'urgent' ? 'high' : tpl.priority;
          updateImpactHint();
        }
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
      const onBehalfOfEl = document.getElementById('onBehalfOfSelect');
      const body = {
        subject: document.getElementById('subject').value.trim(),
        category: selectedCategory,
        priority: document.getElementById('priority').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value.trim(),
        customFields: collectCustomFieldValues(),
        onBehalfOf: onBehalfOfEl && onBehalfOfEl.value ? Number(onBehalfOfEl.value) : undefined,
        deviceRequestType: deviceRequestTypeField.hidden ? undefined : deviceRequestTypeSelect.value,
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
    addTicketTab(ticket);
    let ticketTags = tags || [];
    let ticketLinks = links || [];
    let isWatching = !!data.isWatching;
    let ticketWatchers = watchers || [];
    const readOnly = !!state.viewAs;
    const isOwner = ticket.created_by === state.user.id || ticket.on_behalf_of === state.user.id;
    const canEditFields = (isOwner || isStaff()) && !readOnly;
    const canReopen = isOwner && !isStaff() && ['resolved', 'closed'].includes(ticket.status) && !readOnly;
    const canCancel = isOwner && !isStaff() && ['open', 'in_progress', 'waiting_customer'].includes(ticket.status) && !readOnly;

    let staffPanel = '';
    let requesterPanel = '';
    let assigneesOptions = '';
    let assetOptions = '';
    let allTicketStaffUsers = [];
    let ticketGroupsFlat = [];
    function buildAssigneeOptionsHtml(users, groupId, currentAssignedId) {
      const staffUsers = users.filter((u) => u.role === 'agent' || u.role === 'admin');
      const pool = groupId ? staffUsers.filter((u) => u.group_id === groupId || u.id === currentAssignedId) : staffUsers;
      const staffGroups = groupStaffByGroup(pool);
      return `<option value="">${t('unassigned_label')}</option>` +
        staffGroups.map(({ group, members }) => `
          <optgroup label="${escapeHtml(group)}">
            ${members.map((u) => `<option value="${u.id}" ${currentAssignedId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
          </optgroup>`).join('');
    }
    if (isStaff() && !readOnly) {
      const [usersResult, groupsResult, assetsResult] = await Promise.all([
        api('/users').catch(() => null),
        api('/groups').catch(() => null),
        api('/assets').catch(() => null),
      ]);

      if (usersResult) {
        const { users } = usersResult;
        allTicketStaffUsers = users;
        assigneesOptions = buildAssigneeOptionsHtml(users, ticket.group_id, ticket.assigned_to);

        const requester = users.find((u) => u.id === ticket.created_by);
        const beneficiary = ticket.on_behalf_of ? users.find((u) => u.id === ticket.on_behalf_of) : null;
        const requesterCard = (person, label) => person ? `
          <div class="requester-row">
            <p class="hint" style="margin:0 0 0.2rem">${label}</p>
            <p style="margin:0"><strong>${escapeHtml(person.name)}</strong> <span class="role-tag">${roleLabels()[person.role] || person.role}</span>${person.is_external ? ` <span class="role-tag role-tag-external">${t('external_badge')}</span>` : ''}</p>
            <p class="hint" style="margin:0.1rem 0 0">${escapeHtml(person.email)}</p>
            ${person.group_name ? `<p class="hint" style="margin:0.1rem 0 0">${t('field_group')}: ${escapeHtml(person.group_name)}${person.group_parent_name ? ` (${escapeHtml(person.group_parent_name)})` : ''}</p>` : ''}
            ${person.manager_name ? `<p class="hint" style="margin:0.1rem 0 0">${t('manager_label')}: ${escapeHtml(person.manager_name)}</p>` : ''}
          </div>` : '';
        if (requester) {
          requesterPanel = `
            <div class="card">
              <h3 class="section-title" style="margin-top:0">${icon('userCircle')} ${t('requester_context_title')}</h3>
              ${requesterCard(requester, t('onboarding_requested_by_label'))}
              ${beneficiary ? requesterCard(beneficiary, t('on_behalf_of_label')) : ''}
              ${ticket.onboarding_request_id && canAccessOnboarding() ? `
              <a class="onboarding-ticket-link" href="#/onboarding/${ticket.onboarding_request_id}">
                ${icon('userCircle', 'badge-icon')} ${t('onboarding_ticket_link_label')} ${escapeHtml(ticket.onboarding_employee_name || '')}
              </a>` : ''}
            </div>`;
        }
      }

      if (groupsResult) {
        ticketGroupsFlat = flattenGroupTree(buildGroupTree(groupsResult.groups));
      }

      if (assetsResult) {
        const { assets } = assetsResult;
        assetOptions = `<option value="">${t('no_asset_option')}</option>` +
          assets.map((a) => `<option value="${a.id}" ${ticket.asset_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)}${a.tag ? ` (${escapeHtml(a.tag)})` : ''}</option>`).join('');
      }

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
            <label for="groupSearchInput">${t('field_group')}</label>
            <div class="person-combobox">
              <input type="text" id="groupSearchInput" autocomplete="off" placeholder="${t('group_search_placeholder')}" value="${escapeHtml(groupLabel(ticket) || t('no_group_option'))}" />
              <input type="hidden" id="groupSel" value="${ticket.group_id || ''}" />
              <div id="groupSearchResults" class="person-combobox-results" hidden></div>
            </div>
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
        <h1>#${formatTicketNumber(ticket.id)} ${escapeHtml(ticket.subject)}</h1>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          ${isStaff() && !readOnly && ticket.assigned_to !== state.user.id ? `<button type="button" id="quickAssignMeBtn" class="btn btn-ghost">${icon('userCircle')} ${t('assign_to_me_btn')}</button>` : ''}
          ${isStaff() && !readOnly && !['resolved', 'closed'].includes(ticket.status) ? `<button type="button" id="quickResolveBtn" class="btn btn-ghost">${icon('check')} ${t('quick_resolve_btn')}</button>` : ''}
          ${isStaff() && !readOnly ? `<button type="button" id="watchToggleBtn" class="btn btn-ghost">${icon(isWatching ? 'eyeOff' : 'eye')} <span id="watchToggleLabel">${isWatching ? t('btn_unwatch') : t('btn_watch')}</span>${ticketWatchers.length ? ` (${ticketWatchers.length})` : ''}</button>` : ''}
          <a class="btn btn-ghost" href="#/dashboard">${icon('arrowLeft')} ${t('back_to_list')}</a>
        </div>
      </div>
      <div id="presenceBanner" class="presence-banner" hidden></div>
      ${ticket.cancelled_at ? `<div class="presence-banner ticket-cancelled-banner">${icon('trash', 'badge-icon')} <span><strong>${t('ticket_cancelled_banner')}</strong>${ticket.cancelled_reason ? ` — ${escapeHtml(ticket.cancelled_reason)}` : ''}</span></div>` : ''}
      <div class="ticket-detail-grid">
        <div>
          <div class="card" style="margin-bottom:1rem">
            <div class="badges" style="margin-bottom:0.75rem">
              <span class="badge badge-type-${ticket.type}">${icon(ticket.type, 'badge-icon')}${typeLabels()[ticket.type] || ticket.type}</span>
              <span class="badge badge-${ticket.status}">${statusLabels()[ticket.status]}</span>
              <span class="badge badge-${ticket.priority}">${priorityLabels()[ticket.priority]}</span>
              <span class="badge">${escapeHtml(ticket.category)}</span>
              ${ticket.sla_status ? `<span class="badge badge-sla-${ticket.sla_status}">${slaLabels()[ticket.sla_status]}</span>` : ''}
              ${ticket.response_sla_status ? `<span class="badge badge-sla-${ticket.response_sla_status}">${t('response_sla_prefix')} ${slaLabels()[ticket.response_sla_status]}</span>` : ''}
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
              ${t('created_by')} ${escapeHtml(ticket.creator_name)}${ticket.on_behalf_name ? ` ${t('on_behalf_of_label')} ${escapeHtml(ticket.on_behalf_name)}` : ''} ${t('on_date')} ${formatDate(ticket.created_at)}
              ${ticket.assignee_name ? ` · ${t('assigned_to_label')} ${escapeHtml(ticket.assignee_name)}` : ''}
              ${groupLabel(ticket) ? ` · ${t('group_label_prefix')} ${escapeHtml(groupLabel(ticket))}` : ''}
              ${ticket.asset_name ? ` · ${t('field_linked_asset')} ${isStaff() ? `<a href="#/assets" id="ticketAssetLink">${escapeHtml(ticket.asset_name)}</a>` : escapeHtml(ticket.asset_name)}` : ''}
            </p>
            <div id="tagsWrap" class="tags-wrap"></div>
            ${canReopen ? `<button id="reopenBtn" class="btn btn-sm btn-ghost">${icon('refresh')} ${t('reopen_ticket')}</button>` : ''}
            ${canCancel ? `<button id="cancelTicketBtn" class="btn btn-sm btn-ghost">${icon('trash', 'badge-icon')} ${t('cancel_ticket_btn')}</button>` : ''}
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

          ${isStaff() && !readOnly ? `
          <div class="card" style="margin-bottom:1rem">
            <h3 class="section-title" style="margin-top:0">${icon('activity')} ${t('similar_tickets_title')}</h3>
            <div id="similarTicketsList" class="linked-tickets-list spinner-row">${t('loading')}</div>
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
        <div>${staffPanel}${requesterPanel}</div>
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

    const similarTicketsList = document.getElementById('similarTicketsList');
    if (similarTicketsList) {
      (async () => {
        try {
          const params = new URLSearchParams({ category: ticket.category, excludeId: String(ticket.id) });
          const { tickets: similar } = await api(`/tickets?${params.toString()}`);
          const top = similar.slice(0, 5);
          similarTicketsList.className = 'linked-tickets-list';
          similarTicketsList.innerHTML = top.length ? top.map((s) => `
            <div class="linked-ticket-row">
              <a href="#/ticket/${s.id}">#${formatTicketNumber(s.id)} ${escapeHtml(s.subject)}</a>
              <span class="badge badge-${s.status}">${statusLabels()[s.status] || s.status}</span>
              ${ticketLinks.some((l) => l.linked_ticket_id === s.id) ? '' : `<button type="button" class="btn btn-ghost btn-sm quickLinkBtn" data-id="${s.id}">${t('btn_link_ticket')}</button>`}
            </div>`).join('') : `<p class="hint">${t('no_similar_tickets_hint')}</p>`;

          similarTicketsList.querySelectorAll('.quickLinkBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                await api(`/tickets/${ticket.id}/links`, { method: 'POST', body: { linkedTicketId: Number(btn.dataset.id) } });
                showToast(t('toast_ticket_linked'), 'success');
                renderTicketDetail(ticket.id);
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
        } catch {
          similarTicketsList.className = '';
          similarTicketsList.innerHTML = '';
        }
      })();
    }

    const quickAssignMeBtn = document.getElementById('quickAssignMeBtn');
    if (quickAssignMeBtn) {
      quickAssignMeBtn.addEventListener('click', async () => {
        quickAssignMeBtn.disabled = true;
        try {
          const body = { assigned_to: state.user.id };
          if (ticket.status !== 'in_progress') body.status = 'in_progress';
          await api(`/tickets/${ticket.id}`, { method: 'PATCH', body });
          showToast(t('toast_ticket_assigned_to_you'), 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
          quickAssignMeBtn.disabled = false;
        }
      });
    }

    const quickResolveBtn = document.getElementById('quickResolveBtn');
    if (quickResolveBtn) {
      quickResolveBtn.addEventListener('click', async () => {
        quickResolveBtn.disabled = true;
        try {
          await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { status: 'resolved' } });
          showToast(t('toast_ticket_resolved_quick'), 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
          quickResolveBtn.disabled = false;
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
        if (file.size > 20 * 1024 * 1024) {
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

    const ticketAssetLink = document.getElementById('ticketAssetLink');
    if (ticketAssetLink) {
      ticketAssetLink.addEventListener('click', () => {
        sessionStorage.setItem('ticketing_assets_query', ticket.asset_tag || ticket.asset_name);
      });
    }

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

    const cancelTicketBtn = document.getElementById('cancelTicketBtn');
    if (cancelTicketBtn) {
      cancelTicketBtn.addEventListener('click', async () => {
        if (!confirm(t('confirm_cancel_ticket'))) return;
        try {
          await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { status: 'closed' } });
          showToast(t('toast_ticket_cancelled'), 'success');
          renderTicketDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const groupSearchInput = document.getElementById('groupSearchInput');
    const groupSearchHidden = document.getElementById('groupSel');
    const groupSearchResults = document.getElementById('groupSearchResults');
    if (groupSearchInput) {
      function refreshAssigneeOptionsForGroup(groupId) {
        const assignedSel = document.getElementById('assignedSel');
        if (!assignedSel) return;
        assignedSel.innerHTML = buildAssigneeOptionsHtml(allTicketStaffUsers, groupId, null);
      }
      function groupComboLabel(g) {
        return `${'  '.repeat(g.depth)}${g.depth ? '– ' : ''}${g.name}`;
      }
      function renderGroupResults(list) {
        const rows = [`<button type="button" class="person-combobox-option" data-group-id="" data-group-name="${escapeHtml(t('no_group_option'))}"><span>${t('no_group_option')}</span></button>`]
          .concat(list.slice(0, 20).map((g) => `
            <button type="button" class="person-combobox-option" data-group-id="${g.id}" data-group-name="${escapeHtml(g.name)}">
              <span>${escapeHtml(groupComboLabel(g))}</span>
            </button>`));
        groupSearchResults.innerHTML = rows.join('');
        groupSearchResults.hidden = false;
        groupSearchResults.querySelectorAll('.person-combobox-option').forEach((btn) => {
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            groupSearchHidden.value = btn.dataset.groupId;
            groupSearchInput.value = btn.dataset.groupId ? btn.dataset.groupName : t('no_group_option');
            groupSearchResults.hidden = true;
            refreshAssigneeOptionsForGroup(btn.dataset.groupId ? Number(btn.dataset.groupId) : null);
          });
        });
      }
      groupSearchInput.addEventListener('focus', () => {
        groupSearchInput.select();
        renderGroupResults(ticketGroupsFlat);
      });
      groupSearchInput.addEventListener('input', () => {
        groupSearchHidden.value = '';
        const q = groupSearchInput.value.trim().toLowerCase();
        const filtered = q ? ticketGroupsFlat.filter((g) => g.name.toLowerCase().includes(q)) : ticketGroupsFlat;
        renderGroupResults(filtered);
      });
      groupSearchInput.addEventListener('blur', () => {
        setTimeout(() => {
          groupSearchResults.hidden = true;
          if (!groupSearchHidden.value) groupSearchInput.value = t('no_group_option');
        }, 150);
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

  function blockOrderKey(scope) {
    return `ticketing_${scope}`;
  }

  function getBlockOrder(scope) {
    try {
      const raw = localStorage.getItem(blockOrderKey(scope));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function setBlockOrder(scope, order) {
    try {
      localStorage.setItem(blockOrderKey(scope), JSON.stringify(order));
    } catch {}
  }

  function applyBlockOrder(scope, selector) {
    const order = getBlockOrder(scope);
    document.querySelectorAll(selector).forEach((card) => {
      const idx = order.indexOf(card.dataset.blockId);
      card.style.order = idx === -1 ? 999 : idx;
    });
  }

  function wireBlockDragging(scope, selector, handleSelector, onReorder) {
    const cards = Array.from(document.querySelectorAll(selector));
    if (cards.length < 2) return;
    cards.forEach((card) => {
      const host = card.querySelector(handleSelector);
      if (host && !host.querySelector('.admin-block-handle')) {
        const handle = document.createElement('span');
        handle.className = 'admin-block-handle';
        handle.title = t('admin_block_drag_hint');
        handle.innerHTML = icon('grip');
        host.insertBefore(handle, host.firstChild);
      }
    });
    cards.forEach((card) => {
      const handle = card.querySelector('.admin-block-handle');
      if (!handle) return;
      handle.setAttribute('draggable', 'true');
      handle.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.blockId);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('admin-block-dragging');
      });
      handle.addEventListener('dragend', () => card.classList.remove('admin-block-dragging'));
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('admin-block-drop-target');
      });
      card.addEventListener('dragleave', () => card.classList.remove('admin-block-drop-target'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('admin-block-drop-target');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === card.dataset.blockId) return;
        const currentOrder = cards.map((c) => c.dataset.blockId);
        const fromIdx = currentOrder.indexOf(draggedId);
        const toIdx = currentOrder.indexOf(card.dataset.blockId);
        if (fromIdx === -1 || toIdx === -1) return;
        currentOrder.splice(fromIdx, 1);
        currentOrder.splice(toIdx, 0, draggedId);
        setBlockOrder(scope, currentOrder);
        onReorder();
      });
    });
  }

  function hasUsersManage() {
    return !!(state.user && Array.isArray(state.user.permissions) && state.user.permissions.includes('users_manage'));
  }
  function hasGroupsManage() {
    return !!(state.user && Array.isArray(state.user.permissions) && state.user.permissions.includes('groups_manage'));
  }

  async function renderAdminDelegate() {
    const canUsers = hasUsersManage();
    const canGroups = hasGroupsManage();
    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('shield')} ${t('admin_title')}</h1>
        <p class="hint">${t('admin_delegate_hint')}</p>
      </div>
      ${canUsers ? `
      <div class="card" style="margin-bottom:1.25rem">
        <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('admin_create_staff_title')}</h3>
        <form id="delegateNewUserForm" class="form-grid" style="max-width:none">
          <div class="field"><label for="delegateNewName">${t('field_name')}</label><input id="delegateNewName" required /></div>
          <div class="field"><label for="delegateNewEmail">Email</label><input id="delegateNewEmail" type="email" required /></div>
          <div class="field"><label for="delegateNewGroup">${t('admin_group_optional_label')}</label><select id="delegateNewGroup"><option value="">${t('no_group_option')}</option></select></div>
          <p class="hint">${t('admin_delegate_new_user_role_hint')}</p>
          <p class="error-text" id="delegateNewUserError"></p>
          <div><button class="btn btn-sm" type="submit">${t('btn_create_account')}</button></div>
        </form>
        <div id="delegateTempPasswordBox"></div>
      </div>
      <div class="card" style="margin-bottom:1.25rem">
        <h3 class="section-title" style="margin-top:0">${icon('users')} ${t('admin_section_users')}</h3>
        <div id="delegateUsersList" class="spinner-row">${t('loading')}</div>
      </div>` : ''}
      ${canGroups ? `
      <div class="card" style="margin-bottom:1.25rem">
        <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('btn_create_group')}</h3>
        <form id="delegateNewGroupForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
          <div class="field" style="flex:1 1 12rem"><label for="delegateGroupName">${t('field_group_name')}</label><input id="delegateGroupName" required /></div>
          <div class="field" style="flex:1 1 12rem"><label for="delegateGroupParent">${t('field_parent_group')}</label><select id="delegateGroupParent"><option value="">${t('option_no_parent')}</option></select></div>
          <div class="field" style="flex:1 1 12rem"><label for="delegateGroupManager">${t('field_manager')}</label><select id="delegateGroupManager"><option value="">${t('option_none')}</option></select></div>
          <button class="btn btn-sm" type="submit">${t('btn_create_group')}</button>
        </form>
        <p class="error-text" id="delegateNewGroupError"></p>
        <div id="delegateGroupsList" class="spinner-row">${t('loading')}</div>
      </div>` : ''}
    `;

    let staffUsersCache = [];
    let groupOptionsCache = [];

    async function loadStaffOptions() {
      const { users } = await api('/users').catch(() => ({ users: [] }));
      staffUsersCache = users.filter((u) => u.role === 'agent' || u.role === 'admin');
      const managerSelects = [document.getElementById('delegateGroupManager')].filter(Boolean);
      managerSelects.forEach((sel) => {
        sel.innerHTML = `<option value="">${t('option_none')}</option>` +
          staffUsersCache.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
      });
    }

    async function loadDelegateGroups() {
      const { groups } = await api('/groups').catch(() => ({ groups: [] }));
      groupOptionsCache = groups;
      const groupSelects = [document.getElementById('delegateNewGroup'), document.getElementById('delegateGroupParent')].filter(Boolean);
      groupSelects.forEach((sel) => {
        sel.innerHTML = (sel.id === 'delegateNewGroup' ? `<option value="">${t('no_group_option')}</option>` : `<option value="">${t('option_no_parent')}</option>`) +
          groupOptionsHtml(groups, '', null).replace(/<option value="">.*?<\/option>/, '');
      });
      if (canGroups) renderDelegateGroupsList(groups);
    }

    function renderDelegateGroupsList(groups) {
      const listEl = document.getElementById('delegateGroupsList');
      if (!listEl) return;
      const flat = flattenGroupTree(buildGroupTree(groups));
      listEl.className = '';
      listEl.innerHTML = flat.length ? `
        <div class="table-scroll">
          <table class="users-table">
            <thead><tr><th>${t('field_group_name')}</th><th>${t('field_manager')}</th><th>${t('org_member_count')}</th><th></th></tr></thead>
            <tbody>
              ${flat.map((g) => `
                <tr>
                  <td>${'—'.repeat(g.depth)} ${escapeHtml(g.name)}</td>
                  <td>${g.manager_name ? escapeHtml(g.manager_name) : '—'}</td>
                  <td>${g.member_count || 0}</td>
                  <td><button type="button" class="icon-btn deleteDelegateGroupBtn" data-id="${g.id}" title="${t('delete_group_title')}">${icon('trash')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<p class="hint">${t('no_groups_hint')}</p>`;
      listEl.querySelectorAll('.deleteDelegateGroupBtn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('confirm_delete_group'))) return;
          try {
            await api(`/groups/${btn.dataset.id}`, { method: 'DELETE' });
            showToast(t('toast_group_deleted'), 'success');
            loadDelegateGroups();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    async function loadDelegateUsers() {
      const listEl = document.getElementById('delegateUsersList');
      if (!listEl) return;
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      try {
        const { users } = await api('/users');
        listEl.className = '';
        listEl.innerHTML = `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th>${t('th_name')}</th><th>${t('th_email')}</th><th>${t('th_role')}</th><th>${t('th_group')}</th><th>${t('th_status')}</th><th></th></tr></thead>
              <tbody>
                ${users.map((u) => `
                  <tr>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td><span class="role-tag">${roleLabels()[u.role] || u.role}</span></td>
                    <td><select class="delegateUserGroupSel" data-id="${u.id}" ${u.role === 'admin' ? 'disabled' : ''}>${groupOptionsHtml(groupOptionsCache, u.group_id, t('no_group_option'))}</select></td>
                    <td>${u.is_blocked ? `<span class="role-tag role-tag-danger">${t('blocked_badge')}</span>` : ''}</td>
                    <td>
                      ${u.id !== state.user.id ? `
                      <button type="button" class="btn btn-ghost btn-sm delegateBlockBtn" data-id="${u.id}" data-blocked="${u.is_blocked ? '1' : '0'}">${u.is_blocked ? t('btn_unblock_account') : t('btn_block_account')}</button>
                      <button type="button" class="icon-btn delegateDeleteUserBtn" data-id="${u.id}" title="${t('delete_user_title')}">${icon('trash')}</button>` : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        listEl.querySelectorAll('.delegateUserGroupSel').forEach((sel) => {
          sel.addEventListener('change', async () => {
            try {
              await api(`/users/${sel.dataset.id}/group`, { method: 'PATCH', body: { groupId: sel.value || null } });
              showToast(t('toast_group_updated'), 'success');
            } catch (err) {
              showToast(err.message, 'error');
              loadDelegateUsers();
            }
          });
        });
        listEl.querySelectorAll('.delegateBlockBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const nowBlocked = btn.dataset.blocked !== '1';
            try {
              await api(`/users/${btn.dataset.id}/block`, { method: 'PATCH', body: { blocked: nowBlocked } });
              showToast(nowBlocked ? t('toast_account_blocked') : t('toast_account_unblocked'), 'success');
              loadDelegateUsers();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('.delegateDeleteUserBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_delete_user'))) return;
            try {
              await api(`/users/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_user_deleted'), 'success');
              loadDelegateUsers();
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

    const newUserForm = document.getElementById('delegateNewUserForm');
    if (newUserForm) {
      guardForm(newUserForm, async () => {
        const errEl = document.getElementById('delegateNewUserError');
        errEl.textContent = '';
        try {
          const { user, tempPassword } = await api('/users', {
            method: 'POST',
            body: {
              name: document.getElementById('delegateNewName').value,
              email: document.getElementById('delegateNewEmail').value,
              role: 'agent',
              groupId: document.getElementById('delegateNewGroup').value || null,
            },
          });
          document.getElementById('delegateTempPasswordBox').innerHTML = `
            <div class="divider"></div>
            <p class="success-text">${t('account_created_for')} ${escapeHtml(user.name)}.</p>
            <p class="hint">${t('temp_password_hint')}</p>
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-flex;align-items:center;gap:0.6rem">
              ${escapeHtml(tempPassword)}
              <button type="button" id="delegateCopyTempPwBtn" class="icon-btn" title="${t('btn_copy')}">${icon('copy', 'badge-icon')}</button>
            </p>`;
          document.getElementById('delegateCopyTempPwBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(tempPassword); showToast(t('toast_copied'), 'success'); }
            catch { showToast(t('toast_copy_failed'), 'error'); }
          });
          newUserForm.reset();
          showToast(t('toast_staff_created'), 'success');
          loadDelegateUsers();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    const newGroupForm = document.getElementById('delegateNewGroupForm');
    if (newGroupForm) {
      guardForm(newGroupForm, async () => {
        const errEl = document.getElementById('delegateNewGroupError');
        errEl.textContent = '';
        try {
          await api('/groups', {
            method: 'POST',
            body: {
              name: document.getElementById('delegateGroupName').value,
              parentId: document.getElementById('delegateGroupParent').value || null,
              managerId: document.getElementById('delegateGroupManager').value || null,
            },
          });
          newGroupForm.reset();
          showToast(t('toast_group_created'), 'success');
          loadDelegateGroups();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    await loadStaffOptions();
    await loadDelegateGroups();
    if (canUsers) loadDelegateUsers();
  }

  async function renderAdmin() {
    if (!isStaff()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    const isAdmin = state.user.role === 'admin';
    if (!isAdmin && (hasUsersManage() || hasGroupsManage())) {
      return renderAdminDelegate();
    }
    const ADMIN_SECTIONS = [
      { key: 'overview', icon: 'grid', label: t('admin_section_overview') },
      { key: 'users', icon: 'users', label: t('admin_section_users') },
      { key: 'groups', icon: 'shield', label: t('admin_section_groups') },
      { key: 'catalog', icon: 'ticket', label: t('admin_section_catalog') },
      { key: 'automation', icon: 'activity', label: t('admin_section_automation') },
      { key: 'onboarding', icon: 'userCircle', label: t('admin_section_onboarding') },
      { key: 'roles', icon: 'shield', label: t('admin_section_roles') },
      { key: 'org', icon: 'globe', label: t('admin_section_org') },
      { key: 'system', icon: 'server', label: t('admin_section_system') },
      { key: 'privacy', icon: 'lock', label: t('admin_section_privacy') },
      ...(state.user.is_super_admin ? [{ key: 'companies', icon: 'building', label: t('admin_section_companies') }] : []),
    ];
    const activeSection = isAdmin ? (ADMIN_SECTIONS.some((s) => s.key === state.adminSection) ? state.adminSection : 'overview') : 'users';

    function adminTabsHtml() {
      return `<div class="admin-tabs">${ADMIN_SECTIONS.map((s) => `
        <button type="button" class="admin-tab ${activeSection === s.key ? 'active' : ''}" data-admin-section="${s.key}">${icon(s.icon, 'nav-icon')} ${s.label}</button>
      `).join('')}</div>`;
    }

    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('shield')} ${t('admin_title')}</h1></div>
      ${isAdmin ? adminTabsHtml() : ''}
      ${isAdmin && activeSection === 'overview' ? `
      <div class="admin-overview-grid" id="adminOverviewGrid">
        ${ADMIN_SECTIONS.filter((s) => s.key !== 'overview').map((s) => `
          <button type="button" class="admin-overview-tile" data-admin-section="${s.key}">
            ${icon(s.icon)}
            <span class="admin-overview-tile-label">${s.label}</span>
            <span class="admin-overview-tile-count" data-count-for="${s.key}"></span>
          </button>
        `).join('')}
      </div>` : ''}
      ${isAdmin ? `
      <div class="admin-grid" style="margin-bottom:1.25rem">
        <div class="card" data-admin-panel="users" data-block-id="createStaff" ${activeSection === 'users' ? '' : 'hidden'}>
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
            <div class="field">
              <label for="newRoleId">${t('field_specific_role')}</label>
              <select id="newRoleId"><option value="">${t('specific_role_none_option')}</option></select>
              <span class="hint">${t('specific_role_hint')}</span>
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
        <div class="card" data-admin-panel="users" data-block-id="bulkImportUsers" ${activeSection === 'users' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('download')} ${t('admin_bulk_import_title')}</h3>
          <p class="hint">${t('admin_bulk_import_hint')}</p>
          <div class="field">
            <label for="bulkImportFile">${t('admin_bulk_import_file_label')}</label>
            <input type="file" id="bulkImportFile" accept=".csv,text/csv" />
          </div>
          <div style="display:flex;gap:0.6rem;align-items:center;margin-top:0.6rem">
            <button type="button" id="bulkImportBtn" class="btn btn-sm" disabled>${t('admin_bulk_import_btn')}</button>
          </div>
          <p class="error-text" id="bulkImportError"></p>
          <div id="bulkImportResults"></div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="catalog" data-block-id="categories" ${activeSection === 'catalog' ? '' : 'hidden'}>
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
          <div style="display:flex;gap:0.6rem;margin-bottom:0.6rem">
            <button type="button" id="categoryExpandAllBtn" class="btn btn-ghost btn-sm">${t('widgets_expand_all_btn')}</button>
            <button type="button" id="categoryCollapseAllBtn" class="btn btn-ghost btn-sm">${t('widgets_collapse_all_btn')}</button>
          </div>
          <div id="categoriesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="groups" data-block-id="groupsOrg" ${activeSection === 'groups' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('users')} ${t('admin_groups_title')}</h3>
          <p class="hint">${t('admin_groups_hint')}</p>
          <form id="newGroupForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:1 1 12rem"><label for="newGroupName">${t('field_group_name')}</label><input id="newGroupName" /></div>
            <div class="field" style="flex:1 1 12rem"><label for="newGroupParent">${t('field_parent_group')}</label><select id="newGroupParent"><option value="">${t('option_no_parent')}</option></select></div>
            <div class="field" style="flex:0 0 7rem"><label for="newGroupResponse">${t('field_response_hours')}</label><input id="newGroupResponse" type="number" min="1" /></div>
            <div class="field" style="flex:0 0 7rem"><label for="newGroupResolve">${t('field_resolve_hours')}</label><input id="newGroupResolve" type="number" min="1" /></div>
            <div class="field" style="flex:0 0 6rem"><label for="newGroupWorkStart">${t('field_shift_start')}</label><input id="newGroupWorkStart" type="number" min="0" max="24" value="9" /></div>
            <div class="field" style="flex:0 0 6rem"><label for="newGroupWorkEnd">${t('field_shift_end')}</label><input id="newGroupWorkEnd" type="number" min="0" max="24" value="18" /></div>
            <div class="field" style="flex:1 1 12rem"><label for="newGroupManager">${t('field_manager')}</label><select id="newGroupManager"><option value="">${t('option_none')}</option></select></div>
            <button class="btn btn-sm" type="submit">${t('btn_create_group')}</button>
          </form>
          <p class="error-text" id="groupError"></p>
          <div class="org-toolbar">
            <button type="button" class="btn btn-ghost btn-sm" id="orgExpandAllBtn">${icon('chevronDown', 'nav-icon')} ${t('org_expand_all')}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="orgCollapseAllBtn">${icon('chevronDown', 'nav-icon org-collapse-icon')} ${t('org_collapse_all')}</button>
          </div>
          <div id="groupsList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="automation" data-block-id="automations" ${activeSection === 'automation' ? '' : 'hidden'}>
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
        <div class="card admin-grid-full" data-admin-panel="catalog" data-block-id="customFields" ${activeSection === 'catalog' ? '' : 'hidden'}>
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
        <div class="card admin-grid-full" data-admin-panel="automation" data-block-id="cannedResponses" ${activeSection === 'automation' ? '' : 'hidden'}>
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
        <div class="card admin-grid-full" data-admin-panel="automation" data-block-id="ticketTemplates" ${activeSection === 'automation' ? '' : 'hidden'}>
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
        <div class="card admin-grid-full" data-admin-panel="org" data-block-id="holidays" ${activeSection === 'org' ? '' : 'hidden'}>
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
        <div class="card admin-grid-full" data-admin-panel="onboarding" data-block-id="onboardingCatalog" ${activeSection === 'onboarding' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('userCircle')} ${t('admin_onboarding_title')}</h3>
          <p class="hint">${t('admin_onboarding_hint')}</p>
          <form id="newOnbItemForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <div class="field-row">
              <div class="field"><label for="newOnbItemLabelIt">${t('field_label_it')}</label><input id="newOnbItemLabelIt" required /></div>
              <div class="field"><label for="newOnbItemLabelEn">${t('field_label_en')}</label><input id="newOnbItemLabelEn" required /></div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="newOnbItemKind">${t('onboarding_kind_label')}</label>
                <select id="newOnbItemKind">${Object.entries(onboardingKindLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
              </div>
              <div class="field" id="newOnbItemAssetTypeWrap" style="display:none">
                <label for="newOnbItemAssetType">${t('table_type')}</label>
                <select id="newOnbItemAssetType">${Object.entries(assetTypeLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
              </div>
              <div class="field"><label for="newOnbItemGroup">${t('onboarding_routed_to_label')}</label><select id="newOnbItemGroup"><option value="">${t('option_none')}</option></select></div>
            </div>
            <div class="field-row">
              <div class="field" id="newOnbItemLicenseWrap" style="display:none">
                <label for="newOnbItemLicenseOptions">${t('onboarding_license_options_label')}</label>
                <input id="newOnbItemLicenseOptions" placeholder="${t('onboarding_license_options_placeholder')}" />
              </div>
              <div class="field">
                <label for="newOnbItemAddonLabel">${t('onboarding_addon_label_label')}</label>
                <input id="newOnbItemAddonLabel" placeholder="${t('onboarding_addon_label_placeholder')}" />
              </div>
            </div>
            <div><button class="btn btn-sm" type="submit">${t('btn_add_onboarding_item')}</button></div>
          </form>
          <p class="error-text" id="onbItemTypeError"></p>
          <div id="onbItemTypesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="roles" data-block-id="rolesManagement" ${activeSection === 'roles' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('shield')} ${t('admin_roles_title')}</h3>
          <p class="hint">${t('admin_roles_hint')}</p>
          <form id="newRoleForm" class="form-grid" style="max-width:none;margin:0.75rem 0">
            <div class="field-row">
              <div class="field"><label for="newRoleLabelIt">${t('field_label_it')}</label><input id="newRoleLabelIt" required /></div>
              <div class="field"><label for="newRoleLabelEn">${t('field_label_en')}</label><input id="newRoleLabelEn" required /></div>
            </div>
            <div class="field-row">
              <div class="field" style="flex:0 0 8rem"><label for="newRoleColor">${t('field_color')}</label><input id="newRoleColor" type="color" value="#8f2436" /></div>
              <label class="checkbox-field">
                <input type="checkbox" id="newRoleReadOnly" />
                ${t('field_role_read_only')}
              </label>
            </div>
            <div class="field">
              <label>${t('field_role_permissions')}</label>
              <div id="newRolePermissions" style="display:flex;flex-wrap:wrap;gap:0.4rem 1.4rem;margin-top:0.4rem"></div>
            </div>
            <div><button class="btn btn-sm" type="submit">${t('btn_add_role')}</button></div>
          </form>
          <p class="error-text" id="newRoleError"></p>
          <div id="rolesList" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="system" data-block-id="systemStatus" ${activeSection === 'system' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('server')} ${t('admin_system_title')}</h3>
          <p class="hint">${t('admin_system_hint')}</p>
          <div id="systemStatusBody" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card admin-grid-full" data-admin-panel="privacy" data-block-id="dataGovernance" ${activeSection === 'privacy' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('lock')} ${t('admin_privacy_title')}</h3>
          <p class="hint">${t('admin_privacy_hint')}</p>
          <div id="dataGovernanceBody" class="spinner-row">${t('loading')}</div>
        </div>
        ${state.user.is_super_admin ? `
        <div class="card admin-grid-full" data-admin-panel="companies" data-block-id="companiesManagement" ${activeSection === 'companies' ? '' : 'hidden'}>
          <h3 class="section-title" style="margin-top:0">${icon('building')} ${t('admin_companies_title')}</h3>
          <p class="hint">${t('admin_companies_hint')}</p>
          <form id="newCompanyForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
            <div class="field" style="flex:1 1 12rem"><label for="newCompanyName">${t('field_company_name')}</label><input id="newCompanyName" required /></div>
            <div class="field" style="flex:1 1 12rem"><label for="newCompanyDisplayName">${t('field_company_display_name')}</label><input id="newCompanyDisplayName" /></div>
            <button class="btn btn-sm" type="submit">${t('btn_create_company')}</button>
          </form>
          <p class="error-text" id="companyError"></p>
          <div id="companiesList" class="spinner-row">${t('loading')}</div>
        </div>` : ''}
      </div>` : ''}
      <div id="usersWrap" class="card spinner-row" ${isAdmin && activeSection !== 'users' ? 'hidden' : ''}>${t('loading')}</div>`;

    if (isAdmin) {
      document.querySelectorAll('[data-admin-section]').forEach((el) => {
        el.addEventListener('click', () => {
          state.adminSection = el.dataset.adminSection;
          renderAdmin();
        });
      });

      if (activeSection !== 'overview') {
        const adminSelector = `.admin-grid .card[data-admin-panel="${activeSection}"]`;
        const adminScope = `admin_block_order_${activeSection}`;
        applyBlockOrder(adminScope, adminSelector);
        wireBlockDragging(adminScope, adminSelector, '.section-title', renderAdmin);
      }

      function statusBarClass(pct) {
        if (pct >= 90) return 'system-bar-danger';
        if (pct >= 70) return 'system-bar-warning';
        return 'system-bar-ok';
      }

      function severityOf(barClass) {
        if (barClass === 'system-bar-danger') return 'danger';
        if (barClass === 'system-bar-warning') return 'warning';
        return 'ok';
      }

      function severityToBarClass(sev) {
        if (sev === 'danger') return 'system-bar-danger';
        if (sev === 'warning') return 'system-bar-warning';
        return 'system-bar-ok';
      }

      function worstSeverity(...severities) {
        if (severities.includes('danger')) return 'danger';
        if (severities.includes('warning')) return 'warning';
        return 'ok';
      }

      function statusIconHtml(name) {
        return `<span class="system-status-icon">${icon(name)}</span>`;
      }

      function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (days > 0) return `${days}g ${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
      }

      let sparklineIdSeq = 0;
      function sparklineSvg(values, colorVar) {
        const w = 200, h = 44;
        if (values.length < 2) return `<svg width="${w}" height="${h}" class="sparkline"></svg>`;
        sparklineIdSeq += 1;
        const gradId = `sparkGrad${sparklineIdSeq}`;
        const max = Math.max(...values, 0.001);
        const stepX = w / (values.length - 1);
        const coords = values.map((v, i) => [i * stepX, h - (v / max) * (h - 6) - 3]);
        let path = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
        for (let i = 1; i < coords.length; i++) {
          const [px, py] = coords[i - 1];
          const [cx, cy] = coords[i];
          const midX = (px + cx) / 2;
          path += ` C ${midX.toFixed(1)} ${py.toFixed(1)}, ${midX.toFixed(1)} ${cy.toFixed(1)}, ${cx.toFixed(1)} ${cy.toFixed(1)}`;
        }
        const areaPath = `${path} L ${coords[coords.length - 1][0].toFixed(1)} ${h} L 0 ${h} Z`;
        const [lastX, lastY] = coords[coords.length - 1];
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sparkline">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${colorVar}" stop-opacity="0.35" />
              <stop offset="100%" stop-color="${colorVar}" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#${gradId})" class="sparkline-area" />
          <path d="${path}" stroke="${colorVar}" class="sparkline-line" />
          <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" fill="${colorVar}" class="sparkline-dot" />
        </svg>`;
      }

      function storageStatsHtml(storage) {
        if (!storage) return '';
        const tableLabels = {
          tickets: t('storage_table_tickets'), comments: t('storage_table_comments'),
          ticket_events: t('storage_table_ticket_events'), ticket_attachments: t('storage_table_ticket_attachments'),
          onboarding_attachments: t('storage_table_onboarding_attachments'), notifications: t('storage_table_notifications'),
          audit_log: t('storage_table_audit_log'), direct_messages: t('storage_table_direct_messages'),
          users: t('storage_table_users'),
        };
        const rows = Object.entries(storage.rowCounts || {})
          .filter(([, n]) => n !== null)
          .map(([key, n]) => `<div class="storage-row"><span>${tableLabels[key] || key}</span><strong>${n.toLocaleString('it-IT')}</strong></div>`)
          .join('');
        return `
          <div class="system-storage">
            <h4 class="section-title">${t('system_storage_title')}</h4>
            <p class="hint">${t('system_storage_hint')}</p>
            <div class="system-status-grid">
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('server')}<span class="system-status-label">${t('system_storage_db_size_label')}</span></div>
                <span class="system-status-value">${storage.dbSizeBytes !== null ? formatFileSize(storage.dbSizeBytes) : t('system_db_error')}</span>
              </div>
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('paperclip')}<span class="system-status-label">${t('system_storage_attachments_label')}</span></div>
                <span class="system-status-value">${formatFileSize(storage.attachmentBytes)}</span>
              </div>
            </div>
            <div class="storage-table">${rows}</div>
            <p class="hint">${t('system_storage_retention_hint')}</p>
          </div>`;
      }

      async function loadSystemStatus() {
        const bodyEl = document.getElementById('systemStatusBody');
        if (!bodyEl) return;
        try {
          const status = await api('/admin/status');
          const memPct = Math.min(100, Math.round((status.memory.rssMb / 512) * 100));
          const reqPct = Math.min(100, Math.round((status.requestWindow.windowCount / status.requestWindow.windowMax) * 100));
          const latencyClass = severityToBarClass(dbLatencySeverity(status.db.latencyMs));
          const lagClass = severityToBarClass(eventLoopLagSeverity(status.eventLoopLagMs));
          const lagPct = Math.min(100, Math.round((status.eventLoopLagMs / 200) * 100));
          const loadRatio = status.loadAvg1m / status.cpuCount;
          const loadClass = severityToBarClass(loadRatioSeverity(loadRatio));
          const loadPct = Math.min(100, Math.round(loadRatio * 100));

          systemStatusHistory.push({
            memRss: status.memory.rssMb,
            lag: status.eventLoopLagMs,
            reqCount: status.requestWindow.windowCount,
            loadRatio: Math.round(loadRatio * 100),
          });
          if (systemStatusHistory.length > 30) systemStatusHistory.shift();
          const memHistory = systemStatusHistory.map((s) => s.memRss);
          const lagHistory = systemStatusHistory.map((s) => s.lag);
          const reqHistory = systemStatusHistory.map((s) => s.reqCount);
          const loadHistory = systemStatusHistory.map((s) => s.loadRatio);

          const onlineUsers = status.onlineUsers || [];
          const onlineStaff = onlineUsers.filter((u) => u.role === 'agent' || u.role === 'admin');
          const onlineCustomers = onlineUsers.filter((u) => u.role === 'customer');

          const memSeverity = severityOf(statusBarClass(memPct));
          const reqSeverity = severityOf(statusBarClass(reqPct));
          const dbSeverity = severityOf(latencyClass);
          const lagSeverity = severityOf(lagClass);
          const loadSeverity = severityOf(loadClass);
          const overall = worstSeverity(memSeverity, reqSeverity, dbSeverity, lagSeverity, loadSeverity);
          const overallCopy = {
            ok: { title: t('system_overall_ok_title'), hint: t('system_overall_ok_hint'), icon: 'check' },
            warning: { title: t('system_overall_warning_title'), hint: t('system_overall_warning_hint'), icon: 'bell' },
            danger: { title: t('system_overall_danger_title'), hint: t('system_overall_danger_hint'), icon: 'flame' },
          }[overall];

          bodyEl.className = '';
          bodyEl.innerHTML = `
            <div class="system-overall-banner status-${overall}">
              <span class="system-overall-icon">${icon(overallCopy.icon)}</span>
              <div>
                <div class="system-overall-title">${overallCopy.title}</div>
                <div class="system-overall-hint">${overallCopy.hint}</div>
              </div>
            </div>
            <div class="system-status-grid">
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('clock')}<span class="system-status-label">${t('system_uptime_label')}</span></div>
                <span class="system-status-value">${formatUptime(status.uptimeSeconds)}</span>
                <span class="hint">Node ${escapeHtml(status.nodeVersion)} · ${status.cpuCount} CPU</span>
              </div>
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('users')}<span class="system-status-label">${t('system_online_users_label')}</span></div>
                <span class="system-status-value">${onlineUsers.length}</span>
                <span class="hint">${t('system_online_staff_prefix')} ${onlineStaff.length} · ${t('system_online_customers_prefix')} ${onlineCustomers.length}</span>
              </div>
              <div class="system-status-card system-status-card-${memSeverity}">
                <div class="system-status-card-head">${statusIconHtml('activity')}<span class="system-status-label">${t('system_memory_label')}</span></div>
                <span class="system-status-value">${status.memory.rssMb} MB</span>
                <div class="system-bar"><div class="system-bar-fill ${statusBarClass(memPct)}" style="width:${memPct}%"></div></div>
                <span class="hint">Heap ${status.memory.heapUsedMb} / ${status.memory.heapTotalMb} MB</span>
                ${sparklineSvg(memHistory, 'var(--primary)')}
              </div>
              <div class="system-status-card system-status-card-${reqSeverity}">
                <div class="system-status-card-head">${statusIconHtml('wifi')}<span class="system-status-label">${t('system_requests_label')}</span></div>
                <span class="system-status-value">${status.requestWindow.windowCount} / ${status.requestWindow.windowMax}</span>
                <div class="system-bar"><div class="system-bar-fill ${statusBarClass(reqPct)}" style="width:${reqPct}%"></div></div>
                <span class="hint">${t('system_requests_reset_prefix')} ${Math.ceil(status.requestWindow.resetInSeconds / 60)} ${t('system_requests_reset_suffix')} · ${status.requestWindow.totalCount} ${t('system_requests_total_suffix')}</span>
                ${sparklineSvg(reqHistory, 'var(--primary)')}
              </div>
              <div class="system-status-card system-status-card-${dbSeverity}">
                <div class="system-status-card-head">${statusIconHtml('server')}<span class="system-status-label">${t('system_db_label')}</span></div>
                <span class="system-status-value">${status.db.latencyMs !== null ? `${status.db.latencyMs} ms` : t('system_db_error')}</span>
                <div class="system-bar"><div class="system-bar-fill ${latencyClass}" style="width:${status.db.latencyMs !== null ? Math.min(100, Math.round((status.db.latencyMs / 1500) * 100)) : 100}%"></div></div>
                <span class="hint">${status.db.mode === 'turso' ? t('system_db_mode_turso') : t('system_db_mode_local')}</span>
              </div>
              <div class="system-status-card system-status-card-${lagSeverity}">
                <div class="system-status-card-head">${statusIconHtml('refresh')}<span class="system-status-label">${t('system_eventloop_label')}</span></div>
                <span class="system-status-value">${status.eventLoopLagMs} ms</span>
                <div class="system-bar"><div class="system-bar-fill ${lagClass}" style="width:${lagPct}%"></div></div>
                <span class="hint">${t('system_eventloop_hint')}</span>
                ${sparklineSvg(lagHistory, 'var(--primary)')}
              </div>
              <div class="system-status-card system-status-card-${loadSeverity}">
                <div class="system-status-card-head">${statusIconHtml('flame')}<span class="system-status-label">${t('system_load_label')}</span></div>
                <span class="system-status-value">${status.loadAvg1m}</span>
                <div class="system-bar"><div class="system-bar-fill ${loadClass}" style="width:${loadPct}%"></div></div>
                <span class="hint">${t('system_load_hint')} ${status.cpuCount} CPU</span>
                ${sparklineSvg(loadHistory, 'var(--primary)')}
              </div>
            </div>
            ${onlineUsers.length ? `
            <div class="online-users-list">
              ${onlineUsers.map((u) => `<span class="role-tag role-tag-active"><span class="online-dot"></span> ${escapeHtml(u.name)}</span>`).join('')}
            </div>` : ''}
            ${storageStatsHtml(status.storage)}`;
        } catch (err) {
          bodyEl.className = '';
          bodyEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
      }

      if (activeSection === 'system') {
        systemStatusHistory = [];
        loadSystemStatus();
        teardownAdminSystemStatusPolling();
        adminSystemStatusTimer = setInterval(loadSystemStatus, 10000);
      }

      async function loadDataGovernance() {
        const bodyEl = document.getElementById('dataGovernanceBody');
        if (!bodyEl) return;
        try {
          const status = await api('/admin/status');
          const gov = status.dataGovernance;
          const retentionRow = (label, days) => `<div class="storage-row"><span>${label}</span><strong>${t('privacy_ret_auto_after')} ${days} ${t('privacy_days_unit')}</strong></div>`;
          const manualRow = (label) => `<div class="storage-row"><span>${label}</span><strong>${t('privacy_ret_manual')}</strong></div>`;
          bodyEl.className = '';
          bodyEl.innerHTML = `
            <div class="system-status-grid">
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('server')}<span class="system-status-label">${t('privacy_db_label')}</span></div>
                <span class="system-status-value">${gov.database.provider === 'turso' ? t('privacy_db_turso') : t('privacy_db_local')}</span>
              </div>
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('paperclip')}<span class="system-status-label">${t('privacy_attachments_label')}</span></div>
                <span class="system-status-value">${gov.attachmentStorage.external ? escapeHtml(gov.attachmentStorage.endpointHost) : t('privacy_attachments_db')}</span>
              </div>
              <div class="system-status-card system-status-card-ok">
                <div class="system-status-card-head">${statusIconHtml('download')}<span class="system-status-label">${t('privacy_backup_label')}</span></div>
                <span class="system-status-value">${gov.database.pointInTimeRecovery ? t('privacy_backup_pitr') : t('privacy_backup_none')}</span>
              </div>
            </div>
            <h4 class="section-title">${t('privacy_categories_title')}</h4>
            <div class="storage-table">
              ${manualRow(t('privacy_cat_identity'))}
              ${manualRow(t('privacy_cat_tickets'))}
              ${retentionRow(t('privacy_cat_messages'), gov.retentionDays.directMessages)}
              ${retentionRow(t('privacy_cat_notifications'), gov.retentionDays.readNotifications)}
              ${retentionRow(t('privacy_cat_audit'), gov.retentionDays.auditLog)}
              ${manualRow(t('privacy_cat_timesheet'))}
            </div>
            <p class="hint">${t('privacy_isolation_hint')}</p>
            <p class="hint">${t('privacy_transport_hint')}</p>`;
        } catch (err) {
          bodyEl.className = '';
          bodyEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
      }

      if (activeSection === 'privacy') loadDataGovernance();

      async function loadAdminOverviewCounts() {
        try {
          const [{ groups }, { categories }, { rules }, { requests }] = await Promise.all([
            api('/groups'),
            api('/categories'),
            api('/automations').catch(() => ({ rules: [] })),
            api('/onboarding').catch(() => ({ requests: [] })),
          ]);
          const counts = {
            users: '',
            groups: `${groups.length}`,
            catalog: `${categories.length}`,
            automation: `${rules.length}`,
            onboarding: `${requests.filter((r) => r.status === 'open' || r.status === 'in_progress').length}`,
            org: '',
          };
          Object.entries(counts).forEach(([key, value]) => {
            const el = document.querySelector(`[data-count-for="${key}"]`);
            if (el) el.textContent = value;
          });
        } catch {}
      }
      if (activeSection === 'overview') loadAdminOverviewCounts();
    }

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
          const onbGroupSelect = document.getElementById('newOnbItemGroup');
          if (onbGroupSelect) onbGroupSelect.innerHTML = groupOptionsHtml(groups, '', t('option_none'));
        } catch { groupOptionsCache = []; }
      }

      let staffUsersCache = [];

      async function loadManagerOptions() {
        try {
          const { users } = await api('/users');
          staffUsersCache = users.filter((u) => u.role === 'agent' || u.role === 'admin');
          const select = document.getElementById('newManager');
          if (select) {
            select.innerHTML = `<option value="">${t('option_none')}</option>` +
              staffUsersCache.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
          }
          const groupManagerSelect = document.getElementById('newGroupManager');
          if (groupManagerSelect) {
            groupManagerSelect.innerHTML = `<option value="">${t('option_none')}</option>` +
              staffUsersCache.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
          }
        } catch {}
      }

      function staffOptionsHtml(selectedId) {
        return `<option value="">${t('option_none')}</option>` +
          staffUsersCache.map((u) => `<option value="${u.id}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
      }

      function renderOrgNode(node, statsById, membersByGroup) {
        const stats = statsById.get(node.id) || { open: 0, breached: 0 };
        const hasChildren = node.children.length > 0;
        const members = membersByGroup.get(node.id) || [];
        return `
          <div class="org-branch">
            <div class="org-node" draggable="true" data-group-id="${node.id}" data-group-name="${escapeHtml(node.name)}" title="${t('org_node_hint')}">
              <div class="org-node-head">
                <span class="org-node-drag-handle" title="${t('org_drag_handle_hint')}">${icon('grip')}</span>
                ${hasChildren ? `<button type="button" class="org-collapse-toggle" data-branch-toggle title="${t('org_toggle_branch')}">${icon('chevronDown')}</button>` : '<span class="org-collapse-spacer"></span>'}
                <div class="org-node-title">
                  <span class="org-node-name">${escapeHtml(node.name)}</span>
                  <span class="org-node-manager">${icon('userCircle', 'badge-icon')}${node.manager_name ? escapeHtml(node.manager_name) : t('org_no_manager')}</span>
                </div>
                <button type="button" class="icon-btn addChildGroupBtn" data-id="${node.id}" data-name="${escapeHtml(node.name)}" title="${t('org_add_child_title')}">${icon('plus')}</button>
                <button type="button" class="icon-btn deleteGroupBtn" data-id="${node.id}" title="${t('delete_group_title')}">${icon('trash')}</button>
              </div>
              <div class="org-node-stats">
                <span class="org-node-badge">${icon('users', 'badge-icon')}${node.member_count || 0} ${t('org_member_count')}</span>
                <span class="org-node-badge ${stats.breached > 0 ? 'org-node-badge-danger' : 'org-node-badge-ok'}">${stats.open} ${t('org_open_tickets')}</span>
                ${stats.breached > 0 ? `<span class="org-node-badge org-node-badge-danger">${stats.breached} ${t('org_sla_breach')}</span>` : ''}
              </div>
              <details class="org-node-members">
                <summary>${icon('users', 'badge-icon')} ${t('orgchart_view_members')}</summary>
                <div class="org-node-members-body">
                  <p class="hint">${t('org_member_drag_hint')}</p>
                  <div class="org-member-chips">
                    ${members.length ? members.map((m) => `
                      <span class="org-member-chip" draggable="true" data-user-id="${m.id}" data-origin-group="${node.id}" title="${escapeHtml(m.name)}">${icon('userCircle', 'badge-icon')}${escapeHtml(m.name)}</span>
                    `).join('') : `<span class="hint">${t('org_no_members')}</span>`}
                  </div>
                </div>
              </details>
              <details class="org-node-settings">
                <summary>${icon('settings', 'badge-icon')} ${t('org_settings_toggle')}</summary>
                <div class="org-node-settings-body">
                  <span class="org-node-settings-label">${t('org_settings_group_identity')}</span>
                  <label>${t('field_group_name')} <input type="text" class="groupNameInput" data-group-id="${node.id}" value="${escapeHtml(node.name)}" /></label>
                  <label>${t('field_manager')} <select class="managerInput" data-group-id="${node.id}">${staffOptionsHtml(node.manager_id)}</select></label>
                  <label>${t('field_group_display_name')} <input type="text" class="displayNameInput" data-group-id="${node.id}" value="${escapeHtml(node.display_name || '')}" placeholder="${t('field_group_display_name_placeholder')}" /></label>
                  <p class="hint">${t('field_group_display_name_hint')}</p>
                  <span class="org-node-settings-label">${t('org_settings_group_sla')}</span>
                  <div class="org-node-settings-row">
                    <label>${t('field_response_hours')} <input type="number" min="1" class="slaInput" data-group-id="${node.id}" data-field="slaResponseHours" value="${node.sla_response_hours ?? ''}" /></label>
                    <label>${t('field_resolve_hours')} <input type="number" min="1" class="slaInput" data-group-id="${node.id}" data-field="slaResolveHours" value="${node.sla_resolve_hours ?? ''}" /></label>
                  </div>
                  <div class="org-node-settings-row">
                    <label>${t('shift_from_label')} <input type="number" min="0" max="24" class="workHourInput" data-group-id="${node.id}" data-field="workStartHour" value="${node.work_start_hour ?? 9}" /></label>
                    <label>${t('shift_to_label')} <input type="number" min="0" max="24" class="workHourInput" data-group-id="${node.id}" data-field="workEndHour" value="${node.work_end_hour ?? 18}" /></label>
                  </div>
                </div>
              </details>
            </div>
            ${hasChildren ? `<div class="org-children">${node.children.map((child) => renderOrgNode(child, statsById, membersByGroup)).join('')}</div>` : ''}
          </div>`;
      }

      async function loadGroups() {
        const listEl = document.getElementById('groupsList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const [{ groups }, { tickets }, { users }] = await Promise.all([
            api('/groups'),
            api('/tickets').catch(() => ({ tickets: [] })),
            api('/users').catch(() => ({ users: [] })),
          ]);
          groupOptionsCache = groups;
          staffUsersCache = users.filter((u) => u.role === 'agent' || u.role === 'admin');
          const statsById = new Map();
          tickets.forEach((tk) => {
            if (!tk.group_id) return;
            const entry = statsById.get(tk.group_id) || { open: 0, breached: 0 };
            if (tk.status === 'open' || tk.status === 'in_progress') entry.open += 1;
            if (tk.sla_status === 'breached') entry.breached += 1;
            statsById.set(tk.group_id, entry);
          });
          const membersByGroup = new Map();
          users.forEach((u) => {
            if (!u.group_id) return;
            if (!membersByGroup.has(u.group_id)) membersByGroup.set(u.group_id, []);
            membersByGroup.get(u.group_id).push({ id: u.id, name: u.name });
          });
          membersByGroup.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
          const tree = buildGroupTree(groups);
          listEl.className = '';
          listEl.innerHTML = tree.length ? `
            <div id="orgRootDrop" class="org-root-drop">${t('org_drop_root_hint')}</div>
            <div class="org-chart">${tree.map((node) => renderOrgNode(node, statsById, membersByGroup)).join('')}</div>` : `<p class="hint">${t('no_groups_hint')}</p>`;

          listEl.querySelectorAll('.org-node').forEach((nodeEl) => {
            nodeEl.addEventListener('click', (e) => {
              if (e.target.closest('input, select, button, label, summary, details')) return;
              sessionStorage.setItem('ticketing_search_group', nodeEl.dataset.groupId);
              location.hash = '#/search';
            });
          });

          listEl.querySelectorAll('.org-collapse-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
              btn.closest('.org-branch').classList.toggle('collapsed');
            });
          });

          listEl.querySelectorAll('.managerInput').forEach((select) => {
            select.addEventListener('change', async () => {
              try {
                await api(`/groups/${select.dataset.groupId}`, { method: 'PATCH', body: { managerId: select.value || null } });
                showToast(t('toast_manager_updated'), 'success');
                loadGroups();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });

          let draggedGroupId = null;
          let draggedUserId = null;
          let draggedUserOriginGroup = null;
          let dragHandleArmed = null;
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
          async function reassignMember(userId, groupId) {
            try {
              await api(`/users/${userId}/group`, { method: 'PATCH', body: { groupId } });
              showToast(t('toast_member_moved'), 'success');
              loadGroups();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
          listEl.querySelectorAll('.org-member-chip').forEach((chip) => {
            chip.addEventListener('dragstart', (e) => {
              e.stopPropagation();
              draggedUserId = chip.dataset.userId;
              draggedUserOriginGroup = chip.dataset.originGroup;
              chip.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', `user:${draggedUserId}`);
            });
            chip.addEventListener('dragend', (e) => {
              e.stopPropagation();
              chip.classList.remove('dragging');
              listEl.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
              draggedUserId = null;
              draggedUserOriginGroup = null;
            });
          });
          listEl.querySelectorAll('.org-node').forEach((nodeEl) => {
            const dragHandle = nodeEl.querySelector('.org-node-drag-handle');
            if (dragHandle) {
              dragHandle.addEventListener('mousedown', () => { dragHandleArmed = nodeEl.dataset.groupId; });
              dragHandle.addEventListener('mouseup', () => { dragHandleArmed = null; });
            }
            nodeEl.addEventListener('dragstart', (e) => {
              if (dragHandle && dragHandleArmed !== nodeEl.dataset.groupId) {
                e.preventDefault();
                return;
              }
              dragHandleArmed = null;
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
              if (draggedUserId) {
                if (draggedUserOriginGroup === nodeEl.dataset.groupId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                nodeEl.classList.add('drop-target');
                return;
              }
              if (!draggedGroupId || draggedGroupId === nodeEl.dataset.groupId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              nodeEl.classList.add('drop-target');
            });
            nodeEl.addEventListener('dragleave', () => nodeEl.classList.remove('drop-target'));
            nodeEl.addEventListener('drop', (e) => {
              e.preventDefault();
              nodeEl.classList.remove('drop-target');
              const targetId = nodeEl.dataset.groupId;
              if (draggedUserId) {
                const uid = draggedUserId;
                if (draggedUserOriginGroup === targetId) return;
                draggedUserId = null;
                draggedUserOriginGroup = null;
                reassignMember(uid, Number(targetId));
                return;
              }
              const sourceId = draggedGroupId;
              if (!sourceId || sourceId === targetId) return;
              reparentGroup(sourceId, Number(targetId));
            });
          });

          const rootDrop = document.getElementById('orgRootDrop');
          if (rootDrop) {
            rootDrop.addEventListener('dragover', (e) => {
              if (!draggedGroupId && !draggedUserId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              rootDrop.classList.add('drop-target');
            });
            rootDrop.addEventListener('dragleave', () => rootDrop.classList.remove('drop-target'));
            rootDrop.addEventListener('drop', (e) => {
              e.preventDefault();
              rootDrop.classList.remove('drop-target');
              if (draggedUserId) {
                const uid = draggedUserId;
                draggedUserId = null;
                draggedUserOriginGroup = null;
                reassignMember(uid, null);
                return;
              }
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

          listEl.querySelectorAll('.groupNameInput').forEach((input) => {
            input.addEventListener('change', async () => {
              const groupId = input.dataset.groupId;
              const name = input.value.trim();
              if (!name) {
                showToast(t('name_required_error'), 'error');
                input.value = input.defaultValue;
                return;
              }
              try {
                await api(`/groups/${groupId}`, { method: 'PATCH', body: { name } });
                showToast(t('toast_group_name_updated'), 'success');
                loadGroups();
                loadGroupOptions();
              } catch (err) {
                showToast(err.message, 'error');
                input.value = input.defaultValue;
              }
            });
          });

          listEl.querySelectorAll('.displayNameInput').forEach((input) => {
            input.addEventListener('change', async () => {
              const groupId = input.dataset.groupId;
              try {
                await api(`/groups/${groupId}`, { method: 'PATCH', body: { displayName: input.value || null } });
                showToast(t('toast_group_display_name_updated'), 'success');
                loadGroupOptions();
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

          listEl.querySelectorAll('.addChildGroupBtn').forEach((btn) => {
            btn.addEventListener('click', () => {
              const parentSelect = document.getElementById('newGroupParent');
              const nameInput = document.getElementById('newGroupName');
              if (parentSelect) parentSelect.value = btn.dataset.id;
              if (nameInput) {
                nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                nameInput.focus();
              }
              showToast(t('toast_add_child_group_hint').replace('{name}', btn.dataset.name), 'success');
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
              managerId: document.getElementById('newGroupManager').value || null,
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

      document.getElementById('orgExpandAllBtn').addEventListener('click', () => {
        document.querySelectorAll('#groupsList .org-branch').forEach((el) => el.classList.remove('collapsed'));
      });
      document.getElementById('orgCollapseAllBtn').addEventListener('click', () => {
        document.querySelectorAll('#groupsList .org-branch').forEach((el) => {
          if (el.querySelector('.org-children')) el.classList.add('collapsed');
        });
      });

      const onbKindSelect = document.getElementById('newOnbItemKind');
      const onbAssetTypeWrap = document.getElementById('newOnbItemAssetTypeWrap');
      const onbLicenseWrap = document.getElementById('newOnbItemLicenseWrap');
      onbKindSelect.addEventListener('change', () => {
        onbAssetTypeWrap.style.display = onbKindSelect.value === 'asset' ? '' : 'none';
        onbLicenseWrap.style.display = onbKindSelect.value === 'license' ? '' : 'none';
      });

      async function loadOnbItemTypes() {
        const listEl = document.getElementById('onbItemTypesList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { itemTypes } = await api('/onboarding/item-types');
          listEl.className = '';
          listEl.innerHTML = itemTypes.length ? `
            <div class="table-scroll">
              <table class="users-table">
                <thead><tr><th>${t('field_label_it')}</th><th>${t('field_label_en')}</th><th>${t('onboarding_kind_label')}</th><th>${t('onboarding_routed_to_label')}</th><th>${t('onboarding_license_options_label')}</th><th>${t('onboarding_addon_label_label')}</th><th>${t('table_status')}</th><th></th></tr></thead>
                <tbody>
                  ${itemTypes.map((it) => `
                    <tr>
                      <td>${escapeHtml(it.label_it)}</td>
                      <td>${escapeHtml(it.label_en)}</td>
                      <td>${onboardingKindLabels()[it.kind] || it.kind}</td>
                      <td>
                        <select class="onbItemGroupSel groupSel" data-id="${it.id}">
                          <option value="">${t('option_none')}</option>
                          ${groupOptionsCache.map((g) => `<option value="${g.id}" ${it.default_group_id === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
                        </select>
                      </td>
                      <td>${it.kind === 'license' ? `<input type="text" class="onbItemLicenseOptionsInput" data-id="${it.id}" value="${escapeHtml((it.license_options ? JSON.parse(it.license_options) : []).join(', '))}" placeholder="${t('onboarding_license_options_placeholder')}" />` : '—'}</td>
                      <td>${it.kind !== 'asset' ? `<input type="text" class="onbItemAddonLabelInput" data-id="${it.id}" value="${escapeHtml(it.addon_label || '')}" placeholder="${t('onboarding_addon_label_placeholder')}" />` : '—'}</td>
                      <td><label class="checkbox-field"><input type="checkbox" class="onbItemEnabledCheck" data-id="${it.id}" ${it.enabled ? 'checked' : ''} /><span>${t('onboarding_enabled_label')}</span></label></td>
                      <td><button type="button" class="icon-btn deleteOnbItemBtn" data-id="${it.id}" title="${t('btn_delete')}">${icon('trash')}</button></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : `<p class="hint">${t('no_onboarding_items_hint')}</p>`;

          listEl.querySelectorAll('.onbItemGroupSel').forEach((sel) => {
            sel.addEventListener('change', async () => {
              try {
                await api(`/onboarding/item-types/${sel.dataset.id}`, { method: 'PATCH', body: { defaultGroupId: sel.value || null } });
                showToast(t('toast_onboarding_item_type_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
          listEl.querySelectorAll('.onbItemLicenseOptionsInput').forEach((input) => {
            input.addEventListener('change', async () => {
              try {
                const licenseOptions = input.value.split(',').map((s) => s.trim()).filter(Boolean);
                await api(`/onboarding/item-types/${input.dataset.id}`, { method: 'PATCH', body: { licenseOptions } });
                showToast(t('toast_onboarding_item_type_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
          listEl.querySelectorAll('.onbItemAddonLabelInput').forEach((input) => {
            input.addEventListener('change', async () => {
              try {
                await api(`/onboarding/item-types/${input.dataset.id}`, { method: 'PATCH', body: { addonLabel: input.value.trim() } });
                showToast(t('toast_onboarding_item_type_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
          listEl.querySelectorAll('.onbItemEnabledCheck').forEach((cb) => {
            cb.addEventListener('change', async () => {
              try {
                await api(`/onboarding/item-types/${cb.dataset.id}`, { method: 'PATCH', body: { enabled: cb.checked } });
                showToast(t('toast_onboarding_item_type_updated'), 'success');
              } catch (err) {
                showToast(err.message, 'error');
                cb.checked = !cb.checked;
              }
            });
          });
          listEl.querySelectorAll('.deleteOnbItemBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm(t('confirm_delete_onboarding_item'))) return;
              try {
                await api(`/onboarding/item-types/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_onboarding_item_type_deleted'), 'success');
                loadOnbItemTypes();
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

      guardForm(document.getElementById('newOnbItemForm'), async () => {
        const errEl = document.getElementById('onbItemTypeError');
        errEl.textContent = '';
        const labelIt = document.getElementById('newOnbItemLabelIt').value.trim();
        const labelEn = document.getElementById('newOnbItemLabelEn').value.trim();
        if (!labelIt || !labelEn) return;
        try {
          const licenseOptions = document.getElementById('newOnbItemLicenseOptions').value
            .split(',').map((s) => s.trim()).filter(Boolean);
          const addonLabel = document.getElementById('newOnbItemAddonLabel').value.trim();
          await api('/onboarding/item-types', {
            method: 'POST',
            body: {
              itemKey: labelEn,
              labelIt,
              labelEn,
              kind: onbKindSelect.value,
              assetType: document.getElementById('newOnbItemAssetType').value,
              defaultGroupId: document.getElementById('newOnbItemGroup').value || null,
              licenseOptions,
              addonLabel,
            },
          });
          document.getElementById('newOnbItemForm').reset();
          onbAssetTypeWrap.style.display = 'none';
          onbLicenseWrap.style.display = 'none';
          showToast(t('toast_onboarding_item_type_created'), 'success');
          loadOnbItemTypes();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadOnbItemTypes();

      let rolesCache = [];

      async function loadRoles() {
        const listEl = document.getElementById('rolesList');
        listEl.className = 'spinner-row';
        listEl.textContent = t('loading');
        try {
          const { roles, permissions } = await api('/roles');
          rolesCache = roles;

          const permsWrap = document.getElementById('newRolePermissions');
          if (permsWrap && !permsWrap.dataset.built) {
            permsWrap.innerHTML = permissions.map((key) => `
              <label class="checkbox-field">
                <input type="checkbox" class="newRolePermCheck" value="${key}" />
                <span>${t(`perm_${key}`)}</span>
              </label>`).join('');
            permsWrap.dataset.built = '1';
          }

          const roleIdSelect = document.getElementById('newRoleId');
          if (roleIdSelect) {
            roleIdSelect.innerHTML = `<option value="">${t('specific_role_none_option')}</option>` +
              roles.map((r) => `<option value="${r.id}">${escapeHtml(state.user.locale === 'en' ? r.label_en : r.label_it)}</option>`).join('');
          }

          listEl.className = '';
          listEl.innerHTML = roles.length ? `
            <div class="table-scroll">
              <table class="users-table">
                <thead><tr><th>${t('field_role')}</th><th>${t('field_role_permissions')}</th><th>${t('field_role_read_only')}</th><th></th></tr></thead>
                <tbody>
                  ${roles.map((r) => `
                    <tr>
                      <td><span class="role-tag" style="background:${r.color}22;color:${r.color};border-color:${r.color}44">${escapeHtml(state.user.locale === 'en' ? r.label_en : r.label_it)}</span></td>
                      <td>${r.permissions.length ? r.permissions.map((p) => `<span class="badge">${t(`perm_${p}`)}</span>`).join(' ') : `<span class="hint">${t('option_none')}</span>`}</td>
                      <td>${r.read_only ? t('yes_label') : t('no_label')}</td>
                      <td><button type="button" class="icon-btn deleteRoleBtn" data-id="${r.id}" title="${t('btn_delete')}">${icon('trash')}</button></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : `<p class="hint">${t('no_roles_hint')}</p>`;

          listEl.querySelectorAll('.deleteRoleBtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm(t('confirm_delete_role'))) return;
              try {
                await api(`/roles/${btn.dataset.id}`, { method: 'DELETE' });
                showToast(t('toast_role_deleted'), 'success');
                loadRoles();
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

      guardForm(document.getElementById('newRoleForm'), async () => {
        const errEl = document.getElementById('newRoleError');
        errEl.textContent = '';
        const labelIt = document.getElementById('newRoleLabelIt').value.trim();
        const labelEn = document.getElementById('newRoleLabelEn').value.trim();
        if (!labelIt || !labelEn) return;
        const permissions = Array.from(document.querySelectorAll('.newRolePermCheck:checked')).map((cb) => cb.value);
        try {
          await api('/roles', {
            method: 'POST',
            body: {
              key: labelEn,
              labelIt,
              labelEn,
              color: document.getElementById('newRoleColor').value,
              readOnly: document.getElementById('newRoleReadOnly').checked,
              permissions,
            },
          });
          document.getElementById('newRoleForm').reset();
          showToast(t('toast_role_created'), 'success');
          loadRoles();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      loadRoles();

      if (state.user.is_super_admin) {
        async function loadCompanies() {
          const listEl = document.getElementById('companiesList');
          if (!listEl) return;
          listEl.className = 'spinner-row';
          listEl.textContent = t('loading');
          try {
            const { companies } = await api('/companies');
            listEl.className = '';
            listEl.innerHTML = companies.length ? `
              <div class="table-scroll">
                <table class="users-table">
                  <thead><tr>
                    <th>${t('table_company')}</th><th>${t('field_company_display_name')}</th>
                    <th>${t('company_logo_label')}</th><th>${t('table_members')}</th><th>${t('table_groups')}</th>
                    <th>${t('th_status')}</th><th></th>
                  </tr></thead>
                  <tbody>
                    ${companies.map((c) => `
                      <tr>
                        <td>${escapeHtml(c.name)}</td>
                        <td><input type="text" class="companyDisplayNameInput" data-id="${c.id}" value="${escapeHtml(c.display_name || '')}" style="max-width:12rem" /></td>
                        <td>
                          <div style="display:flex;align-items:center;gap:0.5rem">
                            <img src="${c.logo || 'img/icon.svg'}" alt="" width="28" height="28" style="border-radius:6px;object-fit:contain;background:var(--surface-alt)" />
                            <input type="file" class="companyLogoInput" data-id="${c.id}" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:8rem" />
                          </div>
                        </td>
                        <td>${c.member_count}</td>
                        <td>${c.group_count}</td>
                        <td>${c.is_active ? `<span class="role-tag role-tag-active">${t('company_active_label')}</span>` : `<span class="role-tag role-tag-danger">${t('company_inactive_label')}</span>`}</td>
                        <td style="display:flex;gap:0.4rem">
                          <button type="button" class="btn btn-ghost btn-sm toggleCompanyActiveBtn" data-id="${c.id}" data-active="${c.is_active ? '1' : '0'}">${c.is_active ? t('btn_deactivate') : t('btn_activate')}</button>
                          <button type="button" class="icon-btn deleteCompanyBtn" data-id="${c.id}" title="${t('btn_delete')}">${icon('trash')}</button>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>` : `<p class="hint">${t('no_companies_hint')}</p>`;

            listEl.querySelectorAll('.companyDisplayNameInput').forEach((input) => {
              input.addEventListener('change', async () => {
                try {
                  await api(`/companies/${input.dataset.id}`, { method: 'PATCH', body: { displayName: input.value.trim() || null } });
                  showToast(t('toast_company_updated'), 'success');
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            });

            listEl.querySelectorAll('.companyLogoInput').forEach((input) => {
              input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  const dataUri = await resizeImageToDataUri(file, 160);
                  await api(`/companies/${input.dataset.id}`, { method: 'PATCH', body: { logo: dataUri } });
                  showToast(t('toast_company_updated'), 'success');
                  loadCompanies();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            });

            listEl.querySelectorAll('.toggleCompanyActiveBtn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                try {
                  await api(`/companies/${btn.dataset.id}`, { method: 'PATCH', body: { isActive: btn.dataset.active !== '1' } });
                  showToast(t('toast_company_updated'), 'success');
                  loadCompanies();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            });

            listEl.querySelectorAll('.deleteCompanyBtn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                if (!confirm(t('confirm_delete_company'))) return;
                try {
                  await api(`/companies/${btn.dataset.id}`, { method: 'DELETE' });
                  showToast(t('toast_company_deleted'), 'success');
                  loadCompanies();
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

        guardForm(document.getElementById('newCompanyForm'), async () => {
          const errEl = document.getElementById('companyError');
          errEl.textContent = '';
          const name = document.getElementById('newCompanyName').value.trim();
          if (!name) {
            errEl.textContent = t('company_error_required');
            return;
          }
          try {
            await api('/companies', {
              method: 'POST',
              body: { name, displayName: document.getElementById('newCompanyDisplayName').value.trim() || null },
            });
            document.getElementById('newCompanyForm').reset();
            showToast(t('toast_company_created'), 'success');
            loadCompanies();
          } catch (err) {
            errEl.textContent = err.message;
          }
        });

        loadCompanies();
      }

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
          roleId: document.getElementById('newRoleId').value || null,
        };
        try {
          const { user, tempPassword } = await api('/users', { method: 'POST', body });
          document.getElementById('tempPasswordBox').innerHTML = `
            <div class="divider"></div>
            <p class="success-text">${t('account_created_for')} ${escapeHtml(user.name)}.</p>
            <p class="hint">${t('temp_password_hint')}</p>
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-flex;align-items:center;gap:0.6rem">
              ${escapeHtml(tempPassword)}
              <button type="button" id="copyTempPwBtn2" class="icon-btn" title="${t('btn_copy')}">${icon('copy', 'badge-icon')}</button>
            </p>`;
          document.getElementById('copyTempPwBtn2').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(tempPassword); showToast(t('toast_copied'), 'success'); }
            catch { showToast(t('toast_copy_failed'), 'error'); }
          });
          e.target.reset();
          showToast(t('toast_staff_created'), 'success');
          loadUsersTable();
          loadManagerOptions();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });

      const bulkImportFile = document.getElementById('bulkImportFile');
      const bulkImportBtn = document.getElementById('bulkImportBtn');
      if (bulkImportFile && bulkImportBtn) {
        bulkImportFile.addEventListener('change', () => {
          bulkImportBtn.disabled = !bulkImportFile.files.length;
          document.getElementById('bulkImportError').textContent = '';
          document.getElementById('bulkImportResults').innerHTML = '';
        });
        bulkImportBtn.addEventListener('click', async () => {
          const errEl = document.getElementById('bulkImportError');
          const resultsEl = document.getElementById('bulkImportResults');
          errEl.textContent = '';
          resultsEl.innerHTML = '';
          const file = bulkImportFile.files[0];
          if (!file) return;
          bulkImportBtn.disabled = true;
          try {
            const text = await file.text();
            const rows = parseUserImportCsv(text);
            if (!rows.length) {
              errEl.textContent = t('admin_bulk_import_empty');
              return;
            }
            const { results, summary } = await api('/users/bulk', { method: 'POST', body: { rows } });
            resultsEl.innerHTML = `
              <p class="hint">${t('admin_bulk_import_summary').replace('{created}', summary.created).replace('{failed}', summary.failed)}</p>
              <ul class="plain-list">
                ${results.map((r) => `<li>${r.success ? `${icon('check', 'badge-icon')} ${escapeHtml(r.name)} (${escapeHtml(r.email)})` : `${icon('x', 'badge-icon')} ${t('admin_bulk_import_row_label')} ${r.row}: ${escapeHtml(r.error)}`}</li>`).join('')}
              </ul>`;
            bulkImportFile.value = '';
            if (summary.created > 0) {
              showToast(t('toast_bulk_import_done'), 'success');
              loadUsersTable();
              loadManagerOptions();
            }
          } catch (err) {
            errEl.textContent = err.message;
          } finally {
            bulkImportBtn.disabled = !bulkImportFile.files.length;
          }
        });
      }

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
          const [{ categories }, { groups }] = await Promise.all([api('/categories'), api('/groups')]);
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

      document.getElementById('categoryExpandAllBtn').addEventListener('click', () => {
        document.querySelectorAll('#categoriesList .category-macro-block').forEach((el) => { el.open = true; });
      });
      document.getElementById('categoryCollapseAllBtn').addEventListener('click', () => {
        document.querySelectorAll('#categoriesList .category-macro-block').forEach((el) => { el.open = false; });
      });

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

    let allGroupsCache = [];
    const usersPageState = { page: 1, pageSize: 50, total: 0 };
    const selectedUserIds = new Set();

    async function initUsersTable() {
      const wrap = document.getElementById('usersWrap');
      wrap.className = 'card';
      const groupsRes = isAdmin ? await api('/groups').catch(() => ({ groups: [] })) : { groups: [] };
      allGroupsCache = groupsRes.groups || [];
      wrap.innerHTML = `
        <div class="filters" style="margin-bottom:1rem">
          <div class="field" style="max-width:320px">
            <label for="userSearchInput">${t('search_person_label')}</label>
            <input id="userSearchInput" type="search" placeholder="${t('search_person_placeholder')}" />
          </div>
          <select id="userStatusFilter">
            <option value="">${t('filter_all_users')}</option>
            <option value="active">${t('filter_active_users')}</option>
            <option value="blocked">${t('filter_blocked_users')}</option>
          </select>
          <select id="userRoleFilter">
            <option value="">${t('filter_all_roles')}</option>
            ${Object.entries(roleLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          ${isAdmin ? `<select id="userGroupFilter">
            <option value="">${t('filter_all_groups')}</option>
            ${groupOptionsHtml(allGroupsCache, '', null)}
          </select>` : ''}
        </div>
        ${isAdmin ? `
        <div id="userBulkBar" class="bulk-action-bar" hidden>
          <span id="userBulkCount" class="hint"></span>
          <select id="userBulkRoleSel">
            <option value="">${t('bulk_user_role_placeholder')}</option>
            ${Object.entries(roleLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select id="userBulkGroupSel">
            <option value="">${t('bulk_user_group_placeholder')}</option>
            <option value="__none__">${t('no_group_option')}</option>
            ${groupOptionsHtml(allGroupsCache, '', null)}
          </select>
          <button type="button" id="userBulkDeleteBtn" class="btn btn-outline-danger btn-sm">${icon('trash')} ${t('bulk_delete_btn')}</button>
          <button type="button" id="userBulkClearBtn" class="btn btn-ghost btn-sm">${t('bulk_clear_selection')}</button>
        </div>` : ''}
        <div class="table-scroll">
          <table class="users-table">
            <thead><tr>${isAdmin ? `<th><input type="checkbox" id="userSelectAllBox" /></th>` : ''}<th>${t('th_name')}</th><th>${t('th_email')}</th><th>${t('th_role')}</th><th>${t('th_group')}</th><th>${t('th_status')}</th><th>${t('th_registered')}</th></tr></thead>
            <tbody id="usersTableBody"></tbody>
          </table>
        </div>
        <div class="pagination-bar">
          <button type="button" id="usersPagePrev" class="btn btn-ghost btn-sm">${icon('arrowLeft', 'badge-icon')} ${t('page_prev')}</button>
          <span id="usersPageInfo" class="hint"></span>
          <button type="button" id="usersPageNext" class="btn btn-ghost btn-sm">${t('page_next')} ${icon('arrowRight', 'badge-icon')}</button>
        </div>`;

      const userBulkBar = document.getElementById('userBulkBar');
      const userBulkCount = document.getElementById('userBulkCount');
      const userSelectAllBox = document.getElementById('userSelectAllBox');
      const searchInput = document.getElementById('userSearchInput');
      const statusSelect = document.getElementById('userStatusFilter');
      const roleSelect = document.getElementById('userRoleFilter');
      const groupSelect = document.getElementById('userGroupFilter');
      const pagePrevBtn = document.getElementById('usersPagePrev');
      const pageNextBtn = document.getElementById('usersPageNext');
      const pageInfoEl = document.getElementById('usersPageInfo');

      function updateUserBulkBar() {
        if (!userBulkBar) return;
        userBulkBar.hidden = selectedUserIds.size === 0;
        userBulkCount.textContent = `${t('bulk_selected_count')} ${selectedUserIds.size}`;
      }

      let currentPageUsers = [];
      function wireUserCheckboxes() {
        const tbody = document.getElementById('usersTableBody');
        tbody.querySelectorAll('.userSelectCell').forEach((cell) => {
          cell.addEventListener('click', (e) => e.stopPropagation());
        });
        tbody.querySelectorAll('.userSelectBox').forEach((box) => {
          box.checked = selectedUserIds.has(Number(box.dataset.id));
          box.addEventListener('change', () => {
            const id = Number(box.dataset.id);
            if (box.checked) selectedUserIds.add(id); else selectedUserIds.delete(id);
            updateUserBulkBar();
          });
        });
        if (userSelectAllBox) {
          userSelectAllBox.checked = currentPageUsers.length > 0 && currentPageUsers.every((u) => u.id === state.user.id || selectedUserIds.has(u.id));
        }
      }

      function renderRows(users) {
        currentPageUsers = users;
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = users.length ? users.map((u) => `
          <tr class="user-row" data-user-id="${u.id}" tabindex="0" role="link">
            ${isAdmin ? `<td class="userSelectCell">${u.id !== state.user.id ? `<input type="checkbox" class="userSelectBox" data-id="${u.id}" />` : ''}</td>` : ''}
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="role-tag">${roleLabels()[u.role] || u.role}</span> ${u.role_label_it ? `<span class="role-tag" style="background:${u.role_color}22;color:${u.role_color};border-color:${u.role_color}44">${escapeHtml(state.user.locale === 'en' ? u.role_label_en : u.role_label_it)}</span>` : ''} ${u.is_external ? `<span class="role-tag role-tag-external">${t('external_badge')}</span>` : ''}</td>
            <td>${escapeHtml(groupLabel(u) || '—')}</td>
            <td>${u.is_blocked ? `<span class="role-tag role-tag-danger">${t('blocked_badge')}</span>` : ''}</td>
            <td>${formatDate(u.created_at)}</td>
          </tr>`).join('') : `<tr><td colspan="${isAdmin ? 7 : 6}"><p class="hint">${t('no_people_found')}</p></td></tr>`;
        tbody.querySelectorAll('.user-row').forEach((row) => {
          row.addEventListener('click', () => { location.hash = `#/users/${row.dataset.userId}`; });
          row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') location.hash = `#/users/${row.dataset.userId}`;
          });
        });
        wireUserCheckboxes();
      }

      function updatePaginationBar() {
        const totalPages = Math.max(1, Math.ceil(usersPageState.total / usersPageState.pageSize));
        pageInfoEl.textContent = `${t('page_indicator_prefix')} ${usersPageState.page} ${t('page_indicator_of')} ${totalPages} · ${usersPageState.total} ${t('page_indicator_results')}`;
        pagePrevBtn.disabled = usersPageState.page <= 1;
        pageNextBtn.disabled = usersPageState.page >= totalPages;
      }

      async function loadUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}"><p class="hint">${t('loading')}</p></td></tr>`;
        const params = new URLSearchParams();
        if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
        if (statusSelect.value) params.set('status', statusSelect.value);
        if (roleSelect.value) params.set('role', roleSelect.value);
        if (groupSelect && groupSelect.value) params.set('groupId', groupSelect.value);
        params.set('page', usersPageState.page);
        params.set('pageSize', usersPageState.pageSize);
        try {
          let { users, total } = await api(`/users?${params.toString()}`);
          const totalPages = Math.max(1, Math.ceil(total / usersPageState.pageSize));
          if (usersPageState.page > totalPages) {
            usersPageState.page = totalPages;
            params.set('page', usersPageState.page);
            ({ users, total } = await api(`/users?${params.toString()}`));
          }
          usersPageState.total = total;
          renderRows(users);
          updatePaginationBar();
          updateUserBulkBar();
        } catch (err) {
          tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}"><p class="error-text">${escapeHtml(err.message)}</p></td></tr>`;
        }
      }

      let debounceTimer;
      function onFilterChange() {
        usersPageState.page = 1;
        loadUsersTable();
      }
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(onFilterChange, 300);
      });
      statusSelect.addEventListener('change', onFilterChange);
      roleSelect.addEventListener('change', onFilterChange);
      if (groupSelect) groupSelect.addEventListener('change', onFilterChange);

      pagePrevBtn.addEventListener('click', () => {
        if (usersPageState.page <= 1) return;
        usersPageState.page -= 1;
        loadUsersTable();
      });
      pageNextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(usersPageState.total / usersPageState.pageSize));
        if (usersPageState.page >= totalPages) return;
        usersPageState.page += 1;
        loadUsersTable();
      });

      if (userSelectAllBox) {
        userSelectAllBox.addEventListener('change', () => {
          if (userSelectAllBox.checked) {
            currentPageUsers.forEach((u) => { if (u.id !== state.user.id) selectedUserIds.add(u.id); });
          } else {
            currentPageUsers.forEach((u) => selectedUserIds.delete(u.id));
          }
          wireUserCheckboxes();
          updateUserBulkBar();
        });
      }

      const userBulkClearBtn = document.getElementById('userBulkClearBtn');
      if (userBulkClearBtn) {
        userBulkClearBtn.addEventListener('click', () => {
          selectedUserIds.clear();
          wireUserCheckboxes();
          updateUserBulkBar();
        });
      }

      const userBulkRoleSel = document.getElementById('userBulkRoleSel');
      if (userBulkRoleSel) {
        userBulkRoleSel.addEventListener('change', async () => {
          if (!userBulkRoleSel.value || !selectedUserIds.size) return;
          const role = userBulkRoleSel.value;
          try {
            await Promise.all([...selectedUserIds].map((id) => api(`/users/${id}/role`, { method: 'PATCH', body: { role } })));
            showToast(t('toast_bulk_user_updated'), 'success');
            selectedUserIds.clear();
            userBulkRoleSel.value = '';
            loadUsersTable();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      const userBulkGroupSel = document.getElementById('userBulkGroupSel');
      if (userBulkGroupSel) {
        userBulkGroupSel.addEventListener('change', async () => {
          if (!userBulkGroupSel.value || !selectedUserIds.size) return;
          const groupId = userBulkGroupSel.value === '__none__' ? null : Number(userBulkGroupSel.value);
          try {
            await Promise.all([...selectedUserIds].map((id) => api(`/users/${id}/group`, { method: 'PATCH', body: { groupId } })));
            showToast(t('toast_bulk_user_updated'), 'success');
            selectedUserIds.clear();
            userBulkGroupSel.value = '';
            loadUsersTable();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      const userBulkDeleteBtn = document.getElementById('userBulkDeleteBtn');
      if (userBulkDeleteBtn) {
        userBulkDeleteBtn.addEventListener('click', async () => {
          if (!selectedUserIds.size) return;
          if (!confirm(`${t('confirm_bulk_delete_users_prefix')} ${selectedUserIds.size}${t('confirm_bulk_delete_users_suffix')}`)) return;
          try {
            await Promise.all([...selectedUserIds].map((id) => api(`/users/${id}`, { method: 'DELETE' })));
            showToast(t('toast_bulk_users_deleted'), 'success');
            selectedUserIds.clear();
            loadUsersTable();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      loadUsersTable();
    }

    initUsersTable();
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
    const [groups, createdStats, assignedStats, allUsers, assignedAssets, roles] = await Promise.all([
      isAdmin ? api('/groups').then((d) => d.groups).catch(() => []) : Promise.resolve([]),
      api(`/tickets?createdBy=${user.id}`).then((d) => d.tickets).catch(() => []),
      user.role !== 'customer' ? api(`/tickets?assigned=${user.id}`).then((d) => d.tickets).catch(() => []) : Promise.resolve([]),
      user.role !== 'customer' ? api('/users').then((d) => d.users).catch(() => []) : Promise.resolve([]),
      user.role !== 'customer' ? api(`/assets?assignedTo=${user.id}`).then((d) => d.assets).catch(() => []) : Promise.resolve([]),
      isAdmin && user.role !== 'customer' ? api('/roles').then((d) => d.roles).catch(() => []) : Promise.resolve([]),
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
            ${user.is_blocked ? `<span class="role-tag role-tag-danger" style="margin-top:0.5rem;display:inline-block">${t('blocked_badge')}</span>` : ''}
          </div>
          ${state.user.is_super_admin && !isSelf ? `<button type="button" id="impersonateBtn" class="btn btn-sm" style="margin-left:auto">${icon('eye')} ${t('impersonate')}</button>` : ''}
        </div>

        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('account_details_title')}</h3>
          <div class="field"><label>${t('registered_on_label')}</label><p>${formatDate(user.created_at)}</p></div>
          ${isAdmin ? `
          <form id="detailProfileForm" class="form-grid" style="max-width:none;margin-bottom:0.5rem">
            <div class="field-row">
              <div class="field"><label for="detailName">${t('field_name')}</label><input id="detailName" value="${escapeHtml(user.name)}" required /></div>
              <div class="field"><label for="detailEmail">Email</label><input id="detailEmail" type="email" value="${escapeHtml(user.email)}" required /></div>
            </div>
            <p class="error-text" id="detailProfileError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_save_changes')}</button></div>
          </form>
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
          <div class="field">
            <label for="detailRoleId">${t('field_specific_role')}</label>
            <select id="detailRoleId">
              <option value="">${t('specific_role_none_option')}</option>
              ${roles.map((r) => `<option value="${r.id}" ${user.role_id === r.id ? 'selected' : ''}>${escapeHtml(state.user.locale === 'en' ? r.label_en : r.label_it)}</option>`).join('')}
            </select>
            <span class="hint">${t('specific_role_hint')}</span>
          </div>
          <label class="checkbox-field">
            <input type="checkbox" id="detailIsExternal" ${user.is_external ? 'checked' : ''} />
            ${t('field_is_external')}
          </label>
          ` : ''}
          <button type="button" id="detailResetPwBtn" class="btn btn-sm btn-outline-danger" style="margin-top:0.5rem">${icon('refresh')} ${t('reset_password_btn')}</button>
          <div id="detailResetPwBox"></div>
          ${user.is_blocked && user.blocked_reason ? `<p class="hint" style="margin-top:0.5rem"><strong>${t('blocked_reason_label')}:</strong> ${escapeHtml(user.blocked_reason)}</p>` : ''}
          ${!isSelf ? `<button type="button" id="detailBlockBtn" class="btn btn-sm ${user.is_blocked ? '' : 'btn-outline-danger'}" style="margin-top:0.5rem">${icon(user.is_blocked ? 'check' : 'lock')} ${t(user.is_blocked ? 'btn_unblock_account' : 'btn_block_account')}</button>` : ''}
          ${!isSelf ? `<button type="button" id="detailDeleteBtn" class="btn btn-sm btn-danger" style="margin-top:0.5rem">${icon('trash')} ${t('delete_account_btn')}</button>` : ''}
          ` : `
          <div class="field"><label>${t('field_group')}</label><p>${escapeHtml(groupLabel(user) || '—')}</p></div>
          <div class="field"><label>${t('field_locale')}</label><p>${escapeHtml(LANG_LABELS[user.locale] || user.locale || '—')}</p></div>
          ${user.role !== 'customer' ? `<div class="field"><label>${t('manager_label')}</label><p>${escapeHtml(user.manager_name || t('no_manager_label'))}</p></div>` : ''}
          `}
        </div>

        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('ticket_activity_title')}</h3>
          <div class="stat-row" style="grid-template-columns:1fr 1fr">
            <button type="button" id="statCreatedBtn" class="stat-card" style="text-align:left;cursor:pointer;border:1px solid var(--border)"><div class="stat-value">${createdStats.length}</div><div class="stat-label">${t('opened_by_person')}</div></button>
            ${user.role !== 'customer' ? `<button type="button" id="statAssignedBtn" class="stat-card" style="text-align:left;cursor:pointer;border:1px solid var(--border)"><div class="stat-value">${assignedStats.length}</div><div class="stat-label">${t('assigned_to_person')}</div></button>` : ''}
          </div>
        </div>
        ${user.role !== 'customer' ? `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('assets_assigned_title')}</h3>
          ${assignedAssets.length ? `<ul class="plain-list">${assignedAssets.map((a) => `<li><a href="#/assets">${escapeHtml(a.name)}</a>${a.tag ? ' · ' + escapeHtml(a.tag) : ''} · ${assetTypeLabels()[a.asset_type] || a.asset_type}</li>`).join('')}</ul>` : `<p class="hint">${t('no_assets_assigned')}</p>`}
        </div>` : ''}
        ${user.role !== 'customer' ? `
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('direct_reports_title')}</h3>
          ${directReports.length ? `<ul class="plain-list">${directReports.map((r) => `<li><a href="#/users/${r.id}">${escapeHtml(r.name)}</a> · ${roleLabels()[r.role] || r.role}${groupLabel(r) ? ' · ' + escapeHtml(groupLabel(r)) : ''}</li>`).join('')}</ul>` : `<p class="hint">${t('no_direct_reports')}</p>`}
        </div>` : ''}
      </div>`;

    document.getElementById('statCreatedBtn').addEventListener('click', () => {
      sessionStorage.setItem('ticketing_search_created_by', `${user.id}|${user.name}`);
      location.hash = '#/search';
    });
    if (user.role !== 'customer') {
      document.getElementById('statAssignedBtn').addEventListener('click', () => {
        sessionStorage.setItem('ticketing_search_assigned', `${user.id}|${user.name}`);
        location.hash = '#/search';
      });
    }

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
        const managerOptions = allUsers.filter((u) => u.id !== user.id).sort((a, b) => a.name.localeCompare(b.name));
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
      const detailRoleId = document.getElementById('detailRoleId');
      if (detailRoleId) {
        detailRoleId.addEventListener('change', async (e) => {
          try {
            await api(`/users/${user.id}/role_id`, { method: 'PATCH', body: { roleId: e.target.value || null } });
            showToast(t('toast_specific_role_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
            renderUserDetail(id);
          }
        });
      }
      guardForm(document.getElementById('detailProfileForm'), async () => {
        const errEl = document.getElementById('detailProfileError');
        errEl.textContent = '';
        try {
          const { user: updated } = await api(`/users/${user.id}/profile`, {
            method: 'PATCH',
            body: { name: document.getElementById('detailName').value.trim(), email: document.getElementById('detailEmail').value.trim() },
          });
          showToast(t('toast_profile_updated'), 'success');
          renderUserDetail(updated.id);
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
      const detailBlockBtn = document.getElementById('detailBlockBtn');
      if (detailBlockBtn) {
        detailBlockBtn.addEventListener('click', async () => {
          const nextBlocked = !user.is_blocked;
          const confirmMsg = nextBlocked
            ? `${t('confirm_block_account_prefix')} ${user.name}${t('confirm_block_account_suffix')}`
            : `${t('confirm_unblock_account_prefix')} ${user.name}${t('confirm_unblock_account_suffix')}`;
          if (!confirm(confirmMsg)) return;
          const reason = nextBlocked ? prompt(t('block_reason_prompt')) : null;
          try {
            await api(`/users/${user.id}/block`, { method: 'PATCH', body: { blocked: nextBlocked, reason } });
            showToast(t(nextBlocked ? 'toast_account_blocked' : 'toast_account_unblocked'), 'success');
            renderUserDetail(id);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
      const detailDeleteBtn = document.getElementById('detailDeleteBtn');
      if (detailDeleteBtn) {
        detailDeleteBtn.addEventListener('click', async () => {
          if (!confirm(`${t('confirm_delete_account_prefix')} ${user.name}${t('confirm_delete_account_suffix')}`)) return;
          try {
            await api(`/users/${user.id}`, { method: 'DELETE' });
            showToast(t('toast_account_deleted'), 'success');
            location.hash = '#/admin';
          } catch (err) {
            showToast(err.message, 'error');
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
            <p class="card" style="font-family:monospace;font-size:1rem;padding:0.6rem 0.9rem;display:inline-flex;align-items:center;gap:0.6rem">
              ${escapeHtml(tempPassword)}
              <button type="button" id="copyTempPwBtn" class="icon-btn" title="${t('btn_copy')}">${icon('copy', 'badge-icon')}</button>
            </p>`;
          document.getElementById('copyTempPwBtn').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(tempPassword); showToast(t('toast_copied'), 'success'); }
            catch { showToast(t('toast_copy_failed'), 'error'); }
          });
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
        <input id="assetQueryFilter" type="search" placeholder="${t('assets_search_placeholder')}" style="flex:1 1 220px" />
        <select id="assetStatusFilter">
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(assetStatusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div id="assetBulkBar" class="bulk-action-bar" hidden>
        <span id="assetBulkCount" class="hint"></span>
        <select id="assetBulkStatusSel">
          <option value="">${t('bulk_status_placeholder')}</option>
          ${Object.entries(assetStatusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="assetBulkAssignTypeSel">
          <option value="">${t('bulk_assignment_placeholder')}</option>
          <option value="permanente">${t('assignment_permanent')}</option>
          <option value="prestito">${t('assignment_loan')}</option>
        </select>
        <input id="assetBulkPrefixInput" type="text" value="ITA-" placeholder="${t('bulk_tag_prefix_placeholder')}" style="width:8rem" />
        <button type="button" id="assetBulkPrefixBtn" class="btn btn-ghost btn-sm">${t('bulk_apply_prefix')}</button>
        ${state.user.role === 'admin' ? `<button type="button" id="assetBulkDeleteBtn" class="btn btn-outline-danger btn-sm">${icon('trash')} ${t('bulk_delete_btn')}</button>` : ''}
        <button type="button" id="assetBulkClearBtn" class="btn btn-ghost btn-sm">${t('bulk_clear_selection')}</button>
      </div>
      <div id="assetsWrap" class="card spinner-row">${t('loading')}</div>`;

    let usersCache = [];
    try {
      usersCache = (await api('/users')).users.filter((u) => u.role !== 'customer');
    } catch { usersCache = []; }

    const statusFilter = document.getElementById('assetStatusFilter');
    const queryFilter = document.getElementById('assetQueryFilter');
    const assetBulkBar = document.getElementById('assetBulkBar');
    const assetBulkCount = document.getElementById('assetBulkCount');
    const assetBulkStatusSel = document.getElementById('assetBulkStatusSel');
    const assetBulkAssignTypeSel = document.getElementById('assetBulkAssignTypeSel');
    const assetBulkPrefixInput = document.getElementById('assetBulkPrefixInput');
    const assetBulkPrefixBtn = document.getElementById('assetBulkPrefixBtn');
    const assetBulkClearBtn = document.getElementById('assetBulkClearBtn');
    const selectedAssets = new Set();

    function updateAssetBulkBar() {
      assetBulkBar.hidden = selectedAssets.size === 0;
      assetBulkCount.textContent = `${t('bulk_selected_count')} ${selectedAssets.size}`;
    }

    async function loadAssets() {
      const wrap = document.getElementById('assetsWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = t('loading');
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        if (queryFilter.value.trim()) params.set('q', queryFilter.value.trim());
        const { assets } = await api(`/assets?${params.toString()}`);
        wrap.className = 'card';
        wrap.innerHTML = assets.length ? `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th><input type="checkbox" id="assetSelectAll" /></th><th>${t('field_name')}</th><th>${t('table_type')}</th><th>${t('table_tag')}</th><th>${t('table_status')}</th><th>${t('table_assignment')}</th><th>${t('assigned_to_label')}</th><th>${t('table_due_date')}</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${assets.map((a) => `
                  <tr>
                    <td><input type="checkbox" class="assetSelectBox" data-id="${a.id}" /></td>
                    <td><input type="text" class="assetNameInput" data-id="${a.id}" value="${escapeHtml(a.name)}" /></td>
                    <td>
                      <select class="assetTypeSel" data-id="${a.id}">
                        ${Object.entries(assetTypeLabels()).map(([v, l]) => `<option value="${v}" ${a.asset_type === v ? 'selected' : ''}>${l}</option>`).join('')}
                      </select>
                    </td>
                    <td><input type="text" class="assetTagInput" data-id="${a.id}" value="${escapeHtml(a.tag || '')}" placeholder="—" /></td>
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

        wrap.querySelectorAll('.assetNameInput').forEach((input) => input.addEventListener('change', async () => {
          if (!input.value.trim()) { showToast(t('asset_name_required_error'), 'error'); loadAssets(); return; }
          try {
            await api(`/assets/${input.dataset.id}`, { method: 'PATCH', body: { name: input.value.trim() } });
            showToast(t('toast_asset_updated'), 'success');
          } catch (err) { showToast(err.message, 'error'); loadAssets(); }
        }));
        wrap.querySelectorAll('.assetTypeSel').forEach((sel) => sel.addEventListener('change', async () => {
          try {
            await api(`/assets/${sel.dataset.id}`, { method: 'PATCH', body: { assetType: sel.value } });
            showToast(t('toast_asset_updated'), 'success');
          } catch (err) { showToast(err.message, 'error'); loadAssets(); }
        }));
        wrap.querySelectorAll('.assetTagInput').forEach((input) => input.addEventListener('change', async () => {
          try {
            await api(`/assets/${input.dataset.id}`, { method: 'PATCH', body: { tag: input.value.trim() || null } });
            showToast(t('toast_asset_updated'), 'success');
          } catch (err) { showToast(err.message, 'error'); loadAssets(); }
        }));
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

        const visibleIds = new Set(assets.map((a) => a.id));
        [...selectedAssets].forEach((id) => { if (!visibleIds.has(id)) selectedAssets.delete(id); });
        const selectAllBox = document.getElementById('assetSelectAll');
        const assetBoxes = wrap.querySelectorAll('.assetSelectBox');
        assetBoxes.forEach((box) => {
          box.checked = selectedAssets.has(Number(box.dataset.id));
          box.addEventListener('change', () => {
            const id = Number(box.dataset.id);
            if (box.checked) selectedAssets.add(id); else selectedAssets.delete(id);
            selectAllBox.checked = selectedAssets.size === assetBoxes.length;
            updateAssetBulkBar();
          });
        });
        if (selectAllBox) {
          selectAllBox.checked = assetBoxes.length > 0 && selectedAssets.size === assetBoxes.length;
          selectAllBox.addEventListener('change', () => {
            assetBoxes.forEach((box) => {
              box.checked = selectAllBox.checked;
              const id = Number(box.dataset.id);
              if (selectAllBox.checked) selectedAssets.add(id); else selectedAssets.delete(id);
            });
            updateAssetBulkBar();
          });
        }
        updateAssetBulkBar();
      } catch (err) {
        wrap.className = '';
        wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    assetBulkClearBtn.addEventListener('click', () => {
      selectedAssets.clear();
      loadAssets();
    });

    assetBulkStatusSel.addEventListener('change', async () => {
      if (!assetBulkStatusSel.value || !selectedAssets.size) return;
      try {
        await api('/assets/bulk', { method: 'PATCH', body: { ids: [...selectedAssets], status: assetBulkStatusSel.value } });
        showToast(t('toast_bulk_asset_updated'), 'success');
        assetBulkStatusSel.value = '';
        loadAssets();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    assetBulkAssignTypeSel.addEventListener('change', async () => {
      if (!assetBulkAssignTypeSel.value || !selectedAssets.size) return;
      try {
        await api('/assets/bulk', { method: 'PATCH', body: { ids: [...selectedAssets], assignmentType: assetBulkAssignTypeSel.value } });
        showToast(t('toast_bulk_asset_updated'), 'success');
        assetBulkAssignTypeSel.value = '';
        loadAssets();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    assetBulkPrefixBtn.addEventListener('click', async () => {
      if (!assetBulkPrefixInput.value.trim() || !selectedAssets.size) return;
      try {
        await api('/assets/bulk', { method: 'PATCH', body: { ids: [...selectedAssets], tagPrefix: assetBulkPrefixInput.value.trim() } });
        showToast(t('toast_bulk_prefix_applied'), 'success');
        loadAssets();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const assetBulkDeleteBtn = document.getElementById('assetBulkDeleteBtn');
    if (assetBulkDeleteBtn) {
      assetBulkDeleteBtn.addEventListener('click', async () => {
        if (!selectedAssets.size) return;
        if (!confirm(`${t('confirm_bulk_delete_assets_prefix')} ${selectedAssets.size}${t('confirm_bulk_delete_assets_suffix')}`)) return;
        try {
          await Promise.all([...selectedAssets].map((id) => api(`/assets/${id}`, { method: 'DELETE' })));
          showToast(t('toast_bulk_assets_deleted'), 'success');
          selectedAssets.clear();
          loadAssets();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    statusFilter.addEventListener('change', loadAssets);
    let assetQueryDebounce;
    queryFilter.addEventListener('input', () => {
      clearTimeout(assetQueryDebounce);
      assetQueryDebounce = setTimeout(loadAssets, 200);
    });

    const presetAssetQuery = sessionStorage.getItem('ticketing_assets_query');
    if (presetAssetQuery) {
      sessionStorage.removeItem('ticketing_assets_query');
      queryFilter.value = presetAssetQuery;
    }

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

  function canManageAnnouncements() {
    return !!(state.user && (state.user.role === 'admin' || state.user.is_super_admin || (Array.isArray(state.user.permissions) && state.user.permissions.includes('announcements_manage'))));
  }

  async function renderAnnouncements(param) {
    if (param === 'new') return renderAnnouncementForm();
    if (param && param !== 'new') return renderAnnouncementDetail(param);
    return renderAnnouncementsList();
  }

  async function renderAnnouncementsList() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('megaphone')} ${t('nav_announcements')}</h1>
          <p class="hint">${t('announcements_hint')}</p>
        </div>
        ${canManageAnnouncements() ? `<a href="#/announcements/new" class="btn btn-sm">${icon('plus')} ${t('btn_new_announcement')}</a>` : ''}
      </div>
      <div id="announcementsWrap" class="card spinner-row">${t('loading')}</div>`;

    const wrap = document.getElementById('announcementsWrap');
    try {
      const { announcements } = await api('/announcements');
      wrap.className = 'card-list';
      wrap.innerHTML = announcements.length ? announcements.map((a) => `
        <a href="#/announcements/${a.id}" class="card announcement-card ${a.is_read ? '' : 'announcement-unread'} ${a.pinned ? 'announcement-pinned' : ''}">
          <div class="announcement-card-head">
            <h3>${a.pinned ? icon('star', 'badge-icon') : ''} ${escapeHtml(a.title)}</h3>
            <span class="hint">${formatDate(a.created_at)}</span>
          </div>
          <p class="announcement-preview">${escapeHtml(a.body.slice(0, 180))}${a.body.length > 180 ? '…' : ''}</p>
          <p class="hint">${escapeHtml(a.created_by_name || '')}</p>
        </a>`).join('') : `<p class="hint">${t('no_announcements_found')}</p>`;
    } catch (err) {
      wrap.className = '';
      wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
    refreshAnnouncementsNavDot();
  }

  function formatAnnouncementBody(raw) {
    const escaped = escapeHtml(raw);
    function inline(text) {
      let out = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return out;
    }
    const blocks = [];
    let listBuffer = [];
    let paragraphBuffer = [];
    function flushList() {
      if (listBuffer.length) {
        blocks.push(`<ul>${listBuffer.map((li) => `<li>${li}</li>`).join('')}</ul>`);
        listBuffer = [];
      }
    }
    function flushParagraph() {
      if (paragraphBuffer.length) {
        blocks.push(`<p>${paragraphBuffer.join('<br>')}</p>`);
        paragraphBuffer = [];
      }
    }
    escaped.split('\n').forEach((line) => {
      const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
      const listMatch = /^-\s+(.*)$/.exec(line);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length + 3;
        blocks.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      } else if (listMatch) {
        flushParagraph();
        listBuffer.push(inline(listMatch[1]));
      } else if (line.trim()) {
        flushList();
        paragraphBuffer.push(inline(line));
      } else {
        flushParagraph();
        flushList();
      }
    });
    flushParagraph();
    flushList();
    return blocks.filter(Boolean).join('') || '<p></p>';
  }

  async function renderAnnouncementDetail(id) {
    appEl.innerHTML = `<div class="card spinner-row">${t('loading')}</div>`;
    let announcement;
    try {
      ({ announcement } = await api(`/announcements/${id}`));
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }
    if (!announcement.is_read) {
      api(`/announcements/${id}/read`, { method: 'POST' }).then(refreshAnnouncementsNavDot).catch(() => {});
    }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${announcement.pinned ? icon('star') : icon('megaphone')} ${escapeHtml(announcement.title)}</h1>
          <p class="hint">${escapeHtml(announcement.created_by_name || '')} · ${formatDate(announcement.created_at)}</p>
        </div>
        <a href="#/announcements" class="btn btn-ghost btn-sm">${icon('arrowLeft')} ${t('back_to_list')}</a>
      </div>
      <div class="card">
        <div class="announcement-body">${formatAnnouncementBody(announcement.body)}</div>
        ${canManageAnnouncements() ? `
          <div class="announcement-admin-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="announcementPinBtn">${announcement.pinned ? t('btn_unpin') : t('btn_pin')}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="announcementEditBtn">${icon('edit', 'badge-icon')} ${t('btn_edit')}</button>
            <button type="button" class="btn btn-ghost btn-sm error-text" id="announcementDeleteBtn">${icon('trash', 'badge-icon')} ${t('btn_delete')}</button>
          </div>` : ''}
      </div>
      <div class="card">
        <h3 class="section-title" style="margin-top:0">${t('announcement_files_title')}</h3>
        <div id="announcementFilesWrap" class="spinner-row">${t('loading')}</div>
      </div>`;

    (async () => {
      const filesWrap = document.getElementById('announcementFilesWrap');
      try {
        const { attachments } = await api(`/announcements/${id}/attachments`);
        renderAnnouncementFilesList(filesWrap, id, attachments, canManageAnnouncements());
      } catch (err) {
        filesWrap.className = '';
        filesWrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    })();

    if (canManageAnnouncements()) {
      document.getElementById('announcementPinBtn').addEventListener('click', async () => {
        try {
          await api(`/announcements/${announcement.id}`, { method: 'PATCH', body: { pinned: !announcement.pinned } });
          renderAnnouncementDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      document.getElementById('announcementEditBtn').addEventListener('click', () => {
        renderAnnouncementForm(announcement);
      });
      document.getElementById('announcementDeleteBtn').addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_announcement'))) return;
        try {
          await api(`/announcements/${announcement.id}`, { method: 'DELETE' });
          showToast(t('toast_announcement_deleted'), 'success');
          location.hash = '#/announcements';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  function renderAnnouncementFilesList(wrap, announcementId, attachments, canManage) {
    wrap.className = 'attachments-list';
    wrap.innerHTML = attachments.length ? attachments.map((a) => `
      <div class="attachment-row" data-id="${a.id}">
        ${icon(attachmentIconName(a.mime_type), 'attachment-icon')}
        <div class="attachment-info">
          <span class="attachment-name">${escapeHtml(a.file_name)}</span>
          <span class="attachment-meta">${formatFileSize(a.size_bytes)} · ${escapeHtml(a.uploader_name || '')} · ${formatDate(a.created_at)}</span>
        </div>
        <button type="button" class="icon-btn announcementFileDownloadBtn" data-id="${a.id}" title="${t('btn_download')}">${icon('download')}</button>
        ${canManage ? `<button type="button" class="icon-btn announcementFileDeleteBtn" data-id="${a.id}" title="${t('btn_delete')}">${icon('trash')}</button>` : ''}
      </div>`).join('') : `<p class="hint">${t('no_attachments_hint')}</p>`;

    wrap.querySelectorAll('.announcementFileDownloadBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const { attachment } = await api(`/announcements/${announcementId}/attachments/${btn.dataset.id}`);
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
    wrap.querySelectorAll('.announcementFileDeleteBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/announcements/${announcementId}/attachments/${btn.dataset.id}`, { method: 'DELETE' });
          showToast(t('toast_attachment_deleted'), 'success');
          const { attachments: fresh } = await api(`/announcements/${announcementId}/attachments`);
          renderAnnouncementFilesList(wrap, announcementId, fresh, canManage);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function wireDropzone(zoneEl, inputEl, onFiles) {
    zoneEl.addEventListener('click', () => inputEl.click());
    zoneEl.addEventListener('dragover', (e) => { e.preventDefault(); zoneEl.classList.add('dropzone-active'); });
    zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('dropzone-active'));
    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneEl.classList.remove('dropzone-active');
      if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
    });
    inputEl.addEventListener('change', () => {
      if (inputEl.files.length) onFiles([...inputEl.files]);
      inputEl.value = '';
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function renderAnnouncementForm(existing) {
    if (!canManageAnnouncements()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    const [groups, users] = await Promise.all([
      api('/groups').then((r) => r.groups).catch(() => []),
      api('/users').then((r) => r.users).catch(() => []),
    ]);
    const existingGroupIds = new Set((existing && existing.targets || []).filter((t2) => t2.target_type === 'group').map((t2) => t2.target_id));
    const existingUserIds = new Set((existing && existing.targets || []).filter((t2) => t2.target_type === 'user').map((t2) => t2.target_id));

    let stagedFiles = [];
    let existingAttachments = existing ? await api(`/announcements/${existing.id}/attachments`).then((r) => r.attachments).catch(() => []) : [];

    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('megaphone')} ${existing ? t('btn_edit') : t('btn_new_announcement')}</h1>
      </div>
      <div class="card">
        <form id="announcementForm" class="form-grid">
          <div class="field">
            <label for="announcementTitle">${t('field_announcement_title')}</label>
            <input id="announcementTitle" type="text" required value="${existing ? escapeHtml(existing.title) : ''}" />
          </div>
          <div class="field">
            <label for="announcementBody">${t('field_announcement_body')}</label>
            <div class="announcement-format-toolbar">
              <button type="button" class="btn btn-ghost btn-sm" data-format="bold" title="${t('format_bold')}"><strong>B</strong></button>
              <button type="button" class="btn btn-ghost btn-sm" data-format="italic" title="${t('format_italic')}"><em>I</em></button>
              <button type="button" class="btn btn-ghost btn-sm" data-format="heading" title="${t('format_heading')}">H</button>
              <button type="button" class="btn btn-ghost btn-sm" data-format="list" title="${t('format_list')}">${icon('grip')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-format="link" title="${t('format_link')}">${icon('globe')}</button>
              <span class="hint">${t('announcement_format_hint')}</span>
            </div>
            <textarea id="announcementBody" rows="8" required>${existing ? escapeHtml(existing.body) : ''}</textarea>
          </div>
          <label class="checkbox-field">
            <input id="announcementPinned" type="checkbox" ${existing && existing.pinned ? 'checked' : ''} />
            <span>${t('announcement_pinned_label')}</span>
          </label>
          <div class="field">
            <label>${t('announcement_targets_label')}</label>
            <span class="hint">${t('announcement_targets_hint')}</span>
            <div class="announcement-target-groups">
              ${groups.map((g) => `
                <label class="checkbox-field">
                  <input type="checkbox" class="announcementTargetGroup" value="${g.id}" ${existingGroupIds.has(g.id) ? 'checked' : ''} />
                  <span>${escapeHtml(g.name)}</span>
                </label>`).join('') || `<p class="hint">${t('no_groups_hint')}</p>`}
            </div>
            <input id="announcementUserSearch" type="search" placeholder="${t('search_person_placeholder')}" style="margin-top:0.5rem" />
            <select id="announcementTargetUsers" multiple size="6" style="margin-top:0.4rem">
              ${users.map((u) => `<option value="${u.id}" ${existingUserIds.has(u.id) ? 'selected' : ''}>${escapeHtml(u.name)} · ${escapeHtml(u.email)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>${t('announcement_files_title')}</label>
            <div id="announcementDropzone" class="dropzone">
              ${icon('paperclip', 'badge-icon')} <span>${t('dropzone_hint')}</span>
              <input type="file" id="announcementFileInput" hidden multiple />
            </div>
            <div id="announcementStagedFiles"></div>
          </div>
          <p class="error-text" id="announcementFormError"></p>
          <div style="display:flex; gap:0.6rem;">
            <button class="btn" type="submit">${t('btn_save')}</button>
            <a href="#/announcements${existing ? `/${existing.id}` : ''}" class="btn btn-ghost">${t('btn_cancel')}</a>
          </div>
        </form>
      </div>`;

    const bodyTextarea = document.getElementById('announcementBody');
    document.querySelectorAll('.announcement-format-toolbar [data-format]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const start = bodyTextarea.selectionStart;
        const end = bodyTextarea.selectionEnd;
        const selected = bodyTextarea.value.slice(start, end);
        const format = btn.dataset.format;
        let insertText = selected;
        let cursorOffset = 0;
        if (format === 'bold') {
          insertText = `**${selected || t('format_bold')}**`;
          cursorOffset = selected ? insertText.length : 2;
        } else if (format === 'italic') {
          insertText = `*${selected || t('format_italic')}*`;
          cursorOffset = selected ? insertText.length : 1;
        } else if (format === 'heading') {
          insertText = `# ${selected || t('format_heading')}`;
          cursorOffset = insertText.length;
        } else if (format === 'list') {
          insertText = (selected || t('format_list')).split('\n').map((line) => `- ${line}`).join('\n');
          cursorOffset = insertText.length;
        } else if (format === 'link') {
          insertText = `[${selected || t('format_link')}](https://)`;
          cursorOffset = insertText.length;
        }
        bodyTextarea.value = bodyTextarea.value.slice(0, start) + insertText + bodyTextarea.value.slice(end);
        bodyTextarea.focus();
        bodyTextarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
      });
    });

    const userSearch = document.getElementById('announcementUserSearch');
    const userSelect = document.getElementById('announcementTargetUsers');
    userSearch.addEventListener('input', () => {
      const q = userSearch.value.trim().toLowerCase();
      [...userSelect.options].forEach((opt) => {
        opt.hidden = q && !opt.textContent.toLowerCase().includes(q);
      });
    });

    const stagedWrap = document.getElementById('announcementStagedFiles');
    function renderStagedFiles() {
      const existingHtml = existingAttachments.map((a) => `
        <div class="attachment-row" data-id="${a.id}">
          ${icon(attachmentIconName(a.mime_type), 'attachment-icon')}
          <div class="attachment-info"><span class="attachment-name">${escapeHtml(a.file_name)}</span><span class="attachment-meta">${formatFileSize(a.size_bytes)}</span></div>
          <button type="button" class="icon-btn announcementExistingFileDeleteBtn" data-id="${a.id}" title="${t('btn_delete')}">${icon('trash')}</button>
        </div>`).join('');
      const stagedHtml = stagedFiles.map((f, i) => `
        <div class="attachment-row" data-staged="${i}">
          ${icon(attachmentIconName(f.type), 'attachment-icon')}
          <div class="attachment-info"><span class="attachment-name">${escapeHtml(f.name)}</span><span class="attachment-meta">${formatFileSize(f.size)}</span></div>
          <button type="button" class="icon-btn announcementStagedFileRemoveBtn" data-index="${i}" title="${t('btn_delete')}">${icon('trash')}</button>
        </div>`).join('');
      stagedWrap.className = (existingAttachments.length || stagedFiles.length) ? 'attachments-list' : '';
      stagedWrap.innerHTML = existingHtml + stagedHtml;
      stagedWrap.querySelectorAll('.announcementExistingFileDeleteBtn').forEach((btn) => btn.addEventListener('click', async () => {
        try {
          await api(`/announcements/${existing.id}/attachments/${btn.dataset.id}`, { method: 'DELETE' });
          existingAttachments = existingAttachments.filter((a) => String(a.id) !== btn.dataset.id);
          renderStagedFiles();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }));
      stagedWrap.querySelectorAll('.announcementStagedFileRemoveBtn').forEach((btn) => btn.addEventListener('click', () => {
        stagedFiles.splice(Number(btn.dataset.index), 1);
        renderStagedFiles();
      }));
    }
    renderStagedFiles();

    wireDropzone(document.getElementById('announcementDropzone'), document.getElementById('announcementFileInput'), (files) => {
      stagedFiles.push(...files);
      renderStagedFiles();
    });

    guardForm(document.getElementById('announcementForm'), async () => {
      const errEl = document.getElementById('announcementFormError');
      errEl.textContent = '';
      const targetGroupIds = [...document.querySelectorAll('.announcementTargetGroup:checked')].map((el) => Number(el.value));
      const targetUserIds = [...userSelect.selectedOptions].map((opt) => Number(opt.value));
      const body = {
        title: document.getElementById('announcementTitle').value.trim(),
        body: document.getElementById('announcementBody').value.trim(),
        pinned: document.getElementById('announcementPinned').checked,
        targetGroupIds,
        targetUserIds,
      };
      try {
        let announcementId;
        if (existing) {
          await api(`/announcements/${existing.id}`, { method: 'PATCH', body });
          announcementId = existing.id;
          showToast(t('toast_announcement_updated'), 'success');
        } else {
          const { announcement } = await api('/announcements', { method: 'POST', body });
          announcementId = announcement.id;
          showToast(t('toast_announcement_created'), 'success');
        }
        for (const file of stagedFiles) {
          const dataUrl = await fileToDataUrl(file);
          await api(`/announcements/${announcementId}/attachments`, { method: 'POST', body: { fileName: file.name, dataUrl } }).catch(() => {});
        }
        location.hash = `#/announcements/${announcementId}`;
        route();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  async function renderDirectory() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('users')} ${t('nav_directory')}</h1>
          <p class="hint">${t('directory_hint')}</p>
        </div>
      </div>
      <div class="filters">
        <input id="directorySearch" type="search" placeholder="${t('search_person_placeholder')}" />
        <select id="directoryGroupFilter"></select>
      </div>
      <div id="directoryWrap" class="card spinner-row">${t('loading')}</div>`;

    let people = [];
    let groups = [];
    try {
      [people, groups] = await Promise.all([
        api('/users').then((r) => r.users),
        api('/groups').then((r) => r.groups).catch(() => []),
      ]);
    } catch (err) {
      document.getElementById('directoryWrap').innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      return;
    }

    const groupFilter = document.getElementById('directoryGroupFilter');
    groupFilter.innerHTML = groupOptionsHtml(groups, '', t('all_groups_option'));

    function render() {
      const wrap = document.getElementById('directoryWrap');
      const q = document.getElementById('directorySearch').value.trim().toLowerCase();
      const groupId = groupFilter.value ? Number(groupFilter.value) : null;
      const filtered = people.filter((p) => {
        const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
        const matchesGroup = !groupId || p.group_id === groupId;
        return matchesQuery && matchesGroup;
      });
      wrap.className = 'card-list';
      wrap.innerHTML = filtered.length ? filtered.map((p) => `
        <div class="card directory-card">
          <div class="directory-card-main">
            <h3>${escapeHtml(p.name)}</h3>
            <p class="hint">${roleLabels()[p.role] || p.role}${groupLabel(p) ? ` · ${escapeHtml(groupLabel(p))}` : ''}</p>
          </div>
          <div class="directory-card-contact">
            <a href="mailto:${escapeHtml(p.email)}" class="hint">${icon('mail', 'badge-icon')} ${escapeHtml(p.email)}</a>
            ${p.manager_name ? `<span class="hint">${icon('userCircle', 'badge-icon')} ${t('field_manager')}: ${escapeHtml(p.manager_name)}</span>` : ''}
            ${p.id !== state.user.id ? `<a href="#/messages/${p.id}" class="btn btn-ghost btn-sm">${icon('mail', 'badge-icon')} ${t('send_message_btn')}</a>` : ''}
          </div>
        </div>`).join('') : `<p class="hint">${t('no_people_found')}</p>`;
    }

    document.getElementById('directorySearch').addEventListener('input', render);
    groupFilter.addEventListener('change', render);
    render();
  }

  async function renderMessages(userId) {
    if (userId) return renderMessageThread(Number(userId));
    return renderMessagesInbox();
  }

  async function renderMessagesInbox() {
    const isAdmin = state.user.role === 'admin';
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('mail')} ${t('nav_messages')}</h1>
          <p class="hint">${t('messages_inbox_hint')}</p>
        </div>
      </div>
      ${isAdmin ? `
      <div id="convBulkBar" class="bulk-action-bar" hidden>
        <span id="convBulkCount" class="hint"></span>
        <button type="button" id="convBulkDeleteBtn" class="btn btn-outline-danger btn-sm">${icon('trash')} ${t('bulk_delete_btn')}</button>
        <button type="button" id="convBulkClearBtn" class="btn btn-ghost btn-sm">${t('bulk_clear_selection')}</button>
      </div>` : ''}
      <div id="messagesInboxWrap" class="card-list spinner-row">${t('loading')}</div>`;

    const impersonatingId = state.viewAs && !state.viewAs.roleOnly && state.viewAs.id ? state.viewAs.id : null;
    const viewerId = impersonatingId || state.user.id;
    const selectedConvIds = new Set();

    const wrap = document.getElementById('messagesInboxWrap');
    const bulkBar = document.getElementById('convBulkBar');
    const bulkCount = document.getElementById('convBulkCount');

    function updateBulkBar() {
      if (!bulkBar) return;
      bulkBar.hidden = selectedConvIds.size === 0;
      bulkCount.textContent = `${t('bulk_selected_count')} ${selectedConvIds.size}`;
    }

    try {
      const { conversations } = await api(`/messages/conversations${impersonatingId ? `?asUserId=${impersonatingId}` : ''}`);
      wrap.className = 'card-list';
      wrap.innerHTML = conversations.length ? conversations.map((c) => `
        <div class="card directory-card ${c.unread_count ? 'announcement-unread' : ''}" data-user-id="${c.user_id}" style="cursor:pointer">
          ${isAdmin && !impersonatingId ? `<input type="checkbox" class="convSelectBox" data-id="${c.user_id}" />` : ''}
          <div class="directory-card-main">
            <h3>${escapeHtml(c.user_name)}</h3>
            <p class="hint">${c.last_sender_id === viewerId ? `${t('messages_you_prefix')} ` : ''}${escapeHtml(c.last_body.slice(0, 90))}</p>
          </div>
          <div class="directory-card-contact">
            <span class="hint">${formatDate(c.last_created_at)}</span>
            ${c.unread_count ? `<span class="role-tag">${c.unread_count}</span>` : ''}
          </div>
          ${isAdmin && !impersonatingId ? `<button type="button" class="icon-btn convDeleteBtn" data-id="${c.user_id}" data-name="${escapeHtml(c.user_name)}" title="${t('delete_conversation_title')}">${icon('trash')}</button>` : ''}
        </div>`).join('') : `<p class="hint">${t('no_messages_yet')}</p>`;

      wrap.querySelectorAll('.directory-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('input, button')) return;
          location.hash = `#/messages/${card.dataset.userId}`;
        });
      });

      async function deleteConversation(userId) {
        await api(`/messages/conversation/${userId}`, { method: 'DELETE' });
      }

      if (isAdmin && !impersonatingId) {
        wrap.querySelectorAll('.convSelectBox').forEach((box) => {
          box.addEventListener('click', (e) => e.stopPropagation());
          box.addEventListener('change', () => {
            const id = Number(box.dataset.id);
            if (box.checked) selectedConvIds.add(id); else selectedConvIds.delete(id);
            updateBulkBar();
          });
        });
        wrap.querySelectorAll('.convDeleteBtn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(t('confirm_delete_conversation'))) return;
            try {
              await deleteConversation(btn.dataset.id);
              showToast(t('toast_conversation_deleted'), 'success');
              renderMessagesInbox();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        const bulkDeleteBtn = document.getElementById('convBulkDeleteBtn');
        const bulkClearBtn = document.getElementById('convBulkClearBtn');
        if (bulkDeleteBtn) {
          bulkDeleteBtn.addEventListener('click', async () => {
            if (!selectedConvIds.size) return;
            if (!confirm(`${t('confirm_bulk_delete_conversations_prefix')} ${selectedConvIds.size}${t('confirm_bulk_delete_conversations_suffix')}`)) return;
            try {
              await Promise.all([...selectedConvIds].map((id) => deleteConversation(id)));
              showToast(t('toast_bulk_conversations_deleted'), 'success');
              selectedConvIds.clear();
              renderMessagesInbox();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        }
        if (bulkClearBtn) {
          bulkClearBtn.addEventListener('click', () => {
            selectedConvIds.clear();
            wrap.querySelectorAll('.convSelectBox').forEach((box) => { box.checked = false; });
            updateBulkBar();
          });
        }
      }
    } catch (err) {
      wrap.className = '';
      wrap.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderMessageThread(userId) {
    const impersonatingId = state.viewAs && !state.viewAs.roleOnly && state.viewAs.id ? state.viewAs.id : null;
    const viewerId = impersonatingId || state.user.id;

    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('mail')} ${t('loading')}</h1>
        <a class="btn btn-ghost" href="#/messages">${icon('arrowLeft')} ${t('back_to_list')}</a>
      </div>
      <div id="messageThreadWrap" class="card spinner-row">${t('loading')}</div>`;

    let messages, otherUser;
    try {
      const data = await api(`/messages/thread/${userId}${impersonatingId ? `?asUserId=${impersonatingId}` : ''}`);
      messages = data.messages;
      otherUser = data.otherUser;
    } catch (err) {
      document.getElementById('messageThreadWrap').innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      return;
    }
    if (!impersonatingId) refreshMessagesNavDot();

    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('mail')} ${escapeHtml(otherUser.name)}</h1>
        <div style="display:flex;gap:0.5rem">
          ${state.user.role === 'admin' && !impersonatingId ? `<button type="button" id="threadDeleteConvBtn" class="btn btn-outline-danger btn-sm">${icon('trash')} ${t('delete_conversation_title')}</button>` : ''}
          <a class="btn btn-ghost" href="#/messages">${icon('arrowLeft')} ${t('back_to_list')}</a>
        </div>
      </div>
      <div id="messageThreadWrap" class="card message-thread"></div>
      ${impersonatingId ? `<p class="hint">${t('viewas_readonly_suffix')}</p>` : `
      <form id="messageComposeForm" class="message-compose">
        <textarea id="messageComposeInput" placeholder="${t('message_compose_placeholder')}" maxlength="2000" required></textarea>
        <button type="submit" class="btn btn-sm">${t('message_send_btn')}</button>
      </form>
      <p class="hint">${t('message_ttl_hint')}</p>`}`;

    const threadWrap = document.getElementById('messageThreadWrap');

    const threadDeleteConvBtn = document.getElementById('threadDeleteConvBtn');
    if (threadDeleteConvBtn) {
      threadDeleteConvBtn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_conversation'))) return;
        try {
          await api(`/messages/conversation/${otherUser.id}`, { method: 'DELETE' });
          showToast(t('toast_conversation_deleted'), 'success');
          location.hash = '#/messages';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    function messageBubbleHtml(m) {
      const mine = m.sender_id === viewerId;
      return `
        <div class="message-bubble ${mine ? 'message-bubble-mine' : ''}" data-id="${m.id}">
          <p class="message-bubble-body"></p>
          <span class="hint message-bubble-meta">${formatDate(m.created_at)}${m.edited_at ? ` · ${t('message_edited_label')}` : ''}</span>
          ${!impersonatingId ? `
          <div class="message-bubble-actions">
            ${mine ? `<button type="button" class="icon-btn messageEditBtn" data-id="${m.id}" title="${t('message_edit_btn')}">${icon('edit')}</button>` : ''}
            <button type="button" class="icon-btn messageDeleteBtn" data-id="${m.id}" title="${t('message_delete_btn')}">${icon('trash')}</button>
          </div>` : ''}
        </div>`;
    }

    function renderThread(list) {
      threadWrap.innerHTML = list.length ? list.map(messageBubbleHtml).join('') : `<p class="hint">${t('no_messages_yet')}</p>`;
      threadWrap.querySelectorAll('.message-bubble').forEach((el, i) => {
        el.querySelector('.message-bubble-body').textContent = list[i].body;
      });
      wireThreadActions();
      threadWrap.scrollTop = threadWrap.scrollHeight;
    }

    function wireThreadActions() {
      threadWrap.querySelectorAll('.messageDeleteBtn').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_message'))) return;
        try {
          await api(`/messages/${btn.dataset.id}`, { method: 'DELETE' });
          messages = messages.filter((m) => m.id !== Number(btn.dataset.id));
          renderThread(messages);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }));
      threadWrap.querySelectorAll('.messageEditBtn').forEach((btn) => btn.addEventListener('click', () => {
        const m = messages.find((mm) => mm.id === Number(btn.dataset.id));
        if (!m) return;
        const nextBody = prompt(t('message_edit_prompt'), m.body);
        if (nextBody === null || !nextBody.trim()) return;
        api(`/messages/${m.id}`, { method: 'PATCH', body: { body: nextBody.trim() } }).then(({ message }) => {
          Object.assign(m, message);
          renderThread(messages);
        }).catch((err) => showToast(err.message, 'error'));
      }));
    }

    renderThread(messages);

    const composeForm = document.getElementById('messageComposeForm');
    if (composeForm) {
      composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('messageComposeInput');
        if (!input.value.trim()) return;
        try {
          const { message } = await api('/messages', { method: 'POST', body: { recipientId: userId, body: input.value.trim() } });
          messages.push(message);
          renderThread(messages);
          input.value = '';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  function leaveStatusLabels() {
    return { pending: t('leave_status_pending'), approved: t('leave_status_approved'), rejected: t('leave_status_rejected') };
  }
  function leaveTypeLabels() {
    return { vacation: t('leave_type_vacation'), permit: t('leave_type_permit') };
  }
  function canReviewLeaveRequests() {
    return !!(state.user && (isStaff() || state.user.is_manager));
  }
  function expenseStatusLabels() {
    return { pending: t('expense_status_pending'), approved: t('expense_status_approved'), rejected: t('expense_status_rejected') };
  }
  function expenseCategoryLabels() {
    return {
      travel: t('expense_category_travel'),
      meals: t('expense_category_meals'),
      accommodation: t('expense_category_accommodation'),
      supplies: t('expense_category_supplies'),
      other: t('expense_category_other'),
    };
  }
  function canReviewExpenses() {
    return !!(state.user && (isStaff() || state.user.is_manager));
  }

  async function renderOnboarding(param) {
    if (!canAccessOnboarding()) {
      appEl.innerHTML = `<div class="card"><p class="error-text">Accesso non consentito.</p></div>`;
      return;
    }
    if (param === 'new') return renderOnboardingForm();
    if (param) return renderOnboardingDetail(param);
    return renderOnboardingList();
  }

  async function renderOnboardingList() {
    const groups = await api('/groups').then((r) => r.groups).catch(() => []);
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('userCircle')} ${t('nav_onboarding')}</h1>
          <p class="hint">${t('onboarding_list_hint')}</p>
        </div>
        <a href="#/onboarding/new" class="btn btn-sm">${icon('plus')} ${t('btn_new_onboarding')}</a>
      </div>
      <div class="filters">
        <select id="onbStatusFilter">
          <option value="active" selected>${t('onboarding_filter_active')}</option>
          <option value="">${t('filter_all_statuses')}</option>
          ${Object.entries(onboardingStatusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <select id="onbGroupFilter">${groupOptionsHtml(groups, '', t('all_groups_option'))}</select>
      </div>
      <div id="onbListWrap" class="card spinner-row">${t('loading')}</div>`;

    const statusFilter = document.getElementById('onbStatusFilter');
    const groupFilter = document.getElementById('onbGroupFilter');

    async function load() {
      const wrap = document.getElementById('onbListWrap');
      wrap.className = 'card spinner-row';
      wrap.textContent = t('loading');
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        if (groupFilter.value) params.set('group', groupFilter.value);
        const { requests } = await api(`/onboarding?${params.toString()}`);
        wrap.className = 'card';
        wrap.innerHTML = requests.length ? `
          <div class="table-scroll">
            <table class="users-table">
              <thead><tr><th>${t('field_employee_name')}</th><th>${t('table_status')}</th><th>${t('onboarding_progress')}</th><th>${t('field_requested_by')}</th><th>${t('table_created')}</th><th></th></tr></thead>
              <tbody>
                ${requests.map((r) => `
                  <tr class="clickable-row" data-id="${r.id}">
                    <td>${escapeHtml(r.employee_name)}</td>
                    <td><span class="badge badge-${r.status}">${onboardingStatusLabels()[r.status] || r.status}</span></td>
                    <td>${r.item_done_count}/${r.item_count}</td>
                    <td>${escapeHtml(r.requested_by_name)}</td>
                    <td>${formatDate(r.created_at)}</td>
                    <td><button type="button" class="btn btn-ghost btn-sm onbDeleteBtn" data-id="${r.id}" data-name="${escapeHtml(r.employee_name)}" title="${t('btn_delete_onboarding')}">${icon('trash', 'badge-icon')}</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<p class="hint">${t('no_onboarding_found')}</p>`;
        wrap.querySelectorAll('.clickable-row').forEach((row) => {
          row.addEventListener('click', () => { location.hash = `#/onboarding/${row.dataset.id}`; });
        });
        wrap.querySelectorAll('.onbDeleteBtn').forEach((btn) => {
          btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!confirm(`${t('confirm_delete_onboarding')} (${btn.dataset.name})`)) return;
            try {
              await api(`/onboarding/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_onboarding_deleted'), 'success');
              load();
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

    statusFilter.addEventListener('change', load);
    groupFilter.addEventListener('change', load);
    load();
  }

  async function renderOnboardingForm() {
    let itemTypes = [];
    let users = [];
    try {
      [itemTypes, users] = await Promise.all([
        api('/onboarding/item-types').then((r) => r.itemTypes.filter((it) => it.enabled)),
        api('/users').then((r) => r.users),
      ]);
    } catch {}

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('userCircle')} ${t('btn_new_onboarding')}</h1>
          <p class="hint">${t('onboarding_form_hint')}</p>
        </div>
      </div>
      <div class="card" style="max-width:760px">
        <form id="onbForm" class="form-grid" style="max-width:none">
          <div class="field-row">
            <div class="field"><label for="onbEmployeeName">${t('field_employee_name')}</label><input id="onbEmployeeName" required /></div>
            <div class="field"><label for="onbEmployeeEmail">${t('field_employee_email')}</label><input id="onbEmployeeEmail" type="email" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="onbStartDate">${t('field_start_date')}</label><input id="onbStartDate" type="date" /></div>
            <div class="field">
              <label for="onbEmployeeUser">${t('field_existing_user_optional')}</label>
              <select id="onbEmployeeUser">
                <option value="">${t('option_none')}</option>
                ${users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.email)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field"><label for="onbNotes">${t('field_notes')}</label><textarea id="onbNotes" rows="2"></textarea></div>
          <div class="field">
            <label>${t('onboarding_checklist_label')}</label>
            <div class="onb-checklist">
              ${itemTypes.map((it) => {
                const licenseOptions = it.license_options ? JSON.parse(it.license_options) : [];
                return `
                <div class="onb-checklist-item" data-type-id="${it.id}">
                  <label class="checkbox-field">
                    <input type="checkbox" class="onbItemCheck" value="${it.id}" checked />
                    <span>${escapeHtml(getLang() === 'en' ? it.label_en : it.label_it)}${it.default_group_name ? ` <span class="hint">→ ${escapeHtml(it.default_group_name)}</span>` : ''}</span>
                  </label>
                  <div class="onb-checklist-item-custom">
                    ${it.kind === 'copy_user' ? `
                      <select class="onbCustCopySel" data-type-id="${it.id}">
                        <option value="">${t('onboarding_pick_existing_user')}</option>
                        ${users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.email)}</option>`).join('')}
                      </select>
                      <input type="text" class="onbCustCopyManual" data-type-id="${it.id}" placeholder="${t('onboarding_new_person_placeholder')}" />
                    ` : ''}
                    ${it.kind === 'license' && licenseOptions.length ? `
                      <select class="onbCustLicenseSel" data-type-id="${it.id}">
                        ${licenseOptions.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
                      </select>
                    ` : ''}
                    ${it.addon_label ? `
                      <label class="checkbox-field">
                        <input type="checkbox" class="onbCustAddonCheck" data-type-id="${it.id}" />
                        <span>${t('onboarding_addon_checkbox_prefix')} ${escapeHtml(it.addon_label)}</span>
                      </label>
                    ` : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="field">
            <label for="onbAttachmentInput">${t('onboarding_attachment_label')}</label>
            <input id="onbAttachmentInput" type="file" />
            <p class="hint">${t('onboarding_attachment_hint')}</p>
          </div>
          <p class="error-text" id="onbFormError"></p>
          <div><button class="btn btn-sm" type="submit">${t('btn_start_onboarding')}</button></div>
        </form>
      </div>`;

    document.querySelectorAll('.onbItemCheck').forEach((cb) => {
      const panel = cb.closest('.onb-checklist-item').querySelector('.onb-checklist-item-custom');
      if (panel) panel.hidden = !cb.checked;
      cb.addEventListener('change', () => {
        if (panel) panel.hidden = !cb.checked;
      });
    });

    guardForm(document.getElementById('onbForm'), async () => {
      const errEl = document.getElementById('onbFormError');
      errEl.textContent = '';
      const name = document.getElementById('onbEmployeeName').value.trim();
      if (!name) return;
      const items = Array.from(document.querySelectorAll('.onbItemCheck:checked')).map((el) => {
        const typeId = Number(el.value);
        const copySel = document.querySelector(`.onbCustCopySel[data-type-id="${typeId}"]`);
        const copyManual = document.querySelector(`.onbCustCopyManual[data-type-id="${typeId}"]`);
        const licenseSel = document.querySelector(`.onbCustLicenseSel[data-type-id="${typeId}"]`);
        const addonCheck = document.querySelector(`.onbCustAddonCheck[data-type-id="${typeId}"]`);
        return {
          itemTypeId: typeId,
          copyFromUserId: copySel && copySel.value ? Number(copySel.value) : null,
          copyFromNameManual: copyManual ? copyManual.value.trim() : null,
          licenseChoice: licenseSel ? licenseSel.value : null,
          addonRequested: addonCheck ? addonCheck.checked : false,
        };
      });
      try {
        const { request } = await api('/onboarding', {
          method: 'POST',
          body: {
            employeeName: name,
            employeeEmail: document.getElementById('onbEmployeeEmail').value.trim(),
            startDate: document.getElementById('onbStartDate').value || null,
            employeeUserId: document.getElementById('onbEmployeeUser').value || null,
            notes: document.getElementById('onbNotes').value.trim(),
            items,
          },
        });
        const file = document.getElementById('onbAttachmentInput').files[0];
        if (file) {
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                await api(`/onboarding/${request.id}/attachments`, { method: 'POST', body: { fileName: file.name, dataUrl: reader.result } });
              } catch {}
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
        showToast(t('toast_onboarding_created'), 'success');
        location.hash = `#/onboarding/${request.id}`;
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  async function renderOnboardingDetail(id) {
    appEl.innerHTML = `<div class="card spinner-row">${t('loading')}</div>`;
    let request, items, attachments, staffAndUsers = [];
    try {
      const [detailData, usersData] = await Promise.all([
        api(`/onboarding/${id}`),
        api('/users').catch(() => ({ users: [] })),
      ]);
      ({ request, items, attachments } = detailData);
      staffAndUsers = usersData.users;
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    const canEditNotes = isStaff();
    const hasPendingItems = items.some((it) => !['done', 'skipped'].includes(it.status));

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('userCircle')} ${escapeHtml(request.employee_name)}</h1>
          <p class="hint">${t('onboarding_requested_by_label')} ${escapeHtml(request.requested_by_name)} · ${formatDate(request.created_at)}</p>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem">
          ${canEditNotes && hasPendingItems ? `<button type="button" class="btn btn-sm" id="onbCompleteAllBtn">${icon('check')} ${t('btn_complete_all_onboarding')}</button>` : ''}
          ${canEditNotes && request.status !== 'cancelled' ? `<button type="button" class="btn btn-sm btn-outline-danger" id="onbDeleteDetailBtn">${icon('trash', 'badge-icon')} ${t('btn_delete_onboarding')}</button>` : ''}
          <span class="badge badge-${request.status}">${onboardingStatusLabels()[request.status] || request.status}</span>
        </div>
      </div>
      <div class="ticket-detail-grid">
        <div>
          <div class="card">
            <h3 class="section-title" style="margin-top:0">${t('onboarding_checklist_label')}</h3>
            <div id="onbItemsList"></div>
          </div>
        </div>
        <div>
          <div class="card">
            <h3 class="section-title" style="margin-top:0">${t('onboarding_details_title')}</h3>
            <p><strong>${t('field_employee_email')}:</strong> ${escapeHtml(request.employee_email || '—')}</p>
            <p><strong>${t('field_start_date')}:</strong> ${request.start_date || '—'}</p>
            <p><strong>${t('field_existing_user_optional')}:</strong> ${escapeHtml(request.employee_user_name || '—')}</p>
            ${canEditNotes ? `
              <div class="field"><label for="onbNotesEdit">${t('field_notes')}</label><textarea id="onbNotesEdit" rows="3">${escapeHtml(request.notes || '')}</textarea></div>
              <button type="button" class="btn btn-ghost btn-sm" id="onbSaveNotesBtn">${t('btn_save')}</button>
            ` : `<p>${escapeHtml(request.notes || '')}</p>`}
          </div>
          <div class="card">
            <h3 class="section-title" style="margin-top:0">${t('attachments_title')}</h3>
            <div id="onbAttachmentsList" class="attachments-list">
              ${attachments.length ? attachments.map((a) => `
                <div class="attachment-row" data-id="${a.id}">
                  ${icon(attachmentIconName(a.mime_type), 'attachment-icon')}
                  <div class="attachment-info">
                    <span class="attachment-name">${escapeHtml(a.file_name)}</span>
                    <span class="attachment-meta">${formatFileSize(a.size_bytes)} · ${escapeHtml(a.uploader_name || '')} · ${formatDate(a.created_at)}</span>
                  </div>
                  <button type="button" class="icon-btn onbAttachmentDownloadBtn" data-id="${a.id}" title="${t('btn_download')}">${icon('download')}</button>
                </div>`).join('') : `<p class="hint">${t('no_attachments_hint')}</p>`}
            </div>
            <label class="btn btn-ghost btn-sm" style="margin-top:0.75rem;display:inline-flex">
              ${icon('paperclip')} ${t('btn_add_attachment')}
              <input id="onbAttachmentInput2" type="file" style="display:none" />
            </label>
          </div>
        </div>
      </div>`;

    function renderItems() {
      const listEl = document.getElementById('onbItemsList');
      listEl.innerHTML = items.map((it) => `
        <div class="onb-item-row" data-id="${it.id}">
          <div class="onb-item-head">
            <span class="onb-item-name">${escapeHtml(getLang() === 'en' ? it.label_en : it.label_it)}</span>
            ${it.group_name ? `<span class="org-node-badge">${escapeHtml(it.group_name)}</span>` : ''}
            ${it.ticket_id ? `
              <a class="badge badge-${it.ticket_status}" href="#/ticket/${it.ticket_id}">${statusLabels()[it.ticket_status] || it.ticket_status} · #${formatTicketNumber(it.ticket_id)}</a>
            ` : `
              <select class="onbItemStatusSel" data-id="${it.id}">
                ${Object.entries(onboardingItemStatusLabels()).map(([v, l]) => `<option value="${v}" ${it.status === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>`}
          </div>
          ${it.kind === 'copy_user' && !it.ticket_id ? `
            <div class="field">
              <label>${t('onboarding_copy_from_label')}</label>
              <select class="onbCopyFromSel" data-id="${it.id}">
                <option value="">${t('option_none')}</option>
                ${staffAndUsers.map((u) => `<option value="${u.id}" ${it.copy_from_user_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)} · ${escapeHtml(u.email)}</option>`).join('')}
              </select>
            </div>` : ''}
          ${it.kind === 'copy_user' && it.ticket_id && (it.copy_from_user_name || it.copy_from_name_manual) ? `
            <p class="hint">${t('onboarding_copy_from_label')}: ${escapeHtml(it.copy_from_user_name || it.copy_from_name_manual)}</p>` : ''}
          ${it.kind === 'license' && !it.ticket_id ? `
            <div class="field">
              <label>${t('onboarding_license_label')}</label>
              <input type="text" class="onbLicenseInput" data-id="${it.id}" value="${escapeHtml(it.license_note || '')}" placeholder="${t('onboarding_license_placeholder')}" />
            </div>` : ''}
          ${it.kind === 'license' && it.ticket_id && it.license_note ? `<p class="hint">${t('onboarding_license_label')}: ${escapeHtml(it.license_note)}</p>` : ''}
          ${it.type_addon_label && it.addon_requested ? `<p class="hint">${t('onboarding_addon_checkbox_prefix')} ${escapeHtml(it.type_addon_label)}</p>` : ''}
          ${it.kind === 'asset' && it.asset_id ? `<p class="hint">${t('onboarding_asset_created_prefix')} ${escapeHtml(it.asset_name || '')}${it.asset_tag ? ' · ' + escapeHtml(it.asset_tag) : ''}</p>` : ''}
          ${it.status === 'done' && it.completed_by_name ? `<p class="hint">${t('onboarding_completed_by_prefix')} ${escapeHtml(it.completed_by_name)} · ${formatDate(it.completed_at)}</p>` : ''}
        </div>`).join('') || `<p class="hint">${t('no_onboarding_items_hint')}</p>`;

      listEl.querySelectorAll('.onbItemStatusSel').forEach((sel) => {
        sel.addEventListener('change', async () => {
          try {
            const { item } = await api(`/onboarding/items/${sel.dataset.id}`, { method: 'PATCH', body: { status: sel.value } });
            items = items.map((it) => (it.id === item.id ? item : it));
            renderItems();
            showToast(t('toast_onboarding_item_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
      listEl.querySelectorAll('.onbCopyFromSel').forEach((sel) => {
        sel.addEventListener('change', async () => {
          try {
            await api(`/onboarding/items/${sel.dataset.id}`, { method: 'PATCH', body: { copyFromUserId: sel.value || null } });
            showToast(t('toast_onboarding_item_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
      listEl.querySelectorAll('.onbLicenseInput').forEach((input) => {
        input.addEventListener('change', async () => {
          try {
            await api(`/onboarding/items/${input.dataset.id}`, { method: 'PATCH', body: { licenseNote: input.value.trim() } });
            showToast(t('toast_onboarding_item_updated'), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }
    renderItems();

    const saveNotesBtn = document.getElementById('onbSaveNotesBtn');
    if (saveNotesBtn) {
      saveNotesBtn.addEventListener('click', async () => {
        try {
          await api(`/onboarding/${id}`, { method: 'PATCH', body: { notes: document.getElementById('onbNotesEdit').value.trim() } });
          showToast(t('toast_onboarding_updated'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const completeAllBtn = document.getElementById('onbCompleteAllBtn');
    if (completeAllBtn) {
      completeAllBtn.addEventListener('click', async () => {
        if (!confirm(t('confirm_complete_all_onboarding'))) return;
        try {
          const result = await api(`/onboarding/${id}/complete-all`, { method: 'POST' });
          showToast(t('toast_onboarding_completed_all').replace('{n}', result.completedCount), 'success');
          renderOnboardingDetail(id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const deleteDetailBtn = document.getElementById('onbDeleteDetailBtn');
    if (deleteDetailBtn) {
      deleteDetailBtn.addEventListener('click', async () => {
        if (!confirm(`${t('confirm_delete_onboarding')} (${request.employee_name})`)) return;
        try {
          await api(`/onboarding/${id}`, { method: 'DELETE' });
          showToast(t('toast_onboarding_deleted'), 'success');
          location.hash = '#/onboarding';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    document.querySelectorAll('.onbAttachmentDownloadBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const { attachment } = await api(`/onboarding/${id}/attachments/${btn.dataset.id}`);
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

    const attachmentInput2 = document.getElementById('onbAttachmentInput2');
    if (attachmentInput2) {
      attachmentInput2.addEventListener('change', () => {
        const file = attachmentInput2.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          showToast(t('attachment_too_large'), 'error');
          attachmentInput2.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await api(`/onboarding/${id}/attachments`, { method: 'POST', body: { fileName: file.name, dataUrl: reader.result } });
            showToast(t('toast_attachment_added'), 'success');
            renderOnboardingDetail(id);
          } catch (err) {
            showToast(err.message, 'error');
            attachmentInput2.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }

  async function renderOrgChartPublic() {
    let groups = [];
    let users = [];
    let tickets = [];
    try {
      const promises = [api('/groups').then((r) => r.groups), api('/users').then((r) => r.users)];
      if (isStaff()) promises.push(api('/tickets').then((r) => r.tickets).catch(() => []));
      const results = await Promise.all(promises);
      groups = results[0];
      users = results[1];
      tickets = results[2] || [];
    } catch {}

    const canSeeAllStats = !!(state.user && state.user.is_super_admin);
    const canSeeGroupStats = (groupId) => canSeeAllStats || (state.user && state.user.group_id === groupId);
    const openByGroup = new Map();
    const openByAssignee = new Map();
    tickets.forEach((tk) => {
      if (tk.status === 'resolved' || tk.status === 'closed') return;
      if (tk.group_id) openByGroup.set(tk.group_id, (openByGroup.get(tk.group_id) || 0) + 1);
      if (tk.assigned_to) openByAssignee.set(tk.assigned_to, (openByAssignee.get(tk.assigned_to) || 0) + 1);
    });

    const membersByGroup = new Map();
    users.forEach((u) => {
      if (!u.group_id) return;
      if (!membersByGroup.has(u.group_id)) membersByGroup.set(u.group_id, []);
      membersByGroup.get(u.group_id).push(u);
    });
    membersByGroup.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

    const tree = buildGroupTree(groups);

    function personRow(u) {
      const showLoad = isStaff() && (u.role === 'agent' || u.role === 'admin') && canSeeGroupStats(u.group_id);
      const openCount = openByAssignee.get(u.id) || 0;
      return `
        <div class="orgchart-person">
          <span>${escapeHtml(u.name)}</span>
          <span class="role-tag">${roleLabels()[u.role] || u.role}</span>
          ${u.manager_name ? `<span class="hint">${t('manager_label')}: ${escapeHtml(u.manager_name)}</span>` : ''}
          ${showLoad ? `<span class="org-node-badge ${openCount > 0 ? '' : 'org-node-badge-ok'}">${icon('activity', 'badge-icon')}${openCount} ${t('org_open_tickets')}</span>` : ''}
        </div>`;
    }

    function nodeHtml(node) {
      const members = membersByGroup.get(node.id) || [];
      const showGroupStats = canSeeGroupStats(node.id);
      const openCount = openByGroup.get(node.id) || 0;
      return `
        <div class="org-branch">
          <div class="org-node">
            <div class="org-node-head">
              ${node.children.length ? `<button type="button" class="org-collapse-toggle" data-branch-toggle title="${t('org_toggle_branch')}">${icon('chevronDown')}</button>` : '<span class="org-collapse-spacer"></span>'}
              <div class="org-node-title">
                <span class="org-node-name">${escapeHtml(node.name)}</span>
                <span class="org-node-manager">${icon('userCircle', 'badge-icon')}${node.manager_name ? escapeHtml(node.manager_name) : t('org_no_manager')}</span>
              </div>
            </div>
            <div class="org-node-stats">
              <span class="org-node-badge">${icon('users', 'badge-icon')}${node.member_count || 0} ${t('org_member_count')}</span>
              ${showGroupStats ? `<span class="org-node-badge ${openCount > 0 ? '' : 'org-node-badge-ok'}">${icon('activity', 'badge-icon')}${openCount} ${t('org_open_tickets')}</span>` : ''}
            </div>
            ${members.length ? `
              <details class="orgchart-members">
                <summary>${t('orgchart_view_members')}</summary>
                <div class="orgchart-person-list">${members.map(personRow).join('')}</div>
              </details>` : ''}
          </div>
          ${node.children.length ? `<div class="org-children">${node.children.map(nodeHtml).join('')}</div>` : ''}
        </div>`;
    }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('globe')} ${t('nav_orgchart')}</h1>
          <p class="hint">${t('orgchart_hint')}</p>
        </div>
        ${tree.length ? `
        <div style="display:flex;gap:0.6rem">
          <button type="button" id="orgchartExpandAllBtn" class="btn btn-ghost btn-sm">${t('widgets_expand_all_btn')}</button>
          <button type="button" id="orgchartCollapseAllBtn" class="btn btn-ghost btn-sm">${t('widgets_collapse_all_btn')}</button>
        </div>` : ''}
      </div>
      <div class="field" style="max-width:420px;margin-bottom:1rem">
        <input type="search" id="orgchartPersonSearch" placeholder="${t('orgchart_search_placeholder')}" autocomplete="off" />
      </div>
      <div id="orgchartPersonResults"></div>
      <div class="card" id="orgchartTreeCard">
        ${tree.length ? `<div class="org-chart">${tree.map(nodeHtml).join('')}</div>` : `<p class="hint">${t('no_groups_hint')}</p>`}
      </div>`;

    document.querySelectorAll('#orgchartTreeCard [data-branch-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.org-branch').classList.toggle('collapsed');
      });
    });

    const orgchartExpandAllBtn = document.getElementById('orgchartExpandAllBtn');
    if (orgchartExpandAllBtn) {
      orgchartExpandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#orgchartTreeCard .org-branch').forEach((el) => el.classList.remove('collapsed'));
      });
    }
    const orgchartCollapseAllBtn = document.getElementById('orgchartCollapseAllBtn');
    if (orgchartCollapseAllBtn) {
      orgchartCollapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#orgchartTreeCard .org-branch').forEach((el) => {
          if (el.querySelector('.org-children')) el.classList.add('collapsed');
        });
      });
    }

    const searchInput = document.getElementById('orgchartPersonSearch');
    const resultsEl = document.getElementById('orgchartPersonResults');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { resultsEl.innerHTML = ''; return; }
      const matches = users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 12);
      resultsEl.innerHTML = matches.length ? `
        <div class="card" style="margin-bottom:1rem">
          <div class="orgchart-person-list">${matches.map(personRow).join('')}</div>
        </div>` : `<p class="hint" style="margin-bottom:1rem">${t('no_users_found')}</p>`;
    });
  }

  async function renderSearch() {
    const [groupsData, tagsData] = await Promise.all([
      api('/groups').catch(() => ({ groups: [] })),
      api('/tags').catch(() => ({ tags: [] })),
    ]);
    const groups = groupsData.groups;
    const tags = tagsData.tags;

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
      <div id="searchPersonChip"></div>
      <div class="report-export-bar">
        <button type="button" id="searchExportCsvBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_csv')}</button>
        <button type="button" id="searchExportExcelBtn" class="btn btn-ghost">${icon('download')} ${t('btn_export_excel')}</button>
        <span class="hint" id="searchResultCount"></span>
      </div>
      <div id="searchResults" class="ticket-list"></div>`;

    const resultsEl = document.getElementById('searchResults');
    const searchResultCountEl = document.getElementById('searchResultCount');
    const searchExportCsvBtn = document.getElementById('searchExportCsvBtn');
    const searchExportExcelBtn = document.getElementById('searchExportExcelBtn');
    let currentSearchTickets = [];
    const personChipEl = document.getElementById('searchPersonChip');
    const qEl = document.getElementById('searchQuery');
    const typeEl = document.getElementById('searchType');
    const statusEl = document.getElementById('searchStatus');
    const priorityEl = document.getElementById('searchPriority');
    const groupEl = document.getElementById('searchGroup');
    const tagEl = document.getElementById('searchTag');

    let personFilter = null;

    function renderPersonChip() {
      if (!personFilter) { personChipEl.innerHTML = ''; return; }
      personChipEl.innerHTML = `
        <div class="tag-chip tag-chip-removable" style="margin-bottom:0.85rem">
          ${escapeHtml(personFilter.label)}: ${escapeHtml(personFilter.name)}
          <button type="button" id="clearPersonFilterBtn" class="tagRemoveBtn" aria-label="${t('btn_delete')}">&times;</button>
        </div>`;
      document.getElementById('clearPersonFilterBtn').addEventListener('click', () => {
        personFilter = null;
        renderPersonChip();
        runSearch();
      });
    }

    let debounceTimer;
    async function runSearch() {
      const params = new URLSearchParams();
      if (qEl.value.trim()) params.set('q', qEl.value.trim());
      if (typeEl.value) params.set('type', typeEl.value);
      if (statusEl.value) params.set('status', statusEl.value);
      if (priorityEl.value) params.set('priority', priorityEl.value);
      if (groupEl.value) params.set('group', groupEl.value);
      if (tagEl.value) params.set('tag', tagEl.value);
      if (personFilter) params.set(personFilter.param, personFilter.id);
      try {
        const { tickets } = await api(`/tickets?${params.toString()}`);
        currentSearchTickets = tickets;
        searchResultCountEl.textContent = `${t('report_export_count_label')} ${tickets.length}`;
        renderTicketList(resultsEl, tickets);
      } catch (err) {
        resultsEl.className = '';
        resultsEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    function buildSearchExportRows() {
      return currentSearchTickets.map((tk) => ({
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
        [t('report_col_sla')]: tk.sla_status ? (slaLabels()[tk.sla_status] || tk.sla_status) : '',
      }));
    }

    searchExportCsvBtn.addEventListener('click', () => {
      const rows = buildSearchExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')].concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')));
      const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, exportFilename('team-tickets', 'csv'));
    });

    searchExportExcelBtn.addEventListener('click', async () => {
      const rows = buildSearchExportRows();
      if (!rows.length) { showToast(t('toast_export_no_data'), 'error'); return; }
      const originalLabel = searchExportExcelBtn.innerHTML;
      searchExportExcelBtn.disabled = true;
      searchExportExcelBtn.innerHTML = `${icon('download')} ${t('loading')}`;
      try {
        if (!window.XLSX) await loadScriptOnce('vendor/xlsx.full.min.js');
        const sheet = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, sheet, t('nav_search'));
        window.XLSX.writeFile(wb, exportFilename('team-tickets', 'xlsx'));
      } catch {
        showToast(t('toast_export_failed'), 'error');
      } finally {
        searchExportExcelBtn.disabled = false;
        searchExportExcelBtn.innerHTML = originalLabel;
      }
    });

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

    const presetAssigned = sessionStorage.getItem('ticketing_search_assigned');
    const presetCreatedBy = sessionStorage.getItem('ticketing_search_created_by');
    if (presetAssigned) {
      sessionStorage.removeItem('ticketing_search_assigned');
      const [id, name] = presetAssigned.split('|');
      personFilter = { param: 'assigned', id, name, label: t('filter_assigned_to_label') };
    } else if (presetCreatedBy) {
      sessionStorage.removeItem('ticketing_search_created_by');
      const [id, name] = presetCreatedBy.split('|');
      personFilter = { param: 'createdBy', id, name, label: t('filter_created_by_label') };
    }
    renderPersonChip();

    runSearch();
  }

  async function renderInsights(tab) {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('activity')} ${t('nav_insights')}</h1>
          <p class="hint">${t('insights_hint')}</p>
        </div>
      </div>
      <div class="admin-tabs" role="tablist">
        <a href="#/report" class="admin-tab ${tab === 'report' ? 'active' : ''}" role="tab">${icon('activity', 'nav-icon')} ${t('nav_report')}</a>
        <a href="#/audit" class="admin-tab ${tab === 'audit' ? 'active' : ''}" role="tab">${icon('eye', 'nav-icon')} ${t('nav_audit')}</a>
      </div>
      <div id="insightsBody"></div>`;
    if (tab === 'audit') return renderAuditBody();
    return renderReportBody();
  }

  async function renderReportBody() {
    const bodyEl = document.getElementById('insightsBody');
    bodyEl.innerHTML = `
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
      const selectable = !!opts.onRowClick;
      if (chartTypeSel.value === 'donut') {
        container.innerHTML = donutChart(rows, opts.donutTotal ?? total, { dim, onSelect: selectable });
      } else {
        container.innerHTML = barChart(rows, total, { ...(opts.barOpts || {}), onSelect: selectable });
      }
      if (selectable) wireChartInteractions(container, opts.onRowClick);
      else wireChartTooltips(container);
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

      const groupKey = (tk) => tk.group_id != null ? String(tk.group_id) : 'none';

      const groupCounts = new Map();
      tickets.forEach((tk) => {
        const key = groupKey(tk);
        const label = groupLabel(tk) || noGroupLabel;
        if (!groupCounts.has(key)) groupCounts.set(key, { label, value: 0 });
        groupCounts.get(key).value += 1;
      });
      const volumeRows = [...groupCounts.entries()].sort((a, b) => b[1].value - a[1].value)
        .map(([key, { label, value }]) => ({ key, label, value, color: 'var(--primary)' }));

      const resolved = tickets.filter((tk) => tk.resolved_at);
      const avgByGroup = new Map();
      resolved.forEach((tk) => {
        const key = groupKey(tk);
        const label = groupLabel(tk) || noGroupLabel;
        const hours = (new Date(tk.resolved_at.replace(' ', 'T') + 'Z') - new Date(tk.created_at.replace(' ', 'T') + 'Z')) / 3600000;
        if (!avgByGroup.has(key)) avgByGroup.set(key, { label, values: [] });
        avgByGroup.get(key).values.push(hours);
      });
      const avgRows = [...avgByGroup.entries()].map(([key, { label, values }]) => ({
        key, label, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, color: 'var(--warning)',
      })).sort((a, b) => b.value - a.value);

      const slaByGroup = new Map();
      resolved.filter((tk) => tk.sla_status).forEach((tk) => {
        const key = groupKey(tk);
        const label = groupLabel(tk) || noGroupLabel;
        if (!slaByGroup.has(key)) slaByGroup.set(key, { label, met: 0, total: 0 });
        const entry = slaByGroup.get(key);
        entry.total += 1;
        if (tk.sla_status === 'on_track') entry.met += 1;
      });
      const slaRows = [...slaByGroup.entries()].map(([key, { label, met, total }]) => ({
        key, label, value: Math.round((met / total) * 100), color: 'var(--success)',
      })).sort((a, b) => b.value - a.value);

      const ratedTickets = tickets.filter((tk) => tk.rating);
      const csatByGroup = new Map();
      ratedTickets.forEach((tk) => {
        const key = groupKey(tk);
        const label = groupLabel(tk) || noGroupLabel;
        if (!csatByGroup.has(key)) csatByGroup.set(key, { label, values: [] });
        csatByGroup.get(key).values.push(tk.rating);
      });
      const csatRows = [...csatByGroup.entries()].map(([key, { label, values }]) => ({
        key, label, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, color: '#f5a623',
      })).sort((a, b) => b.value - a.value);

      const agentCounts = new Map();
      tickets.forEach((tk) => {
        if (!tk.assignee_name || !tk.assigned_to) return;
        const key = String(tk.assigned_to);
        if (!agentCounts.has(key)) agentCounts.set(key, { label: tk.assignee_name, value: 0 });
        agentCounts.get(key).value += 1;
      });
      const agentRows = [...agentCounts.entries()].sort((a, b) => b[1].value - a[1].value)
        .map(([key, { label, value }]) => ({ key, label, value, color: 'var(--primary)' }));

      const trendDates = [];
      tickets.forEach((tk) => {
        trendDates.push(new Date(tk.created_at.replace(' ', 'T') + 'Z'));
        if (tk.resolved_at) trendDates.push(new Date(tk.resolved_at.replace(' ', 'T') + 'Z'));
      });
      let trendChartHtml = `<p class="hint">${t('no_data')}</p>`;
      if (trendDates.length) {
        const minDate = new Date(Math.min(...trendDates));
        const maxDate = new Date(Math.max(...trendDates));
        const spanDays = Math.max(1, Math.round((maxDate - minDate) / 86400000));
        const granularity = dateBucketGranularity(spanDays);
        const bucketKeys = enumerateDateBuckets(minDate, maxDate, granularity);
        const createdCounts = new Map();
        const resolvedCounts = new Map();
        tickets.forEach((tk) => {
          const createdKey = dateBucketKey(new Date(tk.created_at.replace(' ', 'T') + 'Z'), granularity);
          createdCounts.set(createdKey, (createdCounts.get(createdKey) || 0) + 1);
          if (tk.resolved_at) {
            const resolvedKey = dateBucketKey(new Date(tk.resolved_at.replace(' ', 'T') + 'Z'), granularity);
            resolvedCounts.set(resolvedKey, (resolvedCounts.get(resolvedKey) || 0) + 1);
          }
        });
        const trendBuckets = bucketKeys.map((key) => ({
          label: formatBucketLabel(key, granularity),
          values: { created: createdCounts.get(key) || 0, resolved: resolvedCounts.get(key) || 0 },
        }));
        trendChartHtml = lineChart(trendBuckets, [
          { key: 'created', label: t('trend_series_created'), color: 'var(--primary)' },
          { key: 'resolved', label: t('trend_series_resolved'), color: 'var(--success)' },
        ]);
      }

      chartsEl.className = 'charts-row';
      chartsEl.innerHTML = `
        <div class="card chart-card chart-card-wide"><h3 class="section-title" style="margin-top:0">${t('chart_ticket_trend')}</h3>${trendChartHtml}</div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_volume_by_group')}</h3><div id="reportChartVolume"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_avg_resolution')}</h3><div id="reportChartAvg"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_sla_compliance')}</h3><div id="reportChartSla"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_load_by_agent')}</h3><div id="reportChartAgent"></div></div>
        <div class="card chart-card"><h3 class="section-title" style="margin-top:0">${t('chart_csat')}</h3><div id="reportChartCsat"></div></div>`;

      const onTeamRowClick = (key) => {
        teamSel.value = key === 'none' ? '' : key;
        populateMemberOptions();
        renderAll();
        document.querySelector('.filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const onAgentRowClick = (key) => {
        memberSel.value = key;
        renderAll();
        document.querySelector('.filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      renderChart(document.getElementById('reportChartVolume'), 'report_volume', volumeRows, tickets.length, t('no_data'), { onRowClick: onTeamRowClick });
      renderChart(document.getElementById('reportChartAvg'), 'report_avg', avgRows, 0, t('no_resolved_yet'), { barOpts: { showPct: false, suffix: ' h' }, donutTotal: avgRows.reduce((a, r) => a + r.value, 0), onRowClick: onTeamRowClick });
      renderChart(document.getElementById('reportChartSla'), 'report_sla', slaRows, 0, t('no_group_sla_configured'), { barOpts: { showPct: false, suffix: '%' }, donutTotal: slaRows.reduce((a, r) => a + r.value, 0), onRowClick: onTeamRowClick });
      renderChart(document.getElementById('reportChartAgent'), 'report_agent', agentRows, tickets.length, t('no_assigned_tickets'), { onRowClick: onAgentRowClick });
      renderChart(document.getElementById('reportChartCsat'), 'report_csat', csatRows, 0, t('no_ratings_yet'), { barOpts: { showPct: false, suffix: ' /5' }, donutTotal: csatRows.reduce((a, r) => a + r.value, 0), onRowClick: onTeamRowClick });
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
        [t('report_col_number')]: `#${formatTicketNumber(tk.id)}`,
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

  async function renderAuditBody() {
    let groups = [];
    try { groups = (await api('/groups')).groups; } catch { groups = []; }

    const bodyEl = document.getElementById('insightsBody');
    bodyEl.innerHTML = `
      <div class="filters">
        <input type="date" id="auditDateFrom" title="${t('report_date_from')}" />
        <input type="date" id="auditDateTo" title="${t('report_date_to')}" />
        <select id="auditKindFilter">
          <option value="">${t('audit_filter_all')}</option>
          <option value="ticket">${t('audit_filter_ticket')}</option>
          <option value="admin">${t('audit_filter_admin')}</option>
        </select>
        <select id="auditGroupFilter">${groupOptionsHtml(groups, '', t('all_groups_option'))}</select>
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
    const groupFilterEl = document.getElementById('auditGroupFilter');
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
      if (groupFilterEl.value) params.set('group', groupFilterEl.value);
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
    groupFilterEl.addEventListener('change', load);
    kindFilterEl.addEventListener('change', renderList);
    searchEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 300);
    });

    function buildExportRows() {
      return applyKindFilter(currentEntries).map((e) => ({
        [t('audit_col_date')]: e.created_at,
        [t('audit_col_ticket')]: e.ticket_id ? `#${formatTicketNumber(e.ticket_id)}` : '',
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

  async function renderAssetLetterSign(id) {
    appEl.innerHTML = `<div class="card spinner-row">${t('loading')}</div>`;
    let letter;
    try {
      ({ letter } = await api(`/asset-letters/${id}`));
    } catch (err) {
      appEl.innerHTML = `<div class="card"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('file')} ${t('asset_letters_title')}</h1>
        </div>
        <a class="btn btn-ghost" href="#/profile">${icon('arrowLeft')} ${t('back_to_list')}</a>
      </div>
      <div class="card" style="max-width:680px">
        <h3 class="section-title" style="margin-top:0">${escapeHtml(letter.asset_name)}</h3>
        <p class="hint">${assetTypeLabels()[letter.asset_type] || letter.asset_type}${letter.asset_tag ? ` · ${escapeHtml(letter.asset_tag)}` : ''}</p>
        ${letter.signed_at ? `
          <div class="presence-banner">${icon('check', 'badge-icon')} <span>${t('asset_letter_already_signed')} ${t('asset_letter_signed_on')} ${formatDate(letter.signed_at)} ${t('asset_letter_signed_by')} ${escapeHtml(letter.signed_name)}</span></div>
        ` : `
          <p>${t('asset_letter_intro')}</p>
          <p style="white-space:pre-wrap;background:var(--surface-alt);padding:0.9rem;border-radius:var(--radius-sm);font-size:0.88rem;line-height:1.6">${t('asset_letter_body')}</p>
          <form id="letterSignForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="letterSignName">${t('field_full_name_sign')}</label><input id="letterSignName" required value="${escapeHtml(letter.user_name || '')}" /></div>
            <p class="error-text" id="letterSignError"></p>
            <div><button class="btn btn-sm" type="submit">${t('btn_sign_letter')}</button></div>
          </form>
        `}
      </div>`;

    const form = document.getElementById('letterSignForm');
    if (form) {
      guardForm(form, async () => {
        const errEl = document.getElementById('letterSignError');
        errEl.textContent = '';
        const fullName = document.getElementById('letterSignName').value.trim();
        if (!fullName) return;
        try {
          await api(`/asset-letters/${id}/sign`, { method: 'POST', body: { fullName } });
          showToast(t('toast_letter_signed'), 'success');
          renderAssetLetterSign(id);
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }
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
        <div class="card" id="assetLettersCard"></div>
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
              <div id="newPwStrengthMeter" class="pw-strength-wrap"></div>
            </div>
            <div class="field">
              <label for="newPassword2">${t('confirm_new_password_label')}</label>
              <input id="newPassword2" type="password" required minlength="8" autocomplete="new-password" />
              <span class="hint" id="newPwMatchHint"></span>
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
        <div class="card" id="twoFaCard"></div>
        <div class="card" id="sessionsCard"></div>
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

    api('/asset-letters?mine=1').then(({ letters }) => {
      const card = document.getElementById('assetLettersCard');
      if (!card) return;
      card.innerHTML = `
        <h3 class="section-title" style="margin-top:0">${icon('file')} ${t('asset_letters_title')}</h3>
        ${letters.length ? `<ul class="plain-list">${letters.map((l) => `
          <li style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
            <span>${escapeHtml(l.asset_name)}${l.asset_tag ? ` · ${escapeHtml(l.asset_tag)}` : ''}</span>
            ${l.signed_at ? `<span class="badge badge-resolved">${t('asset_letter_signed_badge')}</span>` : `<a class="btn btn-ghost btn-sm" href="#/asset-letters/${l.id}">${t('btn_review_and_sign')}</a>`}
          </li>`).join('')}</ul>` : `<p class="hint">${t('no_asset_letters')}</p>`}`;
    }).catch(() => {});

    attachPasswordStrength('newPassword', 'newPwStrengthMeter');
    attachPasswordMatch('newPassword', 'newPassword2', 'newPwMatchHint');

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

    renderTwoFaCard();
    loadSessionsCard();
  }

  function formatDuration(startIso, endIso) {
    const start = new Date(`${startIso.replace(' ', 'T')}Z`).getTime();
    const end = endIso ? new Date(`${endIso.replace(' ', 'T')}Z`).getTime() : Date.now();
    const mins = Math.max(0, Math.round((end - start) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function renderTimesheet() {
    appEl.innerHTML = `
      <div class="view-header"><h1>${icon('clock')} ${t('timesheet_title')}</h1></div>
      <div class="two-col">
        <div class="card">
          <p class="hint">${t('timesheet_hint')}</p>
          <p id="timesheetStatus" class="spinner-row">${t('loading')}</p>
          <div class="field" id="timesheetNotesWrap" hidden>
            <textarea id="timesheetNotes" rows="2" placeholder="${t('timesheet_notes_placeholder')}"></textarea>
          </div>
          <button type="button" id="timesheetToggleBtn" class="btn" disabled></button>
          <p class="error-text" id="timesheetError"></p>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('activity')} ${t('timesheet_pay_title')}</h3>
          <p class="hint">${t('timesheet_pay_hint')}</p>
          <div class="field">
            <label for="timesheetWageInput">${t('timesheet_pay_wage_label')}</label>
            <input type="number" id="timesheetWageInput" min="0" step="0.01" placeholder="0.00" />
          </div>
          <p class="hint">${t('timesheet_pay_hours_label')}: <strong id="timesheetPayHours">–</strong></p>
          <p class="hint">${t('timesheet_pay_estimate_label')}: <strong id="timesheetPayEstimate">–</strong></p>
        </div>
        ${(isStaff() || (state.user && state.user.is_manager)) ? `
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('users')} ${t('timesheet_team_title')}</h3>
          <p class="hint">${t('timesheet_team_hint')}</p>
          <div id="timesheetTeamList" class="spinner-row">${t('loading')}</div>
        </div>` : ''}
        <div class="card admin-grid-full" id="timesheetManualCard" hidden>
          <h3 class="section-title" style="margin-top:0">${icon('clock')} ${t('timesheet_manual_title')}</h3>
          <p class="hint">${t('timesheet_manual_hint')}</p>
          <div class="timesheet-calendar" id="timesheetCalendar">
            <div class="timesheet-calendar-head">
              <button type="button" class="icon-btn" id="tsCalPrevBtn" aria-label="${t('page_prev')}">${icon('arrowLeft')}</button>
              <strong id="tsCalMonthLabel"></strong>
              <button type="button" class="icon-btn" id="tsCalNextBtn" aria-label="${t('page_next')}">${icon('arrowRight')}</button>
            </div>
            <div class="timesheet-calendar-grid" id="tsCalGrid"></div>
          </div>
          <form id="timesheetManualForm" class="form-grid" style="max-width:none">
            <p class="hint" id="manualDateLabel"></p>
            <input id="manualDate" type="hidden" required />
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
              <div class="field" style="flex:1 1 7rem"><label for="manualStart">${t('field_start_time')}</label><input id="manualStart" type="time" required /></div>
              <div class="field" style="flex:1 1 7rem"><label for="manualEnd">${t('field_end_time')}</label><input id="manualEnd" type="time" required /></div>
            </div>
            <div class="field"><label for="manualNotes">${t('field_notes')}</label><input id="manualNotes" type="text" maxlength="500" /></div>
            <p class="error-text" id="timesheetManualError"></p>
            <div style="display:flex; gap:0.6rem;">
              <button class="btn btn-sm" type="submit" id="timesheetManualSubmitBtn">${t('btn_add_entry')}</button>
              <button type="button" class="btn btn-sm btn-ghost" id="timesheetManualCancelBtn" hidden>${t('btn_cancel')}</button>
            </div>
          </form>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${icon('activity')} ${t('timesheet_history_title')}</h3>
          <div id="timesheetHistory" class="spinner-row">${t('loading')}</div>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('sun')} ${t('leave_new_request_title')}</h3>
          <p class="hint">${t('leave_requests_hint')}</p>
          <form id="leaveRequestForm" class="form-grid">
            <div class="field">
              <label for="leaveType">${t('leave_field_type')}</label>
              <select id="leaveType">
                <option value="vacation">${leaveTypeLabels().vacation}</option>
                <option value="permit">${leaveTypeLabels().permit}</option>
              </select>
            </div>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
              <div class="field" style="flex:1 1 10rem">
                <label for="leaveStart">${t('leave_field_start')}</label>
                <input id="leaveStart" type="date" required />
              </div>
              <div class="field" style="flex:1 1 10rem">
                <label for="leaveEnd">${t('leave_field_end')}</label>
                <input id="leaveEnd" type="date" required />
              </div>
            </div>
            <div class="field">
              <label for="leaveNote">${t('leave_field_note')}</label>
              <textarea id="leaveNote" rows="2"></textarea>
            </div>
            <p class="error-text" id="leaveFormError"></p>
            <button class="btn" type="submit">${t('leave_submit_btn')}</button>
          </form>
        </div>
        <div class="card admin-grid-full">
          <h3 class="section-title" style="margin-top:0">${t('leave_my_requests_title')}</h3>
          <div id="leaveMineWrap" class="card-list spinner-row">${t('loading')}</div>
        </div>
        ${canReviewLeaveRequests() ? `
        <div class="card admin-grid-full">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.6rem;">
            <h3 class="section-title" style="margin-top:0">${t('leave_team_title')}</h3>
            <select id="leaveTeamStatusFilter">
              <option value="pending" selected>${leaveStatusLabels().pending}</option>
              <option value="">${t('filter_all_statuses')}</option>
              <option value="approved">${leaveStatusLabels().approved}</option>
              <option value="rejected">${leaveStatusLabels().rejected}</option>
            </select>
          </div>
          <div id="leaveTeamWrap" class="card-list spinner-row">${t('loading')}</div>
        </div>` : ''}
      </div>`;

    function entriesTableHtml(entries, includeUser, editable) {
      if (!entries.length) return `<p class="hint">${t('timesheet_no_entries')}</p>`;
      return `
        <div class="table-scroll">
          <table class="users-table">
            <thead><tr>
              ${includeUser ? `<th>${t('field_name')}</th>` : ''}
              <th>${t('th_clock_in')}</th><th>${t('th_clock_out')}</th><th>${t('th_duration')}</th><th>${t('field_notes')}</th>
              ${editable ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${entries.map((e) => `
                <tr>
                  ${includeUser ? `<td>${escapeHtml(e.user_name)}</td>` : ''}
                  <td>${formatDate(e.clock_in)}</td>
                  <td>${e.clock_out ? formatDate(e.clock_out) : `<span class="role-tag role-tag-active">${t('timesheet_ongoing')}</span>`}</td>
                  <td>${formatDuration(e.clock_in, e.clock_out)}</td>
                  <td>${e.notes ? escapeHtml(e.notes) : ''}</td>
                  ${editable ? `<td style="white-space:nowrap">
                    ${e.clock_out ? `<button type="button" class="icon-btn timesheetEditBtn" data-id="${e.id}" data-clock-in="${e.clock_in}" data-clock-out="${e.clock_out}" data-notes="${e.notes ? escapeHtml(e.notes) : ''}" title="${t('btn_edit')}">${icon('edit')}</button>` : ''}
                    <button type="button" class="icon-btn timesheetDeleteBtn" data-id="${e.id}" title="${t('btn_delete')}">${icon('trash')}</button>
                  </td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    function monthlyMinutes(entries) {
      const now = new Date();
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return entries.reduce((total, e) => {
        const start = new Date(`${e.clock_in.replace(' ', 'T')}Z`).getTime();
        if (start < monthStart) return total;
        const end = e.clock_out ? new Date(`${e.clock_out.replace(' ', 'T')}Z`).getTime() : Date.now();
        return total + Math.max(0, (end - start) / 60000);
      }, 0);
    }

    function renderPayEstimate(entries) {
      const hoursEl = document.getElementById('timesheetPayHours');
      const estimateEl = document.getElementById('timesheetPayEstimate');
      if (!hoursEl || !estimateEl) return;
      const hours = monthlyMinutes(entries) / 60;
      hoursEl.textContent = hours.toFixed(1);
      const wageInput = document.getElementById('timesheetWageInput');
      const wage = parseFloat(wageInput.value);
      estimateEl.textContent = wage > 0 ? `${(hours * wage).toFixed(2)} €` : '–';
    }

    let lastEntries = [];
    let flexibleTimeEntry = false;
    let calendarMonth = new Date();
    let selectedCalendarDate = null;
    async function loadHistory() {
      const el = document.getElementById('timesheetHistory');
      try {
        const { entries } = await api('/time-entries');
        lastEntries = entries;
        renderCalendarGrid();
        el.className = '';
        el.innerHTML = entriesTableHtml(entries, false, flexibleTimeEntry);
        renderPayEstimate(entries);
        el.querySelectorAll('.timesheetEditBtn').forEach((btn) => {
          btn.addEventListener('click', () => startManualEdit(btn.dataset.id, btn.dataset.clockIn, btn.dataset.clockOut, btn.dataset.notes));
        });
        el.querySelectorAll('.timesheetDeleteBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_delete_time_entry'))) return;
            try {
              await api(`/time-entries/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_time_entry_deleted'), 'success');
              loadHistory();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      } catch (err) {
        el.className = '';
        el.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    function dbDatetimeToParts(dbValue) {
      const [datePart, timePart] = dbValue.split(' ');
      const utc = new Date(`${datePart}T${timePart}Z`);
      const pad = (n) => String(n).padStart(2, '0');
      return {
        date: `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}`,
        time: `${pad(utc.getHours())}:${pad(utc.getMinutes())}`,
      };
    }

    function partsToDbDatetime(dateStr, timeStr) {
      const local = new Date(`${dateStr}T${timeStr}:00`);
      return local.toISOString().slice(0, 19).replace('T', ' ');
    }

    function calendarDayKey(dbValue) {
      return dbDatetimeToParts(dbValue).date;
    }

    function monthFromDateKey(dateKey) {
      const [y, m] = dateKey.split('-');
      return new Date(Number(y), Number(m) - 1, 1);
    }

    function updateManualDateLabel(dateKey) {
      const labelEl = document.getElementById('manualDateLabel');
      if (!labelEl) return;
      if (!dateKey) { labelEl.textContent = ''; return; }
      const locale = getLang() === 'en' ? 'en-US' : 'it-IT';
      labelEl.textContent = `${t('field_date')}: ${new Date(`${dateKey}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    function renderCalendarGrid() {
      const gridEl = document.getElementById('tsCalGrid');
      const labelEl = document.getElementById('tsCalMonthLabel');
      if (!gridEl || !labelEl) return;
      const locale = getLang() === 'en' ? 'en-US' : 'it-IT';
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      labelEl.textContent = calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

      const minutesByDay = {};
      lastEntries.forEach((e) => {
        if (!e.clock_out) return;
        const key = calendarDayKey(e.clock_in);
        const start = new Date(`${e.clock_in.replace(' ', 'T')}Z`).getTime();
        const end = new Date(`${e.clock_out.replace(' ', 'T')}Z`).getTime();
        minutesByDay[key] = (minutesByDay[key] || 0) + Math.max(0, (end - start) / 60000);
      });

      const pad = (n) => String(n).padStart(2, '0');
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const firstOfMonth = new Date(year, month, 1);
      const startWeekday = (firstOfMonth.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weekdayLabels = locale === 'it-IT' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

      let html = weekdayLabels.map((d) => `<div class="ts-cal-weekday">${d}</div>`).join('');
      for (let i = 0; i < startWeekday; i++) html += '<div class="ts-cal-cell ts-cal-empty"></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
        const minutes = minutesByDay[dateKey];
        const classes = ['ts-cal-cell'];
        if (dateKey === todayKey) classes.push('ts-cal-today');
        if (dateKey === selectedCalendarDate) classes.push('ts-cal-selected');
        if (minutes) classes.push('ts-cal-has-entry');
        html += `<button type="button" class="${classes.join(' ')}" data-date="${dateKey}">
          <span class="ts-cal-daynum">${day}</span>
          ${minutes ? `<span class="ts-cal-hours">${(minutes / 60).toFixed(1)}h</span>` : ''}
        </button>`;
      }
      gridEl.innerHTML = html;
      gridEl.querySelectorAll('.ts-cal-cell:not(.ts-cal-empty)').forEach((cell) => {
        cell.addEventListener('click', () => selectCalendarDay(cell.dataset.date));
      });
    }

    function selectCalendarDay(dateKey) {
      const existing = lastEntries.find((e) => e.clock_out && calendarDayKey(e.clock_in) === dateKey);
      if (existing) {
        startManualEdit(existing.id, existing.clock_in, existing.clock_out, existing.notes);
        return;
      }
      resetManualForm();
      selectedCalendarDate = dateKey;
      document.getElementById('manualDate').value = dateKey;
      updateManualDateLabel(dateKey);
      renderCalendarGrid();
    }

    document.getElementById('tsCalPrevBtn').addEventListener('click', () => {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
      renderCalendarGrid();
    });
    document.getElementById('tsCalNextBtn').addEventListener('click', () => {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      renderCalendarGrid();
    });
    renderCalendarGrid();

    let editingEntryId = null;
    function startManualEdit(id, clockIn, clockOut, notes) {
      editingEntryId = id;
      const inParts = dbDatetimeToParts(clockIn);
      const outParts = dbDatetimeToParts(clockOut);
      document.getElementById('manualDate').value = inParts.date;
      document.getElementById('manualStart').value = inParts.time;
      document.getElementById('manualEnd').value = outParts.time;
      document.getElementById('manualNotes').value = notes || '';
      document.getElementById('timesheetManualSubmitBtn').textContent = t('btn_save');
      document.getElementById('timesheetManualCancelBtn').hidden = false;
      document.getElementById('timesheetManualCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      selectedCalendarDate = inParts.date;
      calendarMonth = monthFromDateKey(inParts.date);
      updateManualDateLabel(inParts.date);
      renderCalendarGrid();
    }

    function resetManualForm() {
      editingEntryId = null;
      document.getElementById('timesheetManualForm').reset();
      document.getElementById('timesheetManualSubmitBtn').textContent = t('btn_add_entry');
      document.getElementById('timesheetManualCancelBtn').hidden = true;
      document.getElementById('timesheetManualError').textContent = '';
      selectedCalendarDate = null;
      updateManualDateLabel(null);
      renderCalendarGrid();
    }

    document.getElementById('timesheetManualCancelBtn').addEventListener('click', resetManualForm);

    guardForm(document.getElementById('timesheetManualForm'), async () => {
      const errEl = document.getElementById('timesheetManualError');
      errEl.textContent = '';
      const dateVal = document.getElementById('manualDate').value;
      const startVal = document.getElementById('manualStart').value;
      const endVal = document.getElementById('manualEnd').value;
      const notes = document.getElementById('manualNotes').value;
      if (!dateVal) { errEl.textContent = t('timesheet_select_day_error'); return; }
      if (!startVal || !endVal) return;
      const clockIn = partsToDbDatetime(dateVal, startVal);
      const clockOut = partsToDbDatetime(dateVal, endVal);
      try {
        if (editingEntryId) {
          await api(`/time-entries/${editingEntryId}`, { method: 'PATCH', body: { clockIn, clockOut, notes } });
          showToast(t('toast_time_entry_updated'), 'success');
        } else {
          await api('/time-entries/manual', { method: 'POST', body: { clockIn, clockOut, notes } });
          showToast(t('toast_time_entry_added'), 'success');
        }
        resetManualForm();
        loadHistory();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    const wageInput = document.getElementById('timesheetWageInput');
    try { wageInput.value = localStorage.getItem('ticketing_hourly_wage') || ''; } catch {}
    wageInput.addEventListener('input', () => {
      try {
        if (wageInput.value) localStorage.setItem('ticketing_hourly_wage', wageInput.value);
        else localStorage.removeItem('ticketing_hourly_wage');
      } catch {}
      renderPayEstimate(lastEntries);
    });

    async function loadTeam() {
      const el = document.getElementById('timesheetTeamList');
      if (!el) return;
      try {
        const { entries } = await api('/time-entries/team');
        el.className = '';
        el.innerHTML = entriesTableHtml(entries, true);
      } catch (err) {
        el.className = '';
        el.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    async function loadStatus() {
      const statusEl = document.getElementById('timesheetStatus');
      const btn = document.getElementById('timesheetToggleBtn');
      const notesWrap = document.getElementById('timesheetNotesWrap');
      statusEl.className = '';
      try {
        const { clockedIn, entry } = await api('/time-entries/status');
        if (clockedIn) {
          statusEl.innerHTML = `<span class="role-tag role-tag-active">${t('timesheet_status_in_prefix')} ${formatDate(entry.clock_in)}</span>`;
          btn.textContent = t('btn_clock_out');
          btn.dataset.action = 'out';
          notesWrap.hidden = false;
        } else {
          statusEl.textContent = t('timesheet_status_out');
          btn.textContent = t('btn_clock_in');
          btn.dataset.action = 'in';
          notesWrap.hidden = true;
        }
        btn.disabled = false;
      } catch (err) {
        statusEl.innerHTML = `<span class="error-text">${escapeHtml(err.message)}</span>`;
      }
    }

    document.getElementById('timesheetToggleBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const errEl = document.getElementById('timesheetError');
      errEl.textContent = '';
      btn.disabled = true;
      try {
        if (btn.dataset.action === 'in') {
          await api('/time-entries/clock-in', { method: 'POST' });
          showToast(t('toast_clocked_in'), 'success');
        } else {
          const notes = document.getElementById('timesheetNotes').value.trim();
          await api('/time-entries/clock-out', { method: 'POST', body: { notes } });
          showToast(t('toast_clocked_out'), 'success');
          document.getElementById('timesheetNotes').value = '';
        }
        await loadStatus();
        loadHistory();
        loadTeam();
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
      }
    });

    guardForm(document.getElementById('leaveRequestForm'), async () => {
      const errEl = document.getElementById('leaveFormError');
      errEl.textContent = '';
      const body = {
        type: document.getElementById('leaveType').value,
        startDate: document.getElementById('leaveStart').value,
        endDate: document.getElementById('leaveEnd').value,
        note: document.getElementById('leaveNote').value,
      };
      try {
        await api('/leave-requests', { method: 'POST', body });
        showToast(t('toast_leave_request_created'), 'success');
        document.getElementById('leaveRequestForm').reset();
        loadLeaveMine();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    function leaveCardHtml(r, opts = {}) {
      return `
        <div class="card leave-card">
          <div class="leave-card-main">
            <h3>${opts.showUser ? `${escapeHtml(r.user_name)} · ` : ''}${leaveTypeLabels()[r.type] || r.type}</h3>
            <p class="hint">${formatDate(r.start_date)} → ${formatDate(r.end_date)}</p>
            ${r.note ? `<p class="hint">${escapeHtml(r.note)}</p>` : ''}
            ${r.review_note ? `<p class="hint">${t('leave_review_note_label')}: ${escapeHtml(r.review_note)}</p>` : ''}
          </div>
          <div class="leave-card-side">
            <span class="badge badge-${r.status}">${leaveStatusLabels()[r.status] || r.status}</span>
            ${opts.canCancel && r.status === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm leaveCancelBtn" data-id="${r.id}">${t('leave_cancel_btn')}</button>` : ''}
            ${opts.canReview && r.status === 'pending' ? `
              <div style="display:flex; gap:0.4rem;">
                <button type="button" class="btn btn-sm leaveApproveBtn" data-id="${r.id}">${t('leave_approve_btn')}</button>
                <button type="button" class="btn btn-ghost btn-sm leaveRejectBtn" data-id="${r.id}">${t('leave_reject_btn')}</button>
              </div>` : ''}
          </div>
        </div>`;
    }

    async function loadLeaveMine() {
      const wrap = document.getElementById('leaveMineWrap');
      wrap.className = 'card-list spinner-row';
      wrap.textContent = t('loading');
      try {
        const { requests } = await api('/leave-requests');
        wrap.className = 'card-list';
        wrap.innerHTML = requests.length ? requests.map((r) => leaveCardHtml(r, { canCancel: true })).join('') : `<p class="hint">${t('leave_none_found')}</p>`;
        wrap.querySelectorAll('.leaveCancelBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_cancel_leave_request'))) return;
            try {
              await api(`/leave-requests/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_leave_request_cancelled'), 'success');
              loadLeaveMine();
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

    async function loadLeaveTeam() {
      const wrap = document.getElementById('leaveTeamWrap');
      if (!wrap) return;
      const statusFilter = document.getElementById('leaveTeamStatusFilter');
      wrap.className = 'card-list spinner-row';
      wrap.textContent = t('loading');
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        const { requests } = await api(`/leave-requests/team?${params.toString()}`);
        wrap.className = 'card-list';
        wrap.innerHTML = requests.length ? requests.map((r) => leaveCardHtml(r, { showUser: true, canReview: true })).join('') : `<p class="hint">${t('leave_none_found')}</p>`;
        wrap.querySelectorAll('.leaveApproveBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/leave-requests/${btn.dataset.id}/status`, { method: 'PATCH', body: { status: 'approved' } });
              showToast(t('toast_leave_request_approved'), 'success');
              loadLeaveTeam();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        wrap.querySelectorAll('.leaveRejectBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/leave-requests/${btn.dataset.id}/status`, { method: 'PATCH', body: { status: 'rejected' } });
              showToast(t('toast_leave_request_rejected'), 'success');
              loadLeaveTeam();
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

    if (canReviewLeaveRequests()) {
      document.getElementById('leaveTeamStatusFilter').addEventListener('change', loadLeaveTeam);
      loadLeaveTeam();
    }
    loadLeaveMine();

    loadStatus();
    api('/settings').then(({ flexibleTimeEntry: flag }) => {
      flexibleTimeEntry = flag;
      document.getElementById('timesheetManualCard').hidden = !flag;
      loadHistory();
    }).catch(() => loadHistory());
    loadTeam();
  }

  function canManageRooms() {
    return !!(state.user && (state.user.role === 'admin' || state.user.is_super_admin || (Array.isArray(state.user.permissions) && state.user.permissions.includes('rooms_manage'))));
  }

  async function renderRooms() {
    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('calendar')} ${t('nav_rooms')}</h1>
        <p class="hint">${t('rooms_hint')}</p>
      </div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('rooms_new_booking_title')}</h3>
          <form id="newBookingForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="bookingRoom">${t('rooms_field_room')}</label><select id="bookingRoom" required></select></div>
            <div class="field"><label for="bookingTitle">${t('rooms_field_title')}</label><input id="bookingTitle" required maxlength="200" /></div>
            <div class="field-row">
              <div class="field"><label for="bookingStart">${t('rooms_field_start')}</label><input id="bookingStart" type="datetime-local" required /></div>
              <div class="field"><label for="bookingEnd">${t('rooms_field_end')}</label><input id="bookingEnd" type="datetime-local" required /></div>
            </div>
            <p class="error-text" id="bookingError"></p>
            <div><button class="btn btn-sm" type="submit">${t('rooms_book_btn')}</button></div>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('inbox')} ${t('rooms_bookings_for')}</h3>
          <div id="bookingsList" class="spinner-row">${t('loading')}</div>
        </div>
      </div>
      ${canManageRooms() ? `
      <div class="card" style="margin-top:1rem">
        <h3 class="section-title" style="margin-top:0">${icon('settings')} ${t('rooms_manage_title')}</h3>
        <form id="newRoomForm" style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:flex-end;margin:0.75rem 0">
          <div class="field" style="flex:1 1 12rem"><label for="newRoomName">${t('rooms_field_room_name')}</label><input id="newRoomName" required /></div>
          <div class="field" style="flex:1 1 12rem"><label for="newRoomLocation">${t('rooms_field_location')}</label><input id="newRoomLocation" /></div>
          <div class="field" style="flex:0 0 8rem"><label for="newRoomCapacity">${t('rooms_field_capacity')}</label><input id="newRoomCapacity" type="number" min="1" /></div>
          <button class="btn btn-sm" type="submit">${t('rooms_add_room_btn')}</button>
        </form>
        <p class="error-text" id="roomError"></p>
        <div id="roomsAdminList" class="spinner-row">${t('loading')}</div>
      </div>` : ''}
    `;

    let roomsCache = [];

    function bookingCardHtml(b) {
      const canCancel = b.user_id === state.user.id || canManageRooms();
      return `
        <div class="card" style="margin-bottom:0.6rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
            <div>
              <strong>${escapeHtml(b.title)}</strong>
              <p class="hint" style="margin:0.2rem 0 0">${icon('building', 'badge-icon')} ${escapeHtml(b.room_name)} · ${icon('userCircle', 'badge-icon')} ${escapeHtml(b.user_name)}</p>
              <p class="hint" style="margin:0.2rem 0 0">${formatDate(b.start_at)} → ${formatDate(b.end_at)}</p>
            </div>
            ${canCancel ? `<button type="button" class="btn btn-ghost btn-sm cancelBookingBtn" data-id="${b.id}">${t('rooms_cancel_btn')}</button>` : ''}
          </div>
        </div>`;
    }

    async function loadBookings() {
      const listEl = document.getElementById('bookingsList');
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      try {
        const from = new Date().toISOString().slice(0, 16);
        const results = await Promise.all(roomsCache.map((r) => api(`/rooms/${r.id}/bookings?from=${encodeURIComponent(from)}`).catch(() => ({ bookings: [] }))));
        const bookings = results.flatMap((r) => r.bookings).sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
        listEl.className = '';
        listEl.innerHTML = bookings.length ? bookings.map(bookingCardHtml).join('') : `<p class="hint">${t('rooms_no_bookings')}</p>`;
        listEl.querySelectorAll('.cancelBookingBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_cancel_room_booking'))) return;
            try {
              await api(`/rooms/bookings/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_room_booking_cancelled'), 'success');
              loadBookings();
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

    async function loadRoomsAdmin() {
      const listEl = document.getElementById('roomsAdminList');
      if (!listEl) return;
      listEl.className = '';
      listEl.innerHTML = roomsCache.length ? `
        <div class="table-scroll">
          <table class="users-table">
            <thead><tr>
              <th>${t('rooms_col_name')}</th><th>${t('rooms_col_location')}</th><th>${t('rooms_col_capacity')}</th><th></th>
            </tr></thead>
            <tbody>
              ${roomsCache.map((r) => `
                <tr>
                  <td>${escapeHtml(r.name)}</td>
                  <td>${r.location ? escapeHtml(r.location) : '—'}</td>
                  <td>${r.capacity ? `${r.capacity} ${t('rooms_capacity_label')}` : '—'}</td>
                  <td><button type="button" class="icon-btn deleteRoomBtn" data-id="${r.id}" title="${t('delete_room_title')}">${icon('trash')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<p class="hint">${t('rooms_no_rooms')}</p>`;
      listEl.querySelectorAll('.deleteRoomBtn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('confirm_delete_room'))) return;
          try {
            await api(`/rooms/${btn.dataset.id}`, { method: 'DELETE' });
            showToast(t('toast_room_deleted'), 'success');
            loadRooms();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    async function loadRooms() {
      const { rooms } = await api('/rooms');
      roomsCache = rooms;
      const select = document.getElementById('bookingRoom');
      select.innerHTML = rooms.length
        ? rooms.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}${r.capacity ? ` (${r.capacity} ${t('rooms_capacity_label')})` : ''}</option>`).join('')
        : `<option value="">${t('rooms_no_rooms')}</option>`;
      loadBookings();
      loadRoomsAdmin();
    }

    guardForm(document.getElementById('newBookingForm'), async () => {
      const errEl = document.getElementById('bookingError');
      errEl.textContent = '';
      const roomId = document.getElementById('bookingRoom').value;
      if (!roomId) {
        errEl.textContent = t('rooms_no_rooms');
        return;
      }
      try {
        await api(`/rooms/${roomId}/bookings`, {
          method: 'POST',
          body: {
            title: document.getElementById('bookingTitle').value,
            startAt: document.getElementById('bookingStart').value,
            endAt: document.getElementById('bookingEnd').value,
          },
        });
        document.getElementById('newBookingForm').reset();
        showToast(t('toast_room_booked'), 'success');
        loadBookings();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    const newRoomForm = document.getElementById('newRoomForm');
    if (newRoomForm) {
      guardForm(newRoomForm, async () => {
        const errEl = document.getElementById('roomError');
        errEl.textContent = '';
        try {
          await api('/rooms', {
            method: 'POST',
            body: {
              name: document.getElementById('newRoomName').value,
              location: document.getElementById('newRoomLocation').value,
              capacity: document.getElementById('newRoomCapacity').value || null,
            },
          });
          newRoomForm.reset();
          showToast(t('toast_room_created'), 'success');
          loadRooms();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    loadRooms();
  }

  function canManageIdeas() {
    return !!(state.user && (state.user.role === 'admin' || state.user.is_super_admin || (Array.isArray(state.user.permissions) && state.user.permissions.includes('ideas_manage'))));
  }

  async function renderIdeas() {
    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('bulb')} ${t('nav_ideas')}</h1>
        <p class="hint">${t('ideas_hint')}</p>
      </div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('ideas_new_title')}</h3>
          <form id="newIdeaForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="ideaTitle">${t('ideas_field_title')}</label><input id="ideaTitle" required maxlength="200" /></div>
            <div class="field"><label for="ideaDescription">${t('ideas_field_description')}</label><textarea id="ideaDescription" rows="3" maxlength="4000"></textarea></div>
            <p class="error-text" id="ideaError"></p>
            <div><button class="btn btn-sm" type="submit">${t('ideas_submit_btn')}</button></div>
          </form>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
            <h3 class="section-title" style="margin:0">${icon('inbox')} ${t('ideas_list_title')}</h3>
            <select id="ideaStatusFilter">
              <option value="">${t('ideas_filter_all')}</option>
              ${Object.entries(ideaStatusLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div id="ideasList" class="spinner-row">${t('loading')}</div>
        </div>
      </div>
    `;

    const statusFilter = document.getElementById('ideaStatusFilter');

    function ideaCardHtml(idea) {
      const canDelete = idea.author_id === state.user.id || canManageIdeas();
      return `
        <div class="card" style="margin-bottom:0.6rem" data-idea-id="${idea.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem">
            <button type="button" class="icon-btn ideaVoteBtn ${idea.has_voted ? 'active' : ''}" data-id="${idea.id}" title="${t('ideas_vote_btn')}">
              ${icon('bulb')}<span>${idea.vote_count}</span>
            </button>
            <div style="flex:1">
              <strong>${escapeHtml(idea.title)}</strong>
              ${idea.description ? `<p class="hint" style="margin:0.3rem 0 0;white-space:pre-wrap">${escapeHtml(idea.description)}</p>` : ''}
              <p class="hint" style="margin:0.3rem 0 0">${icon('userCircle', 'badge-icon')} ${escapeHtml(idea.author_name)} · ${formatDate(idea.created_at)}</p>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
              ${canManageIdeas() ? `
              <select class="ideaStatusSelect" data-id="${idea.id}">
                ${Object.entries(ideaStatusLabels()).map(([v, l]) => `<option value="${v}" ${v === idea.status ? 'selected' : ''}>${l}</option>`).join('')}
              </select>` : `<span class="role-tag idea-status-${idea.status}">${ideaStatusLabels()[idea.status]}</span>`}
              ${canDelete ? `<button type="button" class="icon-btn deleteIdeaBtn" data-id="${idea.id}" title="${t('ideas_delete_title')}">${icon('trash')}</button>` : ''}
            </div>
          </div>
        </div>`;
    }

    async function loadIdeas() {
      const listEl = document.getElementById('ideasList');
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      try {
        const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
        const { ideas } = await api(`/ideas${params}`);
        listEl.className = '';
        listEl.innerHTML = ideas.length ? ideas.map(ideaCardHtml).join('') : `<p class="hint">${t('ideas_none')}</p>`;
        listEl.querySelectorAll('.ideaVoteBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await api(`/ideas/${btn.dataset.id}/vote`, { method: 'POST' });
              loadIdeas();
            } catch (err) {
              showToast(err.message, 'error');
              btn.disabled = false;
            }
          });
        });
        listEl.querySelectorAll('.ideaStatusSelect').forEach((sel) => {
          sel.addEventListener('change', async () => {
            try {
              await api(`/ideas/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: sel.value } });
              showToast(t('toast_idea_status_updated'), 'success');
              loadIdeas();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('.deleteIdeaBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_delete_idea'))) return;
            try {
              await api(`/ideas/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_idea_deleted'), 'success');
              loadIdeas();
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

    statusFilter.addEventListener('change', loadIdeas);

    guardForm(document.getElementById('newIdeaForm'), async () => {
      const errEl = document.getElementById('ideaError');
      errEl.textContent = '';
      try {
        await api('/ideas', {
          method: 'POST',
          body: {
            title: document.getElementById('ideaTitle').value,
            description: document.getElementById('ideaDescription').value,
          },
        });
        document.getElementById('newIdeaForm').reset();
        showToast(t('toast_idea_submitted'), 'success');
        loadIdeas();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    loadIdeas();
  }

  function canManageWiki() {
    return !!(state.user && (state.user.role === 'admin' || state.user.is_super_admin || (Array.isArray(state.user.permissions) && state.user.permissions.includes('wiki_manage'))));
  }

  async function renderWikiList() {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <h1>${icon('file')} ${t('nav_wiki')}</h1>
          <p class="hint">${t('wiki_hint')}</p>
        </div>
        ${canManageWiki() ? `<button type="button" id="wikiNewPageBtn" class="btn">${icon('plus')} ${t('wiki_new_page_btn')}</button>` : ''}
      </div>
      <div class="filters">
        <input id="wikiSearch" type="search" placeholder="${t('wiki_search_placeholder')}" />
      </div>
      ${canManageWiki() ? `
      <div class="card" id="wikiNewPageCard" hidden>
        <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('wiki_new_page_btn')}</h3>
        <form id="newWikiPageForm" class="form-grid" style="max-width:none">
          <div class="field"><label for="wikiNewTitle">${t('wiki_field_title')}</label><input id="wikiNewTitle" required maxlength="200" /></div>
          <div class="field"><label for="wikiNewContent">${t('wiki_field_content')}</label><textarea id="wikiNewContent" rows="8"></textarea></div>
          <p class="error-text" id="wikiNewError"></p>
          <div><button class="btn btn-sm" type="submit">${t('wiki_save_btn')}</button></div>
        </form>
      </div>` : ''}
      <div id="wikiPagesList" class="spinner-row">${t('loading')}</div>
    `;

    const searchInput = document.getElementById('wikiSearch');
    const listEl = document.getElementById('wikiPagesList');

    function pageRowHtml(p) {
      return `
        <a class="card" style="display:block;margin-bottom:0.6rem" href="#/wiki/${p.id}">
          <strong>${escapeHtml(p.title)}</strong>
          <p class="hint" style="margin:0.3rem 0 0">${icon('userCircle', 'badge-icon')} ${escapeHtml(p.updated_by_name || p.author_name || '—')} · ${formatDate(p.updated_at)}</p>
        </a>`;
    }

    let debounceTimer;
    async function loadPages() {
      listEl.className = 'spinner-row';
      listEl.textContent = t('loading');
      try {
        const q = searchInput.value.trim();
        const { pages } = await api(`/wiki${q ? `?q=${encodeURIComponent(q)}` : ''}`);
        listEl.className = '';
        listEl.innerHTML = pages.length ? pages.map(pageRowHtml).join('') : `<p class="hint">${t('wiki_none')}</p>`;
      } catch (err) {
        listEl.className = '';
        listEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadPages, 300);
    });

    const newPageBtn = document.getElementById('wikiNewPageBtn');
    const newPageCard = document.getElementById('wikiNewPageCard');
    if (newPageBtn) {
      newPageBtn.addEventListener('click', () => {
        newPageCard.hidden = !newPageCard.hidden;
      });
      guardForm(document.getElementById('newWikiPageForm'), async () => {
        const errEl = document.getElementById('wikiNewError');
        errEl.textContent = '';
        try {
          const { page } = await api('/wiki', {
            method: 'POST',
            body: {
              title: document.getElementById('wikiNewTitle').value,
              content: document.getElementById('wikiNewContent').value,
            },
          });
          showToast(t('toast_wiki_page_created'), 'success');
          location.hash = `#/wiki/${page.id}`;
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    loadPages();
  }

  async function renderWikiPage(id) {
    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <a href="#/wiki" class="hint">${icon('arrowLeft', 'badge-icon')} ${t('wiki_back_to_list')}</a>
          <h1 id="wikiPageTitle"></h1>
          <p class="hint" id="wikiPageMeta"></p>
        </div>
        ${canManageWiki() ? `
        <div style="display:flex;gap:0.5rem">
          <button type="button" id="wikiEditBtn" class="btn btn-ghost">${icon('edit')} ${t('wiki_edit_btn')}</button>
          <button type="button" id="wikiDeleteBtn" class="btn btn-outline-danger">${icon('trash')} ${t('wiki_delete_btn')}</button>
        </div>` : ''}
      </div>
      <div class="card" id="wikiPageBody"><div class="spinner-row">${t('loading')}</div></div>
    `;

    let currentPage = null;

    async function load() {
      try {
        const { page } = await api(`/wiki/${id}`);
        currentPage = page;
        document.getElementById('wikiPageTitle').textContent = page.title;
        document.getElementById('wikiPageMeta').textContent =
          `${t('wiki_last_edited_by')} ${page.updated_by_name || page.author_name || '—'} · ${formatDate(page.updated_at)}`;
        renderReadMode();
      } catch (err) {
        document.getElementById('wikiPageBody').innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
      }
    }

    function renderReadMode() {
      const body = document.getElementById('wikiPageBody');
      body.innerHTML = currentPage.content
        ? `<p style="white-space:pre-wrap">${escapeHtml(currentPage.content)}</p>`
        : `<p class="hint">${t('wiki_empty_page')}</p>`;
    }

    function renderEditMode() {
      const body = document.getElementById('wikiPageBody');
      body.innerHTML = `
        <form id="editWikiPageForm" class="form-grid" style="max-width:none">
          <div class="field"><label for="wikiEditTitle">${t('wiki_field_title')}</label><input id="wikiEditTitle" required maxlength="200" value="${escapeHtml(currentPage.title)}" /></div>
          <div class="field"><label for="wikiEditContent">${t('wiki_field_content')}</label><textarea id="wikiEditContent" rows="12">${escapeHtml(currentPage.content || '')}</textarea></div>
          <p class="error-text" id="wikiEditError"></p>
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-sm" type="submit">${t('wiki_save_btn')}</button>
            <button class="btn btn-ghost btn-sm" type="button" id="wikiCancelEditBtn">${t('btn_cancel')}</button>
          </div>
        </form>`;
      document.getElementById('wikiCancelEditBtn').addEventListener('click', renderReadMode);
      guardForm(document.getElementById('editWikiPageForm'), async () => {
        const errEl = document.getElementById('wikiEditError');
        errEl.textContent = '';
        try {
          const { page } = await api(`/wiki/${id}`, {
            method: 'PATCH',
            body: {
              title: document.getElementById('wikiEditTitle').value,
              content: document.getElementById('wikiEditContent').value,
            },
          });
          currentPage = page;
          document.getElementById('wikiPageTitle').textContent = page.title;
          document.getElementById('wikiPageMeta').textContent =
            `${t('wiki_last_edited_by')} ${page.updated_by_name || page.author_name || '—'} · ${formatDate(page.updated_at)}`;
          showToast(t('toast_wiki_page_saved'), 'success');
          renderReadMode();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    const editBtn = document.getElementById('wikiEditBtn');
    if (editBtn) editBtn.addEventListener('click', renderEditMode);
    const deleteBtn = document.getElementById('wikiDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_wiki_page'))) return;
        try {
          await api(`/wiki/${id}`, { method: 'DELETE' });
          showToast(t('toast_wiki_page_deleted'), 'success');
          location.hash = '#/wiki';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    load();
  }

  async function renderWiki(param) {
    if (param && /^\d+$/.test(param)) return renderWikiPage(param);
    return renderWikiList();
  }

  async function renderExpenses() {
    appEl.innerHTML = `
      <div class="view-header">
        <h1>${icon('creditCard')} ${t('nav_expenses')}</h1>
        <p class="hint">${t('expenses_hint')}</p>
      </div>
      <div class="two-col">
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${icon('plus')} ${t('expense_new_title')}</h3>
          <form id="newExpenseForm" class="form-grid" style="max-width:none">
            <div class="field"><label for="expenseDescription">${t('expense_field_description')}</label><input id="expenseDescription" required maxlength="500" /></div>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
              <div class="field" style="flex:1 1 8rem"><label for="expenseAmount">${t('expense_field_amount')}</label><input id="expenseAmount" type="number" min="0.01" step="0.01" required /></div>
              <div class="field" style="flex:1 1 9rem"><label for="expenseDate">${t('expense_field_date')}</label><input id="expenseDate" type="date" required /></div>
            </div>
            <div class="field">
              <label for="expenseCategory">${t('expense_field_category')}</label>
              <select id="expenseCategory">
                ${Object.entries(expenseCategoryLabels()).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
            </div>
            <p class="error-text" id="expenseFormError"></p>
            <button class="btn btn-sm" type="submit">${t('expense_submit_btn')}</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title" style="margin-top:0">${t('expense_mine_title')}</h3>
          <div id="expenseMineWrap" class="card-list spinner-row">${t('loading')}</div>
        </div>
      </div>
      ${canReviewExpenses() ? `
      <div class="card" style="margin-top:1rem">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.6rem">
          <h3 class="section-title" style="margin:0">${t('expense_team_title')}</h3>
          <select id="expenseTeamStatusFilter">
            <option value="pending" selected>${expenseStatusLabels().pending}</option>
            <option value="">${t('filter_all_statuses')}</option>
            <option value="approved">${expenseStatusLabels().approved}</option>
            <option value="rejected">${expenseStatusLabels().rejected}</option>
          </select>
        </div>
        <div id="expenseTeamWrap" class="card-list spinner-row">${t('loading')}</div>
      </div>` : ''}
    `;

    function expenseCardHtml(r, opts = {}) {
      return `
        <div class="card leave-card">
          <div class="leave-card-main">
            <h3>${opts.showUser ? `${escapeHtml(r.user_name)} · ` : ''}${escapeHtml(r.description)}</h3>
            <p class="hint">${Number(r.amount).toFixed(2)} € · ${expenseCategoryLabels()[r.category] || r.category} · ${formatDate(r.expense_date)}</p>
            ${r.review_note ? `<p class="hint">${t('expense_review_note_label')}: ${escapeHtml(r.review_note)}</p>` : ''}
          </div>
          <div class="leave-card-side">
            <span class="badge badge-${r.status}">${expenseStatusLabels()[r.status] || r.status}</span>
            ${opts.canCancel && r.status === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm expenseCancelBtn" data-id="${r.id}">${t('expense_cancel_btn')}</button>` : ''}
            ${opts.canReview && r.status === 'pending' ? `
              <div style="display:flex; gap:0.4rem;">
                <button type="button" class="btn btn-sm expenseApproveBtn" data-id="${r.id}">${t('expense_approve_btn')}</button>
                <button type="button" class="btn btn-ghost btn-sm expenseRejectBtn" data-id="${r.id}">${t('expense_reject_btn')}</button>
              </div>` : ''}
          </div>
        </div>`;
    }

    async function loadExpenseMine() {
      const wrap = document.getElementById('expenseMineWrap');
      wrap.className = 'card-list spinner-row';
      wrap.textContent = t('loading');
      try {
        const { reports } = await api('/expenses');
        wrap.className = 'card-list';
        wrap.innerHTML = reports.length ? reports.map((r) => expenseCardHtml(r, { canCancel: true })).join('') : `<p class="hint">${t('expense_none_found')}</p>`;
        wrap.querySelectorAll('.expenseCancelBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('confirm_cancel_expense'))) return;
            try {
              await api(`/expenses/${btn.dataset.id}`, { method: 'DELETE' });
              showToast(t('toast_expense_cancelled'), 'success');
              loadExpenseMine();
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

    async function loadExpenseTeam() {
      const wrap = document.getElementById('expenseTeamWrap');
      if (!wrap) return;
      const statusFilter = document.getElementById('expenseTeamStatusFilter');
      wrap.className = 'card-list spinner-row';
      wrap.textContent = t('loading');
      try {
        const params = new URLSearchParams();
        if (statusFilter.value) params.set('status', statusFilter.value);
        const { reports } = await api(`/expenses/team?${params.toString()}`);
        wrap.className = 'card-list';
        wrap.innerHTML = reports.length ? reports.map((r) => expenseCardHtml(r, { showUser: true, canReview: true })).join('') : `<p class="hint">${t('expense_none_found')}</p>`;
        wrap.querySelectorAll('.expenseApproveBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/expenses/${btn.dataset.id}/status`, { method: 'PATCH', body: { status: 'approved' } });
              showToast(t('toast_expense_approved'), 'success');
              loadExpenseTeam();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
        wrap.querySelectorAll('.expenseRejectBtn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api(`/expenses/${btn.dataset.id}/status`, { method: 'PATCH', body: { status: 'rejected' } });
              showToast(t('toast_expense_rejected'), 'success');
              loadExpenseTeam();
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

    guardForm(document.getElementById('newExpenseForm'), async () => {
      const errEl = document.getElementById('expenseFormError');
      errEl.textContent = '';
      try {
        await api('/expenses', {
          method: 'POST',
          body: {
            description: document.getElementById('expenseDescription').value,
            amount: document.getElementById('expenseAmount').value,
            expenseDate: document.getElementById('expenseDate').value,
            category: document.getElementById('expenseCategory').value,
          },
        });
        document.getElementById('newExpenseForm').reset();
        showToast(t('toast_expense_submitted'), 'success');
        loadExpenseMine();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    if (canReviewExpenses()) {
      document.getElementById('expenseTeamStatusFilter').addEventListener('change', loadExpenseTeam);
      loadExpenseTeam();
    }
    loadExpenseMine();
  }

  function renderTwoFaCard() {
    const card = document.getElementById('twoFaCard');
    if (!card) return;
    const enabled = !!(state.user && state.user.totp_enabled);
    card.innerHTML = `
      <h3 class="section-title" style="margin-top:0">${icon('shield')} ${t('twofa_settings_title')} ${enabled ? `<span class="role-tag role-tag-active">${t('twofa_enabled_badge')}</span>` : ''}</h3>
      <p class="hint">${enabled ? t('twofa_settings_hint_enabled') : t('twofa_settings_hint_disabled')}</p>
      <div id="twoFaBody"></div>`;
    const body = document.getElementById('twoFaBody');
    if (enabled) {
      body.innerHTML = `<button class="btn btn-sm btn-outline-danger" id="twoFaDisableBtn" type="button">${t('twofa_disable_button')}</button>`;
      document.getElementById('twoFaDisableBtn').addEventListener('click', () => renderTwoFaDisableForm(body));
    } else {
      body.innerHTML = `<button class="btn btn-sm" id="twoFaEnableBtn" type="button">${t('twofa_enable_button')}</button>`;
      document.getElementById('twoFaEnableBtn').addEventListener('click', () => startTwoFaSetup(body));
    }
  }

  async function startTwoFaSetup(body) {
    try {
      const { secret, otpauth_uri: otpauthUri } = await api('/auth/2fa/setup', { method: 'POST' });
      body.innerHTML = `
        <div class="field">
          <label>${t('twofa_secret_label')}</label>
          <code class="totp-secret-code">${escapeHtml(secret)}</code>
          <p class="hint">${t('twofa_secret_hint')}</p>
        </div>
        <form id="twoFaConfirmForm" class="form-grid" style="max-width:none">
          <div class="field">
            <label for="twoFaConfirmCode">${t('twofa_confirm_code_label')}</label>
            <input id="twoFaConfirmCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" required autocomplete="one-time-code" />
          </div>
          <p class="error-text" id="twoFaConfirmError"></p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" type="submit">${t('twofa_confirm_button')}</button>
            <button class="btn btn-sm btn-ghost" type="button" id="twoFaCancelBtn">${t('twofa_cancel_button')}</button>
          </div>
        </form>`;
      body.querySelector('.totp-secret-code').title = otpauthUri;
      document.getElementById('twoFaCancelBtn').addEventListener('click', () => renderTwoFaCard());
      guardForm(document.getElementById('twoFaConfirmForm'), async () => {
        const errEl = document.getElementById('twoFaConfirmError');
        errEl.textContent = '';
        const code = document.getElementById('twoFaConfirmCode').value.trim();
        try {
          await api('/auth/2fa/verify', { method: 'POST', body: { code } });
          state.user.totp_enabled = true;
          showToast(t('toast_2fa_enabled'), 'success');
          renderTwoFaCard();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderTwoFaDisableForm(body) {
    body.innerHTML = `
      <form id="twoFaDisableForm" class="form-grid" style="max-width:none">
        <div class="field">
          <label for="twoFaDisablePassword">${t('twofa_disable_password_label')}</label>
          <input id="twoFaDisablePassword" type="password" required autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="twoFaDisableCode">${t('twofa_disable_code_label')}</label>
          <input id="twoFaDisableCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" required autocomplete="one-time-code" />
        </div>
        <p class="error-text" id="twoFaDisableError"></p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-outline-danger" type="submit">${t('twofa_disable_confirm_button')}</button>
          <button class="btn btn-sm btn-ghost" type="button" id="twoFaDisableCancelBtn">${t('twofa_cancel_button')}</button>
        </div>
      </form>`;
    document.getElementById('twoFaDisableCancelBtn').addEventListener('click', () => renderTwoFaCard());
    guardForm(document.getElementById('twoFaDisableForm'), async () => {
      const errEl = document.getElementById('twoFaDisableError');
      errEl.textContent = '';
      const currentPassword = document.getElementById('twoFaDisablePassword').value;
      const code = document.getElementById('twoFaDisableCode').value.trim();
      try {
        await api('/auth/2fa/disable', { method: 'POST', body: { currentPassword, code } });
        state.user.totp_enabled = false;
        showToast(t('toast_2fa_disabled'), 'success');
        renderTwoFaCard();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  function friendlyDeviceLabel(userAgent) {
    if (!userAgent) return '—';
    const browser = /Edg\//.test(userAgent) ? 'Edge'
      : /OPR\//.test(userAgent) ? 'Opera'
      : /Chrome\//.test(userAgent) ? 'Chrome'
      : /Firefox\//.test(userAgent) ? 'Firefox'
      : /Safari\//.test(userAgent) ? 'Safari'
      : 'Browser';
    const os = /Windows/.test(userAgent) ? 'Windows'
      : /Mac OS X/.test(userAgent) ? 'macOS'
      : /Android/.test(userAgent) ? 'Android'
      : /iPhone|iPad/.test(userAgent) ? 'iOS'
      : /Linux/.test(userAgent) ? 'Linux'
      : '';
    return os ? `${browser} · ${os}` : browser;
  }

  async function loadSessionsCard() {
    const card = document.getElementById('sessionsCard');
    if (!card) return;
    try {
      const { sessions } = await api('/auth/sessions');
      card.innerHTML = `
        <h3 class="section-title" style="margin-top:0">${icon('monitor')} ${t('sessions_title')}</h3>
        <p class="hint">${t('sessions_hint')}</p>
        ${sessions.length ? `<ul class="session-list">${sessions.map((s) => `
          <li class="session-item" data-session-id="${escapeHtml(s.id)}">
            <div>
              <p><strong>${escapeHtml(friendlyDeviceLabel(s.user_agent))}</strong>${s.current ? ` <span class="role-tag role-tag-active">${t('sessions_current_badge')}</span>` : ''}</p>
              <p class="hint">${escapeHtml(s.ip_address || '')} · ${t('sessions_last_active_label')}: ${formatDate(s.last_active_at)}</p>
            </div>
            ${s.current ? '' : `<button class="btn btn-sm btn-outline-danger session-revoke-btn" type="button">${t('sessions_revoke_button')}</button>`}
          </li>`).join('')}</ul>` : `<p class="hint">${t('sessions_empty')}</p>`}
        ${sessions.length > 1 ? `<button class="btn btn-sm btn-ghost" id="revokeOtherSessionsBtn" type="button">${t('sessions_revoke_others_button')}</button>` : ''}`;

      card.querySelectorAll('.session-revoke-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const li = btn.closest('.session-item');
          const sessionId = li.dataset.sessionId;
          try {
            await api(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
            showToast(t('toast_session_revoked'), 'success');
            loadSessionsCard();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
      const revokeOthersBtn = document.getElementById('revokeOtherSessionsBtn');
      if (revokeOthersBtn) {
        revokeOthersBtn.addEventListener('click', async () => {
          try {
            await api('/auth/sessions/revoke-others', { method: 'POST' });
            showToast(t('toast_sessions_revoked_others'), 'success');
            loadSessionsCard();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    } catch {
      card.innerHTML = '';
    }
  }

  function renderSettings() {
    const currentLang = getLang();
    const currentAccent = getAccent();
    const currentTheme = getTheme();
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
          <p class="hint">${t('theme_mode_hint')}</p>
          <div class="theme-mode-switch" role="group" aria-label="${t('theme_mode_title')}">
            ${THEME_MODES.map((mode) => `
              <button type="button" class="theme-mode-btn ${currentTheme === mode ? 'active' : ''}" data-theme-mode="${mode}">
                ${icon(mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'monitor')}
                <span>${t(`theme_mode_${mode}`)}</span>
              </button>
            `).join('')}
          </div>
          <p class="hint" style="margin-top:1.2rem">${t('personalization_hint')}</p>
          <div class="accent-swatches">
            ${Object.entries(ACCENT_PRESETS).map(([key, preset]) => `
              <button type="button" class="accent-swatch ${currentAccent === key ? 'active' : ''}" data-accent="${key}" style="background:${preset.light.primary}" title="${escapeHtml(preset.label)}"></button>
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
            <div style="display:flex;align-items:center;gap:0.85rem;flex-wrap:wrap">
              <img id="orgLogoPreview" src="img/icon.svg" alt="" width="44" height="44" style="border-radius:8px;object-fit:contain;background:var(--surface-alt)" />
              <input id="orgLogoInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:100%" />
              <button type="button" id="orgLogoRemoveBtn" class="btn btn-sm btn-outline-danger" hidden>${t('btn_remove_logo')}</button>
            </div>
            <span class="hint">${t('logo_hint')}</span>
          </div>
          <p class="error-text" id="orgLogoError"></p>
          <div class="divider"></div>
          <label class="checkbox-field">
            <input type="checkbox" id="flexibleTimeEntryToggle" />
            ${t('flexible_time_entry_label')}
          </label>
          <p class="hint">${t('flexible_time_entry_hint')}</p>
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
            <div style="display:flex;gap:0.6rem">
              <button class="btn btn-sm" type="submit">${t('btn_save_template')}</button>
              <button type="button" id="inviteTemplateResetBtn" class="btn btn-sm btn-ghost">${t('btn_reset_default')}</button>
            </div>
          </form>
          <p class="error-text" id="inviteTemplateError"></p>
          <div class="card" style="background:var(--surface-alt);margin-top:1rem">
            <h4 class="section-title" style="margin-top:0;font-size:0.85rem">${t('default_template_title')}</h4>
            <div class="field"><label>${t('field_subject')}</label><p id="inviteDefaultSubject" style="white-space:pre-wrap"></p></div>
            <div class="field"><label>${t('field_email_body')}</label><p id="inviteDefaultBody" style="white-space:pre-wrap"></p></div>
          </div>
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

    document.querySelectorAll('.theme-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.themeMode);
        document.querySelectorAll('.theme-mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        showToast(t('toast_theme_updated'), 'success');
      });
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
      api('/settings').then(({ orgName, orgLogo, flexibleTimeEntry }) => {
        document.getElementById('orgName').value = orgName;
        if (orgLogo) {
          orgLogoPreview.src = orgLogo;
          orgLogoRemoveBtn.hidden = false;
        }
        document.getElementById('flexibleTimeEntryToggle').checked = !!flexibleTimeEntry;
      }).catch(() => {});

      document.getElementById('flexibleTimeEntryToggle').addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        try {
          await api('/settings/flexible-time-entry', { method: 'PATCH', body: { enabled } });
          showToast(enabled ? t('toast_flexible_time_entry_enabled') : t('toast_flexible_time_entry_disabled'), 'success');
        } catch (err) {
          e.target.checked = !enabled;
          showToast(err.message, 'error');
        }
      });

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
      let inviteDefaults = { it: { subject: '', body: '' }, en: { subject: '', body: '' } };
      let inviteTemplateLocale = 'it';

      function renderDefaultPreview() {
        const def = inviteDefaults[inviteTemplateLocale] || { subject: '', body: '' };
        document.getElementById('inviteDefaultSubject').textContent = def.subject;
        document.getElementById('inviteDefaultBody').textContent = def.body;
      }

      api('/settings/invite-template').then((data) => {
        inviteTemplates = data;
        inviteDefaults = data.defaults || inviteDefaults;
        document.getElementById('inviteSubject').value = inviteTemplates.it.subject;
        document.getElementById('inviteBody').value = inviteTemplates.it.body;
        renderDefaultPreview();
      }).catch(() => {});

      document.querySelectorAll('#inviteTemplateTabs .tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#inviteTemplateTabs .tab-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          inviteTemplateLocale = btn.dataset.locale;
          document.getElementById('inviteSubject').value = inviteTemplates[inviteTemplateLocale].subject;
          document.getElementById('inviteBody').value = inviteTemplates[inviteTemplateLocale].body;
          renderDefaultPreview();
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

      document.getElementById('inviteTemplateResetBtn').addEventListener('click', async () => {
        const errEl = document.getElementById('inviteTemplateError');
        errEl.textContent = '';
        try {
          await api('/settings/invite-template', { method: 'PATCH', body: { locale: inviteTemplateLocale, subject: '', body: '' } });
          inviteTemplates[inviteTemplateLocale] = { subject: '', body: '' };
          document.getElementById('inviteSubject').value = '';
          document.getElementById('inviteBody').value = '';
          showToast(t('toast_template_reset'), 'success');
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

  applyTheme(getTheme());
  applyMotion(getMotionPref());
  applyChromeTranslations();
  updateChrome();
  loadOrgBranding();
  route();

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getTheme() === 'auto') applyTheme('auto');
    });
  }
})();
