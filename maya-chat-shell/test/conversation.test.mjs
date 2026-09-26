// K5 / S4 — the conversation (src/shell/conversation.ts): the ONE turn path, history (D6), the
// same-requestId retry policy (D12d), notices outside history (P-11, V2-5) and the per-turn states.
//
//   node --test test/conversation.test.mjs
//
// The transport double enforces `AiCoreChatDto` exactly as the backend declares it
// (`ai-tools/dto/ai-core-chat.dto.ts`): keys, surface enum, requestId regex, 1..12 messages, role enum,
// content 1..2000. The long reply is S7's recorded fixture (`dev/fixtures/api/ai/chat.201.long-reply.json`,
// 3 500 units with a surrogate pair across the 2 000 boundary). The last tests run the conversation
// over S3's real `createNet` with `fetch` replaced, so the D6 cut is proven through the real client too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISPLAY_CAP,
  HISTORY_PRIOR_MAX,
  MAX_TURN_CHARS,
  createConversation,
  noticeFor,
  retryPolicy,
  truncateForHistory,
} from '../src/shell/conversation.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(SH, rel), 'utf8');
const fixtureBody = (rel) => JSON.parse(read(`dev/fixtures/api/${rel}`)).body;

const T0 = Date.parse('2026-09-17T10:00:00.000Z');
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ── doubles ────────────────────────────────────────────────────────────────────────────────────

const DTO_KEYS = ['messages', 'requestId', 'surface'];
/** `AiCoreChatDto` + `AiCoreChatMessageDto`, as the backend's ValidationPipe applies them. */
const dtoViolations = (body) => {
  const out = [];
  if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(DTO_KEYS)) out.push(`keys ${Object.keys(body)}`);
  if (!['native', 'web', 'telegram', 'voice'].includes(body.surface)) out.push('surface');
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId)) out.push('requestId');
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) out.push('messages.length');
  for (const [i, m] of (Array.isArray(body.messages) ? body.messages : []).entries()) {
    if (JSON.stringify(Object.keys(m).sort()) !== JSON.stringify(['content', 'role'])) out.push(`messages.${i} keys`);
    if (!['user', 'assistant'].includes(m.role)) out.push(`messages.${i}.role`);
    if (typeof m.content !== 'string' || m.content.length < 1 || m.content.length > 2000) out.push(`messages.${i}.content`);
  }
  return out;
};

const makeTransport = () => {
  const calls = [];
  const transport = {
    chat(request, signal) {
      let resolve;
      const settled = new Promise((r) => (resolve = r));
      const raw = JSON.stringify(request);
      const violations = dtoViolations(JSON.parse(raw));
      const call = { body: JSON.parse(raw), raw, signal, resolve, violations };
      calls.push(call);
      // The backend answers a DTO violation with 400, which the client maps to outdated_client.
      if (violations.length > 0) resolve({ ok: false, failure: { reason: 'outdated_client' } });
      return settled;
    },
  };
  const reply = async (i, text, action_status = null) => {
    calls[i].resolve({ ok: true, value: { request_id: calls[i].body.requestId, reply: text, action_status } });
    await flush();
  };
  const fail = async (i, failure) => {
    calls[i].resolve({ ok: false, failure });
    await flush();
  };
  return { transport, calls, reply, fail };
};

const SIGNED_IN = { signedIn: true, display: { userName: 'Стас', tenantName: 'Мужская Эстетика' } };
const makeSession = (initial = SIGNED_IN) => {
  let view = initial;
  const listeners = new Set();
  return {
    view: () => view,
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    set(next) {
      view = next;
      for (const l of [...listeners]) l(next);
    },
  };
};

const setup = (options = {}) => {
  const t = makeTransport();
  const session = makeSession(options.session);
  let now = T0;
  let ids = 0;
  const aborts = [];
  const conversation = createConversation({
    transport: t.transport,
    session,
    scheduler: { now: () => now },
    newAbort: () => {
      const c = new AbortController();
      const handle = { signal: c.signal, abort: () => (aborts.push(c), c.abort()) };
      return handle;
    },
    newRequestId: () => `turn-${String(++ids).padStart(8, '0')}`,
  });
  return { ...t, session, conversation, aborts, advance: (ms) => (now += ms), items: () => conversation.view().items };
};

const TYPED = { modality: 'typed' };
const SPOKEN = { modality: 'spoken' };

// ── 1. the one path ────────────────────────────────────────────────────────────────────────────

