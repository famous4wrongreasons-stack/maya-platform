import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalExecution,
  executionHash,
  verifyExecutionAttachment,
  NATIVE_EXECUTION,
  NATIVE_PROFILE,
} from './phone-native-execution.mjs';
import {
  guardedNativeExecution as openGuard,
  revokeNativeRun,
} from './phone-native-run-guard.mjs';
import { EXECUTION_EGRESS_CONTRACT } from './phone-native-create-egress.mjs';
import {
  nativeModelTransport,
  assertNativeModelPayload,
} from './phone-native-model.mjs';
const ownedGuards = [];
async function guardedNativeExecution(...args) {
  const app = await openGuard(...args);
  ownedGuards.push(app);
  return app;
}
test.afterEach(async () => {
  for (const app of ownedGuards.splice(0)) await stop(app);
});
const now = Date.parse('2026-10-18T16:00:00.000Z'),
  iso = (offset) => new Date(now + offset).toISOString();
const sha = (v) => createHash('sha256').update(v).digest('hex');
function fixture() {
  // Ephemeral synthetic signer only. No files/OS keychain or real credentials.
  const keys = generateKeyPairSync('ed25519');
  const pricing = {
    model: 'deepseek-v4-pro',
    inputNanoUsdPerToken: 1320,
    outputNanoUsdPerToken: 3960,
    evidenceDigest: 'e'.repeat(64),
    verifiedAt: iso(-5000),
    validUntil: iso(1800000),
  };
  const a = {
    contract: NATIVE_EXECUTION,
    runId: 'synthetic-run',
    candidateSha: 'a'.repeat(40),
    buildDigest: 'b'.repeat(64),
    executorDigest: 'c'.repeat(64),
    certificateDigest: 'd'.repeat(64),
    evidenceDigest: 'e'.repeat(64),
    profileId: NATIVE_PROFILE,
    profileDigest: 'f'.repeat(64),
    grantAuthorizationDigest: '1'.repeat(64),
    entitlementVersion: '2'.repeat(64),
    environment: 'production',
    serverOrigin: 'https://phone.synthetic.invalid',
    tenantId: 'tenant-a',
    companyId: '450001',
    userId: 'user-a',
    operatorId: 'platform-a',
    platformSessionId: 'session-a',
    independentHumanReview: false,
    notBefore: iso(-1000),
    expiresAt: iso(600000),
    model: 'deepseek-v4-pro',
    pricing,
    maxModelAttempts: 12,
    maxSpendNanoUsd: 2000000000,
    maxReads: 256,
    maxCreates: 1,
    maxReschedules: 1,
    maxCancels: 1,
  };
  const trust = {
    owner: {
      principalId: a.operatorId,
      purpose: 'owner',
      publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }),
    },
  };
  const installed = Object.fromEntries(
    [
      'candidateSha',
      'buildDigest',
      'executorDigest',
      'profileId',
      'profileDigest',
      'environment',
      'serverOrigin',
      'pricing',
    ].map((k) => [k, structuredClone(a[k])]),
  );
  const signed = (payload) => ({
    payload,
    keyId: 'owner',
    signature: sign(
      null,
      Buffer.from(canonicalExecution(payload)),
      keys.privateKey,
    ).toString('base64url'),
  });
  return {
    a,
    trust,
    installed,
    signed,
    verify(v = signed(a)) {
      return verifyExecutionAttachment(v, trust, installed, now);
    },
  };
}
test('signed fixed attachment verifies with installed AR-1 owner trust; no independent reviewer', () => {
  const f = fixture(),
    v = f.verify();
  assert.equal(v.payload.independentHumanReview, false);
  assert.equal(v.digest, executionHash(f.signed(f.a)));
});
for (const [name, mutate] of [
  ['missing signature', (s) => delete s.signature],
  ['bad signature', (s) => (s.signature = 'A'.repeat(86))],
  ['foreign key', (s) => (s.keyId = 'another')],
  ['tenant substitution', (s) => (s.payload.tenantId = 'tenant-b')],
  ['user substitution', (s) => (s.payload.userId = 'user-b')],
  ['company substitution', (s) => (s.payload.companyId = '450002')],
  ['session substitution', (s) => (s.payload.platformSessionId = 'session-b')],
  ['operator substitution', (s) => (s.payload.operatorId = 'tenant-owner')],
  ['candidate substitution', (s) => (s.payload.candidateSha = '0'.repeat(40))],
  [
    'certificate substitution',
    (s) => (s.payload.certificateDigest = '0'.repeat(64)),
  ],
  [
    'grant substitution',
    (s) => (s.payload.grantAuthorizationDigest = '0'.repeat(64)),
  ],
  ['CAS substitution', (s) => (s.payload.entitlementVersion = '0'.repeat(64))],
])
  test(name + ' cannot modify signed authority', () => {
    const f = fixture(),
      s = f.signed(f.a);
    mutate(s);
    assert.throws(() => f.verify(s));
  });
