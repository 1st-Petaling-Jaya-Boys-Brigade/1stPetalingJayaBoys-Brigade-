import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'assets/**',
      '.vite/**',
      'package-lock.json',
      '**/*.min.js'
    ]
  },
  // Browser JavaScript files (js/**/*.js)
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        // Shared Portal Globals (TSK-001 / TSK-005B / TSK-007 / TSK-010 / TSK-029 / TSK-031 / TSK-034 / TSK-CALENDAR)
        CONFIG: 'readonly',
        SUPA_URL: 'readonly',
        SUPA_KEY: 'readonly',
        supa: 'readonly',
        escapeHtml: 'readonly',
        safeUrl: 'readonly',
        sanitizeInput: 'readonly',
        sanitizeText: 'readonly',
        sanitizeHtml: 'readonly',
        sessionGet: 'readonly',
        sessionSet: 'readonly',
        sessionClear: 'readonly',
        showToast: 'readonly',
        showConfirmModal: 'readonly',
        switchTab: 'readonly',
        formatFileSize: 'readonly',
        hasResourceAccess: 'readonly',
        RESOURCE_CATEGORIES: 'readonly',
        DEFAULT_2026_CALENDAR: 'readonly',
        currentCalendarYear: 'writable',
        currentCalendarMonth: 'writable',
        openLightbox: 'readonly',
        renderCompanyLeaderboard: 'readonly',
        hashPassword: 'readonly',
        verifyPassword: 'readonly',
        safeBase64Encode: 'readonly',
        safeBase64Decode: 'readonly',
        checkTasksAccess: 'readonly',
        checkAttendanceTabVisibility: 'readonly',
        loadMemberAttendanceStats: 'readonly',
        isNCO: 'readonly',
        // Uniform Store & Forms Hub Globals (TSK-006A)
        UNIFORM_ITEMS: 'readonly',
        itemQtys: 'readonly',
        itemSizes: 'readonly',
        updateTotal: 'readonly',
        renderUniformOrderInline: 'readonly',
        loadCustomForms: 'readonly',
        renderFormsHub: 'readonly',
        backToFormsHub: 'readonly',
        loadMemberOrders: 'readonly',
        createRichEditor: 'readonly',
        reGetValue: 'readonly',
        reSetValue: 'readonly',
        reClearValue: 'readonly',
        // Badges & Awards Tracker Globals (TSK-008)
        DEFAULT_BB_BADGES: 'readonly',
        DEFAULT_PRESIDENTS_REQS: 'readonly',
        DEFAULT_FOUNDERS_REQS: 'readonly',
        PRESIDENTS_REQS: 'readonly',
        getBadgeDefs: 'readonly',
        saveBadgeDefs: 'readonly',
        getPresidentsReqs: 'readonly',
        savePresidentsReqs: 'readonly',
        checkBadgesAccess: 'readonly',
        loadBadges: 'readonly',
        saveBadges: 'readonly',
        toggleBadge: 'readonly',
        adjustRepBadge: 'readonly',
        filterBadges: 'readonly',
        upsertMemberBadges: 'readonly',
        renderPresidentsTracker: 'readonly',
        switchBadgeSubtab: 'readonly',
        setReqTier: 'readonly',
        renderAdminBadges: 'readonly',
        renderAdminPresidentsReqs: 'readonly',
        addPresidentsReq: 'readonly',
        // NCO Tasks & Kanban Board Globals (TSK-009)
        DEPT_CONFIG: 'readonly',
        checkIsNCO: 'readonly',
        switchTaskTab: 'readonly',
        checkTasksAccess: 'readonly',
        renderTasksBoard: 'readonly',
        openTaskDetail: 'readonly',
        closeTaskDetail: 'readonly',
        memberUpdateTaskStatus: 'readonly',
        // Admin Console Master Controller Globals (TSK-011)
        ADMIN_PASSWORD: 'readonly',
        ADMIN_SECTIONS: 'readonly',
        RANK_ORDER: 'readonly',
        openAdmin: 'readonly',
        closeAdmin: 'readonly',
        logoutAdmin: 'readonly',
        adminLogin: 'readonly',
        toggleAdminPassVis: 'readonly',
        backToAdminHome: 'readonly',
        switchAdminSection: 'readonly',
        switchDeptTab: 'readonly',
        toggleTaskForm: 'readonly',
        calcAge: 'readonly',
        setAdminSort: 'readonly',
        renderAdminList: 'readonly',
        handleAdminSectionChange: 'readonly',
        openAddMember: 'readonly',
        openEditMember: 'readonly',
        closeEditMember: 'readonly',
        saveEditMember: 'readonly',
        deleteEditMember: 'readonly',
        deleteMemberAccount: 'readonly',
        loadAssigneeOptions: 'readonly',
        saveTask: 'readonly',
        clearTaskForm: 'readonly',
        renderAdminTasks: 'readonly',
        updateTaskStatus: 'readonly',
        editAdminTask: 'readonly',
        deleteTask: 'readonly',
        renderGallery: 'readonly',
        renderAnnouncements: 'readonly',
        loadResources: 'readonly',
        initCalendarModule: 'readonly',
        renderUniformProductsPreview: 'readonly',
        switchFormSubtab: 'readonly',
        switchUniformSubtab: 'readonly',
        renderAdminAnnList: 'readonly',
        renderAdminStoryHighlights: 'readonly',
        renderAdminMasterSheetPanel: 'readonly',
        renderAdminResourcesPanel: 'readonly',
        renderAdminCalendarGrid: 'readonly',
        syncToSheets: 'readonly',
        syncAttendanceToSheets: 'readonly',
        isMinorSection: 'readonly',
        fetchMemberConsent: 'readonly'
      }
    },
    rules: {
      'no-undef': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ],
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'off',
      'no-var': 'off'
    }
  },
  // Service Worker (sw.js)
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.serviceworker,
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-var': 'off'
    }
  },
  // Node.js test & verification scripts (scripts/**/*.js)
  {
    files: ['scripts/**/*.js', '*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        WebSocket: 'readonly',
        escapeHtml: 'readonly',
        safeUrl: 'readonly',
        sanitizeInput: 'readonly',
        sanitizeText: 'readonly',
        sanitizeHtml: 'readonly',
        getHqCardsPerPage: 'readonly',
        getHqTotalPages: 'readonly',
        _hqCurrentPage: 'writable',
        updateQuickCardsCarousel: 'readonly',
        cycleQuickCards: 'readonly',
        setQuickCardsPage: 'readonly',
        filterForms: 'readonly',
        clearFormSearch: 'readonly'
      }
    },
    rules: {
      'no-undef': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error'
    }
  }
];
