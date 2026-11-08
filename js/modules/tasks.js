/**
 * 1st Petaling Jaya Boys' Brigade Portal - Tasks & Kanban Board Module
 *
 * Implements NCO department project board, role-based NCO access checks (isNCO),
 * Kanban status transitions (To Do -> In Progress -> Done) with HTML5 drag-and-drop,
 * My Tasks view across projects, Task Brief/Detail modal inspection, dynamic task assignment
 * notifications, and Officer Admin task management (creation, rich description, assignee assignment, deletion).
 * Renders in a dedicated Projects & Tasks view under #page-tasks.
 */

/* global supa, escapeHtml, sanitizeHtml, sanitizeText, sessionGet, sessionSet, showToast, showConfirmModal, isNCO, isNcoRank, reGetValue, reSetValue, reClearValue, syncTaskNotifications, verifyAdminSessionSync, executeRichFormat, isAdmin, isSuperAdmin */

// ── Department Configuration ───────────────────────────────────────────────
var DEPT_CONFIG = {
  department_nco: { label: 'Department NCO', color: 'var(--accent)', cls: 'dept-nco', prefix: 'NCO' },
  secretariat:    { label: 'Secretariat',    color: '#ce93d8',      cls: 'dept-secretariat', prefix: 'SEC' },
  logistics:      { label: 'Logistics',      color: '#42a5f5',      cls: 'dept-logistics',   prefix: 'LOG' },
  media:          { label: 'Media',          color: '#ffb74d',      cls: 'dept-media',       prefix: 'MED' },
  hq:             { label: 'HQ',             color: '#10b981',      cls: 'dept-hq',          prefix: 'HQ'  },
  officers:       { label: 'Officers',       color: '#f59e0b',      cls: 'dept-officers',    prefix: 'OFF' }
};

var STATUS_ORDER = ['planning', 'todo', 'inprogress', 'inreview', 'completed'];

var STATUS_CONFIG = {
  planning:   { label: 'Planning',    color: '#a855f7', cls: 'status-planning' },
  todo:       { label: 'To Do',       color: 'var(--text-secondary)', cls: 'status-todo' },
  inprogress: { label: 'In Progress', color: '#3b82f6', cls: 'status-inprogress' },
  inreview:   { label: 'In Review',   color: '#f59e0b', cls: 'status-inreview' },
  completed:  { label: 'Completed',   color: '#10b981', cls: 'status-completed' }
};

function normalizeTaskStatus(status) {
  if (!status) return 'todo';
  var s = String(status).toLowerCase().trim();
  if (s === 'done') return 'completed';
  if (STATUS_ORDER.indexOf(s) !== -1) return s;
  return 'todo';
}

function getColBody(status) {
  if (status === 'completed') {
    return document.getElementById('col-completed') || document.getElementById('col-done') || document.querySelector('[data-col-body="completed"]');
  }
  return document.getElementById('col-' + status) || document.querySelector('[data-col-body="' + status + '"]');
}

function getColCount(status) {
  if (status === 'completed') {
    return document.getElementById('count-completed') || document.getElementById('count-done') || document.querySelector('[data-col-count="completed"]');
  }
  return document.getElementById('count-' + status) || document.querySelector('[data-col-count="' + status + '"]');
}

function getColElement(status) {
  if (status === 'completed') {
    return document.getElementById('taskcol-completed') || document.getElementById('taskcol-done') || document.querySelector('.task-col[data-col-status="completed"]');
  }
  return document.getElementById('taskcol-' + status) || document.querySelector('.task-col[data-col-status="' + status + '"]');
}

function getTabCount(status) {
  if (status === 'completed') {
    return document.getElementById('tab-count-completed') || document.getElementById('tab-count-done') || document.querySelector('[data-tab-count="completed"]');
  }
  return document.getElementById('tab-count-' + status) || document.querySelector('[data-tab-count="' + status + '"]');
}

var _activeTasksSection = 'parade'; // 'parade' | 'board'
var _tasksViewMode      = 'projects'; // 'projects' | 'board' | 'mytasks'
var _projectDisplayMode = (typeof localStorage !== 'undefined' && localStorage.getItem('bb_proj_view_mode') === 'list') ? 'list' : 'board'; // 'board' | 'list'
var _activeProject      = '';
var _companyProjects    = [];
var _activeDetailTaskId = null;
var _justDragged = false;
var _draggedTaskId = null;
var _cachedDepartmentMembers = [];
if (typeof window !== 'undefined') window._cachedDepartmentMembers = _cachedDepartmentMembers;
var _currentDeptFilter  = 'all';
var _taskSearchQuery    = '';
var _myTasksScopeFilter = 'me';     // 'me' | 'all'
var _myTasksStatusFilter = 'open';  // 'open' | 'all'
var _myTasksProjectFilter = 'all';   // 'all' | <projectName>
var _allLoadedTasks     = [];
var _adminTaskFilter    = 'all';
var _allAdminTasks      = [];
var _taskMap            = {};
var _deletedTaskIds    = {};
var _isSubmittingTask   = false;
var _isDeletingTask     = false;

// Synchronous local memory cache restoration for instant 0ms Projects & Tasks load
try {
  if (typeof localStorage !== 'undefined') {
    var _cachedTasksData = JSON.parse(localStorage.getItem('bb_cached_tasks') || '[]');
    if (Array.isArray(_cachedTasksData) && _cachedTasksData.length) {
      _allLoadedTasks = _cachedTasksData;
      _allLoadedTasks.forEach(function(t) {
        if (t && t.id) _taskMap[t.id] = t;
      });
      if (typeof window !== 'undefined') window._taskMap = _taskMap;
    }
  }
} catch (_) {}

/**
 * Priority SVG icon renderer according to requirements:
 * - Low: Blue flat line ("-")
 * - Medium: Yellow 1 arrow up ("^")
 * - High: Red 2 arrows up ("^ on top of ^")
 */
function getPriorityIconSvg(priority, size) {
  var s = size || 13;
  var p = (priority || 'medium').toLowerCase();
  if (p === 'high') {
    return '<svg class="priority-icon-svg priority-icon-high" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>';
  }
  if (p === 'low') {
    return '<svg class="priority-icon-svg priority-icon-low" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  }
  return '<svg class="priority-icon-svg priority-icon-medium" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
}

/**
 * Ensures project tag and estimate tag are never stripped when updating descriptions
 */
function buildTaskDescriptionWithMeta(t, rawCleanDesc) {
  var pName = (t && t.project_name && t.project_name.trim()) ? t.project_name.trim() : (getTaskProjectName(t) || _activeProject || '');
  var est = (t && t.estimate) || '';
  if (!est && t && t.description) {
    var estMatch = t.description.match(/\[Estimate:\s*([^\]|]+)/i);
    if (estMatch && estMatch[1]) est = estMatch[1].trim();
  }
  var body = (rawCleanDesc || '').replace(/\s*\[(Project:[^\]|]*|Estimate:[^\]|]*)[^\]]*\]/gi, '').trim();
  var tags = [];
  if (pName && pName !== 'General Project' && !pName.toLowerCase().includes('sprint')) {
    tags.push('Project: ' + pName);
  }
  if (est) {
    tags.push('Estimate: ' + est);
  }
  if (tags.length) {
    return body + (body ? '\n\n' : '') + '[' + tags.join(' | ') + ']';
  }
  return body;
}

/**
 * Formats due date string safely without timezone date shifts
 */
function formatTaskDueDateStr(val) {
  if (!val) return 'Due Date';
  var parts = String(val).split('T')[0].split('-');
  if (parts.length === 3) {
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    var d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
    }
  }
  var d2 = new Date(val);
  return !isNaN(d2.getTime()) ? d2.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : 'Due Date';
}

/**
 * Opens native browser date picker directly on due date button click
 */
function openTaskDueDatePicker(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  var input = document.querySelector('.tdm-due-input');
  if (!input) return;

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch (err) {
      console.warn('showPicker error:', err);
    }
  }
  try {
    input.focus();
  } catch (_) {}
}

/**
 * Extracts project name from task object (column or description tag)
 */
function getTaskProjectName(t) {
  if (!t) return '';
  if (t.project_name && t.project_name.trim()) return t.project_name.trim();
  if (t.description) {
    var match = t.description.match(/\[Project:\s*([^\]|]+)/i);
    if (match && match[1] && match[1].trim()) return match[1].trim();
  }
  if (t.department && DEPT_CONFIG[t.department.toLowerCase()]) {
    return DEPT_CONFIG[t.department.toLowerCase()].label;
  }
  return '';
}

/**
 * Persists _companyProjects to localStorage and Supabase bb_config
 */
async function saveProjectsCatalog() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('bb_company_projects', JSON.stringify(_companyProjects)); } catch (_) {}
  }
  var client = getSupaClient();
  if (client) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_projects', value: JSON.stringify(_companyProjects) }, {
        headers: { 'Prefer': 'resolution=merge-duplicates' }
      });
    } catch (_) {
      try {
        await client.patch('bb_config?key=eq.bb_projects', { value: JSON.stringify(_companyProjects) });
      } catch (_) {
        try { await client.post('bb_config', { key: 'bb_projects', value: JSON.stringify(_companyProjects) }); } catch (_) {}
      }
    }
  }
}

/**
 * Loads _companyProjects from localStorage, Supabase bb_config, and existing tasks
 */
async function loadProjectsCatalog() {
  if (typeof localStorage !== 'undefined') {
    try {
      var cached = localStorage.getItem('bb_company_projects');
      if (cached) {
        var arr = JSON.parse(cached);
        if (Array.isArray(arr)) {
          arr.forEach(function(p) {
            if (p && _companyProjects.indexOf(p) === -1) _companyProjects.push(p);
          });
        }
      }
    } catch (_) {}
  }
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_projects&select=value');
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var remoteArr = JSON.parse(rows[0].value);
        if (Array.isArray(remoteArr)) {
          remoteArr.forEach(function(p) {
            if (p && _companyProjects.indexOf(p) === -1) _companyProjects.push(p);
          });
        }
      }
    } catch (_) {}
  }
  if (Array.isArray(_allLoadedTasks)) {
    _allLoadedTasks.forEach(function(t) {
      var p = getTaskProjectName(t);
      if (p && p !== 'General Project' && _companyProjects.indexOf(p) === -1) {
        _companyProjects.push(p);
      }
    });
  }
}

/**
 * Resolves Supabase client instance across browser and test environments
 */
function getSupaClient() {
  if (typeof supa !== 'undefined' && supa) return supa;
  if (typeof window !== 'undefined' && window.supa) return window.supa;
  return null;
}

/**
 * Safe fallback for checking NCO permissions
 * @param {string} rank
 * @returns {boolean}
 */
function checkIsNCO(rank) {
  if (typeof isNcoRank === 'function') return isNcoRank(rank);
  if (typeof window !== 'undefined' && typeof window.isNcoRank === 'function') {
    return window.isNcoRank(rank);
  }
  if (!rank) return false;
  var ncoRanks =
    typeof window !== 'undefined' && window.NCO_RANKS
      ? window.NCO_RANKS
      : ['Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Warrant Officer'];
  if (ncoRanks.indexOf(rank) !== -1) return true;
  if (typeof isNCO === 'function') return isNCO(rank);
  if (typeof window !== 'undefined' && typeof window.isNCO === 'function') {
    return window.isNCO(rank);
  }
  return false;
}

/**
 * Mobile Kanban column tab switcher (To Do / In Progress / Done)
 * @param {string} tab
 * @param {HTMLElement} [btn]
 */
function switchTaskTab(tab, btn) {
  if (typeof document === 'undefined') return;
  var target = normalizeTaskStatus(tab);
  STATUS_ORDER.forEach(function(t) {
    var col = getColElement(t);
    if (col) col.classList.toggle('mobile-active', t === target);
  });
  document.querySelectorAll('.task-col-tab').forEach(function(b) {
    b.classList.remove('active', 'mobile-active');
  });
  if (btn) {
    btn.classList.add('active', 'mobile-active');
  }
}

/**
 * Checks whether a member or rank has permission to view the Projects & Tasks tab.
 * Gating rule: Members and even NCOs cannot see or access Projects & Tasks unless
 * explicitly assigned a department role by an admin, OR they are an officer.
 *
 * @param {Object|string} [memberOrDept] Member object or department string
 * @param {string} [rank] Optional rank string
 * @returns {boolean}
 */
function hasDepartmentRole(memberOrDept, rank) {
  var dept = '';
  var rk = rank || '';
  var explicitMember = false;

  if (memberOrDept && typeof memberOrDept === 'object') {
    dept = memberOrDept.department || '';
    rk = memberOrDept.rank || rk;
    explicitMember = true;
  } else if (typeof memberOrDept === 'string') {
    dept = memberOrDept;
    explicitMember = true;
  }

  if (!explicitMember) {
    if (!dept && typeof sessionGet === 'function') {
      dept = sessionGet('department') || '';
    }
    if (!rk && typeof sessionGet === 'function') {
      rk = sessionGet('rank') || '';
    }
  }

  // 1. Department Assignment Check (Media, Logistics, Secretariat, HQ)
  if (dept) {
    var dKey = String(dept).toLowerCase().trim();
    if (
      dKey === 'department nco' ||
      dKey === 'dept nco' ||
      dKey === 'nco' ||
      dKey === 'secretariat' ||
      dKey === 'logistics' ||
      dKey === 'media' ||
      dKey === 'hq'
    ) {
      return true;
    }
  }

  // 3. Officer Admin active session
  if (!explicitMember) {
    if (typeof verifyAdminSessionSync === 'function' && verifyAdminSessionSync()) {
      return true;
    }
    if (typeof sessionGet === 'function' && (sessionGet('adminAuthed') === true || sessionGet('isAdmin') === 'true')) {
      return true;
    }
  }

  // Regular members and NCOs without Department NCO role cannot access Projects & Tasks
  return false;
}

/**
 * Predicate to check if a member has a department role or officer role for task assignment
 * @param {Object} m
 * @returns {boolean}
 */
function isMemberDepartmentRole(m) {
  if (!m) return false;
  return hasDepartmentRole(m);
}

/**
 * Switches between Weekly Parade view and Projects & Tasks view
 * @param {string} section ('parade' | 'board')
 */
function switchTaskSectionView(section) {
  if (typeof document === 'undefined') return;
  _activeTasksSection = section || 'parade';

  // Update segmented nav pills
  document.querySelectorAll('.tasks-nav-pill').forEach(function(btn) {
    var isTarget = btn.getAttribute('data-task-view') === _activeTasksSection;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', String(isTarget));
  });

  var nd   = document.getElementById('tasks-no-dept');
  var gate = document.getElementById('tasks-gate');
  var board = document.getElementById('tasks-board');

  if (_activeTasksSection === 'parade') {
    if (nd) nd.style.display = 'block';
    if (board) board.style.display = 'none';
    if (gate) gate.style.display = 'none';
  } else {
    // Projects & Tasks section
    if (nd) nd.style.display = 'none';
    var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
    var sessionDept = (typeof sessionGet === 'function') ? sessionGet('department') : '';
    var sessionRank = (typeof sessionGet === 'function') ? sessionGet('rank') : '';
    var isAllowed = hasDepartmentRole({ department: sessionDept, rank: sessionRank }, sessionRank);

    if (!ic) {
      if (gate) {
        gate.style.display = 'block';
        gate.innerHTML = '<div class="gate-icon" style="margin:0 auto 16px;width:56px;height:56px;border-radius:50%;background:var(--bg-card-subtle);display:flex;align-items:center;justify-content:center;color:var(--accent);border:1px solid var(--border-subtle);"><svg class="ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
          + '<div class="page-title" style="text-align:center;">Members Only</div>'
          + '<div class="page-subtitle" style="text-align:center;margin-bottom:10px;">Login to View Tasks</div>'
          + '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;">You need to be logged in to see your department tasks.</div>'
          + '<button class="submit-btn gold" onclick="goToMemberTab()"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Login / Register</button>';
      }
      if (board) board.style.display = 'none';
    } else if (!isAllowed) {
      if (gate) {
        gate.style.display = 'block';
        gate.innerHTML = '<div class="gate-icon" style="margin:0 auto 16px;width:56px;height:56px;border-radius:50%;background:var(--bg-card-subtle);display:flex;align-items:center;justify-content:center;color:var(--accent);border:1px solid var(--border-subtle);"><svg class="ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
          + '<div class="page-title" style="text-align:center;">Department Role Required</div>'
          + '<div class="page-subtitle" style="text-align:center;margin-bottom:10px;">Access Restricted</div>'
          + '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;max-width:440px;margin-left:auto;margin-right:auto;line-height:1.5;">You are currently logged in, but your account has not been assigned a Department role. Only members and NCOs assigned to a department by an Administrator can access Projects & Tasks. Please contact an Officer to assign your Department in the Admin Console.</div>'
          + '<button class="submit-btn gold" onclick="switchTaskSectionView(\'parade\')"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back to Calendar</button>';
      }
      if (board) board.style.display = 'none';
      if (typeof showToast === 'function') {
        showToast('Department Role Required: Only members assigned a Department role can access Projects & Tasks.', 'warning');
      }
    } else {
      if (gate) gate.style.display = 'none';
      if (board) board.style.display = 'block';
      renderTasksBoard(_currentDeptFilter);
    }
  }
}

/**
 * Verifies logged-in member access and controls visibility of the Projects & Tasks tab.
 * Members and NCOs without a department role assigned in the Admin Console cannot see
 * or access the Projects & Tasks tab.
 */
async function checkTasksAccess() {
  if (typeof document === 'undefined') return;
  if (typeof fetchRemoteMemberPresence === 'function') {
    fetchRemoteMemberPresence().catch(function() {});
  } else if (typeof window !== 'undefined' && typeof window.fetchRemoteMemberPresence === 'function') {
    window.fetchRemoteMemberPresence().catch(function() {});
  }
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  var nd = document.getElementById('tasks-no-dept');
  var gate = document.getElementById('tasks-gate');
  var board = document.getElementById('tasks-board');
  var snavTasks = document.getElementById('snav-tasks');
  var boardPill = document.querySelector('.tasks-nav-pill[data-task-view="board"]');
  if (!boardPill) {
    var allPills = document.querySelectorAll('.tasks-nav-pill');
    for (var pi = 0; pi < allPills.length; pi++) {
      if (allPills[pi].getAttribute && allPills[pi].getAttribute('data-task-view') === 'board') {
        boardPill = allPills[pi];
        break;
      }
    }
  }

  // Ensure Weekly Parade schedule on #page-parade stays visible
  if (nd) nd.style.display = 'block';

  if (!ic) {
    if (boardPill) boardPill.style.display = 'none';
    if (snavTasks) snavTasks.style.display = 'none';
    if (gate) gate.style.display = 'block';
    if (board) board.style.display = 'none';
    return;
  }

  // Fast-path: reveal instantly (< 1ms) if permissions are already in active session
  var cachedDept = (typeof sessionGet === 'function') ? sessionGet('department') : '';
  var cachedRank = (typeof sessionGet === 'function') ? sessionGet('rank') : '';
  if (cachedDept || cachedRank) {
    var fastAllowed = hasDepartmentRole({ department: cachedDept, rank: cachedRank }, cachedRank);
    if (fastAllowed) {
      if (boardPill) boardPill.style.display = 'inline-flex';
      if (snavTasks) snavTasks.style.display = 'flex';
      if (gate) gate.style.display = 'none';
      if (board) board.style.display = 'block';
      setTasksViewMode(_tasksViewMode || 'projects');
    }
  }

  var client = getSupaClient();
  if (!client) {
    if (gate) gate.style.display = 'block';
    if (board) board.style.display = 'none';
    return;
  }

  try {
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=name,department,rank');
    var m    = data && data[0];
    var dept = m && m.department;
    var rank = (m && m.rank) || (typeof sessionGet === 'function' ? sessionGet('rank') : '');

    if (typeof sessionSet === 'function') {
      if (sessionGet('department') !== (dept || '')) sessionSet('department', dept || '', { localOnly: true });
      if (rank && sessionGet('rank') !== rank) sessionSet('rank', rank, { localOnly: true });
    }

    var isAllowed = hasDepartmentRole(m || { department: dept, rank: rank }, rank);

    if (!isAllowed) {
      if (boardPill) boardPill.style.display = 'none';
      if (snavTasks) snavTasks.style.display = 'none';
      if (gate) {
        gate.style.display = 'block';
        var gateBtn = gate.querySelector('.submit-btn');
        if (gateBtn) {
          gateBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + (ic ? 'View Member Profile' : 'Login / Register');
        }
      }
      if (board) board.style.display = 'none';
      return;
    }

    // Member has department role or officer rank: reveal Projects & Tasks
    if (boardPill) boardPill.style.display = 'inline-flex';
    if (snavTasks) snavTasks.style.display = 'flex';

    if (!dept || !DEPT_CONFIG[dept.toLowerCase()]) {
      if (boardPill) boardPill.style.display = 'none';
      if (snavTasks) snavTasks.style.display = 'none';
      if (gate) {
        gate.style.display = 'block';
        var gateBtn2 = gate.querySelector('.submit-btn');
        if (gateBtn2) {
          gateBtn2.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + (ic ? 'View Member Profile' : 'Login / Register');
        }
      }
      if (board) board.style.display = 'none';
      return;
    }

    var cfg = DEPT_CONFIG[dept.toLowerCase()];
    var dt  = document.getElementById('tasks-dept-title');  if (dt) dt.textContent = cfg.label + ' Department';
    var ds  = document.getElementById('tasks-dept-sub');    if (ds) ds.textContent = 'Projects & Tasks';
    var db  = document.getElementById('tasks-dept-badge');
    if (db) db.innerHTML = '<span class="dept-badge ' + cfg.cls + '">' + cfg.label + '</span>';
    _currentDeptFilter = dept.toLowerCase();

    if (gate) gate.style.display = 'none';
    if (board) board.style.display = 'block';
    setTasksViewMode('projects');
  } catch (e) {
    console.error('checkTasksAccess error:', e);
  }
}

