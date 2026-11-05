/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Master Attendance & Points Breakdown Module (TSK-007)
 *
 * Connects the Company Master Sheet to the Portal:
 *   1. Reads synced attendance %, uniform inspection points, and platoon scores
 *   2. Displays a personalized performance breakdown card in the Member Tab
 *   3. Shows live Platoon Leaderboard standings and contribution metrics
 */

var MASTER_ATTENDANCE_KEY = 'bb_master_attendance';
var MASTER_ATTENDANCE_CACHE_TTL = 10 * 1000; // 10-second cache TTL for responsive real-time updates
var _masterAttendanceCache = null;
var _masterAttendanceCacheTime = 0;

// ── TSK-057: Confidential Attendance Achievement Tiers Helper ────────────────
var _getTierFn = (typeof window !== 'undefined' && typeof window.getAttendanceAchievementTier === 'function')
  ? window.getAttendanceAchievementTier
  : function(percentage) {
      if (typeof window !== 'undefined' && typeof window.getAttendanceAchievementTier === 'function') {
        return window.getAttendanceAchievementTier(percentage);
      }
      var pct = (percentage !== null && percentage !== undefined && percentage !== '') ? parseFloat(percentage) : NaN;
      if (isNaN(pct)) {
        return {
          tier: 'none',
          label: 'No Data',
          badgeLabel: 'No Data',
          qualifiesForOneYearService: false,
          color: 'var(--text-muted)',
          bg: 'var(--surface-tint)',
          border: 'var(--border-subtle)',
          description: 'Attendance records not yet available for this term.',
          tooltipText: 'Official BB Rule: Minimum 80% attendance is required to qualify for the BB One Year Service award and badge advancement.'
        };
      }
      pct = Math.round(pct);
      if (pct >= 100) {
        return {
          tier: 'perfect',
          label: 'Perfect',
          badgeLabel: '100% (Perfect)',
          qualifiesForOneYearService: true,
          color: 'var(--brand-gold, #f5c542)',
          bg: 'rgba(245,197,66,0.14)',
          border: 'rgba(245,197,66,0.35)',
          description: 'Full 100% company parade commitment.',
          tooltipText: 'Perfect Attendance (100%): Fully qualifies for the BB One Year Service award and senior badge advancement. Official minimum threshold is 80%.'
        };
      }
      if (pct >= 90) {
        return {
          tier: 'excellent',
          label: 'Excellent',
          badgeLabel: '≥90% (Excellent)',
          qualifiesForOneYearService: true,
          color: 'var(--green, #10b981)',
          bg: 'rgba(16,185,129,0.14)',
          border: 'rgba(16,185,129,0.35)',
          description: 'Exceptional parade attendance and engagement.',
          tooltipText: 'Excellent Attendance (≥90%): Exceeds the official 80% minimum threshold required to qualify for the BB One Year Service award and badge advancement.'
        };
      }
      if (pct >= 80) {
        return {
          tier: 'good',
          label: 'Good',
          badgeLabel: '≥80% (Good)',
          qualifiesForOneYearService: true,
          color: 'var(--blue, #3b82f6)',
          bg: 'rgba(59,130,246,0.14)',
          border: 'rgba(59,130,246,0.35)',
          description: 'Meets the company attendance standard.',
          tooltipText: 'Good Attendance (≥80%): Meets the official 80% minimum threshold required to qualify for the BB One Year Service award and badge advancement.'
        };
      }
      return {
        tier: 'at_risk',
        label: 'At Risk',
        badgeLabel: '<80% (At Risk)',
        qualifiesForOneYearService: false,
        color: 'var(--orange, #f59e0b)',
        bg: 'rgba(245,158,11,0.14)',
        border: 'rgba(245,158,11,0.35)',
        description: 'Currently below the 80% One Year Service threshold.',
        tooltipText: 'At Risk (<80%): Currently below the official 80% minimum attendance threshold required to qualify for the BB One Year Service award and badge advancement. Attend upcoming parades to improve standing.'
      };
    };


// ── Data Ingestion & Caching ────────────────────────────────────────────────

/**
 * Normalizes member name for resilient matching (case-insensitive, trims spaces, removes punctuation)
 * @param {string} name
 * @returns {string}
 */
function normalizeMemberName(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Loads master attendance data from Supabase bb_config with local caching
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<Object|null>}
 */
async function getMasterAttendanceData(forceRefresh) {
  var now = Date.now();
  if (!forceRefresh && _masterAttendanceCache && (now - _masterAttendanceCacheTime < MASTER_ATTENDANCE_CACHE_TTL)) {
    return _masterAttendanceCache;
  }

  // Check sessionStorage cache with TTL
  if (!forceRefresh && typeof sessionStorage !== 'undefined') {
    try {
      var cachedStr = sessionStorage.getItem('bb_master_att_cache');
      var cachedTimeStr = sessionStorage.getItem('bb_master_att_cache_time');
      var cachedTime = cachedTimeStr ? parseInt(cachedTimeStr, 10) : 0;
      if (cachedStr && (now - cachedTime < MASTER_ATTENDANCE_CACHE_TTL)) {
        _masterAttendanceCache = JSON.parse(cachedStr);
        _masterAttendanceCacheTime = cachedTime;
        return _masterAttendanceCache;
      }
    } catch (e) {}
  }

  var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
  if (!client) return null;

  try {
    var rows = await client.get('bb_config?key=eq.' + MASTER_ATTENDANCE_KEY + '&select=value');
    if (rows && rows.length && rows[0].value) {
      var parsed = JSON.parse(rows[0].value);
      if (typeof window !== 'undefined' && typeof window.sanitizeMasterAttendancePayload === 'function') {
        parsed = window.sanitizeMasterAttendancePayload(parsed);
      }
      _masterAttendanceCache = parsed;
      _masterAttendanceCacheTime = now;
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem('bb_master_att_cache', JSON.stringify(parsed));
          sessionStorage.setItem('bb_master_att_cache_time', String(now));
        } catch (e2) {}
      }
      return parsed;
    }
  } catch (err) {
    console.warn('getMasterAttendanceData error:', err);
  }

  return null;
}

/**
 * Retrieves the attendance & performance record for a specific member by Name
 * @param {string} memberName
 * @returns {Promise<Object|null>}
 */
async function getMemberAttendanceRecord(memberName) {
  if (!memberName) return null;

  // Security & Privacy Protection:
  // Jeshua Koh attendance and points belong exclusively to verified portal creator account (jeshuakoh2008@gmail.com)
  var norm = normalizeMemberName(memberName);
  if (norm === 'jeshuakoh') {
    var sessEmail = (typeof sessionGet === 'function') ? String(sessionGet('email') || sessionGet('ic') || '').trim().toLowerCase() : '';
    if (sessEmail && sessEmail !== 'jeshuakoh2008@gmail.com') {
      return null;
    }
  }

  var data = await getMasterAttendanceData();
  if (!data || !data.members) return null;

  if (data.members[norm]) {
    return data.members[norm];
  }

  // Filter out noise/test words so dummy or spoof accounts never bind to real member records
  var noiseWords = ['tester', 'test', 'demo', 'admin', 'fake', 'dummy'];
  var normTokens = norm.split(' ').filter(function(t) { return t.length >= 2; });
  var hasNoise = normTokens.some(function(t) { return noiseWords.includes(t); });
  if (hasNoise) {
    return null;
  }

  // Secondary intelligent match using token-subset matching
  var keys = Object.keys(data.members);
  var matchFn = (typeof isNameMatch === 'function')
    ? isNameMatch
    : (typeof window !== 'undefined' && typeof window.isNameMatch === 'function' ? window.isNameMatch : null);

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (matchFn && matchFn(memberName, k)) {
      return data.members[k];
    }
  }

  return null;
}

