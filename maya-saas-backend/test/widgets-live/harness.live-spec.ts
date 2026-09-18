// The harness's own checks (plan §4.2). None of these is proof of a gate; each shows that a part of the
// harness every gate suite relies on can go red:
//   - the proof-database guard refuses what it must and admits only what it must;
//   - the environment is the platform-ci.yml literals, scrubbed of everything else, with no env file;
//   - the NW recorder sees a write, a raw write and a record change, and changes no query's result, and
//     it observes the gateway's own store client;
//   - the owner spies count a call through any instance and restore the owner unchanged;
//   - the bootstraps bind only the recorded store client and never override a guard.
// GATES-PLAN-V11 I-HAR adds the evidence-grade checks, each tagged with its exit test:
//   HAR-1  AppModule boots at the HTTP level with the widgets-live literals (IR-H1) [HTTP];
//   HAR-3  the recorder tells a lock (FOR SHARE, advisory) from a durable write, and NW turns red on the write [GW];
//   HAR-4  platform-ci carries exactly its literals; widgets-live.yml and widgets-mutation.yml carry the union with the
//          declared extras;
//   HAR-5  gate-audit-check passes on the committed audit and its self-test turns every check red;
//   HAR-6  the evidence manifest is written only with WIDGETS_EVIDENCE=1;
//   HAR-8  the two call-through wrappers (recorded store client, submit scope spy) change no result byte [HTTP];
//   HAR-9  the verifier rejects a record missing from the server's mint provenance or from the database before
//          teardown (a Fixtures.widget record) [GW];
//   HAR-10 the verifier rejects an E-TAMPER on a seal-read column, except for G1-a, however the column is spelled;
//   HAR-11 probe: the mutation runner's self-test target (`scripts/widgets-mutation-battery.mjs --self-test`).
// CKPT-W0 (review findings 1-3) adds:
//   HAR-12 [BUILD] the D-17 (3) scan: no labelled evidence test in a live spec or cases file names the provenance
//          context or calls Fixtures.widget/synthetic, the emitter or the record writer (and the scan can go red);
//   HAR-13 the verifier admits a clean L pair and turns each of its rules red on the input that breaks it;
//   HAR-14 the mint provenance capture points: the HTTP sink admits only an application call site, the BIN capture is
//          never claimed inside jest, and the writer refuses a BIN entry in jest and any line no capture registered.
// HAR-2 and HAR-7 are BIN runs of `npm run test:widgets:http` (plain, and with `--cases-dir
// test/widgets-live/support/bin-selftest`), outside jest.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

import { ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import request from 'supertest';

import { UserRole } from '../../src/common/domain.enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { IntentGatewayService } from '../../src/widgets/intent-gateway.service';
import { intentSubmitArgs } from '../../src/widgets/intent-submit-args';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import {
  bootFixtureContext,
  bootGateway,
  GATEWAY_LEVEL_IMPORTS,
  toSubmitIntentDto,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  applyWidgetsLiveEnvironment,
  assertNoEnvFiles,
  HARNESS_ONLY_VARIABLES,
  PLATFORM_CI_TEST_LITERALS,
  WIDGETS_LIVE_EXTRA_LITERALS,
  WIDGETS_LIVE_TEST_LITERALS,
  widgetsLiveChildEnvironment,
} from './support/environment';
import {
  EvidenceWriter,
  jestEvidenceSource,
  type EvidenceLineInput,
} from './support/evidence';
import {
  evidenceSourceFiles,
  scanEvidenceSource,
} from './support/evidence-source-scan';
import { Fixtures } from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';
import {
  loopbackLoginPreflightHashes,
  PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
  resetLoopbackLoginPreflight,
} from './support/login-rate-limit';
import {
  claimBinStdoutCapture,
  LineSplitter,
  MintProvenanceSink,
  parseMintProvenanceStdoutLine,
  WIDGET_MINT_PROVENANCE_CONTEXT,
  WIDGET_MINT_PROVENANCE_CONTRACT,
  type MintProvenanceLine,
} from './support/mint-provenance';
import { MUTATION_PROBE } from './support/mutation-probe';
import {
  classifyStatement,
  noWriteBaseline,
  noWriteViolations,
} from './support/no-write-recorder';
import {
  CANONICAL_READ_OWNERS,
  installOwnerSpies,
  ownerMethodName,
} from './support/owner-spies';
import {
  assertProofDatabase,
  FOREIGN_WORKSTREAM_DATABASE,
  PROOF_DATABASE_PATTERN,
  ProofDatabaseRefused,
} from './support/proof-db-guard';

const BACKEND = path.join(__dirname, '..', '..');
const REPO = path.join(BACKEND, '..');
const SUPPORT = path.join(__dirname, 'support');

/** A workflow job's `env:` block (six-space keys), as a record. */
const workflowJobEnv = (file: string, job: string): Record<string, string> => {
  const workflow = fs.readFileSync(
    path.join(REPO, '.github', 'workflows', file),
    'utf8',
  );
  const at = workflow.indexOf(`\n  ${job}:`);
  expect({ file, job, found: at >= 0 }).toEqual({ file, job, found: true });
  const jobText = workflow.slice(at);
  const block = jobText.slice(
    jobText.indexOf('\n    env:\n') + '\n    env:\n'.length,
  );
  const env: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^ {6}([A-Z0-9_]+): (.+)$/.exec(line);
    if (!m) break;
    env[m[1]] = m[2];
  }
  return env;
};

/** Runs `scripts/widgets-evidence-verify.mjs`; returns its exit status and its JSON report. */
const runVerifier = (verifierArgs: string[]) => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(BACKEND, 'scripts', 'widgets-evidence-verify.mjs'),
      ...verifierArgs,
    ],
    { cwd: BACKEND, encoding: 'utf8' },
  );
  const report = JSON.parse(result.stdout.split('\n')[0]) as {
    violations: { rule: string; test_id: string | null; reason: string }[];
  };
  const rulesOf = (testId: string) =>
    [
      ...new Set(
        report.violations
          .filter((v) => v.test_id === testId)
          .map((v) => v.rule),
      ),
    ].sort();
  return { status: result.status, report, rulesOf };
};

/**
 * Crafted verifier input: server mint lines written straight to a sidecar file, as a capture point would have written
 * them. Only these self-tests do this; the evidence writer itself refuses a line no capture point registered (HAR-14).
 */
const appendMintSidecar = (
  file: string,
  entry: 'HTTP' | 'BIN',
  lines: readonly MintProvenanceLine[],
  pid: number = process.pid,
): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const line of lines)
    fs.appendFileSync(
      file,
      `${JSON.stringify({ contract: 'maya.widgets-evidence-mint/1', entry, captured_at: new Date().toISOString(), pid, line })}\n`,
    );
};

const mintLine = (intentTokenHash: string): MintProvenanceLine => ({
  contract: WIDGET_MINT_PROVENANCE_CONTRACT,
  trigger: 'T-2b',
  route: 'POST /api/ai/tools/:toolName/execute',
  request_id: `har-${randomUUID()}`,
  intent_token_hash: intentTokenHash,
  widget_id: randomUUID(),
});