/**
 * Preview board demo allows visitors to explore the Kanban UI/UX
 */
function previewTasksBoardDemo() {
  if (typeof document === 'undefined') return;
  var gate = document.getElementById('tasks-gate');
  var board = document.getElementById('tasks-board');
  if (gate) gate.style.display = 'none';
  if (board) board.style.display = 'block';
  setTasksViewMode('projects');
}

/**
 * Toggles view mode between Kanban Board ('board') and My Tasks Table ('mytasks')
 * @param {string} mode ('board' | 'mytasks')
 */
function setTasksViewMode(mode) {
  _tasksViewMode = mode || 'projects';
  if (typeof document === 'undefined') return;

  var boardCol = document.getElementById('tasks-columns');
  var colTabs  = document.getElementById('task-col-tabs');
  var myTasks  = document.querySelector('.my-tasks-container');
  var projContainer = document.querySelector('.projects-container');
  var noProjEl = document.querySelector('.tasks-no-project-placeholder');
  var addBtn = document.querySelector('.task-primary-btn');
  var searchBox = document.querySelector('.task-toolbar-actions .task-search-box');
  var deptSelect = document.querySelector('.task-dept-select');
  if (deptSelect) deptSelect.style.display = 'none';

  // Toggle active button in toolbar
  document.querySelectorAll('.task-view-toggle .view-toggle-btn').forEach(function(btn) {
    var vmode = btn.getAttribute('data-vmode');
    btn.classList.toggle('active', vmode === _tasksViewMode);
  });

  var sep = document.querySelector('.task-breadcrumb-sep');
  var cur = document.getElementById('tasks-dept-title');
  var delProjBtn = document.querySelector('.project-delete-header-btn');
  var projToggle = document.querySelector('.project-board-view-toggle');
  var listView   = document.querySelector('.tasks-board-list-view');

  if (_tasksViewMode === 'projects') {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (projToggle) projToggle.style.display = 'none';
    if (noProjEl) noProjEl.style.display = 'none';
    if (myTasks) myTasks.style.display = 'none';
    if (projContainer) projContainer.style.display = 'block';
    if (delProjBtn) delProjBtn.style.display = 'none';
    if (addBtn) {
      addBtn.style.display = 'none';
    }
    if (searchBox) searchBox.style.display = 'none';
    if (sep) sep.style.display = 'none';
    if (cur) cur.style.display = 'none';
    renderProjectsView();
  } else if (_tasksViewMode === 'board') {
    var hasActiveProject = !!(_activeProject && _activeProject.toLowerCase() !== 'all tasks' && _activeProject.toLowerCase() !== 'all');

    if (hasActiveProject) {
      if (projToggle) projToggle.style.display = 'inline-flex';
      var bBtn = document.querySelector('.project-view-btn[data-proj-vmode="board"]');
      var lBtn = document.querySelector('.project-view-btn[data-proj-vmode="list"]');
      if (bBtn) bBtn.classList.toggle('active', _projectDisplayMode === 'board');
      if (lBtn) lBtn.classList.toggle('active', _projectDisplayMode === 'list');
      if (_projectDisplayMode === 'list') {
        if (boardCol) boardCol.style.display = 'none';
        if (colTabs) colTabs.style.display = 'none';
        if (listView) listView.style.display = 'block';
      } else {
        if (boardCol) boardCol.style.display = '';
        if (colTabs) colTabs.style.display = '';
        if (listView) listView.style.display = 'none';
      }
      if (noProjEl) noProjEl.style.display = 'none';
      if (myTasks) myTasks.style.display = 'none';
      if (projContainer) projContainer.style.display = 'none';
      if (delProjBtn) delProjBtn.style.display = 'inline-flex';
      if (addBtn) {
        addBtn.style.display = 'inline-flex';
        addBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> <span>Add Task</span>';
        addBtn.setAttribute('onclick', 'openCreateTaskModal()');
      }
      if (searchBox) searchBox.style.display = 'flex';
      if (sep) sep.style.display = 'inline';
      if (cur) {
        cur.style.display = 'inline';
        cur.textContent = _activeProject;
      }
      renderTasksBoard(_activeProject);
    } else {
      // No project selected
      if (boardCol) boardCol.style.display = 'none';
      if (colTabs) colTabs.style.display = 'none';
      if (listView) listView.style.display = 'none';
      if (projToggle) projToggle.style.display = 'none';
      if (noProjEl) noProjEl.style.display = 'block';
      if (myTasks) myTasks.style.display = 'none';
      if (projContainer) projContainer.style.display = 'none';
      if (delProjBtn) delProjBtn.style.display = 'none';
      if (addBtn) addBtn.style.display = 'none';
      if (searchBox) searchBox.style.display = 'none';
      if (sep) sep.style.display = 'none';
      if (cur) cur.style.display = 'none';
    }
  } else if (_tasksViewMode === 'mytasks') {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (projToggle) projToggle.style.display = 'none';
    if (noProjEl) noProjEl.style.display = 'none';
    if (myTasks) myTasks.style.display = 'block';
    if (projContainer) projContainer.style.display = 'none';
    if (delProjBtn) delProjBtn.style.display = 'none';
    if (addBtn) addBtn.style.display = 'none';
    if (searchBox) searchBox.style.display = 'none';
    if (sep) sep.style.display = 'none';
    if (cur) cur.style.display = 'none';
    renderMyTasksView();
  }
}

/**
 * Opens a specific project's Kanban board directly
 */
function openProjectBoard(projectName) {
  _activeProject = projectName || 'General Project';
  setTasksViewMode('board');
}

/**
 * Renders the Projects Overview list (Image 3)
 */
function paintProjectsList(container) {
  if (!container) return;
  var projectNamesMap = {};
  _allLoadedTasks.forEach(function(t) {
    var p = getTaskProjectName(t);
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') {
      projectNamesMap[p] = true;
    }
  });

  _companyProjects.forEach(function(p) {
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') projectNamesMap[p] = true;
  });

  var projectList = Object.keys(projectNamesMap);

  var html = '<div class="projects-overview-header">'
    + '<div>'
    +   '<h2 class="projects-overview-title">Projects</h2>'
    +   '<p class="projects-overview-sub">Every project in your workspace. Select a project to view its board.</p>'
    + '</div>'
    + '<button type="button" class="task-primary-btn" onclick="openAddProjectModal()">'
    +   '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    +   '<span>Add Project</span>'
    + '</button>'
    + '</div>'
    + '<div class="projects-search-bar">'
    +   '<div class="task-search-box" style="width:100%;max-width:320px;">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    +     '<input type="text" class="task-search-input" style="width:100%;" placeholder="Search projects..." oninput="filterProjectsList(this.value)" />'
    +   '</div>'
    + '</div>'
    + '<div class="projects-table-card">';

  if (!projectList.length) {
    html += '<div style="padding:48px 20px;text-align:center;color:var(--text-muted);">'
      + '<svg class="ui-icon-xl" style="margin:0 auto 12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'
      + '<div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No active projects yet</div>'
      + '<div style="font-size:13px;margin-bottom:16px;">Create your first company initiative or parade project to get started.</div>'
      + '<button type="button" class="task-primary-btn" onclick="openAddProjectModal()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Project</button>'
      + '</div>';
  } else {
    projectList.forEach(function(pName) {
      var pTasks = _allLoadedTasks.filter(function(t) {
        return getTaskProjectName(t).toLowerCase() === pName.toLowerCase();
      });
      var completedCount = pTasks.filter(function(t) {
        return normalizeTaskStatus(t.status) === 'completed';
      }).length;
      var pct = pTasks.length ? Math.round((completedCount / pTasks.length) * 100) : 0;

      // Unique assignee initials/avatars stack
      var assigneesMap = {};
      pTasks.forEach(function(t) {
        if (t.assignee_name) assigneesMap[t.assignee_name] = t.assignee_ic || '';
      });
      var assigneesList = Object.keys(assigneesMap);
      var avatarStackHtml = '<div class="project-assignees-stack">';
      assigneesList.slice(0, 4).forEach(function(name) {
        avatarStackHtml += getAssigneeAvatarHtml(name, assigneesMap[name], 20);
      });
      avatarStackHtml += '</div>';

      html += '<div class="project-row" onclick="openProjectBoard(\'' + (typeof escapeHtml === 'function' ? escapeHtml(pName) : pName) + '\')">'
        + '<div class="project-name-cell">'
        +   '<svg class="project-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'
        +   '<span class="project-row-name">' + (typeof escapeHtml === 'function' ? escapeHtml(pName) : pName) + '</span>'
        + '</div>'
        + avatarStackHtml
        + '<div class="project-progress-cell">'
        +   '<div class="project-progress-bar"><div class="project-progress-fill" style="width:' + pct + '%;"></div></div>'
        +   '<span class="project-progress-pct">' + pct + '%</span>'
        + '</div>'
        + '<div class="project-actions-cell">'
        +   '<button type="button" class="project-delete-btn" onclick="event.stopPropagation(); deleteProject(\'' + (typeof escapeHtml === 'function' ? escapeHtml(pName) : pName) + '\')" title="Delete Project" aria-label="Delete Project">'
        +     '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
        +   '</button>'
        + '</div>'
        + '</div>';
    });
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Renders the Projects Overview list (Image 3)
 */
async function renderProjectsView() {
  if (typeof document === 'undefined') return;
  var container = document.querySelector('.projects-container');
  if (!container) return;

  // Render immediately with in-memory state (< 1ms)
  paintProjectsList(container);

  // Background fetch latest tasks and catalog in parallel
  var client = getSupaClient();
  var fetchTasksPromise = client ? client.get('bb_tasks?order=created_at.asc') : Promise.resolve([]);
  var fetchCatalogPromise = loadProjectsCatalog();

  try {
    var res = await Promise.all([fetchTasksPromise, fetchCatalogPromise]);
    var tasks = res[0];
    if (Array.isArray(tasks)) {
      tasks = tasks.filter(function(t) { return t && !_deletedTaskIds[String(t.id)]; });
      var pendingTemp = _allLoadedTasks.filter(function(t) { return String(t.id).startsWith('temp_') && !_deletedTaskIds[String(t.id)]; });
      _allLoadedTasks = tasks.concat(pendingTemp);
      _taskMap = {};
      _allLoadedTasks.forEach(function(t) {
        _taskMap[t.id] = t;
        var p = getTaskProjectName(t);
        if (p && p !== 'General Project' && !p.toLowerCase().includes('sprint') && _companyProjects.indexOf(p) === -1) {
          _companyProjects.push(p);
        }
      });
      if (typeof window !== 'undefined') window._taskMap = _taskMap;
      paintProjectsList(container);
    }
  } catch (err) {
    console.warn('renderProjectsView fetch error:', err);
  }
}

/**
 * Deletes a project from the catalog and all its associated tasks
 * @param {string} projectName
 */
/**
 * Deletes the currently active project from the board view
 */
async function deleteActiveProject() {
  if (!_activeProject) return;
  await deleteProject(_activeProject);
}

/**
 * Deletes a project from the catalog and all its associated tasks
 * @param {string} projectName
 */
async function deleteProject(projectName) {
  if (!projectName) return;
  var confirmFn = (typeof showConfirmModal === 'function')
    ? showConfirmModal
    : async function(msg) { return (typeof confirm === 'function') ? confirm(msg) : true; };

  var confirmed = await confirmFn(
    'Are you sure you want to delete project "' + projectName + '" and all its tasks? This action cannot be undone.',
    'Delete Project'
  );
  if (!confirmed) return;

  var lower = projectName.toLowerCase();
  _companyProjects = _companyProjects.filter(function(p) {
    return (p || '').toLowerCase() !== lower;
  });

  var tasksToDelete = _allLoadedTasks.filter(function(t) {
    return getTaskProjectName(t).toLowerCase() === lower;
  });
  var taskIdsToDelete = tasksToDelete.map(function(t) { return t.id; });

  taskIdsToDelete.forEach(function(tid) {
    _deletedTaskIds[String(tid)] = true;
    delete _taskMap[tid];
    if (typeof window !== 'undefined' && window._taskMap) {
      delete window._taskMap[tid];
    }
  });

  _allLoadedTasks = _allLoadedTasks.filter(function(t) {
    return getTaskProjectName(t).toLowerCase() !== lower;
  });

  await saveProjectsCatalog();
  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'project.delete',
      targetType: 'project',
      targetId: projectName,
      details: { taskCount: taskIdsToDelete.length }
    });
  }

  if ((_activeProject || '').toLowerCase() === lower) {
    _activeProject = '';
    setTasksViewMode('projects');
  } else {
    var container = document.querySelector('.projects-container');
    if (container) paintProjectsList(container);
  }

  if (typeof showToast === 'function') {
    showToast('Project "' + projectName + '" deleted.', 'success');
  }

  var client = getSupaClient();
  if (client && taskIdsToDelete.length) {
    (async function() {
      try {
        for (var i = 0; i < taskIdsToDelete.length; i++) {
          if (!String(taskIdsToDelete[i]).startsWith('temp_')) {
            await client.delete('bb_tasks?id=eq.' + encodeURIComponent(taskIdsToDelete[i]));
          }
        }
      } catch (err) {
        console.warn('Failed to delete project tasks from Supabase:', err);
      }
    })();
  }
}

/**
 * Filter projects list in real-time
 */
function filterProjectsList(query) {
  var rows = document.querySelectorAll('.project-row');
  var q = (query || '').toLowerCase().trim();
  rows.forEach(function(row) {
    var name = row.querySelector('.project-row-name');
    var txt = name ? name.textContent.toLowerCase() : '';
    row.style.display = (!q || txt.includes(q)) ? 'flex' : 'none';
  });
}

/**
 * Opens prompt / modal to create a new project
 */
async function openAddProjectModal() {
  var name = (typeof prompt === 'function') ? prompt('Enter new project name:') : null;
  if (!name || !name.trim()) return;
  var cleanName = (typeof sanitizeText === 'function') ? sanitizeText(name.trim(), 80) : name.trim();
  if (_companyProjects.indexOf(cleanName) === -1) {
    _companyProjects.push(cleanName);
    await saveProjectsCatalog();
  }
  openProjectBoard(cleanName);
  if (typeof showToast === 'function') {
    showToast('Project created: ' + cleanName, 'success');
  }
}

/**
 * Updates the department filter from toolbar select
 * @param {string} dept
 */
function changeTaskDeptFilter(dept) {
  _currentDeptFilter = dept || 'all';
  var titleEl = document.getElementById('tasks-dept-title');
  if (titleEl) {
    if (_currentDeptFilter === 'all') {
      titleEl.textContent = 'All Departments';
    } else if (DEPT_CONFIG[_currentDeptFilter]) {
      titleEl.textContent = DEPT_CONFIG[_currentDeptFilter].label + ' Department';
    } else {
      titleEl.textContent = 'Department';
    }
  }
  if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else {
    renderTasksBoard(_currentDeptFilter);
  }
}

/**
 * Live search filtering across tasks
 * @param {string} query
 */
function filterProjectTasks(query) {
  _taskSearchQuery = (query || '').toLowerCase().trim();
  if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else {
    renderTasksBoard(_currentDeptFilter);
  }
}

/**
 * Generates formatted Task ID (e.g. LOG-101, )
 * @param {Object} t
 * @param {number} idx
 * @returns {string}
 */