// ── Member Tab UI: Performance & Points Breakdown Card ──────────────────────

/**
 * Main renderer: Renders the personalized attendance & points breakdown card
 * inside the Member profile tab (#member-attendance-card).
 * @param {string} [memberName]
 */
async function loadMemberAttendanceStats(memberName) {
  var container = document.getElementById('member-attendance-card');
  if (!container) return;

  var currentSection = (typeof sessionGet === 'function') ? (sessionGet('section') || sessionGet('att_section')) : '';
  var currentRank = (typeof sessionGet === 'function') ? sessionGet('rank') : '';
  var isOfficer = false;
  if (currentSection && String(currentSection).toLowerCase() === 'officer') isOfficer = true;
  if (currentRank && ['Officer', 'Lieutenant', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Chaplain', 'Warrant Officer', 'Instructor'].includes(currentRank)) isOfficer = true;

  if (isOfficer) {
    container.innerHTML = 
      '<div class="att-empty-state" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;">' +
        '<div style="font-size:32px;margin-bottom:8px;">🎖️</div>' +
        '<div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">Officer Record</div>' +
        '<div style="font-size:13px;color:var(--text-muted);max-width:380px;margin:0 auto;">Officers serve in supervisory appointments and do not compete on Company Squad Leaderboards or receive squad attendance points.</div>' +
      '</div>';
    return;
  }

  var name = memberName;
  if (!name && typeof sessionGet === 'function') {
    name = sessionGet('name') || sessionGet('fullname');
  }

  // Show skeleton loading state (Pattern B)
  container.innerHTML = 
    '<div class="skeleton-shimmer" style="height:210px;border-radius:12px;padding:20px;box-sizing:border-box;" aria-hidden="true">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:16px;">' +
        '<div class="skeleton-shimmer skeleton-line medium" style="height:16px;margin:0;"></div>' +
        '<div class="skeleton-shimmer skeleton-pill" style="width:60px;height:24px;"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
        '<div class="skeleton-shimmer" style="height:65px;border-radius:8px;"></div>' +
        '<div class="skeleton-shimmer" style="height:65px;border-radius:8px;"></div>' +
      '</div>' +
      '<div class="skeleton-shimmer skeleton-line full" style="height:14px;margin:0;"></div>' +
    '</div>';

  var data = await getMasterAttendanceData();
  var record = await getMemberAttendanceRecord(name);
  var platoons = (data && data.platoons) ? data.platoons : {};
  var squads   = (data && data.squads) ? data.squads : {};

  if (!record) {
    // Clean Empty State when not yet synced or member not found
    container.innerHTML = renderEmptyAttendanceState(name, data ? data.lastSynced : null);
    return;
  }

  // Member found — Render full breakdown
  container.innerHTML = renderAttendanceBreakdownHTML(record, platoons, squads, data ? data.lastSynced : null);
}

/**
 * HTML Builder for the populated member attendance & points breakdown
 */
function renderAttendanceBreakdownHTML(rec, platoons, squads, lastSynced) {
  var parade = rec.paradeAttendance || { percentage: 0, presentCount: 0, totalParades: 0 };
  var band   = rec.bandAttendance   || { percentage: 0, presentCount: 0, totalSessions: 0 };
  var points = rec.points           || { uniform: 0, uniformAvg: 0, paradeAtt: 0, bandAtt: 0, total: 0 };
  var pltName = rec.platoon || 'Alpha';
  var isHotel = (pltName.toLowerCase().indexOf('hotel') !== -1);
  var pltInfo = (platoons && platoons[pltName]) ? platoons[pltName] : null;

  // Determine if member is a Band Member
  var isBandMember = rec.isBandMember || 
                     (rec.bandSection && rec.bandSection.length > 0) || 
                     (band.percentage > 0) || 
                     (points.bandAtt > 0);

  // Match squad standing
  var sqName = rec.squad || '';
  var sqInfo = null;
  if (squads && sqName) {
    sqInfo = squads[sqName] || squads[sqName.toUpperCase()];
    if (!sqInfo) {
      var normSq = sqName.toLowerCase().replace(/[^a-z0-9]/g, '');
      Object.keys(squads).forEach(function(k) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === normSq) sqInfo = squads[k];
      });
    }
  }

  // TSK-057: Confidential Attendance Achievement Tiers
  var pTier = _getTierFn(parade.percentage);
  var bTier = isBandMember ? _getTierFn(band.percentage) : null;

  var syncTimeStr = 'Updated recently';
  if (lastSynced) {
    try {
      var d = new Date(lastSynced);
      syncTimeStr = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch(e) {}
  }


  // Uniform avg string
  var uniformAvgHtml = '';
  if (points.uniformAvg !== undefined && points.uniformAvg !== null && !isNaN(points.uniformAvg) && points.uniformAvg > 0) {
    uniformAvgHtml = '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Avg ' + points.uniformAvg + ' / 6</div>';
  } else if (points.paradeAtt > 0 && points.uniform > 0) {
    var est = Math.round((points.uniform / (points.paradeAtt / 2)) * 10) / 10;
    if (est > 0 && est <= 6) {
      uniformAvgHtml = '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Avg ' + est + ' / 6</div>';
    }
  }

  // Platoon / Squad Standing Card HTML
  var standingCardHtml = '';
  if (isHotel) {
    standingCardHtml = 
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:14px;margin-bottom:6px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">' +
            '<svg class="ui-icon-sm" style="color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
            'HQ NCOs (Hotel)' +
          '</div>' +
          '<span style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">Non-competing</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' +
          'Total individual performance: <strong>' + points.total + ' pts</strong>. Hotel Platoon (HQ NCOs) is non-competing on the company squad leaderboard.' +
        '</div>' +
      '</div>';
  } else {
    var titleText = sqInfo ? ('Squad ' + escapeAttHtml(sqInfo.name) + ' Standing') : (escapeAttHtml(pltName) + ' Platoon Standing');
    var rankText  = sqInfo ? ('Rank #' + escapeAttHtml(sqInfo.rank) + ' (' + escapeAttHtml(sqInfo.points) + ' Points)') : (pltInfo ? ('Rank #' + escapeAttHtml(pltInfo.rank) + ' (' + escapeAttHtml(pltInfo.averagePoints || pltInfo.totalPoints || 0) + ' Points)') : '');
    
    standingCardHtml = 
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:14px;margin-bottom:6px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">' +
            '<svg class="ui-icon-sm" style="color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
            titleText +
          '</div>' +
          '<div style="font-family:var(--font-headline);font-size:12px;font-weight:700;color:var(--accent);">' +
            rankText +
          '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' +
          'Your contribution: <strong>' + escapeAttHtml(points.total) + ' pts</strong> towards ' + (sqInfo ? ('Squad ' + escapeAttHtml(sqInfo.name)) : (escapeAttHtml(pltName) + ' Platoon')) + ' in the Senior Section Leaderboard.' +
        '</div>' +
        (pltInfo && pltInfo.averagePoints ? (
          '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;font-size:11px;">' +
            '<span style="color:var(--text-secondary);">' + escapeAttHtml(pltName) + ' Platoon Average:</span>' +
            '<span style="font-family:var(--font-headline);font-weight:700;color:var(--accent);">' + pltInfo.averagePoints + ' Points</span>' +
          '</div>'
        ) : '') +
      '</div>';
  }

  return (
    '<!-- Header -->' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
      '<div>' +
        '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
          '<svg class="ui-icon" style="color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          'Attendance &amp; Points' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);letter-spacing:0.5px;">Master Sheet Sync &middot; ' + escapeAttHtml(syncTimeStr) + '</div>' +
      '</div>' +
      '<button onclick="refreshMemberAttendanceStats()" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:5px 12px;border-radius:8px;cursor:pointer;font-family:var(--font-headline);font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;">' +
        '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
        'Refresh' +
      '</button>' +
    '</div>' +

    '<!-- 1. Hero Attendance Rate Cards (TSK-057: Confidential Achievement Tiers) -->' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:14px;">' +
      '<!-- Parade Attendance -->' +
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:12px 14px;position:relative;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
          '<span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Parade Attendance</span>' +
          '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;background:' + pTier.bg + ';color:' + pTier.color + ';border:1px solid ' + pTier.border + ';cursor:help;" title="' + escapeAttHtml(pTier.tooltipText) + '">80% Req. ℹ️</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">' +
          '<span style="font-family:var(--font-headline);font-size:22px;font-weight:700;color:' + pTier.color + ';">' + escapeAttHtml(pTier.label) + '</span>' +
          '<span class="att-tier-pill tier-' + pTier.tier.replace('_', '-') + '" title="' + escapeAttHtml(pTier.tooltipText) + '" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:' + pTier.bg + ';color:' + pTier.color + ';border:1px solid ' + pTier.border + ';cursor:help;" aria-label="Attendance tier: ' + escapeAttHtml(pTier.label) + '">' + (pTier.qualifiesForOneYearService ? 'One Year Service Qualified' : 'One Year Service Pending') + '</span>' +
        '</div>' +
        '<div style="margin-top:8px;height:5px;background:var(--surface-track);border-radius:3px;overflow:hidden;" title="' + escapeAttHtml(pTier.tooltipText) + '">' +
          '<div style="height:100%;width:' + Math.min(100, Math.max(0, parade.percentage || 0)) + '%;background:' + pTier.color + ';border-radius:3px;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10.5px;color:var(--text-muted);line-height:1.4;">' +
          '<span>' + escapeAttHtml(pTier.description) + '</span>' +
          '<span style="color:' + (pTier.qualifiesForOneYearService ? 'var(--green, #10b981)' : 'var(--text-secondary)') + ';font-weight:600;cursor:help;" title="' + escapeAttHtml(pTier.tooltipText) + '">One Year Service ' + (pTier.qualifiesForOneYearService ? '&check;' : '&bull;') + '</span>' +
        '</div>' +
      '</div>' +

      '<!-- Band Attendance -->' +
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:12px 14px;position:relative;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
          '<span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Band Attendance</span>' +
          (isBandMember ? ('<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;background:' + bTier.bg + ';color:' + bTier.color + ';border:1px solid ' + bTier.border + ';cursor:help;" title="' + escapeAttHtml(bTier.tooltipText) + '">80% Req. ℹ️</span>') : '') +
        '</div>' +
        (isBandMember ? (
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">' +
            '<span style="font-family:var(--font-headline);font-size:22px;font-weight:700;color:' + bTier.color + ';">' + escapeAttHtml(bTier.label) + '</span>' +
          '</div>' +
          '<div style="margin-top:8px;height:5px;background:var(--surface-track);border-radius:3px;overflow:hidden;" title="' + escapeAttHtml(bTier.tooltipText) + '">' +
            '<div style="height:100%;width:' + Math.min(100, Math.max(0, band.percentage || 0)) + '%;background:' + bTier.color + ';border-radius:3px;"></div>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10.5px;color:var(--text-muted);line-height:1.4;">' +
            '<span>' + escapeAttHtml(bTier.description) + '</span>' +
            '<span style="color:' + (bTier.qualifiesForOneYearService ? 'var(--green, #10b981)' : 'var(--text-secondary)') + ';font-weight:600;cursor:help;" title="' + escapeAttHtml(bTier.tooltipText) + '">One Year Service ' + (bTier.qualifiesForOneYearService ? '&check;' : '&bull;') + '</span>' +
          '</div>'
        ) : (
          '<div style="display:flex;align-items:baseline;gap:6px;">' +
            '<span style="font-family:var(--font-headline);font-size:22px;font-weight:700;color:var(--text-muted);">Non-Band</span>' +
            '<span style="font-size:11px;color:var(--text-muted);">(N/A)</span>' +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--text-muted);margin-top:10px;">Not enrolled in Company Band.</div>'
        )) +
      '</div>' +
    '</div>' +

    '<!-- 2. Performance Points Breakdown Grid -->' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:14px;margin-bottom:14px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<span style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;text-transform:uppercase;">Points Breakdown</span>' +
        '<span style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--accent);background:rgba(200,150,30,0.12);border:1px solid rgba(200,150,30,0.3);padding:2px 10px;border-radius:20px;">' +
          points.total + ' Total Points' +
        '</span>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(105px, 1fr));gap:8px;">' +
        '<!-- Uniform Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Uniform Points</div>' +
          '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--blue, #3b82f6);">' + points.uniform + '</div>' + uniformAvgHtml +
        '</div>' +

        '<!-- Parade Attendance Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Parade Points</div>' +
          '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--green, #10b981);">' + points.paradeAtt + '</div>' +
        '</div>' +

        '<!-- Band Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Band Points</div>' +
          '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--accent);">' + points.bandAtt + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- 3. Platoon / Squad Standing -->' +
    standingCardHtml
  );
}

