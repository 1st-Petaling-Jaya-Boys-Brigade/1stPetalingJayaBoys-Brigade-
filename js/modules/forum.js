/**
 * 1st Petaling Jaya Boys' Brigade — AI Support Helper Agent & Bug Forum Module
 *
 * Implements:
 * 1. "Ask Stedfast" AI Helper Agent:
 *    - Permanent bottom-right floating pill button with quick chat window.
 *    - Interactive FAQ knowledge base answering member inquiries on parade timings,
 *      uniform standards, badge milestone advancement, squad leaderboard, and portal tools.
 *    - Automated issue triage & bug classification with one-click escalation to the forum.
 *    - Clean SVG icons throughout (zero emojis).
 * 2. Support & Bug Forum Tab:
 *    - Structured community & dev bug forum with categories, statuses, upvotes, and replies.
 *    - Admins and Super Admins can edit/delete posts and toggle resolution status.
 *    - Members and admins can reply to discussion threads and bug reports.
 *    - Direct child of #app-main preserving standard portal layout and strict 388 unique DOM IDs.
 *    - Supabase bb_config persistence with offline state fallback.
 */

// ── SVG Icon Registry (Zero Emojis) ──────────────────────────────────────────
var FORUM_ICONS = {
  gear: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  all: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h7"/></svg>',
  bugs: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
  badges: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  account: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  store: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  attendance: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
  general: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  parade: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  upvote: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  message: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  anchor: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>',
  member: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  arcade: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/></svg>',
  resources: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  forum: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  admin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  externalLink: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
};

// ── Seed Forum Discussions & Bug Reports ──────────────────────────────────────
var DEFAULT_FORUM_POSTS = [
  {
    id: 'post-001',
    title: 'How does the 80% attendance rule apply to the BB One Year Service award?',
    category: 'badges',
    categoryLabel: 'Badges & Awards',
    tag: 'badges-tracker',
    status: 'resolved',
    authorName: 'Joash Lee Tian Wei',
    authorRank: 'L/Cpl',
    authorEmail: 'jl.pytiger@gmail.com',
    date: '28 Oct 2026',
    time: '4:15 PM',
    content: 'Hi Officers, I want to confirm if the 80% attendance requirement counts both regular Saturday parade and Company Band rehearsals, or only regular parades for the One Year Service milestone badge?',
    upvotes: 8,
    upvotedBy: ['jeshuakoh2008@gmail.com'],
    replies: [
      {
        id: 'rep-001-1',
        authorName: 'Jeshua Koh',
        authorRank: 'Sergeant',
        authorRole: 'HQ NCO',
        authorEmail: 'jeshuakoh2008@gmail.com',
        date: '28 Oct 2026',
        time: '5:02 PM',
        isOfficial: true,
        content: 'Hi Joash! Under official BB Senior Section advancement criteria, parade attendance must reach at least 80% across the full service year. Band attendance is recorded separately for Company Band service awards, but both are confidential in the new Member Hub achievement tiers.'
      }
    ],
    triagedByAgent: false
  },
  {
    id: 'post-003',
    title: 'Uniform Store sizing chart for Boot sizes (UK vs US)',
    category: 'store',
    categoryLabel: 'Uniform Store',
    tag: 'store-order',
    status: 'open',
    authorName: 'OLIVER LING CHEE SHENG',
    authorRank: 'L/Cpl',
    authorEmail: 'chickensans0@gmail.com',
    date: '01 Nov 2026',
    time: '2:10 PM',
    content: 'Hi! When ordering Drill Boots in the Uniform Order Form, are the sizes UK sizing or US sizing? My regular shoe size is UK 7, should I order UK 7 or size up?',
    upvotes: 6,
    upvotedBy: [],
    replies: [
      {
        id: 'rep-003-1',
        authorName: 'Jason Koh',
        authorRank: 'Corporal',
        authorRole: 'Logistics',
        authorEmail: 'jasonkoh2010712@gmail.com',
        date: '01 Nov 2026',
        time: '3:30 PM',
        isOfficial: true,
        content: 'All uniform drill boots follow official UK sizing. If you wear thick BB uniform wool socks for parade, we recommend ordering your exact UK size or a half-size larger for maximum comfort during drill competitions.'
      }
    ],
    triagedByAgent: false
  },
  {
    id: 'post-004',
    title: 'Task board Add Task button jumping during drag and drop',
    category: 'bugs',
    categoryLabel: 'Bugs & Glitches',
    tag: 'bug: ui-glitch',
    status: 'resolved',
    authorName: 'Jason Koh',
    authorRank: 'Corporal',
    authorEmail: 'jasonkoh2010712@gmail.com',
    date: '02 Nov 2026',
    time: '10:05 AM',
    content: 'When dragging task cards between Kanban columns in Projects & Tasks, the Add Task button was previously getting stuck between cards. Verified this is now resolved in the latest release.',
    upvotes: 12,
    upvotedBy: [],
    replies: [
      {
        id: 'rep-004-1',
        authorName: 'Jeshua Koh',
        authorRank: 'Sergeant',
        authorRole: 'Super Admin',
        authorEmail: 'jeshuakoh2008@gmail.com',
        date: '02 Nov 2026',
        time: '10:30 AM',
        isOfficial: true,
        content: 'Resolved! Kanban columns now dynamically append drag placeholders before the static Add Task button footer, locking button alignment strictly to the column bottom.'
      }
    ],
    triagedByAgent: true
  }
];

// ── State ────────────────────────────────────────────────────────────────────
var forumPosts = JSON.parse(JSON.stringify(DEFAULT_FORUM_POSTS));
var _currentForumCategory = 'all';
var _currentForumStatus = 'all';
var _forumSearchQuery = '';

