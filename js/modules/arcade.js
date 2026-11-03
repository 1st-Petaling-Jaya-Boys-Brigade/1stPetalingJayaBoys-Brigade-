/**
 * 1st Petaling Jaya Boys' Brigade — 1stPJ Arcade Module (TSK-056)
 *
 * Implements:
 * 1. Daily Wordle:
 *    - 5-letter BB-themed word puzzle (FAITH, DRILL, BADGE, SQUAD, ANCHR, FLINT, MAPLE, SCARF, etc.)
 *    - Daily deterministic word rotation based on calendar date.
 *    - 6 attempts with color-coded feedback (correct: green, present: gold, absent: muted grey).
 *    - Interactive on-screen QWERTY keyboard + physical typing support.
 *    - 15 Credits awarded on win.
 *
 * 2. BB Trivia:
 *    - Timed educational quizzes covering BB Object, Founder, Motto, 1st PJ history, drill commands & handbook syllabus.
 *    - 5 randomized multiple-choice questions per round with 15-second countdown timer.
 *    - Detailed handbook explanations upon answer selection.
 *    - 5 Credits awarded per correct answer (up to 25 Credits per round).
 *
 * 3. Credits & Daily Streak Engine:
 *    - Participation in either Wordle or Trivia increments the daily streak.
 *    - Streak is maintained with 1 play/day; resets to 1 if a day is missed.
 *    - Header badge displays Streak (fire icon with count on left) and Total Credits.
 *    - State persisted durably across localStorage, session storage & Supabase bb_config.
 *    - Preserves strict 388 unique DOM IDs invariant in index.html.
 */

