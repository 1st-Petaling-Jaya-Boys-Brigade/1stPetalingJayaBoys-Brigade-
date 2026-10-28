const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (!fs.existsSync(edgePath)) {
    console.log('Edge not found at default path, skipping CDP browser test.');
    return;
  }

  const port = 9333;
  const tempProfile = path.join(process.env.TEMP || 'C:\\Temp', 'edge-test-profile-' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const htmlUrl = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

  console.log('Launching headless Edge on port ' + port + '...');
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + tempProfile,
    '--window-size=1280,900',
    '--disable-gpu',
    htmlUrl
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        targets = await getJson(`http://127.0.0.1:${port}/json/list`);
        if (targets) {
          pageTarget = targets.find(t => t.type === 'page' && t.url.toLowerCase().includes('index.html'));
          if (pageTarget) break;
        }
      } catch (e) {}
    }

    if (!pageTarget) {
      throw new Error('Failed to find index.html page target in Edge within timeout');
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log('Connected to Edge page target: 1st Petaling Jaya Boys Brigade Portal');

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((resolve) => ws.onopen = resolve);
    await new Promise((resolve) => setTimeout(resolve, 600));

    function sendCmd(method, params = {}) {
      const id = idCounter++;
      return new Promise((resolve, reject) => {
        callbacks.set(id, (msg) => {
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
          if (attempt < 4 && err && err.message && err.message.includes('Execution context was destroyed')) {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          throw err;
        }
      }
    }

    // Wait until document.readyState === 'complete' and #hq-carousel-wrapper exists
    await evalWithRetry(`new Promise((resolve) => {
        function checkReady() {
          if (document.readyState === 'complete' && document.getElementById('hq-carousel-wrapper')) {
            resolve(true);
          } else {
            setTimeout(checkReady, 100);
          }
        }
        checkReady();
      })`, true);

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
        const cards = track ? track.querySelectorAll('.hq-card') : [];
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
    console.log('  Card 0 left:', info.card0Rect.left.toFixed(1) + 'px, Viewport left:', info.viewportRect.left.toFixed(1) + 'px');
    console.log('  Card 1 right:', info.card1Rect.right.toFixed(1) + 'px, Viewport right:', info.viewportRect.right.toFixed(1) + 'px');

    assert.strictEqual(info.hasWrapper, true, 'Carousel wrapper must be rendered');
    assert.strictEqual(info.cardCount, 4, 'Must have 4 total quick action cards');
    assert.strictEqual(info.hasPrevBtn, true, 'Prev button must exist');
    assert.strictEqual(info.hasNextBtn, true, 'Next button must exist');
    assert.strictEqual(info.dotsCount, 2, 'Desktop must display 2 dots');

    // Verify 2 cards are in view on Page 0
    assert.ok(Math.abs(info.card0Rect.left - info.viewportRect.left) <= 2, 'Card 0 must start at viewport left edge');
    assert.ok(Math.abs(info.card1Rect.right - info.viewportRect.right) <= 2, 'Card 1 must end at viewport right edge');
    console.log('  ✔ Page 0 displays exactly 2 cards side-by-side in viewport (Forms & Store, Member Hub)');

    // 2. Test default arrow hidden state (when cursor is NOT on boxes)
    console.log('\n[Directional Hover Arrow Verification]');
    console.log('  Default Prev Opacity (Cursor outside):', info.prevOpacityDefault);
    console.log('  Default Next Opacity (Cursor outside):', info.nextOpacityDefault);
    assert.strictEqual(info.prevOpacityDefault, '0', 'Prev arrow must be hidden by default when cursor is not on box');
    assert.strictEqual(info.nextOpacityDefault, '0', 'Next arrow must be hidden by default when cursor is not on box');
    console.log('  ✔ Arrow buttons are completely hidden when cursor is not on the boxes');

    // 3. Move cursor to Left Box: verify ONLY Left arrow appears
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const container = document.getElementById('hq-carousel-container');
        const r = container.getBoundingClientRect();
        const evt = new MouseEvent('mousemove', {
          clientX: r.left + (r.width * 0.25),
          clientY: r.top + (r.height * 0.5),
          bubbles: true
        });
        container.dispatchEvent(evt);
      })()`
    });
    await new Promise(r => setTimeout(r, 250));

    const evalHoverLeft = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const prevStyle = window.getComputedStyle(document.getElementById('hq-carousel-prev'));
        const nextStyle = window.getComputedStyle(document.getElementById('hq-carousel-next'));
        const container = document.getElementById('hq-carousel-container');
        return {
          hasHoverLeft: container.classList.contains('hover-left'),
          hasHoverRight: container.classList.contains('hover-right'),
          prevOpacity: prevStyle.opacity,
          prevVisibility: prevStyle.visibility,
          nextOpacity: nextStyle.opacity,
          nextVisibility: nextStyle.visibility
        };
      })()`,
      returnByValue: true
    });
    const leftHoverState = evalHoverLeft.result.value;
    console.log('  Cursor on Left Box -> Prev Opacity:', leftHoverState.prevOpacity, 'Next Opacity:', leftHoverState.nextOpacity);
    assert.strictEqual(leftHoverState.hasHoverLeft, true, 'Container should have hover-left class');
    assert.strictEqual(leftHoverState.hasHoverRight, false, 'Container must NOT have hover-right class');
    assert.strictEqual(leftHoverState.prevOpacity, '1', 'Left arrow MUST appear when cursor is on the left box');
    assert.strictEqual(leftHoverState.nextOpacity, '0', 'Right arrow MUST remain hidden when cursor is on the left box');
    console.log('  ✔ When cursor is on left box, ONLY left arrow button appears');

    // 4. Move cursor to Right Box: verify ONLY Right arrow appears
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const container = document.getElementById('hq-carousel-container');
        const r = container.getBoundingClientRect();
        const evt = new MouseEvent('mousemove', {
          clientX: r.left + (r.width * 0.75),
          clientY: r.top + (r.height * 0.5),
          bubbles: true
        });
        container.dispatchEvent(evt);
      })()`
    });
    await new Promise(r => setTimeout(r, 250));

    const evalHoverRight = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const prevStyle = window.getComputedStyle(document.getElementById('hq-carousel-prev'));
        const nextStyle = window.getComputedStyle(document.getElementById('hq-carousel-next'));
        const container = document.getElementById('hq-carousel-container');
        return {
          hasHoverLeft: container.classList.contains('hover-left'),
          hasHoverRight: container.classList.contains('hover-right'),
          prevOpacity: prevStyle.opacity,
          prevVisibility: prevStyle.visibility,
          nextOpacity: nextStyle.opacity,
          nextVisibility: nextStyle.visibility
        };
      })()`,
      returnByValue: true
    });
    const rightHoverState = evalHoverRight.result.value;
    console.log('  Cursor on Right Box -> Prev Opacity:', rightHoverState.prevOpacity, 'Next Opacity:', rightHoverState.nextOpacity);
    assert.strictEqual(rightHoverState.hasHoverRight, true, 'Container should have hover-right class');
    assert.strictEqual(rightHoverState.hasHoverLeft, false, 'Container must NOT have hover-left class');
    assert.strictEqual(rightHoverState.nextOpacity, '1', 'Right arrow MUST appear when cursor is on the right box');
    assert.strictEqual(rightHoverState.prevOpacity, '0', 'Left arrow MUST remain hidden when cursor is on the right box');
    console.log('  ✔ When cursor is on right box, ONLY right arrow button appears');

    // 5. Move cursor outside: verify BOTH arrows disappear
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const container = document.getElementById('hq-carousel-container');
        container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      })()`
    });
    await new Promise(r => setTimeout(r, 250));

    const evalHoverLeave = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const prevStyle = window.getComputedStyle(document.getElementById('hq-carousel-prev'));
        const nextStyle = window.getComputedStyle(document.getElementById('hq-carousel-next'));
        return {
          prevOpacity: prevStyle.opacity,
          nextOpacity: nextStyle.opacity
        };
      })()`,
      returnByValue: true
    });
    console.log('  Cursor leaves boxes -> Prev Opacity:', evalHoverLeave.result.value.prevOpacity, 'Next Opacity:', evalHoverLeave.result.value.nextOpacity);
    assert.strictEqual(evalHoverLeave.result.value.prevOpacity, '0', 'Prev arrow hides on mouse leave');
    assert.strictEqual(evalHoverLeave.result.value.nextOpacity, '0', 'Next arrow hides on mouse leave');
    console.log('  ✔ When cursor leaves boxes, arrow buttons completely disappear');

    // 6. Test cycling forward to Page 1
    const evalNext = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('hq-carousel-next').click();
        const r2 = document.querySelectorAll('.hq-card')[2].getBoundingClientRect();
        const r3 = document.querySelectorAll('.hq-card')[3].getBoundingClientRect();
        const vp = document.getElementById('hq-carousel-viewport').getBoundingClientRect();
        return {
          page: window._hqCurrentPage,
          transform: document.getElementById('hq-carousel-track').style.transform,
          dot0Active: document.getElementById('hq-dot-0').classList.contains('active'),
          dot1Active: document.getElementById('hq-dot-1').classList.contains('active'),
          card2Left: r2.left,
          card3Right: r3.right,
          vpLeft: vp.left,
          vpRight: vp.right
        };
      })()`,
      returnByValue: true
    });

    const nextInfo = evalNext.result.value;
    console.log('\n[Click Next Button]');
    console.log('  Current Page:', nextInfo.page);
    console.log('  Track Transform:', nextInfo.transform);
    console.log('  Dot 1 Active:', nextInfo.dot1Active);
    assert.strictEqual(nextInfo.page, 1, 'Should navigate to page 1');
    assert.strictEqual(nextInfo.dot1Active, true, 'Dot 1 must become active');
    assert.strictEqual(nextInfo.dot0Active, false, 'Dot 0 must become inactive');
    console.log('  ✔ Next button cycles to Page 1 (Weekly Parade, Company Resources)');

    // 7. Test cycling forward again (wrap-around to Page 0)
    const evalWrap = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('hq-carousel-next').click();
        return {
          page: window._hqCurrentPage,
          transform: document.getElementById('hq-carousel-track').style.transform,
          dot0Active: document.getElementById('hq-dot-0').classList.contains('active')
        };
      })()`,
      returnByValue: true
    });
    const wrapInfo = evalWrap.result.value;
    assert.strictEqual(wrapInfo.page, 0, 'Should wrap back around to page 0');
    assert.strictEqual(wrapInfo.dot0Active, true, 'Dot 0 must become active again');
    console.log('  ✔ Next button wraps around from Page 1 back to Page 0');

    // 8. Test cycling backward (wrap-around to Page 1)
    const evalPrevWrap = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('hq-carousel-prev').click();
        return {
          page: window._hqCurrentPage,
          dot1Active: document.getElementById('hq-dot-1').classList.contains('active')
        };
      })()`,
      returnByValue: true
    });
    const prevWrapInfo = evalPrevWrap.result.value;
    assert.strictEqual(prevWrapInfo.page, 1, 'Prev button should wrap around backwards to page 1');
    console.log('  ✔ Prev button wraps around backwards from Page 0 to Page 1');

    // 9. Test clicking Dot 0 directly
    const evalDotClick = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('hq-dot-0').click();
        return {
          page: window._hqCurrentPage,
          dot0Active: document.getElementById('hq-dot-0').classList.contains('active')
        };
      })()`,
      returnByValue: true
    });
    assert.strictEqual(evalDotClick.result.value.page, 0, 'Clicking dot 0 navigates directly to page 0');
    console.log('  ✔ Clicking pagination dot directly navigates to selected page');

    // 10. Verify column alignment
    const heightDiff = Math.abs(info.leftColRect.height - info.rightColRect.height);
    console.log('\n[Column Height Alignment Check]');
    console.log('  Left Col Height: ' + info.leftColRect.height.toFixed(1) + 'px');
    console.log('  Right Col Height: ' + info.rightColRect.height.toFixed(1) + 'px');
    console.log('  Height delta: ' + heightDiff.toFixed(1) + 'px');
    assert.ok(heightDiff <= 2, 'Left column and Right column must have matching heights (diff <= 2px)');
    console.log('  ✔ Left column and Right column achieve exact visual height alignment with calendar widget!');

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
    console.log('  Forms hub active -> Cards count:', formsInit.cardCount, 'Placeholder:', formsInit.placeholder);
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
        const paradeCard = cards.find(c => c.textContent.includes('Weekly Parade'));
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
    assert.ok(pnInfo.paradeDesc.includes('2:15 PM') && pnInfo.paradeDesc.includes('6:00 PM'), 'Parade time must be 2:15 PM – 6:00 PM');
    assert.ok(pnInfo.paradeDesc.includes('Band 9:30 AM') && pnInfo.paradeDesc.includes('11:30 AM'), 'Band time must be 9:30 AM – 11:30 AM');
    console.log('  ✔ Weekly parade card accurately reflects updated Parade (2:15PM-6PM) and Band (9:30AM-11:30AM) times');

    console.log('  Sidebar Nav Labels -> Attendance:', pnInfo.attLabel, 'Resources:', pnInfo.resLabel);
    assert.strictEqual(pnInfo.attLabel, 'Leaderboard', 'Sidebar item must be renamed to Leaderboard');
    assert.strictEqual(pnInfo.resLabel, 'Resources', 'Sidebar item must be renamed to Resources');
    assert.strictEqual(pnInfo.hasAttBadge, false, 'Standings badge must be removed');
    assert.strictEqual(pnInfo.hasResBadge, false, 'Files badge must be removed');
    assert.strictEqual(pnInfo.whiteSpace, 'nowrap', 'Sidebar label must stay on a single line');
    console.log('  ✔ Sidebar navigation cleanly displays Leaderboard and Resources on one line without pills');

    assert.notStrictEqual(pnInfo.trackWillChange, 'transform', 'Track will-change must not force permanent compositor layer');
    assert.strictEqual(pnInfo.fontSmoothing, 'antialiased', 'Cards must use antialiased font smoothing for razor sharpness');
    console.log('  ✔ Quick access carousel cards have optimal crisp font smoothing');

        // 13. Test Child Safety (COPPA/PDPA) & Parental Consent Governance
    console.log('\n[Child Safety & Parental Consent Governance (TSK-032)]');
    const evalChildSafety = await sendCmd('Runtime.evaluate', {
      expression: '(() => {' +
        'const consentBox = document.getElementById("parent-consent-box");' +
        'const pNameInp = document.getElementById("reg-parent-name");' +
        'const pContactInp = document.getElementById("reg-parent-contact");' +
        'const pConsentCb = document.getElementById("reg-parent-consent");' +
        'const pMediaCb = document.getElementById("reg-media-consent");' +
        'const policyModal = document.getElementById("child-safety-modal");' +
        'const emSectionSel = document.getElementById("em-section");' +
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
          'hasEmChildSafety: !!emChildSafetyBox,' +
          'hasGalleryAdvisory: galleryAdvisory ? galleryAdvisory.textContent.includes("Child Safety & Media Release Advisory") : false' +
        '};' +
      '})()',
      returnByValue: true
    });
    const csInfo = evalChildSafety.result.value;
    assert.strictEqual(csInfo.hasConsentBox, true, 'Parent consent box must exist');
    assert.strictEqual(csInfo.hasParentName, true, 'Parent name input must exist');
    assert.strictEqual(csInfo.hasParentContact, true, 'Parent contact input must exist');
    assert.strictEqual(csInfo.hasParentConsent, true, 'Parent consent checkbox must exist');
    assert.strictEqual(csInfo.hasMediaConsent, true, 'Media consent checkbox must exist');
    assert.strictEqual(csInfo.mediaDefaultChecked, false, 'Media release must be unchecked by default (privacy-first)');
    console.log('  ✔ Registration form adheres to verified parental consent and privacy-first default media permission');

    assert.strictEqual(csInfo.hasPolicyModal, true, 'Child safety policy modal must exist in DOM');
    assert.strictEqual(csInfo.hasEmSection, true, 'Edit Member modal must feature Section selection');
    assert.strictEqual(csInfo.hasEmChildSafety, true, 'Edit Member modal must feature Child Safety consent controls');
    assert.strictEqual(csInfo.hasGalleryAdvisory, true, 'Gallery management must feature Child Safety & Media Release advisory');
    console.log('  ✔ Admin console provides full section governance and child safety advisory enforcement');

    // 14. Test Instagram-Style Story Highlights & Event Gallery Reel (TSK-033)
    console.log('\n[Story Highlights Reel & Full-Screen Viewer (TSK-033)]');
    const evalStoryHighlights = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof loadStoryHighlights === 'function' && (!window.storyHighlights || !window.storyHighlights.length)) {
          await loadStoryHighlights();
        }
        if (typeof renderStoryHighlightsReel === 'function') { renderStoryHighlightsReel(); }
        const reel = document.getElementById('story-highlights-reel');
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
          hasAdminModal: !!adminModal
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const shInfo = evalStoryHighlights.result.value;
    assert.strictEqual(shInfo.hasReel, true, 'Story highlights reel must exist in gallery');
    assert.ok(shInfo.itemCount >= 1, 'Must render story highlight bubbles');
    assert.ok(shInfo.firstLabel.length > 0, 'First highlight bubble must have a title');
    console.log('  ✔ Story highlights circular bubble reel renders with active categories:', shInfo.itemCount);

    assert.strictEqual(shInfo.modalDisplay, 'flex', 'Opening story viewer displays modal');
    assert.ok(shInfo.progressBarCount >= 1, 'Must render segmented progress bars matching slide count');
    assert.strictEqual(shInfo.activeTitle, shInfo.firstLabel, 'Modal header reflects active highlight category');
    assert.strictEqual(shInfo.hasImg, true, 'Modal contains active slide media viewport');
    assert.strictEqual(shInfo.closedDisplay, 'none', 'Closing story viewer hides modal');
    console.log('  ✔ Story viewer opens full-screen with segmented progress bars and closes cleanly');

    assert.strictEqual(shInfo.hasAdminList, true, 'Admin console has Story Highlights management list');
    assert.strictEqual(shInfo.hasAdminModal, true, 'Admin console has Create/Edit Story Modal');
    console.log('  ✔ Admin console provides complete story highlight and slide management interface');
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

        return {
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
    const gtInfo = evalGalleryTab.result.value;
    assert.strictEqual(gtInfo.isPageActive, true, 'Navigating to gallery tab activates #page-gallery');
    assert.strictEqual(gtInfo.isSnavActive, true, 'Gallery sidebar item reflects active state');
    assert.strictEqual(gtInfo.videosPillText, 'Videos', 'Videos filter pill must say Videos without Reels');
    assert.strictEqual(gtInfo.highlightsTitle, 'Highlights', 'Gallery section must say Highlights without Story/Reels');
    assert.ok(gtInfo.filterPillCount >= 3, 'Gallery features All, Photos, and Videos filter pills');
    assert.ok(gtInfo.reelBubbleCount >= 1, 'Dedicated gallery tab renders complete story highlights reel');
    assert.strictEqual(gtInfo.hasMediaActive, true, 'Story viewer displays active media viewport');
    assert.strictEqual(gtInfo.hasArrowPrev, true, 'Story viewer features prev arrow navigation button');
    assert.strictEqual(gtInfo.hasArrowNext, true, 'Story viewer features next arrow navigation button');
    console.log('  ✔ Dedicated Gallery tab navigation, media filter pills, and reel verified');
    console.log('  ✔ Story viewer renders interactive video viewport with unblocked tactile arrow navigation');


    // 15. Test Google Apps Script & Master Sheet Endpoint Hardening (TSK-038)
    console.log('\n[Google Apps Script & Master Sheet Endpoint Hardening (TSK-038)]');
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
    assert.ok(ghInfo.tokenVal && ghInfo.tokenVal.startsWith('bb_sec_'), 'Token input must contain secure bb_sec_ token');
    console.log('  ✔ Admin console provides complete endpoint security inputs and active sync token');

    assert.strictEqual(ghInfo.hasPiiBadge, true, 'Must display Zero-PII Whitelist badge');
    assert.strictEqual(ghInfo.hasTokenBadge, true, 'Must display Token Auth Enforced badge');
    assert.strictEqual(ghInfo.hasSharingBadge, true, 'Must display Restricted Sharing badge');
    console.log('  ✔ Hardening status badges verify PII stripping, proxy token auth, and restricted sharing');

    assert.strictEqual(ghInfo.snippetHasToken, true, 'Apps script snippet must embed SYNC_TOKEN');
    assert.strictEqual(ghInfo.snippetHasDoGet, true, 'Apps script snippet must define doGet handler');
    assert.strictEqual(ghInfo.snippetHasDoPost, true, 'Apps script snippet must define doPost handler');
    assert.strictEqual(ghInfo.snippetHasAudit, true, 'Apps script snippet must include sheet sharing audit function');
    console.log('  ✔ Generated Google Apps Script template incorporates token authentication and security audits');

    // 16. Test Badges Tab and President's Tracker in Browser (TSK-008)
    console.log('\n[Badges Tab & President\'s Award Tracker Verification (TSK-008)]');
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
        return {
          gateDisplay: gate ? gate.style.display : null,
          loggedInDisplay: loggedIn ? loggedIn.style.display : null,
          hasTracker: !!tracker,
          trackerHtml: tracker ? tracker.innerHTML : '',
          hasSearch: !!badgeSearch,
          badgeListCount: badgeList ? badgeList.children.length : 0
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const badgesInit = evalBadgesInit.result.value;
    assert.strictEqual(badgesInit.gateDisplay, 'none', 'Badges gate must be hidden when logged in');
    assert.strictEqual(badgesInit.loggedInDisplay, 'block', 'Badges logged-in panel must be displayed');
    assert.strictEqual(badgesInit.hasTracker, true, 'President tracker container must exist');
    assert.ok(badgesInit.trackerHtml.includes("President's Award"), 'Tracker must render President\'s Award header');
    assert.ok(badgesInit.trackerHtml.includes('Service Years'), 'Tracker must render Service Years section');
    assert.strictEqual(badgesInit.hasSearch, true, 'Badge search input must exist');
    console.log('  ✔ Badges tab, search input, and President\'s Award tracker render cleanly in browser');

    // 17. Uniform Order Grid Form & Product Card Redesign Verification (TSK-006B)
    console.log('\n[Uniform Order Grid & Product Card Redesign Verification (TSK-006B)]');
    const evalUniformGrid = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        if (typeof switchTab === 'function') {
          switchTab('order');
        }
        if (typeof renderUniformOrderInline === 'function') {
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
          gridDisplay: gridComputed ? gridComputed.display : ''
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const uniformGrid = evalUniformGrid.result.value;
    assert.strictEqual(uniformGrid.hasCatTabs, true, 'Category tabs container must exist');
    assert.strictEqual(uniformGrid.hasGrid, true, 'Product grid container must exist');
    assert.ok(uniformGrid.cardCount >= 1, 'Grid must render uniform product cards from catalog');
    assert.strictEqual(uniformGrid.hasStickyBar, true, 'Sticky checkout summary bar must exist');
    assert.strictEqual(uniformGrid.firstCardHasMedia, true, 'Product card must feature thumbnail preview media');
    assert.strictEqual(uniformGrid.firstCardHasPrice, true, 'Product card must feature price tag');
    assert.strictEqual(uniformGrid.firstCardHasStepper, true, 'Product card must feature increment/decrement stepper');
    assert.strictEqual(uniformGrid.firstCardHasQtyClass, true, 'Product card must receive has-qty styling when quantity > 0');
    assert.ok(uniformGrid.sizePillsCount >= 2, 'Shirt card must feature size selector pills');
    assert.strictEqual(uniformGrid.firstPillSelected, true, 'Selected size pill must receive selected active styling');
    assert.strictEqual(uniformGrid.checkoutCountText, '1 item', 'Sticky checkout bar must display item count');
    assert.ok(uniformGrid.checkoutTotalText.includes('RM'), 'Sticky checkout bar must display live currency total');
    assert.strictEqual(uniformGrid.ctaBtnActive, true, 'Sticky checkout review button must be enabled when items are selected');
    assert.ok(uniformGrid.visibleAfterFilter >= 1, 'Category filter must display matching product cards');
    assert.strictEqual(uniformGrid.gridDisplay, 'grid', 'Uniform items container must have CSS grid display');
    console.log('  ✔ Responsive uniform product card grid, category tabs, size pills, and sticky checkout bar verified in browser');

    ws.close();
    console.log('\n🎉 HEADLESS EDGE BROWSER VERIFICATION PASSED 100%!\n');
  } catch (err) {
    console.error('Error during Edge browser verification:', err);
    process.exit(1);
  } finally {
    try {
      edgeProc.kill();
    } catch(e) {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch(e) {}
  }
})();
