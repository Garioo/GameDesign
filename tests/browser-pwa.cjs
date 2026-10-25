// Verifies installation metadata and the public offline launch fallback.
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appUrl = process.env.APP_URL || 'http://localhost:3000';
(async () => {
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(appUrl + '/login');
    await page.locator('.install-help').waitFor();
    const metadata = await page.evaluate(async () => ({
      viewport: document.querySelector('meta[name=viewport]').content,
      capable: document.querySelector('meta[name=mobile-web-app-capable], meta[name=apple-mobile-web-app-capable]').content,
      icon: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),
      manifest: await (await fetch(document.querySelector('link[rel=manifest]').href)).json(),
    }));
    assert.ok(metadata.viewport.includes('viewport-fit=cover'));
    assert.ok(!metadata.viewport.includes('user-scalable=no'), 'Pinch zoom remains available');
    assert.equal(metadata.capable, 'yes');
    assert.equal(metadata.manifest.display, 'standalone');
    assert.equal(metadata.manifest.start_url, '/home');
    assert.equal(metadata.manifest.scope, '/');
    for (const path of [...metadata.manifest.icons.map(icon => icon.src), metadata.icon]) {
      const response = await context.request.get(appUrl + path);
      assert.equal(response.status(), 200);
      assert.ok(response.headers()['content-type'].includes('image/png'));
    }
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // WebKit's offline transport emulation can fail the navigation internally
    // before delivering a service-worker response; exercise this transport in Chromium.
    if (engine === 'chromium') {
    await context.setOffline(true);
    await page.goto(appUrl + '/home');
    await page.getByRole('heading', { name: "You're offline" }).waitFor();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Try again' }).tap();
    await page.waitForURL('**/login');
    }
    await context.close();
    const installed = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await installed.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const app = await installed.newPage();
    await app.goto(appUrl + '/login');
    await app.getByRole('button', { name: 'Continue with Google' }).waitFor();
    await app.waitForFunction(() => document.querySelector('.install-help') === null);
    console.log(`${engine}: standalone manifest, Apple metadata/icons, accessible viewport and installed-mode instructions passed${engine === 'chromium' ? '; offline reconnect passed' : ''}.`);
    await installed.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
