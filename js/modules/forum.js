/**
 * 1st Petaling Jaya Boys' Brigade — AI Support Helper Agent & Bug Forum Module (TSK-046)
 *
 * Implements:
 * 1. "Ask Stedfast" AI Helper Agent:
 *    - Permanent bottom-right floating pill button with quick chat window.
 *    - Interactive FAQ knowledge base answering member inquiries on parade timings,
 *      uniform standards, badge milestone advancement, squad leaderboard, and portal tools.
 *    - Automated issue triage & bug classification with one-click escalation to the forum.
 * 2. Support & Bug Forum Tab:
 *    - Structured community & dev bug forum with categories, statuses, upvotes, and replies.
 *    - Dynamic DOM container injection preserving strict 388 unique DOM IDs in index.html.
 *    - Supabase bb_config persistence with offline state fallback.
 */

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
        date: '28 Oct 2026',
        time: '5:02 PM',
        isOfficial: true,
        content: 'Hi Daniel! Under official BB Senior Section advancement criteria, parade attendance must reach at least 80% across the full service year. Band attendance is recorded separately for Company Band service awards, but both are confidential in the new Member Hub achievement tiers!'
      }
    ],
    triagedByAgent: false
  },
  {
    id: 'post-002',
    title: 'Cannot see the Admin Console button after logging in',
    category: 'account',
    categoryLabel: 'Account & Access',
    tag: 'account-issue',
    status: 'resolved',
    authorName: 'John Doe',
    authorRank: 'Lance Corporal',
    authorEmail: 'johndoe@gmail.com',
    date: '30 Oct 2026',
    time: '11:20 AM',
    content: 'I recently was assigned a squad leader role but the Admin Console button at the bottom of the sidebar is not showing up for me.',
    upvotes: 4,
    upvotedBy: [],
    replies: [
      {
        id: 'rep-002-1',
        authorName: 'Jeshua Koh',
        authorRank: 'Sergeant',
        authorRole: 'Super Admin',
        date: '30 Oct 2026',
        time: '11:45 AM',
        isOfficial: true,
        content: 'Under TSK-049 RBAC, the Admin Console button is strictly gated to verified Officers and HQ Super Admins to protect company administrative data. Squad leaders view standings and attendance directly via the Squad Leaderboard tab!'
      }
    ],
    triagedByAgent: true
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
    tag: 'ui-glitch',
    status: 'resolved',
    authorName: 'Ethan Lim',
    authorRank: 'Corporal',
    authorEmail: 'ethanlim@gmail.com',
    date: '02 Nov 2026',
    time: '10:14 AM',
    content: 'When dragging task cards between Kanban columns in Projects & Tasks, the Add Task button was previously getting stuck between cards.',
    upvotes: 12,
    upvotedBy: ['jeshuakoh2008@gmail.com'],
    replies: [
      {
        id: 'rep-004-1',
        authorName: 'Jeshua Koh',
        authorRank: 'Sergeant',
        authorRole: 'Dev Lead',
        date: '02 Nov 2026',
        time: '12:00 PM',
        isOfficial: true,
        content: 'Resolved in today\'s build! The Add Task button now stays strictly at the bottom of the Kanban column containers below all task cards.'
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
    text: 'Hello! I\'m **Stedfast**, your 1st Petaling Jaya Boys\' Brigade AI Helper. Ask me anything about our company parade schedules, uniform standards, badge milestones, or portal features!',
    time: 'Just now',
    chips: [
      { label: '📅 Parade Timings', query: 'What time is Saturday parade and band?' },
      { label: '🎖️ 80% Attendance Rule', query: 'How does 80% attendance work for badges?' },
      { label: '👔 Uniform Kits', query: 'What are the official uniform kits?' },
      { label: '📋 NCO Tasks Board', query: 'How do I use the Projects and Tasks board?' },
      { label: '🐞 Report a Bug', query: 'I want to report a bug in the portal' }
    ]
  }
];

// ── Knowledge Base FAQ Engine ────────────────────────────────────────────────
var FAQ_KNOWLEDGE_BASE = [
  {
    keywords: ['parade', 'time', 'timing', 'saturday', 'venue', 'where', 'start', 'band'],
    answer: '📍 **Company Parade Schedule**:\n- **Full Company Parade**: Every Saturday from **2:15 PM – 6:00 PM**.\n- **Brass Band Sectionals**: Saturdays from **9:30 AM – 11:30 AM**.\n- **Venue**: Trinity Methodist Church Petaling Jaya (TMC PJ).\n\nCheck the **Weekly Parade** tab for the upcoming parade kit and schedule notices!'
  },
  {
    keywords: ['attendance', '80%', 'milestone', 'service year', 'tier', 'perfect', 'excellent', 'at risk'],
    answer: '🎖️ **Confidential Attendance Tiers (TSK-057)**:\n- **100%**: Perfect (Emerald)\n- **≥ 90%**: Excellent (Blue)\n- **≥ 80%**: Good (Gold) — **One Year Service Qualified ✓**\n- **< 80%**: At Risk (Orange) — One Year Service Pending •\n\nOfficial BB Rule: A minimum **80% attendance threshold** is strictly required to qualify for the BB One Year Service award and President\'s Award service years.'
  },
  {
    keywords: ['uniform', 'kit', 'dress', 'polo', 'cap', 'belt', 'store', 'order'],
    answer: '👔 **Official Uniform Standards & Kits**:\n- **Kit A (Full Ceremonial)**: Long sleeve uniform shirt, cross belt, badges, forage cap, black drill boots.\n- **Kit B (Day Kit)**: Company polo t-shirt, dark trousers, belt.\n- **Kit C (PT / Sports)**: Squad t-shirt, sports pants & running shoes.\n\nNeed to order replacement items? Visit the **Forms & Store** tab to submit an official Uniform Order!'
  },
  {
    keywords: ['boot size', 'shoe size', 'sizing', 'boots size', 'boot', 'boots', 'size'],
    answer: '👞 **Uniform Boot Sizing Chart**:\n- All official BB drill boots adhere strictly to **UK sizing**.\n- When ordering drill boots in the **Forms & Store** tab, order your exact UK shoe size, or a half-size larger if you wear thick ceremonial wool socks.\n- Check seed discussion on the Support Forum for further details!'
  },
  {
    keywords: ['badge', 'founder', 'president', 'syllabus', 'target', 'awards'],
    answer: '🏅 **Badges & Awards Advancement**:\n- Track your target, compulsory, and elective badges in the **My Badges** tab.\n- Founder\'s & President\'s Awards require **3 completed Service Years** with ≥80% attendance per year, alongside required service hours and leadership courses.\n- Download official handbooks and drill manuals in the **Company Resources** tab.'
  },
  {
    keywords: ['task', 'project', 'kanban', 'nco', 'department', 'secretariat', 'logistics', 'media', 'hq'],
    answer: '📋 **Projects & Tasks Kanban Board**:\n- Available for NCOs and Officers assigned to company departments (HQ, Secretariat, Logistics, Media).\n- Drag and drop task cards across *To Do*, *In Progress*, and *Done*.\n- Attach documents, use `@mentions` to ping department members, and add task comments!'
  },
  {
    keywords: ['admin', 'console', 'role', 'super admin', 'permission', 'officer'],
    answer: '🔐 **Role-Based Access Control (RBAC)**:\n- **Member**: Access to Home, Forms, Member Hub, Weekly Parade, Badges, Leaderboard, Resources, and Gallery.\n- **Scoped Admin**: Back-office access restricted to specific departments (e.g., Uniform Store, Story Highlights).\n- **Super Admin / Captain**: Full access to Member Roles Manager and Audit Ledger without passwords.'
  },
  {
    keywords: ['upload', 'size', 'storage', 'limit', 'photo', 'video', 'drive'],
    answer: '📁 **Storage Guidelines**:\n- **Photos**: Direct upload up to **15 MB** (with auto-compression).\n- **Videos**: Direct upload up to **50 MB**.\n- **Large Videos (>50 MB)**: Upload to Google Drive (set access to *"Anyone with the link can view"*) or YouTube and paste the link in Story Highlights.'
  },
  {
    keywords: ['password', 'login', 'account', 'turnstile', 'captcha', 'reset', 'forgot'],
    answer: '🔑 **Account Security & Login**:\n- Passwords use salted PBKDF2 with SHA-256 (100,000 iterations).\n- If you forgot your password, click **Forgot Password** on the Member Hub screen to receive a verification reset link.\n- Protected by Cloudflare Turnstile CAPTCHA for zero tracking and privacy.'
  }
];

/**
 * Triages an issue and checks if it should be escalated to the Bug & Support Forum
 */
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
  var tag = 'ui-glitch';

  if (q.indexOf('badge') !== -1 || q.indexOf('president') !== -1 || q.indexOf('founder') !== -1) {
    category = 'badges';
    categoryLabel = 'Badges & Awards';
    tag = 'bug: badge-tracker';
  } else if (q.indexOf('attendance') !== -1 || q.indexOf('sync') !== -1 || q.indexOf('sheet') !== -1) {
    category = 'attendance';
    categoryLabel = 'Attendance & Sync';
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

/**
 * Answers a user query using the FAQ knowledge base or provides an automated escalation card
 */
function queryHelperAgent(userText) {
  var q = (userText || '').toLowerCase().trim();
  if (!q) return null;

  // 1. Check for bug/escalation triage
  var triage = triageUserQuery(userText);

  // 2. Check FAQ Knowledge Base
  var bestMatch = null;
  var highestScore = 0;

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

  if (bestMatch && highestScore >= 1 && !triage) {
    return {
      text: bestMatch.answer,
      triage: null
    };
  }

  if (triage) {
    var responseText = 'I\'ve analyzed your issue regarding **' + triage.categoryLabel + '**.\n\n'
      + '💡 **Quick Tip**: Try doing a hard refresh (`Ctrl + Shift + R` or `Cmd + Shift + R`) to ensure your browser has loaded the latest company portal version.\n\n'
      + 'If the problem persists, I can escalate this directly to the 1st PJ Dev Team and Officers in our **Support & Bug Forum**:';

    return {
      text: responseText,
      triage: triage
    };
  }

  // Fallback answer
  return {
    text: 'I\'m not completely sure about that specific detail yet, but our Officers and Dev Team are ready to assist! You can post your question in the **Support & Bug Forum** or explore the **Resources** tab for official documentation.',
    triage: {
      category: 'general',
      categoryLabel: 'General Support',
      tag: 'general-support',
      suggestedTitle: userText.length > 50 ? (userText.slice(0, 47) + '...') : userText
    }
  };
}

// ── Floating Button & Chat Drawer DOM Controller ──────────────────────────────
/**
 * Injects the Helper Agent Floating Pill and Chat Drawer into the document
 */
function ensureHelperAgentDOM() {
  if (typeof document === 'undefined') return;
  var existingBtn = document.getElementById('helper-agent-trigger');
  if (existingBtn) return;

  // 1. Floating Pill Button (Bottom-Right)
  var trigger = document.createElement('button');
  trigger.id = 'helper-agent-trigger';
  trigger.className = 'helper-agent-btn';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Ask Stedfast AI Helper');
  trigger.setAttribute('title', 'Ask Stedfast — 1st PJ Helper Agent');
  trigger.onclick = toggleHelperAgent;

  trigger.innerHTML = 
    '<span class="helper-agent-icon-wrap">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="helper-anchor-icon">' +
        '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>' +
      '</svg>' +
      '<span class="helper-pulse-dot"></span>' +
    '</span>' +
    '<span class="helper-agent-label">Ask Stedfast</span>';

  // 2. Chat Drawer Modal Container
  var chatBox = document.createElement('div');
  chatBox.id = 'helper-agent-drawer';
  chatBox.className = 'helper-agent-drawer';
  chatBox.style.display = 'none';
  chatBox.setAttribute('role', 'dialog');
  chatBox.setAttribute('aria-label', 'Stedfast Support Helper Agent');

  chatBox.innerHTML = 
    '<div class="helper-drawer-header">' +
      '<div class="helper-drawer-title-group">' +
        '<div class="helper-avatar-badge">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon-sm">' +
            '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>' +
          '</svg>' +
        '</div>' +
        '<div>' +
          '<div class="helper-drawer-name">Stedfast AI</div>' +
          '<div class="helper-drawer-sub">1st PJ Brigade &amp; Portal Helper</div>' +
        '</div>' +
      '</div>' +
      '<div class="helper-drawer-actions">' +
        '<button type="button" class="helper-icon-btn" onclick="clearHelperChat()" title="Reset Conversation" aria-label="Reset Conversation">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>' +
        '</button>' +
        '<button type="button" class="helper-icon-btn" onclick="toggleHelperAgent()" title="Close Assistant" aria-label="Close Assistant">&times;</button>' +
      '</div>' +
    '</div>' +
    '<div class="helper-drawer-body" id="helper-drawer-body">' +
      '<!-- Messages injected here -->' +
    '</div>' +
    '<form class="helper-drawer-footer" onsubmit="handleHelperSubmit(event)">' +
      '<input type="text" id="helper-agent-input" class="helper-agent-input" placeholder="Ask Stedfast about parade, badges, tasks..." autocomplete="off" />' +
      '<button type="submit" class="helper-send-btn" title="Send message" aria-label="Send message">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
      '</button>' +
    '</form>';

  document.body.appendChild(trigger);
  document.body.appendChild(chatBox);
  renderHelperMessages();
}

/**
 * Toggles helper chat drawer open / close
 */
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

/**
 * Clears conversation history back to the initial greeting
 */
function clearHelperChat() {
  _helperMessages = [
    {
      sender: 'agent',
      text: 'Conversation reset! I\'m **Stedfast**, your 1st PJ portal helper. How can I assist you today?',
      time: 'Just now',
      chips: [
        { label: '📅 Parade Timings', query: 'What time is Saturday parade and band?' },
        { label: '🎖️ 80% Attendance Rule', query: 'How does 80% attendance work for badges?' },
        { label: '👔 Uniform Kits', query: 'What are the official uniform kits?' },
        { label: '📋 NCO Tasks Board', query: 'How do I use the Projects and Tasks board?' },
        { label: '🐞 Report a Bug', query: 'I want to report a bug in the portal' }
      ]
    }
  ];
  renderHelperMessages();
}

/**
 * Renders conversation messages in the Helper Agent drawer
 */
function renderHelperMessages() {
  if (typeof document === 'undefined') return;
  var body = document.getElementById('helper-drawer-body');
  if (!body) return;

  var html = '';
  _helperMessages.forEach(function(msg, idx) {
    var isUser = msg.sender === 'user';
    var safeText = formatHelperMarkdown(msg.text);

    html += '<div class="helper-msg-row ' + (isUser ? 'msg-user' : 'msg-agent') + '">'
      + (!isUser ? '<div class="helper-msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg></div>' : '')
      + '<div class="helper-msg-bubble">'
        + '<div class="helper-msg-text">' + safeText + '</div>'
        + (msg.triage ? renderTriageCardHtml(msg.triage, idx) : '')
        + (msg.chips && msg.chips.length ? renderChipsHtml(msg.chips) : '')
        + '<div class="helper-msg-time">' + (msg.time || '') + '</div>'
      + '</div>'
    + '</div>';
  });

  body.innerHTML = html;
  body.scrollTop = body.scrollHeight;
}

/**
 * Formats basic markdown bold, italic, code, line breaks safely
 */
function formatHelperMarkdown(text) {
  if (!text) return '';
  var s = (typeof escapeHtml === 'function') ? escapeHtml(text) : text;
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code class="helper-inline-code">$1</code>');
  s = s.replace(/\n/g, '<br/>');
  return s;
}

function renderChipsHtml(chips) {
  var h = '<div class="helper-prompt-chips">';
  chips.forEach(function(c) {
    var safeLabel = (typeof escapeHtml === 'function') ? escapeHtml(c.label) : c.label;
    var safeQ = (typeof escapeHtml === 'function') ? escapeHtml(c.query) : c.query;
    h += '<button type="button" class="helper-chip" onclick="sendHelperPrompt(\'' + safeQ.replace(/'/g, "\\'") + '\')">' + safeLabel + '</button>';
  });
  h += '</div>';
  return h;
}

function renderTriageCardHtml(triage, msgIdx) {
  var safeCat = (typeof escapeHtml === 'function') ? escapeHtml(triage.categoryLabel) : triage.categoryLabel;
  var safeTag = (typeof escapeHtml === 'function') ? escapeHtml(triage.tag) : triage.tag;

  return '<div class="helper-triage-card">'
    + '<div class="helper-triage-header">'
      + '<span class="helper-tag-pill">' + safeTag + '</span>'
      + '<span style="font-size:10.5px;color:var(--text-muted);">' + safeCat + '</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text-secondary);margin:6px 0;">Would you like me to log this bug to the community forum?</div>'
    + '<button type="button" class="helper-escalate-btn" onclick="escalateToForumFromChat(' + msgIdx + ')">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      + 'Post to Bug &amp; Support Forum'
    + '</button>'
  + '</div>';
}

/**
 * Handles text input submission to Helper Agent
 */
function handleHelperSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var input = document.getElementById('helper-agent-input');
  if (!input) return;
  var q = (input.value || '').trim();
  if (!q) return;
  input.value = '';
  sendHelperPrompt(q);
}

function sendHelperPrompt(userText) {
  var now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });

  // Add user message
  _helperMessages.push({
    sender: 'user',
    text: userText,
    time: now
  });
  renderHelperMessages();

  // Generate Agent response
  setTimeout(function() {
    var reply = queryHelperAgent(userText);
    _helperMessages.push({
      sender: 'agent',
      text: reply.text,
      time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
      triage: reply.triage,
      chips: !reply.triage ? [
        { label: '📅 Parade Timings', query: 'What time is Saturday parade and band?' },
        { label: '🎖️ 80% Attendance Rule', query: 'How does 80% attendance work for badges?' },
        { label: '👔 Uniform Kits', query: 'What are the official uniform kits?' }
      ] : null
    });
    renderHelperMessages();
  }, 350);
}

