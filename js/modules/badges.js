/**
 * 1st Petaling Jaya Boys' Brigade Portal - Badges Module (TSK-008)
 *
 * Handles badge catalog definition, member badge assignments, proficiency tracking,
 * repeatable badges (service years), President's & Founder's Award criteria checklists,
 * and Officer Admin badge definition management.
 */

/* global supa, escapeHtml, safeUrl, sessionGet, showToast, migrateEntry */

// ── Default Badge Catalog (41 Official Badges in 4 Categories) ───────────────
var DEFAULT_BB_BADGES = [
  // ── Compulsory Awards (5 badges) ──────────────────────────────────────────
  { id: 'bb1',  name: 'Target Badge',             cat: 'Compulsory Awards', hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/0%20Target.png' },
  { id: 'bb13', name: 'Christian Education',      cat: 'Compulsory Awards', hasAdvanced: true,  tier: 'both', image: 'assets/BB%20Badges/Christian%20Education.png' },
  { id: 'bb6',  name: 'Drill',                    cat: 'Compulsory Awards', hasAdvanced: true,  tier: 'both', image: 'assets/BB%20Badges/Drill.png' },
  { id: 'bb8',  name: 'NCO Star / Proficiency',   cat: 'Compulsory Awards', hasAdvanced: true,  tier: 'both', image: 'assets/BB%20Badges/NCO%20Proficiency.png' },
  { id: 'bb_recruitment', name: 'Recruitment',    cat: 'Compulsory Awards', hasAdvanced: true,  tier: 'both', image: 'assets/BB%20Badges/Recruitment.png' },

  // ── Proficiency Awards (28 badges - Alphabetical Order, 5 per row in Grid) ─
  { id: 'bb_arts',                      name: 'Arts',                       cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Arts.png' },
  { id: 'bb_athletics',                 name: 'Athletics',                  cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Athletics.png' },
  { id: 'bb_bandsman',                  name: 'Bandsman',                   cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Bandsman.png' },
  { id: 'bb_buglers',                   name: 'Buglers',                    cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Buglers.png' },
  { id: 'bb10',                         name: 'Camping',                    cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Camping.png' },
  { id: 'bb_citizenship',               name: 'Citizenship',                cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Citizenship.png' },
  { id: 'bb_communications',            name: 'Communications',             cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Communications.png' },
  { id: 'bb9',                          name: 'Community Service',          cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Community%20Service.png' },
  { id: 'bb_computer_knowledge',        name: 'Computer Knowledge',         cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Computer%20Knowledge.png' },
  { id: 'bb_crafts',                    name: 'Crafts',                     cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Crafts.png' },
  { id: 'bb_drummers',                  name: 'Drummers',                   cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Drummers.png' },
  { id: 'bb_environmental_conservation', name: 'Environmental Conservation', cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Enviromental%20Conservation.png' },
  { id: 'bb11',                         name: 'Expedition',                 cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Expedition.png' },
  { id: 'bb_financial_stewardship',     name: 'Financial Stewardship',      cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Financial%20Stewardship.png' },
  { id: 'bb5',                          name: 'Fire and Rescue',            cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Fire%20and%20Rescue.png' },
  { id: 'bb4',                          name: 'First Aid',                  cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/First%20Aid.png' },
  { id: 'bb_gymnastics',                name: 'Gymnastics',                 cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Gymnastics.png' },
  { id: 'bb_hobbies',                   name: 'Hobbies',                    cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Hobbies.png' },
  { id: 'bb_international_relations',   name: 'International Relations',    cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/International%20Relations.png' },
  { id: 'bb_life_saving',               name: 'Life Saving',                cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Life%20Saving.png' },
  { id: 'bb_nature_awareness',          name: 'Nature Awareness',           cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Nature%20Awareness.png' },
  { id: 'bb_physical_training',         name: 'Physical Training',          cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Physical%20Training.png' },
  { id: 'bb_safety',                    name: 'Safety',                     cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Safety.png' },
  { id: 'bb_social_entrepreneurship',   name: 'Social Entrepreneurship',    cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Social%20Entreprenuership.png' },
  { id: 'bb_sports',                    name: 'Sports',                     cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Sports.png' },
  { id: 'bb_sustainability',            name: 'Sustainability',             cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Sustainability.png' },
  { id: 'bb12',                         name: 'Swimming',                   cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Swimming.png' },
  { id: 'bb_water_adventure',           name: 'Water Adventure',            cat: 'Proficiency Awards', hasAdvanced: true, tier: 'both', image: 'assets/BB%20Badges/Water%20Adventure.png' },

  // ── Service Awards (2 badges) ─────────────────────────────────────────────
  { id: 'bb_3year_service',             name: 'Three Year Service Badge',   cat: 'Service Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Three%20Year%20Service%20Badge.png' },
  { id: 'bb_long_year_service',         name: 'Long Year Service',          cat: 'Service Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Long%20Year%20Service.png', repeatable: true },

  // ── Special Awards (6 badges) ─────────────────────────────────────────────
  { id: 'bb2',                          name: "BB Founder's Award",         cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: "assets/BB%20Badges/Founder's%20Award.png" },
  { id: 'bb3',                          name: "President's Award",          cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: "assets/BB%20Badges/President's%20Award.png" },
  { id: 'bb_gold_award',                name: 'Gold Award',                 cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Gold%20Award.png' },
  { id: 'bb_bronze_scholastic',         name: 'Bronze Scholastic',          cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Bronze%20Scholastic.png' },
  { id: 'bb_silver_scholastic',         name: 'Silver Scholastic',          cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Silver%20Scholastic.png' },
  { id: 'bb_gold_scholastic',           name: 'Gold Scholastic',            cat: 'Special Awards',     hasAdvanced: false, tier: 'none', image: 'assets/BB%20Badges/Gold%20Scholastic.png' }
];

// ── Default President's & Founder's Requirements ─────────────────────────────
var DEFAULT_PRESIDENTS_REQS = [
  { label: 'First Aid (Advanced)',        badgeMatch: 'First Aid',         tier: 'advanced' },
  { label: 'Leadership / NCO (Advanced)', badgeMatch: 'NCO',              tier: 'advanced' },
  { label: 'Camping (Advanced)',          badgeMatch: 'Camping',           tier: 'advanced' },
  { label: 'Swimming (any level)',        badgeMatch: 'Swimming',          tier: 'any'      },
  { label: 'Drill (any level)',           badgeMatch: 'Drill',             tier: 'any'      },
  { label: 'Community Service',           badgeMatch: 'Community Service', tier: 'any'      },
  { label: 'Fire Safety / Rescue',        badgeMatch: 'Fire',              tier: 'any'      }
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
var _badgesDisplayMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('bb_badges_display_mode') : null) || 'grid';
var _badgesActiveCategory = 'all';

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
 * Gets active badges display mode ('grid' or 'list')
 * @returns {string}
 */
function getBadgesDisplayMode() {
  return _badgesDisplayMode || 'grid';
}

/**
 * Sets active badges display mode ('grid' or 'list') and re-renders view
 * @param {string} mode
 */
function setBadgesDisplayMode(mode) {
  _badgesDisplayMode = (mode === 'list') ? 'list' : 'grid';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_badges_display_mode', _badgesDisplayMode);
    }
  } catch (_) {}
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  if (ic) {
    loadBadges(ic);
  }
}

/**
 * Filters visible badges by category chip
 * @param {string} cat
 */
function filterBadgesByCategory(cat) {
  _badgesActiveCategory = cat || 'all';
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  if (ic) {
    loadBadges(ic);
  }
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
 * Enriches remote badge definitions with official images, categories, and full 41-badge catalog
 * @param {Array} remoteDefs
 * @returns {Array}
 */
function enrichBadgeCatalog(remoteDefs) {
  if (!Array.isArray(remoteDefs) || !remoteDefs.length) return DEFAULT_BB_BADGES.slice();
  var map = {};
  DEFAULT_BB_BADGES.forEach(function(d) {
    map[d.id] = d;
    if (d.name) map[d.name.toLowerCase()] = d;
  });

  var enriched = remoteDefs.map(function(b) {
    var def = map[b.id] || (b.name ? map[b.name.toLowerCase()] : null);
    if (!def) return b;
    return {
      id: b.id,
      name: b.name || def.name,
      cat: (b.cat && b.cat.indexOf('Awards') !== -1) ? b.cat : def.cat,
      hasAdvanced: typeof b.hasAdvanced === 'boolean' ? b.hasAdvanced : def.hasAdvanced,
      tier: b.tier || def.tier,
      repeatable: b.repeatable || def.repeatable,
      image: b.image || def.image
    };
  });

  // Ensure any official badges missing from remote config are included
  DEFAULT_BB_BADGES.forEach(function(def) {
    var exists = enriched.some(function(b) {
      return b.id === def.id || (b.name && b.name.toLowerCase() === def.name.toLowerCase());
    });
    if (!exists) {
      enriched.push(def);
    }
  });

  return enriched;
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
          _badgeDefsCache = enrichBadgeCatalog(v);
          return _badgeDefsCache;
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
      var colorMap = { a: 'var(--blue)', b: 'var(--green)', c: 'var(--accent)', d: 'var(--purple)' };
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

  var displayMode = getBadgesDisplayMode();
  var activeCat = _badgesActiveCategory || 'all';

  // 4 Primary Official Categories
  var CATEGORIES = [
    'Compulsory Awards',
    'Proficiency Awards',
    'Service Awards',
    'Special Awards'
  ];

  var counts = { all: defs.length };
  CATEGORIES.forEach(function(c) {
    counts[c] = defs.filter(function(b) { return b.cat === c; }).length;
  });

  // 1. Render Top View Controls (Category Filter Chips & View Mode Toggle)
  var html = '<div class="badges-view-header">'
    + '<div class="badge-cat-chips-bar">'
    +   '<button type="button" class="badge-cat-chip' + (activeCat === 'all' ? ' active' : '') + '" onclick="filterBadgesByCategory(\'all\')">All Badges (' + defs.length + ')</button>';

  CATEGORIES.forEach(function(cat) {
    var cCount = counts[cat] || 0;
    if (!cCount) return;
    html += '<button type="button" class="badge-cat-chip' + (activeCat === cat ? ' active' : '') + '" onclick="filterBadgesByCategory(\'' + escapeHtml(cat) + '\')">' + escapeHtml(cat) + ' (' + cCount + ')</button>';
  });

  html += '</div>'
    + '<div class="badges-view-toggle">'
    +   '<button type="button" class="badge-view-toggle-btn' + (displayMode === 'grid' ? ' active' : '') + '" onclick="setBadgesDisplayMode(\'grid\')" title="Grid View (Board)">'
    +     '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
    +     '<span>Grid</span>'
    +   '</button>'
    +   '<button type="button" class="badge-view-toggle-btn' + (displayMode === 'list' ? ' active' : '') + '" onclick="setBadgesDisplayMode(\'list\')" title="List View">'
    +     '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    +     '<span>List</span>'
    +   '</button>'
    + '</div>'
    + '</div>';

  // 2. Render Categories in Sequence
  CATEGORIES.forEach(function(cat) {
    var catBadges = defs.filter(function(b) { return b.cat === cat && b.name !== '(Add badges below)'; });
    if (!catBadges.length) return;

    // Proficiency awards ordered alphabetically
    if (cat === 'Proficiency Awards') {
      catBadges.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    var isCatFilteredOut = (activeCat !== 'all' && activeCat !== cat);
    var catDisplayStyle = isCatFilteredOut ? 'display:none;' : '';

    html += '<div class="badge-cat-section" data-cat-section="' + escapeHtml(cat) + '" style="' + catDisplayStyle + '">';
    html += '<div class="badge-cat-header" data-cat-label="1">'
      + '<span class="badge-cat-title">' + escapeHtml(cat) + '</span>'
      + '<span class="badge-cat-badge-count">' + catBadges.length + ' Badges' + (cat === 'Proficiency Awards' && displayMode === 'grid' ? ' &bull; 5 per row' : '') + '</span>'
      + '</div>';

    if (displayMode === 'grid') {
      // ── Grid View ─────────────────────────────────────────────────────────
      html += '<div class="badges-grid">';
      catBadges.forEach(function(b) {
        var safeBadgeImg = b.image ? ((typeof safeUrl === 'function') ? safeUrl(b.image, '') : b.image) : '';
        var entry = safeMigrateEntry(saved[b.id]);
        var isEarned = entry.basic || entry.advanced;
        var hasAdvOption = !!b.hasAdvanced;

        html += '<div class="badge-grid-card" data-badge-card="1" data-badge-id="' + b.id + '" data-badge-name="' + (b.name || '').toLowerCase() + '">';

        // Image
        html += '<div class="badge-card-img-wrap">';
        if (safeBadgeImg) {
          html += '<img class="badge-card-img" src="' + escapeHtml(safeBadgeImg) + '" alt="' + escapeHtml(b.name) + '" loading="lazy"/>';
        } else {
          html += '<div style="width:64px;height:64px;border-radius:12px;background:rgba(245,197,66,0.1);border:1px solid rgba(245,197,66,0.3);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:24px;font-weight:700;">' + (b.name ? b.name.charAt(0) : 'B') + '</div>';
        }
        html += '</div>';

        // Name
        html += '<div class="badge-card-name">' + escapeHtml(b.name) + '</div>';

        // Buttons
        if (b.repeatable) {
          var repData = saved[b.id + '_rep'];
          if (!repData || typeof repData !== 'object' || Array.isArray(repData)) {
            var old = safeMigrateEntry(saved[b.id]);
            repData = { count: (old.basic || old.advanced) ? 1 : 0, dates: old.basic ? [old.basicDate] : [] };
          }
          var count = repData.count || 0;
          var dates = repData.dates || [];

          html += '<div class="badge-card-actions" style="margin-bottom:8px;">';
          html += '<button type="button" class="badge-tier-btn" data-rep-dec="' + b.id + '" data-ic="' + ic + '" style="flex:0 0 34px;height:34px;border-radius:50%;font-size:18px;">&minus;</button>';
          html += '<div style="text-align:center;min-width:44px;">'
            + '<div style="font-family:var(--font-headline);font-size:22px;font-weight:700;color:' + (count > 0 ? 'var(--brand-gold)' : 'var(--text-muted)') + ';line-height:1;">' + count + '</div>'
            + '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-top:2px;">years</div>'
            + '</div>';
          html += '<button type="button" class="badge-tier-btn" data-rep-inc="' + b.id + '" data-ic="' + ic + '" style="flex:0 0 34px;height:34px;border-radius:50%;font-size:18px;color:var(--brand-gold);background:rgba(245,197,66,0.15);border-color:rgba(245,197,66,0.4);">+</button>';
          html += '</div>';

          if (count > 0) {
            html += '<div class="badge-card-date-wrap">';
            for (var di = 0; di < count; di++) {
              html += '<input type="date" id="badge-rep-' + b.id + '-' + di + '" value="' + (dates[di] || '') + '" class="badge-date-input" title="Year ' + (di + 1) + '" style="margin-bottom:3px;"/>';
            }
            html += '</div>';
          }
        } else if (hasAdvOption) {
          html += '<div class="badge-card-actions">';
          html += '<button type="button" class="badge-tier-btn tier-basic' + (entry.basic ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '">Basic' + (entry.basic ? ' &#10003;' : '') + '</button>';
          html += '<button type="button" class="badge-tier-btn tier-advanced' + (entry.advanced ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="advanced" data-ic="' + ic + '">Advanced' + (entry.advanced ? ' &#10003;' : '') + '</button>';
          html += '</div>';

          // Dates
          if (isEarned) {
            html += '<div class="badge-card-date-wrap">';
            if (entry.basic) {
              html += '<input type="date" id="badge-basic-' + b.id + '" class="badge-date-input" value="' + (entry.basicDate || '') + '" title="Basic Date Achieved" style="margin-bottom:3px;"/>';
            }
            if (entry.advanced) {
              html += '<input type="date" id="badge-adv-' + b.id + '" class="badge-date-input" value="' + (entry.advancedDate || '') + '" title="Advanced Date Achieved"/>';
            }
            html += '</div>';
          }
        } else {
          // Single milestone / awarded
          html += '<div class="badge-card-actions">';
          html += '<button type="button" class="badge-tier-btn tier-single' + (isEarned ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '">' + (isEarned ? 'Awarded &#10003;' : 'Mark as Earned') + '</button>';
          html += '</div>';

          if (isEarned) {
            html += '<div class="badge-card-date-wrap">';
            html += '<input type="date" id="badge-basic-' + b.id + '" class="badge-date-input" value="' + (entry.basicDate || '') + '" title="Date Achieved"/>';
            html += '</div>';
          }
        }

        html += '</div>'; // End card
      });
      html += '</div>'; // End badges-grid
    } else {
      // ── List View ─────────────────────────────────────────────────────────
      html += '<div class="badges-list-table">';
      catBadges.forEach(function(b) {
        var safeBadgeImg = b.image ? ((typeof safeUrl === 'function') ? safeUrl(b.image, '') : b.image) : '';
        var entry = safeMigrateEntry(saved[b.id]);
        var isEarned = entry.basic || entry.advanced;
        var hasAdvOption = !!b.hasAdvanced;

        html += '<div class="badge-list-row" data-badge-card="1" data-badge-id="' + b.id + '" data-badge-name="' + (b.name || '').toLowerCase() + '">';

        // Left: Thumbnail + Name + Category
        html += '<div class="badge-list-left">';
        if (safeBadgeImg) {
          html += '<img class="badge-list-thumb" src="' + escapeHtml(safeBadgeImg) + '" alt="' + escapeHtml(b.name) + '" loading="lazy"/>';
        } else {
          html += '<div style="width:36px;height:36px;border-radius:8px;background:rgba(245,197,66,0.1);display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:700;">' + (b.name ? b.name.charAt(0) : 'B') + '</div>';
        }
        html += '<div class="badge-list-info">'
          + '<div class="badge-list-name">' + escapeHtml(b.name) + '</div>'
          + '<div class="badge-list-cat">' + escapeHtml(cat) + (hasAdvOption ? ' &bull; Basic &amp; Advanced' : '') + '</div>'
          + '</div>';
        html += '</div>';

        // Right: Interactive Controls & Date
        html += '<div class="badge-list-actions">';
        if (b.repeatable) {
          var repData = saved[b.id + '_rep'];
          if (!repData || typeof repData !== 'object' || Array.isArray(repData)) {
            var old = safeMigrateEntry(saved[b.id]);
            repData = { count: (old.basic || old.advanced) ? 1 : 0, dates: old.basic ? [old.basicDate] : [] };
          }
          var count = repData.count || 0;
          html += '<button type="button" class="badge-tier-btn" data-rep-dec="' + b.id + '" data-ic="' + ic + '" style="width:32px;height:32px;padding:0;border-radius:50%;">&minus;</button>';
          html += '<span style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:' + (count > 0 ? 'var(--brand-gold)' : 'var(--text-muted)') + ';min-width:30px;text-align:center;">' + count + '</span>';
          html += '<button type="button" class="badge-tier-btn" data-rep-inc="' + b.id + '" data-ic="' + ic + '" style="width:32px;height:32px;padding:0;border-radius:50%;color:var(--brand-gold);">+</button>';
        } else if (hasAdvOption) {
          html += '<button type="button" class="badge-tier-btn tier-basic' + (entry.basic ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '">Basic' + (entry.basic ? ' &#10003;' : '') + '</button>';
          html += '<input type="date" id="badge-basic-' + b.id + '" class="badge-date-input" value="' + (entry.basicDate || '') + '" title="Basic Date" style="' + (entry.basic ? '' : 'opacity:0.35;') + '"/>';
          html += '<button type="button" class="badge-tier-btn tier-advanced' + (entry.advanced ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="advanced" data-ic="' + ic + '">Advanced' + (entry.advanced ? ' &#10003;' : '') + '</button>';
          html += '<input type="date" id="badge-adv-' + b.id + '" class="badge-date-input" value="' + (entry.advancedDate || '') + '" title="Advanced Date" style="' + (entry.advanced ? '' : 'opacity:0.35;') + '"/>';
        } else {
          html += '<button type="button" class="badge-tier-btn tier-single' + (isEarned ? ' active' : '') + '" data-badge-id="' + b.id + '" data-tier="basic" data-ic="' + ic + '">' + (isEarned ? 'Awarded &#10003;' : 'Mark as Earned') + '</button>';
          html += '<input type="date" id="badge-basic-' + b.id + '" class="badge-date-input" value="' + (entry.basicDate || '') + '" title="Date Achieved" style="' + (isEarned ? '' : 'opacity:0.35;') + '"/>';
        }
        html += '</div>';

        html += '</div>'; // End list row
      });
      html += '</div>'; // End list table
    }

    html += '</div>'; // End category section
  });

  container.innerHTML = html;

  // 3. Attach Interactive Event Listeners
  container.querySelectorAll('.badge-tier-btn[data-badge-id]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      var bId = el.getAttribute('data-badge-id');
      var bIc = el.getAttribute('data-ic');
      var bTier = el.getAttribute('data-tier') || 'basic';
      toggleBadge(bId, bIc, bTier);
    });
  });

  container.querySelectorAll('[data-rep-inc]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      adjustRepBadge(btn.getAttribute('data-rep-inc'), btn.getAttribute('data-ic'), 1);
    });
  });

  container.querySelectorAll('[data-rep-dec]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
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
  var todayStr = new Date().toISOString().split('T')[0];

  if (tier === 'advanced') {
    entry.advanced = !entry.advanced;
    if (entry.advanced && !entry.advancedDate) {
      entry.advancedDate = todayStr;
    }
  } else {
    entry.basic = !entry.basic;
    if (entry.basic && !entry.basicDate) {
      entry.basicDate = todayStr;
    }
  }

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
      if (bd && bd.value) entry.basicDate    = bd.value;
      if (ad && ad.value) entry.advancedDate = ad.value;
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
  var catSections = document.querySelectorAll('#badges-list .badge-cat-section');
  var anyVisible = false;

  catSections.forEach(function(sec) {
    var cards = sec.querySelectorAll('[data-badge-card]');
    var catVisible = false;
    cards.forEach(function(card) {
      var name = (card.getAttribute('data-badge-name') || '').toLowerCase();
      var show = !q || name.indexOf(q) !== -1;
      card.style.display = show ? (getBadgesDisplayMode() === 'grid' ? 'flex' : 'flex') : 'none';
      if (show) {
        catVisible = true;
        anyVisible = true;
      }
    });
    sec.style.display = catVisible ? 'block' : 'none';
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
    var tickCol = r.done ? 'var(--btn-on-accent)' : 'var(--text-muted)';
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
          + (c.done ? 'background:var(--gold);color:var(--btn-on-accent);' : c.missing ? 'background:var(--border-card);color:var(--text-muted);' : 'background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-muted);') + '">'
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
        var basicDot = earned ? '<span aria-hidden="true" style="color:var(--accent);font-size:11px;">&#9679;</span>' : '<span aria-hidden="true" style="color:var(--text-muted);opacity:0.55;font-size:11px;">&#9675;</span>';
        var advDot   = i.badge.hasAdvanced ? (e.advanced ? '<span aria-hidden="true" style="color:var(--red);font-size:11px;">&#9679;</span>' : '<span aria-hidden="true" style="color:var(--text-muted);opacity:0.55;font-size:11px;">&#9675;</span>') : '';
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
      + (filled ? 'var(--btn-on-accent)' : 'var(--text-muted)') + ';">' + (filled ? yi : '') + '</div>'
      + '<div style="font-size:9px;color:' + (filled ? 'var(--brand-gold)' : 'var(--text-muted)') + ';">Year ' + yi + '</div>'
      + '</div>';
  }

  html += '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 12px;margin-bottom:' + (allDone ? '12px' : '0') + ';">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:600;color:' + (serviceYears >= 3 ? 'var(--gold)' : 'var(--text-secondary)') + ';" title="Official BB Rule: Minimum 80% attendance required per year for One Year Service award and badge advancement.">One Year Service Milestones <span style="font-size:10px;color:var(--text-muted);">(need 3 Service Years &middot; &ge;80% attendance required)</span></div>'
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
function switchBadgeSubtab(subtab) {
  if (typeof window !== 'undefined') {
    window._badgeActiveSubtab = subtab;
  }
  var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : '';
  if (ic) renderPresidentsTracker(ic);
}

/**
 * Sets tier requirement on custom President's checklist
 * @param {number} idx
 * @param {string} tier
 */
function setReqTier(tier, tierVal) {
  if (typeof document === 'undefined') return;
  var targetTier = tierVal || tier;
  var el = document.getElementById('req-tier-val');
  if (el) el.value = targetTier;
  ['any', 'basic', 'advanced'].forEach(function(t) {
    var btn = document.getElementById('req-tier-' + t);
    if (btn) btn.classList.toggle('active', t === targetTier);
  });
  if (typeof tier === 'number' || (!isNaN(tier) && tier !== '')) {
    var rowSelect = document.getElementById('req-tier-' + tier);
    if (rowSelect) rowSelect.value = targetTier;
  }
}

/**
 * Renders the Admin Console President's Award requirements manager
 */
async function renderAdminPresidentsReqs() {
  var container = (typeof document !== 'undefined') ? document.getElementById('admin-presidents-reqs-list') : null;
  if (!container) return;
  var reqs = await getPresidentsReqs();
  var html = '';
  reqs.forEach(function(r, idx) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;background:var(--bg-card);padding:10px;border-radius:8px;border:1px solid var(--border-card);">'
      + '<input type="text" id="req-label-' + idx + '" value="' + escapeHtml(r.label) + '" style="flex:2;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:6px;padding:6px 8px;font-size:12px;"/>'
      + '<input type="text" id="req-match-' + idx + '" value="' + escapeHtml(r.badgeMatch) + '" placeholder="Badge match name" style="flex:1.5;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:6px;padding:6px 8px;font-size:12px;"/>'
      + '<select id="req-tier-' + idx + '" style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:6px;padding:6px 8px;font-size:12px;">'
      +   '<option value="any"' + (r.tier === 'any' ? ' selected' : '') + '>Any Level</option>'
      +   '<option value="advanced"' + (r.tier === 'advanced' ? ' selected' : '') + '>Advanced Only</option>'
      +   '<option value="basic"' + (r.tier === 'basic' ? ' selected' : '') + '>Basic Only</option>'
      + '</select>'
      + '<button type="button" onclick="deletePresidentsReq(' + idx + ')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:6px;padding:6px 10px;cursor:pointer;">&times;</button>'
      + '</div>';
  });
  container.innerHTML = html;
}

/**
 * Adds a new custom requirement to President's Award criteria
 */
async function deletePresidentsReq(idx) {
  var reqs = await getPresidentsReqs();
  if (idx >= 0 && idx < reqs.length) {
    reqs.splice(idx, 1);
    await savePresidentsReqs(reqs);
    renderAdminPresidentsReqs();
  }
}

async function addPresidentsReq() {
  var reqs = await getPresidentsReqs();
  reqs.push({ label: 'New Requirement', badgeMatch: '', tier: 'any' });
  await savePresidentsReqs(reqs);
  renderAdminPresidentsReqs();
}

/**
 * Renders the Admin Console Badge Definition Manager
 */
async function renderAdminBadges() {
  var container = (typeof document !== 'undefined') ? document.getElementById('admin-badge-defs-list') : null;
  if (!container) return;
  var defs = await getBadgeDefs(true);
  var html = '';
  defs.forEach(function(b, idx) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;background:var(--bg-card);padding:10px;border-radius:8px;border:1px solid var(--border-card);flex-wrap:wrap;">'
      + '<div style="width:36px;height:36px;border-radius:6px;background:var(--bg-card-subtle);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">'
      +   (b.image ? '<img src="' + escapeHtml(b.image) + '" style="width:100%;height:100%;object-fit:contain;"/>' : '<span style="font-size:12px;color:var(--text-muted);">&#9875;</span>')
      + '</div>'
      + '<input type="text" id="adm-badge-name-' + idx + '" value="' + escapeHtml(b.name) + '" style="flex:2;min-width:140px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:6px;padding:6px 8px;font-size:12px;"/>'
      + '<select id="adm-badge-cat-' + idx + '" style="flex:1.5;min-width:120px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:6px;padding:6px 8px;font-size:12px;">'
      +   '<option value="Compulsory Awards"' + (b.cat === 'Compulsory Awards' ? ' selected' : '') + '>Compulsory Awards</option>'
      +   '<option value="Proficiency Awards"' + (b.cat === 'Proficiency Awards' ? ' selected' : '') + '>Proficiency Awards</option>'
      +   '<option value="Service Awards"' + (b.cat === 'Service Awards' ? ' selected' : '') + '>Service Awards</option>'
      +   '<option value="Special Awards"' + (b.cat === 'Special Awards' ? ' selected' : '') + '>Special Awards</option>'
      + '</select>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);cursor:pointer;">'
      +   '<input type="checkbox" id="adm-badge-adv-' + idx + '" ' + (b.hasAdvanced ? 'checked' : '') + '/> Has Advanced'
      + '</label>'
      + '</div>';
  });
  container.innerHTML = html;
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
  window.deletePresidentsReq        = deletePresidentsReq;
  window.addPresidentsReq           = addPresidentsReq;
  window.renderAdminBadges          = renderAdminBadges;
  window.setBadgesDisplayMode       = setBadgesDisplayMode;
  window.getBadgesDisplayMode       = getBadgesDisplayMode;
  window.filterBadgesByCategory     = filterBadgesByCategory;
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
    deletePresidentsReq,
    addPresidentsReq,
    renderAdminBadges,
    setBadgesDisplayMode,
    getBadgesDisplayMode,
    filterBadgesByCategory
  };
}