/**
 * Clean Empty State when member data has not yet synced from the Google Sheet
 */
function renderEmptyAttendanceState(name, lastSynced) {
  var syncText = lastSynced ? 'Last sheet sync: ' + new Date(lastSynced).toLocaleDateString() : 'Sheet sync pending';
  return (
    '<div style="padding:22px 18px;text-align:center;">' +
      '<div style="margin:0 auto 12px;width:50px;height:50px;border-radius:50%;background:rgba(217,163,35,0.12);display:flex;align-items:center;justify-content:center;color:var(--accent);border:1px solid rgba(217,163,35,0.3);">' +
        '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '</div>' +
      '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' +
        'Not Registered in Master Attendance Sheet' +
      '</div>' +
      '<div style="font-size:12.5px;color:var(--text-secondary);max-width:420px;margin:0 auto 14px;line-height:1.6;">' +
        'Welcome, <strong>' + escapeAttHtml(name || 'Member') + '</strong>. Your portal account is active, but your member name is not registered in the Company Master Attendance Sheet. Your parade attendance and squad points will sync automatically once an officer adds your name to your platoon roster in the Master Sheet.' +
      '</div>' +
      '<div style="display:inline-flex;gap:8px;align-items:center;">' +
        '<button onclick="refreshMemberAttendanceStats()" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:7px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-headline);font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          'Check Sheet Again' +
        '</button>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-top:10px;">' + syncText + '</div>' +
    '</div>'
  );
}

