/**
 * 1st Petaling Jaya Boys' Brigade Portal - Tasks & Kanban Board Module (TSK-009)
 *
 * Implements NCO department project board, role-based NCO access checks (isNCO),
 * Kanban status transitions (To Do -> In Progress -> Done) with HTML5 drag-and-drop,
 * My Tasks view across projects, Task Brief/Detail modal inspection, dynamic task assignment
 * notifications, and Officer Admin task management (creation, rich description, assignee assignment, deletion).
 * Renders in a dedicated Projects & Tasks view under #page-tasks.
 */

/* global supa, escapeHtml, sanitizeHtml, sanitizeText, sessionGet, sessionSet, showToast, showConfirmModal, isNCO, isNcoRank, reGetValue, reSetValue, reClearValue, syncTaskNotifications, verifyAdminSessionSync */

// ── Department Configuration ───────────────────────────────────────────────
var DEPT_CONFIG = {
  department_nco: { label: 'Department NCO', color: 'var(--accent)', cls: 'dept-nco', prefix: 'NCO' },
  secretariat:    { label: 'Secretariat',    color: '#ce93d8',      cls: 'dept-secretariat', prefix: 'SEC' },
  logistics:      { label: 'Logistics',      color: '#42a5f5',      cls: 'dept-logistics',   prefix: 'LOG' },
  media:          { label: 'Media',          color: '#ffb74d',      cls: 'dept-media',       prefix: 'MED' },
  hq:             { label: 'HQ',             color: '#10b981',      cls: 'dept-hq',          prefix: 'HQ'  }
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
var _activeProject      = '';
var _companyProjects    = [];
var _activeDetailTaskId = null;
var _justDragged = false;
var _draggedTaskId = null;
var _cachedDepartmentMembers = [];
var _currentDeptFilter  = 'all';
var _taskSearchQuery    = '';
var _myTasksScopeFilter = 'me';     // 'me' | 'all'
var _myTasksStatusFilter = 'open';  // 'open' | 'all'
var _allLoadedTasks     = [];
var _adminTaskFilter    = 'all';
var _allAdminTasks      = [];
var _taskMap            = {};
var _deletedTaskIds    = {};

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

  // 1. Department NCO assignment (and legacy backward-compatibility)
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

  // 2. Officer privilege (Officers retain supervisory oversight over all projects & tasks)
  if (rk) {
    var officerRanks = ['Officer', 'Lieutenant', 'Captain', 'Chaplain', 'Honorary Captain'];
    if (officerRanks.indexOf(rk) !== -1) {
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
          + '<button class="submit-btn gold" onclick="switchTaskSectionView(\'parade\')"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back to Weekly Parade</button>';
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
      sessionSet('department', dept || '');
      if (rank) sessionSet('rank', rank);
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

    if (dept && DEPT_CONFIG[dept.toLowerCase()]) {
      var cfg = DEPT_CONFIG[dept.toLowerCase()];
      var dt  = document.getElementById('tasks-dept-title');  if (dt) dt.textContent = cfg.label + ' Department';
      var ds  = document.getElementById('tasks-dept-sub');    if (ds) ds.textContent = 'Projects & Tasks';
      var db  = document.getElementById('tasks-dept-badge');
      if (db) db.innerHTML = '<span class="dept-badge ' + cfg.cls + '">' + cfg.label + '</span>';
      _currentDeptFilter = dept.toLowerCase();
    } else {
      var dtOff = document.getElementById('tasks-dept-title'); if (dtOff) dtOff.textContent = 'All Departments';
      var dsOff = document.getElementById('tasks-dept-sub');   if (dsOff) dsOff.textContent = 'Officer Oversight Board';
      var dbOff = document.getElementById('tasks-dept-badge');
      if (dbOff) dbOff.innerHTML = '<span class="dept-badge dept-hq">Officer Access</span>';
      _currentDeptFilter = 'all';
    }

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

  if (_tasksViewMode === 'projects') {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (noProjEl) noProjEl.style.display = 'none';
    if (myTasks) myTasks.style.display = 'none';
    if (projContainer) projContainer.style.display = 'block';
    if (delProjBtn) delProjBtn.style.display = 'none';
    if (addBtn) {
      addBtn.style.display = 'inline-flex';
      addBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> <span>Add Project</span>';
      addBtn.setAttribute('onclick', 'openAddProjectModal()');
    }
    if (searchBox) searchBox.style.display = 'none';
    if (sep) sep.style.display = 'none';
    if (cur) cur.style.display = 'none';
    renderProjectsView();
  } else if (_tasksViewMode === 'board') {
    var hasActiveProject = !!(_activeProject && _activeProject.toLowerCase() !== 'all tasks' && _activeProject.toLowerCase() !== 'all');

    if (hasActiveProject) {
      if (boardCol) boardCol.style.display = '';
      if (colTabs) colTabs.style.display = '';
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
      // No project selected: remove Planning, To Do, In Progress, In Review, Completed boxes
      if (boardCol) boardCol.style.display = 'none';
      if (colTabs) colTabs.style.display = 'none';
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
    +   '<p class="projects-overview-sub">Every project in your workspace. Select a project to view its Kanban board.</p>'
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
        if (t.assignee_name) assigneesMap[t.assignee_name] = true;
      });
      var assigneesList = Object.keys(assigneesMap);
      var avatarStackHtml = '<div class="project-assignees-stack">';
      assigneesList.slice(0, 4).forEach(function(name) {
        var initials = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        avatarStackHtml += '<span class="project-assignee-avatar" title="' + (typeof escapeHtml === 'function' ? escapeHtml(name) : name) + '">' + (typeof escapeHtml === 'function' ? escapeHtml(initials) : initials) + '</span>';
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
 * Generates formatted Task ID (e.g. LOG-101, TSK-42)
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

function getAssigneeAvatarBg(name) {
  if (!name || name === 'Unassigned') return 'var(--surface-tint-hover)';
  var palette = [
    '#be185d', // Berry pink/red (Image 3)
    '#0284c7', // Ocean blue (ILLU-290)
    '#059669', // Emerald
    '#c2410c', // Dark amber/orange
    '#7c3aed', // Purple
    '#0f766e', // Teal
    '#4338ca'  // Indigo
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
      var pName = getTaskProjectName(t).toLowerCase();
      var deptName = (t.department || '').toLowerCase();
      var activeLower = _activeProject.toLowerCase();
      if (pName !== activeLower && deptName !== activeLower) return;
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
      var priorityChevron = '<span class="task-card-priority-chevron ' + chevronCls + '" title="' + priorityP.toUpperCase() + ' Priority">&#94;</span>';

      var avatarHtml = '';
      if (t.assignee_name && t.assignee_name !== 'Unassigned') {
        var initials = t.assignee_name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        var safeAssignee = (typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name) : t.assignee_name;
        var avatarBg = getAssigneeAvatarBg(t.assignee_name);
        avatarHtml = '<span class="task-card-avatar" style="background:' + avatarBg + ';" title="' + safeAssignee + '">' + (typeof escapeHtml === 'function' ? escapeHtml(initials) : initials) + '</span>';
      } else {
        avatarHtml = '<span class="task-card-avatar" style="background:var(--surface-tint-hover);color:var(--text-muted);" title="Unassigned">U</span>';
      }

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

async function renderTasksBoard(deptOrProject) {
  if (typeof document === 'undefined') return;

  if (deptOrProject && deptOrProject !== 'all' && deptOrProject !== 'all tasks') {
    if (DEPT_CONFIG[deptOrProject]) {
      _activeProject = DEPT_CONFIG[deptOrProject].label;
    } else {
      _activeProject = deptOrProject;
    }
  }

  var boardCol = document.getElementById('tasks-columns');
  var colTabs  = document.getElementById('task-col-tabs');
  var noProjEl = document.querySelector('.tasks-no-project-placeholder');

  var hasActiveProject = !!(_activeProject && _activeProject.toLowerCase() !== 'all tasks' && _activeProject.toLowerCase() !== 'all');
  if (!hasActiveProject) {
    if (boardCol) boardCol.style.display = 'none';
    if (colTabs) colTabs.style.display = 'none';
    if (noProjEl) noProjEl.style.display = 'block';
    return;
  }

  if (boardCol) boardCol.style.display = '';
  if (colTabs) colTabs.style.display = '';
  if (noProjEl) noProjEl.style.display = 'none';

  var breadcrumbCur = document.getElementById('tasks-dept-title');
  if (breadcrumbCur) {
    breadcrumbCur.textContent = _activeProject;
  }

  // 1. Instant synchronous render from local cache (< 2ms)
  renderColumnsFromTasks(_allLoadedTasks);

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

        renderColumnsFromTasks(_allLoadedTasks);

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
          targetColBody.appendChild(cardEl);
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
    + '<div class="my-tasks-header-bar">'
    +   '<div class="my-tasks-title-group">'
    +     '<h2>My Tasks</h2>'
    +     '<p>Assigned to you, across all projects.</p>'
    +   '</div>'
    +   '<button type="button" class="task-primary-btn" onclick="openCreateTaskModal()">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    +     '<span>Add Task</span>'
    +   '</button>'
    + '</div>'
    + '<div class="my-tasks-filters-bar">'
    +   '<button type="button" class="filter-chip' + (_myTasksScopeFilter === 'me' ? ' active' : '') + '" onclick="toggleMyTasksScope()">'
    +     'Scope is: <strong>' + (_myTasksScopeFilter === 'me' ? 'Assigned to me' : 'All Tasks') + '</strong>'
    +   '</button>'
    +   '<button type="button" class="filter-chip' + (_myTasksStatusFilter === 'open' ? ' active' : '') + '" onclick="toggleMyTasksStatus()">'
    +     'Status is: <strong>' + (_myTasksStatusFilter === 'open' ? 'Open' : 'All') + '</strong>'
    +   '</button>'
    + '</div>'
    + '<div class="my-tasks-table-container">'
    +   '<table class="my-tasks-table">'
    +     '<thead>'
    +       '<tr>'
    +         '<th style="width:36px;"></th>'
    +         '<th>Task</th>'
    +         '<th>Status</th>'
    +         '<th>Project</th>'
    +         '<th>ID</th>'
    +         '<th>Priority</th>'
    +         '<th>Assignee</th>'
    +         '<th>Due Date</th>'
    +         '<th>Estimate</th>'
    +       '</tr>'
    +     '</thead>'
    +     '<tbody>';

  if (!filtered.length) {
    html += '<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">'
      + 'No tasks found for your current filter criteria.</td></tr>';
  } else {
    filtered.forEach(function(t, idx) {
      var normStatus = normalizeTaskStatus(t.status);
      var isDone = normStatus === 'completed';
      var statusClass = STATUS_CONFIG[normStatus].cls;
      var statusLabel = STATUS_CONFIG[normStatus].label;
      var taskId = formatTaskId(t, idx);
      var projectName = t.project_name || (t.department && DEPT_CONFIG[t.department] ? (DEPT_CONFIG[t.department].label + ' Sprint') : 'General Task');

      var dueStr = '—';
      var isOverdue = false;
      if (t.due_date) {
        var d = new Date(t.due_date); d.setHours(0, 0, 0, 0);
        isOverdue = !isDone && d < today;
        dueStr = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
      }

      var priorityIcon = t.priority === 'high' ? '⌃ High' : (t.priority === 'low' ? '⌄ Low' : '— Med');
      var assigneeName = t.assignee_name || 'Unassigned';
      var initials = assigneeName.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var estimate = t.estimate || '—';

      html += '<tr class="my-tasks-row" data-row-tid="' + t.id + '">'
        + '<td>'
        +   '<input type="checkbox" class="my-tasks-checkbox" ' + (isDone ? 'checked ' : '') + 'onclick="toggleTaskCheckbox(\'' + t.id + '\', event)" aria-label="Toggle task completion" />'
        + '</td>'
        + '<td style="font-weight:600;color:var(--text-primary);' + (isDone ? 'text-decoration:line-through;color:var(--text-muted);' : '') + '">'
        +   escapeHtml(t.title)
        + '</td>'
        + '<td><span class="my-tasks-status-pill ' + statusClass + '">' + escapeHtml(statusLabel) + '</span></td>'
        + '<td><div class="my-tasks-project-cell"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>' + escapeHtml(projectName) + '</div></td>'
        + '<td><span class="task-id-badge">' + escapeHtml(taskId) + '</span></td>'
        + '<td style="font-size:11px;font-weight:600;">' + escapeHtml(priorityIcon) + '</td>'
        + '<td><div style="display:flex;align-items:center;gap:6px;"><span class="task-assignee-avatar" style="width:20px;height:20px;font-size:9px;">' + escapeHtml(initials) + '</span><span>' + escapeHtml(assigneeName) + '</span></div></td>'
        + '<td style="' + (isOverdue ? 'color:#ef4444;font-weight:700;' : '') + '"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + escapeHtml(dueStr) + '</td>'
        + '<td style="color:var(--text-secondary);font-size:12px;">' + escapeHtml(estimate) + '</td>'
        + '</tr>';
    });
  }

  html += '</tbody></table></div></div>';
  container.innerHTML = html;

  // Row click opens task detail modal
  container.querySelectorAll('.my-tasks-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      if (e.target.closest('.my-tasks-checkbox')) return;
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
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id] || {};
  _activeDetailTaskId = id;

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
  var initials = aName === 'Unassigned' ? 'U' : aName.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  var aAvatar = document.querySelector('.tdm-assignee-avatar');
  if (aAvatar) aAvatar.textContent = initials;
  set('tdm-assignee', aName);

  // Priority Pill matching Image 2
  var priorityVal = t.priority || 'medium';
  var pLabel = priorityVal.charAt(0).toUpperCase() + priorityVal.slice(1);
  var pIcon = priorityVal === 'high' ? '⌃' : (priorityVal === 'low' ? '⌄' : '—');
  var pIconEl = document.querySelector('.tdm-priority-icon');
  if (pIconEl) pIconEl.textContent = pIcon;
  var pTextEl = document.querySelector('.tdm-priority-text');
  if (pTextEl) pTextEl.textContent = pLabel;

  // Due Date Pill matching Image 2
  var dueStr = 'Due Date';
  if (t.due_date) {
    var d = new Date(t.due_date);
    dueStr = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
  }
  set('tdm-due', dueStr);
  var dueInput = document.querySelector('.tdm-due-input');
  if (dueInput && t.due_date) dueInput.value = t.due_date.split('T')[0];

  // Estimate Pill matching Image 2
  var estStr = t.estimate || 'Estimate';
  var estValEl = document.querySelector('.tdm-estimate-val');
  if (estValEl) estValEl.textContent = estStr;

  // Description: strip [Project: ...] tag for clean reading and editing
  var cleanDesc = (t.description || '').replace(/\s*\[Project:[^\]]*\]/gi, '').trim();
  var descEl = document.getElementById('tdm-desc');
  if (descEl) descEl.innerHTML = cleanDesc;

  var modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'block';
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
  saveTaskField(_activeDetailTaskId, 'description', val);
}

/**
 * Rich Text Editing Command Handler for Task Brief (Image 5)
 */
function formatTaskDesc(cmd, val) {
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

/**
 * Handles comment submit on task brief (Image 5)
 */
function handleTaskCommentSubmit(input) {
  if (!input || !input.value.trim()) return;
  var comment = input.value.trim();
  input.value = '';
  if (typeof showToast === 'function') {
    showToast('Comment posted: ' + (comment.length > 25 ? comment.slice(0, 25) + '...' : comment), 'info', 1200);
  }
}

/**
 * Handles task attachment upload (Image 5)
 */
function handleTaskAttachmentUpload(event) {
  var files = event && event.target && event.target.files;
  if (files && files.length) {
    var fName = files[0].name;
    var dropzone = document.querySelector('.tb-dropzone');
    if (dropzone) {
      dropzone.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
        + '<span>Uploaded: <strong>' + (typeof escapeHtml === 'function' ? escapeHtml(fName) : fName) + '</strong></span>';
    }
    if (typeof showToast === 'function') {
      showToast('Attachment staged: ' + fName, 'success', 1500);
    }
  }
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
  var val = descEl ? descEl.textContent : '';
  saveTaskField(_activeDetailTaskId, 'description', val);
}

/**
 * Saves a specific field on active task instantly with optimistic update
 */
async function saveTaskField(id, field, value) {
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id];
  if (!t) return;
  t[field] = value;
  var loaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(id); });
  if (loaded) loaded[field] = value;

  // Optimistic updates on board
  if (_tasksViewMode === 'board') {
    renderColumnsFromTasks(_allLoadedTasks);
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  } else if (_tasksViewMode === 'projects') {
    renderProjectsView();
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
    var html = '<div class="task-prop-dropdown-item" onclick="selectTaskDetailAssignee(\'\', \'Unassigned\')">'
      + '<span class="task-card-avatar" style="width:20px;height:20px;font-size:9px;background:var(--surface-tint-hover);color:var(--text-muted);">U</span>'
      + '<span style="font-weight:600;">Unassigned</span></div>';

    list.sort(function(a, b) { return a.name.localeCompare(b.name); });
    list.forEach(function(m) {
      if (!m.name) return;
      var initials = m.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name) : m.name;
      var safeIc = (typeof escapeHtml === 'function') ? escapeHtml(m.ic || '') : (m.ic || '');
      var dTag = m.department ? (m.department.toLowerCase() === 'department nco' ? 'Department NCO' : m.department) : (m.rank || 'NCO');
      html += '<div class="task-prop-dropdown-item" onclick="selectTaskDetailAssignee(\'' + safeIc + '\', \'' + safeName + '\')">'
        + '<span class="task-card-avatar" style="width:20px;height:20px;font-size:9px;">' + initials + '</span>'
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
    var inits = !cleanName ? 'U' : cleanName.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    aAvatar.textContent = inits;
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
  var t = _taskMap[_activeDetailTaskId];
  if (!t) return;
  var order = ['low', 'medium', 'high'];
  var cur = (t.priority || 'medium').toLowerCase();
  var nextIdx = (order.indexOf(cur) + 1) % order.length;
  var next = order[nextIdx];
  saveTaskField(_activeDetailTaskId, 'priority', next);

  var pLabel = next.charAt(0).toUpperCase() + next.slice(1);
  var pIcon = next === 'high' ? '▲' : (next === 'low' ? '▼' : '—');
  var pIconEl = document.querySelector('.tdm-priority-icon');
  if (pIconEl) pIconEl.textContent = pIcon;
  var pTextEl = document.querySelector('.tdm-priority-text');
  if (pTextEl) pTextEl.textContent = pLabel;
}

/**
 * Due Date change for Task Brief (Image 2)
 */
function handleTaskDetailDueChange(val) {
  if (!_activeDetailTaskId) return;
  saveTaskField(_activeDetailTaskId, 'due_date', val);
  var d = new Date(val);
  var dueStr = val ? d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : 'Due Date';
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
  if (!_activeDetailTaskId) return;
  var taskId = _activeDetailTaskId;
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

  // 6. Delete remotely from Supabase
  var client = getSupaClient();
  if (client && !String(taskId).startsWith('temp_')) {
    try {
      await client.delete('bb_tasks?id=eq.' + encodeURIComponent(taskId));
    } catch (err) {
      console.warn('Failed to delete task from Supabase:', err);
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

  var deptInput = modal.querySelector('.new-task-dept-input');
  var currentDept = (deptInput && deptInput.value) || (_currentDeptFilter !== 'all' ? _currentDeptFilter : 'logistics');
  if (deptInput) deptInput.value = currentDept;

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
  if (modal) modal.style.display = 'none';
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

  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;

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

  var dept = deptEl ? deptEl.value : 'logistics';
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
  var rawDesc = descEl ? descEl.value.trim() : '';
  var desc = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
  var targetStatus = modal.getAttribute('data-target-status') || 'todo';

  // 1. INSTANT OPTIMISTIC CREATION (< 10ms)
  var tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var localTask = {
    id: tempId,
    title: title,
    description: desc,
    department: dept,
    priority: priority,
    due_date: due || null,
    assignee_name: assigneeName || null,
    assignee_ic: assigneeIc || null,
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
  if (descEl) descEl.value = '';
  if (dueEl) dueEl.value = '';
  if (estEl) estEl.value = '';
  if (projEl) projEl.value = '';

  // Immediately render active view with zero network latency (< 25ms)
  if (_tasksViewMode === 'board') {
    renderTasksBoard(_activeProject);
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
          description: desc,
          department: dept,
          priority: priority,
          due_date: due || null,
          assignee_name: assigneeName || null,
          status: targetStatus,
          created_at: localTask.created_at
        };
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
            console.warn('Task post error:', postErr);
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
        }
      } catch (err) {
        console.warn('Failed to persist task in background:', err);
      }
    })();
  }
}

// ── Admin Tasks Controllers ────────────────────────────────────────────────

/**
 * Switches the active department filter in Admin Tasks panel
 * @param {string} dept ('all' | 'logistics' | 'secretariat' | 'media')
 */
function switchDeptTab(dept) {
  if (typeof document === 'undefined') return;
  ['all', 'secretariat', 'logistics', 'media', 'hq'].forEach(function(d) {
    var btn = document.getElementById('dtab-' + d);
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
  }

  var client = getSupaClient();
  if (!client) return;
  try {
    if (editId) {
      await client.patch('bb_tasks?id=eq.' + editId, payload);
      if (typeof showToast === 'function') showToast('Task updated successfully!', 'success');
      else if (typeof alert === 'function') alert('\u2705 Task updated!');
    } else {
      await client.post('bb_tasks', payload);
      if (typeof showToast === 'function') showToast('Task added successfully!', 'success');
      else if (typeof alert === 'function') alert('\u2705 Task added!');
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
  window._currentDeptFilter         = _currentDeptFilter;
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
  window.handleTaskAttachmentUpload = handleTaskAttachmentUpload;
  window.renderColumnsFromTasks     = renderColumnsFromTasks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEPT_CONFIG,
    _activeTasksSection,
    _tasksViewMode,
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
    setupKanbanDragAndDrop,
    renderMyTasksView,
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
    renderColumnsFromTasks
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('.task-prop-pill-wrapper')) {
      var sMenu = document.querySelector('.tdm-status-dropdown');
      if (sMenu) sMenu.style.display = 'none';
      var aMenu = document.querySelector('.tdm-assignee-dropdown');
      if (aMenu) aMenu.style.display = 'none';
    }
  });
}
