// One in-memory A -> B handoff after caller-owned admission. This helper grants
// no authority and never opens a second input path, file, environment or IPC.
import { readLocalTerminalCredential } from './core-local-terminal-credential.mjs';

const failure = (reason) => new Error(`core_ab_credential_${reason}`);
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  'aborted',
).get;

export function createAbCredential({
  read = readLocalTerminalCredential,
} = {}) {
  if (typeof read !== 'function') throw failure('reader_refused');
  let state = 'fresh',
    key,
    signal,
    onAbort,
    readerController,
    rejectPending;
  let terminalReason,
    inputCount = 0;

  function detach() {
    if (signal && onAbort)
      EventTarget.prototype.removeEventListener.call(signal, 'abort', onAbort);
    signal = undefined;
    onAbort = undefined;
  }
  function terminate(reason) {
    if (state === 'cleared') return;
    state = 'cleared';
    terminalReason = reason;
    key = undefined;
    detach();
    readerController?.abort();
    rejectPending?.(failure(reason));
  }
  function assertActive() {
    if (state === 'cleared') throw failure(terminalReason);
    if (signal && aborted.call(signal)) {
      terminate('aborted');
      throw failure('aborted');
    }
  }
  async function initialize(stage, options) {
    assertActive();
    if (!(
      (stage === 'A' && state === 'fresh') ||
      (stage === 'B' && state === 'A')
    )) {
      terminate('stage_refused');
      throw failure('stage_refused');
    }
    let nextSignal, timeoutMs;
    try {
      ({ signal: nextSignal, timeoutMs } = options);
      if (
        !(nextSignal instanceof AbortSignal) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 30000
      )
        throw failure('options_refused');
      if (aborted.call(nextSignal)) {
        terminate('aborted');
        throw failure('aborted');
      }
    } catch {
      terminate('options_refused');
      throw failure(terminalReason);
    }
    detach();
    signal = nextSignal;
    onAbort = () => terminate('aborted');
    EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, {
      once: true,
    });
    assertActive();
    if (stage === 'B') {
      state = 'B';
      return;
    }
    state = 'reading';
    readerController = new AbortController();
    const cancelled = new Promise((_resolve, reject) => {
      rejectPending = reject;
    });
    let value;
    try {
      value = await Promise.race([
        Promise.resolve().then(() => {
          assertActive();
          inputCount++;
          return read({ signal: readerController.signal, timeoutMs });
        }),
        cancelled,
      ]);
      assertActive();
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(value))
        throw failure('reader_failed');
      key = value;
      state = 'A';
    } catch {
      terminate('reader_failed');
      throw failure(terminalReason);
    } finally {
      value = undefined;
      readerController = undefined;
      rejectPending = undefined;
    }
  }
  return Object.freeze({
    initialize,
    read(stage) {
      assertActive();
      if (!['A', 'B'].includes(stage) || state !== stage || !key)
        throw failure('not_ready');
      return key;
    },
    clear() {
      terminate('cleared');
    },
    get inputCount() {
      return inputCount;
    },
  });
}