function formatTaskId(t, idx) {
  if (!t) return 'PRJ-1';
  if (t.code && String(t.code).indexOf('-') !== -1) return String(t.code).toUpperCase();

  var projectName = getTaskProjectName(t) || _activeProject || 'PRJ';
  var lettersOnly = projectName.replace(/[^a-zA-Z]/g, '');
  var prefix = (lettersOnly.length >= 3
    ? lettersOnly.slice(0, 3)
    : (projectName.replace(/[^a-zA-Z0-9]/g, '') + 'PRJ').slice(0, 3)
  ).toUpperCase();

  var projectTasks = _allLoadedTasks
    .filter(function(x) {
      var xProj = getTaskProjectName(x) || 'PRJ';
      return xProj.toLowerCase() === projectName.toLowerCase();
    })
    .sort(function(a, b) {
      var timeA = new Date(a.created_at || 0).getTime() || (typeof a.id === 'number' ? a.id : 0);
      var timeB = new Date(b.created_at || 0).getTime() || (typeof b.id === 'number' ? b.id : 0);
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

  var pos = projectTasks.findIndex(function(x) { return String(x.id) === String(t.id); });
  var seqNum = pos !== -1 ? (pos + 1) : ((idx || 0) + 1);

  return prefix + '-' + seqNum;
}

/**
 * Renders the member Kanban columns (To Do, In Progress, Done) with drag-and-drop
 * @param {string} dept
 */
/**
 * Calculates due date badge CSS class:
 * - 'due-overdue' if past due (red)
 * - 'due-near' if within 2 days (yellow)
 * - 'due-normal' if on time (default)
 * @param {string|Date} dueDate
 * @param {boolean} [isCompleted=false]
 * @returns {string}
 */
function getTaskDueBadgeClass(dueDate, isCompleted) {
  if (!dueDate) return 'due-normal';
  if (isCompleted) return 'due-normal';
  var due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var diffMs = due.getTime() - today.getTime();
  var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'due-overdue';
  if (diffDays <= 2) return 'due-near';
  return 'due-normal';
}


/**
 * Renders the circular avatar HTML for a task assignee.
 * Supports custom uploaded photos, creator snowing animation with 'J',
 * deterministic palette colors with 1-letter initials, and unassigned 'U'.
 * @param {string} [name]
 * @param {string} [ic]
 * @param {number} [size=24]
 * @param {string} [extraStyle='']
 * @returns {string}
 */
function getAssigneeAvatarHtml(name, ic, size, extraStyle) {
  var sz = size || 24;
  var fs = Math.max(9, Math.round(sz * 0.45));
  var styleAttr = extraStyle ? (' ' + extraStyle) : '';

  if (!name || name === 'Unassigned') {
    return '<span class="task-card-avatar" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:var(--surface-tint-hover);color:var(--text-muted);cursor:default;line-height:1;' + styleAttr + '" title="Unassigned" aria-label="Unassigned">U</span>';
  }

  var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(name) : /jeshua\s+koh/i.test(name);
  var safeName = (typeof escapeHtml === 'function') ? escapeHtml(name) : name;
  var tooltip = safeName + (isCreator ? ' (Portal Creator)' : '');
  var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(name, ic) : null;

  var outlineInfo = (typeof getMemberAvatarOutline === 'function')
    ? getMemberAvatarOutline(ic || name, name)
    : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);

  var outlineHtml = '';
  var hasOutlineCls = '';
  if (outlineInfo && outlineInfo.style && outlineInfo.style !== 'none' && outlineInfo.config && outlineInfo.config.className) {
    hasOutlineCls = ' has-custom-outline avatar-outline-container';
    outlineHtml = '<span class="avatar-outline-overlay ' + outlineInfo.config.className + '" style="position:absolute;inset:0;border-radius:9999px;pointer-events:none;z-index:2;box-sizing:border-box;" aria-hidden="true"></span>';
  }

  var cosmeticInfo = (typeof getMemberCosmetic === 'function')
    ? getMemberCosmetic(ic || name, name)
    : null;
  var cosmeticHtml = '';
  if (cosmeticInfo && cosmeticInfo.id && cosmeticInfo.id !== 'none' && cosmeticInfo.svg) {
    var isHeadwear = (cosmeticInfo.category === 'headwear' || (cosmeticInfo.config && cosmeticInfo.config.category === 'headwear'));
    var headwearCls = isHeadwear ? ' is-headwear' : '';
    var cosCls = sz >= 40 ? 'cosmetic-lg' : (sz >= 28 ? 'cosmetic-md' : (sz >= 22 ? 'cosmetic-sm' : 'cosmetic-xs'));
    cosmeticHtml = '<span class="avatar-cosmetic-badge ' + cosCls + headwearCls + '" data-cosmetic-id="' + (typeof escapeHtml === 'function' ? escapeHtml(cosmeticInfo.id) : cosmeticInfo.id) + '" title="' + (typeof escapeHtml === 'function' ? escapeHtml(cosmeticInfo.name || '') : (cosmeticInfo.name || '')) + '" aria-hidden="true">' + cosmeticInfo.svg + '</span>';
  }

  // 4. Live Presence Status Dot
  var pInfo = null;
  if (typeof getMemberPresenceStatus === 'function') {
    pInfo = getMemberPresenceStatus({ name: name, email: ic, ic: ic });
  } else if (typeof window !== 'undefined' && typeof window.getMemberPresenceStatus === 'function') {
    pInfo = window.getMemberPresenceStatus({ name: name, email: ic, ic: ic });
  } else {
    pInfo = { status: 'offline', label: 'Offline', color: '#6b7280' };
  }
  var dotColor = (pInfo && pInfo.color) ? pInfo.color : '#6b7280';
  var dotLabel = (pInfo && pInfo.label) ? pInfo.label : 'Offline';
  var pStatus = (pInfo && pInfo.status) ? pInfo.status : 'offline';
  var dotTitle = safeName + ' (' + dotLabel + ')';
  var dotSz = Math.max(8, Math.round(sz * 0.32));
  var presId = (ic && ic.indexOf('@') !== -1) ? ic : (ic || name);
  var dotHtml = '<span class="nav-avatar-status-dot avatar-status-dot status-' + pStatus + '" data-presence-id="' + (typeof escapeHtml === 'function' ? escapeHtml(presId) : presId) + '" data-presence-name="' + (typeof escapeHtml === 'function' ? escapeHtml(name) : name) + '" style="position:absolute;bottom:-1px;right:-1px;width:' + dotSz + 'px;height:' + dotSz + 'px;border-radius:9999px;background:' + dotColor + ';border:1.5px solid var(--bg-card,#1e293b);z-index:99;box-sizing:border-box;" title="' + (typeof escapeHtml === 'function' ? escapeHtml(dotTitle) : dotTitle) + '" aria-label="' + (typeof escapeHtml === 'function' ? escapeHtml(dotLabel) : dotLabel) + '"></span>';

  var overflowRule = 'visible';

  if (photoUrl) {
    return '<span class="task-card-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;padding:0;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '"><img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;display:block;" alt="' + safeName + '"/>' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  if (isCreator) {
    var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
    var creatorCls = isRgb ? ' creator-outline-avatar creator-rgb-avatar' : '';
    return '<span class="task-card-avatar' + creatorCls + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:#083830;color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '">J' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  var initial = (typeof getMemberAvatarInitial === 'function') ? getMemberAvatarInitial(name) : (name.trim().charAt(0).toUpperCase() || '?');
  var color = (typeof getMemberAvatarColor === 'function') ? getMemberAvatarColor(name) : getAssigneeAvatarBg(name);
  return '<span class="task-card-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:' + color + ';color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '">' + (typeof escapeHtml === 'function' ? escapeHtml(initial) : initial) + outlineHtml + cosmeticHtml + dotHtml + '</span>';
}

function getAssigneeAvatarBg(name) {
  if (typeof getMemberAvatarColor === 'function') {
    return getMemberAvatarColor(name);
  }
  if (!name || name === 'Unassigned') return 'var(--surface-tint-hover)';
  var palette = [
    '#047857', '#0284c7', '#7c3aed', '#c2410c',
    '#be185d', '#0f766e', '#4338ca', '#b91c1c'
  ];
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  var idx = Math.abs(hash) % palette.length;
  return palette[idx];
}

function renderColumnsFromTasks(tasksList) {
  var cols = { planning: [], todo: [], inprogress: [], inreview: [], completed: [] };
  (tasksList || []).forEach(function(t) {
    if (_activeProject && _activeProject.toLowerCase() !== 'all' && _activeProject.toLowerCase() !== 'all tasks') {
      var pName = (t.project_name && t.project_name.trim()) ? t.project_name.trim().toLowerCase() : getTaskProjectName(t).toLowerCase();
      var activeLower = _activeProject.toLowerCase();
      if (pName !== activeLower) return;
    }
    var k = normalizeTaskStatus(t.status);
    if (cols[k]) cols[k].push(t);
  });

  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);

  STATUS_ORDER.forEach(function(status) {
    var el   = getColBody(status);
    var cnt  = getColCount(status);
    var tcnt = getTabCount(status);

    var itemsInCol = cols[status] || [];
    var statusItems = itemsInCol.filter(function(t) {
      if (!_taskSearchQuery) return true;
      var matchTitle = (t.title || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchAss   = (t.assignee_name || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      return matchTitle || matchDesc || matchAss || matchId;
    });

    // Column Task Counter Pill (Image 2) - Clean pure number, no parentheses
    if (cnt) cnt.textContent = String(statusItems.length);
    if (tcnt) tcnt.textContent = statusItems.length ? String(statusItems.length) : '';
    if (!el) return;

    if (!statusItems.length) {
      var emptyConf = STATUS_CONFIG[status] || { label: status };
      el.innerHTML = '<div class="task-col-empty">'
        + '<div class="task-col-empty-icon">'
        +   '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m9 12 2 2 4-4"/></svg>'
        + '</div>'
        + '<div class="task-col-empty-text">No tasks in ' + emptyConf.label + '</div>'
        + '<button type="button" class="task-col-empty-btn" onclick="openCreateTaskModal(\'' + status + '\')">'
        +   '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        +   '<span>Add Task</span>'
        + '</button>'
        + '</div>';
      return;
    }

    var cardsHtml = statusItems.map(function(t, idx) {
      _taskMap[t.id] = t;
      if (typeof window !== 'undefined') window._taskMap[t.id] = t;

      var taskId = formatTaskId(t, idx);
      var pName = getTaskProjectName(t) || (_activeProject && _activeProject !== 'All Tasks' ? _activeProject : '');
      var projectPillHtml = '';
      if (pName && pName.toLowerCase() !== 'all' && pName.toLowerCase() !== 'all tasks') {
        var safeProj = (typeof escapeHtml === 'function') ? escapeHtml(pName) : pName;
        projectPillHtml = '<span class="task-card-project-pill">' + safeProj + '</span>';
      }

      var priorityP = (t.priority || 'medium').toLowerCase();
      var chevronCls = priorityP === 'high' ? 'priority-high' : (priorityP === 'low' ? 'priority-low' : 'priority-medium');
      var priorityChevron = '<span class="task-card-priority-chevron ' + chevronCls + '" title="' + priorityP.toUpperCase() + ' Priority">'
        + getPriorityIconSvg(priorityP, 14)
        + '</span>';

      var avatarHtml = getAssigneeAvatarHtml(t.assignee_name, t.assignee_ic, 24);

      var dueBadge = '';
      if (t.due_date) {
        var d = new Date(t.due_date);
        var isOverdue = d < today;
        var dueText = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
        var badgeClass = getTaskDueBadgeClass(t.due_date);
        dueBadge = '<span class="task-due-pill ' + badgeClass + '">'
          + '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
          + (isOverdue ? 'Overdue: ' : '') + dueText
          + '</span>';
      }

      var metaRowHtml = '';
      if (projectPillHtml || dueBadge) {
        metaRowHtml = '<div class="task-card-meta-row">' + projectPillHtml + dueBadge + '</div>';
      }

      var estimateHtml = '';
      if (t.estimate) {
        var safeEst = (typeof escapeHtml === 'function') ? escapeHtml(t.estimate) : t.estimate;
        estimateHtml = '<span class="task-card-estimate-pill" title="Estimated time">'
          + '<svg class="ui-icon-xs" width="11" height="11" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
          + '<span>' + safeEst + '</span>'
          + '</span>';
      } else {
        estimateHtml = '<span class="task-card-estimate-spacer"></span>';
      }

      // Modern Task Card Layout (Exact match to Image 3)
      return '<div class="task-card" draggable="true" data-task-id="' + t.id + '" onclick="openTaskDetail(\'' + t.id + '\')">'
        + '<div class="task-card-id-tag">' + taskId + '</div>'
        + '<div class="task-card-title">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
        + metaRowHtml
        + '<div class="task-card-footer">'
        +   '<div class="task-card-footer-left">' + estimateHtml + '</div>'
        +   '<div class="task-card-footer-right">' + priorityChevron + avatarHtml + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    var bottomAddBtn = '<button type="button" class="task-col-add-bottom-btn" onclick="openCreateTaskModal(\'' + status + '\')">'
      + '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '<span>Add Task</span>'
      + '</button>';

    el.innerHTML = cardsHtml + bottomAddBtn;
  });

  setupKanbanDragAndDrop();
}

/**
 * Switches between Kanban Board View and Project List View (Image 1 & 2)
 * @param {"board"|"list"} mode
 */
function setProjectDisplayMode(mode) {
  _projectDisplayMode = (mode === 'list') ? 'list' : 'board';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_proj_view_mode', _projectDisplayMode);
    }
  } catch (_) {}

  if (typeof document === 'undefined') return;

  var boardBtn = document.querySelector('.project-view-btn[data-proj-vmode="board"]');
  var listBtn  = document.querySelector('.project-view-btn[data-proj-vmode="list"]');
  if (boardBtn) boardBtn.classList.toggle('active', _projectDisplayMode === 'board');
  if (listBtn) listBtn.classList.toggle('active', _projectDisplayMode === 'list');

  var boardCol = document.getElementById('tasks-columns');
  var colTabs  = document.getElementById('task-col-tabs');
  var listView = document.querySelector('.tasks-board-list-view');

  if (_projectDisplayMode === 'list') {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (listView) listView.style.display = 'block';
    renderTasksListView(_activeProject);
  } else {
    if (boardCol) boardCol.style.display = '';
    if (colTabs) colTabs.style.display = '';
    if (listView) listView.style.display = 'none';
    renderColumnsFromTasks(_allLoadedTasks);
  }
}

/**
 * Renders structured Project List View with status groupings matching Image 2
 * @param {string} [projectName]
 */
function renderTasksListView(projectName) {
  if (typeof document === 'undefined') return;
  var listView = document.querySelector('.tasks-board-list-view');
  if (!listView) return;

  var pName = projectName || _activeProject;
  if (!pName || pName.toLowerCase() === 'all tasks' || pName.toLowerCase() === 'all') {
    listView.innerHTML = '<div class="tasks-no-project-placeholder" style="padding:48px 20px;text-align:center;color:var(--text-muted);background:var(--bg-card-subtle);border:1px dashed var(--border-card);border-radius:var(--radius-lg);">Please select a project to view tasks list.</div>';
    return;
  }

  var tasks = _allLoadedTasks.filter(function(t) {
    if (!t || _deletedTaskIds[String(t.id)]) return false;
    var taskProj = (t.project_name && t.project_name.trim()) ? t.project_name.trim() : getTaskProjectName(t);
    return taskProj && taskProj.toLowerCase() === pName.toLowerCase();
  });

  if (_taskSearchQuery) {
    var q = _taskSearchQuery.toLowerCase();
    tasks = tasks.filter(function(t) {
      var titleMatch = t.title && t.title.toLowerCase().indexOf(q) !== -1;
      var assMatch = t.assignee_name && t.assignee_name.toLowerCase().indexOf(q) !== -1;
      var deptMatch = t.department && t.department.toLowerCase().indexOf(q) !== -1;
      var idMatch = t.id && String(t.id).toLowerCase().indexOf(q) !== -1;
      return titleMatch || assMatch || deptMatch || idMatch;
    });
  }

  var sections = [
    { key: 'planning', label: 'Planning', color: 'var(--purple, #a855f7)', dotBg: '#a855f7' },
    { key: 'todo', label: 'To Do', color: 'var(--text-secondary, #94a3b8)', dotBg: '#64748b' },
    { key: 'inprogress', label: 'In Progress', color: 'var(--blue, #3b82f6)', dotBg: '#3b82f6' },
    { key: 'inreview', label: 'In Review', color: 'var(--accent, #f59e0b)', dotBg: '#f59e0b' },
    { key: 'completed', label: 'Completed', color: 'var(--green, #10b981)', dotBg: '#10b981' }
  ];

  var html = '<div class="proj-list-wrapper">';

  sections.forEach(function(sec) {
    var secTasks = tasks.filter(function(t) {
      return normalizeTaskStatus(t.status) === sec.key;
    });

    html += '<div class="proj-list-group" data-group-status="' + sec.key + '">' +
      '<div class="proj-list-group-header">' +
        '<div class="proj-list-group-title">' +
          '<svg class="ui-icon-xs proj-list-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
          '<span class="proj-list-group-dot" style="background:' + sec.dotBg + ';"></span>' +
          '<span class="proj-list-group-name">' + escapeHtml(sec.label.toUpperCase()) + '</span>' +
          '<span class="proj-list-group-count">' + secTasks.length + '</span>' +
        '</div>' +
        '<button type="button" class="proj-list-quick-add-btn" onclick="openCreateTaskModal(\'' + sec.key + '\')" title="Add task to ' + sec.label + ' via Quick Add">' +
          '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
      '</div>';

    html += '<div class="proj-list-table-container">' +
      '<table class="proj-list-table" role="table">' +
        '<thead>' +
          '<tr>' +
            '<th class="col-name" style="width:38%;">Task Name</th>' +
            '<th class="col-status" style="width:14%;">Status</th>' +
            '<th class="col-priority" style="width:12%;">Priority</th>' +
            '<th class="col-assignee" style="width:18%;">Assignee</th>' +
            '<th class="col-due" style="width:10%;">Due Date</th>' +
            '<th class="col-estimate" style="width:8%;">Estimate</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>';

    if (secTasks.length === 0) {
      html += '<tr class="proj-list-empty-row"><td colspan="6" style="padding:10px 14px;color:var(--text-muted);font-size:12px;font-style:italic;">No tasks in ' + sec.label + '</td></tr>';
    } else {
      secTasks.forEach(function(t, idx) {
        var tidFormatted = formatTaskId(t, idx);
        var prioIcon = getPriorityIconSvg(t.priority || 'medium', 13);
        var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(t.title || '') : (t.title || '');
        var safeAssignee = (typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name || 'Unassigned') : (t.assignee_name || 'Unassigned');
        var assigneeAvatar = getAssigneeAvatarHtml(t.assignee_name, t.assignee_ic, 22);

        var dueStr = formatTaskDueDateStr(t.due_date);
        var isDone = (normalizeTaskStatus(t.status) === 'completed');
        var dueBadgeCls = getTaskDueBadgeClass(t.due_date, isDone);

        var est = t.estimate || '';
        if (!est && t.description) {
          var estMatch = t.description.match(/\[Estimate:\s*([^\]|]+)/i);
          if (estMatch && estMatch[1]) est = estMatch[1].trim();
        }

        html += '<tr class="proj-list-row" onclick="openTaskDetail(\'' + t.id + '\')" role="button" tabindex="0">' +
          '<td class="col-name">' +
            '<div class="proj-list-cell-name">' +
              '<span class="proj-task-id-badge">' + tidFormatted + '</span>' +
              '<span class="proj-task-title-text">' + safeTitle + '</span>' +
            '</div>' +
          '</td>' +
          '<td class="col-status">' +
            '<span class="proj-list-status-pill status-' + sec.key + '">' + sec.label + '</span>' +
          '</td>' +
          '<td class="col-priority">' +
            '<span class="proj-list-priority-badge prio-' + (t.priority || 'medium') + '">' +
              prioIcon +
              '<span>' + ((t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1)) + '</span>' +
            '</span>' +
          '</td>' +
          '<td class="col-assignee">' +
            '<div class="proj-list-assignee-cell">' +
              assigneeAvatar +
              '<span class="proj-list-assignee-name">' + safeAssignee + '</span>' +
            '</div>' +
          '</td>' +
          '<td class="col-due">' +
            (t.due_date ? ('<span class="proj-list-due-pill ' + dueBadgeCls + '">' + escapeHtml(dueStr) + '</span>') : '<span style="color:var(--text-muted);">-</span>') +
          '</td>' +
          '<td class="col-estimate">' +
            (est ? ('<span class="proj-list-estimate-pill">' + escapeHtml(est) + '</span>') : '<span style="color:var(--text-muted);">-</span>') +
          '</td>' +
        '</tr>';
      });
    }

    html += '</tbody></table>' +
      '<button type="button" class="proj-list-add-bottom-btn" onclick="openCreateTaskModal(\'' + sec.key + '\')">' +
        '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '<span>Add task</span>' +
      '</button>' +
    '</div></div>';
  });

  html += '</div>';

  listView.innerHTML = html;
}

async function renderTasksBoard(deptOrProject) {
  if (typeof document === 'undefined') return;

  if (deptOrProject && deptOrProject !== 'all' && deptOrProject !== 'all tasks') {
    if (DEPT_CONFIG[deptOrProject]) {
      _activeProject = DEPT_CONFIG[deptOrProject].label;
    } else {
      _activeProject = deptOrProject;
    }
  }

  var boardCol   = document.getElementById('tasks-columns');
  var colTabs    = document.getElementById('task-col-tabs');
  var noProjEl   = document.querySelector('.tasks-no-project-placeholder');
  var projToggle = document.querySelector('.project-board-view-toggle');
  var listView   = document.querySelector('.tasks-board-list-view');

  var hasActiveProject = !!(_activeProject && _activeProject.toLowerCase() !== 'all tasks' && _activeProject.toLowerCase() !== 'all');
  if (!hasActiveProject) {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (projToggle) projToggle.style.display = 'none';
    if (noProjEl) noProjEl.style.display = 'block';
    return;
  }

  if (projToggle) projToggle.style.display = 'inline-flex';
  var bBtn = document.querySelector('.project-view-btn[data-proj-vmode="board"]');
  var lBtn = document.querySelector('.project-view-btn[data-proj-vmode="list"]');
  if (bBtn) bBtn.classList.toggle('active', _projectDisplayMode === 'board');
  if (lBtn) lBtn.classList.toggle('active', _projectDisplayMode === 'list');

  if (_projectDisplayMode === 'list') {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (listView) listView.style.display = 'block';
  } else {
    if (boardCol) boardCol.style.display = '';
    if (colTabs) colTabs.style.display = '';
    if (listView) listView.style.display = 'none';
  }
  if (noProjEl) noProjEl.style.display = 'none';

  var breadcrumbCur = document.getElementById('tasks-dept-title');
  if (breadcrumbCur) {
    breadcrumbCur.textContent = _activeProject;
  }

  // 1. Instant synchronous render from local cache (< 2ms)
  if (_projectDisplayMode === 'list') {
    renderTasksListView(_activeProject);
  } else {
    renderColumnsFromTasks(_allLoadedTasks);
  }

  // 2. Background fetch and refresh
  var client = getSupaClient();
  if (client) {
    try {
      var tasks = await client.get('bb_tasks?order=created_at.asc');
      if (Array.isArray(tasks)) {
        tasks = tasks.filter(function(t) { return t && !_deletedTaskIds[String(t.id)]; });
        var pendingTemp = _allLoadedTasks.filter(function(t) { return String(t.id).startsWith('temp_') && !_deletedTaskIds[String(t.id)]; });
        _allLoadedTasks = tasks.concat(pendingTemp);
        _taskMap = {};
        _allLoadedTasks.forEach(function(t) { _taskMap[t.id] = t; });
        if (typeof window !== 'undefined') window._taskMap = _taskMap;
        try { if (typeof localStorage !== 'undefined') localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks)); } catch (_) {}

        if (_projectDisplayMode === 'list') {
          renderTasksListView(_activeProject);
        } else {
          renderColumnsFromTasks(_allLoadedTasks);
        }

        if (typeof syncTaskNotifications === 'function') {
          syncTaskNotifications(tasks);
        } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function') {
          window.syncTaskNotifications(tasks);
        }
      }
    } catch (e) {
      console.warn('renderTasksBoard error:', e);
    }
  }
}

/**
 * Initializes HTML5 Drag and Drop across Kanban task cards and columns
 */
