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
  secretariat: { label: 'Secretariat', color: '#ce93d8', cls: 'dept-secretariat', prefix: 'SEC' },
  logistics:   { label: 'Logistics',   color: '#42a5f5', cls: 'dept-logistics',   prefix: 'LOG' },
  media:       { label: 'Media',       color: '#ffb74d', cls: 'dept-media',       prefix: 'MED' },
  hq:          { label: 'HQ',          color: '#10b981', cls: 'dept-hq',          prefix: 'HQ'  }
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
var _tasksViewMode      = 'board';  // 'board' | 'mytasks'
var _currentDeptFilter  = 'all';
var _taskSearchQuery    = '';
var _myTasksScopeFilter = 'me';     // 'me' | 'all'
var _myTasksStatusFilter = 'open';  // 'open' | 'all'
var _allLoadedTasks     = [];
var _adminTaskFilter    = 'all';
var _allAdminTasks      = [];
var _taskMap            = {};

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
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
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

  // 1. Valid department assignment: strictly Secretariat, Logistics, Media, or HQ
  if (dept) {
    var dKey = String(dept).toLowerCase().trim();
    if (dKey === 'secretariat' || dKey === 'logistics' || dKey === 'media' || dKey === 'hq') {
      return true;
    }
  }

  // 2. Officer privilege (Officers retain supervisory oversight over all departments)
  if (rk) {
    var officerRanks = ['Officer', 'Lieutenant', 'Captain', 'Chaplain', 'Honorary Captain'];
    if (officerRanks.indexOf(rk) !== -1) {
      return true;
    }
  }

  // 3. Officer Admin active session (only when checking current session, not an explicit member query)
  if (!explicitMember) {
    if (typeof verifyAdminSessionSync === 'function' && verifyAdminSessionSync()) {
      return true;
    }
    if (typeof sessionGet === 'function' && (sessionGet('adminAuthed') === true || sessionGet('isAdmin') === 'true')) {
      return true;
    }
  }

  // Regular members and NCOs (Lance Corporal, Corporal, Sergeant, Staff Sergeant, Warrant Officer)
  // WITHOUT an assigned department role CANNOT see or access Projects & Tasks
  return false;
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
    await renderTasksBoard(_currentDeptFilter);
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
  renderTasksBoard('all');
}

/**
 * Toggles view mode between Kanban Board ('board') and My Tasks Table ('mytasks')
 * @param {string} mode ('board' | 'mytasks')
 */
function setTasksViewMode(mode) {
  if (typeof document === 'undefined') return;
  _tasksViewMode = mode || 'board';

  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    var isTarget = btn.getAttribute('data-view') === _tasksViewMode;
    btn.classList.toggle('active', isTarget);
  });

  var colsWrap = document.getElementById('tasks-columns');
  var myTasksWrap = document.querySelector('.my-tasks-container');

  if (_tasksViewMode === 'board') {
    if (colsWrap) colsWrap.style.display = 'flex';
    if (myTasksWrap) myTasksWrap.style.display = 'none';
    renderTasksBoard(_currentDeptFilter);
  } else {
    if (colsWrap) colsWrap.style.display = 'none';
    if (myTasksWrap) myTasksWrap.style.display = 'block';
    renderMyTasksView();
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
  if (t && t.code) return String(t.code).toUpperCase();
  var prefix = (t && t.department && DEPT_CONFIG[t.department] && DEPT_CONFIG[t.department].prefix)
    ? DEPT_CONFIG[t.department].prefix
    : 'TSK';
  if (t && t.id && !isNaN(Number(t.id))) {
    return prefix + '-' + (100 + Number(t.id));
  }
  return prefix + '-' + (101 + (idx || 0));
}

/**
 * Renders the member Kanban columns (To Do, In Progress, Done) with drag-and-drop
 * @param {string} dept
 */