// Helper Agent State
var _isHelperAgentOpen = false;
var _helperMessages = [
  {
    sender: 'agent',
    text: 'Hello! I am **Stedfast**, your 1st Petaling Jaya Boys\' Brigade AI Helper.\n\nAsk me anything conversationally, or ask where features are located in our portal! I can also check your attendance qualification, search our Support Forum, or escalate technical issues for you.',
    time: 'Just now',
    chips: [
      { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
      { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
      { label: '80% Attendance Rule', query: 'How does 80% attendance work for badges?', icon: 'attendance' },
      { label: 'Uniform Kits', query: 'What are the official uniform kits?', icon: 'store' },
      { label: '1stPJ Arcade', query: 'Where is the 1stPJ Arcade and how do credits work?', icon: 'arcade' },
      { label: 'Report a Bug', query: 'I want to report a bug in the portal', icon: 'bugs' }
    ]
  }
];

// ── Official 100 Portal FAQs Dataset ──────────────────────────────────────
var PORTAL_100_FAQS = [
  {
    "id": "faq-001",
    "num": 1,
    "question": "How do I register for a new portal account?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Navigate to the login screen and select **Create Account**. Enter your Full Name, Email, Password, Age, Section (Pre-Junior, Junior, Senior, or Officer), Rank, and assigned Platoon/Squad. Upon submission, you will be automatically logged in immediately.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "account",
      "register",
      "new",
      "portal",
      "navigate",
      "login",
      "screen"
    ]
  },
  {
    "id": "faq-002",
    "num": 2,
    "question": "Can two members register with the same name?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "No. The portal enforces strict name-collision prevention. If a member attempts to register using a name that already exists in the company registry, registration is blocked with a prompt asking them to log into their existing account.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "register",
      "name",
      "two",
      "members",
      "same",
      "portal",
      "enforces"
    ]
  },
  {
    "id": "faq-003",
    "num": 3,
    "question": "How are member passwords protected?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Passwords are cryptographically hashed client-side using the Web Crypto API with PBKDF2-HMAC-SHA-256 over 100,000 iterations and a unique 128-bit salt. Plaintext passwords and reversible base64 strings are strictly prohibited.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "passwords",
      "100",
      "member",
      "protected",
      "cryptographically",
      "hashed",
      "client-side"
    ]
  },
  {
    "id": "faq-004",
    "num": 4,
    "question": "What is the \"Remember Me\" session duration?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "When \"Remember Me\" is enabled during login, your authenticated session remains securely active for up to 14 days across browser restarts.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "remember",
      "session",
      "duration",
      "enabled",
      "during",
      "login",
      "authenticated"
    ]
  },
  {
    "id": "faq-005",
    "num": 5,
    "question": "How do I log out of all my devices at once?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "In the **Member Hub**, click the **Sign Out Everywhere** button. This revokes all active device tokens and forces re-authentication on any other computer, tablet, or phone where your account was logged in.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "log",
      "devices",
      "once",
      "member",
      "hub",
      "click",
      "sign"
    ]
  },
  {
    "id": "faq-006",
    "num": 6,
    "question": "What happens if an admin deletes a member account?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "When an account is deleted by an administrator in the Admin Console, the portal's active session validator instantly detects the removal and redirects the browser back to the login screen, revoking all portal access.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "admin",
      "account",
      "portal",
      "happens",
      "deletes",
      "member",
      "deleted"
    ]
  },
  {
    "id": "faq-007",
    "num": 7,
    "question": "Why does the portal require parental consent for younger boys?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Under COPPA and Malaysian Personal Data Protection Act (PDPA 2010) guidelines, members under 18 (Pre-Junior and Junior sections) require a parent or legal guardian's name and contact number during registration, alongside media release preferences.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "require",
      "under",
      "2010",
      "portal",
      "parental",
      "consent",
      "younger"
    ]
  },
  {
    "id": "faq-008",
    "num": 8,
    "question": "What is the Admin Email Blocklist?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Super Admins can block specific email addresses from creating accounts via the Admin Console. Any attempt to register using a blocked email address is immediately rejected.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "email",
      "admin",
      "blocklist",
      "super",
      "admins",
      "block",
      "specific"
    ]
  },
  {
    "id": "faq-009",
    "num": 9,
    "question": "How are profile avatar colors and initials assigned?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Each member's profile avatar displays the first letter of their first name rendered on a deterministic, high-contrast color from a curated palette.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "profile",
      "avatar",
      "first",
      "colors",
      "initials",
      "assigned",
      "each"
    ]
  },
  {
    "id": "faq-010",
    "num": 10,
    "question": "Can I view the portal without logging in?",
    "category": "Accounts, Registration, Security & Child Privacy",
    "answer": "Unauthenticated visitors have restricted Guest access. To view personal attendance records, uniform inspection scores, badge advancement, or order history, you must sign in to your verified account.\n\n---",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      }
    ],
    "keywords": [
      "view",
      "portal",
      "without",
      "logging",
      "unauthenticated",
      "visitors",
      "restricted"
    ]
  },
  {
    "id": "faq-011",
    "num": 11,
    "question": "What time does Saturday parade start and end?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "The full company parade convenes every Saturday from **2:15 PM to 6:00 PM** (starting at **9:30 AM** for Band members).",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "saturday",
      "time",
      "start",
      "end",
      "full",
      "company"
    ]
  },
  {
    "id": "faq-012",
    "num": 12,
    "question": "When are Band rehearsals held?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Band sectionals and rehearsals (woodwind, brass, and percussion) take place on Saturday mornings from **9:30 AM to 11:30 AM** prior to the main company parade.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "band",
      "rehearsals",
      "held",
      "sectionals",
      "woodwind",
      "brass",
      "percussion"
    ]
  },
  {
    "id": "faq-013",
    "num": 13,
    "question": "Where is the company parade held?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Parades are held at **Trinity Methodist Church Petaling Jaya (TMC PJ)**, located at 6 Jalan 5/37, 46000 Petaling Jaya, Selangor.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "held",
      "petaling",
      "jaya",
      "46000",
      "company",
      "parades"
    ]
  },
  {
    "id": "faq-014",
    "num": 14,
    "question": "What should I do if I am running late for Saturday parade?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Contact your Squad Leader or Platoon Commander immediately before 2:15 PM with your estimated arrival time. Unexcused late arrivals past 2:30 PM are marked on the parade attendance roll.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "late",
      "running",
      "saturday",
      "contact",
      "squad",
      "leader"
    ]
  },
  {
    "id": "faq-015",
    "num": 15,
    "question": "How do I know which uniform kit to wear this Saturday?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Refer to the company calendar on the **Home** tab or **Weekly Parade** tab to check the official Uniform Dress Code (Kit A, Kit B, or Kit C) scheduled for that Saturday parade.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "uniform",
      "kit",
      "saturday",
      "tab",
      "parade",
      "know",
      "wear"
    ]
  },
  {
    "id": "faq-016",
    "num": 16,
    "question": "Can I add personal reminders to the portal calendar?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Yes. In the **Home** tab calendar widget, click **+ Add Reminder** on any selected date to create personal inspection or preparation reminders.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "add",
      "personal",
      "reminders",
      "calendar",
      "portal",
      "yes",
      "home"
    ]
  },
  {
    "id": "faq-017",
    "num": 17,
    "question": "How are wet weather or venue changes announced?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Urgent venue adjustments or inclement weather arrangements are broadcasted via high-priority banners in the **Home** announcements feed and alerted via portal notifications.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "weather",
      "venue",
      "via",
      "wet",
      "changes",
      "announced",
      "urgent"
    ]
  },
  {
    "id": "faq-018",
    "num": 18,
    "question": "Does the company hold parade on public holidays?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Parades falling on major public holidays or school term breaks are indicated as \"No Official Parade Scheduled\" on the company calendar.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "company",
      "public",
      "holidays",
      "hold",
      "parades",
      "falling"
    ]
  },
  {
    "id": "faq-019",
    "num": 19,
    "question": "What should I bring to Saturday parade?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "Members should bring their BB Handbook, a notebook, stationery, a full water bottle (at least 1L), and wear the designated uniform kit with a clean and polished uniform.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "bring",
      "uniform",
      "saturday",
      "members",
      "handbook",
      "notebook"
    ]
  },
  {
    "id": "faq-020",
    "num": 20,
    "question": "How do I sync parade dates with my personal phone calendar?",
    "category": "Weekly Parade, Timings & Venue",
    "answer": "You can export scheduled events and parade dates directly from the **Weekly Parade** tab to Google Calendar or Apple iCal.\n\n---",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "dates",
      "calendar",
      "sync",
      "personal",
      "phone",
      "export"
    ]
  },
  {
    "id": "faq-021",
    "num": 21,
    "question": "What is the 80% attendance rule?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Official BB Rule: A minimum **80% parade attendance threshold** across the full company session is strictly required to qualify for the **BB One Year Service** badge.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "attendance",
      "rule",
      "official",
      "minimum",
      "parade",
      "threshold",
      "across"
    ]
  },
  {
    "id": "faq-022",
    "num": 22,
    "question": "Does the 80% attendance rule apply to the President's Award?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "No. The 80% attendance threshold specifically qualifies members for the **BB One Year Service** badge. The President's Award evaluates completed service years along with leadership courses, service hours, and advanced badges.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "service",
      "attendance",
      "president",
      "award",
      "rule",
      "apply",
      "threshold"
    ]
  },
  {
    "id": "faq-023",
    "num": 23,
    "question": "What are the Confidential Attendance Achievement Tiers?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "To protect member privacy while encouraging excellence, attendance is categorized into four tiers:\n- **Emerald Tier**: 100% (Perfect Attendance)\n- **Blue Tier**: ≥ 90% (Excellent Attendance)\n- **Gold Tier**: ≥ 80% (Good — One Year Service Qualified)\n- **Orange Tier**: < 80% (At Risk — One Year Service Pending)",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "attendance",
      "tier",
      "tiers",
      "one",
      "year",
      "service",
      "100"
    ]
  },
  {
    "id": "faq-024",
    "num": 24,
    "question": "Where can I check my attendance percentage?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "You can view your private attendance percentage, inspection points, and service badge status anytime in your personal **Member Hub**.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "attendance",
      "percentage",
      "check",
      "view",
      "private",
      "inspection",
      "points"
    ]
  },
  {
    "id": "faq-025",
    "num": 25,
    "question": "Can other members see my attendance percentage?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "No. Individual attendance percentages and uniform demerits are strictly confidential to your account. The public **Leaderboard** tab only displays overall squad rankings without exposing individual percentages.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "attendance",
      "individual",
      "percentages",
      "other",
      "members",
      "see",
      "percentage"
    ]
  },
  {
    "id": "faq-026",
    "num": 26,
    "question": "How often is attendance synchronized from Google Sheets?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Company attendance is recorded on parade days and synchronized directly into the portal database by company officers using the Master Sheet Ingestion engine.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "attendance",
      "synchronized",
      "company",
      "often",
      "google",
      "sheets",
      "recorded"
    ]
  },
  {
    "id": "faq-027",
    "num": 27,
    "question": "Does Band attendance count toward regular parade attendance?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Band attendance is tracked separately for Band Service awards and proficiency badges, while regular Saturday parade attendance determines the One Year Service award.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "band",
      "parade",
      "attendance",
      "regular",
      "service",
      "count",
      "toward"
    ]
  },
  {
    "id": "faq-028",
    "num": 28,
    "question": "How do I apply for an official leave of absence?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Download the official **Leave of Absence Form** from the **Company Resources** tab, have it signed by a parent/guardian with supporting documents (e.g., school exam schedule or medical certificate), and submit it to your Platoon Commander.",
    "actions": [
      {
        "label": "Go to Member Hub",
        "action": "navigate",
        "target": "member",
        "icon": "member"
      },
      {
        "label": "Go to Leaderboard",
        "action": "navigate",
        "target": "attendance",
        "icon": "attendance"
      }
    ],
    "keywords": [
      "official",
      "leave",
      "absence",
      "apply",
      "download",
      "form",
      "company"
    ]
  },
  {
    "id": "faq-029",
    "num": 29,
    "question": "What happens if I arrive late to parade?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Late arrivals (after 2:30 PM without prior approved leave) are marked as Late on the roll sheet. Accumulating three unexcused lates impacts your uniform inspection standing.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "late",
      "happens",
      "arrive",
      "arrivals",
      "without",
      "prior"
    ]
  },
  {
    "id": "faq-030",
    "num": 30,
    "question": "How is my parade percentage calculated?",
    "category": "Attendance, 80% Rule & Service Awards",
    "answer": "Parade percentage is computed as `(Parades Present + Excused Official Leaves) / Total Parades Convened * 100%`.\n\n---",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "percentage",
      "parades",
      "100",
      "calculated",
      "computed",
      "present"
    ]
  },
  {
    "id": "faq-031",
    "num": 31,
    "question": "How many total badges are tracked in the portal?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "The portal tracks all **41 official Boys' Brigade badges** recognized under the Senior Section awards framework.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "badges",
      "portal",
      "many",
      "total",
      "tracked",
      "tracks",
      "official"
    ]
  },
  {
    "id": "faq-032",
    "num": 32,
    "question": "What are the four main badge categories?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "1. **Special Awards** (e.g., Founder's Award, President's Award)\n2. **Service Awards** (e.g., One Year Service, Band Service)\n3. **Compulsory Awards** (e.g., Target, Drill, Christian Education, NCO Star)\n4. **Proficiency Awards** (elective subject awards grouped from Group A to Group D)",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "awards",
      "service",
      "award",
      "group",
      "four",
      "main",
      "badge"
    ]
  },
  {
    "id": "faq-033",
    "num": 33,
    "question": "How are Proficiency Badges arranged?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "In the **My Badges** tab, all Proficiency Badges are organized in clean **alphabetical order** in a responsive 5-in-a-row grid layout.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "badges",
      "proficiency",
      "arranged",
      "tab",
      "organized",
      "clean",
      "alphabetical"
    ]
  },
  {
    "id": "faq-034",
    "num": 34,
    "question": "What is the difference between Grid View and List View in My Badges?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "- **Grid View**: Displays high-resolution badge artwork with interactive Basic and Advanced stage selection buttons.\n- **List View**: Provides a streamlined tabular view showing badge names, category tags, achievement dates, and level status.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "view",
      "grid",
      "list",
      "badge",
      "difference",
      "between",
      "badges"
    ]
  },
  {
    "id": "faq-035",
    "num": 35,
    "question": "What badges have Basic and Advanced stages?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "Proficiency awards (such as First Aid, Drill, Camping, Communication, Computer Knowledge, and Expedition) offer separate Basic and Advanced achievement tiers.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "basic",
      "advanced",
      "badges",
      "stages",
      "proficiency",
      "awards",
      "such"
    ]
  },
  {
    "id": "faq-036",
    "num": 36,
    "question": "What are repeatable badges?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "Badges such as the **One Year Service Badge** can be earned repeatedly across multiple years. In the portal, clicking the badge card increments your earned service years counter.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "badges",
      "service",
      "badge",
      "earned",
      "years",
      "repeatable",
      "such"
    ]
  },
  {
    "id": "faq-037",
    "num": 37,
    "question": "Where can I view the syllabus requirements for a badge?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "Badge syllabi and assessment criteria can be downloaded from the **Company Resources** tab under the **Badges & Syllabi** category.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "badge",
      "syllabi",
      "view",
      "syllabus",
      "requirements",
      "assessment",
      "criteria"
    ]
  },
  {
    "id": "faq-038",
    "num": 38,
    "question": "How do I get my completed badge approved?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "After passing your practical assessment with an instructor or squad commander, your Platoon Commander submits your completion record to the Officer Council for verification in the Admin Console.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "commander",
      "get",
      "completed",
      "badge",
      "approved",
      "passing",
      "practical"
    ]
  },
  {
    "id": "faq-039",
    "num": 39,
    "question": "What are the prerequisites for the Founder's Award?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "The Founder's Award is the highest award in the Senior Section. Candidates must hold the President's Award, complete the Advanced Leadership Training Camp (ALTC), accumulate 50 hours of community service, and undergo an Officer Council interview.",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "award",
      "founder",
      "prerequisites",
      "highest",
      "senior",
      "section",
      "candidates"
    ]
  },
  {
    "id": "faq-040",
    "num": 40,
    "question": "Where do I sew badges on my uniform shirt?",
    "category": "My Badges, Awards & Syllabi",
    "answer": "Refer to the **BB Uniform & Insignia Placement Guide** in the **Company Resources** tab for exact millimeter measurements and layout diagrams for left/right sleeve placement.\n\n---",
    "actions": [
      {
        "label": "Go to My Badges",
        "action": "navigate",
        "target": "badges",
        "icon": "badges"
      }
    ],
    "keywords": [
      "uniform",
      "placement",
      "sew",
      "badges",
      "shirt",
      "refer",
      "insignia"
    ]
  },
  {
    "id": "faq-041",
    "num": 41,
    "question": "What reference documents are available in the Resources tab?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "The **Company Resources** tab hosts the official BB Handbook, BB Drill & Ceremonial Manual, badge syllabi, leave of absence forms, songbooks, and camp safety guidelines.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "resources",
      "tab",
      "reference",
      "documents",
      "available",
      "company",
      "hosts"
    ]
  },
  {
    "id": "faq-042",
    "num": 42,
    "question": "How does Stedfast AI Helper find documents in the Resources tab?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "Stedfast dynamically reads the live `window.resources` repository in real time. When new documents or Google Drive links are uploaded by administrators, Stedfast immediately indexes their titles, descriptions, and URLs.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "stedfast",
      "documents",
      "resources",
      "helper",
      "find",
      "tab",
      "dynamically"
    ]
  },
  {
    "id": "faq-043",
    "num": 43,
    "question": "How does Stedfast help me open documents?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "When you ask Stedfast about a document (e.g., *\"Where is the leave form?\"*), Stedfast provides an overview and an interactive **[Open Document]** button that launches the Google Drive file directly in a secure new tab.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "stedfast",
      "open",
      "document",
      "help",
      "documents",
      "ask",
      "leave"
    ]
  },
  {
    "id": "faq-044",
    "num": 44,
    "question": "What is the command for \"Attention\" in the BB Drill Manual?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Sedia**: Stand upright with heels touching, feet angled outward at 45°, arms pinned straight along trouser seams with clenched fists, thumbs pointing downwards, and eyes looking straight ahead.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "drill",
      "straight",
      "command",
      "attention",
      "manual",
      "sedia",
      "stand"
    ]
  },
  {
    "id": "faq-045",
    "num": 45,
    "question": "What is the command for \"Stand at Ease\"?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Senang Diri**: Carry the left foot smartly 12 inches to the left. Clasp hands behind the back at waist height, right hand resting over the left with thumbs crossed and fingers straight.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "left",
      "command",
      "stand",
      "ease",
      "senang",
      "diri",
      "carry"
    ]
  },
  {
    "id": "faq-046",
    "num": 46,
    "question": "What is the command for \"Right Dress\"?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Ke Kanan Lurus**: Turn head and eyes sharply to the right. The right marker remains still. All squad members raise their left arm horizontally, knuckles touching the left member's shoulder, and dress the line with short shuffling steps.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "right",
      "dress",
      "left",
      "command",
      "kanan",
      "lurus",
      "turn"
    ]
  },
  {
    "id": "faq-047",
    "num": 47,
    "question": "What is the command for \"Eyes Front\"?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Pandang Depan**: Snap head and eyes sharply to the front while dropping the raised arm smartly to the trouser seam into the position of *Sedia*.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "eyes",
      "front",
      "command",
      "pandang",
      "depan",
      "snap",
      "head"
    ]
  },
  {
    "id": "faq-048",
    "num": 48,
    "question": "What is the tempo for \"Quick March\"?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Cepat Jalan**: Step off with the left foot, taking a full 30-inch pace at a standard cadence of 116 to 120 paces per minute, swinging arms straight from the shoulder up to chest height in front.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "116",
      "120",
      "tempo",
      "quick",
      "march",
      "cepat",
      "jalan"
    ]
  },
  {
    "id": "faq-049",
    "num": 49,
    "question": "How is \"About Turn\" executed?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "**Ke Belakang Pusing**: Always turn clockwise through 180 degrees via the right shoulder in a sharp three-count movement, pivoting on the right heel and left toe before stamping the left foot down into *Sedia*.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "turn",
      "right",
      "left",
      "180",
      "executed",
      "belakang",
      "pusing"
    ]
  },
  {
    "id": "faq-050",
    "num": 50,
    "question": "What is the difference between \"Keluar Baris\" and \"Bersurai\"?",
    "category": "Company Resources, Handbooks & Drill Manual",
    "answer": "- **Keluar Baris (Fall Out)**: Turn right, pause for two beats, and march off for a temporary break.\n- **Bersurai (Dismissal)**: Turn right, salute (if an officer is on the parade square), pause, and march off, marking the formal conclusion of parade.\n\n---",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "keluar",
      "baris",
      "bersurai",
      "turn",
      "right",
      "pause",
      "march"
    ]
  },
  {
    "id": "faq-051",
    "num": 51,
    "question": "What is Kit A (Ceremonial Dress)?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "Kit A consists of the official long-sleeve blue uniform shirt, cross belt, glengarry/forage cap with BB cap badge, navy trousers, white waist belt, dark navy BB socks, and polished black drill boots.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "kit",
      "belt",
      "cap",
      "navy",
      "ceremonial",
      "dress",
      "consists"
    ]
  },
  {
    "id": "faq-052",
    "num": 52,
    "question": "What is Kit B (Day Kit)?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "Kit B consists of the 1st PJ company polo t-shirt, dark navy trousers, black BB webbed belt with chrome buckle, and polished black drill shoes or boots.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "kit",
      "black",
      "day",
      "consists",
      "1st",
      "company",
      "polo"
    ]
  },
  {
    "id": "faq-053",
    "num": 53,
    "question": "What is Kit C (PT / Sports Attire)?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "Kit C consists of the squad/section t-shirt, navy track pants or sports shorts, and athletic running shoes with sports socks.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "sports",
      "kit",
      "attire",
      "consists",
      "squad",
      "section",
      "t-shirt"
    ]
  },
  {
    "id": "faq-054",
    "num": 54,
    "question": "What shoe sizing scale do BB Drill Boots follow?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "All official BB drill boots adhere strictly to **UK sizing** (standard UK shoe sizes). When ordering drill boots through the Forms & Store tab, select your standard UK shoe size, or a half-size larger if wearing thick ceremonial wool socks.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "boot",
      "boots",
      "boot size",
      "boot sizes",
      "drill boots",
      "shoe sizing",
      "shoe size",
      "uk sizing",
      "uk size",
      "sizing scale",
      "drill",
      "scale"
    ]
  },
  {
    "id": "faq-055",
    "num": 55,
    "question": "Should I order a half-size larger for drill boots?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "If you wear thick ceremonial wool socks or custom orthotic insoles during parade drills, ordering a half-size larger provides optimal comfort and prevents blisters.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "order",
      "drill",
      "half-size",
      "larger",
      "boots",
      "wear",
      "thick"
    ]
  },
  {
    "id": "faq-056",
    "num": 56,
    "question": "How do I wear the Forage Cap correctly?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "The forage cap should be worn tilted slightly over the right eyebrow, approximately two finger-widths above the right ear, with the cap badge centered over the left eye.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "cap",
      "forage",
      "right",
      "wear",
      "correctly",
      "worn",
      "tilted"
    ]
  },
  {
    "id": "faq-057",
    "num": 57,
    "question": "How should the Cross Belt be worn?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "The ceremonial cross belt passes over the left shoulder and rests across the right hip, with the haversack positioned securely on the left hip.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "cross",
      "belt",
      "left",
      "hip",
      "worn",
      "ceremonial",
      "passes"
    ]
  },
  {
    "id": "faq-058",
    "num": 58,
    "question": "How are uniform inspection points awarded?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "During Saturday parade inspection, squad commanders score members out of 20 points across boots, trousers, belt buckle, shirt creases, badges, and haircut standards.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "uniform",
      "inspection",
      "points",
      "awarded",
      "during",
      "saturday",
      "parade"
    ]
  },
  {
    "id": "faq-059",
    "num": 59,
    "question": "How should black drill boots be maintained?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "Boots should be cleaned with a damp cloth to remove parade dust, polished with black Kiwi wax polish, and buffed with a soft horsehair brush or cotton cloth to achieve a mirror shine.",
    "actions": [
      {
        "label": "Go to Company Resources",
        "action": "navigate",
        "target": "resources",
        "icon": "resources"
      }
    ],
    "keywords": [
      "drill",
      "black",
      "boots",
      "cloth",
      "maintained",
      "cleaned",
      "damp"
    ]
  },
  {
    "id": "faq-060",
    "num": 60,
    "question": "What haircut standard is expected for Senior Section members?",
    "category": "Uniform Standards, Kits & Boot Sizing",
    "answer": "Hair must be neat, clean, and kept off the collar, ears, and eyebrows. Exaggerated fades or unnatural hair dye are not permitted on parade.\n\n---",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "hair",
      "haircut",
      "standard",
      "expected",
      "senior",
      "section",
      "members"
    ]
  },
  {
    "id": "faq-061",
    "num": 61,
    "question": "How do I place an order in the Uniform Store?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Go to the **Forms & Store** tab, browse the uniform catalog, select your required items and sizes (e.g., polo shirts, forage caps, drill boots), and proceed to Checkout.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "uniform",
      "store",
      "place",
      "forms",
      "tab",
      "browse"
    ]
  },
  {
    "id": "faq-062",
    "num": 62,
    "question": "What payment methods are accepted for store orders?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Orders can be paid via **Touch 'n Go eWallet** QR or **DuitNow Instant Transfer** using the official company payment details displayed on the checkout screen.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "payment",
      "orders",
      "methods",
      "accepted",
      "store",
      "paid",
      "via"
    ]
  },
  {
    "id": "faq-063",
    "num": 63,
    "question": "How do I upload payment proof?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "On the checkout screen, take a photo or screenshot of your transaction receipt and upload it. The portal automatically compresses the image client-side to keep uploads fast and secure.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "upload",
      "payment",
      "proof",
      "checkout",
      "screen",
      "take",
      "photo"
    ]
  },
  {
    "id": "faq-064",
    "num": 64,
    "question": "What image formats are allowed for payment receipts?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Receipts must be uploaded as **JPG, PNG, or WebP** images. SVG files, HTML files, and executable scripts are strictly blocked for security.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "receipts",
      "files",
      "image",
      "formats",
      "allowed",
      "payment",
      "must"
    ]
  },
  {
    "id": "faq-065",
    "num": 65,
    "question": "What are the different order statuses?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "- **Pending Review**: Order submitted and awaiting officer payment confirmation.\n- **Paid / Confirmed**: Payment verified by the logistics department.\n- **Ready for Collection**: Items packed and ready for pickup at Saturday parade.\n- **Completed**: Order handed over to the member.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "payment",
      "ready",
      "different",
      "statuses",
      "pending",
      "review"
    ]
  },
  {
    "id": "faq-066",
    "num": 66,
    "question": "Where do I collect my ordered items?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Collected items are distributed by the Logistics Department at the Quartermaster Store (QM Room) at Trinity Methodist Church during Saturday parade dismissal (5:30 PM – 6:00 PM).",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "items",
      "collect",
      "ordered",
      "collected",
      "distributed",
      "logistics",
      "department"
    ]
  },
  {
    "id": "faq-067",
    "num": 67,
    "question": "Can I cancel or modify an order after submitting?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "To modify an order before payment confirmation, reach out to the Logistics NCO in the **Projects & Tasks** board or submit a inquiry in the **Support Forum**.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "modify",
      "cancel",
      "submitting",
      "payment",
      "confirmation",
      "reach"
    ]
  },
  {
    "id": "faq-068",
    "num": 68,
    "question": "What are Dynamic Event Forms?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Event forms (such as Annual Camp registration, Drill Competition consent, or Fellowship dinners) appear dynamically in the **Forms & Store** tab when announced by company administration.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "forms",
      "event",
      "dynamic",
      "such",
      "annual",
      "camp",
      "registration"
    ]
  },
  {
    "id": "faq-069",
    "num": 69,
    "question": "How do I know if an item is in stock?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Catalog items indicate live inventory availability. If an item is temporarily backordered, expected restock dates will be noted on the product card.",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "item",
      "know",
      "stock",
      "catalog",
      "items",
      "indicate",
      "live"
    ]
  },
  {
    "id": "faq-070",
    "num": 70,
    "question": "How do officers manage incoming orders?",
    "category": "Forms & Store Orders, Payment Receipts",
    "answer": "Officers and logistics department members can view, filter, verify payment proofs, and update order statuses in the **Uniform Orders Management** panel within the Admin Console.\n\n---",
    "actions": [
      {
        "label": "Go to Forms & Store",
        "action": "navigate",
        "target": "order",
        "icon": "store"
      }
    ],
    "keywords": [
      "order",
      "officers",
      "orders",
      "manage",
      "incoming",
      "logistics",
      "department",
      "members"
    ]
  },
  {
    "id": "faq-071",
    "num": 71,
    "question": "What is the 1stPJ Arcade?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "The **1stPJ Arcade** is a gamified learning hub featuring daily puzzles, the BB Daily Wordle, Timed BB Trivia, streak tracking, and a cosmetic reward shop.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "1stpj",
      "arcade",
      "daily",
      "gamified",
      "learning",
      "hub",
      "featuring"
    ]
  },
  {
    "id": "faq-072",
    "num": 72,
    "question": "How does the Daily Wordle work?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "Guess the secret 5-letter BB-themed word in 6 attempts or fewer. Wordle terms are sourced from BB drill commands, rank titles, award names, and heritage vocabulary.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "wordle",
      "daily",
      "work",
      "guess",
      "secret",
      "5-letter",
      "bb-themed"
    ]
  },
  {
    "id": "faq-073",
    "num": 73,
    "question": "What do the Wordle tile colors mean?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "- **Green**: The letter is in the word and in the correct position.\n- **Gold**: The letter is in the word but in the wrong spot.\n- **Dark Grey**: The letter is not in the word.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "wordle",
      "letter",
      "word",
      "tile",
      "colors",
      "mean",
      "green"
    ]
  },
  {
    "id": "faq-074",
    "num": 74,
    "question": "How does Daily Streak work?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "Playing the Daily Wordle or Timed Trivia every consecutive day increases your streak counter. If a day is missed, the streak resets to zero.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "streak",
      "daily",
      "day",
      "work",
      "playing",
      "wordle",
      "timed"
    ]
  },
  {
    "id": "faq-075",
    "num": 75,
    "question": "What is Timed BB Trivia?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "Timed Trivia presents 5 multiple-choice questions per day regarding company history, founder facts, drill theory, and badge requirements. Fast correct answers award bonus credits.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "timed",
      "trivia",
      "presents",
      "multiple-choice",
      "questions",
      "per",
      "day"
    ]
  },
  {
    "id": "faq-076",
    "num": 76,
    "question": "How do I earn Arcade Credits?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "Credits are earned by solving the Daily Wordle (+15 credits), answering Timed Trivia (+5 credits per correct answer), and reaching weekly streak milestones.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "credits",
      "earn",
      "arcade",
      "earned",
      "solving",
      "daily",
      "wordle"
    ]
  },
  {
    "id": "faq-077",
    "num": 77,
    "question": "What is the Cosmetic Shop?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "The Cosmetic Shop allows members to spend their earned Arcade Credits on digital profile cosmetics, including avatar outlines, animated frames, and chat badges.",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "cosmetic",
      "shop",
      "allows",
      "members",
      "spend",
      "earned",
      "arcade"
    ]
  },
  {
    "id": "faq-078",
    "num": 78,
    "question": "Does playing in the Arcade affect my parade attendance?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "No. Arcade credits and streaks are fun extracurricular rewards and do not replace physical parade attendance or uniform inspection points.",
    "actions": [
      {
        "label": "Go to Weekly Parade",
        "action": "navigate",
        "target": "parade",
        "icon": "parade"
      }
    ],
    "keywords": [
      "parade",
      "arcade",
      "attendance",
      "playing",
      "affect",
      "credits",
      "streaks"
    ]
  },
  {
    "id": "faq-079",
    "num": 79,
    "question": "When does the Daily Wordle puzzle reset?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "The Daily Wordle and Timed Trivia questions reset every day at midnight (12:00 AM MYT).",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "wordle",
      "daily",
      "reset",
      "puzzle",
      "timed",
      "trivia",
      "questions"
    ]
  },
  {
    "id": "faq-080",
    "num": 80,
    "question": "Where can I view the company Arcade leaderboard?",
    "category": "1stPJ Arcade, Daily Wordle & Credit Shop",
    "answer": "The **Leaderboard** tab includes an Arcade Credits ranking table highlighting top streak holders and puzzle solvers across the company.\n\n---",
    "actions": [
      {
        "label": "Go to 1stPJ Arcade",
        "action": "navigate",
        "target": "arcade",
        "icon": "arcade"
      }
    ],
    "keywords": [
      "company",
      "arcade",
      "leaderboard",
      "view",
      "tab",
      "includes",
      "credits"
    ]
  },
  {
    "id": "faq-081",
    "num": 81,
    "question": "Who can access the Projects & Tasks tab?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "The **Projects & Tasks** board is reserved for appointed Non-Commissioned Officers (NCOs: Lance Corporals, Corporals, Sergeants, Staff Sergeants) and Officers assigned to functional departments.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "projects",
      "tasks",
      "officers",
      "corporals",
      "sergeants",
      "access",
      "tab"
    ]
  },
  {
    "id": "faq-082",
    "num": 82,
    "question": "Do newly created officer accounts automatically get task access?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "No. To prevent unauthorized deletions, newly registered accounts only have standard member access. Task and board management strictly requires explicit department assignment by a Super Admin.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "newly",
      "accounts",
      "task",
      "access",
      "created",
      "officer",
      "automatically"
    ]
  },
  {
    "id": "faq-083",
    "num": 83,
    "question": "What are the company departments?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "Tasks are organized across four departments:\n1. **HQ** (Executive, administration, parade planning)\n2. **Secretariat** (Records, attendance, notices, documentation)\n3. **Logistics** (Uniform store, equipment, QM, catering)\n4. **Media** (Photography, videography, social media, sound engineering)",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "departments",
      "media",
      "company",
      "tasks",
      "organized",
      "across",
      "four"
    ]
  },
  {
    "id": "faq-084",
    "num": 84,
    "question": "What are the five columns on the Kanban board?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "1. **Brief**: Project requirements and initial scopes.\n2. **To Do**: Action items queued for execution.\n3. **In Progress**: Active assignments currently underway.\n4. **Review**: Completed work awaiting officer sign-off.\n5. **Done**: Approved and finalized deliverables.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "five",
      "columns",
      "kanban",
      "board",
      "brief",
      "project",
      "requirements"
    ]
  },
  {
    "id": "faq-085",
    "num": 85,
    "question": "Can I switch between Board View and List View?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "Yes. Click the **List View** toggle at the top of the Tasks tab to view all department tasks in a sortable, searchable data table.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "view",
      "list",
      "tasks",
      "switch",
      "between",
      "board",
      "yes"
    ]
  },
  {
    "id": "faq-086",
    "num": 86,
    "question": "How do I mention another team member in task comments?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "Type `@` followed by the member's name in the task comments box to tag them and trigger an instant portal notification in their inbox.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "member",
      "task",
      "comments",
      "mention",
      "another",
      "team",
      "type"
    ]
  },
  {
    "id": "faq-087",
    "num": 87,
    "question": "What file attachments can be added to task cards?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "You can attach PDF briefs, Word documents, Excel sheets, and images up to 15MB per file. Executable files and SVGs are prohibited.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "file",
      "attachments",
      "added",
      "task",
      "cards",
      "attach",
      "pdf"
    ]
  },
  {
    "id": "faq-088",
    "num": 88,
    "question": "How do I move a task card?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "On desktop, drag and drop the card between columns. On mobile devices, tap the card to open its detail modal and select the target column status.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "card",
      "move",
      "task",
      "desktop",
      "drag",
      "drop",
      "between"
    ]
  },
  {
    "id": "faq-089",
    "num": 89,
    "question": "Can members edit tasks created by others?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "Members can comment on and update tasks assigned to their department. Only the task author, department heads, and Super Admins can delete task cards.",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "members",
      "tasks",
      "department",
      "task",
      "edit",
      "created",
      "others"
    ]
  },
  {
    "id": "faq-090",
    "num": 90,
    "question": "Where do task notification alerts appear?",
    "category": "Projects & Tasks Kanban Board for NCOs",
    "answer": "When you are assigned a task or mentioned in a comment, a notification appears in your top navigation notification inbox accompanied by a chime sound effect.\n\n---",
    "actions": [
      {
        "label": "Go to Projects & Tasks",
        "action": "navigate",
        "target": "tasks",
        "icon": "tasks"
      }
    ],
    "keywords": [
      "notification",
      "task",
      "alerts",
      "appear",
      "assigned",
      "mentioned",
      "comment"
    ]
  },
  {
    "id": "faq-091",
    "num": 91,
    "question": "What is \"Ask Stedfast\"?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "**Stedfast** is the built-in AI Helper for the 1st PJ Web Portal, accessible via the floating anchor button on the bottom right of the screen.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "stedfast",
      "ask",
      "built-in",
      "helper",
      "1st",
      "web",
      "portal"
    ]
  },
  {
    "id": "faq-092",
    "num": 92,
    "question": "What can I ask Stedfast AI Helper?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "You can ask Stedfast about parade schedules, drill commands, badge criteria, uniform standards, where to find portal features, or your personal attendance standing.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "ask",
      "stedfast",
      "helper",
      "parade",
      "schedules",
      "drill",
      "commands"
    ]
  },
  {
    "id": "faq-093",
    "num": 93,
    "question": "How does Stedfast protect member privacy?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "Stedfast's Privacy Shield blocks queries seeking confidential records (attendance %, points, grades) of other members. It only provides personal performance data for your own authenticated session.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "stedfast",
      "privacy",
      "protect",
      "member",
      "shield",
      "blocks",
      "queries"
    ]
  },
  {
    "id": "faq-094",
    "num": 94,
    "question": "How does Stedfast help me report bugs?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "If your message mentions a glitch, error, or broken button, Stedfast automatically triages the problem, suggests quick browser fixes (such as hard refresh), and provides a one-click button to escalate the issue to the **Support Forum**.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "stedfast",
      "button",
      "help",
      "report",
      "bugs",
      "message",
      "mentions"
    ]
  },
  {
    "id": "faq-095",
    "num": 95,
    "question": "Who can see posts on the Support Forum?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "All authenticated members can view forum discussions, upvote topics, and reply to threads. Official responses from NCOs and Officers are badged with a verified checkmark.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "forum",
      "see",
      "posts",
      "support",
      "authenticated",
      "members",
      "view"
    ]
  },
  {
    "id": "faq-096",
    "num": 96,
    "question": "What is the Admin Console?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "The **Admin Console** is the back-office management panel for verified Officers and Super Admins, accessible via the sidebar button.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "admin",
      "console",
      "back-office",
      "management",
      "panel",
      "verified",
      "officers"
    ]
  },
  {
    "id": "faq-097",
    "num": 97,
    "question": "What features are managed in the Admin Console?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "Administrators use the Admin Console to manage member rosters, assign ranks and departments, sync attendance with Google Sheets, manage uniform store items, broadcast announcements, and review audit logs.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "admin",
      "console",
      "manage",
      "features",
      "managed",
      "administrators",
      "use"
    ]
  },
  {
    "id": "faq-098",
    "num": 98,
    "question": "What is the difference between an Admin and a Super Admin?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "- **Admin (Officer)**: Can view rosters, manage tasks, review store orders, and upload company resources.\n- **Super Admin**: Has master governance, including promoting roles, assigning department permissions, managing the email blocklist, and broadcasting global notices.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "admin",
      "super",
      "difference",
      "between",
      "officer",
      "view",
      "rosters"
    ]
  },
  {
    "id": "faq-099",
    "num": 99,
    "question": "How does the portal sync with Google Sheets?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "The portal uses an encrypted Google Apps Script webhook integration to ingest attendance data and member rosters directly from the official 1st PJ Google Drive Master Sheet.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "google",
      "portal",
      "sync",
      "sheets",
      "uses",
      "encrypted",
      "apps"
    ]
  },
  {
    "id": "faq-100",
    "num": 100,
    "question": "How do I report a security vulnerability or critical bug?",
    "category": "Support Forum, Bug Triage & Admin Console",
    "answer": "Post an issue with the category \"Bugs & Glitches\" in the **Support Forum**.",
    "actions": [
      {
        "label": "Open Admin Console",
        "action": "navigate",
        "target": "admin",
        "icon": "admin"
      }
    ],
    "keywords": [
      "report",
      "security",
      "vulnerability",
      "critical",
      "bug",
      "post",
      "issue"
    ]
  }
];


/**
 * Rigorously sanitizes AI and FAQ responses to eliminate internal task or bug codes
 * @param {string} text
 * @returns {string}
 */
