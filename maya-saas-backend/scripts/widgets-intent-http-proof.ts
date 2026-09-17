// BIN — the production-binary HTTP proof runner of plan §4.2 (GATES-PLAN-V11 I-HAR).
//
// It boots the BUILT application (`dist/src/main`, as `scripts/http-smoke.ts` does), so a case exercises
// exactly the bytes a release ships: `main.ts`'s bootstrap, every global guard and interceptor, the real
// store. Each gate unit owns its cases in `scripts/widgets-http-proof/gate<N>.cases.ts`, exporting
// `cases: WidgetsHttpProofCase[]`; this runner owns discovery, the database guard, the server's lifetime,
// the fixture context, the mint provenance capture and the report.
//
// Rules it enforces before anything starts:
//   - DATABASE_URL must pass the widgets-live proof-database guard (the same module the jest harness
//     uses), so neither the binary nor the fixture context can be pointed at a working or production database;
//   - the binary would read `.env.local`/`.env` from its working directory, so the runner refuses to
//     start while either exists (existence only);
//   - the server's environment is the jest harness's (`widgetsLiveChildEnvironment`): the caller's
//     process-level variables, the guarded DATABASE_URL and the widgets-live literals, scrubbed of
//     everything else in the caller's shell and of the harness's own variables, plus the fixed test settings
//     below; the runner's own process is scrubbed the same way before it boots the fixture context.
//
// What a case receives (`HttpProofContext`):
//   - `request`: plain HTTP to the binary;
//   - `fixtures`: the jest harness's REAL `Fixtures` over the same guarded `FixtureContext`
//     (`test/widgets-live/support/bootstrap.ts`), restricted to `tenant`, `user`, `staff`, `client`, `grantFeature`
//     and `teardown`. No widget writer: a BIN case cannot write a widget record. The runner calls `teardown`
//     after every case, whatever the case did;
//   - `evidence`: the `support/evidence.ts` writer, with `entry: 'BIN'` and the case file as `source`;
//   - `mintProvenance()`: the `WidgetMintProvenance` lines the binary printed so far (D-17 (2)). The runner keeps
//     every such line of the child's stdout, which no case can write, and with `WIDGETS_EVIDENCE=1` appends them
//     to the evidence directory for `scripts/widgets-evidence-verify.mjs`.
// A case gets no database URL and no widget writer. The runner takes this process's one `bin-runner` evidence writer
// and its one BIN stdout capture BEFORE it loads any case, so a case cannot construct either (CKPT-W0 review finding 1).
//
// With no case the runner still boots the binary and waits for its health check (HAR-2), then reports EMPTY:
// a binary that cannot boot with the widgets-live literals is red even before any unit declares a case.
//
// Run from maya-saas-backend, after `npm run build`:
//   npm run test:widgets:http [-- --cases-dir <dir>]
//   (ts-node --project tsconfig.scripts.json --transpile-only scripts/widgets-intent-http-proof.ts)
// `--cases-dir` replaces the discovery directory; the harness's own BIN self-test (HAR-7) lives in
// `test/widgets-live/support/bin-selftest`.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import {
  bootFixtureContext,
  type FixtureContext,
} from '../test/widgets-live/support/bootstrap';
import {
  applyWidgetsLiveEnvironment,
  assertNoEnvFiles,
  widgetsLiveChildEnvironment,
} from '../test/widgets-live/support/environment';
import {
  EvidenceWriter,
  type EvidenceLineInput,
} from '../test/widgets-live/support/evidence';
import {
  Fixtures,
  type BinFixtures,
} from '../test/widgets-live/support/fixtures';
import { resetLoopbackLoginPreflight } from '../test/widgets-live/support/login-rate-limit';
import {
  claimBinStdoutCapture,
  LineSplitter,
  type MintProvenanceLine,
} from '../test/widgets-live/support/mint-provenance';

/** What a BIN case may record: the entry is `BIN` and the source is its cases file, both set by the runner. */
export interface BinEvidence {
  readonly enabled: boolean;
  record(line: Omit<EvidenceLineInput, 'entry' | 'source'>): boolean;
}

