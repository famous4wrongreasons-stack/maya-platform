// Synthetic wire only: fetch is replaced; no server, provider, storage or browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/net/client.ts';
import { projectHistoryErasure, projectHistoryErasureRequest } from '../src/net/project.ts';

const request = { conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', requestId: '12345678-abcd-4def-8abc-123456789abc' };
const completion = { contract: 'maya.privacy.history-erasure/1', outcome: 'COMPLETED', ...request, erasedAt: '2026-10-07T12:34:56.789Z' };
const url = `/api/privacy/conversations/${request.conversationId}/erasure`;
const signal = () => new AbortController().signal;
const failed = (reason) => ({ ok: false, failure: { reason } });
const response = (body = completion, status = 200) => new Response(JSON.stringify(body), { status });
const authorizer = (overrides = {}) => ({
  authorize: async () => ({ kind: 'bearer', bearer: 'synthetic-first', serial: 1 }),
  reauthorize: async () => { throw new Error('unexpected refresh'); },
  refused: () => { throw new Error('unexpected refusal'); },
  ...overrides,
});
async function wire(handler, run, auth = authorizer(), timeouts = { requestMs: 1000, transcribeMs: 1000 }) {
  const calls = [], saved = globalThis.fetch;
  globalThis.fetch = async (target, options) => { calls.push({ url: target, ...options }); return handler(calls.at(-1), calls.length); };
  try { await run(createTransport(auth, timeouts), calls); } finally { globalThis.fetch = saved; }
}

test('history erasure net: canonical path, exact body, current bearer and allowlisted original completion', async () => {
  await wire(() => response({ ...completion, privateReceipt: 'PRIVATE', tenantId: 'PRIVATE', count: 9 }), async (net, calls) => {
    const supplied = { conversationId: request.conversationId.toUpperCase(), requestId: request.requestId.toUpperCase(), tenantId: 'foreign', proof: 'PRIVATE' };
    assert.deepEqual(await net.eraseConversation(supplied, signal()), { ok: true, value: completion });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, url);
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].body), { requestId: request.requestId });
    assert.deepEqual(calls[0].headers, { Authorization: 'Bearer synthetic-first', 'Content-Type': 'application/json' });
    assert.equal(calls[0].credentials, 'omit');
    assert.equal(calls[0].cache, 'no-store');
    assert.equal(calls[0].redirect, 'error');
  });
});

test('history erasure net: invalid UUIDs and getters are refused before authorization or fetch', async () => {
  let authorized = 0;
  const invalid = ['', ' ', '../admin', `${request.conversationId}/../other`, `${request.conversationId}?all=true`, `https://other/${request.conversationId}`, ` ${request.conversationId}`, `${request.conversationId}\n`, '00000000-0000-0000-0000-000000000000', request.conversationId.replace('-4ccc-', '-0ccc-'), request.conversationId.replace('-8ddd-', '-7ddd-'), null, 42];
  await wire(() => { throw new Error('unexpected fetch'); }, async (net, calls) => {
    for (const value of invalid) {
      assert.deepEqual(await net.eraseConversation({ ...request, conversationId: value }, signal()), failed('invalid_request'));
      assert.deepEqual(await net.eraseConversation({ ...request, requestId: value }, signal()), failed('invalid_request'));
    }
    for (const value of [null, [], Object.create(request), { requestId: request.requestId, get conversationId() { throw new Error('getter'); } }]) {
      assert.deepEqual(await net.eraseConversation(value, signal()), failed('invalid_request'));
    }
    assert.equal(authorized, 0);
    assert.equal(calls.length, 0);
  }, authorizer({ authorize: async () => { authorized++; return { kind: 'bearer', bearer: 'synthetic', serial: 1 }; } }));
});

