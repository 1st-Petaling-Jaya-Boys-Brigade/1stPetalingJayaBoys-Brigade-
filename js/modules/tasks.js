/**
 * 1st Petaling Jaya Boys' Brigade Portal - Tasks & Kanban Board Module (TSK-009)
 *
 * Implements NCO department task board rendering, role-based NCO access checks (isNCO),
 * Kanban status transitions (To Do -> In Progress -> Done), Task Detail modal inspection,
 * and Officer Admin task management (creation, rich description, assignee assignment, deletion).
 * Renders directly under the Weekly Parade tab (#page-tasks).
 */

/* global supa, escapeHtml, sanitizeHtml, sanitizeText, sessionGet, showToast, showConfirmModal, isNCO, reGetValue, reSetValue, reClearValue */

// ── Department Configuration ───────────────────────────────────────────────
var DEPT_CONFIG = {
  logistics:   { label: 'Logistics',   color: '#42a5f5', cls: 'dept-logistics'   },
  secretariat: { label: 'Secretariat', color: '#ce93d8', cls: 'dept-secretariat' },
  media:       { label: 'Media',       color: '#ffb74d', cls: 'dept-media'       }
};

var _adminTaskFilter = 'all';
var _allAdminTasks   = [];
var _taskMap         = {};

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
  ['todo', 'inprogress', 'done'].forEach(function(t) {
    var col = document.getElementById('taskcol-' + t);
    if (col) col.classList.toggle('mobile-active', t === tab);
  });
  document.querySelectorAll('.task-col-tab').forEach(function(b) {
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
}

/**
 * Verifies logged-in member access and renders Department Tasks board
 * under the Weekly Parade schedule on #page-tasks
 */
async function checkTasksAccess() {
  if (typeof document === 'undefined') return;
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  var nd = document.getElementById('tasks-no-dept');
  var gate = document.getElementById('tasks-gate');
  var board = document.getElementById('tasks-board');

  if (nd) nd.style.display = 'block';
  if (gate) gate.style.display = 'none';
  if (board) board.style.display = 'none';

  if (!ic) return;
  var client = getSupaClient();
  if (!client) return;

  try {
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=name,department,rank');
    var m    = data && data[0];
    var dept = m && m.department;
    var rank = (m && m.rank) || (typeof sessionGet === 'function' ? sessionGet('rank') : '');

    // Allow members with assigned departments or NCOs to view department board
    if (dept && DEPT_CONFIG[dept]) {
      var cfg = DEPT_CONFIG[dept];
      var dt  = document.getElementById('tasks-dept-title');  if (dt) dt.textContent = cfg.label + ' Department';
      var ds  = document.getElementById('tasks-dept-sub');    if (ds) ds.textContent = 'Task Board';
      var db  = document.getElementById('tasks-dept-badge');
      if (db) db.innerHTML = '<span class="dept-badge ' + cfg.cls + '">' + cfg.label + '</span>';
      if (board) board.style.display = 'block';
      await renderTasksBoard(dept);
    } else if (checkIsNCO(rank)) {
      // NCOs without fixed department can monitor company tasks
      if (board) board.style.display = 'block';
      var dtNco = document.getElementById('tasks-dept-title'); if (dtNco) dtNco.textContent = 'NCO Duty Board';
      var dsNco = document.getElementById('tasks-dept-sub');   if (dsNco) dsNco.textContent = 'Weekly Parade Duties';
      await renderTasksBoard('logistics');
    }
  } catch (e) {
    console.error('checkTasksAccess error:', e);
  }
}

/**
 * Renders the member Kanban columns (To Do, In Progress, Done)
 * @param {string} dept
 */
async function renderTasksBoard(dept) {
  if (typeof document === 'undefined') return;
  var cols = { todo: [], inprogress: [], done: [] };
  var client = getSupaClient();

  if (client) {
    try {
      var url = dept ? ('bb_tasks?department=eq.' + encodeURIComponent(dept) + '&order=created_at.desc') : 'bb_tasks?order=created_at.desc';
      var tasks = await client.get(url);
      if (Array.isArray(tasks)) {
        tasks.forEach(function(t) {
          var k = t.status === 'inprogress' ? 'inprogress' : t.status === 'done' ? 'done' : 'todo';
          cols[k].push(t);
        });
      }
    } catch (e) {
      console.error('renderTasksBoard error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window._taskMap = window._taskMap || {};
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);

  ['todo', 'inprogress', 'done'].forEach(function(status) {
    var el   = document.getElementById('col-' + status);
    var cnt  = document.getElementById('count-' + status);
    var tcnt = document.getElementById('tab-count-' + status);

    if (cnt) cnt.textContent = cols[status].length ? '(' + cols[status].length + ')' : '';
    if (tcnt) tcnt.textContent = cols[status].length ? '(' + cols[status].length + ')' : '';
    if (!el) return;

    if (!cols[status].length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0;">No tasks</div>';
      return;
    }

    var html = '';
    cols[status].forEach(function(t) {
      if (typeof window !== 'undefined' && window._taskMap) {
        window._taskMap[t.id] = t;
      }
      _taskMap[t.id] = t;

      var pc = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
      var pl = (t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1);
      var dueHtml = '';

      if (t.due_date) {
        var due = new Date(t.due_date); due.setHours(0, 0, 0, 0);
        var overdue = status !== 'done' && due < today;
        dueHtml = '<span class="task-due' + (overdue ? ' overdue' : '') + '"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;margin-right:3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' + due.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) + '</span>';
      }

      var assignHtml = t.assignee_name
        ? '<span class="task-assignee"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' + (typeof escapeHtml === 'function' ? escapeHtml(t.assignee_name) : t.assignee_name) + '</span>'
        : '';

      var sc = { todo: 'var(--text-secondary)', inprogress: 'var(--brand-blue)', done: 'var(--green)' };
      var sl = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

      var stBtns = '<div style="display:flex;gap:6px;margin-top:10px;">';
      ['todo', 'inprogress', 'done'].forEach(function(s) {
        var active = t.status === s;
        stBtns += '<button data-task-id="' + t.id + '" data-task-status="' + s + '" data-dept="' + dept + '" style="flex:1;padding:7px 4px;border:1.5px solid ' + (active ? sc[s] : 'var(--border-card)') + ';border-radius:10px;background:' + (active ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (active ? sc[s] : 'var(--text-secondary)') + ';font-size:10px;font-weight:700;cursor:pointer;font-family:\'Oswald\',sans-serif;text-align:center;">' + sl[s] + '</button>';
      });
      stBtns += '</div>';

      var descText = t.description || '';
      var descFormatted = descText
        ? '<div class="task-card-desc">' + ((typeof sanitizeHtml === 'function') ? sanitizeHtml(descText.length > 80 ? descText.slice(0, 80) + '\u2026' : descText) : (typeof escapeHtml === 'function' ? escapeHtml(descText) : descText)) + '</div>'
        : '';

      html += '<div class="task-card" data-task-open="' + t.id + '">'
        + '<div class="task-card-title">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title) : t.title) + '</div>'
        + descFormatted
        + '<div class="task-meta"><span class="task-pill ' + pc + '">' + pl + '</span>' + assignHtml + dueHtml + '</div>'
        + stBtns + '</div>';
    });

    el.innerHTML = html;

    el.querySelectorAll('[data-task-open]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-task-id]')) return;
        openTaskDetail(card.getAttribute('data-task-open'));
      });
    });

    el.querySelectorAll('[data-task-id]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        memberUpdateTaskStatus(btn.getAttribute('data-task-id'), btn.getAttribute('data-task-status'), btn.getAttribute('data-dept'));
      });
    });
  });
}

