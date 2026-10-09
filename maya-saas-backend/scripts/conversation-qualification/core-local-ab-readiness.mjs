// Readiness only, before run/admission/input deadlines. Never read a credential.
const activeStreams = new WeakSet();
export const READINESS_PROMPT =
  'Нажмите Enter, когда готовы ввести ключ. Затем дождитесь отдельного скрытого приглашения. Сейчас ключ не вводите.\n';
const failure = (reason) => new Error(`core_ab_readiness_${reason}`);
const safeFailure = (error) =>
  new Error(
    error instanceof Error && /^core_ab_readiness_[a-z_]+$/.test(error.message)
      ? error.message
      : 'core_ab_readiness_io_failed',
  );
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  'aborted',
).get;

function optionsFor(options) {
  if (
    !options ||
    typeof options !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options))
  )
    throw failure('options_refused');
  const fields = Object.getOwnPropertyDescriptors(options);
  for (const name of Reflect.ownKeys(fields))
    if (
      !['input', 'output', 'signal', 'onPrompt'].includes(name) ||
      !Object.hasOwn(fields[name], 'value')
    )
      throw failure('options_refused');
  const input =
    fields.input?.value === undefined ? process.stdin : fields.input.value;
  const output =
    fields.output?.value === undefined ? process.stderr : fields.output.value;
  const signal = fields.signal?.value;
  const onPrompt = fields.onPrompt?.value;
  if (onPrompt !== undefined && typeof onPrompt !== 'function')
    throw failure('options_refused');
  let isAborted;
  try {
    if (!(signal instanceof AbortSignal)) throw failure('options_refused');
    isAborted = aborted.call(signal);
  } catch {
    throw failure('options_refused');
  }
  if (isAborted) throw failure('aborted');
  for (const stream of [input, output])
    if (
      !stream ||
      stream.isTTY !== true ||
      stream.destroyed === true ||
      !['on', 'removeListener', 'listenerCount'].every(
        (name) => typeof stream[name] === 'function',
      )
    )
      throw failure('tty_required');
  if (
    typeof input.isRaw !== 'boolean' ||
    input.readableEnded === true ||
    input.readableEncoding != null ||
    !['setRawMode', 'pause', 'resume'].every(
      (name) => typeof input[name] === 'function',
    ) ||
    typeof output.write !== 'function'
  )
    throw failure('tty_required');
  if (
    activeStreams.has(input) ||
    activeStreams.has(output) ||
    input.listenerCount('data') !== 0 ||
    input.listenerCount('readable') !== 0
  )
    throw failure('busy');
  if (input.readableLength !== 0) throw failure('buffered_input');
  return { input, output, signal, onPrompt };
}

export async function waitForAbReadiness(options) {
  let checked;
  try {
    checked = optionsFor(options);
  } catch (error) {
    throw safeFailure(error);
  }
  const { input, output, signal, onPrompt } = checked;
  const originalRaw = input.isRaw;
  const listeners = [];
  let rawAttempted = false,
    cleanupFailed = false,
    contaminated = false,
    onAbort;
  activeStreams.add(input);
  activeStreams.add(output);
  let released = false;
  const releaseTTY = () => {
    if (!released) {
      released = true;
      try {
        input.pause();
      } catch {
        cleanupFailed = true;
      }
      if (rawAttempted)
        try {
          input.setRawMode(originalRaw);
        } catch {
          cleanupFailed = true;
        }
      activeStreams.delete(input);
      activeStreams.delete(output);
    }
    if (cleanupFailed) throw failure('restore_failed');
  };
  let problem;
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (reason) => {
        if (settled) return;
        settled = true;
        // Pause synchronously before promise continuation can hand off control.
        try {
          input.pause();
        } catch {
          reason = 'io_failed';
        }
        if (reason) reject(failure(reason));
        else resolve();
      };
      const listen = (stream, name, handler) => {
        listeners.push([stream, name, handler]);
        stream.on(name, handler);
      };
      const onData = (chunk) => {
        if (!Buffer.isBuffer(chunk)) {
          contaminated = true;
          finish('input_refused');
          return;
        }
        try {
          if (settled) {
            contaminated = true;
            return;
          }
          if (chunk.length === 1 && chunk[0] === 3) {
            finish('aborted');
            return;
          }
          if (chunk.length === 1 && chunk[0] === 4) {
            finish('closed');
            return;
          }
          const enter =
            (chunk.length === 1 && (chunk[0] === 13 || chunk[0] === 10)) ||
            (chunk.length === 2 && chunk[0] === 13 && chunk[1] === 10);
          finish(enter ? undefined : 'input_refused');
        } finally {
          chunk.fill(0);
        }
      };
      onAbort = () => finish('aborted');
      try {
        input.pause();
        if (input.readableLength !== 0) {
          finish('buffered_input');
          return;
        }
        listen(input, 'data', onData);
        listen(input, 'end', () => finish('closed'));
        listen(input, 'close', () => finish('closed'));
        listen(input, 'error', () => finish('io_failed'));
        listen(output, 'close', () => finish('closed'));
        listen(output, 'error', () => finish('io_failed'));
        EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, {
          once: true,
        });
        if (aborted.call(signal)) {
          finish('aborted');
          return;
        }
        rawAttempted = true;
        input.setRawMode(true);
        if (input.isRaw !== true) {
          finish('io_failed');
          return;
        }
        if (input.readableLength !== 0) {
          finish('buffered_input');
          return;
        }
        output.write(READINESS_PROMPT);
        onPrompt?.();
        if (!settled) input.resume();
      } catch {
        finish('io_failed');
      }
    });
    if (aborted.call(signal)) throw failure('aborted');
    if (contaminated || input.readableLength !== 0)
      throw failure('input_refused');
  } catch (error) {
    problem = safeFailure(error);
  } finally {
    const attempt = (action) => {
      try {
        action();
      } catch {
        cleanupFailed = true;
      }
    };
    attempt(() => input.pause());
    for (const [stream, name, handler] of listeners)
      attempt(() => stream.removeListener(name, handler));
    if (onAbort)
      attempt(() =>
        EventTarget.prototype.removeEventListener.call(
          signal,
          'abort',
          onAbort,
        ),
      );
  }
  if (cleanupFailed || problem || aborted.call(signal)) {
    releaseTTY();
    throw problem ?? failure('aborted');
  }
  // The caller releases this raw/no-echo lease only after run/reader cleanup.
  // Readiness listeners are already gone; no credential input is consumed here.
  return releaseTTY;
}