/**
 * Escalates an automated triage card from chat directly to the Bug Forum
 */
function escalateToForumFromChat(msgIdx) {
  var msg = _helperMessages[msgIdx];
  if (!msg || !msg.triage) return;
  var triage = msg.triage;

  var author = 'Anonymous Member';
  var email = 'member@1stpj.org';
  var rank = 'Member';

  if (typeof sessionGet === 'function') {
    author = sessionGet('name') || author;
    email = sessionGet('email') || email;
    rank = sessionGet('rank') || rank;
  }

  var newPost = {
    id: 'post-' + Date.now(),
    title: triage.suggestedTitle,
    category: triage.category,
    categoryLabel: triage.categoryLabel,
    tag: triage.tag,
    status: 'open',
    authorName: author,
    authorRank: rank,
    authorEmail: email,
    date: new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    content: 'Automated Issue Triage escalated via Stedfast AI Helper:\n\nUser Question/Report: "' + triage.suggestedTitle + '"\nTriaged Category: ' + triage.categoryLabel + ' (' + triage.tag + ')\nSubmitted by: ' + author + ' (' + rank + ').',
    upvotes: 1,
    upvotedBy: [email],
    replies: [
      {
        id: 'rep-init-' + Date.now(),
        authorName: 'Stedfast AI',
        authorRank: 'Bot',
        authorRole: 'Automated Triage',
        date: 'Just now',
        time: '',
        isOfficial: true,
        content: '🤖 Issue automatically triaged and assigned to Dev Team backlog. Officers and developers have been notified.'
      }
    ],
    triagedByAgent: true
  };

  forumPosts.unshift(newPost);
  saveForumPosts(forumPosts);

  // Mark triage resolved in chat
  msg.triage = null;
  _helperMessages.push({
    sender: 'agent',
    text: '✅ Your issue has been successfully logged to our **Support & Bug Forum** as: *" ' + newPost.title + ' "*.\n\n[Click here to view your post in the Forum →](javascript:switchTabNav(\'forum\'))',
    time: 'Just now'
  });
  renderHelperMessages();

  if (typeof showToast === 'function') {
    showToast('Bug escalated to Support Forum!', 'success');
  }
}