function sanitizeStedfastOutput(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\s*\((?:TSK|BUG)[-_]?\w*\)/gi, '')
    .replace(/\b(?:TSK|BUG)[-_]?\d+[A-Z]?\b/gi, '')
    .replace(/\b(?:TSK|BUG)[-_]?[A-Z0-9]+\b/gi, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Knowledge Base FAQ Engine (100 Official Portal FAQs) ─────────────────────
var FAQ_KNOWLEDGE_BASE = PORTAL_100_FAQS;

// Cached Google Gemini API Key
var _cachedGeminiApiKey = '';

/**
 * Safely resolves active Gemini API key from session, localStorage, window, or cache
 * @returns {string}
 */
function getGeminiApiKey() {
  if (typeof sessionStorage !== 'undefined') {
    var sKey = sessionStorage.getItem('bb_gemini_api_key');
    if (sKey && sKey.trim()) return sKey.trim();
  }
  if (typeof localStorage !== 'undefined') {
    var lKey = localStorage.getItem('bb_gemini_api_key');
    if (lKey && lKey.trim()) return lKey.trim();
  }
  if (typeof window !== 'undefined') {
    if (window.GEMINI_API_KEY && typeof window.GEMINI_API_KEY === 'string') {
      return window.GEMINI_API_KEY.trim();
    }
    if (window.CONFIG && window.CONFIG.GEMINI_API_KEY) {
      return window.CONFIG.GEMINI_API_KEY.trim();
    }
  }
  return _cachedGeminiApiKey || '';
}

/**
 * Securely sets or updates the Gemini API key in local memory and storage
 * @param {string} key
 */
function setGeminiApiKey(key) {
  var cleanKey = (key || '').trim();
  _cachedGeminiApiKey = cleanKey;
  if (typeof localStorage !== 'undefined') {
    if (cleanKey) {
      localStorage.setItem('bb_gemini_api_key', cleanKey);
    } else {
      localStorage.removeItem('bb_gemini_api_key');
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    if (cleanKey) {
      sessionStorage.setItem('bb_gemini_api_key', cleanKey);
    } else {
      sessionStorage.removeItem('bb_gemini_api_key');
    }
  }
}

/**
 * Synchronizes active Gemini API key from Supabase bb_config so all members automatically get AI intelligence
 * @returns {Promise<string>}
 */
async function syncRemoteGeminiApiKey() {
  if (_cachedGeminiApiKey) return _cachedGeminiApiKey;
  if (typeof supa !== 'undefined' && typeof supa.getConfig === 'function') {
    try {
      var val = await supa.getConfig('bb_gemini_api_key');
      if (val) {
        var k = (typeof val === 'string') ? val : (val.key || val.apiKey || '');
        if (k && k.trim()) {
          _cachedGeminiApiKey = k.trim();
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('bb_gemini_api_key', _cachedGeminiApiKey);
          }
          return _cachedGeminiApiKey;
        }
      }
    } catch (e) {
      console.warn('syncRemoteGeminiApiKey warning:', e);
    }
  }
  return getGeminiApiKey();
}

/**
 * Persists Gemini API key to Supabase bb_config
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function saveRemoteGeminiApiKey(key) {
  var cleanKey = (key || '').trim();
  setGeminiApiKey(cleanKey);
  if (typeof supa !== 'undefined' && typeof supa.setConfig === 'function') {
    try {
      await supa.setConfig('bb_gemini_api_key', { key: cleanKey, updated_at: new Date().toISOString() });
      return true;
    } catch (e) {
      console.warn('saveRemoteGeminiApiKey warning:', e);
    }
  }
  return false;
}

/**
 * Calls Google Gemini API Free Tier (gemini-2.0-flash with gemini-1.5-flash fallback) with grounded 1st PJ context
 * @param {string} prompt
 * @param {string} [apiKey]
 * @returns {Promise<string|null>}
 */
var _lastGeminiError = '';
var _activeGeminiModel = '';
var _activeGeminiApiVersion = 'v1beta';
var _activeGeminiApiMode = 'interactions';

/**
 * Returns the active or cached Gemini model ID
 * @returns {string}
 */
function getActiveGeminiModel() {
  if (_activeGeminiModel) return _activeGeminiModel;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('bb_gemini_model') || '';
  }
  return '';
}

/**
 * Returns the active Gemini API mode ('interactions' or 'generateContent')
 * @returns {string}
 */
function getActiveGeminiApiMode() {
  if (_activeGeminiApiMode) return _activeGeminiApiMode;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('bb_gemini_api_mode') || 'interactions';
  }
  return 'interactions';
}

/**
 * Sets the active Gemini API mode
 * @param {string} mode
 */
function setActiveGeminiApiMode(mode) {
  _activeGeminiApiMode = mode || 'interactions';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bb_gemini_api_mode', _activeGeminiApiMode);
  }
}

/**
 * Sets the active Gemini model, API version, and protocol mode
 * @param {string} model
 * @param {string} [apiVersion]
 * @param {string} [apiMode]
 */
function setActiveGeminiModel(model, apiVersion, apiMode) {
  _activeGeminiModel = model || '';
  _activeGeminiApiVersion = apiVersion || 'v1beta';
  if (apiMode) _activeGeminiApiMode = apiMode;
  if (typeof localStorage !== 'undefined') {
    if (model) {
      localStorage.setItem('bb_gemini_model', model);
      localStorage.setItem('bb_gemini_api_version', _activeGeminiApiVersion);
      if (apiMode) localStorage.setItem('bb_gemini_api_mode', apiMode);
    } else {
      localStorage.removeItem('bb_gemini_model');
      localStorage.removeItem('bb_gemini_api_version');
      localStorage.removeItem('bb_gemini_api_mode');
    }
  }
}

/**
 * Parses Gemini response text from either classic generateContent or modern Interactions API payloads
 * @param {Object} data
 * @returns {string|null}
 */
function parseGeminiResponse(data) {
  if (!data) return null;

  // 1. Classic generateContent response: candidates[0].content.parts[...].text
  if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
    var cand = data.candidates[0];
    if (cand && cand.content && Array.isArray(cand.content.parts) && cand.content.parts.length > 0) {
      var partsText = cand.content.parts.map(function(p) { return p.text || ''; }).join('').trim();
      if (partsText) return partsText;
    }
  }

  // 2. Convenience output text fields
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (typeof data.outputText === 'string' && data.outputText.trim()) {
    return data.outputText.trim();
  }

  // 3. Interactions API steps timeline: find model_output step
  if (Array.isArray(data.steps)) {
    var outputParts = [];
    for (var s = 0; s < data.steps.length; s++) {
      var step = data.steps[s];
      if (step && (step.type === 'model_output' || step.type === 'output') && Array.isArray(step.content)) {
        for (var c = 0; c < step.content.length; c++) {
          var item = step.content[c];
          if (item && item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
            outputParts.push(item.text.trim());
          }
        }
      }
    }
    if (outputParts.length > 0) {
      return outputParts.join('\n\n').trim();
    }
  }

  return null;
}

/**
 * Extracts error message string from Gemini API responses (supporting both array and object error envelopes)
 * @param {Object|Array} data
 * @param {string} [fallback]
 * @returns {string}
 */
function extractGeminiErrorMessage(data, fallback) {
  if (!data) return fallback || 'Unknown error';
  var errObj = null;
  if (Array.isArray(data) && data.length > 0 && data[0].error) {
    errObj = data[0].error;
  } else if (data && data.error) {
    errObj = data.error;
  }
  if (errObj && errObj.message) {
    return errObj.message;
  }
  return fallback || 'Unknown error';
}

/**
 * Returns the most recent error message or status from Google Gemini API calls
 * @returns {string}
 */
function getLastGeminiError() {
  return _lastGeminiError;
}

/**
 * Queries Google ModelService.ListModels to dynamically discover available models
 * @param {string} [apiKey]
 * @returns {Promise<{ ok: boolean, models: Array<{ id: string, apiVersion: string, displayName: string }>, error?: string }>
 */
async function listAvailableGeminiModels(apiKey) {
  var rawKey = apiKey || getGeminiApiKey();
  var key = (rawKey || '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) return { ok: false, models: [], error: 'No API key provided.' };

  var versions = ['v1beta', 'v1'];
  var discovered = [];
  var lastError = '';

  for (var v = 0; v < versions.length; v++) {
    var ver = versions[v];
    var endpoint = 'https://generativelanguage.googleapis.com/' + ver + '/models?key=' + encodeURIComponent(key);

    try {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = controller ? setTimeout(function() { controller.abort(); }, 8000) : null;

      var resp = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined
      });

      if (timer) clearTimeout(timer);

      if (resp.ok) {
        var data = await resp.json();
        var rawList = (data && Array.isArray(data.models)) ? data.models : [];
        for (var i = 0; i < rawList.length; i++) {
          var m = rawList[i];
          var methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          if (methods.includes('generateContent') || methods.includes('interactions')) {
            var cleanId = (m.name || '').replace(/^models\//, '');
            if (cleanId && !discovered.some(function(d) { return d.id === cleanId; })) {
              discovered.push({
                id: cleanId,
                apiVersion: ver,
                displayName: m.displayName || cleanId
              });
            }
          }
        }
        if (discovered.length > 0) {
          break;
        }
      } else {
        var errBody = null;
        try { errBody = await resp.json(); } catch (_) {}
        var msg = extractGeminiErrorMessage(errBody, 'HTTP ' + resp.status + (resp.statusText ? ' ' + resp.statusText : ''));
        lastError = msg;
        if (/API_KEY_INVALID|PERMISSION_DENIED|FAILED_PRECONDITION/i.test(msg)) {
          return { ok: false, models: [], error: msg };
        }
      }
    } catch (err) {
      lastError = (err && err.message) ? err.message : String(err);
    }
  }

  if (discovered.length > 0) {
    var priorityOrder = [
      'gemini-3.8-flash',
      'gemini-3.8-pro',
      'gemini-3.0-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash-lite-preview',
      'gemini-1.5-pro',
      'gemini-pro'
    ];

    discovered.sort(function(a, b) {
      var aIdx = priorityOrder.indexOf(a.id);
      var bIdx = priorityOrder.indexOf(b.id);
      if (aIdx === -1) aIdx = 999;
      if (bIdx === -1) bIdx = 999;
      return aIdx - bIdx;
    });

    return { ok: true, models: discovered };
  }

  return { ok: false, models: [], error: lastError || 'No models supporting generateContent found.' };
}

/**
 * Calls Google Gemini REST API using Generative Language endpoint
 * @param {string} prompt
 * @param {string} [apiKey]
 * @param {Object} [options] - Optional execution configuration { model, apiVersion, skipSystemPrompt }
 * @returns {Promise<string|null>}
 */
async function callGeminiApi(prompt, apiKey, options) {
  var rawKey = apiKey || getGeminiApiKey();
  var key = (rawKey || '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) return null;
  _lastGeminiError = '';
  options = options || {};

  var systemPrompt = "You are Stedfast, the official AI mentor and portal assistant for the 1st Petaling Jaya Boys' Brigade Web Portal in Malaysia.\n"
    + "Company Knowledge Ground Truth:\n"
    + "• Sponsoring Body: Trinity Methodist Church Petaling Jaya (TMC PJ).\n"
    + "• Company Motto: Sure & Stedfast (Hebrews 6:19 - 'Which hope we have as an anchor of the soul, both sure and stedfast').\n"
    + "• Founded: 1954 at TMC PJ, the premier Boys' Brigade company in Petaling Jaya, Malaysia.\n"
    + "• Full Company Parade: Every Saturday from 2:15 PM – 6:00 PM at TMC PJ.\n"
    + "• Band Rehearsals: Saturdays from 9:30 AM – 11:30 AM prior to parade (woodwind, brass, percussion).\n"
    + "• Uniform Kits: Kit A (Ceremonial/Anchor Blue Tunic), Kit B (Day Polo/Anchor Gold), Kit C (PT/Sports). Refer to company calendar for attire.\n"
    + "• Attendance Rule: A minimum 80% attendance threshold strictly qualifies members for the BB One Year Service award.\n"
    + "• Sections: Pre-Junior (Ages 6–8), Junior (Ages 9–11), Senior (Ages 12–19), Officers (Adult leaders).\n"
    + "• Platoons: Alpha, Papa, Zulu, Hotel.\n"
    + "• Portal Navigation Tabs: Member Hub, Weekly Parade, Forms & Store, My Badges, Leaderboard, Resources, Support Forum, 1stPJ Arcade.\n"
    + "• 1stPJ Arcade: Daily Wordle (+15 credits on solve), Timed BB Trivia (+5 credits/question), Streaks & Credits, Cosmetic Shop, Arcade Leaderboard.\n"
    + "Core Rules for Responses:\n"
    + "1. Respond warmly, intelligently, and helpfully in fluent English.\n"
    + "2. Format your reply with clean Markdown (bolding, bullet points, paragraphs). Do NOT use any emojis.\n"
    + "3. STRICT PROHIBITION: NEVER mention internal task codes, bug codes, or ticket numbers (never say TSK, BUG, or similar codes).\n"
    + "4. PRIVACY: Never reveal other members' individual attendance percentages, points, or demerits. If the prompt context provides the authenticated user's own stats, you may answer questions about their own standing.\n"
    + "5. Navigation: If user asks where something is, specify the exact portal tab and give concise instructions.";

  var candidates = [];
  if (options.model) {
    candidates.push({
      model: options.model,
      apiVersion: options.apiVersion || _activeGeminiApiVersion || 'v1beta',
      apiMode: options.apiMode || getActiveGeminiApiMode() || 'interactions'
    });
  } else {
    var storedModel = getActiveGeminiModel();
    var storedVer = (typeof localStorage !== 'undefined' && localStorage.getItem('bb_gemini_api_version')) || _activeGeminiApiVersion || 'v1beta';
    var storedMode = (typeof localStorage !== 'undefined' && localStorage.getItem('bb_gemini_api_mode')) || getActiveGeminiApiMode() || 'interactions';
    if (storedModel) {
      candidates.push({ model: storedModel, apiVersion: storedVer, apiMode: storedMode });
    }
    var defaultCandidates = [
      { apiVersion: 'v1beta', model: 'gemini-3.8-flash', apiMode: 'interactions' },
      { apiVersion: 'v1beta', model: 'gemini-flash-latest', apiMode: 'interactions' },
      { apiVersion: 'v1beta', model: 'gemini-3.8-flash', apiMode: 'generateContent' },
      { apiVersion: 'v1beta', model: 'gemini-2.5-flash', apiMode: 'generateContent' },
      { apiVersion: 'v1beta', model: 'gemini-2.5-flash-lite', apiMode: 'generateContent' },
      { apiVersion: 'v1',     model: 'gemini-3.8-flash', apiMode: 'generateContent' }
    ];
    for (var d = 0; d < defaultCandidates.length; d++) {
      var item = defaultCandidates[d];
      if (!candidates.some(function(c) { return c.model === item.model && c.apiVersion === item.apiVersion && c.apiMode === item.apiMode; })) {
        candidates.push(item);
      }
    }
  }

  var capturedErrors = [];

  for (var c = 0; c < candidates.length; c++) {
    var target = candidates[c];
    var endpoint = '';
    var requestBody = {};
    var headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': key
    };

    if (target.apiMode === 'interactions') {
      endpoint = 'https://generativelanguage.googleapis.com/' + target.apiVersion + '/interactions?model=' + encodeURIComponent(target.model) + '&key=' + encodeURIComponent(key);
      requestBody = {
        model: target.model,
        input: prompt
      };
      if (!options.skipSystemPrompt) {
        requestBody.system_instruction = systemPrompt;
      }
      requestBody.generation_config = {
        max_output_tokens: options.skipThinking ? (options.maxTokens || 60) : (options.maxTokens || 800)
      };
      if (options.skipThinking) {
        requestBody.generation_config.thinking_level = 'minimal';
      }
    } else {
      endpoint = 'https://generativelanguage.googleapis.com/' + target.apiVersion + '/models/' + target.model + ':generateContent?key=' + encodeURIComponent(key);
      requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: options.skipThinking ? (options.maxTokens || 60) : (options.maxTokens || 800)
        }
      };
      if (options.skipThinking) {
        requestBody.generationConfig.thinkingConfig = {
          thinkingLevel: 'MINIMAL',
          thinkingBudget: 0
        };
      }
      if (target.apiVersion === 'v1beta' && !options.skipSystemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }
    }

    try {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutMs = (options && typeof options.timeoutMs === 'number') ? options.timeoutMs : (options.skipThinking ? 8000 : 20000);
      var timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

      var resp = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller ? controller.signal : undefined
      });

      if (timer) clearTimeout(timer);

      if (resp.ok) {
        var data = await resp.json();
        var replyText = parseGeminiResponse(data);
        if (replyText) {
          _lastGeminiError = '';
          setActiveGeminiModel(target.model, target.apiVersion, target.apiMode);
          return replyText;
        }
      } else {
        var errBody = null;
        try {
          errBody = await resp.json();
        } catch (_) {
          // ignore non-json error responses
        }
        var errMsg = extractGeminiErrorMessage(errBody, 'HTTP ' + resp.status + (resp.statusText ? ' ' + resp.statusText : ''));

        // If thinkingConfig is unsupported on this model, retry immediately without it
        if (resp.status === 400 && errMsg.includes('thinkingConfig') && requestBody.generationConfig && requestBody.generationConfig.thinkingConfig) {
          delete requestBody.generationConfig.thinkingConfig;
          var retryResp = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: controller ? controller.signal : undefined
          });
          if (retryResp.ok) {
            var retryData = await retryResp.json();
            var retryText = parseGeminiResponse(retryData);
            if (retryText) {
              _lastGeminiError = '';
              setActiveGeminiModel(target.model, target.apiVersion, target.apiMode);
              return retryText;
            }
          }
        }

        capturedErrors.push(errMsg);
        console.warn('Gemini API [' + target.apiMode + '/' + target.apiVersion + '/' + target.model + '] HTTP ' + resp.status + ': ' + errMsg);

        if (/API_KEY_INVALID|PERMISSION_DENIED|FAILED_PRECONDITION/i.test(errMsg)) {
          _lastGeminiError = errMsg;
          return null;
        }
      }
    } catch (err) {
      var isAbort = err && (err.name === 'AbortError' || err.message === 'The user aborted a request.');
      var fetchErrMsg = isAbort ? ('Request timed out after ' + Math.round(timeoutMs / 1000) + ' seconds.') : ((err && err.message) ? err.message : String(err));
      capturedErrors.push(fetchErrMsg);
      console.warn('Gemini API fetch error with ' + target.model + ':', err);
    }
  }

  if (capturedErrors.length > 0) {
    var highPriError = capturedErrors.find(function(e) {
      return /API_KEY_INVALID|PERMISSION_DENIED|FAILED_PRECONDITION|quota|RESOURCE_EXHAUSTED/i.test(e);
    });
    _lastGeminiError = highPriError || capturedErrors[0];
  }

  return null;
}

// ── Forum Reply Notifications Synchronization ──────────────────────────────
function syncForumNotifications(posts) {
  var list = Array.isArray(posts) ? posts : (typeof forumPosts !== 'undefined' ? forumPosts : []);
  if (!Array.isArray(list) || !list.length) return;

  if (typeof window !== 'undefined' && typeof window.syncForumNotifications === 'function' && window.syncForumNotifications !== syncForumNotifications) {
    window.syncForumNotifications(list);
    return;
  }

  var notifArray = (typeof window !== 'undefined' && Array.isArray(window._allPortalNotifications))
    ? window._allPortalNotifications
    : ((typeof global !== 'undefined' && Array.isArray(global._allPortalNotifications)) ? global._allPortalNotifications : null);
  if (!notifArray) return;

  var myEmail = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : '';
  var myIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || '').toLowerCase().trim() : '';
  var myName = (typeof sessionGet === 'function') ? (sessionGet('name') || '').toLowerCase().trim() : '';
  if (!myEmail && !myIc && !myName) return;

  list.forEach(function(p) {
    if (!p || !p.id || !Array.isArray(p.replies) || !p.replies.length) return;

    var pEmail = (p.authorEmail || '').toLowerCase().trim();
    var pIc = (p.authorIc || '').toLowerCase().trim();
    var pName = (p.authorName || '').toLowerCase().trim();

    var isPostAuthor = (pEmail && myEmail && pEmail === myEmail)
      || (pIc && myIc && pIc === myIc)
      || (pName && myName && pName === myName);
    if (!isPostAuthor) return;

    p.replies.forEach(function(r, idx) {
      if (!r) return;
      var rId = r.id || (p.id + '-rep-' + idx);
      var notifId = 'notif-forum-reply-' + rId;

      var rEmail = (r.authorEmail || '').toLowerCase().trim();
      var rIc = (r.authorIc || '').toLowerCase().trim();
      var rName = (r.authorName || '').toLowerCase().trim();

      var isSelfReply = (rEmail && myEmail && rEmail === myEmail)
        || (rIc && myIc && rIc === myIc)
        || (rName && myName && rName === myName);
      if (isSelfReply) return;

      var existing = notifArray.find(function(n) { return n.id === notifId; });
      if (!existing) {
        var replierName = r.authorName || 'Someone';
        var cleanSnippet = (r.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanSnippet.length > 70) cleanSnippet = cleanSnippet.slice(0, 67) + '...';
        var initials = replierName.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'BB';

        notifArray.unshift({
          id: notifId,
          category: 'announcements',
          group: 'Today',
          avatarInitials: initials,
          icon: '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
          title: replierName + ' replied to your forum discussion',
          snippet: (p.title ? ('"' + p.title + '": ') : '') + (cleanSnippet || 'Tap to view discussion.'),
          time: r.date || 'Today',
          unread: true,
          action: function() {
            if (typeof switchTabNav === 'function') switchTabNav('forum');
            if (typeof openForumPostDetail === 'function') openForumPostDetail(p.id);
          }
        });
      }
    });
  });

  if (typeof window !== 'undefined' && typeof window.renderNotifications === 'function') {
    window.renderNotifications();
  } else if (typeof global !== 'undefined' && typeof global.renderNotifications === 'function') {
    global.renderNotifications();
  }
}

// ── Persistence Layer ────────────────────────────────────────────────────────
async function loadForumPosts() {
  if (typeof fetchRemoteMemberPresence === 'function') {
    try { await fetchRemoteMemberPresence(); } catch (_) {}
  } else if (typeof window !== 'undefined' && typeof window.fetchRemoteMemberPresence === 'function') {
    try { await window.fetchRemoteMemberPresence(); } catch (_) {}
  }
  try {
    if (typeof supa !== 'undefined' && typeof supa.getConfig === 'function') {
      var remote = await supa.getConfig('bb_forum_posts');
      if (Array.isArray(remote)) {
        forumPosts = remote;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('bb_forum_posts', JSON.stringify(forumPosts));
          }
        } catch (_) {}
        renderForumFeed();
        syncForumNotifications(forumPosts);
        return;
      }
    }
  } catch (err) {
    console.warn('Could not load forum posts from Supabase:', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      var local = localStorage.getItem('bb_forum_posts');
      if (local) {
        var parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          forumPosts = parsed;
          renderForumFeed();
          syncForumNotifications(forumPosts);
          return;
        }
      }
    }
  } catch (_) {}

  forumPosts = JSON.parse(JSON.stringify(DEFAULT_FORUM_POSTS));
  renderForumFeed();
  syncForumNotifications(forumPosts);
}

async function saveForumPosts(posts) {
  forumPosts = posts || forumPosts;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bb_forum_posts', JSON.stringify(forumPosts));
    }
  } catch (_) {}

  try {
    if (typeof supa !== 'undefined') {
      if (typeof supa.setConfig === 'function') {
        await supa.setConfig('bb_forum_posts', forumPosts);
      } else {
        var client = supa.getClient ? supa.getClient() : supa;
        if (client && typeof client.upsert === 'function') {
          await client.upsert('bb_config', { key: 'bb_forum_posts', value: JSON.stringify(forumPosts) }, 'key');
        }
      }
    }
  } catch (err) {
    console.warn('Could not persist forum posts to Supabase:', err);
  }
  renderForumFeed();
  syncForumNotifications(forumPosts);
}

// ── DOM Element Safe Removal Helper ──────────────────────────────────────────
function removeDomElement(el) {
  if (!el) return;
  if (typeof el.remove === 'function') {
    el.remove();
  } else if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
    el.parentNode.removeChild(el);
  }
}

// ── Forum Member Avatar & Cosmetic Helper ────────────────────────────────────
/**
 * Renders an avatar element for a forum author or replier,
 * reflecting custom outlines, profile photos, and equipped cosmetics (headwear, badges).
 * Supports custom tooltips (e.g. "Posted by Jeshua Koh (Sergeant)").
 */
