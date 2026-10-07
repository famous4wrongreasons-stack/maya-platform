// Local current React + real HTTP/C8/C9 + two OS processes and PostgreSQL restart.
// Synthetic C8 source facts; no model, provider, notification or production access.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from '../../src/package5-wave1/package5-wave1.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_LIFECYCLE_REACT_STAGE;
const receipt = process.env.JEST_LIFECYCLE_REACT_RECEIPT!;
const output = process.env.JEST_LIFECYCLE_REACT_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use scripts/lifecycle-react-proof.mjs');
const database = assertProofDatabase();
if (
  !/^maya_widget_gate_proof_lifecyclereact_[a-f0-9]+$/.test(database.database)
)
  throw new Error('Fresh owned lifecycle React database required');
type ChatBody = {
  reply: string;
  coordination: {
    run_id: string;
    revision_id: string;
    revision: number;
    replayed: boolean;
  };
  recommendation: {
    outcome: string;
    canContact: boolean;
    noSideEffects: boolean;
    executionAuthority: boolean;
    agent: {
      agent_id: string;
      findings: unknown[];
      completeness: { totalCount: number | null };
    };
  };
};
function payload(response: { body: unknown }) {
  return response.body as { id: string };
}
type Saved = {
  database: string;
  pid: number;
  pgStarted: string;
  tenant: TenantFixture;
  user: UserFixture;
  clientId: string;
  appointmentId: string;
  sourceId: string;
  actionCount: number;
  first?: ChatBody;
  firstHash?: string;
  notBefore: number;
};

