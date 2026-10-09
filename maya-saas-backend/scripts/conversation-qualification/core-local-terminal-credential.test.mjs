// Synthetic EventEmitter TTYs only; never attach to the real terminal or load a key.
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { test } from 'node:test';
import { readLocalTerminalCredential } from './core-local-terminal-credential.mjs';

const SYNTHETIC = 'SYNTHETIC_ONLY_123';
const code = (suffix) => ({ message: `core_local_terminal_${suffix}` });

class FakeInput extends EventEmitter {
  isTTY = true;
  isRaw = false;
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
class FakeOutput extends EventEmitter {
  isTTY = true;
  writes = [];

  write(value) {
    this.writes.push(value);
    return true;
  }
}
function fixture(t) {
  const input = new FakeInput();
  const output = new FakeOutput();
  const controller = new AbortController();
  t.after(() => controller.abort());
  return {
    input,
    output,
    controller,
    options: { input, output, signal: controller.signal, timeoutMs: 1000 },
  };
}
function cleaned(f, initialRaw = false) {
  assert.equal(f.input.isRaw, initialRaw);
  assert.equal(f.input.paused, true);
  assert.equal(f.input.listenerCount('data'), 0);
  assert.equal(f.input.listenerCount('close'), 0);
  assert.equal(f.output.listenerCount('close'), 0);
  for (const chunk of f.input.chunks)
    assert.ok(chunk.every((byte) => byte === 0));
  assert.deepEqual(f.output.writes, [
    'Provider key (hidden; Enter submits, Ctrl-C cancels):\n',
  ]);
}

test('hidden scalar returns only to caller, erases chunks and removes only own listeners', async (t) => {
  const f = fixture(t);
  const existingEnd = () => {};
  const existingError = () => {};
  const existingAbort = () => {};
  f.input.on('end', existingEnd);
  f.output.on('error', existingError);
  f.controller.signal.addEventListener('abort', existingAbort);
  const result = readLocalTerminalCredential(f.options);
  f.input.send(SYNTHETIC.slice(0, 8));
  f.input.send(SYNTHETIC.slice(8) + '\r');
  assert.equal(await result, SYNTHETIC);
  cleaned(f);
  assert.deepEqual(f.input.rawChanges, [true, false]);
  assert.deepEqual(f.input.listeners('end'), [existingEnd]);
  assert.deepEqual(f.output.listeners('error'), [existingError]);
  assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), [
    existingAbort,
  ]);
});

test('existing raw mode is restored exactly, including after successful input', async (t) => {
  const f = fixture(t);
  f.input.isRaw = true;
  const result = readLocalTerminalCredential(f.options);
  f.input.send(SYNTHETIC + '\n');
  assert.equal(await result, SYNTHETIC);
  cleaned(f, true);
  assert.deepEqual(f.input.rawChanges, [true, true]);
});

test('both length bounds and CR, LF, CRLF submit the exact untrimmed ASCII scalar', async (t) => {
  for (const [length, ending] of [
    [16, '\r'],
    [512, '\n'],
    [32, '\r\n'],
  ]) {
    const f = fixture(t);
    const value = 'Ab_9-'.repeat(103).slice(0, length);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(value + ending);
    assert.equal(await result, value);
    cleaned(f);
  }
});

test('backspace and DEL erase characters without printing masks or input', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential(f.options);
  f.input.send('\b\x7f' + SYNTHETIC + 'ab\b\x7f_Z\n');
  assert.equal(await result, SYNTHETIC + '_Z');
  cleaned(f);
});

test('whitespace, Unicode, escape sequences and extra pasted lines fail closed', async (t) => {
  for (const value of [
    SYNTHETIC + ' \n',
    ' ' + SYNTHETIC + '\n',
    SYNTHETIC + 'я\n',
    SYNTHETIC + '\x1b[D\n',
    SYNTHETIC + '\t\n',
    SYNTHETIC + '\nSECOND_LINE',
    SYNTHETIC + '\r\n\n',
  ]) {
    const f = fixture(t);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(value);
    await assert.rejects(result, code('input_refused'));
    cleaned(f);
  }
});

