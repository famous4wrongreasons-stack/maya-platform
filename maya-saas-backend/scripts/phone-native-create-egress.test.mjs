import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  nativeCreateEgress,
  validateCreateEgressScope,
  CREATE_EGRESS_CONTRACT,
  CREATE_EGRESS_LIMITS,
} from './phone-native-create-egress.mjs';

const now = Date.parse('2026-10-18T09:00:00Z');
const auth =
  'Bearer SYNTHETIC_NATIVE_SOCKET_PARTNER, User SYNTHETIC_NATIVE_SOCKET_USER';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const scope = {
  contract: CREATE_EGRESS_CONTRACT,
  candidate: '6356db1875545337e34b6c8888b7ca858bb64361',
  profile: 'closed-input.no-handoff.no-price-goods@1',
  tenantId: 'synthetic-tenant',
  companyId: '450001',
  executionAuthorizationDigest: 'a'.repeat(64),
  credentialDigest: sha(auth),
  notBefore: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 60000).toISOString(),
  maxReads: 64,
  maxCreates: 1,
};
const body = {
  phone: '79990000001',
  fullname: 'Synthetic client',
  email: '',
  comment: '',
  type: 'mobile',
  notify_by_sms: 0,
  notify_by_email: 0,
  appointments: [
    {
      id: 1,
      services: [81],
      staff_id: 71,
      datetime: '2026-10-19T17:00:00',
    },
  ],
};
const target = '/api/v1/book_record/450001';
const reply = '{"success":true,"data":[{"id":1,"record_id":123}]}';
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-create-egress-'),
  );
  fs.chmodSync(directory, 0o700);
  let time = now,
    admitted = true;
  const calls = [],
    ledgerPath = path.join(directory, 'attempts.jsonl');
  const config = {
    scope: { ...scope, ...options.scope },
    ledgerPath,
    clock: () => time,
    assertCurrent: () => admitted,
    nativeFetch: async (...args) => {
      calls.push(args);
      return options.fetch
        ? options.fetch(...args)
        : new Response(reply, { headers: { link: '</page2>; rel="next"' } });
    },
  };
  const app = nativeCreateEgress(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    app.close();
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    fs.rmSync(directory, { recursive: true });
  });
  const request = (route = target, method = 'POST', value = body, extra = {}) =>
    new Promise((resolve, reject) => {
      const bytes =
        value === undefined || value === null
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);
      const req = http.request(
        {
          host: '127.0.0.1',
          port: app.server.address().port,
          path: route,
          method,
          agent: false,
          headers: {
            authorization: auth,
            accept: 'application/vnd.yclients.v2+json',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(bytes),
            ...extra,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
          res.on('error', reject);
        },
      );
      req.on('error', (error) =>
        error.code === 'ECONNRESET'
          ? resolve({ socketLost: true })
          : reject(error),
      );
      req.end(bytes);
    });
  return {
    ...app,
    calls,
    request,
    config,
    ledgerPath,
    setTime: (value) => {
      time = value;
    },
    deny: () => {
      admitted = false;
    },
  };
}

test('scope is exact candidate/profile/company/window and one create only', () => {
  assert.deepEqual(validateCreateEgressScope(scope, now), scope);
  for (const patch of [
    { tenantId: '*' },
    { companyId: '*' },
    { maxCreates: 2 },
    { maxCreates: 0 },
    { maxReads: 257 },
    { candidate: 'b'.repeat(40) },
    { profile: 'full165.closed-input' },
    { environment: 'production' },
    { credentialDigest: 'caller-key' },
    { executionAuthorizationDigest: '' },
    { expiresAt: new Date(now).toISOString() },
    { notBefore: new Date(now + 1).toISOString() },
    { expiresAt: new Date(now + 1800000).toISOString() },
  ])
    assert.throws(() => validateCreateEgressScope({ ...scope, ...patch }, now));
});
test('configuration alone and async/false admission never open a ledger', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-create-config-'),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const ledgerPath = path.join(directory, 'ledger');
  for (const assertCurrent of [
    undefined,
    () => false,
    () => undefined,
    () => Promise.resolve(true),
  ])
    assert.throws(() =>
      nativeCreateEgress({
        scope,
        ledgerPath,
        clock: () => now,
        assertCurrent,
      }),
    );
  assert.equal(fs.existsSync(ledgerPath), false);
});
test('native create body and genuine provider response pass byte-for-byte, with no extra headers', async (t) => {
  const f = await fixture(t),
    r = await f.request();
  assert.equal(r.status, 200);
  assert.equal(r.body, reply);
  assert.match(r.headers.link, /page2/);
  assert.equal(f.calls.length, 1);
  const [url, init] = f.calls[0];
  assert.equal(url, 'https://api.yclients.com' + target);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.body.toString(), JSON.stringify(body));
  assert.deepEqual(init.headers, {
    Authorization: auth,
    Accept: 'application/vnd.yclients.v2+json',
    'Content-Type': 'application/json',
  });
  const events = fs
    .readFileSync(f.ledgerPath, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(events.length, 2);
  assert.deepEqual(events[1], { event: 'attempt', kind: 'create', number: 1 });
  assert(!JSON.stringify(events).includes(body.phone));
  assert(!JSON.stringify(events).includes(auth));
});
for (const route of [
  '/api/v1/book_services/450001',
  '/api/v1/book_services/450001?staff_id=71',
  '/api/v1/book_staff/450001',
  '/api/v1/book_times/450001/71/2026-10-19?date=2026-10-19&service_ids%5B%5D=81',
])
  test('allow exact catalog/one-day availability: ' + route, async (t) => {
    const f = await fixture(t);
    assert.equal((await f.request(route, 'GET', null)).status, 200);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][1].body, undefined);
  });
