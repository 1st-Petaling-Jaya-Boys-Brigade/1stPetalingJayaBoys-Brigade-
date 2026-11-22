/**
 * 1st Petaling Jaya Boys' Brigade Portal - Tasks & Kanban Board Module
 *
 * Implements NCO department project board, role-based NCO access checks (isNCO),
 * Kanban status transitions (To Do -> In Progress -> Done) with HTML5 drag-and-drop,
 * My Tasks view across projects, Task Brief/Detail modal inspection, dynamic task assignment
 * notifications, and Officer Admin task management (creation, rich description, assignee assignment, deletion).
 * Renders in a dedicated Projects & Tasks view under #page-tasks.
 */

/* global supa, escapeHtml, sanitizeHtml, sanitizeText, sessionGet, sessionSet, showToast, showConfirmModal, isNCO, isNcoRank, reGetValue, reSetValue, reClearValue, syncTaskNotifications, verifyAdminSessionSync, executeRichFormat, isAdmin, isSuperAdmin, setDismissedNotifId, renderNotifications, sendPortalPushNotification, cleanSnippet, resolveMentionTargets */

// ── Department Configuration ───────────────────────────────────────────────
var DEPT_CONFIG = {
  department_nco: { label: 'Department NCO', color: 'var(--accent)', cls: 'dept-nco', prefix: 'NCO' },
  secretariat:    { label: 'Secretariat',    color: '#ce93d8',      cls: 'dept-secretariat', prefix: 'SEC' },
  logistics:      { label: 'Logistics',      color: '#42a5f5',      cls: 'dept-logistics',   prefix: 'LOG' },
  media:          { label: 'Media',          color: '#ffb74d',      cls: 'dept-media',       prefix: 'MED' },
  hq:             { label: 'HQ',             color: '#10b981',      cls: 'dept-hq',          prefix: 'HQ'  },
  officers:       { label: 'Officers',       color: '#f59e0b',      cls: 'dept-officers',    prefix: 'OFF' },
  officer:        { label: 'Officers',       color: '#f59e0b',      cls: 'dept-officers',    prefix: 'OFF' }
};

var STATUS_ORDER = ['planning', 'todo', 'inprogress', 'inreview', 'completed'];

var DEFAULT_PROJECT_STATUSES = [
  { id: 'planning',   label: 'Planning',    color: '#a855f7', cls: 'status-planning' },
  { id: 'todo',       label: 'To Do',       color: 'var(--text-secondary)', cls: 'status-todo' },
  { id: 'inprogress', label: 'In Progress', color: '#3b82f6', cls: 'status-inprogress' },
  { id: 'inreview',   label: 'In Review',   color: '#f59e0b', cls: 'status-inreview' },
  { id: 'completed',  label: 'Complete',    color: '#10b981', cls: 'status-completed' }
];

var STATUS_CONFIG = {
  planning:   { label: 'Planning',    color: '#a855f7', cls: 'status-planning' },
  todo:       { label: 'To Do',       color: 'var(--text-secondary)', cls: 'status-todo' },
  inprogress: { label: 'In Progress', color: '#3b82f6', cls: 'status-inprogress' },
  inreview:   { label: 'In Review',   color: '#f59e0b', cls: 'status-inreview' },
  completed:  { label: 'Complete',    color: '#10b981', cls: 'status-completed' }
};

var _projectStatusesMap = {};

try {
  if (typeof localStorage !== 'undefined') {
    var rawCachedStatuses = localStorage.getItem('bb_project_statuses');
    if (rawCachedStatuses) {
      var parsedMap = JSON.parse(rawCachedStatuses);
      if (parsedMap && typeof parsedMap === 'object') {
        _projectStatusesMap = parsedMap;
      }
    }
  }
} catch (_) {}

function setElementDisplayNone(el) {
  if (!el || !el.style) return;
  if (typeof el.style.setProperty === 'function') {
    try { el.style.setProperty('display', 'none', 'important'); } catch (_) { el.style.display = 'none'; }
  } else {
    el.style.display = 'none';
  }
  if (el.classList && typeof el.classList.add === 'function') {
    el.classList.add('hidden');
  }
}

function showElementDisplay(el, val) {
  if (!el || !el.style) return;
  if (typeof el.style.removeProperty === 'function') {
    try { el.style.removeProperty('display'); } catch (_) {}
  }
  el.style.display = val || '';
  if (el.classList && typeof el.classList.remove === 'function') {
    el.classList.remove('hidden');
  }
}

function getDefaultProjectStatuses() {
  return DEFAULT_PROJECT_STATUSES.map(function(s) {
    return Object.assign({}, s);
  });
}

function getProjectStatuses(projectName) {
  var p = (projectName || _activeProject || '').toLowerCase().trim();
  if (p && _projectStatusesMap[p] && Array.isArray(_projectStatusesMap[p]) && _projectStatusesMap[p].length > 0) {
    return _projectStatusesMap[p];
  }
  return getDefaultProjectStatuses();
}

function taskMatchesStatus(task, statusObj, _projectName) {
  if (!task || !statusObj) return false;
  var tStat = String(task.status || '').toLowerCase().trim();
  var sId = String(statusObj.id || statusObj.key || '').toLowerCase().trim();
  var sLabel = String(statusObj.label || '').toLowerCase().trim();

  if (tStat === sId || tStat === sLabel) return true;

  var normTStat = tStat.replace(/[\s-_]+/g, '');
  var normSId = sId.replace(/[\s-_]+/g, '');
  var normSLabel = sLabel.replace(/[\s-_]+/g, '');
  if (normTStat && (normTStat === normSId || normTStat === normSLabel)) return true;

  if ((sId === 'completed' || sId === 'done' || sId === 'complete' || sLabel === 'completed' || sLabel === 'done' || sLabel === 'complete' || normSId === 'completed' || normSLabel === 'complete') &&
      (tStat === 'completed' || tStat === 'done' || tStat === 'complete' || normTStat === 'completed' || normTStat === 'complete' || normTStat === 'done')) return true;
  if ((sId === 'todo' || sLabel === 'to do' || normSId === 'todo' || normSLabel === 'todo') &&
      (tStat === 'to do' || tStat === 'todo' || normTStat === 'todo')) return true;
  if ((sId === 'inprogress' || sLabel === 'in progress' || normSId === 'inprogress' || normSLabel === 'inprogress') &&
      (tStat === 'in progress' || tStat === 'in-progress' || tStat === 'inprogress' || normTStat === 'inprogress')) return true;
  if ((sId === 'inreview' || sLabel === 'in review' || normSId === 'inreview' || normSLabel === 'inreview') &&
      (tStat === 'in review' || tStat === 'in-review' || tStat === 'inreview' || normTStat === 'inreview')) return true;
  if ((sId === 'planning' || sLabel === 'planning' || normSId === 'planning' || normSLabel === 'planning') &&
      (tStat === 'planning' || normTStat === 'planning')) return true;

  return false;
}

function isValidTaskStatus(status, projectName) {
  if (!status) return false;
  var s = String(status).toLowerCase().trim();
  if (STATUS_ORDER.indexOf(s) !== -1 || s === 'done' || s === 'complete') return true;
  var pStatuses = getProjectStatuses(projectName);
  for (var i = 0; i < pStatuses.length; i++) {
    var st = pStatuses[i];
    if (st.id.toLowerCase() === s || st.label.toLowerCase() === s) return true;
  }
  for (var p in _projectStatusesMap) {
    if (Object.prototype.hasOwnProperty.call(_projectStatusesMap, p)) {
      var arr = _projectStatusesMap[p] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id.toLowerCase() === s || arr[j].label.toLowerCase() === s) return true;
      }
    }
  }
  return false;
}

function isTaskCompleted(task, projectName) {
  if (!task) return false;
  var pName = projectName || getTaskProjectName(task) || _activeProject;
  var s = String(task.status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'complete') return true;
  var pStatuses = getProjectStatuses(pName);
  if (pStatuses.length > 0) {
    var lastStatus = pStatuses[pStatuses.length - 1];
    if (s === lastStatus.id.toLowerCase() || s === lastStatus.label.toLowerCase()) return true;
  }
  return false;
}

function normalizeTaskStatus(status, projectName) {
  if (!status) return 'todo';
  var s = String(status).toLowerCase().trim();
  if (s === 'done' || s === 'complete') return 'completed';
  if (STATUS_ORDER.indexOf(s) !== -1) return s;

  var pStatuses = getProjectStatuses(projectName || _activeProject);
  for (var i = 0; i < pStatuses.length; i++) {
    var st = pStatuses[i];
    if (st.id.toLowerCase() === s || st.label.toLowerCase() === s) {
      return st.id;
    }
  }

  for (var p in _projectStatusesMap) {
    if (Object.prototype.hasOwnProperty.call(_projectStatusesMap, p)) {
      var arr = _projectStatusesMap[p] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id.toLowerCase() === s || arr[j].label.toLowerCase() === s) {
          return arr[j].id;
        }
      }
    }
  }

  return 'todo';
}

function getColBody(status) {
  var s = String(status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'complete') {
    return document.getElementById('col-completed') || document.getElementById('col-done') || document.querySelector('[data-col-body="completed"]') || document.querySelector('[data-col-body="done"]');
  }
  return document.getElementById('col-' + s) || document.querySelector('[data-col-body="' + s + '"]');
}

function getColCount(status) {
  var s = String(status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'complete') {
    return document.getElementById('count-completed') || document.getElementById('count-done') || document.querySelector('[data-col-count="completed"]') || document.querySelector('[data-col-count="done"]');
  }
  return document.getElementById('count-' + s) || document.querySelector('[data-col-count="' + s + '"]');
}

function getColElement(status) {
  var s = String(status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'complete') {
    return document.getElementById('taskcol-completed') || document.getElementById('taskcol-done') || document.querySelector('.task-col[data-col-status="completed"]') || document.querySelector('.task-col[data-col-status="done"]');
  }
  return document.getElementById('taskcol-' + s) || document.querySelector('.task-col[data-col-status="' + s + '"]');
}

function getTabCount(status) {
  var s = String(status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'complete') {
    return document.getElementById('tab-count-completed') || document.getElementById('tab-count-done') || document.querySelector('[data-tab-count="completed"]') || document.querySelector('[data-tab-count="done"]');
  }
  return document.getElementById('tab-count-' + s) || document.querySelector('[data-tab-count="' + s + '"]');
}

var _activeTasksSection = 'parade'; // 'parade' | 'board'
var _tasksViewMode      = 'projects'; // 'projects' | 'board' | 'mytasks'
var _projectDisplayMode = (typeof localStorage !== 'undefined' && localStorage.getItem('bb_proj_view_mode') === 'list') ? 'list' : 'board'; // 'board' | 'list'
var _activeProject      = '';
var _companyProjects    = [];
var _activeDetailTaskId = null;
var _activeTaskPollTimer = null;
var _initialTaskDetailState = null;
var _justDragged = false;
var _draggedTaskId = null;
var _cachedDepartmentMembers = [];
if (typeof window !== 'undefined') window._cachedDepartmentMembers = _cachedDepartmentMembers;
var _currentDeptFilter  = 'all';
var _taskSearchQuery    = '';
var _myTasksScopeFilter = 'me';     // 'me' | 'all'
var _myTasksStatusFilter = 'open';  // 'open' | 'completed' | 'all'
var _myTasksProjectFilter = 'all';  // 'all' | <projectName>
var _projectProgressFilter = 'all'; // 'all' | '25' | '50' | '75' | '100'
var _projectMemberFilter   = 'all'; // 'all' | <memberName>
var _projectSearchQuery    = '';

function resetTasksFiltersToDefault() {
  _myTasksScopeFilter    = 'me';
  _myTasksStatusFilter   = 'open';
  _myTasksProjectFilter  = 'all';
  _taskSearchQuery       = '';
  _projectProgressFilter = 'all';
  _projectMemberFilter   = 'all';
  _projectSearchQuery    = '';
}
if (typeof window !== 'undefined') window.resetTasksFiltersToDefault = resetTasksFiltersToDefault;
var _allLoadedTasks     = [];
var _adminTaskFilter    = 'all';
var _allAdminTasks      = [];
var _taskMap            = {};
var _deletedTaskIds    = {};
var _isSubmittingTask   = false;
var _isDeletingTask     = false;
var _taskStatusWrites   = new Set();

// Synchronous local memory cache restoration for instant 0ms Projects & Tasks load
try {
  if (typeof localStorage !== 'undefined') {
    var _cachedTasksData = JSON.parse(localStorage.getItem('bb_cached_tasks') || '[]');
    if (Array.isArray(_cachedTasksData) && _cachedTasksData.length) {
      _allLoadedTasks = deduplicateTasks(_cachedTasksData);
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
 * Extracts estimate value from task object (property or description tag)
 */
function getTaskEstimate(t) {
  if (!t) return '';
  if (t.estimate && String(t.estimate).trim()) return String(t.estimate).trim();
  if (t.estimated_hours != null && String(t.estimated_hours).trim()) {
    var rawHours = String(t.estimated_hours).trim();
    return /^[0-9]+(\.[0-9]+)?$/.test(rawHours) ? rawHours + 'h' : rawHours;
  }
  if (t.description) {
    var match = t.description.match(/Estimate:\s*([^\]|\n\r]+)/i);
    if (match && match[1] && match[1].trim()) return match[1].trim();
  }
  return '';
}

/**
 * Extracts creator name from task object (property or description tag)
 */
function getTaskCreatorName(t) {
  if (!t) return 'Jeshua Koh';
  if (t.creator_name && String(t.creator_name).trim()) return String(t.creator_name).trim();
  if (t.description) {
    var match = t.description.match(/\[(?:[^\]]*\|\s*)?Creator:\s*([^\]|]+)/i);
    if (match && match[1] && match[1].trim()) return match[1].trim();
  }
  return 'Jeshua Koh';
}

/**
 * Ensures project tag, estimate tag, and creator tag are never stripped when updating descriptions
 */
function buildTaskDescriptionWithMeta(t, rawCleanDesc) {
  var pName = (t && t.project_name && t.project_name.trim())
    ? t.project_name.trim()
    : (getTaskProjectName(t) || (rawCleanDesc ? getTaskProjectName({ description: rawCleanDesc }) : '') || _activeProject || '');
  var est = (t && t.estimate && String(t.estimate).trim())
    ? String(t.estimate).trim()
    : (getTaskEstimate(t) || (rawCleanDesc ? getTaskEstimate({ description: rawCleanDesc }) : '') || '');
  var creator = '';
  if (t && t.creator_name && String(t.creator_name).trim()) {
    creator = String(t.creator_name).trim();
  } else if (rawCleanDesc) {
    var cMatch = rawCleanDesc.match(/\[(?:[^\]]*\|\s*)?Creator:\s*([^\]|]+)/i);
    if (cMatch && cMatch[1] && cMatch[1].trim()) {
      creator = cMatch[1].trim();
    }
  }
  var body = (rawCleanDesc || '').replace(/\s*\[[^\]]*(?:Project:|Estimate:|Creator:)[^\]]*\]/gi, '').trim();
  var tags = [];
  if (pName && pName !== 'General Project' && !pName.toLowerCase().includes('sprint')) {
    tags.push('Project: ' + pName);
  }
  if (est) {
    tags.push('Estimate: ' + est);
  }
  if (creator) {
    tags.push('Creator: ' + creator);
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
  if (t.project && typeof t.project === 'string' && t.project.trim()) return t.project.trim();
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
 * Safely deduplicates task items across temporary optimistic IDs and server-persisted records.
 * Ensures that if a real database task already exists, any matching temporary optimistic task
 * (matched by title and project/department) is seamlessly discarded.
 * @param {Array<Object>} tasks
 * @returns {Array<Object>}
 */
function deduplicateTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  var seenIds = Object.create(null);
  var persistedKeys = Object.create(null);

  // Pass 1: Index landed server tasks (non-temp IDs)
  tasks.forEach(function(t) {
    if (!t || !t.id) return;
    var idStr = String(t.id).trim();
    if (!idStr.toLowerCase().startsWith('temp_')) {
      var titleKey = String(t.title || '').trim().toLowerCase();
      var projKey = (t.project_name || getTaskProjectName(t) || '').trim().toLowerCase();
      if (titleKey) {
        persistedKeys[titleKey + '::' + projKey] = true;
        persistedKeys[titleKey] = true;
      }
    }
  });

  // Pass 2: Filter out duplicate IDs and fulfilled temporary tasks
  return tasks.filter(function(t) {
    if (!t || !t.id) return false;
    var idStr = String(t.id).trim();
    if (seenIds[idStr]) return false;
    if (idStr.toLowerCase().startsWith('temp_')) {
      var titleKey = String(t.title || '').trim().toLowerCase();
      var projKey = (t.project_name || getTaskProjectName(t) || '').trim().toLowerCase();
      if (titleKey && (persistedKeys[titleKey + '::' + projKey] || persistedKeys[titleKey])) {
        return false; // Already landed on server as a real task!
      }
    }
    seenIds[idStr] = true;
    return true;
  });
}

/**
 * Persists _companyProjects to localStorage and Supabase bb_config
 */
async function saveProjectsCatalog() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('bb_company_projects', JSON.stringify(_companyProjects)); } catch (_) {}
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') window.PortalRealtime.broadcast('projects', 'update');
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
 * Persists _projectStatusesMap to localStorage and Supabase bb_config
 */
async function saveProjectStatusesCatalog() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('bb_project_statuses', JSON.stringify(_projectStatusesMap)); } catch (_) {}
    if (typeof window !== 'undefined') window._projectStatusesMap = _projectStatusesMap;
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('projects', 'update', { key: 'bb_project_statuses', map: _projectStatusesMap });
      window.PortalRealtime.broadcast('project_statuses', 'update', { key: 'bb_project_statuses', map: _projectStatusesMap });
    }
  }
  var client = getSupaClient();
  if (client) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_project_statuses', value: JSON.stringify(_projectStatusesMap) }, {
        headers: { 'Prefer': 'resolution=merge-duplicates' }
      });
    } catch (_) {
      try {
        await client.patch('bb_config?key=eq.bb_project_statuses', { value: JSON.stringify(_projectStatusesMap) });
      } catch (_) {
        try { await client.post('bb_config', { key: 'bb_project_statuses', value: JSON.stringify(_projectStatusesMap) }); } catch (_) {}
      }
    }
  }
}

/**
 * Loads _projectStatusesMap from localStorage and Supabase bb_config
 */
async function loadProjectStatusesCatalog() {
  if (typeof localStorage !== 'undefined') {
    try {
      var cached = localStorage.getItem('bb_project_statuses');
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          _projectStatusesMap = Object.assign({}, _projectStatusesMap, parsed);
          if (typeof window !== 'undefined') window._projectStatusesMap = _projectStatusesMap;
        }
      }
    } catch (_) {}
  }
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_project_statuses&select=value', { cache: false });
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var remoteMap = JSON.parse(rows[0].value);
        if (remoteMap && typeof remoteMap === 'object') {
          _projectStatusesMap = Object.assign({}, remoteMap);
          if (typeof window !== 'undefined') window._projectStatusesMap = _projectStatusesMap;
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem('bb_project_statuses', JSON.stringify(_projectStatusesMap)); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }
}

/**
 * Live updates _projectStatusesMap from real-time broadcast and triggers re-render
 * @param {Object} newMap
 */
