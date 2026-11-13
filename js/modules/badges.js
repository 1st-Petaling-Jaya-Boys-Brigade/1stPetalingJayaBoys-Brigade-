/**
 * 1st Petaling Jaya Boys' Brigade Portal - Badges Module
 *
 * Handles badge catalog definition, member badge assignments, proficiency tracking,
 * repeatable badges (service years), President's & Founder's Award criteria checklists,
 * and Officer Admin badge definition management.
 */

/* global supa, escapeHtml, safeUrl, sessionGet, showToast, showConfirmModal, migrateEntry */

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
var _deletedBadgesCache = null;
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
 * Checks if a badge definition matches any tombstoned/deleted identifier
 * @param {Object} b - Badge object
 * @param {Array<string>} [deletedList] - List of deleted IDs/names
 * @returns {boolean}
 */
function isBadgeDeleted(b, deletedList) {
  var list = deletedList || _deletedBadgesCache || [];
  if (!b || !list || !list.length) return false;
  var bId = String(b.id || '').toLowerCase().trim();
  var bName = String(b.name || '').toLowerCase().trim();
  return list.some(function(d) {
    var dNorm = String(d || '').toLowerCase().trim();
    if (!dNorm) return false;
    return (bId && dNorm === bId) || (bName && dNorm === bName);
  });
}

/**
 * Retrieves the persisted list of deleted badge identifiers
 * @param {boolean} [force=false]
 * @returns {Promise<Array<string>>}
 */
async function getDeletedBadges(force) {
  if (_deletedBadgesCache && !force) return _deletedBadgesCache;
  var cached = [];
  try {
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem('bb_deleted_badges');
      if (raw) {
        var parsedLocal = JSON.parse(raw);
        if (Array.isArray(parsedLocal)) cached = parsedLocal;
      }
    }
  } catch (_) {}

  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_deleted_badges&select=value');
      if (rows && rows.length && rows[0].value) {
        var parsedRemote = JSON.parse(rows[0].value);
        if (Array.isArray(parsedRemote)) {
          _deletedBadgesCache = parsedRemote;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('bb_deleted_badges', JSON.stringify(parsedRemote));
            }
          } catch (_) {}
          return _deletedBadgesCache;
        }
      }
    } catch (_) {}
  }
  _deletedBadgesCache = cached;
  return _deletedBadgesCache;
}

/**
 * Persists the deleted badge identifiers list to Supabase bb_config & localStorage
 * @param {Array<string>} deletedList
 */
async function saveDeletedBadges(deletedList) {
  _deletedBadgesCache = Array.isArray(deletedList) ? deletedList : [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_deleted_badges', JSON.stringify(_deletedBadgesCache));
    }
  } catch (_) {}
  var client = getSupaClient();
  if (!client) return;
  try {
    if (typeof client.upsert === 'function') {
      await client.upsert('bb_config', { key: 'bb_deleted_badges', value: JSON.stringify(_deletedBadgesCache) }, 'key');
    } else {
      await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_deleted_badges', value: JSON.stringify(_deletedBadgesCache) }, {
        Prefer: 'return=representation,resolution=merge-duplicates'
      });
    }
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_deleted_badges', { value: JSON.stringify(_deletedBadgesCache) });
    } catch (e2) {
      try {
        await client.post('bb_config', { key: 'bb_deleted_badges', value: JSON.stringify(_deletedBadgesCache) });
      } catch (_) {}
    }
  }
}

/**
 * Records one or more badges as permanently deleted
 * @param {Object|Array<Object>|string} badgeOrBadges
 * @returns {Promise<Array<string>>}
 */
async function recordBadgeDeletion(badgeOrBadges) {
  var list = Array.isArray(badgeOrBadges) ? badgeOrBadges : [badgeOrBadges];
  var currentDeleted = (await getDeletedBadges()).slice();
  var changed = false;

  list.forEach(function(b) {
    if (!b) return;
    var id = (typeof b === 'object' ? b.id : b) || '';
    var name = (typeof b === 'object' ? b.name : '') || '';
    if (id) {
      var idNorm = String(id).toLowerCase().trim();
      if (idNorm && currentDeleted.indexOf(idNorm) === -1) {
        currentDeleted.push(idNorm);
        changed = true;
      }
    }
    if (name) {
      var nameNorm = String(name).toLowerCase().trim();
      if (nameNorm && currentDeleted.indexOf(nameNorm) === -1) {
        currentDeleted.push(nameNorm);
        changed = true;
      }
    }
    var def = DEFAULT_BB_BADGES.find(function(d) {
      return (id && d.id && d.id.toLowerCase() === id.toLowerCase()) || (name && d.name && d.name.toLowerCase() === name.toLowerCase());
    });
    if (def) {
      if (def.id && currentDeleted.indexOf(def.id.toLowerCase()) === -1) {
        currentDeleted.push(def.id.toLowerCase());
        changed = true;
      }
      if (def.name && currentDeleted.indexOf(def.name.toLowerCase()) === -1) {
        currentDeleted.push(def.name.toLowerCase());
        changed = true;
      }
    }
  });

  if (changed) {
    await saveDeletedBadges(currentDeleted);
  }
  return currentDeleted;
}

