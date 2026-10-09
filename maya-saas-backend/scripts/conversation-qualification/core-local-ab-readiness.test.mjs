// Synthetic EventEmitter TTYs only: no real input, key reader, timer, permit or socket.
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import test from 'node:test';
import {
  READINESS_PROMPT,
  waitForAbReadiness,
} from './core-local-ab-readiness.mjs';

const PROMPT =
  'Нажмите Enter, когда готовы ввести ключ. Затем дождитесь отдельного скрытого приглашения. Сейчас ключ не вводите.\n';
const code = (reason) => ({ message: `core_ab_readiness_${reason}` });
class Input extends EventEmitter {
  isTTY = true;
  isRaw = false;
  readableLength = 0;
  readableEncoding = null;
  rawChanges = [];
  chunks = [];
  paused = true;
  setRawMode(value) {
    this.rawChanges.push(value);
    this.isRaw = value;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  send(value) {
    const bytes = Buffer.from(value);
    this.chunks.push(bytes);
    this.emit('data', bytes);
  }
}
class Output extends EventEmitter {
  isTTY = true;
  writes = [];
  write(value) {
    this.writes.push(value);
    return true;
  }
}
function fixture(t) {
  const input = new Input(),
    output = new Output(),
    controller = new AbortController();
  t.after(() => controller.abort());
  return {
    input,
    output,
    controller,
    options: { input, output, signal: controller.signal },
  };
}
function cleaned(f, raw = false) {
  assert.equal(f.input.isRaw, raw);
  assert.equal(f.input.paused, true);
  for (const event of ['data', 'readable', 'end', 'close', 'error'])
    assert.equal(f.input.listenerCount(event), 0);
  for (const event of ['close', 'error'])
    assert.equal(f.output.listenerCount(event), 0);
  assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), []);
  assert.ok(f.input.chunks.every((chunk) => chunk.every((byte) => byte === 0)));
}

test('readiness has no timer and leaves downstream input untouched until isolated Enter', async (t) => {
  const f = fixture(t);
  let timerCalls = 0,
    downstreamCalls = 0;
  for (const name of ['setTimeout', 'setInterval'])
    t.mock.method(globalThis, name, () => {
      timerCalls++;
      throw new Error('timer_forbidden');
    });
  t.mock.method(Date, 'now', () => 0);
  const waiting = waitForAbReadiness(f.options).then((release) => {
    downstreamCalls++;
    return release;
  });
  for (let index = 0; index < 20; index++) await Promise.resolve();
  Date.now.mock.mockImplementation(() => Number.MAX_SAFE_INTEGER);
  for (let index = 0; index < 20; index++) await Promise.resolve();
  assert.equal(downstreamCalls, 0);
  assert.equal(timerCalls, 0);
  assert.deepEqual(f.output.writes, [PROMPT]);
  assert.equal(f.input.isRaw, true);
  f.input.send('\r');
  assert.equal(f.input.paused, true);
  const release = await waiting;
  assert.equal(downstreamCalls, 1);
  assert.equal(timerCalls, 0);
  assert.equal(f.input.isRaw, true);
  assert.equal(f.input.listenerCount('data'), 0);
  assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), []);
  release();
  release();
  assert.deepEqual(f.input.rawChanges, [true, false]);
  cleaned(f);
});

test('only isolated CR, LF or CRLF chunks return a raw lease without returning input data', async (t) => {
  for (const enter of ['\r', '\n', '\r\n']) {
    const f = fixture(t);
    const waiting = waitForAbReadiness(f.options);
    f.input.send(enter);
    const release = await waiting;
    assert.equal(typeof release, 'function');
    assert.equal(f.input.isRaw, true);
    assert.deepEqual(f.input.rawChanges, [true]);
    assert.deepEqual(f.output.writes, [PROMPT]);
    release();
    assert.deepEqual(f.input.rawChanges, [true, false]);
    cleaned(f);
  }
});

test('original raw mode is restored, even when already raw', async (t) => {
  const f = fixture(t);
  f.input.isRaw = true;
  const waiting = waitForAbReadiness(f.options);
  f.input.send('\n');
  const release = await waiting;
  assert.deepEqual(f.input.rawChanges, [true]);
  release();
  assert.deepEqual(f.input.rawChanges, [true, true]);
  cleaned(f, true);
});

