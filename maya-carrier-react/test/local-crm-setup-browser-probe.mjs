// Narrow UI-only check against existing happy mock. No real backend or provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
const origin = 'http://127.0.0.1:8792';
const output = process.argv[2];
assert.ok(output?.startsWith('/tmp/maya-local-crm-setup-'), 'Use a dedicated scratch directory');
fs.mkdirSync(output, { recursive: true });
const browser = await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']);
try {
  const page = await browser.newPage();
  await page.goto(origin + '/?local_crm_setup=1');
  assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
  await page.click('Q.byName("button", /^Войти по email$/)');
  assert.ok(await page.waitFor('!!Q.email()'));
  await page.fill('Q.email()', 'anna@example.test');
  await page.click('Q.byName("button", /^Получить код$/)');
  assert.ok(await page.waitFor('!!Q.code()'));
  await page.fill('Q.code()', '246810');
  await page.click('Q.byName("button", /^Войти$/)');
  assert.ok(await page.waitFor('document.body.innerText.includes("Локальное подключение YCLIENTS")'));
  assert.equal(page.apiRequests('/integrations/crm').length, 0, 'Mount must not read or connect');
  assert.equal(await page.eval('Q.byName("button", /^Активировать и импортировать$/).disabled'), true);
  assert.equal(await page.eval('Q.byName("button", /^Проверить и сохранить подключение$/).disabled'), true);
  await page.click('Q.byName("button", /^Проверить подключение и результат$/)');
  assert.ok(await page.waitFor('document.body.innerText.includes("Не удалось подтвердить актуальное подключение")'));
  assert.equal(await page.eval('Q.byName("button", /^Проверить и сохранить подключение$/).disabled'), true);
  const setupCalls = page.apiRequests('/integrations/crm');
  assert.equal(setupCalls.length, 1);
  assert.equal(setupCalls[0].method, 'GET');
  assert.equal(setupCalls[0].status, 404, 'Existing happy mock does not implement A17');
  for (const request of page.requests.values()) {
    const url = new URL(request.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') assert.equal(url.origin, origin);
    else assert.ok(['data:', 'about:'].includes(url.protocol), 'Unexpected non-HTTP resource');
  }
  const text = await page.eval('document.body.innerText');
  assert.match(text, /Сервер проверит именно показанную версию перед импортом/);
  const capture = async (name, width, height) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    assert.equal(await page.eval('document.documentElement.scrollWidth > innerWidth'), false);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(output + '/' + name + '.png', Buffer.from(screenshot.data, 'base64'));
  };
  await capture('desktop', 1280, 1100);
  await capture('mobile', 390, 844);
  await page.click('Q.byName("button", /^К разговору$/)');
  assert.ok(await page.waitFor('!!Q.composer()'));
  const evidence = { contract: 'maya.local-crm-setup.ui-only/1', profile: 'existing happy mock', actualBackend: false, actualYclients: false, modelCalls: 0,
    setupCalls: setupCalls.map(r => ({ method: r.method, path: new URL(r.url).pathname, status: r.status })),
    noAutomaticSetupRead: true, noSetupPosts: true, activationDisabledWithoutSource: true, blockedStatusIsTruthful: true, closeReturnsToChat: true, sizes: ['1280x1100', '390x844'] };
  fs.writeFileSync(output + '/summary.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  await page.close();
} finally { await browser.close(); }