(function() {
  'use strict';

  // ── BB-Themed Word Bank (5-Letter Words) ──────────────────────────────────
  var BB_WORDLE_WORDS = [
    'DRILL', 'BADGE', 'SQUAD', 'FAITH', 'BRAVE',
    'HONOR', 'MEDAL', 'LOYAL', 'CROSS', 'PILOT',
    'STAFF', 'MARCH', 'ORDER', 'SCOUT', 'UNITY',
    'FLAGS', 'BOOTS', 'BERET', 'CREST', 'TRUTH',
    'CUBIC', 'FLINT', 'MAPLE', 'SCARF', 'CADET',
    'HASTE', 'SHINE', 'KNOTS', 'GUARD', 'BUGLE',
    'DRUMS', 'STAND', 'PIPER', 'RALLY', 'STARS',
    'VALOR', 'SHARP', 'GUIDE', 'ANCHR', 'ROPEY'
  ];

  // ── Educational BB Trivia Question Bank ──────────────────────────────────
  var BB_TRIVIA_QUESTIONS = [
    {
      q: 'What is the official Motto of The Boys\' Brigade?',
      options: ['Sure & Stedfast', 'Be Prepared', 'Faith & Courage', 'Duty First'],
      correct: 0,
      expl: 'The BB Motto is "Sure & Stedfast", taken from Hebrews 6:19: "Which hope we have as an anchor of the soul, both sure and stedfast".'
    },
    {
      q: 'Who was the Founder of The Boys\' Brigade?',
      options: ['Lord Baden-Powell', 'Sir William Alexander Smith', 'Alexander MacKeith', 'John Shearer'],
      correct: 1,
      expl: 'Sir William Alexander Smith founded The Boys\' Brigade on 4th October 1883 in Glasgow, Scotland.'
    },
    {
      q: 'In what year was 1st Petaling Jaya Boys\' Brigade Company founded?',
      options: ['1954', '1961', '1975', '1983'],
      correct: 1,
      expl: '1st Petaling Jaya Company was founded in 1961 and is sponsored by Trinity Methodist Church PJ.'
    },
    {
      q: 'What is the primary twin pillar foundation of The Boys\' Brigade methodology?',
      options: ['Religion and Discipline', 'Athletics and Academics', 'Camping and Survival', 'Music and Drill'],
      correct: 0,
      expl: 'The twin pillars of The Boys\' Brigade are Religion and Discipline, designed to promote habits of obedience, reverence, discipline, and self-respect.'
    },
    {
      q: 'What is the highest award a Senior Section BB member can achieve in Malaysia?',
      options: ['President\'s Award', 'Founder\'s Badge', 'Gold Badge', 'Chief Leader Cross'],
      correct: 0,
      expl: 'The President\'s Award is the highest national award in the BB Malaysia Senior Section, preceded by the prestigious Founder\'s Badge.'
    },
    {
      q: 'In Foot Drill, what is the command to stand at attention in Malay?',
      options: ['Senang Diri', 'Sedia', 'Rehatkan Diri', 'Ke Kanan Lurus'],
      correct: 1,
      expl: '"Skuad, Sedia!" is the official command for coming to the position of Attention.'
    },
    {
      q: 'What minimum attendance percentage is required across the year for the One Year Service milestone badge?',
      options: ['70%', '75%', '80%', '90%'],
      correct: 2,
      expl: 'A member must attain at least 80% attendance throughout the service year to qualify for the One Year Service milestone badge.'
    },
    {
      q: 'What drill command orders a squad to salute to the front?',
      options: ['Hormat ke hadapan, Hormat', 'Ke kanan pusing', 'Cepat jalan', 'Buka barisan'],
      correct: 0,
      expl: '"Hormat ke hadapan, Hormat" instructs the squad to deliver a standard salute to the front.'
    },
    {
      q: 'What emblem is at the center of The Boys\' Brigade crest?',
      options: ['A Lion', 'An Anchor and Cross', 'A Shield and Spear', 'A Fleur-de-lis'],
      correct: 1,
      expl: 'The BB emblem features an Anchor (symbolizing Christian hope) with the Cross integrated at its center.'
    },
    {
      q: 'What are the two regular parade sections for youth members in 1st PJ?',
      options: ['Junior Section & Senior Section', 'Cadet Section & Scout Section', 'Alpha & Zulu', 'Rookies & Veterans'],
      correct: 0,
      expl: '1st PJ runs Pre-Junior / Junior Section (primary school) and Senior Section (secondary school).'
    },
    {
      q: 'What drill command is given to dress a squad in straight lines?',
      options: ['Pandang Depan', 'Ke Kanan Lurus', 'Tutup Barisan', 'Langkah Ke Sebelah'],
      correct: 1,
      expl: '"Ke Kanan Lurus!" instructs squad members to turn heads right and dress ranks with the right marker.'
    },
    {
      q: 'Which scripture passage provides the inspiration for the BB Motto?',
      options: ['John 3:16', 'Hebrews 6:19', 'Philippians 4:13', 'Psalm 23:1'],
      correct: 1,
      expl: 'Hebrews 6:19: "Which hope we have as an anchor of the soul, both sure and stedfast..."'
    }
  ];

  // ── Internal State ────────────────────────────────────────────────────────
  var _arcadeSubtab = 'wordle'; // 'wordle' | 'trivia' | 'stats'
  var _wordleState = {
    word: '',
    guesses: [],
    currentGuess: '',
    isGameOver: false,
    hasWon: false,
    maxTries: 6,
    dateKey: ''
  };

  var _triviaState = {
    questions: [],
    currentIndex: 0,
    score: 0,
    timer: 15,
    timerInterval: null,
    isAnswered: false,
    isComplete: false
  };

  // ── Date & Daily Key Helpers ──────────────────────────────────────────────
  function getTodayDateKey(ref) {
    var now;
    if (ref instanceof Date) {
      now = ref;
    } else if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      var parts = ref.split('-');
      now = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      now = new Date();
    }
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getYesterdayDateKey(ref) {
    var base;
    if (ref instanceof Date) {
      base = ref;
    } else if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      var parts = ref.split('-');
      base = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      base = new Date();
    }
    var prev = new Date(base.getTime() - 86400000);
    var y = prev.getFullYear();
    var m = String(prev.getMonth() + 1).padStart(2, '0');
    var d = String(prev.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getDailyWordleWord(dateKey) {
    var key = dateKey || getTodayDateKey();
    var seed = 0;
    for (var i = 0; i < key.length; i++) {
      seed = (seed * 31 + key.charCodeAt(i)) % 2147483647;
    }
    var index = Math.abs(seed) % BB_WORDLE_WORDS.length;
    return BB_WORDLE_WORDS[index];
  }

  // ── Credits & Streak Storage Engine ───────────────────────────────────────
  function getArcadeUserKey() {
    var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : null;
    return ic ? ('bb_arcade_' + String(ic).replace(/[^a-zA-Z0-9_-]/g, '_')) : 'bb_arcade_guest';
  }

  function getArcadeStats(refDate) {
    var defaultStats = {
      credits: 0,
      streak: 0,
      bestStreak: 0,
      lastPlayedDate: null,
      wordlePlays: 0,
      wordleWins: 0,
      triviaPlays: 0,
      triviaScoreTotal: 0
    };

    try {
      var key = getArcadeUserKey();
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        // Verify streak freshness: if last played before yesterday, streak resets to 0 until played today
        var today = (typeof refDate === 'string' && refDate) ? getTodayDateKey(refDate) : getTodayDateKey();
        var yesterday = getYesterdayDateKey(today);
        if (parsed.lastPlayedDate && parsed.lastPlayedDate !== today && parsed.lastPlayedDate !== yesterday) {
          parsed.streak = 0;
        }
        return Object.assign({}, defaultStats, parsed);
      }
    } catch (e) {
      console.warn('getArcadeStats error:', e);
    }
    return defaultStats;
  }

  function saveArcadeStats(stats) {
    try {
      var key = getArcadeUserKey();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(stats));
      }
      if (typeof sessionSet === 'function') {
        sessionSet('game_streak', String(stats.streak || 0));
        sessionSet('game_credits', String(stats.credits || 0));
      }
      updateArcadeHeaderBadge(stats);

      // Async sync to Supabase bb_config if logged in
      var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : null;
      if (ic && typeof getSupaClient === 'function') {
        var client = getSupaClient();
        if (client && typeof client.safeConfigUpdate === 'function') {
          client.safeConfigUpdate(key, stats).catch(function() {});
        }
      }
    } catch (e) {
      console.warn('saveArcadeStats error:', e);
    }
  }

  /**
   * Records game participation for either Wordle or Trivia.
   * Increments the daily streak if not already played today.
   * Maintains/resets streak if missed.
   */
  function recordGameParticipation(gameOrDate, optDate) {
    var overrideDate = null;
    if (typeof optDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(optDate)) {
      overrideDate = optDate;
    } else if (typeof gameOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(gameOrDate)) {
      overrideDate = gameOrDate;
    }

    var stats = getArcadeStats(overrideDate);
    var today = overrideDate ? getTodayDateKey(overrideDate) : getTodayDateKey();
    var yesterday = getYesterdayDateKey(today);

    if (stats.lastPlayedDate === today) {
      // Already participated today; streak preserved
      return stats;
    }

    if (stats.lastPlayedDate === yesterday) {
      // Participated yesterday; increment streak!
      stats.streak = (stats.streak || 0) + 1;
    } else {
      // Missed at least one day or first time playing; streak set to 1
      stats.streak = 1;
    }

    if (stats.streak > (stats.bestStreak || 0)) {
      stats.bestStreak = stats.streak;
    }

    stats.lastPlayedDate = today;
    saveArcadeStats(stats);
    return stats;
  }

  /**
   * Awards game credits to the member.
   */
  function awardCredits(amount, reason) {
    if (!amount || amount <= 0) return (getArcadeStats().credits || 0);
    var stats = getArcadeStats();
    stats.credits = (stats.credits || 0) + amount;
    saveArcadeStats(stats);

    if (typeof showToast === 'function') {
      showToast('+' + amount + ' Credits earned! ' + (reason ? '(' + reason + ')' : ''), 'success', 3500);
    }
    return stats.credits;
  }

  function updateArcadeHeaderBadge(stats) {
    if (typeof document === 'undefined') return;
    var data = stats || getArcadeStats();
    var streakValEl = document.querySelector('.nav-streak-val');
    var credsValEl = document.getElementById('nav-points-val');
    var badgeEl = document.getElementById('nav-points-badge');

    if (streakValEl) streakValEl.textContent = String(data.streak || 0);
    if (credsValEl) credsValEl.textContent = String(data.credits || 0);
    if (badgeEl) {
      badgeEl.title = 'Daily Streak: ' + (data.streak || 0) + ' days | Total Credits: ' + (data.credits || 0) + ' (Click for 1stPJ Arcade)';
      badgeEl.setAttribute('aria-label', 'Credits: ' + (data.credits || 0) + ', Streak: ' + (data.streak || 0));
    }
  }

  // ── Wordle Game Engine ───────────────────────────────────────────────────
  function initWordle() {
    var today = getTodayDateKey();
    var targetWord = getDailyWordleWord(today).toUpperCase();
    var userKey = getArcadeUserKey();
    var storageKey = 'bb_wordle_' + today + '_' + userKey;

    var saved = null;
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(storageKey) : null;
      if (raw) saved = JSON.parse(raw);
    } catch (e) {}

    if (saved && saved.dateKey === today) {
      _wordleState = saved;
    } else {
      _wordleState = {
        word: targetWord,
        guesses: [],
        currentGuess: '',
        isGameOver: false,
        hasWon: false,
        maxTries: 6,
        dateKey: today
      };
    }

    renderWordleView();
  }

  function saveWordleState() {
    try {
      var userKey = getArcadeUserKey();
      var storageKey = 'bb_wordle_' + _wordleState.dateKey + '_' + userKey;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(_wordleState));
      }
    } catch (e) {}
  }

  function evaluateGuess(guess, target) {
    var result = ['absent', 'absent', 'absent', 'absent', 'absent'];
    var targetLetters = target.split('');
    var guessLetters = guess.split('');

    // First pass: exact matches (green / correct)
    for (var i = 0; i < 5; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = 'correct';
        targetLetters[i] = null;
        guessLetters[i] = null;
      }
    }

    // Second pass: letter present in different position (gold / present)
    for (var j = 0; j < 5; j++) {
      if (guessLetters[j] !== null) {
        var foundIndex = targetLetters.indexOf(guessLetters[j]);
        if (foundIndex !== -1) {
          result[j] = 'present';
          targetLetters[foundIndex] = null;
        }
      }
    }

    return result;
  }

  function handleWordleKey(char) {
    if (_wordleState.isGameOver) return;
    var c = String(char || '').toUpperCase();

    if (c === 'ENTER') {
      submitWordleGuess();
    } else if (c === 'BACKSPACE' || c === 'DEL') {
      if (_wordleState.currentGuess.length > 0) {
        _wordleState.currentGuess = _wordleState.currentGuess.slice(0, -1);
        updateWordleActiveRow();
      }
    } else if (/^[A-Z]$/.test(c)) {
      if (_wordleState.currentGuess.length < 5) {
        _wordleState.currentGuess += c;
        updateWordleActiveRow();
      }
    }
  }

  function submitWordleGuess() {
    if (_wordleState.isGameOver) return;

    if (_wordleState.currentGuess.length !== 5) {
      if (typeof showToast === 'function') {
        showToast('Word must be 5 letters long!', 'warning', 2000);
      }
      shakeWordleRow();
      return;
    }

    var guess = _wordleState.currentGuess.toUpperCase();
    var evalResult = evaluateGuess(guess, _wordleState.word);

    _wordleState.guesses.push({
      guess: guess,
      evalResult: evalResult
    });
    _wordleState.currentGuess = '';

    if (guess === _wordleState.word) {
      _wordleState.isGameOver = true;
      _wordleState.hasWon = true;
      recordGameParticipation();
      awardCredits(15, 'Wordle Victory');
      var stats = getArcadeStats();
      stats.wordlePlays = (stats.wordlePlays || 0) + 1;
      stats.wordleWins = (stats.wordleWins || 0) + 1;
      saveArcadeStats(stats);
    } else if (_wordleState.guesses.length >= _wordleState.maxTries) {
      _wordleState.isGameOver = true;
      _wordleState.hasWon = false;
      recordGameParticipation();
      var s = getArcadeStats();
      s.wordlePlays = (s.wordlePlays || 0) + 1;
      saveArcadeStats(s);
    }

    saveWordleState();
    renderWordleView();
  }

  function shakeWordleRow() {
    var board = document.querySelector('.wordle-board');
    if (!board) return;
    var rows = board.querySelectorAll('.wordle-row');
    var activeRow = rows[_wordleState.guesses.length];
    if (activeRow) {
      activeRow.classList.add('shake');
      setTimeout(function() { activeRow.classList.remove('shake'); }, 500);
    }
  }

  function updateWordleActiveRow() {
    var board = document.querySelector('.wordle-board');
    if (!board) return;
    var rows = board.querySelectorAll('.wordle-row');
    var activeRow = rows[_wordleState.guesses.length];
    if (!activeRow) return;

    var tiles = activeRow.querySelectorAll('.wordle-tile');
    for (var i = 0; i < 5; i++) {
      var letter = _wordleState.currentGuess[i] || '';
      tiles[i].textContent = letter;
      tiles[i].classList.toggle('filled', !!letter);
    }
  }

  // ── BB Trivia Game Engine ────────────────────────────────────────────────
  function initTrivia() {
    // Shuffle and pick 5 questions for this session
    var shuffled = BB_TRIVIA_QUESTIONS.slice().sort(function() { return 0.5 - Math.random(); });
    _triviaState = {
      questions: shuffled.slice(0, 5),
      currentIndex: 0,
      score: 0,
      timer: 15,
      timerInterval: null,
      isAnswered: false,
      isComplete: false
    };

    renderTriviaView();
    startTriviaTimer();
  }

  function startTriviaTimer() {
    if (_triviaState.timerInterval) clearInterval(_triviaState.timerInterval);
    _triviaState.timer = 15;
    updateTriviaTimerUI();

    _triviaState.timerInterval = setInterval(function() {
      if (_triviaState.isAnswered || _triviaState.isComplete) {
        clearInterval(_triviaState.timerInterval);
        return;
      }
      _triviaState.timer--;
      updateTriviaTimerUI();

      if (_triviaState.timer <= 0) {
        clearInterval(_triviaState.timerInterval);
        handleTriviaTimeout();
      }
    }, 1000);
  }

  function updateTriviaTimerUI() {
    var timerEl = document.getElementById('trivia-timer-val');
    var barEl = document.getElementById('trivia-timer-bar');
    if (timerEl) timerEl.textContent = String(_triviaState.timer);
    if (barEl) {
      var pct = Math.max(0, Math.min(100, (_triviaState.timer / 15) * 100));
      barEl.style.width = pct + '%';
      if (_triviaState.timer <= 5) {
        barEl.style.background = 'var(--red, #ef4444)';
      } else {
        barEl.style.background = 'var(--accent, #d9a323)';
      }
    }
  }

  function handleTriviaTimeout() {
    if (_triviaState.isAnswered) return;
    _triviaState.isAnswered = true;
    var currentQ = _triviaState.questions[_triviaState.currentIndex];

    revealTriviaAnswers(-1, currentQ.correct);
    showTriviaExplanation('Time expired! ' + currentQ.expl, false);
  }

  function answerTrivia(selectedIndex) {
    if (_triviaState.isAnswered) return;
    _triviaState.isAnswered = true;
    if (_triviaState.timerInterval) clearInterval(_triviaState.timerInterval);

    var currentQ = _triviaState.questions[_triviaState.currentIndex];
    var isCorrect = (selectedIndex === currentQ.correct);

    if (isCorrect) {
      _triviaState.score++;
      awardCredits(5, 'Correct Trivia Answer');
    }

    revealTriviaAnswers(selectedIndex, currentQ.correct);
    showTriviaExplanation((isCorrect ? 'Correct! ' : 'Incorrect! ') + currentQ.expl, isCorrect);
  }

  function revealTriviaAnswers(selectedIndex, correctIndex) {
    var buttons = document.querySelectorAll('.trivia-opt-btn');
    buttons.forEach(function(btn, idx) {
      btn.disabled = true;
      if (idx === correctIndex) {
        btn.classList.add('correct');
      } else if (idx === selectedIndex) {
        btn.classList.add('incorrect');
      }
    });
  }

  function showTriviaExplanation(text, isCorrect) {
    var explBox = document.getElementById('trivia-expl-box');
    var nextBtn = document.getElementById('trivia-next-btn');
    if (explBox) {
      explBox.style.display = 'block';
      explBox.className = 'trivia-expl-box ' + (isCorrect ? 'correct' : 'incorrect');
      explBox.textContent = text;
    }
    if (nextBtn) {
      nextBtn.style.display = 'inline-flex';
      nextBtn.textContent = (_triviaState.currentIndex >= 4) ? 'Finish Quiz' : 'Next Question \u2192';
    }
  }

  function nextTriviaQuestion() {
    _triviaState.currentIndex++;
    if (_triviaState.currentIndex >= _triviaState.questions.length) {
      // Completed full quiz!
      _triviaState.isComplete = true;
      recordGameParticipation();
      var stats = getArcadeStats();
      stats.triviaPlays = (stats.triviaPlays || 0) + 1;
      stats.triviaScoreTotal = (stats.triviaScoreTotal || 0) + _triviaState.score;
      saveArcadeStats(stats);
      renderTriviaView();
    } else {
      _triviaState.isAnswered = false;
      renderTriviaView();
      startTriviaTimer();
    }
  }

  // ── View Rendering Controllers ───────────────────────────────────────────
  function ensureArcadePageDOM() {
    if (typeof document === 'undefined') return null;
    var page = document.getElementById('page-arcade');
    var main = document.getElementById('app-main') || document.querySelector('.app-main') || document.querySelector('main');

    if (!page) {
      page = document.createElement('section');
      page.id = 'page-arcade';
      page.className = 'page';
      page.setAttribute('aria-label', '1stPJ Arcade');
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

  function renderArcadePage() {
    if (typeof document === 'undefined') return;
    var page = ensureArcadePageDOM();
    if (!page) return;

    // Deactivate other tabs
    document.querySelectorAll('.page').forEach(function(p) {
      if (p !== page) p.classList.remove('active');
    });
    page.classList.add('active');

    var stats = getArcadeStats();
    updateArcadeHeaderBadge(stats);

    page.innerHTML =
      '<div class="arcade-container">' +
        '<!-- Header Hero Card -->' +
        '<div class="card page-header-card arcade-hero-card" style="margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div style="width:40px;height:40px;border-radius:10px;background:rgba(217,163,35,0.15);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="6"/></svg>' +
              '</div>' +
              '<div>' +
                '<div class="page-title" style="margin:0;">1stPJ Arcade</div>' +
                '<div class="page-subtitle" style="margin:0;">Daily BB Wordle, Timed Trivia &amp; Gamified Syllabus Hub</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<div class="arcade-stat-pill" title="Current Daily Streak">' +
                '<span style="font-weight:700;font-size:14px;color:var(--text);">' + (stats.streak || 0) + '</span>' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#f97316;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>' +
                '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Streak</span>' +
              '</div>' +
              '<div class="arcade-stat-pill" title="Total Earned Credits">' +
                '<span style="font-weight:700;font-size:14px;color:var(--gold);">' + (stats.credits || 0) + '</span>' +
                '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Credits</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="page-desc">Strengthen your Boys\' Brigade knowledge, awards syllabus, and company history! Play the Daily Wordle and answer Timed BB Trivia to earn Credits and build your daily participation streak.</div>' +
        '</div>' +

        '<!-- Subtabs Bar -->' +
        '<div class="arcade-nav-tabs" style="display:flex;gap:8px;margin-bottom:16px;">' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'wordle' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'wordle\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg> <span>Daily Wordle</span>' +
          '</button>' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'trivia' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'trivia\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> <span>BB Trivia</span>' +
          '</button>' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'stats' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'stats\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> <span>Rewards &amp; Streaks</span>' +
          '</button>' +
        '</div>' +

        '<!-- Active Subtab Container -->' +
        '<div id="arcade-subtab-container"></div>' +
      '</div>';

    if (_arcadeSubtab === 'wordle') {
      initWordle();
    } else if (_arcadeSubtab === 'trivia') {
      initTrivia();
    } else {
      renderStatsView();
    }
  }

  function switchArcadeSubtab(subtab) {
    _arcadeSubtab = subtab;
    renderArcadePage();
  }

  // ── Subtab View: Daily Wordle ─────────────────────────────────────────────
  function renderWordleView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    var letterStates = {};
    _wordleState.guesses.forEach(function(g) {
      for (var i = 0; i < 5; i++) {
        var char = g.guess[i];
        var state = g.evalResult[i];
        if (state === 'correct') {
          letterStates[char] = 'correct';
        } else if (state === 'present' && letterStates[char] !== 'correct') {
          letterStates[char] = 'present';
        } else if (!letterStates[char]) {
          letterStates[char] = 'absent';
        }
      }
    });

    var rowsHtml = '';
    for (var r = 0; r < _wordleState.maxTries; r++) {
      var isPastRow = r < _wordleState.guesses.length;
      var isCurrentRow = r === _wordleState.guesses.length;

      rowsHtml += '<div class="wordle-row" data-row="' + r + '">';
      for (var c = 0; c < 5; c++) {
        var letter = '';
        var tileClass = 'wordle-tile';

        if (isPastRow) {
          letter = _wordleState.guesses[r].guess[c];
          tileClass += ' ' + _wordleState.guesses[r].evalResult[c];
        } else if (isCurrentRow) {
          letter = _wordleState.currentGuess[c] || '';
          if (letter) tileClass += ' filled';
        }
        rowsHtml += '<div class="' + tileClass + '">' + (letter || '') + '</div>';
      }
      rowsHtml += '</div>';
    }

    var keyboardLayout = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
    ];

    var kbHtml = '<div class="wordle-keyboard">';
    keyboardLayout.forEach(function(row) {
      kbHtml += '<div class="wordle-kb-row">';
      row.forEach(function(key) {
        var kClass = 'wordle-key';
        if (key === 'ENTER' || key === 'BACKSPACE') kClass += ' wide';
        if (letterStates[key]) kClass += ' ' + letterStates[key];

        var keyDisplay = key;
        if (key === 'BACKSPACE') {
          keyDisplay = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
        }
        kbHtml += '<button type="button" class="' + kClass + '" onclick="handleWordleKey(\'' + key + '\')">' + keyDisplay + '</button>';
      });
      kbHtml += '</div>';
    });
    kbHtml += '</div>';

    var statusBanner = '';
    if (_wordleState.isGameOver) {
      if (_wordleState.hasWon) {
        statusBanner =
          '<div class="arcade-result-banner success">' +
            '<div style="font-weight:700;font-size:16px;">\uD83C\uDF89 Splendid! You solved today\'s Wordle!</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Awarded +15 Credits! Streak updated. Come back tomorrow for a fresh BB puzzle!</div>' +
          '</div>';
      } else {
        statusBanner =
          '<div class="arcade-result-banner info">' +
            '<div style="font-weight:700;font-size:16px;">Good effort! Today\'s word was: <strong>' + _wordleState.word + '</strong></div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Daily participation streak recorded. Come back tomorrow to conquer the next puzzle!</div>' +
          '</div>';
      }
    }

    container.innerHTML =
      '<div class="card wordle-card">' +
        '<div style="text-align:center;margin-bottom:14px;">' +
          '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text);">Daily BB Wordle</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">Guess today\'s 5-letter BB word in 6 tries. Green = correct spot, Gold = wrong spot.</div>' +
        '</div>' +
        statusBanner +
        '<div class="wordle-board-wrapper">' +
          '<div class="wordle-board">' + rowsHtml + '</div>' +
        '</div>' +
        kbHtml +
      '</div>';
  }

  // ── Subtab View: BB Trivia ───────────────────────────────────────────────
  function renderTriviaView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    if (_triviaState.isComplete) {
      var pct = Math.round((_triviaState.score / 5) * 100);
      var earned = _triviaState.score * 5;
      container.innerHTML =
        '<div class="card trivia-card" style="text-align:center;padding:32px 20px;">' +
          '<div style="width:64px;height:64px;border-radius:50%;background:rgba(217,163,35,0.15);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">' +
            '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
          '</div>' +
          '<div style="font-family:var(--font-headline);font-size:22px;font-weight:700;color:var(--text);margin-bottom:4px;">Quiz Complete!</div>' +
          '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:18px;">You scored <strong>' + _triviaState.score + ' / 5</strong> (' + pct + '%) &middot; Earned <strong>+' + earned + ' Credits</strong></div>' +
          '<div style="display:flex;justify-content:center;gap:12px;">' +
            '<button type="button" class="portal-btn portal-btn-primary" onclick="initTrivia()" style="padding:10px 24px;font-weight:700;">' +
              'Play Another Round' +
            '</button>' +
            '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'stats\')" style="padding:10px 24px;">' +
              'View Streaks &amp; Credits' +
            '</button>' +
          '</div>' +
        '</div>';
      return;
    }

    var currentQ = _triviaState.questions[_triviaState.currentIndex];
    if (!currentQ) return;

    var optsHtml = '';
    currentQ.options.forEach(function(opt, idx) {
      optsHtml +=
        '<button type="button" class="trivia-opt-btn" onclick="answerTrivia(' + idx + ')">' +
          '<span class="opt-letter">' + String.fromCharCode(65 + idx) + '</span>' +
          '<span class="opt-text">' + opt + '</span>' +
        '</button>';
    });

    container.innerHTML =
      '<div class="card trivia-card">' +
        '<!-- Header: Question Counter & Countdown Timer -->' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<div style="font-family:var(--font-headline);font-weight:700;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">' +
            'Question ' + (_triviaState.currentIndex + 1) + ' of 5' +
          '</div>' +
          '<div class="trivia-timer-badge">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<span><span id="trivia-timer-val">' + _triviaState.timer + '</span>s</span>' +
          '</div>' +
        '</div>' +

        '<!-- Countdown Progress Bar -->' +
        '<div class="trivia-progress-track">' +
          '<div id="trivia-timer-bar" class="trivia-progress-bar" style="width:100%;"></div>' +
        '</div>' +

        '<!-- Question Prompt -->' +
        '<div class="trivia-question-text">' + currentQ.q + '</div>' +

        '<!-- Options Grid -->' +
        '<div class="trivia-options-grid">' + optsHtml + '</div>' +

        '<!-- Feedback Explanation Box -->' +
        '<div id="trivia-expl-box" class="trivia-expl-box" style="display:none;"></div>' +

        '<!-- Next Question Button -->' +
        '<div style="text-align:right;margin-top:14px;">' +
          '<button type="button" id="trivia-next-btn" class="portal-btn portal-btn-primary" onclick="nextTriviaQuestion()" style="display:none;padding:8px 20px;font-weight:700;">' +
            'Next Question \u2192' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  // ── Subtab View: Rewards & Streaks ───────────────────────────────────────
  function renderStatsView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    var stats = getArcadeStats();

    container.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px;margin-bottom:16px;">' +
        '<div class="card" style="display:flex;align-items:center;gap:14px;padding:18px;">' +
          '<div style="width:48px;height:48px;border-radius:12px;background:rgba(249,115,22,0.15);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Current Daily Streak</div>' +
            '<div style="font-size:24px;font-weight:800;color:var(--text);">' + (stats.streak || 0) + ' <span style="font-size:13px;font-weight:500;color:var(--text-secondary);">days</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="display:flex;align-items:center;gap:14px;padding:18px;">' +
          '<div style="width:48px;height:48px;border-radius:12px;background:rgba(217,163,35,0.15);color:var(--gold);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Earned Credits</div>' +
            '<div style="font-size:24px;font-weight:800;color:var(--gold);">' + (stats.credits || 0) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="display:flex;align-items:center;gap:14px;padding:18px;">' +
          '<div style="width:48px;height:48px;border-radius:12px;background:rgba(16,185,129,0.15);color:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">All-Time Best Streak</div>' +
            '<div style="font-size:24px;font-weight:800;color:var(--text);">' + (stats.bestStreak || 0) + ' <span style="font-size:13px;font-weight:500;color:var(--text-secondary);">days</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="padding:22px;">' +
        '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">How Credits &amp; Streaks Work</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' +
          '<p style="margin-bottom:8px;"><strong>Daily Participation Streak:</strong> Play either Daily Wordle or BB Trivia each calendar day to maintain and increment your streak. Playing 3 days in a row gives a streak of 3. If you miss a day, the streak resets to 0.</p>' +
          '<p style="margin-bottom:8px;"><strong>Earning Credits:</strong>' +
            '<ul style="margin:6px 0 6px 20px;">' +
              '<li><strong>Daily Wordle:</strong> +15 Credits for successfully solving today\'s 5-letter word puzzle.</li>' +
              '<li><strong>BB Trivia:</strong> +5 Credits for every correct multiple-choice answer (up to +25 Credits per 5-question round).</li>' +
            '</ul>' +
          '</p>' +
          '<p style="margin:0;">Credits and streak achievements showcase your syllabus dedication across the 1st PJ Company and unlock future profile awards!</p>' +
        '</div>' +
      '</div>';
  }

  // ── Global Physical Keyboard Listener for Wordle ──────────────────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function(e) {
      if (_arcadeSubtab !== 'wordle') return;
      var arcadePage = document.getElementById('page-arcade');
      if (!arcadePage || !arcadePage.classList.contains('active')) return;

      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleWordleKey('ENTER');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleWordleKey('BACKSPACE');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleWordleKey(e.key.toUpperCase());
      }
    });

    // Auto-update header on DOM load
    document.addEventListener('DOMContentLoaded', function() {
      updateArcadeHeaderBadge();
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  var ArcadeModule = {
    BB_WORDLE_WORDS: BB_WORDLE_WORDS,
    BB_TRIVIA_QUESTIONS: BB_TRIVIA_QUESTIONS,
    getTodayDateKey: getTodayDateKey,
    getYesterdayDateKey: getYesterdayDateKey,
    getDailyWordleWord: getDailyWordleWord,
    getArcadeStats: getArcadeStats,
    saveArcadeStats: saveArcadeStats,
    recordGameParticipation: recordGameParticipation,
    awardCredits: awardCredits,
    updateArcadeHeaderBadge: updateArcadeHeaderBadge,
    initWordle: initWordle,
    evaluateGuess: evaluateGuess,
    handleWordleKey: handleWordleKey,
    submitWordleGuess: submitWordleGuess,
    initTrivia: initTrivia,
    answerTrivia: answerTrivia,
    nextTriviaQuestion: nextTriviaQuestion,
    ensureArcadePageDOM: ensureArcadePageDOM,
    renderArcadePage: renderArcadePage,
    switchArcadeSubtab: switchArcadeSubtab
  };

  if (typeof window !== 'undefined') {
    window.BB_WORDLE_WORDS         = BB_WORDLE_WORDS;
    window.BB_TRIVIA_QUESTIONS      = BB_TRIVIA_QUESTIONS;
    window.getArcadeStats           = getArcadeStats;
    window.recordGameParticipation  = recordGameParticipation;
    window.awardCredits             = awardCredits;
    window.updateArcadeHeaderBadge  = updateArcadeHeaderBadge;
    window.handleWordleKey          = handleWordleKey;
    window.answerTrivia             = answerTrivia;
    window.nextTriviaQuestion       = nextTriviaQuestion;
    window.ensureArcadePageDOM      = ensureArcadePageDOM;
    window.renderArcadePage         = renderArcadePage;
    window.switchArcadeSubtab       = switchArcadeSubtab;
    window.ArcadeModule             = ArcadeModule;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArcadeModule;
  }

})();
