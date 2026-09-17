// The evidence manifest (GATES-PLAN-V11 I-HAR, D-17, §3.3 steps 3-4).
//
// With `WIDGETS_EVIDENCE=1` (exactly `1`), every evidence test appends one line to the manifest. The jest harness
// and the BIN runner write through this one module, so both produce the same line shape. Without the flag nothing
// is written, but every line is still validated, so a malformed evidence call fails in a plain run too (HAR-6).
//
// Who may write what (CKPT-W0 review finding 1). A writer has a role:
//   - `jest` (the default): GW and HTTP lines, and HTTP mint lines, only inside jest;
//   - `bin-runner`: BIN lines and BIN mint lines. The role is refused inside jest, refused in any process whose main
//     script is not `scripts/widgets-intent-http-proof.ts`, and granted once per process: the runner takes it before
//     it loads a case, so a case cannot construct a second BIN writer. A case records only through `ctx.evidence`.
// A mint line is written only when a capture point registered that very object (`support/mint-provenance.ts`), so a
// line a test built or parsed itself is refused, with the flag or without it. Refusals a capture point reports are
// appended too (`mintProvenanceRefused`), and the verifier turns any of them into a red run.
//
// Files, in `WIDGETS_EVIDENCE_DIR` (default `<os tmpdir>/widgets-evidence`, outside the repository):
//   evidence-manifest.jsonl          one `maya.widgets-evidence/1` line per evidence test
//   mint-provenance.jsonl            the server's `WidgetMintProvenance` lines, as captured by the HTTP sink and the
//                                    BIN runner (`support/mint-provenance.ts`), each tagged with its entry
//   database-before-teardown.jsonl   the `WidgetIntentRecord` token hashes of each harness tenant, read by
//                                    `Fixtures.teardown` immediately BEFORE it deletes them
// `scripts/widgets-evidence-verify.mjs` reads all three. A run that should stand alone starts from an empty
// directory; the files are only ever appended to.
//
// Line fields (snake_case, as the verifier reads them):
//   test_id           the evidence test's id; an HTTP line and a BIN line of one L claim share it
//   entry             GW | HTTP | BIN
//   source            the spec or cases file, relative to maya-saas-backend
//   trigger_trace_id  the production trigger's trace (request id) the record came from, or null
//   record_hash       the record's `intent_token_hash`, or null when the test has no record
//   stopped_at_gate   the response's `stopped_at_gate`, or null
//   gates_run         the response's `gates_run`, or null
//   labels            the test's evidence labels, e.g. `[E-MINT]`, `[E-TAMPER:WidgetIntentRecord.verificationFloor]`
//   clauses           the §3.1 clause keys the line is offered for (may be empty)
//   claim             L | L-T | U | null (null: a harness line that claims nothing)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  insideJest,
  serverCaptureEntry,
  type MintProvenanceLine,
} from './mint-provenance';

export const EVIDENCE_MANIFEST_CONTRACT = 'maya.widgets-evidence/1';
export const EVIDENCE_MINT_CONTRACT = 'maya.widgets-evidence-mint/1';
export const EVIDENCE_DATABASE_CONTRACT = 'maya.widgets-evidence-database/1';
export const EVIDENCE_MINT_REFUSED_CONTRACT =
  'maya.widgets-evidence-mint-refused/1';

export const EVIDENCE_ENTRIES = ['GW', 'HTTP', 'BIN'] as const;
export type EvidenceEntry = (typeof EVIDENCE_ENTRIES)[number];
export const EVIDENCE_CLAIMS = ['L', 'L-T', 'U'] as const;
export type EvidenceClaim = (typeof EVIDENCE_CLAIMS)[number];

/** maya-saas-backend, from this file (`test/widgets-live/support`). */
export const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
/** The one process allowed a `bin-runner` writer. */
export const BIN_RUNNER_SCRIPT = path.join(
  BACKEND_ROOT,
  'scripts',
  'widgets-intent-http-proof.ts',
);

export type EvidenceWriterRole = 'jest' | 'bin-runner';

const realpathOrSelf = (file: string): string => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