/**
 * Interactive helper: Triggers a fresh reload of attendance stats
 */
async function refreshMemberAttendanceStats() {
  _masterAttendanceCache = null;
  _masterAttendanceCacheTime = 0;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem('bb_master_att_cache');
      sessionStorage.removeItem('bb_master_att_cache_time');
    } catch (e) {}
  }
  await loadMemberAttendanceStats();
}

// ── Admin Subtab: Master Sheet Ingestion Management ─────────────────────────

/**
 * Renders the Master Sheet status, live sync trigger, and copyable Apps Script
 * in Admin Console > Attendance & Master Sheet.
 */
async function renderAdminMasterSheetPanel() {
  var container = document.getElementById('adm-master-sheet-panel');
  if (!container) return;

  var data = await getMasterAttendanceData(true);
  var _cfg = (typeof window.loadMasterSheetConfig === 'function') ? await window.loadMasterSheetConfig() : {};

  var memberCount = data && data.totalMembers ? data.totalMembers : (data && data.members ? Object.keys(data.members).length : 0);
  var syncDate = data && data.lastSynced ? new Date(data.lastSynced).toLocaleString() : 'Never synced';
  var sheetName = data && data.sheetTitle ? data.sheetTitle : 'Google Master Sheet';

  var rawSquads = (data && data.squads) ? data.squads : null;
  var squadList = [];
  if (rawSquads && Object.keys(rawSquads).length > 0) {
    Object.keys(rawSquads).forEach(function(k) {
      if (k.toLowerCase().indexOf('hotel') === -1) {
        squadList.push(rawSquads[k]);
      }
    });
  } else {
    squadList = [
      { name: 'PAPA 1',  points: 161, rank: 1, platoon: 'Papa' },
      { name: 'PAPA 2',  points: 161, rank: 1, platoon: 'Papa' },
      { name: 'ZULU 1',  points: 160, rank: 3, platoon: 'Zulu' },
      { name: 'ALPHA 2', points: 155, rank: 4, platoon: 'Alpha' },
      { name: 'ALPHA 1', points: 149, rank: 5, platoon: 'Alpha' },
      { name: 'ZULU 2',  points: 144, rank: 6, platoon: 'Zulu' }
    ];
  }

  squadList.sort(function(a, b) {
    return (b.points || 0) - (a.points || 0);
  });

  var curRank = 1;
  for (var i = 0; i < squadList.length; i++) {
    if (i > 0 && squadList[i].points < squadList[i - 1].points) {
      curRank = i + 1;
    }
    squadList[i].displayRank = curRank;
  }

  function getPlatoonStyle(sqName) {
    var upper = String(sqName || '').toUpperCase();
    if (upper.indexOf('ALPHA') !== -1) return { color: 'var(--brand-gold, #f5c542)', plt: 'Alpha' };
    if (upper.indexOf('PAPA')  !== -1) return { color: 'var(--blue, #3b82f6)',       plt: 'Papa' };
    if (upper.indexOf('ZULU')  !== -1) return { color: 'var(--green, #10b981)',      plt: 'Zulu' };
    return { color: 'var(--accent)', plt: 'Squad' };
  }

  // Calculate platoon averages (excluding Hotel)
  var pltSums = {};
  squadList.forEach(function(sq) {
    var p = getPlatoonStyle(sq.name).plt;
    if (!pltSums[p]) pltSums[p] = { sum: 0, count: 0 };
    pltSums[p].sum += (sq.points || 0);
    pltSums[p].count += 1;
  });

  var pltAverages = Object.keys(pltSums).map(function(p) {
    return { name: p, avg: Math.round(pltSums[p].sum / (pltSums[p].count || 1)) };
  }).sort(function(a, b) { return b.avg - a.avg; });

  var cfg = { sheetId: '', scriptUrl: '', syncToken: '' };
  var loadConfigFn = (typeof window !== 'undefined' && typeof window.loadMasterSheetConfig === 'function')
    ? window.loadMasterSheetConfig
    : ((typeof global !== 'undefined' && typeof global.loadMasterSheetConfig === 'function') ? global.loadMasterSheetConfig : null);
  if (loadConfigFn) {
    try { cfg = await loadConfigFn(); } catch (eCfg) {}
  }

  var supaUrl = (typeof SUPA_URL !== 'undefined') ? SUPA_URL : (typeof window.SUPA_URL !== 'undefined' ? window.SUPA_URL : 'YOUR_SUPABASE_PROJECT_URL');
  var supaKey = (typeof SUPA_KEY !== 'undefined') ? SUPA_KEY : (typeof window.SUPA_KEY !== 'undefined' ? window.SUPA_KEY : 'YOUR_SUPABASE_ANON_KEY');
  var getTemplateFn = (typeof window !== 'undefined' && typeof window.getGoogleAppsScriptTemplate === 'function') ? window.getGoogleAppsScriptTemplate : null;
  var scriptCode = getTemplateFn 
    ? getTemplateFn(supaUrl, supaKey, cfg.syncToken) 
    : '// Copy from js/api/sheets.js';

  container.innerHTML =
    '<!-- Sync Status Card -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow-card);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:38px;height:38px;border-radius:50%;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:var(--green);display:flex;align-items:center;justify-content:center;">' +
            '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);">' + escapeAttHtml(sheetName) + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">Last Synced: ' + escapeAttHtml(syncDate) + '</div>' +
          '</div>' +
        '</div>' +
        '<button onclick="triggerMasterSheetFetch()" id="btn-adm-sync-sheet" style="background:var(--accent);color:#fff;border:none;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-headline);font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          'Sync Now' +
        '</button>' +
      '</div>' +

      '<!-- Squad Standings Summary -->' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' +
        'Squad Leader Board (' + memberCount + ' Synced Members)' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:8px;margin-bottom:10px;">' +
        squadList.map(function(sq) {
          var st = getPlatoonStyle(sq.name);
          return (
            '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:8px 10px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-size:12px;font-weight:700;color:var(--text-primary);">' + escapeAttHtml(sq.name) + '</span>' +
                '<span style="font-size:10px;font-weight:700;color:var(--accent);">#' + (sq.displayRank || sq.rank || '-') + '</span>' +
              '</div>' +
              '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:' + st.color + ';margin-top:2px;">' +
                (sq.points || 0) + ' Points' +
              '</div>' +
              '<div style="font-size:10px;color:var(--text-muted);">' + escapeAttHtml(st.plt) + ' Platoon</div>' +
            '</div>'
          );
        }).join('') +
      '</div>' +

      '<!-- Platoon Averages Summary -->' +
      '<div style="display:flex;gap:12px;align-items:center;background:var(--bg-card-subtle);border:1px solid var(--border-card);padding:8px 12px;border-radius:6px;font-size:11px;color:var(--text-secondary);margin-bottom:2px;flex-wrap:wrap;">' +
        '<strong style="color:var(--text-primary);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Platoon Averages:</strong>' +
        pltAverages.map(function(pa) {
          var st = getPlatoonStyle(pa.name);
          return '<span>' + escapeAttHtml(pa.name) + ': <strong style="color:' + st.color + ';">' + pa.avg + ' pts</strong></span>';
        }).join('<span style="color:var(--text-muted);">&bull;</span>') +
      '</div>' +
    '</div>' +

    '<!-- Master Sheet Security & Endpoint Hardening (TSK-038) -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow-card);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
        '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
          'Endpoint Security &amp; Master Sheet Hardening' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<span style="font-size:10px;background:rgba(16,185,129,0.12);color:var(--green);border:1px solid rgba(16,185,129,0.3);padding:2px 8px;border-radius:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
            '<span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;"></span>' +
            'Zero-PII Whitelist' +
          '</span>' +
          '<span style="font-size:10px;background:rgba(197,155,39,0.12);color:var(--accent);border:1px solid rgba(197,155,39,0.3);padding:2px 8px;border-radius:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
            '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;"></span>' +
            'Token Auth Enforced' +
          '</span>' +
          '<span style="font-size:10px;background:rgba(59,130,246,0.12);color:var(--blue);border:1px solid rgba(59,130,246,0.3);padding:2px 8px;border-radius:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
            '<span style="width:6px;height:6px;border-radius:50%;background:var(--blue);display:inline-block;"></span>' +
            'Restricted Sharing' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">' +
        'To protect member privacy (PDPA / COPPA), the portal integration strips all sensitive PII (parent phone numbers, home addresses, IC numbers) and authenticates all sync requests with a shared-secret proxy token.' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
        '<div>' +
          '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-primary);margin-bottom:4px;" for="master-script-url-input">Google Apps Script Web App URL</label>' +
          '<input type="text" id="master-script-url-input" class="form-input" placeholder="https://script.google.com/macros/s/.../exec" value="' + escapeAttHtml(cfg.scriptUrl || '') + '" style="font-size:12px;padding:7px 10px;width:100%;box-sizing:border-box;" />' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-primary);margin-bottom:4px;" for="master-sheet-id-input">Google Master Sheet ID (Optional)</label>' +
          '<input type="text" id="master-sheet-id-input" class="form-input" placeholder="e.g. 1a2B3c4D5e6F7g..." value="' + escapeAttHtml(cfg.sheetId || '') + '" style="font-size:12px;padding:7px 10px;width:100%;box-sizing:border-box;" />' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:14px;">' +
        '<label style="display:block;font-size:11px;font-weight:700;color:var(--text-primary);margin-bottom:4px;" for="master-sync-token-input">Shared-Secret Proxy Sync Token (Protects against unauthorized scraping)</label>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<input type="text" id="master-sync-token-input" class="form-input" placeholder="bb_sec_..." value="' + escapeAttHtml(cfg.syncToken || '') + '" style="font-size:12px;padding:7px 10px;flex:1;font-family:monospace;box-sizing:border-box;" />' +
          '<button type="button" onclick="generateNewMasterSyncToken()" class="portal-btn portal-btn-secondary" style="padding:6px 12px;font-size:11px;white-space:nowrap;">Generate Token</button>' +
          '<button type="button" onclick="copyMasterSyncToken()" class="portal-btn portal-btn-secondary" style="padding:6px 12px;font-size:11px;white-space:nowrap;">Copy Token</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-top:10px;border-top:1px solid var(--border-card);">' +
        '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          'Ensure the Master Google Sheet is set to <strong>Restricted</strong> sharing (never "Anyone with link").' +
        '</div>' +
        '<button type="button" id="btn-save-master-config" onclick="handleSaveMasterConfig()" class="portal-btn portal-btn-primary" style="padding:7px 18px;font-size:12px;font-family:var(--font-headline);font-weight:700;">Save Configuration</button>' +
      '</div>' +
    '</div>' +
    '<!-- Configuration & Apps Script Instructions -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;box-shadow:var(--shadow-card);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
        '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
          'Google Apps Script Setup &amp; Background Auto-Sync' +
        '</div>' +
        '<span style="font-size:10px;background:rgba(16,185,129,0.12);color:var(--green);border:1px solid rgba(16,185,129,0.3);padding:2px 8px;border-radius:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;"></span>' +
          'Auto-Sync Capable' +
        '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">' +
        '1. Open your <strong>Master Attendance Google Sheet</strong>.<br>' +
        '2. Click <strong>Extensions &gt; Apps Script</strong>.<br>' +
        '3. Replace any existing code with the snippet below and click <strong>Save</strong> (disk icon).<br>' +
        '4. Reload your Google Sheet. Under the new <strong>BB Portal</strong> menu, click <strong>Enable Immediate Auto-Sync (On Edit &amp; Change)</strong> (approve Google authorization when prompted), or set a background trigger.<br>' +
        '5. The spreadsheet will automatically sync attendance and leaderboard scores to the portal in the background.' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">' +
        '<button onclick="copyAppsScriptSnippet()" id="btn-copy-gas" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          'Copy Code' +
        '</button>' +
      '</div>' +

      '<pre id="gas-snippet-pre" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:12px;font-size:11px;color:#66bb6a;font-family:monospace;max-height:220px;overflow-y:auto;white-space:pre-wrap;line-height:1.5;margin:0;">' +
        escapeAttHtml(scriptCode) +
      '</pre>' +
    '</div>';
}