for (const [name, mutate] of [
  [
    'domain',
    (a) => (a.contract = 'maya.widget-release-production-authorization/2'),
  ],
  ['fabricated reviewer', (a) => (a.reviewerId = 'fake')],
  ['self review', (a) => (a.independentHumanReview = true)],
  ['missing review disclosure', (a) => delete a.independentHumanReview],
  ['second signature', (a) => (a.securitySignature = 'fake')],
  ['wrong profile', (a) => (a.profileId = 'full165.closed-input')],
  ['wildcard tenant', (a) => (a.tenantId = '*')],
  ['wrong environment', (a) => (a.environment = 'staging')],
  ['wrong candidate', (a) => (a.candidateSha = '0'.repeat(40))],
  ['changed executor', (a) => (a.executorDigest = '0'.repeat(64))],
  ['wrong server', (a) => (a.serverOrigin = 'https://other.invalid')],
  ['expired', (a) => (a.expiresAt = iso(0))],
  ['not yet valid', (a) => (a.notBefore = iso(1))],
  ['overlong', (a) => (a.expiresAt = iso(1800001))],
  ['AI attempts', (a) => (a.maxModelAttempts = 13)],
  ['spend', (a) => (a.maxSpendNanoUsd = 2000000001)],
  ['reads', (a) => (a.maxReads = 257)],
  ['extra create', (a) => (a.maxCreates = 2)],
  ['raw Client authority', (a) => (a.clientId = 'chosen')],
  ['unverified pricing', (a) => (a.pricing.inputNanoUsdPerToken = 1)],
  ['expired pricing', (a) => (a.pricing.validUntil = iso(1))],
])
  test('even operator-signed ' + name + ' fails fixed admission', () => {
    const f = fixture();
    mutate(f.a);
    assert.throws(() => f.verify(f.signed(f.a)));
  });