// ── Support & Bug Forum Tab Controller ────────────────────────────────────────
/**
 * Loads Forum posts from Supabase bb_config with fallback to default set
 */
async function loadForumPosts() {
  try {
    var client = (typeof getSupa === 'function') ? getSupa() : null;
    if (client && typeof client.get === 'function') {
      var rows = await client.get('bb_config?key=eq.bb_forum_posts&select=value');
      if (rows && rows.length && rows[0].value) {
        var parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        if (Array.isArray(parsed) && parsed.length) {
          forumPosts = parsed;
        }
      }
    }
  } catch (e) {
    console.warn('loadForumPosts error:', e);
  }
  return forumPosts;
}

/**
 * Saves Forum posts to Supabase bb_config
 */
async function saveForumPosts(newList) {
  if (Array.isArray(newList)) {
    forumPosts = newList;
  }
  try {
    var client = (typeof getSupa === 'function') ? getSupa() : null;
    if (client && typeof client.upsert === 'function') {
      await client.upsert('bb_config', {
        key: 'bb_forum_posts',
        value: JSON.stringify(forumPosts)
      }, 'key');
    }
  } catch (e) {
    console.warn('saveForumPosts error:', e);
  }
  renderForumFeed();
  return true;
}

/**
 * Renders the Support & Bug Forum Page View into #page-forum
 */
