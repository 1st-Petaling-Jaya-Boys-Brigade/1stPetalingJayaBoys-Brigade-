/**
 * 1st Petaling Jaya Boys' Brigade Portal - Badges Module (TSK-008)
 *
 * Handles badge catalog definition, member badge assignments, proficiency tracking,
 * repeatable badges (service years), President's & Founder's Award criteria checklists,
 * and Officer Admin badge definition management.
 */

/* global supa, escapeHtml, safeUrl, sessionGet, showToast, showConfirmModal, migrateEntry */

// ── Default Badge Catalog ───────────────────────────────────────────────────
var DEFAULT_BB_BADGES = [
  { id: 'bb1',  name: 'BB Enrolment',       cat: 'Core',       hasAdvanced: false },
  { id: 'bb2',  name: "BB Founder's Award", cat: 'Core',       hasAdvanced: false },
  { id: 'bb3',  name: "President's Award",  cat: 'Core',       hasAdvanced: false },
  { id: 'bb4',  name: 'First Aid',          cat: 'Skills',     hasAdvanced: true  },
  { id: 'bb5',  name: 'Fire Safety',        cat: 'Skills',     hasAdvanced: false },
  { id: 'bb6',  name: 'Marching',           cat: 'Drill',      hasAdvanced: true  },
  { id: 'bb7',  name: 'Best Driller',       cat: 'Drill',      hasAdvanced: false },
  { id: 'bb8',  name: 'Leadership',         cat: 'Leadership', hasAdvanced: true  },
  { id: 'bb9',  name: 'Community Service',  cat: 'Service',    hasAdvanced: false },
  { id: 'bb10', name: 'Best Camper',        cat: 'Outdoor',    hasAdvanced: true  },
  { id: 'bb11', name: 'Orienteering',       cat: 'Outdoor',    hasAdvanced: false },
  { id: 'bb12', name: 'Swimming',           cat: 'Sports',     hasAdvanced: true  },
  { id: 'bb13', name: 'Music & Worship',    cat: 'Arts',       hasAdvanced: false }
];

// ── Default President's & Founder's Requirements ─────────────────────────────
var DEFAULT_PRESIDENTS_REQS = [
  { label: 'First Aid (Advanced)',     badgeMatch: 'First Aid',         tier: 'advanced' },
  { label: 'Leadership (Advanced)',    badgeMatch: 'Leadership',        tier: 'advanced' },
  { label: 'Best Camper (Advanced)',   badgeMatch: 'Best Camper',       tier: 'advanced' },
  { label: 'Swimming (any level)',     badgeMatch: 'Swimming',          tier: 'any'      },
  { label: 'Marching (any level)',     badgeMatch: 'Marching',          tier: 'any'      },
  { label: 'Community Service',        badgeMatch: 'Community Service', tier: 'any'      },
  { label: 'Fire Safety',              badgeMatch: 'Fire Safety',       tier: 'any'      }
];

var DEFAULT_FOUNDERS_REQS = [
  { id: 'service',     label: '3 Years of Service', minYears: 3 },
  { id: 'total6',      label: 'At least 6 awards total (all groups)', minAwards: 6 },
  { id: 'onepergroup', label: 'At least 1 award from each group', minGroups: 4 },
  { id: 'basic2',      label: 'At least 2 awards at Basic level', minBasic: 2 },
  { id: 'adv4',        label: 'At least 4 awards at Advanced level', minAdv: 4 },
  { id: 'compulsory',  label: 'All compulsory badges (NCO Star, Christian Education, Drill, Recruitment)' }
];

// In-memory caches to eliminate N+1 network waterfalls
var _badgeDefsCache = null;
var _memberBadgesCache = {};
var PRESIDENTS_REQS = DEFAULT_PRESIDENTS_REQS;

/**
 * Resolves Supabase client instance across environments
 */
function getSupaClient() {
  if (typeof supa !== 'undefined' && supa) return supa;
  if (typeof window !== 'undefined' && window.supa) return window.supa;
  return null;
}

/**
 * Safe fallback for migrateEntry normalization
 */
function safeMigrateEntry(raw) {
  if (typeof migrateEntry === 'function') return migrateEntry(raw);
  if (typeof window !== 'undefined' && typeof window.migrateEntry === 'function') {
    return window.migrateEntry(raw);
  }
  if (!raw) return { basic: false, basicDate: '', advanced: false, advancedDate: '' };
  if (typeof raw === 'boolean') return { basic: raw, basicDate: '', advanced: false, advancedDate: '' };
  if (typeof raw === 'string') return { basic: true, basicDate: raw, advanced: false, advancedDate: '' };
  return {
    basic: !!raw.basic,
    basicDate: raw.basicDate || '',
    advanced: !!raw.advanced,
    advancedDate: raw.advancedDate || ''
  };
}

/**
 * Access gate controller for the Badges Tab
 */
function checkBadgesAccess() {
  if (typeof document === 'undefined') return;
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  var gate     = document.getElementById('badges-gate');
  var loggedIn = document.getElementById('badges-logged-in');
  if (!ic) {
    if (gate)     gate.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
  } else {
    if (gate)     gate.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'block';
    loadBadges(ic);
    renderPresidentsTracker(ic);
  }
}

/**
 * Retrieves the badge definition catalog from cache or Supabase bb_config
 * @param {boolean} [force=false]
 * @returns {Promise<Array>}
 */
async function getBadgeDefs(force) {
  if (_badgeDefsCache && !force) return _badgeDefsCache;
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_badge_defs&select=value');
      if (rows && rows.length) {
        var v = JSON.parse(rows[0].value);
        if (v && v.length) {
          _badgeDefsCache = v;
          return v;
        }
      }
    } catch (e) {
      // Fallback to default catalog
    }
  }
  _badgeDefsCache = DEFAULT_BB_BADGES;
  return DEFAULT_BB_BADGES;
}

/**
 * Persists the badge catalog definitions to Supabase bb_config
 * @param {Array} defs
 */
async function saveBadgeDefs(defs) {
  _badgeDefsCache = defs;
  var client = getSupaClient();
  if (!client) return;
  try {
    await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_badge_defs', value: JSON.stringify(defs) });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_badge_defs', { value: JSON.stringify(defs) });
    } catch (e2) {
      console.error('saveBadgeDefs error:', e2);
    }
  }
}

/**
 * Retrieves dynamic President's Award requirements from Supabase bb_config
 * @returns {Promise<Array>}
 */
async function getPresidentsReqs() {
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_presidents_reqs&select=value');
      if (rows && rows.length) {
        var v = JSON.parse(rows[0].value);
        if (v && v.length) return v;
      }
    } catch (e) {
      // Fallback to default
    }
  }
  return DEFAULT_PRESIDENTS_REQS;
}

