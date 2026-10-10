// Local broker only, after the caller has claimed its bounded paid admission.
// This module does not grant admission, read files/env, or retain the returned key.
const activeStreams = new WeakSet();
const PROMPT = 'Provider key (hidden; Enter submits, Ctrl-C cancels):\n';
const MAX_KEY_BYTES = 512;
const MAX_INPUT_BYTES = 4096;
const failure = (suffix) => new Error(`core_local_terminal_${suffix}`);
const abortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  'aborted',
).get;
const isAborted = (signal) => abortedGetter.call(signal);

function optionsFor(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw failure('options_refused');
  const allowed = new Set(['input', 'output', 'signal', 'timeoutMs']);
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const name of Reflect.ownKeys(fields))
    if (
      !allowed.has(name) ||
      !Object.prototype.hasOwnProperty.call(fields[name], 'value')
    )
      throw failure('options_refused');
  const input =
    fields.input?.value === undefined ? process.stdin : fields.input.value;
  const output =
    fields.output?.value === undefined ? process.stderr : fields.output.value;
  const signal = fields.signal?.value;
  const timeoutMs =
    fields.timeoutMs?.value === undefined ? 30000 : fields.timeoutMs.value;
  if (
    !(signal instanceof AbortSignal) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 180000
  )
    throw failure('options_refused');
  let aborted;
  try {
    aborted = isAborted(signal);
  } catch {
    throw failure('options_refused');
  }
  if (aborted) throw failure('aborted');
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
    (input.readableLength !== undefined && input.readableLength !== 0) ||
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
  return { input, output, signal, timeoutMs };
}

/**
 * Read one ASCII scalar from an exclusively owned raw TTY. The caller must abort
 * signal at permit expiry/revocation. Input and editing are bounded independently.
 * Mutable owned storage and received byte chunks are zeroed; the final JS string
 * cannot be erased and must stay in the broker's memory only.
 */
export async function readLocalTerminalCredential(options) {
  const { input, output, signal, timeoutMs } = optionsFor(options);
  const originalRaw = input.isRaw;
  const bytes = Buffer.alloc(MAX_KEY_BYTES);
  let length = 0;
  let seen = 0;
  let timer;
  let rawAttempted = false;
  let cleaned = false;
  let cleanupFailed = false;
  const listeners = [];
  let onAbort;
  activeStreams.add(input);
  activeStreams.add(output);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    const attempt = (action) => {
      try {
        action();
      } catch {
        cleanupFailed = true;
      }
    };
    attempt(() => input.pause());
    if (rawAttempted) attempt(() => input.setRawMode(originalRaw));
    for (const [stream, event, listener] of listeners)
      attempt(() => stream.removeListener(event, listener));
    if (onAbort)
      attempt(() =>
        EventTarget.prototype.removeEventListener.call(
          signal,
          'abort',
          onAbort,
        ),
      );
  };

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (reason) => {
        if (settled) return;
        settled = true;
        if (reason) reject(failure(reason));
        else resolve();
      };
      const listen = (stream, event, listener) => {
        listeners.push([stream, event, listener]);
        stream.on(event, listener);
      };
      const onData = (chunk) => {
        if (!Buffer.isBuffer(chunk)) {
          finish('input_refused');
          return;
        }
        try {
          if (settled) return;
          seen += chunk.length;
          if (seen > MAX_INPUT_BYTES) {
            finish('input_refused');
            return;
          }
          for (let i = 0; i < chunk.length; i++) {
            const code = chunk[i];
            if (code === 3) {
              finish('aborted');
              return;
            }
            if (code === 4) {
              finish('closed');
              return;
            }
            if (code === 10 || code === 13) {
              // Admit CRLF, but never silently ignore another pasted line.
              const end = code === 13 && chunk[i + 1] === 10 ? i + 2 : i + 1;
              finish(
                length >= 16 && end === chunk.length
                  ? undefined
                  : 'input_refused',
              );
              return;
            }
            if (code === 8 || code === 127) {
              if (length > 0) bytes[--length] = 0;
              continue;
            }
            if (
              length === MAX_KEY_BYTES ||
              !(
                (code >= 65 && code <= 90) ||
                (code >= 97 && code <= 122) ||
                (code >= 48 && code <= 57) ||
                code === 45 ||
                code === 95
              )
            ) {
              finish('input_refused');
              return;
            }
            bytes[length++] = code;
          }
        } finally {
          chunk.fill(0);
        }
      };
      onAbort = () => finish('aborted');
      try {
        input.pause();
        listen(input, 'data', onData);
        listen(input, 'end', () => finish('closed'));
        listen(input, 'close', () => finish('closed'));
        listen(input, 'error', () => finish('io_failed'));
        listen(output, 'error', () => finish('io_failed'));
        listen(output, 'close', () => finish('closed'));
        EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, {
          once: true,
        });
        timer = setTimeout(() => finish('timeout'), timeoutMs);
        if (isAborted(signal)) {
          finish('aborted');
          return;
        }
        rawAttempted = true;
        input.setRawMode(true);
        if (input.isRaw !== true) {
          finish('io_failed');
          return;
        }
        output.write(PROMPT);
        if (!settled) input.resume();
      } catch {
        finish('io_failed');
      }
    });
    cleanup();
    if (cleanupFailed) throw failure('restore_failed');
    if (isAborted(signal)) throw failure('aborted');
    return bytes.toString('ascii', 0, length);
  } finally {
    cleanup();
    bytes.fill(0);
    activeStreams.delete(input);
    activeStreams.delete(output);
  }
}