test('empty, short and oversized credentials refuse, even with a later edit', async (t) => {
  for (const value of ['\n', 'x'.repeat(15) + '\n', 'x'.repeat(513) + '\b\n']) {
    const f = fixture(t);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(value);
    await assert.rejects(result, code('input_refused'));
    cleaned(f);
  }
});

test('editing has a finite total byte cap independent of the retained scalar length', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential(f.options);
  f.input.send('a\b'.repeat(2048));
  f.input.send(SYNTHETIC + '\n');
  await assert.rejects(result, code('input_refused'));
  cleaned(f);
});

test('a real active AbortSignal and closed data-only options are mandatory', async (t) => {
  const f = fixture(t);
  let getterCalls = 0;
  const accessor = { ...f.options };
  Object.defineProperty(accessor, 'timeoutMs', {
    get() {
      getterCalls++;
      return 1000;
    },
  });
  for (const options of [
    undefined,
    { ...f.options, signal: undefined },
    { ...f.options, signal: { aborted: false } },
    { ...f.options, signal: Object.create(AbortSignal.prototype) },
    { ...f.options, timeoutMs: 0 },
    { ...f.options, timeoutMs: null },
    { ...f.options, timeoutMs: 30001 },
    { ...f.options, timeoutMs: 1.5 },
    { ...f.options, timeoutMs: '1000' },
    { ...f.options, key: SYNTHETIC },
    { ...f.options, [Symbol('unknown')]: true },
    accessor,
  ])
    await assert.rejects(
      readLocalTerminalCredential(options),
      code('options_refused'),
    );
  assert.equal(getterCalls, 0);
  assert.deepEqual(f.input.rawChanges, []);
  assert.deepEqual(f.output.writes, []);
  f.controller.abort(SYNTHETIC);
  await assert.rejects(readLocalTerminalCredential(f.options), code('aborted'));
});

test('redirected, decoded, ended or competing TTY inputs refuse before raw mode', async (t) => {
  for (const change of [
    (f) => {
      f.input.isTTY = false;
    },
    (f) => {
      f.output.isTTY = false;
    },
    (f) => {
      f.input.readableEncoding = 'utf8';
    },
    (f) => {
      f.input.readableEnded = true;
    },
    (f) => {
      f.input.destroyed = true;
    },
    (f) => {
      f.input.setRawMode = undefined;
    },
  ]) {
    const f = fixture(t);
    change(f);
    await assert.rejects(
      readLocalTerminalCredential(f.options),
      code('tty_required'),
    );
    assert.deepEqual(f.input.rawChanges, []);
    assert.deepEqual(f.output.writes, []);
  }
  for (const event of ['data', 'readable']) {
    const f = fixture(t);
    const foreign = () => {};
    f.input.on(event, foreign);
    await assert.rejects(readLocalTerminalCredential(f.options), code('busy'));
    assert.deepEqual(f.input.listeners(event), [foreign]);
    assert.deepEqual(f.input.rawChanges, []);
  }
  const f = fixture(t);
  for (const field of ['input', 'output'])
    await assert.rejects(
      readLocalTerminalCredential({ ...f.options, [field]: null }),
      code('tty_required'),
    );
});

test('concurrent readers cannot share either active terminal stream', async (t) => {
  const f = fixture(t);
  const first = readLocalTerminalCredential(f.options);
  await assert.rejects(readLocalTerminalCredential(f.options), code('busy'));
  await assert.rejects(
    readLocalTerminalCredential({ ...f.options, input: new FakeInput() }),
    code('busy'),
  );
  f.controller.abort();
  await assert.rejects(first, code('aborted'));
  cleaned(f);
  const second = readLocalTerminalCredential({
    ...f.options,
    signal: new AbortController().signal,
  });
  f.input.send(SYNTHETIC + '\n');
  assert.equal(await second, SYNTHETIC);
});

test('abort and Ctrl-C refuse without exposing the abort reason or partial input', async (t) => {
  for (const cancel of [
    (f) => f.controller.abort(new Error(SYNTHETIC)),
    (f) => f.input.send('\x03'),
  ]) {
    const f = fixture(t);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(SYNTHETIC);
    cancel(f);
    await assert.rejects(result, code('aborted'));
    cleaned(f);
  }
});