/**
 * Persists dynamic President's Award requirements to Supabase bb_config
 * @param {Array} reqs
 */
async function savePresidentsReqs(reqs) {
  var client = getSupaClient();
  if (!client) return;
  try {
    await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_presidents_reqs', value: JSON.stringify(reqs) });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_presidents_reqs', { value: JSON.stringify(reqs) });
    } catch (e2) {
      console.error('savePresidentsReqs error:', e2);
    }
  }
}

/**
 * Upserts a member's badge progress record into Supabase bb_member_badges
 * @param {string} ic
 * @param {Object} saved
 */
async function upsertMemberBadges(ic, saved) {
  if (!ic) return;
  if (!_memberBadgesCache) _memberBadgesCache = {};
  _memberBadgesCache[ic] = saved;
  var client = getSupaClient();
  if (!client) return;
  try {
    var existing = await client.get('bb_member_badges?ic=eq.' + encodeURIComponent(ic) + '&select=id');
    if (existing && existing.length) {
      await client.patch('bb_member_badges?ic=eq.' + encodeURIComponent(ic), {
        badge_data: JSON.stringify(saved),
        updated_at: new Date().toISOString()
      });
    } else {
      await client.post('bb_member_badges', {
        ic: ic,
        badge_data: JSON.stringify(saved),
        updated_at: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error('upsertMemberBadges error:', e);
  }
}

/**
 * Evaluates Founder's and President's award criteria against member badge data
 * @param {Object} saved Member badge records
 * @param {Array} defs Badge definitions
 * @returns {Object} Evaluation summary
 */
function evaluateFoundersCriteria(saved, defs) {
  saved = saved || {};
  defs = defs || [];

  // 1. Service years count
  var serviceYears = 0;
  defs.forEach(function(b) {
    if (!b.repeatable) return;
    var repData = saved[b.id + '_rep'];
    if (repData && repData.count) {
      serviceYears += repData.count;
    } else {
      var old = safeMigrateEntry(saved[b.id]);
      if (old.basic || old.advanced) serviceYears++;
    }
  });

  // 2. Discover award groups
  var cats = [];
  defs.forEach(function(b) {
    if (cats.indexOf(b.cat) === -1) cats.push(b.cat);
  });

  function findGroupCat(letter) {
    return cats.find(function(c) {
      return c.toLowerCase().replace(/[^a-z]/g, '').indexOf('group' + letter.toLowerCase()) !== -1;
    }) || null;
  }

  var groupLetters = ['a', 'b', 'c', 'd'];
  var groups = [];
  groupLetters.forEach(function(letter) {
    var catName = findGroupCat(letter);
    if (!catName) return;
    var items = defs
      .filter(function(b) { return b.cat === catName && b.name !== '(Add badges below)' && !b.repeatable; })
      .map(function(b) {
        var entry = safeMigrateEntry(saved[b.id]);
        return { badge: b, entry: entry };
      });
    if (items.length) {
      var colorMap = { a: '#42a5f5', b: '#66bb6a', c: '#e8b830', d: '#ce93d8' };
      groups.push({
        label: 'Group ' + letter.toUpperCase(),
        catName: catName,
        items: items,
        color: colorMap[letter]
      });
    }
  });

  // 3. Group and overall tallies
  var totalAwarded = 0;
  var totalAdvanced = 0;
  var atLeastOnePerGroup = groups.length > 0;

  var groupResults = groups.map(function(g) {
    var awarded = g.items.filter(function(i) { return i.entry.basic || i.entry.advanced; }).length;
    var advanced = g.items.filter(function(i) { return i.entry.advanced; }).length;
    if (awarded === 0) atLeastOnePerGroup = false;
    totalAwarded += awarded;
    totalAdvanced += advanced;
    return {
      label: g.label,
      catName: g.catName,
      color: g.color,
      items: g.items,
      awarded: awarded,
      advanced: advanced
    };
  });

  var totalBasicOnly = totalAwarded - totalAdvanced;

  // 4. Compulsory badges
  var COMPULSORY = [
    { label: 'NCO Star', badgeMatch: 'NCO Star', tier: 'any' },
    { label: 'Christian Education (Advanced)', badgeMatch: 'Christian Education', tier: 'advanced' },
    { label: 'Drill (Advanced)', badgeMatch: 'Drill', tier: 'advanced' },
    { label: 'Recruitment (Basic)', badgeMatch: 'Recruitment', tier: 'basic' }
  ];

  var compResults = COMPULSORY.map(function(c) {
    var badge = defs.find(function(b) {
      return b.name.toLowerCase().indexOf(c.badgeMatch.toLowerCase()) !== -1 && !b.repeatable;
    });
    if (!badge) return { label: c.label, done: false, missing: true };
    var entry = safeMigrateEntry(saved[badge.id]);
    var done = c.tier === 'advanced' ? entry.advanced
             : c.tier === 'basic' ? (entry.basic || entry.advanced)
             : (entry.basic || entry.advanced);
    return { label: c.label, done: done, missing: false };
  });

  var allCompDone = compResults.every(function(r) { return r.done; });

  // 5. Checklist rules
  var reqs = [
    {
      id: 'service',
      label: '3 Years of Service',
      detail: serviceYears + ' / 3 years',
      done: serviceYears >= 3,
      pct: Math.min(100, Math.round((serviceYears / 3) * 100))
    },
    {
      id: 'total6',
      label: 'At least 6 awards total (all groups)',
      detail: totalAwarded + ' / 6 awards',
      done: totalAwarded >= 6,
      pct: Math.min(100, Math.round((totalAwarded / 6) * 100))
    },
    {
      id: 'onepergroup',
      label: 'At least 1 award from each group',
      detail: groups.length === 0 ? 'No groups found' : groupResults.map(function(g) { return g.label + ': ' + g.awarded; }).join(' \u00b7 '),
      done: atLeastOnePerGroup && groups.length >= 4,
      pct: groups.length === 0 ? 0 : Math.round((groupResults.filter(function(g) { return g.awarded > 0; }).length / Math.max(groups.length, 1)) * 100)
    },
    {
      id: 'basic2',
      label: 'At least 2 awards at Basic level',
      detail: totalBasicOnly + ' / 2 Basic',
      done: totalBasicOnly >= 2,
      pct: Math.min(100, Math.round((totalBasicOnly / 2) * 100))
    },
    {
      id: 'adv4',
      label: 'At least 4 awards at Advanced level',
      detail: totalAdvanced + ' / 4 Advanced',
      done: totalAdvanced >= 4,
      pct: Math.min(100, Math.round((totalAdvanced / 4) * 100))
    },
    {
      id: 'compulsory',
      label: 'All compulsory badges',
      detail: compResults.filter(function(r) { return r.done; }).length + ' / ' + compResults.length + ' compulsory badges',
      done: allCompDone,
      pct: Math.round((compResults.filter(function(r) { return r.done; }).length / compResults.length) * 100),
      sub: compResults
    }
  ];

  var metCount = reqs.filter(function(r) { return r.done; }).length;
  var allDone = metCount === reqs.length && allCompDone;
  var overallPct = Math.round((metCount / reqs.length) * 100);

  return {
    reqs: reqs,
    compResults: compResults,
    groupResults: groupResults,
    serviceYears: serviceYears,
    totalAwarded: totalAwarded,
    totalBasicOnly: totalBasicOnly,
    totalAdvanced: totalAdvanced,
    allCompDone: allCompDone,
    allDone: allDone,
    overallPct: overallPct,
    metCount: metCount
  };
}

/**
 * Loads member badges into view and binds interactive event handlers
 * @param {string} ic
 * @param {Object} [preloadedSaved]
 */
async function loadBadges(ic, preloadedSaved) {
  var client = getSupaClient();
  var saved = preloadedSaved || (_memberBadgesCache && _memberBadgesCache[ic]) || null;
  if (!saved && client) {
    try {
      var brows = await client.get('bb_member_badges?ic=eq.' + encodeURIComponent(ic) + '&select=badge_data');
      if (brows && brows.length) saved = JSON.parse(brows[0].badge_data || '{}');
      else saved = {};
      if (!_memberBadgesCache) _memberBadgesCache = {};
      _memberBadgesCache[ic] = saved;
    } catch (e) {
      saved = {};
    }
  }
  saved = saved || {};
  var defs = await getBadgeDefs();
  var container = (typeof document !== 'undefined') ? document.getElementById('badges-list') : null;
  if (!container) return;

  var cats = [];
  defs.forEach(function(b) {
    if (cats.indexOf(b.cat) === -1) cats.push(b.cat);
  });

  if (!cats.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">No badges defined yet.</div>';
    return;
  }

  var html = '';
  cats.forEach(function(cat) {
    var catBadges = defs.filter(function(b) { return b.cat === cat && b.name !== '(Add badges below)'; });
    if (!catBadges.length) return;
    html += '<div style="margin-bottom:20px;">';
    html += '<div data-cat-label="1" style="font-size:10px;font-weight:700;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:10px;">' + (typeof escapeHtml === 'function' ? escapeHtml(cat) : cat) + '</div>';

    catBadges.forEach(function(b) {
      var safeBadgeImg = b.image ? ((typeof safeUrl === 'function') ? safeUrl(b.image, '') : b.image) : '';
      var imgHtml = safeBadgeImg
        ? '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(safeBadgeImg) : safeBadgeImg) + '" style="width:36px;height:36px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid rgba(200,150,30,0.3);"/>'
        : '';

      if (b.repeatable) {
        var repData = saved[b.id + '_rep'];
        if (!repData || typeof repData !== 'object' || Array.isArray(repData)) {
          var old = safeMigrateEntry(saved[b.id]);
          repData = { count: (old.basic || old.advanced) ? 1 : 0, dates: old.basic ? [old.basicDate] : [] };
        }
        var count = repData.count || 0;
        var dates = repData.dates || [];

        html += '<div data-badge-card="1" data-badge-name="' + b.name.toLowerCase() + '" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:8px;">';
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
          + imgHtml
          + '<div style="flex:1;font-size:13px;font-weight:600;color:var(--text-primary);">' + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + '</div>'
          + '<span style="font-size:9px;font-weight:700;background:rgba(16,185,129,0.15);color:var(--green);border:1px solid rgba(16,185,129,0.3);padding:2px 8px;border-radius:20px;">Repeatable</span>'
          + '</div>';
        html += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:' + (count > 0 ? '12px' : '0') + ';">';
        html += '<button data-rep-dec="' + b.id + '" data-ic="' + ic + '" style="width:32px;height:32px;border-radius:50%;background:var(--bg-card-subtle);border:1.5px solid var(--border-card);color:var(--text-secondary);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">&minus;</button>';
        html += '<div style="text-align:center;min-width:40px;">'
          + '<div style="font-family:var(--font-headline);font-size:32px;font-weight:700;color:' + (count > 0 ? 'var(--brand-gold)' : 'var(--text-muted)') + ';line-height:1;">' + count + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">earned</div>'
          + '</div>';
        html += '<button data-rep-inc="' + b.id + '" data-ic="' + ic + '" style="width:32px;height:32px;border-radius:50%;background:rgba(245,197,66,0.15);border:1.5px solid rgba(245,197,66,0.35);color:var(--brand-gold);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>';
        html += '</div>';

        if (count > 0) {
          html += '<div style="display:flex;flex-direction:column;gap:6px;">';
          for (var di = 0; di < count; di++) {
            html += '<div style="display:flex;align-items:center;gap:8px;">'
              + '<span style="font-size:11px;font-weight:600;color:var(--text-secondary);width:52px;flex-shrink:0;">Year ' + (di + 1) + '</span>'
              + '<input type="date" id="badge-rep-' + b.id + '-' + di + '" value="' + (dates[di] || '') + '" '
              + 'style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 8px;font-size:11px;"/>'
              + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      } else {
        var entry = safeMigrateEntry(saved[b.id]);
        var tierMode = b.tier || (b.hasAdvanced ? 'both' : 'basic');
        var bBg   = entry.basic    ? 'rgba(245,197,66,0.18)' : 'transparent';
        var bBord = entry.basic    ? 'var(--gold)'           : 'var(--border-card)';
        var bTxt  = entry.basic    ? 'var(--brand-gold)'     : 'var(--text-muted)';
        var aBg   = entry.advanced ? 'rgba(239,68,68,0.15)'  : 'transparent';
        var aBord = entry.advanced ? 'var(--red)'            : 'var(--border-card)';
        var aTxt  = entry.advanced ? 'var(--red)'            : 'var(--text-muted)';
        var earnedNone = entry.basic || entry.advanced;
        var nBg   = earnedNone ? 'rgba(245,197,66,0.18)' : 'transparent';
        var nBord = earnedNone ? 'var(--gold)'           : 'var(--border-card)';

        html += '<div data-badge-card="1" data-badge-name="' + b.name.toLowerCase() + '" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:8px;">';
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
          + imgHtml
          + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);">' + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + '</div>'
          + '</div>';

        if (tierMode === 'none') {
          html += '<div style="display:flex;align-items:center;gap:10px;">';
          html += '<div data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '" '
            + 'style="width:22px;height:22px;border-radius:6px;border:2px solid ' + nBord + ';background:' + nBg + ';'
            + 'display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:12px;color:var(--brand-gold);">'
            + (earnedNone ? '&#10003;' : '') + '</div>';
          html += '<span style="font-size:12px;color:' + (earnedNone ? 'var(--text-primary)' : 'var(--text-secondary)') + ';">Earned</span>';
          html += '<input type="date" id="badge-basic-' + b.id + '" value="' + entry.basicDate + '" '
            + 'style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 8px;font-size:11px;'
            + (earnedNone ? '' : 'opacity:0.4;') + '"/>';
          html += '</div>';
        } else {
          html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:' + (tierMode === 'both' ? '6px' : '0') + ';">';
          html += '<div data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '" '
            + 'style="width:22px;height:22px;border-radius:6px;border:2px solid ' + bBord + ';background:' + bBg + ';'
            + 'display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:12px;color:var(--brand-gold);">'
            + (entry.basic ? '&#10003;' : '') + '</div>';
          html += '<span style="font-size:11px;font-weight:700;letter-spacing:1px;color:' + bTxt + ';text-transform:uppercase;width:70px;flex-shrink:0;">Basic</span>';
          html += '<input type="date" id="badge-basic-' + b.id + '" value="' + entry.basicDate + '" '
            + 'style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 8px;font-size:11px;'
            + (entry.basic ? '' : 'opacity:0.4;') + '"/>';
          html += '</div>';

          if (tierMode === 'both') {
            html += '<div style="display:flex;align-items:center;gap:10px;">';
            html += '<div data-badge-id="' + b.id + '" data-tier="advanced" data-ic="' + ic + '" '
              + 'style="width:22px;height:22px;border-radius:6px;border:2px solid ' + aBord + ';background:' + aBg + ';'
              + 'display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:12px;color:var(--red);">'
              + (entry.advanced ? '&#10003;' : '') + '</div>';
            html += '<span style="font-size:11px;font-weight:700;letter-spacing:1px;color:' + aTxt + ';text-transform:uppercase;width:70px;flex-shrink:0;">Advanced</span>';
            html += '<input type="date" id="badge-adv-' + b.id + '" value="' + entry.advancedDate + '" '
              + 'style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 8px;font-size:11px;'
              + (entry.advanced ? '' : 'opacity:0.4;') + '"/>';
            html += '</div>';
          }
        }
        html += '</div>';
      }
    });
    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-badge-id]').forEach(function(el) {
    el.addEventListener('click', function() {
      toggleBadge(el.getAttribute('data-badge-id'), el.getAttribute('data-ic'), el.getAttribute('data-tier'));
    });
  });

  container.querySelectorAll('[data-rep-inc]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      adjustRepBadge(btn.getAttribute('data-rep-inc'), btn.getAttribute('data-ic'), 1);
    });
  });

  container.querySelectorAll('[data-rep-dec]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      adjustRepBadge(btn.getAttribute('data-rep-dec'), btn.getAttribute('data-ic'), -1);
    });
  });
}