function escapeAttHtml(str) {
  if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function' && window.escapeHtml !== escapeAttHtml) {
    return window.escapeHtml(str);
  }
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function copyAppsScriptSnippet() {
  var pre = document.getElementById('gas-snippet-pre');
  if (!pre) return;
  var codeText = pre.textContent || pre.innerText || '';

  var success = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(codeText);
      success = true;
    } catch (e) {}
  }

  if (!success) {
    try {
      var ta = document.createElement('textarea');
      ta.value = codeText;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      success = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) {}
  }

  var btn = document.getElementById('btn-copy-gas');
  if (success) {
    if (btn) {
      btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      setTimeout(function() {
        btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code';
      }, 2500);
    }
  } else {
    if (typeof showToast === 'function') showToast('Please select and copy the code manually from the box below.', 'warning');
  }
}

function generateNewMasterSyncToken() {
  var genFn = (typeof window !== 'undefined' && typeof window.generateSecureSyncToken === 'function') ? window.generateSecureSyncToken : null;
  if (genFn) {
    var newToken = genFn();
    var inp = document.getElementById('master-sync-token-input');
    if (inp) inp.value = newToken;
    if (typeof showToast === 'function') showToast('New secure sync token generated. Click Save Configuration to persist.', 'info');
  }
}

async function copyMasterSyncToken() {
  var inp = document.getElementById('master-sync-token-input');
  if (!inp || !inp.value) return;
  var token = inp.value;
  var success = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(token);
      success = true;
    } catch (e) {}
  }
  if (!success) {
    try {
      inp.select();
      success = document.execCommand('copy');
    } catch (e2) {}
  }
  if (typeof showToast === 'function') showToast('Sync token copied to clipboard!', 'success');
}