function renderForumPage() {
  if (typeof document === 'undefined') return;

  // Dynamically ensure #page-forum section exists (preserves exact 388 DOM IDs in index.html)
  var page = document.getElementById('page-forum');
  if (!page) {
    var main = document.querySelector('.main-content') || document.body;
    page = document.createElement('section');
    page.id = 'page-forum';
    page.className = 'page active';
    page.setAttribute('aria-label', 'Support & Bug Forum');
    main.appendChild(page);
  } else {
    page.classList.add('active');
  }

  page.innerHTML = 
    '<div class="forum-container">' +
      '<!-- Header Hero -->' +
      '<div class="forum-hero-card">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;">' +
          '<div>' +
            '<div style="font-family:var(--font-headline);font-size:24px;font-weight:800;color:var(--text-primary);letter-spacing:0.5px;display:flex;align-items:center;gap:10px;">' +
              '<span class="forum-hero-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon">' +
                  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
                '</svg>' +
              '</span>' +
              'Support &amp; Bug Forum' +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;max-width:640px;line-height:1.5;">' +
              'Ask member questions, browse official troubleshooting guides, and report portal bugs directly to the 1st PJ Dev Team.' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<button type="button" class="portal-btn portal-btn-primary" onclick="openCreateForumPostModal()" style="display:inline-flex;align-items:center;gap:6px;font-weight:700;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
              '+ New Post / Bug Report' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Search & Filter Controls Bar -->' +
      '<div class="forum-controls-bar">' +
        '<div class="forum-search-wrap">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-sm" style="color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
          '<input type="search" class="forum-search-input" placeholder="Search forum posts, bug reports, tags..." oninput="handleForumSearch(this.value)" />' +
        '</div>' +
        '<div class="forum-filter-scroll">' +
          '<button type="button" class="forum-filter-pill active" data-cat="all" onclick="filterForumCategory(\'all\', this)">All Categories</button>' +
          '<button type="button" class="forum-filter-pill" data-cat="bugs" onclick="filterForumCategory(\'bugs\', this)">🐞 Bugs</button>' +
          '<button type="button" class="forum-filter-pill" data-cat="badges" onclick="filterForumCategory(\'badges\', this)">🎖️ Badges</button>' +
          '<button type="button" class="forum-filter-pill" data-cat="account" onclick="filterForumCategory(\'account\', this)">🔐 Account</button>' +
          '<button type="button" class="forum-filter-pill" data-cat="store" onclick="filterForumCategory(\'store\', this)">🛍️ Store</button>' +
          '<button type="button" class="forum-filter-pill" data-cat="attendance" onclick="filterForumCategory(\'attendance\', this)">📊 Attendance</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<select class="form-input" style="font-size:11px;padding:4px 8px;width:auto;" onchange="filterForumStatus(this.value)">' +
            '<option value="all">All Status</option>' +
            '<option value="open">🟢 Open</option>' +
            '<option value="resolved">🔵 Resolved</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<!-- Posts Feed Container -->' +
      '<div class="forum-feed-container" id="forum-feed-container">' +
        '<!-- Rendered via renderForumFeed() -->' +
      '</div>' +
    '</div>';

  renderForumFeed();
}

