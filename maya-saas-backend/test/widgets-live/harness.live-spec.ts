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
    const ci = (url: string) => ({
      DATABASE_URL: url,
      CI: 'true',
      WIDGET_GATEWAY_PG: 'required',
    });

    it.each([
      ['missing', local(undefined)],
      ['blank', local('   ')],
      ['not a URL', local('maya_widget_gate_proof_x')],
      ['mysql', local('mysql://maya@127.0.0.1:3306/maya_widget_gate_proof_x')],
      [
        'localhost',
        local('postgresql://maya@localhost:55611/maya_widget_gate_proof_x'),
      ],
      [
        'another host',
        local('postgresql://maya@10.0.0.5:5432/maya_widget_gate_proof_x'),
      ],
      [
        'a host parameter',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x?host=10.0.0.5',
        ),
      ],
      [
        'a dbname parameter',
        local(
          'postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_x?dbname=maya_saas',
        ),
      ],
      ['maya_saas', local('postgresql://maya@127.0.0.1:5432/maya_saas')],
      ['postgres', local('postgresql://maya@127.0.0.1:5432/postgres')],
      [
        'a prod clone with the prefix',
        local(
          'postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_prod_clone',
        ),
      ],
      [
        'a clone with the prefix',
        local('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_clone1'),
      ],
      [
        'no prefix',
        local('postgresql://maya@127.0.0.1:5432/maya_c06_appointment_x'),
      ],
      [
        'an upper-case name',
        local('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_X'),
      ],
      [
        'maya_ci without CI',
        local(
          'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci?schema=public',
        ),
      ],
      [
        'maya_ci with CI but no WIDGET_GATEWAY_PG',
        {
          DATABASE_URL: 'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci',
          CI: 'true',
        },
      ],
      [
        'a proof name in CI mode',
        ci('postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_x'),
      ],
      [
        'a prod name in CI mode',
        ci('postgresql://maya@127.0.0.1:5432/maya_ci_prod'),
      ],
    ])('refuses %s', (_label, env) => {
      expect(() => assertProofDatabase(env as NodeJS.ProcessEnv)).toThrow(
        ProofDatabaseRefused,
      );
    });

    it('admits a proof database on 127.0.0.1 locally, and maya_ci only in CI mode', () => {
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
      ).toMatchObject({ database: 'maya_ci', mode: 'ci' });
    });

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
      ['SELECT pg_advisory_xact_lock(1)', false],
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
