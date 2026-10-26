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

    // Wait until document.readyState === 'complete' and #hq-carousel-wrapper exists
    await sendCmd('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        function checkReady() {
          if (document.readyState === 'complete' && document.getElementById('hq-carousel-wrapper')) {
            resolve(true);
          } else {
            setTimeout(checkReady, 100);
          }
        }
        checkReady();
      })`,
      awaitPromise: true
    });

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