/**
 * Filters and renders posts into the forum feed
 */
function renderForumFeed() {
  if (typeof document === 'undefined') return;
  var feed = document.getElementById('forum-feed-container');
  if (!feed) return;

  var q = (_forumSearchQuery || '').toLowerCase().trim();
  var filtered = forumPosts.filter(function(p) {
    if (_currentForumCategory !== 'all' && p.category !== _currentForumCategory) return false;
    if (_currentForumStatus !== 'all' && p.status !== _currentForumStatus) return false;
    if (q) {
      var matchTitle = (p.title || '').toLowerCase().indexOf(q) !== -1;
      var matchContent = (p.content || '').toLowerCase().indexOf(q) !== -1;
      var matchTag = (p.tag || '').toLowerCase().indexOf(q) !== -1;
      var matchAuthor = (p.authorName || '').toLowerCase().indexOf(q) !== -1;
      if (!matchTitle && !matchContent && !matchTag && !matchAuthor) return false;
    }
    return true;
  });

  if (!filtered.length) {
    feed.innerHTML = 
      '<div class="forum-empty-card">' +
        '<div class="forum-empty-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-lg"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '</div>' +
        '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);margin-top:8px;">No forum posts found</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Try adjusting your search terms or be the first to create a post!</div>' +
      '</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(post) {
    var isResolved = post.status === 'resolved';
    var statusClass = isResolved ? 'status-resolved' : 'status-open';
    var statusText = isResolved ? 'Resolved' : 'Open';
    var replyCount = post.replies ? post.replies.length : 0;
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(post.title) : post.title;
    var safeTag = (typeof escapeHtml === 'function') ? escapeHtml(post.tag || post.category) : post.tag;
    var safeAuthor = (typeof escapeHtml === 'function') ? escapeHtml(post.authorName) : post.authorName;
    var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(post.authorRank || 'Member') : post.authorRank;
    var safeExcerpt = (typeof escapeHtml === 'function') ? escapeHtml(post.content) : post.content;
    if (safeExcerpt.length > 180) safeExcerpt = safeExcerpt.slice(0, 177) + '...';

    html += 
      '<div class="forum-post-card" onclick="openForumPostDetail(\'' + post.id + '\')">' +
        '<div class="forum-post-top">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span class="forum-status-badge ' + statusClass + '">' + statusText + '</span>' +
            '<span class="forum-category-pill">' + safeTag + '</span>' +
            (post.triagedByAgent ? '<span class="forum-triaged-badge" title="Auto-triaged by Stedfast AI">🤖 Stedfast Triaged</span>' : '') +
          '</div>' +
          '<div class="forum-post-meta">' + (post.date || '') + '</div>' +
        '</div>' +
        '<div class="forum-post-title">' + safeTitle + '</div>' +
        '<div class="forum-post-excerpt">' + safeExcerpt + '</div>' +
        '<div class="forum-post-footer">' +
          '<div class="forum-author-meta">' +
            '<div class="forum-avatar-mini">' + (safeAuthor.charAt(0).toUpperCase()) + '</div>' +
            '<div>' +
              '<span class="forum-author-name">' + safeAuthor + '</span>' +
              '<span class="forum-author-rank">&middot; ' + safeRank + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="forum-post-stats">' +
            '<button type="button" class="forum-stat-btn" onclick="event.stopPropagation();upvoteForumPost(\'' + post.id + '\')" title="Upvote post">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>' +
              ' ' + (post.upvotes || 0) +
            '</button>' +
            '<span class="forum-stat-pill">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ui-icon-xs"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
              ' ' + replyCount + ' replies' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  });

  feed.innerHTML = html;
}