function applyProjectStatusesUpdate(newMap) {
  if (!newMap || typeof newMap !== 'object') return;
  _projectStatusesMap = Object.assign({}, newMap);
  if (typeof window !== 'undefined') window._projectStatusesMap = _projectStatusesMap;
  try { localStorage.setItem('bb_project_statuses', JSON.stringify(_projectStatusesMap)); } catch (_) {}
  if (typeof refreshCurrentTasksView === 'function') {
    refreshCurrentTasksView();
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
  await loadProjectStatusesCatalog();
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
  var target = normalizeTaskStatus(tab, _activeProject);
  var pStatuses = getProjectStatuses(_activeProject);
  pStatuses.forEach(function(t) {
    var col = getColElement(t.id);
    if (col) col.classList.toggle('mobile-active', t.id.toLowerCase() === target.toLowerCase());
  });
  document.querySelectorAll('.task-col[data-col-status]').forEach(function(col) {
    var cStat = col.getAttribute('data-col-status') || '';
    if (cStat) {
      col.classList.toggle('mobile-active', cStat.toLowerCase() === target.toLowerCase());
    }
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
 * Checks whether a member has an assigned department role.
 * A member has department role access ONLY if they have been
 * explicitly assigned to a department by an admin.
 *
 * @param {Object|string} [memberOrDept] Member object or department string
 * @param {string} [_rank] Optional rank string
 * @returns {boolean}
 */
function hasDepartmentRole(memberOrDept, _rank) {
  var explicit = typeof memberOrDept === 'string' || (memberOrDept && typeof memberOrDept === 'object');
  var profile = typeof memberOrDept === 'string' ? { department: memberOrDept } : memberOrDept;
  if (!explicit) profile = currentTaskUser();
  if (!profile) return false;
  return Boolean(taskDepartmentKey(profile.department));
}

function taskDepartmentKey(value) {
  var key = String(value || '').toLowerCase().trim();
  if (!key) return '';
  if (['department nco', 'dept nco', 'nco'].includes(key) || key.indexOf('department nco') !== -1 || key.indexOf('dept nco') !== -1) return 'department_nco';
  if (key === 'officer' || key === 'officers' || key.indexOf('officer') !== -1) return 'officers';
  if (key === 'secretariat' || key.indexOf('secretariat') !== -1) return 'secretariat';
  if (key === 'logistics' || key.indexOf('logistics') !== -1) return 'logistics';
  if (key === 'media' || key.indexOf('media') !== -1) return 'media';
  if (key === 'hq' || key.indexOf('hq') !== -1) return 'hq';
  return Object.hasOwn(DEPT_CONFIG, key) ? key : '';
}

function currentTaskUser() {
  if (typeof sessionGet !== 'function' || !(sessionGet('ic') || sessionGet('email'))) return null;
  return { department: sessionGet('department'), rank: sessionGet('rank'), section: sessionGet('section') };
}

function isTaskOfficer(profile, rank) {
  if (!profile) return false;
  var section = String(profile.att_section || profile.section || '').toLowerCase().trim();
  return section === 'officer' || ['Officer', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Lieutenant', 'Chaplain', 'Warrant Officer', 'Instructor'].includes(profile.rank || rank);
}

function hasTaskAdminSession() {
  try {
    return typeof verifyAdminSessionSync === 'function' && verifyAdminSessionSync() &&
      (typeof RBAC === 'undefined' || RBAC.hasModulePermission('tasks'));
  } catch (_) {
    return false;
  }
}

function hasTaskBoardAdminAccess() {
  return hasTaskAdminSession() || Boolean(currentTaskUser() &&
    typeof window !== 'undefined' && window.RBAC?.hasModulePermission('tasks'));
}

function taskDepartmentForProject(projectName) {
  var key = taskDepartmentKey(projectName);
  if (key) return key;
  var project = _allLoadedTasks.find(function(task) { return getTaskProjectName(task).toLowerCase() === String(projectName || '').toLowerCase(); });
  var user = currentTaskUser();
  return taskDepartmentKey(project?.department) || taskDepartmentKey(user?.department) || 'officers';
}

function canManageTaskDepartment(department) {
  var user = currentTaskUser();
  if (!user) return false;
  if (isTaskOfficer(user) || hasTaskBoardAdminAccess()) return true;
  var key = taskDepartmentKey(department);
  return Boolean(key && taskDepartmentKey(user.department) === key);
}

function findManagedTask(id) {
  var task = (typeof window !== 'undefined' && window._taskMap && window._taskMap[id]) || _taskMap[id] ||
    _allLoadedTasks.find(function(row) { return String(row.id) === String(id); });
  return task && canManageTaskDepartment(task.department || getTaskProjectName(task)) ? task : null;
}

/**
 * Predicate to check if a member has a department role or officer role for task assignment
 * @param {Object} m
 * @returns {boolean}
 */
function isMemberDepartmentRole(m) {
  if (!m) return false;
  var isDel = (typeof isDeletedOrTestAccount === 'function')
    ? isDeletedOrTestAccount(m)
    : (m.rank === 'Deleted' || m.department === 'deleted' || String(m.ic || '').toLowerCase().startsWith('archived_'));
  if (isDel) return false;
  if (hasDepartmentRole(m)) return true;

  // Direct department name check
  if (m.department && taskDepartmentKey(m.department)) return true;

  // Check NCO ranks and Officer ranks
  var rankStr = String(m.rank || '').trim().toLowerCase();
  var isRankEligible = ['captain', 'lieutenant', 'chaplain', 'warrant officer', 'instructor', 'officer',
                        'staff sergeant', 'sergeant', 'corporal', 'lance corporal'].includes(rankStr);
  if (isRankEligible) return true;

  // Check section
  var secStr = String(m.att_section || m.section || '').trim().toLowerCase();
  if (secStr === 'officer' || secStr === 'nco') return true;

  // Check role
  var roleStr = String(m.role || '').trim().toLowerCase();
  if (['admin', 'super_admin', 'officer', 'nco'].includes(roleStr)) return true;

  // Known testing or administrative accounts
  var nameStr = String(m.name || '').trim().toLowerCase();
  var idStr = String(m.email || m.ic || '').trim().toLowerCase();
  if (nameStr === 'tester account' || idStr === 'jeshuakoh1601@gmail.com' ||
      nameStr === 'jeshua koh' || idStr === 'jeshuakoh2008@gmail.com') {
    return true;
  }

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
    var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : '';
    var isAllowed = hasDepartmentRole();

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
  var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : '';
  var nd = document.getElementById('tasks-no-dept');
  var gate = document.getElementById('tasks-gate');
  var board = document.getElementById('tasks-board');
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
    if (gate) gate.style.display = 'block';
    if (board) board.style.display = 'none';
    return;
  }

  // Use the current grant while refreshing the member record.
  var fastAllowed = hasDepartmentRole();
  if (boardPill) boardPill.style.display = fastAllowed ? 'inline-flex' : 'none';
  if (gate) gate.style.display = fastAllowed ? 'none' : 'block';
  if (board) board.style.display = fastAllowed ? 'block' : 'none';
  if (fastAllowed) {
    setTasksViewMode(_tasksViewMode || 'projects');
    fetchDepartmentMembers().catch(function() {});
  }
  if (typeof window !== 'undefined' && typeof window.syncSidebarAccess === 'function') {
    window.syncSidebarAccess();
  }

  var client = getSupaClient();
  if (!client) {
    if (gate) gate.style.display = 'block';
    if (board) board.style.display = 'none';
    return;
  }

  try {
    if (typeof client.get !== 'function') return;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=name,department,rank,section,att_section,squad');
    if ((sessionGet('ic') || sessionGet('email')) !== ic) return;
    var m    = data && data[0];
    var dept = m && m.department;
    var rank = (m && m.rank) || (typeof sessionGet === 'function' ? sessionGet('rank') : '');
    var sec  = (m && (m.att_section || m.section)) || (typeof sessionGet === 'function' ? sessionGet('section') : '');

    if (typeof sessionSet === 'function') {
      if (sessionGet('department') !== (dept || '')) sessionSet('department', dept || '', { localOnly: true });
      if (rank && sessionGet('rank') !== rank) sessionSet('rank', rank, { localOnly: true });
      if (sec && sessionGet('section') !== sec) sessionSet('section', sec, { localOnly: true });
    }

    var isAllowed = hasDepartmentRole();

    if (!isAllowed) {
      if (boardPill) boardPill.style.display = 'none';
      if (gate) {
        gate.style.display = 'block';
        var gateBtn = gate.querySelector('.submit-btn');
        if (gateBtn) {
          gateBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + (ic ? 'View Member Profile' : 'Login / Register');
        }
      }
      if (board) board.style.display = 'none';
      var pTasks = document.getElementById('page-tasks');
      if (pTasks && pTasks.classList.contains('active') && typeof switchTabNav === 'function') {
        switchTabNav('home');
      }
      if (typeof window !== 'undefined' && typeof window.syncSidebarAccess === 'function') {
        window.syncSidebarAccess();
      }
      return;
    }

    // Member has department role: reveal Projects & Tasks
    if (boardPill) boardPill.style.display = 'inline-flex';

    var cleanDeptKey = taskDepartmentKey(dept);

    if (!cleanDeptKey || !DEPT_CONFIG[cleanDeptKey]) {
      if (boardPill) boardPill.style.display = 'none';
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

    var cfg = DEPT_CONFIG[cleanDeptKey];
    var dt  = document.getElementById('tasks-dept-title');  if (dt) dt.textContent = cfg.label + ' Department';
    var ds  = document.getElementById('tasks-dept-sub');    if (ds) ds.textContent = 'Projects & Tasks';
    var db  = document.getElementById('tasks-dept-badge');
    if (db) db.innerHTML = '<span class="dept-badge ' + cfg.cls + '">' + cfg.label + '</span>';
    _currentDeptFilter = cleanDeptKey;

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
  var prevMode = _tasksViewMode;
  _tasksViewMode = mode || 'projects';
  if (prevMode !== _tasksViewMode && typeof resetTasksFiltersToDefault === 'function') {
    resetTasksFiltersToDefault();
  }
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
    if (boardCol) {
      boardCol.style.display = 'none';
      boardCol.classList.add('hidden');
    }
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
        if (boardCol) setElementDisplayNone(boardCol);
        if (colTabs) setElementDisplayNone(colTabs);
        if (listView) showElementDisplay(listView, 'block');
      } else {
        if (listView) setElementDisplayNone(listView);
        if (boardCol) showElementDisplay(boardCol, 'flex');
        if (colTabs) showElementDisplay(colTabs, (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'flex' : 'none');
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
      if (boardCol) {
        boardCol.style.display = 'none';
        boardCol.classList.add('hidden');
      }
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
    if (boardCol) {
      boardCol.style.display = 'none';
      boardCol.classList.add('hidden');
    }
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

  // Collect unique assignees across all tasks for the member filter
  var assigneesMapAll = {};
  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name.trim()) {
      assigneesMapAll[t.assignee_name.trim()] = true;
    }
  });
  var allProjectAssignees = Object.keys(assigneesMapAll).sort();

  // Filter projects by search query, progress, and assigned members
  var filteredProjects = projectList.filter(function(pName) {
    if (_projectSearchQuery) {
      if (pName.toLowerCase().indexOf(_projectSearchQuery.toLowerCase()) === -1) return false;
    }
    var pTasks = _allLoadedTasks.filter(function(t) {
      return getTaskProjectName(t).toLowerCase() === pName.toLowerCase();
    });
    var completedCount = pTasks.filter(function(t) {
      return isTaskCompleted(t, pName);
    }).length;
    var pct = pTasks.length ? Math.round((completedCount / pTasks.length) * 100) : 0;

    // Progress filter (25%, 50%, 75%, 100%)
    if (_projectProgressFilter !== 'all') {
      if (_projectProgressFilter === '25' && pct > 25) return false;
      if (_projectProgressFilter === '50' && (pct <= 25 || pct > 50)) return false;
      if (_projectProgressFilter === '75' && (pct <= 50 || pct > 75)) return false;
      if (_projectProgressFilter === '100' && pct !== 100) return false;
    }

    // Member filter
    if (_projectMemberFilter !== 'all') {
      var hasMember = pTasks.some(function(t) {
        var aName = (t.assignee_name || '').toLowerCase();
        var qMember = _projectMemberFilter.toLowerCase();
        return aName === qMember || aName.indexOf(qMember) !== -1;
      });
      if (!hasMember) return false;
    }

    return true;
  });

  var hasActiveProjFilter = (_projectProgressFilter !== 'all' || _projectMemberFilter !== 'all');

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
    + '<div class="projects-search-bar" style="display:flex;align-items:center;gap:10px;position:relative;flex-wrap:wrap;">'
    +   '<div class="task-search-box" style="width:100%;max-width:320px;">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    +     '<input type="search" class="task-search-input" style="width:100%;" placeholder="Search projects..." value="' + (typeof escapeHtml === 'function' ? escapeHtml(_projectSearchQuery) : _projectSearchQuery) + '" oninput="handleProjectsSearchInput(this.value)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" name="project_search_query" />'
    +   '</div>'
    +   '<div class="filter-dropdown-wrapper" style="position:relative;">'
    +     '<button type="button" class="project-filter-btn' + (hasActiveProjFilter ? ' active' : '') + '" onclick="toggleProjectFilterMenu(event)" title="Filter Projects">'
    +       '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>'
    +       '<span>Filter</span>'
    +       (hasActiveProjFilter ? '<span class="filter-active-dot"></span>' : '')
    +     '</button>'
    +     '<div class="project-filter-dropdown" style="display:none;" onclick="event.stopPropagation()">'
    +       '<div class="filter-menu-header">'
    +         '<span class="filter-menu-title">Filter Projects</span>'
    +         (hasActiveProjFilter ? '<button type="button" class="filter-reset-link" onclick="resetProjectFilters()">Reset</button>' : '')
    +       '</div>'
    +       '<div class="filter-section">'
    +         '<span class="filter-section-label">Progress</span>'
    +         '<div class="filter-chip-group">'
    +           '<button type="button" class="filter-chip-option' + (_projectProgressFilter === 'all' ? ' active' : '') + '" onclick="setProjectProgressFilter(\'all\')">All</button>'
    +           '<button type="button" class="filter-chip-option' + (_projectProgressFilter === '25' ? ' active' : '') + '" onclick="setProjectProgressFilter(\'25\')">25%</button>'
    +           '<button type="button" class="filter-chip-option' + (_projectProgressFilter === '50' ? ' active' : '') + '" onclick="setProjectProgressFilter(\'50\')">50%</button>'
    +           '<button type="button" class="filter-chip-option' + (_projectProgressFilter === '75' ? ' active' : '') + '" onclick="setProjectProgressFilter(\'75\')">75%</button>'
    +           '<button type="button" class="filter-chip-option' + (_projectProgressFilter === '100' ? ' active' : '') + '" onclick="setProjectProgressFilter(\'100\')">100%</button>'
    +         '</div>'
    +       '</div>'
    +       '<div class="filter-section" style="margin-top:10px;">'
    +         '<span class="filter-section-label">Assigned Member</span>'
    +         '<select class="filter-select-input" onchange="setProjectMemberFilter(this.value)">'
    +           '<option value="all"' + (_projectMemberFilter === 'all' ? ' selected' : '') + '>All Members</option>'
    +           allProjectAssignees.map(function(m) {
                  return '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(m) : m) + '"' + (_projectMemberFilter === m ? ' selected' : '') + '>' + (typeof escapeHtml === 'function' ? escapeHtml(m) : m) + '</option>';
                }).join('')
    +         '</select>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="projects-table-card">';

  if (!filteredProjects.length) {
    html += '<div style="padding:48px 20px;text-align:center;color:var(--text-muted);">'
      + '<svg class="ui-icon-xl" style="margin:0 auto 12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'
      + '<div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No matching projects found</div>'
      + '<div style="font-size:13px;margin-bottom:16px;">Try adjusting your search query, progress, or member filters.</div>'
      + (hasActiveProjFilter ? '<button type="button" class="task-secondary-btn" onclick="resetProjectFilters()" style="margin-right:8px;">Reset Filters</button>' : '')
      + '<button type="button" class="task-primary-btn" onclick="openAddProjectModal()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Project</button>'
      + '</div>';
  } else {
    filteredProjects.forEach(function(pName) {
      var pTasks = _allLoadedTasks.filter(function(t) {
        return getTaskProjectName(t).toLowerCase() === pName.toLowerCase();
      });
      var completedCount = pTasks.filter(function(t) {
        return isTaskCompleted(t, pName);
      }).length;
      var pct = pTasks.length ? Math.round((completedCount / pTasks.length) * 100) : 0;

      // Unique assignee initials/avatars stack
      var assigneesMap = {};
      pTasks.forEach(function(t) {
        if (t.assignee_name && t.assignee_name.trim()) {
          var aName = t.assignee_name.trim();
          var aIc = (t.assignee_ic || '').trim();
          if (!aIc && typeof isPortalCreator === 'function' && isPortalCreator(aName, aIc)) {
            aIc = 'jeshuakoh2008@gmail.com';
          }
          if (!assigneesMap[aName] || (assigneesMap[aName].indexOf('@') === -1 && aIc)) {
            assigneesMap[aName] = aIc || assigneesMap[aName] || '';
          }
        }
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

  var boardCol = document.getElementById('tasks-columns');
  if (boardCol) {
    boardCol.style.display = 'none';
    boardCol.classList.add('hidden');
  }
  var colTabs = document.getElementById('task-col-tabs');
  if (colTabs) colTabs.style.display = 'none';
  var listView = document.querySelector('.tasks-board-list-view');
  if (listView) listView.style.display = 'none';
  var noProjEl = document.querySelector('.tasks-no-project-placeholder');
  if (noProjEl) noProjEl.style.display = 'none';
  var myTasks = document.querySelector('.my-tasks-container');
  if (myTasks) myTasks.style.display = 'none';
  container.style.display = 'block';

  // Render immediately with in-memory state (< 1ms)
  paintProjectsList(container);

  // Background fetch latest tasks and catalog in parallel
  var client = getSupaClient();
  var fetchTasksPromise = (client && typeof client.get === 'function') ? client.get('bb_tasks?order=created_at.asc') : Promise.resolve([]);
  var fetchCatalogPromise = loadProjectsCatalog();

  try {
    var res = await Promise.all([fetchTasksPromise, fetchCatalogPromise]);
    var tasks = res[0];
    if (Array.isArray(tasks)) {
      tasks = tasks.filter(function(t) { return t && !_deletedTaskIds[String(t.id)]; });
      var pendingTemp = _allLoadedTasks.filter(function(t) {
        if (!t || !String(t.id).startsWith('temp_') || _deletedTaskIds[String(t.id)]) return false;
        var tKey = String(t.title || '').trim().toLowerCase();
        var tProj = (t.project_name || getTaskProjectName(t) || '').trim().toLowerCase();
        return !tasks.some(function(r) {
          if (!r || !r.title) return false;
          var rKey = String(r.title).trim().toLowerCase();
          var rProj = (r.project_name || getTaskProjectName(r) || '').trim().toLowerCase();
          return rKey === tKey && (!tProj || !rProj || rProj === tProj);
        });
      });
      _allLoadedTasks = deduplicateTasks(tasks.concat(pendingTemp));
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
  if (!projectName || !hasDepartmentRole()) return;
  var projectTasks = _allLoadedTasks.filter(function(task) { return getTaskProjectName(task).toLowerCase() === projectName.toLowerCase(); });
  if (!projectTasks.every(function(task) { return canManageTaskDepartment(task.department); })) return;
  if (!projectTasks.length && !hasTaskAdminSession() && !isTaskOfficer(currentTaskUser())) return;
  var confirmFn = (typeof showConfirmModal === 'function')
    ? showConfirmModal
    : async function() { return false; };

  var confirmed = await confirmFn(
    'Are you sure you want to delete project "' + projectName + '" and all its tasks? This action cannot be undone.',
    'Delete Project'
  );
  if (!confirmed || !projectTasks.every(function(task) { return canManageTaskDepartment(task.department); })) return;

  var lower = projectName.toLowerCase();
  var tasksToDelete = _allLoadedTasks.filter(function(task) { return getTaskProjectName(task).toLowerCase() === lower; });
  if (!hasDepartmentRole() || !tasksToDelete.every(function(task) { return canManageTaskDepartment(task.department); })) return;
  var client = getSupaClient();
  if (!client) return;
  var remoteTasks = tasksToDelete.filter(function(task) { return !String(task.id).startsWith('temp_'); });
  var deletes = await Promise.allSettled(remoteTasks.map(function(task) {
    return client.delete('bb_tasks?id=eq.' + encodeURIComponent(task.id));
  }));
  var failed = deletes.some(function(result) { return result.status === 'rejected'; });
  remoteTasks.forEach(function(task, index) {
    if (deletes[index].status === 'fulfilled') _deletedTaskIds[String(task.id)] = true;
  });
  if (!failed) {
    tasksToDelete.forEach(function(task) { _deletedTaskIds[String(task.id)] = true; });
    _companyProjects = _companyProjects.filter(function(name) { return name.toLowerCase() !== lower; });
    await saveProjectsCatalog();
    delete _projectStatusesMap[lower];
    await saveProjectStatusesCatalog();
  }
  _allLoadedTasks = _allLoadedTasks.filter(function(task) {
    if (!_deletedTaskIds[String(task.id)]) return true;
    delete _taskMap[task.id];
    if (typeof window !== 'undefined' && window._taskMap) delete window._taskMap[task.id];
    return false;
  });
  if (failed) {
    if (typeof showToast === 'function') showToast('Some project tasks could not be deleted. The project is still available.', 'warning');
    await fetchAllRemoteTasks(true);
    return;
  }
  if (typeof logAuditEvent === 'function') {
    logAuditEvent({ action: 'project.delete', targetType: 'project', targetId: projectName, details: { taskCount: tasksToDelete.length } });
  }
  if ((_activeProject || '').toLowerCase() === lower) _activeProject = '';
  setTasksViewMode('projects');
  if (typeof showToast === 'function') showToast('Project "' + projectName + '" deleted.', 'success');
}

/**
 * Filter projects list in real-time
 */
function handleProjectsSearchInput(query) {
  _projectSearchQuery = query || '';
  filterProjectsList(_projectSearchQuery);
}

function filterProjectsList(query) {
  _projectSearchQuery = query || '';
  var q = (_projectSearchQuery || '').toLowerCase().trim();
  var rows = document.querySelectorAll('.project-row');
  var visibleCount = 0;
  rows.forEach(function(row) {
    var name = row.querySelector('.project-row-name');
    var txt = name ? name.textContent.toLowerCase() : '';
    var matches = (!q || txt.indexOf(q) !== -1);
    row.style.display = matches ? 'flex' : 'none';
    if (matches) visibleCount++;
  });
  var card = document.querySelector('.projects-table-card');
  if (card) {
    var emptyEl = card.querySelector('.projects-empty-search');
    if (visibleCount === 0 && q) {
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'projects-empty-search';
        emptyEl.style.cssText = 'padding:32px 16px;text-align:center;color:var(--text-muted);font-size:13px;';
        card.appendChild(emptyEl);
      }
      emptyEl.textContent = 'No projects match "' + query + '"';
      emptyEl.style.display = 'block';
    } else if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }
}

function toggleProjectFilterMenu(e) {
  if (e) e.stopPropagation();
  var menu = document.querySelector('.project-filter-dropdown');
  if (!menu) return;
  var isVisible = menu.style.display === 'flex' || menu.style.display === 'block';
  var other = document.querySelector('.my-tasks-filter-dropdown');
  if (other) other.style.display = 'none';
  menu.style.display = isVisible ? 'none' : 'flex';
}

function setProjectProgressFilter(val) {
  _projectProgressFilter = val || 'all';
  var container = document.querySelector('.projects-container');
  if (container) paintProjectsList(container);
}

function setProjectMemberFilter(val) {
  _projectMemberFilter = val || 'all';
  var container = document.querySelector('.projects-container');
  if (container) paintProjectsList(container);
}

function resetProjectFilters() {
  _projectProgressFilter = 'all';
  _projectMemberFilter = 'all';
  _projectSearchQuery = '';
  var container = document.querySelector('.projects-container');
  if (container) paintProjectsList(container);
}

/**
 * Opens prompt / modal to create a new project
 */
async function openAddProjectModal() {
  if (!hasDepartmentRole()) return;
  var name = null;
  if (typeof showPromptModal === 'function') {
    name = await showPromptModal('Create New Project', 'e.g. Officers, Band, Quartermaster', '', {
      confirmText: 'Create Project',
      cancelText: 'Cancel',
      subtitle: 'Enter a name for the new project in your workspace.'
    });
  }
  if (!name || !name.trim() || !hasDepartmentRole()) return;
  var cleanName = (typeof sanitizeText === 'function') ? sanitizeText(name.trim(), 80) : name.trim();
  if (Array.isArray(_allLoadedTasks)) {
    _allLoadedTasks.forEach(function(t) {
      var p = getTaskProjectName(t);
      if (p && p !== 'General Project' && !p.toLowerCase().includes('sprint') && _companyProjects.indexOf(p) === -1) {
        _companyProjects.push(p);
      }
    });
  }
  if (_companyProjects.indexOf(cleanName) === -1) {
    _companyProjects.push(cleanName);
    await saveProjectsCatalog();
  }
  var pKey = cleanName.toLowerCase().trim();
  if (!_projectStatusesMap[pKey]) {
    _projectStatusesMap[pKey] = getDefaultProjectStatuses();
    await saveProjectStatusesCatalog();
  }
  openProjectBoard(cleanName);
  if (typeof showToast === 'function') {
    showToast('Project created: ' + cleanName, 'success');
  }
}

/**
 * Inline Status Management (CRUD) for Project-Specific Workflows (Images 1, 2, 3, 4, 5)
 */

function getOrCreateMoveTasksModal() {
  if (typeof document === 'undefined') return null;
  var existing = document.getElementById('move-tasks-status-modal');
  if (existing) return existing;
  var modal = document.createElement('div');
  modal.id = 'move-tasks-status-modal';
  modal.className = 'task-modal-backdrop';
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:1001;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);padding:16px;box-sizing:border-box;';
  modal.innerHTML = '<div class="move-tasks-modal-card" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:var(--radius-lg);width:100%;max-width:440px;padding:24px;box-shadow:var(--shadow-xl);box-sizing:border-box;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    +   '<h3 class="move-tasks-modal-title" style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary);">Delete Status</h3>'
    +   '<button type="button" class="move-tasks-modal-close-btn" onclick="closeMoveTasksModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);padding:4px;" title="Close" aria-label="Close">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    +   '</button>'
    + '</div>'
    + '<p class="move-tasks-modal-desc" style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin:0 0 16px;">This status contains tasks. Select a status to move these tasks to before deleting:</p>'
    + '<div style="margin-bottom:20px;">'
    +   '<label for="move-tasks-dest-select" style="display:block;font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">Move tasks to:</label>'
    +   '<select id="move-tasks-dest-select" class="task-form-select" style="width:100%;height:38px;padding:0 12px;border:1px solid var(--border-card);border-radius:6px;background:var(--bg-card-subtle);color:var(--text-primary);font-size:13px;outline:none;"></select>'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end;gap:10px;">'
    +   '<button type="button" class="task-secondary-btn" onclick="closeMoveTasksModal()" style="padding:7px 14px;border-radius:6px;border:1px solid var(--border-card);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;font-weight:500;">Cancel</button>'
    +   '<button type="button" id="move-tasks-confirm-btn" class="task-danger-btn" style="padding:7px 16px;border-radius:6px;border:none;background:var(--danger, #ef4444);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Move Tasks & Delete</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  return modal;
}

function openMoveTasksAndDeleteStatusModal(statusObj, affectedTasks, statuses) {
  var modal = getOrCreateMoveTasksModal();
  if (!modal) return;
  var titleEl = modal.querySelector('.move-tasks-modal-title');
  if (titleEl) titleEl.textContent = 'Delete Status: ' + statusObj.label;
  var descEl = modal.querySelector('.move-tasks-modal-desc');
  if (descEl) {
    descEl.innerHTML = 'This status contains <strong>' + affectedTasks.length + ' task(s)</strong>. Select another status to move these tasks to before deleting:';
  }
  var selectEl = modal.querySelector('#move-tasks-dest-select');
  if (selectEl) {
    var otherStatuses = statuses.filter(function(s) {
      return s.id.toLowerCase() !== statusObj.id.toLowerCase();
    });
    selectEl.innerHTML = otherStatuses.map(function(s) {
      return '<option value="' + s.id + '">' + (typeof escapeHtml === 'function' ? escapeHtml(s.label) : s.label) + '</option>';
    }).join('');
  }
  var confirmBtn = modal.querySelector('#move-tasks-confirm-btn');
  if (confirmBtn) {
    confirmBtn.onclick = function() {
      var destId = selectEl ? selectEl.value : null;
      if (!destId) return;
      confirmMoveTasksAndDeleteStatus(statusObj.id, destId);
    };
  }
  modal.style.display = 'flex';
}

function closeMoveTasksModal() {
  if (typeof document === 'undefined') return;
  var modal = document.getElementById('move-tasks-status-modal');
  if (modal && modal.style) modal.style.display = 'none';
}

async function confirmMoveTasksAndDeleteStatus(sourceStatusId, destStatusId) {
  var pName = _activeProject;
  if (!pName) return;
  var pKey = pName.toLowerCase().trim();

  if (!sourceStatusId || !destStatusId) {
    var modal = typeof document !== 'undefined' ? document.getElementById('move-tasks-status-modal') : null;
    if (modal) {
      sourceStatusId = sourceStatusId || (modal.dataset && modal.dataset.statusId);
      var select = modal.querySelector('#move-tasks-dest-status');
      destStatusId = destStatusId || (select ? select.value : '');
    }
  }

  if (!sourceStatusId || !destStatusId) return;
  var srcLower = String(sourceStatusId).toLowerCase().trim();
  var destLower = String(destStatusId).toLowerCase().trim();

  var statuses = getProjectStatuses(pName);
  var srcObj = statuses.find(function(s) { return s && s.id && s.id.toLowerCase() === srcLower; });
  var destObj = statuses.find(function(s) { return s && s.id && s.id.toLowerCase() === destLower; });
  if (!srcObj || !destObj) return;

  var affectedTasks = _allLoadedTasks.filter(function(t) {
    if (!t || _deletedTaskIds[String(t.id)]) return false;
    var taskProj = (t.project_name && t.project_name.trim()) ? t.project_name.trim() : getTaskProjectName(t);
    if (!taskProj || taskProj.toLowerCase() !== pKey) return false;
    return taskMatchesStatus(t, srcObj, pName);
  });

  affectedTasks.forEach(function(t) {
    t.status = destObj.id;
    if (_taskMap[t.id]) _taskMap[t.id].status = destObj.id;
  });

  var client = getSupaClient();
  if (client) {
    var remoteTasks = affectedTasks.filter(function(t) { return !String(t.id).startsWith('temp_'); });
    if (remoteTasks.length > 0) {
      await Promise.allSettled(remoteTasks.map(function(t) {
        return client.patch('bb_tasks?id=eq.' + encodeURIComponent(t.id), { status: destObj.id });
      }));
    }
  }

  _projectStatusesMap[pKey] = statuses.filter(function(s) { return s.id.toLowerCase() !== sourceStatusId.toLowerCase(); });
  await saveProjectStatusesCatalog();

  closeMoveTasksModal();
  if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);

  if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
    window.PortalRealtime.broadcast('tasks', 'update');
    window.PortalRealtime.broadcast('projects', 'update');
  }

  if (typeof showToast === 'function') {
    showToast('Moved ' + affectedTasks.length + ' task(s) to "' + destObj.label + '" and deleted "' + srcObj.label + '".', 'success');
  }
}

async function deleteProjectStatus(statusId) {
  if (!statusId || !hasDepartmentRole()) return;
  var pName = _activeProject;
  if (!pName || pName.toLowerCase() === 'all' || pName.toLowerCase() === 'all tasks') {
    if (typeof showToast === 'function') showToast('Please select a project first.', 'warning');
    return;
  }
  var pKey = pName.toLowerCase().trim();
  var statuses = getProjectStatuses(pName);
  var statusObj = statuses.find(function(s) { return s.id.toLowerCase() === statusId.toLowerCase(); });
  if (!statusObj) return;

  if (statuses.length <= 1) {
    if (typeof showToast === 'function') showToast('A project must have at least one status column.', 'warning');
    return;
  }

  var affectedTasks = _allLoadedTasks.filter(function(t) {
    if (!t || _deletedTaskIds[String(t.id)]) return false;
    var taskProj = (t.project_name && t.project_name.trim()) ? t.project_name.trim() : getTaskProjectName(t);
    if (!taskProj || taskProj.toLowerCase() !== pKey) return false;
    return taskMatchesStatus(t, statusObj, pName);
  });

  if (affectedTasks.length === 0) {
    var confirmFn = (typeof showConfirmModal === 'function') ? showConfirmModal : async function() { return false; };
    var ok = await confirmFn(
      'Are you sure you want to delete status "' + statusObj.label + '"?',
      'Delete Status'
    );
    if (!ok) return;

    _projectStatusesMap[pKey] = statuses.filter(function(s) { return s.id.toLowerCase() !== statusId.toLowerCase(); });
    await saveProjectStatusesCatalog();
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
    else renderColumnsFromTasks(_allLoadedTasks);
    if (typeof showToast === 'function') showToast('Status "' + statusObj.label + '" deleted.', 'success');
    return;
  }

  openMoveTasksAndDeleteStatusModal(statusObj, affectedTasks, statuses);
}

function openEditStatusTitle(e, statusId) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (!hasDepartmentRole()) return;
  var col = getColElement(statusId);
  if (!col) return;
  var titleEl = col.querySelector('.task-col-title');
  if (!titleEl) return;

  var pName = _activeProject;
  var statuses = getProjectStatuses(pName);
  var statusObj = statuses.find(function(s) { return s.id.toLowerCase() === statusId.toLowerCase(); });
  if (!statusObj) return;

  var currentLabel = statusObj.label;
  titleEl.innerHTML = '<form class="task-col-title-edit-form" onsubmit="event.preventDefault(); saveEditStatusTitle(\'' + statusId + '\', this);" onclick="event.stopPropagation();">'
    + '<input type="text" class="task-col-title-input" value="' + (typeof escapeHtml === 'function' ? escapeHtml(currentLabel) : currentLabel) + '" maxlength="40" onkeydown="handleEditStatusKeyDown(event, \'' + statusId + '\', this)" />'
    + '<button type="submit" class="task-col-title-save-btn" title="Save" aria-label="Save">'
    +   '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    + '</button>'
    + '<button type="button" class="task-col-title-cancel-btn" onclick="cancelEditStatusTitle(event, \'' + statusId + '\')" title="Cancel" aria-label="Cancel">'
    +   '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button>'
    + '</form>';

  var inp = titleEl.querySelector('.task-col-title-input');
  if (inp) {
    inp.focus();
    inp.select();
  }
}

function handleEditStatusKeyDown(e, statusId, _inputEl) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelEditStatusTitle(e, statusId);
  }
}

function cancelEditStatusTitle(e, statusId) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  var col = getColElement(statusId);
  if (!col) return;
  var titleEl = col.querySelector('.task-col-title');
  if (!titleEl) return;
  var statuses = getProjectStatuses(_activeProject);
  var statusObj = statuses.find(function(s) { return s.id.toLowerCase() === statusId.toLowerCase(); });
  if (statusObj) {
    titleEl.textContent = statusObj.label;
  }
}

async function saveEditStatusTitle(statusId, form) {
  if (!form) return;
  var input = form.querySelector('.task-col-title-input');
  if (!input) return;
  var newLabel = input.value.trim();
  if (!newLabel) {
    if (typeof showToast === 'function') showToast('Status name cannot be empty.', 'warning');
    return;
  }
  var pName = _activeProject;
  var pKey = pName.toLowerCase().trim();
  var statuses = getProjectStatuses(pName).slice();
  var statusObj = statuses.find(function(s) { return s.id.toLowerCase() === statusId.toLowerCase(); });
  if (!statusObj) return;

  var oldId = statusObj.id;
  var oldLabel = statusObj.label;
  if (oldLabel === newLabel) {
    cancelEditStatusTitle(null, statusId);
    return;
  }

  var newSlug = newLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (statusObj.isCustom && newSlug) {
    statusObj.id = newSlug;
  }
  statusObj.label = newLabel;
  _projectStatusesMap[pKey] = statuses;
  await saveProjectStatusesCatalog();

  var tasksToUpdate = _allLoadedTasks.filter(function(t) {
    if (!t || _deletedTaskIds[String(t.id)]) return false;
    var taskProj = (t.project_name && t.project_name.trim()) ? t.project_name.trim() : getTaskProjectName(t);
    if (!taskProj || taskProj.toLowerCase() !== pKey) return false;
    var tStat = String(t.status || '').toLowerCase().trim();
    return tStat === oldLabel.toLowerCase().trim() || tStat === oldId.toLowerCase().trim() || tStat === statusId.toLowerCase().trim();
  });
  if (tasksToUpdate.length > 0) {
    tasksToUpdate.forEach(function(t) {
      t.status = statusObj.id;
      if (_taskMap[t.id]) _taskMap[t.id].status = statusObj.id;
    });
    var client = getSupaClient();
    if (client) {
      var remoteTasks = tasksToUpdate.filter(function(t) { return !String(t.id).startsWith('temp_'); });
      if (remoteTasks.length > 0) {
        await Promise.allSettled(remoteTasks.map(function(t) {
          return client.patch('bb_tasks?id=eq.' + encodeURIComponent(t.id), { status: statusObj.id });
        }));
      }
    }
  }

  if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
  if (typeof showToast === 'function') {
    showToast('Status renamed to "' + newLabel + '".', 'success');
  }
}

function openAddStatusInline(btn) {
  var card = btn ? btn.closest('.task-add-status-card') : document.querySelector('.task-add-status-card');
  if (!card) return;
  card.innerHTML = '<div class="task-add-status-inline-form">'
    + '<input type="text" class="task-add-status-input" placeholder="Status name..." maxlength="40" onkeydown="handleAddStatusKeyDown(event, this)" autofocus />'
    + '<div class="task-add-status-actions">'
    +   '<button type="button" class="task-add-status-confirm-btn" onclick="confirmAddStatus(this)" title="Create Status">Add</button>'
    +   '<button type="button" class="task-add-status-cancel-btn" onclick="cancelAddStatus(this)" title="Cancel">Cancel</button>'
    + '</div>'
    + '</div>';
  var inp = card.querySelector('.task-add-status-input');
  if (inp) inp.focus();
}

function cancelAddStatus(btn) {
  var card = btn ? btn.closest('.task-add-status-card') : document.querySelector('.task-add-status-card');
  if (!card) return;
  card.innerHTML = '<button type="button" class="task-add-status-btn" onclick="openAddStatusInline(this)">'
    + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    + '<span>Status</span>'
    + '</button>';
}

function handleAddStatusKeyDown(e, inputEl) {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmAddStatus(inputEl);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelAddStatus(inputEl);
  }
}

async function confirmAddStatus(btnOrInput) {
  var card = null;
  if (btnOrInput) {
    if (typeof btnOrInput.closest === 'function') {
      card = btnOrInput.closest('.task-add-status-card');
    } else {
      card = btnOrInput;
    }
  }
  if (!card && typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    card = document.querySelector('.task-add-status-card');
  }
  if (!card) return;
  var input = card.querySelector('.task-add-status-input');
  if (!input) return;
  var val = input.value.trim();
  if (!val) {
    if (typeof showToast === 'function') showToast('Please enter a status name.', 'warning');
    input.focus();
    return;
  }
  var pName = _activeProject;
  if (!pName || pName.toLowerCase() === 'all' || pName.toLowerCase() === 'all tasks') {
    if (typeof showToast === 'function') showToast('Please select a project first.', 'warning');
    return;
  }
  var pKey = pName.toLowerCase().trim();
  var statuses = getProjectStatuses(pName).slice();

  var exists = statuses.some(function(s) {
    return s.label.toLowerCase() === val.toLowerCase();
  });
  if (exists) {
    if (typeof showToast === 'function') showToast('A status named "' + val + '" already exists in this project.', 'warning');
    input.focus();
    return;
  }

  var slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || statuses.some(function(s) { return s.id.toLowerCase() === slug; })) {
    slug = (slug || 'status') + '-' + Date.now().toString(36).slice(-4);
  }

  var newStatus = {
    id: slug,
    label: val,
    isCustom: true
  };
  statuses.push(newStatus);
  _projectStatusesMap[pKey] = statuses;
  await saveProjectStatusesCatalog();

  if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
  if (typeof showToast === 'function') {
    showToast('Status "' + val + '" created.', 'success');
  }
}