async function handleSaveMasterConfig() {
  var sid = ((document.getElementById('master-sheet-id-input') || {}).value || '').trim();
  var url = ((document.getElementById('master-script-url-input') || {}).value || '').trim();
  var tok = ((document.getElementById('master-sync-token-input') || {}).value || '').trim();

  var saveFn = (typeof window !== 'undefined' && typeof window.saveMasterSheetConfig === 'function') ? window.saveMasterSheetConfig : null;
  if (saveFn) {
    await saveFn({
      sheetId: sid,
      scriptUrl: url,
      syncToken: tok,
      autoSync: true,
      piiFiltered: true,
      lastUpdated: new Date().toISOString()
    });
    await renderAdminMasterSheetPanel();
  }
}

async function triggerMasterSheetFetch() {
  var btn = document.getElementById('btn-adm-sync-sheet');
  if (typeof setButtonLoading === 'function') {
    setButtonLoading(btn, true, 'Syncing...', 'Syncing Master Sheet data...');
  } else if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Syncing...';
  }

  try {
    if (typeof window.fetchMasterAttendanceFromGAS === 'function') {
      await window.fetchMasterAttendanceFromGAS();
    }
    _masterAttendanceCache = null;
    await renderAdminMasterSheetPanel();
    if (typeof showToast === 'function') {
      showToast('Master Sheet data synced successfully.', 'success');
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('Sync note: ' + err.message, 'warning');
    }
  } finally {
    if (typeof setButtonLoading === 'function') {
      setButtonLoading(btn, false);
    } else if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Sync Now';
    }
  }
}

// ── Minor Directory Privacy & Safe-Standings Helpers (TSK-040) ──────────────

/**
 * Toggles visibility of a squad member roster on the company leaderboard
 * @param {string} rosterId
 */
function toggleSquadRoster(rosterId) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById(rosterId);
  if (!el) return;
  var isExpanded = el.style.display === 'block';
  el.style.display = isExpanded ? 'none' : 'block';
  var btn = document.querySelector('[data-roster-btn="' + rosterId + '"]');
  if (btn) {
    btn.innerHTML = isExpanded 
      ? 'View Squad Members &darr;' 
      : 'Hide Squad Members &uarr;';
    btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
  }
}

// ── Company Leaderboard Renderer ───────────────────────────────────────────

/**
 * Renders the Company Platoon Leaderboard on page-attendance
 * Enforces surname masking and low attendance / demerit privacy protection (TSK-040).
 */