function handleForumSearch(val) {
  _forumSearchQuery = val || '';
  renderForumFeed();
}

function filterForumCategory(cat, btn) {
  _currentForumCategory = cat;
  document.querySelectorAll('.forum-filter-pill').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderForumFeed();
}

function filterForumStatus(st) {
  _currentForumStatus = st;
  renderForumFeed();
}

function upvoteForumPost(postId) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;
  var email = (typeof sessionGet === 'function') ? (sessionGet('email') || 'guest') : 'guest';
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

// ── Modals: Create Post & Post Details ────────────────────────────────────────
function removeDomElement(el) {
  if (!el) return;
  if (typeof el.remove === 'function') {
    el.remove();
  } else if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
    el.parentNode.removeChild(el);
  }
}

function openCreateForumPostModal() {
  var existing = document.getElementById('forum-create-modal');
  removeDomElement(existing);

  var modal = document.createElement('div');
  modal.id = 'forum-create-modal';
  modal.className = 'portal-modal-backdrop';
  modal.style.display = 'flex';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = 
    '<div class="portal-modal-card" style="max-width:560px;width:100%;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);">Create Forum Post / Bug Report</div>' +
        '<button type="button" class="helper-icon-btn" onclick="document.getElementById(\'forum-create-modal\').remove()">&times;</button>' +
      '</div>' +
      '<form onsubmit="submitNewForumPost(event)">' +
        '<div class="form-group" style="margin-bottom:12px;">' +
          '<label class="form-label">Post Title / Issue Summary *</label>' +
          '<input type="text" id="forum-new-title" class="form-input" required placeholder="e.g. Cannot see uniform size options or Question on badge requirements" />' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
          '<div>' +
            '<label class="form-label">Category *</label>' +
            '<select id="forum-new-category" class="form-input">' +
              '<option value="bugs">🐞 Bugs &amp; Glitches</option>' +
              '<option value="badges">🎖️ Badges &amp; Awards</option>' +
              '<option value="account">🔐 Account &amp; Access</option>' +
              '<option value="store">🛍️ Uniform Store</option>' +
              '<option value="attendance">📊 Attendance &amp; Sync</option>' +
              '<option value="general">💬 General Support</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label class="form-label">Issue Tag</label>' +
            '<input type="text" id="forum-new-tag" class="form-input" placeholder="e.g. ui-glitch, badge-advancement" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:14px;">' +
          '<label class="form-label">Detailed Description / Steps to Reproduce *</label>' +
          '<textarea id="forum-new-content" class="form-input" rows="4" required placeholder="Describe what happened, what you expected, and any helpful context for the officers and developers..."></textarea>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
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
  var email = 'member@1stpj.org';
  var rank = 'Member';
  if (typeof sessionGet === 'function') {
    author = sessionGet('name') || author;
    email = sessionGet('email') || email;
    rank = sessionGet('rank') || rank;
  }

  var newPost = {
    id: 'post-' + Date.now(),
    title: title,
    category: cat,
    categoryLabel: cat.charAt(0).toUpperCase() + cat.slice(1),
    tag: tag,
    status: 'open',
    authorName: author,
    authorRank: rank,
    authorEmail: email,
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

  if (typeof document !== 'undefined') {
    var modal = document.getElementById('forum-create-modal');
    removeDomElement(modal);
  }

  if (typeof showToast === 'function') {
    showToast('Forum post published successfully!', 'success');
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

  var repliesHtml = '';
  if (p.replies && p.replies.length) {
    p.replies.forEach(function(r) {
      var rAuthor = (typeof escapeHtml === 'function') ? escapeHtml(r.authorName) : r.authorName;
      var rRank = (typeof escapeHtml === 'function') ? escapeHtml(r.authorRank || '') : r.authorRank;
      var rContent = formatHelperMarkdown(r.content);
      var isOff = r.isOfficial;

      repliesHtml += 
        '<div class="forum-reply-item ' + (isOff ? 'reply-official' : '') + '">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-weight:700;font-size:12px;color:var(--text-primary);">' + rAuthor + '</span>' +
              '<span style="font-size:11px;color:var(--text-muted);">' + rRank + '</span>' +
              (isOff ? '<span class="forum-official-badge">✓ Official Answer</span>' : '') +
            '</div>' +
            '<span style="font-size:10px;color:var(--text-muted);">' + (r.date || '') + ' ' + (r.time || '') + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">' + rContent + '</div>' +
        '</div>';
    });
  } else {
    repliesHtml = '<div style="font-size:11.5px;color:var(--text-muted);padding:10px 0;">No replies yet. Be the first to reply!</div>';
  }

  var modal = document.createElement('div');
  modal.id = 'forum-detail-modal';
  modal.className = 'portal-modal-backdrop';
  modal.style.display = 'flex';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = 
    '<div class="portal-modal-card" style="max-width:620px;width:100%;max-height:88vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span class="forum-status-badge ' + (isResolved ? 'status-resolved' : 'status-open') + '">' + (isResolved ? 'Resolved' : 'Open') + '</span>' +
          '<span class="forum-category-pill">' + (p.tag || p.category) + '</span>' +
        '</div>' +
        '<button type="button" class="helper-icon-btn" onclick="document.getElementById(\'forum-detail-modal\').remove()">&times;</button>' +
      '</div>' +
      '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">' + safeTitle + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-muted);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle);">' +
        '<span>Posted by <strong>' + safeAuthor + '</strong> (' + safeRank + ')</span>' +
        '<span>&middot;</span>' +
        '<span>' + (p.date || '') + ' at ' + (p.time || '') + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-primary);line-height:1.6;margin-bottom:16px;">' + safeContent + '</div>' +
      
      // Admin/Officer Status Switcher Action
      '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card-subtle);padding:8px 12px;border-radius:8px;border:1px solid var(--border-card);margin-bottom:16px;">' +
        '<span style="font-size:11.5px;font-weight:600;color:var(--text-secondary);">Manage Status:</span>' +
        '<button type="button" class="portal-btn" style="font-size:11px;padding:3px 10px;" onclick="toggleForumPostStatus(\'' + p.id + '\')">' +
          (isResolved ? 'Re-open Issue' : 'Mark as Resolved ✓') +
        '</button>' +
      '</div>' +

      // Discussion Thread
      '<div style="font-family:var(--font-headline);font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">Discussion (' + (p.replies ? p.replies.length : 0) + ')</div>' +
      '<div class="forum-replies-list" style="display:grid;gap:8px;margin-bottom:14px;">' +
        repliesHtml +
      '</div>' +

      // Add Reply Form
      '<form onsubmit="submitForumReply(event, \'' + p.id + '\')" style="display:flex;gap:8px;">' +
        '<input type="text" id="forum-reply-input-' + p.id + '" class="form-input" placeholder="Write a response or solution..." required style="flex:1;" />' +
        '<button type="submit" class="portal-btn portal-btn-primary" style="font-weight:700;font-size:11.5px;padding:6px 14px;">Reply</button>' +
      '</form>' +
    '</div>';

  document.body.appendChild(modal);
}

