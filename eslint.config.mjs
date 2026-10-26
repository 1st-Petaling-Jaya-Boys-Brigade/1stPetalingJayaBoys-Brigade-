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
        checkTasksAccess: 'readonly',
        checkAttendanceTabVisibility: 'readonly',
        loadMemberAttendanceStats: 'readonly',
        isNCO: 'readonly'
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