export interface HttpProofContext {
  /** e.g. `http://127.0.0.1:3121/api` */
  readonly apiBase: string;
  request(
    route: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: unknown }>;
  /** The real fixture builders, without a widget writer; torn down by the runner after the case. */
  readonly fixtures: BinFixtures;
  readonly evidence: BinEvidence;
  /** The binary's `WidgetMintProvenance` lines captured so far. */
  mintProvenance(): readonly MintProvenanceLine[];
}

export interface WidgetsHttpProofCase {
  /** The spec's test id, e.g. `SMOKE-G6-HANDOFF-SENS`. */
  readonly id: string;
  /** The §3.9 slot the case is about. */
  readonly gate: string;
  /** Proof class of plan §4.3 (`LIVE`, `G-SYNTH`, …). A `G-SYNTH` case is never evidence. */
  readonly proofClass: string;
  run(ctx: HttpProofContext): Promise<void>;
}

const BACKEND = path.resolve(__dirname, '..');
const DEFAULT_CASES_DIR = path.join(__dirname, 'widgets-http-proof');
const CASE_FILE = /^gate[0-9A-Za-z-]+\.cases\.ts$/;
const port = process.env.WIDGETS_HTTP_PROOF_PORT ?? '3121';
const apiBase = `http://127.0.0.1:${port}/api`;
/** Fixed settings of the server under test, on top of the scrubbed widgets-live environment. */
const SERVER_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  PORT: port,
  SWAGGER_ENABLED: 'false',
  AI_CORE_PROVIDER: 'safe',
});

function casesDirectory(argv: readonly string[]): {
  dir: string;
  explicit: boolean;
} {
  const at = argv.indexOf('--cases-dir');
  if (at < 0) return { dir: DEFAULT_CASES_DIR, explicit: false };
  const value = argv[at + 1];
  if (!value || value.startsWith('--'))
    throw new Error('--cases-dir needs a directory');
  const dir = path.resolve(process.cwd(), value);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
    throw new Error(`--cases-dir ${value} is not a directory`);
  return { dir, explicit: true };
}

function discoverCaseFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => CASE_FILE.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

interface LoadedCase {
  readonly proof: WidgetsHttpProofCase;
  /** The cases file, relative to maya-saas-backend. */
  readonly source: string;
}

function loadCases(files: readonly string[]): LoadedCase[] {
  const cases: LoadedCase[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(file) as { cases?: unknown };
    if (!Array.isArray(loaded.cases))
      throw new Error(`${path.basename(file)} exports no cases array`);
    const source = path.relative(BACKEND, file).split(path.sep).join('/');
    for (const proof of loaded.cases as WidgetsHttpProofCase[])
      cases.push({ proof, source });
  }
  const ids = cases.map((c) => c.proof.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) throw new Error(`duplicate case id ${duplicate}`);
  return cases;
}

function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, ['--enable-source-maps', 'dist/src/main'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForHealth(child: ChildProcess): Promise<number> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (hasExited(child))
      throw new Error(
        `the binary exited before its health check (${child.exitCode ?? child.signalCode})`,
      );
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) return response.status;
    } catch {
      // still binding its port
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('the binary did not become healthy within 30 seconds');
}

/**
 * A child that exited on a signal has `exitCode === null` and `signalCode` set, so both are read: waiting for a second
 * `exit` event from a child that already exited would leave nothing pending, and Node would end the runner silently,
 * with status 0 and no report.
 */
const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

async function stopServer(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3_000))]);
  if (!hasExited(child)) {
    const forced = once(child, 'exit');
    child.kill('SIGKILL');
    await forced;
  }
}

interface CaseResult {
  id: string;
  gate: string;
  proofClass: string;
  source: string;
  ok: boolean;
  error?: string;
  retainedTenants: string[];
  teardownError?: string;
}