function setupKanbanDragAndDrop() {
  if (typeof document === 'undefined') return;

  var cards = document.querySelectorAll('.task-card[draggable="true"]');
  cards.forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      var tid = card.getAttribute('data-task-id') || card.getAttribute('data-drag-tid');
      _draggedTaskId = tid;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', tid);
        e.dataTransfer.effectAllowed = 'move';
      }
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', function() {
      card.classList.remove('dragging');
      _justDragged = true;
      _draggedTaskId = null;
      setTimeout(function() { _justDragged = false; }, 150);
      document.querySelectorAll('.task-col').forEach(function(col) {
        col.classList.remove('drag-over');
      });
    });
  });

  var columns = document.querySelectorAll('.task-col[data-col-status]');
  columns.forEach(function(col) {
    if (col._dragBound) return;
    col._dragBound = true;

    col.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', function(e) {
      if (e.relatedTarget && col.contains(e.relatedTarget)) return;
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', function(e) {
      e.preventDefault();
      col.classList.remove('drag-over');
      var tid = (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '') || _draggedTaskId;
      if (!tid) return;

      var targetStatus = normalizeTaskStatus(col.getAttribute('data-col-status'));
      var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
      if (!t) {
        t = _allLoadedTasks.find(function(x) { return String(x.id) === String(tid); });
      }
      if (t && t.status !== targetStatus) {
        var prevStatus = t.status;
        t.status = targetStatus;
        t._justMoved = true;
        setTimeout(function() { delete t._justMoved; }, 10000);
        var loaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(tid); });
        if (loaded) {
          loaded.status = targetStatus;
          loaded._justMoved = true;
        }

        // 1. OPTIMISTIC DOM MOVE: 0ms instant transition, zero lag!
        var cardEl = document.querySelector('.task-card[data-task-id="' + tid + '"], .task-card[data-drag-tid="' + tid + '"]');
        var targetColBody = getColBody(targetStatus);
        if (cardEl && targetColBody) {
          var emptyNotice = targetColBody.querySelector('.task-col-empty, .kanban-empty-state');
          if (emptyNotice) emptyNotice.remove();

          var addBtn = targetColBody.querySelector('.task-col-add-bottom-btn');
          if (addBtn) {
            targetColBody.insertBefore(cardEl, addBtn);
          } else {
            targetColBody.appendChild(cardEl);
            var newAddBtn = document.createElement('button');
            newAddBtn.type = 'button';
            newAddBtn.className = 'task-col-add-bottom-btn';
            newAddBtn.onclick = function() { openCreateTaskModal(targetStatus); };
            newAddBtn.innerHTML = '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add Task</span>';
            targetColBody.appendChild(newAddBtn);
          }
        }

        // If previous column is now empty, render empty state
        var prevColBody = getColBody(prevStatus);
        if (prevColBody && !prevColBody.querySelector('.task-card')) {
          var emptyConf = STATUS_CONFIG[prevStatus] || { label: prevStatus };
          prevColBody.innerHTML = '<div class="task-col-empty">'
            + '<div class="task-col-empty-icon">'
            +   '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m9 12 2 2 4-4"/></svg>'
            + '</div>'
            + '<div class="task-col-empty-text">No tasks in ' + emptyConf.label + '</div>'
            + '<button type="button" class="task-col-empty-btn" onclick="openCreateTaskModal(\'' + prevStatus + '\')">'
            +   '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
            +   '<span>Add Task</span>'
            + '</button>'
            + '</div>';
        }

        // 2. OPTIMISTIC COUNTERS: Instant badge update (pure number, no parentheses)
        STATUS_ORDER.forEach(function(s) {
          var countBadge = getColCount(s);
          var tabBadge = getTabCount(s);
          var cBody = getColBody(s);
          var count = cBody ? cBody.querySelectorAll('.task-card').length : 0;
          if (countBadge) countBadge.textContent = String(count);
          if (tabBadge) tabBadge.textContent = count ? String(count) : '';
        });

        // 3. BACKGROUND PERSISTENCE
        var client = getSupaClient();
        if (client) {
          (async function() {
            try {
              await client.patch('bb_tasks?id=eq.' + tid, { status: targetStatus });
            } catch (err) {
              console.warn('Kanban drag sync error:', err);
            }
          })();
        }
      }
    });
  });
}

/**
 * Renders the "My Tasks" view (Image 4) with filter chips and interactive table
 */
function handleMyTasksSearchInput(val) {
  _taskSearchQuery = val || '';
  renderMyTasksView();
}

/**
 * Renders the My Tasks view styled identically to Projects Overview (Image 2)
 */
function renderMyTasksView() {
  if (typeof document === 'undefined') return;
  var container = document.querySelector('.my-tasks-container');
  if (!container) return;

  var myIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || '') : '';
  var myName = (typeof sessionGet === 'function') ? (sessionGet('name') || '') : '';
  if (!myName && typeof document !== 'undefined') {
    var sbName = document.getElementById('sidebar-user-name');
    if (sbName && sbName.textContent && sbName.textContent.trim() !== 'Member') {
      myName = sbName.textContent.trim();
    }
  }
  if (!myName && typeof localStorage !== 'undefined') {
    try {
      var sess = JSON.parse(localStorage.getItem('bb_session') || '{}');
      if (sess && sess.name) myName = sess.name;
    } catch (_) {}
  }
  var myEmail = (typeof sessionGet === 'function') ? (sessionGet('email') || '') : '';

  // Filter tasks based on current filters and search query
  var filtered = _allLoadedTasks.filter(function(t) {
    if (_myTasksScopeFilter === 'me') {
      var isAssigned = false;
      var aName = (t.assignee_name || '').trim().toLowerCase();
      var aIc = (t.assignee_ic || '').trim().toLowerCase();
      var sName = myName.trim().toLowerCase();
      var sIc = myIc.trim().toLowerCase();
      var sEmail = myEmail.trim().toLowerCase();

      if (aName && sName) {
        if (aName === sName || aName.indexOf(sName) !== -1 || sName.indexOf(aName) !== -1) {
          isAssigned = true;
        }
      }
      if (aIc && sIc && aIc === sIc) {
        isAssigned = true;
      }
      if (aIc && sEmail && aIc === sEmail) {
        isAssigned = true;
      }
      if (!isAssigned) return false;
    }
    if (_myTasksStatusFilter === 'open') {
      var s = normalizeTaskStatus(t.status);
      if (s === 'completed' || s === 'done') return false;
    }
    if (_myTasksProjectFilter && _myTasksProjectFilter !== 'all') {
      var tProj = (getTaskProjectName(t) || '').toLowerCase();
      if (tProj !== _myTasksProjectFilter.toLowerCase()) return false;
    }
    if (_taskSearchQuery) {
      var q = _taskSearchQuery.toLowerCase();
      var matchTitle = (t.title || '').toLowerCase().indexOf(q) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(q) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(q) !== -1;
      var matchProj  = (getTaskProjectName(t) || '').toLowerCase().indexOf(q) !== -1;
      if (!matchTitle && !matchDesc && !matchId && !matchProj) return false;
    }
    return true;
  });

  var today = new Date(); today.setHours(0, 0, 0, 0);

  var html = '<div class="my-tasks-wrapper">'
    // Header: Identical layout to Projects Overview in Image 5
    + '<div class="projects-overview-header my-tasks-header">'
    +   '<div>'
    +     '<h2 class="projects-overview-title">My Tasks</h2>'
    +     '<p class="projects-overview-sub">Assigned to you, across all projects. Select a task to view its brief.</p>'
    +   '</div>'
    +   '<button type="button" class="task-primary-btn" onclick="openCreateTaskModal()">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    +     '<span>Add Task</span>'
    +   '</button>'
    + '</div>'

    // Search bar and filter chips
    + '<div class="projects-search-bar my-tasks-search-bar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">'
    +   '<div class="task-search-box" style="width:100%;max-width:320px;">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    +     '<input type="text" class="task-search-input" style="width:100%;" placeholder="Search tasks..." value="' + (typeof escapeHtml === 'function' ? escapeHtml(_taskSearchQuery) : _taskSearchQuery) + '" oninput="handleMyTasksSearchInput(this.value)" />'
    +   '</div>'
    +   '<div class="my-tasks-filter-chips" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    +     '<button type="button" class="filter-chip' + (_myTasksScopeFilter === 'me' ? ' active' : '') + '" onclick="toggleMyTasksScope()">'
    +       'Scope is: <strong>' + (_myTasksScopeFilter === 'me' ? 'Assigned to me' : 'All Tasks') + '</strong>'
    +     '</button>'
    +     '<button type="button" class="filter-chip' + (_myTasksStatusFilter === 'open' ? ' active' : '') + '" onclick="toggleMyTasksStatus()">'
    +       'Status is: <strong>' + (_myTasksStatusFilter === 'open' ? 'Open' : 'All') + '</strong>'
    +     '</button>'
    +     '<div class="my-tasks-project-filter-wrap" style="position:relative;display:inline-block;">'
    +       '<button type="button" class="filter-chip' + (_myTasksProjectFilter && _myTasksProjectFilter !== 'all' ? ' active' : '') + '" onclick="toggleMyTasksProjectDropdown(event)">'
    +         'Project is: <strong>' + (typeof escapeHtml === 'function' ? escapeHtml(_myTasksProjectFilter === 'all' ? 'All Projects' : _myTasksProjectFilter) : (_myTasksProjectFilter === 'all' ? 'All Projects' : _myTasksProjectFilter)) + '</strong>'
    +         '<svg class="ui-icon-xs" style="margin-left:4px;vertical-align:-1px;" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
    +       '</button>'
    +       '<div class="my-tasks-project-dropdown" style="display:none;"></div>'
    +     '</div>'
    +   '</div>'
    + '</div>'

    // Card container matching Projects Overview in Image 5
    + '<div class="projects-table-card my-tasks-card my-tasks-table-card my-tasks-table">';

  if (!filtered.length) {
    html += '<div style="padding:48px 20px;text-align:center;color:var(--text-muted);">'
      + '<svg class="ui-icon-xl" style="margin:0 auto 12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      + '<div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No tasks match your criteria</div>'
      + '<div style="font-size:13px;margin-bottom:16px;">Try adjusting your scope, status, or search filters above.</div>'
      + '<button type="button" class="task-primary-btn" onclick="openCreateTaskModal()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Task</button>'
      + '</div>';
  } else {
    filtered.forEach(function(t, idx) {
      _taskMap[t.id] = t;
      if (typeof window !== 'undefined') {
        window._taskMap = window._taskMap || {};
        window._taskMap[t.id] = t;
      }
      var normStatus = normalizeTaskStatus(t.status);
      var isDone = normStatus === 'completed';
      var statusClass = STATUS_CONFIG[normStatus].cls;
      var statusLabel = STATUS_CONFIG[normStatus].label;
      var taskId = formatTaskId(t, idx);
      var projectName = getTaskProjectName(t) || (t.department && DEPT_CONFIG[t.department] ? DEPT_CONFIG[t.department].label : 'General Project');

      var dueStr = '—';
      var isOverdue = false;
      if (t.due_date) {
        var d = new Date(t.due_date); d.setHours(0, 0, 0, 0);
        isOverdue = !isDone && d < today;
        dueStr = formatTaskDueDateStr(t.due_date);
      }

      var priorityP = (t.priority || 'medium').toLowerCase();
      var pLabel = priorityP === 'high' ? 'High' : (priorityP === 'low' ? 'Low' : 'Med');
      var pCls = priorityP === 'high' ? 'priority-high' : (priorityP === 'low' ? 'priority-low' : 'priority-medium');
      var assigneeName = t.assignee_name || 'Unassigned';

      html += '<div class="project-row my-tasks-row" data-row-tid="' + t.id + '">'
        + '<div class="my-tasks-main-cell" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">'
        +   '<input type="checkbox" class="my-tasks-checkbox" ' + (isDone ? 'checked ' : '') + 'onclick="event.stopPropagation();toggleTaskCheckbox(\'' + t.id + '\', event)" aria-label="Toggle task completion" />'
        +   '<span class="my-tasks-priority-indicator ' + pCls + '" title="Priority: ' + pLabel + '" style="display:inline-flex;align-items:center;">' + getPriorityIconSvg(priorityP, 13) + '</span>'
        +   '<span class="project-row-name" style="' + (isDone ? 'text-decoration:line-through;color:var(--text-muted);' : '') + '">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</span>'
        +   '<span class="task-id-badge" style="font-size:11px;color:var(--text-muted);font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(taskId) : taskId) + '</span>'
        + '</div>'
        + '<div class="my-tasks-meta-group" style="display:flex;align-items:center;gap:16px;flex-shrink:0;">'
        +   '<div class="my-tasks-project-cell" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);min-width:90px;">'
        +     '<svg class="project-folder-icon" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'
        +     '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(projectName) : projectName) + '</span>'
        +   '</div>'
        +   '<div style="min-width:85px;text-align:center;">'
        +     '<span class="my-tasks-status-pill ' + statusClass + '">' + (typeof escapeHtml === 'function' ? escapeHtml(statusLabel) : statusLabel) + '</span>'
        +   '</div>'
        +   '<div class="project-assignees-stack" style="margin-right:0;min-width:120px;display:flex;align-items:center;gap:8px;">'
        +     getAssigneeAvatarHtml(assigneeName, t.assignee_ic, 22)
        +     '<span style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">' + (typeof escapeHtml === 'function' ? escapeHtml(assigneeName) : assigneeName) + '</span>'
        +   '</div>'
        +   '<div class="my-tasks-due-cell" style="display:flex;align-items:center;gap:6px;font-size:12px;min-width:95px;' + (isOverdue ? 'color:var(--red);font-weight:700;' : 'color:var(--text-secondary);') + '">'
        +     '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        +     '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(dueStr) : dueStr) + '</span>'
        +   '</div>'
        +   '<div class="project-actions-cell" style="min-width:32px;display:flex;justify-content:flex-end;">'
        +     '<button type="button" class="project-delete-btn" onclick="event.stopPropagation();deleteTask(\'' + t.id + '\')" title="Delete Task" aria-label="Delete Task">'
        +       '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
        +     '</button>'
        +   '</div>'
        + '</div>'
        + '</div>';
    });
  }

  html += '</div></div>';
  container.innerHTML = html;

  // Row click opens task detail modal
  container.querySelectorAll('.my-tasks-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      if (e.target.closest('.my-tasks-checkbox') || e.target.closest('.project-delete-btn')) return;
      openTaskDetail(row.getAttribute('data-row-tid'));
    });
  });
}
function toggleMyTasksScope() {
  _myTasksScopeFilter = (_myTasksScopeFilter === 'me') ? 'all' : 'me';
  renderMyTasksView();
}

function toggleMyTasksStatus() {
  _myTasksStatusFilter = (_myTasksStatusFilter === 'open') ? 'all' : 'open';
  renderMyTasksView();
}

function toggleMyTasksProjectDropdown(e) {
  if (e) e.stopPropagation();
  var menu = document.querySelector('.my-tasks-project-dropdown');
  if (!menu) return;
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    return;
  }

  var projectNamesMap = { 'all': 'All Projects' };
  _allLoadedTasks.forEach(function(t) {
    var p = getTaskProjectName(t);
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') {
      projectNamesMap[p] = p;
    }
  });
  _companyProjects.forEach(function(p) {
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') {
      projectNamesMap[p] = p;
    }
  });

  var html = Object.keys(projectNamesMap).map(function(pKey) {
    var isSel = (_myTasksProjectFilter === pKey) || (pKey === 'all' && (!_myTasksProjectFilter || _myTasksProjectFilter === 'all'));
    return '<div class="my-tasks-project-dropdown-item' + (isSel ? ' active' : '') + '" onclick="setMyTasksProjectFilter(\'' + (typeof escapeHtml === 'function' ? escapeHtml(pKey) : pKey) + '\')">'
      + (pKey === 'all' ? '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>' : '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>')
      + '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(projectNamesMap[pKey]) : projectNamesMap[pKey]) + '</span>'
      + '</div>';
  }).join('');

  menu.innerHTML = html;
  menu.style.display = 'block';
}

function setMyTasksProjectFilter(pKey) {
  _myTasksProjectFilter = pKey || 'all';
  var menu = document.querySelector('.my-tasks-project-dropdown');
  if (menu) menu.style.display = 'none';
  renderMyTasksView();
}

/**
 * Checkbox toggle on a task row in My Tasks view
 * @param {string} id
 * @param {Event} e
 */
async function toggleTaskCheckbox(id, e) {
  if (e) e.stopPropagation();
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id];
  if (!t) return;
  var isCompleted = normalizeTaskStatus(t.status) === 'completed';
  var nextStatus = isCompleted ? 'todo' : 'completed';
  await memberUpdateTaskStatus(id, nextStatus, _currentDeptFilter);
  if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  }
}

/**
 * Opens task detail/brief inspection modal (Image 3)
 * @param {string} id
 */
function openTaskDetail(id) {
  if (typeof document === 'undefined') return;
  if (_justDragged) {
    _justDragged = false;
    return;
  }
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(id); });
  }
  if (!t) {
    try {
      var cached = JSON.parse(localStorage.getItem('bb_cached_tasks') || '[]');
      if (Array.isArray(cached)) {
        t = cached.find(function(x) { return String(x.id) === String(id); });
      }
    } catch (_) {}
  }
  if (!t) t = {};

  _activeDetailTaskId = id;
  if (t && t.id) {
    _taskMap[t.id] = t;
    if (typeof window !== 'undefined') {
      window._taskMap = window._taskMap || {};
      window._taskMap[t.id] = t;
    }
  }

  var set = function(elId, val) {
    var el = document.getElementById(elId);
    if (el) el.textContent = val;
  };

  // Breadcrumbs matching Image 2
  var projectName = getTaskProjectName(t) || _activeProject || 'General Project';
  var taskId = formatTaskId(t, 0);

  var deptBreadcrumb = document.querySelector('.task-brief-dept-name');
  if (deptBreadcrumb) deptBreadcrumb.textContent = projectName;
  var idLabel = document.querySelector('.task-brief-id-label');
  if (idLabel) idLabel.textContent = taskId;

  // Title: editable contenteditable element
  set('tdm-title', t.title || '');

  // Status Pill matching Image 2
  var normStatus = normalizeTaskStatus(t.status);
  var sConf = STATUS_CONFIG[normStatus] || { label: normStatus, color: '#3b82f6' };
  var statusDot = document.querySelector('.tdm-status-dot');
  if (statusDot) statusDot.style.background = sConf.color;
  var statusText = document.querySelector('.tdm-status-text');
  if (statusText) statusText.textContent = sConf.label;

  // Project Pill
  var pPillText = document.querySelector('.tdm-project-text');
  if (pPillText) pPillText.textContent = projectName;

  // Assignee Pill matching Image 2
  var aName = t.assignee_name || 'Unassigned';
  var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(aName) : /jeshua\s+koh/i.test(aName);
  var aAvatar = document.querySelector('.tdm-assignee-avatar');
  if (aAvatar) {
    var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(aName, t.assignee_ic) : null;
    var tooltip = aName + (isCreator ? ' (Portal Creator)' : '');
    aAvatar.title = tooltip;
    aAvatar.setAttribute('aria-label', tooltip);
    aAvatar.style.cursor = 'pointer';
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(t.assignee_ic || aName, aName)
      : null;
    if (photoUrl) {
      aAvatar.innerHTML = '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt="' + (typeof escapeHtml === 'function' ? escapeHtml(aName) : aName) + '"/>';
      aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      aAvatar.style.background = 'transparent';
    } else if (isCreator) {
      aAvatar.innerHTML = '';
      aAvatar.textContent = 'J';
      var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
      if (isRgb) {
        aAvatar.classList.add('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      } else {
        aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      }
      aAvatar.style.background = '#083830';
    } else {
      var initials = (typeof getMemberAvatarInitial === 'function') ? getMemberAvatarInitial(aName) : (aName === 'Unassigned' ? 'U' : (aName.trim().charAt(0).toUpperCase() || '?'));
      aAvatar.innerHTML = '';
      aAvatar.textContent = initials;
      aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      aAvatar.style.background = (typeof getMemberAvatarColor === 'function') ? getMemberAvatarColor(aName) : getAssigneeAvatarBg(aName);
    }
    if (typeof applyAvatarOutlineElement === 'function') {
      applyAvatarOutlineElement(aAvatar, outlineInfo ? outlineInfo.style : 'none');
    }
  }
  set('tdm-assignee', aName);

  // Priority Pill matching Image 2, 4, 5
  var priorityVal = (t.priority || 'medium').toLowerCase();
  var pLabel = priorityVal === 'high' ? 'High' : (priorityVal === 'low' ? 'Low' : 'Medium');
  var pCls = priorityVal === 'high' ? 'priority-high' : (priorityVal === 'low' ? 'priority-low' : 'priority-medium');
  var pIconEl = document.querySelector('.tdm-priority-icon');
  if (pIconEl) {
    pIconEl.innerHTML = getPriorityIconSvg(priorityVal, 14);
    pIconEl.className = 'tdm-priority-icon ' + pCls;
  }
  var pTextEl = document.querySelector('.tdm-priority-text');
  if (pTextEl) {
    pTextEl.textContent = pLabel;
    pTextEl.className = 'tdm-priority-text ' + pCls;
  }
  var pBtn = document.querySelector('.tdm-priority-btn');
  if (pBtn) {
    pBtn.className = 'task-prop-pill-btn tdm-priority-btn ' + pCls;
  }

  // Due Date Pill matching Image 2 & 4
  var dueStr = formatTaskDueDateStr(t.due_date);
  set('tdm-due', dueStr);
  var dueInput = document.querySelector('.tdm-due-input');
  if (dueInput) {
    dueInput.value = (t.due_date && typeof t.due_date === 'string') ? t.due_date.split('T')[0] : '';
  }

  // Estimate Pill matching Image 2
  var estStr = t.estimate || 'Estimate';
  var estValEl = document.querySelector('.tdm-estimate-val');
  if (estValEl) estValEl.textContent = estStr;

  // Description: strip [Project: ...] and [Estimate: ...] tags for clean reading and editing
  var cleanDesc = (t.description || '').replace(/\s*\[(Project:[^\]|]*|Estimate:[^\]|]*)[^\]]*\]/gi, '').trim();
  var descEl = document.getElementById('tdm-desc');
  if (descEl) {
    descEl.innerHTML = (typeof sanitizeHtml === 'function') ? sanitizeHtml(cleanDesc) : ((typeof escapeHtml === 'function') ? escapeHtml(cleanDesc) : cleanDesc);
  }

  var modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'block';
  renderTaskComments(id);
  renderTaskAttachments(id);
}

function handleTaskTitleBlur(el) {
  if (!_activeDetailTaskId || !el) return;
  var val = (el.textContent || '').trim();
  if (val) {
    saveTaskField(_activeDetailTaskId, 'title', val);
  }
}

function handleTaskDescBlur(el) {
  if (!_activeDetailTaskId || !el) return;
  var val = (el.innerHTML || el.textContent || '').trim();
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  var fullDesc = buildTaskDescriptionWithMeta(t || {}, val);
  saveTaskField(_activeDetailTaskId, 'description', fullDesc);
  if (typeof syncTaskNotifications === 'function' && typeof _allLoadedTasks !== 'undefined') {
    syncTaskNotifications(_allLoadedTasks);
  } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function' && typeof window._allLoadedTasks !== 'undefined') {
    window.syncTaskNotifications(window._allLoadedTasks);
  }
}