/**
 * Adjusts count on a repeatable badge (e.g. Service Years)
 * @param {string} badgeId
 * @param {string} ic
 * @param {number} delta
 */
async function adjustRepBadge(badgeId, ic, delta) {
  if (!_memberBadgesCache) _memberBadgesCache = {};
  var saved = _memberBadgesCache[ic] || null;
  var client = getSupaClient();
  if (!saved && client) {
    try {
      var brows = await client.get('bb_member_badges?ic=eq.' + encodeURIComponent(ic) + '&select=badge_data');
      if (brows && brows.length) saved = JSON.parse(brows[0].badge_data || '{}');
      else saved = {};
      _memberBadgesCache[ic] = saved;
    } catch (e) {
      saved = {};
    }
  }
  saved = saved || {};
  var repData = saved[badgeId + '_rep'];
  if (!repData || typeof repData !== 'object' || Array.isArray(repData)) {
    var old = safeMigrateEntry(saved[badgeId]);
    repData = { count: (old.basic || old.advanced) ? 1 : 0, dates: old.basic ? [old.basicDate] : [] };
  }
  var newCount = Math.max(0, (repData.count || 0) + delta);
  var dates    = (repData.dates || []).slice(0, newCount);
  while (dates.length < newCount) dates.push('');
  saved[badgeId + '_rep'] = { count: newCount, dates: dates };
  _memberBadgesCache[ic] = saved;
  upsertMemberBadges(ic, saved);
  loadBadges(ic, saved);
  renderPresidentsTracker(ic, saved);
}