/**
 * Unrecords a badge from the deletion tombstone (e.g. when an admin adds it back)
 * @param {string} badgeNameOrId
 */
async function unrecordBadgeDeletion(badgeNameOrId) {
  if (!badgeNameOrId) return;
  var target = String(badgeNameOrId).toLowerCase().trim();
  var currentDeleted = (await getDeletedBadges()).slice();
  var matchingDef = DEFAULT_BB_BADGES.find(function(d) {
    return (d.id && d.id.toLowerCase() === target) || (d.name && d.name.toLowerCase() === target);
  });
  var toRemove = [target];
  if (matchingDef) {
    if (matchingDef.id) toRemove.push(matchingDef.id.toLowerCase());
    if (matchingDef.name) toRemove.push(matchingDef.name.toLowerCase());
  }
  var filtered = currentDeleted.filter(function(x) {
    var xNorm = String(x || '').toLowerCase().trim();
    return toRemove.indexOf(xNorm) === -1;
  });
  if (filtered.length !== currentDeleted.length) {
    await saveDeletedBadges(filtered);
  }
}

/**
 * Enriches remote badge definitions with official images, categories, and full 41-badge catalog while honoring deleted badges
 * @param {Array} remoteDefs
 * @param {Array<string>} [deletedBadges]
 * @returns {Array}
 */
function enrichBadgeCatalog(remoteDefs, deletedBadges) {
  var deletedList = deletedBadges || _deletedBadgesCache || [];
  if (!Array.isArray(remoteDefs) || !remoteDefs.length) {
    return DEFAULT_BB_BADGES.filter(function(def) {
      return !isBadgeDeleted(def, deletedList);
    });
  }
  var map = {};
  DEFAULT_BB_BADGES.forEach(function(d) {
    map[d.id] = d;
    if (d.name) map[d.name.toLowerCase()] = d;
  });

  var enriched = remoteDefs
    .filter(function(b) {
      return !isBadgeDeleted(b, deletedList);
    })
    .map(function(b) {
      var def = map[b.id] || (b.name ? map[b.name.toLowerCase()] : null);
      if (!def) return b;
      return {
        id: b.id,
        name: b.name || def.name,
        cat: (b.cat && b.cat.indexOf('Awards') !== -1) ? b.cat : def.cat,
        hasAdvanced: typeof b.hasAdvanced === 'boolean' ? b.hasAdvanced : def.hasAdvanced,
        tier: b.tier || def.tier,
        repeatable: typeof b.repeatable === 'boolean' ? b.repeatable : Boolean(def.repeatable),
        image: b.image || def.image
      };
    });

  // Ensure any official badges missing from remote config are included ONLY if NOT explicitly deleted
  DEFAULT_BB_BADGES.forEach(function(def) {
    if (isBadgeDeleted(def, deletedList)) return;
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
 * Retrieves the badge definition catalog from cache, Supabase bb_config, or defaults (filtering out deleted badges)
 * @param {boolean} [force=false]
 * @returns {Promise<Array>}
 */
async function getBadgeDefs(force) {
  if (_badgeDefsCache && !force) return _badgeDefsCache;
  var deletedList = await getDeletedBadges(force);
  var client = getSupaClient();
  if (client) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_badge_defs&select=value');
      if (rows && rows.length && rows[0].value) {
        var v = JSON.parse(rows[0].value);
        if (Array.isArray(v)) {
          _badgeDefsCache = enrichBadgeCatalog(v, deletedList);
          return _badgeDefsCache;
        }
      }
    } catch (e) {
      // Fallback to local or default catalog
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      var localDefs = localStorage.getItem('bb_badge_defs');
      if (localDefs) {
        var parsedLocal = JSON.parse(localDefs);
        if (Array.isArray(parsedLocal)) {
          _badgeDefsCache = enrichBadgeCatalog(parsedLocal, deletedList);
          return _badgeDefsCache;
        }
      }
    }
  } catch (_) {}

  _badgeDefsCache = DEFAULT_BB_BADGES.filter(function(def) {
    return !isBadgeDeleted(def, deletedList);
  });
  return _badgeDefsCache;
}

/**
 * Persists the badge catalog definitions to Supabase bb_config & localStorage
 * @param {Array} defs
 */
async function saveBadgeDefs(defs) {
  _badgeDefsCache = defs;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_badge_defs', JSON.stringify(defs));
    }
  } catch (_) {}
  var client = getSupaClient();
  if (!client) return;
  try {
    if (typeof client.upsert === 'function') {
      await client.upsert('bb_config', { key: 'bb_badge_defs', value: JSON.stringify(defs) }, 'key');
    } else {
      await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_badge_defs', value: JSON.stringify(defs) }, {
        Prefer: 'return=representation,resolution=merge-duplicates'
      });
    }
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_badge_defs', { value: JSON.stringify(defs) });
    } catch (e2) {
      try {
        await client.post('bb_config', { key: 'bb_badge_defs', value: JSON.stringify(defs) });
      } catch (e3) {
        console.error('saveBadgeDefs error:', e3);
      }
    }
  }
}