describe('Lifecycle current React [synthetic C8 source, actual HTTP and PG restart]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let model: jest.SpyInstance, external: jest.SpyInstance;
  const observations: Record<string, unknown> = {
    stage,
    syntheticC8Facts: true,
    realModelAcceptance: false,
    externalProviderAcceptance: false,
    certificate: 'NOT_ISSUED',
  };
  beforeAll(async () => {
    if (stage === 'resume')
      saved = JSON.parse(readFileSync(receipt, 'utf8')) as Saved;
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        throw new Error('Lifecycle explicit READ admits no model call');
      });
    external = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Lifecycle proof admits no external fetch');
    });
  });
  afterAll(async () => {
    observations.modelCalls = model?.mock.calls.length;
    observations.externalFetchCalls = external?.mock.calls.length;
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
  }
  async function seed() {
    const tenant = await fx.tenant(
      'Lifecycle synthetic browser',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'widgets.runtime',
      'analytics.business',
      'customers.core',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const policy = {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: [
        {
          ruleKey: 'barber_cadence',
          serviceScope: [],
          elapsed: { unit: 'day', count: 30 },
          comparison: 'gt',
          evidence: 'proven_attendance',
          minimumCoverage: 'PARTIAL',
        },
      ],
      rankingObjectives: [],
      minimumEvidence: [],
      exclusions: {
        serviceScope: [],
        branchIds: [],
        subjectStates: [],
        requiredFeatures: [],
      },
      opportunityAdmission: { enabled: false, rules: [] },
      modelUse: [],
    };
    await http.app
      .get(TenantContextService)
      .runAsSystemTenant(tenant.id, async () =>
        http.app.get(Package5Wave1ExecutableService).execute(
          await http.app
            .get(Package5Wave1ShadowService)
            .buildGoverned(
              tenant.id,
              user.id,
              'tenant_business_configuration',
              'owner-read-' + randomUUID(),
              randomUUID(),
              {
                confirmed: true,
                namespace: 'c8_valuation',
                expectedRevision: 0,
                previousRevisionId: null,
                content: policy,
              },
            ),
        ),
      );
    const client = await db.prisma.client.create({
      data: { tenantId: tenant.id },
    });
    const start = new Date(Date.now() - 40 * 86400000),
      end = new Date(start.getTime() + 3600000);
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: client.id,
        source: 'internal',
        staffExternalId: 'synthetic',
        serviceIds: [],
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        attendance: 'arrived',
        totalPriceKopecks: 12345,
        currency: 'RUB',
      },
    });
    const computed = await request(http.app.getHttpServer())
      .post('/api/analytics/valuations/compute')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subjectKind: 'client',
        subjectId: client.id,
        capability: 'dormancy/barber_cadence',
        branchIds: [],
      });
    expect(computed.status).toBe(201);
    expect(payload(computed)).toMatchObject({
      available: true,
      current: true,
      kind: 'POLICY_SIGNAL',
    });

    return {
      database: database.database,
      pid: process.pid,
      pgStarted: await pgStarted(),
      tenant,
      user,
      clientId: client.id,
      appointmentId: appointment.id,
      sourceId: payload(computed).id,
      actionCount: await db.prisma.actionExecution.count({
        where: { tenantId: tenant.id },
      }),
      notBefore: 0,
    };
  }
  async function unchanged() {
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: saved.tenant.id },
      }),
    ).toBe(saved.actionCount);
    expect(
      await db.prisma.c8ResultRevision.count({
        where: { tenantId: saved.tenant.id },
      }),
    ).toBe(1);
    if (saved.first) {
      const original = await db.prisma.c9StrategyRevision.findUniqueOrThrow({
        where: { id: saved.first.coordination.revision_id },
      });
      expect(original.snapshotHash).toBe(saved.firstHash);
    }
    expect(model).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
  }
  async function assertRead(response: ChatBody, available: boolean) {
    expect(response.coordination).toMatchObject({
      revision: 1,
      replayed: false,
    });
    expect(response.recommendation).toMatchObject({
      outcome: available ? 'PARTIAL' : 'UNAVAILABLE',
      canContact: false,
      noSideEffects: true,
      executionAuthority: false,
      agent: {
        agent_id: 'CLIENT_LIFECYCLE',
        completeness: { totalCount: null },
      },
    });
    expect(JSON.stringify(response)).not.toContain(saved.clientId);
    const revision = await db.prisma.c9StrategyRevision.findUniqueOrThrow({
      where: { id: response.coordination.revision_id },
    });
    const refs = revision.evidenceRefsJson as unknown as Array<{
      id: string;
      retentionUntil: string;
    }>;
    if (available) {
      expect(refs).toHaveLength(1);
      expect(refs[0].id).toBe(saved.sourceId);
      expect(revision.retentionUntil.toISOString()).toBe(
        refs[0].retentionUntil,
      );
    } else {
      expect(response.recommendation.agent.findings).toEqual([]);
    }
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { runId: response.coordination.run_id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].state).toBe('SETTLED');
    expect(JSON.stringify(receipts[0].resultJson)).not.toContain(
      saved.clientId,
    );
    await unchanged();
    return revision.snapshotHash;
  }
  it('restores historical response without work, then rechecks exact current sources on a new explicit UI turn', async () => {
    if (stage === 'prepare') saved = await seed();
    else {
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(await pgStarted());
      observations.processRestart = true;
      observations.postgresRestart = true;
    }
    let expectedRuns = stage === 'prepare' ? 0 : 1;
    const checkpoints: string[] = [];
    const browserOutput = path.join(output, stage + '-browser');
    mkdirSync(browserOutput);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/lifecycle-owner-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve(),
        killTimer: NodeJS.Timeout | undefined;
      const fail = (e: unknown) => {
        failure ??= e instanceof Error ? e : new Error(String(e));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Lifecycle browser timed out')),
        200000,
      );
      child.stderr!.on('data', (b: Buffer) => {
        stderr += b.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const m = raw as {
              type: string;
              name: string;
              response?: ChatBody;
              notBefore?: number;
            };
            if (m.type === 'ready')
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: browserOutput,
                stage,
                email: saved.user.email,
                notBefore: saved.notBefore,
                firstReply: saved.first?.reply,
              });
            else if (m.type === 'checkpoint') {
              if (m.name === 'initial' || m.name === 'unavailable') {
                const response = m.response!;
                const hash = await assertRead(response, m.name === 'initial');
                expectedRuns++;
                if (stage === 'prepare') {
                  saved.first = response;
                  saved.firstHash = hash;
                }
                if (stage === 'resume' && m.name === 'initial') {
                  expect(response.coordination.run_id).not.toBe(
                    saved.first!.coordination.run_id,
                  );
                  // Synthetic fixture transition only; no runtime action is invoked.
                  await db.prisma.appointment.update({
                    where: { id: saved.appointmentId },
                    data: { attendance: 'no_show' },
                  });
                }
                observations[m.name] = {
                  response,
                  sourceCount: 1,
                  actionCount: saved.actionCount,
                };
              }
              if (m.notBefore) saved.notBefore = m.notBefore;
              await unchanged();
              expect(
                await db.prisma.c9StrategyRevision.count({
                  where: { tenantId: saved.tenant.id },
                }),
              ).toBe(expectedRuns);
              expect(
                await db.prisma.c9WorkReceipt.count({
                  where: { tenantId: saved.tenant.id },
                }),
              ).toBe(expectedRuns);
              checkpoints.push(m.name);
              child.send({ type: 'continue:' + m.name });
            }
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(
          () =>
            failure
              ? reject(failure)
              : code !== 0
                ? reject(new Error('Lifecycle browser failed: ' + stderr))
                : resolve(),
          reject,
        );
      });
    });
    expect(checkpoints).toEqual(
      stage === 'prepare'
        ? ['initial', 'reload-restored']
        : ['restart-restored', 'initial', 'unavailable'],
    );
    if (stage === 'prepare')
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
    observations.checkpoints = checkpoints;
    observations.c8ResultCount = 1;
    observations.actionCountBefore = saved.actionCount;
    observations.actionCountAfter = saved.actionCount;
    observations.strategyRevisions = expectedRuns;
  }, 210000);
});