/**
 * Toggles a basic or advanced tier on a member's badge
 * @param {string} badgeId
 * @param {string} ic
 * @param {string} tier ('basic' | 'advanced')
 */
async function toggleBadge(badgeId, ic, tier) {
  if (!_memberBadgesCache) _memberBadgesCache = {};
  var saved = _memberBadgesCache[ic] || null;
  var client = getSupaClient();
  if (!saved && client) {
    try {
      var brows = await client.get('bb_member_badges?ic=eq.' + encodeURIComponent(ic) + '&select=badge_data');
      if (brows && brows.length) saved = JSON.parse(brows[0].badge_data || '{}');
      else saved = {};
      _memberBadgesCache[ic] = saved;
    } catch (e) {
      saved = {};
    }
  }
  saved = saved || {};
  var entry = safeMigrateEntry(saved[badgeId]);
  if (tier === 'advanced') entry.advanced = !entry.advanced;
  else entry.basic = !entry.basic;
  saved[badgeId] = entry;
  _memberBadgesCache[ic] = saved;
  upsertMemberBadges(ic, saved);
  loadBadges(ic, saved);
  renderPresidentsTracker(ic, saved);
}

/**
 * Persists all member self-reported dates and checks to Supabase
 */
async function saveBadges() {
  if (typeof sessionGet !== 'function') return;
  var ic = sessionGet('ic');
  if (!ic) return;
  var defs = await getBadgeDefs();
  if (!_memberBadgesCache) _memberBadgesCache = {};
  var saved = _memberBadgesCache[ic] || {};

  defs.forEach(function(b) {
    if (b.repeatable) {
      var repData = saved[b.id + '_rep'] || { count: 0, dates: [] };
      var newDates = [];
      for (var di = 0; di < repData.count; di++) {
        var el = document.getElementById('badge-rep-' + b.id + '-' + di);
        newDates.push(el ? el.value : '');
      }
      repData.dates = newDates;
      saved[b.id + '_rep'] = repData;
    } else {
      var entry = safeMigrateEntry(saved[b.id]);
      var bd = document.getElementById('badge-basic-' + b.id);
      var ad = document.getElementById('badge-adv-'   + b.id);
      if (bd) entry.basicDate    = bd.value;
      if (ad) entry.advancedDate = ad.value;
      saved[b.id] = entry;
    }
  });

  _memberBadgesCache[ic] = saved;
  await upsertMemberBadges(ic, saved);
  renderPresidentsTracker(ic, saved);
  if (typeof showToast === 'function') {
    showToast('Badges saved successfully!', 'success');
  }
}

