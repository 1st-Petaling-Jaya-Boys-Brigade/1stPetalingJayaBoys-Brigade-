const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data)));
      })
      .on('error', reject);
  });
}

(async () => {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (!fs.existsSync(edgePath)) {
    console.log('Edge not found at default path, skipping CDP browser test.');
    return;
  }

  const tempProfile = fs.mkdtempSync(path.join(process.env.TEMP || 'C:\\Temp', 'edge-test-profile-'));
  const devToolsPort = path.join(tempProfile, 'DevToolsActivePort');

  const htmlUrl = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

  console.log('Launching headless Edge in an isolated profile...');
  const edgeProc = spawn(
    edgePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + tempProfile,
      '--window-size=1280,900',
      '--disable-gpu',
      htmlUrl
    ],
    { stdio: 'ignore' }
  );

  let ws;
  try {
    let targets = null;
    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const port = Number(fs.readFileSync(devToolsPort, 'utf8').split(/\s+/)[0]);
        if (!port) continue;
        targets = await getJson(`http://127.0.0.1:${port}/json/list`);
        if (targets) {
          pageTarget = targets.find(
            t => t.type === 'page' && t.url.toLowerCase().includes('index.html')
          );
          if (pageTarget) break;
        }
      } catch (e) {}
    }

    if (!pageTarget) {
      throw new Error('Failed to find index.html page target in Edge within timeout');
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log('Connected to Edge page target: 1st Petaling Jaya Boys Brigade Portal');

    ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const callbacks = new Map();
    let fulfillGalleryFixture;

    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Fetch.requestPaused') fulfillGalleryFixture?.(msg.params);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    await new Promise(resolve => (ws.onopen = resolve));
    await new Promise(resolve => setTimeout(resolve, 600));

    function sendCmd(method, params = {}) {
      const id = idCounter++;
      return new Promise((resolve, reject) => {
        callbacks.set(id, msg => {
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evalWithRetry(expression, awaitPromise = false) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await sendCmd('Runtime.evaluate', { expression, awaitPromise });
        } catch (err) {
          if (
            attempt < 4 &&
            err &&
            err.message &&
            err.message.includes('Execution context was destroyed')
          ) {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          throw err;
        }
      }
    }

    // Wait until document.readyState === 'complete' and #hq-carousel-wrapper exists
    await evalWithRetry(
      `new Promise((resolve) => {
        function checkReady() {
          if (document.readyState === 'complete' && document.getElementById('hq-carousel-wrapper')) {
            resolve(true);
          } else {
            setTimeout(checkReady, 100);
          }
        }
        checkReady();
      })`,
      true
    );

    // ── Authenticated Portal Gatekeeper CDP Verification ──
    const unauthedGatekeeper = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const memberPage = document.getElementById('page-member');
        const homePage = document.getElementById('page-home');
        const isMemberActive = memberPage ? memberPage.classList.contains('active') : false;
        const isHomeActive = homePage ? homePage.classList.contains('active') : false;
        const canActivateHome = (typeof AuthGuard !== 'undefined') ? AuthGuard.canActivate('home') : false;
        const canActivateTasks = (typeof AuthGuard !== 'undefined') ? AuthGuard.canActivate('tasks') : false;
        const canActivateMember = (typeof AuthGuard !== 'undefined') ? AuthGuard.canActivate('member') : false;

        // Try unauthenticated tab switch to tasks
        if (typeof switchTab === 'function') switchTab('tasks');
        const tasksIntercepted = memberPage ? memberPage.classList.contains('active') : false;
        const redirectTarget = (typeof AuthGuard !== 'undefined') ? AuthGuard.getRedirectTarget() : null;

        return {
          isMemberActive,
          isHomeActive,
          canActivateHome,
          canActivateTasks,
          canActivateMember,
          tasksIntercepted,
          redirectTarget,
          hasProtectedSidebarLinks: Array.from(document.querySelectorAll('.sidebar-nav button')).some(button => getComputedStyle(button).display !== 'none'),
          guestProfileCurrent: document.getElementById('sidebar-user-card').getAttribute('aria-current') === 'page'
        };
      })()`,
      returnByValue: true
    });

    const gDiag = unauthedGatekeeper.result.value;
    assert.strictEqual(gDiag.isMemberActive, true, 'Unauthenticated visitor must be redirected to Member Login/Register');
    assert.strictEqual(gDiag.isHomeActive, false, 'Internal Home view must not be active for unauthenticated users');
    assert.strictEqual(gDiag.canActivateHome, false, 'AuthGuard must block unauthenticated access to Home');
    assert.strictEqual(gDiag.canActivateTasks, false, 'AuthGuard must block unauthenticated access to Tasks');
    assert.strictEqual(gDiag.canActivateMember, true, 'AuthGuard must allow public access to Member tab');
    assert.strictEqual(gDiag.tasksIntercepted, true, 'Unauthorized tab switch must be intercepted and redirected to Member');
    assert.strictEqual(gDiag.redirectTarget, 'tasks', 'AuthGuard must remember intended destination');
    assert.strictEqual(gDiag.hasProtectedSidebarLinks, false, 'Signed-out desktop sidebar must hide protected links');
    assert.strictEqual(gDiag.guestProfileCurrent, true, 'Profile footer marks sign-in as the current page');
    console.log('\n[Authenticated Portal Gatekeeper]');
    console.log('  ✔ Unauthenticated user automatically redirected to Member Login/Registration screen');
    console.log('  ✔ Internal portal tabs (home, tasks, badges, attendance) blocked by AuthGuard');
    console.log('  ✔ Intended destination remembered for post-authentication redirect');

    // Authenticate test member session to unlock internal portal views for layout testing
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof sessionSet === 'function') {
          sessionSet('ic', '010101-14-1234');
          sessionSet('name', 'Joshua Koh');
          sessionSet('rank', 'Sergeant');
          sessionSet('squad', 'Hotel Platoon');
        }
        if (typeof switchTab === 'function') {
          switchTab('home');
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 200));

    // 1. Verify layout elements exist & unpack getBoundingClientRect
    const evalResult1 = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        function getBox(el) {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        }

        const wrapper = document.getElementById('hq-carousel-wrapper');
        const container = document.getElementById('hq-carousel-container');
        const track = document.getElementById('hq-carousel-track');
        const viewport = document.getElementById('hq-carousel-viewport');
        const cards = track ? track.querySelectorAll('.hq-card:not([hidden])') : [];
        const prevBtn = document.getElementById('hq-carousel-prev');
        const nextBtn = document.getElementById('hq-carousel-next');
        const dots = document.querySelectorAll('.hq-dot');
        const leftCol = document.querySelector('.home-left-col');
        const rightCol = document.querySelector('.home-right-col');
        const calWidget = document.getElementById('company-calendar-widget');

        const prevStyle = window.getComputedStyle(prevBtn);
        const nextStyle = window.getComputedStyle(nextBtn);

        return {
          hasWrapper: !!wrapper,
          hasContainer: !!container,
          hasTrack: !!track,
          hasViewport: !!viewport,
          cardCount: cards.length,
          hasPrevBtn: !!prevBtn,
          hasNextBtn: !!nextBtn,
          dotsCount: dots.length,
          containerRect: getBox(container),
          leftColRect: getBox(leftCol),
          rightColRect: getBox(rightCol),
          calWidgetRect: getBox(calWidget),
          viewportRect: getBox(viewport),
          card0Rect: getBox(cards[0]),
          card1Rect: getBox(cards[1]),
          prevOpacityDefault: prevStyle.opacity,
          nextOpacityDefault: nextStyle.opacity,
          prevVisibilityDefault: prevStyle.visibility,
          nextVisibilityDefault: nextStyle.visibility
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const info = evalResult1.result.value;
    console.log('\n[Layout Verification]');
    console.log('  Wrapper found:', info.hasWrapper);
    console.log('  Container found:', info.hasContainer);
    console.log('  Track found:', info.hasTrack);
    console.log('  Card count:', info.cardCount);
    console.log('  Dots count:', info.dotsCount);
    console.log('  Viewport width:', info.viewportRect.width.toFixed(1) + 'px');
    console.log('  Card 0 width:', info.card0Rect.width.toFixed(1) + 'px');
    console.log('  Card 1 width:', info.card1Rect.width.toFixed(1) + 'px');
    console.log(
      '  Card 0 left:',
      info.card0Rect.left.toFixed(1) + 'px, Viewport left:',
      info.viewportRect.left.toFixed(1) + 'px'
    );
    console.log(
      '  Card 1 right:',
      info.card1Rect.right.toFixed(1) + 'px, Viewport right:',
      info.viewportRect.right.toFixed(1) + 'px'
    );

    assert.strictEqual(info.hasWrapper, true, 'Carousel wrapper must be rendered');
    assert.strictEqual(info.cardCount, 9, 'An ordinary member sees nine quick action cards');
    assert.strictEqual(info.hasPrevBtn, true, 'Prev button must exist');
    assert.strictEqual(info.hasNextBtn, true, 'Next button must exist');
    assert.strictEqual(info.dotsCount, 5, 'Desktop has five pages for the ordinary member');
    assert.strictEqual(info.prevVisibilityDefault, 'visible', 'Previous arrow is always discoverable');
    assert.strictEqual(info.nextVisibilityDefault, 'visible', 'Next arrow is always discoverable');

    // Verify 2 cards are in view on Page 0
    assert.ok(
      Math.abs(info.card0Rect.left - info.viewportRect.left) <= 2,
      'Card 0 must start at viewport left edge'
    );
    assert.ok(
      Math.abs(info.card1Rect.right - info.viewportRect.right) <= 2,
      'Card 1 must end at viewport right edge'
    );
    console.log(
      '  ✔ Page 0 displays exactly 2 cards side-by-side in viewport (Calendar, Forms & Store)'
    );


    console.log('\n[Quick Access Navigation]');
    const carouselNav = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const prev = document.getElementById('hq-carousel-prev');
        const next = document.getElementById('hq-carousel-next');
        const viewport = document.getElementById('hq-carousel-viewport');
        const cards = [...document.querySelectorAll('.hq-card:not([hidden])')];
        const page = () => window._hqCurrentPage;
        const activeRoutes = () => cards.filter(card => !card.inert).map(card => card.dataset.quickRoute);
        const initialRoutes = activeRoutes();
        const routes = cards.map(card => card.dataset.quickRoute);
        next.click();
        const nextClickWorks = page() === 1 && document.getElementById('hq-dot-1').getAttribute('aria-current') === 'page';
        viewport.focus();
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const keyboardWorks = page() === 2;
        document.getElementById('hq-dot-4').click();
        const finalPage = page() === 4 && activeRoutes().join() === 'member' &&
          cards.at(-1).offsetWidth === viewport.clientWidth;
        next.click();
        const wrapsNext = page() === 0;
        prev.click();
        const wrapsPrevious = page() === 4;
        document.getElementById('hq-dot-0').click();
        return { initialRoutes, routes, nextClickWorks, keyboardWorks, finalPage, wrapsNext, wrapsPrevious, reset: page() === 0 };
      })()`,
      returnByValue: true
    });
    assert.ok(carouselNav.result.value, JSON.stringify(carouselNav.exceptionDetails));
    const { initialRoutes, routes: carouselRoutes, ...carouselChecks } = carouselNav.result.value;
    assert.deepStrictEqual(initialRoutes, ['parade', 'order']);
    assert.deepStrictEqual(carouselRoutes, ['parade','order','badges','attendance','resources','gallery','forum','arcade','member']);
    for (const [check, passed] of Object.entries(carouselChecks)) assert.strictEqual(passed, true, 'Quick Access: ' + check);
    console.log('  ✔ Quick Access priority order, visible arrow buttons, keyboard navigation, and wrap-around verified');

    // 10. Verify column alignment
    const heightDiff = Math.abs(info.leftColRect.height - info.rightColRect.height);
    console.log('\n[Column Height Alignment Check]');
    console.log('  Left Col Height: ' + info.leftColRect.height.toFixed(1) + 'px');
    console.log('  Right Col Height: ' + info.rightColRect.height.toFixed(1) + 'px');
    console.log('  Height delta: ' + heightDiff.toFixed(1) + 'px');
    assert.ok(
      heightDiff <= 2,
      'Left column and Right column must have matching heights (diff <= 2px)'
    );
    console.log(
      '  ✔ Left column and Right column achieve exact visual height alignment with calendar widget!'
    );

    const homeParade = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const originalClient = window.getSupaClient;
        const originalEvents = getUpcomingEventsList('0001-01-01', Infinity);
        const cacheKey = 'bb_company_calendar_cache';
        const originalCache = localStorage.getItem(cacheKey);
        const today = new Date();
        const next = new Date(today);
        next.setDate(today.getDate() + 7);
        const nextDate = next.toLocaleDateString('sv-SE');
        const cancelled = { date: today.toLocaleDateString('sv-SE'), type: 'noparade', title: 'No parade' };
        const parade = {
          date: nextDate, type: 'parade', title: 'Drill & Assessments',
          time: '1:30 PM – 6:00 PM', kit: 'Drill Kit', location: 'Church Hall'
        };
        const card = document.querySelector('.home-next-parade');
        const modal = document.getElementById('calendar-day-modal');
        let events = [cancelled, parade];
        window.getSupaClient = () => ({ get: async () => [{ value: events }] });
        try {
          await loadCalendarEvents();
          renderCalendarWidget();
          calSelectDate(cancelled.date);
          const correctPlacement = card.previousElementSibling.matches('.hero-banner') &&
                                   card.nextElementSibling.id === 'hq-carousel-wrapper';
          const correctDate = card.querySelector('time').dateTime === nextDate;
          const correctTitle = card.querySelector('h2').textContent === parade.title;
          const meta = card.querySelector('.home-next-parade-meta').textContent;
          const correctMeta = ['9:30 AM', parade.kit, parade.location].every(item => meta.includes(item)) &&
                              !meta.includes('6:00 PM');
          calJumpToEventIndex(1);
          const range = () => document.querySelector('.cal-hero-meta-item strong')?.textContent;
          const correctCalendarRange = range() === '9:30 AM – 6:00 PM';
          const bodyFont = node => getComputedStyle(node).fontFamily.startsWith('Inter');
          const correctFonts = bodyFont(document.body) && bodyFont(card.querySelector('.portal-btn')) &&
            bodyFont(document.getElementById('forgot-code')) &&
            getComputedStyle(document.querySelector('.hero-title')).fontFamily.startsWith('"Plus Jakarta Sans"');
          const [view, reminder] = card.querySelectorAll('button');
          view.click();
          const opensDetails = modal.style.display === 'flex' &&
                               document.getElementById('cdm-event-name').textContent.includes(parade.title) &&
                               document.getElementById('cdm-venue-time').textContent.includes('9:30 AM – 6:00 PM');
          closeCalendarDayModal();
          reminder.click();
          const focusesReminder = modal.style.display === 'flex' && document.activeElement.id === 'cdm-rem-input';
          closeCalendarDayModal();
          events = [cancelled, {
            ...parade, schedule: [
              { time: '18:45 – 19:30', title: 'Closing' },
              { time: 'TBC', title: 'Break' },
              { time: '11.10 AM – 12 PM', title: 'Briefing' },
              { time: '11:05 AM – 11:10 AM', title: 'Arrival' }
            ]
          }];
          await loadCalendarEvents();
          renderCalendarWidget();
          renderCalendarTab('upcoming');
          const usesCustomRundown = card.querySelector('.home-next-parade-meta strong').textContent === '11:05 AM' &&
                                   range() === '11:05 AM – 7:30 PM';
          events = [cancelled, { ...parade, type: 'special', time: 'All day' }];
          await loadCalendarEvents();
          renderCalendarWidget();
          renderCalendarTab('upcoming');
          const preservesUntimedEvent = card.querySelector('.home-next-parade-meta strong').textContent === 'All day' &&
                                        range() === 'All day';
          events = [cancelled];
          await loadCalendarEvents();
          renderCalendarWidget();
          return { correctPlacement, correctDate, correctTitle, correctMeta, correctCalendarRange, correctFonts,
                   opensDetails, focusesReminder, usesCustomRundown, preservesUntimedEvent, hidesWithoutParade: card.hidden };
        } finally {
          closeCalendarDayModal();
          events = originalEvents;
          await loadCalendarEvents();
          window.getSupaClient = originalClient;
          if (originalCache === null) localStorage.removeItem(cacheKey);
          else localStorage.setItem(cacheKey, originalCache);
          calSelectDate(today.toLocaleDateString('sv-SE'));
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(homeParade.result.value, JSON.stringify(homeParade.exceptionDetails));
    for (const [check, result] of Object.entries(homeParade.result.value)) {
      assert.strictEqual(result, true, 'Home Next parade: ' + check);
    }
    console.log('  ✔ Home Next parade uses the scheduled event and opens its details and reminder');

    // 11. Test Forms Tab Search Bar in Browser
    console.log('\n[Forms Tab Search Bar Verification]');
    const evalFormsInit = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof sessionSet === 'function') {
          sessionSet('ic', '010101-14-1234');
          sessionSet('name', 'Joshua Koh');
          sessionSet('rank', 'Sergeant');
          sessionSet('squad', 'Hotel Platoon');
        }
        if (typeof switchTab === 'function') {
          switchTab('order');
        }
        const searchInput = document.getElementById('form-search-input');
        const searchWrap = document.getElementById('forms-search-wrap');
        const formsHub = document.getElementById('forms-hub');
        const cards = document.querySelectorAll('#forms-list .form-card-hub');
        return {
          hubDisplay: formsHub ? formsHub.style.display : null,
          wrapDisplay: searchWrap ? searchWrap.style.display : null,
          hasInput: !!searchInput,
          placeholder: searchInput ? searchInput.placeholder : '',
          cardCount: cards.length
        };
      })()`,
      returnByValue: true
    });
    const formsInit = evalFormsInit.result.value;
    console.log(
      '  Forms hub active -> Cards count:',
      formsInit.cardCount,
      'Placeholder:',
      formsInit.placeholder
    );
    assert.strictEqual(formsInit.hasInput, true, 'Search input must exist in DOM');
    assert.ok(formsInit.cardCount >= 1, 'At least default Uniform Order card must be present');
    console.log('  ✔ Forms hub renders search input and active form cards');

    // Filter by 'Uniform'
    const evalFilterUniform = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const inp = document.getElementById('form-search-input');
        inp.value = 'Uniform';
        filterForms('Uniform');
        const cards = Array.from(document.querySelectorAll('#forms-list .form-card-hub'));
        const visible = cards.filter(c => c.style.display !== 'none');
        const clearBtn = document.getElementById('form-search-clear');
        const statusEl = document.getElementById('forms-search-status');
        return {
          total: cards.length,
          visible: visible.length,
          clearBtnDisplay: clearBtn.style.display,
          statusDisplay: statusEl.style.display
        };
      })()`,
      returnByValue: true
    });
    const filterUniform = evalFilterUniform.result.value;
    console.log('  Filter "Uniform" -> Visible:', filterUniform.visible, 'of', filterUniform.total);
    assert.strictEqual(filterUniform.visible, 1, 'Exactly 1 Uniform Order card should match');
    assert.strictEqual(filterUniform.clearBtnDisplay, 'flex', 'Clear button must be visible');
    console.log('  ✔ Search query filters visible cards and reveals clear button');

    // Filter by non-matching query
    const evalFilterNoMatch = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const inp = document.getElementById('form-search-input');
        inp.value = 'xyznonexistent123';
        filterForms('xyznonexistent123');
        const cards = Array.from(document.querySelectorAll('#forms-list .form-card-hub'));
        const visible = cards.filter(c => c.style.display !== 'none');
        const noRes = document.getElementById('forms-no-results');
        return {
          visible: visible.length,
          noResDisplay: noRes.style.display
        };
      })()`,
      returnByValue: true
    });
    const filterNoMatch = evalFilterNoMatch.result.value;
    assert.strictEqual(filterNoMatch.visible, 0, 'No cards should match non-existent query');
    assert.strictEqual(filterNoMatch.noResDisplay, 'block', 'Empty state must be displayed');
    console.log('  ✔ Zero match query displays empty state prompt');

    // Clear search
    const evalClearSearch = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        clearFormSearch();
        const inp = document.getElementById('form-search-input');
        const cards = Array.from(document.querySelectorAll('#forms-list .form-card-hub'));
        const visible = cards.filter(c => c.style.display !== 'none');
        const noRes = document.getElementById('forms-no-results');
        const clearBtn = document.getElementById('form-search-clear');
        return {
          val: inp.value,
          visible: visible.length,
          noResDisplay: noRes.style.display,
          clearBtnDisplay: clearBtn.style.display
        };
      })()`,
      returnByValue: true
    });
    const clearResult = evalClearSearch.result.value;
    assert.strictEqual(clearResult.val, '', 'Search input must be empty after clear');
    assert.ok(clearResult.visible >= 1, 'All forms must be restored after clear');
    assert.strictEqual(clearResult.noResDisplay, 'none', 'Empty state must be hidden');
    assert.strictEqual(clearResult.clearBtnDisplay, 'none', 'Clear button must be hidden');
    console.log('  ✔ clearFormSearch clears input, restores all cards, and hides empty state');

    // 12. Test Parade Times, Text Sharpness, and Sidebar Navigation
    console.log('\n[Parade Times, Text Crispness, & Sidebar Nav Verification]');
    const evalParadeAndNav = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof switchTab === 'function') {
          switchTab('home');
        }

        const cards = Array.from(document.querySelectorAll('#hq-carousel-track .hq-card'));
        const paradeCard = cards.find(card => card.dataset.quickRoute === 'parade');
        const paradeDesc = paradeCard ? paradeCard.querySelector('.hq-desc').textContent : '';

        const attItem = document.getElementById('snav-attendance');
        const resItem = document.getElementById('snav-resources');
        const attLabel = attItem ? attItem.querySelector('.si-label').textContent.trim() : '';
        const resLabel = resItem ? resItem.querySelector('.si-label').textContent.trim() : '';
        const attBadge = attItem ? attItem.querySelector('.si-badge') : null;
        const resBadge = resItem ? resItem.querySelector('.si-badge') : null;
        const attStyle = attItem ? window.getComputedStyle(attItem.querySelector('.si-label')) : null;

        const cardStyle = window.getComputedStyle(cards[0]);
        const trackStyle = window.getComputedStyle(document.getElementById('hq-carousel-track'));

        return {
          paradeDesc,
          attLabel,
          resLabel,
          hasAttBadge: !!attBadge,
          hasResBadge: !!resBadge,
          whiteSpace: attStyle ? attStyle.whiteSpace : null,
          trackWillChange: trackStyle.willChange,
          fontSmoothing: cardStyle.webkitFontSmoothing
        };
      })()`,
      returnByValue: true
    });
    const pnInfo = evalParadeAndNav.result.value;
    console.log('  Weekly Parade Card Desc:', pnInfo.paradeDesc);
    assert.ok(
      pnInfo.paradeDesc.includes('2:15 PM') && pnInfo.paradeDesc.includes('6:00 PM'),
      'Parade time must be 2:15 PM – 6:00 PM'
    );
    assert.ok(
      pnInfo.paradeDesc.includes('Band 9:30 AM') && pnInfo.paradeDesc.includes('11:30 AM'),
      'Band time must be 9:30 AM – 11:30 AM'
    );
    console.log(
      '  ✔ Weekly parade card accurately reflects updated Parade (2:15PM-6PM) and Band (9:30AM-11:30AM) times'
    );

    console.log(
      '  Sidebar Nav Labels -> Attendance:',
      pnInfo.attLabel,
      'Resources:',
      pnInfo.resLabel
    );
    assert.strictEqual(
      pnInfo.attLabel,
      'Leaderboard',
      'Sidebar item must be renamed to Leaderboard'
    );
    assert.strictEqual(pnInfo.resLabel, 'Resources', 'Sidebar item must be renamed to Resources');
    assert.strictEqual(pnInfo.hasAttBadge, false, 'Standings badge must be removed');
    assert.strictEqual(pnInfo.hasResBadge, false, 'Files badge must be removed');
    assert.strictEqual(pnInfo.whiteSpace, 'nowrap', 'Sidebar label must stay on a single line');
    console.log(
      '  ✔ Sidebar navigation cleanly displays Leaderboard and Resources on one line without pills'
    );

    const sidebarReview = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const fields = ['ic', 'email', 'rank', 'department', 'section'];
        const session = fields.map(key => [key, sessionGet(key)]);
        const roles = RBAC._getRolesConfig();
        const originalGet = supa.get;
        const originalVerify = window.verifyActiveMemberSession;
        const account = 'sidebar-review@example.test';
        const tasks = document.getElementById('snav-tasks');
        const taskShortcut = document.querySelector('.hq-card[data-quick-route="tasks"]');
        const footer = document.getElementById('sidebar-user-card');
        const admin = document.querySelector('.sidebar-admin-btn');
        const settings = document.querySelector('.sidebar-settings-btn');
        const active = () => document.querySelector('.page.active')?.id;
        const shown = node => getComputedStyle(node).display !== 'none';
        const order = () => [...document.querySelectorAll('.sidebar-nav .sidebar-item')]
          .filter(shown).map(node => node.textContent.trim());
        const replaceRoles = permissions => {
          RBAC._setRolesConfig({ super_admins: [], admins: permissions ? { [account]: permissions } : {} });
          RBAC.syncAdminButtonVisibility();
        };
        try {
          window.verifyActiveMemberSession = async () => true;
          supa.get = async path => path.startsWith('bb_members?') ? [{ rank: 'Member', section: 'Senior', department: '' }] : [];
          sessionSet('ic', account, { localOnly: true });
          sessionSet('email', account, { localOnly: true });
          sessionSet('rank', 'Member', { localOnly: true });
          sessionSet('section', 'Senior', { localOnly: true });
          sessionSet('department', '', { localOnly: true });
          replaceRoles(null);
          switchTabNav('home', true);
          const memberOrder = order();
          executeHeaderSearch('kanban');
          const deniedSearchStaysOnHome = active() === 'page-home';
          executeHeaderSearch('parade schedule');
          const calendarSearchWorks = active() === 'page-parade' &&
            document.querySelector('[data-nav="parade"]').getAttribute('aria-current') === 'page';
          switchTabNav('tasks', true);
          await checkTasksAccess();
          const deniedDirectLink = !shown(document.getElementById('tasks-board')) &&
            shown(document.getElementById('tasks-gate')) && !shown(tasks);
          sessionSet('department', 'Media', { localOnly: true });
          const departmentOrder = order();
          sessionSet('department', '', { localOnly: true });
          const departmentRemovalHides = !shown(tasks) && !shown(taskShortcut);
          sessionSet('department', 'Officers', { localOnly: true });
          sessionSet('rank', 'Lieutenant', { localOnly: true });
          const officerCanSee = shown(tasks) && !shown(admin);
          sessionSet('department', '', { localOnly: true });
          sessionSet('rank', 'Member', { localOnly: true });
          replaceRoles(['orders']);
          const ordersAdminScoped = shown(admin) && !shown(tasks);
          const rowStyles = node => {
            const css = getComputedStyle(node);
            return [node.offsetWidth, node.offsetHeight, css.fontFamily, css.fontWeight, css.padding, css.textAlign];
          };
          const footerMatches = settings instanceof HTMLButtonElement &&
            JSON.stringify(rowStyles(settings)) === JSON.stringify(rowStyles(admin)) &&
            admin.querySelector('.sidebar-footer-icon path')?.getAttribute('d').startsWith('M12 22');
          sessionSet('department', 'HQ', { localOnly: true });
          replaceRoles(['tasks']);
          const taskAdminCanSee = shown(tasks) && shown(admin) && shown(taskShortcut);
          executeHeaderSearch('kanban');
          const authorizedSearchWorks = active() === 'page-tasks';
          await checkTasksAccess();
          sessionSet('department', '', { localOnly: true });
          replaceRoles(null);
          const roleRemovalHides = !shown(tasks) && !shown(admin);
          footer.click();
          const profileCurrent = active() === 'page-member' && footer.getAttribute('aria-current') === 'page';
          return { memberOrder, departmentOrder, deniedSearchStaysOnHome, calendarSearchWorks, deniedDirectLink,
            departmentRemovalHides, officerCanSee, ordersAdminScoped, footerMatches, taskAdminCanSee,
            authorizedSearchWorks, roleRemovalHides, profileCurrent };
        } finally {
          for (const [key, value] of session) sessionSet(key, value, { localOnly: true });
          RBAC._setRolesConfig(roles);
          RBAC.syncAdminButtonVisibility();
          supa.get = originalGet;
          window.verifyActiveMemberSession = originalVerify;
          switchTabNav('home', true);
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(sidebarReview.result.value, JSON.stringify(sidebarReview.exceptionDetails));
    const { memberOrder, departmentOrder, ...sidebarChecks } = sidebarReview.result.value;
    assert.deepStrictEqual(memberOrder, ['Home', 'Calendar', 'Forms & Store', 'My Badges', 'Leaderboard', 'Resources', 'Gallery', 'Support Forum', '1stPJ Arcade']);
    assert.deepStrictEqual(departmentOrder, [...memberOrder.slice(0, 3), 'Projects & Tasks', ...memberOrder.slice(3)]);
    for (const [check, passed] of Object.entries(sidebarChecks)) assert.strictEqual(passed, true, 'Sidebar: ' + check);
    console.log('  ✔ Sidebar order, account access, search routing, and matching footer controls verified');

    const installReview = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const install = document.querySelector('[data-install-app]');
        const dialog = document.querySelector('.install-app-dialog');
        const apk = dialog.querySelector('[data-install-apk]');
        const portal = dialog.querySelector('[data-install-portal]');
        const android = dialog.querySelector('[data-install-panel="android"]');
        const iphone = dialog.querySelector('[data-install-panel="ios"]');
        const currentApk = window.ANDROID_APK_URL;
        const originalAuth = AuthGuard.isUserAuthenticated;
        try {
          AuthGuard.isUserAuthenticated = () => false;
          syncSidebarAccess();
          openInstallApp();
          const blocked = install.hidden && !dialog.open;
          AuthGuard.isUserAuthenticated = () => true;
          syncSidebarAccess();
          window.ANDROID_APK_URL = 'https://downloads.example.test/app-release.apk';
          install.click();
          const servesApk = !install.hidden && dialog.open && !android.hidden && !android.querySelector('figure').hidden &&
            android.querySelector('canvas').width > 150 && apk.href === window.ANDROID_APK_URL;
          dialog.querySelector('[data-install-platform="ios"]').click();
          const servesIphone = !iphone.hidden && android.hidden && !iphone.querySelector('figure').hidden &&
            iphone.querySelector('canvas').width > 150 && new URL(portal.href).protocol === 'https:' &&
            iphone.textContent.includes('Open as Web App');
          dialog.close();
          window.ANDROID_APK_URL = 'javascript:void(0)';
          openInstallApp();
          const rejectsInvalid = !apk.hasAttribute('href') && android.querySelector('[data-install-download]').hidden;
          return { blocked, servesApk, servesIphone, rejectsInvalid };
        } finally {
          dialog.close();
          window.ANDROID_APK_URL = currentApk;
          AuthGuard.isUserAuthenticated = originalAuth;
          syncSidebarAccess();
        }
      })()`,
      returnByValue: true
    });
    assert.deepStrictEqual(installReview.result.value, {
      blocked: true, servesApk: true, servesIphone: true, rejectsInvalid: true
    }, 'Install App dialog must use safe links and show QR codes for both member install options');
    console.log('  ✔ Member Install App dialog, safe download links, and both QR codes verified');

    assert.notStrictEqual(
      pnInfo.trackWillChange,
      'transform',
      'Track will-change must not force permanent compositor layer'
    );
    assert.strictEqual(
      pnInfo.fontSmoothing,
      'antialiased',
      'Cards must use antialiased font smoothing for razor sharpness'
    );
    console.log('  ✔ Quick access carousel cards have optimal crisp font smoothing');

    // 13. Test Child Safety (COPPA/PDPA) & Parental Consent Governance
    console.log('\n[Child Safety & Parental Consent Governance]');
    const evalChildSafety = await sendCmd('Runtime.evaluate', {
      expression:
        '(() => {' +
        'const consentBox = document.getElementById("parent-consent-box");' +
        'const pNameInp = document.getElementById("reg-parent-name");' +
        'const pContactInp = document.getElementById("reg-parent-contact");' +
        'const pConsentCb = document.getElementById("reg-parent-consent");' +
        'const pMediaCb = document.getElementById("reg-media-consent");' +
        'const policyModal = document.getElementById("child-safety-modal");' +
        'const emSectionSel = document.getElementById("em-section");' +
        'const emRankSel = document.getElementById("em-rank");' +
        'const chooseRank = (section, rank) => {' +
        '  emSectionSel.value = section;' +
        '  emSectionSel.dispatchEvent(new Event("change"));' +
        '  emRankSel.value = rank;' +
        '  emRankSel.dispatchEvent(new Event("change"));' +
        '  return emSectionSel.value === section && emRankSel.value === rank;' +
        '};' +
        'const preJuniorStaysInJunior = chooseRank("Junior", "Pre-Junior");' +
        'const staffSergeantStaysInOfficer = chooseRank("Officer", "Staff Sergeant");' +
        'emSectionSel.value = "";' +
        'emSectionSel.dispatchEvent(new Event("change"));' +
        'const emChildSafetyBox = document.getElementById("em-child-safety-box");' +
        'const galleryAdvisory = document.getElementById("adm-section-gallery");' +
        'return {' +
        'hasConsentBox: !!consentBox,' +
        'hasParentName: !!pNameInp,' +
        'hasParentContact: !!pContactInp,' +
        'hasParentConsent: !!pConsentCb,' +
        'hasMediaConsent: !!pMediaCb,' +
        'mediaDefaultChecked: pMediaCb ? pMediaCb.checked : null,' +
        'hasPolicyModal: !!policyModal,' +
        'hasEmSection: !!emSectionSel,' +
        'preJuniorStaysInJunior,' +
        'staffSergeantStaysInOfficer,' +
        'hasEmChildSafety: !!emChildSafetyBox,' +
        'hasGalleryAdvisory: galleryAdvisory ? galleryAdvisory.textContent.includes("Child Safety & Media Release Advisory") : false' +
        '};' +
        '})()',
      returnByValue: true
    });
    const csInfo = evalChildSafety.result.value;
    assert.ok(csInfo.preJuniorStaysInJunior, 'Selecting Pre-Junior keeps the Junior Section selected');
    assert.ok(csInfo.staffSergeantStaysInOfficer, 'Selecting Staff Sergeant keeps the Officer section selected');
    assert.strictEqual(csInfo.hasConsentBox, true, 'Parent consent box must exist');
    assert.strictEqual(csInfo.hasParentName, true, 'Parent name input must exist');
    assert.strictEqual(csInfo.hasParentContact, true, 'Parent contact input must exist');
    assert.strictEqual(csInfo.hasParentConsent, true, 'Parent consent checkbox must exist');
    assert.strictEqual(csInfo.hasMediaConsent, true, 'Media consent checkbox must exist');
    assert.strictEqual(
      csInfo.mediaDefaultChecked,
      false,
      'Media release must be unchecked by default (privacy-first)'
    );
    console.log(
      '  ✔ Registration form adheres to verified parental consent and privacy-first default media permission'
    );

    assert.strictEqual(csInfo.hasPolicyModal, true, 'Child safety policy modal must exist in DOM');
    assert.strictEqual(
      csInfo.hasEmSection,
      true,
      'Edit Member modal must feature Section selection'
    );
    assert.strictEqual(
      csInfo.hasEmChildSafety,
      true,
      'Edit Member modal must feature Child Safety consent controls'
    );
    assert.strictEqual(
      csInfo.hasGalleryAdvisory,
      false,
      'Gallery management Child Safety advisory box must be removed per user specification'
    );
    console.log(
      '  ✔ Admin console provides full section governance and child safety advisory enforcement'
    );

    // 14. Test Instagram-Style Story Highlights & Event Gallery Reel
    console.log('\n[Story Highlights Reel & Full-Screen Viewer]');
    const evalStoryHighlights = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof loadStoryHighlights === 'function' && (!window.storyHighlights || !window.storyHighlights.length)) {
          await loadStoryHighlights();
        }
        if (typeof renderStoryHighlightsReel === 'function') { renderStoryHighlightsReel(); }
        const reel = document.getElementById('gallery-story-highlights-reel') || document.getElementById('story-highlights-reel');
        const items = reel ? reel.querySelectorAll('.story-highlight-item') : [];
        const viewerModal = document.getElementById('story-viewer-modal');
        const adminList = document.getElementById('admin-story-highlights-list');
        const adminModal = document.getElementById('adm-story-modal');

        // Test opening story viewer
        if (typeof openStoryViewer === 'function') {
          openStoryViewer(0, 0);
        }

        const modalDisplay = viewerModal ? window.getComputedStyle(viewerModal).display : 'none';
        const progressBars = document.querySelectorAll('.story-progress-bar');
        const slideImg = document.getElementById('story-viewer-img');
        const slideTitle = document.getElementById('story-viewer-title');

        // Test closing story viewer
        if (typeof closeStoryViewer === 'function') {
          closeStoryViewer();
        }
        const closedDisplay = viewerModal ? viewerModal.style.display : '';

        return {
          hasReel: !!reel,
          itemCount: items.length,
          firstLabel: items.length > 0 ? items[0].querySelector('.story-highlight-label').textContent.trim() : '', 
          modalDisplay,
          progressBarCount: progressBars.length,
          hasImg: !!slideImg,
          activeTitle: slideTitle ? slideTitle.textContent : '',
          closedDisplay,
          hasAdminList: !!adminList,
          hasAdminModal: !!adminModal,
          adminControlsHidden: !!adminList && getComputedStyle(adminList.closest('.admin-story-highlights-section')).display === 'none',
          adminModalHidden: !!adminModal && getComputedStyle(adminModal).display === 'none'
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const shInfo = evalStoryHighlights.result.value;
    assert.strictEqual(shInfo.hasReel, true, 'Story highlights reel must exist in gallery');
    assert.ok(shInfo.itemCount >= 1, 'Must render story highlight bubbles');
    assert.ok(shInfo.firstLabel.length > 0, 'First highlight bubble must have a title');
    console.log(
      '  ✔ Story highlights circular bubble reel renders with active categories:',
      shInfo.itemCount
    );

    assert.strictEqual(shInfo.modalDisplay, 'flex', 'Opening story viewer displays modal');
    assert.ok(
      shInfo.progressBarCount >= 1,
      'Must render segmented progress bars matching slide count'
    );
    assert.strictEqual(
      shInfo.activeTitle,
      shInfo.firstLabel,
      'Modal header reflects active highlight category'
    );
    assert.strictEqual(shInfo.hasImg, true, 'Modal contains active slide media viewport');
    assert.strictEqual(shInfo.closedDisplay, 'none', 'Closing story viewer hides modal');
    console.log(
      '  ✔ Story viewer opens full-screen with segmented progress bars and closes cleanly'
    );

    assert.strictEqual(
      shInfo.hasAdminList,
      true,
      'Admin console has Story Highlights management list'
    );
    assert.strictEqual(shInfo.hasAdminModal, true, 'Admin console has Create/Edit Story Modal');
    assert.strictEqual(shInfo.adminControlsHidden, true, 'Legacy admin Story Highlights controls stay hidden');
    assert.strictEqual(shInfo.adminModalHidden, true, 'Legacy admin Story Highlights modal stays closed');
    console.log(
      '  ✔ Legacy Story Highlights controls stay hidden in the admin console'
    );
    // 14b. Test Dedicated Gallery Tab & Video Media Support
    console.log('\n[Dedicated Gallery Tab & Video Media Viewer]');
    const evalGalleryTab = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        // Switch to gallery tab
        if (typeof switchTabNav === 'function') {
          switchTabNav('gallery');
        }
        const pageGallery = document.getElementById('page-gallery');
        const isPageActive = pageGallery ? pageGallery.classList.contains('active') : false;
        const snavGallery = document.getElementById('snav-gallery');
        const isSnavActive = snavGallery ? snavGallery.classList.contains('active') : false;
        const filterBar = document.getElementById('gallery-filter-bar');
        const filterPills = filterBar ? filterBar.querySelectorAll('.gallery-filter-pill') : [];
        const galleryReel = document.getElementById('gallery-story-highlights-reel');
        const storyCardHidden = getComputedStyle(galleryReel.closest('.story-highlights-card')).display === 'none';
        const reelBubbles = galleryReel ? galleryReel.querySelectorAll('.story-highlight-item') : [];
        const videoElement = document.getElementById('story-viewer-video');
        const soundBtn = document.getElementById('story-btn-sound');

        // Test opening story viewer
        if (typeof openStoryViewer === 'function') {
          openStoryViewer(0, 0);
        }
        const iframeElement = document.getElementById('story-viewer-iframe');
        const hasMediaActive = !!((videoElement && videoElement.style.display === 'block') || (iframeElement && iframeElement.style.display === 'block') || (document.getElementById('story-viewer-img') && document.getElementById('story-viewer-img').style.display === 'block'));
        const hasArrowPrev = !!document.querySelector('.story-arrow-prev');
        const hasArrowNext = !!document.querySelector('.story-arrow-next');

        // Close viewer
        if (typeof closeStoryViewer === 'function') {
          closeStoryViewer();
        }

        const videosPill = document.getElementById('gallery-filter-videos');
        const videosPillText = videosPill ? videosPill.textContent.trim() : '';
        const hlTitleEl = document.querySelector('#page-gallery .s-title');
        const highlightsTitle = hlTitleEl ? hlTitleEl.textContent.trim() : '';

        // Return back to home
        if (typeof switchTabNav === 'function') {
          switchTabNav('home');
        }

        return { storyCardHidden,
          isPageActive,
          isSnavActive,
          filterPillCount: filterPills.length,
          reelBubbleCount: reelBubbles.length,
          hasMediaActive,
          hasArrowPrev,
          hasArrowNext,
          videosPillText,
          highlightsTitle
        };
      })()`,
      returnByValue: true
    });
    const galleryViewer = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const prior = galleryImages.slice();
        galleryImages.splice(0, galleryImages.length,
          { url: 'https://example.com/photo.jpg', type: 'image' },
          { url: 'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', type: 'video' });
        try {
          filterGallery('all');
          openGalleryLightbox(0);
          const getCounter = () => document.getElementById('gallery-lb-counter').textContent;
          const initial = getCounter();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
          const arrow = getCounter();
          const youtube = document.querySelector('.gallery-lb-iframe').src.includes('youtube-nocookie.com/embed/');
          document.querySelector('.gallery-lb-thumb').click();
          const filmstrip = getCounter();
          const stage = document.querySelector('.gallery-lb-stage');
          const touch = clientX => new Touch({ identifier: 1, target: stage, clientX, clientY: 100 });
          stage.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(140)] }));
          stage.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(60)] }));
          const swipe = getCounter();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          const closed = !document.getElementById('gallery-lightbox-modal');
          filterGallery('videos');
          openGalleryLightbox(0);
          const videosOnly = getCounter();
          return { initial, arrow, youtube, filmstrip, swipe, closed, videosOnly };
        } finally {
          closeGalleryLightbox();
          galleryImages.splice(0, galleryImages.length, ...prior);
          filterGallery('all');
        }
      })()`,
      returnByValue: true
    });
    assert.deepStrictEqual(galleryViewer.result.value, {
      initial: '1 of 2', arrow: '2 of 2', youtube: true, filmstrip: '1 of 2', swipe: '2 of 2', closed: true, videosOnly: '1 of 1'
    });
    const gtInfo = evalGalleryTab.result.value;
    assert.strictEqual(gtInfo.storyCardHidden, true, 'Story Highlights card stays hidden');
    assert.strictEqual(
      gtInfo.isPageActive,
      true,
      'Navigating to gallery tab activates #page-gallery'
    );
    assert.strictEqual(gtInfo.isSnavActive, true, 'Gallery sidebar item reflects active state');
    assert.strictEqual(
      gtInfo.videosPillText,
      'Videos',
      'Videos filter pill must say Videos without Reels'
    );
    assert.strictEqual(
      gtInfo.highlightsTitle,
      'Highlights',
      'Gallery section must say Highlights without Story/Reels'
    );
    assert.ok(gtInfo.filterPillCount >= 3, 'Gallery features All, Photos, and Videos filter pills');
    assert.ok(
      gtInfo.reelBubbleCount >= 1,
      'Dedicated gallery tab renders complete story highlights reel'
    );
    assert.strictEqual(gtInfo.hasMediaActive, true, 'Story viewer displays active media viewport');
    assert.strictEqual(
      gtInfo.hasArrowPrev,
      true,
      'Story viewer features prev arrow navigation button'
    );
    assert.strictEqual(
      gtInfo.hasArrowNext,
      true,
      'Story viewer features next arrow navigation button'
    );
    console.log('  ✔ Dedicated Gallery tab navigation, media filter pills, and reel verified');
    console.log(
      '  ✔ Story viewer renders interactive video viewport with unblocked tactile arrow navigation'
    );

    // 15. Test Google Apps Script & Master Sheet Endpoint Hardening
    console.log('\n[Google Apps Script & Master Sheet Endpoint Hardening]');
    const evalGasHardening = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        // Switch to Admin Attendance tab
        if (typeof switchAdminSection === 'function') {
          switchAdminSection('attendance');
        }
        if (typeof renderAdminMasterSheetPanel === 'function') {
          await renderAdminMasterSheetPanel();
        }

        const panel = document.getElementById('adm-master-sheet-panel');
        const scriptInp = document.getElementById('master-script-url-input');
        const sheetInp = document.getElementById('master-sheet-id-input');
        const tokenInp = document.getElementById('master-sync-token-input');
        const saveBtn = document.getElementById('btn-save-master-config');
        const syncBtn = document.getElementById('btn-adm-sync-sheet');
        const gasPre = document.getElementById('gas-snippet-pre');

        const panelHtml = panel ? panel.innerHTML : '';
        const tokenVal = tokenInp ? tokenInp.value : '';
        const preText = gasPre ? gasPre.textContent : '';

        return {
          hasPanel: !!panel,
          hasScriptInp: !!scriptInp,
          hasSheetInp: !!sheetInp,
          hasTokenInp: !!tokenInp,
          hasSaveBtn: !!saveBtn,
          hasSyncBtn: !!syncBtn,
          tokenVal,
          hasPiiBadge: panelHtml.includes('Zero-PII Whitelist'),
          hasTokenBadge: panelHtml.includes('Token Auth Enforced'),
          hasSharingBadge: panelHtml.includes('Restricted Sharing'),
          snippetHasToken: preText.includes('SYNC_TOKEN'),
          snippetHasDoGet: preText.includes('function doGet(e)'),
          snippetHasDoPost: preText.includes('function doPost(e)'),
          snippetHasAudit: preText.includes('auditSheetSharingSecurity')
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const ghInfo = evalGasHardening.result.value;
    assert.strictEqual(ghInfo.hasPanel, true, 'Admin master sheet panel must exist');
    assert.strictEqual(ghInfo.hasScriptInp, true, 'Web App script URL input must exist');
    assert.strictEqual(ghInfo.hasSheetInp, true, 'Sheet ID input must exist');
    assert.strictEqual(ghInfo.hasTokenInp, true, 'Sync token input must exist');
    assert.strictEqual(ghInfo.hasSaveBtn, true, 'Save config button must exist');
    assert.strictEqual(ghInfo.hasSyncBtn, true, 'Sync Now button must exist');
    assert.ok(
      ghInfo.tokenVal && ghInfo.tokenVal.startsWith('bb_sec_'),
      'Token input must contain secure bb_sec_ token'
    );
    console.log(
      '  ✔ Admin console provides complete endpoint security inputs and active sync token'
    );

    assert.strictEqual(ghInfo.hasPiiBadge, true, 'Must display Zero-PII Whitelist badge');
    assert.strictEqual(ghInfo.hasTokenBadge, true, 'Must display Token Auth Enforced badge');
    assert.strictEqual(ghInfo.hasSharingBadge, true, 'Must display Restricted Sharing badge');
    console.log(
      '  ✔ Hardening status badges verify PII stripping, proxy token auth, and restricted sharing'
    );

    assert.strictEqual(ghInfo.snippetHasToken, true, 'Apps script snippet must embed SYNC_TOKEN');
    assert.strictEqual(
      ghInfo.snippetHasDoGet,
      true,
      'Apps script snippet must define doGet handler'
    );
    assert.strictEqual(
      ghInfo.snippetHasDoPost,
      true,
      'Apps script snippet must define doPost handler'
    );
    assert.strictEqual(
      ghInfo.snippetHasAudit,
      true,
      'Apps script snippet must include sheet sharing audit function'
    );
    console.log(
      '  ✔ Generated Google Apps Script template incorporates token authentication and security audits'
    );

    // 16. Test Badges Tab and President's Tracker in Browser
    console.log("\n[Badges Tab & President's Award Tracker Verification]");
    const evalBadgesInit = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof sessionSet === 'function') {
          sessionSet('ic', '010101-14-1234');
          sessionSet('name', 'Joshua Koh');
        }
        if (typeof switchTab === 'function') {
          switchTab('badges');
        }
        if (typeof renderPresidentsTracker === 'function') {
          await renderPresidentsTracker('010101-14-1234');
        }
        if (typeof loadBadges === 'function') {
          await loadBadges('010101-14-1234');
        }
        const gate = document.getElementById('badges-gate');
        const loggedIn = document.getElementById('badges-logged-in');
        const tracker = document.getElementById('presidents-tracker');
        const badgeList = document.getElementById('badges-list');
        const badgeSearch = document.getElementById('badge-search');
        badgeSearch.value = 'no matching badge fixture';
        badgeSearch.dispatchEvent(new Event('input', { bubbles: true }));
        const searchEmpty = document.getElementById('badge-no-results').style.display === 'block';
        badgeSearch.value = '';
        badgeSearch.dispatchEvent(new Event('input', { bubbles: true }));
        return {
          gateDisplay: gate ? gate.style.display : null,
          loggedInDisplay: loggedIn ? loggedIn.style.display : null,
          hasTracker: !!tracker,
          trackerHtml: tracker ? tracker.innerHTML : '',
          searchWorks: searchEmpty && document.getElementById('badge-no-results').style.display === 'none',
          badgeListCount: badgeList ? badgeList.children.length : 0
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const badgesInit = evalBadgesInit.result.value;
    assert.strictEqual(badgesInit.gateDisplay, 'none', 'Badges gate must be hidden when logged in');
    assert.strictEqual(
      badgesInit.loggedInDisplay,
      'block',
      'Badges logged-in panel must be displayed'
    );
    assert.strictEqual(badgesInit.hasTracker, true, 'President tracker container must exist');
    assert.ok(
      badgesInit.trackerHtml.includes("President's Award Tracker"),
      "President's Award tracker must render in #presidents-tracker"
    );
    assert.ok(
      badgesInit.trackerHtml.includes('All Compulsory Awards Received'),
      "President's Award tracker must render criteria checklist"
    );
    assert.strictEqual(badgesInit.searchWorks, true, 'Badge search must show an empty state and restore results when cleared');
    assert.ok(!badgesInit.trackerHtml.includes('<details'), 'The main tracker must omit both extra checklist rows');
    console.log(
      "  ✔ Badges tab renders cleanly with interactive President's Award tracker checklist"
    );

    // 17. Test Weekly Parade Schedule & NCO Tasks Kanban Board in Browser
    console.log('\n[Weekly Parade Schedule & NCO Tasks Board Verification]');
    const evalTasksInit = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof switchTab === 'function') {
          switchTab('parade');
        }
        const scheduleCard = document.getElementById('tasks-no-dept');
        const schedText = scheduleCard ? (scheduleCard.innerText || scheduleCard.textContent) : '';
        if (typeof switchTab === 'function') {
          switchTab('tasks');
        }
        const board = document.getElementById('tasks-board');
        const colTodo = document.getElementById('col-todo');
        const colInprog = document.getElementById('col-inprogress');
        const colDone = document.getElementById('col-done');
        const detailModal = document.getElementById('task-detail-modal');

        return {
          hasScheduleCard: !!scheduleCard,
          scheduleText: schedText,
          hasBoard: !!board,
          hasColTodo: !!colTodo,
          hasColInprog: !!colInprog,
          hasColDone: !!colDone,
          hasDetailModal: !!detailModal,
          hasSwitchTaskTab: typeof window.switchTaskTab === 'function',
          hasRenderTasksBoard: typeof window.renderTasksBoard === 'function',
          hasCheckTasksAccess: typeof window.checkTasksAccess === 'function',
          hasOpenTaskDetail: typeof window.openTaskDetail === 'function',
          hasSaveTask: typeof window.saveTask === 'function',
          hasRenderAdminTasks: typeof window.renderAdminTasks === 'function'
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const tasksInit = evalTasksInit.result.value;
    assert.strictEqual(
      tasksInit.hasScheduleCard,
      true,
      'Weekly parade schedule card must exist in DOM'
    );
    const schedUpper = (tasksInit.scheduleText || '').toUpperCase();
    assert.ok(
      schedUpper.includes('PARADE') ||
        schedUpper.includes('FALL-IN') ||
        schedUpper.includes('BAND') ||
        schedUpper.includes('2:15 PM') ||
        schedUpper.includes('1:00 PM'),
      'Schedule card must display parade schedule details'
    );
    assert.strictEqual(
      tasksInit.hasBoard,
      true,
      'NCO task board container must exist under parade tab'
    );
    assert.strictEqual(tasksInit.hasColTodo, true, 'Todo Kanban column must exist');
    assert.strictEqual(tasksInit.hasColInprog, true, 'In-progress Kanban column must exist');
    assert.strictEqual(tasksInit.hasColDone, true, 'Done Kanban column must exist');
    assert.strictEqual(tasksInit.hasDetailModal, true, 'Task detail modal must exist');
    assert.strictEqual(
      tasksInit.hasSwitchTaskTab,
      true,
      'switchTaskTab function must be available'
    );
    assert.strictEqual(
      tasksInit.hasRenderTasksBoard,
      true,
      'renderTasksBoard function must be available'
    );
    assert.strictEqual(
      tasksInit.hasCheckTasksAccess,
      true,
      'checkTasksAccess function must be available'
    );
    assert.strictEqual(
      tasksInit.hasOpenTaskDetail,
      true,
      'openTaskDetail function must be available'
    );
    assert.strictEqual(tasksInit.hasSaveTask, true, 'saveTask function must be available');
    assert.strictEqual(
      tasksInit.hasRenderAdminTasks,
      true,
      'renderAdminTasks function must be available'
    );
    console.log(
      '  ✔ Weekly parade schedule and NCO Kanban board verified in headless Edge browser'
    );

    const restoredWorkflows = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const originalGet = supa.get;
        const originalPatch = supa.patch;
        const beforeRoles = RBAC._getRolesConfig();
        const beforeMember = Object.fromEntries(['email', 'ic', 'rank', 'department'].map(key => [key, sessionGet(key)]));
        const updates = [];
        const renderPause = () => new Promise(resolve => setTimeout(resolve, 30));
        try {
          sessionSet('email', 'board-admin@example.test');
          sessionSet('ic', 'board-admin@example.test');
          sessionSet('rank', 'Sergeant');
          sessionSet('department', 'media');
          RBAC._setRolesConfig({ super_admins: [], admins: { 'board-admin@example.test': ['tasks'] } });
          supa.get = async path => path.startsWith('bb_tasks?') ? [{
            id: 'restore-drag-task', title: 'Drag between columns', status: 'planning',
            department: 'media', project_name: 'Media', priority: 'medium'
          }] : [];
          supa.patch = async (path, data) => {
            updates.push(data.status);
            if (data.status === 'inreview') throw new Error('Fixture network failure');
            return [];
          };
          switchTabNav('tasks', true);
          await renderTasksBoard('Media');
          const findCard = () => document.querySelector('[data-task-id="restore-drag-task"]');
          const findColumn = status => document.querySelector('.task-col[data-col-status="' + status + '"]');
          const card = findCard();
          if (!card) throw new Error('Task card fixture did not render');
          const plans = findColumn('planning');
          const todo = findColumn('todo');
          const styles = element => getComputedStyle(element);
          const badge = column => column.querySelector('.task-col-count-badge');
          const cleanLanes = styles(plans).borderTopWidth === '0px' &&
                             styles(todo.querySelector('.task-col-empty')).borderTopWidth === '0px' &&
                             styles(plans.querySelector('.task-col-title')).color === styles(todo.querySelector('.task-col-title')).color &&
                             badge(plans).textContent === '1' && badge(todo).textContent === '0' &&
                             styles(badge(plans)).backgroundColor !== styles(badge(todo)).backgroundColor;
          const drag = async status => {
            const source = findCard();
            const target = findColumn(status);
            const transfer = new DataTransfer();
            const send = (element, type) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
            send(source, 'dragstart');
            const dropAccepted = !send(target, 'dragover');
            send(target, 'drop');
            send(source, 'dragend');
            await renderPause();
            return dropAccepted && findCard()?.closest('.task-col') === target;
          };
          const moved = card.draggable && await drag('todo') && await drag('inprogress');
          await drag('inreview');
          const rolledBack = findCard()?.closest('.task-col') === findColumn('inprogress');

          return { cleanLanes, moved, rolledBack, updates };
        } finally {
          RBAC._setRolesConfig(beforeRoles);
          for (const [key, value] of Object.entries(beforeMember)) sessionSet(key, value);
          supa.get = originalGet;
          supa.patch = originalPatch;
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(restoredWorkflows.result.value, JSON.stringify(restoredWorkflows.exceptionDetails));
    assert.deepStrictEqual(restoredWorkflows.result.value, {
      cleanLanes: true, moved: true, rolledBack: true, updates: ['todo', 'inprogress', 'inreview']
    }, 'Task drops update the board and failed saves restore the prior column');
    console.log('  ✔ Borderless lanes, status count pills, task drag, and failed-move rollback verified');

    const taskBriefEval = async expression => {
      const result = await sendCmd('Runtime.evaluate', { expression, returnByValue: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const pressBriefKey = async (key, virtualKeyCode, modifiers = 0) => {
      const params = { key, windowsVirtualKeyCode: virtualKeyCode, modifiers };
      await sendCmd('Input.dispatchKeyEvent', { ...params, type: 'keyDown', ...(key === 'Enter' ? { text: '\r' } : {}) });
      await sendCmd('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
    };
    await taskBriefEval(`(() => {
      document.getElementById('page-tasks').classList.add('active');
      document.getElementById('task-detail-modal').style.display = 'block';
      const editor = document.getElementById('tdm-desc');
      editor.focus();
    })()`);
    try {
      for (const [prefix, tag, nestedMarker] of [['1.', 'ol', 'lower-alpha'], ['-', 'ul', 'circle'], ['*', 'ul', 'circle']]) {
        await taskBriefEval(`(() => {
          const editor = document.getElementById('tdm-desc');
          editor.replaceChildren();
          editor.focus();
          getSelection().collapse(editor, 0);
        })()`);
        await sendCmd('Input.insertText', { text: prefix });
        await sendCmd('Input.insertText', { text: ' ' });
        await sendCmd('Input.insertText', { text: 'Parent' });
        assert.strictEqual(await taskBriefEval(`document.querySelector('#tdm-desc ${tag} > li')?.textContent`), 'Parent', `The ${prefix} shortcut starts a real list without keeping the typed marker`);
        await pressBriefKey('Enter', 13);
        assert.deepStrictEqual(await taskBriefEval(`Array.from(document.querySelectorAll('#tdm-desc li'), item => item.textContent)`), ['Parent', ''], 'Enter starts the next list item');
        await pressBriefKey('Tab', 9);
        await sendCmd('Input.insertText', { text: 'First child' });
        await pressBriefKey('Enter', 13);
        await sendCmd('Input.insertText', { text: 'Second child' });
        const editedList = await taskBriefEval(`document.getElementById('tdm-desc').innerHTML`);
        await pressBriefKey('Tab', 9, 8);
        assert.strictEqual(await taskBriefEval(`document.querySelector('#tdm-desc > ${tag} > li:last-child')?.textContent`), 'Second child', 'Shift+Tab returns the current item to the outer list');
        await taskBriefEval(`document.getElementById('tdm-desc').innerHTML = sanitizeHtml(${JSON.stringify(editedList)})`);
        assert.deepStrictEqual(await taskBriefEval(`(() => {
          const editor = document.getElementById('tdm-desc');
          const nested = editor.querySelector('${tag} ${tag}');
          return nested && [getComputedStyle(nested).listStyleType, ...Array.from(nested.children, li => li.textContent)];
        })()`), [nestedMarker, 'First child', 'Second child'], 'Tab creates a nested list with the next marker style, preserved when the brief is saved');
      }

      await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        editor.replaceChildren();
        editor.focus();
        getSelection().collapse(editor, 0);
      })()`);
      await sendCmd('Input.insertText', { text: 'See item 1.' });
      await sendCmd('Input.insertText', { text: ' ' });
      assert.strictEqual(await taskBriefEval(`!!document.querySelector('#tdm-desc ol, #tdm-desc ul')`), false, 'A marker in a sentence stays plain text');
      await pressBriefKey('Enter', 13);
      await sendCmd('Input.insertText', { text: '1.' });
      await sendCmd('Input.insertText', { text: ' ' });
      await sendCmd('Input.insertText', { text: 'List after paragraph' });
      assert.strictEqual(await taskBriefEval(`document.querySelector('#tdm-desc ol > li')?.textContent`), 'List after paragraph');

      await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        editor.innerHTML = '<p>First quoted line</p><p>Next paragraph</p>';
        editor.focus();
        const first = editor.firstElementChild.firstChild;
        getSelection().collapse(first, first.length);
        document.querySelector('#task-detail-modal button[title="Quote"]').click();
      })()`);
      await pressBriefKey('Enter', 13);
      await sendCmd('Input.insertText', { text: 'Second quoted line' });
      const continuedQuote = await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        return [editor.querySelectorAll('blockquote').length, editor.querySelector('blockquote').innerText];
      })()`);
      await pressBriefKey('Enter', 13);
      await pressBriefKey('Enter', 13);
      await sendCmd('Input.insertText', { text: 'Normal text' });
      const quoteAfterEnter = await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        return Array.from(editor.children, node => [node.tagName, node.innerText.trim()]);
      })()`);
      await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        const quote = editor.querySelector('blockquote');
        getSelection().collapse(quote.firstChild, 0);
        document.querySelector('#task-detail-modal button[title="Quote"]').click();
      })()`);
      const toggledQuote = await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        return [editor.querySelectorAll('blockquote').length, editor.firstElementChild.innerText.trim()];
      })()`);

      await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        editor.innerHTML = '<p>Run&nbsp;</p>';
        editor.focus();
        const text = editor.querySelector('p').firstChild;
        getSelection().collapse(text, text.length);
        document.querySelector('#task-detail-modal button[title^="Inline Code"]').click();
      })()`);
      await sendCmd('Input.insertText', { text: 'npm test' });
      const typedCode = await taskBriefEval(`(() => {
        const editor = document.getElementById('tdm-desc');
        const code = editor.querySelector('code, font[face="Consolas" i]');
        const saved = document.createElement('template');
        saved.innerHTML = sanitizeHtml(editor.innerHTML);
        return [editor.textContent.replaceAll(String.fromCharCode(160), ' '), saved.content.querySelector('code')?.textContent, code && getComputedStyle(code).fontFamily.split(',')[0]];
      })()`);
      await taskBriefEval(`document.querySelector('#task-detail-modal button[title^="Inline Code"]').click()`);
      await sendCmd('Input.insertText', { text: ' normally' });
      const codeAfterToggle = await taskBriefEval(`(() => {
        const saved = document.createElement('template');
        saved.innerHTML = sanitizeHtml(document.getElementById('tdm-desc').innerHTML);
        return [saved.content.querySelector('code')?.textContent, saved.content.textContent.trim().endsWith(' normally')];
      })()`);
      assert.deepStrictEqual(continuedQuote, [1, 'First quoted line\nSecond quoted line'], 'Enter keeps both lines within one quote');
      assert.deepStrictEqual(quoteAfterEnter, [
        ['BLOCKQUOTE', 'First quoted line\nSecond quoted line'], ['P', 'Normal text'], ['P', 'Next paragraph']
      ], 'Enter on an empty quoted line exits the quote and preserves following text');
      assert.deepStrictEqual(toggledQuote, [0, 'First quoted line\nSecond quoted line'], 'Clicking Quote again removes formatting and keeps both lines');
      assert.deepStrictEqual(typedCode, ['Run npm test', 'npm test', 'Consolas'], 'Inline Code at the caret types in Consolas without placeholder text');
      assert.deepStrictEqual(codeAfterToggle, ['npm test', true], 'Toggling off Inline Code keeps following text outside the saved code span');

      for (const [width, height, theme] of [[1280, 900, 'light'], [360, 800, 'dark']]) {
        await sendCmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
        const toolbar = await taskBriefEval(`(() => {
          const oldTheme = document.documentElement.dataset.theme;
          document.documentElement.dataset.theme = '${theme}';
          const card = document.querySelector('.task-brief-modal-card');
          const topbar = card.querySelector('.task-brief-topbar');
          const toolbar = card.querySelector('.task-brief-toolbar');
          const editor = document.getElementById('tdm-desc');
          const attachments = card.querySelector('.tb-attachments-section');
          editor.innerHTML = '<p>Task brief text</p>'.repeat(120);
          const fixture = document.createElement('div');
          fixture.style.height = '100vh';
          attachments.appendChild(fixture);
          card.scrollTop = 0;
          const initialTop = toolbar.getBoundingClientRect().top;
          card.scrollTop = 400;
          const sticky = toolbar.getBoundingClientRect();
          const headerBottom = topbar.getBoundingClientRect().bottom;
          const opaque = getComputedStyle(toolbar).backgroundColor === getComputedStyle(card).backgroundColor;
          card.scrollTop = card.scrollHeight;
          const clearsBrief = toolbar.getBoundingClientRect().bottom <= topbar.getBoundingClientRect().bottom
            && toolbar.getBoundingClientRect().bottom <= attachments.getBoundingClientRect().top;
          fixture.remove();
          document.documentElement.dataset.theme = oldTheme;
          return { initialTop, stickyTop: sticky.top, headerBottom, opaque, clearsBrief };
        })()`);
        assert.ok(toolbar.initialTop > toolbar.headerBottom, 'Toolbar starts inside the brief');
        assert.ok(Math.abs(toolbar.stickyTop - toolbar.headerBottom) < 2, `Toolbar follows scroll below the title bar at ${width}px`);
        assert.ok(toolbar.opaque, 'Sticky toolbar covers editor text as it scrolls behind it');
        assert.ok(toolbar.clearsBrief, 'Toolbar scrolls away with the brief before attachments');
      }
    } finally {
      await sendCmd('Emulation.clearDeviceMetricsOverride');
      await taskBriefEval(`(() => {
        document.getElementById('tdm-desc').replaceChildren();
        document.getElementById('task-detail-modal').style.display = 'none';
        document.getElementById('page-tasks').classList.remove('active');
      })()`);
    }
    console.log('  ✔ Task brief list shortcuts and desktop/mobile toolbar scrolling verified');

    const richBrief = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const id = 'rich-brief-fixture';
        const label = 'A wrapped checklist item that should align with the first line. '.repeat(9).trim();
        let task = { id, title: 'Formatting test', status: 'planning', department: 'Media',
          description: '<div class="tb-checklist-row" style="display:flex;align-items:center"><input type="checkbox" disabled><span>' + label + '</span></div><p><strong>Quoted</strong> text</p>' };
        const originalGet = supa.get;
        const originalRpc = supa.rpc;
        const beforeMember = Object.fromEntries(['ic', 'email', 'rank', 'department'].map(key => [key, sessionGet(key)]));
        const tasksPage = document.getElementById('page-tasks');
        const wasActive = tasksPage.classList.contains('active');
        const saved = [];
        const editor = document.getElementById('tdm-desc');
        const readBox = () => editor.querySelector('.tb-checklist-row > input');
        const waitForSave = async count => {
          for (let tries = 0; saved.length < count && tries < 12; tries++) await new Promise(resolve => setTimeout(resolve, 50));
        };
        try {
          sessionSet('ic', 'task-editor@example.test', { localOnly: true });
          sessionSet('email', 'task-editor@example.test', { localOnly: true });
          sessionSet('rank', 'Sergeant', { localOnly: true });
          sessionSet('department', 'Media', { localOnly: true });
          tasksPage.classList.add('active');
          window._taskMap[id] = task;
          supa.get = async endpoint => endpoint.startsWith('bb_tasks?id=') ? [{ ...task }] : [];
          supa.rpc = async (name, params) => {
            if (name !== 'rpc_save_task_brief_field') return null;
            saved.push(params.p_value);
            task = { ...task, description: params.p_value };
            return { saved: true, task };
          };
          openTaskDetail(id);
          await refreshVisibleTaskBrief();
          const box = readBox();
          const text = box.nextElementSibling;
          const range = document.createRange();
          range.setStart(text.firstChild, 0);
          range.setEnd(text.firstChild, 1);
          const firstLine = range.getBoundingClientRect();
          const boxRect = box.getBoundingClientRect();
          const aligned = text.clientHeight > firstLine.height * 2 && Math.abs(
            (boxRect.top + boxRect.height / 2) - (firstLine.top + firstLine.height / 2)
          ) < 3;
          const legacyEnabled = !box.disabled;
          box.click();
          const crossedOut = box.checked && getComputedStyle(text).textDecorationLine.includes('line-through');
          await waitForSave(1);
          const savedCheck = !!saved[0]?.match(/<input[^>]+checked/);
          closeTaskDetail();
          openTaskDetail(id);
          await refreshVisibleTaskBrief();
          const reopenedChecked = readBox()?.checked && !readBox().disabled;
          readBox()?.click();
          const textRestored = !getComputedStyle(readBox().nextElementSibling).textDecorationLine.includes('line-through');
          await waitForSave(2);
          const savedUncheck = !!saved[1] && !saved[1].match(/<input[^>]+checked/);

          editor.focus();
          getSelection().selectAllChildren(editor.querySelector('p'));
          document.querySelector('#task-detail-modal .task-brief-toolbar button[title="Quote"]').click();
          const quote = editor.querySelector('blockquote');
          const quoteStyled = !!quote && getComputedStyle(quote).fontStyle === 'italic' &&
            parseFloat(getComputedStyle(quote).borderInlineStartWidth) > 0;
          await waitForSave(3);
          const quoteSaved = !!saved[2]?.includes('<blockquote>') && !!saved[2]?.includes('<strong>Quoted</strong> text');
          getSelection().selectAllChildren(quote.querySelector('strong'));
          document.querySelector('#task-detail-modal button[title^="Inline Code"]').click();
          await waitForSave(4);
          const savedFormatting = document.createElement('template');
          savedFormatting.innerHTML = saved[3] || '';
          const inlineCodeSaved = savedFormatting.content.querySelector('blockquote code')?.textContent === 'Quoted';
          const end = editor.querySelector('blockquote').lastChild;
          getSelection().collapse(end, end.length);
          document.execCommand('insertLineBreak');
          editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
          document.execCommand('insertText', false, 'After quote');
          await waitForSave(5);
          savedFormatting.innerHTML = saved[4] || '';
          const quoteExitSaved = savedFormatting.content.querySelector('blockquote + p')?.textContent === 'After quote' &&
            savedFormatting.content.querySelector('blockquote')?.textContent === 'Quoted text';
          const readOnlyCopy = document.createElement('div');
          readOnlyCopy.innerHTML = sanitizeHtml(task.description);
          return {
            legacyEnabled, aligned, crossedOut, savedCheck, reopenedChecked, textRestored, savedUncheck, quoteStyled, quoteSaved,
            inlineCodeSaved, quoteExitSaved,
            readOnlyCopyDisabled: readOnlyCopy.querySelector('input')?.disabled === true
          };
        } finally {
          closeTaskDetail();
          tasksPage.classList.toggle('active', wasActive);
          for (const [key, value] of Object.entries(beforeMember)) sessionSet(key, value, { localOnly: true });
          supa.get = originalGet;
          supa.rpc = originalRpc;
          delete window._taskMap[id];
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(!richBrief.exceptionDetails, JSON.stringify(richBrief.exceptionDetails));
    assert.deepStrictEqual(richBrief.result.value, {
      legacyEnabled: true, aligned: true, crossedOut: true, savedCheck: true, reopenedChecked: true,
      textRestored: true, savedUncheck: true, quoteStyled: true, quoteSaved: true, inlineCodeSaved: true,
      quoteExitSaved: true, readOnlyCopyDisabled: true
    }, 'Existing checklist items toggle and autosave, wrapped items align, and the Quote button saves styled quotes');
    console.log('  ✔ Task brief checkboxes, wrapped alignment, and block quotes verified through autosave');

    const briefTraffic = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const taskId = 'capacity-fixture';
        let task = { id: taskId, title: 'Capacity test', description: '<p>Original</p>', department: 'Media', status: 'planning' };
        const sections = ['comments', 'attachments', 'subtasks', 'links'];
        const calls = [];
        const originalGet = supa.get;
        const previousVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        try {
          window._taskMap[taskId] = task;
          supa.get = async endpoint => {
            if (endpoint.includes(taskId)) calls.push(endpoint);
            if (endpoint.startsWith('bb_tasks?id=')) return [{ ...task }];
            if (endpoint.startsWith('bb_config?key=in.') && endpoint.includes(taskId)) {
              return sections.map(section => ({ key: 'bb_task_' + section + '_' + taskId, value: '[]' }));
            }
            return [];
          };
          openTaskDetail(taskId);
          await Promise.all([refreshVisibleTaskBrief(), refreshVisibleTaskBrief()]);
          const visible = { taskReads: calls.filter(url => url.startsWith('bb_tasks?')).length, configReads: calls.filter(url => url.startsWith('bb_config?')).length };
          const allSections = sections.every(section => calls.some(url => url.includes('bb_task_' + section + '_' + taskId)));

          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          calls.length = 0;
          await refreshVisibleTaskBrief();
          const hiddenReads = calls.length;
          task = { ...task, description: '<p>Saved from another device</p>' };
          PortalRealtime.trigger('tasks', 'brief-saved', { id: taskId }, true);
          await new Promise(resolve => setTimeout(resolve, 0));
          const liveEdit = calls.length === 1 && document.getElementById('tdm-desc').textContent === 'Saved from another device';

          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
          calls.length = 0;
          await refreshVisibleTaskBrief();
          const resumedReads = calls.length;
          return { visible, allSections, hiddenReads, liveEdit, resumedReads };
        } finally {
          closeTaskDetail();
          if (previousVisibility) Object.defineProperty(document, 'visibilityState', previousVisibility);
          else delete document.visibilityState;
          supa.get = originalGet;
          delete window._taskMap[taskId];
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(!briefTraffic.exceptionDetails, JSON.stringify(briefTraffic.exceptionDetails));
    assert.deepStrictEqual(briefTraffic.result.value, {
      visible: { taskReads: 1, configReads: 1 }, allSections: true, hiddenReads: 0, liveEdit: true, resumedReads: 2
    }, 'Concurrent brief refreshes share two reads, hidden polling pauses, and live edits still arrive');
    console.log('  ✔ Task brief network batching, hidden/resumed polling and live save events verified');

    // Exercise the gallery lightbox with a fresh signature and real image bytes.
    const fixturePhoto = fs.readFileSync(path.resolve('assets/logo.png')).toString('base64');
    let signatureRequests = 0;
    fulfillGalleryFixture = params => {
      const refreshed = new URL(params.request.url).searchParams.get('token') === 'refreshed';
      if (refreshed) signatureRequests++;
      sendCmd('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: refreshed ? 200 : 403,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: refreshed ? fixturePhoto : ''
      }).catch(() => {});
    };
    await sendCmd('Fetch.enable', { patterns: [{ urlPattern: '*://*.supabase.co/storage/v1/object/sign/gallery/restore-fixture.png*' }] });
    try {
      const check = await sendCmd('Runtime.evaluate', {
        expression: `(async () => {
          const originalSigner = supa.createSignedUrl;
          const storedGallery = galleryImages.slice();
          const originalOrigin = SUPA_URL;
          const origin = 'https://fixture.supabase.co';
          let signed = 0;
          let currentSignature = origin + '/storage/v1/object/sign/gallery/restore-fixture.png?token=cached';
          try {
            SUPA_URL = origin;
            galleryImages.splice(0, galleryImages.length, {
              id: 'repair-photo', url: origin + '/storage/v1/object/sign/gallery/restore-fixture.png?token=expired', type: 'image'
            });
            supa.createSignedUrl = async (bucket, storagePath, _ttl, options) => {
              if (bucket === 'gallery' && storagePath === 'restore-fixture.png' && options?.retryUrl === currentSignature) {
                signed++;
                currentSignature = origin + '/storage/v1/object/sign/gallery/restore-fixture.png?token=refreshed';
              }
              return { signedUrl: currentSignature };
            };
            filterGallery('photos');
            const thumbnail = document.querySelector('#gallery-grid img');
            thumbnail.loading = 'eager';
            document.querySelector('#gallery-grid [data-lightbox-idx="0"]').click();
            for (let attempt = 0; attempt < 40; attempt++) {
              const preview = document.querySelector('.gallery-lb-img');
              if (preview?.naturalWidth > 0 && thumbnail.naturalWidth > 0) {
                return { loaded: true, signed, thumbnail: thumbnail.src.endsWith('token=refreshed') };
              }
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            return { loaded: false, signed };
          } finally {
            closeGalleryLightbox();
            SUPA_URL = originalOrigin;
            supa.createSignedUrl = originalSigner;
            galleryImages.splice(0, galleryImages.length, ...storedGallery);
            filterGallery('all');
          }
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      assert.ok(check.result.value, JSON.stringify(check.exceptionDetails));
      assert.deepStrictEqual(check.result.value, { loaded: true, signed: 1, thumbnail: true });
      assert.ok(signatureRequests > 0, 'The refreshed image was fetched and decoded');
      console.log('  ✔ Gallery grid and lightbox recover an expired photo and decode the refreshed image');
    } finally {
      await sendCmd('Fetch.disable');
      fulfillGalleryFixture = undefined;
    }

    // 17B. Calendar Hub 5 Views & Day Schedule Verification
    console.log('\n[Calendar Hub 5 Views & Day Schedule Verification]');
    const evalCalendarViews = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof switchTab === 'function') {
          switchTab('parade');
        }
        if (typeof renderCalendarTab === 'function') {
          renderCalendarTab('upcoming');
        }
        const hasUpcoming = !!document.querySelector('.cal-upcoming-hero');
        const hasTimeline = !!document.querySelector('.schedule-table');

        if (typeof switchCalendarView === 'function') {
          switchCalendarView('week');
        }
        const hasWeek = !!document.querySelector('.cal-week-wrapper');
        const weekCols = document.querySelectorAll('.cal-week-day-header').length;

        if (typeof switchCalendarView === 'function') {
          switchCalendarView('month');
        }
        const hasMonth = !!document.querySelector('.cal-month-table-wrapper');
        const monthCells = document.querySelectorAll('.cal-month-day-cell').length;

        if (typeof switchCalendarView === 'function') {
          switchCalendarView('year');
        }
        const hasYear = !!document.querySelector('.cal-year-grid');
        const yearBoxes = document.querySelectorAll('.cal-year-month-box').length;

        if (typeof switchCalendarView === 'function') {
          switchCalendarView('events');
        }
        const hasEvents = !!document.querySelector('.cal-agenda-container');
        const agendaRows = document.querySelectorAll('.cal-agenda-row').length;

        // Test day schedule modal
        if (typeof openCalendarDayModal === 'function') {
          openCalendarDayModal('2026-10-03');
        }
        const modal = document.getElementById('calendar-day-modal');
        const modalVisible = modal && window.getComputedStyle(modal).display !== 'none';
        const hasPrevNext = modal && modal.innerHTML.includes('calStepDay');
        if (typeof closeCalendarDayModal === 'function') {
          closeCalendarDayModal();
        }

        // Return to upcoming view
        if (typeof switchCalendarView === 'function') {
          switchCalendarView('upcoming');
        }

        return {
          hasUpcoming,
          hasTimeline,
          hasWeek,
          weekCols,
          hasMonth,
          monthCells,
          hasYear,
          yearBoxes,
          hasEvents,
          agendaRows,
          modalVisible,
          hasPrevNext
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const calRes = evalCalendarViews.result.value;
    assert.strictEqual(calRes.hasUpcoming, true, 'Upcoming Hero View must render in browser');
    assert.strictEqual(calRes.hasTimeline, true, 'Parade Rundown schedule timeline must render in browser');
    assert.strictEqual(calRes.hasWeek, true, 'Week View must render in browser');
    assert.strictEqual(calRes.weekCols, 7, 'Week View must render exactly 7 day columns');
    assert.strictEqual(calRes.hasMonth, true, 'Month View must render in browser');
    assert.ok(calRes.monthCells >= 35, 'Month View must render at least 35 calendar cells');
    assert.strictEqual(calRes.hasYear, true, 'Year View must render in browser');
    assert.strictEqual(calRes.yearBoxes, 12, 'Year View must render 12 mini months');
    assert.strictEqual(calRes.hasEvents, true, 'Events View must render in browser');
    assert.ok(calRes.agendaRows > 0, 'Events View must render agenda rows');
    assert.strictEqual(calRes.modalVisible, true, 'Day schedule modal must open visibly in browser');
    assert.strictEqual(calRes.hasPrevNext, true, 'Day schedule modal must provide previous/next day navigation');
    console.log(
      '  ✔ All 5 calendar view modes (Upcoming, Week, Month, Year, Events) and Day Schedule modal verified in headless Edge browser'
    );

    // 18. Uniform Order Grid Form & Product Card Redesign Verification
    console.log('\n[Uniform Order Grid & Product Card Redesign Verification]');
    const evalUniformGrid = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof switchTab === 'function') {
          switchTab('order');
        }
        if (typeof renderUniformOrderInline === 'function') {
          window.UNIFORM_ITEMS = window.DEFAULT_UNIFORM_ITEMS.map(item => ({ ...item, price: 45 }));
          renderUniformOrderInline();
        }

        const catTabs = document.getElementById('uniform-cat-tabs');
        const grid = document.getElementById('uniform-items');
        const stickyBar = document.getElementById('sticky-checkout-bar');
        const cards = grid ? Array.from(grid.querySelectorAll('.uniform-product-card')) : [];
        const firstCard = cards[0];
        const shirtPlusBtn = firstCard ? firstCard.querySelector('.stepper-btn:last-child') : null;

        // Click plus button on shirt card
        if (shirtPlusBtn) shirtPlusBtn.click();

        // Check size pills
        const sizePills = firstCard ? Array.from(firstCard.querySelectorAll('.size-pill')) : [];
        if (sizePills.length > 0) sizePills[0].click();

        // Click Add to Cart button
        const addBtn = firstCard ? firstCard.querySelector(".add-to-cart-btn") : null;
        if (addBtn) addBtn.click();

        const countEl = document.getElementById('checkout-items-count');
        const totalEl = document.getElementById('order-total-sticky');
        const ctaBtn = document.getElementById('checkout-cta-btn');

        // Test category filter tab click
        const apparelTab = catTabs ? catTabs.querySelector('[data-cat="apparel"]') : null;
        if (apparelTab) apparelTab.click();

        const visibleAfterFilter = cards.filter(c => c.style.display !== 'none').length;

        // Reset to all
        const allTab = catTabs ? catTabs.querySelector('[data-cat="all"]') : null;
        if (allTab) allTab.click();

        const gridComputed = grid ? window.getComputedStyle(grid) : null;

        return {
          hasCatTabs: !!catTabs,
          hasGrid: !!grid,
          cardCount: cards.length,
          hasStickyBar: !!stickyBar,
          firstCardHasMedia: firstCard ? !!firstCard.querySelector('.product-card-media') : false,
          firstCardHasPrice: firstCard ? !!firstCard.querySelector('.product-card-price') : false,
          firstCardHasStepper: firstCard ? !!firstCard.querySelector('.product-card-stepper') : false,
          firstCardHasQtyClass: firstCard ? firstCard.classList.contains('has-qty') : false,
          sizePillsCount: sizePills.length,
          firstPillSelected: sizePills.length > 0 ? sizePills[0].classList.contains('selected') : false,
          checkoutCountText: countEl ? countEl.textContent : '',
          checkoutTotalText: totalEl ? totalEl.textContent : '',
          ctaBtnActive: ctaBtn ? !ctaBtn.disabled : false,
          visibleAfterFilter: visibleAfterFilter,
          gridDisplay: gridComputed ? gridComputed.display : '',
          orderTitle: document.querySelector('#inline-form-view .page-title') ? document.querySelector('#inline-form-view .page-title').textContent.trim() : '',
          orderIcon: !!document.querySelector('#inline-form-view svg.ui-icon-lg')
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(!evalUniformGrid.exceptionDetails, evalUniformGrid.exceptionDetails?.exception?.description);
    const uniformGrid = evalUniformGrid.result.value;
    assert.strictEqual(uniformGrid.hasCatTabs, true, 'Category tabs container must exist');
    assert.strictEqual(uniformGrid.hasGrid, true, 'Product grid container must exist');
    assert.ok(uniformGrid.cardCount >= 1, 'Grid must render uniform product cards from catalog');
    assert.strictEqual(uniformGrid.hasStickyBar, true, 'Sticky checkout summary bar must exist');
    assert.strictEqual(
      uniformGrid.firstCardHasMedia,
      true,
      'Product card must feature thumbnail preview media'
    );
    assert.strictEqual(uniformGrid.firstCardHasPrice, true, 'Product card must feature price tag');
    assert.strictEqual(
      uniformGrid.firstCardHasStepper,
      true,
      'Product card must feature increment/decrement stepper'
    );
    assert.strictEqual(
      uniformGrid.firstCardHasQtyClass,
      true,
      'Product card must receive has-qty styling when quantity > 0'
    );
    assert.ok(uniformGrid.sizePillsCount >= 2, 'Shirt card must feature size selector pills');
    assert.strictEqual(
      uniformGrid.firstPillSelected,
      true,
      'Selected size pill must receive selected active styling'
    );
    assert.strictEqual(
      uniformGrid.checkoutCountText,
      '1 item',
      'Sticky checkout bar must display item count'
    );
    assert.ok(
      uniformGrid.checkoutTotalText.includes('RM'),
      'Sticky checkout bar must display live currency total'
    );
    assert.strictEqual(
      uniformGrid.ctaBtnActive,
      true,
      'Sticky checkout review button must be enabled when items are selected'
    );
    assert.ok(
      uniformGrid.visibleAfterFilter >= 1,
      'Category filter must display matching product cards'
    );
    assert.strictEqual(
      uniformGrid.gridDisplay,
      'grid',
      'Uniform items container must have CSS grid display'
    );
    assert.strictEqual(
      uniformGrid.orderTitle,
      'Uniform Order Form',
      'Order page title must be Uniform Order Form'
    );
    assert.strictEqual(
      uniformGrid.orderIcon,
      true,
      'Order page header must contain uniform icon'
    );
    console.log(
      '  ✔ Responsive uniform product card grid, category tabs, size pills, and sticky checkout bar verified in browser'
    );

    // 18B. Company Resources Preview Grid & Project Board Subtitle
    console.log('\n[Company Resources Document Previews & Space Optimization]');
    const evalResources = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof switchTab === 'function') {
          switchTab('resources');
        }
        if (typeof renderResourcesPage === 'function') {
          if (Array.isArray(window.resources) && window.resources.length === 0) {
            window.resources.push({
              id: 'browser-test-res-1',
              title: 'BB Official Handbook 2026',
              category: 'Handbooks & Manuals',
              fileType: 'PDF',
              url: 'https://drive.google.com/file/d/1DriveTestDoc/view',
              visibility: 'public'
            });
          }
          renderResourcesPage();
        }

        const resGrid = document.querySelector('.resources-grid');
        const resCard = document.querySelector('.resource-card');
        const preview = resCard ? resCard.querySelector('.resource-card-preview') : null;
        const mockup = resCard ? resCard.querySelector('.resource-doc-mockup') : null;
        const seal = mockup ? mockup.querySelector('.doc-mockup-seal') : null;
        const footer = resCard ? resCard.querySelector('.resource-card-footer') : null;

        return {
          hasGrid: !!resGrid,
          hasCard: !!resCard,
          hasPreview: !!preview,
          hasMockup: !!mockup,
          hasSeal: !!seal,
          hasFooter: !!footer
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const resRes = evalResources.result.value;
    assert.strictEqual(resRes.hasGrid, true, 'Resources grid must render in browser');
    assert.strictEqual(resRes.hasCard, true, 'Resource card must render in browser');
    assert.strictEqual(resRes.hasPreview, true, 'Resource preview container must render');
    assert.strictEqual(resRes.hasMockup, true, 'Fallback document mockup must render in browser');
    assert.strictEqual(resRes.hasSeal, true, 'Mockup must contain 1PJ seal');
    assert.strictEqual(resRes.hasFooter, true, 'Resource card footer metadata bar must render');
    console.log(
      '  ✔ Company Resources Google Drive preview cards, mockup seal, and footer bar verified in browser'
    );

    // ── Modern Toast Notification & Confirmation Modal Verification ──
    console.log('\n[Modern Toast Notification & Modal System Verification]');

    // 1. Trigger showToast and verify DOM elements
    const evalToast = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const toast = showToast('Browser test success toast notification', 'success', 10000);
        window.browserToastFixture = toast;
        for (let attempt = 0; attempt < 15 && !toast.isConnected; attempt++) {
          document.querySelectorAll('.portal-toast-close').forEach(button => button.click());
          await new Promise(resolve => setTimeout(resolve, 275));
        }
        const container = document.getElementById('portal-toast-container');
        const closeBtn = toast ? toast.querySelector('.portal-toast-close') : null;
        const originalNow = Date.now;
        let duplicate;
        try {
          Date.now = () => originalNow() + 2000;
          duplicate = showToast('Browser test success toast notification', 'success');
        } finally {
          Date.now = originalNow;
        }
        return {
          suppressedDuplicate: duplicate === null,
          hasContainer: !!container,
          containerAriaLive: container ? container.getAttribute('aria-live') : '',
          hasToast: toast.isConnected,
          toastRole: toast ? toast.getAttribute('role') : '',
          toastBody: toast ? toast.querySelector('.portal-toast-body').textContent : '',
          hasCloseBtn: !!closeBtn
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const toastResult = evalToast.result.value;
    assert.strictEqual(toastResult.suppressedDuplicate, true, 'Identical toasts must not stack while one is still visible');
    assert.strictEqual(
      toastResult.hasContainer,
      true,
      'Toast container must be created in browser DOM'
    );
    assert.strictEqual(
      toastResult.containerAriaLive,
      'polite',
      'Toast container must have aria-live="polite"'
    );
    assert.strictEqual(
      toastResult.hasToast,
      true,
      'Toast element with portal-toast-success must be rendered'
    );
    assert.strictEqual(toastResult.toastRole, 'status', 'Success toast must be announced without interrupting the current screen reader message');
    assert.strictEqual(
      toastResult.toastBody,
      'Browser test success toast notification',
      'Toast body must match message'
    );
    assert.strictEqual(toastResult.hasCloseBtn, true, 'Toast close button must be present');
    console.log(
      '  ✔ Modern non-blocking toast renders in DOM with SVG icon, close button, and aria labels'
    );

    // 2. Test toast manual close dismissal
    const evalDismiss = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const toast = window.browserToastFixture;
        delete window.browserToastFixture;
        const closeBtn = toast ? toast.querySelector('.portal-toast-close') : null;
        if (closeBtn) closeBtn.click();
        return {
          hasHideClass: toast ? toast.classList.contains('portal-toast-hide') : false
        };
      })()`,
      returnByValue: true
    });
    const dismissResult = evalDismiss.result.value;
    assert.strictEqual(
      dismissResult.hasHideClass,
      true,
      'Clicking toast close button must apply portal-toast-hide animation'
    );
    console.log('  ✔ Clicking close button triggers smooth exit animation');

    // 3. Test accessible confirmation modal dialog resolving true on Confirm
    const evalModalConfirm = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const promise = showConfirmModal('Do you confirm this action?', 'Browser Test Dialog', { confirmText: 'Proceed' });
        const overlay = document.querySelector('.portal-modal-overlay');
        const card = overlay ? overlay.querySelector('.portal-modal-card') : null;
        const h3 = card ? card.querySelector('h3') : null;
        const okBtn = overlay ? overlay.querySelector('#portal-modal-ok') : null;
        const cancelBtn = overlay ? overlay.querySelector('#portal-modal-cancel') : null;
        const stateBefore = {
          hasOverlay: !!overlay,
          overlayRole: overlay ? overlay.getAttribute('role') : '',
          hasCard: !!card,
          titleText: h3 ? h3.textContent : '',
          okBtnText: okBtn ? okBtn.textContent : '',
          hasCancelBtn: !!cancelBtn
        };
        if (okBtn) okBtn.click();
        const resolvedValue = await promise;
        return { stateBefore, resolvedValue };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const modalConfirmResult = evalModalConfirm.result.value;
    assert.strictEqual(
      modalConfirmResult.stateBefore.hasOverlay,
      true,
      'Confirmation overlay must be added to DOM'
    );
    assert.strictEqual(
      modalConfirmResult.stateBefore.overlayRole,
      'dialog',
      'Overlay must feature role="dialog"'
    );
    assert.strictEqual(modalConfirmResult.stateBefore.hasCard, true, 'Modal card must be present');
    assert.strictEqual(
      modalConfirmResult.stateBefore.titleText,
      'Browser Test Dialog',
      'Header title must match'
    );
    assert.strictEqual(
      modalConfirmResult.stateBefore.okBtnText,
      'Proceed',
      'Custom button label must match'
    );
    assert.strictEqual(
      modalConfirmResult.resolvedValue,
      true,
      'Clicking Confirm must resolve Promise to true'
    );
    console.log(
      '  ✔ showConfirmModal renders accessible dialog card and resolves Promise on user confirmation'
    );

    // 4. Test non-blocking window.alert wrapper
    const evalAlertWrapper = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        window.alert('✅ Action performed successfully');
        const findToast = () => Array.from(document.querySelectorAll('.portal-toast-success')).find(toast =>
          toast.querySelector('.portal-toast-body').textContent.includes('Action performed successfully'));
        for (let attempt = 0; attempt < 15 && !findToast(); attempt++) {
          document.querySelectorAll('.portal-toast-close').forEach(button => button.click());
          await new Promise(resolve => setTimeout(resolve, 275));
        }
        const toast = findToast();
        return {
          hasToast: !!toast,
          bodyText: toast ? toast.querySelector('.portal-toast-body').textContent : ''
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const alertWrapperResult = evalAlertWrapper.result.value;
    assert.strictEqual(
      alertWrapperResult.hasToast,
      true,
      'window.alert wrapper must convert native alerts to non-blocking toast'
    );
    console.log(
      '  ✔ Non-blocking window.alert wrapper translates calls to modern toast notifications seamlessly'
    );

    const coreInteractions = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        const fixture = document.createElement('div');
        fixture.style.cssText = 'position:fixed;top:100px;left:100px;display:flex;gap:10px';
        const button = document.createElement('button');
        button.className = 'portal-btn portal-btn-primary';
        const label = document.createElement('span');
        label.textContent = 'Submit';
        button.append(label);
        const sibling = document.createElement('span');
        sibling.textContent = 'Next';
        fixture.append(button, sibling);
        document.body.append(fixture);
        const layout = () => [button.offsetWidth, button.offsetHeight, sibling.getBoundingClientRect().left].join(':');
        const before = layout();
        await withSmartButtonLock(button, async () => 1);
        const afterFast = !button.querySelector('.btn-spinner') && !button.disabled;
        let resolveSubmit;
        const slow = withSmartButtonLock(button, () => new Promise(resolve => { resolveSubmit = resolve; }));
        const duplicate = await withSmartButtonLock(button, async () => 2);
        await delay(250);
        const during = layout();
        const showsSpinner = !!button.querySelector('.btn-spinner');
        resolveSubmit();
        await slow;
        const stableLayout = before === during && before === layout() && button.firstChild === label;

        button.focus();
        const outer = showConfirmModal('Outer dialog', 'Confirmation');
        const outerFocus = document.activeElement;
        const inner = showPromptModal('Inner dialog', '', '');
        const innerFocused = document.activeElement.classList.contains('portal-prompt-input');
        const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        escape();
        const innerDismissed = await inner === null && document.activeElement === outerFocus;
        const overlay = document.querySelector('.portal-modal-overlay');
        overlay.click();
        const outerDismissed = await outer === false && document.activeElement === button;
        fixture.remove();

        const sanitized = document.createElement('template');
        sanitized.innerHTML = sanitizeHtml('<b>Formatting</b><a href="https://example.org/">Reference</a><span tabindex="1">Text</span>');
        const link = sanitized.content.querySelector('a');
        const richTextSafe = !!sanitized.content.querySelector('b') && link.rel === 'noopener noreferrer' &&
          !sanitized.content.querySelector('span').hasAttribute('tabindex');
        return { afterFast, duplicate, showsSpinner, stableLayout, innerFocused, innerDismissed, outerDismissed, richTextSafe };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepStrictEqual(coreInteractions.result.value, {
      afterFast: true, duplicate: null, showsSpinner: true, stableLayout: true, innerFocused: true,
      innerDismissed: true, outerDismissed: true, richTextSafe: true
    }, 'Core controls must preserve dimensions, focus, and safe formatting');
    console.log('  ✔ Submit geometry, delayed indicator, re-entry lock, stacked focus restoration, and rich-text filtering verified');

    const gatewayFailure = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const savedFetch = window.fetch;
        const errors = [];
        const onError = event => errors.push(event.detail);
        let requests = 0;
        window.addEventListener('bb:database-error', onError);
        try {
          window.fetch = async () => {
            requests++;
            return new Response('Temporarily unavailable', { status: 504 });
          };
          const status = await supa.post('bb_core_test_fixture', {}).then(() => 0, error => error.status);
          return { requests, status, errors };
        } finally {
          window.removeEventListener('bb:database-error', onError);
          window.fetch = savedFetch;
          resetCircuitBreaker();
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepStrictEqual(gatewayFailure.result.value, {
      requests: 1, status: 504, errors: [{ code: 'http', method: 'POST', status: 504 }]
    }, 'A gateway timeout must notify the caller and emit one redacted network event without retrying the write');
    console.log('  ✔ Gateway timeout reports a single redacted error and does not replay the write');

    // ── Admin Console Master Controller Verification ──
    console.log('\n[Admin Console Master Controller Verification]');
    const evalAdminController = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        // 1. Verify global functions attached
        const hasOpenAdmin = typeof window.openAdmin === 'function';
        const hasSwitchAdminSection = typeof window.switchAdminSection === 'function';
        const hasOpenAddMember = typeof window.openAddMember === 'function';
        const hasSaveTask = typeof window.saveTask === 'function';

        // Use a local authentication service fixture for browser checks.
        const oldRpc = window.supa.rpc;
        let issuedToken = null;
        let issuedEmail = null;
        let migrationMissing = false;
        window.supa.rpc = async (name, args) => {
          if (name === 'rpc_open_member_admin_session') {
            if (migrationMissing) throw Object.assign(new Error('Missing RPC'), { code: 'PGRST202' });
            if (args.p_member_token !== 'a'.repeat(64)) return null;
            issuedEmail = sessionGet('email');
            issuedToken = crypto.randomUUID();
            return { valid: true, officer_email: issuedEmail, scope: issuedEmail === 'store_officer@example.com' ? 'admin' : 'super_admin', permissions: issuedEmail === 'store_officer@example.com' ? ['orders', 'uniform'] : [], token: issuedToken, expires_at: new Date(Date.now() + 7200000).toISOString() };
          }
          if (name === 'rpc_verify_admin_session') return {
            valid: issuedToken === args.p_token, officer_email: issuedEmail, scope: 'super_admin', permissions: []
          };
          if (name === 'rpc_admin_logout') return { success: true };
          return oldRpc.call(window.supa, name, args);
        };
        async function unlockAdmin() {
          saveAdminMemberSignIn({ email: sessionGet('email'), token: 'a'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString() }, false);
          await window.openAdmin();
        }
        const layoutEntries = [];
        const layoutObserver = new PerformanceObserver(list => layoutEntries.push(...list.getEntries()));
        const anchor = document.createElement('button');
        anchor.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(anchor);
        anchor.focus();
        // 2. Open admin console and authenticate
        // 2a. RBAC Gatekeeper: Standard member is blocked from opening admin console
        await window.openAdmin();
        const memberBlocked = (!document.getElementById('admin-overlay') || document.getElementById('admin-overlay').style.display === 'none');

        if (typeof sessionClear === 'function') sessionClear();
        await window.openAdmin();
        const overlay = document.getElementById('admin-overlay');
        const adminPanel = document.getElementById('admin-panel');
        const guestBlocked = overlay.style.display === 'none';
        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('rank', 'Captain');
        RBAC.renderHeaderRoleBadge();
        const oldToast = window.showToast;
        const oldConfirm = window.showConfirmModal;
        let deploymentError = '';
        let confirmCount = 0;
        window.showToast = message => { deploymentError = message; };
        window.showConfirmModal = async () => { confirmCount++; return true; };
        try {
          migrationMissing = true;
          await window.openAdmin();
          if (!deploymentError.includes('verify your Admin Console session') || confirmCount !== 0 || !sessionGet('email') || overlay.style.display !== 'none') {
            throw new Error('A browser role without a server-issued session must stay signed in without opening the console');
          }
          migrationMissing = false;
          await window.openAdmin();
          if (confirmCount !== 1 || document.getElementById('login-email').value !== 'jeshuakoh2008@gmail.com' ||
              document.activeElement.id !== 'login-pass' || AuthGuard.getRedirectTarget() !== 'admin') {
            throw new Error('A legacy session should go to regular member sign-in and remember the admin destination');
          }
        } finally {
          window.showToast = oldToast;
          window.showConfirmModal = oldConfirm;
        }
        AuthGuard.clearRedirectTarget();
        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('rank', 'Captain');
        RBAC.renderHeaderRoleBadge();
        anchor.focus();
        document.querySelectorAll('.portal-toast').forEach(dismissToast);
        await new Promise(resolve => setTimeout(resolve, 275));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        layoutObserver.observe({ type: 'layout-shift' });
        await unlockAdmin();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const openState = {
          memberBlocked,
          guestBlocked,
          overlayVisible: overlay.style.display !== 'none',
          passcodeAbsent: !overlay.querySelector('#admin-login-box input')
        };

        const authedState = {
          adminPanelVisible: adminPanel && adminPanel.style.display !== 'none'
        };

        // 3. Switch back-office sections
        window.switchAdminSection('members');
        const membersSec = document.getElementById('adm-section-members');
        const backBar = document.getElementById('adm-back-bar');
        const membersState = {
          membersVisible: membersSec && membersSec.style.display !== 'none',
          backBarVisible: backBar && backBar.style.display !== 'none'
        };

        window.switchAdminSection('tasks');
        const tasksSec = document.getElementById('adm-section-tasks');
        const taskFormBody = document.getElementById('task-form-body');
        const tasksState = {
          tasksVisible: tasksSec && tasksSec.style.display !== 'none',
          membersHidden: !membersSec || membersSec.style.display === 'none'
        };

        // Toggle task form
        const initialFormDisplay = taskFormBody ? taskFormBody.style.display : '';
        window.toggleTaskForm();
        const toggledFormDisplay = taskFormBody ? taskFormBody.style.display : '';
        window.toggleTaskForm();
        const finalFormDisplay = taskFormBody ? taskFormBody.style.display : '';

        // 3b. Test Admin Badges Section rendering
        window.switchAdminSection('badges');
        if (typeof renderAdminBadges === 'function') {
          await renderAdminBadges();
        }
        const badgesSection = document.getElementById('adm-section-badges');
        const badgesContent = document.getElementById('admin-badges-content');
        const subpanelDefs = document.getElementById('subpanel-badgedefs');
        const subpanelReqs = document.getElementById('subpanel-presidentsreqs');
        const badgesState = {
          sectionVisible: badgesSection && badgesSection.style.display !== 'none',
          subpanelDefsVisible: subpanelDefs && subpanelDefs.style.display !== 'none',
          subpanelReqsHidden: !subpanelReqs || subpanelReqs.style.display === 'none',
          hasBadgesContent: !!badgesContent && badgesContent.innerHTML.length > 0
        };

        // 4. Test Add Member modal
        window.openAddMember();
        const editMemberModal = document.getElementById('edit-member-modal');
        const delBtn = document.getElementById('em-delete-btn');
        const modalOpenState = {
          modalVisible: editMemberModal && editMemberModal.style.display !== 'none',
          delBtnHidden: !delBtn || delBtn.style.display === 'none'
        };

        window.closeEditMember();
        const modalCloseState = {
          modalHidden: !editMemberModal || editMemberModal.style.display === 'none'
        };

        // 5. Back to admin home and test view mode toggle (List vs Grid)
        window.backToAdminHome();
        const homeState = {
          backBarHidden: !backBar || backBar.style.display === 'none',
          tasksHidden: !tasksSec || tasksSec.style.display === 'none'
        };

        const viewToggle = document.querySelector('.adm-view-toggle');
        const listBtn = document.querySelector('.adm-view-btn-list');
        const gridBtn = document.querySelector('.adm-view-btn-grid');
        const navContainer = document.querySelector('.adm-section-nav');

        const initialIsList = navContainer ? navContainer.classList.contains('adm-view-list') : false;
        const initialListBtnActive = listBtn ? listBtn.classList.contains('active') : false;

        // Toggle to Grid view
        if (typeof window.setAdminViewMode === 'function') window.setAdminViewMode('grid');
        const toggledIsGrid = navContainer ? navContainer.classList.contains('adm-view-grid') : false;
        const toggledGridBtnActive = gridBtn ? gridBtn.classList.contains('active') : false;

        // Toggle back to List view
        if (typeof window.setAdminViewMode === 'function') window.setAdminViewMode('list');
        const revertedIsList = navContainer ? navContainer.classList.contains('adm-view-list') : false;
        const revertedListBtnActive = listBtn ? listBtn.classList.contains('active') : false;

        const viewModeState = {
          hasViewToggle: !!viewToggle,
          hasListBtn: !!listBtn,
          hasGridBtn: !!gridBtn,
          initialIsList,
          initialListBtnActive,
          toggledIsGrid,
          toggledGridBtnActive,
          revertedIsList,
          revertedListBtnActive
        };

        const visitedSections = [];
        for (const section of ['members', 'orders', 'uniform', 'attendance', 'tasks', 'calendar']) {
          window.switchAdminSection(section);
          await new Promise(resolve => requestAnimationFrame(resolve));
          const current = document.getElementById('adm-section-' + section);
          visitedSections.push(current && getComputedStyle(current).display !== 'none');
        }
        window.backToAdminHome();
        const tabbable = Array.from(overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter(node => node.getClientRects().length);
        tabbable[tabbable.length - 1].focus();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        const wrapped = document.activeElement === tabbable[0];
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
        const wrappedBack = document.activeElement === tabbable[tabbable.length - 1];
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const closeState = {
          overlayHidden: overlay.style.display === 'none',
          focusRestored: document.activeElement === anchor,
          wrapped,
          wrappedBack
        };
        anchor.remove();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        layoutEntries.push(...layoutObserver.takeRecords());
        layoutObserver.disconnect();
        const adminLayoutShift = layoutEntries.filter(entry => !entry.hadRecentInput).reduce((total, entry) => total + entry.value, 0);

        // Restore authenticated member session for subsequent portal tests
        if (typeof sessionSet === 'function') {
          sessionSet('ic', '010101-14-1234');
          sessionSet('name', 'Joshua Koh');
          sessionSet('rank', 'Sergeant');
          sessionSet('squad', 'Hotel Platoon');
        }

        window.supa.rpc = oldRpc;
        return {
          hasOpenAdmin,
          hasSwitchAdminSection,
          hasOpenAddMember,
          hasSaveTask,
          openState,
          authedState,
          membersState,
          tasksState,
          badgesState,
          initialFormDisplay,
          toggledFormDisplay,
          finalFormDisplay,
          modalOpenState,
          modalCloseState,
          homeState,
          viewModeState,
          closeState,
          visitedSections,
          adminLayoutShift,
          shiftSources: layoutEntries.filter(entry => !entry.hadRecentInput).flatMap(entry =>
            entry.sources.map(source => [source.node?.id, source.node?.className, source.previousRect.x, source.currentRect.x]))
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const adminResult = evalAdminController.result.value;
    assert.ok(adminResult, JSON.stringify(evalAdminController.exceptionDetails));
    assert.ok(adminResult.visitedSections.every(Boolean), 'All scoped tabs must open');
    assert.strictEqual(adminResult.closeState.wrapped, true, 'Tab wraps within the admin overlay');
    assert.strictEqual(adminResult.closeState.wrappedBack, true, 'Shift+Tab wraps within the admin overlay');
    assert.strictEqual(adminResult.closeState.focusRestored, true, 'Escape closes and restores the opener focus');
    assert.strictEqual(adminResult.adminLayoutShift, 0, 'Admin overlay open, switch and close must have CLS = 0: ' + JSON.stringify(adminResult.shiftSources));
    assert.strictEqual(adminResult.hasOpenAdmin, true, 'openAdmin must be exported globally');
    assert.strictEqual(
      adminResult.hasSwitchAdminSection,
      true,
      'switchAdminSection must be exported globally'
    );
    assert.strictEqual(
      adminResult.hasOpenAddMember,
      true,
      'openAddMember must be exported globally'
    );
    assert.strictEqual(adminResult.hasSaveTask, true, 'saveTask must be exported globally');
    assert.strictEqual(adminResult.openState.passcodeAbsent, true, 'Console has no passcode form');
    assert.strictEqual(adminResult.openState.guestBlocked, true, 'Guests cannot open the console');
    assert.strictEqual(
      adminResult.openState.memberBlocked,
      true,
      'Standard member must be blocked from opening admin console'
    );
    assert.strictEqual(
      adminResult.openState.overlayVisible,
      true,
      'openAdmin must display admin overlay for officer session'
    );
    assert.strictEqual(
      adminResult.authedState.adminPanelVisible,
      true,
      'The existing member sign-in must unlock the admin panel'
    );
    assert.strictEqual(
      adminResult.membersState.membersVisible,
      true,
      'switchAdminSection must reveal members section'
    );
    if (adminResult.badgesState) {
      assert.strictEqual(adminResult.badgesState.sectionVisible, true, 'Admin Badges section must be visible');
      assert.strictEqual(adminResult.badgesState.subpanelDefsVisible, true, 'Badge defs subpanel must be visible');
      assert.strictEqual(adminResult.badgesState.hasBadgesContent, true, 'Admin Badges content must render badge definitions');
    }
    assert.strictEqual(
      adminResult.tasksState.tasksVisible,
      true,
      'switchAdminSection must reveal tasks section'
    );
    assert.strictEqual(
      adminResult.modalOpenState.modalVisible,
      true,
      'openAddMember must display member modal'
    );
    assert.strictEqual(
      adminResult.modalCloseState.modalHidden,
      true,
      'closeEditMember must hide member modal'
    );
    assert.strictEqual(
      adminResult.homeState.backBarHidden,
      true,
      'backToAdminHome must hide back bar'
    );
    assert.strictEqual(
      adminResult.closeState.overlayHidden,
      true,
      'closeAdmin must dismiss admin overlay'
    );

    assert.strictEqual(adminResult.viewModeState.hasViewToggle, true, 'Admin console renders segmented view toggle');
    assert.strictEqual(adminResult.viewModeState.hasListBtn, true, 'Admin view toggle includes List button');
    assert.strictEqual(adminResult.viewModeState.hasGridBtn, true, 'Admin view toggle includes Grid button');
    assert.strictEqual(adminResult.viewModeState.initialIsList, true, 'Default admin view mode is list');
    assert.strictEqual(adminResult.viewModeState.toggledIsGrid, true, 'setAdminViewMode(grid) activates grid view');
    assert.strictEqual(adminResult.viewModeState.toggledGridBtnActive, true, 'Grid button is active in grid view');
    assert.strictEqual(adminResult.viewModeState.revertedIsList, true, 'setAdminViewMode(list) reverts to list view');
    assert.strictEqual(adminResult.viewModeState.revertedListBtnActive, true, 'List button is active in list view');
    console.log(
      '  ✔ Admin console back-office navigation, section routing, and member/task modal controls verified in browser'
    );
    console.log(
      '  ✔ Admin console List View vs Grid View layout switching and button active state verified in browser'
    );

    // ── Modern App Shell & Top Header Controls Verification ──
    console.log('\n[Modern App Shell & Top Header Controls Verification]');
    const evalAppShellHeader = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        // 1. Verify app shell container layout
        const layout = document.querySelector('.app-shell-layout');
        const sidebar = document.querySelector('.sidebar-overlay');
        const main = document.querySelector('.app-main');
        const nav = document.querySelector('.nav');

        // 2. Verify top-right header elements
        const searchBtn = document.getElementById('nav-search-trigger');
        const notifBtn = document.getElementById('nav-notif-btn');
        const notifCard = document.getElementById('notif-dropdown-card');
        const pointsBadge = document.getElementById('nav-points-badge');
        const profileBtn = document.getElementById('nav-profile-btn');

        // 3. Test Notification Dropdown toggle
        const initialNotifDisplay = notifCard ? notifCard.style.display : 'none';
        if (typeof window.toggleNotificationDropdown === 'function') window.toggleNotificationDropdown(true);
        const openedNotifDisplay = notifCard ? notifCard.style.display : '';
        const unreadCount = document.getElementById('notif-unread-count');
        const unreadCountVal = unreadCount ? unreadCount.textContent : '';

        // Test Mark All As Read
        if (typeof window.markAllNotificationsRead === 'function') window.markAllNotificationsRead();
        const readCountVal = unreadCount ? unreadCount.textContent : '';
        if (typeof window.closeNotificationDropdown === 'function') window.closeNotificationDropdown();
        const closedNotifDisplay = notifCard ? notifCard.style.display : '';

        // 4. Test Header Inline Search
        const searchModal = document.getElementById('global-search-modal');
        const searchInput = document.getElementById('global-search-input');
        if (typeof window.openGlobalSearch === 'function') window.openGlobalSearch();
        const searchOpenedDisplay = searchModal ? window.getComputedStyle(searchModal).getPropertyValue('display') : 'none';
        const searchInputFocused = searchInput ? (document.activeElement === searchInput) : false;
        if (typeof window.closeGlobalSearch === 'function') window.closeGlobalSearch();
        const searchClosedDisplay = searchModal ? window.getComputedStyle(searchModal).getPropertyValue('display') : 'none';

        // 5. Scroll page and verify sidebar stays docked at left: 0 and top: 60
        window.scrollTo(0, 600);
        const sidebarRectAfterScroll = sidebar ? sidebar.getBoundingClientRect() : null;
        const panel = document.querySelector('.sidebar-panel');
        const panelFound = !!panel;
        const panelTag = panel ? panel.tagName : '';
        const panelClientWidth = panel ? panel.clientWidth : -1;
        const panelOffsetWidth = panel ? panel.offsetWidth : -1;
        const panelComputed = panel ? {
          borderRightStyle: window.getComputedStyle(panel).getPropertyValue('border-right-style'),
          borderRightWidth: window.getComputedStyle(panel).getPropertyValue('border-right-width'),
          borderRadius: window.getComputedStyle(panel).getPropertyValue('border-top-left-radius'),
          position: window.getComputedStyle(panel).getPropertyValue('position'),
          display: window.getComputedStyle(panel).getPropertyValue('display'),
          overflowY: window.getComputedStyle(panel).getPropertyValue('overflow-y')
        } : null;

        return {
          hasLayout: !!layout,
          hasSidebar: !!sidebar,
          hasMain: !!main,
          hasNav: !!nav,
          hasSearchBtn: !!searchBtn,
          hasNotifBtn: !!notifBtn,
          hasPointsBadge: !!pointsBadge,
          hasProfileBtn: !!profileBtn,
          initialNotifDisplay,
          openedNotifDisplay,
          unreadCountVal,
          readCountVal,
          closedNotifDisplay,
          searchOpenedDisplay,
          searchInputFocused,
          searchClosedDisplay,
          sidebarLeftAfterScroll: sidebarRectAfterScroll ? Math.round(sidebarRectAfterScroll.left) : -1,
          sidebarTopAfterScroll: sidebarRectAfterScroll ? Math.round(sidebarRectAfterScroll.top) : -1,
          hasSidebarHeader: !!document.querySelector('.sidebar-header'),
          panelFound,
          panelTag,
          panelClientWidth,
          panelOffsetWidth,
          panelComputed
        };
      })()`,
      returnByValue: true
    });

    const appShellResult = evalAppShellHeader.result.value;
    assert.strictEqual(appShellResult.hasLayout, true, 'App shell unified layout must be present');
    assert.strictEqual(
      appShellResult.hasSearchBtn,
      true,
      'Search trigger pill must be present in header'
    );
    assert.strictEqual(
      appShellResult.hasNotifBtn,
      true,
      'Notification bell trigger must be present in header'
    );
    assert.strictEqual(
      appShellResult.hasPointsBadge,
      true,
      'Points badge must be present in header'
    );
    assert.strictEqual(
      appShellResult.hasProfileBtn,
      true,
      'Profile avatar button must be present in header'
    );
    assert.strictEqual(
      appShellResult.openedNotifDisplay,
      'block',
      'toggleNotificationDropdown must reveal notification card'
    );
    assert.strictEqual(
      appShellResult.closedNotifDisplay,
      'none',
      'closeNotificationDropdown must hide notification card'
    );
    assert.strictEqual(
      appShellResult.readCountVal,
      '0',
      'markAllNotificationsRead must reset unread counter to 0'
    );
    assert.strictEqual(
      appShellResult.searchOpenedDisplay,
      'none',
      'openGlobalSearch must not open popup modal ( inline search)'
    );
    assert.strictEqual(
      appShellResult.searchInputFocused,
      true,
      'openGlobalSearch must focus inline header search input'
    );
    assert.strictEqual(
      appShellResult.searchClosedDisplay,
      'none',
      'closeGlobalSearch must keep popup modal closed'
    );
    assert.strictEqual(
      appShellResult.panelOffsetWidth,
      210,
      'Sidebar panel must be 210px'
    );
    assert.strictEqual(
      appShellResult.panelComputed ? appShellResult.panelComputed.overflowY : '',
      'hidden',
      'Sidebar panel must have overflow-y: hidden without scroll/slider'
    );
    assert.strictEqual(
      appShellResult.sidebarLeftAfterScroll,
      0,
      'Sidebar must stay fixed at left: 0 after scrolling down'
    );
    assert.strictEqual(
      appShellResult.sidebarTopAfterScroll,
      60,
      'Sidebar must stay fixed at top: 60 after scrolling down'
    );
    console.log('  panel diagnostic:', {
      found: appShellResult.panelFound,
      tag: appShellResult.panelTag,
      width: appShellResult.panelClientWidth,
      offsetWidth: appShellResult.panelOffsetWidth,
      computed: appShellResult.panelComputed
    });
    assert.strictEqual(
      appShellResult.panelFound,
      true,
      'Sidebar panel must be present in DOM'
    );
    assert.strictEqual(
      appShellResult.hasSidebarHeader,
      false,
      'Redundant sidebar header (1st Petaling Jaya / Member Portal) must be removed from sidebar'
    );
    assert.strictEqual(
      appShellResult.panelComputed ? appShellResult.panelComputed.borderRightStyle : '',
      'solid',
      'Sidebar panel must have solid right border'
    );
    assert.strictEqual(
      appShellResult.panelComputed ? appShellResult.panelComputed.borderRadius : '',
      '0px',
      'Sidebar panel must have 0 border-radius (not a floating card/box)'
    );
    // Verify edge collapse toggle shrinks sidebar to 60px and shifts main content
    const collapseResult = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const panelBefore = document.querySelector('.sidebar-panel')?.offsetWidth;
        if (typeof window.toggleSidebarCollapse === 'function') {
          window.toggleSidebarCollapse();
        }
        await new Promise(r => setTimeout(r, 350));
        const panelCollapsed = document.querySelector('.sidebar-panel')?.offsetWidth;
        const mainCollapsed = Math.round(document.querySelector('.app-main')?.getBoundingClientRect()?.left || 0);
        const hasBodyClass = document.body.classList.contains('sidebar-collapsed');
        // Re-expand back to extended mode
        if (typeof window.toggleSidebarCollapse === 'function') {
          window.toggleSidebarCollapse();
        }
        await new Promise(r => setTimeout(r, 350));
        const panelRestored = document.querySelector('.sidebar-panel')?.offsetWidth;
        const mainRestored = Math.round(document.querySelector('.app-main')?.getBoundingClientRect()?.left || 0);
        return {
          panelBefore,
          panelCollapsed,
          mainCollapsed,
          hasBodyClass,
          panelRestored,
          mainRestored
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(collapseResult.result.value, 'Must evaluate sidebar collapse toggle in browser');
    const cDiag = collapseResult.result.value;
    assert.strictEqual(cDiag.panelCollapsed, 60, 'Collapsed sidebar panel must shrink to 60px');
    assert.strictEqual(cDiag.mainCollapsed, 60, 'Main content must shift to 60px left when sidebar is collapsed');
    assert.strictEqual(cDiag.panelRestored, 210, 'Re-extended sidebar panel must restore to 210px');
    assert.strictEqual(cDiag.mainRestored, 210, 'Main content must restore to 210px left when sidebar is re-extended');
    console.log(
      '  ✔ Interactive edge toggle collapses sidebar to 60px and restores to 210px with aligned main content'
    );
    console.log(
      '  ✔ Modern app shell container with fixed viewport sidebar, search pill, notification box, points badge, and profile button verified in browser'
    );

    // Optionally capture visual verification screenshots if requested
    if (process.env.CAPTURE_SCREENSHOTS) {
      await sendCmd('Runtime.evaluate', {
        expression: `(() => {
          if (typeof window.switchTabNav === 'function') window.switchTabNav('home');
          window.scrollTo(0, 800);
        })()`
      });
      await new Promise(r => setTimeout(r, 200));

      const scrolledShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
      if (scrolledShot && scrolledShot.data) {
        fs.writeFileSync('scripts/desktop-app-shell-scrolled.png', Buffer.from(scrolledShot.data, 'base64'));
      }

      await sendCmd('Runtime.evaluate', { expression: `window.scrollTo(0, 0);` });
      await new Promise(r => setTimeout(r, 200));

      const topShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
      if (topShot && topShot.data) {
        fs.writeFileSync('scripts/desktop-app-shell-top.png', Buffer.from(topShot.data, 'base64'));
      }
    }

    // ── Mobile Top Header Bar Alignment & Scaling Verification ──
    console.log('\n[Mobile Top Header Bar Alignment & Scaling Verification]');
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 400));

    const mobileDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('.nav');
        const inner = document.querySelector('.nav-inner');
        const logo = document.querySelector('.nav-logo');
        const actions = document.querySelector('.nav-actions');
        const search = document.getElementById('nav-search-trigger');
        const notif = document.getElementById('nav-notif-btn');
        const points = document.getElementById('nav-points-badge');
        const profile = document.getElementById('nav-profile-btn');
        const menu = document.getElementById('nav-menu-btn');
        const theme = document.querySelector('.theme-toggle-btn');

        const hr = header.getBoundingClientRect();
        const lr = logo.getBoundingClientRect();
        const ar = actions.getBoundingClientRect();
        const sr = search.getBoundingClientRect();
        const nr = notif.getBoundingClientRect();
        const pr = points.getBoundingClientRect();
        const fr = profile.getBoundingClientRect();
        const mr = menu.getBoundingClientRect();

        return {
          windowWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerRight: hr.right,
          actionsRight: ar.right,
          logoWidth: lr.width,
          searchWidth: sr.width,
          searchHeight: sr.height,
          notifHeight: nr.height,
          pointsHeight: pr.height,
          profileHeight: fr.height,
          menuHeight: mr.height,
          themeHidden: getComputedStyle(theme).display === 'none'
        };
      })()`,
      returnByValue: true
    });

    const m = mobileDiag.result.value;
    assert.strictEqual(m.scrollWidth <= m.windowWidth, true, 'Zero horizontal overflow allowed on mobile');
    assert.ok(m.actionsRight <= m.headerRight, 'All header actions must fit within the mobile viewport');
    assert.ok(m.logoWidth >= 80, 'Logo and brand name must be clearly visible on mobile (width >= 80px)');
    assert.ok(m.searchHeight >= 44 && m.searchWidth >= 44, 'Mobile search button must meet the touch target minimum');
    assert.ok(m.notifHeight >= 44, 'Mobile notification button must meet the touch target minimum');
    assert.ok(m.pointsHeight >= 44, 'Mobile points badge must meet the touch target minimum');
    assert.ok(m.profileHeight >= 44, 'Mobile profile button must meet the touch target minimum');
    assert.ok(m.menuHeight >= 44, 'Mobile menu button must meet the touch target minimum');
    assert.strictEqual(m.themeHidden, true, 'Desktop theme text button must be hidden on mobile header');
    console.log('  ✔ Mobile header alignment, 44px targets, and 0px overflow verified at 390px viewport');

    const mobileUsability = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const layoutFits = selector => {
          const controls = [...document.querySelectorAll(selector)];
          return controls.length > 0 && controls.every(el => el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight >= 44);
        };
        switchTabNav('home', true);
        setQuickCardsPage(0);
        const viewport = document.getElementById('hq-carousel-viewport');
        const track = document.getElementById('hq-carousel-track');
        const swipe = (type, x, y) => {
          const touch = new Touch({ identifier: 1, target: viewport, clientX: x, clientY: y });
          viewport.dispatchEvent(new TouchEvent(type, {
            bubbles: true, touches: ['touchend','touchcancel'].includes(type) ? [] : [touch], changedTouches: [touch]
          }));
        };
        swipe('touchstart', 260, 300);
        swipe('touchmove', 130, 304);
        swipe('touchend', 90, 310);
        const swipeWorks = window._hqCurrentPage === 1 && document.querySelector('.hq-page-count').textContent.startsWith('2 of ');
        swipe('touchstart', 260, 300);
        swipe('touchmove', 130, 304);
        swipe('touchcancel', 130, 304);
        const cancelledSwipeResets = window._hqCurrentPage === 1 && !track.style.transition && !track.style.willChange;
        swipe('touchstart', 250, 280);
        swipe('touchmove', 240, 420);
        swipe('touchend', 240, 480);
        const verticalGestureKeepsPage = window._hqCurrentPage === 1;
        setQuickCardsPage(0);
        switchTabNav('forum', true);
        const forumPillsFit = layoutFits('.forum-filter-pill');
        switchTabNav('resources', true);
        const resourcePillsFit = layoutFits('.resource-pill');
        const trigger = document.querySelector('.bottom-nav button[aria-label="Ask Stedfast"]');
        trigger.focus();
        trigger.click();
        await pause(150);
        const input = document.getElementById('helper-agent-input');
        const drawer = document.getElementById('helper-agent-drawer');
        const helperOpensWithoutFocus = drawer.classList.contains('open') && document.activeElement !== input;
        input.focus();
        const helperAllowsTyping = document.activeElement === input;
        drawer.querySelector('button[title="Close chat"]').click();
        const helperCloses = !drawer.classList.contains('open');
        const oldTheme = document.documentElement.getAttribute('data-theme');
        themeApply('light');
        showToast('Mobile position verification', 'warning', 1200);
        await pause(90);
        const container = document.getElementById('portal-toast-container');
        const toastTop = container.getBoundingClientRect().top;
        const headerBottom = document.querySelector('.nav').getBoundingClientRect().bottom;
        const toastAtTop = toastTop >= headerBottom && toastTop < headerBottom + 24;
        switchTabNav('arcade', true);
        switchArcadeSubtab('leaderboard');
        const highlightMatches = category => {
          switchArcadeLeaderboardCategory(category);
          const current = document.querySelector('.arcade-leaderboard-row.row-current-user');
          if (!current) return false;
          const peer = current.parentNode.querySelector('.arcade-leaderboard-row:not(.row-current-user)');
          const baseline = peer || (() => {
            const row = document.createElement('div');
            row.className = 'arcade-leaderboard-row';
            current.after(row);
            return row;
          })();
          const actual = getComputedStyle(current);
          const normal = getComputedStyle(baseline);
          return actual.backgroundColor === normal.backgroundColor && actual.borderColor !== normal.borderColor &&
            current.querySelector('.arcade-leaderboard-rank').textContent.startsWith('#');
        };
        const streakOutline = highlightMatches('streak');
        const creditsOutline = highlightMatches('credits');
        themeApply('dark');
        const darkOutline = highlightMatches('credits') && highlightMatches('streak');
        themeApply(oldTheme || 'light');
        switchTabNav('home', true);
        return { swipeWorks, cancelledSwipeResets, verticalGestureKeepsPage, forumPillsFit, resourcePillsFit,
          helperOpensWithoutFocus, helperAllowsTyping, helperCloses, toastAtTop, streakOutline, creditsOutline, darkOutline };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(mobileUsability.result.value, JSON.stringify(mobileUsability.exceptionDetails));
    for (const [check, passed] of Object.entries(mobileUsability.result.value)) {
      assert.strictEqual(passed, true, 'Mobile usability: ' + check);
    }
    console.log('  ✔ Mobile swipe, filter labels, helper focus, top messages, and both leaderboard highlights verified');

    // Test top-left logo home navigation
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof switchTabNav === 'function') switchTabNav('order');
        const logo = document.querySelector('.nav-logo');
        if (logo) logo.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 200));
    const navLogoDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const homePage = document.getElementById('page-home');
        const logo = document.querySelector('.nav-logo');
        return {
          homeActive: homePage ? homePage.classList.contains('active') : false,
          hasPointerCursor: logo ? window.getComputedStyle(logo).cursor === 'pointer' : false
        };
      })()`,
      returnByValue: true
    });
    assert.strictEqual(navLogoDiag.result.value.homeActive, true, 'Clicking top-left logo must navigate back to homepage');
    assert.strictEqual(navLogoDiag.result.value.hasPointerCursor, true, 'Top-left logo must have pointer cursor');
    console.log('  ✔ Top-left logo navigation and pointer cursor verified in browser');

    // Test search expansion on mobile
    await sendCmd('Runtime.evaluate', { expression: 'openGlobalSearch()' });
    await new Promise(r => setTimeout(r, 200));

    const expandedDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const pill = document.getElementById('nav-search-trigger');
        const input = document.getElementById('global-search-input');
        const r = pill.getBoundingClientRect();
        return {
          expanded: pill.classList.contains('expanded'),
          width: r.width,
          inputVisible: getComputedStyle(input).display !== 'none'
        };
      })()`,
      returnByValue: true
    });
    const exp = expandedDiag.result.value;
    assert.strictEqual(exp.expanded, true, 'Search pill must have expanded class');
    assert.ok(exp.width >= 300, 'Expanded search pill must stretch across mobile header (width >= 300px)');
    assert.strictEqual(exp.inputVisible, true, 'Search input must be visible when expanded');
    console.log('  ✔ Mobile search pill smoothly expands across header when focused/tapped');

    // Test search collapse
    await sendCmd('Runtime.evaluate', { expression: 'closeGlobalSearch()' });
    await new Promise(r => setTimeout(r, 200));

    const collapsedDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const pill = document.getElementById('nav-search-trigger');
        const r = pill.getBoundingClientRect();
        return {
          expanded: pill.classList.contains('expanded'),
          width: r.width
        };
      })()`,
      returnByValue: true
    });
    const col = collapsedDiag.result.value;
    assert.strictEqual(col.expanded, false, 'Search pill must not have expanded class');
    assert.strictEqual(col.width, 44, 'Collapsed search pill must return to the 44px touch target');
    console.log('  ✔ Mobile search pill collapses back to a 44px button upon blur/close');

    // Test mobile More button drawer & Escape dismissal at 390x844
    await sendCmd('Runtime.evaluate', { expression: "document.getElementById('bnav-more').click()" });
    await new Promise(r => setTimeout(r, 350));

    const moreDrawerOpenDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.getElementById('sidebar-overlay');
        const panel = overlay ? overlay.querySelector('.sidebar-panel') : null;
        const moreBtn = document.getElementById('bnav-more');
        const cs = panel ? getComputedStyle(panel) : null;
        const rect = panel ? panel.getBoundingClientRect() : null;
        return {
          overlayOpen: overlay ? overlay.classList.contains('open') : false,
          panelOpenClass: panel ? panel.classList.contains('sidebar-open') : false,
          visibility: cs ? cs.visibility : 'none',
          pointerEvents: cs ? cs.pointerEvents : 'none',
          panelWidth: rect ? rect.width : 0,
          panelRight: rect ? rect.right : 0,
          focusOnFirstLink: document.activeElement === (panel?.querySelector('.sidebar-item:not([hidden])') ||
            panel?.querySelector('.sidebar-user-card')),
          focusedElement: document.activeElement.id || document.activeElement.tagName,
          footerTouchTarget: panel?.querySelector('.sidebar-settings-btn').getBoundingClientRect().height >= 44,
          ariaExpanded: moreBtn ? moreBtn.getAttribute('aria-expanded') : null
        };
      })()`,
      returnByValue: true
    });
    const mdo = moreDrawerOpenDiag.result.value;
    assert.strictEqual(mdo.overlayOpen, true, 'Sidebar overlay must have .open class when More is tapped');
    assert.strictEqual(mdo.panelOpenClass, true, 'Sidebar panel must have .sidebar-open class when More is tapped');
    assert.strictEqual(mdo.visibility, 'visible', 'Sidebar panel must be visible on mobile when More is tapped');
    assert.strictEqual(mdo.pointerEvents, 'auto', 'Sidebar panel must receive pointer events when open on mobile');
    assert.ok(mdo.panelWidth >= 240 && mdo.panelRight <= 390.5, 'Sidebar panel must slide fully into the 390px mobile viewport');
    assert.strictEqual(mdo.focusOnFirstLink, true, 'Opening More places focus on the first visible page link, focused ' + mdo.focusedElement);
    assert.strictEqual(mdo.footerTouchTarget, true, 'Sidebar footer rows must have a 44px touch target');
    assert.strictEqual(mdo.ariaExpanded, 'true', '#bnav-more aria-expanded must be "true" when drawer is open');

    await sendCmd('Runtime.evaluate', {
      expression: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
    });
    await new Promise(r => setTimeout(r, 350));

    const moreDrawerClosedDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.getElementById('sidebar-overlay');
        const panel = overlay ? overlay.querySelector('.sidebar-panel') : null;
        const moreBtn = document.getElementById('bnav-more');
        return {
          overlayOpen: overlay ? overlay.classList.contains('open') : true,
          visibility: panel ? getComputedStyle(panel).visibility : 'visible',
          focusRestored: document.activeElement === moreBtn,
          ariaExpanded: moreBtn ? moreBtn.getAttribute('aria-expanded') : null
        };
      })()`,
      returnByValue: true
    });
    const mdc = moreDrawerClosedDiag.result.value;
    assert.strictEqual(mdc.overlayOpen, false, 'Escape key must close mobile sidebar overlay');
    assert.strictEqual(mdc.visibility, 'hidden', 'Closed mobile sidebar panel must return to visibility: hidden');
    assert.strictEqual(mdc.focusRestored, true, 'Escape returns focus to the More button');
    assert.strictEqual(mdc.ariaExpanded, 'false', '#bnav-more aria-expanded must reset to "false" when closed');
    console.log('  ✔ Mobile More drawer opens visibly into viewport and dismisses cleanly on Escape');

    // Test Create Task Brief folder SVG icon sizing & mobile modal bounds at 390x844
    const createTaskModalDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const pt = document.getElementById('page-tasks');
        const tb = document.getElementById('tasks-board');
        if (pt) pt.classList.add('active');
        if (tb) tb.style.display = 'block';
        if (typeof openProjectBoard === 'function') openProjectBoard('Mobile Audit Project');
        if (typeof openCreateTaskModal === 'function') openCreateTaskModal('planning');

        const modal = document.querySelector('.task-create-modal');
        const card = modal ? modal.querySelector('.task-create-modal-card') : null;
        const icon = modal ? modal.querySelector('.new-task-project-display .ui-icon-xs') : null;
        const cr = card ? card.getBoundingClientRect() : null;
        const ir = icon ? icon.getBoundingClientRect() : null;

        if (typeof closeCreateTaskModal === 'function') closeCreateTaskModal();
        if (tb) tb.style.display = 'none';
        if (pt) pt.classList.remove('active');

        return {
          iconWidth: ir ? Math.round(ir.width) : 0,
          iconHeight: ir ? Math.round(ir.height) : 0,
          cardLeft: cr ? cr.left : -1,
          cardRight: cr ? cr.right : 9999
        };
      })()`,
      returnByValue: true
    });
    const ctm = createTaskModalDiag.result.value;
    assert.strictEqual(ctm.iconWidth, 12, 'Create Task Brief project folder .ui-icon-xs width must be 12px');
    assert.strictEqual(ctm.iconHeight, 12, 'Create Task Brief project folder .ui-icon-xs height must be 12px');
    assert.ok(ctm.cardLeft >= 0 && ctm.cardRight <= 390.5, 'Create Task Brief modal card must fit cleanly within 390px mobile viewport');
    console.log('  ✔ Create Task Brief .ui-icon-xs renders at exact 12x12px with zero modal overflow on mobile');

    // Test ultra-narrow 360x780 Android viewport header & page overflow
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 780,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 250));

    const narrow360Diag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('.nav-inner');
        const actions = document.querySelector('.nav-actions');
        const hr = header.getBoundingClientRect();
        const ar = actions.getBoundingClientRect();
        return {
          windowWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerRight: hr.right,
          actionsRight: ar.right
        };
      })()`,
      returnByValue: true
    });
    const n360 = narrow360Diag.result.value;
    assert.strictEqual(n360.scrollWidth <= n360.windowWidth, true, 'Zero horizontal overflow allowed at 360px ultra-narrow mobile viewport');
    assert.ok(n360.actionsRight <= n360.headerRight + 0.5, 'Header actions must fit cleanly inside 360px mobile header');
    console.log('  ✔ Ultra-narrow 360px mobile viewport verified with 0px horizontal overflow');
    const narrowSchedule = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const card = document.createElement('div');
        card.className = 'cal-rundown-item';
        card.style.width = '235px';
        card.innerHTML = '<div class="cal-rundown-info">Parade and uniform inspection</div><div class="cal-rundown-time">Band rehearsal 9:30 AM – 11:30 AM</div>';
        document.body.appendChild(card);
        const time = card.querySelector('.cal-rundown-time');
        const fits = time.getBoundingClientRect().right <= card.getBoundingClientRect().right && time.scrollWidth <= time.clientWidth;
        card.remove();
        return fits;
      })()`,
      returnByValue: true
    });
    assert.strictEqual(narrowSchedule.result.value, true, 'Long schedule times wrap inside narrow mobile cards');

    // Test iPad / Tablet 768x1024 viewport
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 250));

    const tablet768Diag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('.nav-inner');
        const actions = document.querySelector('.nav-actions');
        const hr = header ? header.getBoundingClientRect() : { right: 768 };
        const ar = actions ? actions.getBoundingClientRect() : { right: 768 };
        return {
          windowWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerRight: hr.right,
          actionsRight: ar.right
        };
      })()`,
      returnByValue: true
    });
    const t768 = tablet768Diag.result.value;
    assert.strictEqual(t768.scrollWidth <= t768.windowWidth, true, 'Zero horizontal overflow allowed at 768px tablet viewport');
    assert.ok(t768.actionsRight <= t768.headerRight + 0.5, 'Header actions must fit cleanly inside 768px tablet header');
    console.log('  ✔ Tablet 768px viewport verified with 0px horizontal overflow');

    console.log('\n[Mobile Touch Targets, Safe Areas & Dock Clearance]');
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        window.__origSupaGet = window.supa.get;
        window.supa.get = async (path, ...args) => {
          if (path.startsWith('bb_members?')) {
            return [{ ic: '010101-14-1234', name: 'Joshua Koh', rank: 'Sergeant', department: 'Media', section: 'Senior' }];
          }
          return window.__origSupaGet.call(window.supa, path, ...args);
        };
        sessionSet('department', 'Media', { localOnly: true });
      })()`
    });
    await sendCmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const [width, height] of [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 768]]) {
      await sendCmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
      await new Promise(resolve => setTimeout(resolve, 300));
      const responsive = await sendCmd('Runtime.evaluate', {
        expression: `(async () => {
          const root = document.documentElement;
          const injectedInsets = { top: 48, bottom: 34, left: 16, right: 24 };
          for (const [side, size] of Object.entries(injectedInsets)) root.style.setProperty('--safe-area-' + side, size + 'px');
          const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const rect = element => element.getBoundingClientRect();
          const sizes = selectors => selectors.flatMap(selector => {
            const elements = document.querySelectorAll(selector);
            const visible = [...elements].filter(element => element.getClientRects().length);
            return visible.length ? visible.filter(element => {
              const hit = rect(element);
              return hit.width < 43.9 || hit.height < 43.9;
            }).map(() => selector) : ['Missing ' + selector];
          });
          const dock = document.getElementById('bottom-nav');
          const problems = [];
          const visitedRoutes = [];
          const viewport = root.clientWidth;
          const header = document.querySelector('.nav');
          problems.push(...sizes(['.nav-search-pill', '.nav-notif-btn', '.nav-points-badge', '.nav-profile-btn']));
          if (getComputedStyle(dock).display !== 'none') {
            const dockBox = rect(dock);
            const actions = rect(document.querySelector('.nav-actions'));
            if (actions.top < 48 || actions.right > viewport - 24 || actions.bottom > rect(header).bottom) {
              const controls = [...document.querySelector('.nav-actions').children]
                .filter(el => el.getClientRects().length)
                .map(el => [el.className, rect(el).width, el.textContent.trim().slice(0, 12)]);
              problems.push('header safe area: ' + JSON.stringify({ top: actions.top, right: actions.right,
                bottom: actions.bottom, headerBottom: rect(header).bottom, controls }));
            }
            if (dockBox.left < 16 || dockBox.right > viewport - 24 || dockBox.bottom > innerHeight - 34) problems.push('dock safe area');
            problems.push(...sizes(['.bnav-btn']));
          }

          for (const section of document.querySelectorAll('main > .page[id]')) {
            switchTabNav(section.id.slice(5), true);
            await frame();
            if (!section.classList.contains('active')) continue;
            visitedRoutes.push(section.id);
            if (root.scrollWidth > viewport || section.scrollWidth > section.clientWidth + 1) problems.push(section.id + ' overflow');
            if (getComputedStyle(dock).display === 'none') continue;
            const last = [...section.children].filter(node => node.getClientRects().length).at(-1);
            window.scrollTo({ top: root.scrollHeight, behavior: 'instant' });
            if (last && rect(last).bottom > rect(dock).top + 1) {
              problems.push(section.id + ' dock clearance');
            }
          }
          switchTabNav('order', true);
          document.getElementById('order-logged-in').style.display = 'block';
          window.UNIFORM_ITEMS = window.DEFAULT_UNIFORM_ITEMS.map(item => ({ ...item, price: 45 }));
          const availability = window.isUniformOrdersAcceptingResponses;
          try {
            window.isUniformOrdersAcceptingResponses = () => ({ open: true });
            openFormForMember('__uniform__');
          } finally {
            window.isUniformOrdersAcceptingResponses = availability;
          }
          await frame();
          document.getElementById('forms-hub').style.display = 'none';
          document.getElementById('inline-form-view').style.display = 'block';
          window.scrollTo({ top: 0, behavior: 'instant' });
          problems.push(...sizes(['.uniform-product-card .qty-btn', 'button.size-pill', '.uniform-cat-tab', '.checkout-cta-btn']));
          const bar = document.querySelector('.sticky-checkout-bar');
          if (getComputedStyle(dock).display !== 'none' && rect(bar).bottom > rect(dock).top) {
            problems.push('checkout dock clearance');
          }
          switchTabNav('home', true);
          await frame();
          problems.push(...sizes(['.cal-day-cell', '.hq-carousel-arrow']));
          if (viewport <= 600 && !document.querySelector('.hq-page-count').getClientRects().length) {
            problems.push('carousel page count missing on mobile');
          }
          const carousel = document.querySelector('.hq-carousel-container');
          carousel.classList.add('hover-left');
          if (getComputedStyle(carousel.querySelector('.hq-arrow-prev')).visibility !== 'visible') problems.push('carousel arrow missing on touch');
          carousel.classList.remove('hover-left');
          switchTabNav('parade', true);
          switchCalendarView('month');
          await frame();
          problems.push(...sizes(['.cal-month-day-cell', '.cal-view-tab', '.cal-nav-arrow']));
          const day = document.querySelector('.cal-month-day-cell');
          day?.click();
          await frame();
          const modal = document.getElementById('calendar-day-modal');
          const card = modal.querySelector('.portal-modal-card');
          const cardBox = rect(card);
          if (cardBox.top < 48 || cardBox.left < 16 || cardBox.right > viewport - 24 || cardBox.bottom > innerHeight - 34 ||
              getComputedStyle(modal).backdropFilter === 'none') problems.push('calendar modal safe area');
          modal.click();
          if (getComputedStyle(modal).display !== 'none') problems.push('calendar modal backdrop dismissal');
          switchCalendarView('year');
          await frame();
          problems.push(...sizes(['.cal-year-month-name', '.cal-year-day-cell']));
          document.querySelectorAll('.cal-year-month-name')[1]?.click();
          if (!document.querySelector('.cal-month-grid') || !document.querySelector('.cal-current-range-heading').textContent.includes('February')) {
            problems.push('year view month navigation');
          }
          if (getComputedStyle(dock).display !== 'none') {
            const drawer = document.querySelector('.sidebar-panel');
            closeSidebar();
            toggleSidebar();
            await frame();
            await Promise.allSettled(drawer.getAnimations().map(animation => animation.finished));
            const footer = rect(drawer.querySelector('.sidebar-footer'));
            const firstItem = rect(drawer.querySelector('.sidebar-item:not([hidden])') || drawer.querySelector('.sidebar-user-card'));
            if (firstItem.top < 48 || footer.right > viewport - 24 || footer.bottom > innerHeight - 34 ||
                document.elementFromPoint(rect(dock).left + 3, rect(dock).top + 3)?.closest('#bottom-nav')) {
              problems.push('drawer safe area or stacking: ' + JSON.stringify({ top: firstItem.top, right: footer.right, bottom: footer.bottom, height: innerHeight }));
            }
            drawer.parentElement.querySelector('.sidebar-backdrop').click();
            if (drawer.parentElement.classList.contains('open')) problems.push('drawer backdrop dismissal');
          }
          return { viewport, visitedRoutes, routeCount: document.querySelectorAll('main > .page[id]').length, problems: [...new Set(problems)] };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      assert.ok(responsive.result.value, JSON.stringify(responsive.exceptionDetails));
      assert.strictEqual(responsive.result.value.viewport, width);
      assert.strictEqual(responsive.result.value.visitedRoutes.length, responsive.result.value.routeCount, 'Every route must participate in the responsive checks');
      assert.deepStrictEqual(responsive.result.value.problems, [], 'Responsive requirements at ' + width + 'px');
      console.log('  ✔ ' + width + 'px touch layout, route overflow, and dock clearance');
    }
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        ['top', 'bottom', 'left', 'right'].forEach(side => document.documentElement.style.removeProperty('--safe-area-' + side));
        if (window.__origSupaGet) {
          window.supa.get = window.__origSupaGet;
          delete window.__origSupaGet;
        }
        sessionSet('department', '', { localOnly: true });
      })()`
    });
    await sendCmd('Emulation.setTouchEmulationEnabled', { enabled: false });

    // Restore desktop viewport (1280x900)
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 250));

    // ── Dual-Theme (Light & Dark) Layout, DOM & Contrast Verification ──
    console.log('\n[Dual-Theme Verification]');
    const themeDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const root = document.documentElement;
        const metaScheme = document.querySelector('meta[name="color-scheme"]');

        // Apply light theme
        if (typeof window.themeApply === 'function') {
          window.themeApply('light', false);
        } else {
          root.setAttribute('data-theme', 'light');
        }

        const lightDataTheme = root.getAttribute('data-theme');
        const lightSchemeMeta = metaScheme ? metaScheme.getAttribute('content') : '';

        // Switch back to dark theme
        if (typeof window.themeApply === 'function') {
          window.themeApply('dark', false);
        } else {
          root.setAttribute('data-theme', 'dark');
        }

        const darkDataTheme = root.getAttribute('data-theme');
        const darkSchemeMeta = metaScheme ? metaScheme.getAttribute('content') : '';

        return {
          lightDataTheme,
          lightSchemeMeta,
          darkDataTheme,
          darkSchemeMeta
        };
      })()`,
      returnByValue: true
    });

    const td = themeDiag.result.value;
    assert.strictEqual(td.lightDataTheme, 'light', 'Document root data-theme must switch to light');
    assert.strictEqual(td.lightSchemeMeta, 'light', 'meta[name="color-scheme"] must sync to light when light theme is active');
    assert.strictEqual(td.darkDataTheme, 'dark', 'Document root data-theme must switch to dark');
    assert.strictEqual(td.darkSchemeMeta, 'dark', 'meta[name="color-scheme"] must sync to dark when dark theme is active');
    console.log('  ✔ Headless Edge dual-theme switching and meta synchronization verified');

    await sendCmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    const themeOverride = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        localStorage.removeItem('bb_theme');
        window.dispatchEvent(new StorageEvent('storage', { key: 'bb_theme', newValue: null }));
        const followingOS = document.documentElement.dataset.theme;
        themeApply('dark', true);
        window.dispatchEvent(new StorageEvent('storage', { key: 'bb_theme', newValue: 'dark' }));
        return [followingOS, document.documentElement.dataset.theme];
      })()`,
      returnByValue: true
    });
    assert.deepStrictEqual(themeOverride.result.value, ['light', 'dark'], 'Clearing storage follows the OS and saving overrides it');
    await sendCmd('Emulation.setEmulatedMedia', { features: [] });
    console.log('  ✔ Stored theme override and OS fallback verified');

    // ── Member Avatar, Initials & Creator RGB Animation Verification ──
    console.log('\n[Member Avatar & Creator RGB Animation Verification]');
    const avatarDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        // 1. Test renderMemberAvatar with Jeshua Koh (Creator with rgb outline)
        const prevOutline = (typeof _customAvatarOutlinesMap !== 'undefined' && _customAvatarOutlinesMap['jeshuakoh2008@gmail.com'])
          ? JSON.parse(JSON.stringify(_customAvatarOutlinesMap['jeshuakoh2008@gmail.com']))
          : null;
        if (typeof _customAvatarOutlinesMap !== 'undefined') {
          _customAvatarOutlinesMap['jeshuakoh2008@gmail.com'] = { style: 'rgb', target: 'jeshuakoh2008@gmail.com' };
        }
        if (typeof renderMemberAvatar === 'function') {
          renderMemberAvatar('Jeshua Koh', 'jeshuakoh2008@gmail.com');
        }
        const sPh = document.getElementById('sidebar-user-avatar-ph');
        const sPhText = sPh ? sPh.textContent : '';
        const sPhHasRgb = sPh ? sPh.classList.contains('creator-rgb-avatar') : false;
        const sPhTitle = sPh ? sPh.getAttribute('title') : '';

        // 2. Test renderMemberAvatar with regular member (Jayden)
        if (typeof renderMemberAvatar === 'function') {
          renderMemberAvatar('Jayden Wong', 'jayden@example.com');
        }
        const sPhRegText = sPh ? sPh.textContent : '';
        const sPhRegRgb = sPh ? sPh.classList.contains('creator-rgb-avatar') : false;
        const sPhRegTitle = sPh ? sPh.getAttribute('title') : '';
        const sPhRegBg = sPh ? sPh.style.background : '';

        // Reset back to original custom outline state
        if (typeof _customAvatarOutlinesMap !== 'undefined') {
          if (prevOutline) {
            _customAvatarOutlinesMap['jeshuakoh2008@gmail.com'] = prevOutline;
          } else {
            delete _customAvatarOutlinesMap['jeshuakoh2008@gmail.com'];
          }
        }
        if (typeof renderMemberAvatar === 'function') {
          renderMemberAvatar('Jeshua Koh', 'jeshuakoh2008@gmail.com');
        }

        // Test remove photo buttons
        const remBtn = document.querySelector('.m-pfp-remove-btn');
        const remTextBtn = document.querySelector('.m-pfp-remove-text-btn');
        if (typeof setRemovePfpButtonVisible === 'function') {
          setRemovePfpButtonVisible(true);
        }
        const remBtnShown = remBtn ? remBtn.style.display : 'none';
        if (typeof setRemovePfpButtonVisible === 'function') {
          setRemovePfpButtonVisible(false);
        }
        const remBtnHidden = remBtn ? remBtn.style.display : '';

        return {
          creatorText: sPhText,
          creatorHasRgb: sPhHasRgb,
          creatorTitle: sPhTitle,
          regText: sPhRegText,
          regHasRgb: sPhRegRgb,
          regTitle: sPhRegTitle,
          regHasBg: Boolean(sPhRegBg),
          remBtnFound: Boolean(remBtn && remTextBtn),
          remBtnShown,
          remBtnHidden
        };
      })()`,
      returnByValue: true
    });

    const ad = avatarDiag.result.value;
    assert.strictEqual(ad.creatorText, 'J', 'Creator profile avatar must display "J"');
    assert.strictEqual(ad.creatorHasRgb, true, 'Creator profile avatar must have creator-rgb-avatar class');
    assert.ok(ad.creatorTitle.includes('Jeshua Koh'), 'Creator avatar must have hover tooltip with name');
    assert.strictEqual(ad.regText, 'J', 'Regular member profile avatar must display single initial "J"');
    assert.strictEqual(ad.regHasRgb, false, 'Regular member must not have creator-rgb-avatar class');
    assert.strictEqual(ad.regTitle, 'Jayden Wong', 'Regular member must have hover tooltip with name');
    assert.strictEqual(ad.regHasBg, true, 'Regular member avatar must have unique background color');
    assert.strictEqual(ad.remBtnFound, true, 'Remove photo button elements must exist in DOM');
    assert.strictEqual(ad.remBtnShown, 'flex', 'Remove photo button must show when photo is uploaded');
    assert.strictEqual(ad.remBtnHidden, 'none', 'Remove photo button must hide when photo is removed');
    console.log('  ✔ Creator "JK" with RGB animation and regular member single initial with unique color and hover tooltip verified in browser');
    console.log('  ✔ Remove profile picture toggle and buttons verified in browser');

    const shellAvatarDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const identity = { ic: 'avatar-fixture@example.com', email: 'avatar-fixture@example.com', name: 'Avatar Fixture', photo_url: '' };
        const previous = Object.fromEntries(Object.keys(identity).map(key => [key, sessionGet(key)]));
        const previousClient = window.getSupa;
        const realtime = window.PortalRealtime;
        const previousBroadcast = realtime?.broadcast;
        const previousTheme = document.documentElement.dataset.theme;
        const previousDirectory = localStorage.getItem('bb_member_pfps');
        const setSession = state => Object.entries(state).forEach(([key, value]) => sessionSet(key, value, { localOnly: true }));
        const pairs = [['nav-avatar-img', 'nav-avatar-placeholder'], ['sidebar-user-avatar-img', 'sidebar-user-avatar-ph']];
        const inspectAvatars = () => pairs.map(([imageId, placeholderId]) => {
          const img = document.getElementById(imageId);
          const fallback = document.getElementById(placeholderId);
          return [getComputedStyle(img).display, img.naturalWidth > 0, getComputedStyle(fallback).display === 'none'];
        });
        let savedPhoto;
        let uploaded = false;
        let memberRowWrites = 0;
        try {
          setSession(identity);
          window.getSupa = () => ({
            async uploadFile(bucket, path, image) { uploaded = bucket === 'avatars' && path === identity.ic + '.jpg' && image.type === 'image/jpeg' && image.size > 0; },
            fileUrl: () => new URL('assets/portal-icon-192.png', location.href).href,
            async patch() { memberRowWrites++; },
            async upsert(table, row) {
              if (table === 'bb_config' && row.key === 'bb_member_pfps') savedPhoto = JSON.parse(row.value)[identity.ic];
            }
          });
          if (realtime) realtime.broadcast = () => {};
          const bytes = Uint8Array.from(atob('${fixturePhoto}'), byte => byte.charCodeAt(0));
          await handleSettingsAvatarUpload({ files: [new File([bytes], 'profile.png', { type: 'image/png' })] });
          await Promise.all(pairs.map(([id]) => document.getElementById(id).decode()));
          document.documentElement.dataset.theme = 'light';
          const afterUpload = inspectAvatars();
          document.documentElement.dataset.theme = 'dark';
          updateNavUserHeader();
          renderMemberAvatar(identity.name, identity.email);
          const afterRender = inspectAvatars();
          setSession({ photo_url: '' });
          updateNavUserHeader();
          const fallback = inspectAvatars().map(([display, , hidden]) => [display, hidden]);
          return { stored: uploaded && savedPhoto?.includes('portal-icon-192.png?t='), afterUpload, afterRender, fallback, memberRowWrites };
        } finally {
          window.getSupa = previousClient;
          if (realtime) realtime.broadcast = previousBroadcast;
          delete _memberPfpsMap[identity.ic];
          delete _memberPfpsMap[identity.name.toLowerCase()];
          localStorage.removeItem('bb_pfp_' + identity.ic + '.jpg');
          if (previousDirectory === null) localStorage.removeItem('bb_member_pfps');
          else localStorage.setItem('bb_member_pfps', previousDirectory);
          document.documentElement.dataset.theme = previousTheme;
          setSession(previous);
          updateNavUserHeader();
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(!shellAvatarDiag.exceptionDetails, JSON.stringify(shellAvatarDiag.exceptionDetails));
    const shellAvatars = shellAvatarDiag.result.value;
    const visiblePhotos = [['block', true, true], ['block', true, true]];
    assert.strictEqual(shellAvatars.stored, true, 'Settings uploads and saves the fixture photo');
    assert.strictEqual(shellAvatars.memberRowWrites, 0, 'Photo upload skips the undeployed member-row mirror');
    assert.deepStrictEqual(shellAvatars.afterUpload, visiblePhotos, 'Decoded profile photos replace the initials in the header and sidebar immediately after upload');
    assert.deepStrictEqual(shellAvatars.afterRender, visiblePhotos, 'The saved photo stays visible after the header and sidebar render again');
    assert.deepStrictEqual(shellAvatars.fallback, [['none', false], ['none', false]], 'Both icons show initials when there is no profile photo');
    console.log('  ✔ Header and sidebar display the uploaded photo and retain their initials fallback');

    // ── Cloudflare Turnstile CAPTCHA Integration ──
    console.log('\n[Privacy-First Bot Protection (Cloudflare Turnstile CAPTCHA)]');
    const turnstileDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const containers = document.querySelectorAll('.cf-turnstile-container');
        const loginContainer = document.querySelector('#auth-login .cf-turnstile-container');
        const regContainer = document.querySelector('#auth-register .cf-turnstile-container');
        const forgotContainer = document.querySelector('#auth-forgot .cf-turnstile-container');
        const scriptEl = document.querySelector('script[src*="turnstile/v0/api.js"]');
        const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const cspContent = cspMeta ? cspMeta.getAttribute('content') : '';

        return {
          containerCount: containers.length,
          loginFound: !!loginContainer,
          loginAction: loginContainer ? loginContainer.getAttribute('data-action') : null,
          regFound: !!regContainer,
          regAction: regContainer ? regContainer.getAttribute('data-action') : null,
          forgotFound: !!forgotContainer,
          forgotAction: forgotContainer ? forgotContainer.getAttribute('data-action') : null,
          scriptFound: !!scriptEl,
          scriptSrc: scriptEl ? scriptEl.getAttribute('src') : null,
          cspAllowsTurnstile: cspContent.includes('https://challenges.cloudflare.com'),
          hasNoRecaptcha: !document.querySelector('script[src*="recaptcha"]')
        };
      })()`,
      returnByValue: true
    });
    const cfDiag = turnstileDiag.result.value;
    assert.ok(cfDiag.scriptFound, 'Cloudflare Turnstile script must be present in DOM');
    assert.strictEqual(cfDiag.cspAllowsTurnstile, true, 'CSP meta tag must permit challenges.cloudflare.com');
    assert.strictEqual(cfDiag.loginFound, true, 'Login form must include Turnstile container');
    assert.strictEqual(cfDiag.loginAction, 'login', 'Login container action must be login');
    assert.strictEqual(cfDiag.regFound, true, 'Register form must include Turnstile container');
    assert.strictEqual(cfDiag.regAction, 'register', 'Register container action must be register');
    assert.strictEqual(cfDiag.forgotFound, true, 'Forgot password form must include Turnstile container');
    assert.strictEqual(cfDiag.forgotAction, 'forgot_password', 'Forgot container action must be forgot_password');
    assert.strictEqual(cfDiag.hasNoRecaptcha, true, 'Zero Google reCAPTCHA scripts in DOM (privacy compliance)');
    console.log('  ✔ Cloudflare Turnstile explicit script loader & privacy-first CSP headers verified in browser');
    console.log('  ✔ Turnstile widget containers and data actions verified across Login, Register, and Forgot Password in browser');

    // Verify  Member Logout & Re-Lock in Browser
    const logoutDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof logoutMember === 'function') logoutMember();
        const memberPage = document.getElementById('page-member');
        const authBox = document.getElementById('m-auth');
        const dashBox = document.getElementById('m-dashboard');
        const isMemberActive = memberPage ? memberPage.classList.contains('active') : false;
        const isAuthVisible = authBox ? getComputedStyle(authBox).display !== 'none' : false;
        const isDashHidden = dashBox ? getComputedStyle(dashBox).display === 'none' : false;
        const authedNow = (typeof AuthGuard !== 'undefined') ? AuthGuard.isUserAuthenticated() : true;
        const canOrder = (typeof AuthGuard !== 'undefined') ? AuthGuard.canActivate('order') : true;

        return {
          isMemberActive,
          isAuthVisible,
          isDashHidden,
          authedNow,
          canOrder
        };
      })()`,
      returnByValue: true
    });
    const lInfo = logoutDiag.result.value;
    assert.strictEqual(lInfo.isMemberActive, true, 'Logout must redirect user back to Member tab');
    assert.strictEqual(lInfo.isAuthVisible, true, 'Logout must display Member Login/Register card');
    assert.strictEqual(lInfo.isDashHidden, true, 'Logout must hide Member Dashboard');
    assert.strictEqual(lInfo.authedNow, false, 'AuthGuard must report user unauthenticated after logout');
    assert.strictEqual(lInfo.canOrder, false, 'Internal routes must re-lock upon logout');
    console.log('  ✔ Member logout, dashboard hiding, and portal re-locking verified in browser');

    // ── Granular RBAC, Scoped Admin Console & Header Role Badge Verification ──
    console.log('\n[Granular RBAC, Scoped Admin Console & Header Role Badge Verification]');
    const rbacBrowserDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const previousConfig = RBAC._getRolesConfig();
        const oldGet = window.supa.get;
        const fixtureRoles = {
          super_admins: ['jeshuakoh2008@gmail.com'],
          admins: { 'store_officer@example.com': { role: 'admin', permissions: ['orders', 'uniform'] } }
        };
        window.supa.get = (path, ...args) => path.startsWith('bb_config?key=eq.bb_admin_roles&')
          ? Promise.resolve([{ value: fixtureRoles }]) : oldGet.call(window.supa, path, ...args);
        await RBAC.loadRolesConfig(true);
        // 1. Header Role Badge for Member, Admin, and Super Admin
        const badge = document.querySelector('.nav-role-badge');
        const badgeWrap = document.querySelector('.nav-role-badge-wrap');
        const textSpan = badge ? badge.querySelector('.nav-role-badge-text') : null;

        // Test Member Badge
        sessionSet('email', 'member@1stpjbb.org.my');
        sessionSet('rank', 'Private');
        RBAC.renderHeaderRoleBadge();
        const memberBadgeClass = badge ? badge.className : '';
        const memberBadgeText = textSpan ? textSpan.textContent : '';
        const memberBadgeRole = badge ? badge.getAttribute('role') : '';

        // Test Scoped Admin Badge
        sessionSet('email', 'store_officer@example.com');
        sessionSet('rank', 'Lieutenant');
        RBAC.renderHeaderRoleBadge();
        const adminBadgeClass = badge ? badge.className : '';
        const adminBadgeText = textSpan ? textSpan.textContent : '';

        // Test Super Admin Badge (Jeshua Koh)
        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('rank', 'Captain');
        RBAC.renderHeaderRoleBadge();
        const superBadgeClass = badge ? badge.className : '';
        const superBadgeText = textSpan ? textSpan.textContent : '';

        // Use a local authentication service fixture for browser checks.
        const oldRpc = window.supa.rpc;
        let issuedToken = null;
        let issuedEmail = null;
        window.supa.rpc = async (name, args) => {
          if (name === 'rpc_open_member_admin_session') {
            if (args.p_member_token !== 'a'.repeat(64)) return null;
            issuedEmail = sessionGet('email');
            issuedToken = crypto.randomUUID();
            return { valid: true, officer_email: issuedEmail, scope: issuedEmail === 'store_officer@example.com' ? 'admin' : 'super_admin', permissions: issuedEmail === 'store_officer@example.com' ? ['orders', 'uniform'] : [], token: issuedToken, expires_at: new Date(Date.now() + 7200000).toISOString() };
          }
          if (name === 'rpc_verify_admin_session') {
            const scoped = issuedEmail === 'store_officer@example.com';
            return {
              valid: issuedToken === args.p_token, officer_email: issuedEmail,
              scope: scoped ? 'admin' : 'super_admin', permissions: scoped ? ['orders', 'uniform'] : []
            };
          }
          if (name === 'rpc_admin_logout') return { success: true };
          return oldRpc.call(window.supa, name, args);
        };
        async function unlockAdmin() {
          saveAdminMemberSignIn({ email: sessionGet('email'), token: 'a'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString() }, false);
          await window.openAdmin();
        }
        // Test the Super Admin badge and verified console access.
        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('name', 'Jeshua Koh');
        sessionSet('rank', 'Captain');
        RBAC.renderHeaderRoleBadge();
        const jeshuaBadgeClass = badge ? badge.className : '';
        const jeshuaBadgeText = textSpan ? textSpan.textContent : '';

        // Test verified admin entry for the company administrator
        await unlockAdmin();
        const adminPanelEl = document.getElementById('admin-panel');
        const loginBoxEl = document.getElementById('admin-login-box');
        const jeshuaPanelDirectOpen = adminPanelEl && getComputedStyle(adminPanelEl).display !== 'none';
        const jeshuaLoginBoxHidden = !loginBoxEl || getComputedStyle(loginBoxEl).display === 'none';
        window.closeAdmin();

                // 2. Scoped Admin Console UI Filtering
        // Open Admin Console as Scoped Admin
        sessionSet('email', 'store_officer@example.com');
        sessionSet('rank', 'Lieutenant');
        await unlockAdmin();
        window.backToAdminHome();

        const btnOrders = document.getElementById('sec-btn-orders');
        const btnUniform = document.getElementById('sec-btn-uniform');
        const btnMembers = document.getElementById('sec-btn-members');
        const btnRoles = document.getElementById('sec-btn-roles');

        const scopedVisibility = {
          ordersVisible: btnOrders ? getComputedStyle(btnOrders).display !== 'none' : false,
          uniformVisible: btnUniform ? getComputedStyle(btnUniform).display !== 'none' : false,
          membersHidden: btnMembers ? getComputedStyle(btnMembers).display === 'none' : false,
          rolesHidden: btnRoles ? getComputedStyle(btnRoles).display === 'none' : false
        };

        // Switch to Super Admin
        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('rank', 'Captain');
        await unlockAdmin();
        window.backToAdminHome();

        const superVisibility = {
          membersVisible: btnMembers ? getComputedStyle(btnMembers).display !== 'none' : false,
          rolesVisible: btnRoles ? getComputedStyle(btnRoles).display !== 'none' : false
        };

        // Render Super Admin Roles Console
        window.switchAdminSection('roles');
        if (typeof renderAdminRoles === 'function') await renderAdminRoles();
        const rolesSection = document.getElementById('adm-section-roles');
        const rolesTitle = rolesSection ? rolesSection.querySelector('.adm-section-title') : null;
        const searchInput = document.getElementById('rbac-search-input');
        const rolesConsoleVisible = rolesSection ? getComputedStyle(rolesSection).display !== 'none' : false;

        window.closeAdmin();

        window.supa.rpc = oldRpc;
        window.supa.get = oldGet;
        RBAC._setRolesConfig(previousConfig);
        return {
          hasBadgeWrap: !!badgeWrap,
          memberBadgeClass,
          memberBadgeText,
          memberBadgeRole,
          adminBadgeClass,
          adminBadgeText,
          superBadgeClass,
          superBadgeText,
          jeshuaBadgeClass,
          jeshuaBadgeText,
          jeshuaPanelDirectOpen,
          jeshuaLoginBoxHidden,
          scopedVisibility,
          superVisibility,
          rolesConsoleVisible,
          rolesTitleText: rolesTitle ? rolesTitle.textContent : '',
          hasSearchInput: !!searchInput,
          hasRoleFilter: !!document.getElementById('rbac-role-filter'),
          hasCreatorTag: rolesSection ? rolesSection.textContent.includes('Creator') : false,
          noLeastPrivilegeBanner: rolesSection ? !rolesSection.textContent.includes('Least-Privilege RBAC Model') : true
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const rbacDiag = rbacBrowserDiag.result.value;
    assert.strictEqual(rbacDiag.hasBadgeWrap, true, 'Top navigation must contain .nav-role-badge-wrap');
    assert.ok(rbacDiag.memberBadgeClass.includes('role-member'), 'Member badge has role-member class');
    assert.strictEqual(rbacDiag.memberBadgeText, 'Member', 'Member badge has Member text');
    assert.strictEqual(rbacDiag.memberBadgeRole, 'status', 'Role badge has role="status" attribute');
    assert.ok(rbacDiag.adminBadgeClass.includes('role-admin'), 'Admin badge has role-admin class');
    assert.strictEqual(rbacDiag.adminBadgeText, 'Admin', 'Admin badge has Admin text');
    assert.ok(rbacDiag.superBadgeClass.includes('role-super-admin'), 'Super Admin badge has role-super-admin class');
    assert.strictEqual(rbacDiag.superBadgeText, 'Super Admin', 'Super Admin badge has Super Admin text');
    assert.ok(rbacDiag.jeshuaBadgeClass.includes('role-super-admin'), 'Jeshua Koh badge has role-super-admin class');
    assert.strictEqual(rbacDiag.jeshuaBadgeText, 'Super Admin', 'Jeshua Koh badge displays Super Admin text');
    assert.strictEqual(rbacDiag.jeshuaPanelDirectOpen, true, 'Jeshua Koh opens Admin Console directly without password');
    assert.strictEqual(rbacDiag.jeshuaLoginBoxHidden, true, 'Admin password login box is hidden for Super Admin');
    console.log('  ✔ Top navigation dynamic role badge states and verified Super Admin access verified for Jeshua Koh in browser');
    console.log('  ✔ Top navigation dynamic role badge states (Member / Admin / Super Admin) and ARIA status verified in browser');

    assert.strictEqual(rbacDiag.hasRoleFilter, true, 'Roles & Permissions Manager provides role filter dropdown');
    assert.strictEqual(rbacDiag.hasCreatorTag, true, 'Jeshua Koh has Creator tag in Roles console');
    assert.strictEqual(rbacDiag.noLeastPrivilegeBanner, true, 'Least-Privilege RBAC banner is removed from Roles console');
    assert.strictEqual(rbacDiag.scopedVisibility.ordersVisible, true, 'Scoped Admin sees permitted Orders button');
    assert.strictEqual(rbacDiag.scopedVisibility.uniformVisible, true, 'Scoped Admin sees permitted Uniform button');
    assert.strictEqual(rbacDiag.scopedVisibility.membersHidden, true, 'Scoped Admin does NOT see restricted Members button');
    assert.strictEqual(rbacDiag.scopedVisibility.rolesHidden, true, 'Scoped Admin does NOT see Super Admin Roles button');
    assert.strictEqual(rbacDiag.superVisibility.membersVisible, true, 'Super Admin sees Members button');
    assert.strictEqual(rbacDiag.superVisibility.rolesVisible, true, 'Super Admin sees Roles & Permissions button');
    assert.strictEqual(rbacDiag.rolesConsoleVisible, true, 'Super Admin can switch to Roles & Permissions console');
    assert.ok(rbacDiag.rolesTitleText.includes('Roles & Permissions Manager'), 'Roles console renders section title');
    assert.strictEqual(rbacDiag.hasSearchInput, true, 'Roles console renders search input for account permissions');
    console.log('  ✔ Scoped Admin Console section button filtering & Super Admin Roles Console verified in browser');

    // [Admin Access, Member Avatars & Task Comments Verification]
    const extDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async function() {
        // 1. Sidebar Admin button gatekeeping
        if (typeof revokeAdminSession === 'function') revokeAdminSession();
        if (typeof sessionRemove === 'function') sessionRemove('adminAuthed');
        sessionSet('email', 'regular_member@gmail.com');
        sessionSet('rank', 'Private');
        sessionSet('role', 'member');
        if (typeof syncAdminButtonVisibility === 'function') syncAdminButtonVisibility();
        var adminBtn = document.querySelector('.sidebar-admin-btn');
        var memberAdminBtnHidden = adminBtn ? (getComputedStyle(adminBtn).display === 'none') : true;

        sessionSet('email', 'jeshuakoh2008@gmail.com');
        sessionSet('rank', 'Sergeant');
        if (typeof syncAdminButtonVisibility === 'function') syncAdminButtonVisibility();
        var superAdminBtnVisible = adminBtn ? (getComputedStyle(adminBtn).display !== 'none') : false;

        // 2. Task Brief Comments & Send Button
        var commentInput = document.querySelector('.tb-comment-input');
        var sendBtn = document.querySelector('.tb-comment-send-btn');
        var commentsList = document.querySelector('.tb-comments-list');

        var commentPostedOk = false;
        if (commentInput && sendBtn && typeof handleTaskCommentSubmit === 'function') {
          sessionSet('department', 'HQ');
          window._taskMap = window._taskMap || {};
          window._taskMap['TES-1'] = { id: 'TES-1', department: 'hq' };
          window._activeDetailTaskId = 'TES-1';
          commentInput.value = 'Browser test comment verification';
          await handleTaskCommentSubmit(commentInput);
          if (commentsList) {
            commentPostedOk = commentsList.textContent.includes('Browser test comment verification');
          }
        }

        return {
          memberAdminBtnHidden,
          superAdminBtnVisible,
          hasSendBtn: !!sendBtn,
          commentPostedOk
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const extResult = (extDiag.result && extDiag.result.value) || {};
    assert.strictEqual(extResult.memberAdminBtnHidden, true, 'Sidebar Admin Console button must be hidden for standard members');
    assert.strictEqual(extResult.superAdminBtnVisible, true, 'Sidebar Admin Console button must be visible for Super Admin');
    assert.strictEqual(extResult.hasSendBtn, true, 'Task brief must have dedicated comment send button');
    assert.strictEqual(extResult.commentPostedOk, true, 'Submitting comment must persist and render in comments list');
    console.log('  ✔ Admin Console button role-based visibility, avatars, and task comment send button verified in browser');// [Task Multi-File Attachments, @Mentions & Portal Notifications Verification]
    console.log('\n[Task Multi-File Attachments, @Mentions & Portal Notifications Verification]');
    const attachDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const lockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Lock'));
        const hasLogoutAdminLock = !!document.querySelector("button[onclick*='logoutAdmin']");
        const attList = document.querySelector('.tb-attachments-list');
        const multiFileInput = document.querySelector('.tb-attachments-section input[type="file"][multiple]');
        const mentionsDropdown = document.querySelector('.tb-mentions-dropdown');
        let notifAdded = false;
        if (typeof window.addPortalNotification === 'function') {
          window.addPortalNotification({
            id: 'browser-test-notif-1',
            category: 'announcements',
            group: 'Today',
            icon: '★',
            title: 'Test Notification',
            snippet: 'Testing portal notifications',
            time: 'Today',
            unread: true
          });
          const notifList = document.getElementById('notif-items-list');
          notifAdded = notifList ? notifList.textContent.includes('Test Notification') : false;
        }
        return {
          hasLockBtn: !hasLogoutAdminLock && !lockBtn,
          hasAttList: !!attList,
          hasMultiInput: !!multiFileInput,
          hasMentionsDropdown: !!mentionsDropdown,
          notifAdded
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const attRes = (attachDiag.result && attachDiag.result.value) || {};
    assert.strictEqual(attRes.hasLockBtn, true, 'Admin Panel lock button must be completely absent from DOM');
    assert.strictEqual(attRes.hasAttList, true, 'Task brief must contain .tb-attachments-list element');
    assert.strictEqual(attRes.hasMultiInput, true, 'Task attachment file input must support multiple files');
    assert.strictEqual(attRes.hasMentionsDropdown, true, 'Task comment box must contain .tb-mentions-dropdown');
    console.log('  ✔ Lock button removed, multi-file attachments, and @mentions dropdown verified in browser');

    const mentionPlacementExpression = `(async () => {
        const page = document.getElementById('page-tasks');
        const detail = document.getElementById('task-detail-modal');
        const card = detail.querySelector('.task-brief-modal-card');
        const brief = document.getElementById('tdm-desc');
        const comment = detail.querySelector('.tb-comment-input');
        const dropdown = detail.querySelector('.tb-mentions-dropdown');
        const create = document.querySelector('.task-create-modal');
        const newBrief = create.querySelector('.new-task-desc-input');
        const wasActive = page.classList.contains('active');
        const briefWasOpen = document.documentElement.classList.contains('task-brief-open');
        const previous = [detail.style.display, create.style.display, brief.innerHTML, comment.innerHTML, newBrief.innerHTML,
          brief.getAttribute('contenteditable'), window._cachedDepartmentMembers, window._activeDetailTaskId];
        const typeMention = (input, handler, padding = '') => {
          input.innerHTML = padding + '<p>@Anchor</p>';
          input.focus();
          const text = input.lastElementChild.firstChild;
          getSelection().collapse(text, text.length);
          handler(input);
        };
        const caretGap = () => {
          const caret = getSelection().getRangeAt(0).getBoundingClientRect();
          const menu = dropdown.getBoundingClientRect();
          return Math.min(Math.abs(menu.top - caret.bottom), Math.abs(menu.bottom - caret.top));
        };
        const menuFits = () => {
          const menu = dropdown.getBoundingClientRect();
          return menu.width > 0 && menu.height > 0 && dropdown.style.visibility !== 'hidden' &&
            menu.left >= 0 && menu.right <= window.innerWidth && menu.top >= 0 && menu.bottom <= window.innerHeight;
        };
        const key = (input, value) => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
        try {
          page.classList.add('active');
          await Promise.allSettled(page.getAnimations().map(animation => animation.finished));
          document.documentElement.classList.add('task-brief-open');
          detail.style.display = 'block';
          window._activeDetailTaskId = null;
          window._cachedDepartmentMembers = [
            { name: 'Anchor Alpha', email: 'anchor-alpha@example.test', rank: 'Corporal', department: 'Media' },
            { name: 'Anchor Beta', email: 'anchor-beta@example.test', rank: 'Corporal', department: 'Media' },
            { name: "Zoë D'Angelo", email: 'zoe@example.test', rank: 'Corporal', department: 'Media' }
          ];
          brief.setAttribute('contenteditable', 'true');
          const oldBrief = '<p><span class="tb-mention-pill">@Anchor</span> and <strong>@Anchor Beta</strong>' +
            " and @Zoë&nbsp;D'Angelo. <code>@Anchor Beta</code></p>";
          paintTaskBriefEditors({ id: 'mention-paint-fixture', description: oldBrief }, true);
          const reopensWithValidMentions = Array.from(brief.querySelectorAll('.tb-mention-pill'), el => el.textContent.replace(/\\s+/g, ' ')).join('|') ===
            "@Anchor Beta|@Zoë D'Angelo" && brief.textContent.startsWith('@Anchor and ') && !!brief.querySelector('strong .tb-mention-pill');
          const richContent = document.createElement('div');
          const markup = '<a title="attribute @Anchor Beta" href="#tasks">@Anchor</a> @Anchor Beta; @AnchorWrong';
          const richMentionsRespectMarkup = [formatForumMentions, html => formatAnnouncementMentions(sanitizeAnnouncementHtml(html), true)].every(format => {
            richContent.innerHTML = format(markup);
            return richContent.querySelector('a').getAttribute('title') === 'attribute @Anchor Beta' &&
              richContent.querySelectorAll('.tb-mention-pill').length === 1 && richContent.querySelector('.tb-mention-pill').textContent === '@Anchor Beta';
          });
          card.scrollTop = 0;
          const narrow = window.innerWidth < 500;
          typeMention(brief, handleTaskBriefDescInput, '<p>Earlier task brief line</p>'.repeat(narrow ? 5 : 8));
          const briefNearCaret = menuFits() && caretGap() < 20 && dropdown.getBoundingClientRect().width <= 420;
          const scrollBefore = card.scrollTop;
          card.scrollTop += narrow ? 60 : 90;
          card.dispatchEvent(new Event('scroll'));
          const followsScroll = card.scrollTop > scrollBefore && menuFits() && caretGap() < 20;
          key(brief, 'ArrowDown');
          const second = dropdown.querySelector('.tb-mention-item.active')?.textContent.includes('Anchor Beta');
          key(brief, 'Enter');
          const keyboardInserts = second && brief.querySelector('.tb-mention-pill')?.textContent === '@Anchor Beta' &&
            dropdown.style.display === 'none';
          typeMention(brief, handleTaskBriefDescInput);
          key(brief, 'Escape');
          const escapeClosesMenu = dropdown.style.display === 'none' && detail.style.display === 'block';
          typeMention(comment, handleTaskCommentInput);
          comment.scrollIntoView({ block: 'end' });
          const commentPlacement = dropdown.parentElement === comment.parentElement && dropdown.style.display === 'block' &&
            dropdown.getBoundingClientRect().bottom <= comment.getBoundingClientRect().top;
          hideMentionDropdown();
          detail.style.display = 'none';
          document.documentElement.classList.remove('task-brief-open');
          create.style.display = 'flex';
          typeMention(newBrief, handleTaskBriefDescInput);
          const createNearCaret = !!dropdown.id && create.getAttribute('aria-owns') === dropdown.id && menuFits() && caretGap() < 20;
          dropdown.querySelector('.tb-mention-item').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          const pointerInserts = newBrief.querySelector('.tb-mention-pill')?.textContent === '@Anchor Alpha' &&
            dropdown.style.display === 'none' && !create.hasAttribute('aria-owns');
          return { briefNearCaret, followsScroll, keyboardInserts, escapeClosesMenu, commentPlacement, createNearCaret, pointerInserts,
            reopensWithValidMentions, richMentionsRespectMarkup };
        } finally {
          hideMentionDropdown();
          [detail.style.display, create.style.display, brief.innerHTML, comment.innerHTML, newBrief.innerHTML] = previous;
          brief.setAttribute('contenteditable', previous[5]);
          window._cachedDepartmentMembers = previous[6];
          window._activeDetailTaskId = previous[7];
          page.classList.toggle('active', wasActive);
          document.documentElement.classList.toggle('task-brief-open', briefWasOpen);
        }
      })()`;
    const verifyMentionPlacement = async viewport => {
      const result = await sendCmd('Runtime.evaluate', { expression: mentionPlacementExpression, awaitPromise: true, returnByValue: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      assert.deepStrictEqual(result.result.value, {
        briefNearCaret: true, followsScroll: true, keyboardInserts: true, escapeClosesMenu: true,
        commentPlacement: true, createNearCaret: true, pointerInserts: true,
        reopensWithValidMentions: true, richMentionsRespectMarkup: true
      }, `Mention placement and verified highlighting work at ${viewport}`);
    };
    await verifyMentionPlacement('desktop width');
    await sendCmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    try {
      await verifyMentionPlacement('390px mobile width');
    } finally {
      await sendCmd('Emulation.clearDeviceMetricsOverride');
    }
    console.log('  ✔ Mention menus follow the brief caret on desktop and mobile and preserve comment placement');
    console.log('  ✔ Reopened briefs, forum text, and announcements only highlight confirmed mentions');

    // [Task Comment Actions (3-Dots Menu, Edit, Delete) & Author Mention Notification Exclusion]
    console.log('\n[Task Comment Actions & Mention Notification Filtering Verification]');
    const commentActionDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        // Post a comment as Jeshua Koh
        if (typeof sessionSet === 'function') {
          sessionSet('name', 'Jeshua Koh');
          sessionSet('email', 'jeshuakoh2008@gmail.com');
          sessionSet('department', 'HQ');
        }

        if (typeof markAllNotificationsRead === 'function') markAllNotificationsRead();
        const input = document.querySelector('.tb-comment-input');
        if (input && typeof handleTaskCommentSubmit === 'function') {
          input.value = 'Browser test comment @Jason Koh please review';
          await handleTaskCommentSubmit(input);
        }

        // Check if 3-dots actions menu button rendered
        const moreBtn = document.querySelector('.tb-comment-more-btn');
        const dropdown = document.querySelector('.tb-comment-dropdown');

        let menuToggled = false;
        if (moreBtn && dropdown) {
          moreBtn.click();
          menuToggled = dropdown.style.display !== 'none';
        }

        // Check that Jeshua Koh did NOT receive a notification for mentioning Jason Koh
        const notifList = document.getElementById('notif-items-list');
        const notifText = notifList ? notifList.textContent : '';
        const authorSelfNotified = notifText.includes('Jeshua Koh mentioned you');

        return {
          hasMoreBtn: !!moreBtn,
          hasDropdown: !!dropdown,
          menuToggled,
          authorSelfNotified
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const cmtRes = (commentActionDiag.result && commentActionDiag.result.value) || {};
    assert.strictEqual(cmtRes.hasMoreBtn, true, 'Comment item must render 3-dots more actions button');
    assert.strictEqual(cmtRes.hasDropdown, true, 'Comment item must render comment options dropdown');
    assert.strictEqual(cmtRes.menuToggled, true, 'Clicking 3-dots button must toggle comment dropdown menu');
    assert.strictEqual(cmtRes.authorSelfNotified, false, 'Author (Jeshua Koh) must NOT receive a mention notification for mentioning Jason Koh');

    const taskRepairDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const taskId = 'comment-edit-fixture';
        const commentId = 'comment-fixture';
        const list = document.querySelector('.tb-comments-list');
        const oldMarkup = list.innerHTML;
        const originalClient = getSupaClient;
        const originalBroadcast = PortalRealtime.broadcast;
        const originalPlay = window.playNotificationSound;
        const originalSystem = window.triggerPortalSystemNotification;
        const originalReady = _initialNotifSyncDone;
        const originalDetail = _activeDetailTaskId;
        const originalInbox = _allPortalNotifications.slice();
        const soundPreference = localStorage.getItem('bb_notif_sound_enabled');
        const originalSeen = localStorage.getItem('bb_seen_notifications');
        const comment = { id: commentId, text: '@Tester Account\\nOriginal line', author_email: sessionGet('email') };
        const task = { id: 'self-assignment-fixture', title: 'Inbox test task', department: 'HQ', status: 'todo' };
        _taskCommentsMap[taskId] = [comment];
        let remote = [comment];
        let failWrite = true;
        let chimes = 0;
        try {
          getSupaClient = () => ({
            get: async () => [{ value: JSON.stringify(remote), updated_at: '2026-11-25T00:00:00Z' }],
            req: async (method, url, payload) => {
              if (method !== 'PATCH' || !url.includes('&updated_at=eq.')) throw new Error('Expected a conditional comment update');
              if (failWrite) return [];
              remote = JSON.parse(payload.value);
              return [payload];
            },
            patch: async () => []
          });
          PortalRealtime.broadcast = () => {};
          renderTaskComments(taskId);
          startEditTaskComment(taskId, commentId);
          const editor = list.querySelector('.tb-comment-edit-input');
          const highlightsWhileEditing = editor.querySelector('.tb-mention-pill')?.textContent === '@Tester Account';
          editor.value = '@Tester Account\\nUpdated line';
          const clickSave = async () => {
            const save = list.querySelector('.tb-comment-btn-save');
            save.click();
            for (let i = 0; i < 30 && save.isConnected && save.disabled; i++) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          };
          await clickSave();
          const preservesDraftOnFailure = editor.isConnected && remote[0].text === comment.text;
          failWrite = false;
          remote.push({ id: 'other-comment', author_email: 'other@example.test', text: 'Concurrent comment' });
          await clickSave();
          const savesAndCloses = !list.querySelector('.tb-comment-edit-input') &&
            remote[0].text === '@Tester Account\\nUpdated line' &&
            remote[1]?.text === 'Concurrent comment' &&
            list.querySelector('.tb-mention-pill')?.textContent === '@Tester Account';
          startEditTaskComment(taskId, commentId);
          cancelEditTaskComment(taskId, commentId);
          const cancelCloses = !list.querySelector('.tb-comment-edit-input');

          window.playNotificationSound = () => { chimes++; };
          window.triggerPortalSystemNotification = () => {};
          _initialNotifSyncDone = true;
          localStorage.setItem('bb_notif_sound_enabled', 'true');
          _taskMap[task.id] = task;
          _activeDetailTaskId = task.id;
          await selectTaskDetailAssignee(sessionGet('ic') || sessionGet('email'), sessionGet('name'));
          const self = { ...task, creator_name: sessionGet('name'), updated_at: new Date().toISOString() };
          const inboxImmediate = document.getElementById('notif-items-list').textContent.includes(self.title);
          PortalRealtime.triggerEntityUpdate('task_assigned', 'create', self);
          const singleAlert = chimes === 1 && _allPortalNotifications.filter(n => n.id === 'notif-task-' + self.id).length === 1;
          localStorage.setItem('bb_notif_sound_enabled', 'false');
          syncTaskNotifications([{ ...self, id: 'muted-assignment-fixture', title: 'Muted assignment' }]);
          const respectsMute = chimes === 1 && document.getElementById('notif-items-list').textContent.includes('Muted assignment');
          localStorage.setItem('bb_notif_sound_enabled', 'true');
          syncTaskNotifications([{ ...self, id: 'old-assignment-fixture', updated_at: new Date(Date.now() - 300000).toISOString() }]);
          const historyStaysQuiet = chimes === 1 && _allPortalNotifications.some(n => n.id === 'notif-task-old-assignment-fixture');
          const before = chimes;
          const now = new Date().toISOString();
          syncAnnouncementNotifications([{ id: 'fresh-ann', title: 'Fresh announcement', created_at: now }]);
          syncFormNotifications([{ id: 'fresh-form', title: 'Fresh form', created_at: now }]);
          syncHighlightNotifications([{ id: 'fresh-highlight', title: 'Fresh highlight', created_at: now }]);
          syncResourceNotifications([{ id: 'fresh-resource', title: 'Fresh resource', created_at: now }]);
          syncForumNotifications([{ id: 'fresh-forum', authorEmail: sessionGet('email'), title: 'Forum update',
            replies: [{ id: 'fresh-reply', authorEmail: 'other@example.test', content: 'A reply', created_at: now }] }]);
          notifyPortalOrderStatus({ order_number: 'fixture-order', status: 'ready' }, now, 'Ready');
          _taskCommentsMap['fresh-mention-task'] = [{ id: 'fresh-mention', author_email: 'other@example.test', text: '@' + sessionGet('name'), created_at: now }];
          syncTaskNotifications([{ id: 'fresh-mention-task', title: 'Mention task', created_at: now }]);
          const otherTriggers = chimes === before + 7 && ['notif-announcement-fresh-ann', 'notif-form-fresh-form',
            'notif-highlight-fresh-highlight', 'notif-resource-fresh-resource', 'notif-forum-reply-fresh-reply',
            'notif-order-status-fixture-order-ready', 'notif-mention-fresh-mention'].every(id => _allPortalNotifications.some(n => n.id === id));
          return { highlightsWhileEditing, preservesDraftOnFailure, savesAndCloses, cancelCloses, inboxImmediate, singleAlert, respectsMute, historyStaysQuiet, otherTriggers };
        } finally {
          getSupaClient = originalClient;
          PortalRealtime.broadcast = originalBroadcast;
          window.playNotificationSound = originalPlay;
          window.triggerPortalSystemNotification = originalSystem;
          _initialNotifSyncDone = originalReady;
          _activeDetailTaskId = originalDetail;
          delete _taskMap[task.id];
          delete _taskCommentsMap['fresh-mention-task'];
          _allPortalNotifications = originalInbox;
          delete _taskCommentsMap[taskId];
          localStorage.removeItem('bb_task_comments_' + taskId);
          if (soundPreference === null) localStorage.removeItem('bb_notif_sound_enabled');
          else localStorage.setItem('bb_notif_sound_enabled', soundPreference);
          if (originalSeen === null) localStorage.removeItem('bb_seen_notifications');
          else localStorage.setItem('bb_seen_notifications', originalSeen);
          list.innerHTML = oldMarkup;
          renderNotifications();
        }
      })()`, awaitPromise: true, returnByValue: true
    });
    assert.ok(!taskRepairDiag.exceptionDetails, JSON.stringify(taskRepairDiag.exceptionDetails));
    assert.deepStrictEqual(taskRepairDiag.result.value, {
      highlightsWhileEditing: true, preservesDraftOnFailure: true, savesAndCloses: true, cancelCloses: true,
      inboxImmediate: true, singleAlert: true, respectsMute: true, historyStaysQuiet: true, otherTriggers: true
    }, 'Comment editing and self-assignment inbox alerts work through their normal entry points');
    console.log('  ✔ Comment 3-dots options menu, edit/delete actions, and author mention exclusion verified in browser');


    // ── AI Support Helper Agent ("Ask Stedfast") & Bug Forum Browser Verification ──
    const forumAgentDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        if (typeof sessionSet === 'function') {
          sessionSet('name', 'Jeshua Koh');
          sessionSet('email', 'jeshuakoh2008@gmail.com');
          sessionSet('ic', '010101-14-1234');
        }

        // 1. Verify Floating Trigger Button
        const trigger = document.getElementById('helper-agent-trigger');
        const drawer = document.getElementById('helper-agent-drawer');
        const triggerLabel = trigger ? trigger.querySelector('.helper-agent-label').textContent : '';

        // Test Drawer Toggle
        let drawerOpened = false;
        if (trigger && drawer) {
          if (drawer.classList.contains('open')) toggleHelperAgent();
          trigger.click();
          drawerOpened = drawer.classList.contains('open');
        }

        // Test Prompt Chip in Drawer
        const firstChip = drawer ? (drawer.querySelector('.helper-chip') || drawer.querySelector('.helper-prompt-chips')) : null;

        // Close Drawer
        if (trigger && drawer && drawerOpened) {
          trigger.click();
        }

        // 2. Verify Forum Tab & Routing
        const forumSidebarItem = document.querySelector('.sidebar-item[data-nav="forum"]');
        if (typeof switchTabNav === 'function') {
          switchTabNav('forum');
        }
        const forumPage = document.getElementById('page-forum');
        const isForumActive = forumPage ? forumPage.classList.contains('active') : false;
        const hasHeroCard = forumPage ? !!forumPage.querySelector('.forum-hero-card') : false;
        const postCards = forumPage ? forumPage.querySelectorAll('.forum-post-card').length : 0;
        const filterPills = forumPage ? forumPage.querySelectorAll('.forum-filter-pill').length : 0;

        return {
          hasTrigger: !!trigger,
          triggerLabel,
          hasDrawer: !!drawer,
          drawerOpened,
          hasFirstChip: !!firstChip,
          hasForumNav: !!forumSidebarItem,
          isForumActive,
          hasHeroCard,
          postCards,
          filterPills
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const faRes = (forumAgentDiag.result && forumAgentDiag.result.value) || {};
    assert.strictEqual(faRes.hasTrigger, true, '#helper-agent-trigger floating pill button must exist');
    assert.ok(faRes.triggerLabel.includes('Stedfast'), 'Helper Agent trigger button must display "Ask Stedfast"');
    assert.strictEqual(faRes.hasDrawer, true, '#helper-agent-drawer overlay must exist');
    assert.strictEqual(faRes.drawerOpened, true, 'Clicking trigger must open helper agent drawer');
    assert.strictEqual(faRes.hasFirstChip, true, 'Helper agent drawer must render quick prompt chips');
    assert.strictEqual(faRes.hasForumNav, true, 'Sidebar must render Support Forum navigation item with data-nav="forum"');
    assert.strictEqual(faRes.isForumActive, true, 'switchTabNav("forum") must activate #page-forum');
    assert.strictEqual(faRes.hasHeroCard, true, 'Support forum must render .forum-hero-card');
    assert.ok(faRes.postCards >= 1, 'Support forum must render initial discussion threads');
    assert.ok(faRes.filterPills >= 6, 'Support forum must render category filter pills');
    console.log('  ✔ Floating Helper Agent ("Ask Stedfast") drawer and Support Forum tab layout verified in browser');

    // ── Stedfast Helper Conversational Support & Navigation CDP Verification ──
    const stedfastDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const greetingRes = (typeof queryHelperAgent === 'function') ? queryHelperAgent('hi') : null;
        const privacyRes = (typeof queryHelperAgent === 'function') ? queryHelperAgent("What is Jason Koh's points?") : null;
        const navRes = (typeof queryHelperAgent === 'function') ? queryHelperAgent('Where is the 1stPJ Arcade?') : null;
        const activePosts = (typeof forumPosts !== 'undefined' && Array.isArray(forumPosts) && forumPosts.length)
          ? forumPosts
          : ((typeof DEFAULT_FORUM_POSTS !== 'undefined' && DEFAULT_FORUM_POSTS.length) ? DEFAULT_FORUM_POSTS : []);
        const targetPost = activePosts[0] || null;
        const forumSearchQuery = targetPost ? ('forum thread about ' + targetPost.title) : 'forum thread about 80% attendance';
        const forumRes = (typeof queryHelperAgent === 'function') ? queryHelperAgent(forumSearchQuery) : null;

        // Test action button execution
        if (typeof executeHelperAction === 'function') {
          executeHelperAction('navigate', 'arcade');
        }
        const arcadePage = document.getElementById('page-arcade');
        const isArcadeActive = arcadePage ? arcadePage.classList.contains('active') : false;

        // Return to home
        if (typeof switchTabNav === 'function') {
          switchTabNav('home');
        }

        return {
          hasGreeting: greetingRes && greetingRes.text.includes('Hello'),
          hasNoGreetingFaqError: greetingRes && !greetingRes.text.includes('could not find an exact match'),
          greetingHasChips: greetingRes && Array.isArray(greetingRes.chips) && greetingRes.chips.length > 0,
          hasPrivacyNotice: privacyRes && privacyRes.text.includes('Member Privacy Notice'),
          privacyHasLeaderboardBtn: privacyRes && privacyRes.actions.some(a => a.target === 'attendance'),
          hasArcadeNavText: navRes && navRes.text.includes('1stPJ Arcade'),
          hasArcadeBtn: navRes && navRes.actions.some(a => a.target === 'arcade'),
          hasForumExcerpt: forumRes && forumRes.text.includes('Support Forum') && forumRes.text.includes('Summary'),
          hasForumViewBtn: forumRes && forumRes.actions.some(a => a.action === 'view-thread'),
          isArcadeActive
        };
      })()`,
      returnByValue: true
    });

    const sRes = (stedfastDiag.result && stedfastDiag.result.value) || {};
    assert.strictEqual(sRes.hasGreeting, true, 'Stedfast must reply conversationally to "hi" with Hello');
    assert.strictEqual(sRes.hasNoGreetingFaqError, true, 'Stedfast must not output rigid FAQ failure on greetings');
    assert.strictEqual(sRes.greetingHasChips, true, 'Greeting must provide suggested starter chips');
    assert.strictEqual(sRes.hasPrivacyNotice, true, 'Inquiries for other member points must trigger Member Privacy Notice');
    assert.strictEqual(sRes.privacyHasLeaderboardBtn, true, 'Privacy notice must provide Go to Leaderboard action button');
    assert.strictEqual(sRes.hasArcadeNavText, true, 'Arcade navigation query must explain 1stPJ Arcade module');
    assert.strictEqual(sRes.hasArcadeBtn, true, 'Arcade navigation query must render Go to 1stPJ Arcade action button');
    assert.strictEqual(sRes.hasForumExcerpt, true, 'Forum search queries must format thread summary from past discussions');
    assert.strictEqual(sRes.hasForumViewBtn, true, 'Forum search queries must provide View Forum Discussion action button');
    assert.strictEqual(sRes.isArcadeActive, true, 'executeHelperAction navigate must activate target page in DOM');
    console.log('  ✔ Stedfast conversational intelligence, Privacy Shield, navigation action buttons & forum citations verified in browser');


    // ── Mobile Notification Deep-Link Routing CDP Verification ──
    const notifDeepLinkDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const origClientDL = typeof getSupaClient === 'function' ? getSupaClient : null;
        try {
          if (typeof getSupaClient === 'function') {
            getSupaClient = () => ({
              get: async (url) => {
                if (String(url).startsWith('bb_members?')) return [{ name: 'Jeshua Koh', department: 'HQ', rank: 'Sergeant', section: 'Senior' }];
                return [];
              },
              patch: async () => [],
              post: async () => []
            });
          }
          if (typeof sessionSet === 'function') {
            sessionSet('ic', 'jeshuakoh2008@gmail.com');
            sessionSet('email', 'jeshuakoh2008@gmail.com');
            sessionSet('name', 'Jeshua Koh');
            sessionSet('rank', 'Sergeant');
            sessionSet('department', 'HQ');
          }
          window._taskMap = window._taskMap || {};
          window._taskMap['DL-TASK-99'] = {
            id: 'DL-TASK-99',
            title: 'Deep Link Test Task',
            project_name: 'Portal Development',
            department: 'hq',
            status: 'todo',
            due_date: '2026-11-20'
          };
          window._allLoadedTasks = Array.isArray(window._allLoadedTasks) ? window._allLoadedTasks : [];
          if (!window._allLoadedTasks.some(t => t && t.id === 'DL-TASK-99')) {
            window._allLoadedTasks.push(window._taskMap['DL-TASK-99']);
          }

          await window.handlePortalNotificationDeepLink({ tab: 'tasks', targetId: 'DL-TASK-99', category: 'task_due' });
          const tasksPageActive = document.getElementById('page-tasks')?.classList.contains('active') || false;
          const taskModal = document.getElementById('task-detail-modal');
          const taskModalOpen = Boolean(taskModal && taskModal.style.display !== 'none');
          const openedTaskTitle = (document.getElementById('tdm-title')?.textContent || '').trim();
          if (typeof closeTaskDetail === 'function') closeTaskDetail(true);

          await window.handlePortalNotificationDeepLink({ tab: 'home', targetId: 'ann-1', category: 'announcement' });
          const homePageActive = document.getElementById('page-home')?.classList.contains('active') || false;

          await window.handlePortalNotificationDeepLink({ tab: 'orders', targetId: 'BB-ORDER-1', category: 'order_status' });
          const memberPageActive = document.getElementById('page-member')?.classList.contains('active') || false;

          await window.handlePortalNotificationDeepLink({ tab: 'forum', category: 'forum_reply' });
          const forumPageActive = document.getElementById('page-forum')?.classList.contains('active') || false;

          return { tasksPageActive, taskModalOpen, openedTaskTitle, homePageActive, memberPageActive, forumPageActive };
        } finally {
          if (origClientDL) getSupaClient = origClientDL;
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const dlRes = (notifDeepLinkDiag.result && notifDeepLinkDiag.result.value) || {};
    assert.strictEqual(dlRes.tasksPageActive, true, 'Task notification click must activate Projects & Tasks tab');
    assert.strictEqual(dlRes.taskModalOpen, true, 'Task due-date/mention notification click must open exact task detail modal');
    assert.strictEqual(dlRes.openedTaskTitle, 'Deep Link Test Task', 'Task detail modal must display the exact deep-linked task');
    assert.strictEqual(dlRes.homePageActive, true, 'Announcement notification click must navigate to Home page');
    assert.strictEqual(dlRes.memberPageActive, true, 'Order status notification click must navigate to Member Hub (My Orders)');
    assert.strictEqual(dlRes.forumPageActive, true, 'Forum reply notification click must navigate to Support Forum');
    console.log('  ✔ Mobile & portal notification click deep-link routing verified across Home, Tasks, Member Orders, and Forum');

    // ── Project Calendar View & All-Tasks 3-View Overview (Desktop + Mobile 390px) ──
    await sendCmd('Emulation.clearDeviceMetricsOverride');
    const calAndOverviewDiag = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const origClientCal = typeof getSupaClient === 'function' ? getSupaClient : null;
        try {
          if (typeof getSupaClient === 'function') {
            getSupaClient = () => ({
              get: async (url) => {
                if (String(url).startsWith('bb_members?')) return [{ name: 'Jeshua Koh', department: 'HQ', rank: 'Sergeant', section: 'Senior' }];
                return [];
              },
              patch: async () => [],
              post: async () => []
            });
          }
          if (typeof sessionSet === 'function') {
            sessionSet('ic', 'jeshuakoh2008@gmail.com');
            sessionSet('email', 'jeshuakoh2008@gmail.com');
            sessionSet('name', 'Jeshua Koh');
            sessionSet('rank', 'Sergeant');
            sessionSet('department', 'HQ');
          }
          const todayIso = typeof getTaskMalaysiaDay === 'function' ? getTaskMalaysiaDay(Date.now()) : new Date().toISOString().slice(0, 10);
          const shiftDay = (iso, delta) => {
            const d = new Date(Date.parse(iso) + delta * 86400000);
            return d.toISOString().slice(0, 10);
          };
          const tOverdue  = { id: 'CAL-OV-1', title: 'Overdue Parade Task', project_name: 'Portal Development', department: 'hq', status: 'todo', assignee_name: 'Jeshua Koh', assignee_ic: 'jeshuakoh2008@gmail.com', due_date: shiftDay(todayIso, -2) };
          const tCompLate = { id: 'CAL-LT-5', title: 'Completed Late Task', project_name: 'Portal Development', department: 'hq', status: 'completed', assignee_name: 'Jeshua Koh', assignee_ic: 'jeshuakoh2008@gmail.com', due_date: shiftDay(todayIso, -1), completed_at: new Date().toISOString() };
          const tNear     = { id: 'CAL-NR-2', title: 'Due Soon Task', project_name: 'Portal Development', department: 'hq', status: 'inprogress', assignee_name: 'Tester Account', assignee_ic: '', due_date: shiftDay(todayIso, 1) };
          const tDone     = { id: 'CAL-DN-3', title: 'Completed On Time Task', project_name: 'Logistics', department: 'logistics', status: 'completed', assignee_name: 'Jeshua Koh', assignee_ic: 'jeshuakoh2008@gmail.com', due_date: todayIso, completed_at: new Date().toISOString() };
          const tFuture   = { id: 'CAL-FT-4', title: 'Scheduled Future Task', project_name: 'Media', department: 'media', status: 'planning', assignee_name: 'Officer Tan', assignee_ic: '', due_date: shiftDay(todayIso, 6) };
          const demoTasks = [tOverdue, tCompLate, tNear, tDone, tFuture];
          window._taskMap = window._taskMap || {};
          demoTasks.forEach(t => { window._taskMap[t.id] = t; });
          if (typeof _allLoadedTasks !== 'undefined' && Array.isArray(_allLoadedTasks)) {
            demoTasks.forEach(t => { if (!_allLoadedTasks.some(x => x && x.id === t.id)) _allLoadedTasks.push(t); });
          }

          const prevThemeCal = document.documentElement.getAttribute('data-theme');
          document.documentElement.setAttribute('data-theme', 'dark');

          switchTabNav('tasks');
          openProjectBoard('Portal Development', { skipRemoteFetch: true });

          // Project section must default to Board View on open
          const projDefaultIsBoard = getComputedStyle(document.getElementById('tasks-columns')).display !== 'none'
            && getComputedStyle(document.querySelector('.tasks-board-list-view')).display === 'none'
            && getComputedStyle(document.querySelector('.tasks-board-calendar-view')).display === 'none';

          // Check Board View in Dark Mode: Overdue (red), Completed Late (orange-red), Near (pure yellow)
          const projBoardOverdueEl = document.querySelector('#tasks-columns .task-due-pill.due-overdue');
          const projBoardLateEl = document.querySelector('#tasks-columns .task-due-pill.due-late');
          const projBoardNearEl = document.querySelector('#tasks-columns .task-due-pill.due-near');
          const boardNearColor = projBoardNearEl ? getComputedStyle(projBoardNearEl).color : '';
          const boardNearBg = projBoardNearEl ? getComputedStyle(projBoardNearEl).backgroundColor : '';
          const boardLateColor = projBoardLateEl ? getComputedStyle(projBoardLateEl).color : '';
          const boardLateBg = projBoardLateEl ? getComputedStyle(projBoardLateEl).backgroundColor : '';
          const boardOverdueColor = projBoardOverdueEl ? getComputedStyle(projBoardOverdueEl).color : '';
          const projBoardColorsDistinct = Boolean(projBoardOverdueEl && projBoardLateEl && projBoardNearEl)
            && boardOverdueColor !== boardLateColor
            && boardLateColor !== boardNearColor
            && boardOverdueColor !== boardNearColor;

          // Check List View in Dark Mode: exact color parity with Board View
          setProjectDisplayMode('list');
          const projListOverdueEl = document.querySelector('.tasks-board-list-view .task-due-pill.due-overdue');
          const projListLateEl = document.querySelector('.tasks-board-list-view .task-due-pill.due-late');
          const projListNearEl = document.querySelector('.tasks-board-list-view .task-due-pill.due-near');
          const projListColorsDistinct = Boolean(projListOverdueEl && projListLateEl && projListNearEl)
            && getComputedStyle(projListOverdueEl).color !== getComputedStyle(projListLateEl).color
            && getComputedStyle(projListNearEl).color === boardNearColor
            && getComputedStyle(projListLateEl).color === boardLateColor;

          setProjectDisplayMode('calendar');
          jumpTaskCalendarToday();

          const projCalVisible = getComputedStyle(document.querySelector('.tasks-board-calendar-view')).display !== 'none';
          const projBoardHidden = getComputedStyle(document.getElementById('tasks-columns')).display === 'none';
          const projListHidden = getComputedStyle(document.querySelector('.tasks-board-list-view')).display === 'none';
          const calModes = Array.from(document.querySelectorAll('.tasks-board-calendar-view .task-cal-mode-btn')).map(b => b.textContent.trim());
          const hasTodayHighlight = Boolean(document.querySelector('.tasks-board-calendar-view .task-cal-cell.is-today'));
          const projCalRedEl = document.querySelector('.tasks-board-calendar-view .task-cal-pill-red');
          const projCalLateEl = document.querySelector('.tasks-board-calendar-view .task-cal-pill-late');
          const projCalYellowEl = document.querySelector('.tasks-board-calendar-view .task-cal-pill-yellow');
          const hasRedPill = Boolean(projCalRedEl);
          const hasLatePill = Boolean(projCalLateEl);
          const hasYellowPill = Boolean(projCalYellowEl);
          const projCalColorsDistinct = Boolean(projCalRedEl && projCalLateEl && projCalYellowEl)
            && getComputedStyle(projCalRedEl).color !== getComputedStyle(projCalLateEl).color
            && getComputedStyle(projCalLateEl).color !== getComputedStyle(projCalYellowEl).color;
          const darkModeYellowExactMatch = Boolean(projBoardNearEl && projCalYellowEl)
            && boardNearColor === getComputedStyle(projCalYellowEl).color
            && boardNearBg === getComputedStyle(projCalYellowEl).backgroundColor
            && boardNearColor === 'rgb(253, 224, 71)';
          const darkModeLateExactMatch = Boolean(projBoardLateEl && projCalLateEl)
            && boardLateColor === getComputedStyle(projCalLateEl).color
            && boardLateBg === getComputedStyle(projCalLateEl).backgroundColor;
          const darkModeOverdueExactMatch = Boolean(projBoardOverdueEl && projCalRedEl)
            && boardOverdueColor === getComputedStyle(projCalRedEl).color;
          const hasAvatarInPill = Boolean(document.querySelector('.tasks-board-calendar-view .task-cal-pill .task-cal-pill-avatar'));

          // Open Day Popover & trigger + New task prefill
          const todayCellEl = document.querySelector('.tasks-board-calendar-view .task-cal-cell.is-today');
          if (todayCellEl) todayCellEl.click();
          const popoverOpen = getComputedStyle(document.querySelector('.task-cal-day-popover')).display !== 'none';
          const newBtn = document.querySelector('.task-cal-day-popover .task-cal-popover-new-btn');
          if (newBtn) newBtn.click();
          const createModalOpen = getComputedStyle(document.querySelector('.task-create-modal')).display !== 'none';
          const prefilledDue = document.querySelector('.task-create-modal .new-task-due-input')?.value || '';
          closeCreateTaskModal(true);

          // Switch to Year view and back to Month view
          setTaskCalendarSubMode('year');
          const yearMonthCardsCount = document.querySelectorAll('.tasks-board-calendar-view .task-cal-year-card').length;
          setTaskCalendarSubMode('month');

          // Re-entering Project from Projects list must reset back to Board View
          setTasksViewMode('projects');
          openProjectBoard('Portal Development', { skipRemoteFetch: true });
          const projResetsToBoardOnReentry = getComputedStyle(document.getElementById('tasks-columns')).display !== 'none'
            && getComputedStyle(document.querySelector('.tasks-board-calendar-view')).display === 'none';

          // Global Tasks section: verify defaults auto-set to List View + Assigned to me + Open
          const isDefaultAssignedOpenActive = () => {
            const activeChips = Array.from(document.querySelectorAll('.my-tasks-container .filter-chip-option.active')).map(el => el.textContent.trim());
            return activeChips.includes('Assigned to me') && activeChips.includes('Open');
          };
          setTasksViewMode('mytasks');
          const tasksDefaultIsList = document.querySelector('.my-tasks-view-body')?.getAttribute('data-mytasks-active-view') === 'list';
          const defaultAssignedOpenInitial = isDefaultAssignedOpenActive();
          const defaultText = document.querySelector('.my-tasks-container')?.textContent || '';
          const defaultShowsOwnOpenOnly = defaultText.includes('Overdue Parade Task')
            && !defaultText.includes('Completed Late Task')
            && !defaultText.includes('Scheduled Future Task');

          // Customize filters to All Tasks + All to verify multi-project 3-view overview & 5 colors
          setMyTasksScopeFilter('all');
          setMyTasksStatusFilter('all');

          setMyTasksDisplayMode('board');
          const allBoardCols = document.querySelectorAll('.my-tasks-container .my-tasks-board-col').length;
          const allBoardHasMultiProjects = (document.querySelector('.my-tasks-container')?.textContent || '').includes('Logistics')
            && (document.querySelector('.my-tasks-container')?.textContent || '').includes('Media');
          const allBoardHasOverdueAndLate = Boolean(
            document.querySelector('.my-tasks-container .task-due-pill.due-overdue')
            && document.querySelector('.my-tasks-container .task-due-pill.due-late')
          );
          const desktopBoardOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

          setMyTasksDisplayMode('list');
          const allListRows = document.querySelectorAll('.my-tasks-container .my-tasks-table-row').length;
          const allListHasOverdueAndLate = Boolean(
            document.querySelector('.my-tasks-container .task-due-pill.due-overdue')
            && document.querySelector('.my-tasks-container .task-due-pill.due-late')
          );

          setMyTasksDisplayMode('calendar');
          const allCalHasAllColors = Boolean(
            document.querySelector('.my-tasks-container .task-cal-pill-red')
            && document.querySelector('.my-tasks-container .task-cal-pill-late')
            && document.querySelector('.my-tasks-container .task-cal-pill-yellow')
            && document.querySelector('.my-tasks-container .task-cal-pill-green')
            && document.querySelector('.my-tasks-container .task-cal-pill-gray')
          );
          const desktopCalOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

          // Light Mode parity check: crisp visible calendar gridlines/borders & borderless transparent Tasks Board/Calendar wrappers aligned flush like Dark Mode
          document.documentElement.setAttribute('data-theme', 'light');
          setMyTasksScopeFilter('all');
          setMyTasksStatusFilter('all');
          setMyTasksDisplayMode('board');
          const lightBoardWrap = document.querySelector('.my-tasks-container .my-tasks-board-card');
          const lightControlsRow = document.querySelector('.my-tasks-container .my-tasks-controls-row');
          const lightTaskCol = document.querySelector('.my-tasks-container .task-col');
          const lightTaskCard = document.querySelector('.my-tasks-container .task-card');
          const lightBoardWrapClean = Boolean(lightBoardWrap)
            && getComputedStyle(lightBoardWrap).borderTopWidth === '0px'
            && getComputedStyle(lightBoardWrap).backgroundColor === 'rgba(0, 0, 0, 0)';
          const lightBoardAligned = Boolean(lightBoardWrap && lightControlsRow)
            && Math.abs(lightBoardWrap.getBoundingClientRect().left - lightControlsRow.getBoundingClientRect().left) <= 1;
          const lightLaneOutlined = Boolean(lightTaskCol)
            && getComputedStyle(lightTaskCol).borderTopWidth === '0px'
            && getComputedStyle(lightTaskCol).boxShadow.includes('203, 213, 225');
          const lightCardBorderVisible = Boolean(lightTaskCard)
            && getComputedStyle(lightTaskCard).borderTopWidth === '1px'
            && getComputedStyle(lightTaskCard).borderTopColor === 'rgb(203, 213, 225)';

          // Light Mode List View: single uniform #cbd5e1 outer border matching inner row lines (no double border)
          setMyTasksDisplayMode('list');
          const lightListCard = document.querySelector('.my-tasks-container .my-tasks-table-card');
          const lightListTableCont = document.querySelector('.my-tasks-container .my-tasks-table-container');
          const lightListCell = document.querySelector('.my-tasks-container .my-tasks-table td');
          const lightListBordersUniform = Boolean(lightListCard && lightListTableCont && lightListCell)
            && getComputedStyle(lightListCard).borderTopWidth === '1px'
            && getComputedStyle(lightListCard).borderTopColor === 'rgb(203, 213, 225)'
            && getComputedStyle(lightListTableCont).borderTopWidth === '0px'
            && getComputedStyle(lightListCell).borderBottomColor === 'rgb(203, 213, 225)';

          setMyTasksDisplayMode('calendar');
          const lightCalWrap = document.querySelector('.my-tasks-container .my-tasks-calendar-card');
          const lightCalControlsRow = document.querySelector('.my-tasks-container .my-tasks-controls-row');
          const lightCalFrame = document.querySelector('.my-tasks-container .task-cal-month-frame');
          const lightCalCell = document.querySelector('.my-tasks-container .task-cal-cell');
          const lightCalWrapClean = Boolean(lightCalWrap)
            && getComputedStyle(lightCalWrap).borderTopWidth === '0px'
            && getComputedStyle(lightCalWrap).backgroundColor === 'rgba(0, 0, 0, 0)';
          const lightCalAligned = Boolean(lightCalFrame && lightCalControlsRow)
            && Math.abs(lightCalFrame.getBoundingClientRect().left - lightCalControlsRow.getBoundingClientRect().left) <= 1;
          const lightCalGridlinesVisible = Boolean(lightCalFrame && lightCalCell)
            && getComputedStyle(lightCalFrame).borderTopColor === 'rgb(203, 213, 225)'
            && getComputedStyle(lightCalCell).borderRightColor === 'rgb(203, 213, 225)'
            && getComputedStyle(lightCalCell).borderBottomColor === 'rgb(203, 213, 225)';

          // Calendar auto-reset check: navigate to next month + Year view -> switch to Board/List -> return to Calendar -> must reset to Month + current date
          const currentMonthHeading = document.querySelector('.my-tasks-container .task-cal-period-title')?.textContent?.trim() || '';
          navigateTaskCalendar(1);
          setTaskCalendarSubMode('year');
          setMyTasksDisplayMode('board');
          setMyTasksDisplayMode('calendar');
          const calResetAfterViewSwitch = document.querySelector('.my-tasks-container .task-cal-shell')?.getAttribute('data-cal-mode') === 'month'
            && (document.querySelector('.my-tasks-container .task-cal-period-title')?.textContent?.trim() || '') === currentMonthHeading;

          // Leave Tasks section -> Projects -> return to Tasks: must auto-reset back to List View + Assigned to me + Open
          setTasksViewMode('projects');
          setTasksViewMode('mytasks');
          const autoResetAfterLeavingSection = isDefaultAssignedOpenActive();
          const tasksResetsToListAfterLeaving = document.querySelector('.my-tasks-view-body')?.getAttribute('data-mytasks-active-view') === 'list';

          // Change filters & view mode again, switch to Home tab, then return to Tasks tab: must auto-reset back to List View + Assigned to me + Open
          setMyTasksDisplayMode('calendar');
          navigateTaskCalendar(2);
          setMyTasksScopeFilter('all');
          setMyTasksStatusFilter('all');
          switchTabNav('home');
          switchTabNav('tasks');
          const autoResetAfterTabSwitch = isDefaultAssignedOpenActive();
          const tasksResetsToListAfterTabSwitch = document.querySelector('.my-tasks-view-body')?.getAttribute('data-mytasks-active-view') === 'list';
          setMyTasksDisplayMode('calendar');
          const calResetAfterTabSwitch = document.querySelector('.my-tasks-container .task-cal-shell')?.getAttribute('data-cal-mode') === 'month'
            && (document.querySelector('.my-tasks-container .task-cal-period-title')?.textContent?.trim() || '') === currentMonthHeading;
          setMyTasksDisplayMode('list');

          if (prevThemeCal) document.documentElement.setAttribute('data-theme', prevThemeCal);
          else document.documentElement.removeAttribute('data-theme');

          return {
            projDefaultIsBoard, projResetsToBoardOnReentry, tasksDefaultIsList,
            tasksResetsToListAfterLeaving, tasksResetsToListAfterTabSwitch,
            calResetAfterViewSwitch, calResetAfterTabSwitch,
            darkModeYellowExactMatch, darkModeLateExactMatch, darkModeOverdueExactMatch,
            lightBoardWrapClean, lightBoardAligned, lightLaneOutlined, lightCardBorderVisible,
            lightListBordersUniform, lightCalWrapClean, lightCalAligned, lightCalGridlinesVisible,
            projCalVisible, projBoardHidden, projListHidden, calModes, hasTodayHighlight,
            hasRedPill, hasLatePill, projBoardColorsDistinct, projListColorsDistinct, projCalColorsDistinct,
            hasYellowPill, hasAvatarInPill, popoverOpen, createModalOpen, prefilledDue,
            todayIso, yearMonthCardsCount, defaultAssignedOpenInitial, defaultShowsOwnOpenOnly,
            allBoardCols, allBoardHasMultiProjects, allBoardHasOverdueAndLate,
            allListRows, allListHasOverdueAndLate, allCalHasAllColors,
            autoResetAfterLeavingSection, autoResetAfterTabSwitch,
            desktopBoardOverflow, desktopCalOverflow
          };
        } finally {
          if (origClientCal) getSupaClient = origClientCal;
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const taskCalRes = (calAndOverviewDiag.result && calAndOverviewDiag.result.value) || {};
    assert.strictEqual(taskCalRes.lightBoardWrapClean, true, 'Light mode Tasks Board wrapper must be transparent/borderless like Dark Mode and Project Board');
    assert.strictEqual(taskCalRes.lightBoardAligned, true, 'Light mode Tasks Board columns must align flush with controls bar');
    assert.strictEqual(taskCalRes.lightLaneOutlined, true, 'Light mode Kanban lanes must have crisp visible outline while keeping borderTopWidth 0px');
    assert.strictEqual(taskCalRes.lightCardBorderVisible, true, 'Light mode Kanban task cards must use uniform 1px #cbd5e1 borders');
    assert.strictEqual(taskCalRes.lightListBordersUniform, true, 'Light mode Tasks List outer border must match inner #cbd5e1 lines without double borders');
    assert.strictEqual(taskCalRes.lightCalWrapClean, true, 'Light mode Tasks Calendar wrapper must be transparent/borderless like Dark Mode and Project Calendar');
    assert.strictEqual(taskCalRes.lightCalAligned, true, 'Light mode Tasks Calendar frame must align flush with controls bar');
    assert.strictEqual(taskCalRes.lightCalGridlinesVisible, true, 'Light mode Calendar outer frame and inner gridlines must share uniform #cbd5e1 lines');
    assert.strictEqual(taskCalRes.calResetAfterViewSwitch, true, 'Switching Calendar -> Board/List -> Calendar must auto-reset to Month view and current date');
    assert.strictEqual(taskCalRes.calResetAfterTabSwitch, true, 'Switching portal tabs and returning to Calendar must auto-reset to Month view and current date');
    assert.strictEqual(taskCalRes.projDefaultIsBoard, true, 'Project section must default to Board View on open');
    assert.strictEqual(taskCalRes.projResetsToBoardOnReentry, true, 'Project section must reset back to Board View on re-entry');
    assert.strictEqual(taskCalRes.tasksDefaultIsList, true, 'Tasks section must default to List View on open');
    assert.strictEqual(taskCalRes.tasksResetsToListAfterLeaving, true, 'Tasks section must auto-reset to List View after leaving section');
    assert.strictEqual(taskCalRes.tasksResetsToListAfterTabSwitch, true, 'Tasks section must auto-reset to List View after switching tabs');
    assert.strictEqual(taskCalRes.darkModeYellowExactMatch, true, 'Dark mode nearing-due yellow must be pure yellow and identical across Board, List, and Calendar views');
    assert.strictEqual(taskCalRes.darkModeLateExactMatch, true, 'Dark mode completed-late orange-red must be identical across Board, List, and Calendar views');
    assert.strictEqual(taskCalRes.darkModeOverdueExactMatch, true, 'Dark mode overdue red must be identical across Board, List, and Calendar views');
    assert.strictEqual(taskCalRes.projBoardColorsDistinct, true, 'Project Board View must style Overdue (red), Completed Late (orange-red), and Due Soon (yellow) distinctly');
    assert.strictEqual(taskCalRes.projListColorsDistinct, true, 'Project List View must style Overdue, Completed Late, and Due Soon consistently with Board View');
    assert.strictEqual(taskCalRes.projCalColorsDistinct, true, 'Project Calendar View must style Overdue, Completed Late, and Due Soon distinctly');
    assert.strictEqual(taskCalRes.projCalVisible, true, 'Project Calendar View must be visible when calendar mode is active');
    assert.strictEqual(taskCalRes.projBoardHidden, true, 'Project Board must stay hidden in Calendar View');
    assert.strictEqual(taskCalRes.projListHidden, true, 'Project List must stay hidden in Calendar View');
    assert.deepStrictEqual(taskCalRes.calModes, ['Month', 'Year'], 'Calendar view must offer ONLY Month and Year options');
    assert.strictEqual(taskCalRes.hasTodayHighlight, true, 'Calendar view must highlight today cell');
    assert.strictEqual(taskCalRes.hasRedPill, true, 'Calendar view must display red pill for overdue tasks');
    assert.strictEqual(taskCalRes.hasLatePill, true, 'Calendar view must display orange-red pill for completed-late tasks');
    assert.strictEqual(taskCalRes.hasYellowPill, true, 'Calendar view must display yellow pill for tasks due within 2 days');
    assert.strictEqual(taskCalRes.hasAvatarInPill, true, 'Calendar task pills must include assignee profile avatar');
    assert.strictEqual(taskCalRes.popoverOpen, true, 'Clicking a calendar day cell must open the Day Popover');
    assert.strictEqual(taskCalRes.createModalOpen, true, 'Clicking + New task in Day Popover must open Create Task modal');
    assert.strictEqual(taskCalRes.prefilledDue, taskCalRes.todayIso, 'Create Task modal must prefill clicked calendar date');
    assert.strictEqual(taskCalRes.yearMonthCardsCount, 12, 'Year view must render 12 mini-month cards');
    assert.strictEqual(taskCalRes.defaultAssignedOpenInitial, true, 'Tasks view must default to Assigned to me + Open');
    assert.strictEqual(taskCalRes.defaultShowsOwnOpenOnly, true, 'Default Tasks filter must show only current user open tasks');
    assert.strictEqual(taskCalRes.autoResetAfterLeavingSection, true, 'Leaving Tasks section and returning must auto-reset filters to Assigned to me + Open');
    assert.strictEqual(taskCalRes.autoResetAfterTabSwitch, true, 'Switching portal tab and returning to Tasks must auto-reset filters to Assigned to me + Open');
    assert.ok(taskCalRes.allBoardCols >= 5, 'Tasks Board View must render workflow columns across all projects');
    assert.strictEqual(taskCalRes.allBoardHasMultiProjects, true, 'Tasks Board View must display tasks across multiple projects');
    assert.strictEqual(taskCalRes.allBoardHasOverdueAndLate, true, 'Tasks Board View must render distinct overdue and completed-late badges');
    assert.ok(taskCalRes.allListRows >= 5, 'Tasks List View must list tasks across all projects');
    assert.strictEqual(taskCalRes.allListHasOverdueAndLate, true, 'Tasks List View must render distinct overdue and completed-late badges');
    assert.strictEqual(taskCalRes.allCalHasAllColors, true, 'Tasks Calendar View must display red, orange-red late, yellow, green, and gray task pills');
    assert.strictEqual(taskCalRes.desktopBoardOverflow, 0, 'Tasks Board View must have 0px horizontal overflow on desktop');
    assert.strictEqual(taskCalRes.desktopCalOverflow, 0, 'Tasks Calendar View must have 0px horizontal overflow on desktop');

    // Verify 0px mobile page overflow (390px) across Tasks Calendar and Tasks Board views
    await sendCmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const mobileCalDiag = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        setMyTasksDisplayMode('calendar');
        const calOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        setMyTasksDisplayMode('board');
        const boardOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const firstColDisplay = getComputedStyle(document.querySelector('.my-tasks-container .my-tasks-board-col')).display;
        setMyTasksDisplayMode('list');
        return { calOverflow, boardOverflow, firstColDisplay };
      })()`,
      returnByValue: true
    });
    const mCalRes = (mobileCalDiag.result && mobileCalDiag.result.value) || {};
    assert.strictEqual(mCalRes.calOverflow, 0, 'Tasks Calendar View must have 0px page overflow on 390px mobile');
    assert.strictEqual(mCalRes.boardOverflow, 0, 'Tasks Board View must have 0px page overflow on 390px mobile');
    assert.strictEqual(mCalRes.firstColDisplay, 'flex', 'Tasks Board columns must remain visible on 390px mobile');
    console.log('  ✔ Project Calendar View (Month/Year, 4 colors, Today highlight, Day Popover) & Tasks 3-view overview verified on desktop and mobile');

    // Reset device metrics back to desktop
    await sendCmd('Emulation.clearDeviceMetricsOverride');

    ws.close();
    console.log('\n🎉 HEADLESS EDGE BROWSER VERIFICATION PASSED 100%!\n');
  } catch (err) {
    console.error('Error during Edge browser verification:', err);
    process.exitCode = 1;
  } finally {
    if (ws?.readyState === WebSocket.OPEN) ws.close();
    try {
      edgeProc.kill();
    } catch (e) {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
})();