async function reorderProjectStatuses(fromIndex, toIndex) {
  var pName = _activeProject;
  if (!pName || pName.toLowerCase() === 'all' || pName.toLowerCase() === 'all tasks') return;
  var pKey = pName.toLowerCase().trim();
  var statuses = getProjectStatuses(pName).slice();
  if (fromIndex < 0 || fromIndex >= statuses.length || toIndex < 0 || toIndex >= statuses.length) return;
  var moved = statuses.splice(fromIndex, 1)[0];
  statuses.splice(toIndex, 0, moved);
  _projectStatusesMap[pKey] = statuses;
  await saveProjectStatusesCatalog();
  if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
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
    return '<span class="task-card-avatar" style="width:' + sz + 'px;height:' + sz + 'px;min-width:' + sz + 'px;min-height:' + sz + 'px;aspect-ratio:1/1;flex-shrink:0;font-size:' + fs + 'px;background:var(--surface-tint-hover);color:var(--text-muted);cursor:default;line-height:1;' + styleAttr + '" title="Unassigned" aria-label="Unassigned">U</span>';
  }

  // Cross-resolve member identity so name or IC or email resolves canonically
  var cleanName = String(name || '').trim();
  var cleanIc = String(ic || '').trim();
  if (cleanName.toLowerCase() === 'jeshua koh' || cleanIc.toLowerCase().startsWith('archived_')) {
    if (typeof isPortalCreator === 'function' && isPortalCreator(cleanName, cleanIc)) {
      cleanIc = 'jeshuakoh2008@gmail.com';
    }
  }
  if (cleanName && (!cleanIc || cleanIc.indexOf('@') === -1)) {
    if (typeof isPortalCreator === 'function' && isPortalCreator(cleanName, cleanIc)) {
      cleanIc = 'jeshuakoh2008@gmail.com';
    } else {
      var resolver = (typeof resolveMemberDirectoryInfo === 'function')
        ? resolveMemberDirectoryInfo
        : (typeof window !== 'undefined' && typeof window.resolveMemberDirectoryInfo === 'function' ? window.resolveMemberDirectoryInfo : null);
      if (resolver) {
        var dirMember = resolver(cleanName || cleanIc);
        if (dirMember && (typeof isDeletedOrTestAccount !== 'function' || !isDeletedOrTestAccount(dirMember))) {
          if (!cleanName && dirMember.name) cleanName = dirMember.name;
          if (!cleanIc && (dirMember.email || dirMember.ic)) cleanIc = dirMember.email || dirMember.ic;
        }
      }
    }
  }

  var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(cleanName, cleanIc) : /jeshua\s+koh/i.test(cleanName);
  var safeName = (typeof escapeHtml === 'function') ? escapeHtml(cleanName) : cleanName;
  var tooltip = safeName + (isCreator ? ' (Portal Creator)' : '');
  var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(cleanName, cleanIc) : null;
  if (!photoUrl) {
    var pMap = (typeof _memberPfpsMap !== 'undefined' && _memberPfpsMap)
      ? _memberPfpsMap
      : ((typeof window !== 'undefined' && window._memberPfpsMap)
        ? window._memberPfpsMap
        : ((typeof global !== 'undefined' && global._memberPfpsMap)
          ? global._memberPfpsMap
          : null));
    if (pMap) {
      if (cleanIc && pMap[cleanIc.toLowerCase()]) photoUrl = pMap[cleanIc.toLowerCase()];
      else if (cleanName && pMap[cleanName.toLowerCase()]) photoUrl = pMap[cleanName.toLowerCase()];
    }
  }

  var outlineInfo = (typeof getMemberAvatarOutline === 'function')
    ? getMemberAvatarOutline(cleanIc || cleanName, cleanName)
    : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);
  if (!outlineInfo) {
    outlineInfo = isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : { style: 'none' };
  }

  var outlineHtml = '';
  var hasOutlineCls = '';
  if (outlineInfo && outlineInfo.style && outlineInfo.style !== 'none' && outlineInfo.config && outlineInfo.config.className) {
    hasOutlineCls = ' has-custom-outline avatar-outline-container';
    outlineHtml = '<span class="avatar-outline-overlay ' + outlineInfo.config.className + '" style="position:absolute;inset:0;border-radius:9999px;pointer-events:none;z-index:2;box-sizing:border-box;" aria-hidden="true"></span>';
  }

  var cosmeticInfo = (typeof getMemberCosmetic === 'function')
    ? getMemberCosmetic(cleanIc || cleanName, cleanName)
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
    pInfo = getMemberPresenceStatus({ name: cleanName, email: cleanIc, ic: cleanIc });
  } else if (typeof window !== 'undefined' && typeof window.getMemberPresenceStatus === 'function') {
    pInfo = window.getMemberPresenceStatus({ name: cleanName, email: cleanIc, ic: cleanIc });
  } else {
    pInfo = { status: 'offline', label: 'Offline', color: '#6b7280' };
  }
  var dotColor = (pInfo && pInfo.color) ? pInfo.color : '#6b7280';
  var dotLabel = (pInfo && pInfo.label) ? pInfo.label : 'Offline';
  var pStatus = (pInfo && pInfo.status) ? pInfo.status : 'offline';
  var dotTitle = safeName + ' (' + dotLabel + ')';
  var dotSz = Math.max(8, Math.round(sz * 0.32));
  var presId = (cleanIc && cleanIc.indexOf('@') !== -1) ? cleanIc : (cleanIc || cleanName);
  var dotHtml = '<span class="nav-avatar-status-dot avatar-status-dot status-' + pStatus + '" data-presence-id="' + (typeof escapeHtml === 'function' ? escapeHtml(presId) : presId) + '" data-presence-name="' + (typeof escapeHtml === 'function' ? escapeHtml(cleanName) : cleanName) + '" style="position:absolute;bottom:-1px;right:-1px;width:' + dotSz + 'px;height:' + dotSz + 'px;border-radius:9999px;background:' + dotColor + ';border:1.5px solid var(--bg-card,#1e293b);z-index:99;box-sizing:border-box;" title="' + (typeof escapeHtml === 'function' ? escapeHtml(dotTitle) : dotTitle) + '" aria-label="' + (typeof escapeHtml === 'function' ? escapeHtml(dotLabel) : dotLabel) + '"></span>';

  var overflowRule = 'visible';

  if (photoUrl) {
    return '<span class="task-card-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;min-width:' + sz + 'px;min-height:' + sz + 'px;aspect-ratio:1/1;flex-shrink:0;padding:0;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '"><img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;border-radius:9999px;display:block;" alt="' + safeName + '"/>' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  if (isCreator) {
    var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
    var creatorCls = isRgb ? ' creator-outline-avatar creator-rgb-avatar' : '';
    return '<span class="task-card-avatar' + creatorCls + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;min-width:' + sz + 'px;min-height:' + sz + 'px;aspect-ratio:1/1;flex-shrink:0;font-size:' + fs + 'px;background:#083830;color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '">J' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  var initial = (typeof getMemberAvatarInitial === 'function') ? getMemberAvatarInitial(cleanName) : (cleanName.trim().charAt(0).toUpperCase() || '?');
  var color = (typeof getMemberAvatarColor === 'function') ? getMemberAvatarColor(cleanName) : getAssigneeAvatarBg(cleanName);
  return '<span class="task-card-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;min-width:' + sz + 'px;min-height:' + sz + 'px;aspect-ratio:1/1;flex-shrink:0;font-size:' + fs + 'px;background:' + color + ';color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;box-sizing:border-box;' + styleAttr + '" title="' + tooltip + '" aria-label="' + tooltip + '">' + (typeof escapeHtml === 'function' ? escapeHtml(initial) : initial) + outlineHtml + cosmeticHtml + dotHtml + '</span>';
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
  if (typeof document !== 'undefined') {
    if (_tasksViewMode === 'projects' || _projectDisplayMode === 'list') {
      var bEl = document.getElementById('tasks-columns');
      if (bEl) setElementDisplayNone(bEl);
      var cTabs = document.getElementById('task-col-tabs');
      if (cTabs) setElementDisplayNone(cTabs);
      return;
    }
    var lView = document.querySelector('.tasks-board-list-view');
    if (lView) setElementDisplayNone(lView);
  }
  tasksList = deduplicateTasks(tasksList);
  var pName = _activeProject || '';
  var activeLower = pName ? pName.toLowerCase().trim() : '';
  var statuses = getProjectStatuses(pName);

  var boardEl = document.getElementById('tasks-columns');
  if (boardEl) {
    var existingCols = (boardEl.querySelectorAll ? boardEl.querySelectorAll('.task-col[data-col-status]') : []);
    var existingIds = Array.from(existingCols).map(function(c) { return c.getAttribute('data-col-status'); }).join(',');
    var targetIds = statuses.map(function(s) { return s.id; }).join(',');
    var existingLabels = Array.from(boardEl.querySelectorAll ? boardEl.querySelectorAll('.task-col-title') : []).map(function(t) { return t.textContent.trim(); }).join('|');
    var targetLabels = statuses.map(function(s) { return s.label.trim(); }).join('|');
    var hasAddBtn = !!(boardEl.querySelector && boardEl.querySelector('.task-add-status-card'));

    if (existingIds !== targetIds || existingLabels !== targetLabels || !hasAddBtn) {
      var columnsHtml = '';
      statuses.forEach(function(st, idx) {
        var isMobileActive = idx === 0;
        var colIdAttr = (st.id === 'todo') ? 'id="taskcol-todo" ' : ((st.id === 'inprogress') ? 'id="taskcol-inprogress" ' : ((st.id === 'completed') ? 'id="taskcol-done" ' : ('id="taskcol-' + st.id + '" ')));
        var bodyIdAttr = (st.id === 'todo') ? 'id="col-todo" ' : ((st.id === 'inprogress') ? 'id="col-inprogress" ' : ((st.id === 'completed') ? 'id="col-done" ' : ('id="col-' + st.id + '" ')));
        var countIdAttr = (st.id === 'todo') ? 'id="count-todo" ' : ((st.id === 'inprogress') ? 'id="count-inprogress" ' : ((st.id === 'completed') ? 'id="count-done" ' : ('id="count-' + st.id + '" ')));

        columnsHtml += '<div class="task-col' + (isMobileActive ? ' mobile-active' : '') + '" ' + colIdAttr + 'data-col-status="' + st.id + '">'
          + '<div class="task-col-header" data-header-status="' + st.id + '">'
          +   '<div class="task-col-title" ondblclick="openEditStatusTitle(event, \'' + st.id + '\')" title="Double click to rename status">' + (typeof escapeHtml === 'function' ? escapeHtml(st.label) : st.label) + '</div>'
          +   '<span class="task-col-count-badge' + (st.isCustom ? ' custom-status-badge' : '') + '" ' + countIdAttr + 'data-col-count="' + st.id + '">0</span>'
          +   '<button type="button" class="task-col-delete-btn" onclick="event.stopPropagation(); deleteProjectStatus(\'' + st.id + '\')" title="Delete status" aria-label="Delete status">'
          +     '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
          +   '</button>'
          +   '<button type="button" class="task-col-quick-add" onclick="openCreateTaskModal(\'' + st.id + '\')" title="Add task to ' + (typeof escapeHtml === 'function' ? escapeHtml(st.label) : st.label) + '">'
          +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
          +   '</button>'
          + '</div>'
          + '<div class="task-col-body" ' + bodyIdAttr + 'data-col-body="' + st.id + '"></div>'
          + '</div>';
      });

      columnsHtml += '<div class="task-col-add-status-wrapper">'
        + '<div class="task-add-status-card">'
        +   '<button type="button" class="task-add-status-btn" onclick="openAddStatusInline(this)" title="Add new status">'
        +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        +     '<span>Status</span>'
        +   '</button>'
        + '</div>'
        + '</div>';

      boardEl.innerHTML = columnsHtml;
    } else {
      statuses.forEach(function(st) {
        var col = getColElement(st.id);
        if (col) {
          var header = col.querySelector('.task-col-header');
          if (header) {
            header.setAttribute('data-header-status', st.id);
            var titleEl = header.querySelector('.task-col-title');
            if (titleEl && !titleEl.querySelector('input')) {
              titleEl.textContent = st.label;
              titleEl.setAttribute('ondblclick', "openEditStatusTitle(event, '" + st.id + "')");
              titleEl.title = 'Double click to rename status';
            }
            if (!header.querySelector('.task-col-delete-btn')) {
              var delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'task-col-delete-btn';
              delBtn.setAttribute('onclick', "event.stopPropagation(); deleteProjectStatus('" + st.id + "')");
              delBtn.title = 'Delete status';
              delBtn.setAttribute('aria-label', 'Delete status');
              delBtn.innerHTML = '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
              var quickAdd = header.querySelector('.task-col-quick-add');
              if (quickAdd) header.insertBefore(delBtn, quickAdd);
              else header.appendChild(delBtn);
            }
          }
        }
      });
    }
  }

  var colTabs = document.getElementById('task-col-tabs');
  if (colTabs) {
    var existingTabs = colTabs.querySelectorAll('.task-col-tab[data-tab-status]');
    var existingTabIds = Array.from(existingTabs).map(function(t) { return t.getAttribute('data-tab-status'); }).join(',');
    var targetTabIds = statuses.map(function(s) { return s.id; }).join(',');
    if (existingTabIds !== targetTabIds) {
      var tabsHtml = '';
      statuses.forEach(function(st, idx) {
        var isTabActive = idx === 0;
        var tabCountId = (st.id === 'todo') ? 'id="tab-count-todo" ' : ((st.id === 'inprogress') ? 'id="tab-count-inprogress" ' : ((st.id === 'completed') ? 'id="tab-count-done" ' : ('id="tab-count-' + st.id + '" ')));
        tabsHtml += '<button class="task-col-tab' + (isTabActive ? ' mobile-active' : '') + '" data-tab-status="' + st.id + '" onclick="switchTaskTab(\'' + st.id + '\', this)">'
          + (typeof escapeHtml === 'function' ? escapeHtml(st.label) : st.label) + ' <span ' + tabCountId + 'data-tab-count="' + st.id + '"></span>'
          + '</button>';
      });
      colTabs.innerHTML = tabsHtml;
    }
  }

  var cols = {};
  statuses.forEach(function(st) {
    cols[st.id] = [];
  });
  (tasksList || []).forEach(function(t) {
    if (activeLower && activeLower !== 'all' && activeLower !== 'all tasks') {
      var taskProj = (t.project_name && t.project_name.trim()) ? t.project_name.trim().toLowerCase() : getTaskProjectName(t).toLowerCase();
      if (taskProj !== activeLower) return;
    }
    var matched = false;
    for (var i = 0; i < statuses.length; i++) {
      if (taskMatchesStatus(t, statuses[i], pName)) {
        cols[statuses[i].id].push(t);
        matched = true;
        break;
      }
    }
    if (!matched) {
      var fallbackId = cols.todo ? 'todo' : statuses[0].id;
      if (cols[fallbackId]) cols[fallbackId].push(t);
    }
  });

  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);

  statuses.forEach(function(st) {
    var el   = getColBody(st.id);
    var cnt  = getColCount(st.id);
    var tcnt = getTabCount(st.id);

    var itemsInCol = cols[st.id] || [];
    var statusItems = itemsInCol.filter(function(t) {
      if (!_taskSearchQuery) return true;
      var matchTitle = (t.title || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchAss   = (t.assignee_name || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(_taskSearchQuery) !== -1;
      return matchTitle || matchDesc || matchAss || matchId;
    });

    if (cnt) cnt.textContent = String(statusItems.length);
    if (tcnt) tcnt.textContent = statusItems.length ? String(statusItems.length) : '';
    if (!el) return;

    var cardsHtml = statusItems.map(function(t, idx) {
      if (!/^[\w-]+$/.test(t.id || '')) return '';
      _taskMap[t.id] = t;
      if (typeof window !== 'undefined') window._taskMap[t.id] = t;

      var taskId = formatTaskId(t, idx);
      var taskPName = getTaskProjectName(t) || (_activeProject && _activeProject !== 'All Tasks' ? _activeProject : '');
      var projectPillHtml = '';
      if (taskPName && taskPName.toLowerCase() !== 'all' && taskPName.toLowerCase() !== 'all tasks') {
        var safeProj = (typeof escapeHtml === 'function') ? escapeHtml(taskPName) : taskPName;
        projectPillHtml = '<span class="task-card-project-pill">' + safeProj + '</span>';
      }

      var priorityP = ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium';
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

      var taskEst = getTaskEstimate(t);
      var estimateHtml = '';
      if (taskEst) {
        var safeEst = (typeof escapeHtml === 'function') ? escapeHtml(taskEst) : taskEst;
        estimateHtml = '<span class="task-card-estimate-pill" title="Estimated time">'
          + '<svg class="ui-icon-xs" width="11" height="11" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
          + '<span>' + safeEst + '</span>'
          + '</span>';
      } else {
        estimateHtml = '<span class="task-card-estimate-spacer"></span>';
      }

      return '<div class="task-card" draggable="' + canManageTaskDepartment(t.department || getTaskProjectName(t)) + '" data-task-id="' + t.id + '" onclick="openTaskDetail(\'' + t.id + '\')">'
        + '<div class="task-card-id-tag">' + taskId + '</div>'
        + '<div class="task-card-title">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
        + metaRowHtml
        + '<div class="task-card-footer">'
        +   '<div class="task-card-footer-left">' + estimateHtml + '</div>'
        +   '<div class="task-card-footer-right">' + priorityChevron + avatarHtml + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    var bottomAddBtn = '<button type="button" class="task-col-add-bottom-btn" onclick="openCreateTaskModal(\'' + st.id + '\')">'
      + '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '<span>Add Task</span>'
      + '</button>';

    if (!statusItems.length) {
      cardsHtml = '<div class="task-col-empty"><div class="task-col-empty-text">No tasks</div></div>';
    }
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

  if (_tasksViewMode === 'projects') {
    if (boardCol) setElementDisplayNone(boardCol);
    if (colTabs) setElementDisplayNone(colTabs);
    if (listView) setElementDisplayNone(listView);
    return;
  }

  if (_projectDisplayMode === 'list') {
    if (boardCol) setElementDisplayNone(boardCol);
    if (colTabs) setElementDisplayNone(colTabs);
    if (listView) showElementDisplay(listView, 'block');
    renderTasksListView(_activeProject);
  } else {
    if (listView) setElementDisplayNone(listView);
    if (boardCol) showElementDisplay(boardCol, 'flex');
    if (colTabs) showElementDisplay(colTabs, (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'flex' : 'none');
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
    else renderColumnsFromTasks(_allLoadedTasks);
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

  if (_tasksViewMode === 'projects') {
    setElementDisplayNone(listView);
    return;
  }

  // Ensure board columns and column tabs are strictly hidden when in list view
  var boardCol = document.getElementById('tasks-columns');
  if (boardCol) setElementDisplayNone(boardCol);
  var colTabs = document.getElementById('task-col-tabs');
  if (colTabs) setElementDisplayNone(colTabs);
  showElementDisplay(listView, 'block');

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

  var pStatuses = getProjectStatuses(pName);
  var sections = pStatuses.map(function(st) {
    return {
      id: st.id,
      key: st.id,
      label: st.label,
      isCustom: !!st.isCustom,
      color: st.color || (st.isCustom ? 'var(--text-secondary, #94a3b8)' : '#64748b'),
      dotBg: st.color || (st.isCustom ? 'var(--text-secondary, #94a3b8)' : '#64748b')
    };
  });

  var sectionTaskMap = {};
  sections.forEach(function(sec) {
    sectionTaskMap[sec.id] = [];
  });

  (tasks || []).forEach(function(t) {
    var matched = false;
    for (var i = 0; i < sections.length; i++) {
      if (taskMatchesStatus(t, sections[i], pName)) {
        sectionTaskMap[sections[i].id].push(t);
        matched = true;
        break;
      }
    }
    if (!matched) {
      var fallbackSec = sections.find(function(s) { return s.id === 'todo'; }) || sections[0];
      if (fallbackSec && sectionTaskMap[fallbackSec.id]) {
        sectionTaskMap[fallbackSec.id].push(t);
      }
    }
  });

  var html = '<div class="proj-list-wrapper">';

  sections.forEach(function(sec) {
    var secTasks = sectionTaskMap[sec.id] || [];

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
        if (!/^[\w-]+$/.test(t.id || '')) return;
        _taskMap[t.id] = t;
        if (typeof window !== 'undefined') {
          window._taskMap = window._taskMap || {};
          window._taskMap[t.id] = t;
        }
        var tidFormatted = formatTaskId(t, idx);
        var prioIcon = getPriorityIconSvg(t.priority || 'medium', 13);
        var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(t.title || '') : (t.title || '');
        var safeAssignee = (typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name || 'Unassigned') : (t.assignee_name || 'Unassigned');
        var assigneeAvatar = getAssigneeAvatarHtml(t.assignee_name, t.assignee_ic, 22);

        var dueStr = formatTaskDueDateStr(t.due_date);
        var isDone = isTaskCompleted(t, pName);
        var dueBadgeCls = getTaskDueBadgeClass(t.due_date, isDone);

        var est = t.estimate || '';
        if (!est && t.description) {
          var estMatch = t.description.match(/\[Estimate:\s*([^\]|]+)/i);
          if (estMatch && estMatch[1]) est = estMatch[1].trim();
        }

        var pillCls = 'proj-list-status-pill status-' + (typeof escapeHtml === 'function' ? escapeHtml(sec.key) : sec.key);
        if (sec.key === 'complete' || sec.key === 'done') pillCls += ' status-completed';
        var customStyle = '';
        if (sec.isCustom && !['planning', 'todo', 'inprogress', 'inreview', 'completed', 'complete', 'done'].includes(sec.key)) {
          customStyle = ' style="background:rgba(148, 163, 184, 0.15);color:var(--text-secondary, #94a3b8);border:1px solid rgba(148, 163, 184, 0.3);"';
        }

        html += '<tr class="proj-list-row" onclick="openTaskDetail(\'' + t.id + '\')" role="button" tabindex="0">' +
          '<td class="col-name">' +
            '<div class="proj-list-cell-name">' +
              '<span class="proj-task-id-badge">' + tidFormatted + '</span>' +
              '<span class="proj-task-title-text">' + safeTitle + '</span>' +
            '</div>' +
          '</td>' +
          '<td class="col-status">' +
            '<span class="' + pillCls + '"' + customStyle + '>' + escapeHtml(sec.label) + '</span>' +
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
    _tasksViewMode = 'board';
  }

  if (_tasksViewMode === 'projects') {
    var boardColEl = document.getElementById('tasks-columns');
    if (boardColEl) {
      boardColEl.style.display = 'none';
      boardColEl.classList.add('hidden');
    }
    return;
  }

  var boardCol   = document.getElementById('tasks-columns');
  var colTabs    = document.getElementById('task-col-tabs');
  var noProjEl   = document.querySelector('.tasks-no-project-placeholder');
  var projToggle = document.querySelector('.project-board-view-toggle');
  var listView   = document.querySelector('.tasks-board-list-view');

  var hasActiveProject = !!(_activeProject && _activeProject.toLowerCase() !== 'all tasks' && _activeProject.toLowerCase() !== 'all');
  if (!hasActiveProject) {
    if (boardCol) {
      boardCol.style.display = 'none';
      boardCol.classList.add('hidden');
    }
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
    if (boardCol) setElementDisplayNone(boardCol);
    if (colTabs) setElementDisplayNone(colTabs);
    if (listView) showElementDisplay(listView, 'block');
  } else {
    if (listView) setElementDisplayNone(listView);
    if (boardCol) showElementDisplay(boardCol, 'flex');
    if (colTabs) showElementDisplay(colTabs, (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'flex' : 'none');
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
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
  }

  // 2. Background fetch and refresh
  await fetchAllRemoteTasks(true);
}

/**
 * Live re-renders the current Projects & Tasks view in real-time (Google Docs style)
 * @param {string} [affectedTaskId]
 */
function refreshCurrentTasksView(affectedTaskId) {
  if (typeof document === 'undefined') return;
  var pTasks = document.getElementById('page-tasks');
  var isTasksActive = pTasks && (pTasks.classList.contains('active') || (pTasks.style && pTasks.style.display !== 'none'));
  if (isTasksActive) {
    if (_tasksViewMode === 'mytasks') {
      var prContainerM = document.querySelector('.projects-container');
      if (prContainerM) setElementDisplayNone(prContainerM);
      if (typeof renderMyTasksView === 'function') renderMyTasksView();
    } else if (_tasksViewMode === 'board') {
      var prContainerB = document.querySelector('.projects-container');
      if (prContainerB) setElementDisplayNone(prContainerB);
      var bCol = document.getElementById('tasks-columns');
      var lView = document.querySelector('.tasks-board-list-view');
      var cTabs = document.getElementById('task-col-tabs');
      if (_projectDisplayMode === 'list') {
        if (bCol) setElementDisplayNone(bCol);
        if (cTabs) setElementDisplayNone(cTabs);
        if (lView) showElementDisplay(lView, 'block');
        if (typeof renderTasksListView === 'function') {
          renderTasksListView(_activeProject);
        }
      } else {
        if (lView) setElementDisplayNone(lView);
        if (bCol) showElementDisplay(bCol, 'flex');
        if (cTabs) showElementDisplay(cTabs, (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'flex' : 'none');
        if (typeof renderColumnsFromTasks === 'function') {
          if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
          else renderColumnsFromTasks(_allLoadedTasks);
        }
      }
    } else if (_tasksViewMode === 'projects') {
      var prContainer = document.querySelector('.projects-container');
      if (prContainer) showElementDisplay(prContainer, 'block');
      if (prContainer && typeof paintProjectsList === 'function') paintProjectsList(prContainer);
      var bColP = document.getElementById('tasks-columns');
      if (bColP) setElementDisplayNone(bColP);
      var lViewP = document.querySelector('.tasks-board-list-view');
      if (lViewP) setElementDisplayNone(lViewP);
      var cTabsP = document.getElementById('task-col-tabs');
      if (cTabsP) setElementDisplayNone(cTabsP);
    }
  }

  var admOverlay = document.getElementById('admin-overlay');
  var admPanel = document.getElementById('admin-panel');
  var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
  var admTasksRenderer = (typeof window !== 'undefined' && typeof window.renderAdminTasks === 'function')
    ? window.renderAdminTasks
    : (typeof renderAdminTasks === 'function' ? renderAdminTasks : null);
  if (isAdmOpen && admTasksRenderer) {
    try { admTasksRenderer(_adminTaskFilter); } catch (_) {}
  }

  // Update open task detail modal in-place if viewing the affected task
  var activeModalId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
  if (activeModalId && (!affectedTaskId || String(activeModalId) === String(affectedTaskId))) {
    var curT = (typeof window !== 'undefined' && window._taskMap && window._taskMap[activeModalId]) || _taskMap[activeModalId];
    if (!curT) curT = _allLoadedTasks.find(function(t) { return String(t.id) === String(activeModalId); });
    if (curT) {
      var modalTitle = document.getElementById('tdm-title');
      if (modalTitle && document.activeElement !== modalTitle && curT.title) {
        modalTitle.textContent = curT.title;
      }
      var modalDesc = document.getElementById('tdm-desc');
      if (modalDesc && document.activeElement !== modalDesc) {
        var cleanDesc = (curT.description || '').replace(/\s*\[(Project:[^\]|]*|Estimate:[^\]|]*)[^\]]*\]/gi, '').trim();
        modalDesc.innerHTML = formatTaskDescriptionMentions(cleanDesc);
      }
      if (curT.status) {
        var normStatus = normalizeTaskStatus(curT.status);
        var sConf = STATUS_CONFIG[normStatus] || { label: normStatus, color: '#3b82f6' };
        var statusDot = document.querySelector('.tdm-status-dot');
        if (statusDot) statusDot.style.background = sConf.color;
        var statusText = document.querySelector('.tdm-status-text');
        if (statusText) statusText.textContent = sConf.label;
      }
      if (curT.priority) {
        var priorityVal = (curT.priority || 'medium').toLowerCase();
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
      }
      if (curT.due_date !== undefined) {
        var dueStr = formatTaskDueDateStr(curT.due_date);
        var dueEl = document.getElementById('tdm-due');
        if (dueEl) dueEl.textContent = dueStr;
        var dueInput = document.querySelector('.tdm-due-input');
        if (dueInput) {
          dueInput.value = (curT.due_date && typeof curT.due_date === 'string') ? curT.due_date.split('T')[0] : '';
        }
      }
      var estValEl = document.querySelector('.tdm-estimate-val');
      if (estValEl) {
        estValEl.textContent = getTaskEstimate(curT) || 'Estimate';
      }
    } else if (_deletedTaskIds[String(activeModalId)] || (_allLoadedTasks && _allLoadedTasks.length > 0)) {
      if (typeof closeTaskDetail === 'function') closeTaskDetail();
      if (typeof showToast === 'function') showToast('This task is no longer available.', 'info');
    }
  }
}

/**
 * Fetches all tasks from Supabase and synchronizes in-memory collection
 * @param {boolean} [andRerender]
 */
async function fetchAllRemoteTasks(andRerender) {
  var client = getSupaClient();
  if (!client) return _allLoadedTasks;
  try {
    var tasks = await client.get('bb_tasks?order=created_at.asc');
    if (Array.isArray(tasks)) {
      tasks = tasks.filter(function(t) { return t && !_deletedTaskIds[String(t.id)]; });
      var pendingTemp = _allLoadedTasks.filter(function(t) {
        if (!t || !String(t.id).startsWith('temp_') || _deletedTaskIds[String(t.id)]) return false;
        var tKey = String(t.title || '').trim().toLowerCase();
        var tProj = (t.project_name || getTaskProjectName(t) || '').trim().toLowerCase();
        return !tasks.some(function(r) {
          if (!r || !r.title) return false;
          var rKey = String(r.title).trim().toLowerCase();
          var rProj = (r.project_name || getTaskProjectName(r) || '').trim().toLowerCase();
          return rKey === tKey && (!tProj || !rProj || rProj === tProj);
        });
      });
      _allLoadedTasks = deduplicateTasks(tasks.concat(pendingTemp));
      _taskMap = {};
      _allLoadedTasks.forEach(function(t) {
        _taskMap[t.id] = t;
        if (!t.estimate) {
          t.estimate = getTaskEstimate(t);
        }
        if (!t.creator_name) {
          t.creator_name = getTaskCreatorName(t);
        }
        var p = getTaskProjectName(t);
        if (p && p !== 'General Project' && !p.toLowerCase().includes('sprint') && _companyProjects.indexOf(p) === -1) {
          _companyProjects.push(p);
        }
      });
      if (typeof window !== 'undefined') window._taskMap = _taskMap;
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks)); } catch (_) {}

      // Batch prefetch of task details (attachments, subtasks, links, comments)
      fetchAllRemoteTaskDetails().catch(function() {});

      if (andRerender && typeof document !== 'undefined') {
        refreshCurrentTasksView();
      }
      fetchDepartmentMembers().catch(function() {});
      if (typeof syncTaskNotifications === 'function') {
        syncTaskNotifications(_allLoadedTasks);
      } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function') {
        window.syncTaskNotifications(_allLoadedTasks);
      }
    }
  } catch (e) {
    console.warn('fetchAllRemoteTasks error:', e);
  }
  return _allLoadedTasks;
}

/**
 * Initializes HTML5 Drag and Drop across Kanban task cards and columns
 */
function setupKanbanDragAndDrop() {
  if (typeof document === 'undefined') return;

  var cards = document.querySelectorAll('.task-card[draggable="true"]');
  cards.forEach(function(card) {
    if (card._dragBound) return;
    card._dragBound = true;
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
      if (!_draggedTaskId) return;
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
      var tid = _draggedTaskId;
      if (!tid) return;

      var targetStatus = col.getAttribute('data-col-status');
      memberUpdateTaskStatus(tid, targetStatus, _currentDeptFilter);
    });
  });

  var headers = document.querySelectorAll('.task-col-header[data-header-status]');
  headers.forEach(function(header) {
    if (header._hdrDragBound) return;
    header._hdrDragBound = true;
    header.setAttribute('draggable', 'true');
    header.addEventListener('dragstart', function(e) {
      var sId = header.getAttribute('data-header-status');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/status-id', sId);
        e.dataTransfer.effectAllowed = 'move';
      }
    });
    header.addEventListener('dragover', function(e) {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf('text/status-id') !== -1) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    header.addEventListener('drop', function(e) {
      var srcId = e.dataTransfer ? e.dataTransfer.getData('text/status-id') : null;
      if (!srcId) return;
      e.preventDefault();
      var targetId = header.getAttribute('data-header-status');
      if (!targetId || srcId === targetId) return;
      var statuses = getProjectStatuses(_activeProject);
      var fromIdx = statuses.findIndex(function(s) { return s.id.toLowerCase() === srcId.toLowerCase(); });
      var toIdx = statuses.findIndex(function(s) { return s.id.toLowerCase() === targetId.toLowerCase(); });
      if (fromIdx !== -1 && toIdx !== -1) {
        reorderProjectStatuses(fromIdx, toIdx);
      }
    });
  });
}

/**
 * Renders the "My Tasks" view (Image 4) with filter chips and interactive table
 */
function handleMyTasksSearchInput(val) {
  _taskSearchQuery = val || '';
  filterMyTasksList(_taskSearchQuery);
}

function filterMyTasksList(query) {
  _taskSearchQuery = query || '';
  var q = (_taskSearchQuery || '').toLowerCase().trim();
  var rows = document.querySelectorAll('.my-tasks-table-row');
  var card = document.querySelector('.my-tasks-table-card');
  if (rows.length && card) {
    var visibleCount = 0;
    rows.forEach(function(row) {
      var txt = row.textContent.toLowerCase();
      var matches = (!q || txt.indexOf(q) !== -1);
      row.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });
    var emptyEl = card.querySelector('.my-tasks-empty-search');
    var tableContainer = card.querySelector('.my-tasks-table-container');
    if (visibleCount === 0 && q) {
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'my-tasks-empty-search';
        emptyEl.style.cssText = 'padding:36px 16px;text-align:center;color:var(--text-muted);font-size:13px;';
        card.appendChild(emptyEl);
      }
      emptyEl.textContent = 'No tasks match "' + query + '"';
      emptyEl.style.display = 'block';
      if (tableContainer) tableContainer.style.display = 'none';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      if (tableContainer) tableContainer.style.display = 'block';
    }
  } else {
    renderMyTasksView();
  }
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
    if (sbName && sbName.textContent && sbName.textContent.trim() !== 'Member' && sbName.textContent.trim() !== 'Guest Member') {
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

  function isAssignedToUser(t) {
    var aName = (t.assignee_name || '').trim().toLowerCase();
    var aIc = (t.assignee_ic || '').trim().toLowerCase();
    var sName = myName.trim().toLowerCase();
    var sIc = myIc.trim().toLowerCase();
    var sEmail = myEmail.trim().toLowerCase();

    if (aName && sName) {
      if (aName === sName || aName.indexOf(sName) !== -1 || sName.indexOf(aName) !== -1) return true;
    }
    if (aIc && sIc && aIc === sIc) return true;
    if (aIc && sEmail && aIc === sEmail) return true;
    return false;
  }

  // Filter tasks based on Scope, Status, Project, and Search Query
  var filtered = _allLoadedTasks.filter(function(t) {
    // 1. Assignment Scope filter
    if (_myTasksScopeFilter === 'me') {
      if (!isAssignedToUser(t)) return false;
    }

    // 2. Status filter ('open' vs 'completed' vs 'all')
    var normStatus = normalizeTaskStatus(t.status);
    var isDone = normStatus === 'completed';
    if (_myTasksStatusFilter === 'open' && isDone) return false;
    if (_myTasksStatusFilter === 'completed' && !isDone) return false;

    // 3. Project filter
    if (_myTasksProjectFilter && _myTasksProjectFilter !== 'all') {
      var p = getTaskProjectName(t);
      if (p.toLowerCase() !== _myTasksProjectFilter.toLowerCase()) return false;
    }

    // 4. Search query
    if (_taskSearchQuery) {
      var q = _taskSearchQuery.toLowerCase();
      var matchTitle = (t.title || '').toLowerCase().indexOf(q) !== -1;
      var matchDesc  = (t.description || '').toLowerCase().indexOf(q) !== -1;
      var matchId    = String(t.id || '').toLowerCase().indexOf(q) !== -1;
      var matchProj  = (getTaskProjectName(t) || '').toLowerCase().indexOf(q) !== -1;
      var matchAsg   = (t.assignee_name || '').toLowerCase().indexOf(q) !== -1;
      if (!matchTitle && !matchDesc && !matchId && !matchProj && !matchAsg) return false;
    }

    return true;
  });

  // Projects map for the filter dropdown
  var taskProjectsMap = { 'all': 'All Projects' };
  _allLoadedTasks.forEach(function(t) {
    var p = getTaskProjectName(t);
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') {
      taskProjectsMap[p] = p;
    }
  });
  _companyProjects.forEach(function(p) {
    if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project') {
      taskProjectsMap[p] = p;
    }
  });

  var hasNonDefaultTaskFilters = (_myTasksScopeFilter !== 'me' || _myTasksStatusFilter !== 'open' || _myTasksProjectFilter !== 'all');

  var html = '<div class="projects-overview-header">'
    + '<div>'
    +   '<h2 class="projects-overview-title">Tasks <span class="sr-only" style="display:none;">My Tasks</span></h2>'
    +   '<p class="projects-overview-sub">View and track tasks across all projects. Select a task to view its brief.</p>'
    + '</div>'
    + '<button type="button" class="task-primary-btn" onclick="openCreateTaskModal(\'todo\', true)">'
    +   '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    +   '<span>Add Task</span>'
    + '</button>'
    + '</div>'
    + '<div class="projects-search-bar my-tasks-search-bar" style="display:flex;align-items:center;gap:10px;position:relative;flex-wrap:wrap;">'
    +   '<div class="task-search-box" style="width:100%;max-width:320px;">'
    +     '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    +     '<input type="search" class="task-search-input my-tasks-search-input" style="width:100%;" placeholder="Search tasks..." value="' + (typeof escapeHtml === 'function' ? escapeHtml(_taskSearchQuery) : _taskSearchQuery) + '" oninput="handleMyTasksSearchInput(this.value)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" name="task_search_query" />'
    +   '</div>'
    +   '<div class="filter-dropdown-wrapper" style="position:relative;">'
    +     '<button type="button" class="my-tasks-filter-btn' + (hasNonDefaultTaskFilters ? ' active' : '') + '" onclick="toggleMyTasksFilterMenu(event)" title="Filter Tasks">'
    +       '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>'
    +       '<span>Filter</span>'
    +       (hasNonDefaultTaskFilters ? '<span class="filter-active-dot"></span>' : '')
    +     '</button>'
    +     '<div class="my-tasks-filter-dropdown" style="display:none;" onclick="event.stopPropagation()">'
    +       '<div class="filter-menu-header">'
    +         '<span class="filter-menu-title">Filter Tasks</span>'
    +         '<button type="button" class="filter-reset-link" onclick="resetMyTasksFilters()">Reset to Defaults</button>'
    +       '</div>'
    +       '<div class="filter-section">'
    +         '<span class="filter-section-label">Assignment</span>'
    +         '<div class="filter-chip-group">'
    +           '<button type="button" class="filter-chip-option' + (_myTasksScopeFilter === 'me' ? ' active' : '') + '" onclick="setMyTasksScopeFilter(\'me\')">Assigned to me</button>'
    +           '<button type="button" class="filter-chip-option' + (_myTasksScopeFilter === 'all' ? ' active' : '') + '" onclick="setMyTasksScopeFilter(\'all\')">All Tasks</button>'
    +         '</div>'
    +       '</div>'
    +       '<div class="filter-section" style="margin-top:10px;">'
    +         '<span class="filter-section-label">Status</span>'
    +         '<div class="filter-chip-group">'
    +           '<button type="button" class="filter-chip-option' + (_myTasksStatusFilter === 'open' ? ' active' : '') + '" onclick="setMyTasksStatusFilter(\'open\')">Open</button>'
    +           '<button type="button" class="filter-chip-option' + (_myTasksStatusFilter === 'completed' ? ' active' : '') + '" onclick="setMyTasksStatusFilter(\'completed\')">Completed</button>'
    +           '<button type="button" class="filter-chip-option' + (_myTasksStatusFilter === 'all' ? ' active' : '') + '" onclick="setMyTasksStatusFilter(\'all\')">All Statuses</button>'
    +         '</div>'
    +       '</div>'
    +       '<div class="filter-section" style="margin-top:10px;">'
    +         '<span class="filter-section-label">Project</span>'
    +         '<select class="filter-select-input" onchange="setMyTasksProjectFilter(this.value)">'
    +           Object.keys(taskProjectsMap).map(function(pk) {
                  return '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(pk) : pk) + '"' + (_myTasksProjectFilter === pk ? ' selected' : '') + '>' + (typeof escapeHtml === 'function' ? escapeHtml(taskProjectsMap[pk]) : taskProjectsMap[pk]) + '</option>';
                }).join('')
    +         '</select>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="projects-table-card my-tasks-card my-tasks-table-card">';

  if (!filtered.length) {
    html += '<div style="padding:48px 20px;text-align:center;color:var(--text-muted);">'
      + '<svg class="ui-icon-xl" style="margin:0 auto 12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      + '<div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No tasks found</div>'
      + '<div style="font-size:13px;margin-bottom:16px;">' + (_myTasksScopeFilter === 'me' ? 'You have no open tasks assigned to you. Try switching to "All Tasks" or creating a new task.' : 'Try adjusting your search query or filters.') + '</div>'
      + '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">'
      +   (_myTasksScopeFilter === 'me' ? '<button type="button" class="task-secondary-btn" onclick="setMyTasksScopeFilter(\'all\')">View All Tasks</button>' : '')
      +   '<button type="button" class="task-primary-btn" onclick="openCreateTaskModal(\'todo\', true)"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Task</button>'
      + '</div>'
      + '</div>';
  } else {
    html += '<div class="my-tasks-table-container">'
      + '<table class="my-tasks-table">'
      + '<thead>'
      +   '<tr>'
      +     '<th style="width:40px;text-align:center;"></th>'
      +     '<th style="min-width:180px;">Task</th>'
      +     '<th style="width:110px;">Status</th>'
      +     '<th style="width:130px;">Project</th>'
      +     '<th style="width:90px;">ID</th>'
      +     '<th style="width:110px;">Priority</th>'
      +     '<th style="min-width:140px;">Assignee</th>'
      +     '<th style="width:110px;">Due Date</th>'
      +     '<th style="width:90px;">Estimate</th>'
      +     '<th style="width:44px;text-align:center;"></th>'
      +   '</tr>'
      + '</thead>'
      + '<tbody>';

    filtered.forEach(function(t, idx) {
      _taskMap[t.id] = t;
      if (typeof window !== 'undefined') {
        window._taskMap = window._taskMap || {};
        window._taskMap[t.id] = t;
      }
      var normStatus = normalizeTaskStatus(t.status);
      var isDone = normStatus === 'completed';
      var taskId = formatTaskId(t, idx);
      var assigneeName = t.assignee_name || 'Unassigned';
      var projName = getTaskProjectName(t) || 'General';

      var statusLabels = {
        'todo': 'To Do',
        'planning': 'Planning',
        'in_progress': 'In Progress',
        'in_review': 'In Review',
        'completed': 'Completed'
      };
      var statusLabel = statusLabels[normStatus] || (normStatus.charAt(0).toUpperCase() + normStatus.slice(1));
      var statusPillClass = (normStatus === 'in_progress') ? 'status-inprogress' : (normStatus === 'in_review') ? 'status-inreview' : ('status-' + normStatus);

      var prioVal = (t.priority || 'medium').toLowerCase();
      var prioIcon = getPriorityIconSvg(prioVal, 13);
      var prioLabel = prioVal.charAt(0).toUpperCase() + prioVal.slice(1);

      var avatarHtml = '';
      if (t.assignee_name) {
        avatarHtml = getAssigneeAvatarHtml(assigneeName, t.assignee_ic, 20);
      } else {
        avatarHtml = '<span class="assignee-empty-avatar" style="width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.08);display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);">—</span>';
      }

      var dueStr = '—';
      if (t.due_date) {
        dueStr = formatTaskDueDateStr(t.due_date);
        if (dueStr === 'Due Date') dueStr = '—';
      }

      var estStr = '—';
      if (t.estimate) {
        estStr = t.estimate;
      } else if (t.estimated_hours) {
        estStr = t.estimated_hours + 'h';
      } else if (t.description) {
        var em = t.description.match(/\[Estimate:\s*([^\]|]+)/i);
        if (em && em[1]) estStr = em[1].trim();
      }

      html += '<tr class="my-tasks-table-row my-tasks-row" onclick="openTaskDetail(\'' + t.id + '\')">'
        + '<td style="width:40px;text-align:center;" onclick="event.stopPropagation()">'
        +   '<input type="checkbox" class="task-checkbox my-tasks-checkbox" ' + (isDone ? 'checked ' : '') + 'onclick="toggleTaskCheckbox(\'' + t.id + '\', event)" aria-label="Toggle task status" />'
        + '</td>'
        + '<td style="min-width:180px;">'
        +   '<span class="project-row-name ' + (isDone ? 'completed-task-title' : '') + '" style="' + (isDone ? 'text-decoration:line-through;color:var(--text-muted);' : 'font-weight:600;color:var(--text-primary);') + '">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</span>'
        + '</td>'
        + '<td style="width:110px;">'
        +   '<span class="my-tasks-status-pill ' + statusPillClass + '">' + statusLabel + '</span>'
        + '</td>'
        + '<td style="width:130px;">'
        +   '<div class="my-tasks-project-cell">'
        +     '<svg class="ui-icon-xs" style="width:14px;height:14px;opacity:0.75;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'
        +     '<span style="font-size:12px;font-weight:500;">' + (typeof escapeHtml === 'function' ? escapeHtml(projName) : projName) + '</span>'
        +   '</div>'
        + '</td>'
        + '<td style="width:90px;">'
        +   '<span class="task-id-badge" style="font-size:11px;color:var(--text-muted);font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(taskId) : taskId) + '</span>'
        + '</td>'
        + '<td style="width:110px;">'
        +   '<div class="my-tasks-priority-indicator priority-' + prioVal + '" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;">'
        +     prioIcon
        +     '<span>' + prioLabel + '</span>'
        +   '</div>'
        + '</td>'
        + '<td style="min-width:140px;">'
        +   '<div style="display:flex;align-items:center;gap:7px;">'
        +     avatarHtml
        +     '<span style="font-size:12px;font-weight:500;color:var(--text-primary);white-space:nowrap;">' + (typeof escapeHtml === 'function' ? escapeHtml(assigneeName) : assigneeName) + '</span>'
        +   '</div>'
        + '</td>'
        + '<td style="width:110px;">'
        +   '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:' + (dueStr !== '—' ? 'var(--text-secondary)' : 'var(--text-muted)') + ';white-space:nowrap;">'
        +     '<svg class="ui-icon-xs" style="width:13px;height:13px;opacity:0.75;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        +     '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(dueStr) : dueStr) + '</span>'
        +   '</div>'
        + '</td>'
        + '<td style="width:90px;">'
        +   '<span style="font-size:12px;color:' + (estStr !== '—' ? 'var(--text-primary)' : 'var(--text-muted)') + ';font-weight:500;">' + (typeof escapeHtml === 'function' ? escapeHtml(estStr) : estStr) + '</span>'
        + '</td>'
        + '<td style="width:44px;text-align:center;" onclick="event.stopPropagation()">'
        +   '<button type="button" class="project-delete-btn" onclick="deleteTask(\'' + t.id + '\')" title="Delete Task" aria-label="Delete Task">'
        +     '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
        +   '</button>'
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}


function toggleMyTasksFilterMenu(e) {
  if (e) e.stopPropagation();
  var menu = document.querySelector('.my-tasks-filter-dropdown');
  if (!menu) return;
  var isVisible = menu.style.display === 'flex' || menu.style.display === 'block';
  var other = document.querySelector('.project-filter-dropdown');
  if (other) other.style.display = 'none';
  menu.style.display = isVisible ? 'none' : 'flex';
}

function setMyTasksScopeFilter(val) {
  _myTasksScopeFilter = val || 'me';
  renderMyTasksView();
}

function setMyTasksStatusFilter(val) {
  _myTasksStatusFilter = val || 'open';
  renderMyTasksView();
}

function setMyTasksProjectFilter(pKey) {
  _myTasksProjectFilter = pKey || 'all';
  renderMyTasksView();
}

function resetMyTasksFilters() {
  _myTasksScopeFilter = 'me';
  _myTasksStatusFilter = 'open';
  _myTasksProjectFilter = 'all';
  _taskSearchQuery = '';
  renderMyTasksView();
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
  toggleMyTasksFilterMenu(e);
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
  if (typeof window !== 'undefined') {
    window._activeDetailTaskId = id;
  }
  if (typeof setDismissedNotifId === 'function') {
    var toDismiss = ['notif-task-' + id, 'notif-task-desc-mention-' + id];
    var openComments = getTaskComments(id);
    if (Array.isArray(openComments)) {
      openComments.forEach(function(c) {
        if (c && c.id) toDismiss.push('notif-mention-' + c.id);
      });
    }
    setDismissedNotifId(toDismiss);
    if (typeof renderNotifications === 'function') renderNotifications();
  }
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
  var normStatus = normalizeTaskStatus(t.status, projectName);
  var pStatuses = getProjectStatuses(projectName);
  var sConf = pStatuses.find(function(s) { return s.id.toLowerCase() === normStatus.toLowerCase() || s.label.toLowerCase() === normStatus.toLowerCase(); }) || STATUS_CONFIG[normStatus] || { label: normStatus, color: '#3b82f6' };
  var statusDot = document.querySelector('.tdm-status-dot');
  if (statusDot) statusDot.style.background = sConf.color || (sConf.isCustom ? 'var(--text-secondary)' : '#3b82f6');
  var statusText = document.querySelector('.tdm-status-text');
  if (statusText) statusText.textContent = sConf.label;

  // Project Pill
  var pPillText = document.querySelector('.tdm-project-text');
  if (pPillText) pPillText.textContent = projectName;

  // Assignee Pill matching Image 2
  var aName = t.assignee_name || 'Unassigned';
  var aIc = t.assignee_ic || '';
  if (aName && (!aIc || aIc.indexOf('@') === -1)) {
    if (typeof isPortalCreator === 'function' && isPortalCreator(aName, aIc)) {
      aIc = 'jeshuakoh2008@gmail.com';
    } else {
      var aResolver = (typeof resolveMemberDirectoryInfo === 'function')
        ? resolveMemberDirectoryInfo
        : (typeof window !== 'undefined' && typeof window.resolveMemberDirectoryInfo === 'function' ? window.resolveMemberDirectoryInfo : null);
      if (aResolver) {
        var dirA = aResolver(aName || aIc);
        if (dirA) {
          if (!aName && dirA.name) aName = dirA.name;
          if (!aIc && (dirA.email || dirA.ic)) aIc = dirA.email || dirA.ic;
        }
      }
    }
  }
  var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(aName, aIc) : /jeshua\s+koh/i.test(aName);
  var aAvatar = document.querySelector('.tdm-assignee-avatar');
  if (aAvatar) {
    var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(aName, aIc) : null;
    var tooltip = aName + (isCreator ? ' (Portal Creator)' : '');
    aAvatar.title = tooltip;
    aAvatar.setAttribute('aria-label', tooltip);
    aAvatar.style.cursor = 'pointer';
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(aIc || aName, aName)
      : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);
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
      applyAvatarOutlineElement(aAvatar, outlineInfo ? outlineInfo.style : (isCreator ? 'rgb' : 'none'));
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
  var estStr = getTaskEstimate(t) || 'Estimate';
  var estValEl = document.querySelector('.tdm-estimate-val');
  if (estValEl) estValEl.textContent = estStr;

  // Description: strip [Project: ...] and [Estimate: ...] tags for clean reading and editing
  var cleanDesc = (t.description || '').replace(/\s*\[(Project:[^\]|]*|Estimate:[^\]|]*)[^\]]*\]/gi, '').trim();
  var descEl = document.getElementById('tdm-desc');
  if (descEl) {
    descEl.innerHTML = formatTaskDescriptionMentions(cleanDesc);
  }

  var modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'block';
  _initialTaskDetailState = {
    id: id,
    title: (t.title || '').trim(),
    descHtml: (descEl ? descEl.innerHTML : '').trim()
  };
  renderTaskComments(id);
  renderTaskAttachments(id);
  renderTaskSubtasks(id);
  renderTaskLinks(id);

  if (typeof fetchRemoteTaskComments === 'function') {
    fetchRemoteTaskComments(id).catch(function() {});
  }
  if (typeof fetchRemoteTaskAttachments === 'function') {
    fetchRemoteTaskAttachments(id).catch(function() {});
  }
  if (typeof fetchRemoteTaskSubtasks === 'function') {
    fetchRemoteTaskSubtasks(id).catch(function() {});
  }
  if (typeof fetchRemoteTaskLinks === 'function') {
    fetchRemoteTaskLinks(id).catch(function() {});
  }
  if (typeof _activeTaskPollTimer !== 'undefined' && _activeTaskPollTimer) {
    clearInterval(_activeTaskPollTimer);
    _activeTaskPollTimer = null;
  }
  _activeTaskPollTimer = setInterval(function() {
    var curActiveId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
    if (!curActiveId) {
      if (_activeTaskPollTimer) { clearInterval(_activeTaskPollTimer); _activeTaskPollTimer = null; }
      return;
    }
    if (typeof fetchRemoteTaskComments === 'function') {
      fetchRemoteTaskComments(curActiveId).catch(function() {});
    }
    if (typeof fetchRemoteTaskSubtasks === 'function') {
      fetchRemoteTaskSubtasks(curActiveId).catch(function() {});
    }
    if (typeof fetchRemoteTaskLinks === 'function') {
      fetchRemoteTaskLinks(curActiveId).catch(function() {});
    }
    if (typeof fetchRemoteTaskAttachments === 'function') {
      fetchRemoteTaskAttachments(curActiveId).catch(function() {});
    }
  }, 4000);
}