/**
 * Filters visible badges by name search input
 * @param {string} query
 */
function filterBadges(query) {
  if (typeof document === 'undefined') return;
  var q = (query || '').toLowerCase().trim();
  var cats = document.querySelectorAll('#badges-list > div');
  var anyVisible = false;
  cats.forEach(function(catDiv) {
    var badges = catDiv.querySelectorAll('[data-badge-card]');
    var catLabel = catDiv.querySelector('[data-cat-label]');
    var catVisible = false;
    badges.forEach(function(card) {
      var name = (card.getAttribute('data-badge-name') || '').toLowerCase();
      var show = !q || name.indexOf(q) !== -1;
      card.style.display = show ? 'block' : 'none';
      if (show) { catVisible = true; anyVisible = true; }
    });
    if (catLabel) catLabel.style.display = catVisible ? 'block' : 'none';
    catDiv.style.display = catVisible ? 'block' : 'none';
  });
  var noRes = document.getElementById('badge-no-results');
  if (noRes) noRes.style.display = anyVisible ? 'none' : 'block';
}

/**
 * Renders the President's and Founder's Award progress tracker widget
 * @param {string} ic
 * @param {Object} [preloadedSaved]
 */
async function renderPresidentsTracker(ic, preloadedSaved) {
  var container = (typeof document !== 'undefined') ? document.getElementById('presidents-tracker') : null;
  if (!container) return;

  var saved = preloadedSaved || (_memberBadgesCache && _memberBadgesCache[ic]) || null;
  var client = getSupaClient();
  if (!saved && client) {
    try {
      var brows = await client.get('bb_member_badges?ic=eq.' + encodeURIComponent(ic) + '&select=badge_data');
      if (brows && brows.length) saved = JSON.parse(brows[0].badge_data || '{}');
      else saved = {};
      if (!_memberBadgesCache) _memberBadgesCache = {};
      _memberBadgesCache[ic] = saved;
    } catch (e) {
      saved = {};
    }
  }
  saved = saved || {};
  var defs = await getBadgeDefs();

  // Evaluate award criteria
  var evalResult = evaluateFoundersCriteria(saved, defs);
  var reqs = evalResult.reqs;
  var groupResults = evalResult.groupResults;
  var serviceYears = evalResult.serviceYears;
  var metCount = evalResult.metCount;
  var allDone = evalResult.allDone;
  var overallPct = evalResult.overallPct;

  // ── Build HTML ────────────────────────────────────────────────────────
  var html = '<div style="background:var(--bg-card);border:1.5px solid '
    + (allDone ? 'var(--gold)' : 'var(--border-card)') + ';border-radius:14px;padding:16px 18px;margin-bottom:16px;box-shadow:var(--shadow-card);">';

  // Header
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="display:flex;align-items:center;gap:10px;">'
    + '<div style="width:36px;height:36px;border-radius:10px;background:rgba(200,150,30,0.15);display:flex;align-items:center;justify-content:center;color:var(--gold);"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>'
    + '<div>'
    + '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--gold);">President\'s Award</div>'
    + '<div style="font-size:11px;color:var(--text-secondary);margin-top:1px;">' + metCount + ' of ' + reqs.length + ' requirements met</div>'
    + '</div></div>'
    + '<div style="font-family:var(--font-headline);font-size:24px;font-weight:700;color:' + (allDone ? 'var(--gold)' : 'var(--text-primary)') + ';">' + overallPct + '%</div>'
    + '</div>';

  // Overall progress bar
  html += '<div style="background:var(--bg-card-subtle);border-radius:20px;height:8px;overflow:hidden;margin-bottom:16px;border:1px solid var(--border-subtle);">'
    + '<div style="height:100%;width:' + overallPct + '%;border-radius:20px;background:linear-gradient(90deg,var(--accent),var(--gold));transition:width 0.4s;"></div>'
    + '</div>';

  // Requirements list
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';
  reqs.forEach(function(r) {
    var tickBg  = r.done ? 'var(--gold)' : 'var(--bg-card-subtle)';
    var tickCol = r.done ? 'var(--navy)' : 'var(--text-muted)';
    var border  = r.done ? '' : 'border:1.5px solid var(--border-card);';
    html += '<div style="background:var(--bg-card-subtle);border-radius:10px;padding:10px 12px;border:1px solid var(--border-subtle);">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:' + ((r.pct < 100 || r.sub) ? '8px' : '0') + ';">'
      + '<div style="width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:' + tickBg + ';color:' + tickCol + ';' + border + '">' + (r.done ? '&#10003;' : '') + '</div>'
      + '<div style="flex:1;">'
      + '<div style="font-size:12px;font-weight:600;color:' + (r.done ? 'var(--text-primary)' : 'var(--text-secondary)') + ';">' + r.label + '</div>'
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">' + r.detail + '</div>'
      + '</div>'
      + (r.done ? '<span style="font-size:10px;color:var(--gold);font-weight:700;white-space:nowrap;">&#10003; Done</span>' : '')
      + '</div>';

    // Compulsory sub-list
    if (r.sub) {
      html += '<div style="display:flex;flex-direction:column;gap:4px;padding-left:32px;">';
      r.sub.forEach(function(c) {
        html += '<div style="display:flex;align-items:center;gap:8px;">'
          + '<div style="width:16px;height:16px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;'
          + (c.done ? 'background:var(--gold);color:var(--navy);' : c.missing ? 'background:var(--border-card);color:var(--text-muted);' : 'background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-muted);') + '">'
          + (c.done ? '&#10003;' : (c.missing ? '?' : '')) + '</div>'
          + '<span style="font-size:11px;color:' + (c.done ? 'var(--text-primary)' : c.missing ? 'var(--text-muted)' : 'var(--text-secondary)') + ';">' + c.label + (c.missing ? ' <em style="color:var(--text-muted);font-size:10px;">(badge not found)</em>' : '') + '</span>'
          + '</div>';
      });
      html += '</div>';
    } else if (r.pct < 100) {
      html += '<div style="background:var(--bg-card-subtle);border-radius:20px;height:4px;overflow:hidden;border:1px solid var(--border-subtle);">'
        + '<div style="height:100%;width:' + r.pct + '%;border-radius:20px;background:' + (r.pct > 0 ? 'var(--brand-blue)' : 'var(--border-card)') + ';transition:width 0.4s;"></div>'
        + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // Group breakdown
  if (groupResults.length > 0) {
    html += '<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Award Groups</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
    groupResults.forEach(function(g) {
      var badgeLines = g.items.map(function(i) {
        var e = i.entry;
        var earned  = e.basic || e.advanced;
        var basicDot = earned ? '<span style="color:#e8b830;font-size:11px;">&#9679;</span>' : '<span style="color:var(--border-card);font-size:11px;">&#9675;</span>';
        var advDot   = i.badge.hasAdvanced ? (e.advanced ? '<span style="color:#ef5350;font-size:11px;">&#9679;</span>' : '<span style="color:var(--border-card);font-size:11px;">&#9675;</span>') : '';
        return '<div style="display:flex;align-items:center;gap:4px;margin-top:3px;">'
          + '<span style="font-size:11px;color:' + (earned ? 'var(--text-primary)' : 'var(--text-secondary)') + ';flex:1;">' + (typeof escapeHtml === 'function' ? escapeHtml(i.badge.name) : i.badge.name) + '</span>'
          + basicDot + advDot + '</div>';
      }).join('');
      html += '<div style="background:var(--bg-card-subtle);border-radius:8px;padding:8px 10px;border-left:3px solid ' + g.color + ';border:1px solid var(--border-subtle);border-left-width:3px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">'
        + '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:' + g.color + ';">' + g.label + '</div>'
        + '<div style="font-size:10px;color:var(--text-secondary);">' + g.awarded + ' earned</div>'
        + '</div>'
        + '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">' + (typeof escapeHtml === 'function' ? escapeHtml(g.catName) : g.catName) + '</div>'
        + badgeLines + '</div>';
    });
    html += '</div>';
  }

  // Service years
  var svcDots = '';
  var maxDots = Math.max(serviceYears, 3);
  for (var yi = 1; yi <= maxDots; yi++) {
    var filled = yi <= serviceYears;
    svcDots += '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">'
      + '<div style="width:28px;height:28px;border-radius:50%;'
      + (filled ? 'background:var(--gold);' : 'background:var(--bg-card-subtle);border:1.5px solid var(--border-card);')
      + 'display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:'
      + (filled ? 'var(--navy)' : 'var(--text-muted)') + ';">' + (filled ? yi : '') + '</div>'
      + '<div style="font-size:9px;color:' + (filled ? 'var(--brand-gold)' : 'var(--text-muted)') + ';">Year ' + yi + '</div>'
      + '</div>';
  }

  html += '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 12px;margin-bottom:' + (allDone ? '12px' : '0') + ';">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:600;color:' + (serviceYears >= 3 ? 'var(--gold)' : 'var(--text-secondary)') + ';">Service Years <span style="font-size:10px;color:var(--text-muted);">(need 3)</span></div>'
    + '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:' + (serviceYears >= 3 ? 'var(--gold)' : 'var(--text-primary)') + ';">' + serviceYears + ' year' + (serviceYears !== 1 ? 's' : '') + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + svcDots + '</div>'
    + '</div>';

  // Completion banner
  if (allDone) {
    html += '<div style="background:linear-gradient(135deg,rgba(245,197,66,0.2),rgba(234,179,8,0.1));border:1px solid var(--gold);border-radius:10px;padding:14px;text-align:center;margin-top:12px;">'
      + '<div style="margin-bottom:6px;display:flex;justify-content:center;"><svg class="ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>'
      + '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--gold);">All Requirements Met!</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;line-height:1.6;">Congratulations! You are eligible for the President\'s Award.<br>See your officer to confirm and collect.</div>'
      + '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ── Admin Badge & Requirements Controllers ─────────────────────────────────

/**
 * Switches between Badge definitions and President's requirements admin subtabs
 * @param {string} sub ('badgedefs' | 'presidentsreqs')
 */
function switchBadgeSubtab(sub) {
  if (typeof document === 'undefined') return;
  ['badgedefs', 'presidentsreqs'].forEach(function(s) {
    var p = document.getElementById('subpanel-' + s);
    var b = document.getElementById('subtab-' + s);
    if (p) p.style.display = s === sub ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'badgedefs')     renderAdminBadges();
  if (sub === 'presidentsreqs') renderAdminPresidentsReqs();
}

/**
 * Sets the active requirement tier in the Admin President's Award panel
 * @param {string} tier ('any' | 'basic' | 'advanced')
 */
function setReqTier(tier) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('req-tier-val');
  if (el) el.value = tier;
  ['any', 'basic', 'advanced'].forEach(function(t) {
    var btn = document.getElementById('req-tier-' + t);
    if (btn) btn.classList.toggle('ftype-active', t === tier);
  });
}

/**
 * Renders the Admin President's Award Requirements configuration list
 */
async function renderAdminPresidentsReqs() {
  if (typeof document === 'undefined') return;
  var reqs      = await getPresidentsReqs();
  var defs      = await getBadgeDefs();
  var container = document.getElementById('admin-presidents-reqs-list');
  if (!container) return;

  var sel = document.getElementById('req-badge-select');
  if (sel) {
    var opts = '<option value="">-- Select a badge --</option>';
    var allBadges = defs.filter(function(b) { return b.name !== '(Add badges below)'; });
    allBadges.forEach(function(b) {
      opts += '<option value="' + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + '">'
        + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + ' ('
        + (typeof escapeHtml === 'function' ? escapeHtml(b.cat) : b.cat) + ')</option>';
    });
    sel.innerHTML = opts;
  }

  if (!reqs.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No requirements set. Add one below.</div>';
    return;
  }

  var tierColour = { any: '#66bb6a', basic: '#e8b830', advanced: '#ef5350' };
  var tierLabel  = { any: 'Any Level', basic: 'Basic', advanced: 'Advanced' };

  var html = '';
  reqs.forEach(function(req, i) {
    var tc = tierColour[req.tier] || '#888';
    var tl = tierLabel[req.tier]  || req.tier;
    html += '<div style="background:var(--bg-card);border-radius:12px;padding:12px 16px;margin-bottom:8px;border:1px solid var(--border-card);box-shadow:var(--shadow-card);display:flex;align-items:center;gap:12px;">'
      + '<div style="width:28px;height:28px;border-radius:50%;background:rgba(200,150,30,0.15);display:flex;align-items:center;justify-content:center;font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--gold);flex-shrink:0;">' + (i + 1) + '</div>'
      + '<div style="flex:1;">'
        + '<div style="font-size:13px;color:var(--text-primary);font-weight:600;">' + (typeof escapeHtml === 'function' ? escapeHtml(req.badgeMatch) : req.badgeMatch) + '</div>'
        + '<span style="font-size:10px;font-weight:700;background:' + tc + '22;color:' + tc + ';border:1px solid ' + tc + '44;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;">' + tl + '</span>'
      + '</div>'
      + '<button data-del-req="' + i + '" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">Remove</button>'
      + '</div>';
  });
  container.innerHTML = html;

  container.querySelectorAll('[data-del-req]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var idx  = parseInt(btn.getAttribute('data-del-req'), 10);
      var currentReqs = await getPresidentsReqs();
      var name = currentReqs[idx] ? currentReqs[idx].badgeMatch : '';
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Remove "' + name + '" from requirements?', 'Remove Requirement')
        : true;
      if (!ok) return;
      currentReqs.splice(idx, 1);
      await savePresidentsReqs(currentReqs);
      renderAdminPresidentsReqs();
    });
  });
}

/**
 * Adds a new badge requirement to the President's Award criteria
 */
async function addPresidentsReq() {
  if (typeof document === 'undefined') return;
  var sel  = document.getElementById('req-badge-select');
  var tier = (document.getElementById('req-tier-val') || {}).value || 'any';
  var name = sel ? sel.value.trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('Please select a badge.', 'warning');
    return;
  }
  var tierLabel = { any: '(any level)', basic: '(Basic)', advanced: '(Advanced)' };
  var label = name + ' ' + (tierLabel[tier] || '');
  var reqs  = await getPresidentsReqs();
  if (reqs.some(function(r) { return r.badgeMatch === name && r.tier === tier; })) {
    if (typeof showToast === 'function') showToast('This badge and level combination is already a requirement.', 'warning');
    return;
  }
  reqs.push({ label: label, badgeMatch: name, tier: tier });
  await savePresidentsReqs(reqs);
  renderAdminPresidentsReqs();
  if (sel) sel.value = '';
  setReqTier('any');
}

/**
 * Renders the Admin Badges Catalog Editor
 */
async function renderAdminBadges() {
  if (typeof document === 'undefined') return;
  var defs      = await getBadgeDefs();
  var cats      = [];
  defs.forEach(function(b) {
    if (cats.indexOf(b.cat) === -1) cats.push(b.cat);
  });
  var container = document.getElementById('admin-badges-content');
  if (!container) return;

  var html = '';
  cats.forEach(function(cat) {
    var catBadges = defs.filter(function(b) { return b.cat === cat && b.name !== '(Add badges below)'; });
    var inputKey  = 'nb_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
    var rows = catBadges.length
      ? catBadges.map(function(b) {
          var tierMode = b.tier || (b.hasAdvanced ? 'both' : 'basic');
          var advLabel = tierMode === 'both'
            ? '<span style="font-size:9px;font-weight:700;background:rgba(239,83,80,0.15);color:#ef5350;border:1px solid rgba(239,83,80,0.3);padding:2px 7px;border-radius:20px;margin-left:6px;">Basic + Advanced</span>'
            : tierMode === 'none'
            ? '<span style="font-size:9px;color:var(--text-muted);margin-left:6px;">No levels</span>'
            : '<span style="font-size:9px;color:var(--text-muted);margin-left:6px;">Basic only</span>';
          var repLabel = b.repeatable
            ? '<span style="font-size:9px;font-weight:700;background:rgba(102,187,106,0.15);color:#66bb6a;border:1px solid rgba(102,187,106,0.3);padding:2px 7px;border-radius:20px;margin-left:4px;">Repeatable</span>'
            : '';
          var safeBadgeImg = b.image ? ((typeof safeUrl === 'function') ? safeUrl(b.image, '') : b.image) : '';
          var imgThumb = safeBadgeImg
            ? '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(safeBadgeImg) : safeBadgeImg) + '" style="width:32px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--border-card);flex-shrink:0;"/>'
            : '<div style="width:32px;height:32px;border-radius:6px;background:var(--bg-card-subtle);border:1px dashed var(--border-card);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>';

          return '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border-subtle);">'
            + imgThumb
            + '<div style="flex:1;"><span style="font-size:13px;color:var(--text-primary);">' + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + '</span>' + advLabel + repLabel + '</div>'
            + '<label title="Upload badge image" style="cursor:pointer;background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:7px;padding:5px 8px;font-size:11px;color:var(--text-secondary);white-space:nowrap;position:relative;display:inline-flex;align-items:center;gap:4px;">'
              + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><input type="file" accept="image/*" data-img-badge="' + b.id + '" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;"/>'
            + '</label>'
            + (b.image ? '<button data-clear-img="' + b.id + '" title="Remove image" style="background:none;border:none;color:var(--red);font-size:12px;cursor:pointer;padding:2px 6px;">&#10005;</button>' : '')
            + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:var(--green);white-space:nowrap;">'
              + '<input type="checkbox" data-toggle-rep="' + b.id + '" ' + (b.repeatable ? 'checked' : '') + ' style="accent-color:#10b981;cursor:pointer;"/> Rep</label>'
            + '<select data-tier-sel="' + b.id + '" style="background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 6px;font-size:11px;cursor:pointer;">'
              + '<option value="none" '  + (tierMode === 'none'  ? 'selected' : '') + '>No levels</option>'
              + '<option value="basic" ' + (tierMode === 'basic' ? 'selected' : '') + '>Basic only</option>'
              + '<option value="both" '  + (tierMode === 'both'  ? 'selected' : '') + '>Basic + Adv</option>'
            + '</select>'
            + '<button data-del-badge="' + b.id + '" style="background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;padding:2px 6px;">\u00d7</button>'
            + '</div>';
        }).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:6px 0;">No badges yet \u2014 add one below.</div>';

    html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:12px;border:1px solid var(--border-card);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
        + '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--gold);">' + (typeof escapeHtml === 'function' ? escapeHtml(cat) : cat) + '</div>'
        + '<button data-del-cat="' + cat + '" style="background:#3a1a1a;border:1px solid #6a2a2a;color:#f66;padding:4px 12px;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;">Delete section</button>'
      + '</div>' + rows
      + '<div style="display:flex;gap:8px;margin-top:10px;">'
        + '<input type="text" id="' + inputKey + '" placeholder="New badge name..." style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;"/>'
        + '<button data-add-badge="' + cat + '" style="background:rgba(200,150,30,0.15);border:1px solid rgba(200,150,30,0.35);color:var(--gold);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;">+ Add</button>'
      + '</div></div>';
  });

  html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;border:1px dashed var(--border-card);">'
    + '<div style="font-family:var(--font-headline);font-size:14px;font-weight:600;color:var(--brand-gold);margin-bottom:10px;display:flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add New Section</div>'
    + '<div style="display:flex;gap:8px;">'
      + '<input type="text" id="new-cat-name" placeholder="Section name e.g. Leadership" style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;"/>'
      + '<button id="btn-add-cat" style="background:var(--accent);border:none;color:var(--navy);padding:8px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">+ Add</button>'
    + '</div></div>';

  container.innerHTML = html;

  container.querySelectorAll('[data-img-badge]').forEach(function(input) {
    input.addEventListener('change', function() {
      var id   = input.getAttribute('data-img-badge');
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = async function(e) {
        var currentDefs = await getBadgeDefs();
        var badge = currentDefs.find(function(b) { return b.id === id; });
        if (badge) {
          badge.image = e.target.result;
          await saveBadgeDefs(currentDefs);
          renderAdminBadges();
        }
      };
      reader.readAsDataURL(file);
    });
  });

  container.querySelectorAll('[data-clear-img]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var id   = btn.getAttribute('data-clear-img');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (badge) {
        delete badge.image;
        await saveBadgeDefs(currentDefs);
        renderAdminBadges();
      }
    });
  });

  container.querySelectorAll('[data-toggle-rep]').forEach(function(chk) {
    chk.addEventListener('change', async function() {
      var id   = chk.getAttribute('data-toggle-rep');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (badge) {
        badge.repeatable = chk.checked;
        await saveBadgeDefs(currentDefs);
        renderAdminBadges();
      }
    });
  });

  container.querySelectorAll('[data-tier-sel]').forEach(function(sel) {
    sel.addEventListener('change', async function() {
      var id   = sel.getAttribute('data-tier-sel');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (!badge) return;
      badge.tier        = sel.value;
      badge.hasAdvanced = sel.value === 'both';
      await saveBadgeDefs(currentDefs);
      renderAdminBadges();
    });
  });

  container.querySelectorAll('[data-del-cat]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var cat = btn.getAttribute('data-del-cat');
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Delete the "' + cat + '" section and all its badges?', 'Delete Badge Section')
        : true;
      if (!ok) return;
      await saveBadgeDefs((await getBadgeDefs()).filter(function(b) { return b.cat !== cat; }));
      renderAdminBadges();
    });
  });

  container.querySelectorAll('[data-del-badge]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var id   = btn.getAttribute('data-del-badge');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (!badge) return;
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Delete badge "' + badge.name + '"?', 'Delete Badge')
        : true;
      if (!ok) return;
      await saveBadgeDefs(currentDefs.filter(function(b) { return b.id !== id; }));
      renderAdminBadges();
    });
  });

  container.querySelectorAll('[data-add-badge]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var cat   = btn.getAttribute('data-add-badge');
      var key   = 'nb_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
      var input = document.getElementById(key);
      var name  = input ? input.value.trim() : '';
      if (!name) { if (typeof showToast === 'function') showToast('Please enter a badge name.', 'warning'); return; }
      var currentDefs = (await getBadgeDefs()).filter(function(b) {
        return !(b.cat === cat && b.name === '(Add badges below)');
      });
      currentDefs.push({
        id: 'b_' + Date.now(),
        name: name,
        cat: cat,
        hasAdvanced: false,
        tier: 'basic',
        repeatable: false
      });
      await saveBadgeDefs(currentDefs);
      if (typeof showToast === 'function') showToast('Badge added! Members will see it when they next open their badges.', 'success');
      if (input) input.value = '';
      renderAdminBadges();
    });
  });

  var addCatBtn = document.getElementById('btn-add-cat');
  if (addCatBtn) {
    addCatBtn.addEventListener('click', async function() {
      var input = document.getElementById('new-cat-name');
      var name  = input ? input.value.trim() : '';
      if (!name) { if (typeof showToast === 'function') showToast('Please enter a section name.', 'warning'); return; }
      var currentDefs = await getBadgeDefs();
      if (currentDefs.some(function(b) { return b.cat === name; })) {
        if (typeof showToast === 'function') showToast('Section already exists.', 'warning');
        return;
      }
      currentDefs.push({ id: 'b_' + Date.now(), name: '(Add badges below)', cat: name, hasAdvanced: false });
      await saveBadgeDefs(currentDefs);
      if (input) input.value = '';
      renderAdminBadges();
    });
  }
}

