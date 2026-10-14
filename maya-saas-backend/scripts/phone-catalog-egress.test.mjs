import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { catalogEgress, validateCatalogScope, CATALOG_CONTRACT } from './phone-catalog-egress.mjs';

const now = Date.parse('2026-10-15T10:00:00Z');
const scope = { contract: CATALOG_CONTRACT, companyId: '777001', notBefore: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString(), maxCalls: 40 };
const authorization = 'Bearer syntheticPartner00000000, User syntheticUser000000000';
const headers = { authorization, accept: 'application/vnd.yclients.v2+json' };
const payload = '{"success":true,"data":[{"id":1,"name":"Synthetic"}],"meta":{}}';

async function fixture(t, options = {}) {
  let time = now; const calls = [];
  const app = catalogEgress({ ...scope, ...options.scope }, { clock: () => time, nativeFetch: async (...args) => {
    calls.push(args); return options.fetch ? options.fetch(...args) : new Response(payload, { headers: { link: '</page2>; rel="next"' } });
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.revoke(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); });
  const request = (target = '/api/v1/services/777001', method = 'GET', extra = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: app.server.address().port, path: target, method, headers: { ...headers, ...extra }, agent: false }, res => {
      const chunks = []; res.on('data', x => chunks.push(x)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
  return { ...app, calls, request, setTime: value => { time = value; } };
}

test('scope rejects missing, widened, expired and unbounded configuration', () => {
  assert.deepEqual(validateCatalogScope(scope, now), scope);
  for (const patch of [{ companyId: '*' }, { contract: 'generic' }, { maxCalls: 257 }, { maxCalls: 0 }, { tenant: '*' },
    { expiresAt: new Date(now).toISOString() }, { notBefore: new Date(now + 1).toISOString() }, { expiresAt: new Date(now + 86400001).toISOString() }])
    assert.throws(() => validateCatalogScope({ ...scope, ...patch }, now));
});

for (const target of ['/api/v1/companies?my=1', '/api/v1/company/777001', '/api/v1/book_services/777001', '/api/v1/services/777001', '/api/v1/service_categories/777001', '/api/v1/company/777001/staff', '/api/v1/staff/777001']) {
  test('exact native catalogue request: ' + target, async t => {
    const f = await fixture(t), r = await f.request(target, 'GET', { cookie: 'must-not-forward', 'x-forwarded-host': 'evil.invalid' });
    assert.equal(r.status, 200); assert.equal(r.body, payload); assert.match(r.headers.link, /page2/);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'https://api.yclients.com' + target);
    assert.deepEqual(f.calls[0][1].headers, { Authorization: authorization, Accept: headers.accept, 'Content-Type': 'application/json' });
    assert.equal(f.calls[0][1].redirect, 'error'); assert.equal(f.calls[0][1].method, 'GET');
  });
}
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
  test('never send provider ' + method, async t => {
    const f = await fixture(t); assert.equal((await f.request(undefined, method)).status, 403); assert.equal(f.calls.length, 0);
  });
}
for (const target of ['/api/v1/records/777001', '/api/v1/clients/777001', '/api/v1/auth', '/api/v1/services/777002',
  '/api/v1/services/777001?foo=1', '/api/v1/companies?my=0', '/api/v1//services/777001', '/api/v1/../v1/services/777001',
  '/api/v1/services/%37%37%37%30%30%31', 'https://evil.invalid/api/v1/services/777001', '//evil.invalid/api/v1/services/777001']) {
  test('refuse unlisted target before fetch: ' + target, async t => {
    const f = await fixture(t); assert.equal((await f.request(target)).status, 403); assert.equal(f.calls.length, 0);
  });
}
test('missing credentials, foreign Accept and GET bodies are refused', async t => {
  const f = await fixture(t);
  for (const extra of [{ authorization: '' }, { accept: 'application/json' }, { 'content-length': '1' }, { 'transfer-encoding': 'chunked' }])
    assert.equal((await f.request(undefined, 'GET', extra)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('HTTP redirects and provider errors never propagate bodies/locations/secrets', async t => {
  const f = await fixture(t, { fetch: async () => new Response('secret-bearing-provider-error', { status: 302, headers: { location: 'https://evil.invalid' } }) });
  const r = await f.request(); assert.equal(r.status, 502); assert.equal(r.headers.location, undefined); assert.doesNotMatch(r.body, /secret/);
});
test('oversized or non-JSON response is refused before delivery', async t => {
  const f = await fixture(t, { fetch: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) });
  const r = await f.request(); assert.equal(r.status, 403); assert.ok(r.body.length < 200);
});
test('expiry and revocation refuse additional calls and discard late success', async t => {
  const f = await fixture(t, { fetch: async () => { f.setTime(now + 60000); return new Response(payload); } });
  assert.equal((await f.request()).status, 403); assert.equal((await f.request()).status, 403); assert.equal(f.calls.length, 1);
  f.setTime(now); f.revoke(); assert.equal((await f.request()).status, 403); assert.equal(f.calls.length, 1);
});
test('concurrent calls cannot exceed the exact finite budget', async t => {
  const f = await fixture(t, { scope: { maxCalls: 2 } });
  const results = await Promise.all(Array.from({ length: 8 }, () => f.request()));
  assert.equal(results.filter(x => x.status === 200).length, 2); assert.equal(f.calls.length, 2); assert.equal(f.snapshot().attempted, 2);
});
test('revoke aborts outstanding fetch', async t => {
  let entered; const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); entered();
  }) });
  const result = f.request(); await ready; f.revoke(); assert.equal((await result).status, 403);
});