/**
 * Rich Text Editing Command Handler for Task Brief (Image 5)
 */
function formatTaskDesc(cmd, val, btnEl) {
  if (typeof document === 'undefined') return;
  if (typeof executeRichFormat === 'function') {
    executeRichFormat(cmd, val, btnEl || document.getElementById('tdm-desc'));
    return;
  }
  if (typeof document === 'undefined') return;
  document.execCommand(cmd, false, val || null);
  var descEl = document.getElementById('tdm-desc');
  if (descEl) descEl.focus();
}

/**
 * Inserts URL link into task brief description
 */
function insertTaskDescLink() {
  if (typeof document === 'undefined') return;
  var url = (typeof prompt === 'function') ? prompt('Enter URL (https://...):') : null;
  if (url && url.trim()) {
    formatTaskDesc('createLink', url.trim());
  }
}

/**
 * Adds an interactive subtask item to the active task brief (Image 5)
 */
function addActiveTaskSubtask(text) {
  if (typeof document === 'undefined') return;
  var list = document.querySelector('.tb-subtasks-list');
  if (!list) return;
  var item = document.createElement('div');
  item.className = 'tb-subtask-item';
  item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);';
  item.innerHTML = '<input type="checkbox" style="cursor:pointer;" onchange="this.nextElementSibling.style.textDecoration = this.checked ? \'line-through\' : \'none\'; this.nextElementSibling.style.opacity = this.checked ? \'0.6\' : \'1\';" />'
    + '<span contenteditable="true" style="outline:none;flex:1;font-size:13px;" placeholder="Sub-task title...">' + (typeof escapeHtml === 'function' ? escapeHtml(text || 'New sub-task') : (text || 'New sub-task')) + '</span>'
    + '<button type="button" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px;" onclick="this.parentElement.remove()" title="Delete subtask">&times;</button>';
  list.appendChild(item);
  var span = item.querySelector('span');
  if (span) span.focus();
}

/**
 * Links a related task in the task brief (Image 5)
 */
function addActiveTaskLink() {
  var urlOrTitle = (typeof prompt === 'function') ? prompt('Enter link URL or related task ID:') : null;
  if (!urlOrTitle || !urlOrTitle.trim()) return;
  var emptyNotice = document.querySelector('.tb-links-empty');
  if (emptyNotice) emptyNotice.style.display = 'none';
  var section = document.querySelector('.tb-links-empty') ? document.querySelector('.tb-links-empty').parentElement : null;
  if (section) {
    var linkPill = document.createElement('div');
    linkPill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:var(--bg-card-subtle);border:1px solid var(--border-card);padding:4px 10px;border-radius:6px;font-size:12px;margin:4px 4px 4px 0;';
    linkPill.innerHTML = '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
      + '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(urlOrTitle.trim()) : urlOrTitle.trim()) + '</span>'
      + '<button type="button" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;margin-left:4px;" onclick="this.parentElement.remove()">&times;</button>';
    section.appendChild(linkPill);
  }
}

var _taskCommentsMap = {};

/**
 * Retrieves comments for a specific task
 */
function getTaskComments(taskId) {
  if (!taskId) return [];
  if (_taskCommentsMap[taskId]) return _taskCommentsMap[taskId];
  try {
    var stored = localStorage.getItem('bb_task_comments_' + taskId);
    if (stored) {
      var parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        _taskCommentsMap[taskId] = parsed;
        return parsed;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Persists comments for a specific task
 */
function saveTaskComments(taskId, comments) {
  if (!taskId || !Array.isArray(comments)) return;
  _taskCommentsMap[taskId] = comments;
  try {
    localStorage.setItem('bb_task_comments_' + taskId, JSON.stringify(comments));
  } catch (_) {}
  var client = getSupaClient();
  if (client) {
    client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_task_comments_' + taskId, value: JSON.stringify(comments) }, {
      headers: { 'Prefer': 'resolution=merge-duplicates' }
    }).catch(function() {
      client.patch('bb_config?key=eq.bb_task_comments_' + taskId, { value: JSON.stringify(comments) }).catch(function() {
        client.post('bb_config', { key: 'bb_task_comments_' + taskId, value: JSON.stringify(comments) }).catch(function() {});
      });
    });
  }
}

/**
 * Fetches all persisted task comments from Supabase bb_config
 */
var _isFetchingRemoteTaskComments = false;
var _lastFetchRemoteTaskCommentsTime = 0;

/**
 * Fetches all persisted task comments from Supabase bb_config with 30s throttle
 */
async function fetchAllRemoteTaskComments() {
  var now = Date.now();
  if (_isFetchingRemoteTaskComments || (now - _lastFetchRemoteTaskCommentsTime < 30000)) return;
  _isFetchingRemoteTaskComments = true;
  _lastFetchRemoteTaskCommentsTime = now;
  var client = getSupaClient();
  if (!client) {
    _isFetchingRemoteTaskComments = false;
    return;
  }
  try {
    var rows = await client.get('bb_config?key=like.bb_task_comments_*&select=key,value');
    if (Array.isArray(rows) && rows.length) {
      rows.forEach(function(r) {
        if (!r.key || !r.value) return;
        var tid = r.key.replace('bb_task_comments_', '');
        try {
          var arr = JSON.parse(r.value);
          if (Array.isArray(arr)) {
            _taskCommentsMap[tid] = arr;
            try { localStorage.setItem(r.key, r.value); } catch (_) {}
          }
        } catch (_) {}
      });
    }
  } catch (_) {} finally {
    _isFetchingRemoteTaskComments = false;
  }
}

async function fetchRemoteTaskComments(taskId) {
  if (!taskId) return [];
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_task_comments_' + taskId + '&select=value');
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          _taskCommentsMap[taskId] = parsed;
          try { localStorage.setItem('bb_task_comments_' + taskId, JSON.stringify(parsed)); } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}
  }
  return getTaskComments(taskId);
}

/**
 * Renders comments in the task brief modal
 */
function renderTaskComments(taskId) {
  if (typeof document === 'undefined') return;
  var list = document.querySelector('.tb-comments-list');
  if (!list) return;

  var tid = taskId || _activeDetailTaskId;
  var comments = getTaskComments(tid);

  if (!comments.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;font-style:italic;">No comments yet. Be the first to leave a comment!</div>';
    return;
  }

  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  var myEmail = (typeof sessionGet === 'function' ? sessionGet('email') : '') || '';
  var isSuperAdmin = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin(myEmail) : false;
  var isAdmin = (typeof RBAC !== 'undefined' && typeof RBAC.isAdmin === 'function') ? RBAC.isAdmin(myEmail) : false;

  var html = '';
  comments.forEach(function(c) {
    var author = c.author_name || 'Member';
    var email = c.author_email || '';
    var avatarHtml = getAssigneeAvatarHtml(author, email, 30);
    var safeAuthor = (typeof escapeHtml === 'function') ? escapeHtml(author) : author;
    var safeText = (typeof escapeHtml === 'function') ? escapeHtml(c.text || '') : (c.text || '');
    var timeStr = 'Just now';
    if (c.created_at) {
      try {
        var d = new Date(c.created_at);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (_) {}
    }

    var isAuthor = (myEmail && c.author_email && myEmail.toLowerCase() === c.author_email.toLowerCase())
      || (myName && c.author_name && myName.toLowerCase() === c.author_name.toLowerCase());
    var canEdit = isAuthor;
    var canDelete = isAuthor || isAdmin || isSuperAdmin;

    var actionsHtml = '';
    if (canEdit || canDelete) {
      actionsHtml = '<div class="tb-comment-actions">'
        + '<button type="button" class="tb-comment-more-btn" onclick="toggleTaskCommentMenu(\'' + c.id + '\', event)" title="Comment options" aria-label="Comment options">'
          + '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
        + '</button>'
        + '<div class="tb-comment-dropdown" data-comment-id="' + c.id + '" style="display:none;" role="menu">'
          + (canEdit ? ('<button type="button" class="tb-comment-dropdown-item" role="menuitem" onclick="startEditTaskComment(\'' + tid + '\', \'' + c.id + '\')"><svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Edit</span></button>') : '')
          + (canDelete ? ('<button type="button" class="tb-comment-dropdown-item tb-comment-dropdown-delete" role="menuitem" onclick="deleteTaskComment(\'' + tid + '\', \'' + c.id + '\')"><svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>Delete</span></button>') : '')
        + '</div>'
      + '</div>';
    }

    var editedHtml = c.edited_at ? ' <span class="tb-comment-edited" title="Edited">(edited)</span>' : '';

    html += '<div class="tb-comment-item" id="tb-comment-' + c.id + '">'
      + avatarHtml
      + '<div class="tb-comment-content">'
        + '<div class="tb-comment-header">'
          + '<span class="tb-comment-author">' + safeAuthor + '</span>'
          + '<span class="tb-comment-time">' + timeStr + editedHtml + '</span>'
          + actionsHtml
        + '</div>'
        + '<div class="tb-comment-text" data-comment-id="' + c.id + '">' + formatCommentMentions(safeText) + '</div>'
      + '</div>'
      + '</div>';
  });

  list.innerHTML = html;
}

/**
 * Toggles the 3-dots action dropdown menu for a specific comment
 * @param {string} commentId
 * @param {Event} [event]
 */
function toggleTaskCommentMenu(commentId, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  var allMenus = (typeof document !== 'undefined') ? document.querySelectorAll('.tb-comment-dropdown') : [];
  var targetMenu = (typeof document !== 'undefined') ? document.querySelector('.tb-comment-dropdown[data-comment-id="' + commentId + '"]') : null;
  if (!targetMenu) return;

  var isCurrentlyOpen = targetMenu.style.display !== 'none';
  allMenus.forEach(function(m) { m.style.display = 'none'; });

  if (!isCurrentlyOpen) {
    targetMenu.style.display = 'flex';
  }
}

/**
 * Activates inline editing for a task comment
 * @param {string} taskId
 * @param {string} commentId
 */
function startEditTaskComment(taskId, commentId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;

  // Close all open menus
  var allMenus = (typeof document !== 'undefined') ? document.querySelectorAll('.tb-comment-dropdown') : [];
  allMenus.forEach(function(m) { m.style.display = 'none'; });

  var comments = getTaskComments(tid);
  var targetComment = comments.find(function(c) { return String(c.id) === String(commentId); });
  if (!targetComment) return;

  var textContainer = (typeof document !== 'undefined') ? document.querySelector('.tb-comment-text[data-comment-id="' + commentId + '"]') : null;
  if (!textContainer) return;

  var rawText = targetComment.text || '';
  var safeRaw = (typeof escapeHtml === 'function') ? escapeHtml(rawText) : rawText;

  textContainer.innerHTML = '<div class="tb-comment-edit-wrap">'
    + '<textarea class="tb-comment-edit-input" rows="2" data-edit-cid="' + commentId + '" '
      + 'onkeydown="if((event.ctrlKey||event.metaKey)&&event.key===\'Enter\'){saveEditTaskComment(\'' + tid + '\', \'' + commentId + '\');}else if(event.key===\'Escape\'){cancelEditTaskComment(\'' + tid + '\', \'' + commentId + '\');}">'
      + safeRaw
    + '</textarea>'
    + '<div class="tb-comment-edit-actions">'
      + '<button type="button" class="tb-comment-btn-cancel" onclick="cancelEditTaskComment(\'' + tid + '\', \'' + commentId + '\')">Cancel</button>'
      + '<button type="button" class="tb-comment-btn-save" onclick="saveEditTaskComment(\'' + tid + '\', \'' + commentId + '\')">Save</button>'
    + '</div>'
  + '</div>';

  var textarea = textContainer.querySelector('.tb-comment-edit-input');
  if (textarea) {
    textarea.focus();
    var len = textarea.value.length;
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(len, len);
    }
  }
}

/**
 * Saves changes to an edited task comment
 * @param {string} taskId
 * @param {string} commentId
 */
function saveEditTaskComment(taskId, commentId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;

  var textarea = (typeof document !== 'undefined') ? document.querySelector('.tb-comment-edit-input[data-edit-cid="' + commentId + '"]') : null;
  if (!textarea) return;

  var updatedText = textarea.value.trim();
  if (!updatedText) {
    if (typeof showToast === 'function') {
      showToast('Comment cannot be empty', 'warning');
    }
    return;
  }

  var comments = getTaskComments(tid);
  var targetComment = comments.find(function(c) { return String(c.id) === String(commentId); });
  if (targetComment) {
    if (targetComment.text !== updatedText) {
      targetComment.text = updatedText;
      targetComment.edited_at = new Date().toISOString();
      saveTaskComments(tid, comments);
    }
  }

  renderTaskComments(tid);
  if (typeof showToast === 'function') {
    showToast('Comment updated', 'success', 1500);
  }
}

/**
 * Cancels editing a task comment and restores original text
 * @param {string} taskId
 * @param {string} commentId
 */
function cancelEditTaskComment(taskId, _commentId) {
  var tid = taskId || _activeDetailTaskId;
  renderTaskComments(tid);
}

/**
 * Deletes a task comment with confirmation
 * @param {string} taskId
 * @param {string} commentId
 */
async function deleteTaskComment(taskId, commentId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;

  // Close menus
  var allMenus = (typeof document !== 'undefined') ? document.querySelectorAll('.tb-comment-dropdown') : [];
  allMenus.forEach(function(m) { m.style.display = 'none'; });

  if (typeof showConfirmModal === 'function') {
    var confirmed = await showConfirmModal(
      'Are you sure you want to delete this comment? This action cannot be undone.',
      'Delete Comment',
      'Delete',
      'Cancel'
    );
    if (!confirmed) return;
  }

  var comments = getTaskComments(tid);
  var filtered = comments.filter(function(c) { return String(c.id) !== String(commentId); });
  saveTaskComments(tid, filtered);
  renderTaskComments(tid);

  if (typeof showToast === 'function') {
    showToast('Comment deleted', 'info', 1500);
  }
}

/**
 * Evaluates whether a comment mentions the specific logged-in user (strictly excludes the author)
 * @param {string} text
 * @param {string} authorEmail
 * @param {string} authorName
 * @param {string} myName
 * @param {string} myEmail
 * @param {string} [myDept]
 * @param {string} [myRank]
 * @returns {boolean}
 */
function isUserMentionedInComment(text, authorEmail, authorName, myName, myEmail, myDept, myRank, myPlatoon) {
  if (!text) return false;

  var cleanText = String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  var lower = cleanText.toLowerCase();

  // Rule 1: @all mentions all members (even author)
  if (/(?:^|\W)@(all|everyone|everybody)\b/i.test(lower)) return true;

  // Rule 2: Individual @Name mention (e.g. "@Jeshua Koh", "@Jeshua", "@Jason Koh")
  if (myName) {
    var myNameLower = myName.toLowerCase().trim();
    if (lower.indexOf('@' + myNameLower) !== -1) return true;
    var nameParts = myNameLower.split(/\s+/).filter(function(p) { return p.length >= 3; });
    for (var i = 0; i < nameParts.length; i++) {
      var rx = new RegExp('(?:^|\\W)@' + nameParts[i] + '\\b', 'i');
      if (rx.test(lower)) return true;
    }
  }

  // Also check email user prefix if @email is mentioned
  if (myEmail) {
    var myEmailLower = myEmail.toLowerCase().trim();
    if (lower.indexOf('@' + myEmailLower) !== -1) return true;
    var emailPrefix = myEmailLower.split('@')[0];
    if (emailPrefix && emailPrefix.length >= 3) {
      var erx = new RegExp('(?:^|\\W)@' + emailPrefix + '\\b', 'i');
      if (erx.test(lower)) return true;
    }
  }

  // Rule 3: Department group mention (e.g. @Secretariat, @Logistics, @Media, @HQ, @Officers, @Band)
  if (myDept) {
    var cleanDept = myDept.toLowerCase().trim();
    if (cleanDept && lower.indexOf('@' + cleanDept) !== -1) return true;
    if (cleanDept.indexOf('secretariat') !== -1 && lower.indexOf('@secretariat') !== -1) return true;
    if (cleanDept.indexOf('logistics') !== -1 && lower.indexOf('@logistics') !== -1) return true;
    if (cleanDept.indexOf('media') !== -1 && lower.indexOf('@media') !== -1) return true;
    if (cleanDept.indexOf('hq') !== -1 && lower.indexOf('@hq') !== -1) return true;
    if (cleanDept.indexOf('band') !== -1 && lower.indexOf('@band') !== -1) return true;
    if ((cleanDept === 'officers' || cleanDept === 'officer') && /(?:^|\W)@officers?\b/i.test(lower)) return true;
  }

  // Rule 4: Platoon group mention (e.g. @Hotel, @Hotel Platoon, @Alpha, @Zulu, @Papa)
  var platoonStr = myPlatoon || '';
  if (!platoonStr && typeof sessionGet === 'function') platoonStr = sessionGet('platoon') || '';
  if (platoonStr) {
    var cleanPlatoon = platoonStr.toLowerCase().trim();
    if (cleanPlatoon && lower.indexOf('@' + cleanPlatoon) !== -1) return true;
    var platoonParts = cleanPlatoon.split(/\s+/).filter(function(p) { return p !== 'platoon' && p.length >= 3; });
    for (var j = 0; j < platoonParts.length; j++) {
      if (lower.indexOf('@' + platoonParts[j]) !== -1) return true;
    }
  }

  // Rule 5: Rank & NCO mentions
  if (myRank) {
    var cleanRank = myRank.toLowerCase().trim();
    if (cleanRank && lower.indexOf('@' + cleanRank) !== -1) return true;
    var isNco = ['lance corporal', 'corporal', 'sergeant', 'staff sergeant'].some(function(r) { return cleanRank.indexOf(r) !== -1; });
    if (isNco && /(?:^|\W)@ncos?\b/i.test(lower)) return true;
  }

  // Rule 6: @Officers mention (matching rank or department)
  var isOfficerRank = myRank && ['Officer', 'Lieutenant', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Chaplain', 'Warrant Officer', 'Instructor', 'Staff Sergeant'].indexOf(myRank) !== -1;
  var isOfficerDept = myDept && (myDept.toLowerCase().trim() === 'officers' || myDept.toLowerCase().trim() === 'officer');
  if ((isOfficerRank || isOfficerDept) && /(?:^|\W)@officers?\b/i.test(lower)) return true;

  // Rule 7: Band mention matching rank or department
  var isBand = (myRank && myRank.toLowerCase().indexOf('band') !== -1) || (myDept && myDept.toLowerCase().indexOf('band') !== -1);
  if (isBand && lower.indexOf('@band') !== -1) return true;

  // Rule 8: Admin & Super Admin mention
  var isAdminOrSuper = (typeof isAdmin === 'function' && isAdmin()) || (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof window !== 'undefined' && typeof window.isSuperAdmin === 'function' && window.isSuperAdmin());
  if (!isAdminOrSuper && typeof sessionGet === 'function') {
    var sRole = (sessionGet('role') || '').toLowerCase();
    if (sRole === 'admin' || sRole === 'superadmin') isAdminOrSuper = true;
  }
  if (isAdminOrSuper && /(?:^|\W)@(admins?|superadmins?)\b/i.test(lower)) return true;

  return false;
}

/**
 * Handles comment submit on task brief (Image 5)
 */
function handleTaskCommentSubmit(input) {
  if (!input || !input.value.trim()) return;
  var commentText = input.value.trim();
  input.value = '';

  var tid = _activeDetailTaskId;
  if (!tid) return;

  var authorName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || 'Member';
  var authorEmail = (typeof sessionGet === 'function' ? sessionGet('email') : '') || '';

  var newComment = {
    id: 'cmt_' + Date.now(),
    task_id: tid,
    author_name: authorName,
    author_email: authorEmail,
    text: commentText,
    created_at: new Date().toISOString()
  };

  var comments = getTaskComments(tid);
  comments.push(newComment);
  saveTaskComments(tid, comments);

  renderTaskComments(tid);

  // Sync notifications across tasks, ensuring the author is NOT notified
  if (typeof syncTaskNotifications === 'function' && typeof _allLoadedTasks !== 'undefined') {
    syncTaskNotifications(_allLoadedTasks);
  } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function' && typeof window._allLoadedTasks !== 'undefined') {
    window.syncTaskNotifications(window._allLoadedTasks);
  }

  if (typeof showToast === 'function') {
    showToast('Comment posted successfully!', 'success', 1500);
  }
}

/**
 * Retrieves persisted attachments array for a given task ID
 * @param {string} taskId
 * @returns {Array<Object>}
 */
function getTaskAttachments(taskId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return [];
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t && Array.isArray(t.attachments)) {
    return t.attachments;
  }
  try {
    var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('bb_task_attachments_' + tid) : null;
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        if (t) t.attachments = arr;
        return arr;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Persists attachments array for a given task ID into memory, localStorage, and Supabase
 * @param {string} taskId
 * @param {Array<Object>} attachments
 */
function saveTaskAttachments(taskId, attachments) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;
  var atts = Array.isArray(attachments) ? attachments : [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_task_attachments_' + tid, JSON.stringify(atts));
    }
  } catch (_) {}

  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t) t.attachments = atts;

  saveTaskField(tid, 'attachments', atts);
}