async function renderTasksBoard(dept) {
  if (typeof document === 'undefined') return;
  var cols = { planning: [], todo: [], inprogress: [], inreview: [], completed: [] };
  var client = getSupaClient();

  if (client) {
    try {
      var url = (dept && dept !== 'all')
        ? ('bb_tasks?department=eq.' + encodeURIComponent(dept) + '&order=created_at.desc')
        : 'bb_tasks?order=created_at.desc';
      var tasks = await client.get(url);
      if (Array.isArray(tasks)) {
        _allLoadedTasks = tasks;
        tasks.forEach(function(t) {
          var k = normalizeTaskStatus(t.status);
          cols[k].push(t);
        });

        // Trigger dynamic notification sync for assigned tasks
        if (typeof syncTaskNotifications === 'function') {
          syncTaskNotifications(tasks);
        } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function') {
          window.syncTaskNotifications(tasks);
        }
      }
    } catch (e) {
      console.error('renderTasksBoard error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);

  STATUS_ORDER.forEach(function(status) {
    var el   = getColBody(status);
    var cnt  = getColCount(status);
    var tcnt = getTabCount(status);

    // Filter by live search query if present
    var itemsInCol = cols[status] || [];
    var statusItems = itemsInCol.filter(function(t) {
      if (!_taskSearchQuery) return true;
      var matchTitle = (t.title || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchAss   = (t.assignee_name || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      return matchTitle || matchDesc || matchAss || matchId;
    });

    if (cnt) cnt.textContent = '(' + statusItems.length + ')';
    if (tcnt) tcnt.textContent = statusItems.length ? '(' + statusItems.length + ')' : '';
    if (!el) return;

    if (!statusItems.length) {
      var sConf = STATUS_CONFIG[status] || { label: status };
      el.innerHTML = '<div class="task-col-empty">'
        + '<div class="task-col-empty-icon">'
        +   '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>'
        + '</div>'
        + '<div class="task-col-empty-text">No tasks in ' + (typeof escapeHtml === 'function' ? escapeHtml(sConf.label) : sConf.label) + '</div>'
        + '<button type="button" class="task-col-empty-btn" onclick="openCreateTaskModal(\'' + escapeHtml(status) + '\')">'
        +   '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        +   '<span>Add Task</span>'
        + '</button>'
        + '</div>';
      return;
    }

    var html = '';
    statusItems.forEach(function(t, idx) {
      if (typeof window !== 'undefined' && window._taskMap) {
        window._taskMap[t.id] = t;
      }
      _taskMap[t.id] = t;

      var taskId = formatTaskId(t, idx);
      var pc = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
      var pl = (t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1);
      var dueHtml = '';

      if (t.due_date) {
        var due = new Date(t.due_date); due.setHours(0, 0, 0, 0);
        var overdue = status !== 'done' && due < today;
        dueHtml = '<span class="task-due-pill' + (overdue ? ' overdue' : '') + '">'
          + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
          + due.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) + '</span>';
      }

      var avatarHtml = '';
      if (t.assignee_name) {
        var initials = t.assignee_name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        avatarHtml = '<span class="task-assignee-avatar" title="' + (typeof escapeHtml === 'function' ? escapeHtml(t.assignee_name) : t.assignee_name) + '">' + escapeHtml(initials) + '</span>';
      }

      var projectTag = t.project_name || (t.department && DEPT_CONFIG[t.department] ? (DEPT_CONFIG[t.department].label + ' Sprint') : 'Company Project');

      var currentStatus = normalizeTaskStatus(t.status);
      var stBtns = '<div style="display:flex;gap:4px;margin-top:10px;overflow-x:auto;">';
      STATUS_ORDER.forEach(function(s) {
        var active = currentStatus === s;
        var sConf = STATUS_CONFIG[s];
        stBtns += '<button data-task-id="' + t.id + '" data-task-status="' + s + '" data-dept="' + (dept || '') + '" style="flex:1;padding:4px 3px;border:1px solid ' + (active ? sConf.color : 'var(--border-card)') + ';border-radius:6px;background:' + (active ? sConf.color + '22' : 'transparent') + ';color:' + (active ? sConf.color : 'var(--text-secondary)') + ';font-size:9px;font-weight:700;cursor:pointer;font-family:\'Oswald\',sans-serif;text-align:center;white-space:nowrap;">' + sConf.label + '</button>';
      });
      stBtns += '</div>';

      var descText = t.description || '';
      var descFormatted = descText
        ? '<div class="task-card-desc">' + ((typeof sanitizeHtml === 'function') ? sanitizeHtml(descText.length > 80 ? descText.slice(0, 80) + '\u2026' : descText) : (typeof escapeHtml === 'function' ? escapeHtml(descText) : descText)) + '</div>'
        : '';

      html += '<div class="task-card" draggable="true" data-drag-tid="' + t.id + '" data-task-open="' + t.id + '">'
        + '<div class="task-card-header">'
        +   '<div style="display:flex;align-items:center;">'
        +     '<span class="task-drag-handle" title="Drag to change column"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg></span>'
        +     '<span class="task-id-badge">' + escapeHtml(taskId) + '</span>'
        +   '</div>'
        +   '<span class="task-pill ' + pc + '" style="font-size:10px;padding:2px 6px;">' + pl + '</span>'
        + '</div>'
        + '<div class="task-card-title">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
        + '<span class="task-project-tag">' + escapeHtml(projectTag) + '</span>'
        + descFormatted
        + '<div class="task-card-footer">'
        +   dueHtml
        +   avatarHtml
        + '</div>'
        + stBtns
        + '</div>';
    });

    el.innerHTML = html;

    // Card click opens detail modal
    el.querySelectorAll('[data-task-open]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-task-id]') || e.target.closest('.task-drag-handle')) return;
        openTaskDetail(card.getAttribute('data-task-open'));
      });
    });

    // Inline status change buttons
    el.querySelectorAll('[data-task-id]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        memberUpdateTaskStatus(btn.getAttribute('data-task-id'), btn.getAttribute('data-task-status'), btn.getAttribute('data-dept'));
      });
    });
  });

  // Attach HTML5 Drag & Drop handlers
  setupKanbanDragAndDrop();
}

