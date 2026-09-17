// BIN — the production-binary HTTP proof runner of plan §4.2 (skeleton, U0 item 11).
//
// It boots the BUILT application (`dist/src/main`, as `scripts/http-smoke.ts` does), so a case exercises
// exactly the bytes a release ships: `main.ts`'s bootstrap, every global guard and interceptor, the real
// store. Each gate unit owns its cases in `scripts/widgets-http-proof/gate<N>.cases.ts`, exporting
// `cases: WidgetsHttpProofCase[]`; this runner owns discovery, the database guard, the server's lifetime
// and the report. No unit has declared a case yet, so today it reports that and starts nothing.
//
// Rules it enforces before anything starts:
//   - DATABASE_URL must pass the widgets-live proof-database guard (the same module the jest harness
//     uses), so the binary cannot be pointed at a working or production database;
//   - the binary would read `.env.local`/`.env` from its working directory, so the runner refuses to
//     start while either exists (existence only);
//   - the server's environment is the jest harness's (`widgetsLiveChildEnvironment`): the caller's
//     process-level variables, the guarded DATABASE_URL and the platform-ci.yml literals, scrubbed of
//     everything else in the caller's shell, plus the fixed test settings below.
//
// Run from maya-saas-backend, after `npm run build`:
//   ts-node --project tsconfig.scripts.json --transpile-only scripts/widgets-intent-http-proof.ts

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertNoEnvFiles,
  widgetsLiveChildEnvironment,
} from '../test/widgets-live/support/environment';

export interface HttpProofContext {
  /** e.g. `http://127.0.0.1:3121/api` */
  readonly apiBase: string;
  readonly databaseUrl: string;
  request(
    route: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: unknown }>;
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

const CASES_DIR = path.join(__dirname, 'widgets-http-proof');
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

function discoverCaseFiles(): string[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs
    .readdirSync(CASES_DIR)
    .filter((name) => CASE_FILE.test(name))
    .sort()
    .map((name) => path.join(CASES_DIR, name));
}

function loadCases(files: readonly string[]): WidgetsHttpProofCase[] {
  const cases: WidgetsHttpProofCase[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(file) as { cases?: unknown };
    if (!Array.isArray(loaded.cases))
      throw new Error(`${path.basename(file)} exports no cases array`);
    cases.push(...(loaded.cases as WidgetsHttpProofCase[]));
  }
  const ids = cases.map((c) => c.id);
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

async function waitForHealth(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `the binary exited before its health check (${child.exitCode})`,
      );
    try {
      if ((await fetch(`${apiBase}/health`)).ok) return;
    } catch {
      // still binding its port
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('the binary did not become healthy within 15 seconds');
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3_000))]);
  if (child.exitCode === null) {
    const forced = once(child, 'exit');
    child.kill('SIGKILL');
    await forced;
  }
}

async function main(): Promise<void> {
  // The guard runs here, on a copy; process.env itself is neither trusted by the child nor modified.
  const { env: serverEnv, database } = widgetsLiveChildEnvironment(
    process.env,
    SERVER_SETTINGS,
  );
  assertNoEnvFiles();
  const cases = loadCases(discoverCaseFiles());
  if (cases.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        contract: 'maya.widgets-intent-http-proof/1',
        database: database.database,
        cases: 0,
        status: 'EMPTY',
        note: 'no gate unit has declared a case; nothing was started and nothing is evidenced',
      })}\n`,
    );
    return;
  }

  const child = startServer(serverEnv);
  const output: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  const ctx: HttpProofContext = {
    apiBase,
    databaseUrl: database.connectionString,
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
  };

  const results: {
    id: string;
    gate: string;
    proofClass: string;
    ok: boolean;
    error?: string;
  }[] = [];
  try {
    await waitForHealth(child);
    for (const c of cases) {
      try {
        await c.run(ctx);
        results.push({
          id: c.id,
          gate: c.gate,
          proofClass: c.proofClass,
          ok: true,
        });
      } catch (error) {
        results.push({
          id: c.id,
          gate: c.gate,
          proofClass: c.proofClass,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    process.stderr.write(output.join('').split('\n').slice(-40).join('\n'));
    throw error;
  } finally {
    await stopServer(child);
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(
    `${JSON.stringify({
      contract: 'maya.widgets-intent-http-proof/1',
      database: database.database,
      cases: results.length,
      failed: failed.length,
      results,
    })}\n`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
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