let binRunnerRoleTaken = false;
const takeBinRunnerRole = (): void => {
  if (insideJest())
    throw new Error(
      'widgets-live evidence: a bin-runner writer is never constructed inside jest',
    );
  if (
    !process.argv[1] ||
    realpathOrSelf(process.argv[1]) !== realpathOrSelf(BIN_RUNNER_SCRIPT)
  )
    throw new Error(
      'widgets-live evidence: a bin-runner writer belongs to scripts/widgets-intent-http-proof.ts only',
    );
  if (binRunnerRoleTaken)
    throw new Error(
      'widgets-live evidence: this process already has its bin-runner writer',
    );
  binRunnerRoleTaken = true;
};

export interface EvidencePaths {
  readonly dir: string;
  readonly manifest: string;
  readonly mint: string;
  readonly database: string;
}

export function evidencePaths(
  env: NodeJS.ProcessEnv = process.env,
): EvidencePaths {
  const dir =
    env.WIDGETS_EVIDENCE_DIR?.trim() ||
    path.join(os.tmpdir(), 'widgets-evidence');
  return Object.freeze({
    dir,
    manifest: path.join(dir, 'evidence-manifest.jsonl'),
    mint: path.join(dir, 'mint-provenance.jsonl'),
    database: path.join(dir, 'database-before-teardown.jsonl'),
  });
}

export interface EvidenceLineInput {
  readonly testId: string;
  readonly entry: EvidenceEntry;
  /** Relative to maya-saas-backend. */
  readonly source: string;
  readonly triggerTraceId: string | null;
  readonly recordHash: string | null;
  readonly stoppedAtGate: string | null;
  readonly gatesRun: number | null;
  readonly labels: readonly string[];
  readonly clauses?: readonly string[];
  readonly claim?: EvidenceClaim | null;
}

export interface EvidenceManifestLine {
  readonly contract: typeof EVIDENCE_MANIFEST_CONTRACT;
  readonly test_id: string;
  readonly entry: EvidenceEntry;
  readonly source: string;
  readonly trigger_trace_id: string | null;
  readonly record_hash: string | null;
  readonly stopped_at_gate: string | null;
  readonly gates_run: number | null;
  readonly labels: readonly string[];
  readonly clauses: readonly string[];
  readonly claim: EvidenceClaim | null;
  readonly recorded_at: string;
  readonly pid: number;
}

const TEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LABEL = /^\[[^\]\n]{1,200}\]$/;
const CLAUSE_KEY = /^[A-Za-z0-9][A-Za-z0-9.-]{0,31}$/;

const fail = (reason: string): never => {
  throw new Error(`widgets-live evidence line refused: ${reason}`);
};

const nullableString = (value: unknown, name: string): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '')
    fail(`${name} must be a non-empty string or null`);
  return value as string;
};

/** Validates and normalises one line. Throws on anything malformed, whether or not evidence is enabled. */
export function evidenceManifestLine(
  input: EvidenceLineInput,
  now: Date = new Date(),
): EvidenceManifestLine {
  if (typeof input.testId !== 'string' || !TEST_ID.test(input.testId))
    fail(`test id ${JSON.stringify(input.testId)} is not an id`);
  if (!(EVIDENCE_ENTRIES as readonly string[]).includes(input.entry))
    fail(`entry ${JSON.stringify(input.entry)} is not GW, HTTP or BIN`);
  if (
    typeof input.source !== 'string' ||
    input.source === '' ||
    path.isAbsolute(input.source) ||
    input.source.split(/[\\/]/).includes('..')
  )
    fail('source must be a path relative to maya-saas-backend');
  if (
    input.gatesRun !== null &&
    !(Number.isInteger(input.gatesRun) && input.gatesRun >= 0)
  )
    fail('gates_run must be a non-negative integer or null');
  if (
    !Array.isArray(input.labels) ||
    input.labels.some((l: unknown) => typeof l !== 'string' || !LABEL.test(l))
  )
    fail('labels must be bracketed strings');
  const clauses = input.clauses ?? [];
  if (
    !Array.isArray(clauses) ||
    clauses.some((c: unknown) => typeof c !== 'string' || !CLAUSE_KEY.test(c))
  )
    fail('clauses must be clause keys');
  const claim = input.claim ?? null;
  if (claim !== null && !(EVIDENCE_CLAIMS as readonly string[]).includes(claim))
    fail(`claim ${JSON.stringify(claim)} is not L, L-T, U or null`);
  if (claim !== null && clauses.length === 0)
    fail('a claim names at least one clause');
  return Object.freeze({
    contract: EVIDENCE_MANIFEST_CONTRACT,
    test_id: input.testId,
    entry: input.entry,
    source: input.source.split(path.sep).join('/'),
    trigger_trace_id: nullableString(input.triggerTraceId, 'trigger_trace_id'),
    record_hash: nullableString(input.recordHash, 'record_hash'),
    stopped_at_gate: nullableString(input.stoppedAtGate, 'stopped_at_gate'),
    gates_run: input.gatesRun,
    labels: [...input.labels],
    clauses: [...clauses],
    claim,
    recorded_at: now.toISOString(),
    pid: process.pid,
  });
}