/**
 * Initializes HTML5 Drag and Drop across Kanban task cards and columns
 */
function setupKanbanDragAndDrop() {
  if (typeof document === 'undefined') return;

  var cards = document.querySelectorAll('.task-card[draggable="true"]');
  cards.forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      var tid = card.getAttribute('data-drag-tid');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', tid);
        e.dataTransfer.effectAllowed = 'move';
      }
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', function() {
      card.classList.remove('dragging');
      document.querySelectorAll('.task-col').forEach(function(col) {
        col.classList.remove('drag-over');
      });
    });
  });

  var columns = document.querySelectorAll('.task-col[data-col-status]');
  columns.forEach(function(col) {
    col.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', function() {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async function(e) {
      e.preventDefault();
      col.classList.remove('drag-over');
      var tid = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (!tid) return;

      var targetStatus = normalizeTaskStatus(col.getAttribute('data-col-status'));
      var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
      if (t && t.status !== targetStatus) {
        var statusLabels = { planning: 'Planning', todo: 'To Do', inprogress: 'In Progress', inreview: 'In Review', completed: 'Completed' };
        if (typeof showToast === 'function') {
          showToast('Moved to ' + statusLabels[targetStatus], 'info', 2000);
        }
        await memberUpdateTaskStatus(tid, targetStatus, _currentDeptFilter);
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

  var myIc = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  var myName = (typeof sessionGet === 'function') ? (sessionGet('name') || '') : '';

  // Filter tasks based on current filters and search query
  var filtered = _allLoadedTasks.filter(function(t) {
    if (_myTasksScopeFilter === 'me') {
      var isAssigned = (t.assignee_ic && myIc && t.assignee_ic.indexOf(myIc) !== -1)
        || (t.assignee_name && myName && t.assignee_name.toLowerCase().indexOf(myName.toLowerCase()) !== -1);
      if (!isAssigned) return false;
    }
    if (_myTasksStatusFilter === 'open' && t.status === 'done') {
      return false;
    }
    if (_currentDeptFilter !== 'all' && t.department !== _currentDeptFilter) {
      return false;
    }
    if (_taskSearchQuery) {
      var matchTitle = (t.title || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      if (!matchTitle && !matchDesc && !matchId) return false;
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
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id] || {};
  var set = function(elId, val) {
    var el = document.getElementById(elId);
    if (el) el.textContent = val;
  };
  set('tdm-title', t.title || '');

  // Update breadcrumbs matching Image 3
  var deptLabel = (t.department && DEPT_CONFIG[t.department]) ? DEPT_CONFIG[t.department].label : 'Department';
  var taskId = formatTaskId(t, 0);

  var deptBreadcrumb = document.querySelector('.task-brief-dept-name');
  if (deptBreadcrumb) deptBreadcrumb.textContent = deptLabel;
  var idLabel = document.querySelector('.task-brief-id-label');
  if (idLabel) idLabel.textContent = taskId;

  var descEl = document.getElementById('tdm-desc');
  if (descEl) {
    var desc = t.description || '';
    if (desc && desc.indexOf('<') !== -1) {
      descEl.innerHTML = (typeof sanitizeHtml === 'function') ? sanitizeHtml(desc) : desc;
    } else if (desc) {
      // Format line breaks, bullet points, and basic markdown tables
      var formatted = escapeHtml(desc)
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n- /g, '<br>&bull; ')
        .replace(/\n/g, '<br>');
      descEl.innerHTML = '<p>' + formatted + '</p>';
    } else {
      descEl.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">No detailed brief provided for this task.</span>';
    }
  }

  var pc = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
  var pl = (t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1);
  var currentStatus = normalizeTaskStatus(t.status);
  var sl = STATUS_CONFIG[currentStatus].label;
  var sc = STATUS_CONFIG[currentStatus].color;
  var dept = DEPT_CONFIG[t.department] || {};
  var meta = document.getElementById('tdm-meta');

  if (meta) {
    meta.innerHTML = '<span class="task-pill ' + pc + '">' + pl + '</span>'
      + '<span class="task-pill" style="background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;">' + sl + '</span>'
      + (dept.cls ? '<span class="dept-badge ' + dept.cls + '">' + (typeof escapeHtml === 'function' ? escapeHtml(dept.label) : dept.label) + '</span>' : '');
  }

  set('tdm-assignee', t.assignee_name || '\u2014');
  set('tdm-due', t.due_date ? new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014');

  var estChip = document.querySelector('.task-brief-estimate-chip');
  var estVal  = document.querySelector('.task-brief-estimate-val');
  if (estChip && estVal) {
    if (t.estimate) {
      estVal.textContent = t.estimate;
      estChip.style.display = 'inline-flex';
    } else {
      estChip.style.display = 'none';
    }
  }

  var btns = document.getElementById('tdm-status-btns');
  if (btns) {
    var statuses = [
      { key: 'todo',       label: 'To Do',       c: 'var(--text-muted)' },
      { key: 'inprogress', label: 'In Progress',  c: '#42a5f5' },
      { key: 'done',       label: 'Done',         c: '#66bb6a' }
    ];
    btns.innerHTML = statuses.map(function(s) {
      var active = t.status === s.key || (s.key === 'todo' && !t.status);
      return '<button data-tdm-status="' + s.key + '" data-tdm-id="' + id + '" data-tdm-dept="' + (t.department || '') + '" '
        + 'style="flex:1;padding:10px;border-radius:10px;border:1.5px solid ' + s.c + (active ? '' : '44') + ';background:' + s.c + (active ? '22' : '11') + ';'
        + 'color:' + s.c + ';font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;">'
        + s.label + '</button>';
    }).join('');

    btns.querySelectorAll('[data-tdm-status]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        memberUpdateTaskStatus(btn.getAttribute('data-tdm-id'), btn.getAttribute('data-tdm-status'), btn.getAttribute('data-tdm-dept'));
        closeTaskDetail();
      });
    });
  }

  var modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'block';
}

/**
 * Closes task detail modal
 */
function closeTaskDetail() {
  if (typeof document === 'undefined') return;
  var m = document.getElementById('task-detail-modal');
  if (m) m.style.display = 'none';
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
  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('data-target-status', defaultStatus || 'todo');

  var deptInput = modal.querySelector('.new-task-dept-input');
  var currentDept = (deptInput && deptInput.value) || (_currentDeptFilter !== 'all' ? _currentDeptFilter : 'logistics');
  if (deptInput) deptInput.value = currentDept;

  loadNewTaskAssigneeOptions(currentDept);
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
async function loadNewTaskAssigneeOptions(dept) {
  if (typeof document === 'undefined') return;
  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  var sel = modal.querySelector('.new-task-assignee-input');
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
    console.error('loadNewTaskAssigneeOptions error:', e);
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
  var projectName = projEl ? projEl.value.trim() : '';
  var rawDesc = descEl ? descEl.value.trim() : '';
  var desc = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
  var targetStatus = modal.getAttribute('data-target-status') || 'todo';

  // Canonical base payload conforming strictly to standard bb_tasks schema
  var payload = {
    title: title,
    description: desc,
    department: dept,
    priority: priority,
    due_date: due || null,
    assignee_name: assigneeName || null,
    status: targetStatus,
    created_at: new Date().toISOString()
  };

  // Defensively attach optional metadata fields
  if (projectName) payload.project_name = projectName;
  if (estimate) payload.estimate = estimate;
  if (assigneeIc) payload.assignee_ic = assigneeIc;

  var client = getSupaClient();
  if (!client) return;

  try {
    var inserted;
    try {
      inserted = await client.post('bb_tasks', payload);
    } catch (postErr) {
      var errStr = postErr ? (postErr.message || String(postErr)) : '';
      // If PostgreSQL schema cache lacks extended columns (PGRST204)
      if (errStr.indexOf('column') !== -1 || errStr.indexOf('schema cache') !== -1 || postErr.code === 'PGRST204' || errStr.indexOf('creator_name') !== -1 || errStr.indexOf('project_name') !== -1 || errStr.indexOf('estimate') !== -1 || errStr.indexOf('assignee_ic') !== -1) {
        console.warn('bb_tasks schema lacks extended columns, falling back to core schema:', errStr);
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
        // Preserve project and estimate in description text
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

    var savedTask = Array.isArray(inserted) && inserted[0] ? inserted[0] : payload;

    closeCreateTaskModal();
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    if (dueEl) dueEl.value = '';
    if (estEl) estEl.value = '';
    if (projEl) projEl.value = '';

    if (typeof showToast === 'function') {
      showToast('Task brief created successfully!', 'success');
    }

    // Refresh view
    if (_tasksViewMode === 'mytasks') {
      await renderTasksBoard(_currentDeptFilter);
      renderMyTasksView();
    } else {
      await renderTasksBoard(_currentDeptFilter);
    }

    // Dispatch assignment notification if assigned to user
    if (savedTask && (typeof syncTaskNotifications === 'function' || (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function'))) {
      var syncFn = (typeof syncTaskNotifications === 'function') ? syncTaskNotifications : window.syncTaskNotifications;
      syncFn([savedTask]);
    }
  } catch (err) {
    var cleanMsg = err ? (err.message || String(err)) : 'Creation failed';
    try {
      var parsed = JSON.parse(cleanMsg);
      cleanMsg = parsed.message || parsed.error || cleanMsg;
    } catch (_) {}
    if (typeof showToast === 'function') {
      showToast('Failed to create task: ' + cleanMsg, 'error');
    }
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
        return '<button data-tid="' + t.id + '" data-ts="' + s + '" style="padding:4px 10px;border:1.5px solid ' + (a ? SC[s] : 'var(--border-card)') + ';border-radius:6px;background:' + (a ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (a ? SC[s] : 'var(--text-secondary)') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:\'Oswald\',sans-serif;">' + SL[s] + '</button>';
      }).join('');

      var descText = t.description || '';
      var descFormatted = descText
        ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">' + ((typeof sanitizeHtml === 'function') ? sanitizeHtml(descText) : (typeof escapeHtml === 'function' ? escapeHtml(descText) : descText)) + '</div>'
        : '';

      html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);flex:1;">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
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
    previewTasksBoardDemo
  };
}