function handleTaskTitleBlur(el) {
  if (!_activeDetailTaskId || !el) return;
  var val = (el.textContent || '').trim();
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  if (val && t && val !== (t.title || '').trim()) {
    saveTaskField(_activeDetailTaskId, 'title', val);
  }
}

function handleTaskDescBlur(el) {
  if (!_activeDetailTaskId || !el) return;
  var rawHtml = el.innerHTML || el.textContent || '';
  var formatted = formatTaskDescriptionMentions(rawHtml);
  if (formatted !== rawHtml) {
    el.innerHTML = formatted;
  }
  var val = (el.innerHTML || el.textContent || '').trim();
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  var fullDesc = buildTaskDescriptionWithMeta(t || {}, val);
  if (t && String(t.description || '').trim() === String(fullDesc || '').trim()) {
    return;
  }
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
async function insertTaskDescLink() {
  if (typeof document === 'undefined') return;
  var url = null;
  if (typeof showPromptModal === 'function') {
    url = await showPromptModal('Insert Link', 'https://...', '', { confirmText: 'Insert', cancelText: 'Cancel' });
  }
  if (url == null) return;
  var link = typeof safeUrl === 'function' ? safeUrl(url, '') : '';
  if (link) formatTaskDesc('createLink', link);
  else if (typeof showToast === 'function') showToast('Enter a valid link.', 'warning');
}

var _taskSubtasksMap = {};
var _taskLinksMap = {};

/**
 * Retrieves subtasks array for a given task ID from memory, localStorage, or task object
 * @param {string|number} taskId
 * @returns {Array<Object>}
 */
function getTaskSubtasks(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  if (_taskSubtasksMap[tid] && Array.isArray(_taskSubtasksMap[tid])) {
    return _taskSubtasksMap[tid];
  }
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t && Array.isArray(t.subtasks)) {
    _taskSubtasksMap[tid] = t.subtasks;
    return t.subtasks;
  }
  try {
    var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('bb_task_subtasks_' + tid) : null;
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _taskSubtasksMap[tid] = parsed;
        if (t) t.subtasks = parsed;
        return parsed;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Persists subtasks for a given task ID into memory, localStorage, and Supabase bb_config
 * @param {string|number} taskId
 * @param {Array<Object>} subtasks
 */
async function saveTaskSubtasks(taskId, subtasks) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid || !Array.isArray(subtasks)) return;
  _taskSubtasksMap[tid] = subtasks;
  if (typeof window !== 'undefined') {
    window._taskSubtasksMap = window._taskSubtasksMap || {};
    window._taskSubtasksMap[tid] = subtasks;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_task_subtasks_' + tid, JSON.stringify(subtasks));
    }
  } catch (_) {}

  var t = findManagedTask(tid);
  if (t) t.subtasks = subtasks;

  var client = getSupaClient();
  if (client) {
    try {
      var payload = {
        key: 'bb_task_subtasks_' + tid,
        value: JSON.stringify(subtasks),
        updated_at: new Date().toISOString()
      };
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', payload, 'key');
      } else {
        await client.req('POST', 'bb_config?on_conflict=key', payload, { Prefer: 'return=representation,resolution=merge-duplicates' });
      }
    } catch (e) {
      console.warn('saveTaskSubtasks remote error:', e);
    }
  }

  var pr = (typeof window !== 'undefined' && window.PortalRealtime)
    ? window.PortalRealtime
    : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
  if (pr && typeof pr.broadcast === 'function') {
    try {
      pr.broadcast('task_subtasks', 'update', { taskId: tid, subtasks: subtasks });
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bb_task_subtasks_changed', { detail: { taskId: tid, subtasks: subtasks } }));
    } catch (_) {}
  }
}