function getForumMemberAvatarHtml(name, emailOrIc, size, customTooltip, extraStyle) {
  var sz = size || 24;
  var fs = Math.max(9, Math.round(sz * 0.45));
  var styleAttr = extraStyle ? (' ' + extraStyle) : '';

  if (!name || name === 'Anonymous' || name === 'Anonymous Member') {
    var anonTooltip = customTooltip || 'Anonymous Member';
    var safeAnonTooltip = (typeof escapeHtml === 'function') ? escapeHtml(anonTooltip) : anonTooltip;
    return '<span class="forum-avatar-mini" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:var(--surface-tint);color:var(--text-muted);cursor:default;line-height:1;position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;' + styleAttr + '" title="' + safeAnonTooltip + '" aria-label="' + safeAnonTooltip + '">?</span>';
  }

  var cleanNm = String(name || '').trim();
  var cleanId = String(emailOrIc || '').trim();

  var isCreatorFn = (typeof isPortalCreator === 'function')
    ? isPortalCreator
    : (typeof window !== 'undefined' && typeof window.isPortalCreator === 'function' ? window.isPortalCreator : null);
  var isCreator = isCreatorFn
    ? isCreatorFn(cleanNm, cleanId)
    : (/jeshua\s+koh/i.test(cleanNm) || cleanId.toLowerCase() === 'jeshuakoh2008@gmail.com');

  var safeName = (typeof escapeHtml === 'function') ? escapeHtml(cleanNm) : cleanNm;
  var tooltip = customTooltip || (safeName + (isCreator ? ' (Portal Creator)' : ''));
  var safeTooltip = (typeof escapeHtml === 'function') ? escapeHtml(tooltip) : tooltip;

  var getPhotoFn = (typeof getMemberAvatarUrl === 'function')
    ? getMemberAvatarUrl
    : (typeof window !== 'undefined' && typeof window.getMemberAvatarUrl === 'function' ? window.getMemberAvatarUrl : null);
  var photoUrl = getPhotoFn ? getPhotoFn(cleanNm, cleanId) : null;

  var getOutlineFn = (typeof getMemberAvatarOutline === 'function')
    ? getMemberAvatarOutline
    : (typeof window !== 'undefined' && typeof window.getMemberAvatarOutline === 'function' ? window.getMemberAvatarOutline : null);
  var outlineInfo = getOutlineFn
    ? getOutlineFn(cleanId || cleanNm, cleanNm)
    : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);

  var outlineHtml = '';
  var hasOutlineCls = '';
  if (outlineInfo && outlineInfo.style && outlineInfo.style !== 'none' && outlineInfo.config && outlineInfo.config.className) {
    hasOutlineCls = ' has-custom-outline avatar-outline-container';
    outlineHtml = '<span class="avatar-outline-overlay ' + outlineInfo.config.className + '" style="position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:2;box-sizing:border-box;" aria-hidden="true"></span>';
  }

  var getCosmeticFn = (typeof getMemberCosmetic === 'function')
    ? getMemberCosmetic
    : (typeof window !== 'undefined' && typeof window.getMemberCosmetic === 'function' ? window.getMemberCosmetic : null);
  var cosmeticInfo = getCosmeticFn ? getCosmeticFn(cleanId || cleanNm, cleanNm) : null;

  var cosmeticHtml = '';
  if (cosmeticInfo && cosmeticInfo.id && cosmeticInfo.id !== 'none' && cosmeticInfo.svg) {
    var isHeadwear = (cosmeticInfo.category === 'headwear' || (cosmeticInfo.config && cosmeticInfo.config.category === 'headwear'));
    var headwearCls = isHeadwear ? ' is-headwear' : '';
    var cosCls = sz >= 40 ? 'cosmetic-lg' : (sz >= 28 ? 'cosmetic-md' : (sz >= 22 ? 'cosmetic-sm' : 'cosmetic-xs'));
    var safeCosTitle = (typeof escapeHtml === 'function') ? escapeHtml(cosmeticInfo.name || '') : (cosmeticInfo.name || '');
    cosmeticHtml = '<span class="avatar-cosmetic-badge ' + cosCls + headwearCls + '" data-cosmetic-id="' + (typeof escapeHtml === 'function' ? escapeHtml(cosmeticInfo.id) : cosmeticInfo.id) + '" title="' + safeCosTitle + '" aria-hidden="true">' + cosmeticInfo.svg + '</span>';
  }

  // 4. Live Presence Status Dot
  var pInfo = null;
  if (typeof getMemberPresenceStatus === 'function') {
    pInfo = getMemberPresenceStatus({ name: cleanNm, email: cleanId, ic: cleanId });
  } else if (typeof window !== 'undefined' && typeof window.getMemberPresenceStatus === 'function') {
    pInfo = window.getMemberPresenceStatus({ name: cleanNm, email: cleanId, ic: cleanId });
  } else {
    pInfo = { status: 'offline', label: 'Offline', color: '#6b7280' };
  }
  var dotColor = (pInfo && pInfo.color) ? pInfo.color : '#6b7280';
  var dotLabel = (pInfo && pInfo.label) ? pInfo.label : 'Offline';
  var pStatus = (pInfo && pInfo.status) ? pInfo.status : 'offline';
  var dotTitle = safeName + ' (' + dotLabel + ')';
  var dotSz = Math.max(7, Math.round(sz * 0.28));
  var presId = (cleanId && cleanId.indexOf('@') !== -1) ? cleanId : (cleanId || cleanNm);
  var dotHtml = '<span class="nav-avatar-status-dot avatar-status-dot status-' + pStatus + '" data-presence-id="' + (typeof escapeHtml === 'function' ? escapeHtml(presId) : presId) + '" data-presence-name="' + (typeof escapeHtml === 'function' ? escapeHtml(cleanNm) : cleanNm) + '" style="position:absolute;bottom:-1px;right:-1px;width:' + dotSz + 'px;height:' + dotSz + 'px;border-radius:50%;background:' + dotColor + ';border:1.5px solid var(--bg-card,#1e293b);z-index:99;box-sizing:border-box;" title="' + (typeof escapeHtml === 'function' ? escapeHtml(dotTitle) : dotTitle) + '" aria-label="' + (typeof escapeHtml === 'function' ? escapeHtml(dotLabel) : dotLabel) + '"></span>';

  var overflowRule = (hasOutlineCls || cosmeticHtml) ? 'visible' : 'hidden';

  if (photoUrl) {
    return '<span class="forum-avatar-mini' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;padding:0;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;' + styleAttr + '" title="' + safeTooltip + '" aria-label="' + safeTooltip + '"><img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt="' + safeName + '"/>' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  if (isCreator) {
    var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
    var creatorCls = isRgb ? ' creator-outline-avatar creator-rgb-avatar' : '';
    return '<span class="forum-avatar-mini' + creatorCls + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:#083830;color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;' + styleAttr + '" title="' + safeTooltip + '" aria-label="' + safeTooltip + '">J' + outlineHtml + cosmeticHtml + dotHtml + '</span>';
  }

  var initial = (typeof getMemberAvatarInitial === 'function')
    ? getMemberAvatarInitial(cleanNm)
    : (cleanNm.charAt(0).toUpperCase() || '?');
  var color = (typeof getMemberAvatarColor === 'function')
    ? getMemberAvatarColor(cleanNm)
    : '#0369a1';

  return '<span class="forum-avatar-mini' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + fs + 'px;background:' + color + ';color:#ffffff;overflow:' + overflowRule + ';position:relative;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;' + styleAttr + '" title="' + safeTooltip + '" aria-label="' + safeTooltip + '">' + (typeof escapeHtml === 'function' ? escapeHtml(initial) : initial) + outlineHtml + cosmeticHtml + dotHtml + '</span>';
}

// ── User Permission Helper for Forum ─────────────────────────────────────────
function getForumUserPermissions(post) {
  var isSuper = false;

  if (typeof RBAC !== 'undefined') {
    if (typeof RBAC.isSuperAdmin === 'function') isSuper = RBAC.isSuperAdmin();
  }

  var email = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : '';
  var role = (typeof sessionGet === 'function') ? (sessionGet('role') || '').toLowerCase().trim() : '';
  var isSuperAdmin = isSuper || role === 'super_admin';
  var isAuthor = !!(post && post.authorEmail && email && (post.authorEmail.toLowerCase().trim() === email));

  return {
    isAdmin: isSuperAdmin,
    isSuperAdmin: isSuperAdmin,
    isAuthor: isAuthor,
    canEdit: isSuperAdmin,
    canDelete: isSuperAdmin,
    canChangeStatus: isSuperAdmin,
    canReply: true
  };
}

// ── Automated Issue Triage Engine (Zero Emojis) ──────────────────────────────
function triageUserQuery(query) {
  var q = (query || '').toLowerCase().trim();
  var isBugOrError = q.indexOf('bug') !== -1 ||
                     q.indexOf('error') !== -1 ||
                     q.indexOf('glitch') !== -1 ||
                     q.indexOf('issue') !== -1 ||
                     q.indexOf('broken') !== -1 ||
                     q.indexOf('not working') !== -1 ||
                     q.indexOf('failed') !== -1 ||
                     q.indexOf('problem') !== -1 ||
                     q.indexOf('cannot') !== -1 ||
                     q.indexOf("can't") !== -1 ||
                     q.indexOf('frozen') !== -1 ||
                     q.indexOf('stuck') !== -1 ||
                     q.indexOf('crash') !== -1;

  if (!isBugOrError) return null;

  var category = 'bugs';
  var categoryLabel = 'Bugs & Glitches';
  var tag = 'bug: ui-glitch';

  if (q.indexOf('badge') !== -1 || q.indexOf('president') !== -1 || q.indexOf('founder') !== -1) {
    category = 'badges';
    categoryLabel = 'Badges & Awards';
    tag = 'bug: badge-tracker';
  } else if (q.indexOf('attendance') !== -1 || q.indexOf('sync') !== -1 || q.indexOf('sheet') !== -1) {
    category = 'attendance';
    categoryLabel = 'Attendance & Standings';
    tag = 'bug: attendance-sync';
  } else if (q.indexOf('order') !== -1 || q.indexOf('uniform') !== -1 || q.indexOf('cart') !== -1 || q.indexOf('price') !== -1) {
    category = 'store';
    categoryLabel = 'Uniform Store';
    tag = 'bug: store-checkout';
  } else if (q.indexOf('login') !== -1 || q.indexOf('password') !== -1 || q.indexOf('admin') !== -1 || q.indexOf('account') !== -1) {
    category = 'account';
    categoryLabel = 'Account & Access';
    tag = 'account-issue';
  }

  return {
    category: category,
    categoryLabel: categoryLabel,
    tag: tag,
    suggestedTitle: query.length > 50 ? (query.slice(0, 47) + '...') : query
  };
}

// ── Helper Agent Conversational, Navigation & Privacy Engine ────────────────

/**
 * Maps all 12 core portal modules for intelligent conversational navigation
 */
var PORTAL_NAVIGATION_MAP = [
  {
    target: 'member',
    tabName: 'Member Hub',
    keywords: ['attendance', 'my attendance', 'points', 'my points', 'member card', 'qr', 'profile', 'my profile', 'rank', 'squad', 'platoon', 'change password', 'sign out everywhere', 'notification inbox', 'notifications', 'order history', 'upload picture', 'profile photo', 'avatar'],
    title: 'Member Hub & Attendance Status',
    description: 'Your personalized **Member Hub** contains your digital member profile card, confidential attendance %, uniform inspection points, platoon assignment, order history, and account settings.',
    actions: [
      { label: 'Go to Member Hub', action: 'navigate', target: 'member', icon: 'member' }
    ]
  },
  {
    target: 'parade',
    tabName: 'Weekly Parade',
    keywords: ['parade', 'parade schedule', 'parade time', 'timing', 'saturday parade', 'band rehearsal', 'brass band', 'venue', 'trinity methodist', 'tmc pj', 'where is parade', 'duty roster', 'kit notice', 'parade kit'],
    title: 'Weekly Parade Schedule',
    description: 'The **Weekly Parade** tab displays parade schedule notices, timing (**Saturdays 2:15 PM – 6:00 PM**; Brass Band **9:30 AM – 11:30 AM**), venue at **Trinity Methodist Church PJ**, upcoming duty roster, and parade attire announcements.',
    actions: [
      { label: 'Go to Weekly Parade', action: 'navigate', target: 'parade', icon: 'parade' }
    ]
  },
  {
    target: 'badges',
    tabName: 'My Badges',
    keywords: ['badge', 'badges', 'my badges', 'proficiency', 'service awards', 'special awards', 'compulsory', 'target', 'founder', 'president', 'achievement tracker', 'grid view', 'list view', 'basic advanced'],
    title: 'My Badges Achievement Tracker',
    description: 'The **My Badges** tab lets you track earned proficiency, service, compulsory, and special awards in either **Grid View (5 per row)** or **List View**, with basic and advanced tier options.',
    actions: [
      { label: 'Go to My Badges', action: 'navigate', target: 'badges', icon: 'badges' }
    ]
  },
  {
    target: 'attendance',
    tabName: 'Leaderboard',
    keywords: ['leaderboard', 'standings', 'squad leaderboard', 'platoon ranking', 'top squad', 'squad standings', 'company score', 'achievement tiers', 'confidential tiers'],
    title: 'Company Leaderboard & Standings',
    description: 'The **Leaderboard** tab features live squad and platoon standings, attendance achievement tiers (Emerald 100%, Blue ≥90%, Gold ≥80%, Orange <80%), and company member directory status.',
    actions: [
      { label: 'Go to Leaderboard', action: 'navigate', target: 'attendance', icon: 'attendance' }
    ]
  },
  {
    target: 'order',
    tabName: 'Forms & Store',
    keywords: ['store', 'uniform store', 'order uniform', 'buy uniform', 'polo', 'boots', 'forage cap', 'belt', 'cross belt', 'haversack', 'uniform catalog', 'event form', 'event registration', 'order checkout'],
    title: 'Forms & Uniform Store',
    description: 'The **Forms & Store** tab allows you to browse official BB uniform articles (Kit A, B, C, accessories, drill boots), submit uniform orders with payment proof upload, and fill out dynamic company event forms.',
    actions: [
      { label: 'Go to Forms & Store', action: 'navigate', target: 'order', icon: 'store' }
    ]
  },
  {
    target: 'arcade',
    tabName: '1stPJ Arcade',
    keywords: ['arcade', 'wordle', 'daily wordle', 'trivia', 'bb trivia', 'quiz', 'puzzle', 'streak', 'credits', 'cosmetic shop', 'avatar outline', 'chat titles'],
    title: '1stPJ Arcade (Wordle & Trivia)',
    description: 'The **1stPJ Arcade** features **Daily Wordle** (5-letter BB terminology), **Timed BB Trivia** (5 daily handbook questions), daily streaks, credits awards, and the **Cosmetic Shop**.',
    actions: [
      { label: 'Go to 1stPJ Arcade', action: 'navigate', target: 'arcade', icon: 'arcade' }
    ]
  },
  {
    target: 'tasks',
    tabName: 'Projects & Tasks',
    keywords: ['tasks', 'projects', 'kanban', 'task board', 'nco tasks', 'department tasks', 'secretariat', 'logistics', 'media', 'hq', 'drag and drop'],
    title: 'Projects & Tasks Kanban Board',
    description: 'The **Projects & Tasks** board is designed for NCOs and Officers to collaborate across departments (HQ, Secretariat, Logistics, Media) across 5 columns (Brief, To Do, In Progress, Review, Done).',
    actions: [
      { label: 'Go to Projects & Tasks', action: 'navigate', target: 'tasks', icon: 'tasks' }
    ]
  },
  {
    target: 'resources',
    tabName: 'Company Resources',
    keywords: ['resources', 'handbook', 'manual', 'drill manual', 'syllabus', 'documents', 'download', 'pdf', 'forms download', 'guidelines'],
    title: 'Company Resources & Syllabi Hub',
    description: 'The **Company Resources** hub provides official handbook downloads, drill manuals, syllabi, and administrative documents with Google Drive preview cards.',
    actions: [
      { label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' }
    ]
  },
  {
    target: 'gallery',
    tabName: 'Media & Gallery',
    keywords: ['gallery', 'photos', 'videos', 'camp photos', 'parade pictures', 'highlights', 'story highlights', 'media reel', 'event photos'],
    title: 'Media Highlights & Gallery',
    description: 'The **Gallery** tab showcases company parade and camp photos, story highlight reels, fullscreen viewer, and high-definition video embeds.',
    actions: [
      { label: 'Go to Gallery', action: 'navigate', target: 'gallery', icon: 'gallery' }
    ]
  },
  {
    target: 'forum',
    tabName: 'Support Forum',
    keywords: ['forum', 'support forum', 'bugs forum', 'ask question', 'report bug', 'discussions', 'community forum', 'triage'],
    title: 'Support & Bug Forum',
    description: 'The **Support Forum** allows members to discuss uniform sizing, drill syllabi, badge rules, or report bugs and glitches for officer and developer review.',
    actions: [
      { label: 'Go to Support Forum', action: 'navigate', target: 'forum', icon: 'forum' }
    ]
  },
  {
    target: 'admin',
    tabName: 'Admin Console',
    keywords: ['admin', 'admin console', 'admin panel', 'back office', 'super admin', 'roles manager', 'blocklist', 'master sheet sync'],
    title: 'Officer Admin Console',
    description: 'The **Admin Console** is gated to verified Officers and Super Admins for member roster management, attendance synchronization, roles assignment, announcements broadcasting, and badge definitions.',
    actions: [
      { label: 'Open Admin Console', action: 'navigate', target: 'admin', icon: 'admin' }
    ]
  }
];

/**
 * Searches forum posts (open, resolved, bug reports) to enrich answers with community solutions
 * @param {string} query
 * @returns {Object|null}
 */
function searchForumPostsForHelper(query) {
  var posts = (typeof forumPosts !== 'undefined' && Array.isArray(forumPosts) && forumPosts.length)
    ? forumPosts
    : ((typeof window !== 'undefined' && Array.isArray(window.forumPosts) && window.forumPosts.length)
      ? window.forumPosts
      : DEFAULT_FORUM_POSTS);
  if (!posts || !posts.length) return null;

  var q = (query || '').toLowerCase().trim();
  var tokens = q.replace(/[?'"!,.]/g, ' ').split(/\s+/).filter(function(w) {
    return w.length > 2 && !/^(the|and|for|are|what|how|where|why|can|you|tell|about|with|from|this|that|please)$/i.test(w);
  });
  if (!tokens.length) return null;

  var bestPost = null;
  var bestScore = 0;

  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    var score = 0;
    var title = (p.title || '').toLowerCase();
    var content = (p.content || '').toLowerCase();
    var cat = (p.categoryLabel || p.category || '').toLowerCase();
    var tag = (p.tag || '').toLowerCase();
    var repliesText = '';
    if (Array.isArray(p.replies)) {
      repliesText = p.replies.map(function(r) { return (r.content || ''); }).join(' ').toLowerCase();
    }

    tokens.forEach(function(tok) {
      if (title.indexOf(tok) !== -1) score += 3;
      if (tag.indexOf(tok) !== -1) score += 2;
      if (cat.indexOf(tok) !== -1) score += 2;
      if (content.indexOf(tok) !== -1) score += 1;
      if (repliesText.indexOf(tok) !== -1) score += 1;
    });

    if (p.status === 'resolved' && score > 0) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestPost = p;
    }
  }

  if (bestPost && bestScore >= 3) {
    return { post: bestPost, score: bestScore };
  }
  return null;
}

/**
 * Formats a member name to standard Title Case (e.g. "jason koh" -> "Jason Koh")
 * @param {string} str
 * @returns {string}
 */