function files(t, f) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'maya-execution-test-'),
  );
  fs.chmodSync(root, 0o700);
  const state = path.join(root, 'state'),
    dir = path.join(root, 'installed');
  fs.mkdirSync(state, { mode: 0o700 });
  fs.mkdirSync(dir, { mode: 0o700 });
  const proof = f.verify(),
    a = proof.payload,
    auth = 'Bearer SYNTHETIC_EXECUTION_PARTNER, User SYNTHETIC_EXECUTION_USER';
  const scope = {
    contract: EXECUTION_EGRESS_CONTRACT,
    runId: a.runId,
    maxReschedules: 1,
    maxCancels: 1,
    candidate: a.candidateSha,
    profile: a.profileId,
    tenantId: a.tenantId,
    companyId: a.companyId,
    executionAuthorizationDigest: proof.digest,
    credentialDigest: sha(auth),
    notBefore: a.notBefore,
    expiresAt: a.expiresAt,
    maxReads: a.maxReads,
    maxCreates: 1,
  };
  const file = path.join(dir, 'scope');
  const bytes = JSON.stringify(scope, null, 2) + '\n';
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    state,
    file,
    scope,
    proof,
    auth,
    options: {
      scopeFile: file,
      scopeSha256: sha(bytes),
      ledgerDirectory: state,
      operatorUid: process.getuid(),
      clock: () => now,
      assertCurrent: async () => true,
      nativeFetch: async () => new Response('{"success":true,"data":[]}'),
    },
  };
}
async function request(app, auth, route = '/api/v1/services/450001') {
  if (!app.server.listening)
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return fetch('http://127.0.0.1:' + app.server.address().port + route, {
    headers: {
      Authorization: auth,
      Accept: 'application/vnd.yclients.v2+json',
      'Content-Type': 'application/json',
    },
  });
}
async function stop(app) {
  app.close();
  app.server.closeAllConnections();
  if (app.server.listening) await new Promise((r) => app.server.close(r));
}
test('async current authority is awaited before claim; false cannot create a run', async (t) => {
  const x = files(t, fixture());
  let release;
  const wait = new Promise((r) => (release = r));
  const opening = guardedNativeExecution({
    ...x.options,
    assertCurrent: () => wait,
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(fs.readdirSync(x.state).length, 0);
  release(false);
  await assert.rejects(opening);
  assert.equal(fs.readdirSync(x.state).length, 0);
});
test('concurrent asynchronous starts have exactly one durable claim; restart refuses', async (t) => {
  const x = files(t, fixture());
  const all = await Promise.allSettled(
    Array.from({ length: 4 }, () => guardedNativeExecution(x.options)),
  );
  assert.equal(all.filter((x) => x.status === 'fulfilled').length, 1);
  const app = all.find((x) => x.status === 'fulfilled').value;
  await stop(app);
  await assert.rejects(guardedNativeExecution(x.options));
});
test('async revocation while a current check waits cannot dispatch', async (t) => {
  const x = files(t, fixture());
  let allow = true,
    calls = 0;
  const app = await guardedNativeExecution({
    ...x.options,
    assertCurrent: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return allow;
    },
    nativeFetch: async () => {
      calls++;
      return new Response('{}');
    },
  });
  allow = false;
  assert.equal((await request(app, x.auth)).status, 403);
  assert.equal(calls, 0);
  await stop(app);
});
test('revoke marker closes run without current certificate/allowlist/session; restoration never revives it', async (t) => {
  const x = files(t, fixture());
  const app = await guardedNativeExecution(x.options);
  assert.equal((await request(app, x.auth)).status, 200);
  revokeNativeRun(x.state, x.scope.runId, process.getuid());
  assert.equal((await request(app, x.auth)).status, 403);
  for (const file of fs
    .readdirSync(x.state)
    .filter((n) => n.endsWith('.revoked')))
    fs.unlinkSync(path.join(x.state, file));
  assert.equal((await request(app, x.auth)).status, 403);
  await stop(app);
});
test('same run ID with separately signed attachment cannot replenish budget', async (t) => {
  const f = fixture(),
    x = files(t, f),
    app = await guardedNativeExecution(x.options);
  await stop(app);
  const scope = { ...x.scope, executionAuthorizationDigest: '9'.repeat(64) };
  const bytes = JSON.stringify(scope, null, 2) + '\n';
  fs.writeFileSync(x.file, bytes, { mode: 0o600 });
  await assert.rejects(
    guardedNativeExecution({ ...x.options, scopeSha256: sha(bytes) }),
  );
});
function modelBody(data = {}) {
  return {
    method: 'POST',
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: 'Synthetic canonical system' },
        {
          role: 'user',
          content: JSON.stringify({
            phase: 'tool_planning',
            tool_results: [],
            remembered_notes: [],
            current_user_request: 'Hello',
            ...data,
          }),
        },
      ],
      max_tokens: 10,
      stream: false,
      thinking: { type: 'disabled' },
    }),
  };
}
const price = { inputNanoUsdPerToken: 1320, outputNanoUsdPerToken: 3960 };
for (const data of [
  { phase: 'other' },
  { remembered_notes: ['private'] },
  { semantic_plan: { clientId: 123 } },
  { tool_results: [{ phone: '+79999999999' }] },
  { conversation: [{ content: 'raw@example.invalid' }] },
])
  test(
    'model transport refuses private/noncanonical payload ' +
      JSON.stringify(data),
    () => assert.throws(() => assertNativeModelPayload(modelBody(data), price)),
  );
test('ordinary canonical model transport awaits current authority and burns exactly 12 attempts', async (t) => {
  const x = files(t, fixture());
  let time = now,
    calls = 0,
    current = 0;
  const model = nativeModelTransport({
    proof: x.proof,
    ledgerPath: path.join(x.state, 'model'),
    checkLocal() {},
    assertCurrent: async () => {
      await new Promise((r) => setImmediate(r));
      current++;
      return true;
    },
    testClock: () => time,
    testWait: async (n) => {
      time += n;
    },
    dispatch: async () => {
      calls++;
      assert(current > 0);
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
        }),
      );
    },
  });
  for (let i = 0; i < 12; i++)
    assert.equal(
      (
        await model.fetch(
          'https://api.deepseek.com/chat/completions',
          modelBody(),
        )
      ).status,
      200,
    );
  await assert.rejects(
    model.fetch('https://api.deepseek.com/chat/completions', modelBody()),
  );
  assert.equal(calls, 12);
  assert.equal(model.snapshot().attempts, 12);
  model.close();
});
test('model current refusal never calls provider, even when Bearer is supplied', async (t) => {
  const x = files(t, fixture());
  let calls = 0;
  const model = nativeModelTransport({
    proof: x.proof,
    ledgerPath: path.join(x.state, 'model'),
    checkLocal() {},
    assertCurrent: async () => false,
    testClock: () => now,
    testWait: async () => {},
    dispatch: async () => {
      calls++;
    },
  });
  await assert.rejects(
    model.fetch('https://api.deepseek.com/chat/completions', {
      ...modelBody(),
      headers: { Authorization: 'Bearer fake' },
    }),
  );
  assert.equal(calls, 0);
  model.close();
});