/**
 * Fetches persisted subtasks for a task ID from Supabase bb_config
 * @param {string|number} taskId
 */
async function fetchRemoteTaskSubtasks(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_task_subtasks_' + encodeURIComponent(tid) + '&select=value', { cache: false });
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          _taskSubtasksMap[tid] = parsed;
          if (typeof window !== 'undefined') {
            window._taskSubtasksMap = window._taskSubtasksMap || {};
            window._taskSubtasksMap[tid] = parsed;
          }
          try { localStorage.setItem('bb_task_subtasks_' + tid, JSON.stringify(parsed)); } catch (_) {}
          var curActiveId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
          if (String(curActiveId) === tid && typeof renderTaskSubtasks === 'function') {
            renderTaskSubtasks(tid);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('fetchRemoteTaskSubtasks error:', e);
    }
  }
  return getTaskSubtasks(tid);
}

var _subtaskDebounceTimer = null;

/**
 * Renders the interactive subtasks list in the task brief modal
 * @param {string|number} taskId
 */
function renderTaskSubtasks(taskId) {
  if (typeof document === 'undefined') return;
  var list = document.querySelector('.tb-subtasks-list');
  if (!list) return;
  var tid = String(taskId || _activeDetailTaskId || '');
  var subtasks = getTaskSubtasks(tid);

  if (!subtasks.length) {
    list.innerHTML = '';
    return;
  }

  var activeEl = document.activeElement;
  var isEditing = activeEl && list.contains(activeEl);

  if (isEditing) {
    var existingItems = list.querySelectorAll('.tb-subtask-item');
    if (existingItems.length === subtasks.length) {
      var match = true;
      existingItems.forEach(function(item, idx) {
        if (item.getAttribute('data-subtask-id') !== String(subtasks[idx].id)) match = false;
      });
      if (match) {
        // Non-destructive live sync without destroying active editing span or cursor
        existingItems.forEach(function(item, idx) {
          var st = subtasks[idx];
          var chk = item.querySelector('input[type="checkbox"]');
          var span = item.querySelector('span[contenteditable]');
          if (chk && chk.checked !== Boolean(st.completed)) {
            chk.checked = Boolean(st.completed);
          }
          if (span && span !== activeEl) {
            var isDone = Boolean(st.completed);
            span.style.textDecoration = isDone ? 'line-through' : 'none';
            span.style.opacity = isDone ? '0.6' : '1';
            var safeText = st.text || '';
            if (span.textContent !== safeText) span.textContent = safeText;
          }
        });
        return;
      }
    }
  }

  var html = '';
  subtasks.forEach(function(st) {
    var safeText = (typeof escapeHtml === 'function') ? escapeHtml(st.text || '') : (st.text || '');
    var isDone = Boolean(st.completed);
    var textStyle = isDone ? 'text-decoration:line-through;opacity:0.6;' : '';
    html += '<div class="tb-subtask-item" data-subtask-id="' + st.id + '" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">'
      + '<input type="checkbox" ' + (isDone ? 'checked' : '') + ' style="cursor:pointer;" onchange="toggleTaskSubtask(\'' + tid + '\', \'' + st.id + '\', this.checked)" title="Mark subtask completed" aria-label="Mark subtask completed" />'
      + '<span contenteditable="true" style="outline:none;flex:1;font-size:13px;' + textStyle + '" oninput="handleSubtaskTextInput(\'' + tid + '\', \'' + st.id + '\', this)" onblur="handleSubtaskTextBlur(\'' + tid + '\', \'' + st.id + '\', this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">' + safeText + '</span>'
      + '<button type="button" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px;font-size:16px;line-height:1;" onclick="deleteTaskSubtask(\'' + tid + '\', \'' + st.id + '\')" title="Delete subtask" aria-label="Delete subtask">&times;</button>'
      + '</div>';
  });
  list.innerHTML = html;
}

/**
 * Handles live input typing on editable subtask title (prevents cursor loss)
 */
function handleSubtaskTextInput(taskId, subtaskId, el) {
  if (!el) return;
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var newText = el.textContent || '';
  var subtasks = getTaskSubtasks(tid);
  var st = subtasks.find(function(x) { return String(x.id) === String(subtaskId); });
  if (st) {
    st.text = newText;
    _taskSubtasksMap[tid] = subtasks;
    if (typeof window !== 'undefined') {
      window._taskSubtasksMap = window._taskSubtasksMap || {};
      window._taskSubtasksMap[tid] = subtasks;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_task_subtasks_' + tid, JSON.stringify(subtasks));
      }
    } catch (_) {}
    if (_subtaskDebounceTimer) clearTimeout(_subtaskDebounceTimer);
    _subtaskDebounceTimer = setTimeout(function() {
      saveTaskSubtasks(tid, subtasks);
    }, 1200);
  }
}

/**
 * Adds an interactive subtask item to the active task brief (Image 5)
 */
function addActiveTaskSubtask(text) {
  var tid = _activeDetailTaskId;
  if (!tid) return;
  var subtasks = getTaskSubtasks(tid);
  var newId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  var subtask = {
    id: newId,
    text: (text || '').trim() || 'New sub-task',
    completed: false,
    created_at: new Date().toISOString()
  };
  subtasks.push(subtask);
  saveTaskSubtasks(tid, subtasks);
  renderTaskSubtasks(tid);

  if (typeof document !== 'undefined') {
    var item = document.querySelector('.tb-subtask-item[data-subtask-id="' + newId + '"] span');
    if (item) {
      item.focus();
      if (!text) {
        try {
          var range = document.createRange();
          range.selectNodeContents(item);
          var sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (_) {}
      }
    }
  }
}

/**
 * Toggles a subtask's completion checkbox
 */
function toggleTaskSubtask(taskId, subtaskId, isChecked) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var subtasks = getTaskSubtasks(tid);
  var st = subtasks.find(function(x) { return String(x.id) === String(subtaskId); });
  if (st) {
    st.completed = Boolean(isChecked);
    saveTaskSubtasks(tid, subtasks);
    renderTaskSubtasks(tid);
  }
}

/**
 * Handles blur event on editable subtask title
 */
function handleSubtaskTextBlur(taskId, subtaskId, el) {
  if (!el) return;
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var newText = (el.textContent || '').trim();
  var subtasks = getTaskSubtasks(tid);
  var st = subtasks.find(function(x) { return String(x.id) === String(subtaskId); });
  if (st && st.text !== newText) {
    st.text = newText || 'Sub-task';
    saveTaskSubtasks(tid, subtasks);
  }
}

/**
 * Deletes a subtask item from a task
 */
function deleteTaskSubtask(taskId, subtaskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var subtasks = getTaskSubtasks(tid);
  var filtered = subtasks.filter(function(x) { return String(x.id) !== String(subtaskId); });
  saveTaskSubtasks(tid, filtered);
  renderTaskSubtasks(tid);
  if (typeof showToast === 'function') showToast('Subtask deleted', 'info', 1000);
}

/**
 * Retrieves related links array for a task ID from memory, localStorage, or task object
 * @param {string|number} taskId
 * @returns {Array<Object>}
 */
function getTaskLinks(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  if (_taskLinksMap[tid] && Array.isArray(_taskLinksMap[tid])) {
    return _taskLinksMap[tid];
  }
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t && Array.isArray(t.links)) {
    _taskLinksMap[tid] = t.links;
    return t.links;
  }
  try {
    var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('bb_task_links_' + tid) : null;
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _taskLinksMap[tid] = parsed;
        if (t) t.links = parsed;
        return parsed;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Persists links for a given task ID into memory, localStorage, and Supabase bb_config
 * @param {string|number} taskId
 * @param {Array<Object>} links
 */
async function saveTaskLinks(taskId, links) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid || !Array.isArray(links)) return;
  _taskLinksMap[tid] = links;
  if (typeof window !== 'undefined') {
    window._taskLinksMap = window._taskLinksMap || {};
    window._taskLinksMap[tid] = links;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_task_links_' + tid, JSON.stringify(links));
    }
  } catch (_) {}

  var t = findManagedTask(tid);
  if (t) t.links = links;

  var client = getSupaClient();
  if (client) {
    try {
      var payload = {
        key: 'bb_task_links_' + tid,
        value: JSON.stringify(links),
        updated_at: new Date().toISOString()
      };
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', payload, 'key');
      } else {
        await client.req('POST', 'bb_config?on_conflict=key', payload, { Prefer: 'return=representation,resolution=merge-duplicates' });
      }
    } catch (e) {
      console.warn('saveTaskLinks remote error:', e);
    }
  }

  var pr = (typeof window !== 'undefined' && window.PortalRealtime)
    ? window.PortalRealtime
    : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
  if (pr && typeof pr.broadcast === 'function') {
    try {
      pr.broadcast('task_links', 'update', { taskId: tid, links: links });
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bb_task_links_changed', { detail: { taskId: tid, links: links } }));
    } catch (_) {}
  }
}

/**
 * Fetches persisted links for a task ID from Supabase bb_config
 * @param {string|number} taskId
 */
async function fetchRemoteTaskLinks(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_task_links_' + encodeURIComponent(tid) + '&select=value', { cache: false });
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          _taskLinksMap[tid] = parsed;
          if (typeof window !== 'undefined') {
            window._taskLinksMap = window._taskLinksMap || {};
            window._taskLinksMap[tid] = parsed;
          }
          try { localStorage.setItem('bb_task_links_' + tid, JSON.stringify(parsed)); } catch (_) {}
          var curActiveId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
          if (String(curActiveId) === tid && typeof renderTaskLinks === 'function') {
            renderTaskLinks(tid);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('fetchRemoteTaskLinks error:', e);
    }
  }
  return getTaskLinks(tid);
}

/**
 * Renders the links section in the task brief modal
 * @param {string|number} taskId
 */
function renderTaskLinks(taskId) {
  if (typeof document === 'undefined') return;
  var emptyNotice = document.querySelector('.tb-links-empty');
  if (!emptyNotice) return;
  var parentSection = emptyNotice.parentElement;
  if (!parentSection) return;

  var tid = String(taskId || _activeDetailTaskId || '');
  var links = getTaskLinks(tid);

  var list = parentSection.querySelector('.tb-links-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'tb-links-list';
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
    parentSection.appendChild(list);
  }

  if (!links.length) {
    emptyNotice.style.display = 'block';
    list.innerHTML = '';
    return;
  }

  emptyNotice.style.display = 'none';
  var html = '';
  links.forEach(function(l) {
    var rawUrl = (l.url || l.title || '').trim();
    var isHttp = /^https?:\/\//i.test(rawUrl);
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(l.title || rawUrl) : (l.title || rawUrl);
    var linkAction = isHttp
      ? 'window.open(\'' + encodeURI(rawUrl) + '\', \'_blank\', \'noopener,noreferrer\');'
      : 'openTaskDetail(\'' + rawUrl.replace(/[^a-zA-Z0-9_-]/g, '') + '\');';

    html += '<div class="tb-link-pill" data-link-id="' + l.id + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-card-subtle);border:1px solid var(--border-card);padding:4px 10px;border-radius:6px;font-size:12px;margin:2px 2px 2px 0;">'
      + '<svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
      + '<button type="button" onclick="' + linkAction + '" style="background:none;border:none;padding:0;font:inherit;color:var(--accent);text-decoration:underline;cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + safeTitle + '">' + safeTitle + '</button>'
      + '<button type="button" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;margin-left:4px;font-size:14px;line-height:1;" onclick="deleteTaskLink(\'' + tid + '\', \'' + l.id + '\')" title="Remove link" aria-label="Remove link">&times;</button>'
      + '</div>';
  });
  list.innerHTML = html;
}

/**
 * Links a related task or URL in the task brief (Image 5)
 */
async function addActiveTaskLink() {
  var tid = _activeDetailTaskId;
  if (!tid) return;
  var urlOrTitle = null;
  if (typeof showPromptModal === 'function') {
    urlOrTitle = await showPromptModal('Add Related Link', 'https://... or related task ID', '', { confirmText: 'Add Link', cancelText: 'Cancel' });
  }
  if (!urlOrTitle || !urlOrTitle.trim()) return;
  var links = getTaskLinks(tid);
  var cleanVal = urlOrTitle.trim();
  var newLink = {
    id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: cleanVal,
    url: /^https?:\/\//i.test(cleanVal) ? cleanVal : '',
    created_at: new Date().toISOString()
  };
  links.push(newLink);
  saveTaskLinks(tid, links);
  renderTaskLinks(tid);
  if (typeof showToast === 'function') showToast('Link added', 'success', 1200);
}

/**
 * Deletes a related link from a task
 */
function deleteTaskLink(taskId, linkId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var links = getTaskLinks(tid);
  var filtered = links.filter(function(x) { return String(x.id) !== String(linkId); });
  saveTaskLinks(tid, filtered);
  renderTaskLinks(tid);
  if (typeof showToast === 'function') showToast('Link removed', 'info', 1000);
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
function saveTaskComments(taskId, comments, options) {
  if (!taskId || !Array.isArray(comments)) return;
  _taskCommentsMap[taskId] = comments;
  try {
    localStorage.setItem('bb_task_comments_' + taskId, JSON.stringify(comments));
  } catch (_) {}
  var client = getSupaClient();
  if (!client || (typeof client.upsert !== 'function' && typeof client.req !== 'function')) return Promise.resolve(false);

  var doSave = async function() {
    var finalComments = comments;
    if (options && options.isAppend && options.newComment) {
      try {
        var remoteRows = await client.get('bb_config?key=eq.bb_task_comments_' + taskId + '&select=value', { cache: false });
        if (Array.isArray(remoteRows) && remoteRows.length && remoteRows[0].value) {
          var remoteList = JSON.parse(remoteRows[0].value);
          if (Array.isArray(remoteList) && remoteList.length) {
            var cMap = new Map();
            remoteList.forEach(function(c) { if (c && c.id) cMap.set(c.id, c); });
            comments.forEach(function(c) { if (c && c.id) cMap.set(c.id, c); });
            cMap.set(options.newComment.id, options.newComment);
            finalComments = Array.from(cMap.values()).sort(function(a, b) {
              return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            });
            _taskCommentsMap[taskId] = finalComments;
            try { localStorage.setItem('bb_task_comments_' + taskId, JSON.stringify(finalComments)); } catch (_) {}
            var activeId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
            if (activeId === taskId && typeof renderTaskComments === 'function') {
              renderTaskComments(taskId);
            }
          }
        }
      } catch (_) {}
    }

    var payload = {
      key: 'bb_task_comments_' + taskId,
      value: JSON.stringify(finalComments),
      updated_at: new Date().toISOString()
    };
    var saveReq = typeof client.upsert === 'function'
      ? client.upsert('bb_config', payload, 'key')
      : client.req('POST', 'bb_config?on_conflict=key', payload, { Prefer: 'return=representation,resolution=merge-duplicates' });
    await saveReq;

    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('comments', 'update', { taskId: taskId, comments: finalComments });
    }
    return true;
  };

  return doSave().catch(function() { return false; });
}

/**
 * Fetches all persisted task comments from Supabase bb_config
 */
var _isFetchingRemoteTaskComments = false;
var _lastFetchRemoteTaskCommentsTime = 0;

/**
 * Fetches all persisted task comments from Supabase bb_config
 */
async function fetchAllRemoteTaskComments(force) {
  var now = Date.now();
  if (!force && (_isFetchingRemoteTaskComments || (now - _lastFetchRemoteTaskCommentsTime < 5000))) return;
  _isFetchingRemoteTaskComments = true;
  _lastFetchRemoteTaskCommentsTime = now;
  var client = getSupaClient();
  if (!client) {
    _isFetchingRemoteTaskComments = false;
    return;
  }
  try {
    var rows = await client.get('bb_config?key=like.bb_task_comments_*&select=key,value', { cache: false });
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
  if (typeof syncTaskNotifications === 'function') {
    syncTaskNotifications();
  } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function') {
    window.syncTaskNotifications();
  }
  if (typeof renderNotifications === 'function') {
    renderNotifications();
  } else if (typeof window !== 'undefined' && typeof window.renderNotifications === 'function') {
    window.renderNotifications();
  }
  var activeId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
  if (activeId && typeof renderTaskComments === 'function') {
    renderTaskComments(activeId);
  }
}

/**
 * Fetches all persisted task attachments, subtasks, links, and comments from Supabase bb_config
 */
var _isFetchingRemoteTaskDetails = false;
var _lastFetchRemoteTaskDetailsTime = 0;

async function fetchAllRemoteTaskDetails(force) {
  var now = Date.now();
  if (!force && (_isFetchingRemoteTaskDetails || (now - _lastFetchRemoteTaskDetailsTime < 5000))) return;
  _isFetchingRemoteTaskDetails = true;
  _lastFetchRemoteTaskDetailsTime = now;
  var client = getSupaClient();
  if (!client) {
    _isFetchingRemoteTaskDetails = false;
    return;
  }
  try {
    var pAtts = client.get('bb_config?key=like.bb_task_attachments_*&select=key,value', { cache: false });
    var pSubs = client.get('bb_config?key=like.bb_task_subtasks_*&select=key,value', { cache: false });
    var pLnks = client.get('bb_config?key=like.bb_task_links_*&select=key,value', { cache: false });
    var pCmts = client.get('bb_config?key=like.bb_task_comments_*&select=key,value', { cache: false });

    var results = await Promise.allSettled([pAtts, pSubs, pLnks, pCmts]);

    if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
      results[0].value.forEach(function(r) {
        if (!r.key || !r.value) return;
        var tid = r.key.replace('bb_task_attachments_', '');
        try {
          var arr = JSON.parse(r.value);
          if (Array.isArray(arr)) {
            _taskAttachmentsMap[tid] = arr;
            try { localStorage.setItem(r.key, r.value); } catch (_) {}
          }
        } catch (_) {}
      });
    }

    if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
      results[1].value.forEach(function(r) {
        if (!r.key || !r.value) return;
        var tid = r.key.replace('bb_task_subtasks_', '');
        try {
          var arr = JSON.parse(r.value);
          if (Array.isArray(arr)) {
            _taskSubtasksMap[tid] = arr;
            try { localStorage.setItem(r.key, r.value); } catch (_) {}
          }
        } catch (_) {}
      });
    }

    if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
      results[2].value.forEach(function(r) {
        if (!r.key || !r.value) return;
        var tid = r.key.replace('bb_task_links_', '');
        try {
          var arr = JSON.parse(r.value);
          if (Array.isArray(arr)) {
            _taskLinksMap[tid] = arr;
            try { localStorage.setItem(r.key, r.value); } catch (_) {}
          }
        } catch (_) {}
      });
    }

    if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
      results[3].value.forEach(function(r) {
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

    var activeModalId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
    if (activeModalId) {
      if (typeof renderTaskAttachments === 'function') renderTaskAttachments(activeModalId);
      if (typeof renderTaskSubtasks === 'function') renderTaskSubtasks(activeModalId);
      if (typeof renderTaskLinks === 'function') renderTaskLinks(activeModalId);
      if (typeof renderTaskComments === 'function') renderTaskComments(activeModalId);
    }
  } catch (_) {} finally {
    _isFetchingRemoteTaskDetails = false;
  }
}

async function fetchRemoteTaskComments(taskId) {
  if (!taskId) return [];
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_task_comments_' + taskId + '&select=value', { cache: false });
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          _taskCommentsMap[taskId] = parsed;
          try { localStorage.setItem('bb_task_comments_' + taskId, JSON.stringify(parsed)); } catch (_) {}
          if (typeof syncTaskNotifications === 'function') syncTaskNotifications();
          else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function') window.syncTaskNotifications();
          if (typeof renderNotifications === 'function') renderNotifications();
          else if (typeof window !== 'undefined' && typeof window.renderNotifications === 'function') window.renderNotifications();
          var activeId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
          if (activeId === taskId && typeof renderTaskComments === 'function') {
            renderTaskComments(taskId);
          }
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
  if (document.querySelector('.tb-comment-edit-input')) return;
  var list = document.querySelector('.tb-comments-list');
  if (!list) return;

  var tid = taskId || _activeDetailTaskId;
  var comments = getTaskComments(tid);

  if (!comments.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;font-style:italic;">No comments yet. Be the first to leave a comment!</div>';
    return;
  }

  var myEmail = (typeof sessionGet === 'function' ? sessionGet('email') : '') || '';
  var canModerate = myEmail && hasTaskAdminSession();

  var html = '';
  comments.forEach(function(c) {
    if (!c || !/^[\w-]+$/.test(c.id || '')) return;
    var author = c.author_name || 'Member';
    var email = c.author_email || '';
    var avatarHtml = getAssigneeAvatarHtml(author, email, 30);
    var safeAuthor = (typeof escapeHtml === 'function') ? escapeHtml(author) : author;
    var timeStr = 'Just now';
    if (c.created_at) {
      try {
        var d = new Date(c.created_at);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (_) {}
    }

    var isAuthor = ownsTaskComment(c);
    var canEdit = isAuthor;
    var canDelete = isAuthor || canModerate;

    var actionsHtml = '';
    if ((canEdit || canDelete) && /^[\w-]+$/.test(tid || '')) {
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
        + '<div class="tb-comment-text" data-comment-id="' + _safeCommentMentionToken(c.id) + '">' + formatCommentMentions(c.text || '') + '</div>'
      + '</div>'
      + '</div>';
  });

  list.innerHTML = html;
}

function ownsTaskComment(comment) {
  var email = typeof sessionGet === 'function' ? sessionGet('email') : '';
  return Boolean(email && comment && comment.author_email && email.toLowerCase() === comment.author_email.toLowerCase());
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
  if (!ownsTaskComment(targetComment) || !/^[\w-]+$/.test(tid) || !/^[\w-]+$/.test(commentId)) return;

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
  if (!ownsTaskComment(targetComment) || updatedText.length > 2000) return;
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
  var comment = getTaskComments(tid).find(function(c) { return String(c.id) === String(commentId); });
  if (!comment || (!ownsTaskComment(comment) && !hasTaskAdminSession())) return;

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
    if (!confirmed || (!ownsTaskComment(comment) && !hasTaskAdminSession())) return;
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

  // Rule 3: Department group mention (e.g. @Secretariat, @Logistics, @Media, @HQ, @Officers)
  if (myDept) {
    var cleanDept = myDept.toLowerCase().trim();
    if (cleanDept && lower.indexOf('@' + cleanDept) !== -1) return true;
    if (cleanDept.indexOf('secretariat') !== -1 && lower.indexOf('@secretariat') !== -1) return true;
    if (cleanDept.indexOf('logistics') !== -1 && lower.indexOf('@logistics') !== -1) return true;
    if (cleanDept.indexOf('media') !== -1 && lower.indexOf('@media') !== -1) return true;
    if (cleanDept.indexOf('hq') !== -1 && lower.indexOf('@hq') !== -1) return true;
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

  // Rule 7: Admin & Super Admin mention
  var isAdminOrSuper = (typeof isAdmin === 'function' && isAdmin()) || (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof window !== 'undefined' && typeof window.isSuperAdmin === 'function' && window.isSuperAdmin());
  if (!isAdminOrSuper && typeof sessionGet === 'function') {
    var sRole = (sessionGet('role') || '').toLowerCase();
    if (sRole === 'admin' || sRole === 'superadmin') isAdminOrSuper = true;
  }
  if (isAdminOrSuper && /(?:^|\W)@(admins?|superadmins?)\b/i.test(lower)) return true;

  // Rule 9: Creator mention
  var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(myName, myEmail) : (/jeshua\s+koh/i.test(myName) || (myEmail && myEmail.toLowerCase().indexOf('jeshuakoh2008@gmail.com') !== -1));
  if (isCreator && /(?:^|\W)@creator\b/i.test(lower)) return true;

  return false;
}

var _isSubmittingComment = false;

/**
 * Handles comment submit on task brief (Image 5)
 */
async function handleTaskCommentSubmit(input) {
  if (!input || _isSubmittingComment) return;
  if (typeof ensureCommentInputValueProperty === 'function') ensureCommentInputValueProperty(input);
  var commentText = '';
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    commentText = (input.value || '').trim();
  } else {
    var rawVal = (typeof input.value === 'string' && input.value) ? input.value : '';
    var textVal = (input.textContent || input.innerText || '').replace(/\u00A0/g, ' ');
    commentText = (rawVal || textVal).trim();
  }
  if (!commentText) return;
  if (commentText.length > 2000) {
    if (typeof showToast === 'function') {
      showToast('Comment is too long (maximum 2,000 characters).', 'warning');
    }
    return;
  }
  var tid = (input && input.dataset && input.dataset.taskId) || (typeof window !== 'undefined' && window._activeDetailTaskId) || (typeof global !== 'undefined' && global._activeDetailTaskId) || _activeDetailTaskId;
  if (!tid || !findManagedTask(tid)) return;
  var authorName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || 'Member';
  var authorEmail = (typeof sessionGet === 'function' ? sessionGet('email') : '') || '';
  if (!authorEmail) return;
  _isSubmittingComment = true;
  var button = input.nextElementSibling;
  var submit = async function() {
    input.value = '';
    if (input.tagName === 'DIV') input.innerHTML = '';

    var newComment = {
      id: 'cmt_' + crypto.randomUUID(),
      task_id: tid,
      author_name: authorName,
      author_email: authorEmail,
      text: commentText,
      created_at: new Date().toISOString()
    };

    var comments = getTaskComments(tid);
    comments.push(newComment);
    var saving = saveTaskComments(tid, comments, { newComment: newComment, isAppend: true });
    renderTaskComments(tid);
    var saved = await saving;

    // Sync notifications across tasks, ensuring the author is NOT notified
    if (typeof syncTaskNotifications === 'function' && typeof _allLoadedTasks !== 'undefined') {
      syncTaskNotifications(_allLoadedTasks);
    } else if (typeof window !== 'undefined' && typeof window.syncTaskNotifications === 'function' && typeof window._allLoadedTasks !== 'undefined') {
      window.syncTaskNotifications(window._allLoadedTasks);
    }

    if (typeof showToast === 'function') {
      showToast(saved ? 'Comment posted successfully!' : 'Comment saved on this device. Sync failed.', saved ? 'success' : 'warning', 1500);
    }

    // Real-time WhatsApp-style FCM push notification for task comments & mentions
    var commentDispatcher = (typeof sendPortalPushNotification === 'function')
      ? sendPortalPushNotification
      : (typeof window !== 'undefined' && typeof window.sendPortalPushNotification === 'function' ? window.sendPortalPushNotification : null);
    if (commentDispatcher) {
      var taskObj = findManagedTask(tid);
      var targetUsers = [];
      if (taskObj) {
        if (taskObj.assignee_ic) {
          taskObj.assignee_ic.split(',').forEach(function(ic) {
            var trimmed = ic.trim();
            if (trimmed && trimmed.toLowerCase() !== authorEmail.toLowerCase()) targetUsers.push(trimmed);
          });
        }
        if (taskObj.creator_email && taskObj.creator_email.toLowerCase() !== authorEmail.toLowerCase()) {
          targetUsers.push(taskObj.creator_email.trim());
        }
      }
      var mentionRes = (typeof resolveMentionTargets === 'function')
        ? resolveMentionTargets(commentText)
        : ((typeof window !== 'undefined' && typeof window.resolveMentionTargets === 'function')
          ? window.resolveMentionTargets(commentText)
          : { targetUsers: [], topics: [] });
      if (Array.isArray(mentionRes.targetUsers)) {
        mentionRes.targetUsers.forEach(function(u) {
          if (u && targetUsers.indexOf(u) === -1) targetUsers.push(u);
        });
      }
      var isAllMention = /(?:^|\W)@(all|everyone|everybody)\b/i.test(commentText);
      var cleanCommentText = (typeof cleanSnippet === 'function')
        ? cleanSnippet(commentText, 140)
        : (commentText || '').replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      commentDispatcher({
        type: 'task_comment',
        title: authorName + ' commented on a task',
        body: (taskObj ? taskObj.title + ': ' : '') + cleanCommentText,
        targetTopic: isAllMention ? 'announcements' : null,
        targetUsers: targetUsers,
        tab: 'tasks',
        targetId: tid
      }).catch(function(err) {
        console.warn('Task comment FCM push error:', err);
      });

      if (Array.isArray(mentionRes.topics)) {
        mentionRes.topics.forEach(function(deptTopic) {
          if (deptTopic && deptTopic !== 'announcements') {
            commentDispatcher({
              type: 'task_comment',
              title: authorName + ' mentioned department in task comment',
              body: (taskObj ? taskObj.title + ': ' : '') + cleanCommentText,
              targetTopic: deptTopic,
              tab: 'tasks',
              targetId: tid
            }).catch(function() {});
          }
        });
      }
    }
  };
  try {
    if (button && typeof withSmartButtonLock === 'function') await withSmartButtonLock(button, submit);
    else await submit();
  } finally {
    _isSubmittingComment = false;
  }
}

var _taskAttachmentsMap = {};

/**
 * Retrieves persisted attachments array for a given task ID
 * @param {string|number} taskId
 * @returns {Array<Object>}
 */
function getTaskAttachments(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  if (_taskAttachmentsMap[tid] && Array.isArray(_taskAttachmentsMap[tid])) {
    return _taskAttachmentsMap[tid];
  }
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[tid]) || _taskMap[tid];
  if (t && Array.isArray(t.attachments)) {
    _taskAttachmentsMap[tid] = t.attachments;
    return t.attachments;
  }
  try {
    var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('bb_task_attachments_' + tid) : null;
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        _taskAttachmentsMap[tid] = arr;
        if (t) t.attachments = arr;
        return arr;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Persists attachments array for a given task ID into memory, localStorage, and Supabase bb_config
 * @param {string|number} taskId
 * @param {Array<Object>} attachments
 */
async function saveTaskAttachments(taskId, attachments) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return;
  var atts = Array.isArray(attachments) ? attachments : [];
  _taskAttachmentsMap[tid] = atts;
  if (typeof window !== 'undefined') {
    window._taskAttachmentsMap = window._taskAttachmentsMap || {};
    window._taskAttachmentsMap[tid] = atts;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_task_attachments_' + tid, JSON.stringify(atts));
    }
  } catch (_) {}

  var t = findManagedTask(tid);
  if (t) t.attachments = atts;

  var client = getSupaClient();
  if (client) {
    try {
      var payload = {
        key: 'bb_task_attachments_' + tid,
        value: JSON.stringify(atts),
        updated_at: new Date().toISOString()
      };
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', payload, 'key');
      } else {
        await client.req('POST', 'bb_config?on_conflict=key', payload, { Prefer: 'return=representation,resolution=merge-duplicates' });
      }
    } catch (e) {
      console.warn('saveTaskAttachments remote error:', e);
    }
  }

  var pr = (typeof window !== 'undefined' && window.PortalRealtime)
    ? window.PortalRealtime
    : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
  if (pr && typeof pr.broadcast === 'function') {
    try {
      pr.broadcast('task_attachments', 'update', { taskId: tid, attachments: atts });
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bb_task_attachments_changed', { detail: { taskId: tid, attachments: atts } }));
    } catch (_) {}
  }
}