// ── Browser & Node Environment Exports ─────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEFAULT_BB_BADGES          = DEFAULT_BB_BADGES;
  window.DEFAULT_PRESIDENTS_REQS    = DEFAULT_PRESIDENTS_REQS;
  window.DEFAULT_FOUNDERS_REQS      = DEFAULT_FOUNDERS_REQS;
  window.PRESIDENTS_REQS            = PRESIDENTS_REQS;
  window._badgeDefsCache            = _badgeDefsCache;
  window._memberBadgesCache         = _memberBadgesCache;
  window.checkBadgesAccess          = checkBadgesAccess;
  window.getBadgeDefs               = getBadgeDefs;
  window.saveBadgeDefs              = saveBadgeDefs;
  window.getPresidentsReqs          = getPresidentsReqs;
  window.savePresidentsReqs          = savePresidentsReqs;
  window.upsertMemberBadges         = upsertMemberBadges;
  window.evaluateFoundersCriteria   = evaluateFoundersCriteria;
  window.loadBadges                 = loadBadges;
  window.adjustRepBadge             = adjustRepBadge;
  window.toggleBadge                = toggleBadge;
  window.saveBadges                 = saveBadges;
  window.filterBadges               = filterBadges;
  window.renderPresidentsTracker    = renderPresidentsTracker;
  window.switchBadgeSubtab          = switchBadgeSubtab;
  window.setReqTier                 = setReqTier;
  window.renderAdminPresidentsReqs  = renderAdminPresidentsReqs;
  window.addPresidentsReq           = addPresidentsReq;
  window.renderAdminBadges          = renderAdminBadges;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_BB_BADGES,
    DEFAULT_PRESIDENTS_REQS,
    DEFAULT_FOUNDERS_REQS,
    PRESIDENTS_REQS,
    _badgeDefsCache,
    _memberBadgesCache,
    checkBadgesAccess,
    getBadgeDefs,
    saveBadgeDefs,
    getPresidentsReqs,
    savePresidentsReqs,
    upsertMemberBadges,
    evaluateFoundersCriteria,
    loadBadges,
    adjustRepBadge,
    toggleBadge,
    saveBadges,
    filterBadges,
    renderPresidentsTracker,
    switchBadgeSubtab,
    setReqTier,
    renderAdminPresidentsReqs,
    addPresidentsReq,
    renderAdminBadges
  };
}
