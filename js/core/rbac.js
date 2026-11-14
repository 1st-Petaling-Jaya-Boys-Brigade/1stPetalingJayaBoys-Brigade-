/**
 * 1st Petaling Jaya Boys' Brigade Portal - Granular Role-Based Access Control (RBAC)
 * File: js/core/rbac.js
 *
 * Implements a 3-tier RBAC system (Member, Admin, Super Admin) with granular module-level permissions,
 * scoped Admin Console access, and top navigation header role badge state synchronization.
 */

(function(global) {
  'use strict';

  var ROLES = {
    MEMBER: 'member',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin'
  };

  var MODULES = [
    { id: 'members',       label: 'Members Directory',      desc: 'Member profiles, ranks, sections & credentials' },
    { id: 'orders',        label: 'Forms & Form Builder',   desc: 'Custom registration forms & surveys' },
    { id: 'uniform',       label: 'Uniform Orders & Store', desc: 'Uniform inventory and pricing' },
    { id: 'tasks',         label: 'Departments & Tasks',    desc: 'Department roles and NCO tasks' },
    { id: 'announcements', label: 'Company Announcements',  desc: 'Announcements and broadcast emails' },
    { id: 'badges',        label: 'Awards & Badges',        desc: 'Badge requirements & President Award tracker' },
    { id: 'gallery',       label: 'Gallery & Highlights',   desc: 'Company photos and video stories' },
    { id: 'attendance',    label: 'Attendance & Standings', desc: 'Squad points, rankings & Master Sheet sync' },
    { id: 'resources',     label: 'Company Resources Hub',  desc: 'Handbooks, drill manuals & syllabi' },
    { id: 'calendar',      label: 'Parade & Master Schedule', desc: 'Company events & parade dates' },
    { id: 'roles',         label: 'Roles & Permissions',    desc: 'RBAC management and permission scopes (Super Admin only)' }
  ];

  var SUPER_ADMIN_DEFAULT_EMAILS = [
    'jeshuakoh2008@gmail.com'
  ];

  var DEFAULT_ADMIN_MODULES = [
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

  var _rolesConfig = (function() {
    try {
      if (typeof localStorage !== 'undefined') {
        var cached = localStorage.getItem('bb_admin_roles');
        if (cached) {
          var parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            return {
              super_admins: Array.isArray(parsed.super_admins) ? parsed.super_admins : [...SUPER_ADMIN_DEFAULT_EMAILS],
              admins: (parsed.admins && typeof parsed.admins === 'object') ? parsed.admins : {}
            };
          }
        }
      }
    } catch (_) {}
    return {
      super_admins: [...SUPER_ADMIN_DEFAULT_EMAILS],
      admins: {}
    };
  })();

  function getSupabaseClient() {
    if (typeof window !== 'undefined' && window.supa) return window.supa;
    if (typeof global !== 'undefined' && global.supa) return global.supa;
    if (typeof getSupaClient === 'function') return getSupaClient();
    if (typeof window !== 'undefined' && typeof window.getSupaClient === 'function') return window.getSupaClient();
    if (typeof supa !== 'undefined') return supa;
    return null;
  }

  function cleanEmail(email) {
    if (!email || typeof email !== 'string') return '';
    return email.trim().toLowerCase();
  }

  function getSession(key) {
    if (typeof sessionGet === 'function') return sessionGet(key);
    if (typeof global !== 'undefined' && typeof global.sessionGet === 'function') return global.sessionGet(key);
    if (typeof window !== 'undefined' && typeof window.sessionGet === 'function') return window.sessionGet(key);
    return null;
  }

  /**
   * Loads the active roles configuration from bb_config or remote RPC.
   * @param {boolean} forceRefresh
   * @returns {Promise<Object>}
   */
  async function loadRolesConfig(_forceRefresh) {
    try {
      if (!_forceRefresh && typeof supa !== 'undefined' && typeof supa.safeConfigGet === 'function') {
        var snapRoles = await supa.safeConfigGet('bb_admin_roles');
        if (snapRoles && typeof snapRoles === 'object' && (snapRoles.super_admins || snapRoles.admins)) {
          _rolesConfig = {
            super_admins: Array.isArray(snapRoles.super_admins) ? snapRoles.super_admins : [...SUPER_ADMIN_DEFAULT_EMAILS],
            admins: (snapRoles.admins && typeof snapRoles.admins === 'object') ? snapRoles.admins : {}
          };
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('bb_admin_roles', JSON.stringify(_rolesConfig));
            }
          } catch (_) {}
          renderHeaderRoleBadge();
          syncAdminButtonVisibility();
          return _rolesConfig;
        }
      }

      var client = getSupabaseClient();
      if (client) {
        var res = await client.get('bb_config?key=eq.bb_admin_roles&select=value');
        if (res && res.length && res[0].value) {
          var parsed = typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value;
          if (parsed && typeof parsed === 'object') {
            _rolesConfig = {
              super_admins: Array.isArray(parsed.super_admins) ? parsed.super_admins : [...SUPER_ADMIN_DEFAULT_EMAILS],
              admins: (parsed.admins && typeof parsed.admins === 'object') ? parsed.admins : {}
            };
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('bb_admin_roles', JSON.stringify(_rolesConfig));
              }
            } catch (_) {}
            renderHeaderRoleBadge();
            syncAdminButtonVisibility();
            return _rolesConfig;
          }
        }
      }
    } catch (err) {
      console.warn('RBAC loadRolesConfig note:', err);
    }
    renderHeaderRoleBadge();
    syncAdminButtonVisibility();
    return _rolesConfig;
  }

  /**
   * Resolves the active role for an identifier or the current session user.
   * @param {string} [email]
   * @returns {string} 'member' | 'admin' | 'super_admin'
   */
  function getUserRole(email) {
    var userEmail = cleanEmail(email);
    if (!userEmail) {
      userEmail = cleanEmail(getSession('email') || getSession('ic'));
    }

    if (!userEmail) {
      if (getSession('adminAuthed') === true) {
        return ROLES.ADMIN;
      }
      return ROLES.MEMBER;
    }

    // 1. Check Super Admin pre-assigned list & Portal Creator (jeshuakoh2008@gmail.com)
    if (
      userEmail === 'jeshuakoh2008@gmail.com' ||
      (_rolesConfig && _rolesConfig.super_admins && _rolesConfig.super_admins.map(cleanEmail).includes(userEmail))
    ) {
      return ROLES.SUPER_ADMIN;
    }

    // 2. Check Scoped Admin list (Explicitly assigned in database bb_config)
    if (_rolesConfig && _rolesConfig.admins && _rolesConfig.admins[userEmail]) {
      return ROLES.ADMIN;
    }

    // Fallback: Check local storage cached roles config in case of offline/network transition
    if (typeof localStorage !== 'undefined') {
      try {
        var rawRoles = localStorage.getItem('bb_roles_config');
        if (rawRoles) {
          var parsed = JSON.parse(rawRoles);
          if (parsed && Array.isArray(parsed.super_admins) && parsed.super_admins.map(cleanEmail).includes(userEmail)) {
            return ROLES.SUPER_ADMIN;
          }
          if (parsed && parsed.admins && parsed.admins[userEmail]) {
            return ROLES.ADMIN;
          }
        }
      } catch (_) {}
    }

    // CRITICAL SECURITY ENFORCEMENT:
    // ALL other accounts—regardless of rank (Captain, Lieutenant, Chaplain, etc.) or name—
    // default strictly to MEMBER! Ranks NEVER grant Admin/Super Admin access automatically.

    // Authenticated admin session fallback ONLY when no signed-in member session exists
    var sessEmail = cleanEmail(getSession('email') || getSession('ic'));
    if (!sessEmail && getSession('adminAuthed') === true) {
      return ROLES.ADMIN;
    }

    // 4. Default: Member
    return ROLES.MEMBER;
  }

  /**
   * Retrieves the allowed modular permissions for a user.
   * @param {string} [email]
   * @returns {string[]} Array of allowed module IDs
   */
  function getUserPermissions(email) {
    var role = getUserRole(email);
    if (role === ROLES.SUPER_ADMIN) {
      return MODULES.map(function(m) { return m.id; });
    }

    if (role === ROLES.ADMIN) {
      var userEmail = cleanEmail(email);
      if (!userEmail) {
        userEmail = cleanEmail(getSession('email') || getSession('ic'));
      }
      if (userEmail && _rolesConfig && _rolesConfig.admins && _rolesConfig.admins[userEmail]) {
        var adminEntry = _rolesConfig.admins[userEmail];
        var perms = Array.isArray(adminEntry) ? adminEntry : (adminEntry && adminEntry.permissions);
        return Array.isArray(perms) ? perms : [];
      }
      return !userEmail && getSession('adminAuthed') === true ? [...DEFAULT_ADMIN_MODULES] : [];
    }

    return [];
  }

  /**
   * Checks whether the user has permission to access a specific module.
   * @param {string} moduleKey
   * @param {string} [email]
   * @returns {boolean}
   */
  function hasModulePermission(moduleKey, email) {
    if (!moduleKey) return false;
    var cleanMod = String(moduleKey).trim().toLowerCase();
    var role = getUserRole(email);

    // Only Super Admin can access 'roles' management module
    if (cleanMod === 'roles') {
      return role === ROLES.SUPER_ADMIN;
    }

    if (role === ROLES.SUPER_ADMIN) {
      return true;
    }

    if (role === ROLES.ADMIN) {
      var allowed = getUserPermissions(email);
      return allowed.includes(cleanMod);
    }

    return false;
  }

  /**
   * Determines if user has Super Admin privileges.
   * @param {string} [email]
   * @returns {boolean}
   */
  function isSuperAdmin(email) {
    return getUserRole(email) === ROLES.SUPER_ADMIN;
  }

  /**
   * Determines if user has any administrative privileges (Admin or Super Admin).
   * @param {string} [email]
   * @returns {boolean}
   */
  function isAdmin(email) {
    var r = getUserRole(email);
    return r === ROLES.ADMIN || r === ROLES.SUPER_ADMIN;
  }

  /**
   * Super Admin method to assign a role and scoped permissions to a target user.
   * @param {string} targetEmail
   * @param {string} newRole
   * @param {string[]} [permissions]
   * @param {string} [actorEmail]
   * @returns {Promise<{success: boolean, role: string, permissions: string[]}>}
   */
  async function assignUserRole(targetEmail, newRole, permissions, actorEmail) {
    var target = cleanEmail(targetEmail);
    var role = cleanEmail(newRole);
    var actor = cleanEmail(actorEmail);

    if (!target) throw new Error('Target email is required.');
    if (![ROLES.MEMBER, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role)) {
      throw new Error('Invalid role specified. Allowed values: member, admin, super_admin.');
    }

    if (!actor) {
      actor = cleanEmail(getSession('email') || getSession('ic'));
    }

    // Authorization check: Only Super Admin can assign roles
    if (!isSuperAdmin(actor)) {
      throw new Error('Access Denied: Only Super Admins can manage roles and permissions.');
    }

    // Protection rule: Jeshua Koh account cannot be demoted
    if (target === 'jeshuakoh2008@gmail.com' && role !== ROLES.SUPER_ADMIN) {
      throw new Error('Jeshua Koh account cannot be demoted from Super Admin');
    }

    var validPerms = Array.isArray(permissions)
      ? permissions.filter(function(p) { return MODULES.some(function(m) { return m.id === p && p !== 'roles'; }); })
      : [...DEFAULT_ADMIN_MODULES];

    // Try server-side RPC if available
    var client = getSupabaseClient();
    if (client && typeof client.rpc === 'function') {
      try {
        var rpcRes = await client.rpc('rpc_assign_user_role', {
          p_actor_email: actor,
          p_target_email: target,
          p_new_role: role,
          p_permissions: validPerms
        });
        if (rpcRes && rpcRes.success) {
          await loadRolesConfig(true);
          return rpcRes;
        }
      } catch (rpcErr) {
        console.warn('RPC assign role fallback:', rpcErr);
      }
    }

    // In-memory & bb_config fallback
    if (!_rolesConfig) await loadRolesConfig(true);

    // Remove from super_admins and admins
    _rolesConfig.super_admins = _rolesConfig.super_admins.filter(function(e) { return cleanEmail(e) !== target; });
    delete _rolesConfig.admins[target];

    if (role === ROLES.SUPER_ADMIN) {
      _rolesConfig.super_admins.push(target);
    } else if (role === ROLES.ADMIN) {
      _rolesConfig.admins[target] = {
        role: ROLES.ADMIN,
        permissions: validPerms,
        assigned_by: actor,
        assigned_at: new Date().toISOString()
      };
    }

    // Persist to local storage immediately
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_admin_roles', JSON.stringify(_rolesConfig));
      }
    } catch (_) {}

    // Persist to bb_config
    if (client) {
      try {
        if (typeof client.upsert === 'function') {
          await client.upsert('bb_config', {
            key: 'bb_admin_roles',
            value: JSON.stringify(_rolesConfig)
          }, 'key');
        } else if (typeof client.req === 'function') {
          await client.req('POST', 'bb_config?on_conflict=key', {
            key: 'bb_admin_roles',
            value: JSON.stringify(_rolesConfig)
          }, { headers: { 'Prefer': 'resolution=merge-duplicates' } });
        }
      } catch (saveErr) {
        console.warn('Failed to save bb_admin_roles to Supabase:', saveErr);
      }
    }
    renderHeaderRoleBadge();
    syncAdminButtonVisibility();

    // Log mutation in bb_audit_logs if available
    if (typeof logAuditEvent === 'function') {
      try {
        await logAuditEvent({
          action: 'admin.role_change',
          targetType: 'member_role',
          targetId: target,
          actorId: actor,
          actorRole: 'super_admin',
          details: { new_role: role, permissions: validPerms }
        });
      } catch (_) {}
    }

    // Update active session if target is current user
    if (typeof sessionGet === 'function' && cleanEmail(sessionGet('email')) === target) {
      sessionSet('role', role);
      renderHeaderRoleBadge();
    }

    return { success: true, target_email: target, role: role, permissions: validPerms };
  }

  /**
   * Renders and updates the top navigation bar active role badge.
   */
  function renderHeaderRoleBadge() {
    if (typeof document === 'undefined') return;

    var badge = document.querySelector('.nav-role-badge');
    if (!badge) {
      // Find profile button in header and inject badge wrapper if not present
      var profBtn = document.getElementById('nav-profile-btn');
      if (profBtn && profBtn.parentNode) {
        var wrap = document.createElement('div');
        wrap.className = 'nav-role-badge-wrap';
        wrap.innerHTML = '<span class="nav-role-badge" role="status" aria-label="Current Role: Member" title="Current Role: Member"><span class="nav-role-badge-icon"></span><span class="nav-role-badge-text">Member</span></span>';
        profBtn.parentNode.insertBefore(wrap, profBtn.nextSibling);
        badge = wrap.querySelector('.nav-role-badge');
      }
    }

    if (!badge) return;

    var isAuthed = false;
    if (typeof isUserAuthenticated === 'function') {
      isAuthed = isUserAuthenticated();
    } else {
      isAuthed = !!(getSession('ic') || getSession('email'));
    }

    if (!isAuthed) {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'inline-flex';
    badge.setAttribute('role', 'status');
    var role = getUserRole();
    var iconSpan = badge.querySelector('.nav-role-badge-icon');
    var textSpan = badge.querySelector('.nav-role-badge-text');

    badge.classList.remove('role-super-admin', 'role-admin', 'role-member');

    if (role === ROLES.SUPER_ADMIN) {
      badge.classList.add('role-super-admin');
      if (textSpan) textSpan.textContent = 'Super Admin';
      if (iconSpan) {
        iconSpan.innerHTML = '<svg class="role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      }
      badge.title = 'Super Admin (Full System Control & Role Management)';
      badge.setAttribute('aria-label', 'Current Role: Super Admin');
    } else if (role === ROLES.ADMIN) {
      badge.classList.add('role-admin');
      if (textSpan) textSpan.textContent = 'Admin';
      if (iconSpan) {
        iconSpan.innerHTML = '<svg class="role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      }
      var perms = getUserPermissions();
      var permCount = perms.length;
      badge.title = 'Admin (Scoped Permissions: ' + permCount + ' modules)';
      badge.setAttribute('aria-label', 'Current Role: Admin (' + permCount + ' modules)');
    } else {
      badge.classList.add('role-member');
      if (textSpan) textSpan.textContent = 'Member';
      if (iconSpan) {
        iconSpan.innerHTML = '<svg class="role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      }
      badge.title = 'Standard Member (Internal Portal Access)';
      badge.setAttribute('aria-label', 'Current Role: Member');
    }

    syncAdminButtonVisibility();
  }

  /**
   * Synchronizes visibility of Admin Console buttons based on active user role.
   * Completely hides Admin Console button for members without admin/super_admin privileges.
   */
  function syncAdminButtonVisibility() {
    if (typeof document === 'undefined') return;
    var adminBtns = document.querySelectorAll('.sidebar-admin-btn');
    if (!adminBtns || !adminBtns.length) return;

    var canAccess = isAdmin();
    for (var i = 0; i < adminBtns.length; i++) {
      adminBtns[i].style.display = canAccess ? 'flex' : 'none';
    }
  }

  // Attach to window & export
  var RBAC = {
    ROLES: ROLES,
    MODULES: MODULES,
    SUPER_ADMIN_DEFAULT_EMAILS: SUPER_ADMIN_DEFAULT_EMAILS,
    DEFAULT_ADMIN_MODULES: DEFAULT_ADMIN_MODULES,
    _getRolesConfig: function() { return _rolesConfig; },
    _setRolesConfig: function(cfg) { _rolesConfig = cfg; },
    loadRolesConfig: loadRolesConfig,
    getUserRole: getUserRole,
    getUserPermissions: getUserPermissions,
    hasModulePermission: hasModulePermission,
    isSuperAdmin: isSuperAdmin,
    isAdmin: isAdmin,
    assignUserRole: assignUserRole,
    renderHeaderRoleBadge: renderHeaderRoleBadge,
    syncAdminButtonVisibility: syncAdminButtonVisibility
  };

  if (typeof window !== 'undefined') {
    window.RBAC = RBAC;
    window.RBAC_ROLES = ROLES;
    window.RBAC_MODULES = MODULES;
    window.syncAdminButtonVisibility = syncAdminButtonVisibility;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      RBAC: RBAC,
      ROLES: ROLES,
      MODULES: MODULES,
      SUPER_ADMIN_DEFAULT_EMAILS: SUPER_ADMIN_DEFAULT_EMAILS,
      DEFAULT_ADMIN_MODULES: DEFAULT_ADMIN_MODULES,
      _getRolesConfig: function() { return _rolesConfig; },
      _setRolesConfig: function(cfg) { _rolesConfig = cfg; },
      loadRolesConfig: loadRolesConfig,
      getUserRole: getUserRole,
      getUserPermissions: getUserPermissions,
      hasModulePermission: hasModulePermission,
      isSuperAdmin: isSuperAdmin,
      isAdmin: isAdmin,
      assignUserRole: assignUserRole,
      renderHeaderRoleBadge: renderHeaderRoleBadge,
      syncAdminButtonVisibility: syncAdminButtonVisibility
    };
  }
})(typeof window !== 'undefined' ? window : global);