/**
 * Fetches persisted attachments for a task ID from Supabase bb_config
 * @param {string|number} taskId
 */
async function fetchRemoteTaskAttachments(taskId) {
  var tid = String(taskId || _activeDetailTaskId || '');
  if (!tid) return [];
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_task_attachments_' + encodeURIComponent(tid) + '&select=value', { cache: false });
      if (Array.isArray(rows) && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          _taskAttachmentsMap[tid] = parsed;
          if (typeof window !== 'undefined') {
            window._taskAttachmentsMap = window._taskAttachmentsMap || {};
            window._taskAttachmentsMap[tid] = parsed;
          }
          try { localStorage.setItem('bb_task_attachments_' + tid, JSON.stringify(parsed)); } catch (_) {}
          var curActiveId = _activeDetailTaskId || (typeof window !== 'undefined' && window._activeDetailTaskId);
          if (String(curActiveId) === tid && typeof renderTaskAttachments === 'function') {
            renderTaskAttachments(tid);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('fetchRemoteTaskAttachments error:', e);
    }
  }
  return getTaskAttachments(tid);
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
    var ext = (att.name || '').split('.').pop().toLowerCase();
    var iconCls = (ext === 'pdf') ? 'pdf' : ((ext === 'doc' || ext === 'docx') ? 'doc' : ((ext === 'xls' || ext === 'xlsx' || ext === 'csv') ? 'sheet' : ((ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'gif') ? 'img' : 'file')));
    var iconColor = iconCls === 'pdf' ? '#ef4444' : (iconCls === 'doc' ? '#3b82f6' : (iconCls === 'sheet' ? '#10b981' : (iconCls === 'img' ? '#f59e0b' : 'var(--accent)')));

    var iconSvg = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:' + iconColor + ';flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    html += '<div class="tb-attachment-chip" data-att-id="' + att.id + '">'
      + '<span class="tb-attachment-icon">' + iconSvg + '</span>'
      + '<button type="button" class="tb-attachment-link" onclick="openTaskAttachment(\'' + tid + '\', \'' + att.id + '\')" title="Open and view ' + safeName + '" style="background:none;border:none;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">' + safeName + '</button>'
      + (att.size ? ('<span class="tb-attachment-size">' + (typeof escapeHtml === 'function' ? escapeHtml(att.size) : att.size) + '</span>') : '')
      + '<button type="button" class="tb-attachment-delete-btn" onclick="removeTaskAttachment(\'' + tid + '\', \'' + att.id + '\')" title="Remove file" aria-label="Remove attachment">'
      + '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      + '</button>'
      + '</div>';
  });

  list.innerHTML = html;
}

/**
 * Securely opens a task attachment, resolving Supabase storage paths to signed URLs without page reload
 * @param {string} taskId
 * @param {string} attachmentId
 */
async function openTaskAttachment(taskId, attachmentId) {
  var tid = taskId || _activeDetailTaskId;
  if (!tid) return;
  var attachments = getTaskAttachments(tid);
  var att = attachments.find(function(a) { return String(a.id) === String(attachmentId); });
  if (!att) {
    if (typeof showToast === 'function') showToast('Attachment not found.', 'warning');
    return;
  }

  var rawUrl = (att.url || '').trim();
  var remotePath = (att.path || '').trim();
  var bucket = att.bucket || 'resources';
  var client = getSupaClient();

  // If Supabase client is available, resolve a fresh signed URL for secure storage
  if (client && typeof client.createSignedUrl === 'function') {
    var pathToSign = remotePath;
    if (!pathToSign && rawUrl) {
      var match = rawUrl.match(/\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/);
      if (match && match[2]) {
        bucket = match[1];
        pathToSign = decodeURIComponent(match[2].split('?')[0]);
      } else if (rawUrl.startsWith('tasks/')) {
        pathToSign = rawUrl;
      }
    }
    if (pathToSign) {
      try {
        var signed = await client.createSignedUrl(bucket, pathToSign, 86400);
        if (signed && signed.signedUrl) {
          if (typeof window !== 'undefined' && window.open) {
            window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        }
      } catch (err) {
        console.warn('openTaskAttachment signedUrl fallback:', err);
      }
    }
  }

  // Safe raster image / PDF / text data URLs (works across all browsers and offline)
  if (/^data:(image\/(png|jpeg|jpg|gif|webp)|application\/pdf|text\/plain);base64,/i.test(rawUrl)) {
    if (typeof window !== 'undefined' && window.open) {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  // Valid HTTP/HTTPS URLs (e.g. existing signed URLs or public URLs)
  if (/^https?:\/\//i.test(rawUrl)) {
    if (typeof window !== 'undefined' && window.open) {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  // Blob URLs (scoped to session - check if accessible before attempting navigation)
  if (rawUrl.startsWith('blob:')) {
    var isLive = false;
    try {
      if (typeof fetch === 'function') {
        var chk = await fetch(rawUrl, { method: 'HEAD' }).catch(function() { return fetch(rawUrl); });
        if (chk && (chk.ok || chk.status === 200)) isLive = true;
      }
    } catch (_) {}
    if (isLive) {
      if (typeof window !== 'undefined' && window.open) {
        window.open(rawUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (typeof showToast === 'function') {
      showToast('This attachment was saved locally in another session and is unavailable on this device. Please re-upload the file.', 'warning', 5000);
    }
    return;
  }

  // Protect against '#' navigation which duplicates the portal tab
  if (typeof showToast === 'function') {
    showToast('Attachment preview is unavailable for this document.', 'warning');
  }
}

/**
 * Handles uploading 1 or more task attachments with storage upload and cross-device fallback
 * @param {Event} event
 */
async function handleTaskAttachmentUpload(event) {
  if (!findManagedTask(_activeDetailTaskId)) return;
  var files = event && event.target && event.target.files;
  if (!files || !files.length) return;
  var tid = _activeDetailTaskId;
  if (!tid) return;

  var client = getSupaClient();
  var attachments = getTaskAttachments(tid);
  var addedCount = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!file || !file.name) continue;

    // Security validation: enforce extension/MIME blocklist and byte-level magic header inspection
    if (typeof validateFileSecurity === 'function') {
      try {
        await validateFileSecurity(file, { allowPdf: true, allowImages: true, allowDocs: true, bucket: 'resources' });
      } catch (secErr) {
        if (typeof showToast === 'function') {
          showToast(secErr.message || 'File upload blocked by security policy.', 'warning');
        }
        continue;
      }
    } else if (/\.(svg|html|htm|xhtml|js|mjs|ts|php|sh|bat|cmd|exe|dll|vbs|wsf)$/i.test(file.name)) {
      if (typeof showToast === 'function') {
        showToast('This file type is blocked for security.', 'warning');
      }
      continue;
    }

    var sz = '';
    if (file.size) {
      sz = (file.size < 1024 * 1024)
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    var remotePath = '';
    var fileUrl = '';
    var targetBucket = 'resources';

    if (client && typeof client.uploadFile === 'function') {
      try {
        var cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        remotePath = 'tasks/' + tid + '/' + Date.now() + '_' + cleanFileName;
        try {
          await client.uploadFile(targetBucket, remotePath, file);
        } catch (resErr) {
          // If resources bucket fails or policy restricted, fallback to gallery bucket
          console.warn('resources bucket upload fallback to gallery:', resErr);
          targetBucket = 'gallery';
          await client.uploadFile(targetBucket, remotePath, file);
        }
        if (typeof client.createSignedUrl === 'function') {
          var signed = await client.createSignedUrl(targetBucket, remotePath, 86400 * 365);
          if (signed && signed.signedUrl) {
            fileUrl = signed.signedUrl;
          }
        }
        if (!fileUrl && typeof client.fileUrl === 'function') {
          fileUrl = client.fileUrl(targetBucket, remotePath);
        }
      } catch (uploadErr) {
        console.warn('Supabase storage upload error:', uploadErr);
      }
    }

    // Cross-device fallback: small files (< 400KB) converted to data URL if cloud storage was unreachable
    if (!fileUrl && file.size && file.size <= 400 * 1024 && typeof FileReader !== 'undefined') {
      try {
        fileUrl = await new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onload = function(e) { resolve((e && e.target && e.target.result) || ''); };
          reader.onerror = function() { resolve(''); };
          reader.readAsDataURL(file);
        });
      } catch (_) {}
    }

    // Local in-session URL fallback
    if (!fileUrl && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        fileUrl = URL.createObjectURL(file);
      } catch (_) {}
    }

    var newAtt = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: file.name,
      url: fileUrl || '',
      path: remotePath || '',
      bucket: targetBucket,
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
  if (!tid || !findManagedTask(tid)) return;
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
 * Asynchronously pre-fetches and caches department members for mentions and assignees
 */
async function fetchDepartmentMembers() {
  var client = getSupaClient();
  if (!client) return _cachedDepartmentMembers;
  try {
    var members = await client.get('bb_members?select=ic,name,rank,department,email,section,att_section,role&order=name.asc');
    if (Array.isArray(members) && members.length) {
      var eligible = members.filter(isMemberDepartmentRole);
      _cachedDepartmentMembers = eligible;
      if (typeof window !== 'undefined') window._cachedDepartmentMembers = eligible;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bb_cached_members', JSON.stringify(eligible));
        }
      } catch (_) {}
    }
  } catch (e) {
    console.warn('fetchDepartmentMembers error:', e);
  }
  return _cachedDepartmentMembers;
}

/**
 * Retrieves mention candidate list for department groups and members
 * @param {string} query
 * @returns {Array<Object>}
 */
function getDepartmentMentionCandidates(query) {
  var q = (query || '').toLowerCase().trim();
  var candidates = [];

  // Group mentions: @all, @Secretariat, @Logistics, @Media, @HQ, @Officers
  var groups = [
    { name: 'all', label: '@all', role: 'Group', desc: 'All department members' },
    { name: 'Secretariat', label: '@Secretariat', role: 'Group', desc: 'Secretariat Department' },
    { name: 'Logistics', label: '@Logistics', role: 'Group', desc: 'Logistics Department' },
    { name: 'Media', label: '@Media', role: 'Group', desc: 'Media Department' },
    { name: 'HQ', label: '@HQ', role: 'Group', desc: 'HQ Management' },
    { name: 'Officers', label: '@Officers', role: 'Group', desc: 'Company Officers' }
  ];

  groups.forEach(function(g) {
    if (!q || g.name.toLowerCase().indexOf(q) !== -1 || g.label.toLowerCase().indexOf(q) !== -1) {
      candidates.push(g);
    }
  });

  // Department members
  var memberMap = {};

  var addCandidateMember = function(m) {
    if (!m || !m.name) return;
    var safeName = String(m.name).trim();
    if (!safeName || safeName.toLowerCase() === 'unassigned') return;
    if (memberMap[safeName]) return;
    if (typeof isDeletedOrTestAccount === 'function' && isDeletedOrTestAccount(m)) return;

    if (isMemberDepartmentRole(m)) {
      var dTag = m.department ? (m.department.toLowerCase() === 'department nco' ? 'Department NCO' : m.department) : (m.rank || 'NCO');
      memberMap[safeName] = {
        name: safeName,
        label: '@' + safeName,
        role: dTag,
        email: m.email || m.ic || '',
        ic: m.ic || '',
        desc: (m.rank || 'NCO') + (m.department ? (' · ' + m.department) : '')
      };
    }
  };

  // Source A: In-memory cached department members
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(addCandidateMember);
  }

  // Source B: LocalStorage caches (bb_members_cache, bb_all_members, bb_cached_members)
  if (typeof localStorage !== 'undefined') {
    ['bb_members_cache', 'bb_all_members', 'bb_cached_members'].forEach(function(key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach(addCandidateMember);
          }
        }
      } catch (_) {}
    });
  }

  // Source C: Window global cached members if available
  if (typeof window !== 'undefined' && Array.isArray(window._cachedDepartmentMembers)) {
    window._cachedDepartmentMembers.forEach(addCandidateMember);
  }

  // Source D: Current user from session
  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  if (myName && !memberMap[myName]) {
    addCandidateMember({
      name: myName,
      department: (typeof sessionGet === 'function' ? sessionGet('department') : '') || 'HQ',
      rank: (typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Sergeant',
      email: (typeof sessionGet === 'function' ? sessionGet('email') : '') || '',
      ic: (typeof sessionGet === 'function' ? sessionGet('ic') : '') || ''
    });
  }

  // Source E: Assignees from loaded tasks
  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name !== 'Unassigned' && !memberMap[t.assignee_name]) {
      addCandidateMember({
        name: t.assignee_name,
        department: t.department || 'Department NCO',
        rank: 'NCO',
        email: t.assignee_ic || '',
        ic: t.assignee_ic || ''
      });
    }
  });

  // Source F: Authorized accounts (Creator and testing accounts)
  if (!memberMap['Jeshua Koh']) {
    addCandidateMember({
      name: 'Jeshua Koh',
      department: 'HQ',
      rank: 'Sergeant',
      email: 'jeshuakoh2008@gmail.com',
      ic: '080116-14-0615',
      section: 'Senior',
      att_section: 'Senior'
    });
  }
  if (!memberMap['Tester Account']) {
    addCandidateMember({
      name: 'Tester Account',
      department: 'Officers',
      rank: 'Lieutenant',
      email: 'jeshuakoh1601@gmail.com',
      ic: 'tester-sync@pjbb.org',
      section: 'Officer',
      att_section: 'Officer'
    });
  }

  Object.keys(memberMap).sort().forEach(function(k) {
    var m = memberMap[k];
    if (!q || m.name.toLowerCase().indexOf(q) !== -1 || m.label.toLowerCase().indexOf(q) !== -1 || (m.desc && m.desc.toLowerCase().indexOf(q) !== -1)) {
      candidates.push(m);
    }
  });

  return candidates;
}

/**
 * Handles typing in the comment box to reveal @ mention suggestions
 * @param {HTMLElement} inputEl
 */
var _activeMentionTarget = null;

/**
 * Ensures a contenteditable element has a compatible .value getter/setter for tests and form submissions
 * @param {HTMLElement} el
 */
function ensureCommentInputValueProperty(el) {
  if (!el || el.tagName !== 'DIV') return el;
  if (!Object.prototype.hasOwnProperty.call(el, '_hasValueProp')) {
    var initialVal = el.value;
    el._hasValueProp = true;
    var rawText = (typeof initialVal === 'string') ? initialVal : '';
    try {
      Object.defineProperty(el, 'value', {
        get: function() {
          var clone = el.cloneNode(true);
          var pills = clone.querySelectorAll ? clone.querySelectorAll('.tb-mention-pill') : [];
          if (pills && pills.forEach) {
            pills.forEach(function(p) {
              p.replaceWith(document.createTextNode(p.textContent || ''));
            });
          }
          var text = (clone.textContent || clone.innerText || '').replace(/\u00A0/g, ' ');
          if (!text && rawText) return rawText;
          return text;
        },
        set: function(v) {
          rawText = v || '';
          if (!v) {
            el.innerHTML = '';
          } else {
            el.innerHTML = (typeof formatCommentMentions === 'function') ? formatCommentMentions(v) : v;
          }
        },
        configurable: true
      });
      if (typeof initialVal === 'string' && initialVal.length > 0) {
        el.value = initialVal;
      }
    } catch (_) {}
  }
  return el;
}

/**
 * Checks if the text preceding the caret is an exact mention candidate, and converts it to a styled mention pill badge
 * @param {HTMLElement} inputEl
 * @returns {boolean}
 */
function checkAndConvertCompletedMentionOnSpace(inputEl) {
  if (!inputEl) return false;
  var isContentEdit = inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true';
  if (!isContentEdit) return false;

  var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
  if (!sel || !sel.focusNode) return false;

  var node = sel.focusNode;
  if (node.nodeType !== 3) return false; // Must be a text node
  var text = node.textContent || '';
  var offset = sel.focusOffset || text.length;
  var before = text.slice(0, offset);

  var match = before.match(/@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)$/);
  if (!match) return false;

  var queryName = match[1].trim().toLowerCase();
  if (!queryName) return false;

  var allCandidates = getDepartmentMentionCandidates(queryName);
  var exact = allCandidates.find(function(c) {
    return c.name.toLowerCase() === queryName || c.label.toLowerCase() === ('@' + queryName);
  });

  if (!exact) return false;

  var beforeMention = before.slice(0, before.length - match[0].length);
  var afterMention = text.slice(offset);

  node.textContent = beforeMention;

  var pill = document.createElement('span');
  pill.className = 'tb-mention-pill';
  pill.setAttribute('contenteditable', 'false');
  pill.textContent = '@' + exact.name;

  var spaceNode = document.createTextNode('\u00A0');
  var parent = node.parentNode;
  if (parent) {
    var next = node.nextSibling;
    parent.insertBefore(pill, next);
    parent.insertBefore(spaceNode, pill.nextSibling);
    if (afterMention) {
      var afterNode = document.createTextNode(afterMention);
      parent.insertBefore(afterNode, spaceNode.nextSibling);
    }
    try {
      var range = document.createRange();
      range.setStartAfter(spaceNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }

  return true;
}

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

  var match = text.match(/@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)$/);
  if (match) {
    var query = match[1];
    if (query.split(/\s+/).length <= 6) {
      var allCandidates = getDepartmentMentionCandidates(query);
      if (allCandidates.length > 0) {
        showMentionDropdown(el, query);
        return;
      }
    }
  }

  hideMentionDropdown();
}

function handleTaskCommentInput(inputEl) {
  _activeMentionTarget = inputEl;
  if (!inputEl) return;
  ensureCommentInputValueProperty(inputEl);

  var text = '';
  var isContentEdit = inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true';
  if (isContentEdit) {
    var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    if (sel && sel.focusNode) {
      var nodeText = sel.focusNode.textContent || '';
      var offset = sel.focusOffset || 0;
      text = nodeText.slice(0, offset);
    } else {
      text = inputEl.innerText || inputEl.textContent || '';
    }
  } else {
    var val = inputEl.value || '';
    var cursor = (typeof inputEl.selectionStart === 'number') ? inputEl.selectionStart : val.length;
    text = val.slice(0, cursor);
  }

  // Match @query ending at cursor
  var match = text.match(/@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)$/);
  if (match) {
    var query = match[1];
    if (query.split(/\s+/).length <= 6) {
      var allCandidates = getDepartmentMentionCandidates(query);
      if (allCandidates.length > 0) {
        showMentionDropdown(inputEl, query);
        return;
      }
    }
  }

  hideMentionDropdown();
}

/**
 * Handles plain-text pasting into task comment box
 * @param {ClipboardEvent} e
 * @param {HTMLElement} inputEl
 */
function handleTaskCommentPaste(e, inputEl) {
  if (e && e.clipboardData) {
    e.preventDefault();
    var text = e.clipboardData.getData('text/plain') || '';
    if (!text) return;
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
      if (sel && sel.rangeCount) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    handleTaskCommentInput(inputEl);
  }
}

/**
 * Renders HTML items inside the mention dropdown
 * @param {HTMLElement} dropdown
 * @param {Array<Object>} candidates
 */
function renderMentionDropdownItems(dropdown, candidates) {
  if (!dropdown) return;
  var html = '';
  candidates.slice(0, 8).forEach(function(c, i) {
    var isGroup = c.role === 'Group';
    var iconHtml = isGroup
      ? '<span style="width:24px;height:24px;border-radius:6px;background:rgba(217,163,35,0.2);color:var(--brand-gold,#f5c542);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">#</span>'
      : getAssigneeAvatarHtml(c.name, c.email || c.ic, 24);

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
 * Renders the floating mention dropdown menu
 * @param {HTMLElement} inputEl
 * @param {string} query
 */
function showMentionDropdown(inputEl, query) {
  var dropdown = (typeof document !== 'undefined') ? document.querySelector('.tb-mentions-dropdown') : null;
  if (!dropdown) return;

  var qClean = (query || '').trim();
  var candidates = qClean ? getDepartmentMentionCandidates(qClean) : [];
  _currentMentionCandidates = candidates;
  _activeMentionIndex = 0;

  if (!candidates.length) {
    hideMentionDropdown();
    return;
  }

  renderMentionDropdownItems(dropdown, candidates);
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
 * Handles keyboard navigation inside comment box (Arrow keys, Enter, Tab, Escape, Spacebar)
 * @param {KeyboardEvent} e
 * @param {HTMLElement} inputEl
 */
function handleTaskCommentKeyDown(e, inputEl) {
  ensureCommentInputValueProperty(inputEl);
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

  // Spacebar handling: If user typed an exact complete candidate name, immediately turn into mention badge!
  if (e.key === ' ' || e.key === 'Spacebar') {
    var converted = checkAndConvertCompletedMentionOnSpace(inputEl);
    if (converted) {
      e.preventDefault();
      hideMentionDropdown();
      return;
    }
    hideMentionDropdown();
  }

  // Enter or Ctrl+Enter submits comment (Shift+Enter inserts newline in multiline)
  if (e.key === 'Enter' && !isDropdownOpen) {
    if ((e.ctrlKey || e.metaKey) || !e.shiftKey) {
      e.preventDefault();
      handleTaskCommentSubmit(inputEl);
    }
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

function placeCaretAtEnd(el) {
  if (!el || typeof window === 'undefined' || !window.getSelection) return;
  try {
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
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

  ensureCommentInputValueProperty(input);

  if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
    var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    if (sel && sel.focusNode) {
      var node = sel.focusNode;
      if (node.nodeType === 3) {
        var nodeText = node.textContent || '';
        var offset = sel.focusOffset || nodeText.length;
        var beforeC = nodeText.slice(0, offset);
        var afterC = nodeText.slice(offset);
        var newBeforeC = beforeC.replace(/@([a-zA-Z0-9_\s]*)$/, '');
        node.textContent = newBeforeC;

        var pill = document.createElement('span');
        pill.className = 'tb-mention-pill';
        pill.setAttribute('contenteditable', 'false');
        pill.textContent = '@' + candidate.name;

        var spaceNode = document.createTextNode('\u00A0');
        var parent = node.parentNode;
        if (parent) {
          var next = node.nextSibling;
          parent.insertBefore(pill, next);
          parent.insertBefore(spaceNode, pill.nextSibling);
          if (afterC) {
            var afterNode = document.createTextNode(afterC);
            parent.insertBefore(afterNode, spaceNode.nextSibling);
          }
          try {
            var range = document.createRange();
            range.setStartAfter(spaceNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
      } else {
        var curText = (input.innerText || input.textContent || '').replace(/\u00A0/g, ' ');
        var replaced = curText.replace(/@([a-zA-Z0-9_\s]*)$/, '') + '@' + candidate.name + ' ';
        input.innerHTML = (typeof formatCommentMentions === 'function') ? formatCommentMentions(replaced) : replaced;
        if (typeof placeCaretAtEnd === 'function') placeCaretAtEnd(input);
      }
    } else {
      var curText2 = (input.innerText || input.textContent || '').replace(/\u00A0/g, ' ');
      var replaced2 = curText2.replace(/@([a-zA-Z0-9_\s]*)$/, '') + '@' + candidate.name + ' ';
      input.innerHTML = (typeof formatCommentMentions === 'function') ? formatCommentMentions(replaced2) : replaced2;
      if (typeof placeCaretAtEnd === 'function') placeCaretAtEnd(input);
    }
    input.focus();
  } else {
    var val = input.value || '';
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
  }

  hideMentionDropdown();
}

/**
 * Retrieves all unique candidate mention names sorted by length descending (longest first)
 * @returns {Array<string>}
 */
function getAllMentionCandidateNames() {
  var list = ['all', 'Secretariat', 'Logistics', 'Media', 'HQ', 'Officers', 'Jeshua Koh', 'Tester Account'];
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && m.name.trim()) list.push(m.name.trim());
    });
  }
  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  if (myName && myName.trim()) list.push(myName.trim());
  if (Array.isArray(_allLoadedTasks)) {
    _allLoadedTasks.forEach(function(t) {
      if (t.assignee_name && t.assignee_name !== 'Unassigned' && t.assignee_name.trim()) {
        list.push(t.assignee_name.trim());
      }
    });
  }
  try {
    if (typeof localStorage !== 'undefined') {
      ['bb_members_cache', 'bb_all_members', 'bb_cached_members'].forEach(function(key) {
        var raw = localStorage.getItem(key);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach(function(m) {
              if (m && m.name && m.name.trim()) list.push(m.name.trim());
            });
          }
        }
      });
    }
  } catch (_) {}

  var seen = {};
  var unique = [];
  list.forEach(function(name) {
    var k = name.toLowerCase();
    if (!seen[k]) {
      seen[k] = true;
      unique.push(name);
    }
  });
  unique.sort(function(a, b) { return b.length - a.length; });
  return unique;
}

function _safeCommentMentionToken(str) {
  if (!str) return '';
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps @mentions in styled mention badges matching full member & group names
 * @param {string} text
 * @returns {string}
 */
function formatCommentMentions(text) {
  return highlightTaskMentions(String(text || ''), _safeCommentMentionToken);
}

function formatTaskDescriptionMentions(html) {
  if (typeof sanitizeHtml !== 'function') return formatCommentMentions(html);
  return sanitizeHtml(html).split(/(<[^>]+>)/g).map(function(part, index) {
    return index % 2 ? part : highlightTaskMentions(part, function(value) { return value; });
  }).join('');
}

function highlightTaskMentions(text, escapeText) {
  var candidates = getAllMentionCandidateNames();
  var out = escapeText(text);

  // 1. Replace known full candidate names (longest first so 3-4 word names match before sub-parts)
  candidates.forEach(function(name) {
    if (!name) return;
    var esc = escapeText(name).replace(/[.*+?^${}()|[\]\\]/g, function(ch) { return '\\' + ch; });
    var rx = new RegExp('(^|[^a-zA-Z0-9_>])@(' + esc + ')(?=[^a-zA-Z0-9_]|$)', 'gi');
    out = out.replace(rx, function(match, prefix, matchedName) {
      return prefix + '<span class="tb-mention-pill">@' + matchedName + '</span>';
    });
  });

  // 2. Fallback for uppercase multi-word member names (e.g. OLIVER LING CHEE SHENG) if not in candidate list
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([A-Z0-9_]+(?:\s+[A-Z0-9_]+){1,5})(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    var safe = _safeCommentMentionToken(mName);
    return prefix + '<span class="tb-mention-pill">@' + safe + '</span>';
  });

  // 3. Fallback for 2-word names (e.g. Jeshua Koh) if not in candidate list
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    var safe = _safeCommentMentionToken(mName);
    return prefix + '<span class="tb-mention-pill">@' + safe + '</span>';
  });

  // 4. Fallback for any other single-word @mentions not in directory
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    var safe = _safeCommentMentionToken(mName);
    return prefix + '<span class="tb-mention-pill">@' + safe + '</span>';
  });

  return out;
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
  if (t && String(t.description || '').trim() === String(fullDesc || '').trim()) {
    return;
  }
  saveTaskField(_activeDetailTaskId, 'description', fullDesc);
}

/**
 * Resolves temporary optimistic task IDs to persisted database IDs before database queries
 * @param {string|number} id
 * @returns {Promise<string|number>}
 */