/**
 * Permanently deletes a badge definition by ID from the catalog and updates all caches & storage
 * @param {string} id - Badge ID to delete
 * @returns {Promise<Array>} - Updated badge definitions
 */
async function deleteBadgeDef(id) {
  if (!id) return await getBadgeDefs();
  var currentDefs = await getBadgeDefs();
  var badge = currentDefs.find(function(b) { return b.id === id; });
  if (!badge) return currentDefs;

  await recordBadgeDeletion(badge);
  var updatedDefs = currentDefs.filter(function(b) { return b.id !== id; });
  await saveBadgeDefs(updatedDefs);

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'badge.def_delete',
      targetType: 'badge_def',
      targetId: id,
      actorRole: 'officer_admin',
      details: { name: badge.name }
    });
  }

  // Clean up President's Award requirements if referenced
  try {
    var reqs = await getPresidentsReqs();
    var cleanedReqs = reqs.filter(function(r) {
      var match = (r.badgeMatch || '').toLowerCase().trim();
      return match !== (badge.name || '').toLowerCase().trim() && match !== (badge.id || '').toLowerCase().trim();
    });
    if (cleanedReqs.length !== reqs.length) {
      await savePresidentsReqs(cleanedReqs);
    }
  } catch (_) {}

  return updatedDefs;
}

/**
 * Permanently deletes an entire badge section (category) and all its badges
 * @param {string} cat - Category name to delete
 * @returns {Promise<Array>} - Updated badge definitions
 */