for (const [method, route] of [
  ['POST', '/api/v1/book_record/450002'],
  ['POST', '/api/v1/records/450001'],
  ['PUT', '/api/v1/record/450001/123'],
  ['DELETE', '/api/v1/record/450001/123'],
  ['PATCH', '/api/v1/company/450001/services/81'],
  ['POST', '/api/v1/storage_operations/operation/450001'],
  ['POST', '/api/v1/handoff'],
  ['POST', '/api/v1/book_record/%34%35%30%30%30%31'],
  ['POST', '/api/v1/x/../book_record/450001'],
  ['POST', '//evil.invalid/api/v1/book_record/450001'],
  ['GET', '/api/v1/records/450001'],
])
  test(
    'unadmitted route is refused without dispatch: ' + method + ' ' + route,
    async (t) => {
      const f = await fixture(t);
      assert.equal(
        (await f.request(route, method, method === 'GET' ? null : body)).status,
        403,
      );
      assert.equal(f.calls.length, 0);
    },
  );
test('SMS, email, guest/admin extras, multiple appointments and forged credentials are refused', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { notify_by_sms: 3 },
    { notify_by_email: 1 },
    { email: 'synthetic@example.invalid' },
    { send_sms: false },
    { api_id: 1 },
    { appointments: [...body.appointments, ...body.appointments] },
    { appointments: [{ ...body.appointments[0], save_if_busy: true }] },
  ])
    assert.equal(
      (await f.request(target, 'POST', { ...body, ...patch })).status,
      403,
    );
  for (const extra of [
    { authorization: auth + 'foreign' },
    { cookie: 'not-admitted' },
    { accept: 'application/json' },
  ])
    assert.equal((await f.request(target, 'POST', body, extra)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('only matching post-create reconciliation contact read is admitted', async (t) => {
  const f = await fixture(t),
    route = '/api/v1/company/450001/clients/search';
  const search = {
    fields: ['id', 'name', 'phone'],
    filters: [{ type: 'quick_search', state: { value: body.phone } }],
    page: 1,
    page_size: 8,
  };
  assert.equal((await f.request(route, 'POST', search)).status, 403);
  assert.equal((await f.request()).status, 200);
  assert.equal((await f.request(route, 'POST', search)).status, 200);
  assert.equal(
    (await f.request(route, 'POST', { ...search, page_size: 6400 })).status,
    403,
  );
  assert.equal(
    (
      await f.request(route, 'POST', {
        ...search,
        filters: [{ type: 'quick_search', state: { value: '79990000002' } }],
      })
    ).status,
    403,
  );
  assert.equal(f.calls.length, 2);
});
test('one durable reservation covers all concurrent creates and all later retries', async (t) => {
  const f = await fixture(t),
    results = await Promise.all(Array.from({ length: 8 }, () => f.request()));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.request()).status, 403);
  assert.equal(f.snapshot().creates, 1);
});
test('restart cannot reopen an already consumed run ledger', async (t) => {
  const f = await fixture(t);
  await f.request();
  f.close();
  assert.throws(() => nativeCreateEgress(f.config), /EEXIST/);
  assert.equal(f.calls.length, 1);
});
test('ledger removal prevents dispatch', async (t) => {
  const f = await fixture(t);
  fs.unlinkSync(f.ledgerPath);
  assert.equal((await f.request()).status, 403);
  assert.equal(f.calls.length, 0);
});
test('durable reservation failure poisons the run before provider dispatch', async (t) => {
  const f = await fixture(t),
    original = fs.fsyncSync;
  fs.fsyncSync = () => {
    throw new Error('synthetic fsync failure');
  };
  try {
    assert.equal((await f.request()).status, 403);
  } finally {
    fs.fsyncSync = original;
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.snapshot().revoked, true);
  assert.equal((await f.request()).status, 403);
});
test('read quota is finite and independent from the single create', async (t) => {
  const f = await fixture(t, { scope: { maxReads: 2 } });
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      f.request('/api/v1/book_services/450001', 'GET', null),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 2);
  assert.equal((await f.request()).status, 200);
  assert.equal(f.calls.length, 3);
});
for (const reason of [
  'transport',
  'partial-body',
  'invalid-json',
  'oversize',
  'redirect',
  'expired',
  'revoked',
  'admission-revoked',
])
  test(
    'post-dispatch ' +
      reason +
      ' is socket loss, never a fabricated definite response',
    async (t) => {
      let f;
      f = await fixture(t, {
        fetch: async () => {
          if (reason === 'transport')
            throw new TypeError('synthetic network loss');
          if (reason === 'partial-body')
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{'));
                  controller.error(new TypeError('synthetic body lost'));
                },
              }),
            );
          if (reason === 'invalid-json') return new Response('not JSON');
          if (reason === 'oversize')
            return new Response(
              'x'.repeat(CREATE_EGRESS_LIMITS.responseBytes + 1),
            );
          if (reason === 'redirect')
            return new Response('', {
              status: 307,
              headers: { location: 'https://other.invalid' },
            });
          if (reason === 'expired') f.setTime(now + 60000);
          if (reason === 'revoked') f.revoke();
          if (reason === 'admission-revoked') f.deny();
          return new Response(reply);
        },
      });
      assert.deepEqual(await f.request(), { socketLost: true });
      assert.equal(f.calls.length, 1);
      assert.equal(f.snapshot().uncertainTransport, 1);
      assert.equal((await f.request()).status, 403);
      assert.equal(f.calls.length, 1);
    },
  );
