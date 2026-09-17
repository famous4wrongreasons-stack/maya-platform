// Server mint provenance capture (GATES-PLAN-V11 D-17 (1)-(3), I-HAR).
//
// A record counts as trigger-minted only when the SERVER says so. The minter hook (P-MINT-CORE, P-MT2a) writes
// exactly one line per mint through a dedicated Nest logger context, `WidgetMintProvenance`:
//
//   new Logger('WidgetMintProvenance').log(JSON.stringify({
//     contract: 'maya.widget-mint-provenance/1',
//     trigger: 'T-2b',                      // T-2b, T-2a, T-1, T-3, or 'successor'
//     route: 'POST /api/ai/tools/:toolName/execute',
//     request_id: '…' | null,
//     intent_token_hash: '…',
//     widget_id: '…',
//   }));
//
// The message is ONE JSON string (never an object: Nest would print an object over several lines) and carries no
// PII. The call MUST be made from a file under the application's `src/`. Two capture points read it:
//   - BIN: the runner keeps the child process's stdout lines of that context. Only the process that CLAIMS the stdout
//     capture (`claimBinStdoutCapture`, once per process, never inside jest) can register them, and the BIN runner
//     claims it before it loads any case; a case cannot write the child's stdout.
//   - HTTP: `http-bootstrap.ts` installs `MintProvenanceSink` as the application's logger before `init`. `app.useLogger`
//     replaces Nest's STATIC logger, so ANY `new Logger('WidgetMintProvenance')` in the jest process reaches the sink,
//     test code included. The sink therefore reads the call site from the stack and admits a line only when the first
//     frame outside this file and Nest's logger is under `src/` (or `dist/src/`). A call from anywhere else is REFUSED:
//     counted, never captured, and reported to the evidence directory, which makes the run red in the verifier
//     (CKPT-W0 review finding 3). That is a strong check, not an unforgeable one: code that fakes a `src/` file name
//     (`vm`, `eval`) is caught by the verifier's source scan and the D-17 (3) BUILD test, not here.
// A captured line object is registered with its entry; `EvidenceWriter.mintProvenance` writes only registered lines,
// so a line a test parsed or built itself cannot be written as a server capture. With `WIDGETS_EVIDENCE=1` both
// capture points append what they captured to the evidence directory for `scripts/widgets-evidence-verify.mjs`.

import fs from 'node:fs';
import path from 'node:path';

import type { LoggerService, LogLevel } from '@nestjs/common';

export const WIDGET_MINT_PROVENANCE_CONTEXT = 'WidgetMintProvenance';
export const WIDGET_MINT_PROVENANCE_CONTRACT = 'maya.widget-mint-provenance/1';
/** §0.5 L's production triggers, plus the gateway successor edge. */
export const WIDGET_MINT_TRIGGERS = [
  'T-2b',
  'T-2a',
  'T-1',
  'T-3',
  'successor',
] as const;

/** maya-saas-backend, from this file (`test/widgets-live/support`). */
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
const realpath = (file: string): string => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
const APPLICATION_ROOTS: readonly string[] = [
  path.join(realpath(BACKEND_ROOT), 'src') + path.sep,
  path.join(realpath(BACKEND_ROOT), 'dist', 'src') + path.sep,
];
const THIS_FILE = realpath(__filename);

/** Whether this module runs inside a jest test environment. */
export function insideJest(): boolean {
  return (
    process.env.JEST_WORKER_ID !== undefined ||
    typeof (globalThis as { expect?: { getState?: unknown } }).expect
      ?.getState === 'function'
  );
}

/** Line objects a capture point registered, with the entry that captured them. */
const CAPTURED = new WeakMap<object, 'HTTP' | 'BIN'>();

/** The entry that captured this line object from the server, or null when no capture point registered it. */
export function serverCaptureEntry(line: unknown): 'HTTP' | 'BIN' | null {
  return line !== null && typeof line === 'object'
    ? (CAPTURED.get(line) ?? null)
    : null;
}

