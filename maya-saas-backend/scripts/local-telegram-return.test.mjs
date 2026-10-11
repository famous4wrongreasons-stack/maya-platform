// Actual owner launcher's web boundary. No app, owner DB, credentials or provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createReadWebServer } from './local-yclients-read.mjs';
import { FIXED_PROFILE } from './local-onboarding-profile.mjs';
import { realReadIngress } from './local-yclients-read-profile.mjs';

const callback = fs.readFileSync(new URL('../deploy/platform/beget-edge/oauth-callback.html', import.meta.url));
async function fixture(t) {
  const env = { PORT: '59991', CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:59992' };
  const dev = createReadWebServer({ diagnosticNoProvider: true }, env);
  await dev.listen(0);
  env.CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:' + dev.server.address().port;
  t.after(async () => { dev.server.closeAllConnections(); await dev.close(); });
  const get = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(env.CORS_ALLOWED_ORIGINS + url, { method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
  return { get, env };
}

test('provider document return serves the exact canonical callback', async t => {
  const { get } = await fixture(t);
  const result = await get('/oauth-callback.html?state=te_synthetic_state&code=synthetic-code', {
    'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document',
  });
  assert.equal(result.status, 200);
  assert.ok(result.bytes.equals(callback));
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['referrer-policy'], 'no-referrer');
});

test('direct/standalone callback still serves the erasing page without a session', async t => {
  const { get } = await fixture(t);
  const result = await get('/oauth-callback.html?state=bad&code=synthetic-code');
  assert.equal(result.status, 200);
  assert.ok(result.bytes.equals(callback));
  assert.equal(result.headers['set-cookie'], undefined);
});

test('callback header CSP admits only canonical script/style hashes; no connect or unsafe-inline', async t => {
  const { get } = await fixture(t);
  const result = await get('/oauth-callback.html');
  const csp = result.headers['content-security-policy'];
  for (const tag of ['script', 'style']) {
    const content = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(callback.toString())[1];
    const hash = createHash('sha256').update(content).digest('base64');
    assert.ok(csp.includes(`${tag}-src 'sha256-${hash}'`));
  }
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.equal(/unsafe-inline|unsafe-eval|connect-src|https?:/.test(csp), false);
});

const external = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
for (const [name, headers, method = 'GET', url = '/oauth-callback.html?state=te_synthetic_state&code=synthetic-code'] of [
  ['foreign host', { ...external, host: 'foreign.invalid' }],
  ['foreign origin', { ...external, origin: 'https://foreign.invalid' }],
  ['cross-origin fetch', { ...external, 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
  ['cross-origin subframe', { ...external, 'sec-fetch-dest': 'iframe' }],
  ['cross-origin script', { ...external, 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' }],
  ['missing destination', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }],
  ['missing mode', { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' }],
  ['same-site sibling', { ...external, 'sec-fetch-site': 'same-site' }],
  ['POST', external, 'POST'], ['HEAD', external, 'HEAD'],
  ['session bearer', { authorization: 'Bearer synthetic-only' }],
  ['cookie', { cookie: 'synthetic=only' }],
  ['session token', { 'x-session-token': 'synthetic-only' }],
  ['Telegram init data', { 'x-telegram-initdata': 'synthetic-only' }],
  ['same-origin fetch', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
  ['oversized query', {}, 'GET', '/oauth-callback.html?code=' + 'x'.repeat(8200)],
  ['cross-site app', external, 'GET', '/'],
  ['cross-site API', external, 'GET', '/api/health'],
  ['cross-site encoded callback', external, 'GET', '/%6fauth-callback.html'],
  ['cross-site callback suffix', external, 'GET', '/oauth-callback.html/extra'],
]) test(`${name} cannot use the callback exception`, async t => {
  const { get } = await fixture(t);
  const result = await get(url, headers, method);
  assert.equal(result.status, 403);
  assert.equal(result.headers['set-cookie'], undefined);
});

test('replayed/concurrent callbacks are static and cannot reflect state or issue a session', async t => {
  const { get } = await fixture(t);
  const replies = await Promise.all(Array.from({ length: 4 }, (_, i) => get('/oauth-callback.html?state=te_synthetic_' + i + '&code=synthetic-' + i, external)));
  for (const result of replies) {
    assert.equal(result.status, 200); assert.ok(result.bytes.equals(callback));
    assert.equal(result.headers['set-cookie'], undefined);
  }
});

test('serving callback does not enable Telegram or expand setup-read ingress', () => {
  assert.equal(FIXED_PROFILE.TELEGRAM_LOGIN_ENABLED, 'false');
  for (const route of ['start', 'complete', 'link/start', 'link/complete'])
    assert.notEqual(realReadIngress('POST', '/api/auth/oauth/telegram/' + route, {}, {}, 'http://127.0.0.1:59992'), null);
});