describe('widgets-live harness', () => {
  describe('proof-database guard', () => {
    const local = (url: string | undefined) =>
      url === undefined ? {} : { DATABASE_URL: url };
    /** What GitHub Actions sets (CI, GITHUB_ACTIONS) plus the workflows' WIDGET_GATEWAY_PG. */
    const ci = (url: string) => ({
      DATABASE_URL: url,
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      WIDGET_GATEWAY_PG: 'required',
    });

    // Each fixture breaks exactly one rule, on a dedicated port unless the port is the rule, and the
    // refusal must name that rule: a fixture refused for another reason would pin nothing.
    it.each([
      ['missing', local(undefined), /DATABASE_URL is not set/],
      ['blank', local('   '), /DATABASE_URL is not set/],
      ['not a URL', local('maya_widget_gate_proof_x'), /is not a URL/],
      [
        'mysql',
        local('mysql://maya@127.0.0.1:3306/maya_widget_gate_proof_x'),
        /protocol mysql: is not postgresql:/,
      ],
      [
        'localhost',
        local('postgresql://maya@localhost:55611/maya_widget_gate_proof_x'),
        /host "localhost" is not exactly 127\.0\.0\.1/,
      ],
      [
        'another host',
        local('postgresql://maya@10.0.0.5:55611/maya_widget_gate_proof_x'),
        /host "10\.0\.0\.5" is not exactly 127\.0\.0\.1/,
      ],
      [
        'a host parameter',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x?host=10.0.0.5',
        ),
        /query parameter "host" is not admitted/,
      ],
      [
        'a dbname parameter',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x?dbname=maya_saas',
        ),
        /query parameter "dbname" is not admitted/,
      ],
      [
        'no port (the driver would use 5432)',
        local('postgresql://maya@127.0.0.1/maya_widget_gate_proof_x'),
        /names no port/,
      ],
      [
        'an empty port',
        local('postgresql://maya@127.0.0.1:/maya_widget_gate_proof_x'),
        /names no port/,
      ],
      [
        'port 5432 locally',
        local('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_x'),
        /port 5432 is the shared local cluster/,
      ],
      [
        'port 05432 locally',
        local('postgresql://maya@127.0.0.1:05432/maya_widget_gate_proof_x'),
        /port 5432 is the shared local cluster/,
      ],
      [
        'maya_saas',
        local('postgresql://maya@127.0.0.1:55611/maya_saas'),
        /contains "maya_saas"/,
      ],
      [
        'postgres',
        local('postgresql://maya@127.0.0.1:55611/postgres'),
        /contains "postgres"/,
      ],
      [
        'a prod clone with the prefix',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_prod_clone',
        ),
        /contains "prod"/,
      ],
      [
        'a clone with the prefix',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_clone1',
        ),
        /contains "clone"/,
      ],
      [
        'no prefix',
        local('postgresql://maya@127.0.0.1:55611/maya_c06_appointment_x'),
        /does not match/,
      ],
      [
        'an upper-case name',
        local('postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_X'),
        /does not match/,
      ],
      [
        'maya_ci without CI mode',
        local(
          'postgresql://maya_ci:maya_ci@127.0.0.1:55611/maya_ci?schema=public',
        ),
        /maya_ci is admitted only in CI mode/,
      ],
      [
        'maya_ci with CI but no WIDGET_GATEWAY_PG',
        {
          DATABASE_URL: 'postgresql://maya_ci:maya_ci@127.0.0.1:55611/maya_ci',
          CI: 'true',
          GITHUB_ACTIONS: 'true',
        },
        /maya_ci is admitted only in CI mode/,
      ],
      [
        'maya_ci with CI and WIDGET_GATEWAY_PG but not on GitHub Actions',
        {
          DATABASE_URL: 'postgresql://maya_ci:maya_ci@127.0.0.1:55611/maya_ci',
          CI: 'true',
          WIDGET_GATEWAY_PG: 'required',
        },
        /maya_ci is admitted only in CI mode/,
      ],
      [
        "the workflows' maya_ci URL (port 5432) without GITHUB_ACTIONS",
        {
          DATABASE_URL:
            'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci?schema=public',
          CI: 'true',
          WIDGET_GATEWAY_PG: 'required',
        },
        /port 5432 is the shared local cluster/,
      ],
      [
        'maya_ci without a port in CI mode',
        ci('postgresql://maya_ci:maya_ci@127.0.0.1/maya_ci'),
        /names no port/,
      ],
      [
        'a proof name in CI mode',
        ci('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_x'),
        /the only database admitted is maya_ci/,
      ],
      [
        'a prod name in CI mode',
        ci('postgresql://maya@127.0.0.1:5432/maya_ci_prod'),
        /contains "prod"/,
      ],
      // CKPT-W1 CLOSE review fix. `maya_widget_gate_proof_local` is the CONCURRENT shell
      // workstream's proof database, and it lives on this very cluster and this very port. It breaks
      // no other rule here — right prefix, right host, dedicated port — so before the guard named it,
      // a stray DATABASE_URL let this harness seed and truncate the other workstream's evidence while
      // the fence stayed silent. Both modes, because it is never right in either.
      [
        "the shell workstream's database",
        local('postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_local'),
        /is the shell workstream's proof database on this same cluster/,
      ],
      [
        "the shell workstream's database in CI mode",
        ci('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_local'),
        /is the shell workstream's proof database on this same cluster/,
      ],
      [
        "the shell workstream's database upper-cased",
        local('postgresql://maya@127.0.0.1:55611/MAYA_WIDGET_GATE_PROOF_LOCAL'),
        /is the shell workstream's proof database on this same cluster/,
      ],
    ])('refuses %s', (_label, env, reason) => {
      expect(() => assertProofDatabase(env as NodeJS.ProcessEnv)).toThrow(
        ProofDatabaseRefused,
      );
      expect(() => assertProofDatabase(env as NodeJS.ProcessEnv)).toThrow(
        reason,
      );
    });

    it('admits a proof database on 127.0.0.1 and a dedicated port locally, and maya_ci (port 5432 included) only in CI mode', () => {
      expect(
        assertProofDatabase(
          local(
            'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_gates?schema=public',
          ) as NodeJS.ProcessEnv,
        ),
      ).toMatchObject({
        database: 'maya_widget_gate_proof_gates',
        port: '55611',
        mode: 'local',
      });
      expect(
        assertProofDatabase(
          ci(
            'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci?schema=public',
          ) as NodeJS.ProcessEnv,
        ),
      ).toMatchObject({ database: 'maya_ci', port: '5432', mode: 'ci' });
      // And the deny above is ONE NAME, not the prefix: a sibling proof database is still admitted.
      expect(
        assertProofDatabase(
          local(
            'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_localised',
          ) as NodeJS.ProcessEnv,
        ),
      ).toMatchObject({ database: 'maya_widget_gate_proof_localised' });
      expect(FOREIGN_WORKSTREAM_DATABASE).toBe('maya_widget_gate_proof_local');
      expect(PROOF_DATABASE_PATTERN.test(FOREIGN_WORKSTREAM_DATABASE)).toBe(
        true,
      );
    });

    it.each(['widgets-live.yml', 'widgets-mutation.yml'])(
      "admits %s's DATABASE_URL in CI mode, and refuses it once GITHUB_ACTIONS is absent",
      (file) => {
        const workflow = fs.readFileSync(
          path.join(BACKEND, '..', '.github', 'workflows', file),
          'utf8',
        );
        const url = /^ {6}DATABASE_URL: (\S+)$/m.exec(workflow)?.[1];
        expect(/^ {6}WIDGET_GATEWAY_PG: required$/m.test(workflow)).toBe(true);
        expect(url).toBeDefined();
        expect(assertProofDatabase(ci(url as string))).toMatchObject({
          database: 'maya_ci',
          mode: 'ci',
        });
        const notOnActions: NodeJS.ProcessEnv = { ...ci(url as string) };
        delete notOnActions.GITHUB_ACTIONS;
        expect(() => assertProofDatabase(notOnActions)).toThrow(
          ProofDatabaseRefused,
        );
      },
    );

    it('never echoes the password in a refusal', () => {
      expect(() =>
        assertProofDatabase({
          DATABASE_URL:
            'postgresql://maya:s3cr3t-value@127.0.0.1:5432/maya_saas',
        }),
      ).toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining('s3cr3t-value') as unknown,
        }) as Error,
      );
    });
  });

  describe('environment', () => {
    it("HAR-4 carries exactly platform-ci.yml's platform-backend literals (DATABASE_URL excepted), plus the declared widgets-live extras", () => {
      const platform = workflowJobEnv('platform-ci.yml', 'platform-backend');
      delete platform.DATABASE_URL;
      expect(Object.keys(platform).length).toBeGreaterThan(5);
      expect({ ...PLATFORM_CI_TEST_LITERALS }).toEqual(platform);
      // The extras are disjoint from platform-ci's literals, and the union is what the harness applies.
      expect(
        Object.keys(WIDGETS_LIVE_EXTRA_LITERALS).filter(
          (name) => name in PLATFORM_CI_TEST_LITERALS,
        ),
      ).toEqual([]);
      expect({ ...WIDGETS_LIVE_TEST_LITERALS }).toEqual({
        ...PLATFORM_CI_TEST_LITERALS,
        ...WIDGETS_LIVE_EXTRA_LITERALS,
      });
      expect(Object.keys(WIDGETS_LIVE_EXTRA_LITERALS).sort()).toEqual([
        'ACTION_ENGINE_IDENTITY_SECRET',
        'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
        'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION',
        'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER',
        'MAYA_REFERRAL_REWARD_CLAIM_SECRET',
        'MAYA_REFERRAL_REWARD_PRESENTATION_KEY',
        'MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION',
      ]);
      for (const [name, value] of Object.entries(WIDGETS_LIVE_EXTRA_LITERALS))
        expect({
          name,
          ok: /VERSION$/.test(name)
            ? /^[A-Za-z0-9._:-]{1,64}$/.test(value)
            : value.length >= 32 &&
              value.length <= 256 &&
              /for-widgets-live-only$/.test(value),
        }).toEqual({ name, ok: true });
    });

    it.each([
      ['widgets-live.yml', 'widgets-live'],
      ['widgets-mutation.yml', 'widgets-mutation'],
    ])(
      'HAR-4 %s carries exactly the widgets-live literals (platform-ci ∪ extras), its CI DATABASE_URL and WIDGET_GATEWAY_PG',
      (file, job) => {
        const env = workflowJobEnv(file, job);
        expect(env.WIDGET_GATEWAY_PG).toBe('required');
        expect(env.DATABASE_URL).toMatch(/\/maya_ci(\?|$)/);
        delete env.WIDGET_GATEWAY_PG;
        delete env.DATABASE_URL;
        expect(env).toEqual({ ...WIDGETS_LIVE_TEST_LITERALS });
      },
    );

    it('scrubs every variable that is neither a process variable nor a literal, and admits DATABASE_URL only through the guard', () => {
      const env: NodeJS.ProcessEnv = {
        PATH: '/usr/bin',
        DATABASE_URL:
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
        OPENAI_API_KEY: 'from the shell',
        MAYA_REFERRAL_REWARD_CLAIM_SECRET: 'from the shell',
        JWT_SECRET: 'from the shell',
        NODE_ENV: 'production',
      };
      applyWidgetsLiveEnvironment(env);
      expect(env).toEqual({
        PATH: '/usr/bin',
        DATABASE_URL:
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
        ...WIDGETS_LIVE_TEST_LITERALS,
      });
      expect(() =>
        applyWidgetsLiveEnvironment({
          DATABASE_URL: 'postgresql://maya@127.0.0.1:5432/maya_saas',
        }),
      ).toThrow(ProofDatabaseRefused);
    });

    it("builds a child process's environment by the same scrub, on a copy, plus fixed settings", () => {
      const source: NodeJS.ProcessEnv = {
        PATH: '/usr/bin',
        DATABASE_URL:
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
        OPENAI_API_KEY: 'from the shell',
        MAYA_REFERRAL_REWARD_CLAIM_SECRET: 'from the shell',
        JWT_SECRET: 'from the shell',
        WIDGETS_EVIDENCE: '1',
        WIDGETS_EVIDENCE_DIR: '/tmp/widgets-evidence-from-the-shell',
      };
      const snapshot = { ...source };
      const { env, database } = widgetsLiveChildEnvironment(source, {
        PORT: '3121',
        NODE_ENV: 'test',
      });
      expect(source).toEqual(snapshot);
      expect(database).toMatchObject({
        database: 'maya_widget_gate_proof_x',
        port: '55611',
      });
      // The harness's own variables (the evidence switch and directory) never reach the application.
      expect(HARNESS_ONLY_VARIABLES).toEqual([
        'WIDGETS_EVIDENCE',
        'WIDGETS_EVIDENCE_DIR',
      ]);
      expect(env).toEqual({
        PATH: '/usr/bin',
        DATABASE_URL:
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
        ...WIDGETS_LIVE_TEST_LITERALS,
        PORT: '3121',
        NODE_ENV: 'test',
      });
      expect(() =>
        widgetsLiveChildEnvironment(
          { DATABASE_URL: 'postgresql://maya@127.0.0.1:5432/maya_saas' },
          {},
        ),
      ).toThrow(ProofDatabaseRefused);
      expect(() =>
        widgetsLiveChildEnvironment(
          {
            DATABASE_URL:
              'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
          },
          { DATABASE_URL: 'postgresql://maya@127.0.0.1:5432/maya_saas' },
        ),
      ).toThrow(/not a child setting/);
    });

    it('the BIN runner spawns the binary with the child environment, never the raw shell', () => {
      const runner = fs.readFileSync(
        path.join(BACKEND, 'scripts', 'widgets-intent-http-proof.ts'),
        'utf8',
      );
      expect(runner).toContain('widgetsLiveChildEnvironment(');
      expect(runner).toContain('startServer(serverEnv)');
      expect(runner).not.toMatch(/\.\.\.process\.env/);
      expect(runner.match(/\bspawn\(/g)).toHaveLength(1);
      expect(runner).toMatch(
        /spawn\([^)]*\{\s*cwd: process\.cwd\(\),\s*env,\s*stdio:/,
      );
    });

    it("this suite's own environment was scrubbed before it loaded", () => {
      for (const [name, value] of Object.entries(WIDGETS_LIVE_TEST_LITERALS))
        expect({ name, value: process.env[name] }).toEqual({ name, value });
      expect(
        Object.keys(process.env).filter(
          (k) =>
            /SECRET|TOKEN|KEY|PASSWORD|PEPPER/.test(k) &&
            !(k in WIDGETS_LIVE_TEST_LITERALS),
        ),
      ).toEqual([]);
    });

    it('refuses to boot AppModule next to an .env or .env.local file (existence only)', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-live-env-'));
      try {
        expect(() => assertNoEnvFiles(dir)).not.toThrow();
        fs.writeFileSync(path.join(dir, '.env.local'), '');
        expect(() => assertNoEnvFiles(dir)).toThrow(/\.env\.local/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('NW recorder [GW]', () => {
    let gw: GatewayHarness;
    let ctx: FixtureContext;
    let fx: Fixtures;

    beforeAll(async () => {
      gw = await bootGateway();
      ctx = await bootFixtureContext();
      fx = new Fixtures(ctx, gw);
    });
    afterEach(async () => {
      await fx.teardown();
      gw.recorder.clear();
    });
    afterAll(async () => {
      await gw?.close();
      await ctx?.close();
    });

    it.each([
      ['SELECT 1', 'read'],
      ['  with x as (select 1) select * from x', 'read'],
      ['SELECT "shareCount", "advisory" FROM "WidgetDraft"', 'read'],
      ['SELECT "forUpdate" FROM "WidgetDraft"', 'read'],
      ['SELECT pg_advisory_xact_lock(1)', 'lock'],
      ['select pg_try_advisory_xact_lock(1)', 'lock'],
      [
        "SELECT pg_advisory_xact_lock_shared(hashtextextended('k', 0))::text",
        'lock',
      ],
      ['SELECT pg_advisory_unlock_all()', 'lock'],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR SHARE', 'lock'],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR KEY SHARE', 'lock'],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR UPDATE', 'lock'],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR NO KEY UPDATE', 'lock'],
      ['SELECT id FROM "Tenant" FOR UPDATE SKIP LOCKED', 'lock'],
      ['SET TRANSACTION READ ONLY', 'write'],
      ['LOCK TABLE "Tenant" IN SHARE MODE', 'write'],
      ['INSERT INTO "WidgetDraft" VALUES (1)', 'write'],
      [
        'WITH d AS (DELETE FROM "WidgetDraft" RETURNING *) SELECT * FROM d',
        'write',
      ],
      [
        'WITH d AS (UPDATE "Tenant" SET name = name RETURNING id) SELECT id FROM d FOR SHARE',
        'write',
      ],
      ["SELECT nextval('s')", 'write'],
      [undefined, 'write'],
    ])(
      'classifies raw %j as %s (D-12: a lock is not a write)',
      (sql, expected) => {
        expect(classifyStatement(sql)).toBe(expected);
      },
    );

    it("the gateway's store client is the recorded one, and the hook changes no result", async () => {
      const recorded = gw.moduleRef.get(PrismaService);
      const tenant = await fx.tenant('harness');
      const select = { id: true, slug: true, status: true } as const;
      const scope = `hook-${randomUUID()}`;
      const viaRecorded = await gw.recorder.within(scope, () =>
        recorded.tenant.findUnique({ where: { id: tenant.id }, select }),
      );
      expect(viaRecorded).toEqual(
        await ctx.prisma.tenant.findUnique({
          where: { id: tenant.id },
          select,
        }),
      );
      expect(gw.recorder.inScope(scope)).toEqual([
        {
          model: 'Tenant',
          operation: 'findUnique',
          write: false,
          lock: false,
          scope,
        },
      ]);
    });

    it('sees a model write, a raw write and a record change, and reports the row delta', async () => {
      const tenant = await fx.tenant('harness');
      const actor = await fx.actor(
        tenant,
        await fx.user(tenant, UserRole.ADMINISTRATOR),
      );
      const widget = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { v: 1 },
      });
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        widget.intentTokenHash,
      );
      const scope = `sensitivity-${randomUUID()}`;
      await gw.recorder.within(scope, async () => {
        await gw.stores.appendTurn({
          tenantId: tenant.id,
          conversationId: widget.conversationId,
          turnIndex: 1,
          role: 'user',
          principalProofHash: widget.intentTokenHash,
          channel: 'pwa',
        });
        await gw.moduleRef.get(PrismaService).$executeRaw`SELECT 1`;
        await gw.moduleRef.get(PrismaService).$queryRaw`SELECT 1`;
      });
      await fx.synthetic(widget, { priority: 1 });

      const nw = await noWriteViolations(
        gw.recorder,
        scope,
        ctx.prisma,
        tenant.id,
        widget.intentTokenHash,
        before,
      );
      expect(nw.writes.map((w) => `${w.model}.${w.operation}`)).toEqual([
        'WidgetTimelineTurn.create',
        'null.$executeRaw',
      ]);
      expect(nw.rowDelta).toEqual({ WidgetTimelineTurn: 1 });
      expect(nw.recordChanged).toBe(true);
      const rawRead = gw.recorder
        .inScope(scope)
        .find((op) => op.operation === '$queryRaw');
      expect(rawRead).toMatchObject({
        write: false,
        sql: expect.stringMatching(/SELECT 1/) as unknown,
      });
    });

    it('HAR-3 [GW] the recorder records a FOR SHARE and an advisory lock as locks, not writes, and NW turns red on a durable write in the same request', async () => {
      const tenant = await fx.tenant('HAR-3');
      // One active Membership, so the FOR SHARE below locks a real row.
      await fx.user(tenant, UserRole.ADMINISTRATOR);
      const recorded = gw.moduleRef.get(PrismaService);
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        null,
      );
      const scope = `HAR-3-${randomUUID()}`;

      // The request transaction's lock-taking reads (D-1: the Membership read FOR SHARE; an advisory lock).
      await gw.recorder.within(scope, () =>
        recorded.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${tenant.id} FOR SHARE`;
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.id}, 0))::text`;
        }),
      );
      expect(
        gw.recorder
          .locks(scope)
          .map((op) => ({ operation: op.operation, write: op.write })),
      ).toEqual([
        { operation: '$queryRaw', write: false },
        { operation: '$queryRaw', write: false },
      ]);
      expect(
        await noWriteViolations(
          gw.recorder,
          scope,
          ctx.prisma,
          tenant.id,
          null,
          before,
        ),
      ).toEqual({ writes: [], rowDelta: {}, recordChanged: false });

      // The same request then writes durably: the lock stays a lock, and NW is red on the write alone.
      await gw.recorder.within(scope, async () => {
        await recorded.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${tenant.id} FOR SHARE`;
        });
        await gw.stores.appendTurn({
          tenantId: tenant.id,
          conversationId: randomUUID(),
          turnIndex: 0,
          role: 'user',
          principalProofHash: 'har-3-principal',
          channel: 'pwa',
        });
      });
      const red = await noWriteViolations(
        gw.recorder,
        scope,
        ctx.prisma,
        tenant.id,
        null,
        before,
      );
      expect(red.writes.map((w) => `${w.model}.${w.operation}`)).toEqual([
        'WidgetTimelineTurn.create',
      ]);
      expect(red.rowDelta).toEqual({ WidgetTimelineTurn: 1 });
      expect(gw.recorder.locks(scope)).toHaveLength(3);
    });

    it("HAR-9 [GW] the verifier rejects a manifest line whose record is missing from the server's mint provenance lines, or from the database before teardown (a Fixtures.widget record)", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-har9-'));
      const sources = fs.mkdtempSync(
        path.join(os.tmpdir(), 'widgets-har9-src-'),
      );
      try {
        const writer = new EvidenceWriter({
          WIDGETS_EVIDENCE: '1',
          WIDGETS_EVIDENCE_DIR: dir,
        });
        const evidenceFx = new Fixtures(ctx, gw, { evidence: writer });
        const tenant = await evidenceFx.tenant('HAR-9');
        const actor = await evidenceFx.actor(
          tenant,
          await evidenceFx.user(tenant, UserRole.ADMINISTRATOR),
        );
        // Written by the harness's writers, never by a production trigger: no server mint line exists for them.
        const unminted = await evidenceFx.widget({
          tenant,
          actor,
          kind: 'METRIC',
          body: { v: 'HAR-9 unminted' },
        });
        const traced = await evidenceFx.widget({
          tenant,
          actor,
          kind: 'METRIC',
          body: { v: 'HAR-9 traced' },
        });
        const vanished = `har9-${randomUUID().replaceAll('-', '')}`;
        const line = (
          testId: string,
          recordHash: string,
        ): EvidenceLineInput => ({
          testId,
          entry: 'HTTP',
          source: 'harness.live-spec.ts',
          triggerTraceId: null,
          recordHash,
          stoppedAtGate: '8',
          gatesRun: 8,
          labels: ['[harness self-test]'],
        });
        expect(writer.record(line('HAR-9-A', unminted.intentTokenHash))).toBe(
          true,
        );
        expect(writer.record(line('HAR-9-B', vanished))).toBe(true);
        expect(writer.record(line('HAR-9-C', traced.intentTokenHash))).toBe(
          true,
        );
        // The captured server lines this self-test stands in for: one for B (never in the database), one for C. They
        // are crafted verifier input, written to the sidecar directly: the writer refuses a line no capture registered.
        appendMintSidecar(writer.paths.mint, 'HTTP', [
          mintLine(vanished),
          mintLine(traced.intentTokenHash),
        ]);

        expect(await evidenceFx.teardown()).toEqual([]);
        expect(
          await ctx.prisma.widgetIntentRecord.count({
            where: { tenantId: tenant.id },
          }),
        ).toBe(0);
        const snapshot = fs
          .readFileSync(writer.paths.database, 'utf8')
          .trim()
          .split('\n')
          .map(
            (text) =>
              JSON.parse(text) as {
                tenant_id: string;
                intent_token_hashes: string[];
              },
          );
        expect(snapshot).toEqual([
          expect.objectContaining({
            tenant_id: tenant.id,
            intent_token_hashes: [
              unminted.intentTokenHash,
              traced.intentTokenHash,
            ].sort(),
          }),
        ]);

        const verified = runVerifier(['--dir', dir, '--source-root', sources]);
        expect(verified.status).toBe(1);
        expect(verified.rulesOf('HAR-9-A')).toEqual(['V-PROV-MINT']);
        expect(verified.rulesOf('HAR-9-B')).toEqual(['V-PROV-DB']);
        expect(verified.rulesOf('HAR-9-C')).toEqual([]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(sources, { recursive: true, force: true });
      }
    });
  });

  describe('owner spies', () => {
    it("cover exactly G12 §6.2's owner reads (an emptied or shortened set would make every spy assertion vacuous)", () => {
      expect(CANONICAL_READ_OWNERS.map(ownerMethodName)).toEqual([
        'AiToolRuntimeService.execute',
        'MeasurementReadService.read',
        'MeasurementReadService.snapshot',
        'C8ReadService.list',
        'C8ReadService.snapshot',
        'C9Store.snapshot',
        'C9Store.review',
        'C9Store.revision',
        'C9Store.cancel',
        'C9Execution.status',
        'ClientAppointmentReadService.forAccount',
      ]);
    });

    it('count a call made through any instance, and restore every owner method unchanged', async () => {
      const originals = CANONICAL_READ_OWNERS.map(
        (m) => (m.owner.prototype as Record<string, unknown>)[m.method],
      );
      const spies = installOwnerSpies();
      try {
        for (const m of CANONICAL_READ_OWNERS) {
          const proto = m.owner.prototype as Record<
            string,
            (...args: unknown[]) => unknown
          >;
          // A bare instance: the real method runs and fails on its missing dependencies, after the spy counted it.
          const bare = Object.create(proto) as Record<
            string,
            (...args: unknown[]) => unknown
          >;
          try {
            await Promise.resolve(bare[m.method]('widgets-live-probe')).catch(
              () => undefined,
            );
          } catch {
            // a synchronous throw from the real method
          }
        }
        expect(spies.calls()).toEqual(
          Object.fromEntries(
            CANONICAL_READ_OWNERS.map((m) => [ownerMethodName(m), 1]),
          ),
        );
      } finally {
        spies.restore();
      }
      expect(
        CANONICAL_READ_OWNERS.map(
          (m) => (m.owner.prototype as Record<string, unknown>)[m.method],
        ),
      ).toEqual(originals);
    });
  });

  describe('bootstraps', () => {
    const support = () =>
      fs
        .readdirSync(SUPPORT)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => ({
          file: f,
          text: fs.readFileSync(path.join(SUPPORT, f), 'utf8'),
        }));

    it('override no guard, and bind nothing but the recorded store client', () => {
      const texts = support();
      expect(
        texts
          .filter((t) =>
            /overrideGuard|overrideInterceptor|overrideFilter|overridePipe/.test(
              t.text,
            ),
          )
          .map((t) => t.file),
      ).toEqual([]);
      // No support file imports a guard, so none can be replaced, wrapped or re-provided from here.
      expect(
        texts
          .filter((t) =>
            /import[^;]*\b(FeatureGuard|JwtAuthGuard|RolesGuard|TenantAccessGuard|SubscriptionAccessGuard|QuotaGuard|APP_GUARD)\b[^;]*from/.test(
              t.text,
            ),
          )
          .map((t) => t.file),
      ).toEqual([]);
      const overrides = texts.flatMap((t) =>
        [...t.text.matchAll(/\.overrideProvider\(([^)]*)\)/g)].map(
          (m) => `${t.file}:${m[1]}`,
        ),
      );
      expect(overrides).toEqual([
        'bootstrap.ts:PrismaService',
        'http-bootstrap.ts:PrismaService',
      ]);
    });

    it('the gateway level imports exactly Config, Prisma, Tenancy and Widgets; the HTTP level exactly AppModule', () => {
      const gateway = fs.readFileSync(
        path.join(SUPPORT, 'bootstrap.ts'),
        'utf8',
      );
      const http = fs.readFileSync(
        path.join(SUPPORT, 'http-bootstrap.ts'),
        'utf8',
      );
      const gatewayImports =
        /imports: \[harnessConfig\(\), (PrismaModule), (TenancyModule), (WidgetsModule)\]/.exec(
          gateway,
        );
      expect(
        gatewayImports && ['ConfigModule', ...gatewayImports.slice(1)],
      ).toEqual([...GATEWAY_LEVEL_IMPORTS]);
      expect(http).toMatch(
        /Test\.createTestingModule\(\{ imports: \[AppModule\] \}\)/,
      );
      expect(http).toMatch(
        /createNestApplication<NestExpressApplication>\(\{\s*bodyParser: false,\s*\}\)/,
      );
      expect(http).toMatch(/configureHttpApp\(app\);\s*await app\.init\(\);/);
    });
  });

  describe('evidence manifest', () => {
    const line: EvidenceLineInput = {
      testId: 'HAR-6',
      entry: 'GW',
      source: 'test/widgets-live/harness.live-spec.ts',
      triggerTraceId: null,
      recordHash: null,
      stoppedAtGate: null,
      gatesRun: null,
      labels: ['[harness self-test]'],
    };

    it('HAR-6 the evidence manifest is written only when WIDGETS_EVIDENCE=1, and a malformed line is refused either way', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-har6-'));
      try {
        expect(jestEvidenceSource()).toBe(
          'test/widgets-live/harness.live-spec.ts',
        );
        for (const flag of [undefined, '', '0', 'true', 'yes', ' 1', '1 ']) {
          const off = new EvidenceWriter({
            WIDGETS_EVIDENCE: flag,
            WIDGETS_EVIDENCE_DIR: dir,
          });
          expect({ flag, enabled: off.enabled }).toEqual({
            flag,
            enabled: false,
          });
          expect(off.record(line)).toBe(false);
          expect(off.mintProvenanceRefused('HTTP', 'probe')).toBe(false);
          expect(off.databaseBeforeTeardown('t', ['h'])).toBe(false);
        }
        expect(fs.readdirSync(dir)).toEqual([]);

        const on = new EvidenceWriter({
          WIDGETS_EVIDENCE: '1',
          WIDGETS_EVIDENCE_DIR: dir,
        });
        expect(on.record(line)).toBe(true);
        expect(on.record({ ...line, testId: 'HAR-6b', entry: 'HTTP' })).toBe(
          true,
        );
        // A BIN line is the BIN runner's alone, and its writer cannot be built inside jest (review finding 1).
        for (const writer of [new EvidenceWriter({}), on])
          expect(() => writer.record({ ...line, entry: 'BIN' })).toThrow(
            /a BIN manifest line is written only by the BIN runner's writer/,
          );
        expect(
          () =>
            new EvidenceWriter(
              { WIDGETS_EVIDENCE: '1', WIDGETS_EVIDENCE_DIR: dir },
              { role: 'bin-runner' },
            ),
        ).toThrow(/never constructed inside jest/);
        const written = fs
          .readFileSync(on.paths.manifest, 'utf8')
          .trim()
          .split('\n')
          .map((text) => JSON.parse(text) as Record<string, unknown>);
        expect(written).toEqual([
          expect.objectContaining({
            contract: 'maya.widgets-evidence/1',
            test_id: 'HAR-6',
            entry: 'GW',
            source: 'test/widgets-live/harness.live-spec.ts',
            trigger_trace_id: null,
            record_hash: null,
            stopped_at_gate: null,
            gates_run: null,
            labels: ['[harness self-test]'],
            clauses: [],
            claim: null,
          }),
          expect.objectContaining({ test_id: 'HAR-6b', entry: 'HTTP' }),
        ]);

        for (const writer of [new EvidenceWriter({}), on])
          for (const bad of [
            { ...line, entry: 'CLI' as never },
            { ...line, testId: '' },
            { ...line, source: '/abs/harness.live-spec.ts' },
            { ...line, source: '../outside.ts' },
            { ...line, labels: ['E-MINT'] },
            { ...line, gatesRun: -1 },
            { ...line, recordHash: '' },
            { ...line, claim: 'L' as const },
            { ...line, claim: 'COMPLETE' as never, clauses: ['G1-a'] },
          ])
            expect(() => writer.record(bad)).toThrow(
              /widgets-live evidence line refused/,
            );
        expect(
          fs.readFileSync(on.paths.manifest, 'utf8').trim().split('\n'),
        ).toHaveLength(2);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('mint provenance capture (D-17)', () => {
    it("HAR-14 parses the server's WidgetMintProvenance line as the BIN runner reads the binary's stdout and as the HTTP sink receives it; other contexts and malformed lines are never captured", () => {
      const line = mintLine('d17-capture-probe');

      // BIN: the bytes Nest's console logger prints, colours included, split across arbitrary chunks.
      const printed: string[] = [];
      const write = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
          printed.push(String(chunk));
          return true;
        });
      try {
        const provenance = new ConsoleLogger(WIDGET_MINT_PROVENANCE_CONTEXT, {
          colors: true,
        });
        provenance.log(JSON.stringify(line));
        new ConsoleLogger('SomeOtherContext', { colors: true }).log(
          JSON.stringify(line),
        );
        provenance.log('not a provenance line');
      } finally {
        write.mockRestore();
      }
      const bytes = printed.join('');
      const splitter = new LineSplitter();
      const lines = [
        ...splitter.push(bytes.slice(0, 17)),
        ...splitter.push(bytes.slice(17)),
        ...splitter.flush(),
      ];
      expect(lines.map(parseMintProvenanceStdoutLine)).toEqual([
        line,
        null,
        'malformed',
      ]);
      // Parsing registers nothing, and only the BIN runner's process can claim the capture that does.
      expect(() => claimBinStdoutCapture()).toThrow(
        /never claimed inside jest/,
      );

      // HTTP: the sink captures by context, and only from the application's src/ (see HAR-14 call sites below).
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-d17-'));
      try {
        const writer = new EvidenceWriter({
          WIDGETS_EVIDENCE: '1',
          WIDGETS_EVIDENCE_DIR: dir,
        });
        const forwarded: string[] = [];
        const forward: LoggerService = {
          log: () => forwarded.push('log'),
          warn: () => forwarded.push('warn'),
          error: () => forwarded.push('error'),
        };
        const sink = new MintProvenanceSink(
          forward,
          (captured) => writer.mintProvenance('HTTP', [captured]),
          (reason) => writer.mintProvenanceRefused('HTTP', reason),
        );
        // An application call site: a function whose frame names a file under src/ (it calls the sink as Nest's
        // static logger would). `vm` is used ONLY in this self-test; the verifier refuses it in any claim source.
        const fromSrc = vm.runInThisContext(
          '(function (sink, message, context) { sink.log(message, context); })',
          {
            filename: path.join(
              fs.realpathSync(path.join(BACKEND, 'src')),
              'widgets',
              'har14-application-call-site.ts',
            ),
          },
        ) as (sink: LoggerService, message: string, context: string) => void;
        fromSrc(sink, JSON.stringify(line), WIDGET_MINT_PROVENANCE_CONTEXT);
        fromSrc(sink, JSON.stringify(line), 'SomeOtherContext');
        fromSrc(
          sink,
          '{"contract":"invented"}',
          WIDGET_MINT_PROVENANCE_CONTEXT,
        );
        sink.error('boom', 'SomeOtherContext');
        sink.warn('careful', 'SomeOtherContext');
        expect(sink.captured()).toEqual([line]);
        expect(sink.malformed()).toBe(1);
        expect(sink.refused()).toBe(0);
        expect(forwarded).toEqual(['error', 'warn']);
        const sidecar = () =>
          fs
            .readFileSync(writer.paths.mint, 'utf8')
            .trim()
            .split('\n')
            .map((text) => JSON.parse(text) as Record<string, unknown>);
        expect(sidecar()).toEqual([
          expect.objectContaining({
            contract: 'maya.widgets-evidence-mint/1',
            entry: 'HTTP',
            line,
          }),
          expect.objectContaining({
            contract: 'maya.widgets-evidence-mint-refused/1',
            entry: 'HTTP',
          }),
        ]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('HAR-14 the HTTP sink refuses a provenance line logged from test code, the reviewer forgery included, and the writer refuses a line no capture point registered', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-har14-'));
      const staticLogger = Logger as unknown as {
        staticInstanceRef?: LoggerService;
      };
      const previous = staticLogger.staticInstanceRef;
      try {
        const writer = new EvidenceWriter({
          WIDGETS_EVIDENCE: '1',
          WIDGETS_EVIDENCE_DIR: dir,
        });
        const sink = new MintProvenanceSink(
          new ConsoleLogger(),
          (captured) => writer.mintProvenance('HTTP', [captured]),
          (reason) => writer.mintProvenanceRefused('HTTP', reason),
        );
        const forged = JSON.stringify({
          ...mintLine('forged-hash'),
          request_id: null,
        });
        // Directly, from this spec.
        sink.log(forged, WIDGET_MINT_PROVENANCE_CONTEXT);
        // Through Nest's static logger, as `app.useLogger(sink)` installs it, with the context assembled at run time.
        Logger.overrideLogger(sink);
        new Logger(['Widget', 'Mint', 'Provenance'].join('')).log(forged);
        expect(sink.captured()).toEqual([]);
        expect(sink.refused()).toBe(2);
        const sidecar = fs
          .readFileSync(writer.paths.mint, 'utf8')
          .trim()
          .split('\n')
          .map(
            (text) => JSON.parse(text) as { contract: string; reason: string },
          );
        expect(sidecar.map((l) => l.contract)).toEqual([
          'maya.widgets-evidence-mint-refused/1',
          'maya.widgets-evidence-mint-refused/1',
        ]);
        expect(sidecar[0].reason).toContain(
          'test/widgets-live/harness.live-spec.ts',
        );

        // A line this spec built or parsed is not a server capture, with evidence on or off.
        for (const w of [writer, new EvidenceWriter({})])
          expect(() =>
            w.mintProvenance('HTTP', [
              parseMintProvenanceStdoutLine(
                `[Nest] 1 - LOG [${WIDGET_MINT_PROVENANCE_CONTEXT}] ${forged}`,
              ) as MintProvenanceLine,
            ]),
          ).toThrow(/not one built or parsed elsewhere/);
        expect(() => writer.mintProvenance('BIN', [mintLine('b')])).toThrow(
          /written only by the BIN runner's writer/,
        );
      } finally {
        Logger.overrideLogger(previous ?? new ConsoleLogger());
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('evidence verifier', () => {
    it('HAR-10 the verifier rejects an E-TAMPER label on a column the SealVerifier reads, except for key G1-a', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-har10-'));
      const sources = fs.mkdtempSync(
        path.join(os.tmpdir(), 'widgets-har10-src-'),
      );
      try {
        fs.writeFileSync(
          path.join(sources, 'probe.live-spec.ts'),
          '// HAR-10 probe source: no override, no fixture write\n',
        );
        const writer = new EvidenceWriter({
          WIDGETS_EVIDENCE: '1',
          WIDGETS_EVIDENCE_DIR: dir,
        });
        const tamper = (
          testId: string,
          label: string,
          clauses: string[],
        ): void => {
          writer.record({
            testId,
            entry: 'HTTP',
            source: 'probe.live-spec.ts',
            triggerTraceId: null,
            recordHash: null,
            stoppedAtGate: '1',
            gatesRun: 1,
            labels: [label],
            clauses,
            claim: 'L-T',
          });
        };
        tamper('T1', '[E-TAMPER:WidgetEmission.bodyHash]', ['G5-e']);
        tamper('T2', '[tamper:deliveryChannel]', ['G7-7']);
        tamper('T3', '[E-TAMPER:WidgetIntentRecord.principalProofHash]', [
          'G3-a',
        ]);
        tamper('T4', '[E-TAMPER:WidgetRenderReceipt.profileId]', ['G7-7']);
        tamper('T5', '[E-TAMPER:WidgetEmission.expiresAt]', ['G1-a', 'G1-c']);
        tamper('T6', '[E-TAMPER:WidgetEmission.bodyHash]', ['G1-a']);
        tamper('T7', '[E-TAMPER:WidgetIntentRecord.verificationFloor]', [
          'G5-e',
        ]);
        tamper('T8', '[E-TAMPER:capabilitySpace=TOOL]', ['G6-19']);
        // Respellings of a sealed column (review finding 1 (e)): each is still the sealed column.
        tamper('T9', '[E-TAMPER:WidgetEmission.bodyHash,verificationFloor]', [
          'G5-e',
        ]);
        tamper('T10', '[E-TAMPER:WidgetEmission.bodyHash ]', ['G5-e']);
        tamper('T11', '[E-TAMPER:widget_emission.body_hash]', ['G5-e']);
        tamper('T12', '[E-Tamper:WidgetEmission.widgetId]', ['G5-e']);
        tamper('T13', '[E-TAMPER:"WidgetEmission"."tenantId"]', ['G5-e']);
        tamper('T14', '[E-TAMPER:public.widget_emission.issued_at]', ['G5-e']);
        tamper('T15', '[E-TAMPER:verificationFloor; deliveryChannel]', [
          'G5-e',
        ]);
        tamper('T16', '[E-TAMPER:WidgetIntentRecord.verificationFloor=0]', [
          'G5-e',
        ]);

        const verified = runVerifier(['--dir', dir, '--source-root', sources]);
        expect(verified.status).toBe(1);
        const sealed = (testId: string) =>
          verified.rulesOf(testId).includes('V-TAMPER-SEALED');
        const ids = Array.from({ length: 16 }, (_, i) => `T${i + 1}`);
        expect(Object.fromEntries(ids.map((id) => [id, sealed(id)]))).toEqual({
          T1: true,
          T2: true,
          T3: true,
          T4: true,
          T5: true,
          T6: false,
          T7: false,
          T8: false,
          T9: true,
          T10: true,
          T11: true,
          T12: true,
          T13: true,
          T14: true,
          T15: true,
          T16: false,
        });
        // The skeleton refuses every L-T claim it cannot verify; the tamper rule is on top of that.
        expect(verified.rulesOf('T6')).toContain('V-UNVERIFIED');
        expect(verified.rulesOf('T6')).not.toContain('V-TAMPER-SEALED');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(sources, { recursive: true, force: true });
      }
    });

    it('rejects nothing on an empty evidence directory, and passes the real harness support files through its override allowlist', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-verify-'));
      try {
        const verified = runVerifier(['--dir', dir]);
        expect(verified.report.violations).toEqual([]);
        expect(verified.status).toBe(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('evidence verifier rules (review findings 1-2)', () => {
    // Crafted verifier inputs: a manifest, the mint and database sidecars, and a source root. The clean pair is what
    // §0.5 L and D-17 (5) ask for; each case breaks exactly one thing about it and names the rule that must turn red.
    type Json = Record<string, unknown>;
    interface Scenario {
      manifest: Json[];
      mint: Json[];
      database: string[];
      files: Record<string, string>;
    }
    const HTTP_PID = 71001;
    const BIN_PID = 72002;
    const SPEC = 'test/widgets-live/probe.live-spec.ts';
    const CASES = 'scripts/widgets-http-proof/gateP.cases.ts';
    const CLEAN_SPEC =
      "// a probe spec: it only posts to the live route\nit('P-1 [HTTP] probe', async () => {\n  await http.postIntent(token, body);\n});\n";
    const CLEAN_CASES =
      "export const cases = [{ id: 'P-1', gate: '4', proofClass: 'LIVE', async run(ctx) { await ctx.request('/widgets/intent', {}); } }];\n";
    const manifestLine = (entry: 'HTTP' | 'BIN'): Json => ({
      contract: 'maya.widgets-evidence/1',
      test_id: 'P-1',
      entry,
      source: entry === 'HTTP' ? SPEC : CASES,
      trigger_trace_id: `req-${entry}`,
      record_hash: `hash-${entry}`,
      stopped_at_gate: '13',
      gates_run: 13,
      labels: ['[E-MINT]'],
      clauses: ['G4-b'],
      claim: 'L',
      recorded_at: '2026-09-17T00:00:00.000Z',
      pid: entry === 'HTTP' ? HTTP_PID : BIN_PID,
    });
    const mintSidecarLine = (entry: 'HTTP' | 'BIN'): Json => ({
      contract: 'maya.widgets-evidence-mint/1',
      entry,
      captured_at: '2026-09-17T00:00:00.000Z',
      pid: entry === 'HTTP' ? HTTP_PID : BIN_PID,
      line: {
        contract: WIDGET_MINT_PROVENANCE_CONTRACT,
        trigger: 'T-2b',
        route: 'POST /api/ai/tools/:toolName/execute',
        request_id: `req-${entry}`,
        intent_token_hash: `hash-${entry}`,
        widget_id: `w-${entry}`,
      },
    });
    const cleanPair = (): Scenario => ({
      manifest: [manifestLine('HTTP'), manifestLine('BIN')],
      mint: [mintSidecarLine('HTTP'), mintSidecarLine('BIN')],
      database: ['hash-HTTP', 'hash-BIN'],
      files: {
        [SPEC]: CLEAN_SPEC,
        [CASES]: CLEAN_CASES,
        'test/widgets-live/support/http-bootstrap.ts':
          'moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useFactory({ factory }).compile();\n',
      },
    });
    const verifyScenario = (scenario: Scenario) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-har13-'));
      try {
        const dir = path.join(root, 'evidence');
        const sources = path.join(root, 'backend');
        fs.mkdirSync(dir);
        const jsonl = (rows: Json[]) =>
          rows.map((row) => `${JSON.stringify(row)}\n`).join('');
        fs.writeFileSync(
          path.join(dir, 'evidence-manifest.jsonl'),
          jsonl(scenario.manifest),
        );
        fs.writeFileSync(
          path.join(dir, 'mint-provenance.jsonl'),
          jsonl(scenario.mint),
        );
        fs.writeFileSync(
          path.join(dir, 'database-before-teardown.jsonl'),
          jsonl([
            {
              contract: 'maya.widgets-evidence-database/1',
              tenant_id: 't',
              intent_token_hashes: scenario.database,
            },
          ]),
        );
        for (const [file, text] of Object.entries(scenario.files)) {
          fs.mkdirSync(path.dirname(path.join(sources, file)), {
            recursive: true,
          });
          fs.writeFileSync(path.join(sources, file), text);
        }
        const verified = runVerifier(['--dir', dir, '--source-root', sources]);
        const globalRules = [
          ...new Set(
            verified.report.violations
              .filter((v) => v.test_id === null)
              .map((v) => v.rule),
          ),
        ].sort();
        return { ...verified, globalRules };
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    };
    const http = (sc: Scenario) => sc.manifest[0];
    const bin = (sc: Scenario) => sc.manifest[1];
    const httpMint = (sc: Scenario) =>
      sc.mint[0] as { line: Json; pid: number };
    const spec = (sc: Scenario, body: string) => {
      sc.files[SPEC] = `${CLEAN_SPEC}${body}\n`;
    };

    it('HAR-13 admits a clean L pair: an HTTP half and a BIN half, each with its own production-minted record, trace and process', () => {
      const verified = verifyScenario(cleanPair());
      expect(verified.report.violations).toEqual([]);
      expect(verified.status).toBe(0);
    });

    const cases: [string, string, (sc: Scenario) => void, 'P-1' | 'global'][] =
      [
        [
          'V-L-PAIR',
          'an HTTP half with no BIN half',
          (sc) => void sc.manifest.pop(),
          'P-1',
        ],
        [
          'V-L-PAIR',
          'halves offered for different clauses',
          (sc) => void (bin(sc).clauses = ['G4-a']),
          'P-1',
        ],
        [
          'V-L-PAIR',
          'a BIN half that claims nothing',
          (sc) =>
            void Object.assign(bin(sc), {
              claim: null,
              labels: [],
              clauses: [],
            }),
          'P-1',
        ],
        [
          'V-PROV-RECORD',
          'an L claim that names no record',
          (sc) => void (http(sc).record_hash = null),
          'P-1',
        ],
        [
          'V-PROV-MINT',
          'a record with no server mint line',
          (sc) => void sc.mint.shift(),
          'P-1',
        ],
        [
          'V-PROV-MINT',
          'a record with two server mint lines',
          (sc) => void sc.mint.push(sc.mint[0]),
          'P-1',
        ],
        [
          'V-PROV-DB',
          'a record missing from the database before teardown',
          (sc) => void (sc.database = ['hash-BIN']),
          'P-1',
        ],
        [
          'V-PROV-TRIGGER',
          'a mint line whose trigger is not a production trigger',
          (sc) => void (httpMint(sc).line.trigger = 'forged-by-test'),
          'P-1',
        ],
        [
          'V-PROV-TRIGGER',
          'a successor mint whose predecessor is not traced',
          (sc) => void (httpMint(sc).line.trigger = 'successor'),
          'P-1',
        ],
        [
          'V-PROV-TRACE',
          "a trace id that is not the mint line's request id",
          (sc) => void (http(sc).trigger_trace_id = 'req-other'),
          'P-1',
        ],
        [
          'V-PROV-TRACE',
          'a claim with no trace id',
          (sc) => void (http(sc).trigger_trace_id = null),
          'P-1',
        ],
        [
          'V-PROV-PID',
          'a line written by another process than the capture',
          (sc) => void (http(sc).pid = HTTP_PID + 2),
          'P-1',
        ],
        [
          'V-PROV-FORGED',
          'a capture point that refused a provenance line',
          (sc) =>
            void sc.mint.push({
              contract: 'maya.widgets-evidence-mint-refused/1',
              entry: 'HTTP',
              reason:
                'a WidgetMintProvenance call from test/widgets-live/probe.live-spec.ts',
              pid: HTTP_PID,
            }),
          'global',
        ],
        [
          'V-ENTRY-SOURCE',
          'an HTTP claim from a support file',
          (sc) => {
            http(sc).source = 'test/widgets-live/support/probe.live-spec.ts';
            sc.files['test/widgets-live/support/probe.live-spec.ts'] =
              CLEAN_SPEC;
          },
          'P-1',
        ],
        [
          'V-ENTRY-SOURCE',
          'a BIN claim from a live spec',
          (sc) => void (bin(sc).source = SPEC),
          'P-1',
        ],
        [
          'V-PROCESS',
          'one process writing both the HTTP and the BIN half',
          (sc) => {
            bin(sc).pid = HTTP_PID;
            (sc.mint[1] as { pid: number }).pid = HTTP_PID;
          },
          'P-1',
        ],
        [
          'V-LABEL-CLASS',
          'an E-INDEP label on an L claim',
          (sc) => void (http(sc).labels = ['[E-MINT]', '[E-INDEP]']),
          'P-1',
        ],
        [
          'V-LABEL-CLASS',
          'an E-TAMPER label on an L claim',
          (sc) =>
            void (http(sc).labels = [
              '[E-MINT]',
              '[E-TAMPER:WidgetIntentRecord.verificationFloor]',
            ]),
          'P-1',
        ],
        [
          'V-LABEL-CLASS',
          'an L claim whose only label is an L-T class',
          (sc) => void (http(sc).labels = ['[E-INDEP(mint)]']),
          'P-1',
        ],
        [
          'V-SCHEMA',
          'a claim with no evidence label',
          (sc) => void (http(sc).labels = ['[harness]']),
          'P-1',
        ],
        [
          'V-SYNTH-CLAIM',
          'a G-SYNTH label on an L claim',
          (sc) => void (http(sc).labels = ['[E-MINT]', '[G-SYNTH]']),
          'P-1',
        ],
        [
          'V-SYNTH-CLAIM',
          'a synthetic label in another case',
          (sc) => void (http(sc).labels = ['[E-MINT]', '[Synthetic Record]']),
          'P-1',
        ],
        [
          'V-GW',
          'a claim on a GW line',
          (sc) => void (http(sc).entry = 'GW'),
          'P-1',
        ],
        [
          'V-INVENTORY',
          'a clause key that is not in the inventory',
          (sc) => {
            http(sc).clauses = ['G4-zz'];
            bin(sc).clauses = ['G4-zz'];
          },
          'P-1',
        ],
        [
          'V-LT-G9-G10',
          'an L-T claim on a Gate 9 key',
          (sc) =>
            void Object.assign(http(sc), {
              claim: 'L-T',
              clauses: ['9.1'],
              labels: ['[E-INDEP]'],
            }),
          'P-1',
        ],
        [
          'V-UNVERIFIED',
          'a U claim',
          (sc) => void (http(sc).claim = 'U'),
          'P-1',
        ],
        [
          'V-TAMPER-SHAPE',
          'an E-TAMPER naming two columns besides the floor',
          (sc) =>
            void Object.assign(http(sc), {
              claim: 'L-T',
              labels: [
                '[E-TAMPER:WidgetIntentRecord.effect,WidgetIntentRecord.widgetKind]',
              ],
            }),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'Fixtures.widget through a variable argument',
          (sc) => spec(sc, 'await fx.widget(input);'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'Fixtures.synthetic',
          (sc) => spec(sc, 'await fx.synthetic(input);'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'a widget model write',
          (sc) =>
            spec(sc, 'await ctx.prisma.widgetIntentRecord.create({ data });'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'the emitter',
          (sc) => spec(sc, 'await emitter.emit(kind, input);'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'raw SQL',
          (sc) => spec(sc, 'await prisma.$executeRawUnsafe(sql);'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'its own database client',
          (sc) => spec(sc, 'const client = new PrismaClient({ adapter });'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'a logger with a provenance context assembled at run time',
          (sc) =>
            spec(
              sc,
              "new Logger(['Widget', 'Mint', 'Provenance'].join('')).log(line);",
            ),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          "the evidence directory's files",
          (sc) =>
            spec(
              sc,
              "fs.appendFileSync(path.join(dir, 'mint-provenance.jsonl'), line);",
            ),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'code loaded dynamically',
          (sc) => spec(sc, 'vm.runInThisContext(code, { filename });'),
          'P-1',
        ],
        [
          'V-FIXTURE-WRITE',
          'a helper it imports that writes',
          (sc) => {
            spec(sc, "import { mint } from './helpers/mint';\nawait mint();");
            sc.files['test/widgets-live/helpers/mint.ts'] =
              'export const mint = () => fx.widget(input);\n';
          },
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a module mock',
          (sc) =>
            spec(sc, "jest.mock('../../src/tenancy/tenant-context.service');"),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a providers-array binding',
          (sc) =>
            spec(
              sc,
              'Test.createTestingModule({ imports: [AppModule], providers: [{ provide: TenantContextService, useValue: stub }] });',
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a replaced property',
          (sc) => spec(sc, "jest.replaceProperty(gateway, 'submit', fake);"),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a spy replaced in a second statement',
          (sc) =>
            spec(
              sc,
              "const spy = jest.spyOn(gateway, 'submit');\nspy.mockResolvedValue(verdict);",
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a member assigned on a resolved provider',
          (sc) =>
            spec(
              sc,
              'moduleRef.get(TenantContextService).assertTenantId = () => undefined;',
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a member assigned through a variable holding a resolved provider',
          (sc) =>
            spec(
              sc,
              'const tenancy = app.get(TenantContextService);\ntenancy.assertTenantId = () => undefined;',
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a guard override',
          (sc) =>
            spec(
              sc,
              '.overrideGuard(FeatureGuard).useValue({ canActivate: () => true })',
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'a prototype member assigned',
          (sc) =>
            spec(
              sc,
              'TenantContextService.prototype.assertTenantId = () => undefined;',
            ),
          'P-1',
        ],
        [
          'V-OVERRIDE',
          'an override in a nested support directory',
          (sc) =>
            void (sc.files['test/widgets-live/support/extra/boot.ts'] =
              '.overrideProvider(TenantContextService).useValue({})\n'),
          'global',
        ],
        [
          'V-OVERRIDE',
          'an allowlisted target overridden from a file the allowlist does not name',
          (sc) =>
            void (sc.files['test/widgets-live/support/other-boot.ts'] =
              '.overrideProvider(PrismaService).useFactory({ factory })\n'),
          'global',
        ],
        [
          'V-MODEL-STUB',
          'a module mock of the model transport',
          (sc) =>
            spec(sc, "jest.mock('../../src/ai-tools/ai-core-model.service');"),
          'P-1',
        ],
        [
          'V-MODEL-STUB',
          'the model transport replaced on its resolved provider',
          (sc) =>
            spec(
              sc,
              'moduleRef.get(AiCoreModelService).decide = async () => null;',
            ),
          'P-1',
        ],
        [
          'V-MODEL-STUB',
          'a spy on decide replaced in a second statement',
          (sc) =>
            spec(
              sc,
              "const spy = jest.spyOn(model, 'decide');\nspy.mockResolvedValue(fake);",
            ),
          'P-1',
        ],
        [
          'V-MODEL-STUB',
          'a providers-array binding of the model transport in a support file',
          (sc) =>
            void (sc.files['test/widgets-live/support/providers.ts'] =
              'Test.createTestingModule({ imports: [AppModule], providers: [{ provide: AiCoreModelService, useValue: { decide } }] });\n'),
          'global',
        ],
        [
          'V-CONTROLLED',
          'controlledFixtureMode',
          (sc) => spec(sc, 'const options = { controlledFixtureMode: true };'),
          'P-1',
        ],
      ];

    it.each(cases)(
      'HAR-13 %s turns red on %s',
      (rule, _what, mutate, where) => {
        const scenario = cleanPair();
        mutate(scenario);
        const verified = verifyScenario(scenario);
        expect(verified.status).toBe(1);
        const rules =
          where === 'global' ? verified.globalRules : verified.rulesOf('P-1');
        expect({ rule, rules }).toEqual({
          rule,
          rules: expect.arrayContaining([rule]) as unknown,
        });
      },
    );
  });

  describe('D-17 (3) evidence sources [BUILD]', () => {
    it('HAR-12 [BUILD] no labelled evidence test in a live spec or cases file names the provenance context or calls Fixtures.widget, Fixtures.synthetic, the emitter or the record writer', () => {
      const files = evidenceSourceFiles(BACKEND);
      expect(files).toEqual(
        expect.arrayContaining([
          'test/widgets-live/harness.live-spec.ts',
          'test/widgets-live/gate12-data-fence.live-spec.ts',
          'test/widgets-live/support/bin-selftest/gateH-harness.cases.ts',
        ]) as unknown,
      );
      const findings = files.flatMap((file) =>
        scanEvidenceSource(
          file,
          fs.readFileSync(path.join(BACKEND, file), 'utf8'),
        ),
      );
      expect(findings).toEqual([]);
    });

    it('HAR-12 [BUILD] the scan goes red on every forbidden construct in a labelled test, through a helper too, and stays quiet on unlabelled tests', () => {
      const L = (title: string) => `[E-${title}]`;
      const planted: [string, string, string, boolean][] = [
        [
          'clean labelled test',
          'a.live-spec.ts',
          `it('X-1 [HTTP] ${L('MINT')}', async () => { await http.postIntent(t, b); });`,
          false,
        ],
        [
          'unlabelled G-SYNTH test',
          'a.live-spec.ts',
          "it('X-2 [GW] [G-SYNTH]', async () => { await fx.widget({ tenant }); });",
          false,
        ],
        [
          'Fixtures.widget',
          'a.live-spec.ts',
          `it('X-3 ${L('MINT')}', async () => { await fx.widget(input); });`,
          true,
        ],
        [
          'helper indirection',
          'a.live-spec.ts',
          `async function mint() { return fx.synthetic(x); }\nit('X-4 ${L('DRIFT')}', async () => { await mint(); });`,
          true,
        ],
        [
          'context in a string',
          'a.live-spec.ts',
          `it('X-5 ${L('HOSTILE')}', () => { expect(ctx).toBe('WidgetMintProvenance'); });`,
          true,
        ],
        [
          'context assembled at run time',
          'a.live-spec.ts',
          `it('X-6 ${L('MINT')}', () => { new Logger(['Widget', 'Mint', 'Provenance'].join('')).log(x); });`,
          true,
        ],
        [
          'template title and the emitter',
          'a.live-spec.ts',
          'it(`X-7 [E-TAMPER:${col}]`, async () => { await emitter.emit(k, i); });',
          true,
        ],
        [
          'it.each and a model write',
          'a.live-spec.ts',
          `it.each(rows)('X-8 ${L('HOSTILE')} %s', async (r) => { await ctx.prisma.widgetIntentRecord.create({ data: r }); });`,
          true,
        ],
        [
          'a labelled describe',
          'a.live-spec.ts',
          `describe('group ${L('MINT')}', () => { it('X-9 plain', async () => { await fx.widget({}); }); });`,
          true,
        ],
        [
          'a labelled BIN case',
          'gateX.cases.ts',
          `export const cases = [{ id: 'X-10', async run(ctx) { ctx.evidence.record({ labels: ['${L('MINT')}'] }); writeRecord(ctx); } }];`,
          true,
        ],
        [
          'an unlabelled BIN case',
          'gateX.cases.ts',
          "export const cases = [{ id: 'X-11', async run(ctx) { await fx.widget({}); } }];",
          false,
        ],
      ];
      const outcomes = planted.map(([name, file, text]) => [
        name,
        scanEvidenceSource(file, text).length > 0,
      ]);
      expect(outcomes).toEqual(planted.map(([name, , , red]) => [name, red]));
    });
  });

  describe('gate audit check', () => {
    it('HAR-5 gate-audit-check passes on the committed /2 audit, and its self-test turns every check red, the SHA compare included', () => {
      const checker = path.join(
        REPO,
        'docs',
        'rebuild',
        'evidence',
        'maya-chat-first-ux',
        'gate-audit-check.mjs',
      );
      const plain = spawnSync(process.execPath, [checker], {
        encoding: 'utf8',
      });
      expect({
        status: plain.status,
        last: plain.stdout.trim().split('\n').pop(),
      }).toEqual({
        status: 0,
        last: expect.stringMatching(
          /^GATE AUDIT CHECK: PASS \(schema \/2, 15 gates, 165 clause keys/,
        ) as unknown,
      });
      const self = spawnSync(process.execPath, [checker, '--self-test'], {
        encoding: 'utf8',
      });
      const lines = self.stdout.trim().split('\n');
      expect(lines.filter((l) => l.startsWith('BAD '))).toEqual([]);
      for (const id of ['P0', 'N1 a key removed', 'N4', 'N5', 'N6'])
        expect(lines.some((l) => l.startsWith(`ok   ${id}`))).toBe(true);
      expect({ status: self.status, last: lines.pop() }).toEqual({
        status: 0,
        last: expect.stringMatching(
          /^GATE AUDIT CHECK SELF-TEST: PASS/,
        ) as unknown,
      });
    });
  });

  describe('mutation runner probe', () => {
    it('HAR-11 probe [GW]: the target of the mutation runner self-test, red only when its neutraliser set and both mutant edits are applied (not a gate test)', () => {
      expect(
        MUTATION_PROBE.neutraliser &&
          MUTATION_PROBE.first &&
          MUTATION_PROBE.second,
      ).toBe(false);
    });
  });

  describe('HTTP level [HTTP]', () => {
    let http: HttpHarness;
    let ctx: FixtureContext;
    let fx: Fixtures;

    beforeAll(async () => {
      ctx = await bootFixtureContext();
      http = await bootHttp();
      fx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
    });
    afterEach(async () => {
      await fx.teardown();
      http.recorder.clear();
    });
    afterAll(async () => {
      await http?.close();
      await ctx?.close();
    });

    it('HAR-1 [HTTP] AppModule boots with the widgets-live literals: the widget route is mapped behind the global guards, and the mint provenance sink is installed and empty', async () => {
      const server = http.app.getHttpServer() as Parameters<typeof request>[0];
      const anonymous = await request(server)
        .post('/api/widgets/intent')
        .send({ intent_token: 'har1-unauthenticated-token' });
      expect(anonymous.status).toBe(401);
      expect(http.mintProvenance()).toEqual([]);
      expect(http.malformedMintProvenance()).toBe(0);
      expect(http.refusedMintProvenance()).toBe(0);
    });

    it("HAR-1b [HTTP] a harness login consumes exactly the loopback subject's password-login preflight bucket the hygiene mirror computes, and the reset removes it", async () => {
      const tenant = await fx.tenant('HAR-1b');
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      const token = await http.login(tenant.slug, user.email, user.password);
      expect(typeof token).toBe('string');
      const buckets = await ctx.prisma.authRateLimitBucket.findMany({
        where: {
          policyKey: PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
          tenantId: null,
          subjectHash: { in: loopbackLoginPreflightHashes() },
        },
        select: { attempts: true },
      });
      expect(buckets).toEqual([{ attempts: 1 }]);
      expect(await resetLoopbackLoginPreflight(ctx.prisma)).toBe(1);
      expect(await resetLoopbackLoginPreflight(ctx.prisma)).toBe(0);
    });

    it('HAR-8 [HTTP] the call-through wrappers return byte-identical results to the unwrapped call (the recorded store client and the submit scope spy)', async () => {
      const tenant = await fx.tenant('HAR-8');
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      const actor = await fx.actor(tenant, user);
      const widget = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { v: 'HAR-8' },
      });

      // The recorded store client against the unrecorded fixture client, operation by operation.
      const recorded = http.app.get(PrismaService);
      const same = async (
        label: string,
        run: (db: PrismaService) => Promise<unknown>,
      ) => {
        const wrapped = await http.recorder.within(`HAR-8 ${label}`, () =>
          run(recorded),
        );
        const plain = await run(ctx.prisma);
        expect({ label, bytes: JSON.stringify(wrapped) }).toEqual({
          label,
          bytes: JSON.stringify(plain),
        });
        expect(isDeepStrictEqual(wrapped, plain)).toBe(true);
        expect(http.recorder.inScope(`HAR-8 ${label}`).length).toBeGreaterThan(
          0,
        );
      };
      await same('record', (db) =>
        db.widgetIntentRecord.findFirst({
          where: {
            tenantId: tenant.id,
            intentTokenHash: widget.intentTokenHash,
          },
        }),
      );
      await same('memberships', (db) =>
        db.membership.findMany({
          where: { tenantId: tenant.id },
          orderBy: { id: 'asc' },
        }),
      );
      await same(
        'raw',
        (db) =>
          db.$queryRaw`SELECT count(*)::int AS n FROM "WidgetEmission" WHERE "tenantId" = ${tenant.id}`,
      );

      // The submit spy against the gateway's own method, in the request CLS a live request has.
      const gateway = http.app.get(IntentGatewayService);
      // The instance carries the scope spy as an own property; the prototype keeps the gateway's own method.
      expect(
        jest.isMockFunction(
          Object.getOwnPropertyDescriptor(gateway, 'submit')?.value,
        ),
      ).toBe(true);
      const context = http.app.get(TenantContextService);
      const resolver = http.app.get(TenantResolverService);
      const inRequest = <T>(work: () => Promise<T>): Promise<T> =>
        context.run(`HAR-8:${randomUUID()}`, () => {
          resolver.bindAuthenticatedUser(actor);
          return work();
        });
      for (const intentToken of [
        widget.intentToken,
        'har8-unknown-intent-token-000',
      ]) {
        const args = intentSubmitArgs(
          await toSubmitIntentDto({ intent_token: intentToken }),
          actor,
        );
        http.recorder.clear();
        const wrapped = await inRequest(() => gateway.submit(args));
        expect(http.recorder.inScope(GATEWAY_SCOPE).length).toBeGreaterThan(0);
        const plain = await inRequest(() =>
          IntentGatewayService.prototype.submit.call(gateway, args),
        );
        expect(JSON.stringify(wrapped)).toBe(JSON.stringify(plain));
        expect(isDeepStrictEqual(wrapped, plain)).toBe(true);
      }
    });
  });
});