function modelFixture(t, edit = () => {}, dispatch) {
  const f = fixture();
  edit(f.a, f.installed);
  const x = files(t, f);
  let time = now,
    valid = true,
    calls = 0;
  const model = nativeModelTransport({
    proof: x.proof,
    ledgerPath: path.join(x.state, 'bounded-model'),
    checkLocal() {
      assert(valid && time < Date.parse(x.proof.payload.expiresAt));
    },
    assertCurrent: async () => valid,
    testClock: () => time,
    testWait: async (n) => {
      time += n;
    },
    dispatch: async (...args) => {
      calls++;
      if (dispatch) return dispatch(...args);
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
        }),
      );
    },
  });
  t.after(() => model.close());
  return {
    model,
    calls: () => calls,
    expire: () => {
      valid = false;
    },
    send: (body = modelBody()) =>
      model.fetch('https://api.deepseek.com/chat/completions', body),
  };
}
test('nested verified pricing is immutable and caller mutation cannot alter proof', () => {
  const f = fixture(),
    s = f.signed(f.a),
    p = f.verify(s);
  s.payload.pricing.inputNanoUsdPerToken = 1;
  assert.equal(p.payload.pricing.inputNanoUsdPerToken, 1320);
  assert.throws(() => {
    p.payload.pricing.inputNanoUsdPerToken = 1;
  });
});
test('operator may narrow model attempts but cannot replenish them', async (t) => {
  const f = modelFixture(t, (a) => {
    a.maxModelAttempts = 1;
  });
  assert.equal((await f.send()).status, 200);
  await assert.rejects(f.send());
  assert.equal(f.calls(), 1);
});
test('signed spend ceiling refuses before dispatch and remains closed', async (t) => {
  const f = modelFixture(t, (a) => {
    a.maxSpendNanoUsd = 1;
  });
  await assert.rejects(f.send());
  await assert.rejects(f.send());
  assert.equal(f.calls(), 0);
  assert.equal(f.model.snapshot().attempts, 0);
});
test('two dollar ceiling burns conservative reservations, never actual usage refunds', async (t) => {
  const f = modelFixture(t, (a, i) => {
    a.pricing.inputNanoUsdPerToken = 100000;
    a.pricing.outputNanoUsdPerToken = 100000;
    i.pricing = structuredClone(a.pricing);
  });
  const body = modelBody({ current_user_request: 'a'.repeat(10000) });
  await f.send(body);
  await assert.rejects(f.send(body));
  assert.equal(f.calls(), 1);
  assert(f.model.snapshot().reservedNanoUsd > 1000000000);
});
test('model socket loss burns attempt and cannot be retried', async (t) => {
  const f = modelFixture(
    t,
    () => {},
    async () => {
      throw Error('synthetic lost response');
    },
  );
  await assert.rejects(f.send());
  await assert.rejects(f.send());
  assert.equal(f.calls(), 1);
  assert.equal(f.model.snapshot().attempts, 1);
});
test('concurrent model request cannot dispatch twice', async (t) => {
  let release, entered;
  const waiting = new Promise((r) => {
    entered = r;
  });
  const f = modelFixture(
    t,
    () => {},
    async () => {
      entered();
      return new Promise((r) => {
        release = r;
      });
    },
  );
  const first = f.send();
  await waiting;
  await assert.rejects(f.send());
  release(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
      }),
    ),
  );
  await first;
  assert.equal(f.calls(), 1);
});
test('expiry after a model dispatch refuses the response and further requests', async (t) => {
  let f;
  f = modelFixture(
    t,
    () => {},
    async () => {
      f.expire();
      return new Response('{}');
    },
  );
  await assert.rejects(f.send());
  await assert.rejects(f.send());
  assert.equal(f.calls(), 1);
  assert.equal(f.model.snapshot().attempts, 1);
});