async function resolveRealTaskId(id) {
  if (!id) return id;
  var strId = String(id);
  if (!strId.startsWith('temp_')) return id;

  var t = findManagedTask(id);
  if (t) {
    if (t._realDbId && !String(t._realDbId).startsWith('temp_')) return t._realDbId;
    if (t.id && !String(t.id).startsWith('temp_')) return t.id;
    if (t._creationPromise) {
      try {
        var resolved = await t._creationPromise;
        if (resolved && !String(resolved).startsWith('temp_')) {
          t.id = resolved;
          t._realDbId = resolved;
          return resolved;
        }
      } catch (_) {}
    }
  }

  // Look in _allLoadedTasks for matching task title
  if (t && t.title) {
    var match = _allLoadedTasks.find(function(x) {
      return String(x.id) !== strId && !String(x.id).startsWith('temp_') && x.title === t.title;
    });
    if (match && match.id) {
      t.id = match.id;
      t._realDbId = match.id;
      return match.id;
    }
    // Query PostgREST
    var client = getSupaClient();
    if (client) {
      try {
        var rows = await client.get('bb_tasks?title=eq.' + encodeURIComponent(t.title) + '&order=created_at.desc&limit=1');
        if (Array.isArray(rows) && rows[0] && rows[0].id) {
          t.id = rows[0].id;
          t._realDbId = rows[0].id;
          delete _taskMap[strId];
          _taskMap[rows[0].id] = t;
          return rows[0].id;
        }
      } catch (_) {}
    }
  }

  return id;
}

/**
 * Saves a specific field on active task instantly with optimistic update
 */
async function saveTaskField(id, field, value) {
  var t = findManagedTask(id);
  if (!t) return;
  if (!['title', 'description', 'priority', 'due_date', 'estimate', 'project_name', 'attachments', 'subtasks', 'links', 'status', 'assignee_name', 'assignee_ic'].includes(field)) return;
  if (field === 'status') return memberUpdateTaskStatus(id, value);
  if (field === 'attachments') return saveTaskAttachments(id, value);
  if (field === 'subtasks') return saveTaskSubtasks(id, value);
  if (field === 'links') return saveTaskLinks(id, value);
  if (field === 'assignee_name') return selectTaskDetailAssignee(value);

  var effectiveId = id;
  if (String(id).startsWith('temp_')) {
    effectiveId = await resolveRealTaskId(id);
  }

  if (field === 'estimate') {
    t.estimate = value;
    var updatedDescEst = buildTaskDescriptionWithMeta(t, t.description);
    t.description = updatedDescEst;
    _taskMap[id] = t;
    if (effectiveId !== id) _taskMap[effectiveId] = t;
    if (typeof window !== 'undefined') {
      window._taskMap = window._taskMap || {};
      window._taskMap[id] = t;
      if (effectiveId !== id) window._taskMap[effectiveId] = t;
    }
    var loadedEst = _allLoadedTasks.find(function(x) { return String(x.id) === String(id) || String(x.id) === String(effectiveId); });
    if (loadedEst) {
      loadedEst.estimate = value;
      loadedEst.description = updatedDescEst;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks));
      }
    } catch (_) {}
    if (_tasksViewMode === 'board') {
      if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
    } else if (_tasksViewMode === 'mytasks') {
      renderMyTasksView();
    } else if (_tasksViewMode === 'projects') {
      renderProjectsView();
    }
    var estValEl = document.querySelector('.tdm-estimate-val');
    if (estValEl) estValEl.textContent = value || 'Estimate';

    var clientEst = getSupaClient();
    if (clientEst && !String(effectiveId).startsWith('temp_')) {
      try {
        await clientEst.patch('bb_tasks?id=eq.' + encodeURIComponent(effectiveId), { description: updatedDescEst });
        var prEst = (typeof window !== 'undefined' && window.PortalRealtime)
          ? window.PortalRealtime
          : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
        if (prEst && typeof prEst.broadcast === 'function') {
          prEst.broadcast('tasks', 'update', { id: effectiveId, field: 'estimate', value: value, estimate: value, description: updatedDescEst });
        }
        if (typeof showToast === 'function') {
          showToast('Estimate updated', 'info', 1000);
        }
      } catch (errEst) {
        console.warn('Background patch error for estimate:', errEst);
      }
    }
    return;
  }

  if (field === 'project_name') {
    t.project_name = value;
    var updatedDescProj = buildTaskDescriptionWithMeta(t, t.description);
    t.description = updatedDescProj;
    _taskMap[id] = t;
    if (effectiveId !== id) _taskMap[effectiveId] = t;
    if (typeof window !== 'undefined') {
      window._taskMap = window._taskMap || {};
      window._taskMap[id] = t;
      if (effectiveId !== id) window._taskMap[effectiveId] = t;
    }
    var loadedProj = _allLoadedTasks.find(function(x) { return String(x.id) === String(id) || String(x.id) === String(effectiveId); });
    if (loadedProj) {
      loadedProj.project_name = value;
      loadedProj.description = updatedDescProj;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks));
      }
    } catch (_) {}
    if (_tasksViewMode === 'board') {
      if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
    } else if (_tasksViewMode === 'mytasks') {
      renderMyTasksView();
    } else if (_tasksViewMode === 'projects') {
      renderProjectsView();
    }
    var clientProj = getSupaClient();
    if (clientProj && !String(effectiveId).startsWith('temp_')) {
      try {
        await clientProj.patch('bb_tasks?id=eq.' + encodeURIComponent(effectiveId), { description: updatedDescProj });
        var prProj = (typeof window !== 'undefined' && window.PortalRealtime)
          ? window.PortalRealtime
          : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
        if (prProj && typeof prProj.broadcast === 'function') {
          prProj.broadcast('tasks', 'update', { id: effectiveId, field: 'project_name', value: value, description: updatedDescProj });
        }
      } catch (errProj) {
        console.warn('Background patch error for project_name:', errProj);
      }
    }
    return;
  }

  var currentVal = t[field];
  if (currentVal === value) return;
  if (typeof currentVal === 'string' && typeof value === 'string' && currentVal.trim() === value.trim()) return;
  t[field] = value;
  _taskMap[id] = t;
  if (effectiveId !== id) _taskMap[effectiveId] = t;
  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
    window._taskMap[id] = t;
    if (effectiveId !== id) window._taskMap[effectiveId] = t;
  }
  var loaded = _allLoadedTasks.find(function(x) { return String(x.id) === String(id) || String(x.id) === String(effectiveId); });
  if (loaded) loaded[field] = value;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks));
    }
  } catch (_) {}
  // Optimistic updates on board
  if (_tasksViewMode === 'board') {
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
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
  if (client && !String(effectiveId).startsWith('temp_')) {
    var patch = {};
    patch[field] = value;
    try {
      await patchTaskInDatabase(client, effectiveId, patch);
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('tasks', 'update', { id: effectiveId, field: field, value: value });
      }
      if (typeof showToast === 'function') {
        showToast('Task updated', 'info', 1000);
      }
    } catch (err) {
      console.warn('Background patch error for field ' + field + ':', err);
      if (typeof showToast === 'function') {
        showToast('Failed to save task update.', 'error');
      }
    }
  } else if (typeof showToast === 'function') {
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
  var task = findManagedTask(_activeDetailTaskId);
  var pName = task ? (getTaskProjectName(task) || _activeProject) : _activeProject;
  var pStatuses = getProjectStatuses(pName);
  var html = '';
  pStatuses.forEach(function(sObj) {
    var color = sObj.color || (sObj.isCustom ? 'var(--text-secondary)' : '#64748b');
    html += '<div class="task-prop-dropdown-item" onclick="selectTaskDetailStatus(\'' + sObj.id + '\')">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block;"></span>'
      + '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(sObj.label) : sObj.label) + '</span>'
      + '</div>';
  });
  menu.innerHTML = html;
  menu.style.display = 'block';
}

function selectTaskDetailStatus(status) {
  if (!_activeDetailTaskId) return;
  var task = findManagedTask(_activeDetailTaskId);
  if (!task) return;
  var pName = getTaskProjectName(task) || _activeProject;
  if (!isValidTaskStatus(status, pName)) return;
  var taskId = _activeDetailTaskId;
  memberUpdateTaskStatus(taskId, status).then(function() {
    if (_activeDetailTaskId !== taskId) return;
    var pStatuses = getProjectStatuses(pName);
    var sConf = pStatuses.find(function(s) { return s.id.toLowerCase() === status.toLowerCase() || s.label.toLowerCase() === status.toLowerCase(); }) || STATUS_CONFIG[status] || { label: status, color: '#3b82f6' };
    var statusDot = document.querySelector('.tdm-status-dot');
    if (statusDot) statusDot.style.background = sConf.color || (sConf.isCustom ? 'var(--text-secondary)' : '#3b82f6');
    var statusText = document.querySelector('.tdm-status-text');
    if (statusText) statusText.textContent = sConf.label;
  });
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
  if (!findManagedTask(_activeDetailTaskId)) return;
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
    if (cleanName && (!cleanIc || cleanIc.indexOf('@') === -1)) {
      if (typeof isPortalCreator === 'function' && isPortalCreator(cleanName, cleanIc)) {
        cleanIc = 'jeshuakoh2008@gmail.com';
      } else {
        var sResolver = (typeof resolveMemberDirectoryInfo === 'function')
          ? resolveMemberDirectoryInfo
          : (typeof window !== 'undefined' && typeof window.resolveMemberDirectoryInfo === 'function' ? window.resolveMemberDirectoryInfo : null);
        if (sResolver) {
          var dirS = sResolver(cleanName || cleanIc);
          if (dirS) {
            if (!cleanName && dirS.name) cleanName = dirS.name;
            if (!cleanIc && (dirS.email || dirS.ic)) cleanIc = dirS.email || dirS.ic;
          }
        }
      }
    }
    var isCreator = (typeof isPortalCreator === 'function') ? isPortalCreator(cleanName, cleanIc) : /jeshua\s+koh/i.test(cleanName);
    var photoUrl = (typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(cleanName, cleanIc) : null;
  if (!photoUrl) {
    var pMap = (typeof _memberPfpsMap !== 'undefined' && _memberPfpsMap)
      ? _memberPfpsMap
      : ((typeof window !== 'undefined' && window._memberPfpsMap)
        ? window._memberPfpsMap
        : ((typeof global !== 'undefined' && global._memberPfpsMap)
          ? global._memberPfpsMap
          : null));
    if (pMap) {
      if (cleanIc && pMap[cleanIc.toLowerCase()]) photoUrl = pMap[cleanIc.toLowerCase()];
      else if (cleanName && pMap[cleanName.toLowerCase()]) photoUrl = pMap[cleanName.toLowerCase()];
    }
  }
    var tooltip = (cleanName || 'Unassigned') + (isCreator ? ' (Portal Creator)' : '');
    aAvatar.title = tooltip;
    aAvatar.setAttribute('aria-label', tooltip);
    aAvatar.style.cursor = 'pointer';
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(cleanIc || cleanName, cleanName)
      : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);
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
      applyAvatarOutlineElement(aAvatar, outlineInfo ? outlineInfo.style : (isCreator ? 'rgb' : 'none'));
    }
  }
  var menu = document.querySelector('.tdm-assignee-dropdown');
  if (menu) menu.style.display = 'none';

  // Instant in-memory optimistic render
  if (_tasksViewMode === 'board') {
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
  } else if (_tasksViewMode === 'mytasks') {
    renderMyTasksView();
  }

  if (typeof showToast === 'function') {
    showToast('Assigned to ' + (cleanName || 'Unassigned'), 'info', 1000);
  }

  // Background patch without refetching from server
  var effectiveTid = tid;
  if (String(tid).startsWith('temp_')) {
    effectiveTid = await resolveRealTaskId(tid);
  }
  var client = getSupaClient();
  if (client && !String(effectiveTid).startsWith('temp_')) {
    try {
      await client.patch('bb_tasks?id=eq.' + encodeURIComponent(effectiveTid), { assignee_name: cleanName });
      if (cleanIc) {
        try { await client.patch('bb_tasks?id=eq.' + encodeURIComponent(effectiveTid), { assignee_ic: cleanIc }); } catch (_) {}
      }
      if (cleanName && cleanName !== 'Unassigned') {
        var assignDispatcher = (typeof sendPortalPushNotification === 'function')
          ? sendPortalPushNotification
          : (typeof window !== 'undefined' && typeof window.sendPortalPushNotification === 'function' ? window.sendPortalPushNotification : null);
        if (assignDispatcher) {
          var targetList = [cleanIc, cleanName].filter(Boolean);
          var mentionRes = (typeof resolveMentionTargets === 'function')
            ? resolveMentionTargets('@' + cleanName)
            : { targetUsers: [] };
          var assignEmail = '';
          if (Array.isArray(mentionRes.targetUsers)) {
            mentionRes.targetUsers.forEach(function(u) {
              if (u && targetList.indexOf(u) === -1) targetList.push(u);
              if (u && u.indexOf('@') !== -1 && !assignEmail) assignEmail = u;
            });
          }
          assignDispatcher({
            type: 'task_assigned',
            title: 'Task Assigned: ' + (t.title || 'Task Update'),
            body: 'You have been assigned to: ' + (t.title || 'Task Update'),
            targetUsers: targetList,
            targetDept: null,
            tab: 'tasks',
            targetId: tid
          }).catch(function() {});
        }
      }
      var prAssign = (typeof window !== 'undefined' && window.PortalRealtime)
        ? window.PortalRealtime
        : ((typeof global !== 'undefined' && global.PortalRealtime) ? global.PortalRealtime : null);
      if (prAssign && typeof prAssign.broadcast === 'function') {
        try {
          prAssign.broadcast('tasks', 'update', {
            id: tid,
            field: 'assignee_name',
            value: cleanName,
            assignee_name: cleanName,
            assignee_ic: cleanIc,
            assignee_email: (typeof assignEmail !== 'undefined') ? assignEmail : '',
            title: (t && t.title) || 'Task Update',
            creator_name: (typeof sessionGet === 'function' ? sessionGet('name') : '') || (t && t.creator_name) || 'Jeshua Koh',
            creator_ic: (typeof sessionGet === 'function' ? sessionGet('ic') : '') || (t && t.creator_ic) || '',
            task: t
          });
          if (cleanName && cleanName !== 'Unassigned') {
            prAssign.broadcast('task_assigned', 'create', {
              id: tid,
              taskId: tid,
              title: (t && t.title) || 'Task Update',
              assignee_name: cleanName,
              assignee_ic: cleanIc,
              assignee_email: (typeof assignEmail !== 'undefined') ? assignEmail : '',
              creator_name: (typeof sessionGet === 'function' ? sessionGet('name') : '') || (t && t.creator_name) || 'Jeshua Koh',
              creator_ic: (typeof sessionGet === 'function' ? sessionGet('ic') : '') || (t && t.creator_ic) || '',
              updated_at: new Date().toISOString()
            });
          }
        } catch (_) {}
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
async function editTaskDetailEstimate(e) {
  if (e) e.stopPropagation();
  if (!_activeDetailTaskId) return;
  var t = findManagedTask(_activeDetailTaskId);
  var currentEst = getTaskEstimate(t);
  var newEst = null;
  if (typeof showPromptModal === 'function') {
    newEst = await showPromptModal('Set Task Estimate', 'e.g. 2h, 1d, 30m', currentEst, {
      confirmText: 'Save Estimate',
      cancelText: 'Cancel',
      subtitle: 'Enter the estimated effort or duration for this task.'
    });
  }
  if (newEst !== null) {
    saveTaskField(_activeDetailTaskId, 'estimate', newEst.trim());
    var estValEl = document.querySelector('.tdm-estimate-val');
    if (estValEl) estValEl.textContent = newEst.trim() || 'Estimate';
    if (typeof showToast === 'function') {
      showToast('Estimate updated', 'success');
    }
  }
}

/**
 * Closes task detail modal
 */
function closeTaskDetail() {
  if (typeof document === 'undefined') return;
  var t = (typeof window !== 'undefined' && window._taskMap && window._taskMap[_activeDetailTaskId]) || _taskMap[_activeDetailTaskId];
  if (!t && _allLoadedTasks && _allLoadedTasks.length) {
    t = _allLoadedTasks.find(function(x) { return String(x.id) === String(_activeDetailTaskId); });
  }
  var titleEl = document.getElementById('tdm-title');
  if (titleEl && _activeDetailTaskId && t) {
    var titleVal = (titleEl.textContent || '').trim();
    if (titleVal && titleVal !== (t.title || '').trim() && (!_initialTaskDetailState || titleVal !== _initialTaskDetailState.title)) {
      saveTaskField(_activeDetailTaskId, 'title', titleVal);
    }
  }
  var descEl = document.getElementById('tdm-desc');
  if (descEl && _activeDetailTaskId && t) {
    var descHtml = (descEl.innerHTML || '').trim();
    if (!_initialTaskDetailState || descHtml !== _initialTaskDetailState.descHtml) {
      saveActiveTaskBrief();
    }
  }
  var m = document.getElementById('task-detail-modal');
  if (m) m.style.display = 'none';
  var sMenu = document.querySelector('.tdm-status-dropdown');
  if (sMenu) sMenu.style.display = 'none';
  var aMenu = document.querySelector('.tdm-assignee-dropdown');
  if (aMenu) aMenu.style.display = 'none';
  _activeDetailTaskId = null;
  if (typeof window !== 'undefined') {
    window._activeDetailTaskId = null;
  }
  if (typeof _activeTaskPollTimer !== 'undefined' && _activeTaskPollTimer) {
    clearInterval(_activeTaskPollTimer);
    _activeTaskPollTimer = null;
  }
  _initialTaskDetailState = null;
}

/**
 * Deletes the active task being viewed in the task brief modal
 */
async function deleteActiveTask() {
  if (!_activeDetailTaskId || _isDeletingTask || !findManagedTask(_activeDetailTaskId)) return;
  var taskId = _activeDetailTaskId;
  _isDeletingTask = true;
  var taskBackup = _taskMap[taskId] || (_allLoadedTasks && _allLoadedTasks.find(function(t) { return String(t.id) === String(taskId); }));
  var confirmFn = (typeof showConfirmModal === 'function')
    ? showConfirmModal
    : async function() { return false; };

  var confirmed = await confirmFn(
    'Are you sure you want to delete this task? This action cannot be undone.',
    'Delete Task'
  );
  if (!confirmed || !findManagedTask(taskId)) {
    _isDeletingTask = false;
    return;
  }

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
    if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
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
      try {
        await Promise.allSettled([
          client.delete('bb_config?key=eq.bb_task_subtasks_' + encodeURIComponent(taskId)),
          client.delete('bb_config?key=eq.bb_task_attachments_' + encodeURIComponent(taskId)),
          client.delete('bb_config?key=eq.bb_task_links_' + encodeURIComponent(taskId)),
          client.delete('bb_config?key=eq.bb_task_comments_' + encodeURIComponent(taskId))
        ]);
      } catch (_) {}
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('tasks', 'delete', { id: taskId });
      }
    } catch (err) {
      _isDeletingTask = false;
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
        if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
  else renderColumnsFromTasks(_allLoadedTasks);
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
  _isDeletingTask = false;
}

/**
 * Updates task status from the member/NCO board
 * @param {string} id
 * @param {string} status
 * @param {string} dept
 */
async function memberUpdateTaskStatus(id, status, _dept) {
  var task = findManagedTask(id);
  if (!task) return false;
  var pName = getTaskProjectName(task) || _activeProject;
  status = normalizeTaskStatus(status, pName);
  if (!isValidTaskStatus(status, pName) || normalizeTaskStatus(task.status, pName) === status) return false;
  var effectiveId = id;
  if (String(id).startsWith('temp_')) {
    effectiveId = await resolveRealTaskId(id);
  }
  var client = getSupaClient();
  if (!client || _taskStatusWrites.has(id)) return;
  _taskStatusWrites.add(id);
  var oldStatus = task.status;
  var paint = function() {
    if (_tasksViewMode === 'mytasks') renderMyTasksView();
    else if (_tasksViewMode === 'projects') renderProjectsView();
    else if (_projectDisplayMode === 'list') renderTasksListView(_activeProject);
    else renderColumnsFromTasks(_allLoadedTasks);
  };
  var cachedTask = _allLoadedTasks.find(function(row) { return String(row.id) === String(id) || String(row.id) === String(effectiveId); });
  task.status = status;
  if (cachedTask) cachedTask.status = status;
  if (_taskMap[id]) _taskMap[id].status = status;
  if (effectiveId !== id && _taskMap[effectiveId]) _taskMap[effectiveId].status = status;
  try {
    paint();
    if (!String(effectiveId).startsWith('temp_')) {
      await client.patch('bb_tasks?id=eq.' + encodeURIComponent(effectiveId), { status: status });
    }
  } catch (e) {
    task.status = oldStatus;
    if (cachedTask) cachedTask.status = oldStatus;
    if (_taskMap[id]) _taskMap[id].status = oldStatus;
    if (effectiveId !== id && _taskMap[effectiveId]) _taskMap[effectiveId].status = oldStatus;
    paint();
    if (typeof showToast === 'function') {
      showToast('Failed to update task status.', 'error');
    }
    return false;
  } finally {
    _taskStatusWrites.delete(id);
  }
  var current = _allLoadedTasks.find(function(row) { return String(row.id) === String(id) || String(row.id) === String(effectiveId); });
  if (current && current !== cachedTask) {
    current.status = status;
    paint();
  }
  try { localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks)); } catch (_) {}
  if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
    window.PortalRealtime.broadcast('tasks', 'update', { id: effectiveId, status: status });
  }
  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'task.status_update', targetType: 'task', targetId: effectiveId,
      details: { status: status, department: task.department }
    });
  }
  return true;
}

/**
 * Opens Create Task modal
 * @param {string} [defaultStatus='todo']
 */
function getAvailableProjectsList() {
  var pMap = {};
  var list = [];
  if (Array.isArray(_companyProjects)) {
    _companyProjects.forEach(function(p) {
      if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project' && !pMap[p]) {
        pMap[p] = true;
        list.push(p);
      }
    });
  }
  if (Array.isArray(_allLoadedTasks)) {
    _allLoadedTasks.forEach(function(t) {
      var p = getTaskProjectName(t);
      if (p && !p.toLowerCase().includes('sprint') && p !== 'General Project' && !pMap[p]) {
        pMap[p] = true;
        list.push(p);
      }
    });
  }
  if (_activeProject && !_activeProject.toLowerCase().includes('sprint') && _activeProject !== 'General Project' && _activeProject.toLowerCase() !== 'all' && _activeProject.toLowerCase() !== 'all tasks' && !pMap[_activeProject]) {
    pMap[_activeProject] = true;
    list.push(_activeProject);
  }
  if (!list.length) list = ['Media', 'Secretariat', 'HQ', 'Logistics'];
  return list;
}

function handleNewTaskProjectSelect(projectName) {
  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  var projInput = modal.querySelector('.new-task-project-input');
  if (projInput) projInput.value = projectName;
  var deptInput = modal.querySelector('.new-task-dept-input');
  var targetDept = 'general';
  if (projectName) {
    var pLower = projectName.toLowerCase().trim();
    if (DEPT_CONFIG[pLower]) {
      targetDept = pLower;
    } else {
      Object.keys(DEPT_CONFIG).forEach(function(k) {
        if (DEPT_CONFIG[k].label.toLowerCase() === pLower) targetDept = k;
      });
    }
  }
  if (deptInput) deptInput.value = targetDept;
  loadNewTaskAssigneeOptions();
}

function openCreateTaskModal(defaultStatus, fromTasksView) {
  if (typeof document === 'undefined') return;

  var isFromTasks = fromTasksView === true || _tasksViewMode === 'mytasks';

  if (!isFromTasks && (!_activeProject || _activeProject.toLowerCase() === 'all' || _activeProject.toLowerCase() === 'all tasks')) {
    if (typeof showToast === 'function') {
      showToast('Please select or create a project first before creating tasks.', 'warning');
    }
    setTasksViewMode('projects');
    return;
  }

  var modal = document.querySelector('.task-create-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  var targetProjStatuses = getProjectStatuses(_activeProject);
  var defStatus = defaultStatus || (targetProjStatuses[0] ? targetProjStatuses[0].id : 'todo');
  modal.setAttribute('data-target-status', defStatus);

  var projDisplay = modal.querySelector('.new-task-project-display');
  var projSelect = modal.querySelector('.new-task-project-select');
  var projInput = modal.querySelector('.new-task-project-input');
  var deptInput = modal.querySelector('.new-task-dept-input');

  if (isFromTasks) {
    if (projDisplay) projDisplay.style.display = 'none';
    if (projSelect) {
      var availableProjects = getAvailableProjectsList();
      projSelect.innerHTML = availableProjects.map(function(p) {
        return '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(p) : p) + '">' + (typeof escapeHtml === 'function' ? escapeHtml(p) : p) + '</option>';
      }).join('');
      projSelect.style.display = 'block';
      var initialProj = availableProjects[0] || 'Media';
      projSelect.value = initialProj;
      if (projInput) projInput.value = initialProj;
      handleNewTaskProjectSelect(initialProj);
    }
  } else {
    if (projSelect) projSelect.style.display = 'none';
    if (projDisplay) {
      projDisplay.style.display = 'flex';
      var projText = modal.querySelector('.new-task-project-name-text');
      if (projText) projText.textContent = _activeProject || 'General Project';
    }
    if (projInput) projInput.value = _activeProject || '';
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
    if (deptInput) deptInput.value = targetDept;
    loadNewTaskAssigneeOptions();
  }
}

/**
 * Closes Create Task modal
 */
function closeCreateTaskModal(clearDraft) {
  if (typeof document === 'undefined') return;
  var modal = document.querySelector('.task-create-modal');
  if (modal) {
    modal.style.display = 'none';
    if (clearDraft === true) {
      var dEl = modal.querySelector('.new-task-desc-input');
      if (dEl && dEl.isContentEditable) dEl.innerHTML = '';
      var titleEl = modal.querySelector('.new-task-title-input');
      if (titleEl) titleEl.value = '';
      var estEl = modal.querySelector('.new-task-estimate-input');
      if (estEl) estEl.value = '';
      var dueEl = modal.querySelector('.new-task-due-input');
      if (dueEl) dueEl.value = '';
      var projSelect = modal.querySelector('.new-task-project-select');
      if (projSelect) projSelect.style.display = 'none';
      var projDisplay = modal.querySelector('.new-task-project-display');
      if (projDisplay) projDisplay.style.display = 'flex';
    }
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
    var myIcVal = (typeof sessionGet === 'function' ? (sessionGet('ic') || sessionGet('email')) : '') || '';
    if (typeof isPortalCreator === 'function' && isPortalCreator(myName, myIcVal)) {
      myIcVal = 'jeshuakoh2008@gmail.com';
    }
    membersMap[myName] = { name: myName, ic: myIcVal };
  }
  if (Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && isMemberDepartmentRole(m)) {
        if (typeof isDeletedOrTestAccount === 'function' && isDeletedOrTestAccount(m)) return;
        if (m.name.toLowerCase() === 'jeshua koh') m.ic = 'jeshuakoh2008@gmail.com';
        membersMap[m.name] = m;
      }
    });
  }
  _allLoadedTasks.forEach(function(t) {
    if (t.assignee_name && t.assignee_name !== 'Unassigned') {
      if (!membersMap[t.assignee_name]) {
        var aIc = t.assignee_ic || '';
        if (t.assignee_name.toLowerCase() === 'jeshua koh') aIc = 'jeshuakoh2008@gmail.com';
        membersMap[t.assignee_name] = { name: t.assignee_name, ic: aIc };
      }
    }
  });

  var renderSelect = function(map) {
    sel.innerHTML = '<option value="">Unassigned</option>';
    Object.keys(map).sort().forEach(function(k) {
      var m = map[k];
      var opt = document.createElement('option');
      var optVal = m.ic || m.name;
      if (m.name && m.name.toLowerCase() === 'jeshua koh') optVal = 'jeshuakoh2008@gmail.com';
      opt.value = optVal;
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
        var eligible = members.filter(function(m) {
          if (!m || !m.name) return false;
          if (typeof isDeletedOrTestAccount === 'function' && isDeletedOrTestAccount(m)) return false;
          return isMemberDepartmentRole(m);
        });
        _cachedDepartmentMembers = eligible;
        eligible.forEach(function(m) {
          if (!m || !m.name) return;
          if (membersMap[m.name] && String(m.ic || '').toLowerCase().startsWith('archived_')) return;
          if (m.name.toLowerCase() === 'jeshua koh') m.ic = 'jeshuakoh2008@gmail.com';
          membersMap[m.name] = m;
        });
        renderSelect(membersMap);
      }
    } catch (e) {
      console.warn('loadNewTaskAssigneeOptions error:', e);
    }
  }
}

/**
 * Persists a task to Supabase bb_tasks with dynamic schema adaptability.
 * If the remote PostgreSQL table lacks optional columns (e.g., creator_name,
 * creator_ic, project_name, estimate, assignee_ic), it extracts the missing
 * column, encodes its value safely into the task's description metadata tag
 * ([Project: ... | Estimate: ... | Creator: ...]), removes the column from
 * the payload, and retries the insert until it succeeds.
 *
 * @param {Object} client Supabase client instance
 * @param {Object} rawPayload Task payload to insert
 * @returns {Promise<Object>} Inserted task object/array from PostgREST
 */