test('pre-dispatch expiry or revocation refuses without any provider call', async (t) => {
  const f = await fixture(t);
  f.setTime(now + 60000);
  assert.equal((await f.request()).status, 403);
  f.setTime(now);
  f.revoke();
  assert.equal((await f.request()).status, 403);
  assert.equal(f.calls.length, 0);
});
test('actual provider rejection status/body are preserved rather than invented', async (t) => {
  const payload = '{"success":false,"meta":{"message":"synthetic refusal"}}';
  const f = await fixture(t, {
    fetch: async () =>
      new Response(payload, {
        status: 422,
        headers: {
          'set-cookie': 'not-forwarded',
          location: 'https://not-forwarded.invalid',
        },
      }),
  });
  const r = await f.request();
  assert.equal(r.status, 422);
  assert.equal(r.body, payload);
  assert.equal(r.headers['set-cookie'], undefined);
  assert.equal(r.headers.location, undefined);
});

test('revocation aborts an in-flight request and burns its create reservation', async (t) => {
  let started;
  const dispatched = new Promise((resolve) => {
    started = resolve;
  });
  const f = await fixture(t, {
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new TypeError('synthetic aborted network')),
          { once: true },
        );
        started();
      }),
  });
  const pending = f.request();
  await dispatched;
  f.revoke();
  assert.deepEqual(await pending, { socketLost: true });
  assert.equal((await f.request()).status, 403);
  assert.equal(f.calls.length, 1);
  assert.equal(f.snapshot().creates, 1);
});

test('current execution admission is reread before dispatch, with no cached allow', async (t) => {
  const f = await fixture(t);
  f.deny();
  assert.equal((await f.request()).status, 403);
  assert.equal(f.calls.length, 0);
});

test('duplicate date, widened window and substituted service query are refused', async (t) => {
  const f = await fixture(t);
  for (const query of [
    'date=2026-10-19&date=2026-10-19&service_ids%5B%5D=81',
    'date=2026-10-20&service_ids%5B%5D=81',
    'date=2026-10-19&service_ids%5B%5D=81&until=2026-10-21',
    'date=2026-10-19&service_ids%5B%5D=81&service_ids%5B%5D=81',
  ])
    assert.equal(
      (
        await f.request(
          '/api/v1/book_times/450001/71/2026-10-19?' + query,
          'GET',
          null,
        )
      ).status,
      403,
    );
  assert.equal(f.calls.length, 0);
});