async function main(): Promise<void> {
  // The guard runs here, on a copy, for the child; then the runner's own environment is scrubbed the same way,
  // so the fixture context it boots sees exactly what a jest suite sees.
  const { env: serverEnv, database } = widgetsLiveChildEnvironment(
    process.env,
    SERVER_SETTINGS,
  );
  applyWidgetsLiveEnvironment(process.env);
  assertNoEnvFiles();
  // Both taken before any case is loaded: each exists once per process.
  const evidence = new EvidenceWriter(process.env, { role: 'bin-runner' });
  const capture = claimBinStdoutCapture();
  const { dir: casesDir, explicit } = casesDirectory(process.argv.slice(2));
  const cases = loadCases(discoverCaseFiles(casesDir));
  const reportBase = {
    contract: 'maya.widgets-intent-http-proof/2',
    database: database.database,
    cases_dir: path.relative(BACKEND, casesDir).split(path.sep).join('/'),
    cases_dir_explicit: explicit,
    evidence: evidence.enabled
      ? { enabled: true, dir: evidence.paths.dir }
      : { enabled: false },
  };

  const child = startServer(serverEnv);
  const tail: string[] = [];
  const captured: MintProvenanceLine[] = [];
  let malformed = 0;
  const stdout = new LineSplitter();
  const keep = (line: string) => {
    tail.push(line);
    if (tail.length > 80) tail.shift();
    const parsed = capture.line(line);
    if (parsed === 'malformed') {
      malformed += 1;
      evidence.mintProvenanceRefused(
        'BIN',
        'a malformed WidgetMintProvenance line on the binary stdout',
      );
    } else if (parsed !== null) {
      captured.push(parsed);
      evidence.mintProvenance('BIN', [parsed]);
    }
  };
  child.stdout?.on('data', (chunk: Buffer) =>
    stdout.push(chunk.toString()).forEach(keep),
  );
  child.stderr?.on('data', (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 80) tail.shift();
  });

  let fixtureContext: FixtureContext | null = null;
  const results: CaseResult[] = [];
  let health = 0;
  try {
    health = await waitForHealth(child);
    if (cases.length > 0) fixtureContext = await bootFixtureContext();
    for (const { proof, source } of cases) {
      const context = fixtureContext as FixtureContext;
      const fixtures = new Fixtures(context, null, { evidence });
      const result: CaseResult = {
        id: proof.id,
        gate: proof.gate,
        proofClass: proof.proofClass,
        source,
        ok: true,
        retainedTenants: [],
      };
      const ctx: HttpProofContext = {
        apiBase,
        request: async (route, init) => {
          const response = await fetch(`${apiBase}${route}`, init);
          let body: unknown = null;
          try {
            body = await response.json();
          } catch {
            // a response without a JSON body
          }
          return { status: response.status, body };
        },
        fixtures: fixtures.binView(),
        evidence: Object.freeze({
          enabled: evidence.enabled,
          record: (line: Omit<EvidenceLineInput, 'entry' | 'source'>) =>
            evidence.record({ ...line, entry: 'BIN', source }),
        }),
        mintProvenance: () => [...captured],
      };
      try {
        await resetLoopbackLoginPreflight(context.prisma);
        await proof.run(ctx);
      } catch (error) {
        result.ok = false;
        result.error = error instanceof Error ? error.message : String(error);
      } finally {
        try {
          result.retainedTenants = await fixtures.teardown();
        } catch (error) {
          result.ok = false;
          result.teardownError =
            error instanceof Error ? error.message : String(error);
        }
      }
      results.push(result);
    }
  } catch (error) {
    process.stderr.write(`${tail.join('\n')}\n`);
    throw error;
  } finally {
    await stopServer(child);
    stdout.flush().forEach(keep);
    await fixtureContext?.close();
  }

  if (cases.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        ...reportBase,
        cases: 0,
        status: 'EMPTY',
        binary: { health },
        note: 'no case is declared in the cases directory; the binary booted and nothing is evidenced',
      })}\n`,
    );
    return;
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(
    `${JSON.stringify({
      ...reportBase,
      cases: results.length,
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      failed: failed.length,
      binary: { health },
      mint_provenance: { captured: captured.length, malformed },
      results,
    })}\n`,
  );
  if (failed.length > 0 || malformed > 0) process.exitCode = 1;
}

// A runner that ends without settling `main` has printed no report; that is a failure, never a silent 0.
let settled = false;
process.on('exit', (code) => {
  if (!settled && code === 0) {
    process.stderr.write(
      'widgets-intent-http-proof: the runner ended before it finished (no report)\n',
    );
    process.exitCode = 1;
  }
});

void main()
  .then(() => {
    settled = true;
  })
  .catch((error: unknown) => {
    settled = true;
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: {
          code: 'widgets_intent_http_proof_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