/**
 * Opens task detail modal
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

  var descEl = document.getElementById('tdm-desc');
  if (descEl) {
    var desc = t.description || '';
    descEl.innerHTML = (desc && desc.indexOf('<') !== -1)
      ? ((typeof sanitizeHtml === 'function') ? sanitizeHtml(desc) : (typeof escapeHtml === 'function' ? escapeHtml(desc) : desc))
      : (desc ? (typeof escapeHtml === 'function' ? escapeHtml(desc) : desc) : '<span style="color:var(--text-muted);">No description.</span>');
  }

  var pc = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
  var pl = (t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1);
  var sl = t.status === 'inprogress' ? 'In Progress' : t.status === 'done' ? 'Done' : 'To Do';
  var sc = t.status === 'done' ? 'var(--green)' : t.status === 'inprogress' ? 'var(--brand-blue)' : 'var(--text-muted)';
  var dept = DEPT_CONFIG[t.department] || {};
  var meta = document.getElementById('tdm-meta');

  if (meta) {
    meta.innerHTML = '<span class="task-pill ' + pc + '">' + pl + '</span>'
      + '<span class="task-pill" style="background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;">' + sl + '</span>'
      + (dept.cls ? '<span class="dept-badge ' + dept.cls + '">' + (typeof escapeHtml === 'function' ? escapeHtml(dept.label) : dept.label) + '</span>' : '');
  }

  set('tdm-assignee', t.assignee_name || '\u2014');
  set('tdm-due', t.due_date ? new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014');

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
    await renderTasksBoard(dept);
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to update task status.', 'error');
    } else if (typeof alert === 'function') {
      alert('Failed to update.');
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
  ['all', 'logistics', 'secretariat', 'media'].forEach(function(d) {
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
    alert('Please enter a task title.');
    return;
  }
  if (!dept) {
    alert('Please select a department.');
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
      else alert('\u2705 Task updated!');
    } else {
      await client.post('bb_tasks', payload);
      if (typeof showToast === 'function') showToast('Task added successfully!', 'success');
      else alert('\u2705 Task added!');
    }
    clearTaskForm();
    var body = document.getElementById('task-form-body');
    if (body && body.style.display !== 'none') toggleTaskForm();
    renderAdminTasks(_adminTaskFilter);
  } catch (e) {
    alert('Failed: ' + e.message);
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
    alert('Failed to update status.');
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
    : confirm('Delete this task?');
  if (!ok) return;

  var client = getSupaClient();
  if (!client) return;
  try {
    await client.delete('bb_tasks?id=eq.' + id);
    renderAdminTasks(_adminTaskFilter);
    if (typeof showToast === 'function') {
      showToast('Task deleted successfully.', 'success');
    } else {
      alert('Task deleted successfully.');
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to delete task.', 'error');
    } else {
      alert('Failed to delete task.');
    }
  }
}

// ── Global and Module Exports ──────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEPT_CONFIG            = DEPT_CONFIG;
  window._adminTaskFilter       = _adminTaskFilter;
  window._allAdminTasks         = _allAdminTasks;
  window._taskMap               = _taskMap;
  window.checkIsNCO             = checkIsNCO;
  window.switchTaskTab          = switchTaskTab;
  window.checkTasksAccess       = checkTasksAccess;
  window.renderTasksBoard       = renderTasksBoard;
  window.openTaskDetail         = openTaskDetail;
  window.closeTaskDetail        = closeTaskDetail;
  window.memberUpdateTaskStatus = memberUpdateTaskStatus;
  window.switchDeptTab          = switchDeptTab;
  window.toggleTaskForm         = toggleTaskForm;
  window.loadAssigneeOptions    = loadAssigneeOptions;
  window.saveTask               = saveTask;
  window.clearTaskForm          = clearTaskForm;
  window.renderAdminTasks       = renderAdminTasks;
  window.updateTaskStatus       = updateTaskStatus;
  window.editAdminTask          = editAdminTask;
  window.deleteTask             = deleteTask;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEPT_CONFIG,
    _adminTaskFilter,
    _allAdminTasks,
    _taskMap,
    checkIsNCO,
    switchTaskTab,
    checkTasksAccess,
    renderTasksBoard,
    openTaskDetail,
    closeTaskDetail,
    memberUpdateTaskStatus,
    switchDeptTab,
    toggleTaskForm,
    loadAssigneeOptions,
    saveTask,
    clearTaskForm,
    renderAdminTasks,
    updateTaskStatus,
    editAdminTask,
    deleteTask
  };
}