test('history erasure net: completion needs exact contract, canonical echoes and a real UTC timestamp', () => {
  const bad = [
    null, [], {}, Object.create(completion),
    { ...completion, contract: 'maya.privacy.history-erasure/2' },
    { ...completion, outcome: 'ACCEPTED' },
    { ...completion, conversationId: request.requestId },
    { ...completion, requestId: request.conversationId },
    { ...completion, conversationId: request.conversationId.toUpperCase() },
    { ...completion, requestId: request.requestId.toUpperCase() },
    ...['2026-02-30T12:34:56.789Z', '2026-10-07T24:34:56.789Z', '2026-10-07T12:34:56Z', '2026-10-07T12:34:56.789+00:00', '', null].map((erasedAt) => ({ ...completion, erasedAt })),
    { ...completion, get erasedAt() { throw new Error('getter'); } },
  ];
  for (const value of bad) assert.equal(projectHistoryErasure(value, request), null);
  assert.equal(projectHistoryErasure(completion, { ...request, requestId: 'bad' }), null);
  assert.deepEqual(projectHistoryErasureRequest({ ...request, conversationId: request.conversationId.toUpperCase() }), request);
  assert.deepEqual(projectHistoryErasure({ ...completion, erasedAt: '2024-02-29T12:34:56.789Z' }, request), { ...completion, erasedAt: '2024-02-29T12:34:56.789Z' });
});

test('history erasure net: malformed 2xx is unknown and never resends', async () => {
  for (const reply of [() => response({ ...completion, outcome: 'STARTED' }), () => new Response(null, { status: 204 }), () => new Response('not JSON', { status: 200 }), () => response({ ...completion, requestId: request.conversationId })]) {
    await wire(reply, async (net, calls) => {
      assert.deepEqual(await net.eraseConversation(request, signal()), failed('unknown'));
      assert.equal(calls.length, 1);
    });
  }
});

test('history erasure net: finite HTTP failures disclose no response content and never resend', async () => {
  for (const [status, reason] of [[400, 'invalid_request'], [403, 'forbidden'], [404, 'unavailable'], [409, 'conflict'], [402, 'unknown'], [429, 'unknown'], [500, 'unknown'], [502, 'unknown'], [503, 'unknown']]) {
    await wire(() => response({ message: 'PRIVATE', error: { code: 'history_erasure_unlinked_draft_content', detail: 'PRIVATE' } }, status), async (net, calls) => {
      assert.deepEqual(await net.eraseConversation(request, signal()), failed(reason));
      assert.equal(calls.length, 1);
    });
  }
});

test('history erasure net: lost result stays unknown until an explicit same-request retry returns persisted completion', async () => {
  await wire((_call, count) => { if (count === 1) throw new TypeError('synthetic lost reply'); return response(completion); }, async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(request, signal()), failed('unknown'));
    assert.equal(calls.length, 1);
    assert.deepEqual(await net.eraseConversation(request, signal()), { ok: true, value: completion });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, calls[1].url);
    assert.equal(calls[0].body, calls[1].body);
  });
});

test('history erasure net: timeout and caller abort after dispatch are unknown, with no retry', async () => {
  const hang = (call) => new Promise((_, reject) => call.signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
  await wire(hang, async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(request, signal()), failed('unknown'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal.aborted, true);
  }, authorizer(), { requestMs: 5, transcribeMs: 5 });
  const controller = new AbortController();
  await wire((call) => { const pending = hang(call); controller.abort(); return pending; }, async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(request, controller.signal), failed('unknown'));
    assert.equal(calls.length, 1);
  });
});

test('history erasure net: signed-out, unavailable auth and pre-abort dispatch nothing', async () => {
  for (const [authorization, expected] of [
    [{ kind: 'signed_out', reason: 'session_revoked' }, { ok: false, failure: { reason: 'signed_out', signedOut: 'session_revoked' } }],
    [{ kind: 'unavailable', exchange: { kind: 'network' } }, failed('unknown')],
  ]) {
    await wire(() => { throw new Error('unexpected fetch'); }, async (net, calls) => {
      assert.deepEqual(await net.eraseConversation(request, signal()), expected);
      assert.equal(calls.length, 0);
    }, authorizer({ authorize: async () => authorization }));
  }
  const controller = new AbortController(); controller.abort();
  await wire(() => { throw new Error('unexpected fetch'); }, async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(request, controller.signal), failed('unknown'));
    assert.equal(calls.length, 0);
  });
});