test('accidental pasted content is refused without echo or decoding and all bytes are zeroed', async (t) => {
  for (const input of [
    'SYNTHETIC_NOT_A_KEY',
    'SYNTHETIC_NOT_A_KEY\n',
    '\nSYNTHETIC_NOT_A_KEY',
    '\r\nSYNTHETIC_NOT_A_KEY',
    '\n\n',
    '\n\r',
    ' ',
    '\t',
    '\b',
    '\x1b[A',
    'я',
    '',
  ]) {
    const f = fixture(t);
    const waiting = waitForAbReadiness(f.options);
    f.input.send(input);
    await assert.rejects(waiting, code('input_refused'));
    assert.deepEqual(f.output.writes, [PROMPT]);
    cleaned(f);
  }
});

test('extra chunk delivered before handoff invalidates an earlier Enter and is zeroed too', async (t) => {
  const f = fixture(t);
  const waiting = waitForAbReadiness(f.options);
  f.input.send('\r');
  f.input.send('SYNTHETIC_NOT_A_KEY');
  await assert.rejects(waiting, code('input_refused'));
  cleaned(f);
});

test('previous buffered input refuses before raw mode, prompt or resume', async (t) => {
  const f = fixture(t);
  f.input.readableLength = 20;
  await assert.rejects(waitForAbReadiness(f.options), code('buffered_input'));
  assert.deepEqual(f.input.rawChanges, []);
  assert.deepEqual(f.output.writes, []);
  cleaned(f);
});

test('bytes buffered while taking ownership are refused before prompting', async (t) => {
  const f = fixture(t);
  f.input.pause = () => {
    f.input.paused = true;
    f.input.readableLength = 1;
  };
  await assert.rejects(waitForAbReadiness(f.options), code('buffered_input'));
  assert.deepEqual(f.input.rawChanges, []);
  assert.deepEqual(f.output.writes, []);
  cleaned(f);
});

test('pre-aborted signal refuses without touching TTY state or disclosing reason', async (t) => {
  const f = fixture(t);
  f.controller.abort('SYNTHETIC_PRIVATE_REASON');
  await assert.rejects(waitForAbReadiness(f.options), code('aborted'));
  assert.deepEqual(f.input.rawChanges, []);
  assert.deepEqual(f.output.writes, []);
  cleaned(f);
});

test('cancellation during readiness restores terminal and removes only owned listeners', async (t) => {
  const f = fixture(t);
  const existingEnd = () => {},
    existingError = () => {},
    existingAbort = () => {};
  f.input.on('end', existingEnd);
  f.output.on('error', existingError);
  f.controller.signal.addEventListener('abort', existingAbort);
  const waiting = waitForAbReadiness(f.options);
  f.controller.abort('SYNTHETIC_PRIVATE_REASON');
  await assert.rejects(waiting, code('aborted'));
  assert.equal(f.input.isRaw, false);
  assert.equal(f.input.paused, true);
  assert.deepEqual(f.input.listeners('end'), [existingEnd]);
  assert.deepEqual(f.output.listeners('error'), [existingError]);
  assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), [
    existingAbort,
  ]);
  assert.equal(f.input.listenerCount('data'), 0);
});

test('Ctrl-C, Ctrl-D and input/output end or close refuse with fixed terminal outcomes', async (t) => {
  for (const [action, reason] of [
    [(f) => f.input.send('\x03'), 'aborted'],
    [(f) => f.input.send('\x04'), 'closed'],
    [(f) => f.input.emit('end'), 'closed'],
    [(f) => f.input.emit('close'), 'closed'],
    [(f) => f.output.emit('close'), 'closed'],
    [
      (f) => f.input.emit('error', new Error('SYNTHETIC_PRIVATE_REASON')),
      'io_failed',
    ],
    [
      (f) => f.output.emit('error', new Error('SYNTHETIC_PRIVATE_REASON')),
      'io_failed',
    ],
  ]) {
    const f = fixture(t);
    const waiting = waitForAbReadiness(f.options);
    action(f);
    await assert.rejects(waiting, code(reason));
    cleaned(f);
  }
});

test('decoded/nonbuffer chunks refuse without coercion', async (t) => {
  const f = fixture(t);
  const waiting = waitForAbReadiness(f.options);
  f.input.emit('data', '\n');
  await assert.rejects(waiting, code('input_refused'));
  cleaned(f);
});