/**
 * Renders the task attachments list inside the active task brief modal
 * @param {string} taskId
 */
function renderTaskAttachments(taskId) {
  if (typeof document === 'undefined') return;
  var list = document.querySelector('.tb-attachments-list');
  var countTitle = document.querySelector('.tb-attachments-count-title');
  if (!list) return;

  var tid = taskId || _activeDetailTaskId;
  var attachments = getTaskAttachments(tid);

  if (countTitle) {
    countTitle.textContent = attachments.length ? ('Attachments (' + attachments.length + ')') : 'Attachments';
  }

  if (!attachments.length) {
    list.innerHTML = '';
    return;
  }

  var html = '';
  attachments.forEach(function(att) {
    var safeName = (typeof escapeHtml === 'function') ? escapeHtml(att.name || 'Attachment') : (att.name || 'Attachment');
    var rawUrl = att.url || '#';
    var safeFileUrl = (typeof safeUrl === 'function') ? safeUrl(rawUrl, '#') : rawUrl;
    var ext = (att.name || '').split('.').pop().toLowerCase();
    var iconCls = (ext === 'pdf') ? 'pdf' : ((ext === 'doc' || ext === 'docx') ? 'doc' : ((ext === 'xls' || ext === 'xlsx' || ext === 'csv') ? 'sheet' : ((ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'gif') ? 'img' : 'file')));
    var iconColor = iconCls === 'pdf' ? '#ef4444' : (iconCls === 'doc' ? '#3b82f6' : (iconCls === 'sheet' ? '#10b981' : (iconCls === 'img' ? '#f59e0b' : 'var(--accent)')));

    var iconSvg = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:' + iconColor + ';flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    html += '<div class="tb-attachment-chip" data-att-id="' + att.id + '">'
      + '<span class="tb-attachment-icon">' + iconSvg + '</span>'
      + '<a href="' + safeFileUrl + '" target="_blank" rel="noopener noreferrer" class="tb-attachment-link" title="Open and view ' + safeName + '">' + safeName + '</a>'
      + (att.size ? ('<span class="tb-attachment-size">' + (typeof escapeHtml === 'function' ? escapeHtml(att.size) : att.size) + '</span>') : '')
      + '<button type="button" class="tb-attachment-delete-btn" onclick="removeTaskAttachment(\'' + tid + '\', \'' + att.id + '\')" title="Remove file" aria-label="Remove attachment">'
      + '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      + '</button>'
      + '</div>';
  });

  list.innerHTML = html;
}

/**
 * Handles uploading 1 or more task attachments with storage upload and local fallback
 * @param {Event} event
 */
async function handleTaskAttachmentUpload(event) {
  var files = event && event.target && event.target.files;
  if (!files || !files.length) return;
  var tid = _activeDetailTaskId;
  if (!tid) return;

  var attachments = getTaskAttachments(tid);
  var addedCount = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!file || !file.name) continue;

    // Security check: prohibit SVG files to prevent stored XSS
    if (/\.svg$/i.test(file.name)) {
      if (typeof showToast === 'function') {
        showToast('SVG file uploads are blocked for security.', 'warning');
      }
      continue;
    }

    var sz = '';
    if (file.size) {
      sz = (file.size < 1024 * 1024)
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    var fileUrl = '';
    if (typeof supa !== 'undefined' && typeof supa.uploadFile === 'function') {
      try {
        var cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var remotePath = 'tasks/' + tid + '/' + Date.now() + '_' + cleanFileName;
        await supa.uploadFile('resources', remotePath, file);
        fileUrl = supa.fileUrl('resources', remotePath);
      } catch (uploadErr) {
        console.warn('Supabase storage upload fallback:', uploadErr);
      }
    }

    if (!fileUrl && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        fileUrl = URL.createObjectURL(file);
      } catch (_) {}
    }

    var newAtt = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: file.name,
      url: fileUrl || '#',
      size: sz,
      uploadedAt: new Date().toISOString()
    };

    attachments.push(newAtt);
    addedCount++;
  }

  saveTaskAttachments(tid, attachments);
  renderTaskAttachments(tid);

  if (event.target) event.target.value = '';

  if (addedCount > 0 && typeof showToast === 'function') {
    showToast('✓ ' + addedCount + ' file(s) attached successfully!', 'success', 2000);
  }
}

/**
 * Removes an attachment from the active task brief
 * @param {string} taskId
 * @param {string} attachmentId
 */
function removeTaskAttachment(taskId, attachmentId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;
  var attachments = getTaskAttachments(tid);
  var filtered = attachments.filter(function(a) { return String(a.id) !== String(attachmentId); });
  saveTaskAttachments(tid, filtered);
  renderTaskAttachments(tid);
  if (typeof showToast === 'function') {
    showToast('Attachment removed', 'info', 1500);
  }
}

// ── Mentions Engine (@ Mentions for Department Members & Groups) ───────────
var _activeMentionIndex = 0;
var _currentMentionCandidates = [];

/**
 * Retrieves mention candidate list for department groups and members
 * @param {string} query
 * @returns {Array<Object>}
 */
function getDepartmentMentionCandidates(query) {
  var q = (query || '').toLowerCase().trim();
  var candidates = [];

  // Group mentions requested by user: @all, @Secretariat, @Logistics, @Media, @HQ, @Band, @Officers
  var groups = [
    { name: 'all', label: '@all', role: 'Group', desc: 'All department members' },
    { name: 'Secretariat', label: '@Secretariat', role: 'Group', desc: 'Secretariat Department' },
    { name: 'Logistics', label: '@Logistics', role: 'Group', desc: 'Logistics Department' },
    { name: 'Media', label: '@Media', role: 'Group', desc: 'Media Department' },
    { name: 'HQ', label: '@HQ', role: 'Group', desc: 'HQ Management' },
    { name: 'Band', label: '@Band', role: 'Group', desc: 'Band Department' },
    { name: 'Officers', label: '@Officers', role: 'Group', desc: 'Company Officers' }
  ];

  groups.forEach(function(g) {
    if (!q || g.name.toLowerCase().indexOf(q) !== -1 || g.label.toLowerCase().indexOf(q) !== -1) {
      candidates.push(g);
    }
  });

  // Department members
  var memberMap = {};
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && isMemberDepartmentRole(m)) {
        memberMap[m.name] = {
          name: m.name,
          label: '@' + m.name,
          role: m.department || m.rank || 'NCO',
          email: m.email || '',
          desc: (m.rank || 'NCO') + (m.department ? (' · ' + m.department) : '')
        };
      }
    });
  }

  // Also include current user and assignees from loaded tasks
  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  if (myName && !memberMap[myName]) {
    memberMap[myName] = {
      name: myName,
      label: '@' + myName,
      role: (typeof sessionGet === 'function' ? sessionGet('department') : '') || 'Member',
      desc: (typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Member'
    };
  }

  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name !== 'Unassigned' && !memberMap[t.assignee_name]) {
      memberMap[t.assignee_name] = {
        name: t.assignee_name,
        label: '@' + t.assignee_name,
        role: t.department || 'NCO',
        desc: t.department ? (t.department + ' NCO') : 'Assignee'
      };
    }
  });

  Object.keys(memberMap).sort().forEach(function(k) {
    var m = memberMap[k];
    if (!q || m.name.toLowerCase().indexOf(q) !== -1 || m.label.toLowerCase().indexOf(q) !== -1) {
      candidates.push(m);
    }
  });

  return candidates;
}

/**
 * Handles typing in the comment box to reveal @ mention suggestions
 * @param {HTMLInputElement} inputEl
 */
var _activeMentionTarget = null;

/**
 * Handles typing inside task brief contenteditable description fields (#tdm-desc, .new-task-desc-input)
 * @param {HTMLElement} el
 */
function handleTaskBriefDescInput(el) {
  if (!el) return;
  _activeMentionTarget = el;

  var text = '';
  var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
  if (sel && sel.focusNode) {
    var nodeText = sel.focusNode.textContent || '';
    var offset = sel.focusOffset || 0;
    text = nodeText.slice(0, offset);
  } else {
    text = el.innerText || el.textContent || '';
  }

  var match = text.match(/@([a-zA-Z0-9_\s]*)$/);
  if (match) {
    var query = match[1];
    if (query.split(/\s+/).length <= 2) {
      showMentionDropdown(el, query);
      return;
    }
  }

  hideMentionDropdown();
}

function handleTaskCommentInput(inputEl) {
  _activeMentionTarget = inputEl;
  if (!inputEl) return;
  var val = inputEl.value;
  var cursor = (typeof inputEl.selectionStart === 'number') ? inputEl.selectionStart : val.length;
  var before = val.slice(0, cursor);

  // Match @query ending at cursor
  var match = before.match(/@([a-zA-Z0-9_\s]*)$/);
  if (match) {
    var query = match[1];
    if (query.split(/\s+/).length <= 2) {
      showMentionDropdown(inputEl, query);
      return;
    }
  }

  hideMentionDropdown();
}

/**
 * Renders the floating mention dropdown menu
 * @param {HTMLInputElement} inputEl
 * @param {string} query
 */
function showMentionDropdown(inputEl, query) {
  var dropdown = (typeof document !== 'undefined') ? document.querySelector('.tb-mentions-dropdown') : null;
  if (!dropdown) return;

  var candidates = getDepartmentMentionCandidates(query);
  _currentMentionCandidates = candidates;
  _activeMentionIndex = 0;

  if (!candidates.length) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-style:italic;">No matching department members</div>';
    dropdown.style.display = 'block';
    return;
  }

  var html = '';
  candidates.slice(0, 8).forEach(function(c, i) {
    var isGroup = c.role === 'Group';
    var iconHtml = isGroup
      ? '<span style="width:24px;height:24px;border-radius:6px;background:rgba(217,163,35,0.2);color:var(--brand-gold,#f5c542);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">#</span>'
      : getAssigneeAvatarHtml(c.name, c.email, 24);

    html += '<div class="tb-mention-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" onpointerdown="selectMentionCandidate(' + i + ', event)" ontouchstart="selectMentionCandidate(' + i + ', event)" onmousedown="selectMentionCandidate(' + i + ', event)">'
      + iconHtml
      + '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">'
        + '<div class="tb-mention-name">' + (typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name) + '</div>'
        + '<div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (typeof escapeHtml === 'function' ? escapeHtml(c.desc || '') : (c.desc || '')) + '</div>'
      + '</div>'
      + '<span class="tb-mention-type">' + (isGroup ? 'Group' : (c.role || 'Member')) + '</span>'
      + '</div>';
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

/**
 * Hides the mention dropdown
 */
function hideMentionDropdown() {
  var dropdown = (typeof document !== 'undefined') ? document.querySelector('.tb-mentions-dropdown') : null;
  if (dropdown) dropdown.style.display = 'none';
  _currentMentionCandidates = [];
  _activeMentionIndex = 0;
}

/**
 * Handles keyboard navigation inside comment box (Arrow keys, Enter, Tab, Escape)
 * @param {KeyboardEvent} e
 * @param {HTMLInputElement} inputEl
 */
function handleTaskCommentKeyDown(e, inputEl) {
  var dropdown = (typeof document !== 'undefined') ? document.querySelector('.tb-mentions-dropdown') : null;
  var isDropdownOpen = dropdown && dropdown.style.display !== 'none' && _currentMentionCandidates.length > 0;

  if (isDropdownOpen) {
    var items = dropdown.querySelectorAll('.tb-mention-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeMentionIndex = (_activeMentionIndex + 1) % items.length;
      updateActiveMentionItem(items);
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeMentionIndex = (_activeMentionIndex - 1 + items.length) % items.length;
      updateActiveMentionItem(items);
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectMentionCandidate(_activeMentionIndex);
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideMentionDropdown();
      return;
    }
  }

  // Ctrl+Enter or Cmd+Enter submits comment
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleTaskCommentSubmit(inputEl);
  }
}

function updateActiveMentionItem(items) {
  items.forEach(function(el, i) {
    el.classList.toggle('active', i === _activeMentionIndex);
    if (i === _activeMentionIndex && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

/**
 * Inserts the chosen mention candidate into the comment input
 * @param {number} idx
 * @param {Event} [event]
 */
function selectMentionCandidate(idx, event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  var candidate = _currentMentionCandidates[idx];
  if (!candidate) return;

  var input = _activeMentionTarget || ((typeof document !== 'undefined') ? document.querySelector('.tb-comment-input') : null);
  if (!input) return;

  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    var val = input.value;
    var cursor = (typeof input.selectionStart === 'number') ? input.selectionStart : val.length;
    var before = val.slice(0, cursor);
    var after = val.slice(cursor);

    var newBefore = before.replace(/@([a-zA-Z0-9_\s]*)$/, '@' + candidate.name + ' ');
    input.value = newBefore + after;
    var newCursor = newBefore.length;
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(newCursor, newCursor);
    }
    input.focus();
  } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
    var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    if (sel && sel.focusNode) {
      var node = sel.focusNode;
      var nodeText = node.textContent || '';
      var offset = sel.focusOffset || nodeText.length;
      var beforeC = nodeText.slice(0, offset);
      var afterC = nodeText.slice(offset);
      var newBeforeC = beforeC.replace(/@([a-zA-Z0-9_\s]*)$/, '@' + candidate.name + ' ');
      node.textContent = newBeforeC + afterC;
      try {
        var range = document.createRange();
        range.setStart(node, Math.min(newBeforeC.length, node.textContent.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    } else {
      var curText = input.innerText || input.textContent || '';
      input.innerText = curText.replace(/@([a-zA-Z0-9_\s]*)$/, '@' + candidate.name + ' ');
    }
    input.focus();
  }

  hideMentionDropdown();
}

/**
 * Wraps @mentions in styled mention badges
 * @param {string} text
 * @returns {string}
 */
function formatCommentMentions(text) {
  if (!text) return '';
  return text.replace(/@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)/g, '<span class="tb-mention-pill">@$1</span>');
}


/**
 * Backward compatibility helpers
 */
function handleTaskDetailDescChange(val) {
  var descEl = document.getElementById('tdm-desc');
  if (descEl) descEl.textContent = val;
}

function saveActiveTaskBrief() {
  if (!_activeDetailTaskId) return;
  var descEl = document.getElementById('tdm-desc');
  var val = descEl ? (descEl.innerHTML || descEl.textContent || '') : '';
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  var fullDesc = buildTaskDescriptionWithMeta(t || {}, val);
  saveTaskField(_activeDetailTaskId, 'description', fullDesc);
}

/**
 * Saves a specific field on active task instantly with optimistic update
 */
async function saveTaskField(id, field, value) {
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(id); });
  }
  if (!t) {
    try {
      var cached = JSON.parse(localStorage.getItem('bb_cached_tasks') || '[]');
      if (Array.isArray(cached)) {
        t = cached.find(function(x) { return String(x.id) === String(id); });
      }
    } catch (_) {}
  }
  if (!t) return;
  t[field] = value;
  _taskMap[id] = t;
  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
    window._taskMap[id] = t;
  }
  var loaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(id); });
  if (loaded) loaded[field] = value;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks));
    }
  } catch (_) {}
  // Optimistic updates on board
  if (_tasksViewMode === 'board') {
    renderColumnsFromTasks(_allLoadedTasks);
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else if (_tasksViewMode === 'projects') {
    renderProjectsView();
  }

  if (field === 'description') {
    if (typeof syncTaskNotifications === 'function' && typeof _allLoadedTasks !== 'undefined') {
      syncTaskNotifications(_allLoadedTasks);
    } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function' && typeof window._allLoadedTasks !== 'undefined') {
      window.syncTaskNotifications(window._allLoadedTasks);
    }
  }

  // Background async patch with graceful fallback
  var client = getSupaClient();
  if (client) {
    var patch = {};
    patch[field] = value;
    try {
      await client.patch('bb_tasks?id=eq.' + id, patch);
    } catch (err) {
      console.warn('Background patch error for field ' + field + ':', err);
      if (field === 'estimate' || field === 'project_name') {
        var pName = getTaskProjectName(t);
        var est = t.estimate || '';
        var rawDesc = (t.description || '').replace(/\s*\[Project:[^\]]*\]/gi, '').trim();
        var extra = [];
        if (pName) extra.push('Project: ' + pName);
        if (est) extra.push('Estimate: ' + est);
        var updatedDesc = rawDesc + (extra.length ? '\n\n[' + extra.join(' | ') + ']' : '');
        try {
          await client.patch('bb_tasks?id=eq.' + id, { description: updatedDesc });
        } catch (_) {}
      }
    }
  }
  if (typeof showToast === 'function') {
    showToast('Task updated', 'info', 1000);
  }
}

/**
 * Interactive Status Menu for Task Brief (Image 2)
 */
function toggleTaskDetailStatusMenu(e) {
  if (e) e.stopPropagation();
  var otherMenu = document.querySelector('.tdm-assignee-dropdown');
  if (otherMenu) otherMenu.style.display = 'none';
  var menu = document.querySelector('.tdm-status-dropdown');
  if (!menu) return;
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    return;
  }
  var html = '';
  STATUS_ORDER.forEach(function(s) {
    var conf = STATUS_CONFIG[s];
    html += '<div class="task-prop-dropdown-item" onclick="selectTaskDetailStatus(\'' + s + '\')">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + conf.color + ';display:inline-block;"></span>'
      + '<span>' + conf.label + '</span>'
      + '</div>';
  });
  menu.innerHTML = html;
  menu.style.display = 'block';
}

function selectTaskDetailStatus(status) {
  if (!_activeDetailTaskId) return;
  saveTaskField(_activeDetailTaskId, 'status', status);
  var sConf = STATUS_CONFIG[status] || { label: status, color: '#3b82f6' };
  var statusDot = document.querySelector('.tdm-status-dot');
  if (statusDot) statusDot.style.background = sConf.color;
  var statusText = document.querySelector('.tdm-status-text');
  if (statusText) statusText.textContent = sConf.label;
  var menu = document.querySelector('.tdm-status-dropdown');
  if (menu) menu.style.display = 'none';
}

/**
 * Interactive Assignee Menu for Task Brief (Image 2)
 */
async function toggleTaskDetailAssigneeMenu(e) {
  if (e) e.stopPropagation();
  var otherMenu = document.querySelector('.tdm-status-dropdown');
  if (otherMenu) otherMenu.style.display = 'none';
  var menu = document.querySelector('.tdm-assignee-dropdown');
  if (!menu) return;
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    return;
  }

  // 1. GATHER ALL SYNCHRONOUS AVAILABLE MEMBERS IMMEDIATELY
  var membersMap = {};

  // Current session user
  var myName = (typeof sessionGet === 'function') ? sessionGet('name') : '';
  var myIc = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  var myRank = (typeof sessionGet === 'function') ? sessionGet('rank') : '';
  var myDept = (typeof sessionGet === 'function') ? sessionGet('department') : '';
  if (!myName && typeof document !== 'undefined') {
    var sbName = document.getElementById('sidebar-user-name');
    if (sbName && sbName.textContent && sbName.textContent.trim() !== 'Member') {
      myName = sbName.textContent.trim();
    }
  }
  if (myName) {
    membersMap[myName] = {
      name: myName,
      ic: myIc || '',
      rank: myRank || '',
      department: myDept || 'HQ'
    };
  }

  // Cached department members
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && isMemberDepartmentRole(m)) membersMap[m.name] = m;
    });
  }

  // Existing task assignees from all loaded tasks
  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name !== 'Unassigned') {
      if (!membersMap[t.assignee_name]) {
        membersMap[t.assignee_name] = {
          name: t.assignee_name,
          ic: t.assignee_ic || '',
          department: t.department || 'Department NCO'
        };
      }
    }
  });

  var renderMenuHtml = function(map) {
    var list = Object.keys(map).map(function(k) { return map[k]; });
    var uAvatar = getAssigneeAvatarHtml('Unassigned', '', 20);
    var html = '<div class="task-prop-dropdown-item" onclick="selectTaskDetailAssignee(\'\', \'Unassigned\')">'
      + uAvatar
      + '<span style="font-weight:600;">Unassigned</span></div>';

    list.sort(function(a, b) { return a.name.localeCompare(b.name); });
    list.forEach(function(m) {
      if (!m.name) return;
      var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name) : m.name;
      var safeIc = (typeof escapeHtml === 'function') ? escapeHtml(m.ic || '') : (m.ic || '');
      var dTag = m.department ? (m.department.toLowerCase() === 'department nco' ? 'Department NCO' : m.department) : (m.rank || 'NCO');
      var itemAvatar = getAssigneeAvatarHtml(m.name, m.ic, 20);
      html += '<div class="task-prop-dropdown-item" onclick="selectTaskDetailAssignee(\'' + safeIc + '\', \'' + safeName + '\')">'
        + itemAvatar
        + '<span style="flex:1;">' + safeName + '</span>'
        + '<span style="font-size:10px;color:var(--text-muted);background:var(--surface-tint);padding:2px 6px;border-radius:4px;">' + escapeHtml(dTag) + '</span>'
        + '</div>';
    });
    return html;
  };

  // Render immediately with 0ms delay!
  menu.innerHTML = renderMenuHtml(membersMap);
  menu.style.display = 'block';

  // 2. BACKGROUND REMOTE FETCH WITH 2.0s TIMEOUT RACE
  var client = getSupaClient();
  if (client) {
    var fetchPromise = client.get('bb_members?select=ic,name,rank,department&order=name.asc');
    var timeoutPromise = new Promise(function(resolve) { setTimeout(function() { resolve([]); }, 2000); });
    try {
      var members = await Promise.race([fetchPromise, timeoutPromise]);
      if (Array.isArray(members) && members.length) {
        var eligible = members.filter(isMemberDepartmentRole);
        _cachedDepartmentMembers = eligible;
        eligible.forEach(function(m) {
          if (m && m.name) membersMap[m.name] = m;
        });
        menu.innerHTML = renderMenuHtml(membersMap);
      }
    } catch (err) {
      console.warn('Failed to refresh members in background:', err);
    }
  }
}

