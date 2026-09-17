// The harness's own checks (plan §4.2). None of these is proof of a gate; each shows that a part of the
// harness every gate suite relies on can go red:
//   - the proof-database guard refuses what it must and admits only what it must;
//   - the environment is the platform-ci.yml literals, scrubbed of everything else, with no env file;
//   - the NW recorder sees a write, a raw write and a record change, and changes no query's result, and
//     it observes the gateway's own store client;
//   - the owner spies count a call through any instance and restore the owner unchanged;
//   - the bootstraps bind only the recorded store client and never override a guard.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootFixtureContext,
  bootGateway,
  GATEWAY_LEVEL_IMPORTS,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  applyWidgetsLiveEnvironment,
  assertNoEnvFiles,
  PLATFORM_CI_TEST_LITERALS,
  widgetsLiveChildEnvironment,
} from './support/environment';
import { Fixtures } from './support/fixtures';
import {
  isWritingStatement,
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
  ProofDatabaseRefused,
} from './support/proof-db-guard';

const BACKEND = path.join(__dirname, '..', '..');
const SUPPORT = path.join(__dirname, 'support');

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
            'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_local?schema=public',
          ) as NodeJS.ProcessEnv,
        ),
      ).toMatchObject({
        database: 'maya_widget_gate_proof_local',
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
    it("carries exactly platform-ci.yml's platform-backend literals (DATABASE_URL excepted)", () => {
      const workflow = fs.readFileSync(
        path.join(BACKEND, '..', '.github', 'workflows', 'platform-ci.yml'),
        'utf8',
      );
      const job = workflow.slice(workflow.indexOf('\n  platform-backend:'));
      const block = job.slice(
        job.indexOf('\n    env:\n') + '\n    env:\n'.length,
      );
      const literals: Record<string, string> = {};
      for (const line of block.split('\n')) {
        const m = /^ {6}([A-Z0-9_]+): (.+)$/.exec(line);
        if (!m) break;
        if (m[1] !== 'DATABASE_URL') literals[m[1]] = m[2];
      }
      expect(Object.keys(literals).length).toBeGreaterThan(5);
      expect({ ...PLATFORM_CI_TEST_LITERALS }).toEqual(literals);
    });

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
        ...PLATFORM_CI_TEST_LITERALS,
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
      expect(env).toEqual({
        PATH: '/usr/bin',
        DATABASE_URL:
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x',
        ...PLATFORM_CI_TEST_LITERALS,
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
      for (const [name, value] of Object.entries(PLATFORM_CI_TEST_LITERALS))
        expect({ name, value: process.env[name] }).toEqual({ name, value });
      expect(
        Object.keys(process.env).filter(
          (k) =>
            /SECRET|TOKEN|KEY|PASSWORD/.test(k) &&
            !(k in PLATFORM_CI_TEST_LITERALS),
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
      ['SELECT 1', false],
      ['  with x as (select 1) select * from x', false],
      ['SELECT "shareCount", "advisory" FROM "WidgetDraft"', false],
      ['SELECT pg_advisory_xact_lock(1)', true],
      ['select pg_try_advisory_xact_lock(1)', true],
      [
        "SELECT pg_advisory_xact_lock_shared(hashtextextended('k', 0))::text",
        true,
      ],
      ['SELECT pg_advisory_unlock_all()', true],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR SHARE', true],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR KEY SHARE', true],
      ['SELECT id FROM "Tenant" WHERE id = $1 FOR NO KEY UPDATE', true],
      ['SET TRANSACTION READ ONLY', true],
      ['INSERT INTO "WidgetDraft" VALUES (1)', true],
      [
        'WITH d AS (DELETE FROM "WidgetDraft" RETURNING *) SELECT * FROM d',
        true,
      ],
      ["SELECT nextval('s')", true],
    ])('classifies raw %j as write=%s', (sql, write) => {
      expect(isWritingStatement(sql)).toBe(write);
    });

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
        { model: 'Tenant', operation: 'findUnique', write: false, scope },
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
});
