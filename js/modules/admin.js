/**
 * 1st Petaling Jaya Boys' Brigade Portal - Admin Console Master Controller
 * File: js/modules/admin.js
 *
 * Extracts back-office navigation, subtabs, and admin CRUD handlers across
 * members, orders, tasks, and configs from index.html into a dedicated controller module.
 */

(function(global) {
  'use strict';

  // ── Configuration & Constants ─────────────────────────────────────────────
  var ADMIN_SECTIONS = [
    'members',
    'orders',
    'uniform',
    'tasks',
    'announcements',
    'badges',
    'gallery',
    'attendance',
    'resources',
    'calendar'
  ];

  var RANK_ORDER = [
    'Pre-Junior',
    'Junior',
    'Assistance Junior Leader',
    'Assistant Junior Leader',
    'Junior Leader',
    'Chief Junior Leader',
    'Recruit',
    'Private',
    'Lance Corporal',
    'Corporal',
    'Sergeant',
    'Staff Sergeant',
    'Instructor',
    'Warrant Officer',
    'Lieutenant',
    'Honarary Captain',
    'Honorary Captain',
    'Captain'
  ];

  var DEFAULT_DEPT_CONFIG = {
    secretariat: { label: 'Secretariat', color: '#ce93d8', cls: 'dept-secretariat', prefix: 'SEC' },
    logistics:   { label: 'Logistics',   color: '#42a5f5', cls: 'dept-logistics',   prefix: 'LOG' },
    media:       { label: 'Media',       color: '#ffb74d', cls: 'dept-media',       prefix: 'MED' },
    hq:          { label: 'HQ',          color: '#10b981', cls: 'dept-hq',          prefix: 'HQ'  },
    officers:    { label: 'Officers',    color: '#f59e0b', cls: 'dept-officers',    prefix: 'OFF' }
  };

  // ── Internal State ────────────────────────────────────────────────────────
  var _adminSortBy     = 'name';
  var _adminSortDir    = 'asc'; // 'asc' | 'desc'
  var _adminMembers       = {};
  var _adminPresenceMap   = {};
  var _adminTaskFilter = 'all';
  var _allAdminTasks   = [];
  var _adminMembersViewMode = (typeof localStorage !== 'undefined' && localStorage.getItem('bb_admin_members_view')) || 'table';
  var _adminMemberEditMode = false;
  var _adminMembersSubView = 'members'; // 'members' | 'blocked_emails'
  var _activeFilterCol = null;
  var _selectedMemberIcs = new Set();
  var _isGlobalFilterOpen = false;
  var _isGlobalSortOpen = false;
  var _isBulkActionsMenuOpen = false;
  var _lastFilteredMembers = [];
  var _adminMemberFilters = {
    section: '',
    rank: '',
    squad: '',
    dept: '',
    status: '',
    consent: '',
    nameSearch: ''
  };

  function setAdminMembersViewMode(mode) {
    _adminMembersViewMode = (mode === 'cards') ? 'cards' : 'table';
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('bb_admin_members_view', _adminMembersViewMode); } catch (_) {}
    }
    return renderAdminList();
  }

  function getAdminMembersViewMode() {
    return _adminMembersViewMode;
  }

  function toggleAdminMemberEditMode() {
    _adminMemberEditMode = !_adminMemberEditMode;
    if (typeof showToast === 'function') {
      if (_adminMemberEditMode) {
        showToast('Edit Mode Active: You can edit member details directly in table cells.', 'info');
      } else {
        showToast('View Mode (Safe): Direct cell editing disabled.', 'info');
      }
    }
    return renderAdminList();
  }

  function getAdminMemberEditMode() {
    return _adminMemberEditMode;
  }

  function toggleColumnFilterMenu(col, ev) {
    if (ev) {
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    }
    if (_activeFilterCol === col) {
      _activeFilterCol = null;
    } else {
      _activeFilterCol = col;
    }
    return renderAdminList();
  }

  function closeColumnFilterMenu() {
    if (_activeFilterCol !== null) {
      _activeFilterCol = null;
      return renderAdminList();
    }
  }

  function clearColumnFilter(col) {
    if (col === 'member' || col === 'name') {
      _adminMemberFilters.nameSearch = '';
    } else if (col in _adminMemberFilters) {
      _adminMemberFilters[col] = '';
    }
    return closeColumnFilterMenu();
  }

  function setColumnSort(colKey, dir) {
    return setAdminSort(colKey, dir);
  }

  function setAdminMemberFilter(field, value) {
    if (_adminMemberFilters && field in _adminMemberFilters) {
      _adminMemberFilters[field] = value || '';
    }
    closeColumnFilterMenu();
    return renderAdminList();
  }

  function resetAdminMemberFilters() {
    _adminMemberFilters = {
      section: '',
      rank: '',
      squad: '',
      dept: '',
      status: '',
      consent: '',
      nameSearch: '',
      emailSearch: ''
    };
    _adminSortBy = 'name';
    _adminSortDir = 'asc';
    _activeFilterCol = null;
    if (typeof document !== 'undefined') {
      var sInput = document.getElementById('admin-search');
      if (sInput) sInput.value = '';
    }
    return renderAdminList();
  }

  // ── CRM MEMBER TABLE & ROW SELECTION SYSTEM ───────────────────────────────────
  function getColumnHeaderIconSvg(colKey) {
    switch (colKey) {
      case 'member':
      case 'name':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      case 'email':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
      case 'section':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
      case 'rank':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>';
      case 'squad':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
      case 'dept':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
      case 'age':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      case 'dob':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      case 'status':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      case 'consent':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>';
      case 'actions':
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
      default:
        return '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    }
  }

  function renderColumnHeader(colKey, label, iconSvg, sortKey, filterType, membersList) {
    if (typeof iconSvg === 'string' && !iconSvg.includes('<svg') && !iconSvg.includes('<span')) {
      membersList = filterType;
      filterType = sortKey;
      sortKey = iconSvg;
      iconSvg = getColumnHeaderIconSvg(colKey);
    } else if (!iconSvg) {
      iconSvg = getColumnHeaderIconSvg(colKey);
    }

    var isFiltered = !!_adminMemberFilters[colKey] || (colKey === 'member' && !!_adminMemberFilters.nameSearch) || (colKey === 'name' && !!_adminMemberFilters.nameSearch) || (colKey === 'email' && !!_adminMemberFilters.emailSearch);
    var btnClass = 'sheets-filter-btn crm-th-chevron' + (isFiltered ? ' is-filtered' : '') + (_activeFilterCol === colKey ? ' is-active' : '');

    var popoverHtml = '';
    if (_activeFilterCol === colKey) {
      popoverHtml = renderColumnPopover(colKey, label, sortKey || colKey, filterType, membersList);
    }

    return '<th class="sheets-th crm-th" data-col="' + colKey + '">' +
      '<div class="sheets-th-content crm-th-content" onclick="toggleColumnFilterMenu(\'' + colKey + '\', event)" title="Filter &amp; Sort ' + label + '">' +
        (iconSvg ? '<span class="crm-th-icon">' + iconSvg + '</span>' : '') +
        '<span class="sheets-th-label crm-th-label">' + label + '</span>' +
        '<button type="button" class="' + btnClass + '" onclick="toggleColumnFilterMenu(\'' + colKey + '\', event)" aria-label="Filter &amp; Sort ' + label + '">' +
          '<svg class="sheets-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
            '<polyline points="6 9 12 15 18 9"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      popoverHtml +
    '</th>';
  }

  function renderColumnPopover(colKey, label, sortKey, filterType) {
    var ascLabel = 'Sort A \u2192 Z';
    var descLabel = 'Sort Z \u2192 A';
    if (sortKey === 'age') {
      ascLabel = 'Sort Youngest to Oldest';
      descLabel = 'Sort Oldest to Youngest';
    } else if (sortKey === 'status') {
      ascLabel = 'Sort Verified First';
      descLabel = 'Sort Not Verified First';
    }

    var sortBtns =
      '<div class="sfp-section">' +
        '<div class="sfp-section-label">Sort</div>' +
        '<button type="button" class="sfp-btn' + (_adminSortBy === sortKey && _adminSortDir === 'asc' ? ' is-active' : '') + '" onclick="setAdminSort(\'' + sortKey + '\', \'asc\')">' +
          '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg> \u2191 ' + ascLabel +
        '</button>' +
        '<button type="button" class="sfp-btn' + (_adminSortBy === sortKey && _adminSortDir === 'desc' ? ' is-active' : '') + '" onclick="setAdminSort(\'' + sortKey + '\', \'desc\')">' +
          '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M19 12l-7 7-7-7"/></svg> \u2193 ' + descLabel +
        '</button>' +
        (sortKey === 'rank' ? '<button type="button" class="sfp-btn' + (_adminSortBy === 'rank' && _adminSortDir === 'asc' ? ' is-active' : '') + '" onclick="setAdminSort(\'rank\', \'asc\')"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Sort by BB Rank Order</button>' : '') +
      '</div>';

    var filterBody = '';
    if (filterType === 'search') {
      var curVal = (colKey === 'email') ? (_adminMemberFilters.emailSearch || '') : (_adminMemberFilters.nameSearch || '');
      filterBody =
        '<div class="sfp-section">' +
          '<div class="sfp-section-label">Filter by ' + label + '</div>' +
          '<div class="sfp-search-box">' +
            '<input type="text" class="sfp-input" placeholder="Type to filter..." value="' + ((typeof escapeHtml === 'function') ? escapeHtml(curVal) : curVal) + '" oninput="setAdminMemberFilter(\'' + (colKey === 'email' ? 'emailSearch' : 'nameSearch') + '\', this.value)" autofocus />' +
          '</div>' +
        '</div>';
    } else if (filterType === 'options') {
      var opts = [];
      if (colKey === 'section') {
        opts = ['Senior', 'Junior', 'Pre-Junior', 'Officer'];
      } else if (colKey === 'rank') {
        opts = ['Captain', 'Lieutenant', 'Staff Sergeant', 'Sergeant', 'Corporal', 'Lance Corporal', 'Private', 'Recruit', 'Pre-Junior', 'Junior'];
      } else if (colKey === 'squad') {
        opts = ['Alpha Platoon', 'Bravo Platoon', 'Charlie Platoon', 'Delta Platoon', 'Echo Platoon', 'Foxtrot Platoon', 'Golf Platoon', 'Hotel Platoon', 'India Platoon', 'Zulu Platoon', 'Papa Platoon', 'Officers'];
      } else if (colKey === 'dept') {
        opts = [
          { val: 'secretariat', label: 'Secretariat' },
          { val: 'logistics', label: 'Logistics' },
          { val: 'media', label: 'Media' },
          { val: 'hq', label: 'HQ' },
          { val: 'officers', label: 'Officers' },
          { val: 'none', label: 'No Department' }
        ];
      } else if (colKey === 'status') {
        opts = [
          { val: 'verified', label: 'Verified' },
          { val: 'processing', label: 'Processing' },
          { val: 'rejected', label: 'Rejected' },
          { val: 'not_verified', label: 'Not Verified' }
        ];
      } else if (colKey === 'consent') {
        opts = [
          { val: 'ok', label: 'Consent OK' },
          { val: 'pending', label: 'Consent Pending' },
          { val: 'no_media', label: 'No Media' }
        ];
      }

      var curFilterVal = _adminMemberFilters[colKey] || '';
      var listHtml = '<div class="sfp-option' + (!curFilterVal ? ' is-selected' : '') + '" onclick="setAdminMemberFilter(\'' + colKey + '\', \'\')"><span>(All)</span>' + (!curFilterVal ? '<span>\u2713</span>' : '') + '</div>';

      opts.forEach(function(opt) {
        var val = typeof opt === 'object' ? opt.val : opt;
        var lbl = typeof opt === 'object' ? opt.label : opt;
        var isSel = (curFilterVal.toLowerCase() === val.toLowerCase());
        listHtml += '<div class="sfp-option' + (isSel ? ' is-selected' : '') + '" onclick="setAdminMemberFilter(\'' + colKey + '\', \'' + val + '\')">' +
          '<span>' + lbl + '</span>' +
          (isSel ? '<span>\u2713</span>' : '') +
        '</div>';
      });

      filterBody =
        '<div class="sfp-section">' +
          '<div class="sfp-section-label">Filter by Value</div>' +
          '<div class="sfp-options-list">' + listHtml + '</div>' +
        '</div>';
    }

    var isFiltered = !!_adminMemberFilters[colKey] || (colKey === 'member' && !!_adminMemberFilters.nameSearch) || (colKey === 'name' && !!_adminMemberFilters.nameSearch) || (colKey === 'email' && !!_adminMemberFilters.emailSearch);

    return '<div class="sheets-filter-popover" onclick="event.stopPropagation();">' +
      '<div class="sfp-header">' +
        '<span class="sfp-title">Filter &amp; Sort: ' + label + '</span>' +
        '<button type="button" class="sfp-close-btn" onclick="closeColumnFilterMenu()" aria-label="Close">\u2715</button>' +
      '</div>' +
      sortBtns +
      '<div class="sfp-divider"></div>' +
      filterBody +
      (isFiltered ? '<div class="sfp-footer"><button type="button" class="sfp-clear-btn" onclick="clearColumnFilter(\'' + colKey + '\')">Clear Filter</button></div>' : '') +
    '</div>';
  }

  // Rank Insignia SVG Stripes (1, 2, 3, 4 stripes ˅)
  function getRankInsigniaSvg(rank) {
    var r = (rank || '').trim().toLowerCase();
    // Lance Corporal: 1 stripe ˅
    if (r === 'lance corporal' || r === 'lcpl' || r === 'l/cpl') {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="1 stripe (Lance Corporal)"><path d="M3 6l5 5 5-5"/></svg>';
    }
    // Corporal: 2 stripe ˅ on top of ˅
    if (r === 'corporal' || r === 'cpl') {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="2 stripes (Corporal)"><path d="M3 4l5 4 5-4"/><path d="M3 9l5 4 5-4"/></svg>';
    }
    // Sergeant: 3 stripe ˅ on top of ˅
    if (r === 'sergeant' || r === 'sgt') {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="3 stripes (Sergeant)"><path d="M3 3l5 3.5 5-3.5"/><path d="M3 7l5 3.5 5-3.5"/><path d="M3 11l5 3.5 5-3.5"/></svg>';
    }
    // Staff Sergeant: 4 stripe ˅ on top of ˅
    if (r === 'staff sergeant' || r === 's/sgt' || r === 'ssgt') {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 18" width="14" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="4 stripes (Staff Sergeant)"><path d="M3 2l5 3 5-3"/><path d="M3 6l5 3 5-3"/><path d="M3 10l5 3 5-3"/><path d="M3 14l5 3 5-3"/></svg>';
    }
    // Warrant Officer / Officer ranks (Lieutenant, Captain, Chaplain, etc.)
    if (r.includes('warrant') || r.includes('officer') || r.includes('lieutenant') || r.includes('captain') || r.includes('chaplain')) {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="Officer Star"><polygon points="8 2 10 6 14 7 11 10 12 14 8 12 4 14 5 10 2 7 6 6 8 2"/></svg>';
    }
    // Junior Leader ranks
    if (r.includes('junior leader')) {
      return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--gold,#f5c542);" title="Junior Leader Chevron"><path d="M3 7l5 5 5-5"/></svg>';
    }
    // Recruit / Private / others
    return '<svg class="rank-stripe-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;color:var(--text-muted);" title="Rank Pip"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>';
  }

  // Verification Status Resolution & Badge Rendering (No Dropdown in Table)
  function getMemberVerificationStatus(m) {
    if (!m) return 'verified';
    var v = (m.verification_status || m.v_status || '').toLowerCase();
    if (v === 'verified' || v === 'processing' || v === 'rejected' || v === 'not_verified' || v === 'not verified') {
      return v === 'not verified' ? 'not_verified' : v;
    }
    return 'verified';
  }

  function renderStatusBadge(statusVal) {
    var rawSt = (statusVal || 'verified').toLowerCase().replace(/\s+/g, '_');
    var st = rawSt;
    if (st === 'pending' || st === 'in_progress') st = 'processing';
    if (st === 'unverified' || st === 'none' || !st) st = 'not_verified';

    var cls = 'status-verified';
    var label = 'Verified';
    var icon = '<svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    if (st === 'processing') {
      cls = 'status-processing';
      label = 'Processing';
      icon = '<svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    } else if (st === 'rejected') {
      cls = 'status-rejected';
      label = 'Rejected';
      icon = '<svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (st === 'not_verified') {
      cls = 'status-not-verified';
      label = 'Not Verified';
      icon = '<svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }

    return '<span class="adm-status-badge ' + cls + '">' +
      icon +
      '<span>' + label + '</span>' +
    '</span>';
  }

  async function updateMemberVerificationStatus(ic, val) {
    if (!ic) return;
    var client = getSupabaseClient();
    var cleanVal = (val || 'verified').toLowerCase();

    if (_adminMembers && _adminMembers[ic]) {
      _adminMembers[ic].verification_status = cleanVal;
    }
    if (Array.isArray(_adminMembersCache)) {
      _adminMembersCache.forEach(function(m) {
        if (m.ic === ic) m.verification_status = cleanVal;
      });
    }

    if (client) {
      try {
        if (client.patch) {
          await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), { verification_status: cleanVal });
        } else if (client.req) {
          await client.req('PATCH', 'bb_members?ic=eq.' + encodeURIComponent(ic), { verification_status: cleanVal });
        }
      } catch (e) {
        console.warn('verification_status column not yet in bb_members schema, storing in bb_config:', e);
        try {
          var cfgRes = await client.get('bb_config?key=eq.bb_verification_statuses&select=value');
          var vMap = (cfgRes && cfgRes.length && cfgRes[0].value) ? JSON.parse(cfgRes[0].value) : {};
          vMap[ic] = cleanVal;
          await client.patch('bb_config?key=eq.bb_verification_statuses', { value: JSON.stringify(vMap) });
        } catch (_) {}
      }
    }

    if (typeof showToast === 'function') {
      showToast('Updated status to ' + cleanVal.replace('_', ' '), 'success');
    }
    await renderAdminList();
  }

  // Selection & Bulk Actions
  function toggleSelectAllMembers(checked) {
    if (checked) {
      if (Array.isArray(_lastFilteredMembers)) {
        _lastFilteredMembers.forEach(function(m) {
          if (m && m.ic) _selectedMemberIcs.add(m.ic);
        });
      }
    } else {
      _selectedMemberIcs.clear();
    }
    updateSelectionUI();
  }

  function toggleSelectMemberRow(ic, checked) {
    if (checked) {
      _selectedMemberIcs.add(ic);
    } else {
      _selectedMemberIcs.delete(ic);
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    if (typeof document === 'undefined') return;
    var masterChk = document.getElementById('adm-master-chk');
    var totalFiltered = (_lastFilteredMembers && _lastFilteredMembers.length) || 0;
    var selCount = _selectedMemberIcs.size;

    if (masterChk) {
      masterChk.checked = (totalFiltered > 0 && selCount === totalFiltered);
      masterChk.indeterminate = (selCount > 0 && selCount < totalFiltered);
    }

    var tableEl = document.querySelector('.admin-members-table');
    if (tableEl) {
      tableEl.querySelectorAll('tbody tr').forEach(function(tr) {
        var rowIc = tr.getAttribute('data-ic');
        if (!rowIc) {
          var chk = tr.querySelector('.adm-row-chk');
          if (chk) rowIc = chk.getAttribute('data-ic');
        }
        if (rowIc) {
          var isSel = _selectedMemberIcs.has(rowIc);
          if (isSel) tr.classList.add('is-selected');
          else tr.classList.remove('is-selected');
          var chkInput = tr.querySelector('.adm-row-chk');
          if (chkInput) chkInput.checked = isSel;
        }
      });
    }

    renderRowActionsButton();
  }

  function renderRowActionsButton() {
    if (typeof document === 'undefined') return;
    var slot = document.querySelector('.adm-topbar-row-actions-slot');
    if (!slot) return;

    var selCount = _selectedMemberIcs.size;
    if (selCount === 0) {
      slot.innerHTML = '';
      _isBulkActionsMenuOpen = false;
      return;
    }

    slot.innerHTML =
      '<div class="adm-row-actions-wrap" style="position:relative;display:inline-block;">' +
        '<button type="button" class="portal-btn adm-row-actions-btn" onclick="toggleBulkActionsMenu(event)" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-primary);font-size:12px;font-weight:700;cursor:pointer;" title="Actions for selected rows">' +
          '<span>' + selCount + ' Row actions</span>' +
          '<svg class="ui-icon-xs" style="width:10px;height:10px;opacity:0.8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button>' +
        (_isBulkActionsMenuOpen
          ? '<div class="adm-row-actions-menu" onclick="event.stopPropagation();" style="position:absolute;top:calc(100% + 4px);right:0;background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;box-shadow:var(--shadow-elevated);z-index:9999;min-width:180px;padding:6px;display:flex;flex-direction:column;gap:4px;">' +
              '<button type="button" class="adm-action-item" onclick="bulkBlockSelectedMembers()" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:none;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;text-align:left;width:100%;">' +
                '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
                '<span>Block selected</span>' +
              '</button>' +
              '<button type="button" class="adm-action-item" onclick="bulkDeleteSelectedMembers()" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:none;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;text-align:left;width:100%;">' +
                '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                '<span>Delete selected</span>' +
              '</button>' +
            '</div>'
          : '') +
      '</div>';
  }

  function toggleBulkActionsMenu(ev) {
    if (ev) {
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    }
    _isBulkActionsMenuOpen = !_isBulkActionsMenuOpen;
    renderRowActionsButton();
  }

  async function bulkBlockSelectedMembers() {
    var count = _selectedMemberIcs.size;
    if (count === 0) return;
    _isBulkActionsMenuOpen = false;
    renderRowActionsButton();

    var confirmed = false;
    if (typeof showConfirmModal === 'function') {
      confirmed = await showConfirmModal('Block ' + count + ' Selected Accounts?', 'Are you sure you want to block ' + count + ' selected member account(s) from accessing the portal?');
    } else {
      confirmed = true;
    }
    if (!confirmed) return;

    var blockedCount = 0;
    var ics = Array.from(_selectedMemberIcs);
    for (var i = 0; i < ics.length; i++) {
      var ic = ics[i];
      var mem = (_adminMembers && _adminMembers[ic]) || { ic: ic, email: ic };
      var em = mem.email || mem.ic;
      if (em) {
        await addBlockedEmail(em, 'Bulk blocked by administrator');
        blockedCount++;
      }
    }
    _selectedMemberIcs.clear();
    if (typeof showToast === 'function') {
      showToast('Successfully blocked ' + blockedCount + ' account(s).', 'success');
    }
    return renderAdminList(true);
  }

  async function bulkDeleteSelectedMembers() {
    var count = _selectedMemberIcs.size;
    if (count === 0) return;
    _isBulkActionsMenuOpen = false;
    renderRowActionsButton();

    var confirmed = false;
    if (typeof showConfirmModal === 'function') {
      confirmed = await showConfirmModal('Delete ' + count + ' Selected Accounts?', 'Are you sure you want to permanently delete ' + count + ' selected account(s)? This action cannot be undone.');
    } else {
      confirmed = true;
    }
    if (!confirmed) return;

    var deletedCount = 0;
    var client = getSupabaseClient();
    var ics = Array.from(_selectedMemberIcs);
    for (var i = 0; i < ics.length; i++) {
      var ic = ics[i];
      try {
        if (client) {
          if (client.delete) {
            await client.delete('bb_members?ic=eq.' + encodeURIComponent(ic));
          } else if (client.req) {
            await client.req('DELETE', 'bb_members?ic=eq.' + encodeURIComponent(ic));
          }
        }
        deletedCount++;
      } catch (err) {
        console.error('bulkDeleteSelectedMembers item error:', err);
      }
    }
    _selectedMemberIcs.clear();
    if (typeof showToast === 'function') {
      showToast('Successfully deleted ' + deletedCount + ' account(s).', 'success');
    }
    return renderAdminList(true);
  }

  // Global Stackable Filters & Sort Popovers
  function toggleGlobalFilterPopover(ev) {
    if (ev) {
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    }
    _isGlobalSortOpen = false;
    _isGlobalFilterOpen = !_isGlobalFilterOpen;
    renderGlobalPopovers();
  }

  function toggleGlobalSortPopover(ev) {
    if (ev) {
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    }
    _isGlobalFilterOpen = false;
    _isGlobalSortOpen = !_isGlobalSortOpen;
    renderGlobalPopovers();
  }

  function closeGlobalPopovers() {
    if (_isGlobalFilterOpen || _isGlobalSortOpen || _isBulkActionsMenuOpen) {
      _isGlobalFilterOpen = false;
      _isGlobalSortOpen = false;
      _isBulkActionsMenuOpen = false;
      renderGlobalPopovers();
    }
  }

  function renderGlobalPopovers() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('adm-global-popover-portal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'adm-global-popover-portal';
      document.body.appendChild(container);
    }

    if (!_isGlobalFilterOpen && !_isGlobalSortOpen) {
      container.innerHTML = '';
      return;
    }

    if (_isGlobalFilterOpen) {
      var filterBtn = document.querySelector('.adm-top-filter-btn');
      var rect = filterBtn ? filterBtn.getBoundingClientRect() : { bottom: 120, left: 200 };

      container.innerHTML =
        '<div class="adm-global-filter-popover" style="position:fixed;top:' + (rect.bottom + 6) + 'px;left:' + rect.left + 'px;z-index:99999;" onclick="event.stopPropagation();">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border-card);">' +
            '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;color:var(--text-primary);">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
              '<span>Stackable Filters</span>' +
            '</div>' +
            '<button type="button" class="sfp-close-btn" onclick="toggleGlobalFilterPopover(event)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;">\u2715</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px;font-size:12px;">' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Section</label>' +
              '<select class="form-select admin-filter-select" style="width:100%;font-size:12px;padding:6px 10px;" onchange="setAdminMemberFilter(\'section\', this.value)">' +
                '<option value=""' + (!_adminMemberFilters.section ? ' selected' : '') + '>All Sections</option>' +
                '<option value="Senior"' + (_adminMemberFilters.section === 'Senior' ? ' selected' : '') + '>Senior</option>' +
                '<option value="Junior"' + (_adminMemberFilters.section === 'Junior' ? ' selected' : '') + '>Junior</option>' +
                '<option value="Pre-Junior"' + (_adminMemberFilters.section === 'Pre-Junior' ? ' selected' : '') + '>Pre-Junior</option>' +
                '<option value="Officer"' + (_adminMemberFilters.section === 'Officer' ? ' selected' : '') + '>Officer</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Rank</label>' +
              '<select class="form-select admin-filter-select" style="width:100%;font-size:12px;padding:6px 10px;" onchange="setAdminMemberFilter(\'rank\', this.value)">' +
                '<option value=""' + (!_adminMemberFilters.rank ? ' selected' : '') + '>All Ranks</option>' +
                RANK_ORDER.map(function(r) { return '<option value="' + r + '"' + (_adminMemberFilters.rank === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Platoon / Squad</label>' +
              '<select class="form-select admin-filter-select" style="width:100%;font-size:12px;padding:6px 10px;" onchange="setAdminMemberFilter(\'squad\', this.value)">' +
                '<option value=""' + (!_adminMemberFilters.squad ? ' selected' : '') + '>All Platoons / Squads</option>' +
                ['Alpha Platoon', 'Bravo Platoon', 'Charlie Platoon', 'Delta Platoon', 'Echo Platoon', 'Foxtrot Platoon', 'Golf Platoon', 'Hotel Platoon', 'India Platoon', 'Zulu Platoon', 'Papa Platoon', 'Officers'].map(function(sq) {
                  return '<option value="' + sq + '"' + (_adminMemberFilters.squad === sq ? ' selected' : '') + '>' + sq + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Department</label>' +
              '<select class="form-select admin-filter-select" style="width:100%;font-size:12px;padding:6px 10px;" onchange="setAdminMemberFilter(\'dept\', this.value)">' +
                '<option value=""' + (!_adminMemberFilters.dept ? ' selected' : '') + '>All Departments</option>' +
                '<option value="secretariat"' + (_adminMemberFilters.dept === 'secretariat' ? ' selected' : '') + '>Secretariat</option>' +
                '<option value="logistics"' + (_adminMemberFilters.dept === 'logistics' ? ' selected' : '') + '>Logistics</option>' +
                '<option value="media"' + (_adminMemberFilters.dept === 'media' ? ' selected' : '') + '>Media</option>' +
                '<option value="hq"' + (_adminMemberFilters.dept === 'hq' ? ' selected' : '') + '>HQ</option>' +
                '<option value="officers"' + (_adminMemberFilters.dept === 'officers' ? ' selected' : '') + '>Officers</option>' +
                '<option value="none"' + (_adminMemberFilters.dept === 'none' ? ' selected' : '') + '>No Department</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Verification Status</label>' +
              '<select class="form-select admin-filter-select" style="width:100%;font-size:12px;padding:6px 10px;" onchange="setAdminMemberFilter(\'status\', this.value)">' +
                '<option value=""' + (!_adminMemberFilters.status ? ' selected' : '') + '>All Statuses</option>' +
                '<option value="verified"' + (_adminMemberFilters.status === 'verified' ? ' selected' : '') + '>Verified (Green)</option>' +
                '<option value="processing"' + (_adminMemberFilters.status === 'processing' ? ' selected' : '') + '>Processing (Blue)</option>' +
                '<option value="rejected"' + (_adminMemberFilters.status === 'rejected' ? ' selected' : '') + '>Rejected (Red)</option>' +
                '<option value="not_verified"' + (_adminMemberFilters.status === 'not_verified' ? ' selected' : '') + '>Not Verified (Grey)</option>' +
              '</select>' +
            '</div>' +
            '<div style="margin-top:6px;display:flex;gap:6px;">' +
              '<button type="button" class="portal-btn" onclick="resetAdminMemberFilters();toggleGlobalFilterPopover(event);" style="flex:1;padding:6px 12px;font-size:11px;font-weight:600;border-radius:6px;background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-secondary);cursor:pointer;">Reset All</button>' +
              '<button type="button" class="portal-btn gold" onclick="toggleGlobalFilterPopover(event);" style="flex:1;padding:6px 12px;font-size:11px;font-weight:700;border-radius:6px;background:var(--gold);color:#000;border:none;cursor:pointer;">Apply</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else if (_isGlobalSortOpen) {
      var sortBtn = document.querySelector('.adm-top-sort-btn');
      var sortRect = sortBtn ? sortBtn.getBoundingClientRect() : { bottom: 120, left: 300 };

      var sortFields = [
        { key: 'name', label: 'Full Name' },
        { key: 'email', label: 'Email' },
        { key: 'section', label: 'Section' },
        { key: 'rank', label: 'Rank' },
        { key: 'squad', label: 'Platoon / Squad' },
        { key: 'dept', label: 'Department' },
        { key: 'age', label: 'Age' },
        { key: 'dob', label: 'DOB' },
        { key: 'status', label: 'Verification Status' },
        { key: 'joined', label: 'Joined Date' }
      ];

      var sortItemsHtml = sortFields.map(function(f) {
        var isCur = (_adminSortBy === f.key);
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-radius:6px;background:' + (isCur ? 'var(--bg-card-subtle)' : 'transparent') + ';">' +
          '<span style="font-size:12px;font-weight:' + (isCur ? '700' : '500') + ';color:' + (isCur ? 'var(--gold)' : 'var(--text-primary)') + ';">' + f.label + '</span>' +
          '<div style="display:flex;gap:4px;">' +
            '<button type="button" class="portal-btn' + (isCur && _adminSortDir === 'asc' ? ' is-active' : '') + '" onclick="setAdminSort(\'' + f.key + '\', \'asc\');toggleGlobalSortPopover(event);" style="padding:3px 8px;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid var(--border-card);background:' + (isCur && _adminSortDir === 'asc' ? 'var(--gold)' : 'transparent') + ';color:' + (isCur && _adminSortDir === 'asc' ? '#000' : 'var(--text-secondary)') + ';" title="Ascending (A \u2192 Z)">' +
              '\u2191 Sort A \u2192 Z' +
            '</button>' +
            '<button type="button" class="portal-btn' + (isCur && _adminSortDir === 'desc' ? ' is-active' : '') + '" onclick="setAdminSort(\'' + f.key + '\', \'desc\');toggleGlobalSortPopover(event);" style="padding:3px 8px;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid var(--border-card);background:' + (isCur && _adminSortDir === 'desc' ? 'var(--gold)' : 'transparent') + ';color:' + (isCur && _adminSortDir === 'desc' ? '#000' : 'var(--text-secondary)') + ';" title="Descending (Z \u2192 A)">' +
              '\u2193 Sort Z \u2192 A' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');

      container.innerHTML =
        '<div class="adm-global-sort-popover" style="position:fixed;top:' + (sortRect.bottom + 6) + 'px;left:' + sortRect.left + 'px;z-index:99999;width:280px;" onclick="event.stopPropagation();">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border-card);">' +
            '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;color:var(--text-primary);">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>' +
              '<span>Sort Users</span>' +
            '</div>' +
            '<button type="button" class="sfp-close-btn" onclick="toggleGlobalSortPopover(event)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;">\u2715</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;">' +
            sortItemsHtml +
          '</div>' +
        '</div>';
    }
  }

  function filterByOverviewCategory(cat) {
    if (cat === 'all') {
      _adminMemberFilters.section = '';
      _adminMemberFilters.status = '';
    } else if (cat === 'verified') {
      _adminMemberFilters.status = 'verified';
    } else if (cat === 'Pre-Junior' || cat === 'Junior' || cat === 'Senior') {
      _adminMemberFilters.section = cat;
    }
    return renderAdminList();
  }

  async function openBlockedEmailsView() {
    _adminMembersSubView = 'blocked_emails';
    await loadBlockedEmails();

    if (typeof document !== 'undefined') {
      var secEl = document.getElementById('adm-section-members');
      if (secEl) {
        var header = secEl.querySelector('.adm-section-header');
        if (header) header.style.display = 'none';
        var searchInput = document.getElementById('admin-search');
        if (searchInput && searchInput.parentElement) searchInput.parentElement.style.display = 'none';
        var sortRow = document.getElementById('sort-name') ? document.getElementById('sort-name').parentElement : null;
        if (sortRow) sortRow.style.display = 'none';
      }
    }
    renderBlockedEmailsFullView();
  }

  function backToMembersList() {
    _adminMembersSubView = 'members';
    if (typeof document !== 'undefined') {
      var secEl = document.getElementById('adm-section-members');
      if (secEl) {
        var header = secEl.querySelector('.adm-section-header');
        if (header) header.style.display = 'flex';
        var searchInput = document.getElementById('admin-search');
        if (searchInput && searchInput.parentElement) searchInput.parentElement.style.display = 'flex';
        var sortRow = document.getElementById('sort-name') ? document.getElementById('sort-name').parentElement : null;
        if (sortRow) sortRow.style.display = 'none'; // keep legacy sort row hidden
      }
    }
    return renderAdminList();
  }

  function renderBlockedEmailsFullView() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('admin-members-list');
    if (!container) return;

    var searchQ = '';
    var searchEl = document.getElementById('blocked-emails-search');
    if (searchEl) searchQ = (searchEl.value || '').trim().toLowerCase();

    var records = (_blockedEmails || []).filter(function(item) {
      if (!searchQ) return true;
      var em = (item && typeof item === 'object' && item.email) ? item.email : String(item);
      var reason = (item && typeof item === 'object' && item.reason) ? item.reason : '';
      return em.toLowerCase().indexOf(searchQ) !== -1 || reason.toLowerCase().indexOf(searchQ) !== -1;
    });

    var rowsHtml = '';
    if (!records.length) {
      rowsHtml = '<tr><td colspan="5" style="text-align:center;padding:36px 16px;color:var(--text-muted);">' +
        '<div style="margin-bottom:8px;"><svg class="ui-icon-lg" style="opacity:0.4;width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>' +
        '<div style="font-weight:700;color:var(--text-primary);font-size:14px;margin-bottom:4px;">No Blocked Emails Found</div>' +
        '<div style="font-size:12px;">All registered and prospective email addresses are currently allowed.</div>' +
      '</td></tr>';
    } else {
      records.forEach(function(item) {
        var em = (item && typeof item === 'object' && item.email) ? item.email : String(item);
        var safeEm = (typeof escapeHtml === 'function') ? escapeHtml(em) : em;
        var date = (item && typeof item === 'object' && item.date) ? item.date : '\u2014';
        var safeDate = (typeof escapeHtml === 'function') ? escapeHtml(date) : date;
        var reason = (item && typeof item === 'object' && item.reason) ? item.reason : 'Account restricted by administrator';
        var safeReason = (typeof escapeHtml === 'function') ? escapeHtml(reason) : reason;
        var blockedBy = (item && typeof item === 'object' && item.blocked_by) ? item.blocked_by : 'Admin';
        var safeBlockedBy = (typeof escapeHtml === 'function') ? escapeHtml(blockedBy) : blockedBy;

        rowsHtml += '<tr>' +
          '<td style="font-family:var(--font-mono,monospace);font-weight:600;color:var(--text-primary);">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;flex-shrink:0;">' +
                '<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
              '</span>' +
              '<span class="admin-member-email">' + safeEm + '</span>' +
            '</div>' +
          '</td>' +
          '<td style="white-space:nowrap;color:var(--text-secondary);font-size:12px;">' + safeDate + '</td>' +
          '<td>' +
            (_blockedEmailsEditMode
              ? '<input type="text" class="admin-inline-input" value="' + safeReason + '" onchange="updateBlockedEmailReason(\'' + safeEm + '\', this.value)" title="Edit Reason (autosaves)" />'
              : '<span style="color:var(--text-secondary);font-weight:500;">' + safeReason + '</span>') +
          '</td>' +
          '<td style="white-space:nowrap;color:var(--text-muted);font-size:12px;">' + safeBlockedBy + '</td>' +
          '<td style="text-align:right;white-space:nowrap;">' +
            '<button type="button" onclick="removeBlockedEmail(\'' + safeEm + '\')" class="portal-btn" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;" title="Unblock this email address">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Unblock' +
            '</button>' +
          '</td>' +
        '</tr>';
      });
    }

    var editBannerHtml = _blockedEmailsEditMode
      ? '<div class="admin-edit-mode-banner"><span style="display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <strong>Edit Mode Active:</strong> You can edit blocking reasons directly in table cells. Changes autosave to the database.</span><button type="button" onclick="toggleBlockedEmailsEditMode()" style="background:none;border:1px solid currentColor;color:inherit;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">Exit Edit Mode</button></div>'
      : '';

    container.innerHTML =
      '<div class="blocked-emails-fullview">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<button type="button" class="portal-btn" onclick="backToMembersList()" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-secondary);padding:8px 14px;border-radius:10px;cursor:pointer;font-family:var(--font-headline);font-size:13px;font-weight:600;">' +
              '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' +
              'Back to Members' +
            '</button>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,0.15);color:#ef4444;display:flex;align-items:center;justify-content:center;">' +
                '<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
              '</div>' +
              '<div>' +
                '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);">Blocked Emails &amp; Restrictions</div>' +
                '<div style="font-size:12px;color:var(--text-secondary);">Block email addresses from registering accounts or logging in</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="blocked-emails-add-form">' +
          '<input type="email" id="fullview-blocked-email-inp" class="form-input" placeholder="Enter email to block (e.g. spam@test.com)" style="flex:1;min-width:200px;font-size:13px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAddBlockedEmailFullView();}" />' +
          '<input type="text" id="fullview-blocked-reason-inp" class="form-input" placeholder="Reason for blocking (e.g. Spam, duplicate account)" style="flex:1.5;min-width:220px;font-size:13px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAddBlockedEmailFullView();}" />' +
          '<button type="button" class="submit-btn" onclick="submitAddBlockedEmailFullView()" style="width:auto;margin:0;padding:8px 18px;font-size:13px;background:#dc2626;color:#ffffff;border:none;white-space:nowrap;font-weight:600;display:inline-flex;align-items:center;gap:6px;">' +
            '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
            'Block Email' +
          '</button>' +
        '</div>' +
        '<div class="admin-members-toolbar" style="margin-bottom:12px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;">' +
              '<input type="text" id="blocked-emails-search" class="form-input" placeholder="Search blocked emails..." value="' + ((typeof escapeHtml === 'function') ? escapeHtml(searchQ) : searchQ) + '" oninput="renderBlockedEmailsFullView()" style="max-width:260px;font-size:12px;padding:6px 10px;" />' +
              '<button type="button" class="portal-btn" onclick="toggleBlockedEmailsEditMode()" style="padding:6px 14px;font-size:12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:700;' + (_blockedEmailsEditMode ? 'background:#f59e0b;border:1px solid #d97706;color:#ffffff;' : 'background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);') + '">' +
                (_blockedEmailsEditMode
                  ? '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Reasons Active'
                  : '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> View Mode (Safe)') +
              '</button>' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);font-weight:600;">' +
              'Showing <strong style="color:#ef4444;">' + records.length + '</strong> of ' + (_blockedEmails ? _blockedEmails.length : 0) + ' blocked addresses' +
            '</div>' +
          '</div>' +
        '</div>' +
        editBannerHtml +
        '<div class="admin-members-table-wrapper">' +
          '<table class="admin-members-table blocked-emails-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="sheets-th"><div class="sheets-th-content"><span class="sheets-th-label">Email Blocked</span></div></th>' +
                '<th class="sheets-th"><div class="sheets-th-content"><span class="sheets-th-label">Date Blocked</span></div></th>' +
                '<th class="sheets-th"><div class="sheets-th-content"><span class="sheets-th-label">Reason for Blocking</span></div></th>' +
                '<th class="sheets-th"><div class="sheets-th-content"><span class="sheets-th-label">Blocked By</span></div></th>' +
                '<th style="text-align:right;">Actions</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              rowsHtml +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  async function submitAddBlockedEmailFullView() {
    if (typeof document === 'undefined') return;
    var emailInput = document.getElementById('fullview-blocked-email-inp');
    var reasonInput = document.getElementById('fullview-blocked-reason-inp');
    if (!emailInput) return;
    var em = (emailInput.value || '').trim();
    var reason = reasonInput ? (reasonInput.value || '').trim() : '';
    var ok = await addBlockedEmail(em, reason);
    if (ok) {
      emailInput.value = '';
      if (reasonInput) reasonInput.value = '';
      emailInput.focus();
    }
  }

  async function updateMemberField(ic, field, value) {
    if (!ic || !field) return;
    var client = getSupabaseClient();
    if (!client) {
      if (typeof showToast === 'function') showToast('Database client unavailable.', 'error');
      return;
    }

    var cleanVal = (value !== undefined && value !== null) ? String(value).trim() : '';
    var patchObj = {};

    if (field === 'name') {
      if (!cleanVal) {
        if (typeof showToast === 'function') showToast('Member name cannot be blank.', 'warning');
        return;
      }
      patchObj.name = cleanVal;
    } else if (field === 'section') {
      patchObj.section = cleanVal;
      patchObj.att_section = cleanVal;
    } else if (field === 'rank') {
      patchObj.rank = cleanVal;
    } else if (field === 'squad') {
      patchObj.squad = cleanVal;
    } else if (field === 'department') {
      patchObj.department = cleanVal.toLowerCase();
    } else if (field === 'date_of_birth') {
      patchObj.date_of_birth = cleanVal || null;
    } else {
      patchObj[field] = cleanVal;
    }

    try {
      if (client.patch) {
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), patchObj);
      } else if (client.req) {
        await client.req('PATCH', 'bb_members?ic=eq.' + encodeURIComponent(ic), patchObj);
      }

      if (_adminMembers && _adminMembers[ic]) {
        Object.assign(_adminMembers[ic], patchObj);
      }
      if (Array.isArray(_adminMembersCache)) {
        _adminMembersCache.forEach(function(m) {
          if (m.ic === ic) Object.assign(m, patchObj);
        });
      }

      var memName = (_adminMembers && _adminMembers[ic] && _adminMembers[ic].name) || ic;
      if (typeof showToast === 'function') {
        showToast('Updated ' + field.replace(/_/g, ' ') + ' for ' + memName, 'success');
      }
      renderAdminList();
    } catch (err) {
      console.error('updateMemberField error:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to update member: ' + (err.message || 'Network error'), 'error');
      }
    }
  }

  function getSupabaseClient() {
    if (typeof window !== 'undefined' && window.supa) return window.supa;
    if (typeof global !== 'undefined' && global.supa) return global.supa;
    if (typeof getSupaClient === 'function') return getSupaClient();
    if (typeof window !== 'undefined' && typeof window.getSupaClient === 'function') return window.getSupaClient();
    if (typeof supa !== 'undefined') return supa;
    return null;
  }

  var DEFAULT_ADMIN_HASH = 'e73d72da113ab72c21c2a07d2a4b72c5d28885ce29bd22abcb6697a8cd79ec7f';

  function getAdminPasswordHash() {
    if (typeof global !== 'undefined' && global.ADMIN_PASSWORD_HASH) return global.ADMIN_PASSWORD_HASH;
    if (typeof ADMIN_PASSWORD_HASH !== 'undefined') return ADMIN_PASSWORD_HASH;
    if (typeof window !== 'undefined' && window.ADMIN_PASSWORD_HASH) return window.ADMIN_PASSWORD_HASH;
    return DEFAULT_ADMIN_HASH;
  }

  async function verifyAdminPassword(inputPass) {
    if (!inputPass) return false;
    var expectedHash = getAdminPasswordHash();
    var inputHash = '';

    if (typeof computeSha256 === 'function') {
      inputHash = await computeSha256(inputPass);
    } else if (typeof window !== 'undefined' && typeof window.computeSha256 === 'function') {
      inputHash = await window.computeSha256(inputPass);
    } else if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var buf = await cryptoObj.subtle.digest('SHA-256', enc.encode(inputPass));
        var bytes = new Uint8Array(buf);
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          inputHash += b.length === 1 ? '0' + b : b;
        }
      }
    }

    if (inputHash && expectedHash) {
      if (typeof window !== 'undefined' && typeof window.timingSafeEqualToken === 'function') {
        return window.timingSafeEqualToken(inputHash, expectedHash);
      }
      if (typeof timingSafeEqualToken === 'function') {
        return timingSafeEqualToken(inputHash, expectedHash);
      }
      return inputHash.toLowerCase() === expectedHash.toLowerCase();
    }
    return false;
  }

  function getDeptConfig() {
    if (typeof global !== 'undefined' && global.DEPT_CONFIG) return global.DEPT_CONFIG;
    if (typeof DEPT_CONFIG !== 'undefined') return DEPT_CONFIG;
    return DEFAULT_DEPT_CONFIG;
  }

  // ── Cryptographic Session & Gate Hardening ──────────────────────
  var SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours absolute lifetime
  var SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;     // 60 minutes idle timeout
  var MAX_LOGIN_FAILURES      = 5;
  var BASE_LOCKOUT_MS         = 30 * 1000;      // 30 seconds
  var MAX_LOCKOUT_MS          = 300 * 1000;     // 5 minutes max

  var _adminSessionToken  = null;
  var _adminSessionData   = null;
  var _adminSessionSalt   = '';
  var _adminLoginFailures = 0;
  var _adminLockoutUntil  = 0;
  var _adminDomObserver   = null;

  function generateSecureHex(len) {
    var bytesCount = len || 16;
    if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        var arr = new Uint8Array(bytesCount);
        cryptoObj.getRandomValues(arr);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
          var b = arr[i].toString(16);
          hex += b.length === 1 ? '0' + b : b;
        }
        return hex;
      }
    }
    var fallback = '';
    for (var j = 0; j < bytesCount; j++) {
      var r = Math.floor(Math.random() * 256).toString(16);
      fallback += r.length === 1 ? '0' + r : r;
    }
    return fallback;
  }

  async function computeHmacSha256(secretKeyHex, messageStr) {
    if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var key = await cryptoObj.subtle.importKey(
          'raw',
          enc.encode(secretKeyHex),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        var sigBuf = await cryptoObj.subtle.sign('HMAC', key, enc.encode(messageStr));
        var bytes = new Uint8Array(sigBuf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          hex += b.length === 1 ? '0' + b : b;
        }
        return hex;
      }
    }
    if (typeof computeSha256 === 'function') {
      var s1 = await computeSha256(secretKeyHex + ':' + messageStr);
      return await computeSha256(s1 + ':' + secretKeyHex);
    }
    return '';
  }

  function getAdminLockoutRemainingSecs() {
    if (_adminLockoutUntil && Date.now() < _adminLockoutUntil) {
      return Math.ceil((_adminLockoutUntil - Date.now()) / 1000);
    }
    return 0;
  }

  function resetAdminLockout() {
    _adminLoginFailures = 0;
    _adminLockoutUntil = 0;
  }

  function getAdminLockoutStatus() {
    var rem = getAdminLockoutRemainingSecs();
    return {
      locked: rem > 0,
      remainingSeconds: rem,
      failures: _adminLoginFailures
    };
  }

  function getAdminSessionToken() {
    return _adminSessionToken || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bb_admin_session_token') : null);
  }

  function getAdminSessionData() {
    return _adminSessionData;
  }

  function setAdminSessionTokenForTesting(token, data) {
    _adminSessionToken = token;
    _adminSessionData = data || null;
  }

  async function createAdminSessionToken(officerEmail, officerRank) {
    _adminSessionSalt = generateSecureHex(32);
    var now = Date.now();
    var email = officerEmail || (typeof sessionGet === 'function' ? sessionGet('email') : '') || 'company_officer';
    var rank = officerRank || (typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Officer';

    var payload = {
      role: 'officer_admin',
      officerEmail: email,
      officerRank: rank,
      issuedAt: now,
      expiresAt: now + SESSION_MAX_LIFETIME_MS,
      lastActiveAt: now,
      nonce: generateSecureHex(16)
    };

    var signPayload = [
      payload.role,
      payload.officerEmail,
      payload.issuedAt,
      payload.expiresAt,
      payload.nonce
    ].join(':');

    var expectedHash = getAdminPasswordHash();
    var secretKey = expectedHash + ':' + _adminSessionSalt;
    var signature = await computeHmacSha256(secretKey, signPayload);

    var payloadStr = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      : Buffer.from(JSON.stringify(payload)).toString('base64');

    var token = payloadStr + '.' + signature;

    _adminSessionToken = token;
    _adminSessionData = payload;

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('bb_admin_session_token', token);
        sessionStorage.setItem('bb_admin_session_salt', _adminSessionSalt);
      } catch (_) {}
    }

    if (typeof sessionSet === 'function') {
      sessionSet('adminAuthed', true);
    }

    return token;
  }

  function verifyAdminSessionSync() {
    var token = getAdminSessionToken();
    if (!token) return false;
    // Server-issued tokens do not use dot notation; verified asynchronously
    if (token.indexOf('.') === -1) {
      return true;
    }
    if (!_adminSessionData) {
      try {
        var parts = token.split('.');
        if (parts.length !== 2) return false;
        var jsonStr = typeof atob === 'function'
          ? decodeURIComponent(escape(atob(parts[0])))
          : Buffer.from(parts[0], 'base64').toString('utf8');
        _adminSessionData = JSON.parse(jsonStr);
      } catch (_) {
        return false;
      }
    }

    var data = _adminSessionData;
    if (!data || data.role !== 'officer_admin') return false;

    var now = Date.now();
    if (now > data.expiresAt) {
      revokeAdminSession('Session expired. Please re-authenticate.');
      return false;
    }

    if (now - data.lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
      revokeAdminSession('Session timed out due to inactivity.');
      return false;
    }

    data.lastActiveAt = now;
    return true;
  }

  async function verifyAdminSession() {
    var token = getAdminSessionToken();
    if (!token) return false;

    var client = getSupabaseClient();
    if (client && typeof client.rpc === 'function') {
      try {
        var verifyRes = await client.rpc('rpc_verify_admin_session', { p_token: token });
        if (verifyRes && verifyRes.valid === true) {
          return true;
        } else if (verifyRes && verifyRes.valid === false) {
          revokeAdminSession('Server rejected admin session.');
          return false;
        }
      } catch (rpcErr) {
        console.warn('RPC session verify fallback:', rpcErr);
      }
    }

    if (!verifyAdminSessionSync()) return false;
    var parts = token.split('.');
    if (parts.length !== 2) {
      revokeAdminSession('Malformed session token.');
      return false;
    }
    if (!_adminSessionData) return false;

    var payload = _adminSessionData;
    var signPayload = [
      payload.role,
      payload.officerEmail,
      payload.issuedAt,
      payload.expiresAt,
      payload.nonce
    ].join(':');

    var salt = _adminSessionSalt || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bb_admin_session_salt') : '');
    var expectedHash = getAdminPasswordHash();
    var secretKey = expectedHash + ':' + salt;
    var expectedSig = await computeHmacSha256(secretKey, signPayload);

    var valid = false;
    if (typeof timingSafeEqualToken === 'function') {
      valid = timingSafeEqualToken(parts[1], expectedSig);
    } else if (typeof window !== 'undefined' && typeof window.timingSafeEqualToken === 'function') {
      valid = window.timingSafeEqualToken(parts[1], expectedSig);
    } else {
      valid = parts[1].toLowerCase() === expectedSig.toLowerCase();
    }

    if (!valid) {
      revokeAdminSession('Cryptographic token signature mismatch. Tampering detected.');
      return false;
    }

    return true;
  }

  function revokeAdminSession(reason) {
    _adminSessionToken = null;
    _adminSessionData = null;
    _adminSessionSalt = '';

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem('bb_admin_session_token');
        sessionStorage.removeItem('bb_admin_session_salt');
      } catch (_) {}
    }

    if (typeof sessionSet === 'function') {
      sessionSet('adminAuthed', false);
    }

    if (typeof document !== 'undefined') {
      var panel = document.getElementById('admin-panel');
      if (panel) panel.style.display = 'none';

      var loginBox = document.getElementById('admin-login-box');
      if (loginBox) loginBox.style.display = 'block';
    }

    if (reason && typeof showToast === 'function') {
      showToast('Security Alert: ' + reason, 'error');
    }
  }

  function initAdminDomGuard() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    var panel = document.getElementById('admin-panel');
    if (!panel || _adminDomObserver) return;

    _adminDomObserver = new MutationObserver(function() {
      if (panel.style.display !== 'none' && !verifyAdminSessionSync()) {
        panel.style.display = 'none';
        var loginBox = document.getElementById('admin-login-box');
        if (loginBox) loginBox.style.display = 'block';
        revokeAdminSession('Unauthorized DOM display bypass detected.');
      }
    });

    try {
      _adminDomObserver.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_) {}
  }

  // ── Admin Authentication & Back-Office Navigation ──────────────────────────

  async function openAdmin(skipPush) {
    if (typeof document === 'undefined') return;

    if (!skipPush && typeof history !== 'undefined' && history.pushState && typeof window !== 'undefined' && window.location.hash !== '#admin') {
      var activePg = document.querySelector('.page.active');
      var curTab = activePg ? activePg.id.replace('page-', '') : 'home';
      history.pushState({ tab: curTab, admin: true }, '', '#admin');
    }
    if (typeof document !== 'undefined') {
      document.title = 'Admin Console — 1st PJ Boys\' Brigade';
    }

    if (typeof RBAC !== 'undefined' && typeof RBAC.loadRolesConfig === 'function') {
      try {
        await Promise.race([
          RBAC.loadRolesConfig(),
          new Promise(function(resolve) { setTimeout(resolve, 600); })
        ]);
      } catch (_) {}
    }

    // RBAC Gatekeeper: Block standard members from accessing admin routes/console
    var isMemberSession = false;
    var sessEmail = null;
    var currentRole = 'member';

    if (typeof sessionGet === 'function') {
      sessEmail = sessionGet('email') || sessionGet('ic');
      if (sessEmail) {
        currentRole = (typeof RBAC !== 'undefined' && typeof RBAC.getUserRole === 'function')
          ? RBAC.getUserRole(sessEmail)
          : (sessionGet('role') || 'member');
        // STRICT SECURITY GATE: Officers and Captains without explicit Admin/Super Admin role are strictly blocked
        if (currentRole === 'member' && !verifyAdminSessionSync()) {
          isMemberSession = true;
        }
      }
    }

    if (isMemberSession) {
      if (typeof showToast === 'function') {
        showToast('Access Denied: Administrative privileges required. Only designated Admins and Super Admins may access the Admin Console.', 'error');
      }
      return;
    }

    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'block';
    if (document.body) document.body.style.overflow = 'hidden';

    // Passwordless Access for Authenticated Admins & Super Admins
    if (sessEmail && (currentRole === 'admin' || currentRole === 'super_admin')) {
      if (!verifyAdminSessionSync()) {
        await createAdminSessionToken(sessEmail, currentRole === 'super_admin' ? 'Super Admin' : 'Admin');
      }
      if (typeof sessionSet === 'function') {
        sessionSet('adminAuthed', true);
      }

      var loginBoxEl = document.getElementById('admin-login-box');
      if (loginBoxEl) loginBoxEl.style.display = 'none';

      var panelEl = document.getElementById('admin-panel');
      if (panelEl) panelEl.style.display = 'block';

      initAdminDomGuard();
      backToAdminHome();

      if (typeof renderGallery === 'function') renderGallery();
      if (typeof renderAnnouncements === 'function') renderAnnouncements();
      if (typeof loadResources === 'function') loadResources();
      if (typeof initCalendarModule === 'function') initCalendarModule();
      return;
    }

    // Fallback: If no authenticated member session, show password prompt
    revokeAdminSession();

    var loginBox = document.getElementById('admin-login-box');
    if (loginBox) loginBox.style.display = 'block';

    var panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'none';

    initAdminDomGuard();

    var passEl = document.getElementById('admin-pass');
    if (passEl) {
      passEl.value = '';
      passEl.style.webkitTextSecurity = 'disc';
      passEl.style.textSecurity = 'disc';
      if (typeof passEl.focus === 'function') passEl.focus();
    }
    var eyeBtn = document.getElementById('admin-eye');
    if (eyeBtn) {
      eyeBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  function closeAdmin(skipHistory) {
    if (typeof document === 'undefined') return;
    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'none';
    if (document.body) document.body.style.overflow = '';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec) creatorSec.style.display = 'none';
    if (!skipHistory && typeof window !== 'undefined' && window.location.hash === '#admin') {
      if (typeof history !== 'undefined' && typeof history.back === 'function') {
        history.back();
      }
    }
  }

  function toggleAdminPassVis() {
    if (typeof document === 'undefined') return;
    var inp = document.getElementById('admin-pass');
    var btn = document.getElementById('admin-eye');
    if (!inp) return;
    var isMasked = inp.style.webkitTextSecurity !== 'none';
    if (isMasked) {
      inp.style.webkitTextSecurity = 'none';
      inp.style.textSecurity = 'none';
      if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
    } else {
      inp.style.webkitTextSecurity = 'disc';
      inp.style.textSecurity = 'disc';
      if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  function logoutAdmin() {
    var currentOfficer = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'admin';
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'admin.logout',
        targetType: 'admin_session',
        targetId: currentOfficer,
        actorId: currentOfficer,
        actorRole: 'officer_admin'
      });
    }
    var token = getAdminSessionToken();
    var client = getSupabaseClient();
    if (token && client && typeof client.rpc === 'function') {
      try {
        client.rpc('rpc_admin_logout', { p_token: token }).catch(function() {});
      } catch (_) {}
    }
    revokeAdminSession();
    if (typeof document === 'undefined') return;

    var panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'none';

    var loginBox = document.getElementById('admin-login-box');
    if (loginBox) loginBox.style.display = 'block';

    var passEl = document.getElementById('admin-pass');
    if (passEl) {
      passEl.value = '';
      passEl.style.webkitTextSecurity = 'disc';
      passEl.style.textSecurity = 'disc';
      if (typeof passEl.focus === 'function') passEl.focus();
    }
    var eyeBtn = document.getElementById('admin-eye');
    if (eyeBtn) {
      eyeBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  async function adminLogin() {
    if (typeof document === 'undefined') return false;

    // 1. Rate limiting lockout check
    var remaining = getAdminLockoutRemainingSecs();
    if (remaining > 0) {
      if (typeof showToast === 'function') {
        showToast('Admin locked due to failed attempts. Try again in ' + remaining + 's.', 'error');
      }
      return false;
    }

    var passEl = document.getElementById('admin-pass');
    var pass = passEl ? passEl.value : '';

    var client = getSupabaseClient();
    var officerEmail = typeof sessionGet === 'function' ? sessionGet('email') : '';
    var officerRank = typeof sessionGet === 'function' ? sessionGet('rank') : '';

    // Calculate input SHA-256 hash
    var inputHash = '';
    if (typeof computeSha256 === 'function') {
      inputHash = await computeSha256(pass);
    } else if (typeof window !== 'undefined' && typeof window.computeSha256 === 'function') {
      inputHash = await window.computeSha256(pass);
    } else if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var buf = await cryptoObj.subtle.digest('SHA-256', enc.encode(pass));
        var bytes = new Uint8Array(buf);
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          inputHash += b.length === 1 ? '0' + b : b;
        }
      }
    }

    // Try server-side RPC authentication
    if (client && typeof client.rpc === 'function') {
      try {
        var rpcAuth = await client.rpc('rpc_admin_login', {
          p_password_hash: inputHash,
          p_officer_email: officerEmail,
          p_officer_rank: officerRank
        });

        if (rpcAuth && rpcAuth.token) {
          _adminLoginFailures = 0;
          _adminLockoutUntil = 0;
          _adminSessionToken = rpcAuth.token;
          _adminSessionData = {
            role: rpcAuth.role || 'officer_admin',
            officerEmail: officerEmail,
            officerRank: officerRank,
            issuedAt: Date.now(),
            expiresAt: rpcAuth.expires_at ? new Date(rpcAuth.expires_at).getTime() : Date.now() + SESSION_MAX_LIFETIME_MS,
            lastActiveAt: Date.now()
          };

          if (typeof sessionStorage !== 'undefined') {
            try {
              sessionStorage.setItem('bb_admin_session_token', rpcAuth.token);
              sessionStorage.setItem('bb_admin_session_data', JSON.stringify(_adminSessionData));
            } catch (_) {}
          }

          if (typeof sessionSet === 'function') {
            sessionSet('adminAuthed', true);
          }

          if (passEl) passEl.value = '';

          var loginBox = document.getElementById('admin-login-box');
          if (loginBox) loginBox.style.display = 'none';

          var panel = document.getElementById('admin-panel');
          if (panel) panel.style.display = 'block';

          initAdminDomGuard();
          backToAdminHome();

          if (typeof logAuditEvent === 'function') {
            logAuditEvent({
              action: 'admin.login_success',
              targetType: 'admin_auth',
              targetId: officerEmail || 'admin',
              actorId: officerEmail || 'admin',
              actorRole: 'officer_admin',
              details: { rank: officerRank }
            });
          }
          if (typeof renderGallery === 'function') renderGallery();
          if (typeof renderAnnouncements === 'function') renderAnnouncements();
          if (typeof loadResources === 'function') loadResources();
          if (typeof initCalendarModule === 'function') initCalendarModule();
          return true;
        } else if (rpcAuth && rpcAuth.success === false) {
          if (typeof logAuditEvent === 'function') {
            logAuditEvent({
              action: 'admin.login_failed',
              targetType: 'admin_auth',
              targetId: officerEmail || 'admin',
              actorId: officerEmail || 'admin',
              actorRole: 'anonymous',
              details: { reason: 'invalid_credentials' }
            });
          }
          _adminLoginFailures++;
          if (_adminLoginFailures >= MAX_LOGIN_FAILURES) {
            var lockoutMs = Math.min(
              BASE_LOCKOUT_MS * Math.pow(2, _adminLoginFailures - MAX_LOGIN_FAILURES),
              MAX_LOCKOUT_MS
            );
            _adminLockoutUntil = Date.now() + lockoutMs;
            if (typeof showToast === 'function') {
              showToast('Security Alert: Multiple failed attempts. Locked for ' + Math.round(lockoutMs / 1000) + 's.', 'error');
            }
          } else {
            if (typeof showToast === 'function') {
              showToast('Wrong password! Attempt ' + _adminLoginFailures + ' of ' + MAX_LOGIN_FAILURES + '.', 'error');
            }
          }
          logoutAdmin();
          return false;
        }
      } catch (rpcErr) {
        console.warn('RPC admin login fallback:', rpcErr);
      }
    }

    var valid = await verifyAdminPassword(pass);
    if (!valid) {
      _adminLoginFailures++;
      if (_adminLoginFailures >= MAX_LOGIN_FAILURES) {
        var lockoutMs2 = Math.min(
          BASE_LOCKOUT_MS * Math.pow(2, _adminLoginFailures - MAX_LOGIN_FAILURES),
          MAX_LOCKOUT_MS
        );
        _adminLockoutUntil = Date.now() + lockoutMs2;
        if (typeof showToast === 'function') {
          showToast('Security Alert: Multiple failed attempts. Locked for ' + Math.round(lockoutMs2 / 1000) + 's.', 'error');
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('Wrong password! Attempt ' + _adminLoginFailures + ' of ' + MAX_LOGIN_FAILURES + '.', 'error');
        }
      }
      logoutAdmin();
      return false;
    }

    // 2. Clear failure tracking on success
    _adminLoginFailures = 0;
    _adminLockoutUntil = 0;

    // 3. Issue cryptographic HMAC session token
    await createAdminSessionToken(officerEmail, officerRank);

    if (passEl) passEl.value = '';

    var loginBoxFallback = document.getElementById('admin-login-box');
    if (loginBoxFallback) loginBoxFallback.style.display = 'none';

    var panelFallback = document.getElementById('admin-panel');
    if (panelFallback) panelFallback.style.display = 'block';

    initAdminDomGuard();
    backToAdminHome();

    if (typeof renderGallery === 'function') renderGallery();
    if (typeof renderAnnouncements === 'function') renderAnnouncements();
    if (typeof loadResources === 'function') loadResources();
    if (typeof initCalendarModule === 'function') initCalendarModule();
    return true;
  }

  function setAdminViewMode(mode) {
    if (typeof document === 'undefined') return;
    var nav = document.querySelector('.adm-section-nav');
    var isGrid = (mode === 'grid');

    if (nav) {
      nav.classList.toggle('adm-view-grid', isGrid);
      nav.classList.toggle('adm-view-list', !isGrid);
    }

    var listBtn = document.querySelector('.adm-view-btn-list');
    var gridBtn = document.querySelector('.adm-view-btn-grid');
    if (listBtn) {
      listBtn.classList.toggle('active', !isGrid);
      listBtn.setAttribute('aria-pressed', !isGrid ? 'true' : 'false');
    }
    if (gridBtn) {
      gridBtn.classList.toggle('active', isGrid);
      gridBtn.setAttribute('aria-pressed', isGrid ? 'true' : 'false');
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_admin_view_mode', isGrid ? 'grid' : 'list');
      }
    } catch (_) {}
  }

  function getAdminViewMode() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('bb_admin_view_mode') || 'list';
      }
    } catch (_) {}
    return 'list';
  }

  function backToAdminHome() {
    if (typeof document === 'undefined') return;
    if (_adminMembersSubView === 'blocked_emails') {
      backToMembersList();
    }
    var backBar = document.getElementById('adm-back-bar');
    if (backBar) backBar.style.display = 'none';

    var toolbar = document.querySelector('.adm-toolbar-row');
    if (toolbar) toolbar.style.display = 'flex';

    ADMIN_SECTIONS.forEach(function(s) {
      var el = document.getElementById('adm-section-' + s);
      if (el) el.style.display = 'none';
    });
    var rolesSec = document.getElementById('adm-section-roles');
    if (rolesSec) rolesSec.style.display = 'none';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec) creatorSec.style.display = 'none';

    // Scoped Admin UI Filtering
    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;

    // Dynamically inject Super Admin Roles & Permissions button if missing
    var rolesBtn = document.getElementById('sec-btn-roles');
    if (!rolesBtn) {
      var calBtn = document.getElementById('sec-btn-calendar');
      if (calBtn && calBtn.parentNode) {
        rolesBtn = document.createElement('div');
        rolesBtn.className = 'adm-section-btn';
        rolesBtn.id = 'sec-btn-roles';
        rolesBtn.onclick = function() { switchAdminSection('roles'); };
        rolesBtn.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="adm-sec-icon" style="background:rgba(217,163,35,0.15);color:var(--gold);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div><div><div class="adm-sec-title">Roles &amp; Permissions</div><div class="adm-sec-sub">Manage Admin Privileges</div></div></div><div class="adm-sec-arrow">›</div>';
        calBtn.parentNode.appendChild(rolesBtn);
      }
    }

    // Dynamically inject Creator Avatar Outlines button for Jeshua Koh
    var isCreator = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    var creatorBtn = document.getElementById('sec-btn-creator-outlines');
    if (!creatorBtn) {
      var calBtnEl = document.getElementById('sec-btn-calendar');
      if (calBtnEl && calBtnEl.parentNode) {
        creatorBtn = document.createElement('div');
        creatorBtn.className = 'adm-section-btn';
        creatorBtn.id = 'sec-btn-creator-outlines';
        creatorBtn.onclick = function() { switchAdminSection('creator_outlines'); };
        creatorBtn.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="adm-sec-icon" style="background:rgba(139,92,246,0.15);color:#a855f7;"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg></div><div><div class="adm-sec-title">Creator Avatar Outlines</div><div class="adm-sec-sub">Assign Custom Outlines &amp; Animations</div></div></div><div class="adm-sec-arrow">›</div>';
        calBtnEl.parentNode.appendChild(creatorBtn);
      }
    }

    var visibleCount = 0;
    document.querySelectorAll('.adm-section-btn').forEach(function(b) {
      var secId = b.id.replace('sec-btn-', '');
      var isVisible = true;
      if (secId === 'roles') {
        isVisible = isSuper;
      } else if (secId === 'creator-outlines' || secId === 'creator_outlines') {
        isVisible = isCreator;
      } else if (typeof RBAC !== 'undefined' && typeof RBAC.hasModulePermission === 'function') {
        isVisible = RBAC.hasModulePermission(secId);
      }
      b.style.display = isVisible ? 'flex' : 'none';
      if (isVisible) visibleCount++;
    });

    var countEl = document.querySelector('.adm-modules-count');
    if (countEl) countEl.textContent = visibleCount + ' Modules';

    setAdminViewMode(getAdminViewMode());
  }

  function switchAdminSection(section) {
    if (typeof document === 'undefined') return;

    var toolbar = document.querySelector('.adm-toolbar-row');
    if (toolbar) toolbar.style.display = 'none';

    if (!verifyAdminSessionSync()) {
      if (typeof showToast === 'function') showToast('Unauthorized: Valid officer session token required.', 'error');
      logoutAdmin();
      return;
    }

    // Scoped Admin Permission Gate
    if (typeof RBAC !== 'undefined' && typeof RBAC.hasModulePermission === 'function') {
      if (!RBAC.hasModulePermission(section)) {
        if (typeof showToast === 'function') {
          showToast('Access Denied: You do not have permission to access the ' + section + ' module.', 'error');
        }
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'admin.unauthorized_section_attempt',
            targetType: 'admin_module',
            targetId: section,
            details: { attempted_section: section }
          });
        }
        return;
      }
    }

    document.querySelectorAll('.adm-section-btn').forEach(function(b) {
      b.style.display = 'none';
    });

    var backBar = document.getElementById('adm-back-bar');
    if (backBar) backBar.style.display = 'block';

    ADMIN_SECTIONS.forEach(function(s) {
      var el = document.getElementById('adm-section-' + s);
      if (el) el.style.display = 'none';
    });

    var rolesSec = document.getElementById('adm-section-roles');
    if (rolesSec && section !== 'roles') rolesSec.style.display = 'none';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec && section !== 'creator_outlines' && section !== 'creator-outlines') creatorSec.style.display = 'none';
    var target = document.getElementById('adm-section-' + section);
    if (target) target.style.display = 'block';

    if (section === 'creator_outlines' || section === 'creator-outlines') {
      var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
      if (!isCreatorUser) {
        if (typeof showToast === 'function') showToast('Access Denied: Only jeshuakoh2008@gmail.com has access to the Creator Avatar Outlines module.', 'error');
        backToAdminHome();
        return;
      }
      renderCreatorAvatarOutlinesStudio();
      return;
    }

    if (section === 'members') renderAdminList();

    if (section === 'orders') {
      if (typeof switchFormSubtab === 'function') switchFormSubtab('formbuilder');
      setTimeout(function() {
        if (typeof createRichEditor === 'function') {
          createRichEditor('fb-desc-container', 'fb-desc', 'Brief info about this form', 60);
        }
      }, 50);
    }

    if (section === 'uniform') {
      if (typeof switchUniformSubtab === 'function') switchUniformSubtab('products');
    }

    if (section === 'tasks') {
      switchDeptTab('all');
      setTimeout(function() {
        if (typeof createRichEditor === 'function') {
          createRichEditor('task-desc-container', 'task-desc', 'Task details...', 70);
        }
      }, 50);
    }

    if (section === 'announcements') {
      if (typeof renderAdminAnnList === 'function') renderAdminAnnList();
    }

    if (section === 'badges') {
      if (typeof switchBadgeSubtab === 'function') switchBadgeSubtab('badgedefs');
    }

    if (section === 'gallery') {
      if (typeof renderGallery === 'function') renderGallery();
      if (typeof renderAdminStoryHighlights === 'function') renderAdminStoryHighlights();
    }

    if (section === 'attendance') {
      if (typeof renderAdminMasterSheetPanel === 'function') renderAdminMasterSheetPanel();
    }

    if (section === 'resources') {
      if (typeof renderAdminResourcesPanel === 'function') renderAdminResourcesPanel();
    }

    if (section === 'calendar') {
      if (typeof renderAdminCalendarGrid === 'function') renderAdminCalendarGrid();
    }

    if (section === 'roles') {
      renderAdminRoles();
    }
  }

  function switchDeptTab(dept) {
    if (typeof document === 'undefined') return;
    var dConfig = getDeptConfig();

    ['all', 'secretariat', 'logistics', 'media', 'hq', 'officers'].forEach(function(d) {
      var btn = document.getElementById('dtab-' + d) || document.querySelector('[data-dept="' + d + '"]');
      if (!btn) return;
      var active = (d === dept);
      btn.classList.toggle('active-dept-tab', active);
      if (d !== 'all') {
        var cfg = dConfig[d];
        btn.style.background = (active && cfg) ? (cfg.color + '33') : 'transparent';
      }
    });

    renderAdminTasks(dept);
  }

  function toggleTaskForm() {
    if (typeof document === 'undefined') return;
    var body    = document.getElementById('task-form-body');
    var chevron = document.getElementById('task-form-chevron');
    var label   = document.getElementById('task-form-toggle-label');
    var open    = body && body.style.display === 'none';

    if (body)    body.style.display      = open ? 'block' : 'none';
    if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
    if (label)   label.textContent       = open ? '\u2715 Close Form' : '\u2795 Add New Task';
  }

  // ── Admin Members Management ──────────────────────────────────────────────

  function calcAge(dob) {
    if (!dob) return null;
    var d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    return new Date().getFullYear() - d.getFullYear();
  }

  function setAdminSort(by, dir) {
    if (dir) {
      _adminSortDir = dir;
    } else if (_adminSortBy === by) {
      _adminSortDir = (_adminSortDir === 'asc') ? 'desc' : 'asc';
    } else {
      _adminSortDir = 'asc';
    }
    _adminSortBy = by;
    if (typeof document !== 'undefined') {
      ['name', 'age', 'squad', 'rank', 'joined'].forEach(function(s) {
        var btn = document.getElementById('sort-' + s);
        if (btn) btn.classList.toggle('active-sort', s === by);
      });
      var deptBtn = document.querySelector('.adm-sort-btn[data-sort="dept"]');
      if (deptBtn) deptBtn.classList.toggle('active-sort', by === 'dept');
      var statusBtn = document.querySelector('.adm-sort-btn[data-sort="status"]');
      if (statusBtn) statusBtn.classList.toggle('active-sort', by === 'status');
    }
    return renderAdminList();
  }

  function getAdminMemberAvatarHtml(name, emailOrIc, size, presence) {
    var sz = size || 38;
    var fs = Math.max(12, Math.round(sz * 0.42));
    var cleanNm = name || 'Member';
    var isCreator = false;
    if (typeof isPortalCreator === 'function') {
      isCreator = isPortalCreator(cleanNm, emailOrIc);
    } else {
      isCreator = (emailOrIc && emailOrIc.toLowerCase().indexOf('jeshuakoh2008@gmail.com') !== -1);
    }
    var safeName = (typeof escapeHtml === 'function') ? escapeHtml(cleanNm) : cleanNm;
    var tooltip = safeName + (isCreator ? ' (Portal Creator)' : '');

    // Resolve presence status and dot indicator (matching top nav bar)
    var pInfo = presence;
    if (!pInfo) {
      if (typeof getMemberPresenceStatus === 'function') {
        var presMap = (_adminPresenceMap && Object.keys(_adminPresenceMap).length > 0) ? _adminPresenceMap : undefined;
        pInfo = getMemberPresenceStatus({ name: cleanNm, email: emailOrIc, ic: emailOrIc }, presMap);
      } else {
        pInfo = { status: 'offline', label: 'Offline', color: '#6b7280' };
      }
    }
    var dotColor = (pInfo && pInfo.color) ? pInfo.color : '#6b7280';
    var dotLabel = (pInfo && pInfo.label) ? pInfo.label : 'Offline';
    var pStatus = (pInfo && pInfo.status) ? pInfo.status : 'offline';
    var dotTitle = safeName + ' (' + dotLabel + ')';
    var presId = (emailOrIc && emailOrIc.indexOf('@') !== -1) ? emailOrIc : (emailOrIc || cleanNm);
    var dotHtml = '<span class="nav-avatar-status-dot admin-avatar-status-dot avatar-status-dot status-' + pStatus + '" data-presence-id="' + (typeof escapeHtml === 'function' ? escapeHtml(presId) : presId) + '" data-presence-name="' + (typeof escapeHtml === 'function' ? escapeHtml(cleanNm) : cleanNm) + '" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:' + dotColor + ';border:2px solid var(--bg-card,#1e293b);z-index:10;box-sizing:border-box;" title="' + (typeof escapeHtml === 'function' ? escapeHtml(dotTitle) : dotTitle) + '" aria-label="' + (typeof escapeHtml === 'function' ? escapeHtml(dotLabel) : dotLabel) + '"></span>';

    // Creator Avatar Outline Layering
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(emailOrIc, cleanNm)
      : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);

    var outlineHtml = '';
    var hasOutlineCls = '';
    if (outlineInfo && outlineInfo.style && outlineInfo.style !== 'none' && outlineInfo.config && outlineInfo.config.className) {
      hasOutlineCls = ' has-custom-outline avatar-outline-container';
      outlineHtml = '<span class="avatar-outline-overlay ' + outlineInfo.config.className + '" style="position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:2;box-sizing:border-box;" aria-hidden="true"></span>';
    }

    // Profile Cosmetic Layering
    var cosmeticInfo = (typeof getMemberCosmetic === 'function')
      ? getMemberCosmetic(emailOrIc, cleanNm)
      : null;
    var cosmeticHtml = '';
    if (cosmeticInfo && cosmeticInfo.id && cosmeticInfo.id !== 'none' && (cosmeticInfo.svg || (cosmeticInfo.config && cosmeticInfo.config.badgeHtml))) {
      var cosSvg = cosmeticInfo.svg || cosmeticInfo.config.badgeHtml;
      var cosName = cosmeticInfo.name || (cosmeticInfo.config && cosmeticInfo.config.name) || '';
      var isHeadwear = (cosmeticInfo.category === 'headwear' || (cosmeticInfo.config && cosmeticInfo.config.category === 'headwear'));
      var headwearCls = isHeadwear ? ' is-headwear' : '';
      var cosCls = sz >= 40 ? 'cosmetic-lg' : (sz >= 28 ? 'cosmetic-md' : (sz >= 22 ? 'cosmetic-sm' : 'cosmetic-xs'));
      cosmeticHtml = '<span class="avatar-cosmetic-badge ' + cosCls + headwearCls + '" data-cosmetic-id="' + (typeof escapeHtml === 'function' ? escapeHtml(cosmeticInfo.id) : cosmeticInfo.id) + '" title="' + (typeof escapeHtml === 'function' ? escapeHtml(cosName) : cosName) + '" aria-hidden="true">' + cosSvg + '</span>';
    }

    var photoUrl = null;
    if (typeof getMemberAvatarUrl === 'function') {
      photoUrl = getMemberAvatarUrl(cleanNm, emailOrIc);
    }

    if (photoUrl) {
      return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
        '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;" alt="' + safeName + '"/>' +
        outlineHtml +
        cosmeticHtml +
        dotHtml +
      '</span>';
    }

    if (isCreator) {
      var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
      var creatorCls = isRgb ? 'creator-outline-avatar creator-rgb-avatar' : '';
      return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
        '<span class="' + creatorCls + ' admin-member-avatar-initial" style="width:100%;height:100%;border-radius:50%;background:#083830;color:#ffffff;font-size:' + fs + 'px;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:700;">J</span>' +
        outlineHtml +
        cosmeticHtml +
        dotHtml +
      '</span>';
    }

    var initial = (typeof getMemberAvatarInitial === 'function')
      ? getMemberAvatarInitial(cleanNm, emailOrIc)
      : (cleanNm.trim().charAt(0).toUpperCase() || '?');

    var color = (typeof getMemberAvatarColor === 'function')
      ? getMemberAvatarColor(cleanNm)
      : '#0284c7';

    return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
      '<span class="admin-member-avatar-initial" style="width:100%;height:100%;border-radius:50%;background:' + color + ';color:#ffffff;font-size:' + fs + 'px;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(initial) : initial) + '</span>' +
      outlineHtml +
      cosmeticHtml +
      dotHtml +
    '</span>';
  }

  function renderSectionSelectOptions(curSec) {
    var secs = ['Pre-Junior', 'Junior', 'Senior', 'Officer'];
    var cur = (curSec || '').trim().toLowerCase();
    return secs.map(function(s) {
      var isSel = (s.toLowerCase() === cur) ? ' selected' : '';
      return '<option value="' + s + '"' + isSel + '>' + s + '</option>';
    }).join('');
  }

  function renderRankSelectOptions(curRank) {
    var ranks = [
      'Recruit',
      'Private',
      'Lance Corporal',
      'Corporal',
      'Sergeant',
      'Staff Sergeant',
      'Warrant Officer',
      'Lieutenant',
      'Captain',
      'Chaplain',
      'One Year Service',
      'Two Year Service',
      'Three Year Service',
      'Junior Target',
      'Junior Bronze',
      'Junior Silver',
      'Junior Gold'
    ];
    if (curRank && !ranks.includes(curRank)) {
      ranks.unshift(curRank);
    }
    var cur = (curRank || '').trim().toLowerCase();
    return '<option value="">(No rank)</option>' + ranks.map(function(r) {
      var isSel = (r.toLowerCase() === cur) ? ' selected' : '';
      return '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(r) : r) + '"' + isSel + '>' + (typeof escapeHtml === 'function' ? escapeHtml(r) : r) + '</option>';
    }).join('');
  }

  function renderSquadSelectOptions(curSquad) {
    var squads = [
      'Alpha Platoon',
      'Bravo Platoon',
      'Charlie Platoon',
      'Delta Platoon',
      'Echo Platoon',
      'Foxtrot Platoon',
      'Golf Platoon',
      'Hotel Platoon',
      'India Platoon',
      'Zulu Platoon',
      'Papa Platoon',
      'Officers',
      'Squad 1',
      'Squad 2',
      'Squad 3',
      'Squad 4',
      'Squad 5',
      'Squad 6'
    ];
    if (curSquad && !squads.includes(curSquad)) {
      squads.unshift(curSquad);
    }
    var cur = (curSquad || '').trim().toLowerCase();
    return '<option value="">(No platoon/squad)</option>' + squads.map(function(sq) {
      var isSel = (sq.toLowerCase() === cur) ? ' selected' : '';
      return '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(sq) : sq) + '"' + isSel + '>' + (typeof escapeHtml === 'function' ? escapeHtml(sq) : sq) + '</option>';
    }).join('');
  }

  function renderDeptSelectOptions(curDept) {
    var depts = [
      { id: '', label: 'No Department' },
      { id: 'secretariat', label: 'Secretariat' },
      { id: 'logistics', label: 'Logistics' },
      { id: 'media', label: 'Media' },
      { id: 'hq', label: 'HQ' },
      { id: 'officers', label: 'Officers' }
    ];
    var cur = (curDept || '').trim().toLowerCase();
    return depts.map(function(d) {
      var isSel = (d.id === cur) ? ' selected' : '';
      return '<option value="' + d.id + '"' + isSel + '>' + d.label + '</option>';
    }).join('');
  }

  var _adminMembersCache = null;
  var _adminMembersCacheTime = 0;
  var ADMIN_MEMBERS_CACHE_TTL = 30000;

  async function renderAdminList(forceRefresh) {
    if (typeof document === 'undefined') return;

    if (_adminMembersSubView === 'blocked_emails') {
      renderBlockedEmailsFullView();
      return;
    }

    var search = ((document.getElementById('admin-search') || {}).value || '').toLowerCase();
    var list   = document.getElementById('admin-members-list');
    if (!list) return;

    list.innerHTML = (typeof renderSkeletonTable === 'function') ? renderSkeletonTable(6, 6) : '<div class="skeleton-shimmer" style="height:180px;border-radius:8px;"></div>';

    var client = getSupabaseClient();
    if (!client || !client.get) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Database client unavailable.</div>';
      return;
    }

    try {
      // 1. Fetch live member presence map and synchronize across all modules
      _adminPresenceMap = {};
      if (typeof fetchRemoteMemberPresence === 'function') {
        try {
          _adminPresenceMap = await fetchRemoteMemberPresence(true) || {};
        } catch (_) {}
      } else {
        try {
          var pRes = await client.get('bb_config?key=eq.bb_member_presence&select=value');
          if (pRes && pRes.length && pRes[0].value) {
            _adminPresenceMap = (typeof pRes[0].value === 'string') ? JSON.parse(pRes[0].value) : pRes[0].value;
          }
        } catch (_) {}
      }
      if (!_adminPresenceMap && typeof localStorage !== 'undefined') {
        try {
          var localPresenceRaw = localStorage.getItem('bb_member_presence');
          if (localPresenceRaw) _adminPresenceMap = JSON.parse(localPresenceRaw);
        } catch (_) {}
      }
      _adminPresenceMap = _adminPresenceMap || {};
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('bb_member_presence', JSON.stringify(_adminPresenceMap)); } catch (_) {}
      }
      if (typeof window !== 'undefined') window._globalPresenceMap = _adminPresenceMap;
      if (typeof global !== 'undefined') global._adminPresenceMap = _adminPresenceMap;

      // 1b. Fetch deleted members blacklist from bb_config
      var deletedSet = new Set();
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          var arr = JSON.parse(cfgRes[0].value);
          if (Array.isArray(arr)) {
            arr.forEach(function(id) { deletedSet.add(id); });
          }
        }
      } catch (e) {}

      var now = Date.now();
      var members;
      if (!forceRefresh && _adminMembersCache && (now - _adminMembersCacheTime < ADMIN_MEMBERS_CACHE_TTL)) {
        members = _adminMembersCache;
      } else {
        try {
          members = await client.get('bb_members?select=ic,email,name,rank,squad,section,att_section,department,date_of_birth,joined_at&order=name.asc');
        } catch (selectErr) {
          console.warn('Detailed bb_members query failed, retrying with select all:', selectErr);
          members = await client.get('bb_members?order=name.asc');
        }
        if (!Array.isArray(members)) members = [];
        _adminMembersCache = members;
        _adminMembersCacheTime = now;
      }
      // Active non-deleted members calculation (Fixes '5 of 28' count discrepancy)
      var activeMembers = members.filter(function(m) {
        if (typeof isDeletedOrTestAccount === 'function' && isDeletedOrTestAccount(m)) return false;
        if (deletedSet.has(m.ic)) return false;
        if (m.department === 'deleted' || m.department === 'archived_deleted') return false;
        return true;
      });

      var filtered = activeMembers.filter(function(m) {
        // Search text filter
        if (search) {
          var sMatches = (m.name || '').toLowerCase().includes(search) ||
                         (m.ic || '').toLowerCase().includes(search) ||
                         (m.email || '').toLowerCase().includes(search);
          if (!sMatches) return false;
        }

        if (_adminMemberFilters.nameSearch) {
          var nsMatches = (m.name || '').toLowerCase().includes(_adminMemberFilters.nameSearch.toLowerCase()) ||
                          (m.ic || '').toLowerCase().includes(_adminMemberFilters.nameSearch.toLowerCase()) ||
                          (m.email || '').toLowerCase().includes(_adminMemberFilters.nameSearch.toLowerCase());
          if (!nsMatches) return false;
        }

        if (_adminMemberFilters.emailSearch) {
          var emMatches = (m.email || m.ic || '').toLowerCase().includes(_adminMemberFilters.emailSearch.toLowerCase());
          if (!emMatches) return false;
        }

        // Section filter
        if (_adminMemberFilters.section) {
          var mSec = (m.section || m.att_section || '').toLowerCase();
          var fSec = _adminMemberFilters.section.toLowerCase();
          if (fSec === 'officer' ? mSec !== 'officer' : mSec !== fSec) return false;
        }

        // Rank filter
        if (_adminMemberFilters.rank) {
          if ((m.rank || '').toLowerCase() !== _adminMemberFilters.rank.toLowerCase()) return false;
        }

        // Squad filter
        if (_adminMemberFilters.squad) {
          if ((m.squad || '').toLowerCase() !== _adminMemberFilters.squad.toLowerCase()) return false;
        }

        // Department filter
        if (_adminMemberFilters.dept) {
          var curDept = (m.department || '').toLowerCase();
          var fDept = _adminMemberFilters.dept.toLowerCase();
          if (fDept === 'none' || fDept === 'no-dept') {
            if (curDept && curDept !== 'none') return false;
          } else {
            if (curDept !== fDept) return false;
          }
        }

        // Status filter (Verification Status)
        if (_adminMemberFilters.status) {
          var vSt = getMemberVerificationStatus(m);
          if (vSt !== _adminMemberFilters.status.toLowerCase()) {
            var pResolver = (typeof getMemberPresenceStatus === 'function')
              ? getMemberPresenceStatus
              : function() { return { status: 'offline' }; };
            var st = pResolver(m, _adminPresenceMap).status;
            if (st !== _adminMemberFilters.status.toLowerCase()) return false;
          }
        }

        // Consent filter
        if (_adminMemberFilters.consent) {
          var ageVal = calcAge(m.date_of_birth);
          var isMinorVal = (typeof isMinorSection === 'function')
            ? isMinorSection(m.att_section || m.section, ageVal)
            : ((ageVal !== null && ageVal <= 11) || (m.att_section === 'Pre-Junior' || m.att_section === 'Junior'));
          if (_adminMemberFilters.consent === 'ok') {
            if (!isMinorVal || (!m.parental_consent_signed && !m.parent_name)) return false;
          } else if (_adminMemberFilters.consent === 'pending') {
            if (!isMinorVal || (m.parental_consent_signed || m.parent_name)) return false;
          } else if (_adminMemberFilters.consent === 'no_media') {
            if (m.media_consent !== false) return false;
          }
        }

        return true;
      });

      // Sort
      filtered.sort(function(a, b) {
        var comp = 0;
        if (_adminSortBy === 'age') {
          var aa = calcAge(a.date_of_birth);
          var ba = calcAge(b.date_of_birth);
          if (aa === null && ba === null) comp = 0;
          else if (aa === null) comp = 1;
          else if (ba === null) comp = -1;
          else comp = aa - ba;
        } else if (_adminSortBy === 'status') {
          var vOrd = { verified: 0, processing: 1, rejected: 2, not_verified: 3 };
          var stA = getMemberVerificationStatus(a);
          var stB = getMemberVerificationStatus(b);
          var ordA = vOrd[stA] !== undefined ? vOrd[stA] : 9;
          var ordB = vOrd[stB] !== undefined ? vOrd[stB] : 9;
          if (ordA !== ordB) comp = ordA - ordB;
          else comp = (a.name || '').localeCompare(b.name || '');
        } else if (_adminSortBy === 'email') {
          comp = (a.email || a.ic || '').localeCompare(b.email || b.ic || '');
        } else if (_adminSortBy === 'dob') {
          comp = (a.date_of_birth || '').localeCompare(b.date_of_birth || '');
        } else if (_adminSortBy === 'squad') {
          var sq = (a.squad || '').localeCompare(b.squad || '');
          comp = sq !== 0 ? sq : (a.name || '').localeCompare(b.name || '');
        } else if (_adminSortBy === 'rank') {
          var ri = RANK_ORDER.indexOf(a.rank || '');
          var rj = RANK_ORDER.indexOf(b.rank || '');
          if (ri === -1) ri = 99;
          if (rj === -1) rj = 99;
          comp = ri - rj;
        } else if (_adminSortBy === 'section') {
          var secA = a.section || a.att_section || '';
          var secB = b.section || b.att_section || '';
          var sComp = secA.localeCompare(secB);
          comp = sComp !== 0 ? sComp : (a.name || '').localeCompare(b.name || '');
        } else if (_adminSortBy === 'dept') {
          var currentDeptKeyA = (a.department || '').trim().toLowerCase();
          var currentDeptKeyB = (b.department || '').trim().toLowerCase();
          var depLabelA = (DEFAULT_DEPT_CONFIG[currentDeptKeyA] && DEFAULT_DEPT_CONFIG[currentDeptKeyA].label) || a.department || 'No Dept';
          var depLabelB = (DEFAULT_DEPT_CONFIG[currentDeptKeyB] && DEFAULT_DEPT_CONFIG[currentDeptKeyB].label) || b.department || 'No Dept';
          var dComp = depLabelA.localeCompare(depLabelB);
          comp = dComp !== 0 ? dComp : (a.name || '').localeCompare(b.name || '');
        } else if (_adminSortBy === 'joined') {
          comp = (a.joined_at || '').localeCompare(b.joined_at || '');
        } else {
          comp = (a.name || '').localeCompare(b.name || '');
        }

        return _adminSortDir === 'desc' ? -comp : comp;
      });

      _adminMembers = {};
      filtered.forEach(function(m) { _adminMembers[m.ic] = m; });
      if (typeof global !== 'undefined') global._adminMembers = _adminMembers;
      global._adminPresenceMap = _adminPresenceMap;
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('bb_members_cache', JSON.stringify(filtered)); } catch (_) {}
      }

      _lastFilteredMembers = filtered;

      // ── TOP OVERVIEW STATS PILLS (IMAGE 5) ──
      var totalUsers = activeMembers.length;
      var verifiedUsers = activeMembers.filter(function(m) {
        return getMemberVerificationStatus(m) === 'verified';
      }).length;
      var preJuniorUsers = activeMembers.filter(function(m) {
        var s = (m.section || m.att_section || '').toLowerCase();
        return s === 'pre-junior';
      }).length;
      var juniorUsers = activeMembers.filter(function(m) {
        var s = (m.section || m.att_section || '').toLowerCase();
        return s === 'junior';
      }).length;
      var seniorUsers = activeMembers.filter(function(m) {
        var s = (m.section || m.att_section || '').toLowerCase();
        return s === 'senior';
      }).length;

      var summarySlot = document.querySelector('.adm-topbar-summary-slot');
      if (summarySlot) {
        summarySlot.innerHTML =
          '<div class="adm-overview-pills">' +
            '<span class="adm-overview-pill" title="Total Users: ' + totalUsers + '" onclick="filterByOverviewCategory(\'all\')">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
              '<span>' + totalUsers + '</span>' +
            '</span>' +
            '<span class="adm-overview-pill" title="Verified Users: ' + verifiedUsers + '" onclick="filterByOverviewCategory(\'verified\')">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>' +
              '<span>' + verifiedUsers + '</span>' +
            '</span>' +
            '<span class="adm-overview-pill" title="Pre-Junior Users: ' + preJuniorUsers + '" onclick="filterByOverviewCategory(\'Pre-Junior\')">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/></svg>' +
              '<span>' + preJuniorUsers + '</span>' +
            '</span>' +
            '<span class="adm-overview-pill" title="Junior Users: ' + juniorUsers + '" onclick="filterByOverviewCategory(\'Junior\')">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
              '<span>' + juniorUsers + '</span>' +
            '</span>' +
            '<span class="adm-overview-pill" title="Senior Users: ' + seniorUsers + '" onclick="filterByOverviewCategory(\'Senior\')">' +
              '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' +
              '<span>' + seniorUsers + '</span>' +
            '</span>' +
          '</div>';
      }

      // Update Selection UI & Row Actions Button Slot
      updateSelectionUI();

      var isFilteringActive = !!(_adminMemberFilters.section || _adminMemberFilters.rank || _adminMemberFilters.squad || _adminMemberFilters.dept || _adminMemberFilters.status || _adminMemberFilters.consent || _adminMemberFilters.nameSearch || _adminMemberFilters.emailSearch || search);

      var toolbarHtml = '<div class="admin-members-toolbar">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            (isFilteringActive
              ? '<button type="button" class="portal-btn" onclick="resetAdminMemberFilters()" style="background:var(--bg-card-subtle);border:1px dashed var(--border-card);color:var(--text-secondary);font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:5px;" title="Reset all column filters and search">' +
                  '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Reset Filters' +
                '</button>'
              : '') +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);font-weight:600;">' +
            'Showing <strong style="color:var(--gold);">' + filtered.length + '</strong> of ' + activeMembers.length + ' users' +
          '</div>' +
        '</div>' +
      '</div>';

      var editBannerHtml = _adminMemberEditMode
        ? '<div class="admin-edit-mode-banner"><span style="display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <strong>Edit Mode Active:</strong> You can edit member name, section, rank, platoon/squad, department, and DOB directly in table cells. Changes autosave to the database.</span><button type="button" onclick="toggleAdminMemberEditMode()" style="background:none;border:1px solid currentColor;color:inherit;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">Exit Edit Mode</button></div>'
        : '';

      if (!filtered.length) {
        list.innerHTML = toolbarHtml + '<div style="color:var(--text-muted);text-align:center;padding:36px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:12px;">'
          + '<div style="margin-bottom:8px;"><svg class="ui-icon-lg" style="opacity:0.4;width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
          + '<div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;font-size:14px;">No members found</div>'
          + '<div style="font-size:12px;color:var(--text-muted);">Try adjusting your search query or column filters.</div>'
          + '</div>';
        return;
      }

      var html = '';

      if (_adminMembersViewMode === 'table') {
        var tableRowsHtml = '';
        var isAllSelected = (filtered.length > 0 && _selectedMemberIcs.size === filtered.length);

        filtered.forEach(function(m, idx) {
          var age = calcAge(m.date_of_birth);
          var ageStr = age !== null ? (age + ' years') : '\u2014';
          var dobStr = m.date_of_birth ? m.date_of_birth.slice(0, 10) : '\u2014';
          var isMinor = (typeof isMinorSection === 'function')
            ? isMinorSection(m.att_section || m.section, age)
            : ((age !== null && age <= 11) || (m.att_section === 'Pre-Junior' || m.att_section === 'Junior'));

          var consentBadge = '';
          if (isMinor) {
            var hasConsent = !!m.parental_consent_signed || !!m.parent_name;
            if (hasConsent) {
              consentBadge = '<span title="Parental Consent Verified" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(74,222,128,0.15);color:var(--green);font-weight:700;"><svg class="ui-icon-xs" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Consent OK</span>';
            } else {
              consentBadge = '<span title="Parental Consent Pending" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(234,179,8,0.15);color:var(--accent);font-weight:700;"><svg class="ui-icon-xs" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Pending</span>';
            }
            if (m.media_consent === false) {
              consentBadge += ' <span title="No Public Media" style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(239,68,68,0.12);color:var(--red);font-weight:700;margin-left:2px;">No Media</span>';
            }
          }

          var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name || '\u2014') : (m.name || '\u2014');
          var safeIc   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic) : m.ic;
          var safeEmail= (typeof escapeHtml === 'function') ? escapeHtml(m.email || m.ic || '\u2014') : (m.email || m.ic || '\u2014');
          var rawDisplaySquad = (typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad(m.squad, m.section || m.att_section) : '') || (((m.section || m.att_section || '').toLowerCase() === 'officer') ? 'Officer' : 'No platoon/squad');
          var safeSquad= (typeof escapeHtml === 'function') ? escapeHtml(rawDisplaySquad) : rawDisplaySquad;
          var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'No rank') : (m.rank || 'No rank');
          var safeSection = (typeof escapeHtml === 'function') ? escapeHtml(m.section || m.att_section || '\u2014') : (m.section || m.att_section || '\u2014');

          var deptKey = (m.department || '').trim().toLowerCase();
          var deptBadge = '';
          if (deptKey && deptKey !== 'none' && DEFAULT_DEPT_CONFIG[deptKey]) {
            var conf = DEFAULT_DEPT_CONFIG[deptKey];
            deptBadge = '<span class="dept-badge ' + conf.cls + '">' + conf.label + '</span>';
          } else {
            deptBadge = '<span class="dept-badge-none">\u2014</span>';
          }

          var pResolver = (typeof getMemberPresenceStatus === 'function')
            ? getMemberPresenceStatus
            : function() { return { status: 'offline', label: 'Offline', color: '#6b7280' }; };
          var pInfo = pResolver(m, _adminPresenceMap);
          var avatarHtml = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 28, pInfo);
          var vStatus = getMemberVerificationStatus(m);
          var isSel = _selectedMemberIcs.has(m.ic);

          if (!_adminMemberEditMode) {
            tableRowsHtml += '<tr class="admin-table-row' + (isSel ? ' is-selected' : '') + '" data-ic="' + safeIc + '" data-edit-ic="' + safeIc + '" style="cursor:pointer;">' +
              '<td class="crm-cell-num" style="width:52px;min-width:52px;text-align:center;">' +
                '<span class="crm-row-index">' + (idx + 1) + '</span>' +
                '<div class="crm-row-hover-actions">' +
                  '<input type="checkbox" class="adm-row-chk" data-ic="' + safeIc + '" onchange="toggleSelectMemberRow(\'' + safeIc + '\', this.checked)" ' + (isSel ? 'checked' : '') + ' onclick="event.stopPropagation();" />' +
                  '<button type="button" class="adm-row-pencil-btn" onclick="event.stopPropagation();openEditMember(\'' + safeIc + '\');" title="Edit ' + safeName + ' in Side Drawer">' +
                    '<svg class="ui-icon-xs" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                  '</button>' +
                '</div>' +
              '</td>' +
              '<td style="white-space:nowrap;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                  avatarHtml +
                  '<span style="font-weight:600;color:var(--text-primary);">' + safeName + '</span>' +
                '</div>' +
              '</td>' +
              '<td style="white-space:nowrap;">' +
                '<span class="admin-member-email" style="font-family:var(--font-mono, monospace);font-size:12px;">' + safeEmail + '</span>' +
              '</td>' +
              '<td style="white-space:nowrap;font-weight:600;color:var(--text-secondary);">' +
                safeSection +
              '</td>' +
              '<td style="white-space:nowrap;font-size:14px;font-family:\'Inter\',sans-serif;">' +
                '<span class="crm-rank-text" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:14px;color:var(--text-primary);white-space:nowrap;">' +
                  getRankInsigniaSvg(m.rank) +
                  '<span>' + safeRank + '</span>' +
                '</span>' +
              '</td>' +
              '<td style="white-space:nowrap;color:var(--text-secondary);font-size:12px;font-weight:500;">' +
                safeSquad +
              '</td>' +
              '<td style="white-space:nowrap;">' +
                deptBadge +
              '</td>' +
              '<td style="white-space:nowrap;font-weight:600;color:var(--text-primary);font-size:12px;">' +
                ageStr +
              '</td>' +
              '<td style="white-space:nowrap;font-family:var(--font-mono, monospace);font-size:12px;color:var(--text-secondary);" class="admin-member-dob">' +
                dobStr +
              '</td>' +
              '<td style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                renderStatusBadge(vStatus) +
              '</td>' +
              '<td style="white-space:nowrap;">' +
                (consentBadge || '<span style="font-size:11px;color:var(--text-muted);">\u2014</span>') +
              '</td>' +
              '<td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation();">' +
                '<button type="button" class="adm-row-del-btn" data-del-ic="' + safeIc + '" data-del-name="' + ((typeof escapeHtml === 'function') ? escapeHtml(m.name || '') : (m.name || '')) + '" title="Delete Member Account" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:6px;padding:4px 8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">' +
                  '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                '</button>' +
              '</td>' +
            '</tr>';
          } else {
            tableRowsHtml += '<tr class="admin-table-row admin-table-row-editing">' +
              '<td class="crm-cell-num"><span class="crm-row-index">' + (idx + 1) + '</span></td>' +
              '<td style="min-width:180px;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  avatarHtml +
                  '<div style="flex:1;min-width:0;">' +
                    '<input type="text" class="admin-inline-input" value="' + safeName + '" onchange="updateMemberField(\'' + safeIc + '\', \'name\', this.value)" title="Edit Name (Autosaves on change)" />' +
                    '<div class="admin-member-email" style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono,monospace);margin-top:2px;overflow:hidden;text-overflow:ellipsis;">' + (m.ic.indexOf('@') !== -1 ? safeIc : ('ID: ' + safeIc)) + '</div>' +
                  '</div>' +
                '</div>' +
              '</td>' +
              '<td style="min-width:140px;">' +
                '<input type="text" class="admin-inline-input" value="' + safeEmail + '" onchange="updateMemberField(\'' + safeIc + '\', \'email\', this.value)" title="Edit Email" />' +
              '</td>' +
              '<td style="min-width:110px;">' +
                '<select class="admin-inline-select" onchange="updateMemberField(\'' + safeIc + '\', \'section\', this.value)" title="Change Section">' +
                  renderSectionSelectOptions(m.section || m.att_section) +
                '</select>' +
              '</td>' +
              '<td style="min-width:130px;">' +
                '<select class="admin-inline-select" onchange="updateMemberField(\'' + safeIc + '\', \'rank\', this.value)" title="Change Rank">' +
                  renderRankSelectOptions(m.rank) +
                '</select>' +
              '</td>' +
              '<td style="min-width:140px;">' +
                '<select class="admin-inline-select" onchange="updateMemberField(\'' + safeIc + '\', \'squad\', this.value)" title="Change Platoon/Squad">' +
                  renderSquadSelectOptions(m.squad) +
                '</select>' +
              '</td>' +
              '<td style="min-width:130px;">' +
                '<select class="admin-inline-select" onchange="updateMemberField(\'' + safeIc + '\', \'department\', this.value)" title="Change Department NCO Role">' +
                  renderDeptSelectOptions(m.department) +
                '</select>' +
              '</td>' +
              '<td style="min-width:80px;"><span style="font-size:12px;font-weight:600;">' + ageStr + '</span></td>' +
              '<td style="min-width:140px;">' +
                '<input type="date" class="admin-inline-input" value="' + (m.date_of_birth ? m.date_of_birth.slice(0, 10) : '') + '" onchange="updateMemberField(\'' + safeIc + '\', \'date_of_birth\', this.value)" title="Change Date of Birth" />' +
              '</td>' +
              '<td>' + renderStatusBadge(vStatus) + '</td>' +
              '<td>' + (consentBadge || '<span style="font-size:11px;color:var(--text-muted);">\u2014</span>') + '</td>' +
              '<td style="text-align:right;white-space:nowrap;">' +
                '<button class="adm-row-del-btn" data-del-ic="' + safeIc + '" data-del-name="' + ((typeof escapeHtml === 'function') ? escapeHtml(m.name || '') : (m.name || '')) + '" title="Delete Member Account" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:6px;padding:4px 8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">' +
                  '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                '</button>' +
              '</td>' +
            '</tr>';
          }
        });

        html = toolbarHtml + editBannerHtml +
          '<div class="admin-members-table-wrapper">' +
            '<table class="admin-members-table">' +
              '<thead>' +
                '<tr>' +
                  '<th class="sheets-th crm-th crm-th-num" style="width:52px;min-width:52px;text-align:center;">' +
                    '<input type="checkbox" id="adm-master-chk" class="adm-master-chk" onchange="toggleSelectAllMembers(this.checked)" title="Select all users" ' + (isAllSelected ? 'checked' : '') + ' />' +
                  '</th>' +
                  renderColumnHeader('member', 'Full Name', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', 'name', 'search', filtered) +
                  renderColumnHeader('email', 'Email', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>', 'email', 'search', filtered) +
                  renderColumnHeader('section', 'Section', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', 'section', 'options', filtered) +
                  renderColumnHeader('rank', 'Rank', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', 'rank', 'options', filtered) +
                  renderColumnHeader('squad', 'Platoon / Squad', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', 'squad', 'options', filtered) +
                  renderColumnHeader('dept', 'Department', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', 'dept', 'options', filtered) +
                  renderColumnHeader('age', 'Age', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', 'age', null, filtered) +
                  renderColumnHeader('dob', 'DOB', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', 'dob', null, filtered) +
                  renderColumnHeader('status', 'Status', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', 'status', 'options', filtered) +
                  renderColumnHeader('consent', 'Consent', '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>', null, 'options', filtered) +
                  '<th class="sheets-th crm-th" style="text-align:right;"><div class="sheets-th-content crm-th-content" style="justify-content:flex-end;"><span class="crm-th-icon"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="sheets-th-label crm-th-label">Actions</span></div></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' +
                tableRowsHtml +
              '</tbody>' +
            '</table>' +
          '</div>';
      } else {
        // Group headers when sorting by squad in cards view
        var lastSquad = null;
        var lastDept = null;
        var cardRowsHtml = '';

        filtered.forEach(function(m) {
          var age = calcAge(m.date_of_birth);
          var ageStr = age !== null ? (age + ' years') : '\u2014';
          var isMinor = (typeof isMinorSection === 'function')
            ? isMinorSection(m.att_section || m.section, age)
            : ((age !== null && age <= 11) || (m.att_section === 'Pre-Junior' || m.att_section === 'Junior'));

          var consentBadge = '';
          if (isMinor) {
            var hasConsent = !!m.parental_consent_signed || !!m.parent_name;
            if (hasConsent) {
              consentBadge = ' <span title="Child Safety: Parental Consent Verified" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(74,222,128,0.15);color:var(--green);font-weight:700;vertical-align:middle;margin-left:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Consent OK</span>';
            } else {
              consentBadge = ' <span title="Child Safety: Parental Consent Pending" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.15);color:var(--accent);font-weight:700;vertical-align:middle;margin-left:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Consent Pending</span>';
            }
            if (m.media_consent === false) {
              consentBadge += ' <span title="Privacy: Media release private / no public photos" style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(239,68,68,0.12);color:var(--red);font-weight:700;vertical-align:middle;margin-left:2px;">No Media</span>';
            }
          }

          if (_adminSortBy === 'squad') {
            var sq = m.squad || 'No Platoon/Squad';
            if (sq !== lastSquad) {
              var fmtSquadFn = (typeof formatPlatoonOrSquad === 'function') ? formatPlatoonOrSquad : (typeof global !== 'undefined' && typeof global.formatPlatoonOrSquad === 'function' ? global.formatPlatoonOrSquad : null);
              var groupHeading = (fmtSquadFn ? fmtSquadFn(m.squad, m.section || m.att_section) : '') || (((m.section || m.att_section || '').toLowerCase() === 'officer') ? 'Officer' : 'No Platoon/Squad');
              cardRowsHtml += '<div style="font-family:var(--font-headline);font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;padding:10px 4px 4px;">' + groupHeading + '</div>';
              lastSquad = sq;
            }
          }
          if (_adminSortBy === 'dept') {
            var currentDeptKey = (m.department || '').trim().toLowerCase();
            var depLabel = (currentDeptKey === 'department nco' || currentDeptKey === 'dept nco') ? 'Department NCO' : ((DEFAULT_DEPT_CONFIG[currentDeptKey] && DEFAULT_DEPT_CONFIG[currentDeptKey].label) || (m.department ? m.department : 'No Department NCO Role (No Tasks Access)'));
            if (depLabel !== lastDept) {
              cardRowsHtml += '<div style="font-family:var(--font-headline);font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;padding:12px 4px 6px;">' + ((typeof escapeHtml === 'function') ? escapeHtml(depLabel) : depLabel) + '</div>';
              lastDept = depLabel;
            }
          }

          var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name) : m.name;
          var safeIc   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic) : m.ic;
          var rawDisplaySquad = (typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad(m.squad, m.section || m.att_section) : '') || (((m.section || m.att_section || '').toLowerCase() === 'officer') ? 'Officer' : 'No platoon/squad');
          var safeSquad= (typeof escapeHtml === 'function') ? escapeHtml(rawDisplaySquad) : rawDisplaySquad;
          var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'No rank') : (m.rank || 'No rank');

          var deptConfig = DEFAULT_DEPT_CONFIG[(m.department || '').toLowerCase()];
          var deptBadge = '';
          if (deptConfig) {
            deptBadge = ' <span class="dept-badge ' + (deptConfig.cls || '') + '" title="Department NCO: Has Projects & Tasks Access" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 7px;border-radius:10px;background:' + (deptConfig.color ? deptConfig.color + '26' : 'rgba(217,163,35,0.15)') + ';color:' + (deptConfig.color || 'var(--accent)') + ';font-weight:700;letter-spacing:0.3px;margin-left:4px;border:1px solid ' + (deptConfig.color ? deptConfig.color + '55' : 'rgba(217,163,35,0.3)') + ';vertical-align:middle;">' + ((typeof escapeHtml === 'function') ? escapeHtml(deptConfig.label) : deptConfig.label) + '</span>';
          } else {
            deptBadge = ' <span title="No Department: Cannot access Projects & Tasks" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 6px;border-radius:10px;background:var(--bg-card-subtle);color:var(--text-muted);font-weight:600;margin-left:4px;border:1px solid var(--border-subtle);vertical-align:middle;">No Dept</span>';
          }

          var pResolver = (typeof getMemberPresenceStatus === 'function')
            ? getMemberPresenceStatus
            : function() { return { status: 'offline', label: 'Offline', color: '#6b7280' }; };
          var pInfo = pResolver(m, _adminPresenceMap);
          var avatarHtml = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 38, pInfo);
          var presenceBadge = ' <span class="admin-presence-badge" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:' + pInfo.color + ';vertical-align:middle;margin-left:4px;" title="' + ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) + '"><span style="width:7px;height:7px;border-radius:50%;background:' + pInfo.color + ';display:inline-block;"></span> ' + ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) + '</span>';

          cardRowsHtml += '<div class="admin-row" data-edit-ic="' + safeIc + '" style="cursor:pointer;display:flex;align-items:center;gap:12px;">'
            + avatarHtml
            + '<div style="flex:1;min-width:0;">'
              + '<div class="admin-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + consentBadge + deptBadge + '</div>'
              + '<div class="admin-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (m.ic.indexOf('@') !== -1 ? safeIc : ('ID: ' + safeIc)) + ' \xb7 ' + safeSquad + ' \xb7 ' + safeRank + (m.department ? (' \xb7 ' + ((typeof escapeHtml === 'function') ? escapeHtml((deptConfig && deptConfig.label) || m.department) : m.department)) : '') + ' \xb7 ' + presenceBadge + '</div>'
            + '</div>'
            + '<div style="text-align:right;flex-shrink:0;">'
              + '<div class="admin-rank-badge">' + ((typeof escapeHtml === 'function') ? escapeHtml(m.rank || '\u2014') : (m.rank || '\u2014')) + '</div>'
              + '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">' + ageStr + '</div>'
            + '</div>'
            + '<button class="adm-row-del-btn" data-del-ic="' + safeIc + '" data-del-name="' + ((typeof escapeHtml === 'function') ? escapeHtml(m.name || '') : (m.name || '')) + '" title="Delete Member Account" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:8px;padding:7px 10px;margin-left:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">'
              + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>'
            + '<div style="color:var(--text-muted);font-size:18px;margin-left:4px;">\u203a</div></div>';
        });

        html = toolbarHtml + editBannerHtml + cardRowsHtml;
      }

      list.innerHTML = html;

      list.querySelectorAll('[data-edit-ic]').forEach(function(row) {
        row.addEventListener('click', function(e) {
          if (e.target.closest('.adm-row-del-btn') || e.target.closest('input') || e.target.closest('select') || e.target.closest('button')) return;
          openEditMember(row.getAttribute('data-edit-ic'));
        });
      });

      list.querySelectorAll('.adm-row-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var ic = btn.getAttribute('data-del-ic');
          var name = btn.getAttribute('data-del-name');
          deleteMemberAccount(ic, name, e);
        });
      });
    } catch (e) {
      console.error('renderAdminList error:', e);
      list.innerHTML = '<div class="admin-error-card" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;color:var(--text-secondary);">'
        + '<div style="font-size:24px;margin-bottom:6px;">⚠️</div>'
        + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Failed to load members roster</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Database request timed out or network was interrupted.</div>'
        + '<button type="button" class="portal-btn portal-btn-secondary" onclick="renderAdminList()" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:6px 14px;font-size:12px;cursor:pointer;">'
        + '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
        + 'Retry</button></div>';
    }
  }

  function handleAdminRankChange() {
    if (typeof document === 'undefined') return;
    var rankEl = document.getElementById('em-rank');
    var secEl = document.getElementById('em-section');
    if (!rankEl || !secEl) return;
    var r = rankEl.value;
    if (!r) return;
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    if (typeof secRankFn === 'function') {
      var inferred = secRankFn(r);
      if (inferred && secEl.value !== inferred) {
        secEl.value = inferred;
        handleAdminSectionChange(true);
      }
    }
  }

  function handleAdminSectionChange(preserveRank) {
    if (typeof document === 'undefined') return;
    var sec = (document.getElementById('em-section') || {}).value || '';
    var dob = (document.getElementById('em-dob') || {}).value || '';
    var age = (typeof calcAge === 'function') ? calcAge(dob) : null;
    var isMinor = (typeof isMinorSection === 'function')
      ? isMinorSection(sec, age)
      : (sec === 'Pre-Junior' || sec === 'Junior' || (sec !== 'Officer' && age !== null && age <= 11));

    var rankEl = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (rankEl && typeof popRank === 'function') {
      var curRank = rankEl.value;
      popRank(rankEl, sec, curRank, sec ? null : 'Select section first...', !!preserveRank);
    }

    var squadEl = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (squadEl && typeof popSquad === 'function') {
      var curSquad = squadEl.value;
      var isOff = (typeof normalizeSection === 'function' ? normalizeSection(sec) : String(sec).toLowerCase()) === 'officer';
      var plHolder = isOff ? 'No platoon/squad (Officer)' : (sec ? (sec === 'Junior' ? 'No squad' : 'No platoon') : 'Select section first...');
      popSquad(squadEl, sec, curSquad, plHolder, !!preserveRank);
      squadEl.disabled = isOff;
    }

    var box = document.getElementById('em-child-safety-box');
    if (box) {
      if (isMinor) {
        box.style.border = '1px solid rgba(217,163,35,0.45)';
        box.style.background = 'rgba(217,163,35,0.08)';
      } else {
        box.style.border = '1px solid var(--border-card)';
        box.style.background = 'var(--bg-card-subtle)';
      }
    }
  }

  function openAddMember() {
    if (typeof document === 'undefined') return;
    if (!verifyAdminSessionSync()) {
      logoutAdmin();
      return;
    }
    [
      'em-name', 'em-ic', 'em-joined', 'em-dob',
      'em-parent-name', 'em-parent-contact'
    ].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    ['em-rank', 'em-squad', 'em-dept', 'em-section'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var emRankAdd = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (emRankAdd && typeof popRank === 'function') {
      popRank(emRankAdd, '', '', 'Select section first...', false);
    }
    var emSquadAdd = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (emSquadAdd && typeof popSquad === 'function') {
      popSquad(emSquadAdd, '', '', 'Select section first...', false);
      emSquadAdd.disabled = false;
    }

    var pc = document.getElementById('em-parent-consent');
    if (pc) pc.checked = false;
    var existingPresCard = document.querySelector('.em-profile-presence-card');
    if (existingPresCard) existingPresCard.style.display = 'none';

    var mc = document.getElementById('em-media-consent');
    if (mc) mc.checked = false;

    var cm = document.getElementById('em-consent-meta');
    if (cm) cm.textContent = '';

    var ic = document.getElementById('em-ic');
    if (ic) ic.readOnly = false;

    var ti = document.getElementById('em-modal-title');
    if (ti) ti.textContent = '\u2795 Add New Member';

    var db = document.getElementById('em-delete-btn');
    if (db) db.style.display = 'none';

    var oi = document.getElementById('em-original-ic');
    if (oi) oi.value = '';

    var modal = document.getElementById('edit-member-modal');
    if (modal) {
      modal.setAttribute('data-original-name', '');
      modal.style.display = 'block';
    }
  }

  function openEditMember(ic) {
    if (typeof document === 'undefined') return;
    var m = (_adminMembers && _adminMembers[ic]) || { ic: ic };
    // Dynamically inject/update member profile presence card header
    var modalContainer = document.querySelector('#edit-member-modal > div');
    if (modalContainer) {
      var presCard = modalContainer.querySelector('.em-profile-presence-card');
      if (!presCard) {
        presCard = document.createElement('div');
        presCard.className = 'em-profile-presence-card';
        var titleRow = modalContainer.firstElementChild;
        if (titleRow && titleRow.nextElementSibling) {
          modalContainer.insertBefore(presCard, titleRow.nextElementSibling);
        } else {
          modalContainer.appendChild(presCard);
        }
      }
      presCard.style.display = 'flex';
      var pResolver = (typeof getMemberPresenceStatus === 'function')
        ? getMemberPresenceStatus
        : function() { return { status: 'offline', label: 'Offline', color: '#6b7280' }; };
      var pInfo = pResolver(m, _adminPresenceMap);
      var presAvatar = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 44, pInfo);
      var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name || 'Member') : (m.name || 'Member');
      var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'Member') : (m.rank || 'Member');
      var safeId   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic || m.email || '') : (m.ic || m.email || '');

      presCard.innerHTML = presAvatar +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:15px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">' +
            '<span>' + safeId + '</span>' +
            '<span>&bull;</span>' +
            '<span>' + safeRank + '</span>' +
            '<span>&bull;</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:' + pInfo.color + ';">' +
              '<span style="width:8px;height:8px;border-radius:50%;background:' + pInfo.color + ';display:inline-block;"></span> ' +
              ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) +
            '</span>' +
          '</div>' +
        '</div>';
    }


    // Creator Outline Studio Section in Member Edit Modal
    var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    var existingOutlineBox = modalContainer ? modalContainer.querySelector('.em-creator-outline-box') : null;
    if (modalContainer && isCreatorUser) {
      if (!existingOutlineBox) {
        existingOutlineBox = document.createElement('div');
        existingOutlineBox.className = 'em-creator-outline-box';
        existingOutlineBox.style.cssText = 'margin-top:14px;padding:14px;background:rgba(217,163,35,0.06);border:1px solid rgba(217,163,35,0.3);border-radius:12px;';
        var saveBtn = modalContainer.querySelector('button[type="submit"]') || modalContainer.querySelector('.modal-footer') || modalContainer.lastElementChild;
        if (saveBtn && saveBtn.parentNode) {
          saveBtn.parentNode.insertBefore(existingOutlineBox, saveBtn);
        } else {
          modalContainer.appendChild(existingOutlineBox);
        }
      }
      existingOutlineBox.style.display = 'block';

      var curMemOutline = (typeof getMemberAvatarOutline === 'function')
        ? getMemberAvatarOutline(m.email || m.ic, m.name)
        : { style: 'none', config: { label: 'Standard (None)' } };

      var stylesCatalog = (typeof AVATAR_OUTLINE_STYLES !== 'undefined') ? AVATAR_OUTLINE_STYLES : {};
      var swatchesHtml = '';
      Object.keys(stylesCatalog).forEach(function(k) {
        var st = stylesCatalog[k];
        var isAct = (st.id === curMemOutline.style);
        var swatchBg = st.swatch || (st.id === 'rgb' ? 'conic-gradient(from -45deg, #ff4b4b, #3b82f6, #22c55e, #facc15)' : 'var(--border-card)');
        swatchesHtml +=
          '<button type="button" class="creator-swatch-btn' + (isAct ? ' active' : '') + '" data-outline-id="' + st.id + '" style="margin:2px;">' +
            '<span class="creator-swatch-dot" style="background:' + swatchBg + ';"></span>' +
            '<span>' + ((typeof escapeHtml === 'function') ? escapeHtml(st.label) : st.label) + '</span>' +
          '</button>';
      });

      existingOutlineBox.innerHTML =
        '<div style="font-weight:700;font-size:13px;color:var(--gold);display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>' +
          'Creator Avatar Outline Studio (Creator Exclusive)' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Select custom outline, multi-stop gradient, or rotating RGB animation for this member:</div>' +
        '<input type="hidden" id="em-chosen-outline" value="' + curMemOutline.style + '" />' +
        '<div class="creator-swatches-wrap" style="display:flex;flex-wrap:wrap;gap:6px;">' +
          swatchesHtml +
        '</div>';

      existingOutlineBox.querySelectorAll('.creator-swatch-btn').forEach(function(sBtn) {
        sBtn.addEventListener('click', function() {
          existingOutlineBox.querySelectorAll('.creator-swatch-btn').forEach(function(b) { b.classList.remove('active'); });
          sBtn.classList.add('active');
          var chosenStyle = sBtn.getAttribute('data-outline-id');
          var hiddenInput = document.getElementById('em-chosen-outline');
          if (hiddenInput) hiddenInput.value = chosenStyle;

          if (_customAvatarOutlinesMap) {
            _customAvatarOutlinesMap[(m.email || m.ic).toLowerCase()] = { style: chosenStyle };
          }
          if (presCard) {
            var updatedAvatar = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 44, pInfo);
            var avWrap = presCard.firstElementChild;
            if (avWrap) presCard.replaceChild(document.createRange().createContextualFragment(updatedAvatar).firstElementChild, avWrap);
          }
        });
      });
    } else if (existingOutlineBox) {
      existingOutlineBox.style.display = 'none';
    }

    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    set('em-name',    m.name);
    set('em-ic',      m.ic);
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    var editSec = m.att_section || m.section || '';
    var rankInferredSec = (m.rank && typeof secRankFn === 'function') ? secRankFn(m.rank) : '';
    if (!editSec || (rankInferredSec && editSec !== rankInferredSec)) {
      if (rankInferredSec) editSec = rankInferredSec;
    }
    set('em-section', editSec);
    var emRankEdit = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (emRankEdit && typeof popRank === 'function') {
      popRank(emRankEdit, editSec, m.rank, editSec ? null : 'Select section first...', true);
    } else {
      set('em-rank', m.rank);
    }
    var emSquadEdit = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (emSquadEdit && typeof popSquad === 'function') {
      var isOfficerEdit = (typeof normalizeSection === 'function' ? normalizeSection(editSec) : String(editSec).toLowerCase()) === 'officer';
      var plHolder = isOfficerEdit ? 'No platoon/squad (Officer)' : (editSec === 'Junior' ? 'No squad' : 'No platoon');
      popSquad(emSquadEdit, editSec, m.squad, plHolder, true);
      emSquadEdit.disabled = isOfficerEdit;
    } else {
      set('em-squad',   m.squad);
    }
    set('em-dept',    m.department);

    handleAdminSectionChange(true);

    set('em-joined',       m.joined_at ? m.joined_at.slice(0, 10) : '');
    set('em-dob',          m.date_of_birth ? m.date_of_birth.slice(0, 10) : '');
    var emStatusSel = document.querySelector('#edit-member-modal .em-status-select');
    if (emStatusSel) {
      emStatusSel.value = getMemberVerificationStatus(m);
    }
    set('em-original-ic',  m.ic);
    set('em-parent-name',  m.parent_name || '');
    set('em-parent-contact', m.parent_contact || '');

    var pc = document.getElementById('em-parent-consent');
    if (pc) pc.checked = !!m.parental_consent_signed;

    var mc = document.getElementById('em-media-consent');
    if (mc) mc.checked = !!m.media_consent;

    var cm = document.getElementById('em-consent-meta');
    if (cm) {
      if (m.parental_consent_date) {
        cm.textContent = 'Consent recorded on ' + new Date(m.parental_consent_date).toLocaleString('en-MY');
      } else {
        cm.textContent = '';
      }
    }

    if (!m.parent_name && !m.parental_consent_signed && typeof fetchMemberConsent === 'function') {
      fetchMemberConsent(ic, m).then(function(cData) {
        if (cData) {
          var pn = document.getElementById('em-parent-name');
          var pcon = document.getElementById('em-parent-contact');
          if (pn && !pn.value) pn.value = cData.parent_name || '';
          if (pcon && !pcon.value) pcon.value = cData.parent_contact || '';
          if (pc) pc.checked = !!cData.parental_consent_signed;
          if (mc) mc.checked = !!cData.media_consent;
          if (cm && cData.parental_consent_date) {
            cm.textContent = 'Consent recorded on ' + new Date(cData.parental_consent_date).toLocaleString('en-MY');
          }
        }
      }).catch(function() {});
    }

    var icEl = document.getElementById('em-ic');
    if (icEl) icEl.readOnly = true;

    var ti = document.getElementById('em-modal-title');
    if (ti) ti.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Edit Member</span>';

    var db = document.getElementById('em-delete-btn');
    if (db) db.style.display = 'inline-flex';

    var modal = document.getElementById('edit-member-modal');
    if (modal) {
      modal.setAttribute('data-original-name', m.name || '');
      modal.style.display = 'block';
    }
  }

  function closeEditMember() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('edit-member-modal');
    if (modal) modal.style.display = 'none';
  }

  var _isSavingEditMember = false;

  async function saveEditMember() {
    if (typeof document === 'undefined') return;
    if (_isSavingEditMember) return;
    var editModal = document.getElementById('edit-member-modal');
    var saveBtn = editModal ? editModal.querySelector('.submit-btn.gold') : null;
    var origSaveHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = 'Saving...';
    }
    _isSavingEditMember = true;
    var originalIc = (document.getElementById('em-original-ic') || {}).value || '';
    var oldName = (editModal && editModal.getAttribute('data-original-name')) || (_adminMembers && _adminMembers[originalIc] && _adminMembers[originalIc].name) || '';
    var rawIc      = ((document.getElementById('em-ic') || {}).value || '').trim().replace(/\s/g, '');
    var rawName    = ((document.getElementById('em-name') || {}).value || '').trim();
    var rawRank    = (document.getElementById('em-rank') || {}).value || '';
    var rawSquad   = (document.getElementById('em-squad') || {}).value || '';
    var rawDept    = (document.getElementById('em-dept') || {}).value || '';

    var ic         = (typeof sanitizeInput === 'function') ? sanitizeInput(rawIc, 100) : rawIc;
    var name       = (typeof sanitizeText === 'function') ? sanitizeText(rawName, 100) : rawName;
    var rank       = (typeof sanitizeText === 'function') ? sanitizeText(rawRank, 50) : rawRank;
    var squad      = (typeof sanitizeText === 'function') ? sanitizeText(rawSquad, 50) : rawSquad;
    var department = (typeof sanitizeText === 'function') ? sanitizeText(rawDept, 50) : rawDept;

    var joinedRaw     = (document.getElementById('em-joined') || {}).value || '';
    var joined_at     = joinedRaw ? new Date(joinedRaw).toISOString() : null;
    var dobRaw        = (document.getElementById('em-dob') || {}).value || '';
    var date_of_birth = dobRaw || null;
    var rawSec        = ((document.getElementById('em-section') || {}).value || '').trim();
    var att_section   = (typeof sanitizeText === 'function') ? sanitizeText(rawSec, 50) : rawSec;
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    if (!att_section && rank && typeof secRankFn === 'function') {
      att_section = secRankFn(rank);
    }
    var isOfficerSec = (typeof normalizeSection === 'function' ? normalizeSection(att_section) : String(att_section).toLowerCase()) === 'officer';
    if (isOfficerSec) {
      squad = '';
    }

    var rawPName      = ((document.getElementById('em-parent-name') || {}).value || '').trim();
    var rawPContact   = ((document.getElementById('em-parent-contact') || {}).value || '').trim();
    var parent_name   = (typeof sanitizeText === 'function') ? sanitizeText(rawPName, 100) : rawPName;
    var parent_contact= (typeof sanitizeInput === 'function') ? sanitizeInput(rawPContact, 100) : rawPContact;

    var chosenOutlineInput = document.getElementById('em-chosen-outline');
    if (chosenOutlineInput && typeof saveMemberAvatarOutline === 'function' && typeof isCreatorSession === 'function' && isCreatorSession()) {
      var outlineToSave = chosenOutlineInput.value;
      var actorEm = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
      await saveMemberAvatarOutline(ic || originalIc, outlineToSave, actorEm);
    }

    var pConsentCb    = document.getElementById('em-parent-consent');
    var parental_consent_signed = pConsentCb ? !!pConsentCb.checked : false;

    var mConsentCb    = document.getElementById('em-media-consent');
    var media_consent = mConsentCb ? !!mConsentCb.checked : false;

    var emStatusSel   = document.querySelector('#edit-member-modal .em-status-select');
    var rawStatus     = emStatusSel ? emStatusSel.value : 'verified';
    var verification_status = (rawStatus || 'verified').toLowerCase();

    if (!name) {
      if (typeof showToast === 'function') showToast('Name cannot be empty.', 'warning');
      return;
    }
    if (!ic) {
      if (typeof showToast === 'function') showToast('Account Email / ID cannot be empty.', 'warning');
      return;
    }
    if (!rank || rank === 'No rank') {
      if (typeof showToast === 'function') showToast('Please select a valid rank for this member.', 'warning');
      return;
    }

    var client = getSupabaseClient();
    if (!client) {
      if (typeof showToast === 'function') showToast('Database client unavailable.', 'error');
      return;
    }

    try {
      var consentTimestamp = parental_consent_signed ? new Date().toISOString() : null;

      // Name collision validation: Ensure candidate name does not conflict with another existing member
      var conflictFn = (typeof isNameConflict === 'function')
        ? isNameConflict
        : (typeof window !== 'undefined' && typeof window.isNameConflict === 'function'
            ? window.isNameConflict
            : (typeof global !== 'undefined' && typeof global.isNameConflict === 'function' ? global.isNameConflict : null));

      if (conflictFn) {
        var existingMembersList = [];
        try {
          var allMems = await client.get('bb_members?select=name,email,ic,department');
          if (Array.isArray(allMems)) {
            existingMembersList = allMems.filter(function(m) {
              if (!m || !m.name) return false;
              var dept = String(m.department || '').toLowerCase();
              if (dept === 'deleted' || dept === 'archived_deleted') return false;
              var mIc = String(m.ic || '').toLowerCase();
              if (mIc.startsWith('archived_')) return false;
              return true;
            });
          }
        } catch (_) {}
        if (existingMembersList.length === 0 && typeof _adminMembers === 'object') {
          existingMembersList = Object.values(_adminMembers);
        }
        var conflictingMem = existingMembersList.find(function(m) {
          if (!m || !m.name) return false;
          var mIc = String(m.ic || m.email || '').trim().toLowerCase();
          // Exclude the member currently being edited
          if (mIc && (mIc === String(originalIc).trim().toLowerCase() || mIc === String(ic).trim().toLowerCase())) return false;
          return conflictFn(m.name, name);
        });
        if (conflictingMem) {
          if (typeof showToast === 'function') {
            showToast('The name "' + name + '" conflicts with an already registered member (' + conflictingMem.name + '). Duplicate names are not permitted.', 'warning', 5000);
          }
          return;
        }
      }

      if (!originalIc) {
        var existing = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=ic');
        if (existing && existing.length) {
          if (typeof showToast === 'function') showToast('A member with this Account Email / ID already exists.', 'warning');
          return;
        }

        var defaultHash = null;
        if (typeof hashPassword === 'function') {
          defaultHash = await hashPassword(ic);
        } else if (typeof window !== 'undefined' && typeof window.hashPassword === 'function') {
          defaultHash = await window.hashPassword(ic);
        } else if (typeof global !== 'undefined' && typeof global.hashPassword === 'function') {
          defaultHash = await global.hashPassword(ic);
        }
        if (!defaultHash) {
          var safeEncoded = typeof window !== 'undefined' && typeof window.safeBase64Encode === 'function'
            ? window.safeBase64Encode(ic)
            : typeof Buffer !== 'undefined'
              ? Buffer.from(ic, 'utf8').toString('base64')
              : encodeURIComponent(ic);
          defaultHash = 'pbkdf2:sha256:100000:legacy:' + safeEncoded;
        }
        var newPayload = {
          ic: ic,
          name: name,
          rank: rank,
          squad: squad,
          department: department,
          att_section: att_section || null,
          date_of_birth: date_of_birth,
          password: defaultHash,
          joined_at: joined_at || new Date().toISOString()
        };

        if (parent_name) newPayload.parent_name = parent_name;
        if (parent_contact) newPayload.parent_contact = parent_contact;
        if (parental_consent_signed) {
          newPayload.parental_consent_signed = true;
          newPayload.parental_consent_date = consentTimestamp;
        }
        newPayload.media_consent = media_consent;

        try {
          await client.post('bb_members', newPayload);
        } catch (postErr) {
          // Fallback without extended consent columns
          await client.post('bb_members', {
            ic: ic,
            name: name,
            rank: rank,
            squad: squad,
            department: department,
            date_of_birth: date_of_birth,
            password: defaultHash,
            joined_at: joined_at || new Date().toISOString()
          });
        }
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'member.create',
            targetType: 'member',
            targetId: ic,
            actorRole: 'officer_admin',
            details: { name: name, rank: rank, squad: squad, department: department, section: att_section }
          });
        }
        if (typeof showToast === 'function') {
          showToast('✅ Member added! Default password is: ' + ic, 'success', 5000);
        }
      } else {
        var updates = {
          name: name,
          rank: rank,
          squad: squad,
          department: department,
          section: att_section || null,
          att_section: att_section || null,
          verification_status: verification_status
        };
        if (joined_at)     updates.joined_at     = joined_at;
        if (date_of_birth) updates.date_of_birth = date_of_birth;
        updates.parent_name = parent_name || null;
        updates.parent_contact = parent_contact || null;
        updates.parental_consent_signed = parental_consent_signed;
        if (parental_consent_signed) updates.parental_consent_date = consentTimestamp;
        updates.media_consent = media_consent;

        try {
          await client.patch('bb_members?ic=eq.' + encodeURIComponent(originalIc), updates);
        } catch (patchErr) {
          var baseUpdates = {
            name: name,
            rank: rank,
            squad: squad,
            department: department,
            section: att_section || null,
            att_section: att_section || null
          };
          if (joined_at)     baseUpdates.joined_at     = joined_at;
          if (date_of_birth) baseUpdates.date_of_birth = date_of_birth;
          await client.patch('bb_members?ic=eq.' + encodeURIComponent(originalIc), baseUpdates);

          try {
            var cfgRes = await client.get('bb_config?key=eq.bb_verification_statuses&select=value');
            var vMap = (cfgRes && cfgRes.length && cfgRes[0].value) ? JSON.parse(cfgRes[0].value) : {};
            vMap[originalIc || ic] = verification_status;
            await client.patch('bb_config?key=eq.bb_verification_statuses', { value: JSON.stringify(vMap) });
          } catch (_) {}
        }
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'member.update',
            targetType: 'member',
            targetId: originalIc || ic,
            actorRole: 'officer_admin',
            details: { name: name, rank: rank, squad: squad, department: department, section: att_section }
          });
        }
        if (typeof showToast === 'function') showToast('Member updated!', 'success');
      }

      // Always persist backup consent audit trail into bb_config
      try {
        var consentRecord = {
          email: ic,
          name: name,
          section: att_section || (_adminMembers && _adminMembers[ic] && (_adminMembers[ic].att_section || _adminMembers[ic].section)) || '',
          parent_name: parent_name,
          parent_contact: parent_contact,
          parental_consent_signed: parental_consent_signed,
          parental_consent_date: consentTimestamp,
          media_consent: media_consent,
          updated_at: new Date().toISOString()
        };
        var consentKey = 'bb_consent_' + ic.replace(/[^a-zA-Z0-9_-]/g, '_');
        await client.upsert('bb_config', { key: consentKey, value: JSON.stringify(consentRecord) }, 'key');
      } catch (cfgErr) {}

      var memberTargetKey = originalIc || ic;
      if (_adminMembers && _adminMembers[memberTargetKey]) {
        _adminMembers[memberTargetKey].name = name;
        _adminMembers[memberTargetKey].rank = rank;
        _adminMembers[memberTargetKey].squad = squad;
        _adminMembers[memberTargetKey].department = department;
        _adminMembers[memberTargetKey].section = att_section;
        _adminMembers[memberTargetKey].att_section = att_section;
        _adminMembers[memberTargetKey].parent_name = parent_name;
        _adminMembers[memberTargetKey].parent_contact = parent_contact;
        _adminMembers[memberTargetKey].parental_consent_signed = parental_consent_signed;
        _adminMembers[memberTargetKey].media_consent = media_consent;
        _adminMembers[memberTargetKey].verification_status = verification_status;
        _adminMembers[memberTargetKey].v_status = verification_status;
      }

      var trimmedOldName = (oldName || '').trim();
      var trimmedNewName = (name || '').trim();
      if (trimmedOldName && trimmedNewName && trimmedOldName.toLowerCase() !== trimmedNewName.toLowerCase()) {
        // 1. Sync tasks assigned to old name across Supabase bb_tasks and in memory
        try {
          await client.patch('bb_tasks?assignee_name=eq.' + encodeURIComponent(trimmedOldName), { assignee_name: trimmedNewName });
        } catch (taskErr) {
          console.warn('Could not update assignee_name on bb_tasks:', taskErr);
        }
        if (typeof _allLoadedTasks !== 'undefined' && Array.isArray(_allLoadedTasks)) {
          _allLoadedTasks.forEach(function(t) {
            if (t.assignee_name === trimmedOldName) t.assignee_name = trimmedNewName;
          });
        }
        if (typeof renderBoardOrListTasks === 'function') {
          try { renderBoardOrListTasks(); } catch (_) {}
        }

        // 2. Sync forum post and reply authors
        if (typeof forumPosts !== 'undefined' && Array.isArray(forumPosts)) {
          var changedForum = false;
          forumPosts.forEach(function(p) {
            if (p.authorEmail === originalIc || (p.authorName && p.authorName.toLowerCase() === trimmedOldName.toLowerCase())) {
              p.authorName = trimmedNewName;
              changedForum = true;
            }
            if (Array.isArray(p.replies)) {
              p.replies.forEach(function(r) {
                if (r.authorEmail === originalIc || (r.authorName && r.authorName.toLowerCase() === trimmedOldName.toLowerCase())) {
                  r.authorName = trimmedNewName;
                  changedForum = true;
                }
              });
            }
          });
          if (changedForum && typeof saveForumPosts === 'function') {
            saveForumPosts(forumPosts);
          }
        }

        // 3. Migrate cosmetics & avatar outlines map
        if (typeof _memberCosmeticsMap !== 'undefined' && _memberCosmeticsMap[trimmedOldName.toLowerCase()]) {
          _memberCosmeticsMap[trimmedNewName.toLowerCase()] = _memberCosmeticsMap[trimmedOldName.toLowerCase()];
        }
        if (typeof _customAvatarOutlinesMap !== 'undefined' && _customAvatarOutlinesMap[trimmedOldName]) {
          _customAvatarOutlinesMap[trimmedNewName] = _customAvatarOutlinesMap[trimmedOldName];
        }
        if (typeof _memberPfpsMap !== 'undefined' && _memberPfpsMap[trimmedOldName.toLowerCase()]) {
          _memberPfpsMap[trimmedNewName.toLowerCase()] = _memberPfpsMap[trimmedOldName.toLowerCase()];
        }      }

      // 4. Update local members cache for all field modifications
      try {
        var memCache = JSON.parse(localStorage.getItem('bb_members_cache') || '[]');
        if (Array.isArray(memCache)) {
          var cacheMatched = false;
          memCache.forEach(function(m) {
            if (m.ic === (originalIc || ic) || (trimmedOldName && m.name === trimmedOldName) || (trimmedNewName && m.name === trimmedNewName)) {
              m.name = trimmedNewName;
              m.rank = rank;
              m.squad = squad;
              m.department = department;
              m.section = att_section;
              m.att_section = att_section;
              m.verification_status = verification_status;
              m.v_status = verification_status;
              cacheMatched = true;
            }
          });
          if (!cacheMatched && !originalIc) {
            memCache.push({ ic: ic, name: trimmedNewName, rank: rank, squad: squad, department: department, section: att_section, att_section: att_section });
          }
          localStorage.setItem('bb_members_cache', JSON.stringify(memCache));
        }
      } catch (_) {}

      // 5. If this is the currently logged-in user session, update immediately
      var currentSessIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : '';
      var currentSessNm = (typeof sessionGet === 'function') ? sessionGet('name') : '';
      var isMe = (currentSessIc && (currentSessIc === originalIc || currentSessIc === ic)) ||
                 (currentSessNm && (currentSessNm.toLowerCase() === (trimmedOldName || '').toLowerCase() || currentSessNm.toLowerCase() === trimmedNewName.toLowerCase()));

      if (isMe) {
        if (typeof sessionSet === 'function') {
          sessionSet('name', trimmedNewName);
          sessionSet('rank', rank);
          sessionSet('section', att_section);
          sessionSet('department', department);
          sessionSet('squad', squad);
        }
        var sn = document.getElementById('sidebar-user-name');
        if (sn) sn.textContent = trimmedNewName;
        var sqBadgeFmt = (typeof formatPlatoonOrSquad === 'function') ? formatPlatoonOrSquad(squad, att_section) : (squad ? squad + ' Sq' : '');
        var userBadgeText = (rank ? rank + (sqBadgeFmt || att_section ? ' · ' : '') : '') + (sqBadgeFmt || att_section || 'Member');
        var sb = document.getElementById('sidebar-user-badge');
        if (sb) sb.textContent = userBadgeText;

        if (typeof RBAC !== 'undefined' && typeof RBAC.renderHeaderRoleBadge === 'function') {
          try { RBAC.renderHeaderRoleBadge(); } catch (_) {}
        }
        if (typeof checkTasksAccess === 'function') {
          try { checkTasksAccess(); } catch (_) {}
        }
      }

      // 6. Broadcast member update to all clients & devices in real time
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('members', 'update', {
          ic: memberTargetKey,
          name: trimmedNewName,
          rank: rank,
          squad: squad,
          department: department,
          section: att_section,
          att_section: att_section
        });
      }

      closeEditMember();
      renderAdminList();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
    } finally {
      _isSavingEditMember = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origSaveHtml;
      }
    }
  }

  async function deleteEditMember() {
    if (typeof document === 'undefined') return;
    var ic   = (document.getElementById('em-original-ic') || {}).value || '';
    var name = (document.getElementById('em-name') || {}).value || '';
    await deleteMemberAccount(ic, name);
  }

  async function deleteMemberAccount(ic, name, e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!ic) return;

    var display = name ? ('member "' + name + '" (' + ic + ')') : ('member account (' + ic + ')');
    var ok = false;
    if (typeof showConfirmModal === 'function') {
      ok = await showConfirmModal(
        'Are you sure you want to permanently delete ' + display + '? This will delete their account profile and login credentials. This action cannot be undone.',
        'Delete Member Account'
      );
    } else {
      ok = true;
    }
    if (!ok) return;

    // 1. Instant optimistic DOM removal for immediate visual feedback
    if (typeof document !== 'undefined') {
      var rowEl = document.querySelector('.admin-row[data-edit-ic="' + ic + '"]');
      if (rowEl) {
        rowEl.style.transition = 'all 0.3s ease';
        rowEl.style.opacity = '0';
        rowEl.style.transform = 'translateX(20px)';
        setTimeout(function() {
          if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
        }, 300);
      }
    }

    var client = getSupabaseClient();
    if (!client) return;

    try {
      // 2. Add IC to bb_deleted_members in bb_config so they are filtered out immediately
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        var delList = [];
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          try { delList = JSON.parse(cfgRes[0].value); } catch (err) {}
        }
        if (!Array.isArray(delList)) delList = [];
        if (!delList.includes(ic)) delList.push(ic);
        var archivedIc = 'archived_' + Date.now() + '_' + ic;
        if (!delList.includes(archivedIc)) delList.push(archivedIc);
        if (name && !delList.includes(name)) delList.push(name);
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('bb_deleted_members', JSON.stringify(delList)); } catch (_) {}
        }

        try {
          var consentKey = 'bb_consent_' + ic.replace(/[^a-zA-Z0-9_-]/g, '_');
          await client.delete('bb_config?key=eq.' + encodeURIComponent(consentKey));
        } catch (e2) {}

        try {
          await client.req('POST', 'bb_config?on_conflict=key', {
            key: 'bb_deleted_members',
            value: JSON.stringify(delList),
            updated_at: new Date().toISOString()
          });
        } catch (err2) {
          await client.patch('bb_config?key=eq.bb_deleted_members', {
            value: JSON.stringify(delList),
            updated_at: new Date().toISOString()
          });
        }
      } catch (cfgErr) {
        console.warn('bb_deleted_members update:', cfgErr);
      }

      // 3. Neutralize account credentials & mark department as deleted
      // Archive the IC so the original email/IC is immediately freed for future re-registration
      var archivedIc = 'archived_' + Date.now() + '_' + ic;
      try {
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), {
          ic: archivedIc,
          email: null,
          department: 'deleted',
          password: 'DELETED_' + Date.now() + '_' + Math.random().toString(36).substring(2),
          rank: 'Deleted',
          squad: null
        });
      } catch (patchErr) {
        console.warn('Account neutralization patch:', patchErr);
      }

      // 4. Attempt hard delete in Supabase (if RLS delete policy is enabled)
      try {
        await client.delete('bb_members?ic=eq.' + encodeURIComponent(ic));
      } catch (delErr) {}
      try {
        await client.delete('bb_members?ic=eq.' + encodeURIComponent(archivedIc));
      } catch (delErr2) {}

      // 5. Cascade delete member badges
      try {
        await client.delete('bb_member_badges?ic=eq.' + encodeURIComponent(ic));
      } catch (delBadgeErr) {}
      try {
        await client.delete('bb_member_badges?ic=eq.' + encodeURIComponent(archivedIc));
      } catch (delBadgeErr2) {}

      // Purge in-memory and local caches immediately
      if (typeof cleanMembersCache === 'function') {
        try { cleanMembersCache(); } catch (_) {}
      }
      if (Array.isArray(_adminMembersCache)) {
        _adminMembersCache = _adminMembersCache.filter(function(m) {
          return m && m.ic !== ic && m.ic !== archivedIc && m.name !== name;
        });
      }
      if (_adminMembers && typeof _adminMembers === 'object') {
        delete _adminMembers[ic];
        delete _adminMembers[archivedIc];
      }

      // If the deleted account is currently logged in on this browser, revoke access immediately
      var curIc = (typeof sessionGet === 'function') ? sessionGet('ic') : null;
      var curEmail = (typeof sessionGet === 'function') ? sessionGet('email') : null;
      var matchIc = (curIc && String(curIc).toLowerCase().trim() === String(ic).toLowerCase().trim());
      var matchEmail = (curEmail && String(curEmail).toLowerCase().trim() === String(ic).toLowerCase().trim());
      if (matchIc || matchEmail) {
        if (typeof forceKickDeletedAccount === 'function') {
          forceKickDeletedAccount();
          return;
        }
      }

      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'member.delete',
          targetType: 'member',
          targetId: ic,
          actorRole: 'officer_admin',
          details: { name: name || display }
        });
      }
      closeEditMember();
      await renderAdminList();
      if (typeof showToast === 'function') {
        showToast('Account for ' + (name || ic) + ' was permanently deleted.', 'info');
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Failed to delete member: ' + err.message, 'error');
      }
    }
  }

  // ── Admin Tasks Management ────────────────────────────────────────────────

  async function loadAssigneeOptions() {
    if (typeof document === 'undefined') return;
    var dept = (document.getElementById('task-dept') || {}).value || '';
    var sel  = document.getElementById('task-assignee');
    if (!sel) return;

    sel.innerHTML = '<option value="">Unassigned</option>';
    if (!dept) return;

    var client = getSupabaseClient();
    if (!client || !client.get) return;

    try {
      var members = await client.get('bb_members?department=eq.' + encodeURIComponent(dept) + '&select=ic,name&order=name');
      members.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.ic;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.error('loadAssigneeOptions error:', e);
    }
  }

  async function saveTask() {
    if (typeof document === 'undefined') return;
    var rawTitle = ((document.getElementById('task-title') || {}).value || '').trim();
    var rawDesc  = (typeof reGetValue === 'function') ? reGetValue('task-desc') : '';
    var title    = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 200) : rawTitle;
    var desc     = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
    var dept     = (document.getElementById('task-dept') || {}).value || '';
    var priority = (document.getElementById('task-priority') || {}).value || 'medium';
    var due      = (document.getElementById('task-due') || {}).value || '';
    var editId   = (document.getElementById('task-edit-id') || {}).value || '';

    if (!title) {
      if (typeof showToast === 'function') showToast('Please enter a task title.', 'warning');
      return;
    }
    if (!dept) {
      if (typeof showToast === 'function') showToast('Please select a department.', 'warning');
      return;
    }

    var assigneeSel = document.getElementById('task-assignee');
    var selected = [];
    if (assigneeSel) {
      if (assigneeSel.selectedOptions) {
        selected = Array.from(assigneeSel.selectedOptions).filter(function(o) { return o.value; });
      } else if (assigneeSel.options) {
        selected = Array.from(assigneeSel.options).filter(function(o) { return o.selected && o.value; });
      }
    }
    var assigneeName = selected.map(function(o) { return o.text; }).join(', ');

    var payload = {
      title: title,
      description: desc,
      department: dept,
      priority: priority,
      due_date: due || null,
      assignee_name: assigneeName || null
    };

    if (!editId) {
      payload.created_at = new Date().toISOString();
      payload.status = 'todo';
    }

    var client = getSupabaseClient();
    if (!client) return;

    try {
      if (editId) {
        await client.patch('bb_tasks?id=eq.' + encodeURIComponent(editId), payload);
        if (typeof showToast === 'function') showToast('✅ Task updated!', 'success');
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'task.edit',
            targetType: 'task',
            targetId: editId,
            actorRole: 'officer_admin',
            details: { title: title, department: dept }
          });
        }
      } else {
        var taskRes = await client.post('bb_tasks', payload);
        if (typeof showToast === 'function') showToast('✅ Task added!', 'success');
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'task.create',
            targetType: 'task',
            targetId: (taskRes && taskRes[0] && taskRes[0].id) || title,
            actorRole: 'officer_admin',
            details: { title: title, department: dept }
          });
        }
      }

      clearTaskForm();
      var body = document.getElementById('task-form-body');
      if (body && body.style.display !== 'none') toggleTaskForm();
      renderAdminTasks(_adminTaskFilter);
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
    }
  }

  function clearTaskForm() {
    if (typeof document === 'undefined') return;
    ['task-title', 'task-due', 'task-edit-id'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (typeof reClearValue === 'function') reClearValue('task-desc');

    var td = document.getElementById('task-dept');
    if (td) td.value = '';

    var tp = document.getElementById('task-priority');
    if (tp) tp.value = 'medium';

    var ta = document.getElementById('task-assignee');
    if (ta) ta.innerHTML = '<option value="" disabled>Select dept first...</option>';

    var tl = document.getElementById('task-form-toggle-label');
    if (tl) tl.textContent = '+ Add New Task';
  }

  async function renderAdminTasks(filter) {
    if (typeof document === 'undefined') return;
    _adminTaskFilter = filter || 'all';

    var SC = { todo: 'var(--text-secondary)', inprogress: 'var(--brand-blue)', done: 'var(--green)' };
    var SL = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

    var list = document.getElementById('admin-tasks-list');
    if (!list) return;

    list.innerHTML = (typeof renderSkeletonKanban === 'function') ? renderSkeletonKanban() : '<div class="skeleton-shimmer" style="height:220px;border-radius:8px;"></div>';

    var client = getSupabaseClient();
    if (!client || !client.get) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Database client unavailable.</div>';
      return;
    }

    try {
      var url = _adminTaskFilter === 'all'
        ? 'bb_tasks?select=*&order=created_at.desc'
        : 'bb_tasks?department=eq.' + encodeURIComponent(_adminTaskFilter) + '&order=created_at.desc';

      _allAdminTasks = await client.get(url);

      if (!_allAdminTasks.length) {
        list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No tasks yet.</div>';
        return;
      }

      var dConfig = getDeptConfig();
      var html = '';

      _allAdminTasks.forEach(function(t) {
        var dept = dConfig[t.department] || { label: t.department || '', cls: '' };
        var pc   = (t.priority === 'high' || t.priority === 'low') ? t.priority : 'medium';

        var statusBtns = Object.keys(SL).map(function(s) {
          var a = s === t.status;
          return '<button data-tid="' + escapeHtml(t.id) + '" data-ts="' + s + '" style="padding:4px 10px;border:1.5px solid ' + (a ? SC[s] : 'var(--border-card)') + ';border-radius:6px;background:' + (a ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (a ? SC[s] : 'var(--text-secondary)') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-headline);">' + SL[s] + '</button>';
        }).join('');

        var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(t.title) : t.title;
        var safeDesc  = t.description ? ((typeof sanitizeHtml === 'function') ? sanitizeHtml(t.description) : escapeHtml(t.description)) : '';
        var safeAssignee = t.assignee_name ? ((typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name) : t.assignee_name) : '';
        var dateFormatted = t.due_date ? new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
          + '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);flex:1;">' + safeTitle + '</div>'
          + '<span class="dept-badge ' + dept.cls + '" style="font-size:10px;flex-shrink:0;">' + ((typeof escapeHtml === 'function') ? escapeHtml(dept.label) : dept.label) + '</span></div>'
          + (safeDesc ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">' + safeDesc + '</div>' : '')
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'
          + '<span class="task-pill ' + pc + '">' + (t.priority || 'medium') + '</span>'
          + (safeAssignee ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' + safeAssignee + '</span>' : '')
          + (dateFormatted ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' + dateFormatted + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' + statusBtns
          + '<button data-edit-tid="' + escapeHtml(t.id) + '" title="Edit Task" style="margin-left:auto;background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>'
          + '<button data-del-tid="' + escapeHtml(t.id) + '" title="Delete Task" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
          + '</div></div>';
      });

      list.innerHTML = html;

      list.querySelectorAll('[data-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          updateTaskStatus(btn.getAttribute('data-tid'), btn.getAttribute('data-ts'));
        });
      });

      list.querySelectorAll('[data-edit-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          editAdminTask(btn.getAttribute('data-edit-tid'));
        });
      });

      list.querySelectorAll('[data-del-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          deleteTask(btn.getAttribute('data-del-tid'));
        });
      });
    } catch (e) {
      console.error('renderAdminTasks error:', e);
      list.innerHTML = '<div class="admin-error-card" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;color:var(--text-secondary);">'
        + '<div style="font-size:24px;margin-bottom:6px;">⚠️</div>'
        + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Failed to load tasks</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Database request timed out or network was interrupted.</div>'
        + '<button type="button" class="portal-btn portal-btn-secondary" onclick="renderAdminTasks(_adminTaskFilter)" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:6px 14px;font-size:12px;cursor:pointer;">'
        + '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
        + 'Retry</button></div>';
    }
  }

  async function updateTaskStatus(id, status) {
    var client = getSupabaseClient();
    if (!client || !client.patch) return;
    try {
      await client.patch('bb_tasks?id=eq.' + encodeURIComponent(id), { status: status });
      renderAdminTasks(_adminTaskFilter);
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to update status.', 'error');
    }
  }

  function editAdminTask(id) {
    if (typeof document === 'undefined') return;
    var t = _allAdminTasks.find(function(x) { return String(x.id) === String(id); });
    if (!t) return;

    var set = function(elId, val) {
      var el = document.getElementById(elId);
      if (el) el.value = val || '';
    };

    set('task-title',    t.title);
    if (typeof reSetValue === 'function') reSetValue('task-desc', t.description || '');
    set('task-priority', t.priority || 'medium');
    set('task-due',      t.due_date ? t.due_date.slice(0, 10) : '');
    set('task-dept',     t.department);
    set('task-edit-id',  t.id);

    var tl = document.getElementById('task-form-toggle-label');
    if (tl) tl.textContent = '\u270f\ufe0f Edit Task';

    loadAssigneeOptions().then(function() {
      if (t.assignee_ic) {
        var sel = document.getElementById('task-assignee');
        if (sel) {
          var ics = t.assignee_ic.split(',');
          Array.from(sel.options).forEach(function(o) {
            o.selected = ics.indexOf(o.value) !== -1;
          });
        }
      }
    });

    var body = document.getElementById('task-form-body');
    if (body && body.style.display === 'none') toggleTaskForm();

    var tt = document.getElementById('task-title');
    if (tt && tt.scrollIntoView) tt.scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteTask(id) {
    var ok = false;
    if (typeof showConfirmModal === 'function') {
      ok = await showConfirmModal('Delete this task?');
    } else {
      ok = true;
    }
    if (!ok) return;

    var client = getSupabaseClient();
    if (!client || !client.delete) return;

    try {
      await client.delete('bb_tasks?id=eq.' + encodeURIComponent(id));
      renderAdminTasks(_adminTaskFilter);
      if (typeof showToast === 'function') showToast('Task deleted successfully.', 'success');
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.delete',
          targetType: 'task',
          targetId: id,
          actorRole: 'officer_admin'
        });
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to delete task.', 'error');
    }
  }

  // ── Audit Logs Viewer ──────────────────────────────────────────
  async function renderAdminAuditLogs(containerId) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(containerId || 'admin-audit-logs');
    if (!el) return;
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">Loading audit logs...</div>';
    var logsRes = (typeof getAuditLogs === 'function') ? await getAuditLogs({ limit: 50 }) : { logs: [] };
    var logs = (logsRes && logsRes.logs) || [];
    if (!logs.length) {
      el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:16px;">No audit logs recorded yet.</div>';
      return;
    }
    var html = '<table class="audit-log-table" style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border-card);color:var(--text-secondary);text-align:left;">' +
      '<th style="padding:8px;">Timestamp</th><th style="padding:8px;">Actor</th><th style="padding:8px;">Role</th><th style="padding:8px;">Action</th><th style="padding:8px;">Target</th>' +
      '</tr></thead><tbody>';
    logs.forEach(function(l) {
      var timeStr = l.timestamp ? new Date(l.timestamp).toLocaleString() : '-';
      var safeActor = typeof escapeHtml === 'function' ? escapeHtml(l.actor_id || '') : (l.actor_id || '');
      var safeRole = typeof escapeHtml === 'function' ? escapeHtml(l.actor_role || '') : (l.actor_role || '');
      var safeAction = typeof escapeHtml === 'function' ? escapeHtml(l.action || '') : (l.action || '');
      var safeTarget = typeof escapeHtml === 'function' ? escapeHtml((l.target_type || '') + (l.target_id ? (':' + l.target_id) : '')) : '';
      html += '<tr style="border-bottom:1px solid var(--border-subtle);">' +
        '<td style="padding:8px;color:var(--text-muted);white-space:nowrap;">' + timeStr + '</td>' +
        '<td style="padding:8px;font-weight:600;">' + safeActor + '</td>' +
        '<td style="padding:8px;"><span class="badge-role">' + safeRole + '</span></td>' +
        '<td style="padding:8px;color:var(--accent);font-family:var(--font-mono);">' + safeAction + '</td>' +
        '<td style="padding:8px;">' + safeTarget + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // ── Super Admin Roles & Permissions Management Console ─────────
  async function renderAdminRoles() {
    if (typeof document === 'undefined') return;
    var panel = document.getElementById('admin-panel');
    if (!panel) return;

    var rolesSec = document.getElementById('adm-section-roles');
    if (!rolesSec) {
      rolesSec = document.createElement('div');
      rolesSec.id = 'adm-section-roles';
      rolesSec.style.display = 'none';
      panel.appendChild(rolesSec);
    }
    rolesSec.style.display = 'block';

    if (typeof RBAC !== 'undefined' && typeof RBAC.loadRolesConfig === 'function') {
      try {
        await Promise.race([
          RBAC.loadRolesConfig(),
          new Promise(function(resolve) { setTimeout(resolve, 800); })
        ]);
      } catch (_) {}
    }

    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;
    if (!isSuper) {
      rolesSec.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);"><div style="font-size:32px;margin-bottom:8px;">🔒</div><div style="font-size:16px;font-weight:700;color:var(--text-primary);">Access Denied</div><div>Only Super Admins can manage roles and permissions.</div></div>';
      return;
    }

    var headerHtml = '<div class="adm-section-header">' +
      '<div class="adm-sec-icon" style="background:rgba(217,163,35,0.15);color:var(--gold);">' +
        '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
      '</div>' +
      '<div>' +
        '<div class="adm-section-title">Roles &amp; Permissions Manager</div>' +
      '</div>' +
    '</div>';

    // Fetch real members asynchronously from Supabase bb_members
    var rawList = [];
    var client = getSupabaseClient();
    if (client && typeof client.get === 'function') {
      try {
        var res = await client.get('bb_members?select=ic,email,name,rank,squad,section,department&order=name.asc');
        if (Array.isArray(res) && res.length > 0) {
          rawList = res.filter(function(m) {
            return m.department !== 'deleted' && m.department !== 'archived_deleted';
          });
        }
      } catch (fetchErr) {
        try {
          var resFallback = await client.get('bb_members?order=name.asc');
          if (Array.isArray(resFallback) && resFallback.length > 0) {
            rawList = resFallback.filter(function(m) {
              return m.department !== 'deleted' && m.department !== 'archived_deleted';
            });
          }
        } catch (_) {}
      }
    }

    if (!rawList.length && _adminMembers && Object.keys(_adminMembers).length) {
      rawList = Object.values(_adminMembers);
    }

    if (!rawList.length && typeof localStorage !== 'undefined') {
      try {
        var cached = localStorage.getItem('bb_members_cache') || localStorage.getItem('bb_all_members');
        if (cached) {
          var parsedCached = JSON.parse(cached);
          if (Array.isArray(parsedCached)) rawList = parsedCached;
        }
      } catch (_) {}
    }

    // Exclude dummy test accounts
    var excludedEmails = new Set([
      'member@1stpjbb.org.my'
    ]);
    rawList = rawList.filter(function(m) {
      if (!m) return false;
      var em = (m.email || '').toLowerCase().trim();
      var ic = (m.ic ? String(m.ic).trim().toLowerCase() : '');
      return !excludedEmails.has(em) && !excludedEmails.has(ic);
    });

    // Deduplicate members list - ensure strictly ONE Jeshua Koh account
    var seenKeys = new Set();
    var membersList = [];

    rawList.forEach(function(m) {
      if (!m) return;
      var em = (m.email || '').toLowerCase().trim();
      var ic = (m.ic ? String(m.ic).trim().toLowerCase() : '');
      var nm = (m.name || '').toLowerCase().trim();

      if (em === 'jeshuakoh2008@gmail.com' || ic === 'jeshuakoh2008@gmail.com' || nm === 'jeshua koh') {
        if (seenKeys.has('jeshua_koh')) return;
        seenKeys.add('jeshua_koh');
        m.email = 'jeshuakoh2008@gmail.com';
        m.name = 'Jeshua Koh';
        m.rank = 'Sergeant';
        membersList.push(m);
        return;
      }

      if (!em && ic.indexOf('@') !== -1) {
        em = ic;
        m.email = ic;
      }

      var key = em || ic || nm;
      if (!key) return;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      membersList.push(m);
    });

    // Ensure Jeshua Koh is always included as Creator
    if (!seenKeys.has('jeshua_koh')) {
      membersList.unshift({
        email: 'jeshuakoh2008@gmail.com',
        name: 'Jeshua Koh',
        rank: 'Sergeant'
      });
    }

    // Sort: Jeshua Koh first, then alphabetical by name
    membersList.sort(function(a, b) {
      var aIsJeshua = (a.email || '').toLowerCase().trim() === 'jeshuakoh2008@gmail.com';
      var bIsJeshua = (b.email || '').toLowerCase().trim() === 'jeshuakoh2008@gmail.com';
      if (aIsJeshua) return -1;
      if (bIsJeshua) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    var listHtml = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:2px 4px;">' +
      '<div style="font-weight:700;color:var(--text-primary);font-size:15px;letter-spacing:0.2px;">Configured Accounts &amp; Permissions (<span id="rbac-count">' + membersList.length + '</span>)</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<select id="rbac-role-filter" class="form-select rbac-role-select" onchange="filterRbacMembers()" style="padding:7px 12px;font-size:12px;min-width:130px;">' +
          '<option value="all">All Roles</option>' +
          '<option value="members">Members</option>' +
          '<option value="admins">Admins</option>' +
          '<option value="super_admins">Super Admins</option>' +
        '</select>' +
        '<input type="text" id="rbac-search-input" placeholder="Search by name or email..." oninput="filterRbacMembers()" style="background:var(--bg-input);border:1px solid var(--border-card);color:var(--text-primary);border-radius:var(--radius-sm);padding:7px 14px;font-size:12px;width:220px;outline:none;" />' +
      '</div>' +
    '</div>' +
    '<div id="rbac-members-container" style="display:flex;flex-direction:column;gap:10px;">';

    var modules = (typeof RBAC !== 'undefined') ? RBAC.MODULES.filter(function(m) { return m.id !== 'roles'; }) : [];

    membersList.forEach(function(m, idx) {
      var email = m.email || m.ic || '';
      var currentRole = (typeof RBAC !== 'undefined') ? RBAC.getUserRole(email) : 'member';
      var currentPerms = (typeof RBAC !== 'undefined') ? RBAC.getUserPermissions(email) : [];
      var isAdminUser = currentRole === 'admin';
      var isJeshua = (email.toLowerCase().trim() === 'jeshuakoh2008@gmail.com');
      var memberRank = isJeshua ? 'Sergeant' : (m.rank || 'Recruit');

      var subtitleParts = [];
      subtitleParts.push(typeof escapeHtml === 'function' ? escapeHtml(email) : email);
      subtitleParts.push(typeof escapeHtml === 'function' ? escapeHtml(memberRank) : memberRank);
      if (isJeshua) {
        subtitleParts.push('<span style="color:var(--gold);font-weight:700;">Creator</span>');
      }
      var rankSubtitle = subtitleParts.join(' • ');

      var rbacPresence = (typeof getMemberPresenceStatus === 'function')
        ? getMemberPresenceStatus(m, _adminPresenceMap)
        : null;
      var avatarHtml = getAdminMemberAvatarHtml(m.name, email, 38, rbacPresence);

      listHtml += '<div class="rbac-member-row admin-row" data-name="' + (typeof escapeHtml === 'function' ? escapeHtml((m.name || '').toLowerCase()) : '') + '" data-email="' + (typeof escapeHtml === 'function' ? escapeHtml(email.toLowerCase()) : '') + '" data-role="' + currentRole + '" style="cursor:default;margin-bottom:0;display:flex;flex-direction:column;gap:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;width:100%;">' +
          '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:180px;">' +
            avatarHtml +
            '<div style="flex:1;min-width:0;">' +
              '<div class="admin-name" style="font-size:15px;font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(m.name || 'Unnamed Member') : m.name) + '</div>' +
              '<div class="admin-sub" style="font-size:12px;margin-top:3px;color:var(--text-muted);">' + rankSubtitle + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
            '<select class="form-select rbac-role-select" data-user-email="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onchange="handleRbacRoleChange(this.getAttribute(&quot;data-user-email&quot;), this.value)">' +
              '<option value="member"' + (currentRole === 'member' ? ' selected' : '') + '>Member</option>' +
              '<option value="admin"' + (currentRole === 'admin' ? ' selected' : '') + '>Admin</option>' +
              '<option value="super_admin"' + (currentRole === 'super_admin' ? ' selected' : '') + '>Super Admin</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="rbac-perms-box" id="rbac-perms-' + idx + '" style="margin-top:4px;padding:14px 16px;background:rgba(0,0,0,0.18);border-radius:10px;border:1px solid var(--border-subtle);display:' + (isAdminUser ? 'block' : 'none') + ';width:100%;box-sizing:border-box;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Scoped Admin Permissions:</div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button type="button" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onclick="selectAllRbacPerms(this.getAttribute(&quot;data-user&quot;), true)" style="background:transparent;border:none;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0;">Select All</button>' +
              '<span style="color:var(--border-card);font-size:11px;">|</span>' +
              '<button type="button" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onclick="selectAllRbacPerms(this.getAttribute(&quot;data-user&quot;), false)" style="background:transparent;border:none;color:var(--text-muted);font-size:11px;font-weight:600;cursor:pointer;padding:0;">Clear All</button>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;">';

      modules.forEach(function(mod) {
        var isChecked = currentPerms.includes(mod.id);
        listHtml += '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-primary);padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;user-select:none;">' +
          '<input type="checkbox" class="rbac-mod-checkbox" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" value="' + mod.id + '"' + (isChecked ? ' checked' : '') + ' onchange="saveMemberRbacPermissions(this.getAttribute(&quot;data-user&quot;), &quot;admin&quot;)" style="accent-color:var(--accent);cursor:pointer;" />' +
          '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(mod.label) : mod.label) + '</span>' +
        '</label>';
      });

      listHtml += '</div></div></div>';
    });

    listHtml += '</div>';

    rolesSec.innerHTML = headerHtml + listHtml;
  }

  async function handleRbacRoleChange(email, newRole) {
    var rows = document.querySelectorAll('.rbac-member-row');
    rows.forEach(function(row) {
      var rowEmail = row.getAttribute('data-email');
      if (rowEmail === email.toLowerCase()) {
        row.setAttribute('data-role', newRole);
        var permsBox = row.querySelector('.rbac-perms-box');
        if (permsBox) {
          permsBox.style.display = (newRole === 'admin') ? 'block' : 'none';
        }
      }
    });

    await saveMemberRbacPermissions(email, newRole);
  }

  function selectAllRbacPerms(email, selectAll) {
    var row = document.querySelector('.rbac-member-row[data-email="' + email.toLowerCase() + '"]');
    if (!row) return;
    row.querySelectorAll('.rbac-mod-checkbox').forEach(function(cb) {
      cb.checked = !!selectAll;
    });
    saveMemberRbacPermissions(email, 'admin');
  }

  function filterRbacMembers(query) {
    var searchInp = document.getElementById('rbac-search-input');
    var q = (typeof query === 'string' ? query : (searchInp ? searchInp.value : '')).toLowerCase().trim();
    var filterEl = document.getElementById('rbac-role-filter');
    var roleFilter = filterEl ? filterEl.value : 'all';

    var rows = document.querySelectorAll('.rbac-member-row');
    var visibleCount = 0;

    rows.forEach(function(r) {
      var n = r.getAttribute('data-name') || '';
      var e = r.getAttribute('data-email') || '';
      var userRole = r.getAttribute('data-role') || 'member';

      var matchesSearch = !q || n.includes(q) || e.includes(q);
      var matchesRole = true;

      if (roleFilter === 'members') {
        matchesRole = (userRole === 'member');
      } else if (roleFilter === 'admins') {
        matchesRole = (userRole === 'admin' || userRole === 'super_admin');
      } else if (roleFilter === 'super_admins') {
        matchesRole = (userRole === 'super_admin');
      }

      if (matchesSearch && matchesRole) {
        r.style.display = 'flex';
        visibleCount++;
      } else {
        r.style.display = 'none';
      }
    });

    var countEl = document.getElementById('rbac-count');
    if (countEl) countEl.textContent = visibleCount;
  }

  async function saveMemberRbacPermissions(email, overrideRole) {
    if (!email) return;
    var row = document.querySelector('.rbac-member-row[data-email="' + email.toLowerCase() + '"]');
    if (!row) return;

    var roleSelect = row.querySelector('.rbac-role-select');
    var newRole = overrideRole || (roleSelect ? roleSelect.value : 'member');

    var checkedPerms = [];
    row.querySelectorAll('.rbac-mod-checkbox:checked').forEach(function(cb) {
      checkedPerms.push(cb.value);
    });

    if (newRole === 'admin' && checkedPerms.length === 0) {
      row.querySelectorAll('.rbac-mod-checkbox').forEach(function(cb) {
        cb.checked = true;
        checkedPerms.push(cb.value);
      });
    }

    try {
      if (typeof RBAC !== 'undefined' && typeof RBAC.assignUserRole === 'function') {
        await RBAC.assignUserRole(email, newRole, checkedPerms);
        row.setAttribute('data-role', newRole);
        if (typeof showToast === 'function') {
          showToast('Updated role to ' + (newRole === 'super_admin' ? 'Super Admin' : (newRole === 'admin' ? 'Admin' : 'Member')) + ' for ' + email, 'success');
        }
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Failed to update role: ' + err.message, 'error');
      }
      // Revert select value if failed
      if (roleSelect && typeof RBAC !== 'undefined') {
        roleSelect.value = RBAC.getUserRole(email);
      }
    }
  }


  // ── Creator Avatar Outlines Studio ───────────────────────────────
  async function renderCreatorAvatarOutlinesStudio() {
    if (typeof document === 'undefined') return;

    var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    if (!isCreatorUser) {
      if (typeof showToast === 'function') {
        showToast('Access Denied: Only jeshuakoh2008@gmail.com has access to the Creator Avatar Outlines module.', 'error');
      }
      backToAdminHome();
      return;
    }

    var panel = document.getElementById('admin-panel');
    if (!panel) return;

    var sec = document.getElementById('adm-section-creator-outlines');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'adm-section-creator-outlines';
      panel.appendChild(sec);
    }
    sec.style.display = 'block';

    var backBar = document.getElementById('adm-back-bar');
    if (backBar) {
      backBar.style.display = 'block';
      var titleSpan = backBar.querySelector('.adm-back-title') || backBar.querySelector('span');
      if (titleSpan) titleSpan.textContent = 'Creator Avatar Outlines &amp; Cosmetics Studio';
    }

    sec.innerHTML = (typeof renderSkeletonTable === 'function')
      ? renderSkeletonTable(4, 5)
      : '<div class="skeleton-shimmer" style="height:200px;border-radius:12px;"></div>';

    if (typeof loadCustomAvatarOutlines === 'function') {
      await loadCustomAvatarOutlines();
    }

    var client = getSupabaseClient();
    var members = [];

    // 1. Check in-memory admin members first
    if (_adminMembers && Object.keys(_adminMembers).length > 0) {
      members = Object.values(_adminMembers);
    }

    // 2. Fetch fresh members directly from Supabase
    if (client && typeof client.get === 'function') {
      try {
        var remoteMembers = await client.get('bb_members?order=name.asc');
        if (Array.isArray(remoteMembers) && remoteMembers.length > 0) {
          members = remoteMembers;
        }
      } catch (fetchErr) {
        try {
          var fallbackMembers = await client.get('bb_members?select=ic,email,name,rank,squad,section&order=name.asc');
          if (Array.isArray(fallbackMembers) && fallbackMembers.length > 0) {
            members = fallbackMembers;
          }
        } catch (_) {}
      }
    }

    // 3. Fallback to localStorage member caches
    if (!members.length && typeof localStorage !== 'undefined') {
      try {
        var rawCache = localStorage.getItem('bb_members_cache') || localStorage.getItem('bb_all_members');
        if (rawCache) {
          var parsed = JSON.parse(rawCache);
          if (Array.isArray(parsed) && parsed.length > 0) members = parsed;
        }
      } catch (_) {}
    }

    // 4. Fallback to cached department members
    if (!members.length && typeof window !== 'undefined' && Array.isArray(window._cachedDepartmentMembers) && window._cachedDepartmentMembers.length > 0) {
      members = window._cachedDepartmentMembers.slice();
    }

    // 5. Exclude deleted members from blacklist
    var deletedSet = new Set();
    if (client && typeof client.get === 'function') {
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          var arr = JSON.parse(cfgRes[0].value);
          if (Array.isArray(arr)) {
            arr.forEach(function(id) { deletedSet.add(id); });
          }
        }
      } catch (_) {}
    }

    if (!Array.isArray(members)) members = [];

    members = members.filter(function(m) {
      if (!m) return false;
      if (typeof isDeletedOrTestAccount === 'function' && isDeletedOrTestAccount(m)) return false;
      if (m.ic && deletedSet.has(m.ic)) return false;
      return m.department !== 'deleted' && m.department !== 'archived_deleted';
    });

    // Populate _adminMembers & localStorage cache so all modules immediately share data
    if (members.length > 0) {
      _adminMembers = _adminMembers || {};
      members.forEach(function(m) {
        if (m && m.ic) {
          _adminMembers[m.ic] = m;
        }
      });
      if (typeof global !== 'undefined') global._adminMembers = _adminMembers;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('bb_members_cache', JSON.stringify(members));
        } catch (_) {}
      }
    }

    var stylesCatalog = (typeof AVATAR_OUTLINE_STYLES !== 'undefined') ? AVATAR_OUTLINE_STYLES : {};
    var stylesList = Object.keys(stylesCatalog).map(function(k) { return stylesCatalog[k]; });

    var customCount = 0;
    members.forEach(function(m) {
      var out = (typeof getMemberAvatarOutline === 'function')
        ? getMemberAvatarOutline(m.email || m.ic, m.name)
        : null;
      if (out && out.style && out.style !== 'none') customCount++;
    });

    var html =
      '<div style="margin-bottom:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
          '<div>' +
            '<div style="font-family:var(--font-headline);font-size:20px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
              '<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:rgba(139,92,246,0.15);color:#a855f7;">' +
                '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>' +
              '</span>' +
              'Creator Avatar Outlines Studio' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Exclusive Creator Studio &middot; Assign custom animated RGB, gradients, and solid outline accents to member profiles.</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:rgba(139,92,246,0.15);color:#a855f7;border:1px solid rgba(139,92,246,0.3);">' + customCount + ' Active Outlines</span>' +
            '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:var(--bg-card-subtle);color:var(--text-secondary);border:1px solid var(--border-card);">' + members.length + ' Total Members</span>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:14px;position:relative;">' +
          '<input type="text" id="creator-outlines-search" class="form-input" placeholder="Search members by name, squad, rank, or outline style..." style="padding-left:36px;width:100%;box-sizing:border-box;" />' +
          '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;">' +
            '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '</span>' +
        '</div>' +

        '<div id="creator-outlines-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px;"></div>' +
      '</div>';

    sec.innerHTML = html;

    function renderGrid(query) {
      var q = String(query || '').toLowerCase().trim();
      var grid = document.getElementById('creator-outlines-grid');
      if (!grid) return;

      var filtered = members.filter(function(m) {
        if (!q) return true;
        var curOut = (typeof getMemberAvatarOutline === 'function')
          ? getMemberAvatarOutline(m.email || m.ic, m.name)
          : null;
        var outLabel = (curOut && curOut.config && curOut.config.label) ? curOut.config.label.toLowerCase() : '';
        return (m.name || '').toLowerCase().includes(q) ||
               (m.ic || '').toLowerCase().includes(q) ||
               (m.rank || '').toLowerCase().includes(q) ||
               (m.squad || '').toLowerCase().includes(q) ||
               outLabel.includes(q);
      });

      if (!filtered.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px 20px;color:var(--text-muted);background:var(--bg-card-subtle);border:1px dashed var(--border-card);border-radius:12px;">No matching members found.</div>';
        return;
      }

      var cardsHtml = '';
      filtered.forEach(function(m) {
        var cleanTarget = m.email || m.ic;
        var curOut = (typeof getMemberAvatarOutline === 'function')
          ? getMemberAvatarOutline(cleanTarget, m.name)
          : { style: 'none', config: { label: 'Standard (None)' } };

        var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name || 'Member') : (m.name || 'Member');
        var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'Member') : (m.rank || 'Member');
        var safeSquad = (typeof escapeHtml === 'function') ? escapeHtml(m.squad || 'No Platoon') : (m.squad || 'No Platoon');
        var safeTarget = (typeof escapeHtml === 'function') ? escapeHtml(cleanTarget) : cleanTarget;

        var avatarHtml = getAdminMemberAvatarHtml(m.name, cleanTarget, 48);

        var curCosmetic = (typeof getMemberCosmetic === 'function')
          ? getMemberCosmetic(cleanTarget, m.name)
          : { id: 'none' };

        var cosmeticsCatalog = (typeof PROFILE_COSMETICS !== 'undefined') ? PROFILE_COSMETICS : {};
        var cosmeticsOptionsHtml = '<option value="none"' + (curCosmetic.id === 'none' ? ' selected' : '') + '>None (No cosmetic)</option>';
        var cats = ['headwear', 'badges'];
        cats.forEach(function(cKey) {
          var matching = Object.values(cosmeticsCatalog).filter(function(it) { return it.category === cKey; });
          if (matching.length) {
            cosmeticsOptionsHtml += '<optgroup label="' + matching[0].categoryLabel + '">';
            matching.forEach(function(it) {
              var sel = (it.id === curCosmetic.id) ? ' selected' : '';
              cosmeticsOptionsHtml += '<option value="' + it.id + '"' + sel + '>' + it.name + ' (' + it.price + ' 🪙)' + '</option>';
            });
            cosmeticsOptionsHtml += '</optgroup>';
          }
        });

        var optionsHtml = '';
        stylesList.forEach(function(st) {
          var selected = (st.id === curOut.style) ? ' selected' : '';
          optionsHtml += '<option value="' + st.id + '"' + selected + '>' + ((typeof escapeHtml === 'function') ? escapeHtml(st.label) : st.label) + ' (' + st.badge + ')' + '</option>';
        });

        cardsHtml +=
          '<div class="creator-member-card" data-member-target="' + safeTarget + '" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div class="creator-card-avatar-wrap" style="flex-shrink:0;">' + avatarHtml + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:14px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeRank + ' &middot; ' + safeSquad + '</div>' +
                '<div style="font-size:10px;color:var(--accent);margin-top:2px;font-family:monospace;">' + safeTarget + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;margin-top:auto;">' +
              '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<label style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;color:var(--text-muted);">Avatar Outline</label>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<select class="form-input creator-outline-select" style="font-size:12px;padding:6px 10px;flex:1;">' +
                    optionsHtml +
                  '</select>' +
                  '<button type="button" class="creator-apply-btn" style="background:var(--accent);color:var(--btn-on-accent,#121418);border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">' +
                    'Apply' +
                  '</button>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<label style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;color:var(--text-muted);">Profile Cosmetic</label>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<select class="form-input creator-cosmetic-select" style="font-size:12px;padding:6px 10px;flex:1;">' +
                    cosmeticsOptionsHtml +
                  '</select>' +
                  '<button type="button" class="creator-apply-cosmetic-btn" style="background:var(--secondary,#1e3a8a);color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">' +
                    'Give / Set' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      });

      grid.innerHTML = cardsHtml;

      grid.querySelectorAll('.creator-member-card').forEach(function(card) {
        var targetId = card.getAttribute('data-member-target');
        var select = card.querySelector('.creator-outline-select');
        var applyBtn = card.querySelector('.creator-apply-btn');
        var avatarWrap = card.querySelector('.creator-card-avatar-wrap');

        if (select && avatarWrap) {
          select.addEventListener('change', function() {
            var newStyle = select.value;
            if (_customAvatarOutlinesMap) {
              _customAvatarOutlinesMap[targetId.toLowerCase()] = { style: newStyle };
            }
            var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
            avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
          });
        }

        if (applyBtn && select) {
          applyBtn.addEventListener('click', async function() {
            var newStyle = select.value;
            applyBtn.disabled = true;
            applyBtn.textContent = 'Saving...';
            try {
              var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
              var actorEmail = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
              var res = await saveMemberAvatarOutline(targetId, newStyle, actorEmail, mem.name);
              if (res.success) {
                if (typeof showToast === 'function') {
                  showToast('Custom avatar outline applied successfully!', 'success');
                }
                avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
              } else {
                if (typeof showToast === 'function') {
                  showToast(res.error || 'Failed to save outline.', 'error');
                }
              }
            } catch (err) {
              if (typeof showToast === 'function') showToast('Error saving: ' + (err.message || err), 'error');
            } finally {
              applyBtn.disabled = false;
              applyBtn.textContent = 'Apply';
            }
          });
        }

        var cosmeticSelect = card.querySelector('.creator-cosmetic-select');
        var applyCosmeticBtn = card.querySelector('.creator-apply-cosmetic-btn');

        if (cosmeticSelect && avatarWrap) {
          cosmeticSelect.addEventListener('change', function() {
            var newCosId = cosmeticSelect.value;
            if (typeof _memberCosmeticsMap !== 'undefined' && _memberCosmeticsMap) {
              var existing = _memberCosmeticsMap[targetId.toLowerCase()] || {};
              _memberCosmeticsMap[targetId.toLowerCase()] = Object.assign({}, existing, { equipped: newCosId, activeId: newCosId });
            }
            var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
            avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
          });
        }

        if (applyCosmeticBtn && cosmeticSelect) {
          applyCosmeticBtn.addEventListener('click', async function() {
            var newCosId = cosmeticSelect.value;
            applyCosmeticBtn.disabled = true;
            applyCosmeticBtn.textContent = 'Saving...';
            try {
              var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
              var actorEmail = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
              var res = await saveMemberCosmetic(targetId, newCosId, actorEmail, mem.name);
              if (res.success) {
                if (typeof showToast === 'function') {
                  showToast('Profile cosmetic granted to ' + (mem.name || targetId) + '!', 'success');
                }
                avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
              } else {
                if (typeof showToast === 'function') {
                  showToast(res.error || 'Failed to grant cosmetic.', 'error');
                }
              }
            } catch (err) {
              if (typeof showToast === 'function') showToast('Error saving: ' + (err.message || err), 'error');
            } finally {
              applyCosmeticBtn.disabled = false;
              applyCosmeticBtn.textContent = 'Give / Set';
            }
          });
        }
      });
    }

    renderGrid('');

    var searchInput = document.getElementById('creator-outlines-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        renderGrid(searchInput.value);
      });
    }
  }

  // ── Admin Blocked Emails Management (bb_blocked_emails) ─────────────────
  var _blockedEmails = [];
  var _blockedEmailsEditMode = false;

  function makeBlockedEmailsArray(items) {
    var arr = (items || []).map(function(item) {
      if (item && typeof item === 'object' && item.email) {
        return {
          email: String(item.email).toLowerCase().trim(),
          date: item.date || new Date().toISOString().split('T')[0],
          reason: item.reason || 'Account restricted by administrator',
          blocked_by: item.blocked_by || 'Admin'
        };
      }
      return {
        email: String(item || '').toLowerCase().trim(),
        date: new Date().toISOString().split('T')[0],
        reason: 'Account restricted by administrator',
        blocked_by: 'Admin'
      };
    }).filter(function(x) { return !!x.email; });

    arr.includes = function(searchVal) {
      var clean = String(searchVal || '').toLowerCase().trim();
      return this.some(function(x) {
        var em = (x && typeof x === 'object' && x.email ? String(x.email) : String(x)).toLowerCase().trim();
        return em === clean;
      });
    };

    return arr;
  }

  async function loadBlockedEmails() {
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.get('bb_config?key=eq.bb_blocked_emails&select=value');
        if (res && res.length && res[0].value) {
          var parsed = typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value;
          if (Array.isArray(parsed)) {
            _blockedEmails = makeBlockedEmailsArray(parsed);
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('bb_blocked_emails', JSON.stringify(_blockedEmails));
              }
            } catch (_) {}
            updateBlockedEmailsCountBadge();
            return _blockedEmails;
          }
        }
      } catch (err) {
        console.warn('loadBlockedEmails note:', err);
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        var cached = localStorage.getItem('bb_blocked_emails');
        if (cached) {
          var parsedCached = JSON.parse(cached);
          if (Array.isArray(parsedCached)) _blockedEmails = makeBlockedEmailsArray(parsedCached);
        }
      } catch (_) {}
    }
    updateBlockedEmailsCountBadge();
    return _blockedEmails;
  }

  async function saveBlockedEmails(list) {
    _blockedEmails = makeBlockedEmailsArray(list);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_blocked_emails', JSON.stringify(_blockedEmails));
      }
    } catch (_) {}

    var client = getSupabaseClient();
    if (client) {
      try {
        await client.req('POST', 'bb_config?on_conflict=key', {
          key: 'bb_blocked_emails',
          value: JSON.stringify(_blockedEmails),
          updated_at: new Date().toISOString()
        });
      } catch (postErr) {
        try {
          await client.patch('bb_config?key=eq.bb_blocked_emails', {
            value: JSON.stringify(_blockedEmails),
            updated_at: new Date().toISOString()
          });
        } catch (patchErr) {
          console.warn('saveBlockedEmails db sync note:', patchErr);
        }
      }
    }
    updateBlockedEmailsCountBadge();
    return _blockedEmails;
  }

  function updateBlockedEmailsCountBadge() {
    if (typeof document === 'undefined') return;
    var badge = document.querySelector('.blocked-emails-count');
    if (badge) badge.textContent = _blockedEmails.length;
  }

  async function addBlockedEmail(email, reason, blockedBy) {
    var em = String(email || '').trim().toLowerCase();
    if (!em || em.indexOf('@') === -1) {
      if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'warning');
      return false;
    }
    if (em === 'jeshuakoh2008@gmail.com') {
      if (typeof showToast === 'function') showToast('Portal Creator email cannot be blocked.', 'error');
      return false;
    }
    await loadBlockedEmails();
    if (_blockedEmails.includes(em)) {
      if (typeof showToast === 'function') showToast('This email is already in the blocklist.', 'warning');
      return false;
    }

    var currentAdmin = 'Admin';
    if (typeof getAdminSessionData === 'function') {
      var s = getAdminSessionData();
      if (s && (s.name || s.username)) currentAdmin = s.name || s.username;
    }
    _blockedEmails.push({
      email: em,
      date: new Date().toISOString().split('T')[0],
      reason: String(reason || '').trim() || 'Account restricted by administrator',
      blocked_by: blockedBy || currentAdmin
    });
    await saveBlockedEmails(_blockedEmails);
    if (typeof showToast === 'function') showToast('Email ' + em + ' has been blocked.', 'success');
    renderBlockedEmailsList();
    return true;
  }

  async function removeBlockedEmail(email) {
    var em = String(email || '').trim().toLowerCase();
    await loadBlockedEmails();
    _blockedEmails = _blockedEmails.filter(function(x) {
      var itmEmail = (x && typeof x === 'object' && x.email) ? String(x.email).toLowerCase().trim() : String(x || '').toLowerCase().trim();
      return itmEmail !== em;
    });
    await saveBlockedEmails(_blockedEmails);
    if (typeof showToast === 'function') showToast('Email ' + em + ' has been unblocked.', 'info');
    renderBlockedEmailsList();
    return true;
  }

  async function updateBlockedEmailReason(email, newReason) {
    var em = String(email || '').trim().toLowerCase();
    await loadBlockedEmails();
    var found = false;
    _blockedEmails.forEach(function(item) {
      var itmEmail = (item && typeof item === 'object' && item.email) ? String(item.email).toLowerCase().trim() : String(item || '').toLowerCase().trim();
      if (itmEmail === em) {
        item.reason = String(newReason || '').trim() || 'Account restricted by administrator';
        found = true;
      }
    });
    if (found) {
      await saveBlockedEmails(_blockedEmails);
      if (typeof showToast === 'function') showToast('Updated blocking reason for ' + em, 'success');
      renderBlockedEmailsList();
    }
  }

  function toggleBlockedEmailsEditMode() {
    _blockedEmailsEditMode = !_blockedEmailsEditMode;
    renderBlockedEmailsList();
  }

  function getBlockedEmailsListHtml() {
    if (!_blockedEmails || _blockedEmails.length === 0) {
      return '<div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:13px;"><svg class="ui-icon" style="opacity:0.5;margin-bottom:6px;width:28px;height:28px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><div style="font-weight:600;color:var(--text-secondary);">No Blocked Emails</div><div>All registered and prospective email addresses are currently allowed.</div></div>';
    }

    var rowsHtml = '';
    _blockedEmails.forEach(function(item) {
      var em = (item && typeof item === 'object' && item.email) ? item.email : String(item);
      var safeEm = (typeof escapeHtml === 'function') ? escapeHtml(em) : em;
      var date = (item && typeof item === 'object' && item.date) ? item.date : '—';
      var safeDate = (typeof escapeHtml === 'function') ? escapeHtml(date) : date;
      var reason = (item && typeof item === 'object' && item.reason) ? item.reason : 'Account restricted by administrator';
      var safeReason = (typeof escapeHtml === 'function') ? escapeHtml(reason) : reason;
      var blockedBy = (item && typeof item === 'object' && item.blocked_by) ? item.blocked_by : 'Admin';
      var safeBlockedBy = (typeof escapeHtml === 'function') ? escapeHtml(blockedBy) : blockedBy;

      rowsHtml += '<tr>' +
        '<td style="font-family:var(--font-mono,monospace);font-weight:600;color:var(--text-primary);">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;flex-shrink:0;">' +
              '<svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
            '</span>' +
            safeEm +
          '</div>' +
        '</td>' +
        '<td style="white-space:nowrap;color:var(--text-secondary);font-size:12px;">' + safeDate + '</td>' +
        '<td>' +
          (_blockedEmailsEditMode
            ? '<input type="text" class="admin-inline-input" value="' + safeReason + '" onchange="updateBlockedEmailReason(\'' + safeEm + '\', this.value)" title="Edit Reason (autosaves)" />'
            : '<span style="color:var(--text-secondary);">' + safeReason + '</span>') +
        '</td>' +
        '<td style="white-space:nowrap;color:var(--text-muted);font-size:12px;">' + safeBlockedBy + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' +
          '<button type="button" onclick="removeBlockedEmail(\'' + safeEm + '\')" style="background:none;border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;" title="Unblock this email address">' +
            'Unblock' +
          '</button>' +
        '</td>' +
      '</tr>';
    });

    var toolbar = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 12px;flex-wrap:wrap;gap:8px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<button type="button" class="portal-btn" onclick="toggleBlockedEmailsEditMode()" style="padding:5px 12px;font-size:12px;border-radius:6px;cursor:pointer;font-weight:600;' + (_blockedEmailsEditMode ? 'background:#f59e0b;border:1px solid #d97706;color:#ffffff;' : 'background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-secondary);') + '">' +
          (_blockedEmailsEditMode ? '✏️ Edit Reasons Active' : '🔒 View Mode (Safe)') +
        '</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);">' +
        '<span class="blocked-emails-count" style="font-weight:700;color:#ef4444;">' + _blockedEmails.length + '</span> address(es) blocked' +
      '</div>' +
    '</div>';

    return toolbar +
      '<div style="overflow-x:auto;border:1px solid var(--border-card);border-radius:10px;background:var(--bg-card);">' +
        '<table class="blocked-emails-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Email Blocked</th>' +
              '<th>Date Blocked</th>' +
              '<th>Reason for Blocking</th>' +
              '<th>Blocked By</th>' +
              '<th style="text-align:right;">Actions</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rowsHtml +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function renderBlockedEmailsList() {
    if (typeof document === 'undefined') return;
    var listContainer = document.querySelector('.blocked-emails-list');
    if (!listContainer) return;
    listContainer.innerHTML = getBlockedEmailsListHtml();
  }

  async function openBlockedEmailsModal() {
    if (typeof document === 'undefined') return;
    var secEl = document.getElementById('adm-section-members');
    if (secEl && secEl.style.display !== 'none') {
      await openBlockedEmailsView();
      return;
    }
    await loadBlockedEmails();

    var existingOverlay = document.querySelector('.blocked-emails-modal-overlay');
    if (existingOverlay) {
      existingOverlay.style.display = 'flex';
      renderBlockedEmailsList();
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'modal-backdrop blocked-emails-modal-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:99999;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Blocked Emails & Account Restrictions');

    overlay.innerHTML =
      '<div class="modal-card" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:16px;max-width:820px;width:100%;box-shadow:var(--shadow-modal,0 20px 40px rgba(0,0,0,0.5));overflow:hidden;display:flex;flex-direction:column;max-height:85vh;">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border-card);display:flex;align-items:center;justify-content:space-between;background:var(--bg-card-subtle);">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,0.15);color:#ef4444;display:flex;align-items:center;justify-content:center;">' +
              '<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
            '</div>' +
            '<div>' +
              '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);">Blocked Emails & Restrictions</div>' +
              '<div style="font-size:11px;color:var(--text-secondary);">Block email addresses from registering accounts or logging in</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="closeBlockedEmailsModal()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;line-height:1;" aria-label="Close dialog">✕</button>' +
        '</div>' +
        '<div style="padding:16px 22px;display:flex;gap:8px;border-bottom:1px solid var(--border-card);flex-wrap:wrap;background:var(--bg-card-subtle);">' +
          '<input type="email" class="form-input new-blocked-email-input" placeholder="Enter email to block (e.g. spam@test.com)" style="flex:1;min-width:200px;font-size:13px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAddBlockedEmail();}"/>' +
          '<input type="text" class="form-input new-blocked-reason-input" placeholder="Reason for blocking (e.g. Spam, duplicate account)" style="flex:1.5;min-width:220px;font-size:13px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAddBlockedEmail();}"/>' +
          '<button type="button" class="submit-btn" onclick="submitAddBlockedEmail()" style="width:auto;margin:0;padding:8px 18px;font-size:13px;background:#b91c1c;color:#ffffff;border:none;white-space:nowrap;font-weight:600;display:inline-flex;align-items:center;gap:6px;">' +
            '<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
            'Block Email' +
          '</button>' +
        '</div>' +
        '<div class="blocked-emails-list" style="padding:18px 22px;overflow-y:auto;flex:1;max-height:420px;">' +
          getBlockedEmailsListHtml() +
        '</div>' +
        '<div style="padding:12px 22px;background:var(--bg-card-subtle);border-top:1px solid var(--border-card);display:flex;justify-content:flex-end;">' +
          '<button type="button" onclick="closeBlockedEmailsModal()" class="submit-btn" style="width:auto;margin:0;padding:6px 16px;font-size:13px;background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-secondary);">Done</button>' +
        '</div>' +
      '</div>';

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeBlockedEmailsModal();
    });

    document.body.appendChild(overlay);
    renderBlockedEmailsList();
  }

  function closeBlockedEmailsModal() {
    if (typeof document === 'undefined') return;
    var overlay = document.querySelector('.blocked-emails-modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  async function submitAddBlockedEmail() {
    if (typeof document === 'undefined') return;
    var emailInput = document.querySelector('.new-blocked-email-input');
    var reasonInput = document.querySelector('.new-blocked-reason-input');
    if (!emailInput) return;
    var em = (emailInput.value || '').trim();
    var reason = reasonInput ? (reasonInput.value || '').trim() : '';
    var ok = await addBlockedEmail(em, reason);
    if (ok) {
      emailInput.value = '';
      if (reasonInput) reasonInput.value = '';
      emailInput.focus();
    }
  }

    // ── Window & Global Attachment ─────────────────────────────────────────────
  if (typeof global !== 'undefined') {
    global.renderAdminAuditLogs    = renderAdminAuditLogs;
    global.SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MS;
    global.ADMIN_SECTIONS           = ADMIN_SECTIONS;
    global.RANK_ORDER               = RANK_ORDER;
    global.MEMBERS_JUNIORS_RANKS    = typeof MEMBERS_JUNIORS_RANKS !== 'undefined' ? MEMBERS_JUNIORS_RANKS : [];
    global.MEMBERS_SENIOR_RANKS     = typeof MEMBERS_SENIOR_RANKS !== 'undefined' ? MEMBERS_SENIOR_RANKS : [];
    global.OFFICER_RANKS            = typeof OFFICER_RANKS !== 'undefined' ? OFFICER_RANKS : [];
    global.populateRankOptions      = typeof populateRankOptions === 'function' ? populateRankOptions : null;
    global.getRanksForSection       = typeof getRanksForSection === 'function' ? getRanksForSection : null;
    global.openAdmin                = openAdmin;
    global.getAdminMemberAvatarHtml = getAdminMemberAvatarHtml;
    global.renderCreatorAvatarOutlinesStudio = renderCreatorAvatarOutlinesStudio;
    global.closeAdmin               = closeAdmin;
    global.logoutAdmin              = logoutAdmin;
    global.adminLogin               = adminLogin;
    global.verifyAdminSession       = verifyAdminSession;
    global.verifyAdminSessionSync   = verifyAdminSessionSync;
    global.getAdminSessionToken     = getAdminSessionToken;
    global.getAdminSessionData      = getAdminSessionData;
    global.getAdminLockoutStatus    = getAdminLockoutStatus;
    global.resetAdminLockout        = resetAdminLockout;
    global.toggleAdminPassVis       = toggleAdminPassVis;
    global.backToAdminHome          = backToAdminHome;
    global.switchAdminSection       = switchAdminSection;
    global.switchDeptTab            = switchDeptTab;
    global.toggleTaskForm           = toggleTaskForm;
    global.calcAge                  = calcAge;
    global.setAdminSort             = setAdminSort;
    global.renderAdminList          = renderAdminList;
    global.handleAdminSectionChange = handleAdminSectionChange;
    global.handleAdminRankChange    = handleAdminRankChange;
    global.populateSquadOptions     = typeof populateSquadOptions === 'function' ? populateSquadOptions : (typeof window !== 'undefined' ? window.populateSquadOptions : null);
    global.formatPlatoonOrSquad     = typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad : (typeof window !== 'undefined' ? window.formatPlatoonOrSquad : null);
    global.openAddMember            = openAddMember;
    global.openEditMember           = openEditMember;
    global.closeEditMember          = closeEditMember;
    global.saveEditMember           = saveEditMember;
    global.deleteEditMember         = deleteEditMember;
    global.deleteMemberAccount      = deleteMemberAccount;
    global.loadAssigneeOptions      = loadAssigneeOptions;
    global.saveTask                 = saveTask;
    global.clearTaskForm            = clearTaskForm;
    global.renderAdminTasks         = renderAdminTasks;
    global.updateTaskStatus         = updateTaskStatus;
    global.editAdminTask            = editAdminTask;
    global.deleteTask               = deleteTask;
    global.renderAdminRoles          = renderAdminRoles;
    global.handleRbacRoleChange      = handleRbacRoleChange;
    global.filterRbacMembers         = filterRbacMembers;
    global.selectAllRbacPerms        = selectAllRbacPerms;
    global.saveMemberRbacPermissions = saveMemberRbacPermissions;
    global.loadBlockedEmails         = loadBlockedEmails;
    global.saveBlockedEmails         = saveBlockedEmails;
    global.addBlockedEmail           = addBlockedEmail;
    global.removeBlockedEmail        = removeBlockedEmail;
    global.updateBlockedEmailReason  = updateBlockedEmailReason;
    global.toggleBlockedEmailsEditMode = toggleBlockedEmailsEditMode;
    global.openBlockedEmailsModal    = openBlockedEmailsModal;
    global.openBlockedEmailsView     = openBlockedEmailsView;
    global.backToMembersList         = backToMembersList;
    global.closeBlockedEmailsModal   = closeBlockedEmailsModal;
    global.submitAddBlockedEmail     = submitAddBlockedEmail;
    global.submitAddBlockedEmailFullView = submitAddBlockedEmailFullView;
    global.renderBlockedEmailsFullView = renderBlockedEmailsFullView;
    global.toggleColumnFilterMenu    = toggleColumnFilterMenu;
    global.closeColumnFilterMenu     = closeColumnFilterMenu;
    global.clearColumnFilter         = clearColumnFilter;
    global.setColumnSort             = setColumnSort;
    global.getAdminSortDir           = function() { return _adminSortDir; };
    global.getAdminMembersSubView    = function() { return _adminMembersSubView; };
    global.getAdminMemberFilters     = function() { return _adminMemberFilters; };
    global.setAdminMembersViewMode   = setAdminMembersViewMode;
    global.getAdminMembersViewMode   = getAdminMembersViewMode;
    global.toggleAdminMemberEditMode = toggleAdminMemberEditMode;
    global.getAdminMemberEditMode    = getAdminMemberEditMode;
    global.setAdminMemberFilter      = setAdminMemberFilter;
    global.resetAdminMemberFilters   = resetAdminMemberFilters;
    global.updateMemberField         = updateMemberField;
    global.toggleSelectAllMembers    = toggleSelectAllMembers;
    global.toggleSelectMemberRow     = toggleSelectMemberRow;
    global.toggleBulkActionsMenu     = toggleBulkActionsMenu;
    global.bulkBlockSelectedMembers  = bulkBlockSelectedMembers;
    global.bulkDeleteSelectedMembers = bulkDeleteSelectedMembers;
    global.getSelectedMemberIcs      = function() { return Array.from(_selectedMemberIcs); };
    global.toggleGlobalFilterPopover = toggleGlobalFilterPopover;
    global.closeGlobalPopovers        = closeGlobalPopovers;
    global.toggleGlobalSortPopover   = toggleGlobalSortPopover;
    global.filterByOverviewCategory  = filterByOverviewCategory;
    global.updateMemberVerificationStatus = updateMemberVerificationStatus;
    global.getMemberVerificationStatus = getMemberVerificationStatus;
    global.getRankInsigniaSvg        = getRankInsigniaSvg;
    global.renderStatusBadge         = renderStatusBadge;
    global.setAdminViewMode          = setAdminViewMode;
    global.getAdminViewMode          = getAdminViewMode;
    global._adminMembers            = _adminMembers;
    global._allAdminTasks           = _allAdminTasks;
  }

  // ── CommonJS Export for Node.js Testing ───────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ADMIN_SECTIONS: ADMIN_SECTIONS,
      RANK_ORDER: RANK_ORDER,
      MEMBERS_JUNIORS_RANKS: typeof MEMBERS_JUNIORS_RANKS !== 'undefined' ? MEMBERS_JUNIORS_RANKS : [],
      MEMBERS_SENIOR_RANKS: typeof MEMBERS_SENIOR_RANKS !== 'undefined' ? MEMBERS_SENIOR_RANKS : [],
      OFFICER_RANKS: typeof OFFICER_RANKS !== 'undefined' ? OFFICER_RANKS : [],
      populateRankOptions: typeof populateRankOptions === 'function' ? populateRankOptions : null,
      getRanksForSection: typeof getRanksForSection === 'function' ? getRanksForSection : null,
      DEFAULT_DEPT_CONFIG: DEFAULT_DEPT_CONFIG,
      openAdmin: openAdmin,
      getAdminMemberAvatarHtml: getAdminMemberAvatarHtml,
      renderCreatorAvatarOutlinesStudio: renderCreatorAvatarOutlinesStudio,
      closeAdmin: closeAdmin,
      logoutAdmin: logoutAdmin,
      getAdminPasswordHash: getAdminPasswordHash,
      verifyAdminPassword: verifyAdminPassword,
      adminLogin: adminLogin,
      verifyAdminSession: verifyAdminSession,
      verifyAdminSessionSync: verifyAdminSessionSync,
      getAdminSessionToken: getAdminSessionToken,
      getAdminSessionData: getAdminSessionData,
      getAdminLockoutStatus: getAdminLockoutStatus,
      resetAdminLockout: resetAdminLockout,
      setAdminSessionTokenForTesting: setAdminSessionTokenForTesting,
      toggleAdminPassVis: toggleAdminPassVis,
      backToAdminHome: backToAdminHome,
      switchAdminSection: switchAdminSection,
      switchDeptTab: switchDeptTab,
      toggleTaskForm: toggleTaskForm,
      calcAge: calcAge,
      setAdminSort: setAdminSort,
      renderAdminList: renderAdminList,
      setAdminMembersViewMode: setAdminMembersViewMode,
      getAdminMembersViewMode: getAdminMembersViewMode,
      toggleAdminMemberEditMode: toggleAdminMemberEditMode,
      getAdminMemberEditMode: getAdminMemberEditMode,
      setAdminMemberFilter: setAdminMemberFilter,
      resetAdminMemberFilters: resetAdminMemberFilters,
      updateMemberField: updateMemberField,
      toggleSelectAllMembers: toggleSelectAllMembers,
      toggleSelectMemberRow: toggleSelectMemberRow,
      toggleBulkActionsMenu: toggleBulkActionsMenu,
      bulkBlockSelectedMembers: bulkBlockSelectedMembers,
      bulkDeleteSelectedMembers: bulkDeleteSelectedMembers,
      getSelectedMemberIcs: function() { return Array.from(_selectedMemberIcs); },
      toggleGlobalFilterPopover: toggleGlobalFilterPopover,
      closeGlobalPopovers: closeGlobalPopovers,
      toggleGlobalSortPopover: toggleGlobalSortPopover,
      filterByOverviewCategory: filterByOverviewCategory,
      updateMemberVerificationStatus: updateMemberVerificationStatus,
      getMemberVerificationStatus: getMemberVerificationStatus,
      getRankInsigniaSvg: getRankInsigniaSvg,
      renderStatusBadge: renderStatusBadge,
      _adminPresenceMap: _adminPresenceMap,
      handleAdminSectionChange: handleAdminSectionChange,
      handleAdminRankChange: handleAdminRankChange,
      populateSquadOptions: typeof populateSquadOptions === 'function' ? populateSquadOptions : (typeof window !== 'undefined' ? window.populateSquadOptions : null),
      formatPlatoonOrSquad: typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad : (typeof window !== 'undefined' ? window.formatPlatoonOrSquad : null),
      openAddMember: openAddMember,
      openEditMember: openEditMember,
      closeEditMember: closeEditMember,
      saveEditMember: saveEditMember,
      deleteEditMember: deleteEditMember,
      deleteMemberAccount: deleteMemberAccount,
      loadAssigneeOptions: loadAssigneeOptions,
      saveTask: saveTask,
      clearTaskForm: clearTaskForm,
      renderAdminTasks: renderAdminTasks,
      updateTaskStatus: updateTaskStatus,
      editAdminTask: editAdminTask,
      deleteTask: deleteTask,
      renderAdminRoles: renderAdminRoles,
      handleRbacRoleChange: handleRbacRoleChange,
      filterRbacMembers: filterRbacMembers,
      selectAllRbacPerms: selectAllRbacPerms,
      saveMemberRbacPermissions: saveMemberRbacPermissions,
      loadBlockedEmails: loadBlockedEmails,
      saveBlockedEmails: saveBlockedEmails,
      addBlockedEmail: addBlockedEmail,
      removeBlockedEmail: removeBlockedEmail,
      updateBlockedEmailReason: updateBlockedEmailReason,
      toggleBlockedEmailsEditMode: toggleBlockedEmailsEditMode,
      openBlockedEmailsModal: openBlockedEmailsModal,
      openBlockedEmailsView: openBlockedEmailsView,
      backToMembersList: backToMembersList,
      closeBlockedEmailsModal: closeBlockedEmailsModal,
      submitAddBlockedEmail: submitAddBlockedEmail,
      submitAddBlockedEmailFullView: submitAddBlockedEmailFullView,
      renderBlockedEmailsFullView: renderBlockedEmailsFullView,
      toggleColumnFilterMenu: toggleColumnFilterMenu,
      closeColumnFilterMenu: closeColumnFilterMenu,
      clearColumnFilter: clearColumnFilter,
      setColumnSort: setColumnSort,
      getAdminSortDir: function() { return _adminSortDir; },
      getAdminMembersSubView: function() { return _adminMembersSubView; },
      getAdminMemberFilters: function() { return _adminMemberFilters; },
      setAdminViewMode: setAdminViewMode,
      getAdminViewMode: getAdminViewMode,
      renderAdminAuditLogs: renderAdminAuditLogs,
      SESSION_IDLE_TIMEOUT_MS: SESSION_IDLE_TIMEOUT_MS,
      getAdminMembers: function() { return _adminMembers; },
      getAdminTasks: function() { return _allAdminTasks; },
      getAdminSortBy: function() { return _adminSortBy; },
      getAdminTaskFilter: function() { return _adminTaskFilter; }
    };
  }
})(typeof window !== 'undefined' ? window : this);