async function deleteBadgeSection(cat) {
  if (!cat) return await getBadgeDefs();
  var currentDefs = await getBadgeDefs();
  var badgesInCat = currentDefs.filter(function(b) { return b.cat === cat; });
  if (badgesInCat.length) {
    await recordBadgeDeletion(badgesInCat);
  }
  var updatedDefs = currentDefs.filter(function(b) { return b.cat !== cat; });
  await saveBadgeDefs(updatedDefs);
  return updatedDefs;
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
var _isSavingBadges = false;

async function upsertMemberBadges(ic, saved) {
  if (!ic) return false;
  if (!_memberBadgesCache) _memberBadgesCache = {};
  var prevSaved = _memberBadgesCache[ic] ? JSON.parse(JSON.stringify(_memberBadgesCache[ic])) : null;
  _memberBadgesCache[ic] = saved;
  var client = getSupaClient();
  if (!client) throw new Error('Database client unavailable');
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
    return true;
  } catch (e) {
    console.error('upsertMemberBadges error:', e);
    if (prevSaved) {
      _memberBadgesCache[ic] = prevSaved;
    }
    throw e;
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

// ── BB Malaysia Senior Section Proficiency Badge Group Mapping ────────────────
var BADGE_GROUP_MAP = {
  // Group A (Christian Education & Citizenship)
  bb_citizenship: 'A',
  bb_international_relations: 'A',
  bb_social_entrepreneurship: 'A',
  bb_financial_stewardship: 'A',
  bb13: 'A',

  // Group B (Community & Skills)
  bb_communications: 'B',
  bb9: 'B',
  bb_computer_knowledge: 'B',
  bb_environmental_conservation: 'B',
  bb5: 'B',
  bb4: 'B',
  bb_safety: 'B',
  bb_sustainability: 'B',

  // Group C (Physical & Adventure / Recreation)
  bb_athletics: 'C',
  bb10: 'C',
  bb11: 'C',
  bb_gymnastics: 'C',
  bb_life_saving: 'C',
  bb_nature_awareness: 'C',
  bb_physical_training: 'C',
  bb_sports: 'C',
  bb12: 'C',
  bb_water_adventure: 'C',

  // Group D (Crafts, Hobbies & Arts)
  bb_arts: 'D',
  bb_bandsman: 'D',
  bb_buglers: 'D',
  bb_crafts: 'D',
  bb_drummers: 'D',
  bb_hobbies: 'D'
};

/**
 * Resolves the Award Group ('A', 'B', 'C', 'D' or null) for a given badge definition
 * @param {Object} b
 * @returns {string|null}
 */
function getBadgeGroup(b) {
  if (!b) return null;
  // 1. Explicit group attribute (e.g. { group: 'A' })
  if (b.group && typeof b.group === 'string' && /^[abcd]$/i.test(b.group.trim())) {
    return b.group.trim().toUpperCase();
  }
  // 2. Category string contains "Group X" (e.g. 'Group A Awards')
  if (b.cat && typeof b.cat === 'string') {
    var catMatch = b.cat.match(/group\s*([abcd])\b/i);
    if (catMatch) return catMatch[1].toUpperCase();
  }
  // 3. Known catalog ID map
  if (b.id && BADGE_GROUP_MAP[b.id]) {
    return BADGE_GROUP_MAP[b.id];
  }
  // 4. Known badge name keywords
  var nm = (b.name || '').toLowerCase();
  if (/citizenship|international\s*relations|social\s*entrep|financial\s*stew/i.test(nm)) return 'A';
  if (/communications|community\s*service|computer|environmental|fire|first\s*aid|safety|sustainability/i.test(nm)) return 'B';
  if (/athletics|camping|expedition|gymnastics|life\s*saving|nature\s*awareness|physical\s*training|sports|swimming|water\s*adventure/i.test(nm)) return 'C';
  if (/arts|bandsman|bugler|craft|drummer|hobbies/i.test(nm)) return 'D';
  return null;
}

/**
 * Evaluates President's Award criteria against member badge data
 * Requirements:
 * 1. All compulsory awards received:
 *    - At least 3-year service award (bb_3year_service earned or serviceYears >= 3)
 *    - Christian Education (Advanced)
 *    - NCO Proficiency Star (Advanced)
 *    - Drill (Advanced)
 *    - Recruitment (Basic)
 * 2. At least six (6) badges from Group A, B, C and D awards.
 * 3. At least one (1) badge from each Group (Group A, B, C, D).
 * 4. At least four (4) of these badges are at Advanced Level.
 *
 * @param {Object} saved
 * @param {Array} [defs]
 * @returns {Object}
 */
function evaluatePresidentsCriteria(saved, defs) {
  saved = saved || {};
  defs = defs || DEFAULT_BB_BADGES;

  // 1. Calculate service years (repeatable badges and direct 3-year service badge)
  var serviceYears = 0;
  var has3YearBadge = false;

  defs.forEach(function(b) {
    if (b.repeatable) {
      var repData = saved[b.id + '_rep'];
      if (repData && repData.count) {
        serviceYears += repData.count;
      } else {
        var old = safeMigrateEntry(saved[b.id]);
        if (old.basic || old.advanced) serviceYears++;
      }
    }
    if (b.id === 'bb_3year_service' || (b.name && b.name.toLowerCase().indexOf('three year service') !== -1)) {
      var sEntry = safeMigrateEntry(saved[b.id]);
      if (sEntry.basic || sEntry.advanced) {
        has3YearBadge = true;
      }
    }
  });

  // Also check if saved directly has bb_3year_service
  if (saved.bb_3year_service) {
    var raw3yr = safeMigrateEntry(saved.bb_3year_service);
    if (raw3yr.basic || raw3yr.advanced) has3YearBadge = true;
  }
  // Also check generic repeatable keys if defs didn't list them
  if (saved.bb_long_year_service_rep && saved.bb_long_year_service_rep.count) {
    serviceYears = Math.max(serviceYears, saved.bb_long_year_service_rep.count);
  }
  if (saved.b_svc_rep && saved.b_svc_rep.count) {
    serviceYears = Math.max(serviceYears, saved.b_svc_rep.count);
  }

  var serviceRequirementDone = has3YearBadge || serviceYears >= 3;

  // 2. Compulsory Awards Check (5 sub-requirements)
  function findBadgeByPattern(regex, excludeRepeatable) {
    return defs.find(function(b) {
      if (excludeRepeatable && b.repeatable) return false;
      return regex.test(b.id || '') || regex.test(b.name || '');
    }) || null;
  }

  var ceBadge = findBadgeByPattern(/^(bb13$|.*christian\s*education.*)/i, true);
  var ceEntry = ceBadge ? safeMigrateEntry(saved[ceBadge.id]) : (saved.bb13 ? safeMigrateEntry(saved.bb13) : safeMigrateEntry(null));

  var ncoBadge = findBadgeByPattern(/^(bb8$|.*nco.*)/i, true);
  var ncoEntry = ncoBadge ? safeMigrateEntry(saved[ncoBadge.id]) : (saved.bb8 ? safeMigrateEntry(saved.bb8) : safeMigrateEntry(null));

  var drillBadge = findBadgeByPattern(/^(bb6$|.*drill.*)/i, true);
  var drillEntry = drillBadge ? safeMigrateEntry(saved[drillBadge.id]) : (saved.bb6 ? safeMigrateEntry(saved.bb6) : safeMigrateEntry(null));

  var recruitBadge = findBadgeByPattern(/^(bb_recruitment$|.*recruitment.*)/i, true);
  var recruitEntry = recruitBadge ? safeMigrateEntry(saved[recruitBadge.id]) : (saved.bb_recruitment ? safeMigrateEntry(saved.bb_recruitment) : safeMigrateEntry(null));

  var compResults = [
    {
      id: 'comp_service',
      label: '3-Year Service Award',
      detail: has3YearBadge ? 'Earned' : (serviceYears + ' / 3 years completed'),
      done: serviceRequirementDone
    },
    {
      id: 'comp_ce',
      label: 'Christian Education (Advanced)',
      detail: ceEntry.advanced ? 'Advanced Earned' : (ceEntry.basic ? 'Basic Only (Needs Advanced)' : 'Not Started'),
      done: !!ceEntry.advanced
    },
    {
      id: 'comp_nco',
      label: 'NCO Proficiency Star (Advanced)',
      detail: ncoEntry.advanced ? 'Advanced Earned' : (ncoEntry.basic ? 'Basic Only (Needs Advanced)' : 'Not Started'),
      done: !!ncoEntry.advanced
    },
    {
      id: 'comp_drill',
      label: 'Drill (Advanced)',
      detail: drillEntry.advanced ? 'Advanced Earned' : (drillEntry.basic ? 'Basic Only (Needs Advanced)' : 'Not Started'),
      done: !!drillEntry.advanced
    },
    {
      id: 'comp_recruitment',
      label: 'Recruitment (Basic)',
      detail: (recruitEntry.basic || recruitEntry.advanced) ? 'Earned' : 'Not Started',
      done: !!(recruitEntry.basic || recruitEntry.advanced)
    }
  ];

  var compDoneCount = compResults.filter(function(r) { return r.done; }).length;
  var allCompDone = compDoneCount === compResults.length;

  // 3. Group A, B, C, D Badge Evaluation
  var groupCounts = {
    A: { label: 'Group A', awarded: 0, advanced: 0, badges: [] },
    B: { label: 'Group B', awarded: 0, advanced: 0, badges: [] },
    C: { label: 'Group C', awarded: 0, advanced: 0, badges: [] },
    D: { label: 'Group D', awarded: 0, advanced: 0, badges: [] }
  };

  var totalGroupAwarded = 0;
  var totalGroupAdvanced = 0;

  defs.forEach(function(b) {
    if (b.repeatable) return;
    if (b.cat === 'Special Awards' || b.cat === 'Service Awards') return;
    var group = getBadgeGroup(b);
    if (!group || !groupCounts[group]) return;

    var entry = safeMigrateEntry(saved[b.id]);
    var isAwarded = !!(entry.basic || entry.advanced);
    var isAdv = !!entry.advanced;

    if (isAwarded) {
      groupCounts[group].awarded++;
      totalGroupAwarded++;
      groupCounts[group].badges.push({ badge: b, entry: entry });
    }
    if (isAdv) {
      groupCounts[group].advanced++;
      totalGroupAdvanced++;
    }
  });

  var groupsWithAtLeastOne = ['A', 'B', 'C', 'D'].filter(function(g) {
    return groupCounts[g].awarded >= 1;
  }).length;
  var hasOnePerGroup = groupsWithAtLeastOne === 4;

  // 4. Checklist Requirements Formulation
  var reqs = [
    {
      id: 'compulsory',
      num: 1,
      label: 'All Compulsory Awards Received',
      sublabel: '3-Year Service, CE (Adv), NCO Star (Adv), Drill (Adv), Recruitment (Basic)',
      detail: compDoneCount + ' / 5 compulsory awards completed',
      done: allCompDone,
      pct: Math.round((compDoneCount / 5) * 100),
      sub: compResults
    },
    {
      id: 'total6',
      num: 2,
      label: 'At Least 6 Badges from Groups A, B, C & D',
      sublabel: 'Earn at least 6 proficiency awards total across all Groups',
      detail: totalGroupAwarded + ' / 6 badges earned',
      done: totalGroupAwarded >= 6,
      pct: Math.min(100, Math.round((totalGroupAwarded / 6) * 100))
    },
    {
      id: 'onepergroup',
      num: 3,
      label: 'At Least 1 Badge from Each Group (A, B, C & D)',
      sublabel: 'Minimum 1 award from each individual group',
      detail: 'Group A: ' + groupCounts.A.awarded + ' · Group B: ' + groupCounts.B.awarded + ' · Group C: ' + groupCounts.C.awarded + ' · Group D: ' + groupCounts.D.awarded,
      done: hasOnePerGroup,
      pct: Math.round((groupsWithAtLeastOne / 4) * 100),
      groups: groupCounts
    },
    {
      id: 'adv4',
      num: 4,
      label: 'At Least 4 Group Badges at Advanced Level',
      sublabel: 'Achieve advanced stage in at least 4 Group A, B, C, or D badges',
      detail: totalGroupAdvanced + ' / 4 Advanced badges earned',
      done: totalGroupAdvanced >= 4,
      pct: Math.min(100, Math.round((totalGroupAdvanced / 4) * 100))
    }
  ];

  var metCount = reqs.filter(function(r) { return r.done; }).length;
  var allDone = metCount === reqs.length;
  var overallPct = Math.round((metCount / reqs.length) * 100);

  return {
    reqs: reqs,
    compResults: compResults,
    groupCounts: groupCounts,
    serviceYears: serviceYears,
    has3YearBadge: has3YearBadge,
    totalGroupAwarded: totalGroupAwarded,
    totalGroupAdvanced: totalGroupAdvanced,
    allCompDone: allCompDone,
    hasOnePerGroup: hasOnePerGroup,
    allDone: allDone,
    overallEligible: allDone,
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
  if (_isSavingBadges) return;
  if (typeof sessionGet !== 'function') return;
  var ic = sessionGet('ic');
  if (!ic) return;

  var saveBtn = typeof document !== 'undefined' ? (document.querySelector('button[onclick="saveBadges()"]') || document.querySelector('#badges-list ~ button.submit-btn')) : null;
  if (saveBtn) saveBtn.disabled = true;
  _isSavingBadges = true;

  try {
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

    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'badge.member_update',
        targetType: 'member_badges',
        targetId: ic,
        actorId: ic,
        actorRole: (typeof sessionGet === 'function' ? sessionGet('role') : '') || 'member',
        details: { badges_count: Object.keys(saved).length }
      });
    }

    if (typeof showToast === 'function') {
      showToast('Badges saved successfully!', 'success');
    }
  } catch (err) {
    console.error('Failed to save badges:', err);
    if (typeof showToast === 'function') {
      showToast('Failed to save badges: ' + (err.message || 'Network error'), 'error', 4500);
    }
  } finally {
    _isSavingBadges = false;
    if (saveBtn) saveBtn.disabled = false;
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
 * Renders the President's Award progress tracker widget into #presidents-tracker
 * @param {string} ic
 * @param {Object} [preloadedSaved]
 */
async function renderPresidentsTracker(ic, preloadedSaved) {
  var container = (typeof document !== 'undefined') ? document.getElementById('presidents-tracker') : null;
  if (!container) return;

  var saved = preloadedSaved || (_memberBadgesCache && _memberBadgesCache[ic]) || null;
  if (!saved && ic) {
    var client = getSupaClient();
    if (client) {
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
  }
  saved = saved || {};
  var defs = _badgeDefsCache || (await getBadgeDefs());
  var res = evaluatePresidentsCriteria(saved, defs);

  var statusBadgeHtml = res.overallEligible
    ? '<span class="presidents-status-pill eligible"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Eligible for President\'s Award</span>'
    : '<span class="presidents-status-pill in-progress"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> In Progress (' + res.metCount + ' / 4 Met)</span>';

  var checkSvg = '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var pendingSvg = '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';

  var reqsHtml = res.reqs.map(function(r) {
    var iconHtml = r.done
      ? '<div class="presidents-req-status-icon met">' + checkSvg + '</div>'
      : '<div class="presidents-req-status-icon pending">' + pendingSvg + '</div>';

    var subItemsHtml = '';
    if (r.id === 'compulsory' && r.sub) {
      subItemsHtml = '<div class="presidents-sub-list">' + r.sub.map(function(s) {
        var sCls = s.done ? 'presidents-sub-chip met' : 'presidents-sub-chip';
        var sIcon = s.done ? checkSvg : pendingSvg;
        return '<span class="' + sCls + '">' + sIcon + ' ' + (typeof escapeHtml === 'function' ? escapeHtml(s.label) : s.label) + '</span>';
      }).join('') + '</div>';
    } else if (r.id === 'onepergroup' && r.groups) {
      subItemsHtml = '<div class="presidents-group-chips">' + ['A', 'B', 'C', 'D'].map(function(g) {
        var gInfo = r.groups[g];
        var isMet = gInfo.awarded >= 1;
        var gCls = isMet ? 'presidents-group-chip met' : 'presidents-group-chip';
        var gIcon = isMet ? checkSvg : pendingSvg;
        return '<span class="' + gCls + '">' + gIcon + ' Group ' + g + ' (' + gInfo.awarded + ')' + '</span>';
      }).join('') + '</div>';
    }

    return '<div class="presidents-req-card' + (r.done ? ' met' : '') + '">' +
      '<div class="presidents-req-header">' +
        iconHtml +
        '<div class="presidents-req-info">' +
          '<div class="presidents-req-title">' + r.num + '. ' + (typeof escapeHtml === 'function' ? escapeHtml(r.label) : r.label) + '</div>' +
          '<div class="presidents-req-desc">' + (typeof escapeHtml === 'function' ? escapeHtml(r.detail) : r.detail) + '</div>' +
          subItemsHtml +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var fillClass = res.overallEligible ? 'presidents-progress-fill complete' : 'presidents-progress-fill';

  var presBadgeDef = defs.find(function(b) {
    return b.id === 'bb3' || (b.name && b.name.toLowerCase().indexOf("president's award") !== -1);
  });
  var presIconUrl = (presBadgeDef && presBadgeDef.image)
    ? (typeof safeUrl === 'function' ? safeUrl(presBadgeDef.image, "assets/BB%20Badges/President's%20Award.png") : presBadgeDef.image)
    : "assets/BB%20Badges/President's%20Award.png";

  container.innerHTML =
    '<div class="presidents-tracker-card">' +
      '<div class="presidents-tracker-header">' +
        '<div class="presidents-tracker-title-wrap">' +
          '<div class="presidents-tracker-icon">' +
            '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(presIconUrl) : presIconUrl) + '" alt="President\'s Award" style="width:100%;height:100%;object-fit:contain;display:block;" onerror="this.style.display=\'none\'"/>' +
          '</div>' +
          '<div>' +
            '<div class="presidents-tracker-title">President\'s Award Tracker</div>' +
            '<div class="presidents-tracker-subtitle">Official Senior Section Award Requirements Checklist</div>' +
          '</div>' +
        '</div>' +
        statusBadgeHtml +
      '</div>' +
      '<div class="presidents-progress-section">' +
        '<div class="presidents-progress-track">' +
          '<div class="' + fillClass + '" style="width:' + res.overallPct + '%;"></div>' +
        '</div>' +
        '<div class="presidents-progress-meta">' +
          '<span><strong>' + res.metCount + ' of 4</strong> Criteria Completed</span>' +
          '<span><strong>' + res.overallPct + '%</strong></span>' +
        '</div>' +
      '</div>' +
      '<div class="presidents-reqs-grid">' +
        reqsHtml +
      '</div>' +
    '</div>';

  container.style.display = 'block';
}

// ── Admin Badge & Requirements Controllers ─────────────────────────────────

/**
 * Switches between Badge definitions and President's requirements admin subtabs
 * @param {string} sub ('badgedefs' | 'presidentsreqs')
 */
async function switchBadgeSubtab(sub) {
  ['badgedefs', 'presidentsreqs'].forEach(function(s) {
    var p = (typeof document !== 'undefined') ? document.getElementById('subpanel-' + s) : null;
    var b = (typeof document !== 'undefined') ? document.getElementById('subtab-' + s) : null;
    if (p) p.style.display = (s === sub) ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'badgedefs') {
    return await renderAdminBadges();
  } else if (sub === 'presidentsreqs') {
    return await renderAdminPresidentsReqs();
  }
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
  var reqs = await getPresidentsReqs();
  var defs = await getBadgeDefs();
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
      + '<div style="width:28px;height:28px;border-radius:50%;background:rgba(200,150,30,0.15);display:flex;align-items:center;justify-content:center;font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--brand-gold);flex-shrink:0;">' + (i + 1) + '</div>'
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
      var idx = parseInt(btn.getAttribute('data-del-req'), 10);
      var currentReqs = await getPresidentsReqs();
      var name = currentReqs[idx] ? currentReqs[idx].badgeMatch : '';
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Remove "' + name + '" from requirements?')
        : true;
      if (!ok) return;
      currentReqs.splice(idx, 1);
      await savePresidentsReqs(currentReqs);
      renderAdminPresidentsReqs();
    });
  });
}

/**
 * Deletes a requirement from President's Award criteria
 * @param {number} idx
 */
async function deletePresidentsReq(idx) {
  var reqs = await getPresidentsReqs();
  if (idx >= 0 && idx < reqs.length) {
    reqs.splice(idx, 1);
    await savePresidentsReqs(reqs);
    renderAdminPresidentsReqs();
  }
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
  var defs = await getBadgeDefs();
  var cats = [];
  defs.forEach(function(b) {
    if (cats.indexOf(b.cat) === -1) cats.push(b.cat);
  });
  var container = document.getElementById('admin-badges-content') || document.getElementById('admin-badge-defs-list');
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

          return '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;">'
            + imgThumb
            + '<div style="flex:1;min-width:140px;"><span style="font-size:13px;color:var(--text-primary);font-weight:600;">' + (typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name) + '</span>' + advLabel + repLabel + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
            + '<label style="background:var(--bg-input);border:1px solid var(--border-card);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--text-secondary);cursor:pointer;">'
              + '<input type="file" accept="image/*" data-img-badge="' + b.id + '" style="display:none;"/>Upload img'
            + '</label>'
            + (safeBadgeImg ? '<button data-clear-img="' + b.id + '" style="background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;padding:2px 4px;">Clear img</button>' : '')
            + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);cursor:pointer;">'
              + '<input type="checkbox" data-toggle-rep="' + b.id + '" ' + (b.repeatable ? 'checked' : '') + ' style="accent-color:var(--accent);"/>Repeatable'
            + '</label>'
            + '<select data-tier-sel="' + b.id + '" style="background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-card);border-radius:7px;padding:4px 6px;font-size:11px;cursor:pointer;">'
              + '<option value="none" '  + (tierMode === 'none'  ? 'selected' : '') + '>No levels</option>'
              + '<option value="basic" ' + (tierMode === 'basic' ? 'selected' : '') + '>Basic only</option>'
              + '<option value="both" '  + (tierMode === 'both'  ? 'selected' : '') + '>Basic + Adv</option>'
            + '</select>'
            + '<button data-del-badge="' + b.id + '" style="background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;padding:2px 6px;">×</button>'
            + '</div>'
            + '</div>';
        }).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:6px 0;">No badges yet — add one below.</div>';

    html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:12px;border:1px solid var(--border-card);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
        + '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--brand-gold);">' + (typeof escapeHtml === 'function' ? escapeHtml(cat) : cat) + '</div>'
        + '<button data-del-cat="' + cat + '" style="background:#3a1a1a;border:1px solid #6a2a2a;color:#f66;padding:4px 12px;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;">Delete section</button>'
      + '</div>' + rows
      + '<div style="display:flex;gap:8px;margin-top:10px;">'
        + '<input type="text" id="' + inputKey + '" placeholder="New badge name..." style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;"/>'
        + '<button data-add-badge="' + cat + '" style="background:rgba(200,150,30,0.15);border:1px solid rgba(200,150,30,0.35);color:var(--brand-gold);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;">+ Add</button>'
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
      var id = input.getAttribute('data-img-badge');
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
      var id = btn.getAttribute('data-clear-img');
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
      var id = chk.getAttribute('data-toggle-rep');
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
      var id = sel.getAttribute('data-tier-sel');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (badge) {
        var val = sel.value;
        badge.tier = val;
        badge.hasAdvanced = (val === 'both');
        await saveBadgeDefs(currentDefs);
        renderAdminBadges();
      }
    });
  });

  container.querySelectorAll('[data-del-cat]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var cat = btn.getAttribute('data-del-cat');
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Delete the "' + cat + '" section and all its badges?')
        : true;
      if (!ok) return;
      await deleteBadgeSection(cat);
      if (typeof showToast === 'function') {
        showToast('Section "' + cat + '" and its badges deleted permanently.', 'success');
      }
      renderAdminBadges();
    });
  });

  container.querySelectorAll('[data-del-badge]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var id = btn.getAttribute('data-del-badge');
      var currentDefs = await getBadgeDefs();
      var badge = currentDefs.find(function(b) { return b.id === id; });
      if (!badge) return;
      var ok = (typeof showConfirmModal === 'function')
        ? await showConfirmModal('Delete badge "' + badge.name + '"?')
        : true;
      if (!ok) return;
      await deleteBadgeDef(id);
      if (typeof showToast === 'function') {
        showToast('Badge "' + badge.name + '" deleted permanently.', 'success');
      }
      renderAdminBadges();
    });
  });

  container.querySelectorAll('[data-add-badge]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var cat = btn.getAttribute('data-add-badge');
      var key = 'nb_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
      var input = document.getElementById(key);
      var name = input ? input.value.trim() : '';
      if (!name) {
        if (typeof showToast === 'function') showToast('Please enter a badge name.', 'warning');
        return;
      }
      await unrecordBadgeDeletion(name);
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
      var name = input ? input.value.trim() : '';
      if (!name) {
        if (typeof showToast === 'function') showToast('Please enter a section name.', 'warning');
        return;
      }
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
  window.evaluatePresidentsCriteria = evaluatePresidentsCriteria;
  window.getBadgeGroup              = getBadgeGroup;
  window.BADGE_GROUP_MAP            = BADGE_GROUP_MAP;
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
  window.enrichBadgeCatalog         = enrichBadgeCatalog;
  window.deleteBadgeDef             = deleteBadgeDef;
  window.deleteBadgeSection         = deleteBadgeSection;
  window.getDeletedBadges           = getDeletedBadges;
  window.saveDeletedBadges          = saveDeletedBadges;
  window.recordBadgeDeletion        = recordBadgeDeletion;
  window.unrecordBadgeDeletion      = unrecordBadgeDeletion;
  window.isBadgeDeleted             = isBadgeDeleted;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_BB_BADGES,
    DEFAULT_PRESIDENTS_REQS,
    DEFAULT_FOUNDERS_REQS,
    BADGE_GROUP_MAP,
    PRESIDENTS_REQS,
    _badgeDefsCache,
    _memberBadgesCache,
    _deletedBadgesCache,
    checkBadgesAccess,
    getBadgeDefs,
    saveBadgeDefs,
    getPresidentsReqs,
    savePresidentsReqs,
    upsertMemberBadges,
    evaluateFoundersCriteria,
    evaluatePresidentsCriteria,
    getBadgeGroup,
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
    filterBadgesByCategory,
    enrichBadgeCatalog,
    deleteBadgeDef,
    deleteBadgeSection,
    getDeletedBadges,
    saveDeletedBadges,
    recordBadgeDeletion,
    unrecordBadgeDeletion,
    isBadgeDeleted
  };
}
