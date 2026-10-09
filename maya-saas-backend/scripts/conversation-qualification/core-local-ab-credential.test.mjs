// Pure synthetic readers only. No TTY, file/env credential, network or permit.
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { createAbCredential } from './core-local-ab-credential.mjs';

const SYNTHETIC = 'SYNTHETIC_ONLY_CREDENTIAL_123';
const code = (reason) => ({ message: `core_ab_credential_${reason}` });
const options = (controller) => ({
  signal: controller.signal,
  timeoutMs: 1000,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(read) {
  const calls = [];
  const helper = createAbCredential({
    read: (value) => {
      calls.push(value);
      return read ? read(value) : Promise.resolve(SYNTHETIC);
    },
  });
  return { helper, calls, a: new AbortController(), b: new AbortController() };
}

test('A then B invokes the existing reader seam once and initialize never returns the credential', async () => {
  const f = fixture(),
    { helper } = f;
  assert.ok(Object.isFrozen(helper));
  assert.equal(helper.inputCount, 0);
  assert.throws(() => helper.read('A'), code('not_ready'));
  assert.equal(await helper.initialize('A', options(f.a)), undefined);
  assert.equal(helper.read('A'), SYNTHETIC);
  assert.equal(helper.inputCount, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].timeoutMs, 1000);
  assert.ok(f.calls[0].signal instanceof AbortSignal);
  assert.throws(() => helper.read('B'), code('not_ready'));
  assert.equal(await helper.initialize('B', options(f.b)), undefined);
  assert.equal(helper.read('B'), SYNTHETIC);
  assert.throws(() => helper.read('A'), code('not_ready'));
  assert.equal(helper.inputCount, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.stringify(helper), '{"inputCount":1}');
  helper.clear();
});

test('B first is terminal and never invokes a reader', async () => {
  const f = fixture();
  await assert.rejects(
    f.helper.initialize('B', options(f.b)),
    code('stage_refused'),
  );
  await assert.rejects(
    f.helper.initialize('A', options(f.a)),
    code('stage_refused'),
  );
  assert.throws(() => f.helper.read('B'), code('stage_refused'));
  assert.equal(f.calls.length, 0);
  assert.equal(f.helper.inputCount, 0);
});

for (const repeat of ['A', 'B']) {
  test(`repeated ${repeat} initialization refuses without another reader call`, async () => {
    const f = fixture();
    await f.helper.initialize('A', options(f.a));
    if (repeat === 'B') await f.helper.initialize('B', options(f.b));
    await assert.rejects(
      f.helper.initialize(repeat, options(f.b)),
      code('stage_refused'),
    );
    assert.throws(() => f.helper.read(repeat), code('stage_refused'));
    assert.equal(f.calls.length, 1);
    assert.equal(f.helper.inputCount, 1);
  });
}

test('a concurrent initialization cannot bypass the first pending reader', async () => {
  const pending = deferred(),
    entered = deferred();
  const f = fixture(() => {
    entered.resolve();
    return pending.promise;
  });
  const first = f.helper.initialize('A', options(f.a));
  await entered.promise;
  await assert.rejects(
    f.helper.initialize('B', options(f.b)),
    code('stage_refused'),
  );
  await assert.rejects(first, code('stage_refused'));
  pending.resolve(SYNTHETIC);
  await Promise.resolve();
  assert.throws(() => f.helper.read('A'), code('stage_refused'));
  assert.equal(f.calls.length, 1);
});

test('abort during input promptly rejects even an uncooperative reader; late resolve cannot restore a credential', async () => {
  const pending = deferred(),
    entered = deferred();
  const f = fixture(() => {
    entered.resolve();
    return pending.promise;
  });
  const reading = f.helper.initialize('A', options(f.a));
  await entered.promise;
  f.a.abort(SYNTHETIC);
  await assert.rejects(reading, code('aborted'));
  assert.equal(f.calls[0].signal.aborted, true);
  pending.resolve(SYNTHETIC);
  await Promise.resolve();
  assert.throws(() => f.helper.read('A'), code('aborted'));
  await assert.rejects(f.helper.initialize('B', options(f.b)), code('aborted'));
  assert.equal(f.helper.inputCount, 1);
  assert.equal(getEventListeners(f.a.signal, 'abort').length, 0);
});

test('clear during input aborts the reader and a late rejection stays handled', async () => {
  const pending = deferred(),
    entered = deferred();
  const f = fixture(() => {
    entered.resolve();
    return pending.promise;
  });
  const reading = f.helper.initialize('A', options(f.a));
  await entered.promise;
  f.helper.clear();
  await assert.rejects(reading, code('cleared'));
  assert.equal(f.calls[0].signal.aborted, true);
  pending.reject(new Error(SYNTHETIC));
  await Promise.resolve();
  assert.throws(() => f.helper.read('A'), code('cleared'));
  await assert.rejects(f.helper.initialize('A', options(f.a)), code('cleared'));
});

test('clear in the resolution microtask prevents assignment of a late reader value', async () => {
  const f = fixture(() => {
    queueMicrotask(() => f.helper.clear());
    return SYNTHETIC;
  });
  await assert.rejects(f.helper.initialize('A', options(f.a)), code('cleared'));
  assert.throws(() => f.helper.read('A'), code('cleared'));
  assert.equal(f.helper.inputCount, 1);
});

test('clear before reader dispatch prevents even the first input invocation', async () => {
  const f = fixture();
  const reading = f.helper.initialize('A', options(f.a));
  f.helper.clear();
  await assert.rejects(reading, code('cleared'));
  assert.equal(f.calls.length, 0);
  assert.equal(f.helper.inputCount, 0);
});

for (const stage of ['A', 'B']) {
  test(`abort of the active ${stage} signal drops the stored reference and prevents continuation`, async () => {
    const f = fixture();
    await f.helper.initialize('A', options(f.a));
    if (stage === 'B') await f.helper.initialize('B', options(f.b));
    (stage === 'A' ? f.a : f.b).abort(SYNTHETIC);
    assert.throws(() => f.helper.read(stage), code('aborted'));
    await assert.rejects(
      f.helper.initialize('B', options(new AbortController())),
      code('aborted'),
    );
    assert.equal(f.calls.length, 1);
  });
}

test('B owns the active signal and transition/clear remove only helper listeners', async () => {
  const f = fixture();
  const existingA = () => {},
    existingB = () => {};
  f.a.signal.addEventListener('abort', existingA);
  f.b.signal.addEventListener('abort', existingB);
  await f.helper.initialize('A', options(f.a));
  assert.equal(getEventListeners(f.a.signal, 'abort').length, 2);
  await f.helper.initialize('B', options(f.b));
  assert.deepEqual(getEventListeners(f.a.signal, 'abort'), [existingA]);
  f.a.abort();
  assert.equal(f.helper.read('B'), SYNTHETIC);
  f.helper.clear();
  f.helper.clear();
  assert.deepEqual(getEventListeners(f.b.signal, 'abort'), [existingB]);
  assert.throws(() => f.helper.read('B'), code('cleared'));
  await assert.rejects(
    f.helper.initialize('A', options(new AbortController())),
    code('cleared'),
  );
});

for (const kind of ['sync', 'async']) {
  test(`${kind} reader failure is terminal and never discloses the reader error`, async () => {
    const f = fixture(() => {
      if (kind === 'sync') throw new Error(SYNTHETIC);
      return Promise.reject(new Error(SYNTHETIC));
    });
    await assert.rejects(
      f.helper.initialize('A', options(f.a)),
      code('reader_failed'),
    );
    await assert.rejects(
      f.helper.initialize('A', options(f.a)),
      code('reader_failed'),
    );
    assert.throws(() => f.helper.read('A'), code('reader_failed'));
    assert.equal(f.calls.length, 1);
    assert.equal(getEventListeners(f.a.signal, 'abort').length, 0);
  });
}

test('pre-aborted or invalid input options refuse before any reader invocation', async () => {
  const controller = new AbortController();
  controller.abort(SYNTHETIC);
  const aborted = fixture();
  await assert.rejects(
    aborted.helper.initialize('A', options(controller)),
    code('aborted'),
  );
  assert.equal(aborted.calls.length, 0);
  for (const input of [
    undefined,
    { signal: {}, timeoutMs: 1000 },
    { signal: Object.create(AbortSignal.prototype), timeoutMs: 1000 },
    { signal: new AbortController().signal, timeoutMs: 0 },
    { signal: new AbortController().signal, timeoutMs: 30001 },
    { signal: new AbortController().signal, timeoutMs: '1000' },
  ]) {
    const f = fixture();
    await assert.rejects(
      f.helper.initialize('A', input),
      code('options_refused'),
    );
    assert.equal(f.calls.length, 0);
  }
});

test('a broken reader cannot install an absent or malformed value', async () => {
  for (const value of [
    undefined,
    '',
    123,
    'short',
    'x'.repeat(513),
    `${SYNTHETIC}\n`,
  ]) {
    const f = fixture(() => value);
    await assert.rejects(
      f.helper.initialize('A', options(f.a)),
      code('reader_failed'),
    );
    assert.throws(() => f.helper.read('A'), code('reader_failed'));
    assert.equal(f.helper.inputCount, 1);
  }
});