function toggleForumPostStatus(postId) {
  var p = forumPosts.find(function(x) { return x.id === postId; });
  if (!p) return;
  p.status = (p.status === 'resolved') ? 'open' : 'resolved';
  saveForumPosts(forumPosts);
  if (typeof document !== 'undefined') openForumPostDetail(postId);
  if (typeof showToast === 'function') {
    showToast('Post status updated to ' + p.status + '!', 'info');
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
  var isOff = false;

  if (typeof sessionGet === 'function') {
    author = sessionGet('name') || author;
    rank = sessionGet('rank') || rank;
    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;
    var isOfficerRank = rank && ['Captain', 'Lieutenant', 'Chaplain', 'Warrant Officer'].includes(rank);
    if (isSuper) {
      isOff = true;
      role = 'Super Admin';
    } else if (isOfficerRank) {
      isOff = true;
      role = 'Officer';
    }
  }

  p.replies = p.replies || [];
  p.replies.push({
    id: 'rep-' + Date.now(),
    authorName: author,
    authorRank: rank,
    authorRole: role,
    date: new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    isOfficial: isOff,
    content: text
  });

  saveForumPosts(forumPosts);
  if (typeof document !== 'undefined') openForumPostDetail(postId);
  if (typeof showToast === 'function') {
    showToast('Reply posted!', 'success');
  }
}

// ── Auto-Initialization ──────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      ensureHelperAgentDOM();
      loadForumPosts();
    });
  } else {
    setTimeout(function() {
      ensureHelperAgentDOM();
      loadForumPosts();
    }, 0);
  }
}

// ── Export Interface ─────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEFAULT_FORUM_POSTS       = DEFAULT_FORUM_POSTS;
  window.loadForumPosts            = loadForumPosts;
  window.saveForumPosts            = saveForumPosts;
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
  window.openForumPostDetail       = openForumPostDetail;
  window.toggleForumPostStatus     = toggleForumPostStatus;
  window.submitForumReply          = submitForumReply;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_FORUM_POSTS: DEFAULT_FORUM_POSTS,
    loadForumPosts: loadForumPosts,
    saveForumPosts: saveForumPosts,
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
    openForumPostDetail: openForumPostDetail,
    toggleForumPostStatus: toggleForumPostStatus,
    submitForumReply: submitForumReply,
    get forumPosts() { return forumPosts; },
    set forumPosts(v) { forumPosts = v; },
    get helperMessages() { return _helperMessages; }
  };
}