async function selectTaskDetailAssignee(ic, name) {
  if (!_activeDetailTaskId) return;
  var tid = _activeDetailTaskId;
  var cleanName = name === 'Unassigned' ? '' : name;
  var cleanIc = ic || '';

  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t) {
    t.assignee_name = cleanName;
    t.assignee_ic = cleanIc;
    t._justAssigned = true;
    setTimeout(function() { delete t._justAssigned; }, 15000);
  }
  var loaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(tid); });
  if (loaded) {
    loaded.assignee_name = cleanName;
    loaded.assignee_ic = cleanIc;
    loaded._justAssigned = true;
  }

  var aNameEl = document.getElementById('tdm-assignee');
  if (aNameEl) aNameEl.textContent = cleanName || 'Unassigned';
  var aAvatar = document.querySelector('.tdm-assignee-avatar');
  if (aAvatar) {
    var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(cleanName) : /jeshua\s+koh/i.test(cleanName);
    var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(cleanName, cleanIc) : null;
    var tooltip = (cleanName || 'Unassigned') + (isCreator ? ' (Portal Creator)' : '');
    aAvatar.title = tooltip;
    aAvatar.setAttribute('aria-label', tooltip);
    aAvatar.style.cursor = 'pointer';
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(cleanIc || cleanName, cleanName)
      : null;
    if (photoUrl) {
      aAvatar.innerHTML = '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt="' + (typeof escapeHtml === 'function' ? escapeHtml(cleanName) : cleanName) + '"/>';
      aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      aAvatar.style.background = 'transparent';
    } else if (isCreator) {
      aAvatar.innerHTML = '';
      aAvatar.textContent = 'J';
      var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
      if (isRgb) {
        aAvatar.classList.add('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      } else {
        aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      }
      aAvatar.style.background = '#083830';
    } else {
      var inits = (typeof getMemberAvatarInitial === 'function') ? getMemberAvatarInitial(cleanName) : (!cleanName || cleanName === 'Unassigned' ? 'U' : (cleanName.trim().charAt(0).toUpperCase() || '?'));
      aAvatar.innerHTML = '';
      aAvatar.textContent = inits;
      aAvatar.classList.remove('creator-outline-avatar', 'creator-snow-avatar', 'creator-rgb-avatar');
      aAvatar.style.background = (typeof getMemberAvatarColor === 'function') ? getMemberAvatarColor(cleanName) : getAssigneeAvatarBg(cleanName);
    }
    if (typeof applyAvatarOutlineElement === 'function') {
      applyAvatarOutlineElement(aAvatar, outlineInfo ? outlineInfo.style : 'none');
    }
  }
  var menu = document.querySelector('.tdm-assignee-dropdown');
  if (menu) menu.style.display = 'none';

  // Instant in-memory optimistic render
  if (_tasksViewMode === 'board') {
    renderColumnsFromTasks(_allLoadedTasks);
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  }

  if (typeof showToast === 'function') {
    showToast('Assigned to ' + (cleanName || 'Unassigned'), 'info', 1000);
  }

  // Background patch without refetching from server
  var client = getSupaClient();
  if (client) {
    try {
      await client.patch('bb_tasks?id=eq.' + tid, { assignee_name: cleanName });
      if (cleanIc) {
        try { await client.patch('bb_tasks?id=eq.' + tid, { assignee_ic: cleanIc }); } catch (_) {}
      }
    } catch (err) {
      console.warn('Failed to sync assignee in background:', err);
    }
  }
}

/**
 * Cycle Priority for Task Brief (Image 2)
 */
function cycleTaskDetailPriority(e) {
  if (e) e.stopPropagation();
  if (!_activeDetailTaskId) return;
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  if (!t) return;
  var order = ['low', 'medium', 'high'];
  var cur = (t.priority || 'medium').toLowerCase();
  var nextIdx = (order.indexOf(cur) + 1) % order.length;
  var next = order[nextIdx];
  saveTaskField(_activeDetailTaskId, 'priority', next);

  var pLabel = next === 'high' ? 'High' : (next === 'low' ? 'Low' : 'Medium');
  var pCls = next === 'high' ? 'priority-high' : (next === 'low' ? 'priority-low' : 'priority-medium');
  var pIconEl = document.querySelector('.tdm-priority-icon');
  if (pIconEl) {
    pIconEl.innerHTML = getPriorityIconSvg(next, 14);
    pIconEl.className = 'tdm-priority-icon ' + pCls;
  }
  var pTextEl = document.querySelector('.tdm-priority-text');
  if (pTextEl) {
    pTextEl.textContent = pLabel;
    pTextEl.className = 'tdm-priority-text ' + pCls;
  }
  var pBtn = document.querySelector('.tdm-priority-btn');
  if (pBtn) {
    pBtn.className = 'task-prop-pill-btn tdm-priority-btn ' + pCls;
  }
}

/**
 * Due Date change for Task Brief (Image 2)
 */
function handleTaskDetailDueChange(val) {
  if (!_activeDetailTaskId) return;
  saveTaskField(_activeDetailTaskId, 'due_date', val || null);
  var dueStr = formatTaskDueDateStr(val);
  var dueEl = document.getElementById('tdm-due');
  if (dueEl) dueEl.textContent = dueStr;
}

/**
 * Estimate editing for Task Brief (Image 2)
 */
function editTaskDetailEstimate(e) {
  if (e) e.stopPropagation();
  if (!_activeDetailTaskId) return;
  var t = _taskMap[_activeDetailTaskId];
  var currentEst = (t && t.estimate) || '';
  var newEst = (typeof prompt === 'function') ? prompt('Enter task estimate (e.g. 2h, 1d):', currentEst) : null;
  if (newEst !== null) {
    saveTaskField(_activeDetailTaskId, 'estimate', newEst.trim());
    var estValEl = document.querySelector('.tdm-estimate-val');
    if (estValEl) estValEl.textContent = newEst.trim() || 'Estimate';
  }
}

/**
 * Closes task detail modal
 */
function closeTaskDetail() {
  if (typeof document === 'undefined') return;
  var titleEl = document.getElementById('tdm-title');
  if (titleEl && _activeDetailTaskId) {
    var titleVal = (titleEl.textContent || '').trim();
    if (titleVal) {
      saveTaskField(_activeDetailTaskId, 'title', titleVal);
    }
  }
  saveActiveTaskBrief();
  var m = document.getElementById('task-detail-modal');
  if (m) m.style.display = 'none';
  var sMenu = document.querySelector('.tdm-status-dropdown');
  if (sMenu) sMenu.style.display = 'none';
  var aMenu = document.querySelector('.tdm-assignee-dropdown');
  if (aMenu) aMenu.style.display = 'none';
  _activeDetailTaskId = null;
}

/**
 * Deletes the active task being viewed in the task brief modal
 */
async function deleteActiveTask() {
  if (!_activeDetailTaskId || _isDeletingTask) return;
  var taskId = _activeDetailTaskId;
  _isDeletingTask = true;
  var taskBackup = _taskMap[taskId] || (_allLoadedTasks && _allLoadedTasks.find(function(t) { return String(t.id) === String(taskId); }));
  var confirmFn = (typeof showConfirmModal === 'function')
    ? showConfirmModal
    : async function(msg) { return (typeof confirm === 'function') ? confirm(msg) : true; };

  var confirmed = await confirmFn(
    'Are you sure you want to delete this task? This action cannot be undone.',
    'Delete Task'
  );
  if (!confirmed) return;

  // 1. Mark in session tombstone map so background queries never resurrect it
  _deletedTaskIds[String(taskId)] = true;

  // 2. Remove from local memory collections
  _allLoadedTasks = _allLoadedTasks.filter(function(t) { return String(t.id) !== String(taskId); });
  delete _taskMap[taskId];
  if (typeof window !== 'undefined' && window._taskMap) {
    delete window._taskMap[taskId];
  }

  // 3. Close detail modal immediately
  closeTaskDetail();

  // 4. Instantly remove card from DOM (Zero-latency optimistic UI)
  var cardEls = document.querySelectorAll('.task-card[data-task-id="' + taskId + '"], .task-card[data-drag-tid="' + taskId + '"]');
  cardEls.forEach(function(el) { el.remove(); });

  // 5. Update UI view in-memory without racing server query
  if (_tasksViewMode === 'board') {
    renderColumnsFromTasks(_allLoadedTasks);
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else {
    renderProjectsView();
  }

  if (typeof showToast === 'function') {
    showToast('Task deleted successfully', 'success');
  }

  // 6. Delete remotely from Supabase with rollback on server failure
  var client = getSupaClient();
  if (client && !String(taskId).startsWith('temp_')) {
    try {
      await client.delete('bb_tasks?id=eq.' + encodeURIComponent(taskId));
    } catch (err) {
      console.error('Failed to delete task from Supabase:', err);
      // Rollback optimistic deletion
      delete _deletedTaskIds[String(taskId)];
      if (taskBackup) {
        _allLoadedTasks.push(taskBackup);
        _taskMap[taskId] = taskBackup;
        if (typeof window !== 'undefined' && window._taskMap) {
          window._taskMap[taskId] = taskBackup;
        }
      }
      if (_tasksViewMode === 'board') {
        renderColumnsFromTasks(_allLoadedTasks);
      } else if (_tasksViewMode === 'mytasks') {
        renderMyTasksView();
      } else {
        renderProjectsView();
      }
      if (typeof showToast === 'function') {
        showToast('Failed to delete task from server: ' + (err.message || 'Network error') + '. Task restored.', 'error', 4500);
      }
      return;
    }
  }
}

/**
 * Updates task status from the member/NCO board
 * @param {string} id
 * @param {string} status
 * @param {string} dept
 */
async function memberUpdateTaskStatus(id, status, dept) {
  var client = getSupaClient();
  if (!client) return;
  try {
    await client.patch('bb_tasks?id=eq.' + id, { status: status });
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'task.status_update',
        targetType: 'task',
        targetId: id,
        details: { status: status, department: dept }
      });
    }
    // Update local cache
    if (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) {
      window._taskMap[id].status = status;
    }
    if (_taskMap[id]) _taskMap[id].status = status;
    var foundLoaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(id); });
    if (foundLoaded) foundLoaded.status = status;

    if (_tasksViewMode === 'mytasks') {
      renderMyTasksView();
    } else {
      await renderTasksBoard(dept || _currentDeptFilter);
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to update task status.', 'error');
    } else if (typeof alert === 'function') {
      alert('Failed to update.');
    }
  }
}

/**
 * Opens Create Task modal
 * @param {string} [defaultStatus='todo']
 */
function openCreateTaskModal(defaultStatus) {
  if (typeof document === 'undefined') return;
  if (!_activeProject || _activeProject.toLowerCase() === 'all' || _activeProject.toLowerCase() === 'all tasks') {
    if (typeof showToast === 'function') {
      showToast('Please select or create a project first before creating tasks.', 'warning');
    }
    setTasksViewMode('projects');
    return;
  }

  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('data-target-status', defaultStatus || 'todo');

  var targetDept = 'general';
  if (_activeProject) {
    var pLower = _activeProject.toLowerCase().trim();
    if (DEPT_CONFIG[pLower]) {
      targetDept = pLower;
    } else {
      Object.keys(DEPT_CONFIG).forEach(function(k) {
        if (DEPT_CONFIG[k].label.toLowerCase() === pLower) targetDept = k;
      });
    }
  }
  var deptInput = modal.querySelector('.new-task-dept-input');
  if (deptInput) deptInput.value = targetDept;

  var projInput = modal.querySelector('.new-task-project-input');
  if (projInput) {
    projInput.value = _activeProject;
  }

  var projDisplay = modal.querySelector('.new-task-project-name-text');
  if (projDisplay) {
    projDisplay.textContent = _activeProject || 'General Project';
  }

  loadNewTaskAssigneeOptions();
}

/**
 * Closes Create Task modal
 */
function closeCreateTaskModal() {
  if (typeof document === 'undefined') return;
  var modal = document.querySelector('.task-create-modal');
  if (modal) {
    modal.style.display = 'none';
    var dEl = modal.querySelector('.new-task-desc-input');
    if (dEl && dEl.isContentEditable) dEl.innerHTML = '';
  }
}

/**
 * Loads department member options into Create Task modal assignee dropdown
 * @param {string} dept
 */
async function loadNewTaskAssigneeOptions() {
  if (typeof document === 'undefined') return;
  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  var sel = modal.querySelector('.new-task-assignee-input');
  if (!sel) return;

  var membersMap = {};
  var myName = (typeof sessionGet === 'function') ? sessionGet('name') : '';
  if (!myName && typeof document !== 'undefined') {
    var sbName = document.getElementById('sidebar-user-name');
    if (sbName && sbName.textContent && sbName.textContent.trim() !== 'Member') {
      myName = sbName.textContent.trim();
    }
  }
  if (myName) {
    membersMap[myName] = { name: myName, ic: (typeof sessionGet === 'function' ? sessionGet('ic') : '') || '' };
  }
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && isMemberDepartmentRole(m)) membersMap[m.name] = m;
    });
  }
  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name !== 'Unassigned') {
      if (!membersMap[t.assignee_name]) {
        membersMap[t.assignee_name] = { name: t.assignee_name, ic: t.assignee_ic || '' };
      }
    }
  });

  var renderSelect = function(map) {
    sel.innerHTML = '<option value="">Unassigned</option>';
    Object.keys(map).sort().forEach(function(k) {
      var m = map[k];
      var opt = document.createElement('option');
      opt.value = m.ic || m.name;
      opt.setAttribute('data-name', m.name);
      opt.textContent = m.name;
      sel.appendChild(opt);
    });
  };

  renderSelect(membersMap);

  var client = getSupaClient();
  if (client) {
    try {
      var fetchPromise = client.get('bb_members?select=ic,name,rank,department&order=name.asc');
      var timeoutPromise = new Promise(function(resolve) { setTimeout(function() { resolve([]); }, 2000); });
      var members = await Promise.race([fetchPromise, timeoutPromise]);
      if (Array.isArray(members) && members.length) {
        var eligible = members.filter(isMemberDepartmentRole);
        _cachedDepartmentMembers = eligible;
        eligible.forEach(function(m) {
          if (m && m.name) membersMap[m.name] = m;
        });
        renderSelect(membersMap);
      }
    } catch (e) {
      console.warn('loadNewTaskAssigneeOptions error:', e);
    }
  }
}

/**
 * Handles Create Task form submission
 * @param {Event} e
 */
async function handleCreateTaskSubmit(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;
  if (_isSubmittingTask) return;

  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;

  var submitBtn = modal.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  _isSubmittingTask = true;

  var titleEl    = modal.querySelector('.new-task-title-input');
  var deptEl     = modal.querySelector('.new-task-dept-input');
  var assEl      = modal.querySelector('.new-task-assignee-input');
  var priorityEl = modal.querySelector('.new-task-priority-input');
  var dueEl      = modal.querySelector('.new-task-due-input');
  var estEl      = modal.querySelector('.new-task-estimate-input');
  var projEl     = modal.querySelector('.new-task-project-input');
  var descEl     = modal.querySelector('.new-task-desc-input');

  var rawTitle = titleEl ? titleEl.value.trim() : '';
  var title = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 200) : rawTitle;
  if (!title) {
    if (typeof showToast === 'function') showToast('Please enter a task title.', 'warning');
    return;
  }

  var matchedDept = 'general';
  if (projectName) {
    var prjLower = projectName.toLowerCase().trim();
    if (DEPT_CONFIG[prjLower]) {
      matchedDept = prjLower;
    } else {
      Object.keys(DEPT_CONFIG).forEach(function(k) {
        if (DEPT_CONFIG[k].label.toLowerCase() === prjLower) matchedDept = k;
      });
    }
  }
  var dept = (deptEl && deptEl.value && deptEl.value !== 'logistics') ? deptEl.value : matchedDept;
  var assigneeIc = assEl ? assEl.value : '';
  var assigneeName = (assEl && assEl.selectedIndex >= 0 && assEl.options[assEl.selectedIndex].text) || '';
  if (assigneeName === 'Unassigned') assigneeName = '';

  var priority = priorityEl ? priorityEl.value : 'medium';
  var due = dueEl ? dueEl.value : null;
  var estimate = estEl ? estEl.value.trim() : '';
  var projectName = _activeProject || (projEl ? projEl.value.trim() : '');
  if (!projectName || projectName.toLowerCase() === 'all' || projectName.toLowerCase() === 'all tasks') {
    if (typeof showToast === 'function') {
      showToast('Tasks must belong to a project. Please select or create a project first.', 'warning');
    }
    setTasksViewMode('projects');
    return;
  }
  var rawDesc = descEl ? (descEl.isContentEditable ? descEl.innerHTML.trim() : descEl.value.trim()) : '';
  var desc = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
  var targetStatus = modal.getAttribute('data-target-status') || 'todo';
  var fullDesc = buildTaskDescriptionWithMeta({ project_name: projectName, estimate: estimate }, desc);

  // 1. INSTANT OPTIMISTIC CREATION (< 10ms)
  var tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var myName = (typeof sessionGet === 'function') ? sessionGet('name') : '';
  var myIc = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  if (!myName && typeof sessionGet === 'function') {
    var sEmail = sessionGet('email');
    if (sEmail && sEmail.toLowerCase() === 'jeshuakoh2008@gmail.com') myName = 'Jeshua Koh';
  }
  var localTask = {
    id: tempId,
    title: title,
    description: fullDesc,
    department: dept,
    priority: priority,
    due_date: due || null,
    assignee_name: assigneeName || null,
    assignee_ic: assigneeIc || null,
    creator_name: myName || 'Jeshua Koh',
    creator_ic: myIc || '',
    estimate: estimate,
    project_name: projectName,
    status: targetStatus,
    created_at: new Date().toISOString()
  };

  _allLoadedTasks.push(localTask);
  _taskMap[tempId] = localTask;
  if (typeof window !== 'undefined' && window._taskMap) {
    window._taskMap[tempId] = localTask;
  }

  if (projectName && _companyProjects.indexOf(projectName) === -1) {
    _companyProjects.push(projectName);
    saveProjectsCatalog();
  }

  // Close modal and clear inputs immediately (< 15ms)
  closeCreateTaskModal();
  if (titleEl) titleEl.value = '';
  if (descEl) { if (descEl.isContentEditable) descEl.innerHTML = ''; else descEl.value = ''; }
  if (dueEl) dueEl.value = '';
  if (estEl) estEl.value = '';
  if (projEl) projEl.value = '';

  // Immediately render active view with zero network latency (< 25ms)
  if (_tasksViewMode === 'board') {
    if (_projectDisplayMode === 'list') {
      renderTasksListView(_activeProject);
    } else {
      renderTasksBoard(_activeProject);
    }
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else {
    renderProjectsView();
  }

  if (typeof showToast === 'function') {
    showToast('Task created!', 'success', 1500);
  }

  // 2. BACKGROUND REMOTE ASYNC PERSISTENCE
  var client = getSupaClient();
  if (client) {
    (async function() {
      try {
        var payload = {
          title: title,
          description: fullDesc,
          department: dept,
          priority: priority,
          due_date: due || null,
          assignee_name: assigneeName || null,
          creator_name: localTask.creator_name || 'Jeshua Koh',
          status: targetStatus,
          created_at: localTask.created_at
        };
        if (localTask.creator_ic) payload.creator_ic = localTask.creator_ic;
        if (projectName) payload.project_name = projectName;
        if (estimate) payload.estimate = estimate;
        if (assigneeIc) payload.assignee_ic = assigneeIc;

        var inserted;
        try {
          inserted = await client.post('bb_tasks', payload);
        } catch (postErr) {
          var errStr = postErr ? (postErr.message || String(postErr)) : '';
          if (errStr.indexOf('column') !== -1 || postErr.code === 'PGRST204' || errStr.indexOf('project_name') !== -1 || errStr.indexOf('estimate') !== -1 || errStr.indexOf('assignee_ic') !== -1) {
            var fallbackPayload = {
              title: payload.title,
              description: payload.description,
              department: payload.department,
              priority: payload.priority,
              due_date: payload.due_date,
              assignee_name: payload.assignee_name,
              status: payload.status,
              created_at: payload.created_at
            };
            var extraDetails = [];
            if (projectName) extraDetails.push('Project: ' + projectName);
            if (estimate) extraDetails.push('Estimate: ' + estimate);
            if (extraDetails.length) {
              fallbackPayload.description = (fallbackPayload.description ? fallbackPayload.description + '\n\n' : '') + '[' + extraDetails.join(' | ') + ']';
            }
            inserted = await client.post('bb_tasks', fallbackPayload);
          } else {
            throw postErr;
          }
        }

        var saved = Array.isArray(inserted) && inserted[0] ? inserted[0] : null;
        if (saved && saved.id) {
          localTask.id = saved.id;
          delete _taskMap[tempId];
          _taskMap[saved.id] = localTask;
          if (typeof window !== 'undefined' && window._taskMap) {
            delete window._taskMap[tempId];
            window._taskMap[saved.id] = localTask;
          }
        } else if (!inserted) {
          throw new Error('Server returned empty task response');
        }
      } catch (err) {
        console.error('Failed to persist task in background:', err);
        // Optimistic update rollback: remove task from memory and re-render
        _allLoadedTasks = _allLoadedTasks.filter(function(x) { return x.id !== tempId; });
        delete _taskMap[tempId];
        if (typeof window !== 'undefined' && window._taskMap) {
          delete window._taskMap[tempId];
        }
        if (_tasksViewMode === 'board') {
          if (_projectDisplayMode === 'list') {
            renderTasksListView(_activeProject);
          } else {
            renderTasksBoard(_activeProject);
          }
        } else if (_tasksViewMode === 'mytasks') {
          renderMyTasksView();
        } else {
          renderProjectsView();
        }
        if (typeof showToast === 'function') {
          showToast('Failed to save task to server: ' + (err.message || 'Connection lost') + '. Changes rolled back.', 'error', 4500);
        }
      } finally {
        _isSubmittingTask = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    })();
  } else {
    _isSubmittingTask = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ── Admin Tasks Controllers ────────────────────────────────────────────────

/**
 * Switches the active department filter in Admin Tasks panel
 * @param {string} dept ('all' | 'logistics' | 'secretariat' | 'media')
 */
function switchDeptTab(dept) {
  if (typeof document === 'undefined') return;
  ['all', 'secretariat', 'logistics', 'media', 'hq', 'officers'].forEach(function(d) {
    var btn = document.getElementById('dtab-' + d) || document.querySelector('[data-dept="' + d + '"]');
    if (!btn) return;
    var active = d === dept;
    btn.classList.toggle('active-dept-tab', active);
    if (d !== 'all') {
      var cfg = DEPT_CONFIG[d];
      btn.style.background = active && cfg ? cfg.color + '33' : 'transparent';
    }
  });
  renderAdminTasks(dept);
}

/**
 * Toggles visibility of the Admin Add/Edit Task form
 */
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

/**
 * Loads department member options for task assignee assignment
 */
async function loadAssigneeOptions() {
  if (typeof document === 'undefined') return;
  var dept = (document.getElementById('task-dept') || {}).value || '';
  var sel  = document.getElementById('task-assignee');
  if (!sel) return;
  sel.innerHTML = '<option value="">Unassigned</option>';
  if (!dept) return;

  var client = getSupaClient();
  if (!client) return;
  try {
    var members = await client.get('bb_members?department=eq.' + dept + '&select=ic,name&order=name');
    if (Array.isArray(members)) {
      members.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.ic;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('loadAssigneeOptions error:', e);
  }
}

/**
 * Saves a new task or updates an existing task from Admin panel
 */
async function saveTask() {
  if (typeof document === 'undefined') return;
  var rawTitle = ((document.getElementById('task-title') || {}).value || '').trim();
  var rawDesc  = (typeof reGetValue === 'function') ? (reGetValue('task-desc') || '') : '';
  var title    = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 200) : rawTitle;
  var desc     = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
  var dept     = (document.getElementById('task-dept') || {}).value || '';
  var priority = (document.getElementById('task-priority') || {}).value || 'medium';
  var due      = (document.getElementById('task-due') || {}).value || '';
  var editId   = (document.getElementById('task-edit-id') || {}).value || '';

  if (!title) {
    if (typeof showToast === 'function') {
      showToast('Please enter a task title.', 'warning');
    } else if (typeof alert === 'function') {
      alert('Please enter a task title.');
    }
    return;
  }
  if (!dept) {
    if (typeof showToast === 'function') {
      showToast('Please select a department.', 'warning');
    } else if (typeof alert === 'function') {
      alert('Please select a department.');
    }
    return;
  }

  var assigneeSel = document.getElementById('task-assignee');
  var selected    = (assigneeSel && assigneeSel.selectedOptions)
    ? Array.from(assigneeSel.selectedOptions).filter(function(o) { return o.value; })
    : [];
  var assigneeIc  = selected.map(function(o) { return o.value; }).join(',');
  var assigneeName = selected.map(function(o) { return o.text; }).join(', ');

  var payload = {
    title: title,
    description: desc,
    department: dept,
    priority: priority,
    due_date: due || null,
    assignee_name: assigneeName || null,
    assignee_ic: assigneeIc || null
  };

  if (!editId) {
    payload.created_at = new Date().toISOString();
    payload.status = 'todo';
    payload.creator_name = (typeof sessionGet === 'function' && sessionGet('name')) || 'Jeshua Koh';
  }

  var client = getSupaClient();
  if (!client) return;
  try {
    if (editId) {
      await client.patch('bb_tasks?id=eq.' + editId, payload);
      if (typeof showToast === 'function') showToast('Task updated successfully!', 'success');
      else if (typeof alert === 'function') alert('\u2705 Task updated!');
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.edit',
          targetType: 'task',
          targetId: editId,
          details: { title: title, department: dept }
        });
      }
    } else {
      await client.post('bb_tasks', payload);
      if (typeof showToast === 'function') showToast('Task added successfully!', 'success');
      else if (typeof alert === 'function') alert('\u2705 Task added!');
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.create',
          targetType: 'task',
          targetId: title,
          details: { title: title, department: dept }
        });
      }
    }
    clearTaskForm();
    var body = document.getElementById('task-form-body');
    if (body && body.style.display !== 'none') toggleTaskForm();
    renderAdminTasks(_adminTaskFilter);
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed: ' + e.message, 'error');
    } else if (typeof alert === 'function') {
      alert('Failed: ' + e.message);
    }
  }
}