/** The one writer of the three evidence files. Reads the flag and the directory from `env` at every call. */
export class EvidenceWriter {
  readonly role: EvidenceWriterRole;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    options: { readonly role?: EvidenceWriterRole } = {},
  ) {
    this.role = options.role ?? 'jest';
    if (this.role === 'bin-runner') takeBinRunnerRole();
  }

  /** Throws unless this writer's role may write lines of `entry` here. */
  private assertEntry(entry: EvidenceEntry, what: string): void {
    if (entry === 'BIN') {
      if (this.role !== 'bin-runner')
        fail(`a BIN ${what} is written only by the BIN runner's writer`);
      return;
    }
    if (this.role !== 'jest' || !insideJest())
      fail(`a ${entry} ${what} is written only inside jest`);
  }

  get enabled(): boolean {
    return this.env.WIDGETS_EVIDENCE === '1';
  }

  get paths(): EvidencePaths {
    return evidencePaths(this.env);
  }

  private append(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
  }

  /** One manifest line. Returns whether it was written (only with `WIDGETS_EVIDENCE=1`). */
  record(input: EvidenceLineInput): boolean {
    const line = evidenceManifestLine(input);
    this.assertEntry(line.entry, 'manifest line');
    if (!this.enabled) return false;
    this.append(this.paths.manifest, line);
    return true;
  }

  /** The server's mint provenance lines captured at one entry. Returns how many were written. */
  mintProvenance(
    entry: Exclude<EvidenceEntry, 'GW'>,
    lines: readonly MintProvenanceLine[],
  ): number {
    this.assertEntry(entry, 'mint provenance line');
    for (const line of lines)
      if (serverCaptureEntry(line) !== entry)
        fail(
          `a ${entry} mint provenance line must be the object a ${entry} capture point registered, not one built or parsed elsewhere`,
        );
    if (!this.enabled) return 0;
    for (const line of lines)
      this.append(this.paths.mint, {
        contract: EVIDENCE_MINT_CONTRACT,
        entry,
        captured_at: new Date().toISOString(),
        pid: process.pid,
        line,
      });
    return lines.length;
  }

  /** A capture point refused a provenance line (a foreign call site, or a malformed line): the run is not evidence. */
  mintProvenanceRefused(
    entry: Exclude<EvidenceEntry, 'GW'>,
    reason: string,
  ): boolean {
    if (!this.enabled) return false;
    this.append(this.paths.mint, {
      contract: EVIDENCE_MINT_REFUSED_CONTRACT,
      entry,
      reason: String(reason).slice(0, 500),
      refused_at: new Date().toISOString(),
      pid: process.pid,
    });
    return true;
  }

  /** The record hashes of one harness tenant, read before its teardown deletes them. */
  databaseBeforeTeardown(
    tenantId: string,
    intentTokenHashes: readonly string[],
  ): boolean {
    if (!this.enabled) return false;
    this.append(this.paths.database, {
      contract: EVIDENCE_DATABASE_CONTRACT,
      tenant_id: tenantId,
      intent_token_hashes: [...intentTokenHashes],
      taken_at: new Date().toISOString(),
      pid: process.pid,
    });
    return true;
  }
}

/** The running jest test's file, relative to maya-saas-backend (for `source`). */
export function jestEvidenceSource(): string {
  const state = (
    globalThis as { expect?: { getState?: () => { testPath?: string } } }
  ).expect?.getState?.();
  if (!state?.testPath)
    throw new Error('widgets-live evidence: not inside a jest test');
  return path.relative(BACKEND_ROOT, state.testPath).split(path.sep).join('/');
}