export interface MintProvenanceLine {
  readonly contract: typeof WIDGET_MINT_PROVENANCE_CONTRACT;
  readonly trigger: string;
  readonly route: string;
  readonly request_id: string | null;
  readonly intent_token_hash: string;
  readonly widget_id: string;
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** The message of one `WidgetMintProvenance` log call, or `null` when it is not a conforming line. */
export function parseMintProvenanceMessage(
  message: unknown,
): MintProvenanceLine | null {
  if (typeof message !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.contract !== WIDGET_MINT_PROVENANCE_CONTRACT ||
    !nonEmpty(v.trigger) ||
    !nonEmpty(v.route) ||
    !(v.request_id === null || nonEmpty(v.request_id)) ||
    !nonEmpty(v.intent_token_hash) ||
    !nonEmpty(v.widget_id)
  )
    return null;
  return Object.freeze({
    contract: WIDGET_MINT_PROVENANCE_CONTRACT,
    trigger: v.trigger,
    route: v.route,
    request_id: v.request_id,
    intent_token_hash: v.intent_token_hash,
    widget_id: v.widget_id,
  });
}

// eslint-disable-next-line no-control-regex
const ANSI_SEQUENCE = /\[[0-9;]*m/g;
const CONTEXT_MARKER = `[${WIDGET_MINT_PROVENANCE_CONTEXT}]`;

/**
 * One stdout line of the binary. Nest's console logger prints `… LOG [<context>] <message>`, coloured unless
 * `NO_COLOR` is set; the colour codes are removed first. Returns `null` for every line of another context.
 * A line of this context that does not parse is reported as `malformed`, so the verifier can refuse the run.
 */
export function parseMintProvenanceStdoutLine(
  line: string,
): MintProvenanceLine | 'malformed' | null {
  const plain = line.replace(ANSI_SEQUENCE, '');
  const at = plain.indexOf(CONTEXT_MARKER);
  if (at < 0) return null;
  return (
    parseMintProvenanceMessage(
      plain.slice(at + CONTEXT_MARKER.length).trim(),
    ) ?? 'malformed'
  );
}

/** Splits a stream's chunks into complete lines (a chunk may end inside a line). */
export class LineSplitter {
  private rest = '';

  push(chunk: string): string[] {
    const text = this.rest + chunk;
    const lines = text.split('\n');
    this.rest = lines.pop() ?? '';
    return lines;
  }

  flush(): string[] {
    const last = this.rest;
    this.rest = '';
    return last ? [last] : [];
  }
}

let binCaptureClaimed = false;

/** What the BIN runner's claimed capture gives it: one call per stdout line of the binary. */
export interface BinStdoutCapture {
  line(text: string): MintProvenanceLine | 'malformed' | null;
}

/**
 * Claims this process's BIN stdout capture. Once per process and never inside jest: the BIN runner claims it before it
 * loads a case, so a case (or a spec) cannot register a line of its own as the binary's.
 */
export function claimBinStdoutCapture(): BinStdoutCapture {
  if (insideJest())
    throw new Error(
      'widgets-live mint provenance: the BIN stdout capture is never claimed inside jest',
    );
  if (binCaptureClaimed)
    throw new Error(
      'widgets-live mint provenance: the BIN stdout capture was already claimed by this process',
    );
  binCaptureClaimed = true;
  return Object.freeze({
    line: (text: string) => {
      const parsed = parseMintProvenanceStdoutLine(text);
      if (parsed !== null && parsed !== 'malformed')
        CAPTURED.set(parsed, 'BIN');
      return parsed;
    },
  });
}

/**
 * The file of the first stack frame outside this module and Nest's logger: the code that made the log call. Null when
 * no frame names a file (it is then refused).
 */
export function mintProvenanceCallSite(): string | null {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 64;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  for (const frame of stack.split('\n').slice(1)) {
    const m = /\(?((?:\/|[A-Za-z]:\\)[^()]*?):\d+:\d+\)?\s*$/.exec(
      frame.trim(),
    );
    if (!m) continue;
    const file = realpath(m[1]);
    if (file === THIS_FILE) continue;
    if (file.includes(`${path.sep}node_modules${path.sep}@nestjs${path.sep}`))
      continue;
    return file;
  }
  return null;
}

/** Whether a call site is the application's own code (`src/` or the built `dist/src/`). */
export function isApplicationCallSite(file: string | null): boolean {
  return (
    file !== null && APPLICATION_ROOTS.some((root) => file.startsWith(root))
  );
}

/**
 * The HTTP level's logger sink. Every call is inspected; a call of context `WidgetMintProvenance` made from the
 * application's `src/` is captured (or counted as malformed); one made from anywhere else is refused (see the header).
 * Every refusal and every malformed line is reported through `onRefuse`. Warnings, errors and fatal messages are
 * forwarded to `forward`; routine `log`, `debug` and `verbose` output is not printed, so a booted `AppModule` does not
 * flood the jest output with its route table. The sink changes no provider and no behaviour of the application.
 */
export class MintProvenanceSink implements LoggerService {
  private readonly lines: MintProvenanceLine[] = [];
  private malformedCount = 0;
  private refusedCount = 0;

  constructor(
    private readonly forward: LoggerService,
    private readonly onCapture: (line: MintProvenanceLine) => void = () =>
      undefined,
    private readonly onRefuse: (reason: string) => void = () => undefined,
  ) {}

  captured(): readonly MintProvenanceLine[] {
    return [...this.lines];
  }

  malformed(): number {
    return this.malformedCount;
  }

  /** Calls of the provenance context whose call site is not the application's code. */
  refused(): number {
    return this.refusedCount;
  }

  private inspect(message: unknown, optionalParams: unknown[]): void {
    const context = optionalParams[optionalParams.length - 1];
    if (context !== WIDGET_MINT_PROVENANCE_CONTEXT) return;
    const site = mintProvenanceCallSite();
    if (!isApplicationCallSite(site)) {
      this.refusedCount += 1;
      this.onRefuse(
        `a ${WIDGET_MINT_PROVENANCE_CONTEXT} call from ${
          site === null
            ? 'an unknown call site'
            : path.relative(realpath(BACKEND_ROOT), site)
        }, not from the application's src/`,
      );
      return;
    }
    const line = parseMintProvenanceMessage(message);
    if (line === null) {
      this.malformedCount += 1;
      this.onRefuse(`a malformed ${WIDGET_MINT_PROVENANCE_CONTEXT} line`);
      return;
    }
    CAPTURED.set(line, 'HTTP');
    this.lines.push(line);
    this.onCapture(line);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
    this.forward.warn(message, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
    this.forward.error(message, ...optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.inspect(message, optionalParams);
    (this.forward.fatal ?? this.forward.error).call(
      this.forward,
      message,
      ...optionalParams,
    );
  }

  setLogLevels(levels: LogLevel[]): void {
    this.forward.setLogLevels?.(levels);
  }
}
