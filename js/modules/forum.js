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
    authorName: 'Daniel Yap',
    authorRank: 'L/Cpl',
    authorEmail: 'danielyap@gmail.com',
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
        content: 'Hi Daniel! Under official BB Senior Section advancement criteria, parade attendance must reach at least 80% across the full service year. Band attendance is recorded separately for Company Band service awards, but both are confidential in the new Member Hub achievement tiers.'
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
    authorName: 'Aaron Ng',
    authorRank: 'Private',
    authorEmail: 'aaronng@gmail.com',
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
        authorEmail: 'jasonkoh@gmail.com',
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
    authorName: 'Ethan Lim',
    authorRank: 'Corporal',
    authorEmail: 'ethanlim@gmail.com',
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

// ── Knowledge Base FAQ Engine (Zero Emojis) ──────────────────────────────────
var FAQ_KNOWLEDGE_BASE = [
  {
    keywords: ['parade', 'saturday', 'venue', 'parade time', 'band rehearsal', 'brass band', 'tmc pj'],
    answer: '**Company Parade Schedule**:\n- **Full Company Parade**: Every Saturday from **2:15 PM – 6:00 PM**.\n- **Brass Band Sectionals**: Saturdays from **9:30 AM – 11:30 AM**.\n- **Venue**: Trinity Methodist Church Petaling Jaya (TMC PJ).\n\nCheck the **Weekly Parade** tab for the upcoming parade kit and schedule notices.'
  },
  {
    keywords: ['attendance', '80%', 'milestone', 'service year', 'tier', 'perfect', 'excellent', 'at risk'],
    answer: '**Confidential Attendance Tiers**:\n- **100%**: Perfect (Emerald tier)\n- **≥ 90%**: Excellent (Blue tier)\n- **≥ 80%**: Good (Gold tier) — **One Year Service Qualified**\n- **< 80%**: At Risk (Orange tier) — One Year Service Pending\n\nOfficial BB Rule: A minimum **80% attendance threshold** is strictly required to qualify for the BB One Year Service award.'
  },
  {
    keywords: ['uniform', 'kit', 'dress', 'polo', 'cap', 'belt', 'store', 'order'],
    answer: '**Official Uniform Standards & Kits**:\n- **Kit A (Full Ceremonial)**: Long sleeve uniform shirt, cross belt, badges, forage cap, black drill boots.\n- **Kit B (Day Kit)**: Company polo t-shirt, dark trousers, belt.\n- **Kit C (PT / Sports)**: Squad t-shirt, sports pants & running shoes.\n\nNeed to order replacement items? Visit the **Forms & Store** tab to submit an official Uniform Order.'
  },
  {
    keywords: ['boot size', 'shoe size', 'sizing', 'boots size', 'boot', 'boots', 'size'],
    answer: '**Uniform Boot Sizing Chart**:\n- All official BB drill boots adhere strictly to **UK sizing**.\n- When ordering drill boots in the **Forms & Store** tab, order your exact UK shoe size, or a half-size larger if you wear thick ceremonial wool socks.\n- Check seed discussion on the Support Forum for further details.'
  },
  {
    keywords: ['badge', 'founder', 'president', 'syllabus', 'target', 'awards'],
    answer: '**Badges & Awards Advancement**:\n- Track your target, compulsory, and elective badges in the **My Badges** tab.\n- Founder\'s & President\'s Awards require completed Service Years with qualifying attendance, alongside required service hours and leadership courses.\n- Download official handbooks and drill manuals in the **Company Resources** tab.'
  },
  {
    keywords: ['task', 'project', 'kanban', 'nco', 'department', 'secretariat', 'logistics', 'media', 'hq'],
    answer: '**Projects & Tasks Kanban Board**:\n- Available for NCOs and Officers assigned to company departments (HQ, Secretariat, Logistics, Media).\n- Drag and drop task cards across *To Do*, *In Progress*, and *Done*.\n- Attach documents, use `@mentions` to ping department members, and add task comments.'
  },
  {
    keywords: ['admin', 'console', 'role', 'super admin', 'permission', 'officer'],
    answer: '**Admin Console & Governance**:\n- Gated strictly to verified Officers and HQ Super Admins via RBAC.\n- Super Admins can manage member roles, sync master attendance, manage store products, and broadcast company announcements.'
  },
  {
    keywords: ['storage', 'drive', 'upload', 'file', 'limit', 'mb'],
    answer: '**Cloud Storage & Attachments**:\n- Uploaded task briefs and order proofs are persisted securely in Supabase Storage.\n- Max upload size: 15MB for documents and photos, 50MB for video highlights.'
  },
  {
    keywords: ['password', 'sign out', 'session', 'login', 'security', 'forgot'],
    answer: '**Password & Account Security**:\n- Accounts use salted PBKDF2 with SHA-256 (100,000 iterations).\n- Use *Sign Out Everywhere* in Member Hub to invalidate sessions across all devices if your account is compromised.'
  }
];

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
          '<div class="helper-drawer-sub">1st PJ Boys\' Brigade Assistant</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<button type="button" class="helper-icon-btn" onclick="clearHelperChat()" title="Clear conversation">' + FORUM_ICONS.refresh + '</button>' +
        '<button type="button" class="helper-icon-btn" onclick="toggleHelperAgent()" title="Close chat">&times;</button>' +
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

function toggleHelperAgent() {
  _isHelperAgentOpen = !_isHelperAgentOpen;
  var drawer = document.getElementById('helper-agent-drawer');
  var trigger = document.getElementById('helper-agent-trigger');
  if (!drawer) return;

  if (_isHelperAgentOpen) {
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
  var safe = (typeof escapeHtml === 'function') ? escapeHtml(text) : text;
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

function sendHelperPrompt(userPrompt) {
  var now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  _helperMessages.push({
    sender: 'user',
    text: userPrompt,
    time: now
  });
  renderHelperMessages();

  setTimeout(function() {
    var reply = queryHelperAgent(userPrompt);
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
  }, 250);
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
    getCompanyResourcesList: getCompanyResourcesList,
    searchCompanyResourcesForHelper: searchCompanyResourcesForHelper,
    resolveDrillManualQuery: resolveDrillManualQuery,
    resolveCompanyResourcesQuery: resolveCompanyResourcesQuery,
    get forumPosts() { return forumPosts; },
    set forumPosts(v) { forumPosts = v; },
    get helperMessages() { return _helperMessages; }
  };
}