async function renderCompanyLeaderboard() {
  var c = document.getElementById('company-platoon-leaderboard');
  if (!c) return;

  var data = await getMasterAttendanceData();
  var rawSquads = (data && data.squads) ? data.squads : null;
  var _platoons = (data && data.platoons) ? data.platoons : {};

  // Viewer authorization context for privacy masking
  var viewerName = '';
  if (typeof sessionGet === 'function') {
    viewerName = (sessionGet('name') || '').trim();
  }

  // Build lookup of members who have registered an account (live Supabase fetch + local cache fallback)
  var registeredMembersList = [];
  try {
    var client = (typeof supa !== 'undefined' ? supa : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null));
    if (client && typeof client.get === 'function') {
      var dbMems = await client.get('bb_members?select=ic,email,name,rank,squad,section,att_section&order=name.asc');
      if (Array.isArray(dbMems) && dbMems.length > 0) {
        registeredMembersList = dbMems;
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('bb_members_cache', JSON.stringify(dbMems)); } catch (_) {}
        }
      }
    }
  } catch (memFetchErr) {
    console.warn('Leaderboard registered members fetch note:', memFetchErr);
  }

  if (registeredMembersList.length === 0 && typeof localStorage !== 'undefined') {
    try {
      var rawMems = localStorage.getItem('bb_members_cache') || localStorage.getItem('bb_all_members');
      if (rawMems) {
        var parsedCache = JSON.parse(rawMems);
        if (Array.isArray(parsedCache)) registeredMembersList = parsedCache;
      }
    } catch (_) {}
  }

  if (typeof window !== 'undefined' && Array.isArray(window._cachedDepartmentMembers)) {
    window._cachedDepartmentMembers.forEach(function(dm) {
      if (dm && !registeredMembersList.some(function(rm) { return (rm.ic && rm.ic === dm.ic) || (rm.email && rm.email === dm.email); })) {
        registeredMembersList.push(dm);
      }
    });
  }

  var registeredMembersMap = {};
  registeredMembersList.forEach(function(rm) {
    if (rm && rm.name) registeredMembersMap[rm.name.trim().toLowerCase()] = rm;
    if (rm && rm.ic) registeredMembersMap[String(rm.ic).trim().toLowerCase()] = rm;
    if (rm && rm.email) registeredMembersMap[String(rm.email).trim().toLowerCase()] = rm;
  });

  function findRegisteredMemberMatch(searchName, searchIc) {
    if (!searchName && !searchIc) return null;
    var sName = String(searchName || '').trim().toLowerCase();
    var sIc = String(searchIc || '').trim().toLowerCase();

    // 1. Exact lookup
    if (sIc && registeredMembersMap[sIc]) return registeredMembersMap[sIc];
    if (sName && registeredMembersMap[sName]) return registeredMembersMap[sName];

    // 2. Intelligent name match (e.g. Oliver Ling -> OLIVER LING CHEE SHENG)
    var matchFn = (typeof isNameMatch === 'function')
      ? isNameMatch
      : (typeof window !== 'undefined' && typeof window.isNameMatch === 'function'
          ? window.isNameMatch
          : (typeof global !== 'undefined' && typeof global.isNameMatch === 'function' ? global.isNameMatch : null));

    if (sName && matchFn) {
      for (var k = 0; k < registeredMembersList.length; k++) {
        var cand = registeredMembersList[k];
        if (cand && cand.name && matchFn(cand.name, sName)) {
          return cand;
        }
      }
    }
    return null;
  }

  // Standard competing squads fallback from master sheet
  var squadList = [];
  if (rawSquads && Object.keys(rawSquads).length > 0) {
    Object.keys(rawSquads).forEach(function(k) {
      if (k.toLowerCase().indexOf('hotel') === -1) {
        squadList.push(rawSquads[k]);
      }
    });
  } else {
    squadList = [
      { name: 'PAPA 1',  points: 161, rank: 1, platoon: 'Papa' },
      { name: 'PAPA 2',  points: 161, rank: 1, platoon: 'Papa' },
      { name: 'ZULU 1',  points: 160, rank: 3, platoon: 'Zulu' },
      { name: 'ALPHA 2', points: 155, rank: 4, platoon: 'Alpha' },
      { name: 'ALPHA 1', points: 149, rank: 5, platoon: 'Alpha' },
      { name: 'ZULU 2',  points: 144, rank: 6, platoon: 'Zulu' }
    ];
  }

  // Sort descending by points
  squadList.sort(function(a, b) {
    return (b.points || 0) - (a.points || 0);
  });

  // Calculate ranks handling ties
  var curRank = 1;
  for (var i = 0; i < squadList.length; i++) {
    if (i > 0 && squadList[i].points < squadList[i - 1].points) {
      curRank = i + 1;
    }
    squadList[i].displayRank = curRank;
  }

  var maxPts = squadList.length > 0 ? squadList[0].points : 161;
  if (!maxPts || maxPts <= 0) maxPts = 161;

  // Platoon styling colors
  function getPlatoonStyle(sqName) {
    var upper = String(sqName || '').toUpperCase();
    if (upper.indexOf('ALPHA') !== -1) return { plt: 'Alpha', color: 'var(--brand-gold, #f5c542)', bg: 'rgba(245,197,66,0.1)', border: 'rgba(245,197,66,0.3)' };
    if (upper.indexOf('PAPA')  !== -1) return { plt: 'Papa',  color: 'var(--blue, #3b82f6)',       bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)' };
    if (upper.indexOf('ZULU')  !== -1) return { plt: 'Zulu',  color: 'var(--green, #10b981)',      bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)' };
    return { plt: 'Squad', color: 'var(--accent)', bg: 'rgba(200,150,30,0.1)', border: 'rgba(200,150,30,0.3)' };
  }

    // Group synced members by squad
  var squadMembersMap = {};
  if (data && data.members && typeof data.members === 'object') {
    Object.keys(data.members).forEach(function(k) {
      var m = data.members[k];
      if (!m || !m.name) return;
      var sqKey = String(m.squad || '').toUpperCase().trim();
      if (!squadMembersMap[sqKey]) squadMembersMap[sqKey] = [];
      squadMembersMap[sqKey].push(m);
    });
  }

  // Baseline sample roster for demo / empty states
  var baselineRosters = {
    'PAPA 1': [
      { name: 'Jeshua Koh', rank: 'Sgt', points: { total: 55 }, paradeAttendance: { percentage: 92 } },
      { name: 'Jason Koh', rank: 'Cpl', points: { total: 54 }, paradeAttendance: { percentage: 88 } },
      { name: 'Samuel Tan', rank: 'L/Cpl', points: { total: 52 }, paradeAttendance: { percentage: 85 } }
    ],
    'PAPA 2': [
      { name: 'Ethan Lim', rank: 'Cpl', points: { total: 55 }, paradeAttendance: { percentage: 100 } },
      { name: 'Aaron Ng', rank: 'Pvt', points: { total: 54 }, paradeAttendance: { percentage: 84 } },
      { name: 'Lucas Wong', rank: 'Pvt', points: { total: 52 }, paradeAttendance: { percentage: 50 } }
    ],
    'ZULU 1': [
      { name: 'Benjamin Teoh', rank: 'Sgt', points: { total: 56 }, paradeAttendance: { percentage: 94 } },
      { name: 'Daniel Yap', rank: 'L/Cpl', points: { total: 53 }, paradeAttendance: { percentage: 86 } },
      { name: 'Ryan Tan', rank: 'Pvt', points: { total: 51 }, paradeAttendance: { percentage: 48 } }
    ],
    'ALPHA 2': [
      { name: 'David Choong', rank: 'Cpl', points: { total: 53 }, paradeAttendance: { percentage: 88 } },
      { name: 'Joshua Lee', rank: 'L/Cpl', points: { total: 52 }, paradeAttendance: { percentage: 82 } },
      { name: 'Kevin Ong', rank: 'Pvt', points: { total: 50 }, paradeAttendance: { percentage: 76 } }
    ],
    'ALPHA 1': [
      { name: 'Timothy Wong', rank: 'Sgt', points: { total: 52 }, paradeAttendance: { percentage: 85 } },
      { name: 'Marcus Chen', rank: 'Cpl', points: { total: 49 }, paradeAttendance: { percentage: 80 } },
      { name: 'Bryan Low', rank: 'Pvt', points: { total: 48 }, paradeAttendance: { percentage: 45 } }
    ],
    'ZULU 2': [
      { name: 'Jonathan Sim', rank: 'Cpl', points: { total: 50 }, paradeAttendance: { percentage: 82 } },
      { name: 'Nicholas Fong', rank: 'L/Cpl', points: { total: 48 }, paradeAttendance: { percentage: 78 } },
      { name: 'Justin Chew', rank: 'Pvt', points: { total: 46 }, paradeAttendance: { percentage: 55 } }
    ]
  };

  var html = '';

  // 2. Render Competing Squad Cards with Safe Member Rosters
  squadList.forEach(function(sq, sqIdx) {
    var st = getPlatoonStyle(sq.name);
    var pct = Math.min(100, Math.round(((sq.points || 0) / maxPts) * 100));
    var rankPill = sq.displayRank === 1
      ? 'background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-border);'
      : (sq.displayRank === 2
        ? 'background:var(--surface-tint);color:var(--text-primary);border:1px solid var(--border-subtle);'
        : (sq.displayRank === 3
          ? 'background:var(--surface-tint);color:var(--orange);border:1px solid var(--border-subtle);'
          : 'background:transparent;color:var(--text-muted);border:1px solid transparent;'));

    var sqUpper = String(sq.name || '').toUpperCase().trim();
    var members = squadMembersMap[sqUpper] || baselineRosters[sqUpper] || [];

    // Sort members descending by points
    members.sort(function(a, b) {
      var pA = (a.points && a.points.total) ? a.points.total : 0;
      var pB = (b.points && b.points.total) ? b.points.total : 0;
      return pB - pA;
    });

    var rosterId = 'squad-roster-' + sqIdx;

    // Build Roster HTML
    var rosterHtml = '';
    if (members.length > 0) {
      rosterHtml = 
        '<div id="' + rosterId + '" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' +
            escapeAttHtml(sq.name).toUpperCase() + ' MEMBERS (' + members.length + ' MEMBERS)' +
          '</div>' +
          '<div style="display:grid;gap:6px;">';

      members.forEach(function(m) {
        var isSelf = viewerName && (normalizeMemberName(m.name) === normalizeMemberName(viewerName));
        var selfBadge = isSelf
          ? '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(200,150,30,0.2);color:var(--accent);margin-left:4px;">You</span>'
          : '';

        var mPct = null;
        if (m.paradeAttendance && typeof m.paradeAttendance === 'object' && m.paradeAttendance.percentage !== undefined) {
          mPct = m.paradeAttendance.percentage;
        } else if (typeof m.paradeAttendance === 'number') {
          mPct = m.paradeAttendance;
        } else if (m.percentage !== undefined) {
          mPct = m.percentage;
        }
        var mTier = _getTierFn(mPct);

        var tierHtml =
          '<span class="att-tier-pill tier-' + mTier.tier.replace('_', '-') + '" title="' + escapeAttHtml(mTier.tooltipText) + '" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:' + mTier.bg + ';color:' + mTier.color + ';border:1px solid ' + mTier.border + ';cursor:help;" aria-label="Attendance tier: ' + escapeAttHtml(mTier.label) + '">' +
            escapeAttHtml(mTier.label) +
          '</span>';
        var dirRec = (typeof resolveMemberDirectoryInfo === 'function') ? resolveMemberDirectoryInfo(m.name || m.ic) : null;
        var regRec = dirRec || findRegisteredMemberMatch(m.name, m.ic);
        var cleanMemName = String(m.name || '').trim();
        var isRegistered = !!(
          isSelf ||
          (cleanMemName.toLowerCase() === 'jeshua koh' && (typeof isPortalCreator === 'function' ? isPortalCreator(m.name, m.ic) : true)) ||
          regRec
        );

        var avatarHtml = '';
        if (isRegistered) {
          var regId = (regRec && (regRec.ic || regRec.email)) || m.ic || m.email || '';
          var regName = (regRec && regRec.name) || m.name;
          var univFn = (typeof getUniversalMemberAvatarHtml === 'function')
            ? getUniversalMemberAvatarHtml
            : (typeof window !== 'undefined' && typeof window.getUniversalMemberAvatarHtml === 'function' ? window.getUniversalMemberAvatarHtml : null);
          if (univFn) {
            avatarHtml = univFn(regName, regId, 24, { showPresence: true, showCosmetics: true });
          } else if (typeof getAssigneeAvatarHtml === 'function') {
            avatarHtml = getAssigneeAvatarHtml(regName, regId, 24);
          } else {
            avatarHtml = '<span class="task-card-avatar" style="width:24px;height:24px;border-radius:9999px;background:#047857;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' + (m.name ? m.name[0] : 'M') + '</span>';
          }
        } else {
          avatarHtml = '<span class="empty-profile-avatar" style="width:24px;height:24px;border-radius:9999px;background:var(--surface-tint);color:var(--text-muted);display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-subtle);flex-shrink:0;position:relative;" title="Account not yet created" aria-label="Account not registered"><svg class="ui-icon-xs" style="width:13px;height:13px;opacity:0.55;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>';
        }

        rosterHtml +=
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;font-size:12px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              avatarHtml +
              '<span style="font-size:10px;font-weight:700;color:var(--text-muted);width:38px;">' + escapeAttHtml(m.rank || 'Member') + '</span>' +
              '<span style="font-weight:600;color:var(--text-primary);">' + escapeAttHtml(m.name || 'Member') + selfBadge + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              tierHtml +
            '</div>' +
          '</div>';
      });

      rosterHtml += '</div></div>';
    }

    html += 
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;width:32px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:6px;' + rankPill + '">#' + sq.displayRank + '</div>' +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;">' + sq.name.toUpperCase() + '</span>' +
                '<span style="font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:12px;background:' + st.bg + ';color:' + st.color + ';border:1px solid ' + st.border + ';">' + st.plt + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-family:var(--font-headline);font-size:20px;font-weight:700;color:' + st.color + ';">' + (sq.points || 0) + ' <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">Points</span></div>' +
          '</div>' +
        '</div>' +
        '<div style="height:6px;background:var(--surface-track);border-radius:3px;overflow:hidden;margin-bottom:8px;">' +
          '<div style="height:100%;width:' + pct + '%;background:' + st.color + ';border-radius:3px;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button type="button" data-roster-btn="' + rosterId + '" onclick="toggleSquadRoster(\'' + rosterId + '\')" style="background:transparent;border:none;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:2px 6px;">' +
            'View Squad Members &darr;' +
          '</button>' +
        '</div>' +
        rosterHtml +
      '</div>';
  });

  // Calculate platoon averages from competing squads
  var pltSums = {};
  squadList.forEach(function(sq) {
    var p = getPlatoonStyle(sq.name).plt;
    if (!pltSums[p]) pltSums[p] = { sum: 0, count: 0 };
    pltSums[p].sum += (sq.points || 0);
    pltSums[p].count += 1;
  });

  var pltAverages = Object.keys(pltSums).map(function(p) {
    var avg = Math.round(pltSums[p].sum / (pltSums[p].count || 1));
    return { name: p, avg: avg };
  }).sort(function(a, b) { return b.avg - a.avg; });

  // Platoon Averages Summary Footer
  html += 
    '<div style="margin-top:16px;padding:12px 14px;background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;">' +
      '<div style="font-family:var(--font-headline);font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">' +
        'Platoon Averages (Total Squad Points &divide; Squads)' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:8px;">';

  pltAverages.forEach(function(pa) {
    var st = getPlatoonStyle(pa.name);
    html += 
      '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;padding:8px 10px;text-align:center;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);">' + pa.name + ' Platoon</div>' +
        '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:' + st.color + ';margin-top:2px;">' + pa.avg + ' Points</div>' +
      '</div>';
  });

  html += '</div></div>';

  c.innerHTML = html;
}

