import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { phoneTelegramEgress } from './phone-telegram-egress.mjs';
import { phoneTelegramPlan } from './phone-telegram-plan.mjs';
import {
  validatePhoneTelegramScope,
  claimPhoneTelegramProcess,
  assertPhoneTelegramActor,
  PHONE_TELEGRAM_ORIGIN,
  PHONE_TELEGRAM_CLIENT_ID,
} from './phone-telegram-scope.mjs';
const pin = 'a'.repeat(64),
  now = Date.now();
const scope = {
  contract: 'maya.phone-owner-telegram/1',
  approvalRef: 'owner-20261015-phone-telegram-30m-3logins',
  candidate: '7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3',
  tenantId: 'synthetic-tenant',
  userId: 'synthetic-owner',
  branchId: 'synthetic-branch',
  tenantSlug: 'malestheticstavropol',
  companyId: '503759',
  notBefore: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 1200000).toISOString(),
};
const registry = (page) =>
  JSON.stringify({
    fields: [
      'id',
      'name',
      'phone',
      'visits_count',
      'sold_amount',
      'last_visit_date',
    ],
    filters: [],
    page,
    page_size: 200,
  });
const token = () =>
  new URLSearchParams({
    client_id: PHONE_TELEGRAM_CLIENT_ID,
    code: 'synthetic-code',
    code_verifier: 'v'.repeat(43),
    redirect_uri: PHONE_TELEGRAM_ORIGIN + '/oauth-callback.html',
    grant_type: 'authorization_code',
  }).toString();