test('submitUserTurn is the sole path: only it (and retry of its own turn) calls Transport.chat', async () => {
  // Source: `.chat(` is called in exactly one module of the bundle outside net/ (which implements it).
  const roots = ['src', 'entry'].filter((r) => fs.existsSync(path.join(SH, r)));
  const files = roots.flatMap((r) => fs.readdirSync(path.join(SH, r), { recursive: true }).filter((f) => f.endsWith('.ts')).map((f) => path.join(r, f)));
  const callers = files.filter((f) => !f.startsWith(path.join('src', 'net'))).filter((f) => /\.chat\s*\(/.test(read(f).replace(/^\s*\/\/.*$/gm, '')));
  assert.deepEqual(callers, [path.join('src', 'shell', 'conversation.ts')]);
  assert.equal((read('src/shell/conversation.ts').match(/\.chat\s*\(/g) ?? []).length, 1, 'one call site');

  // Surface: the port adds nothing that sends.
  const s = setup();
  assert.deepEqual(Object.keys(s.conversation).sort(), ['dispose', 'retry', 'submitUserTurn', 'subscribe', 'timeline', 'view']);
  assert.deepEqual(Object.keys(s.conversation.timeline).sort(), ['appendNotice', 'appendServerLine', 'appendWidget', 'hasItem', 'onDropped', 'replaceWidget']);
  s.conversation.timeline.appendNotice('deeplink_refused');
  s.conversation.timeline.appendServerLine('server-authored receipt');
  s.conversation.timeline.appendWidget({ kind: 'widget', id: 'w1', result: {}, display: 'live', pending: null, sentence: null });
  s.conversation.retry('nope');
  assert.equal(s.calls.length, 0, 'writing the timeline or retrying nothing sends nothing');

  const r = s.conversation.submitUserTurn('Когда ближайшее окно?', TYPED);
  assert.equal(r.accepted, true);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.calls[0].body, {
    surface: 'web',
    requestId: 'turn-00000001',
    messages: [
      { role: 'assistant', content: 'server-authored receipt' },
      { role: 'user', content: 'Когда ближайшее окно?' },
    ],
  });

  // The voice hook reaches the conversation through submitUserTurn only.
  assert.match(read('src/shell/voice-state.ts'), /deps\.conversation\.submitUserTurn\(transcript, SPOKEN\)/);
  assert.ok(!/transport\.chat/.test(read('src/shell/voice-state.ts')));
});

test('typed and spoken turns are byte-identical on the wire; the modality stays on the item', async () => {
  const a = setup();
  const b = setup();
  a.conversation.submitUserTurn('мои записи', TYPED);
  b.conversation.submitUserTurn('мои записи', SPOKEN);
  assert.equal(a.calls[0].raw, b.calls[0].raw);
  assert.ok(!/typed|spoken|modality|audience|tenant/.test(b.calls[0].raw));
  assert.equal(b.items()[0].modality, 'spoken');
  assert.equal(a.items()[0].modality, 'typed');
});

test('the user text: NFC and trimmed, 1..2000 units, refused visibly and never truncated; one turn in flight', async () => {
  const s = setup();
  assert.deepEqual(s.conversation.submitUserTurn('   \n\t ', TYPED), { accepted: false, refusal: 'empty' });
  assert.deepEqual(s.conversation.submitUserTurn('я'.repeat(MAX_TURN_CHARS + 1), TYPED), { accepted: false, refusal: 'too_long' });
  assert.equal(s.calls.length, 0);

  // Decomposed «й» (и + U+0306) is sent composed.
  const r = s.conversation.submitUserTurn('  Мой мастер  ', TYPED);
  assert.equal(r.accepted, true);
  assert.equal(s.calls[0].body.messages[0].content, 'Мой мастер');
  assert.equal(s.items()[0].state, 'sending');
  assert.equal(s.conversation.view().inFlight, true);

  // Double Enter: exactly one POST.
  assert.deepEqual(s.conversation.submitUserTurn('ещё', TYPED), { accepted: false, refusal: 'in_flight' });
  assert.equal(s.calls.length, 1);
  await s.reply(0, 'Ваш мастер — Илья.');
  assert.equal(s.conversation.view().inFlight, false);
  assert.equal(s.items()[0].state, 'sent');

  const full = 'ж'.repeat(MAX_TURN_CHARS);
  assert.equal(s.conversation.submitUserTurn(full, TYPED).accepted, true);
  assert.equal(s.calls[1].body.messages.at(-1).content, full);
  assert.deepEqual(s.calls[1].violations, []);

  const signedOut = setup({ session: { signedIn: false, reason: null } });
  assert.deepEqual(signedOut.conversation.submitUserTurn('привет', TYPED), { accepted: false, refusal: 'composer_disabled' });
  assert.deepEqual(signedOut.conversation.view().composer, { enabled: false, reason: 'signed_out' });
  assert.equal(signedOut.calls.length, 0);
});

// ── 2. history (D6) ────────────────────────────────────────────────────────────────────────────

test('D6: after the 3 500-unit reply fixture every history item is ≤ 2000, the pair is not split, and the next turns are accepted', async () => {
  const long = fixtureBody('ai/chat.201.long-reply.json').reply;
  assert.equal(long.length, 3500, 'the recorded fixture');
  const hi = long.charCodeAt(1999);
  assert.ok(hi >= 0xd800 && hi <= 0xdbff, 'the fixture straddles the boundary with a surrogate pair');

  const s = setup();
  s.conversation.submitUserTurn('Распиши неделю', TYPED);
  await s.reply(0, long);
  const shown = s.items().find((i) => i.kind === 'assistant');
  assert.equal(shown.text, long, 'the display keeps the full reply');

  s.conversation.submitUserTurn('А на завтра?', TYPED);
  const next = s.calls[1];
  assert.deepEqual(next.violations, [], 'the DTO-enforcing double accepts the next turn');
  for (const m of next.body.messages) assert.ok(m.content.length <= 2000, `${m.role} ${m.content.length}`);
  const cut = next.body.messages.find((m) => m.role === 'assistant').content;
  assert.equal(cut.length, 1999, 'backs off one unit before the high surrogate');
  assert.equal(cut, long.slice(0, 1999));
  assert.ok(!/[\uD800-\uDBFF]$/.test(cut));

  // Non-vacuity: the untruncated history is exactly what the DTO refuses.
  assert.ok(dtoViolations({ ...next.body, messages: [next.body.messages[0], { role: 'assistant', content: long }, next.body.messages[2]] }).includes('messages.1.content'));

  await s.reply(1, long);
  s.conversation.submitUserTurn('И послезавтра', TYPED);
  assert.deepEqual(s.calls[2].violations, [], 'the turn after is still sendable');
  assert.equal(s.calls[2].body.messages.filter((m) => m.role === 'assistant').length, 2);

  assert.equal(truncateForHistory('a'.repeat(2000)), 'a'.repeat(2000));
  assert.equal(truncateForHistory('a'.repeat(2001)).length, 2000);
  assert.equal(truncateForHistory(`${'a'.repeat(1999)}😀tail`).length, 1999);
  assert.equal(truncateForHistory(`${'a'.repeat(1998)}😀tail`).length, 2000);
});

test('history: only sent user turns and real replies, the last 11 plus the new message (DTO 1..12)', async () => {
  const s = setup();
  for (let i = 0; i < 15; i += 1) {
    s.conversation.submitUserTurn(`вопрос ${i}`, TYPED);
    await s.reply(i, `ответ ${i}`);
  }
  s.conversation.submitUserTurn('последний', TYPED);
  const body = s.calls.at(-1).body;
  assert.equal(body.messages.length, HISTORY_PRIOR_MAX + 1);
  assert.deepEqual(s.calls.at(-1).violations, []);
  assert.deepEqual(body.messages.at(-1), { role: 'user', content: 'последний' });
  assert.deepEqual(body.messages.at(-2), { role: 'assistant', content: 'ответ 14' });
  assert.deepEqual(body.messages[0], { role: 'assistant', content: 'ответ 9' });
  for (const [i, call] of s.calls.entries()) assert.deepEqual(call.violations, [], `call ${i}`);
});

// ── 3. retry policy (D12d) ─────────────────────────────────────────────────────────────────────

const FAILURES = [
  [{ reason: 'rate_limited', retryAfterSec: 30 }, 'same_request'],
  [{ reason: 'no_connection' }, 'same_request'],
  [{ reason: 'aborted' }, 'same_request'],
  [{ reason: 'model_failure' }, 'same_request'],
  [{ reason: 'server_error', status: 503 }, 'same_request'],
  [{ reason: 'server_error', status: 502 }, 'same_request'],
  [{ reason: 'server_error', status: 500 }, 'new_turn_only'],
  [{ reason: 'conflict' }, 'new_turn_only'],
  [{ reason: 'unexpected_response', status: 200 }, 'new_turn_only'],
  [{ reason: 'subscription_required' }, 'none'],
  [{ reason: 'feature_locked' }, 'none'],
  [{ reason: 'tenant_required' }, 'none'],
  [{ reason: 'forbidden' }, 'none'],
  [{ reason: 'outdated_client' }, 'none'],
  [{ reason: 'signed_out', signedOut: 'session_expired' }, 'none'],
];

test('same-requestId retry only after 429 / 502 / network / abort / 503 — never after 409 or an unknown outcome', async () => {
  // Every member of the frozen ChatFailure union is in the table.
  const union = read('src/net/types.ts').match(/export type ChatFailure =([\s\S]*?)\n\n/)[1];
  const reasons = [...new Set([...union.matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual([...new Set(FAILURES.map(([f]) => f.reason))].sort(), reasons);

  for (const [failure, expected] of FAILURES) {
    assert.equal(retryPolicy(failure, T0).retry, expected, failure.reason);
    const s = setup();
    s.conversation.submitUserTurn('Запиши меня на завтра', TYPED);
    await s.fail(0, failure);
    const item = s.items().find((i) => i.kind === 'user');
    assert.equal(item.state, 'failed', failure.reason);
    assert.deepEqual(item.failure, failure);
    assert.equal(item.retry.retry, expected, failure.reason);
    assert.ok(!s.items().some((i) => i.kind === 'assistant'), 'never a MAYA bubble for a failure');
    if (failure.reason === 'rate_limited') {
      assert.equal(item.retry.notBefore, T0 + 30_000);
      s.conversation.retry(item.id);
      assert.equal(s.calls.length, 1, 'no retry before Retry-After');
      s.advance(30_000);
    }
    s.conversation.retry(item.id);
    if (expected === 'same_request') {
      assert.equal(s.calls.length, 2, `${failure.reason}: retried`);
      assert.equal(s.calls[1].body.requestId, s.calls[0].body.requestId, 'byte-identical requestId');
      assert.equal(s.calls[1].raw, s.calls[0].raw, 'byte-identical body');
    } else {
      assert.equal(s.calls.length, 1, `${failure.reason}: no same-id retry`);
      if (s.conversation.view().composer.enabled) {
        s.conversation.submitUserTurn('Запиши меня на завтра', TYPED);
        assert.notEqual(s.calls[1].body.requestId, s.calls[0].body.requestId, 'sending again is a new turn with a new id');
      }
    }
  }
});

test('409 is terminal for its id; an older failed turn loses its same-id retry once the conversation moves on', async () => {
  const s = setup();
  s.conversation.submitUserTurn('Подтверди запись', TYPED);
  await s.fail(0, { reason: 'conflict' });
  const conflicted = s.items()[0];
  for (let i = 0; i < 3; i += 1) s.conversation.retry(conflicted.id);
  assert.equal(s.calls.length, 1);

  const t = setup();
  t.conversation.submitUserTurn('первый', TYPED);
  await t.fail(0, { reason: 'no_connection' });
  const first = t.items()[0];
  assert.equal(first.retry.retry, 'same_request');
  t.conversation.submitUserTurn('второй', TYPED);
  await t.reply(1, 'ок');
  assert.equal(t.items()[0].retry.retry, 'new_turn_only', 'a re-send would carry a different history under the old id');
  t.conversation.retry(first.id);
  assert.equal(t.calls.length, 2, 'no request');
  // Failed turns are not history.
  t.conversation.submitUserTurn('третий', TYPED);
  assert.ok(!t.calls[2].body.messages.some((m) => m.content === 'первый'));
});

// ── 4. notices are never history (P-11, V2-5) ──────────────────────────────────────────────────

test('approval_required: the reply, then the approval_not_here notice; the next turn carries the reply and never the notice', async () => {
  const approval = fixtureBody('ai/chat.201.approval-required.json');
  const s = setup();
  s.conversation.submitUserTurn('Запиши меня на стрижку завтра в 12', TYPED);
  await s.reply(0, approval.reply, approval.action.status);
  const kinds = s.items().map((i) => (i.kind === 'notice' ? `notice:${i.notice}` : i.kind));
  assert.deepEqual(kinds, ['user', 'assistant', 'notice:approval_not_here']);
  assert.ok(!('approval' in s.items()[2]) && !JSON.stringify(s.conversation.view()).includes('appointments.own.create'));

  s.conversation.submitUserTurn('Спасибо', TYPED);
  const body = s.calls[1].raw;
  assert.ok(body.includes(approval.reply));
  assert.ok(!/approval_not_here|notice|подтвердить его здесь/.test(body));
  assert.deepEqual(s.calls[1].body.messages.map((m) => m.role), ['user', 'assistant', 'user']);
});

test('402 / 403 / tenant_required / 400: a conversation notice, the composer state, and none of it in history', async () => {
  const cases = [
    [{ reason: 'subscription_required' }, 'subscription_required', { enabled: false, reason: 'subscription_required' }],
    [{ reason: 'feature_locked' }, 'feature_locked', { enabled: true }],
    [{ reason: 'tenant_required' }, 'tenant_required', { enabled: false, reason: 'tenant_required' }],
    [{ reason: 'outdated_client' }, 'outdated_client', { enabled: true }],
  ];
  for (const [failure, notice, composer] of cases) {
    assert.equal(noticeFor(failure), notice);
    const s = setup();
    s.conversation.submitUserTurn('привет', TYPED);
    await s.reply(0, 'Здравствуйте!');
    s.conversation.submitUserTurn('мои записи', TYPED);
    await s.fail(1, failure);
    assert.deepEqual(s.items().at(-1), { kind: 'notice', id: s.items().at(-1).id, notice });
    assert.deepEqual(s.conversation.view().composer, composer);
    if (composer.enabled) {
      s.conversation.submitUserTurn('ещё раз', TYPED);
      const raw = s.calls[2].raw;
      assert.ok(!raw.includes(notice) && !raw.includes('мои записи'), 'neither the notice nor the failed turn is history');
    } else {
      assert.deepEqual(s.conversation.submitUserTurn('ещё раз', TYPED), { accepted: false, refusal: 'composer_disabled' });
    }
  }
  for (const [failure] of FAILURES) if (!['subscription_required', 'feature_locked', 'tenant_required', 'outdated_client'].includes(failure.reason)) assert.equal(noticeFor(failure), null);
});

// ── 5. session, cap, subscribers ───────────────────────────────────────────────────────────────

test('sign-out empties the timeline and aborts the turn in flight; nothing crosses into the next session', async () => {
  const s = setup();
  const dropped = [];
  const reasons = [];
  s.conversation.timeline.onDropped((ids, reason) => (dropped.push(...ids), reasons.push(reason)));
  s.conversation.submitUserTurn('старый вопрос', TYPED);
  await s.reply(0, 'старый ответ');
  s.conversation.timeline.appendWidget({ kind: 'widget', id: 'w9', result: {}, display: 'live', pending: null, sentence: null });
  s.conversation.submitUserTurn('в полёте', TYPED);
  assert.equal(s.conversation.view().inFlight, true);

  s.session.set({ signedIn: false, reason: 'session_expired' });
  assert.equal(s.aborts.length, 1, 'the in-flight turn is aborted');
  assert.equal(s.calls[1].signal.aborted, true);
  assert.deepEqual(s.conversation.view(), { items: [], inFlight: false, composer: { enabled: false, reason: 'signed_out' }, dropped: 0 });
  assert.ok(dropped.includes('w9'), 'widget owners release their items');
  assert.deepEqual(reasons, ['cleared']);
  await s.fail(1, { reason: 'aborted' });
  assert.deepEqual(s.items(), [], 'a late outcome for the cleared turn draws nothing');

  s.session.set(SIGNED_IN);
  s.conversation.submitUserTurn('новая сессия', TYPED);
  assert.deepEqual(s.calls[2].body.messages, [{ role: 'user', content: 'новая сессия' }]);
});

test('display cap: 200 items on screen, older ones dropped and disclosed, never silently', async () => {
  const s = setup();
  const dropped = [];
  const reasons = new Set();
  s.conversation.timeline.onDropped((ids, reason) => (dropped.push(...ids), reasons.add(reason)));
  for (let i = 0; i < 105; i += 1) {
    s.conversation.submitUserTurn(`q${i}`, TYPED);
    await s.reply(i, `a${i}`);
  }
  const view = s.conversation.view();
  assert.equal(view.dropped, 10);
  assert.equal(view.items.length, DISPLAY_CAP + 1);
  assert.deepEqual(view.items[0], { kind: 'notice', id: 'notice:display_capped', notice: 'display_capped' });
  assert.equal(dropped.length, 10);
  assert.deepEqual([...reasons], ['cap']);
  s.conversation.submitUserTurn('ещё', TYPED);
  assert.equal(s.calls.at(-1).body.messages.length, 12, 'history is unaffected by the display cap');
});

test('subscribers see every state change, in order, and can unsubscribe', async () => {
  const s = setup();
  const seen = [];
  const off = s.conversation.subscribe((v) => seen.push(v.items.map((i) => (i.kind === 'user' ? `user:${i.state}` : i.kind)).join(',')));
  s.conversation.submitUserTurn('привет', TYPED);
  await s.reply(0, 'Здравствуйте');
  off();
  s.conversation.submitUserTurn('ещё', TYPED);
  assert.deepEqual(seen, ['user:sending', 'user:sent,assistant']);
  assert.equal(s.conversation.view().inFlight, true, 'view() stays current without subscribers');
});

// ── 6. over S3's real client ───────────────────────────────────────────────────────────────────

test('over the real net client: the long reply and the approval shape end in DTO-valid next turns (fetch replaced)', async () => {
  const wire = [];
  const bodies = [fixtureBody('ai/chat.201.long-reply.json'), fixtureBody('ai/chat.201.approval-required.json'), fixtureBody('ai/chat.201.reply.json')];
  const loginBody = {
    access_token: 'eyJhbGciOiJIUzI1NiJ9.access-1.sig',
    refresh_token: 'maya_rt_00000000-0000-4000-8000-000000000001.secret',
    token_type: 'Bearer',
    expires_in: 900,
    refresh_expires_at: '2026-10-17T10:00:00.000Z',
    session: { id: 's1' },
    user: { id: 'u1', name: 'Стас', role: 'business_owner', tenant: { id: 't1', name: 'Мужская Эстетика', slug: 'male-esthetic' } },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    wire.push({ url: String(url), body });
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url) === '/api/auth/login') return json(201, loginBody);
    if (String(url) !== '/api/ai/chat') return json(404, { message: 'not found' });
    const violations = dtoViolations(body);
    if (violations.length > 0) return json(400, { message: violations.join(', '), error: { code: 'validation', message: violations.join(', '), field: 'messages' } });
    const next = bodies.shift();
    const filled = JSON.parse(JSON.stringify(next).replaceAll('{{request_id}}', body.requestId).replace(/\{\{[a-z_]+\}\}/g, 'x'));
    return json(201, filled);
  };
  try {
    const { createNet } = await import('../src/net/session.ts');
    const net = createNet({ now: () => T0 });
    assert.equal((await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9')).step, 'signed_in');
    let ids = 0;
    const conversation = createConversation({
      transport: net.transport,
      session: net.session,
      scheduler: { now: () => T0 },
      newAbort: () => new AbortController(),
      newRequestId: () => `real-turn-${++ids}`,
    });
    const settle = () =>
      new Promise((resolve) => {
        const off = conversation.subscribe((v) => {
          if (!v.inFlight) {
            off();
            resolve(v);
          }
        });
      });
    conversation.submitUserTurn('Распиши неделю', TYPED);
    let v = await settle();
    assert.equal(v.items.at(-1).text.length, 3500);
    conversation.submitUserTurn('Запиши меня завтра в 12', TYPED);
    v = await settle();
    assert.equal(v.items.at(-1).notice, 'approval_not_here');
    assert.equal(v.items.at(-2).kind, 'assistant');
    conversation.submitUserTurn('Спасибо', TYPED);
    v = await settle();
    assert.equal(v.items.at(-1).kind, 'assistant', 'accepted by the DTO-enforcing server');
    const chats = wire.filter((w) => w.url === '/api/ai/chat');
    assert.equal(chats.length, 3);
    for (const c of chats) {
      assert.deepEqual(dtoViolations(c.body), []);
      assert.ok(!JSON.stringify(c.body).includes('approval_not_here'));
      assert.ok(!('audience' in c.body) && !JSON.stringify(c.body).includes('male-esthetic'));
    }
    assert.deepEqual(chats[2].body.messages.map((m) => [m.role, m.content.length]), [
      ['user', 'Распиши неделю'.length],
      ['assistant', 1999],
      ['user', 'Запиши меня завтра в 12'.length],
      ['assistant', fixtureBody('ai/chat.201.approval-required.json').reply.length],
      ['user', 'Спасибо'.length],
    ]);
    conversation.dispose();
  } finally {
    globalThis.fetch = realFetch;
  }
});