/**
 * Triggers sync of attendance records to Google Sheets (BUG-007)
 * Delegates to sheets.js syncToSheets with real response handling
 * @param {Object|Array} records
 * @returns {Promise<Object>}
 */
async function syncToSheets(records) {
  if (typeof window !== 'undefined' && typeof window.syncToSheets === 'function' && window.syncToSheets !== syncToSheets) {
    return window.syncToSheets(records);
  }
  var sheetsApi = typeof require !== 'undefined' ? require('../api/sheets.js') : null;
  if (sheetsApi && typeof sheetsApi.syncToSheets === 'function') {
    return sheetsApi.syncToSheets(records);
  }
  throw new Error('Google Sheets sync module is not available.');
}

// ── Global Window Exports ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.normalizeMemberName = normalizeMemberName;
  window.getMasterAttendanceData = getMasterAttendanceData;
  window.getMemberAttendanceRecord = getMemberAttendanceRecord;
  window.loadMemberAttendanceStats = loadMemberAttendanceStats;
  window.refreshMemberAttendanceStats = refreshMemberAttendanceStats;
  window.toggleSquadRoster        = toggleSquadRoster;
  window.renderCompanyLeaderboard = renderCompanyLeaderboard;
  window.renderAdminMasterSheetPanel = renderAdminMasterSheetPanel;
  window.syncToSheets = syncToSheets;
  window.triggerMasterSheetFetch = triggerMasterSheetFetch;
  window.copyAppsScriptSnippet = copyAppsScriptSnippet;
  window.generateNewMasterSyncToken = generateNewMasterSyncToken;
  window.copyMasterSyncToken = copyMasterSyncToken;
  window.handleSaveMasterConfig = handleSaveMasterConfig;
  window.renderAttendanceBreakdownHTML = renderAttendanceBreakdownHTML;
  window.getAttendanceAchievementTier = _getTierFn;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeMemberName: normalizeMemberName,
    getMasterAttendanceData: getMasterAttendanceData,
    getMemberAttendanceRecord: getMemberAttendanceRecord,
    loadMemberAttendanceStats: loadMemberAttendanceStats,
    refreshMemberAttendanceStats: refreshMemberAttendanceStats,
    toggleSquadRoster: toggleSquadRoster,
    renderCompanyLeaderboard: renderCompanyLeaderboard,
    renderAdminMasterSheetPanel: renderAdminMasterSheetPanel,
    syncToSheets: syncToSheets,
    triggerMasterSheetFetch: triggerMasterSheetFetch,
    generateNewMasterSyncToken: generateNewMasterSyncToken,
    copyMasterSyncToken: copyMasterSyncToken,
    handleSaveMasterConfig: handleSaveMasterConfig,
    renderAttendanceBreakdownHTML: renderAttendanceBreakdownHTML,
    getAttendanceAchievementTier: _getTierFn
  };
}