async function persistTaskToDatabase(client, rawPayload) {
  if (!client) throw new Error('Supabase client unavailable');
  var currentPayload = Object.assign({}, rawPayload);

  // Maximum retries equal to number of potentially optional columns + 2
  for (var attempt = 0; attempt < 8; attempt++) {
    try {
      return await client.post('bb_tasks', currentPayload);
    } catch (err) {
      var errStr = err ? (err.message || String(err)) : '';
      var errCode = err ? (err.code || '') : '';
      var isSchemaErr = /PGRST204|42703/i.test(errCode) ||
        /could not find the '([^']+)' column/i.test(errStr) ||
        /column ['"]([^'"]+)['"] of/i.test(errStr) ||
        /column ['"]([^'"]+)['"] does not exist/i.test(errStr) ||
        /schema cache/i.test(errStr);

      if (!isSchemaErr) {
        throw err;
      }

      // Try to identify the specific missing column from the error message
      var match = errStr.match(/could not find the '([^']+)' column/i) ||
                  errStr.match(/column ['"]([^'"]+)['"] does not exist/i) ||
                  errStr.match(/column ['"]([^'"]+)['"] of/i);
      var missingCol = match ? match[1] : null;

      if (missingCol && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
        if (missingCol === 'creator_name' && currentPayload.creator_name) {
          currentPayload.description = buildTaskDescriptionWithMeta(
            { creator_name: currentPayload.creator_name },
            currentPayload.description
          );
        } else if (missingCol === 'project_name' && currentPayload.project_name) {
          currentPayload.description = buildTaskDescriptionWithMeta(
            { project_name: currentPayload.project_name },
            currentPayload.description
          );
        } else if (missingCol === 'estimate' && currentPayload.estimate) {
          currentPayload.description = buildTaskDescriptionWithMeta(
            { estimate: currentPayload.estimate },
            currentPayload.description
          );
        }
        delete currentPayload[missingCol];
        continue;
      }

      // If specific column couldn't be parsed or was already deleted, progressively strip all optional columns
      var optionalCols = ['creator_name', 'creator_ic', 'project_name', 'estimate', 'assignee_ic'];
      var foundAny = false;
      for (var i = 0; i < optionalCols.length; i++) {
        var col = optionalCols[i];
        if (Object.prototype.hasOwnProperty.call(currentPayload, col)) {
          if (col === 'creator_name' && currentPayload.creator_name) {
            currentPayload.description = buildTaskDescriptionWithMeta(
              { creator_name: currentPayload.creator_name },
              currentPayload.description
            );
          } else if (col === 'project_name' && currentPayload.project_name) {
            currentPayload.description = buildTaskDescriptionWithMeta(
              { project_name: currentPayload.project_name },
              currentPayload.description
            );
          } else if (col === 'estimate' && currentPayload.estimate) {
            currentPayload.description = buildTaskDescriptionWithMeta(
              { estimate: currentPayload.estimate },
              currentPayload.description
            );
          }
          delete currentPayload[col];
          foundAny = true;
          break;
        }
      }

      if (!foundAny) {
        // If no optional columns remain, fall back strictly to guaranteed base schema
        var basePayload = {
          title: currentPayload.title,
          description: currentPayload.description,
          department: currentPayload.department || 'general',
          priority: currentPayload.priority || 'medium',
          due_date: currentPayload.due_date || null,
          assignee_name: currentPayload.assignee_name || null,
          status: currentPayload.status || 'todo',
          created_at: currentPayload.created_at || new Date().toISOString()
        };
        return await client.post('bb_tasks', basePayload);
      }
    }
  }

  var finalBasePayload = {
    title: rawPayload.title,
    description: rawPayload.description,
    department: rawPayload.department || 'general',
    priority: rawPayload.priority || 'medium',
    due_date: rawPayload.due_date || null,
    assignee_name: rawPayload.assignee_name || null,
    status: rawPayload.status || 'todo',
    created_at: rawPayload.created_at || new Date().toISOString()
  };
  return await client.post('bb_tasks', finalBasePayload);
}

/**
 * Patches a task in Supabase bb_tasks with dynamic schema adaptability.
 * If the remote PostgreSQL table lacks optional columns, strips them and retries.
 *
 * @param {Object} client Supabase client instance
 * @param {string|number} taskId Task ID to patch
 * @param {Object} patchPayload Fields to patch
 * @returns {Promise<any>}
 */
async function patchTaskInDatabase(client, taskId, patchPayload) {
  if (!client) throw new Error('Supabase client unavailable');
  var currentPatch = Object.assign({}, patchPayload);

  for (var attempt = 0; attempt < 8; attempt++) {
    try {
      return await client.patch('bb_tasks?id=eq.' + encodeURIComponent(taskId), currentPatch);
    } catch (err) {
      var errStr = err ? (err.message || String(err)) : '';
      var errCode = err ? (err.code || '') : '';
      var isSchemaErr = /PGRST204|42703/i.test(errCode) ||
        /could not find the '([^']+)' column/i.test(errStr) ||
        /column ['"]([^'"]+)['"] of/i.test(errStr) ||
        /column ['"]([^'"]+)['"] does not exist/i.test(errStr) ||
        /schema cache/i.test(errStr);

      if (!isSchemaErr) throw err;

      var match = errStr.match(/could not find the '([^']+)' column/i) ||
                  errStr.match(/column ['"]([^'"]+)['"] does not exist/i) ||
                  errStr.match(/column ['"]([^'"]+)['"] of/i);
      var missingCol = match ? match[1] : null;

      if (missingCol && Object.prototype.hasOwnProperty.call(currentPatch, missingCol)) {
        delete currentPatch[missingCol];
        if (Object.keys(currentPatch).length === 0) return null;
        continue;
      }

      var optionalCols = ['creator_name', 'creator_ic', 'project_name', 'estimate', 'assignee_ic'];
      var foundAny = false;
      for (var i = 0; i < optionalCols.length; i++) {
        var col = optionalCols[i];
        if (Object.prototype.hasOwnProperty.call(currentPatch, col)) {
          delete currentPatch[col];
          foundAny = true;
          break;
        }
      }
      if (!foundAny || Object.keys(currentPatch).length === 0) {
        return null;
      }
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

  var titleEl    = modal.querySelector('.new-task-title-input');
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

  var assigneeIc = assEl ? assEl.value : '';
  var assigneeName = (assEl && assEl.selectedIndex >= 0 && assEl.options[assEl.selectedIndex].text) || '';
  if (assigneeName === 'Unassigned') assigneeName = '';
  if (assigneeName) {
    if (assigneeName.toLowerCase() === 'jeshua koh' || (typeof isPortalCreator === 'function' && isPortalCreator(assigneeName, ''))) {
      assigneeIc = 'jeshuakoh2008@gmail.com';
    }
  }

  var priority = priorityEl ? priorityEl.value : 'medium';
  var due = dueEl ? dueEl.value : null;
  var estimate = estEl ? estEl.value.trim() : '';
  var projSelEl = modal.querySelector('.new-task-project-select');
  var projectName = (projSelEl && projSelEl.style.display !== 'none' && projSelEl.value)
    ? projSelEl.value.trim()
    : (_activeProject || (projEl ? projEl.value.trim() : ''));
  var dept = taskDepartmentForProject(projectName);
  if (!canManageTaskDepartment(dept)) {
    if (typeof showToast === 'function') showToast('You can only add tasks to an authorized department.', 'warning');
    return;
  }
  if (!projectName || projectName.toLowerCase() === 'all' || projectName.toLowerCase() === 'all tasks') {
    if (typeof showToast === 'function') {
      showToast('Tasks must belong to a project. Please select or create a project first.', 'warning');
    }
    setTasksViewMode('projects');
    return;
  }
  var rawDesc = descEl ? (descEl.isContentEditable ? descEl.innerHTML.trim() : descEl.value.trim()) : '';
  var desc = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
  var targetStatus = normalizeTaskStatus(modal.getAttribute('data-target-status'), projectName);
  var fullDesc = buildTaskDescriptionWithMeta({ project_name: projectName, estimate: estimate }, desc);

  _isSubmittingTask = true;
  if (submitBtn) submitBtn.disabled = true;

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
  closeCreateTaskModal(true);
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
    localTask._creationPromise = (async function() {
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

        var inserted = await persistTaskToDatabase(client, payload);
        if (payload.description && payload.description !== localTask.description) {
          localTask.description = payload.description;
        }

        var saved = Array.isArray(inserted) && inserted[0] ? inserted[0] : (inserted && inserted.id ? inserted : null);
        if (!saved || !saved.id) {
          try {
            var fetched = await client.get('bb_tasks?title=eq.' + encodeURIComponent(title) + '&order=created_at.desc&limit=1');
            if (Array.isArray(fetched) && fetched.length > 0 && fetched[0].id) {
              saved = fetched[0];
            }
          } catch (_) {}
        }

        if (saved && saved.id) {
          localTask.id = saved.id;
          localTask._realDbId = saved.id;
          delete _taskMap[tempId];
          _taskMap[saved.id] = localTask;
          if (typeof window !== 'undefined' && window._taskMap) {
            delete window._taskMap[tempId];
            window._taskMap[saved.id] = localTask;
          }
          if (typeof document !== 'undefined') {
            var tempNodes = document.querySelectorAll('[data-task-id="' + tempId + '"]');
            tempNodes.forEach(function(el) { el.setAttribute('data-task-id', String(saved.id)); });
          }
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('bb_cached_tasks', JSON.stringify(_allLoadedTasks));
            }
          } catch (_) {}
          if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
            window.PortalRealtime.broadcast('tasks', 'create', localTask);
            window.PortalRealtime.broadcast('tasks', 'reconcile', { tempId: tempId, task: saved });
          }
          if (assigneeName && assigneeName !== 'Unassigned') {
            var taskDispatcher = (typeof sendPortalPushNotification === 'function')
              ? sendPortalPushNotification
              : (typeof window !== 'undefined' && typeof window.sendPortalPushNotification === 'function' ? window.sendPortalPushNotification : null);
            if (taskDispatcher) {
              var targetList = [assigneeIc, assigneeName].filter(Boolean);
              var isSelf = (myName && assigneeName.toLowerCase().trim() === myName.toLowerCase().trim())
                || (myIc && assigneeIc && assigneeIc === myIc);
              if (!isSelf) {
                taskDispatcher({
                  type: 'task_assigned',
                  title: 'Task Assigned: ' + title,
                  body: (localTask.creator_name || 'An officer') + ' assigned a task: ' + title,
                  targetUsers: targetList,
                  targetDept: null,
                  tab: 'tasks'
                }).catch(function() {});
              }
            }
            var createdAssignEmail = '';
            if (typeof resolveMentionTargets === 'function') {
              try {
                var cRes = resolveMentionTargets('@' + assigneeName);
                if (cRes && Array.isArray(cRes.targetUsers)) {
                  cRes.targetUsers.forEach(function(u) {
                    if (u && u.indexOf('@') !== -1 && !createdAssignEmail) createdAssignEmail = u;
                  });
                }
              } catch (_) {}
            }
            if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
              window.PortalRealtime.broadcast('task_assigned', 'create', {
                id: saved.id,
                taskId: saved.id,
                title: title,
                assignee_name: assigneeName,
                assignee_ic: assigneeIc,
                assignee_email: createdAssignEmail,
                creator_name: localTask.creator_name || 'Jeshua Koh',
                creator_ic: localTask.creator_ic || '',
                updated_at: saved.created_at || new Date().toISOString()
              });
            }
          }
          return saved.id;
        } else if (!inserted) {
          throw new Error('Server returned empty task response');
        }
      } catch (err) {
        console.error('Failed to persist task in background:', err);
        var verifyClient = getSupaClient();
        var doubleCheckRow = null;
        if (verifyClient) {
          try {
            var chkRows = await verifyClient.get('bb_tasks?title=eq.' + encodeURIComponent(title) + '&order=created_at.desc&limit=1');
            if (Array.isArray(chkRows) && chkRows[0] && chkRows[0].id) {
              doubleCheckRow = chkRows[0];
            }
          } catch (_) {}
        }
        if (doubleCheckRow && doubleCheckRow.id) {
          localTask.id = doubleCheckRow.id;
          localTask._realDbId = doubleCheckRow.id;
          delete _taskMap[tempId];
          _taskMap[doubleCheckRow.id] = localTask;
          if (typeof window !== 'undefined' && window._taskMap) {
            delete window._taskMap[tempId];
            window._taskMap[doubleCheckRow.id] = localTask;
          }
          if (typeof document !== 'undefined') {
            var tempCards = document.querySelectorAll('[data-task-id="' + tempId + '"]');
            tempCards.forEach(function(el) { el.setAttribute('data-task-id', String(doubleCheckRow.id)); });
          }
          if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
            window.PortalRealtime.broadcast('tasks', 'create', localTask);
          }
          return doubleCheckRow.id;
        }

        // Optimistic update rollback: remove task from memory and re-render only if truly failed
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
  if (!hasTaskAdminSession()) return;
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
    }
    return;
  }
  if (!dept) {
    if (typeof showToast === 'function') {
      showToast('Please select a department.', 'warning');
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
      await patchTaskInDatabase(client, editId, payload);
      if (typeof showToast === 'function') showToast('Task updated successfully!', 'success');
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.edit',
          targetType: 'task',
          targetId: editId,
          details: { title: title, department: dept }
        });
      }
    } else {
      var taskRes = await persistTaskToDatabase(client, payload);
      if (typeof showToast === 'function') showToast('Task added successfully!', 'success');
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.create',
          targetType: 'task',
          targetId: (taskRes && taskRes[0] && taskRes[0].id) || title,
          details: { title: title, department: dept }
        });
      }
    }

    // Real-time WhatsApp-style FCM push notification for task assignment
    var taskDispatcher = (typeof sendPortalPushNotification === 'function')
      ? sendPortalPushNotification
      : (typeof window !== 'undefined' && typeof window.sendPortalPushNotification === 'function' ? window.sendPortalPushNotification : null);
    if (taskDispatcher) {
      var targetUsers = [];
      if (payload.assignee_ic) {
        payload.assignee_ic.split(',').forEach(function(ic) {
          var trimmed = ic.trim();
          if (trimmed) targetUsers.push(trimmed);
        });
      }
      if (payload.assignee_name) {
        payload.assignee_name.split(',').forEach(function(n) {
          var trimmed = n.trim();
          if (trimmed && trimmed !== 'Unassigned') {
            if (targetUsers.indexOf(trimmed) === -1) targetUsers.push(trimmed);
            var mRes = (typeof resolveMentionTargets === 'function')
              ? resolveMentionTargets('@' + trimmed)
              : { targetUsers: [] };
            if (Array.isArray(mRes.targetUsers)) {
              mRes.targetUsers.forEach(function(tu) {
                if (tu && targetUsers.indexOf(tu) === -1) targetUsers.push(tu);
              });
            }
          }
        });
      }
      taskDispatcher({
        type: 'task_assigned',
        title: 'Task Assigned: ' + title,
        body: (payload.creator_name || 'An officer') + ' assigned a task: ' + title,
        targetUsers: targetUsers,
        targetDept: null,
        tab: 'tasks'
      }).catch(function(pushErr) {
        console.warn('Task assignment FCM push error:', pushErr);
      });
    }
    clearTaskForm();
    var body = document.getElementById('task-form-body');
    if (body && body.style.display !== 'none') toggleTaskForm();
    renderAdminTasks(_adminTaskFilter);
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed: ' + e.message, 'error');
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
      if (!t || !/^[\w-]+$/.test(t.id || '')) return;
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
        + '<span class="task-pill ' + pc + '">' + pc + '</span>'
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
  var task = findManagedTask(id);
  var pName = task ? (getTaskProjectName(task) || _activeProject) : _activeProject;
  if (!hasTaskAdminSession() || !isValidTaskStatus(status, pName)) return;
  var client = getSupaClient();
  if (!client) return;
  try {
    await client.patch('bb_tasks?id=eq.' + encodeURIComponent(id), { status: status });
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('tasks', 'update', { id: id, status: status });
    }
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
  if (!hasTaskAdminSession()) return;
  var ok = (typeof showConfirmModal === 'function')
    ? await showConfirmModal('Delete this task?')
    : false;
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
    await client.delete('bb_tasks?id=eq.' + encodeURIComponent(id));
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') window.PortalRealtime.broadcast('tasks', 'delete', { id: id });
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
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to delete task.', 'error');
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
  try {
    Object.defineProperty(window, '_allLoadedTasks', {
      get: function() { return _allLoadedTasks; },
      set: function(v) { _allLoadedTasks = v; },
      configurable: true
    });
    Object.defineProperty(window, '_taskMap', {
      get: function() { return _taskMap; },
      set: function(v) { _taskMap = v; },
      configurable: true
    });
  } catch (_) {
    window._allLoadedTasks            = _allLoadedTasks;
    window._taskMap                   = _taskMap;
  }
  window._adminTaskFilter           = _adminTaskFilter;
  window._allAdminTasks             = _allAdminTasks;
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
  window.handleNewTaskProjectSelect = handleNewTaskProjectSelect;
  window.getAvailableProjectsList   = getAvailableProjectsList;
  window._companyProjects           = _companyProjects;
  window.filterMyTasksList          = filterMyTasksList;
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
window.handleProjectsSearchInput  = handleProjectsSearchInput;
window.toggleProjectFilterMenu    = toggleProjectFilterMenu;
window.setProjectProgressFilter   = setProjectProgressFilter;
window.setProjectMemberFilter     = setProjectMemberFilter;
window.resetProjectFilters        = resetProjectFilters;
window.toggleMyTasksFilterMenu    = toggleMyTasksFilterMenu;
window.setMyTasksScopeFilter      = setMyTasksScopeFilter;
window.setMyTasksStatusFilter     = setMyTasksStatusFilter;
window.setMyTasksProjectFilter    = setMyTasksProjectFilter;
window.resetMyTasksFilters        = resetMyTasksFilters;
window.resetTasksFiltersToDefault = resetTasksFiltersToDefault;
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
  window.openTaskAttachment         = openTaskAttachment;
  window.removeTaskAttachment       = removeTaskAttachment;
  window.getDepartmentMentionCandidates = getDepartmentMentionCandidates;
  window.showMentionDropdown        = showMentionDropdown;
  window.hideMentionDropdown        = hideMentionDropdown;
  window.handleTaskCommentInput     = handleTaskCommentInput;
  window.handleTaskBriefDescInput   = handleTaskBriefDescInput;
  window.handleTaskCommentKeyDown   = handleTaskCommentKeyDown;
  window.handleTaskCommentPaste     = handleTaskCommentPaste;
  window.ensureCommentInputValueProperty = ensureCommentInputValueProperty;
  window.selectMentionCandidate     = selectMentionCandidate;
  window.formatCommentMentions      = formatCommentMentions;
  window.formatTaskDescriptionMentions = formatTaskDescriptionMentions;
  window.getAllMentionCandidateNames= getAllMentionCandidateNames;
  window.toggleTaskCommentMenu      = toggleTaskCommentMenu;
  window.startEditTaskComment       = startEditTaskComment;
  window.saveEditTaskComment        = saveEditTaskComment;
  window.cancelEditTaskComment      = cancelEditTaskComment;
  window.deleteTaskComment          = deleteTaskComment;
  window.isUserMentionedInComment   = isUserMentionedInComment;
  window.renderColumnsFromTasks     = renderColumnsFromTasks;
  window.getAssigneeAvatarHtml      = getAssigneeAvatarHtml;
  window.deduplicateTasks           = deduplicateTasks;
  window.isMemberDepartmentRole     = isMemberDepartmentRole;
  window.fetchAllRemoteTasks        = fetchAllRemoteTasks;
  window.fetchDepartmentMembers     = fetchDepartmentMembers;
  window.refreshCurrentTasksView    = refreshCurrentTasksView;

  window.getTaskSubtasks            = getTaskSubtasks;
  window.saveTaskSubtasks           = saveTaskSubtasks;
  window.fetchRemoteTaskSubtasks    = fetchRemoteTaskSubtasks;
  window.renderTaskSubtasks         = renderTaskSubtasks;
  window.addActiveTaskSubtask       = addActiveTaskSubtask;
  window.toggleTaskSubtask          = toggleTaskSubtask;
  window.handleSubtaskTextBlur      = handleSubtaskTextBlur;
  window.handleSubtaskTextInput     = handleSubtaskTextInput;
  window.deleteTaskSubtask          = deleteTaskSubtask;
  window._taskSubtasksMap           = _taskSubtasksMap;

  window.getTaskLinks               = getTaskLinks;
  window.saveTaskLinks              = saveTaskLinks;
  window.fetchRemoteTaskLinks       = fetchRemoteTaskLinks;
  window.renderTaskLinks            = renderTaskLinks;
  window.addActiveTaskLink          = addActiveTaskLink;
  window.deleteTaskLink             = deleteTaskLink;
  window._taskLinksMap              = _taskLinksMap;

  window.fetchRemoteTaskAttachments = fetchRemoteTaskAttachments;
  window.fetchAllRemoteTaskDetails  = fetchAllRemoteTaskDetails;
  window._taskAttachmentsMap        = _taskAttachmentsMap;
  window.getTaskEstimate            = getTaskEstimate;
  window.getTaskCreatorName         = getTaskCreatorName;
  window.persistTaskToDatabase      = persistTaskToDatabase;
  window.patchTaskInDatabase        = patchTaskInDatabase;
  window.buildTaskDescriptionWithMeta = buildTaskDescriptionWithMeta;
  window.resolveRealTaskId          = resolveRealTaskId;

  window.getDefaultProjectStatuses  = getDefaultProjectStatuses;
  window.getProjectStatuses         = getProjectStatuses;
  window.taskMatchesStatus          = taskMatchesStatus;
  window.isValidTaskStatus          = isValidTaskStatus;
  window.isTaskCompleted            = isTaskCompleted;
  window.saveProjectStatusesCatalog = saveProjectStatusesCatalog;
  window.loadProjectStatusesCatalog = loadProjectStatusesCatalog;
  window.applyProjectStatusesUpdate = applyProjectStatusesUpdate;
  window.openMoveTasksAndDeleteStatusModal = openMoveTasksAndDeleteStatusModal;
  window.closeMoveTasksModal        = closeMoveTasksModal;
  window.confirmMoveTasksAndDeleteStatus = confirmMoveTasksAndDeleteStatus;
  window.deleteProjectStatus        = deleteProjectStatus;
  window.openEditStatusTitle        = openEditStatusTitle;
  window.handleEditStatusKeyDown    = handleEditStatusKeyDown;
  window.cancelEditStatusTitle      = cancelEditStatusTitle;
  window.saveEditStatusTitle        = saveEditStatusTitle;
  window.openAddStatusInline        = openAddStatusInline;
  window.cancelAddStatus            = cancelAddStatus;
  window.handleAddStatusKeyDown     = handleAddStatusKeyDown;
  window.confirmAddStatus           = confirmAddStatus;
  window.reorderProjectStatuses     = reorderProjectStatuses;
  window._projectStatusesMap        = _projectStatusesMap;

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('bb_avatar_outlines_changed', function() {
      if (typeof refreshCurrentTasksView === 'function') refreshCurrentTasksView();
      if (typeof renderProjectsView === 'function') renderProjectsView();
      if (typeof renderMyTasksView === 'function') renderMyTasksView();
    });
    window.addEventListener('bb_task_subtasks_changed', function(ev) {
      var d = (ev && ev.detail) || {};
      var tid = d.taskId;
      if (tid && String(_activeDetailTaskId) === String(tid)) {
        var act = (typeof document !== 'undefined') ? document.activeElement : null;
        var sList = (typeof document !== 'undefined') ? document.querySelector('.tb-subtasks-list') : null;
        if (act && sList && sList.contains(act)) return;
        if (typeof renderTaskSubtasks === 'function') renderTaskSubtasks(tid);
      }
    });
    window.addEventListener('bb_task_attachments_changed', function(ev) {
      var d = (ev && ev.detail) || {};
      var tid = d.taskId;
      if (tid && String(_activeDetailTaskId) === String(tid)) {
        if (typeof renderTaskAttachments === 'function') renderTaskAttachments(tid);
      }
    });
    window.addEventListener('bb_task_links_changed', function(ev) {
      var d = (ev && ev.detail) || {};
      var tid = d.taskId;
      if (tid && String(_activeDetailTaskId) === String(tid)) {
        if (typeof renderTaskLinks === 'function') renderTaskLinks(tid);
      }
    });
  }

  if (typeof document !== 'undefined') {
    var initCommentInputs = function() {
      var inputs = document.querySelectorAll('.tb-comment-input');
      if (inputs && inputs.forEach) {
        inputs.forEach(ensureCommentInputValueProperty);
      }
    };
    initCommentInputs();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCommentInputs);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchAllRemoteTasks,
    fetchDepartmentMembers,
    refreshCurrentTasksView,
    getAssigneeAvatarHtml,
    deduplicateTasks,
    DEPT_CONFIG,
    _activeTasksSection,
    _tasksViewMode,
    _projectDisplayMode,
    _currentDeptFilter,
    get _activeProject() { return _activeProject; },
    set _activeProject(v) { _activeProject = v; },
    get _taskSearchQuery() { return _taskSearchQuery; },
    set _taskSearchQuery(v) { _taskSearchQuery = v; },
    get _allLoadedTasks() { return _allLoadedTasks; },
    set _allLoadedTasks(v) { _allLoadedTasks = v; },
    _cachedDepartmentMembers,
    _adminTaskFilter,
    _allAdminTasks,
    get _taskMap() { return _taskMap; },
    set _taskMap(v) { _taskMap = v; },
    get _myTasksScopeFilter() { return _myTasksScopeFilter; },
    set _myTasksScopeFilter(v) { _myTasksScopeFilter = v; },
    get _myTasksStatusFilter() { return _myTasksStatusFilter; },
    set _myTasksStatusFilter(v) { _myTasksStatusFilter = v; },
    get _myTasksProjectFilter() { return _myTasksProjectFilter; },
    set _myTasksProjectFilter(v) { _myTasksProjectFilter = v; },
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
    handleNewTaskProjectSelect,
    getAvailableProjectsList,
    _companyProjects,
    filterMyTasksList,
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
    openTaskAttachment,
    removeTaskAttachment,
    getDepartmentMentionCandidates,
    showMentionDropdown,
    hideMentionDropdown,
    handleTaskCommentInput,
    handleTaskBriefDescInput,
    handleTaskCommentKeyDown,
    handleTaskCommentPaste,
    ensureCommentInputValueProperty,
    selectMentionCandidate,
    formatCommentMentions,
    formatTaskDescriptionMentions,
    getAllMentionCandidateNames,
    toggleTaskCommentMenu,
    startEditTaskComment,
    saveEditTaskComment,
    cancelEditTaskComment,
    deleteTaskComment,
    isUserMentionedInComment,
    getTaskSubtasks,
    saveTaskSubtasks,
    fetchRemoteTaskSubtasks,
    renderTaskSubtasks,
    addActiveTaskSubtask,
    toggleTaskSubtask,
    handleSubtaskTextBlur,
    handleSubtaskTextInput,
    deleteTaskSubtask,
    getTaskLinks,
    saveTaskLinks,
    fetchRemoteTaskLinks,
    renderTaskLinks,
    addActiveTaskLink,
    deleteTaskLink,
    fetchRemoteTaskAttachments,
    fetchAllRemoteTaskDetails,
    getTaskEstimate,
    getTaskCreatorName,
    persistTaskToDatabase,
    patchTaskInDatabase,
    buildTaskDescriptionWithMeta,
    resolveRealTaskId,
    resetTasksFiltersToDefault,
    handleProjectsSearchInput,
    toggleProjectFilterMenu,
    setProjectProgressFilter,
    setProjectMemberFilter,
    resetProjectFilters,
    toggleMyTasksFilterMenu,
    setMyTasksScopeFilter,
    setMyTasksStatusFilter,
    setMyTasksProjectFilter,
    resetMyTasksFilters,
    getDefaultProjectStatuses,
    getProjectStatuses,
    taskMatchesStatus,
    isValidTaskStatus,
    isTaskCompleted,
    saveProjectStatusesCatalog,
    loadProjectStatusesCatalog,
    applyProjectStatusesUpdate,
    openMoveTasksAndDeleteStatusModal,
    closeMoveTasksModal,
    confirmMoveTasksAndDeleteStatus,
    deleteProjectStatus,
    openEditStatusTitle,
    handleEditStatusKeyDown,
    cancelEditStatusTitle,
    saveEditStatusTitle,
    openAddStatusInline,
    cancelAddStatus,
    handleAddStatusKeyDown,
    confirmAddStatus,
    reorderProjectStatuses,
    get _projectStatusesMap() { return _projectStatusesMap; },
    set _projectStatusesMap(v) { _projectStatusesMap = v; }
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('.tb-comment-actions')) {
      var commentMenus = document.querySelectorAll('.tb-comment-dropdown');
      commentMenus.forEach(function(m) { m.style.display = 'none'; });
    }
    if (!e.target.closest || !e.target.closest('.filter-dropdown-wrapper')) {
      var d1 = document.querySelector('.project-filter-dropdown');
      if (d1) d1.style.display = 'none';
      var d2 = document.querySelector('.my-tasks-filter-dropdown');
      if (d2) d2.style.display = 'none';
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