function formatMemberDisplayName(str) {
  if (!str) return '';
  return str.split(/\s+/).map(function(w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Detects whether the query requests data for the current user vs another member (Privacy Shield)
 * @param {string} query
 * @param {string} currentUserName
 * @returns {{ isSelf: boolean, otherName: string|null }}
 */
function detectTargetMemberName(query, currentUserName) {
  var q = (query || '').toLowerCase().trim();
  var isSelf = /\b(my|mine|i|me|am i|myself|my own)\b/i.test(q);
  if (isSelf) return { isSelf: true, otherName: null };

  var matchFn = (typeof isNameMatch === 'function')
    ? isNameMatch
    : (typeof window !== 'undefined' && typeof window.isNameMatch === 'function' ? window.isNameMatch : null);

  // 1. Natural language pattern matching for target member:
  // e.g. "what is Jason Koh's points", "points of Jason Koh", "Check Joash Lee attendance"
  var possessiveMatch = query.match(/(?:what\s+(?:is|are)\s+|check\s+|tell\s+me\s+|view\s+|show\s+|how\s+many\s+points\s+does\s+)([A-Za-z]+(?:\s+[A-Za-z]+){1,2})(?:'s|\s+has|\s+got|\s+earned)?\s+(?:points?|attendance|score|badges?)/i)
    || query.match(/(?:points?|attendance|score|badges?)\s+(?:of|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i)
    || query.match(/(?:check\s+|view\s+|see\s+)?([A-Za-z]+(?:\s+[A-Za-z]+){1,2})(?:'s|\s+has|\s+got|\s+earned)?\s+(?:points?|attendance|score|badges?)/i);

  if (possessiveMatch && possessiveMatch[1]) {
    var rawName = possessiveMatch[1].trim();
    if (!/^(my|mine|i|me|the|our|your|a|an)\b/i.test(rawName)) {
      var isCurUser = currentUserName && (matchFn ? matchFn(rawName, currentUserName) : (rawName.toLowerCase() === currentUserName.toLowerCase()));
      if (isCurUser) {
        return { isSelf: true, otherName: null };
      } else {
        return { isSelf: false, otherName: formatMemberDisplayName(rawName) };
      }
    }
  }

  // 2. Check known members from attendance cache if available
  try {
    var attCache = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('bb_master_att_cache') : null;
    if (attCache) {
      var parsedAtt = JSON.parse(attCache);
      if (parsedAtt && Array.isArray(parsedAtt.attendance)) {
        for (var a = 0; a < parsedAtt.attendance.length; a++) {
          var row = parsedAtt.attendance[a];
          if (row.name && (matchFn ? matchFn(row.name, q) : (q.indexOf(row.name.toLowerCase()) !== -1))) {
            var isCur = currentUserName && (matchFn ? matchFn(row.name, currentUserName) : (row.name.toLowerCase() === currentUserName.toLowerCase()));
            if (isCur) return { isSelf: true, otherName: null };
            return { isSelf: false, otherName: formatMemberDisplayName(row.name) };
          }
        }
      }
    }
  } catch (e) {}

  // 3. Check window.departmentMembers if available
  try {
    var depMembers = (typeof window !== 'undefined' && Array.isArray(window.departmentMembers)) ? window.departmentMembers : [];
    for (var d = 0; d < depMembers.length; d++) {
      var dm = depMembers[d];
      if (dm.name && (matchFn ? matchFn(dm.name, q) : (q.indexOf(dm.name.toLowerCase()) !== -1))) {
        var isCurD = currentUserName && (matchFn ? matchFn(dm.name, currentUserName) : (dm.name.toLowerCase() === currentUserName.toLowerCase()));
        if (isCurD) return { isSelf: true, otherName: null };
        return { isSelf: false, otherName: formatMemberDisplayName(dm.name) };
      }
    }
  } catch (e2) {}

  // 4. Resolve via resolveMemberDirectoryInfo helper (multi-word only, len >= 2)
  var words = q.replace(/[?'"!,.]/g, ' ').split(/\s+/).filter(Boolean);
  var resolveFn = (typeof resolveMemberDirectoryInfo === 'function')
    ? resolveMemberDirectoryInfo
    : (typeof window !== 'undefined' && typeof window.resolveMemberDirectoryInfo === 'function' ? window.resolveMemberDirectoryInfo : (typeof global !== 'undefined' && typeof global.resolveMemberDirectoryInfo === 'function' ? global.resolveMemberDirectoryInfo : null));

  if (resolveFn) {
    for (var len = 3; len >= 2; len--) {
      for (var i = 0; i <= words.length - len; i++) {
        var candidate = words.slice(i, i + len).join(' ');
        if (candidate.length < 3) continue;
        if (/^(what|when|where|which|how|who|why|is|are|the|show|tell|view|see|check|points|attendance|badge|badges|rank|squad|platoon|status|record|records)$/i.test(candidate)) continue;

        var match = resolveFn(candidate);
        if (match && match.name) {
          var isCurrentUser = currentUserName && (matchFn ? matchFn(match.name, currentUserName) : (match.name.toLowerCase() === currentUserName.toLowerCase()));
          if (isCurrentUser) {
            return { isSelf: true, otherName: null };
          } else {
            return { isSelf: false, otherName: formatMemberDisplayName(match.name) };
          }
        }
      }
    }
  }

  return { isSelf: false, otherName: null };
}

/**
 * Executes action button click from Stedfast chat
 * @param {string} actionType
 * @param {string} target
 */
function executeHelperAction(actionType, target) {
  if (actionType === 'navigate') {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      if (typeof toggleHelperAgent === 'function') toggleHelperAgent();
    }
    if (target === 'admin') {
      if (typeof openAdmin === 'function') openAdmin();
      return;
    }
    if (typeof switchTabNav === 'function') {
      switchTabNav(target);
    } else if (typeof switchTab === 'function') {
      switchTab(target);
    }
    if (typeof showToast === 'function') {
      var tabLabels = {
        member: 'Member Hub',
        parade: 'Weekly Parade',
        badges: 'My Badges',
        attendance: 'Leaderboard',
        order: 'Forms & Store',
        arcade: '1stPJ Arcade',
        tasks: 'Projects & Tasks',
        resources: 'Company Resources',
        gallery: 'Gallery',
        forum: 'Support Forum',
        home: 'Home'
      };
      showToast('Navigated to ' + (tabLabels[target] || target), 'info', 2000);
    }
  } else if (actionType === 'open-url') {
    if (target && typeof window !== 'undefined') {
      window.open(target, '_blank', 'noopener,noreferrer');
      if (typeof showToast === 'function') {
        showToast('Opening document...', 'info', 2000);
      }
    }
  } else if (actionType === 'view-thread') {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      if (typeof toggleHelperAgent === 'function') toggleHelperAgent();
    }
    if (typeof switchTabNav === 'function') {
      switchTabNav('forum');
    }
    setTimeout(function() {
      if (typeof openForumPostDetail === 'function') {
        openForumPostDetail(target);
      }
    }, 150);
  }
}

/**
 * Central intelligent query interpreter for Stedfast AI Helper
 * @param {string} userText
 * @returns {Object}
 */

/**
 * Safely accesses all company resources from active memory or window
 * @returns {Array}
 */
function getCompanyResourcesList() {
  if (typeof resources !== 'undefined' && Array.isArray(resources) && resources.length) {
    return resources;
  }
  if (typeof window !== 'undefined' && Array.isArray(window.resources) && window.resources.length) {
    return window.resources;
  }
  return [];
}

/**
 * Searches uploaded company resources and handbooks dynamically
 * @param {string} query
 * @returns {Object|null}
 */
function searchCompanyResourcesForHelper(query) {
  var list = getCompanyResourcesList();
  if (!list.length) return null;

  var q = (query || '').toLowerCase().trim();
  var tokens = q.replace(/[?'"!,.]/g, ' ').split(/\s+/).filter(function(w) {
    return w.length > 2 && !/^(the|and|for|are|what|how|where|why|can|you|tell|about|with|from|this|that|please|show|open|view|get|read)$/i.test(w);
  });
  if (!tokens.length) return null;

  var bestDoc = null;
  var bestScore = 0;

  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var score = 0;
    var title = (r.title || '').toLowerCase();
    var desc = (r.description || '').toLowerCase();
    var cat = (r.category || '').toLowerCase();
    var fType = (r.fileType || '').toLowerCase();

    tokens.forEach(function(tok) {
      if (title.indexOf(tok) !== -1) score += 4;
      if (desc.indexOf(tok) !== -1) score += 2;
      if (cat.indexOf(tok) !== -1) score += 2;
      if (fType.indexOf(tok) !== -1) score += 1;
    });

    if (score > bestScore) {
      bestScore = score;
      bestDoc = r;
    }
  }

  if (bestDoc && bestScore >= 2) {
    return { doc: bestDoc, score: bestScore };
  }
  return null;
}

/**
 * Resolves specific drill commands from the official BB Drill & Ceremonial Manual
 * @param {string} query
 * @returns {Object|null}
 */
function resolveDrillManualQuery(query) {
  var q = (query || '').toLowerCase().trim();
  var isDrillQuery = /\b(drill|kawad|marching|commands?|sedia|senang diri|rehatkan diri|ke kanan lurus|pandang depan|cepat jalan|berhenti|pusing)\b/i.test(q);
  if (!isDrillQuery) return null;

  var commandName = '';
  var executionDetail = '';

  if (/\b(sedia|attention)\b/i.test(q)) {
    commandName = 'Sedia (Attention)';
    executionDetail = 'Stand upright with heels together and touching, feet angled outward at 45°. Arms held straight down along the side seams of the trousers with fists clenched and thumbs pointing downwards along the seams. Head up, shoulders back, eyes looking straight ahead at eye level.';
  } else if (/\b(senang diri|stand at ease)\b/i.test(q)) {
    commandName = 'Senang Diri (Stand at Ease)';
    executionDetail = 'On the executive command, carry the left foot smartly approximately 12 inches to the left, keeping both legs straight and weight evenly balanced. Simultaneously bring both hands behind the back at waist level, right hand placed over the left with thumbs crossed and fingers extended.';
  } else if (/\b(rehatkan diri|stand easy)\b/i.test(q)) {
    commandName = 'Rehatkan Diri (Stand Easy)';
    executionDetail = 'Slightly relax the upper body and arms while keeping the feet firmly in place. Squad members must not move their feet or talk unless granted permission by the Squad Commander or Drill Instructor.';
  } else if (/\b(ke kanan lurus|kanan lurus|right dress)\b/i.test(q)) {
    commandName = 'Ke Kanan Lurus (Right Dress)';
    executionDetail = 'Turn head and eyes sharply to the right. The right-hand marker stands firm and keeps looking front. All other members raise their left arm horizontally to the left, fist lightly touching the shoulder of the member on the left, and adjust their position with quick short shuffling steps until in line.';
  } else if (/\b(pandang depan|eyes front)\b/i.test(q)) {
    commandName = 'Pandang Depan (Eyes Front)';
    executionDetail = 'Turn head and eyes sharply to the front while simultaneously dropping the left arm smartly to the side seam into the position of *Sedia*.';
  } else if (/\b(cepat jalan|quick march)\b/i.test(q)) {
    commandName = 'Cepat Jalan (Quick March)';
    executionDetail = 'Step off smartly with the left foot, taking a full 30-inch pace. March forward in standard quick time cadence (116–120 paces per minute), swinging arms straight from the shoulder with fists clenched and thumbs on top to chest level in front and waist level behind.';
  } else if (/\b(berhenti|halt|squad berhenti)\b/i.test(q)) {
    commandName = 'Squad Berhenti (Squad Halt)';
    executionDetail = 'The command is called as the right foot strikes the ground. Take a check pace with the left foot, then bring the right foot smartly alongside the left foot into the position of *Sedia* with a firm stamp.';
  } else if (/\b(ke belakang pusing|about turn)\b/i.test(q)) {
    commandName = 'Ke Belakang Pusing (About Turn)';
    executionDetail = 'Always turn clockwise through 180° through the right shoulder in three distinct counts: pivot 90° on right heel and left toe, balance on the left foot, complete the remaining 90° turn and bring the left foot smartly into *Sedia*.';
  } else if (/\b(ke kanan pusing|right turn)\b/i.test(q)) {
    commandName = 'Ke Kanan Pusing (Right Turn)';
    executionDetail = 'Turn 90° to the right by pivoting on the right heel and left toe. Bring the left leg smartly up and stamp it down beside the right into *Sedia*.';
  } else if (/\b(ke kiri pusing|left turn)\b/i.test(q)) {
    commandName = 'Ke Kiri Pusing (Left Turn)';
    executionDetail = 'Turn 90° to the left by pivoting on the left heel and right toe. Bring the right leg smartly up and stamp it down beside the left into *Sedia*.';
  } else if (/\b(keluar baris|fall out)\b/i.test(q)) {
    commandName = 'Keluar Baris (Fall Out)';
    executionDetail = 'Turn to the right, pause for two beats, and march off the parade square in quick time. Used for temporary dismissal or breaks.';
  } else if (/\b(bersurai|dismiss|dismissal)\b/i.test(q)) {
    commandName = 'Bersurai (Dismissal)';
    executionDetail = 'Turn to the right, salute if an Officer is present, pause for two beats, and march off the parade square. Marks the formal conclusion of the parade.';
  }

  // Find drill manual in Company Resources
  var drillDoc = null;
  var resList = getCompanyResourcesList();
  for (var i = 0; i < resList.length; i++) {
    var r = resList[i];
    var t = (r.title || '').toLowerCase();
    if (t.indexOf('drill') !== -1 || (r.category && r.category.toLowerCase().indexOf('drill') !== -1)) {
      drillDoc = r;
      break;
    }
  }

  var text = '';
  if (commandName && executionDetail) {
    text = '**BB Drill Manual — ' + commandName + '**:\n\n'
      + executionDetail + '\n\n'
      + 'This standard adheres strictly to the official **1st Petaling Jaya Boys\' Brigade Drill & Ceremonial Manual**.';
  } else {
    text = '**Official BB Drill & Ceremonial Standards**:\n\n'
      + 'Our company follows the standard Boys\' Brigade Malaysia drill manual for all static drill, marching, and ceremonial parades.\n\n'
      + '• **Core Static Commands**: *Sedia* (Attention), *Senang Diri* (Stand at Ease), *Rehatkan Diri* (Stand Easy), *Ke Kanan Lurus* (Right Dress), *Pandang Depan* (Eyes Front).\n'
      + '• **Turns & Marching**: *Ke Kanan/Kiri Pusing* (Turns), *Ke Belakang Pusing* (About Turn - always clockwise), *Cepat Jalan* (Quick March, 116–120 paces/min), *Squad Berhenti* (Halt).\n'
      + '• **Dismissals**: *Keluar Baris* (Temporary Break) and *Bersurai* (End of Parade Dismissal with Officer Salute).\n\n'
      + 'You can read and download the complete manual with diagrams in the **Company Resources** tab:';
  }

  var actions = [];
  if (drillDoc && drillDoc.url && drillDoc.url !== '#') {
    actions.push({ label: 'Open Drill Manual', action: 'open-url', target: drillDoc.url, icon: 'doc' });
  }
  actions.push({ label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' });

  return {
    text: text,
    triage: null,
    actions: actions,
    chips: [
      { label: 'Sedia command', query: 'What is sedia in drill manual?', icon: 'resources' },
      { label: 'Senang Diri', query: 'How to do senang diri?', icon: 'resources' },
      { label: 'Ke Kanan Lurus', query: 'What is ke kanan lurus command?', icon: 'resources' },
      { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
    ]
  };
}

/**
 * Resolves questions about uploaded reference materials, BB handbook, and documents in Resources tab
 * @param {string} query
 * @returns {Object|null}
 */
function resolveCompanyResourcesQuery(query) {
  var q = (query || '').toLowerCase().trim();
  var isResourceQuery = /\b(resource|resources|handbook|manual|documents?|drive|files?|uploads?|uploaded|download|pdf|google drive|syllabus|syllabi|forms?|sheets?|docs?|guidelines?|absence|application)\b/i.test(q);
  if (!isResourceQuery) return null;

  var resList = getCompanyResourcesList();

  // If user asks what documents are available / show uploaded resources
  var isListAllQuery = /\b(what|which|show|list|all|available|uploaded|any)\b/i.test(q) &&
                       /\b(resources?|documents?|handbooks?|files?|manuals?)\b/i.test(q);

  if (isListAllQuery) {
    if (!resList.length) {
      return {
        text: '**Company Resources Tab**:\n\n'
          + 'No official documents have been uploaded to the repository yet. Company administrators and officers can upload BB handbooks, drill manuals, syllabi, and administrative forms in the Admin Console.\n\n'
          + 'Once uploaded, they will be instantly available for viewing and download here!',
        triage: null,
        actions: [
          { label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' }
        ],
        chips: [
          { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
        ]
      };
    }

    var listText = '**Uploaded Company Reference Materials & Documents**:\n\n'
      + 'Here are the official materials currently available in the **Company Resources** hub:\n\n';

    resList.slice(0, 8).forEach(function(r) {
      var cat = r.category ? (' (' + r.category + ')') : '';
      var fType = r.fileType ? (' [' + r.fileType + ']') : '';
      listText += '• **' + (r.title || 'Untitled Document') + '**' + fType + cat + '\n';
      if (r.description) {
        listText += '  ' + (r.description.length > 90 ? (r.description.slice(0, 87) + '...') : r.description) + '\n';
      }
    });

    listText += '\nTap below to access and open the documents:';

    var actions = [];
    var firstDoc = resList[0];
    if (firstDoc && firstDoc.url && firstDoc.url !== '#') {
      var shortTitle = firstDoc.title.length > 20 ? (firstDoc.title.slice(0, 18) + '...') : firstDoc.title;
      actions.push({ label: 'Open ' + shortTitle, action: 'open-url', target: firstDoc.url, icon: 'doc' });
    }
    actions.push({ label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' });

    return {
      text: listText,
      triage: null,
      actions: actions,
      chips: [
        { label: 'BB Handbook', query: 'Tell me about the BB Handbook', icon: 'resources' },
        { label: 'Drill Manual', query: 'What is in the BB Drill Manual?', icon: 'resources' }
      ]
    };
  }

  // Check specific matching document from searchCompanyResourcesForHelper
  var match = searchCompanyResourcesForHelper(query);
  if (match && match.doc) {
    var doc = match.doc;
    var fTypeBadge = doc.fileType ? (' [' + doc.fileType + ']') : '';
    var catStr = doc.category ? (' • Category: **' + doc.category + '**') : '';
    var sizeStr = doc.fileSize ? (' • Size: ' + doc.fileSize) : '';
    var descStr = doc.description ? ('\n\n**Overview**: ' + doc.description) : '';

    var actions = [];
    if (doc.url && doc.url !== '#') {
      actions.push({ label: 'Open Document', action: 'open-url', target: doc.url, icon: 'doc' });
    }
    actions.push({ label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' });

    var docText = 'I found the official document in our **Company Resources** hub:\n\n'
      + '• **' + (doc.title || 'Document') + '**' + fTypeBadge + catStr + sizeStr
      + descStr + '\n\n'
      + 'You can open this reference directly or browse all company files:';

    return {
      text: docText,
      triage: null,
      actions: actions,
      chips: [
        { label: 'All Resources', query: 'Show all uploaded resources and documents', icon: 'resources' },
        { label: 'Drill Commands', query: 'What are the official drill commands?', icon: 'resources' }
      ]
    };
  }

  // If user asks about the BB Handbook in general
  if (/\b(handbook|constitution|heritage|founder|object)\b/i.test(q)) {
    var hbText = '**The Boys\' Brigade Handbook & Heritage**:\n\n'
      + '• **The Object of The Boys\' Brigade**:\n'
      + '  *"The advancement of Christ\'s Kingdom among Boys and the promotion of habits of Obedience, Reverence, Discipline, Self-respect and all that tends towards a true Christian Manliness."*\n'
      + '• **Company Motto**: *"Sure & Stedfast"* (taken from Hebrews 6:19).\n'
      + '• **Founder**: Sir William Alexander Smith (founded 4th October 1883 in Glasgow, Scotland).\n'
      + '• **1st Petaling Jaya Company**: Founded at Trinity Methodist Church Petaling Jaya (TMC PJ).\n\n'
      + 'You can find official handbooks, cadet syllabi, and administrative guidelines in the **Company Resources** tab:';

    return {
      text: hbText,
      triage: null,
      actions: [
        { label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' }
      ],
      chips: [
        { label: 'Drill Manual', query: 'What is in the BB Drill Manual?', icon: 'resources' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  return null;
}

function queryHelperAgent(userText) {
  var q = (userText || '').toLowerCase().trim();
  if (!q) return null;

  var getSessionVal = function(key) {
    if (typeof sessionGet === 'function') return sessionGet(key);
    if (typeof window !== 'undefined' && typeof window.sessionGet === 'function') return window.sessionGet(key);
    if (typeof global !== 'undefined' && typeof global.sessionGet === 'function') return global.sessionGet(key);
    return null;
  };
  var currentName = (getSessionVal('name') || '').trim();
  var currentRank = (getSessionVal('rank') || '').trim();
  var currentSquad = (getSessionVal('squad') || '').trim();
  var firstName = currentName ? currentName.split(' ')[0] : '';

  // 1. PRIVACY SHIELD: Block queries seeking another member's confidential records
  var isPersonalDataMetric = /\b(attendance|points?|score|rank|badges?|ic|password|email|record|records|standing|progress|results?)\b/i.test(q);
  var targetCheck = detectTargetMemberName(userText, currentName);

  if (targetCheck.otherName && isPersonalDataMetric) {
    return {
      text: '**Member Privacy Notice**: Under 1st Petaling Jaya Boys\' Brigade data privacy guidelines, individual attendance records, points, and achievement data are strictly confidential to each member.\n\n'
        + 'I can only provide personal records for your own authenticated account (' + (currentName ? ('**' + currentName + '**') : 'when logged in') + '). I am not permitted to disclose individual attendance records or personal details for other members (including **' + targetCheck.otherName + '**).\n\n'
        + 'To view company standings and squad scores without personal breakdown, you can visit the **Leaderboard** tab.',
      triage: null,
      actions: [
        { label: 'Go to Leaderboard', action: 'navigate', target: 'attendance', icon: 'attendance' }
      ],
      chips: [
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  // 2. CURRENT USER PERSONAL DATA & STATUS QUERIES (Excluding bug reports)
  var isBugOrIssue = /\b(bug|error|broken|freeze|frozen|glitch|fails?|failed|crash|issue|problem|wrong|cannot|can't)\b/i.test(q);
  var isAskingMyAttendance = targetCheck.isSelf && !isBugOrIssue && /\b(attendance|status|rate|percent|percentage)\b/i.test(q);
  var isAskingMyPoints = targetCheck.isSelf && !isBugOrIssue && /\b(points?|score)\b/i.test(q);
  var isAskingMyArcade = targetCheck.isSelf && !isBugOrIssue && /\b(credits?|streak|arcade|coins?)\b/i.test(q);

  if (isAskingMyAttendance || isAskingMyPoints || isAskingMyArcade) {
    if (!currentName) {
      return {
        text: 'You are currently viewing the portal as a **Guest Member**.\n\n'
          + 'To check your personalized parade attendance %, achievement tier (Emerald 100%, Blue ≥90%, Gold ≥80%), uniform points, and assigned squad, please log in or register your account.',
        triage: null,
        actions: [
          { label: 'Login / Register', action: 'navigate', target: 'member', icon: 'member' }
        ],
        chips: [
          { label: '80% Attendance Rule', query: 'How does 80% attendance work for badges?', icon: 'attendance' },
          { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
        ]
      };
    }

    var attPct = 'N/A';
    var attTierLabel = 'Good (≥80%)';
    var isOneYearQualified = true;
    var totalPts = 0;
    var uniformPts = 0;

    if (typeof sessionStorage !== 'undefined') {
      try {
        var cached = sessionStorage.getItem('bb_master_att_cache');
        if (cached) {
          var parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.attendance)) {
            var matchFn = (typeof isNameMatch === 'function') ? isNameMatch : null;
            var myRow = parsed.attendance.find(function(r) {
              return matchFn ? matchFn(r.name, currentName) : (r.name.toLowerCase() === currentName.toLowerCase());
            });
            if (myRow) {
              attPct = (myRow.paradePercentage !== undefined) ? (myRow.paradePercentage + '%') : (myRow.percentage ? (myRow.percentage + '%') : '88%');
              uniformPts = myRow.uniform || 0;
              var paradePts = myRow.paradeAtt || 0;
              totalPts = myRow.total || (uniformPts + paradePts);
              var tierVal = parseFloat(attPct);
              if (!isNaN(tierVal)) {
                isOneYearQualified = tierVal >= 80;
                attTierLabel = tierVal >= 100 ? '100% (Perfect)' : (tierVal >= 90 ? '≥90% (Excellent)' : (tierVal >= 80 ? '≥80% (Good)' : '<80% (At Risk)'));
              }
            }
          }
        }
      } catch (e) {}
    }

    var arcadeInfo = '';
    if (typeof localStorage !== 'undefined') {
      try {
        var arc = localStorage.getItem('bb_arcade_stats');
        if (arc) {
          var aObj = JSON.parse(arc);
          if (aObj) {
            arcadeInfo = '• **1stPJ Arcade**: ' + (aObj.streak || 0) + ' Day Streak • ' + (aObj.credits || 0) + ' Credits\n';
          }
        }
      } catch (e2) {}
    }

    var serviceQualStr = isOneYearQualified ? 'One Year Service Qualified' : 'One Year Service Pending (<80%)';
    var personalSummary = 'Here is your active membership performance summary, **' + currentName + '**:\n\n'
      + '• **Rank & Squad**: ' + (currentRank || 'Member') + ' • ' + (currentSquad || 'General Section') + '\n'
      + '• **Parade Attendance**: ' + attPct + ' (' + attTierLabel + ' — ' + serviceQualStr + ')\n'
      + '• **Inspection & Points**: ' + uniformPts + ' Uniform pts • ' + totalPts + ' Total Points\n'
      + arcadeInfo
      + '\nYour official attendance and points are synced directly from the Company Master Sheet. Would you like to view your full profile card in the Member Hub?';

    return {
      text: personalSummary,
      triage: null,
      actions: [
        { label: 'Go to Member Hub', action: 'navigate', target: 'member', icon: 'member' },
        { label: 'Go to Leaderboard', action: 'navigate', target: 'attendance', icon: 'attendance' }
      ],
      chips: [
        { label: '80% Attendance Rule', query: 'How does 80% attendance work for badges?', icon: 'attendance' },
        { label: 'My Badges', query: 'Where are my badges and awards?', icon: 'badges' }
      ]
    };
  }

  // 3. CONVERSATIONAL INTENTS (Greetings, Politeness, Identity, Heritage)
  var isGreeting = /^(hi|hello|hey|heya|howdy|yo|greetings)\b/i.test(q) ||
                   /^(good morning|morning|good afternoon|afternoon|good evening|evening)\b/i.test(q);
  if (isGreeting && q.split(/\s+/).length <= 4) {
    return {
      text: 'Hello' + (firstName ? (' ' + firstName) : '') + '! I am **Stedfast**, your 1st Petaling Jaya Boys\' Brigade AI Helper.\n\nHow can I help you today? You can ask me about Saturday parade schedules, badge requirements, where to find things on the portal, or your attendance status!',
      triage: null,
      actions: [],
      chips: [
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
        { label: 'Uniform Kits', query: 'What are the official uniform kits?', icon: 'store' },
        { label: '1stPJ Arcade', query: 'Where is the 1stPJ Arcade and how do credits work?', icon: 'arcade' }
      ]
    };
  }

  var isHowAreYou = /^(how are you|how are things|how's it going|how r u|what's up|whats up|how is your day)\b/i.test(q);
  if (isHowAreYou) {
    return {
      text: 'I\'m doing great and standing **Sure & Stedfast**, ready to help you navigate our company portal! What would you like to explore today?',
      triage: null,
      actions: [],
      chips: [
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'My Badges', query: 'Where are my badges?', icon: 'badges' }
      ]
    };
  }

  var isGratitude = /^(thank you|thanks|thx|tq|thank u|awesome|great job|cool|nice|good job|perfect)\b/i.test(q);
  if (isGratitude && q.split(/\s+/).length <= 5) {
    return {
      text: 'You\'re very welcome! If there\'s anything else you need about Saturday parades, badge requirements, or the portal, just let me know. Have a blessed week ahead!',
      triage: null,
      actions: [],
      chips: [
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
        { label: '1stPJ Arcade', query: 'Where is the 1stPJ Arcade?', icon: 'arcade' }
      ]
    };
  }

  var isFarewell = /^(bye|goodbye|cya|see you|see ya|good night)\b/i.test(q);
  if (isFarewell && q.split(/\s+/).length <= 5) {
    return {
      text: 'Goodbye' + (firstName ? (' ' + firstName) : '') + '! Have a wonderful week ahead, and see you at Saturday parade. **Sure & Stedfast!**',
      triage: null,
      actions: [],
      chips: [
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  var isIdentityQuery = /^(who are you|what are you|what can you do|what is stedfast|help me|tell me about yourself)\b/i.test(q);
  if (isIdentityQuery) {
    return {
      text: 'I am **Stedfast**, the dedicated AI Helper for the **1st Petaling Jaya Boys\' Brigade Web Portal**!\n\n'
        + 'Here is what I can do for you:\n'
        + '• **One-Click Navigation**: Ask where any feature is, and I\'ll provide an overview plus a button to jump straight to it (Member Hub, Badges, Leaderboard, Forms, Arcade, etc.).\n'
        + '• **Company Info**: Saturday parade timings (**2:15 PM – 6:00 PM** at TMC PJ), band rehearsals (**9:30 AM**), uniform standards (Kit A/B/C), and boot sizing.\n'
        + '• **Your Performance**: Check your attendance %, One Year Service qualification, and Arcade credits.\n'
        + '• **Forum Search**: Read previous community discussions and resolved bugs to give you instant solutions.\n'
        + '• **Bug Escalation**: Analyze technical errors and help you escalate them to our dev team and officers.',
      triage: null,
      actions: [
        { label: 'Go to Member Hub', action: 'navigate', target: 'member', icon: 'member' },
        { label: 'Go to Support Forum', action: 'navigate', target: 'forum', icon: 'forum' }
      ],
      chips: [
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

    // 4. OFFICIAL BB DRILL MANUAL & CEREMONIAL COMMANDS
  var drillMatch = resolveDrillManualQuery(userText);
  if (drillMatch) {
    return drillMatch;
  }

  // 5. OFFICIAL COMPANY RESOURCES & UPLOADED HANDBOOKS GROUNDING
  var resourceMatch = resolveCompanyResourcesQuery(userText);
  if (resourceMatch) {
    return resourceMatch;
  }

  // 4. PORTAL NAVIGATION INTENT ("Where is...", "How to find...", "Navigate to...")
  var isNavQuery = !isBugOrIssue && /\b(where|find|navigate|access|go to|open|show me|take me to|how to get to|location|locate)\b/i.test(q);
  if (isNavQuery) {
    for (var n = 0; n < PORTAL_NAVIGATION_MAP.length; n++) {
      var navItem = PORTAL_NAVIGATION_MAP[n];
      var matchedKw = navItem.keywords.some(function(kw) { return q.indexOf(kw) !== -1; });
      if (matchedKw) {
        return {
          text: 'You can access **' + navItem.title + '** in the **' + navItem.tabName + '** tab!\n\n'
            + navItem.description + '\n\n'
            + 'Would you like to navigate there now?',
          triage: null,
          actions: navItem.actions,
          chips: [
            { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
            { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' }
          ]
        };
      }
    }
  }

  // 5. BUG / TECHNICAL ISSUE TRIAGE
  var triage = triageUserQuery(userText);
  if (triage) {
    var responseText = 'I have analyzed your issue regarding **' + triage.categoryLabel + '**.\n\n'
      + '**Quick Tip**: Try doing a hard refresh (`Ctrl + Shift + R` or `Cmd + Shift + R`) to ensure your browser has loaded the latest company portal version.\n\n'
      + 'If the problem persists, I can escalate this directly to the 1st PJ Dev Team and Officers in our **Support & Bug Forum**:';

    return {
      text: responseText,
      triage: triage,
      actions: [
        { label: 'Go to Support Forum', action: 'navigate', target: 'forum', icon: 'forum' }
      ],
      chips: []
    };
  }

  // 6. COMPREHENSIVE KNOWLEDGE BASE FAQ MATCH (OFFICIAL GROUND TRUTH)
  var isExplicitForumQuery = /\b(forum|discuss|discussions?|thread|threads?|post|posts?|topic|past|community)\b/i.test(q);
  var bestMatch = null;
  var highestScore = 0;

  if (!isExplicitForumQuery) {
    for (var i = 0; i < FAQ_KNOWLEDGE_BASE.length; i++) {
      var item = FAQ_KNOWLEDGE_BASE[i];
      var score = 0;
      for (var k = 0; k < item.keywords.length; k++) {
        if (q.indexOf(item.keywords[k]) !== -1) {
          score++;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }
  }

  if (bestMatch && highestScore >= 1) {
    var faqActions = [];
    if (bestMatch.keywords.indexOf('parade') !== -1) {
      faqActions.push({ label: 'Go to Weekly Parade', action: 'navigate', target: 'parade', icon: 'parade' });
    } else if (bestMatch.keywords.indexOf('attendance') !== -1) {
      faqActions.push({ label: 'Go to Member Hub', action: 'navigate', target: 'member', icon: 'member' });
      faqActions.push({ label: 'Go to Leaderboard', action: 'navigate', target: 'attendance', icon: 'attendance' });
    } else if (bestMatch.keywords.indexOf('uniform') !== -1 || bestMatch.keywords.indexOf('store') !== -1 || bestMatch.keywords.indexOf('boot size') !== -1) {
      faqActions.push({ label: 'Go to Forms & Store', action: 'navigate', target: 'order', icon: 'store' });
    } else if (bestMatch.keywords.indexOf('badge') !== -1) {
      faqActions.push({ label: 'Go to My Badges', action: 'navigate', target: 'badges', icon: 'badges' });
    } else if (bestMatch.keywords.indexOf('task') !== -1) {
      faqActions.push({ label: 'Go to Projects & Tasks', action: 'navigate', target: 'tasks', icon: 'tasks' });
    } else if (bestMatch.keywords.indexOf('arcade') !== -1) {
      faqActions.push({ label: 'Go to 1stPJ Arcade', action: 'navigate', target: 'arcade', icon: 'arcade' });
    }

    return {
      text: bestMatch.answer,
      triage: null,
      actions: faqActions,
      chips: [
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  // 7. FORUM KNOWLEDGE SEARCH (READING PREVIOUS SUPPORT / BUG FORUM DISCUSSIONS)
  var forumMatch = searchForumPostsForHelper(userText);
  if (forumMatch && forumMatch.post) {
    var fPost = forumMatch.post;
    var statusLabel = fPost.status === 'resolved' ? 'Resolved' : 'Active Discussion';
    var excerpt = (fPost.replies && fPost.replies.length) ? fPost.replies[0].content : fPost.content;
    if (excerpt.length > 200) excerpt = excerpt.slice(0, 197) + '...';

    return {
      text: 'I found a related discussion in our **Support Forum**:\n\n'
        + '• **' + fPost.title + '** (' + statusLabel + ' • ' + fPost.categoryLabel + ')\n\n'
        + '**Summary**: ' + excerpt + '\n\n'
        + 'You can view the full thread, see officer replies, or join the discussion below:',
      triage: null,
      actions: [
        { label: 'View Forum Discussion', action: 'view-thread', target: fPost.id, icon: 'forum' },
        { label: 'Go to Support Forum', action: 'navigate', target: 'forum', icon: 'forum' }
      ],
      chips: [
        { label: 'Ask Another Question', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  // 8. INTELLIGENT CONVERSATIONAL FALLBACK
  return {
    text: 'I\'m here to help! While I don\'t have a specific pre-set answer for that exact phrase, here is what I can assist you with:\n\n'
      + '• **Saturday Parade & Band Schedules** (2:15 PM – 6:00 PM at TMC PJ)\n'
      + '• **80% Attendance Rule & One Year Service milestones**\n'
      + '• **Uniform Standards** (Kit A, B, C) and boot sizing\n'
      + '• **Where to find any tab** (Member Hub, Badges, Arcade, Resources, Leaderboard)\n'
      + '• **Projects & Tasks board** for company NCOs\n'
      + '• **Community discussions & bug reports** on the Support Forum\n\n'
      + 'Feel free to tap one of the suggested topics below, or post your query to the Support Forum for officer assistance!',
    triage: {
      category: 'general',
      categoryLabel: 'General Discussion',
      tag: 'question',
      suggestedTitle: userText.length > 50 ? (userText.slice(0, 47) + '...') : userText
    },
    actions: [
      { label: 'Post to Bug & Support Forum', action: 'navigate', target: 'forum', icon: 'forum' }
    ],
    chips: [
      { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
      { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
      { label: 'Uniform Kits', query: 'What are the official uniform kits?', icon: 'store' }
    ]
  };
}

// ── Helper Agent DOM & UI Controller ─────────────────────────────────────────
function ensureHelperAgentDOM() {
  if (typeof document === 'undefined') return;

  var existingTrigger = document.getElementById('helper-agent-trigger');
  if (existingTrigger) return;

  var trigger = document.createElement('button');
  trigger.id = 'helper-agent-trigger';
  trigger.className = 'helper-agent-btn';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Ask Stedfast AI Helper');
  trigger.setAttribute('title', 'Ask Stedfast (1st PJ Helper Agent)');
  trigger.onclick = toggleHelperAgent;

  trigger.innerHTML = 
    '<div class="helper-agent-icon-wrap">' +
      FORUM_ICONS.anchor +
      '<span class="helper-pulse-dot"></span>' +
    '</div>' +
    '<span class="helper-agent-label">Ask Stedfast</span>';

  var chatBox = document.createElement('div');
  chatBox.id = 'helper-agent-drawer';
  chatBox.className = 'helper-agent-drawer';
  chatBox.style.display = 'none';
  chatBox.setAttribute('role', 'dialog');
  chatBox.setAttribute('aria-label', 'Stedfast AI Helper Chat');

  chatBox.innerHTML = 
    '<div class="helper-drawer-header">' +
      '<div style="display:flex;align-items:center;gap:9px;">' +
        '<div class="helper-drawer-avatar">' + FORUM_ICONS.anchor + '</div>' +
        '<div>' +
          '<div class="helper-drawer-title">Stedfast AI Helper</div>' +
          '<div class="helper-drawer-sub" id="helper-engine-indicator">1st PJ Boys\' Brigade Assistant</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<button type="button" class="helper-icon-btn" id="btn-helper-settings" onclick="toggleHelperSettingsPanel()" title="Configure Google Gemini AI">' + FORUM_ICONS.gear + '</button>' +
        '<button type="button" class="helper-icon-btn" onclick="clearHelperChat()" title="Clear conversation">' + FORUM_ICONS.refresh + '</button>' +
        '<button type="button" class="helper-icon-btn" onclick="toggleHelperAgent()" title="Close chat">&times;</button>' +
      '</div>' +
    '</div>' +
    '<div id="helper-settings-panel" class="helper-settings-panel" style="display:none;">' +
      '<div class="helper-settings-row">' +
        '<span class="helper-settings-title">Google Gemini AI Engine</span>' +
        '<span class="helper-status-pill" id="helper-gemini-status">Checking...</span>' +
      '</div>' +
      '<p class="helper-settings-desc">Activate Google Gemini (Free Tier) for natural, conversational intelligence:</p>' +
      '<div class="helper-settings-input-group">' +
        '<input type="password" id="helper-gemini-key-input" class="helper-settings-input" placeholder="Paste Gemini API Key..." />' +
        '<button type="button" class="helper-settings-save-btn" onclick="saveGeminiKeyFromHelper(this)">Connect</button>' +
      '</div>' +
      '<div class="helper-settings-footer">' +
        '<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="helper-settings-link">Get Free Gemini API Key ↗</a>' +
      '</div>' +
    '</div>' +
    '<div class="helper-drawer-body" id="helper-chat-body"></div>' +
    '<form class="helper-drawer-footer" onsubmit="handleHelperSubmit(event)">' +
      '<input type="text" id="helper-agent-input" class="helper-chat-input" placeholder="Ask about parades, badges, uniform..." autocomplete="off" />' +
      '<button type="submit" class="helper-send-btn" aria-label="Send">' + FORUM_ICONS.send + '</button>' +
    '</form>';

  document.body.appendChild(trigger);
  document.body.appendChild(chatBox);
  renderHelperMessages();
}


/**
 * Toggles visibility of the Google Gemini AI Settings panel in the helper chat drawer
 * @param {boolean} [force]
 */
function toggleHelperSettingsPanel(force) {
  if (typeof document === 'undefined') return;
  var panel = document.getElementById('helper-settings-panel');
  if (!panel) return;
  var isVisible = panel.style.display !== 'none';
  var nextState = (typeof force === 'boolean') ? force : !isVisible;
  panel.style.display = nextState ? 'flex' : 'none';
  if (nextState) {
    updateHelperGeminiStatus();
    var inp = document.getElementById('helper-gemini-key-input');
    if (inp) {
      var k = getGeminiApiKey();
      inp.value = k ? '••••••••••••••••' : '';
      if (!k) inp.focus();
    }
  }
}

/**
 * Updates the helper drawer status pill and subtitle reflecting the active AI engine
 */
function updateHelperGeminiStatus() {
  if (typeof document === 'undefined') return;
  var pill = document.getElementById('helper-gemini-status');
  var sub = document.getElementById('helper-engine-indicator');
  var key = getGeminiApiKey();

  if (key) {
    var activeModel = (typeof getActiveGeminiModel === 'function' ? getActiveGeminiModel() : '') || 'gemini-3.8-flash';
    var cleanLabel = activeModel.replace(/^models\//, '').replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    if (pill) {
      pill.textContent = '● Active (' + cleanLabel + ')';
      pill.className = 'helper-status-pill active';
    }
    if (sub) {
      sub.textContent = 'Powered by Google ' + cleanLabel;
    }
  } else {
    if (pill) {
      pill.textContent = '○ Standby (Local Engine)';
      pill.className = 'helper-status-pill';
    }
    if (sub) {
      sub.textContent = '1st PJ Boys\' Brigade Assistant';
    }
  }
}

async function saveGeminiKeyFromHelper(btn) {
  var input = document.getElementById('helper-gemini-key-input');
  if (!input) return;
  var key = (input.value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) {
    setGeminiApiKey('');
    setActiveGeminiModel('', 'v1beta', 'interactions');
    await saveRemoteGeminiApiKey('');
    updateHelperGeminiStatus();
    if (typeof showToast === 'function') {
      showToast('Gemini API Key removed. Reverted to local intelligence.', 'info');
    }
    return;
  }

  var saveBtn = btn || document.querySelector('.helper-settings-save-btn');

  var performVerification = async function() {
    if (typeof showToast === 'function') {
      showToast('Connecting to Google Gemini AI...', 'info');
    }

    // Step 1: Ultra-fast direct test ping (Interactions API / GenerateContent fast-path)
    var testRes = await callGeminiApi('Say "Ready" in one word.', key, {
      skipSystemPrompt: true,
      skipThinking: true,
      timeoutMs: 8000
    });

    // Step 2: If fast-path failed with model-specific error, try discovery fallback
    if (!testRes) {
      var initialErr = (typeof getLastGeminiError === 'function' ? getLastGeminiError() : _lastGeminiError) || '';
      var isFatalAuth = /API_KEY_INVALID|API key not valid|key not found|PERMISSION_DENIED|disabled/i.test(initialErr);
      if (!isFatalAuth) {
        if (typeof showToast === 'function') {
          showToast('Finding compatible Gemini model for your API key...', 'info');
        }
        var discovery = await listAvailableGeminiModels(key);
        if (discovery.ok && discovery.models && discovery.models.length > 0) {
          for (var m = 0; m < Math.min(discovery.models.length, 3); m++) {
            var disc = discovery.models[m];
            testRes = await callGeminiApi('Say "Ready" in one word.', key, {
              model: disc.id,
              apiVersion: disc.apiVersion,
              apiMode: 'generateContent',
              skipSystemPrompt: true,
              skipThinking: true,
              timeoutMs: 8000
            });
            if (testRes) break;
          }
        }
      }
    }

    if (!testRes) {
      var lastErr = (typeof getLastGeminiError === 'function' ? getLastGeminiError() : _lastGeminiError) || '';
      var userMsg = 'Connection failed. Please verify your Gemini API key.';

      if (/timed out/i.test(lastErr)) {
        userMsg = 'Connection timed out. Google Gemini servers took longer than expected. Please check your internet connection or try again.';
      } else if (/API_KEY_INVALID|API key not valid|key not found/i.test(lastErr)) {
        userMsg = 'Invalid Gemini API key. Please check your key from Google AI Studio.';
      } else if (/PERMISSION_DENIED|disabled/i.test(lastErr)) {
        userMsg = 'Generative Language API is disabled. Please enable it in your Google Cloud Console.';
      } else if (/FAILED_PRECONDITION|location/i.test(lastErr)) {
        userMsg = 'Gemini API is unavailable in your current region or VPN location.';
      } else if (/RESOURCE_EXHAUSTED|quota/i.test(lastErr)) {
        userMsg = 'Gemini API quota exceeded. Please check your rate limits.';
      } else if (/not found for API version|not supported for generateContent|no longer available/i.test(lastErr)) {
        userMsg = 'Selected model is unavailable. Updated to gemini-3.8-flash for modern compatibility.';
      } else if (/Failed to fetch|Content-Security-Policy|NetworkError/i.test(lastErr)) {
        userMsg = 'Network or CSP connection blocked. Please refresh your browser.';
      } else if (lastErr) {
        userMsg = 'Connection failed: ' + lastErr;
      }

      if (typeof showToast === 'function') {
        showToast(userMsg, 'warning');
      }
      return;
    }

    var activeModelName = getActiveGeminiModel() || 'gemini-3.8-flash';
    setGeminiApiKey(key);
    await saveRemoteGeminiApiKey(key);
    input.value = '';
    toggleHelperSettingsPanel(false);
    updateHelperGeminiStatus();

    var cleanLabel = activeModelName.replace(/^models\//, '').replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    if (typeof showToast === 'function') {
      showToast('Google Gemini AI (' + cleanLabel + ') activated successfully!', 'success');
    }
  };

  if (typeof withSmartButtonLock === 'function' && saveBtn) {
    await withSmartButtonLock(saveBtn, performVerification, {
      loadingText: 'Connecting...',
      srLabel: 'Testing connection to Google Gemini API'
    });
  } else {
    await performVerification();
  }
}
function toggleHelperAgent() {
  _isHelperAgentOpen = !_isHelperAgentOpen;
  var drawer = document.getElementById('helper-agent-drawer');
  var trigger = document.getElementById('helper-agent-trigger');
  if (!drawer) return;

  if (_isHelperAgentOpen) {
    updateHelperGeminiStatus();
    syncRemoteGeminiApiKey().then(function() {
      updateHelperGeminiStatus();
    });
    drawer.style.display = 'flex';
    drawer.classList.add('open');
    if (trigger) trigger.classList.add('active');
    renderHelperMessages();
    setTimeout(function() {
      var inp = document.getElementById('helper-agent-input');
      if (inp) inp.focus();
    }, 100);
  } else {
    drawer.style.display = 'none';
    drawer.classList.remove('open');
    if (trigger) trigger.classList.remove('active');
  }
}

function clearHelperChat() {
  _helperMessages = [
    {
      sender: 'agent',
      text: 'Conversation reset. How may I assist you today regarding 1st PJ Boys\' Brigade?',
      time: 'Just now',
      chips: [
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
        { label: '80% Attendance Rule', query: 'How does 80% attendance work for badges?', icon: 'attendance' },
        { label: 'Uniform Kits', query: 'What are the official uniform kits?', icon: 'store' },
        { label: 'NCO Tasks Board', query: 'How do I use the Projects and Tasks board?', icon: 'tasks' },
        { label: 'Report a Bug', query: 'I want to report a bug in the portal', icon: 'bugs' }
      ]
    }
  ];
  renderHelperMessages();
}

function renderHelperMessages() {
  if (typeof document === 'undefined') return;
  var body = document.getElementById('helper-chat-body');
  if (!body) return;

  var html = '';
  _helperMessages.forEach(function(msg) {
    var isUser = msg.sender === 'user';
    var safeText = formatHelperMarkdown(msg.text);

    html += 
      '<div class="helper-bubble-wrap ' + (isUser ? 'user-wrap' : 'agent-wrap') + '">' +
        '<div class="helper-bubble ' + (isUser ? 'user-bubble' : 'agent-bubble') + '">' +
          '<div class="helper-bubble-text">' + safeText + '</div>' +
          (msg.actions && msg.actions.length ? renderHelperActionsHtml(msg.actions) : '') +
          (msg.triage ? renderTriageCardHtml(msg.triage) : '') +
          (msg.chips && msg.chips.length ? renderChipsHtml(msg.chips) : '') +
          '<div class="helper-bubble-time">' + (msg.time || '') + '</div>' +
        '</div>' +
      '</div>';
  });

  body.innerHTML = html;
  body.scrollTop = body.scrollHeight;
}

function formatHelperMarkdown(text) {
  if (!text) return '';
  var clean = sanitizeStedfastOutput(text);
  var safe = (typeof escapeHtml === 'function') ? escapeHtml(clean) : clean;
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:4px;font-family:var(--font-mono);font-size:11px;">$1</code>');
  safe = safe.replace(/\n- /g, '<br>&bull; ');
  safe = safe.replace(/\n\n/g, '<br><br>');
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

function renderHelperActionsHtml(actions) {
  if (!actions || !actions.length) return '';
  var h = '<div class="helper-action-btns">';
  actions.forEach(function(act) {
    var safeLabel = (typeof escapeHtml === 'function') ? escapeHtml(act.label) : act.label;
    var safeTarget = (typeof escapeHtml === 'function') ? escapeHtml(act.target) : act.target;
    var safeAction = (typeof escapeHtml === 'function') ? escapeHtml(act.action) : act.action;
    var iconSvg = FORUM_ICONS[act.icon] || FORUM_ICONS.arrowRight || '';
    var arrowSvg = FORUM_ICONS.arrowRight || '';
    h += '<button type="button" class="helper-action-btn" onclick="executeHelperAction(\'' + safeAction.replace(/'/g, "\\'") + '\', \'' + safeTarget.replace(/'/g, "\\'") + '\')">' +
           '<span style="display:inline-flex;align-items:center;gap:6px;">' +
             iconSvg +
             '<span>' + safeLabel + '</span>' +
           '</span>' +
           arrowSvg +
         '</button>';
  });
  h += '</div>';
  return h;
}

function renderChipsHtml(chips) {
  var h = '<div class="helper-prompt-chips">';
  chips.forEach(function(c) {
    var safeLabel = (typeof escapeHtml === 'function') ? escapeHtml(c.label) : c.label;
    var safeQ = (typeof escapeHtml === 'function') ? escapeHtml(c.query) : c.query;
    var iconSvg = FORUM_ICONS[c.icon] || '';
    h += '<button type="button" class="helper-chip" onclick="sendHelperPrompt(\'' + safeQ.replace(/'/g, "\\'") + '\')">' +
           '<span class="helper-chip-icon">' + iconSvg + '</span>' +
           '<span class="helper-chip-text">' + safeLabel + '</span>' +
         '</button>';
  });
  h += '</div>';
  return h;
}

function renderTriageCardHtml(triage) {
  var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(triage.suggestedTitle) : triage.suggestedTitle;
  var safeCat = (typeof escapeHtml === 'function') ? escapeHtml(triage.category) : triage.category;
  var safeTag = (typeof escapeHtml === 'function') ? escapeHtml(triage.tag) : triage.tag;
  var iconSvg = FORUM_ICONS[triage.category] || FORUM_ICONS.bugs;

  return '<div class="helper-triage-card">' +
    '<div class="helper-triage-header">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        iconSvg +
        '<span style="font-weight:700;font-size:11.5px;color:var(--text-primary);">' + triage.categoryLabel + '</span>' +
      '</div>' +
      '<span class="helper-triage-tag">' + safeTag + '</span>' +
    '</div>' +
    '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;">Suggested thread title: <em>"' + safeTitle + '"</em></div>' +
    '<button type="button" class="helper-escalate-btn" onclick="escalateToForumFromChat(\'' + safeTitle.replace(/'/g, "\\'") + '\', \'' + safeCat + '\', \'' + safeTag + '\')">' +
      FORUM_ICONS.plus + ' <span>Post to Bug &amp; Support Forum</span>' +
    '</button>' +
  '</div>';
}

function handleHelperSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var input = document.getElementById('helper-agent-input');
  if (!input) return;
  var text = (input.value || '').trim();
  if (!text) return;

  input.value = '';
  sendHelperPrompt(text);
}

/**
 * Asynchronously generates response using Google Gemini API when configured,
 * with instantaneous local knowledge fallback
 * @param {string} userPrompt
 * @returns {Promise<Object>}
 */
async function getHelperAgentResponse(userPrompt) {
  var q = (userPrompt || '').toLowerCase().trim();

  // 1. PRIVACY SHIELD ALWAYS GATES FIRST (Protects members' confidential data)
  var isPersonalDataMetric = /\b(attendance|points?|score|rank|badges?|ic|password|email|record|records|standing|progress|results?)\b/i.test(q);
  var currentName = (typeof sessionGet === 'function') ? (sessionGet('name') || '') : '';
  var targetCheck = detectTargetMemberName(userPrompt, currentName);

  if (targetCheck.otherName && isPersonalDataMetric) {
    return {
      text: '**Member Privacy Notice**: Under 1st Petaling Jaya Boys\' Brigade data privacy guidelines, individual attendance records, points, and achievement data are strictly confidential to each member.\n\n'
        + 'I can only provide personal records for your own authenticated account (' + (currentName ? ('**' + currentName + '**') : 'when logged in') + '). I am not permitted to disclose individual attendance records or personal details for other members (including **' + targetCheck.otherName + '**).\n\n'
        + 'To view company standings and squad scores without personal breakdown, you can visit the **Leaderboard** tab.',
      triage: null,
      actions: [
        { label: 'Go to Leaderboard', action: 'navigate', target: 'attendance', icon: 'attendance' }
      ],
      chips: [
        { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
        { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' }
      ]
    };
  }

  // 2. CHECK FOR GOOGLE GEMINI INTELLIGENCE (Cloud-First when configured)
  var geminiKey = await syncRemoteGeminiApiKey();
  if (geminiKey) {
    try {
      // Build rich user context for Gemini
      var contextPrefix = '';
      if (typeof sessionGet === 'function' && sessionGet('name')) {
        var uName = sessionGet('name');
        var uRank = sessionGet('rank') || 'Member';
        var uPlatoon = sessionGet('platoon') || '';
        var myAtt = ((typeof window !== 'undefined' && typeof window.getMyAttendanceSummary === 'function') ? window.getMyAttendanceSummary() : ((typeof global !== 'undefined' && typeof global.getMyAttendanceSummary === 'function') ? global.getMyAttendanceSummary() : null));
        var myArcade = (typeof getArcadeStats === 'function') ? getArcadeStats() : null;
        var attStr = myAtt ? (myAtt.attendanceRate + '%') : 'N/A';
        var credStr = myArcade ? myArcade.credits : 0;
        contextPrefix = '[Authenticated Member: ' + uName + ', Rank: ' + uRank + (uPlatoon ? (', Platoon: ' + uPlatoon) : '') + ', Attendance: ' + attStr + ', Credits: ' + credStr + ']\n';
      }

      var fullUserPrompt = contextPrefix + userPrompt;
      var aiText = await callGeminiApi(fullUserPrompt, geminiKey);
      if (aiText && aiText.trim()) {
        aiText = sanitizeStedfastOutput(aiText.trim());

        // Derive contextual actions from AI text
        var derivedActions = [];
        var lowerAi = aiText.toLowerCase();
        if (lowerAi.includes('parade') || lowerAi.includes('saturday')) {
          derivedActions.push({ label: 'Go to Weekly Parade', action: 'navigate', target: 'parade', icon: 'parade' });
        }
        if (lowerAi.includes('uniform') || lowerAi.includes('kit') || lowerAi.includes('store') || lowerAi.includes('order') || lowerAi.includes('boot')) {
          derivedActions.push({ label: 'Go to Forms & Store', action: 'navigate', target: 'order', icon: 'store' });
        }
        if (lowerAi.includes('badge') || lowerAi.includes('award')) {
          derivedActions.push({ label: 'Go to My Badges', action: 'navigate', target: 'badges', icon: 'badges' });
        }
        if (lowerAi.includes('attendance') || lowerAi.includes('standing') || lowerAi.includes('service year')) {
          derivedActions.push({ label: 'Go to Member Hub', action: 'navigate', target: 'member', icon: 'member' });
        }
        if (lowerAi.includes('resource') || lowerAi.includes('handbook') || lowerAi.includes('drill manual') || lowerAi.includes('manual')) {
          derivedActions.push({ label: 'Go to Company Resources', action: 'navigate', target: 'resources', icon: 'resources' });
        }
        if (lowerAi.includes('arcade') || lowerAi.includes('wordle') || lowerAi.includes('credit') || lowerAi.includes('streak')) {
          derivedActions.push({ label: 'Go to 1stPJ Arcade', action: 'navigate', target: 'arcade', icon: 'arcade' });
        }
        if (lowerAi.includes('forum') || lowerAi.includes('bug') || lowerAi.includes('report') || lowerAi.includes('support')) {
          derivedActions.push({ label: 'Go to Support Forum', action: 'navigate', target: 'forum', icon: 'forum' });
        }

        return {
          text: aiText,
          triage: null,
          actions: derivedActions.slice(0, 2),
          chips: [
            { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
            { label: 'Where is my attendance?', query: 'Where is my attendance status?', icon: 'attendance' },
            { label: '1stPJ Arcade', query: 'Where is the 1stPJ Arcade and how do credits work?', icon: 'arcade' }
          ]
        };
      }
    } catch (e) {
      console.warn('Gemini call error in getHelperAgentResponse:', e);
    }
  }

  // 3. Fall back to local queryHelperAgent
  var localRes = queryHelperAgent(userPrompt);
  if (localRes && localRes.text) {
    localRes.text = sanitizeStedfastOutput(localRes.text);
  }
  return localRes;
}

async function sendHelperPrompt(userPrompt) {
  var now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  _helperMessages.push({
    sender: 'user',
    text: userPrompt,
    time: now
  });
  renderHelperMessages();

  // Show temporary typing indicator in chat
  var body = (typeof document !== 'undefined') ? document.getElementById('helper-chat-body') : null;
  if (body) {
    var typingDiv = document.createElement('div');
    typingDiv.id = 'helper-typing-indicator';
    typingDiv.className = 'helper-bubble-wrap agent-wrap';
    typingDiv.innerHTML = '<div class="helper-bubble agent-bubble" style="padding:10px 14px;color:var(--text-muted);font-size:12px;display:flex;align-items:center;gap:6px;">'
      + '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent-primary);animation:pulse 1s infinite;"></span>'
      + '<span>Stedfast is thinking...</span>'
      + '</div>';
    body.appendChild(typingDiv);
    body.scrollTop = body.scrollHeight;
  }

  var reply = await getHelperAgentResponse(userPrompt);

  if (body) {
    var ind = document.getElementById('helper-typing-indicator');
    if (ind) ind.remove();
  }

  var botTime = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  _helperMessages.push({
    sender: 'agent',
    text: reply.text,
    triage: reply.triage,
    actions: reply.actions || [],
    time: botTime,
    chips: reply.chips || (!reply.triage ? [
      { label: 'Parade Timings', query: 'What time is Saturday parade and band?', icon: 'parade' },
      { label: '80% Attendance Rule', query: 'How does 80% attendance work for badges?', icon: 'attendance' },
      { label: 'Uniform Kits', query: 'What are the official uniform kits?', icon: 'store' }
    ] : [])
  });
  renderHelperMessages();
}

function escalateToForumFromChat(title, category, tag) {
  if (_isHelperAgentOpen) toggleHelperAgent();
  if (typeof switchTabNav === 'function') {
    switchTabNav('forum');
  } else if (typeof switchTab === 'function') {
    switchTab('forum');
  }
  setTimeout(function() {
    openCreateForumPostModal({
      title: title,
      category: category,
      tag: tag,
      content: 'Escalated from Stedfast AI Helper conversation regarding ' + (category || 'general issue') + '.'
    });
  }, 200);
}

// ── Support & Bug Forum Tab Controller ───────────────────────────────────────

/**
 * Ensures #page-forum is properly attached as a direct child of #app-main
 */
function ensureForumPageDOM() {
  if (typeof document === 'undefined') return null;

  var page = document.getElementById('page-forum');
  var main = document.getElementById('app-main') || document.querySelector('.app-main') || document.querySelector('main');

  if (!page) {
    page = document.createElement('section');
    page.id = 'page-forum';
    page.className = 'page';
    page.setAttribute('aria-label', 'Support & Bug Forum');
    if (main) {
      main.appendChild(page);
    } else {
      document.body.appendChild(page);
    }
  } else if (main && page.parentElement !== main) {
    main.appendChild(page);
  }

  return page;
}

/**
 * Renders the Support & Bug Forum Page View into #page-forum
 */
function renderForumPage() {
  if (typeof document === 'undefined') return;

  if (typeof window !== 'undefined' && typeof window.loadMemberCosmetics === 'function') {
    window.loadMemberCosmetics();
  }

  var page = ensureForumPageDOM();
  if (!page) return;
  page.classList.add('active');

  page.innerHTML = 
    '<div class="forum-container">' +
      '<!-- Header Card matching standard portal pages -->' +
      '<div class="card page-header-card forum-hero-card" style="margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:40px;height:40px;border-radius:10px;background:rgba(217,163,35,0.15);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
              FORUM_ICONS.general +
            '</div>' +
            '<div>' +
              '<div class="page-title" style="margin:0;">Support &amp; Bug Forum</div>' +
              '<div class="page-subtitle" style="margin:0;">Community help, questions &amp; direct bug tracking for 1st PJ Web Portal</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="portal-btn portal-btn-primary" onclick="openCreateForumPostModal()" style="display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;padding:8px 16px;">' +
            FORUM_ICONS.plus + ' <span>New Post</span>' +
          '</button>' +
        '</div>' +
        '<div class="page-desc">Ask questions about badge advancement, uniform kits, and portal tools, or submit technical bug reports directly to the 1st PJ development team and officers.</div>' +
      '</div>' +

      '<!-- Controls Bar: Search & Status Filter -->' +
      '<div class="forum-controls-bar">' +
        '<div class="forum-search-wrap">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="text" id="forum-search-input" class="forum-search-input" placeholder="Search discussions &amp; bugs..." oninput="handleForumSearch(this.value)" />' +
        '</div>' +
        '<div class="forum-status-select-wrap">' +
          '<select id="forum-status-filter" class="form-select" onchange="filterForumStatus(this.value)" style="padding:7px 12px;font-size:12.5px;height:auto;min-width:130px;">' +
            '<option value="all">All Status</option>' +
            '<option value="open">Open</option>' +
            '<option value="resolved">Resolved</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<!-- Category Filter Pills (Zero Emojis, Clean SVG Icons) -->' +
      '<div class="forum-filter-scroll" style="margin-bottom:16px;">' +
        '<button type="button" class="forum-filter-pill active" data-cat="all" onclick="filterForumCategory(\'all\', this)">' +
          FORUM_ICONS.all + ' <span>All Topics</span>' +
        '</button>' +
        '<button type="button" class="forum-filter-pill" data-cat="bugs" onclick="filterForumCategory(\'bugs\', this)">' +
          FORUM_ICONS.bugs + ' <span>Bugs</span>' +
        '</button>' +
        '<button type="button" class="forum-filter-pill" data-cat="badges" onclick="filterForumCategory(\'badges\', this)">' +
          FORUM_ICONS.badges + ' <span>Badges</span>' +
        '</button>' +
        '<button type="button" class="forum-filter-pill" data-cat="account" onclick="filterForumCategory(\'account\', this)">' +
          FORUM_ICONS.account + ' <span>Account</span>' +
        '</button>' +
        '<button type="button" class="forum-filter-pill" data-cat="store" onclick="filterForumCategory(\'store\', this)">' +
          FORUM_ICONS.store + ' <span>Store</span>' +
        '</button>' +
        '<button type="button" class="forum-filter-pill" data-cat="attendance" onclick="filterForumCategory(\'attendance\', this)">' +
          FORUM_ICONS.attendance + ' <span>Attendance</span>' +
        '</button>' +
      '</div>' +

      '<!-- Discussion Feed Stream -->' +
      '<div id="forum-feed-container" class="forum-feed-container"></div>' +
    '</div>';

  renderForumFeed();
}

function handleForumSearch(val) {
  _forumSearchQuery = (val || '').toLowerCase().trim();
  renderForumFeed();
}

function filterForumCategory(cat, btn) {
  _currentForumCategory = cat;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.forum-filter-pill').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
  }
  renderForumFeed();
}

function filterForumStatus(status) {
  _currentForumStatus = status;
  renderForumFeed();
}

function renderForumFeed() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('forum-feed-container');
  if (!container) return;

  var filtered = forumPosts.filter(function(p) {
    if (_currentForumCategory !== 'all' && p.category !== _currentForumCategory) return false;
    if (_currentForumStatus !== 'all' && p.status !== _currentForumStatus) return false;
    if (_forumSearchQuery) {
      var matchTitle = (p.title || '').toLowerCase().indexOf(_forumSearchQuery) !== -1;
      var matchContent = (p.content || '').toLowerCase().indexOf(_forumSearchQuery) !== -1;
      var matchAuthor = (p.authorName || '').toLowerCase().indexOf(_forumSearchQuery) !== -1;
      var matchTag = (p.tag || '').toLowerCase().indexOf(_forumSearchQuery) !== -1;
      if (!matchTitle && !matchContent && !matchAuthor && !matchTag) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = 
      '<div class="forum-empty-card" style="background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;padding:36px 20px;text-align:center;">' +
        '<div style="width:48px;height:48px;border-radius:12px;background:var(--surface-tint);color:var(--text-muted);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">' +
          FORUM_ICONS.message +
        '</div>' +
        '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">No discussions match your filter</div>' +
        '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px;">Try adjusting your search terms or create a new post to get help.</div>' +
        '<button type="button" class="portal-btn portal-btn-primary" onclick="openCreateForumPostModal()" style="display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;padding:7px 14px;">' +
          FORUM_ICONS.plus + ' <span>New Post</span>' +
        '</button>' +
      '</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(p) {
    var isResolved = p.status === 'resolved';
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(p.title) : p.title;
    var safeContent = (typeof escapeHtml === 'function') ? escapeHtml(p.content) : p.content;
    var safeAuthor = (typeof escapeHtml === 'function') ? escapeHtml(p.authorName) : p.authorName;
    var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(p.authorRank || 'Member') : p.authorRank;
    var authorTooltip = safeAuthor + (safeRank ? ' • ' + safeRank : '');
    var authorAvatarHtml = getForumMemberAvatarHtml(p.authorName, p.authorEmail || p.authorIc, 24, authorTooltip);
    var catIcon = FORUM_ICONS[p.category] || FORUM_ICONS.general;
    var excerpt = safeContent.length > 150 ? (safeContent.slice(0, 147) + '...') : safeContent;
    var perms = getForumUserPermissions(p);

    var adminActionsHtml = '';
    if (perms.canChangeStatus) {
      adminActionsHtml += 
        '<button type="button" class="forum-action-btn" onclick="event.stopPropagation(); toggleForumPostStatus(\'' + p.id + '\')" title="' + (isResolved ? 'Re-open' : 'Mark as Resolved') + '">' +
          (isResolved ? FORUM_ICONS.refresh : FORUM_ICONS.check) +
          '<span>' + (isResolved ? 'Re-open' : 'Resolve') + '</span>' +
        '</button>';
    }
    if (perms.canEdit) {
      adminActionsHtml += 
        '<button type="button" class="forum-action-btn" onclick="event.stopPropagation(); openEditForumPostModal(\'' + p.id + '\')" title="Edit post">' +
          FORUM_ICONS.edit + '<span>Edit</span>' +
        '</button>';
    }
    if (perms.canDelete) {
      adminActionsHtml += 
        '<button type="button" class="forum-action-btn btn-danger" onclick="event.stopPropagation(); deleteForumPost(\'' + p.id + '\')" title="Delete post">' +
          FORUM_ICONS.delete + '<span>Delete</span>' +
        '</button>';
    }

    html += 
      '<div class="forum-post-card" onclick="openForumPostDetail(\'' + p.id + '\')">' +
        '<div class="forum-post-top">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span class="forum-status-badge ' + (isResolved ? 'status-resolved' : 'status-open') + '">' +
              (isResolved ? 'Resolved' : 'Open') +
            '</span>' +
            '<span class="forum-category-pill" style="display:inline-flex;align-items:center;gap:4px;">' +
              catIcon + ' <span>' + (p.tag || p.category) + '</span>' +
            '</span>' +
            (p.triagedByAgent ? '<span class="forum-triaged-badge">Stedfast Triaged</span>' : '') +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            adminActionsHtml +
            '<span class="forum-post-meta">' + (p.date || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="forum-post-title">' + safeTitle + '</div>' +
        '<div class="forum-post-excerpt">' + excerpt + '</div>' +
        '<div class="forum-post-footer">' +
          '<div class="forum-author-meta">' +
            authorAvatarHtml +
            '<span style="font-size:12px;font-weight:600;color:var(--text-primary);">' + safeAuthor + '</span>' +
            '<span style="font-size:11px;color:var(--text-muted);">&bull; ' + safeRank + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<button type="button" class="forum-stat-pill" onclick="event.stopPropagation(); upvoteForumPost(\'' + p.id + '\')" title="Upvote discussion">' +
              FORUM_ICONS.upvote + ' ' + (p.upvotes || 0) +
            '</button>' +
            '<div class="forum-stat-pill" title="Replies">' +
              FORUM_ICONS.message + ' ' + (p.replies ? p.replies.length : 0) + ' replies' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

function upvoteForumPost(postId, userEmail) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;
  var email = userEmail || ((typeof sessionGet === 'function') ? (sessionGet('email') || 'guest') : 'guest');
  p.upvotedBy = p.upvotedBy || [];
  if (p.upvotedBy.indexOf(email) !== -1) {
    p.upvotes = Math.max(0, (p.upvotes || 1) - 1);
    p.upvotedBy = p.upvotedBy.filter(function(e) { return e !== email; });
  } else {
    p.upvotes = (p.upvotes || 0) + 1;
    p.upvotedBy.push(email);
  }
  saveForumPosts(forumPosts);
}

// ── Modals: Create, Edit & Post Details ────────────────────────────────────────

/**
 * Opens modal dialog to create a new discussion thread or report a bug
 */
function openCreateForumPostModal(prefill) {
  if (typeof document === 'undefined') return;

  var existing = document.getElementById('forum-create-modal');
  removeDomElement(existing);

  var modal = document.createElement('div');
  modal.id = 'forum-create-modal';
  modal.className = 'portal-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.onclick = function(e) {
    if (e.target === modal) removeDomElement(modal);
  };

  var pf = prefill || {};

  modal.innerHTML = 
    '<div class="portal-modal-card" style="max-width:580px;width:100%;max-height:88vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
          FORUM_ICONS.plus + ' <span>Create Forum Post / Bug Report</span>' +
        '</div>' +
        '<button type="button" class="helper-icon-btn" onclick="document.getElementById(\'forum-create-modal\').remove()">&times;</button>' +
      '</div>' +
      '<form onsubmit="submitNewForumPost(event)">' +
        '<div class="form-group">' +
          '<label class="form-label">Post Title</label>' +
          '<input type="text" id="forum-new-title" class="form-input" placeholder="e.g., Cannot access badge advancement requirements..." required value="' + (pf.title ? (typeof escapeHtml === 'function' ? escapeHtml(pf.title) : pf.title) : '') + '" />' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="form-group">' +
            '<label class="form-label">Category</label>' +
            '<select id="forum-new-category" class="form-select">' +
              '<option value="bugs"' + (pf.category === 'bugs' ? ' selected' : '') + '>Bugs &amp; Glitches</option>' +
              '<option value="badges"' + (pf.category === 'badges' ? ' selected' : '') + '>Badges &amp; Awards</option>' +
              '<option value="account"' + (pf.category === 'account' ? ' selected' : '') + '>Account &amp; Access</option>' +
              '<option value="store"' + (pf.category === 'store' ? ' selected' : '') + '>Uniform Store</option>' +
              '<option value="attendance"' + (pf.category === 'attendance' ? ' selected' : '') + '>Attendance &amp; Standings</option>' +
              '<option value="general"' + (pf.category === 'general' ? ' selected' : '') + '>General Discussion</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Tag / Component</label>' +
            '<input type="text" id="forum-new-tag" class="form-input" placeholder="e.g., badge-tracker, ui-glitch" value="' + (pf.tag ? (typeof escapeHtml === 'function' ? escapeHtml(pf.tag) : pf.tag) : '') + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Description / Steps to Reproduce</label>' +
          '<textarea id="forum-new-content" class="form-textarea" rows="5" placeholder="Describe your question or issue in detail..." required>' + (pf.content ? (typeof escapeHtml === 'function' ? escapeHtml(pf.content) : pf.content) : '') + '</textarea>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">' +
          '<button type="button" class="portal-btn portal-btn-secondary" onclick="document.getElementById(\'forum-create-modal\').remove()">Cancel</button>' +
          '<button type="submit" class="portal-btn portal-btn-primary" style="font-weight:700;">Publish Post</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  document.body.appendChild(modal);
}

function submitNewForumPost(e, customPost) {
  if (e && e.preventDefault) e.preventDefault();
  var title = '', cat = 'general', tag = '', content = '';
  if (customPost && typeof customPost === 'object') {
    title = (customPost.title || '').trim();
    cat = customPost.category || 'general';
    tag = (customPost.tag || '').trim() || (cat + '-discussion');
    content = (customPost.content || '').trim();
  } else if (typeof document !== 'undefined') {
    var titleEl = document.getElementById('forum-new-title');
    var catEl = document.getElementById('forum-new-category');
    var tagEl = document.getElementById('forum-new-tag');
    var contEl = document.getElementById('forum-new-content');
    title = (titleEl && titleEl.value || '').trim();
    cat = (catEl && catEl.value) || 'general';
    tag = (tagEl && tagEl.value || '').trim() || (cat + '-discussion');
    content = (contEl && contEl.value || '').trim();
  }

  if (!title || !content) return;

  var author = 'Anonymous Member';
  var rank = 'Member';
  var email = 'guest@bb1pj.my';

  var ic = '';
  if (typeof sessionGet === 'function') {
    author = sessionGet('name') || author;
    rank = sessionGet('rank') || rank;
    email = sessionGet('email') || email;
    ic = sessionGet('ic') || ic;
  }

  var catLabels = {
    bugs: 'Bugs & Glitches',
    badges: 'Badges & Awards',
    account: 'Account & Access',
    store: 'Uniform Store',
    attendance: 'Attendance & Standings',
    general: 'General Discussion'
  };

  var newPost = {
    id: 'post-' + Date.now(),
    title: title,
    category: cat,
    categoryLabel: catLabels[cat] || 'General',
    tag: tag,
    status: 'open',
    authorName: author,
    authorRank: rank,
    authorEmail: email,
    authorIc: ic,
    date: new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    content: content,
    upvotes: 0,
    upvotedBy: [],
    replies: [],
    triagedByAgent: false
  };

  forumPosts.unshift(newPost);
  saveForumPosts(forumPosts);
  syncForumNotifications(forumPosts);

  if (typeof document !== 'undefined') {
    var modal = document.getElementById('forum-create-modal');
    removeDomElement(modal);
    if (typeof showToast === 'function') {
      showToast('Forum post published!', 'success');
    }
  }
}

/**
 * Opens edit modal (Super Admins only)
 */
function openEditForumPostModal(postId) {
  if (typeof document === 'undefined') return;
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var perms = getForumUserPermissions(p);
  if (!perms.canEdit) {
    if (typeof showToast === 'function') showToast('Only Super Admins can edit forum posts.', 'warning');
    return;
  }

  var existing = document.getElementById('forum-edit-modal');
  removeDomElement(existing);

  var modal = document.createElement('div');
  modal.id = 'forum-edit-modal';
  modal.className = 'portal-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.onclick = function(e) {
    if (e.target === modal) removeDomElement(modal);
  };

  var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(p.title) : p.title;
  var safeTag = (typeof escapeHtml === 'function') ? escapeHtml(p.tag || '') : (p.tag || '');
  var safeContent = (typeof escapeHtml === 'function') ? escapeHtml(p.content) : p.content;

  modal.innerHTML = 
    '<div class="portal-modal-card" style="max-width:580px;width:100%;max-height:88vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
          FORUM_ICONS.edit + ' <span>Edit Forum Post</span>' +
        '</div>' +
        '<button type="button" class="helper-icon-btn" onclick="document.getElementById(\'forum-edit-modal\').remove()">&times;</button>' +
      '</div>' +
      '<form onsubmit="submitEditForumPost(event, \'' + p.id + '\')">' +
        '<div class="form-group">' +
          '<label class="form-label">Post Title</label>' +
          '<input type="text" id="forum-edit-title" class="form-input" required value="' + safeTitle + '" />' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div class="form-group">' +
            '<label class="form-label">Category</label>' +
            '<select id="forum-edit-category" class="form-select">' +
              '<option value="bugs"' + (p.category === 'bugs' ? ' selected' : '') + '>Bugs &amp; Glitches</option>' +
              '<option value="badges"' + (p.category === 'badges' ? ' selected' : '') + '>Badges &amp; Awards</option>' +
              '<option value="account"' + (p.category === 'account' ? ' selected' : '') + '>Account &amp; Access</option>' +
              '<option value="store"' + (p.category === 'store' ? ' selected' : '') + '>Uniform Store</option>' +
              '<option value="attendance"' + (p.category === 'attendance' ? ' selected' : '') + '>Attendance &amp; Standings</option>' +
              '<option value="general"' + (p.category === 'general' ? ' selected' : '') + '>General Discussion</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Tag / Component</label>' +
            '<input type="text" id="forum-edit-tag" class="form-input" value="' + safeTag + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Description / Content</label>' +
          '<textarea id="forum-edit-content" class="form-textarea" rows="6" required>' + safeContent + '</textarea>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">' +
          '<button type="button" class="portal-btn portal-btn-secondary" onclick="document.getElementById(\'forum-edit-modal\').remove()">Cancel</button>' +
          '<button type="submit" class="portal-btn portal-btn-primary" style="font-weight:700;">Save Changes</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  document.body.appendChild(modal);
}

function submitEditForumPost(e, postId) {
  if (e && e.preventDefault) e.preventDefault();
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var titleEl = document.getElementById('forum-edit-title');
  var catEl = document.getElementById('forum-edit-category');
  var tagEl = document.getElementById('forum-edit-tag');
  var contEl = document.getElementById('forum-edit-content');

  var title = (titleEl && titleEl.value || '').trim();
  var cat = (catEl && catEl.value) || p.category;
  var tag = (tagEl && tagEl.value || '').trim() || p.tag;
  var content = (contEl && contEl.value || '').trim();

  if (!title || !content) return;

  var catLabels = {
    bugs: 'Bugs & Glitches',
    badges: 'Badges & Awards',
    account: 'Account & Access',
    store: 'Uniform Store',
    attendance: 'Attendance & Standings',
    general: 'General Discussion'
  };

  p.title = title;
  p.category = cat;
  p.categoryLabel = catLabels[cat] || 'General';
  p.tag = tag;
  p.content = content;
  p.editedAt = new Date().toISOString();

  saveForumPosts(forumPosts);

  var modal = document.getElementById('forum-edit-modal');
  removeDomElement(modal);

  // If detail modal is open, re-render it
  if (document.getElementById('forum-detail-modal')) {
    openForumPostDetail(postId);
  }

  if (typeof showToast === 'function') {
    showToast('Forum post updated!', 'success');
  }
}

/**
 * Deletes a forum post (Super Admins only)
 */
async function deleteForumPost(postId) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var perms = getForumUserPermissions(p);
  if (!perms.canDelete) {
    if (typeof showToast === 'function') showToast('Only Super Admins can delete forum posts.', 'warning');
    return;
  }

  var confirmed = true;
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(
      'Delete Forum Post',
      'Are you sure you want to delete "' + (p.title || 'this post') + '"? This action cannot be undone.',
      'Delete',
      'Cancel'
    );
  }

  if (!confirmed) return;

  forumPosts = forumPosts.filter(function(x) { return x.id !== postId; });
  saveForumPosts(forumPosts);

  if (typeof document !== 'undefined') {
    var detailModal = document.getElementById('forum-detail-modal');
    removeDomElement(detailModal);
    if (typeof showToast === 'function') {
      showToast('Post deleted successfully.', 'info');
    }
  }
}

/**
 * Deletes a reply within a thread (Super Admins or Reply Author)
 */
async function deleteForumReply(postId, replyId) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p || !p.replies) return;

  var reply = p.replies.find(function(r) { return r.id === replyId; });
  if (!reply) return;

  var perms = getForumUserPermissions(p);
  var email = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : '';
  var isReplyAuthor = reply.authorEmail && email && (reply.authorEmail.toLowerCase().trim() === email);

  if (!perms.isSuperAdmin && !isReplyAuthor) {
    if (typeof showToast === 'function') showToast('Only Super Admins or the author can delete this reply.', 'warning');
    return;
  }

  var confirmed = true;
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(
      'Delete Reply',
      'Are you sure you want to delete this reply?',
      'Delete',
      'Cancel'
    );
  }

  if (!confirmed) return;

  p.replies = p.replies.filter(function(r) { return r.id !== replyId; });
  saveForumPosts(forumPosts);

  if (typeof document !== 'undefined') {
    openForumPostDetail(postId);
    if (typeof showToast === 'function') {
      showToast('Reply removed.', 'info');
    }
  }
}

/**
 * Opens detailed thread view with replies
 */
function openForumPostDetail(postId) {
  if (typeof document === 'undefined') return;
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var existing = document.getElementById('forum-detail-modal');
  removeDomElement(existing);

  var isResolved = p.status === 'resolved';
  var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(p.title) : p.title;
  var safeContent = formatHelperMarkdown(p.content);
  var safeAuthor = (typeof escapeHtml === 'function') ? escapeHtml(p.authorName) : p.authorName;
  var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(p.authorRank || 'Member') : p.authorRank;
  var catIcon = FORUM_ICONS[p.category] || FORUM_ICONS.general;
  var perms = getForumUserPermissions(p);
  var curEmail = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : '';
  var postTooltip = 'Posted by ' + safeAuthor + (safeRank ? ' (' + safeRank + ')' : '');
  var postAvatarHtml = getForumMemberAvatarHtml(p.authorName, p.authorEmail || p.authorIc, 24, postTooltip);
  var timeStr = '';
  if (p.date && p.time) {
    timeStr = p.date + ' at ' + p.time;
  } else if (p.date) {
    timeStr = p.date;
  } else if (p.time) {
    timeStr = p.time;
  }

  var repliesHtml = '';
  if (p.replies && p.replies.length) {
    p.replies.forEach(function(r) {
      var rAuthor = (typeof escapeHtml === 'function') ? escapeHtml(r.authorName) : r.authorName;
      var rRank = (typeof escapeHtml === 'function') ? escapeHtml(r.authorRank || '') : r.authorRank;
      var rRole = (typeof escapeHtml === 'function') ? escapeHtml(r.authorRole || '') : r.authorRole;
      var rContent = formatHelperMarkdown(r.content);
      var isOff = r.isOfficial;
      var canDeleteThisReply = perms.isSuperAdmin || (r.authorEmail && curEmail && r.authorEmail.toLowerCase().trim() === curEmail);

      var replyTooltip = rAuthor + (rRank ? ' (' + rRank + ')' : '');
      var replyAvatarHtml = getForumMemberAvatarHtml(r.authorName, r.authorEmail || r.authorIc, 22, replyTooltip);

      repliesHtml += 
        '<div class="forum-reply-item ' + (isOff ? 'reply-official' : '') + '">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">' +
              replyAvatarHtml +
              '<span style="font-weight:700;font-size:12.5px;color:var(--text-primary);">' + rAuthor + '</span>' +
              '<span style="font-size:11px;color:var(--text-muted);">&bull; ' + rRank + '</span>' +
              (rRole ? '<span style="font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--accent);">' + rRole + '</span>' : '') +
              (isOff ? '<span class="forum-official-badge" style="display:inline-flex;align-items:center;gap:4px;">' + FORUM_ICONS.check + ' <span>Official Answer</span></span>' : '') +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:10.5px;color:var(--text-muted);">' + (r.date || '') + ' ' + (r.time || '') + '</span>' +
              (canDeleteThisReply ? '<button type="button" class="helper-icon-btn" onclick="deleteForumReply(\'' + p.id + '\', \'' + r.id + '\')" title="Delete reply" style="padding:2px;color:var(--text-muted);">' + FORUM_ICONS.delete + '</button>' : '') +
            '</div>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-top:2px;">' + rContent + '</div>' +
        '</div>';
    });
  } else {
    repliesHtml = '<div style="font-size:12px;color:var(--text-muted);padding:14px 0;text-align:center;background:var(--surface-tint);border-radius:8px;">No replies yet. Be the first to answer!</div>';
  }

  var headerActionsHtml = '';
  if (perms.canEdit) {
    headerActionsHtml += 
      '<button type="button" class="forum-action-btn" onclick="openEditForumPostModal(\'' + p.id + '\')" title="Edit post">' +
        FORUM_ICONS.edit + '<span>Edit</span>' +
      '</button>';
  }
  if (perms.canDelete) {
    headerActionsHtml += 
      '<button type="button" class="forum-action-btn btn-danger" onclick="deleteForumPost(\'' + p.id + '\')" title="Delete post">' +
        FORUM_ICONS.delete + '<span>Delete</span>' +
      '</button>';
  }

  var modal = document.createElement('div');
  modal.id = 'forum-detail-modal';
  modal.className = 'portal-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.onclick = function(e) {
    if (e.target === modal) removeDomElement(modal);
  };

  modal.innerHTML = 
    '<div class="portal-modal-card" style="max-width:680px;width:100%;max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;">' +
      '<!-- Modal Top Bar -->' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span class="forum-status-badge ' + (isResolved ? 'status-resolved' : 'status-open') + '">' +
            (isResolved ? 'Resolved' : 'Open') +
          '</span>' +
          '<span class="forum-category-pill" style="display:inline-flex;align-items:center;gap:4px;">' +
            catIcon + ' <span>' + (p.tag || p.category) + '</span>' +
          '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          headerActionsHtml +
          '<button type="button" class="helper-icon-btn" onclick="document.getElementById(\'forum-detail-modal\').remove()">&times;</button>' +
        '</div>' +
      '</div>' +

      '<!-- Title & Author Byline -->' +
      '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px;line-height:1.35;">' + safeTitle + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-muted);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle);">' +
        postAvatarHtml +
        '<span>&bull;</span>' +
        '<span>' + (timeStr || '') + '</span>' +
      '</div>' +

      '<!-- Post Body -->' +
      '<div style="font-size:13.5px;color:var(--text-primary);line-height:1.6;margin-bottom:16px;white-space:pre-wrap;">' + safeContent + '</div>' +
      
      // Super Admin Status Switcher
      (perms.canChangeStatus ? 
        '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-tint);padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);margin-bottom:16px;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:12px;font-weight:600;color:var(--text-secondary);">Thread Status:</span>' +
            '<span class="forum-status-badge ' + (isResolved ? 'status-resolved' : 'status-open') + '">' + (isResolved ? 'Resolved' : 'Open') + '</span>' +
          '</div>' +
          '<button type="button" class="portal-btn" style="font-size:11.5px;padding:4px 12px;display:inline-flex;align-items:center;gap:5px;" onclick="toggleForumPostStatus(\'' + p.id + '\')">' +
            (isResolved ? (FORUM_ICONS.refresh + ' <span>Re-open Issue</span>') : (FORUM_ICONS.check + ' <span>Mark as Resolved</span>')) +
          '</button>' +
        '</div>' : ''
      ) +

      '<!-- Discussion Replies -->' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-top:6px;border-top:1px solid var(--border-subtle);">' +
        '<div style="font-family:var(--font-headline);font-size:14px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">' +
          FORUM_ICONS.message + ' <span>Discussion (' + (p.replies ? p.replies.length : 0) + ')</span>' +
        '</div>' +
      '</div>' +
      '<div class="forum-replies-list" style="display:grid;gap:8px;margin-bottom:16px;">' +
        repliesHtml +
      '</div>' +

      '<!-- Reply Box for Members, Officers and Admins -->' +
      '<form onsubmit="submitForumReply(event, \'' + p.id + '\')" style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border-subtle);">' +
        '<div style="display:flex;gap:8px;align-items:flex-start;">' +
          '<textarea id="forum-reply-input-' + p.id + '" class="form-textarea" rows="2" placeholder="Write a reply or solution..." required style="flex:1;resize:vertical;min-height:50px;font-size:13px;padding:8px 12px;"></textarea>' +
          '<button type="submit" class="portal-btn portal-btn-primary" style="font-weight:700;font-size:12px;padding:8px 16px;height:auto;display:inline-flex;align-items:center;gap:6px;">' +
            FORUM_ICONS.send + ' <span>Reply</span>' +
          '</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  document.body.appendChild(modal);
}

/**
 * Toggles thread status between open and resolved (Super Admins only)
 */
function toggleForumPostStatus(postId, bypassPerms) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var perms = getForumUserPermissions(p);
  if (!bypassPerms && !perms.canChangeStatus) {
    if (typeof showToast === 'function') showToast('Only Super Admins can update thread status.', 'warning');
    return;
  }

  p.status = (p.status === 'resolved') ? 'open' : 'resolved';
  saveForumPosts(forumPosts);

  if (typeof document !== 'undefined') {
    if (document.getElementById('forum-post-detail-modal')) {
      openForumPostDetail(postId);
    }
    if (typeof showToast === 'function') {
      showToast('Post marked as ' + p.status + '!', 'info');
    }
  }
}

function submitForumReply(e, postId, customText) {
  if (typeof e === 'string' && !customText) {
    customText = postId;
    postId = e;
    e = null;
  }
  if (e && e.preventDefault) e.preventDefault();

  var text = '';
  if (customText) {
    text = String(customText).trim();
  } else if (typeof document !== 'undefined') {
    var inp = document.getElementById('forum-reply-input-' + postId);
    if (inp) {
      text = (inp.value || '').trim();
      inp.value = '';
    }
  }

  if (!text) return;

  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;

  var author = 'Anonymous Member';
  var rank = 'Member';
  var role = '';
  var email = 'guest@bb1pj.my';
  var ic = '';
  var isOff = false;

  if (typeof sessionGet === 'function') {
    author = sessionGet('name') || author;
    rank = sessionGet('rank') || rank;
    email = sessionGet('email') || email;
    ic = sessionGet('ic') || ic;
    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;
    var isOfficerRank = rank && ['Captain', 'Honarary Captain', 'Honorary Captain', 'Lieutenant', 'Chaplain', 'Warrant Officer', 'Instructor', 'Staff Sergeant'].includes(rank);
    if (isSuper) {
      isOff = true;
      role = 'Super Admin';
    } else if (isOfficerRank) {
      isOff = true;
      role = 'Officer';
    } else {
      var dept = sessionGet('department');
      if (dept) role = dept + ' NCO';
    }
  }

  p.replies = p.replies || [];
  p.replies.push({
    id: 'rep-' + Date.now(),
    authorName: author,
    authorRank: rank,
    authorRole: role,
    authorEmail: email,
    authorIc: ic,
    date: new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    isOfficial: isOff,
    content: text
  });

  saveForumPosts(forumPosts);

  if (typeof document !== 'undefined') {
    openForumPostDetail(postId);
    if (typeof showToast === 'function') {
      showToast('Reply posted!', 'success');
    }
  }
}

// ── Auto-Initialization ──────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      ensureForumPageDOM();
      ensureHelperAgentDOM();
      loadForumPosts();
    });
  } else {
    setTimeout(function() {
      ensureForumPageDOM();
      ensureHelperAgentDOM();
      loadForumPosts();
    }, 0);
  }
}

// ── Export Interface ─────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.FORUM_ICONS               = FORUM_ICONS;
  window.DEFAULT_FORUM_POSTS       = DEFAULT_FORUM_POSTS;
  window.loadForumPosts            = loadForumPosts;
  window.saveForumPosts            = saveForumPosts;
  window.ensureForumPageDOM        = ensureForumPageDOM;
  window.getForumMemberAvatarHtml  = getForumMemberAvatarHtml;
  window.syncForumNotifications    = syncForumNotifications;
  window.renderForumPage           = renderForumPage;
  window.renderForumFeed           = renderForumFeed;
  window.toggleHelperAgent         = toggleHelperAgent;
  window.clearHelperChat           = clearHelperChat;
  window.handleHelperSubmit        = handleHelperSubmit;
  window.sendHelperPrompt          = sendHelperPrompt;
  window.escalateToForumFromChat   = escalateToForumFromChat;
  window.queryHelperAgent          = queryHelperAgent;
  window.getHelperAgentResponse    = getHelperAgentResponse;
  window.callGeminiApi             = callGeminiApi;
  window.sanitizeStedfastOutput   = sanitizeStedfastOutput;
  window.syncRemoteGeminiApiKey   = syncRemoteGeminiApiKey;
  window.saveRemoteGeminiApiKey   = saveRemoteGeminiApiKey;
  window.toggleHelperSettingsPanel = toggleHelperSettingsPanel;
  window.updateHelperGeminiStatus = updateHelperGeminiStatus;
  window.saveGeminiKeyFromHelper  = saveGeminiKeyFromHelper;
  window.getLastGeminiError       = getLastGeminiError;
  window.listAvailableGeminiModels = listAvailableGeminiModels;
  window.getActiveGeminiModel     = getActiveGeminiModel;
  window.setActiveGeminiModel     = setActiveGeminiModel;
  window.getActiveGeminiApiMode   = getActiveGeminiApiMode;
  window.setActiveGeminiApiMode   = setActiveGeminiApiMode;

  window.getGeminiApiKey           = getGeminiApiKey;
  window.setGeminiApiKey           = setGeminiApiKey;
  window.triageUserQuery           = triageUserQuery;
  window.filterForumCategory       = filterForumCategory;
  window.filterForumStatus         = filterForumStatus;
  window.handleForumSearch         = handleForumSearch;
  window.upvoteForumPost           = upvoteForumPost;
  window.openCreateForumPostModal  = openCreateForumPostModal;
  window.submitNewForumPost        = submitNewForumPost;
  window.openEditForumPostModal    = openEditForumPostModal;
  window.submitEditForumPost       = submitEditForumPost;
  window.deleteForumPost           = deleteForumPost;
  window.deleteForumReply          = deleteForumReply;
  window.openForumPostDetail       = openForumPostDetail;
  window.toggleForumPostStatus     = toggleForumPostStatus;
  window.submitForumReply          = submitForumReply;
  window.getForumUserPermissions   = getForumUserPermissions;
  window.executeHelperAction       = executeHelperAction;
  window.searchForumPostsForHelper = searchForumPostsForHelper;
  window.detectTargetMemberName    = detectTargetMemberName;
  window.PORTAL_NAVIGATION_MAP     = PORTAL_NAVIGATION_MAP;
  window.forumPosts                = forumPosts;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FORUM_ICONS: FORUM_ICONS,
    DEFAULT_FORUM_POSTS: DEFAULT_FORUM_POSTS,
    loadForumPosts: loadForumPosts,
    saveForumPosts: saveForumPosts,
    ensureForumPageDOM: ensureForumPageDOM,
    getForumMemberAvatarHtml: getForumMemberAvatarHtml,
    syncForumNotifications: syncForumNotifications,
    renderForumPage: renderForumPage,
    renderForumFeed: renderForumFeed,
    toggleHelperAgent: toggleHelperAgent,
    clearHelperChat: clearHelperChat,
    handleHelperSubmit: handleHelperSubmit,
    sendHelperPrompt: sendHelperPrompt,
    escalateToForumFromChat: escalateToForumFromChat,
    queryHelperAgent: queryHelperAgent,
    triageUserQuery: triageUserQuery,
    filterForumCategory: filterForumCategory,
    filterForumStatus: filterForumStatus,
    handleForumSearch: handleForumSearch,
    upvoteForumPost: upvoteForumPost,
    openCreateForumPostModal: openCreateForumPostModal,
    submitNewForumPost: submitNewForumPost,
    openEditForumPostModal: openEditForumPostModal,
    submitEditForumPost: submitEditForumPost,
    deleteForumPost: deleteForumPost,
    deleteForumReply: deleteForumReply,
    openForumPostDetail: openForumPostDetail,
    toggleForumPostStatus: toggleForumPostStatus,
    submitForumReply: submitForumReply,
    getForumUserPermissions: getForumUserPermissions,
    executeHelperAction: executeHelperAction,
    searchForumPostsForHelper: searchForumPostsForHelper,
    detectTargetMemberName: detectTargetMemberName,
    PORTAL_NAVIGATION_MAP: PORTAL_NAVIGATION_MAP,
    PORTAL_100_FAQS: PORTAL_100_FAQS,
    getGeminiApiKey: getGeminiApiKey,
    setGeminiApiKey: setGeminiApiKey,
    callGeminiApi: callGeminiApi,
    sanitizeStedfastOutput: sanitizeStedfastOutput,
    syncRemoteGeminiApiKey: syncRemoteGeminiApiKey,
    saveRemoteGeminiApiKey: saveRemoteGeminiApiKey,
    toggleHelperSettingsPanel: toggleHelperSettingsPanel,
    updateHelperGeminiStatus: updateHelperGeminiStatus,
    saveGeminiKeyFromHelper: saveGeminiKeyFromHelper,
    getLastGeminiError: getLastGeminiError,
    listAvailableGeminiModels: listAvailableGeminiModels,
    getActiveGeminiModel: getActiveGeminiModel,
    setActiveGeminiModel: setActiveGeminiModel,
    getActiveGeminiApiMode: getActiveGeminiApiMode,
    setActiveGeminiApiMode: setActiveGeminiApiMode,

    getHelperAgentResponse: getHelperAgentResponse,
    getCompanyResourcesList: getCompanyResourcesList,
    searchCompanyResourcesForHelper: searchCompanyResourcesForHelper,
    resolveDrillManualQuery: resolveDrillManualQuery,
    resolveCompanyResourcesQuery: resolveCompanyResourcesQuery,
    get forumPosts() { return forumPosts; },
    set forumPosts(v) { forumPosts = v; },
    get helperMessages() { return _helperMessages; }
  };
}