async function fixture(t, fetcher) {
  let time = now,
    alive = true;
  const calls = [];
  const relay = phoneTelegramEgress({
    scope,
    pin,
    secret: 'SYNTHETIC_TELEGRAM_NOT_REAL',
    assertCurrent() {
      assert.ok(alive);
    },
    clock: () => time,
    nativeFetch: async (url, init) => {
      calls.push({ url, init });
      return fetcher
        ? fetcher(url, init)
        : Response.json(
            url.endsWith('/token')
              ? { id_token: 'synthetic-signed-token' }
              : url.endsWith('/search')
                ? {
                    data: [{ id: 1, name: 'Synthetic', phone: '+70000000001' }],
                  }
                : { keys: [] },
          );
    },
  });
  await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    relay.revoke();
    relay.server.closeAllConnections();
    await new Promise((r) => relay.server.close(r));
  });
  const send = (route, body, headers = {}) =>
    fetch(`http://127.0.0.1:${relay.server.address().port}/${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-maya-scope': pin,
        'x-maya-tenant': scope.tenantId,
        'x-maya-user': scope.userId,
        'x-maya-crm-authorization':
          'Bearer SYNTHETIC_PARTNER_NOT_REAL, User SYNTHETIC_USER_NOT_REAL',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const begin = async (purpose) => {
    const operationId = randomUUID();
    assert.equal((await send('begin', { operationId, purpose })).status, 200);
    return operationId;
  };
  const verify = async (operationId) => {
    assert.equal(
      (await send('telegram_token', { operationId, body: token() })).status,
      200,
    );
    assert.equal((await send('verified', { operationId })).status, 200);
  };
  return {
    relay,
    calls,
    send,
    begin,
    verify,
    expire: () => {
      time = Date.parse(scope.expiresAt);
    },
    expireOperation: () => {
      time += 120001;
    },
    withdraw: () => {
      alive = false;
    },
  };
}
test('scope is exact, finite and cannot select another deployment', () => {
  assert.ok(validatePhoneTelegramScope(scope, now));
  for (const patch of [
    { companyId: '99' },
    { tenantSlug: 'foreign' },
    { candidate: 'c'.repeat(40) },
    { approvalRef: 'invented' },
    { extra: true },
    { expiresAt: new Date(now + 1800001).toISOString() },
    { notBefore: new Date(now + 1).toISOString() },
    { expiresAt: new Date(now).toISOString() },
  ])
    assert.throws(() =>
      validatePhoneTelegramScope({ ...scope, ...patch }, now),
    );
  const actor = {
    userId: scope.userId,
    tenantId: scope.tenantId,
    role: 'tenant_owner',
    membershipStatus: 'active',
  };
  assertPhoneTelegramActor(actor, scope);
  for (const patch of [
    { userId: 'other' },
    { tenantId: 'other' },
    { role: 'client' },
    { membershipStatus: 'suspended' },
  ])
    assert.throws(() =>
      assertPhoneTelegramActor({ ...actor, ...patch }, scope),
    );
});
test('durable separate claims refuse process restart / budget reset', () => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/maya-tg-claim-');
  try {
    for (const kind of ['backend', 'egress']) {
      claimPhoneTelegramProcess(dir, kind, pin);
      assert.throws(() => claimPhoneTelegramProcess(dir, kind, pin));
    }
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test('wire happy link then fresh login uses fixed destinations and private secret only', async (t) => {
  const f = await fixture(t),
    link = await f.begin('link');
  assert.equal(
    (await f.send('telegram_token', { operationId: link, body: token() }))
      .status,
    200,
  );
  assert.equal(
    (await f.send('telegram_jwks', { operationId: link })).status,
    200,
  );
  assert.equal((await f.send('end', { operationId: link })).status, 200);
  const id = await f.begin('login');
  await f.verify(id);
  const res = await f.send('client_registry', {
    operationId: id,
    body: registry(1),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.length, 1);
  assert.ok(f.calls[0].init.headers.Authorization.startsWith('Basic '));
  assert.equal(
    Buffer.from(
      f.calls[0].init.headers.Authorization.slice(6),
      'base64',
    ).toString(),
    PHONE_TELEGRAM_CLIENT_ID + ':SYNTHETIC_TELEGRAM_NOT_REAL',
  );
  assert.equal(
    f.calls.at(-1).url,
    'https://api.yclients.com/api/v1/company/503759/clients/search',
  );
  assert.ok(f.calls.every((c) => c.init.redirect === 'error'));
  assert.equal(f.relay.snapshot().rows, 1);
  assert.ok(!JSON.stringify(f.relay.snapshot()).includes('Synthetic'));
  assert.ok(!JSON.stringify(f.relay.snapshot()).includes('token"'));
});
for (const name of [
  'before-token',
  'link-registry',
  'before-verification',
  'duplicate-page',
  'skip-page',
  'page33',
  'wrong-fields',
  'wrong-redirect',
  'wrong-client',
  'replay-token',
  'foreign-operation',
  'extra-url',
  'unknown-route',
  'bad-auth',
])
  test('refuses ' + name + ' before external dispatch', async (t) => {
    const f = await fixture(t),
      id = await f.begin(name === 'link-registry' ? 'link' : 'login');
    let route = 'client_registry',
      body = { operationId: id, body: registry(1) },
      headers = {};
    if (
      ![
        'before-token',
        'before-verification',
        'link-registry',
        'wrong-redirect',
        'wrong-client',
      ].includes(name)
    )
      await f.verify(id);
    if (['before-verification', 'link-registry'].includes(name))
      assert.equal(
        (await f.send('telegram_token', { operationId: id, body: token() }))
          .status,
        200,
      );
    if (name === 'duplicate-page')
      assert.equal((await f.send(route, body)).status, 200);
    if (name === 'skip-page') body.body = registry(2);
    if (name === 'page33') body.body = registry(33);
    if (name === 'wrong-fields')
      body.body = registry(1).replace('last_visit_date', 'records');
    if (
      name === 'wrong-redirect' ||
      name === 'wrong-client' ||
      name === 'replay-token'
    ) {
      route = 'telegram_token';
      const params = new URLSearchParams(token());
      if (name === 'wrong-redirect')
        params.set('redirect_uri', 'https://evil.example/callback');
      if (name === 'wrong-client') params.set('client_id', '123');
      body.body = params.toString();
    }
    if (name === 'foreign-operation') body.operationId = randomUUID();
    if (name === 'extra-url') body.url = 'https://evil.example';
    if (name === 'unknown-route') route = 'book_record';
    if (name === 'bad-auth')
      headers['x-maya-crm-authorization'] = 'Bearer caller';
    const before = f.calls.length;
    assert.equal((await f.send(route, body, headers)).status, 403);
    assert.equal(f.calls.length, before);
  });
for (const field of ['x-maya-scope', 'x-maya-tenant', 'x-maya-user'])
  test('private transport refuses foreign ' + field, async (t) => {
    const f = await fixture(t);
    assert.equal(
      (
        await f.send(
          'begin',
          { operationId: randomUUID(), purpose: 'login' },
          { [field]: 'foreign' },
        )
      ).status,
      403,
    );
    assert.equal(f.calls.length, 0);
  });
test('exactly one link and three login completions; same operation cannot replay', async (t) => {
  const f = await fixture(t);
  for (const purpose of ['link', 'login', 'login', 'login']) {
    const id = await f.begin(purpose);
    assert.equal((await f.send('end', { operationId: id })).status, 200);
    assert.equal(
      (await f.send('begin', { operationId: id, purpose })).status,
      403,
    );
  }
  for (const purpose of ['link', 'login'])
    assert.equal(
      (await f.send('begin', { operationId: randomUUID(), purpose })).status,
      403,
    );
});
test('sequential page bound is 32 pages of at most 200, never widened', async (t) => {
  const f = await fixture(t),
    id = await f.begin('login');
  await f.verify(id);
  for (let page = 1; page <= 32; page++)
    assert.equal(
      (
        await f.send('client_registry', {
          operationId: id,
          body: registry(page),
        })
      ).status,
      200,
    );
  const before = f.calls.length;
  assert.equal(
    (await f.send('client_registry', { operationId: id, body: registry(33) }))
      .status,
    403,
  );
  assert.equal(f.calls.length, before);
});
test('oversized provider page refused without delivering customer data', async (t) => {
  const f = await fixture(t, async (url) =>
    Response.json(
      url.endsWith('/token')
        ? { id_token: 'synthetic' }
        : { data: Array.from({ length: 201 }, () => ({ id: 1 })) },
    ),
  );
  const id = await f.begin('login');
  await f.verify(id);
  const r = await f.send('client_registry', {
    operationId: id,
    body: registry(1),
  });
  assert.equal(r.status, 403);
  assert.ok(!(await r.text()).includes('data'));
  assert.equal(f.relay.snapshot().rows, 0);
});
for (const reason of ['expire', 'expireOperation', 'withdraw'])
  test(reason + ' closes current operation without a new call', async (t) => {
    const f = await fixture(t),
      id = await f.begin('login');
    await f.verify(id);
    f[reason]();
    const before = f.calls.length;
    assert.equal(
      (await f.send('client_registry', { operationId: id, body: registry(1) }))
        .status,
      403,
    );
    assert.equal(f.calls.length, before);
  });
test('concurrent token consumes once, follower refused', async (t) => {
  let unblock;
  const block = new Promise((r) => {
    unblock = r;
  });
  const f = await fixture(t, async () => {
    await block;
    return Response.json({ id_token: 'synthetic' });
  });
  const id = await f.begin('login');
  const first = f.send('telegram_token', { operationId: id, body: token() });
  while (!f.calls.length) await new Promise((r) => setTimeout(r, 2));
  assert.equal(
    (await f.send('telegram_token', { operationId: id, body: token() })).status,
    403,
  );
  unblock();
  assert.equal((await first).status, 200);
  assert.equal(f.calls.length, 1);
});
test('provider redirect and raw error body never delivered', async (t) => {
  const f = await fixture(
    t,
    async () => new Response('SECRET_ERROR_DO_NOT_LOG', { status: 401 }),
  );
  const id = await f.begin('login');
  const r = await f.send('telegram_token', { operationId: id, body: token() });
  assert.equal(r.status, 401);
  assert.ok(!(await r.text()).includes('SECRET_ERROR'));
  assert.ok(!JSON.stringify(f.relay.snapshot()).includes('SECRET_ERROR'));
});

test('plan preserves exact image, AI/catalogue state and all unrelated services', () => {
  const previous = {
    name: 'maya-phone-staging',
    services: {
      backend: {
        image: 'maya-phone-backend:' + scope.candidate,
        environment: {
          MAYA_RELEASE: scope.candidate,
          MAYA_PHONE_AI_SCOPE_SHA256: pin,
        },
        entrypoint: ['node', '/app/scripts/phone-ai-entry.mjs'],
        networks: ['private', 'catalog_private', 'model_private'],
        volumes: [
          'staging_uploads:/app/uploads',
          '/existing-ai-scope:/run/maya/phone-ai-scope.json:ro',
        ],
        restart: 'no',
      },
      postgres: { original: true },
      gateway: { original: true },
      'model-egress': { originalLedger: 'continuation-2.jsonl' },
      'catalog-egress': { originalCounter: true },
    },
    networks: {
      private: { internal: true },
      catalog_private: { internal: true },
      model_private: { internal: true },
      edge: {},
    },
    volumes: { staging_uploads: {} },
  };
  const next = phoneTelegramPlan(previous, pin);
  for (const name of ['postgres', 'gateway', 'model-egress', 'catalog-egress'])
    assert.deepEqual(next.services[name], previous.services[name]);
  assert.ok(
    next.services.backend.networks.every((n) => next.networks[n].internal),
  );
  assert.equal(next.services.backend.image, previous.services.backend.image);
  assert.equal(
    next.services.backend.environment.MAYA_PHONE_AI_SCOPE_SHA256,
    pin,
  );
  assert.ok(
    !next.services.backend.volumes.some((v) =>
      v.includes('phone-telegram-secret'),
    ),
  );
  assert.deepEqual(next.services['telegram-egress'].networks, [
    'telegram_private',
    'edge',
  ]);
  assert.equal(next.services['telegram-egress'].restart, 'no');
  assert.equal(next.services['telegram-egress'].ports, undefined);
  assert.equal(next.services['telegram-egress'].env_file, undefined);
  assert.ok(
    next.services['telegram-egress'].volumes.some((v) =>
      v.endsWith(':/run/maya-telegram-admission:ro'),
    ),
  );
  assert.throws(() => phoneTelegramPlan(next, pin));
  for (const mutate of [
    (p) => {
      p.services.backend.image = 'other';
    },
    (p) => {
      p.services.backend.networks.push('edge');
    },
    (p) => {
      p.networks.private.internal = false;
    },
    (p) => {
      p.services.backend.restart = 'always';
    },
  ]) {
    const p = structuredClone(previous);
    mutate(p);
    assert.throws(() => phoneTelegramPlan(p, pin));
  }
});

test('late provider response after expiry is never delivered', async (t) => {
  let f;
  f = await fixture(t, async () => {
    f.expire();
    return Response.json({ id_token: 'late-synthetic-token' });
  });
  const id = await f.begin('login'),
    r = await f.send('telegram_token', { operationId: id, body: token() });
  assert.equal(r.status, 403);
  assert.ok(!(await r.text()).includes('late-synthetic-token'));
});

test('redirected success cannot be treated as official issuer', async (t) => {
  const f = await fixture(t, async () => {
    const r = Response.json({ id_token: 'synthetic' });
    Object.defineProperty(r, 'redirected', { value: true });
    return r;
  });
  const id = await f.begin('login');
  assert.equal(
    (await f.send('telegram_token', { operationId: id, body: token() })).status,
    403,
  );
});