test('real exclusive undecoded TTYs and a native signal are mandatory', async (t) => {
  for (const change of [
    (f) => {
      f.input.isTTY = false;
    },
    (f) => {
      f.output.isTTY = false;
    },
    (f) => {
      f.input.destroyed = true;
    },
    (f) => {
      f.input.readableEnded = true;
    },
    (f) => {
      f.input.readableEncoding = 'utf8';
    },
    (f) => {
      f.input.isRaw = undefined;
    },
  ]) {
    const f = fixture(t);
    change(f);
    await assert.rejects(waitForAbReadiness(f.options), code('tty_required'));
    assert.deepEqual(f.input.rawChanges, []);
    assert.deepEqual(f.output.writes, []);
  }
  const f = fixture(t);
  for (const options of [
    undefined,
    { ...f.options, signal: {} },
    { ...f.options, signal: Object.create(AbortSignal.prototype) },
    { ...f.options, timeoutMs: 1 },
    { ...f.options, key: 'SYNTHETIC_NOT_A_KEY' },
  ])
    await assert.rejects(waitForAbReadiness(options), code('options_refused'));
  assert.deepEqual(f.input.rawChanges, []);
});

test('competing listeners and a second readiness waiter are refused without disrupting the first', async (t) => {
  for (const event of ['data', 'readable']) {
    const f = fixture(t),
      existing = () => {};
    f.input.on(event, existing);
    await assert.rejects(waitForAbReadiness(f.options), code('busy'));
    assert.deepEqual(f.input.listeners(event), [existing]);
  }
  const f = fixture(t);
  const first = waitForAbReadiness(f.options);
  await assert.rejects(waitForAbReadiness(f.options), code('busy'));
  f.input.send('\n');
  const release = await first;
  await assert.rejects(waitForAbReadiness(f.options), code('busy'));
  release();
  cleaned(f);
});

test('raw setup and prompt write failures restore state and hide raw errors', async (t) => {
  for (const phase of ['raw', 'prompt']) {
    const f = fixture(t);
    if (phase === 'raw')
      f.input.setRawMode = (value) => {
        f.input.rawChanges.push(value);
        f.input.isRaw = value;
        if (value) throw new Error('SYNTHETIC_PRIVATE_REASON');
      };
    else
      f.output.write = () => {
        throw new Error('SYNTHETIC_PRIVATE_REASON');
      };
    await assert.rejects(waitForAbReadiness(f.options), code('io_failed'));
    cleaned(f);
  }
});

test('release reports restoration failure with a fixed error and still removes listeners', async (t) => {
  const f = fixture(t);
  f.input.setRawMode = (value) => {
    if (!value) throw new Error('SYNTHETIC_PRIVATE_REASON');
    f.input.isRaw = value;
  };
  const waiting = waitForAbReadiness(f.options);
  f.input.send('\n');
  const release = await waiting;
  assert.throws(release, code('restore_failed'));
  assert.throws(release, code('restore_failed'));
  assert.equal(f.input.paused, true);
  assert.equal(f.input.listenerCount('data'), 0);
  assert.equal(f.output.listenerCount('error'), 0);
  assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), []);
});

test('caller finally restores cooked mode after a downstream failure without an echo gap before it', async (t) => {
  const f = fixture(t);
  const waiting = waitForAbReadiness(f.options);
  f.input.send('\n');
  const release = await waiting;
  await assert.rejects(async () => {
    try {
      for (let index = 0; index < 20; index++) await Promise.resolve();
      assert.equal(f.input.isRaw, true);
      assert.equal(f.input.paused, true);
      assert.deepEqual(f.input.rawChanges, [true]);
      throw new Error('synthetic_source_refusal');
    } finally {
      release();
    }
  }, /synthetic_source_refusal/);
  cleaned(f);
});

test('safe prompt observer runs after successful write with no input arguments', async (t) => {
  const f = fixture(t);
  const observed = [];
  assert.equal(READINESS_PROMPT, PROMPT);
  const waiting = waitForAbReadiness({
    ...f.options,
    onPrompt: (...args) => {
      assert.deepEqual(f.output.writes, [PROMPT]);
      assert.equal(f.input.isRaw, true);
      assert.equal(f.input.paused, true);
      observed.push(args);
    },
  });
  assert.deepEqual(observed, [[]]);
  f.input.send('\n');
  const release = await waiting;
  release();
  assert.deepEqual(observed, [[]]);
  cleaned(f);
});

test('failed prompt write never calls observer; observer failure closes readiness without exposing the cause', async (t) => {
  for (const phase of ['write', 'observer']) {
    const f = fixture(t);
    let calls = 0;
    if (phase === 'write')
      f.output.write = () => {
        throw new Error('synthetic_private');
      };
    await assert.rejects(
      waitForAbReadiness({
        ...f.options,
        onPrompt: () => {
          calls++;
          throw new Error('synthetic_private');
        },
      }),
      code('io_failed'),
    );
    assert.equal(calls, phase === 'write' ? 0 : 1);
    cleaned(f);
  }
});