/**
 * Resets Admin Task form fields
 */
function clearTaskForm() {
  if (typeof document === 'undefined') return;
  ['task-title', 'task-due', 'task-edit-id'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof reClearValue === 'function') reClearValue('task-desc');

  var td = document.getElementById('task-dept');     if (td) td.value = '';
  var tp = document.getElementById('task-priority'); if (tp) tp.value = 'medium';
  var ta = document.getElementById('task-assignee'); if (ta) ta.innerHTML = '<option value="" disabled>Select dept first...</option>';
  var tl = document.getElementById('task-form-toggle-label'); if (tl) tl.textContent = '+ Add New Task';
}

/**
 * Renders the Admin task management table/feed
 * @param {string} [filter='all']
 */
async function renderAdminTasks(filter) {
  if (typeof document === 'undefined') return;
  _adminTaskFilter = filter || 'all';
  var SC = { todo: 'var(--text-secondary)', inprogress: 'var(--brand-blue)', done: 'var(--green)' };
  var SL = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
  var list = document.getElementById('admin-tasks-list');
  if (!list) return;

  list.innerHTML = (typeof renderSkeletonKanban === 'function') ? renderSkeletonKanban() : '<div class="skeleton-shimmer" style="height:220px;border-radius:8px;"></div>';
  var client = getSupaClient();
  if (!client) return;

  try {
    var url = _adminTaskFilter === 'all'
      ? 'bb_tasks?select=*&order=created_at.desc'
      : 'bb_tasks?department=eq.' + _adminTaskFilter + '&order=created_at.desc';

    _allAdminTasks = await client.get(url);
    if (!_allAdminTasks || !_allAdminTasks.length) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No tasks yet.</div>';
      return;
    }

    var html = '';
    _allAdminTasks.forEach(function(t) {
      var dept = DEPT_CONFIG[t.department] || { label: t.department || '', cls: '' };
      var pc   = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';

      var statusBtns = Object.keys(SL).map(function(s) {
        var a = s === t.status;
        return '<button data-tid="' + t.id + '" data-ts="' + s + '" style="padding:4px 10px;border:1.5px solid ' + (a ? SC[s] : 'var(--border-card)') + ';border-radius:6px;background:' + (a ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (a ? SC[s] : 'var(--text-secondary)') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-headline);">' + SL[s] + '</button>';
      }).join('');

      var descText = t.description || '';
      var descFormatted = descText
        ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">' + ((typeof sanitizeHtml === 'function') ? sanitizeHtml(descText) : (typeof escapeHtml === 'function' ? escapeHtml(descText) : descText)) + '</div>'
        : '';

      html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
        + '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);flex:1;">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
        + '<span class="dept-badge ' + dept.cls + '" style="font-size:10px;flex-shrink:0;">' + (typeof escapeHtml === 'function' ? escapeHtml(dept.label) : dept.label) + '</span></div>'
        + descFormatted
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'
        + '<span class="task-pill ' + pc + '">' + (t.priority || 'medium') + '</span>'
        + (t.assignee_name ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' + (typeof escapeHtml === 'function' ? escapeHtml(t.assignee_name) : t.assignee_name) + '</span>' : '')
        + (t.due_date ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' + new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span>' : '')
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' + statusBtns
        + '<button data-edit-tid="' + t.id + '" title="Edit Task" style="margin-left:auto;background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>'
        + '<button data-del-tid="' + t.id + '" title="Delete Task" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
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
    list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Failed to load tasks.</div>';
  }
}

/**
 * Updates task status from Admin panel
 * @param {string} id
 * @param {string} status
 */
async function updateTaskStatus(id, status) {
  var client = getSupaClient();
  if (!client) return;
  try {
    await client.patch('bb_tasks?id=eq.' + id, { status: status });
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'task.status_update',
        targetType: 'task',
        targetId: id,
        details: { status: status }
      });
    }
    renderAdminTasks(_adminTaskFilter);
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to update status: ' + e.message, 'error');
    } else if (typeof alert === 'function') {
      alert('Failed to update status.');
    }
  }
}

/**
 * Populates form with existing task data for editing
 * @param {string} id
 */
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
  if (tt) tt.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Deletes a task from Supabase
 * @param {string} id
 */
async function deleteTask(id) {
  var ok = (typeof showConfirmModal === 'function')
    ? await showConfirmModal('Delete this task?')
    : (typeof confirm === 'function' ? confirm('Delete this task?') : true);
  if (!ok) return;

  var client = getSupaClient();
  if (!client) return;
  try {
    _deletedTaskIds[String(id)] = true;
    _allLoadedTasks = _allLoadedTasks.filter(function(t) { return String(t.id) !== String(id); });
    delete _taskMap[id];
    if (typeof window !== 'undefined' && window._taskMap) {
      delete window._taskMap[id];
    }
    await client.delete('bb_tasks?id=eq.' + id);
    renderAdminTasks(_adminTaskFilter);
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'task.delete',
        targetType: 'task',
        targetId: id
      });
    }
    if (typeof showToast === 'function') {
      showToast('Task deleted successfully.', 'success');
    } else if (typeof alert === 'function') {
      alert('Task deleted successfully.');
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to delete task.', 'error');
    } else if (typeof alert === 'function') {
      alert('Failed to delete task.');
    }
  }
}

// ── Global and Module Exports ──────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEPT_CONFIG                = DEPT_CONFIG;
  window._activeTasksSection        = _activeTasksSection;
  window._tasksViewMode             = _tasksViewMode;
  window._projectDisplayMode        = _projectDisplayMode;
  window._currentDeptFilter         = _currentDeptFilter;
  window.setProjectDisplayMode      = setProjectDisplayMode;
  window.renderTasksListView        = renderTasksListView;
  window._taskSearchQuery           = _taskSearchQuery;
  window._allLoadedTasks            = _allLoadedTasks;
  window._adminTaskFilter           = _adminTaskFilter;
  window._allAdminTasks             = _allAdminTasks;
  window._taskMap                   = _taskMap;
  window.checkIsNCO                 = checkIsNCO;
  window.switchTaskTab              = switchTaskTab;
  window.normalizeTaskStatus        = normalizeTaskStatus;
  window.switchTaskSectionView      = switchTaskSectionView;
  window.checkTasksAccess           = checkTasksAccess;
  window.setTasksViewMode           = setTasksViewMode;
  window.changeTaskDeptFilter       = changeTaskDeptFilter;
  window.filterProjectTasks         = filterProjectTasks;
  window.renderTasksBoard           = renderTasksBoard;
  window.setupKanbanDragAndDrop     = setupKanbanDragAndDrop;
  window.renderMyTasksView          = renderMyTasksView;
  window.handleMyTasksSearchInput   = handleMyTasksSearchInput;
  window.fetchRemoteTaskComments    = fetchRemoteTaskComments;
  window.fetchAllRemoteTaskComments = fetchAllRemoteTaskComments;
  window.toggleMyTasksScope         = toggleMyTasksScope;
  window.toggleMyTasksStatus        = toggleMyTasksStatus;
  window.toggleTaskCheckbox         = toggleTaskCheckbox;
  window.openTaskDetail             = openTaskDetail;
  window.closeTaskDetail            = closeTaskDetail;
  window.memberUpdateTaskStatus     = memberUpdateTaskStatus;
  window.openCreateTaskModal        = openCreateTaskModal;
  window.closeCreateTaskModal       = closeCreateTaskModal;
  window.loadNewTaskAssigneeOptions = loadNewTaskAssigneeOptions;
  window.handleCreateTaskSubmit     = handleCreateTaskSubmit;
  window.switchDeptTab              = switchDeptTab;
  window.toggleTaskForm             = toggleTaskForm;
  window.loadAssigneeOptions        = loadAssigneeOptions;
  window.saveTask                   = saveTask;
  window.clearTaskForm              = clearTaskForm;
  window.renderAdminTasks           = renderAdminTasks;
  window.updateTaskStatus           = updateTaskStatus;
  window.editAdminTask              = editAdminTask;
  window.deleteTask                 = deleteTask;
  window.previewTasksBoardDemo      = previewTasksBoardDemo;
  window.filterProjectsList         = filterProjectsList;
  window.openAddProjectModal        = openAddProjectModal;
  window.renderProjectsView         = renderProjectsView;
  window.openProjectBoard           = openProjectBoard;
  window.formatTaskId               = formatTaskId;
  window.getTaskDueBadgeClass       = getTaskDueBadgeClass;
  window.saveTaskField              = saveTaskField;
  window.toggleTaskDetailStatusMenu = toggleTaskDetailStatusMenu;
  window.selectTaskDetailStatus     = selectTaskDetailStatus;
  window.toggleTaskDetailAssigneeMenu = toggleTaskDetailAssigneeMenu;
  window.selectTaskDetailAssignee   = selectTaskDetailAssignee;
  window.cycleTaskDetailPriority    = cycleTaskDetailPriority;
    window.openTaskDueDatePicker      = openTaskDueDatePicker;
    window.toggleMyTasksProjectDropdown = toggleMyTasksProjectDropdown;
    window.setMyTasksProjectFilter    = setMyTasksProjectFilter;
    window.formatTaskDueDateStr       = formatTaskDueDateStr;
    window.getPriorityIconSvg         = getPriorityIconSvg;
  window.handleTaskDetailDueChange  = handleTaskDetailDueChange;
  window.editTaskDetailEstimate     = editTaskDetailEstimate;
  window.handleTaskDetailDescChange = handleTaskDetailDescChange;
  window.saveActiveTaskBrief        = saveActiveTaskBrief;
  window.handleTaskTitleBlur        = handleTaskTitleBlur;
  window.handleTaskDescBlur         = handleTaskDescBlur;
  window.getTaskProjectName         = getTaskProjectName;
  window.saveProjectsCatalog        = saveProjectsCatalog;
  window.loadProjectsCatalog        = loadProjectsCatalog;
  window.isMemberDepartmentRole     = isMemberDepartmentRole;
  window.deleteActiveTask           = deleteActiveTask;
  window.deleteProject              = deleteProject;
  window.deleteActiveProject        = deleteActiveProject;
  window.formatTaskDesc             = formatTaskDesc;
  window.insertTaskDescLink         = insertTaskDescLink;
  window.addActiveTaskSubtask       = addActiveTaskSubtask;
  window.addActiveTaskLink          = addActiveTaskLink;
  window.handleTaskCommentSubmit    = handleTaskCommentSubmit;
  window.getTaskComments            = getTaskComments;
  window.saveTaskComments           = saveTaskComments;
  window.renderTaskComments         = renderTaskComments;
  window.handleTaskAttachmentUpload = handleTaskAttachmentUpload;
  window.getTaskAttachments         = getTaskAttachments;
  window.saveTaskAttachments        = saveTaskAttachments;
  window.renderTaskAttachments       = renderTaskAttachments;
  window.removeTaskAttachment       = removeTaskAttachment;
  window.getDepartmentMentionCandidates = getDepartmentMentionCandidates;
  window.handleTaskCommentInput     = handleTaskCommentInput;
  window.handleTaskBriefDescInput   = handleTaskBriefDescInput;
  window.handleTaskCommentKeyDown   = handleTaskCommentKeyDown;
  window.selectMentionCandidate     = selectMentionCandidate;
  window.formatCommentMentions      = formatCommentMentions;
  window.toggleTaskCommentMenu      = toggleTaskCommentMenu;
  window.startEditTaskComment       = startEditTaskComment;
  window.saveEditTaskComment        = saveEditTaskComment;
  window.cancelEditTaskComment      = cancelEditTaskComment;
  window.deleteTaskComment          = deleteTaskComment;
  window.isUserMentionedInComment   = isUserMentionedInComment;
  window.renderColumnsFromTasks     = renderColumnsFromTasks;
  window.getAssigneeAvatarHtml      = getAssigneeAvatarHtml;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAssigneeAvatarHtml,
    DEPT_CONFIG,
    _activeTasksSection,
    _tasksViewMode,
    _projectDisplayMode,
    _currentDeptFilter,
    _taskSearchQuery,
    _allLoadedTasks,
    _adminTaskFilter,
    _allAdminTasks,
    _taskMap,
    checkIsNCO,
    hasDepartmentRole,
    switchTaskTab,
  normalizeTaskStatus,
    switchTaskSectionView,
    checkTasksAccess,
    setTasksViewMode,
    changeTaskDeptFilter,
    filterProjectTasks,
    renderTasksBoard,
    setProjectDisplayMode,
    renderTasksListView,
    setupKanbanDragAndDrop,
    renderMyTasksView,
    handleMyTasksSearchInput,
    fetchRemoteTaskComments,
    fetchAllRemoteTaskComments,
    toggleMyTasksScope,
    toggleMyTasksStatus,
    toggleTaskCheckbox,
    openTaskDetail,
    closeTaskDetail,
    memberUpdateTaskStatus,
    openCreateTaskModal,
    closeCreateTaskModal,
    loadNewTaskAssigneeOptions,
    handleCreateTaskSubmit,
    switchDeptTab,
    toggleTaskForm,
    loadAssigneeOptions,
    saveTask,
    clearTaskForm,
    renderAdminTasks,
    updateTaskStatus,
    editAdminTask,
    deleteTask,
    previewTasksBoardDemo,
    filterProjectsList,
    openAddProjectModal,
    renderProjectsView,
    openProjectBoard,
    formatTaskId,
    getTaskDueBadgeClass,
    saveTaskField,
    toggleTaskDetailStatusMenu,
    selectTaskDetailStatus,
    toggleTaskDetailAssigneeMenu,
    selectTaskDetailAssignee,
    cycleTaskDetailPriority,
    openTaskDueDatePicker,
    getPriorityIconSvg,
    handleTaskDetailDueChange,
    editTaskDetailEstimate,
    handleTaskDetailDescChange,
    saveActiveTaskBrief,
    handleTaskTitleBlur,
    handleTaskDescBlur,
    getTaskProjectName,
    saveProjectsCatalog,
    loadProjectsCatalog,
    isMemberDepartmentRole,
    deleteActiveTask,
    deleteProject,
    deleteActiveProject,
    renderColumnsFromTasks,
    getTaskComments,
    saveTaskComments,
    renderTaskComments,
    handleTaskCommentSubmit,
    handleTaskAttachmentUpload,
    getTaskAttachments,
    saveTaskAttachments,
    renderTaskAttachments,
    removeTaskAttachment,
    getDepartmentMentionCandidates,
    handleTaskCommentInput,
  handleTaskBriefDescInput,
    handleTaskCommentKeyDown,
    selectMentionCandidate,
    formatCommentMentions,
    toggleTaskCommentMenu,
    startEditTaskComment,
    saveEditTaskComment,
    cancelEditTaskComment,
    deleteTaskComment,
    isUserMentionedInComment
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('.tb-comment-actions')) {
      var commentMenus = document.querySelectorAll('.tb-comment-dropdown');
      commentMenus.forEach(function(m) { m.style.display = 'none'; });
    }
    if (!e.target.closest || (!e.target.closest('.task-prop-pill-wrapper') && !e.target.closest('.my-tasks-project-filter-wrap'))) {
      var pMenu = document.querySelector('.my-tasks-project-dropdown');
      if (pMenu) pMenu.style.display = 'none';
      var sMenu = document.querySelector('.tdm-status-dropdown');
      if (sMenu) sMenu.style.display = 'none';
      var aMenu = document.querySelector('.tdm-assignee-dropdown');
      if (aMenu) aMenu.style.display = 'none';
    }
  });
}
