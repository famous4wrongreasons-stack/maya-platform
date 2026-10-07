// Local current React + real HTTP/C7/C9 + two OS processes and PostgreSQL restart.
// Synthetic C7 facts only; no model, external provider or production access.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { MeasurementReportReader } from '../../src/measurement/measurement.report';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
const stage = process.env.JEST_BI_REACT_STAGE;
const receipt = process.env.JEST_BI_REACT_RECEIPT!;
const output = process.env.JEST_BI_REACT_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use scripts/bi-react-proof.mjs');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_bireact_[a-f0-9]+$/.test(database.database))
  throw new Error('Fresh owned BI React database required');
type ChatBody = {
  request_id: string;
  reply: string;
  coordination: { run_id: string; replayed: boolean; current: boolean };
  analysis: {
    outcome: string;
    mode: string;
    noSideEffects: boolean;
    executionAuthority: boolean;
    agent: {
      agent_id: string;
      findings: unknown[];
      proposed_action_intents: unknown[];
    };
    evidence: { workReceiptId: string };
  };
};
type Saved = {
  database: string;
  pid: number;
  pgStarted: string;
  tenant: TenantFixture;
  user: UserFixture;
  appointmentId: string;
  sourceId: string;
  newSourceId?: string;
  sourceHash: string;
  period: { from: string; to: string };
  first?: ChatBody;
  firstRequest?: Record<string, unknown>;
  notBefore: number;
};
describe('BI published snapshot current React [synthetic facts, actual HTTP and PG restart]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let model: jest.SpyInstance, external: jest.SpyInstance;
  const observations: Record<string, unknown> = {
    stage,
    syntheticC7Facts: true,
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
        throw new Error('BI explicit READ admits no model call');
      });
    external = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('BI proof admits no external fetch');
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
  function publish(tenantId: string, period: { from: string; to: string }) {
    return http.app
      .get(TenantContextService)
      .runAsSystemTenant(tenantId, () =>
        http.app
          .get(MeasurementReportReader)
          .snapshot(
            tenantId,
            'synthetic-bi-' + randomUUID(),
            period,
            new Date(),
          ),
      );
  }
  async function seed(): Promise<Saved> {
    const tenant = await fx.tenant(
      'BI synthetic browser',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'widgets.runtime',
      'analytics.business',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'UTC' },
    });
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 1);
    const start = new Date(day.getTime() + 12 * 3600000),
      end = new Date(start.getTime() + 3600000);
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
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
    const period = {
      from: day.toISOString(),
      to: new Date(day.getTime() + 86400000 - 1).toISOString(),
    };
    const report = await publish(tenant.id, period);
    expect(report.mode).toBe('as_reported');
    expect(report.revisionId).toBeTruthy();
    return {
      database: database.database,
      pid: process.pid,
      pgStarted: await pgStarted(),
      tenant,
      user,
      appointmentId: appointment.id,
      sourceId: report.revisionId!,
      sourceHash: report.snapshotHash!,
      period,
      notBefore: 0,
    };
  }
  async function unchanged() {
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: saved.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.measurementRevision.count({
        where: { tenantId: saved.tenant.id },
      }),
    ).toBe(stage === 'prepare' ? 1 : 2);
    expect(
      (
        await db.prisma.measurementRevision.findUniqueOrThrow({
          where: { id: saved.sourceId },
        })
      ).snapshotHash,
    ).toBe(saved.sourceHash);
    expect(
      await db.prisma.c9StrategyRevision.count({
        where: { tenantId: saved.tenant.id },
      }),
    ).toBe(0);
    expect(model).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
  }
  async function assertRead(
    response: ChatBody,
    sourceId: string,
    replayed = false,
  ) {
    expect(response.coordination).toMatchObject({ replayed, current: false });
    const visible = response.reply.replace(/[\u00a0\u202f]/g, ' ');
    const original = sourceId === saved.sourceId;
    expect(visible).toContain(
      'Стоимость записанных услуг: ' + (original ? '123,45 ₽' : '543,21 ₽'),
    );
    expect(visible).not.toContain(original ? '543,21 ₽' : '123,45 ₽');
    expect(response.analysis).toMatchObject({
      mode: 'as_reported',
      noSideEffects: true,
      executionAuthority: false,
      agent: { agent_id: 'BUSINESS_INTELLIGENCE', proposed_action_intents: [] },
    });
    const work = await db.prisma.c9WorkReceipt.findUniqueOrThrow({
      where: { id: response.analysis.evidence.workReceiptId },
    });
    expect(work.state).toBe('SETTLED');
    expect(work.runId).toBe(response.coordination.run_id);
    const refs = work.inputEvidenceRefsJson as unknown as Array<{ id: string }>;
    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe(sourceId);
    const source = await db.prisma.measurementRevision.findUniqueOrThrow({
      where: { id: sourceId },
    });
    expect(work.retentionUntil.getTime()).toBeLessThanOrEqual(
      source.expiresAt.getTime(),
    );
    expect(work.resultJson).toMatchObject({
      contract: 'maya.c9-bi-report-receipt/1',
      sourceCount: 1,
    });
    expect(JSON.stringify(work.resultJson)).not.toMatch(/metrics|12345|54321/);
    await unchanged();
  }
  it('restores history and exact-version replay, selects a newer report only for a new explicit UI request', async () => {
    if (stage === 'prepare') saved = await seed();
    else {
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(await pgStarted());
      observations.processRestart = true;
      observations.postgresRestart = true;
      // Synthetic fixture transition, not an action initiated by the READ.
      await db.prisma.appointment.update({
        where: { id: saved.appointmentId },
        data: { totalPriceKopecks: 54321 },
      });
      saved.newSourceId = (
        await publish(saved.tenant.id, saved.period)
      ).revisionId!;
      expect(saved.newSourceId).not.toBe(saved.sourceId);
    }
    let expectedRuns = stage === 'prepare' ? 0 : 1;
    const checkpoints: string[] = [],
      browserOutput = path.join(output, stage + '-browser');
    mkdirSync(browserOutput);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('../maya-carrier-react/test/bi-owner-browser-probe.mjs')],
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
        () => fail(new Error('BI browser timed out')),
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
              requestDto?: Record<string, unknown>;
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
              if (m.name === 'restart-restored') {
                // History has already been observed without a new request. Only
                // now retry the original HTTP turn: canonical history subsequently
                // restores the latest completion revision, including its replay header.
                const token = await http.login(
                  saved.tenant.slug,
                  saved.user.email,
                  saved.user.password,
                );
                const replay = await request(http.app.getHttpServer())
                  .post('/api/ai/chat')
                  .set('Authorization', `Bearer ${token}`)
                  .send(saved.firstRequest);
                expect(replay.status).toBe(201);
                await assertRead(replay.body as ChatBody, saved.sourceId, true);
                observations.exactReplayAfterNewPublication = {
                  status: replay.status,
                  sameWorkReceipt:
                    (replay.body as ChatBody).analysis.evidence
                      .workReceiptId ===
                    saved.first!.analysis.evidence.workReceiptId,
                };
                expect(
                  observations.exactReplayAfterNewPublication,
                ).toMatchObject({ sameWorkReceipt: true });
              }
              if (m.name === 'initial') {
                const response = m.response!;
                await assertRead(
                  response,
                  stage === 'prepare' ? saved.sourceId : saved.newSourceId!,
                );
                expectedRuns++;
                if (stage === 'prepare') {
                  saved.first = response;
                  saved.firstRequest = m.requestDto!;
                } else
                  expect(response.coordination.run_id).not.toBe(
                    saved.first!.coordination.run_id,
                  );
                observations.initial = {
                  response,
                  sourceCount: stage === 'prepare' ? 1 : 2,
                  actionCount: 0,
                };
              }
              if (m.notBefore) saved.notBefore = m.notBefore;
              await unchanged();
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
                ? reject(new Error('BI browser failed: ' + stderr))
                : resolve(),
          reject,
        );
      });
    });
    expect(checkpoints).toEqual(
      stage === 'prepare'
        ? ['initial', 'reload-restored']
        : ['restart-restored', 'initial'],
    );
    if (stage === 'prepare')
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
    else {
      const token = await http.login(
        saved.tenant.slug,
        saved.user.email,
        saved.user.password,
      );
      const dto = {
        surface: 'web',
        audience: 'owner',
        requestId: randomUUID(),
        messages: [
          {
            role: 'user',
            content: 'Объясни последний опубликованный финансовый отчёт',
          },
        ],
      };
      const send = (body: unknown, auth = token) =>
        request(http.app.getHttpServer())
          .post('/api/ai/chat')
          .set('Authorization', `Bearer ${auth}`)
          .send(body);
      const before = await db.prisma.c9WorkReceipt.count({
        where: { tenantId: saved.tenant.id },
      });
      const concurrent = await Promise.all([send(dto), send(dto)]);
      expect(concurrent.some((r) => r.status === 201)).toBe(true);
      expect(concurrent.every((r) => [201, 400, 409].includes(r.status))).toBe(
        true,
      );
      expect(
        await db.prisma.c9WorkReceipt.count({
          where: { tenantId: saved.tenant.id },
        }),
      ).toBe(before + 1);
      observations.concurrentStatuses = concurrent.map((r) => r.status);
      const foreign = await fx.tenant(
          'BI foreign empty',
          CalendarSource.INTERNAL,
        ),
        foreignUser = await fx.user(foreign, UserRole.TENANT_OWNER);
      for (const feature of [
        'ai.owner',
        'analytics.business',
        'widgets.runtime',
      ] as const)
        await fx.grantFeature(foreign, feature);
      const foreignToken = await http.login(
        foreign.slug,
        foreignUser.email,
        foreignUser.password,
      );
      const denied = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + saved.first!.coordination.run_id)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(denied.status).toBe(400);
      expect(JSON.stringify(denied.body)).toContain('c9_run_authority');
      const empty = await send(
        { ...dto, requestId: randomUUID() },
        foreignToken,
      );
      expect(empty.status).toBe(201);
      expect((empty.body as ChatBody).analysis.outcome).toBe('UNAVAILABLE');
      const branch = await db.prisma.branch.create({
        data: { tenantId: saved.tenant.id, name: 'Synthetic branch' },
      });
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { tenantId: saved.tenant.id, userId: saved.user.id },
        },
        data: { branchId: branch.id },
      });
      const branchDenied = await send({ ...dto, requestId: randomUUID() });
      expect([400, 403]).toContain(branchDenied.status);
      expect(JSON.stringify(branchDenied.body)).toContain(
        'source_reader_authority',
      );
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { tenantId: saved.tenant.id, userId: saved.user.id },
        },
        data: { branchId: null },
      });
      observations.branchDeniedStatus = branchDenied.status;
      await db.prisma.tenantEntitlement.update({
        where: {
          tenantId_featureKey: {
            tenantId: saved.tenant.id,
            featureKey: 'analytics.business',
          },
        },
        data: { enabled: false },
      });
      const revoked = await send({ ...dto, requestId: randomUUID() });
      expect(revoked.status).toBe(403);
      observations.foreignRunStatus = denied.status;
      observations.emptyOutcome = 'UNAVAILABLE';
      observations.revokedFinanceStatus = revoked.status;
      await unchanged();
    }
    observations.checkpoints = checkpoints;
    observations.c7ResultCount = stage === 'prepare' ? 1 : 2;
    observations.actionCountBefore = 0;
    observations.actionCountAfter = 0;
    observations.strategyRevisions = 0;
  }, 210000);
});