test('history erasure net: one current-auth 401 refresh preserves the exact frozen request', async () => {
  const supplied = { ...request }, refreshed = [];
  await wire((_call, count) => response(count === 1 ? {} : completion, count === 1 ? 401 : 200), async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(supplied, signal()), { ok: true, value: completion });
    assert.deepEqual(refreshed, [1]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((c) => c.url), [url, url]);
    assert.deepEqual(calls.map((c) => JSON.parse(c.body)), [{ requestId: request.requestId }, { requestId: request.requestId }]);
    assert.deepEqual(calls.map((c) => c.headers.Authorization), ['Bearer synthetic-first', 'Bearer synthetic-second']);
  }, authorizer({ reauthorize: async (serial) => {
    refreshed.push(serial);
    supplied.conversationId = request.requestId; supplied.requestId = request.conversationId;
    return { kind: 'bearer', bearer: 'synthetic-second', serial: 2 };
  } }));
});

test('history erasure net: second 401 ends the session without a third dispatch', async () => {
  const refused = [];
  await wire(() => response({}, 401), async (net, calls) => {
    assert.deepEqual(await net.eraseConversation(request, signal()), { ok: false, failure: { reason: 'signed_out', signedOut: 'session_revoked' } });
    assert.equal(calls.length, 2);
    assert.deepEqual(refused, [2]);
  }, authorizer({ reauthorize: async () => ({ kind: 'bearer', bearer: 'synthetic-second', serial: 2 }), refused: (serial) => refused.push(serial) }));
});

test('history erasure net: revocation or lost refresh after 401 cannot dispatch again', async () => {
  for (const [authorization, expected] of [
    [{ kind: 'signed_out', reason: 'signed_out' }, { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } }],
    [{ kind: 'unavailable', exchange: { kind: 'timeout' } }, failed('unknown')],
  ]) {
    await wire(() => response({}, 401), async (net, calls) => {
      assert.deepEqual(await net.eraseConversation(request, signal()), expected);
      assert.equal(calls.length, 1);
    }, authorizer({ reauthorize: async () => authorization }));
  }
});

// Compiler-backed mutation proof is separate from the lightweight mocked wire tests above.
test('history erasure ratchet: only the exact UUID-guarded encoded suffix is admitted', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { loadTypeScript, emitContract, runFixture, sharedDirs } = await import('../build.mjs');
  const ts = loadTypeScript(), shell = fileURLToPath(new URL('../', import.meta.url));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-history-erasure-net-'));
  try {
    const contract = emitContract(ts, temporary), shared = sharedDirs(ts, contract);
    const source = fs.readFileSync(path.join(shell, 'src/net/client.ts'), 'utf8');
    const files = () => new Map(['src/net/endpoint.ts', 'src/net/project.ts', 'src/net/client.ts', 'src/net/session.ts'].map((p) => [p, fs.readFileSync(path.join(shell, p), 'utf8')]));
    const check = (id, text, direction) => runFixture(ts, contract, { id, direction, row: 'net', files: files().set('src/net/client.ts', text), expect: new Set(), probes: false, typecheck: null }, shared);
    assert.deepEqual(check('privacy-admit', source, 'admit').refusals, []);
    for (const [id, before, after] of [
      ['suffix', '/erasure` : PATHS[endpoint]', '/export` : PATHS[endpoint]'],
      ['literal-space', '/erasure` : PATHS[endpoint]', '/era sure` : PATHS[endpoint]'],
      ['prefix', "historyErasure: '/privacy/conversations'", "historyErasure: '/privacy/admin'"],
      ['encoding', '${encodeURIComponent(erasureConversationId)}/erasure', '${erasureConversationId}/erasure'],
      ['uuid-guard', "if (endpoint === 'historyErasure' && (erasureConversationId.length", "if (endpoint === 'chat' && (erasureConversationId.length"],
      ['arbitrary-path', 'const path = endpoint ===', "const path = erasureConversationId; const unusedPath = endpoint ==="],
      ['mutated-id', 'const controller = new AbortController();', "erasureConversationId = '../admin'; const controller = new AbortController();"],
      ['destructured-id', 'const controller = new AbortController();', "[erasureConversationId] = ['../admin']; const controller = new AbortController();"],
    ]) {
      const mutated = source.replace(before, after);
      assert.notEqual(mutated, source, id);
      assert.ok(check(`privacy-${id}`, mutated, 'refuse').got.includes('fetch-shape'), id);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