test('timeout refuses and restores a partially entered value', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential({ ...f.options, timeoutMs: 5 });
  f.input.send(SYNTHETIC);
  await assert.rejects(result, code('timeout'));
  cleaned(f);
});

test('Ctrl-D is an EOF refusal, never submission of a partially entered scalar', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential(f.options);
  f.input.send(SYNTHETIC + '\x04');
  await assert.rejects(result, code('closed'));
  cleaned(f);
});

test('expiry between submit and promise completion still refuses the scalar', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential(f.options);
  f.input.send(SYNTHETIC + '\n');
  f.controller.abort();
  await assert.rejects(result, code('aborted'));
  cleaned(f);
});

test('owned accumulation storage is zeroed on success and refusal', async (t) => {
  const allocations = [];
  const allocate = Buffer.alloc.bind(Buffer);
  t.mock.method(Buffer, 'alloc', (...args) => {
    const bytes = allocate(...args);
    if (args[0] === 512) allocations.push(bytes);
    return bytes;
  });
  for (const ending of ['\n', '\t']) {
    const f = fixture(t);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(SYNTHETIC + ending);
    if (ending === '\n') assert.equal(await result, SYNTHETIC);
    else await assert.rejects(result, code('input_refused'));
  }
  assert.equal(allocations.length, 2);
  for (const bytes of allocations) assert.ok(bytes.every((byte) => byte === 0));
});

test('closed and errored streams return fixed failures and restore the terminal', async (t) => {
  for (const [stream, event, expected] of [
    ['input', 'end', 'closed'],
    ['input', 'close', 'closed'],
    ['output', 'close', 'closed'],
    ['input', 'error', 'io_failed'],
    ['output', 'error', 'io_failed'],
  ]) {
    const f = fixture(t);
    const result = readLocalTerminalCredential(f.options);
    f.input.send(SYNTHETIC);
    f[stream].emit(event, new Error(SYNTHETIC));
    await assert.rejects(result, code(expected));
    cleaned(f);
  }
});

test('raw mode, prompt and resume failures never forward source exception text', async (t) => {
  for (const target of ['setRawMode', 'write', 'resume']) {
    const f = fixture(t);
    const stream = target === 'write' ? f.output : f.input;
    const original = stream[target].bind(stream);
    let calls = 0;
    stream[target] = (...args) => {
      original(...args);
      if (++calls === 1) throw new Error(SYNTHETIC);
    };
    await assert.rejects(
      readLocalTerminalCredential(f.options),
      code('io_failed'),
    );
    assert.equal(f.input.isRaw, false);
    assert.equal(f.input.listenerCount('data'), 0);
    assert.equal(f.output.listenerCount('error'), 0);
    assert.ok(f.output.writes.every((value) => !value.includes(SYNTHETIC)));
  }
});

test('failed restoration refuses the value while still pausing and detaching listeners', async (t) => {
  const f = fixture(t);
  const original = f.input.setRawMode.bind(f.input);
  f.input.setRawMode = (value) => {
    if (!value) throw new Error(SYNTHETIC);
    original(value);
  };
  const result = readLocalTerminalCredential(f.options);
  f.input.send(SYNTHETIC + '\n');
  await assert.rejects(result, code('restore_failed'));
  assert.equal(f.input.paused, true);
  assert.equal(f.input.listenerCount('data'), 0);
  assert.equal(f.output.listenerCount('error'), 0);
  assert.ok(f.input.chunks.every((chunk) => chunk.every((byte) => byte === 0)));
});

test('encoded string data is never accepted as a terminal credential', async (t) => {
  const f = fixture(t);
  const result = readLocalTerminalCredential(f.options);
  f.input.emit('data', SYNTHETIC + '\n');
  await assert.rejects(result, code('input_refused'));
  cleaned(f);
});

test('prebuffered input refuses before hidden prompt or timer', async (t) => {
  const f = fixture(t);
  f.input.readableLength = 1;
  await assert.rejects(
    readLocalTerminalCredential(f.options),
    code('tty_required'),
  );
  assert.deepEqual(f.output.writes, []);
  assert.deepEqual(f.input.rawChanges, []);
  assert.equal(f.input.listenerCount('data'), 0);
});
