// Production/dev server required. Supabase is fully intercepted; no live writes.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createPhaseFixture, id } = require('./fixtures/phase-db.cjs');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appUrl = process.env.APP_URL || 'http://localhost:3000';
(async () => {
  const db = await createPhaseFixture();
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const env = fs.readFileSync('.env.local', 'utf8');
  const host = new URL(env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1]).hostname;
  const profile = { id: id(99), name: 'Mobile tester', initials: 'MT', color: '#849884', onboarded_at: '2026-01-01' };
  const project = { id: id(1), name: 'Mobile workspace', owner: id(99), links: {}, calendar_colors: {} };
  const section = { id: id(21), project_id: id(1), name: 'Design', position: 0, color: null };
  const doc = { id: id(22), project_id: id(1), section_id: section.id, parent_id: null, owner: id(99), title: 'Mobile document', kind: 'Design', status: 'wip', summary: 'A document for touch testing.', tags: [], links: [], position: 0, updated_at: '2026-10-25T12:00:00Z' };
  let blocks = [{ id: id(23), page_id: doc.id, type: 'text', content: { text: 'Edit this text on iPhone.' }, position: 0 }];
  let canvas = { id: id(24), project_id: id(1), name: 'Mobile canvas', position: 0, folder_id: null, updated_at: doc.updated_at, data: {} };
  const events = [];
  await context.addInitScript(({ host, profile }) => {
    localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({ access_token: btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:profile.id,exp:Math.floor(Date.now()/1000)+86400}))+'.fixture', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, expires_in: 86400, token_type: 'bearer', user: { id: profile.id, email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated' } }));
  }, { host, profile });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname !== host) return route.continue();
    const name = url.pathname.split('/').pop();
    let data = [];
    try {
      if (url.pathname.includes('/auth/')) data = { user: profile };
      else if (url.pathname.includes('/rpc/')) {
        const body = request.postDataJSON() || {};
        if (name === 'gantt_snapshot' || name === 'phase_snapshot') data = (await db.query(`select ${name}($1) s`, [id(1)])).rows[0].s;
        else if (['gantt_mutate', 'gantt_mutate_hierarchy'].includes(name)) data = (await db.query(`select ${name}($1,$2,$3) s`, [body.p_project, body.p_expected, body.p_action])).rows[0].s;
      } else if (['boards', 'board_columns', 'board_cards'].includes(name)) data = (await db.query(`select * from ${name} order by position nulls last,id`)).rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v])));
      else if (name === 'profiles') data = [profile];
      else if (name === 'project_members') data = [{ project_id: id(1), role: 'owner', user_id: id(99), profile, profiles: profile, project, projects: project }];
      else if (name === 'projects') data = [project];
      else if (name === 'sections') data = [section];
      else if (name === 'pages') data = [doc];
      else if (name === 'blocks') {
        if (request.method() === 'POST') {
          const rows = request.postDataJSON();
          for (const row of (Array.isArray(rows) ? rows : [rows])) blocks = blocks.map(b => b.id === row.id ? { ...b, ...row } : b);
        }
        data = blocks;
      } else if (name === 'canvases') {
        if (request.method() === 'PATCH') canvas = { ...canvas, ...request.postDataJSON() };
        data = [canvas];
      } else if (name === 'board_categories') data = [{ id: id(70), name: 'mechanic' }];
      else if (name === 'calendar_events') {
        if (request.method() === 'POST') events.push({ id: id(80 + events.length), ...request.postDataJSON() });
        data = events;
      }
      if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    } catch (error) {
      await route.fulfill({ status: 400, json: { message: error.message, code: 'P0001' } });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push({ route: page.url(), message: error.message }));
  async function fits(label) {
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, layout: innerWidth, visible: visualViewport.width }));
    assert.ok(size.scroll <= size.width + 1, `${label}: document overflow ${JSON.stringify(size)}`);
    assert.ok(Math.abs(size.layout - size.visible) <= 1, `${label}: Safari viewport enlarged ${JSON.stringify(size)}`);
  }
  try {
    for (const [route, ready] of [['/home', 'Home'], ['/work', 'My Work'], ['/board', 'Gameplay'], ['/calendar', 'Calendar'], ['/table', 'Gantt'], ['/milestones', 'Milestones'], ['/digest', 'Weekly digest'], ['/doc', 'Edit this text on iPhone.']]) {
      await page.goto(appUrl + route);
      if (route === '/doc') await page.getByText(ready, { exact: true }).waitFor({ timeout: 20000 });
      else if (route === '/board') await page.locator('.kanban-group').filter({ hasText: ready }).waitFor({ timeout: 20000 });
      else await page.locator('.topbar').waitFor({ timeout: 20000 });
      for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
        await page.setViewportSize(viewport);
        await fits(`${route} at ${viewport.width}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `/tmp/foundry-mobile-${engine}-${route.slice(1)}.png` });
    }
    // Every destination remains reachable by horizontal touch navigation.
    const dock = page.locator('.dock');
    const milestone = dock.getByRole('button', { name: /^Milestones/ });
    await milestone.scrollIntoViewIfNeeded();
    await milestone.tap();
    await page.waitForURL('**/milestones');
    await fits('dock navigation');
    await page.goto(appUrl + '/doc');
    await page.getByText('Edit this text on iPhone.', { exact: true }).waitFor();
    const text = page.locator('.blk-text[contenteditable=true]').first();
    await text.fill('Saved with a touch keyboard.');
    await text.blur();
    await page.getByText('Saved', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Saved with a touch keyboard.', { exact: true }).waitFor();
    const search = page.getByRole('button', { name: /^Search \(/ });
    await search.scrollIntoViewIfNeeded(); await search.tap();
    await page.locator('.palette').waitFor(); await fits('search dialog');
    await page.getByRole('button', { name: 'Close search', exact: true }).tap();
    await page.getByRole('button', { name: /Show page navigation|Show sidebar|Hide sidebar|Toggle sidebar|Page navigation/i }).first().tap();
    await page.locator('.sidebar').waitFor({ state: 'visible' });
    await fits('page drawer');
    const backdrop = page.getByRole('button', { name: 'Close navigation' });
    const backdropBox = await backdrop.boundingBox();
    await backdrop.tap({ position: { x: backdropBox.width - 12, y: 60 } });
    const share = page.getByRole('button', { name: 'Share', exact: true });
    await share.scrollIntoViewIfNeeded(); await share.tap();
    await page.getByRole('dialog', { name: 'Share this page' }).waitFor();
    await fits('share panel');
    await page.keyboard.press('Escape');
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.scrollIntoViewIfNeeded(); await settings.tap();
    await page.getByRole('dialog', { name: /Settings/ }).waitFor();
    await fits('settings dialog');
    await page.keyboard.press('Escape');
    await page.goto(appUrl + '/board');
    const task = page.locator('.card').filter({ hasText: 'Prototype' }).first();
    await task.tap();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();
    await fits('task edit');
    assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), 'Prototype');
    await page.getByLabel('Description', { exact: true }).waitFor();
    await page.getByLabel('Priority', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await page.getByRole('button', { name: 'Close task details' }).tap();
    await page.goto(appUrl + '/calendar');
    const date = page.getByRole('button', { name: /^Add event on / }).first();
    const dateBox = await date.boundingBox();
    await date.tap({ position: { x: dateBox.width / 2, y: dateBox.height - 10 } });
    await page.getByLabel('Event title', { exact: true }).fill('Created on iPhone');
    await fits('calendar event form');
    await page.getByRole('button', { name: 'Save event', exact: true }).tap();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(events[0].title, 'Created on iPhone');
    if (engine === 'chromium') {
      await page.goto(appUrl + '/table');
      const chart = page.locator('.phase-scroll');
      await chart.waitFor();
      const emptyTrack = page.locator('.phase-track-drawable').last();
      await emptyTrack.waitFor();
      await chart.evaluate(el => { el.scrollLeft = 0; });
      const box = await emptyTrack.boundingBox();
      const cdp = await context.newCDPSession(page);
      const x = 360, y = box.y + box.height - 12;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 15, y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelector('.phase-scroll').scrollLeft > 20);
      await cdp.detach();
    }
    await page.goto(appUrl + '/doc/canvas');
    const shapes = page.getByRole('button', { name: 'Shapes', exact: true });
    await shapes.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Shapes"]')?.disabled);
    await fits('canvas');
    await shapes.scrollIntoViewIfNeeded(); await shapes.tap();
    const palette = page.getByRole('group', { name: 'Shape types' });
    await palette.waitFor();
    const bounds = await palette.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Shape palette stays on screen');
    await palette.getByRole('button', { name: 'Ellipse', exact: true }).tap();
    const canvasBox = await page.locator('.tl-canvas').boundingBox();
    await page.touchscreen.tap(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.locator('.tl-shape').first().waitFor();
    await page.getByRole('button', { name: 'Show workspace navigation', exact: true }).tap();
    const home = page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name: /^Home/ });
    await home.scrollIntoViewIfNeeded(); await home.tap();
    await page.waitForURL('**/home');
    console.log(`${engine}: mobile layouts, touch navigation, editor saves, search, drawers, settings, task forms, calendar creation and canvas tool navigation passed.`);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error('Page state:', await page.locator('body').innerText(), errors);
    await page.screenshot({ path: `/tmp/foundry-mobile-${engine}-failure.png` });
    throw error;
  } finally {
    await browser.close(); await db.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
