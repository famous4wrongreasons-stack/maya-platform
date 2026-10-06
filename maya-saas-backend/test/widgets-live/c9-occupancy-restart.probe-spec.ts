import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import type { CRMAdapter } from '../../src/crm/crm-adapter.interface';
import { OpportunityLifecycleRunner } from '../../src/crm/opportunity-lifecycle.runner';
import { DOMAIN_EVENT_TYPE } from '../../src/domain';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { decodeChatReply } from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { occupancyFixtureEdge } from './support/c9-occupancy-fixture-edge';

// Mandatory two-process proof, never an in-memory "restart" fallback. The driver
// creates its own cluster/database, runs prepare, restarts PG, then runs resume.
const stage = process.env.JEST_C9_OCCUPANCY_STAGE;
const receiptPath = process.env.JEST_C9_OCCUPANCY_RECEIPT;
const reportPath = process.env.JEST_C9_OCCUPANCY_REPORT;
if (!['prepare', 'resume'].includes(stage ?? '') || !receiptPath || !reportPath)
  throw new Error(
    'Use scripts/c9-occupancy-proof.mjs: explicit stage, private receipt and report required',
  );
const database = assertProofDatabase(process.env);
if (!/^maya_widget_gate_proof_c9occ_[a-z0-9_]+$/.test(database.database))
  throw new Error('C9 occupancy requires its own c9occ proof database');
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type ChatBody = {
  request_id: string;
  reply: string;
  user_turn: { turnId: string; conversationId: string };
  coordination: {
    run_id: string;
    revision_id: string;
    revision: number;
    current: boolean;
    replayed: boolean;
    scope: string;
  };
  recommendation: {
    outcome: string;
    noSideEffects: boolean;
    executionAuthority: boolean;
    reasoning: string;
    options: Array<{ key: string; title: string }>;
    evidence: {
      workReceiptId: string;
      opportunityRefs: Array<{ sourceType: string; id: string }>;
      asOf: string;
      scheduleRef: string | null;
    };
  };
};
type CarrierObservation = {
  replies: string[];
  exchanges: Array<{ status: number; body: ChatBody }>;
  rendering: string;
  browserAcceptance: false;
};
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  branchId: string;
  appointmentId: string;
  opportunityId: string;
  taskId: string;
  start: string;
  end: string;
};
type Saved = {
  contract: 'maya.c9-occupancy-private-restart/1';
  database: string;
  port: string;
  pid: number;
  postgresStarted: string;
  salon: Salon;
  requestId: string;
  first: ChatBody;
  graph: string;
};

describe('explicit cancellation window [HTTP] [PostgreSQL] [two processes] [synthetic CRM adapter only, zero model]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  const reads: string[] = [],
    unexpectedEdges: string[] = [];
  const observations: Record<string, unknown> = {};
  const touchedTenants: string[] = [];
  let model: jest.SpyInstance;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    // The factory edge is replaced, not CrmService, the current-capacity reader,
    // C5, C9, auth/policy, TimelineStore or any business persistence owner.
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        expect(provider).toBe(CrmProvider.YCLIENTS);
        expect(config.apiToken).toBe(
          'c9-occupancy-synthetic-no-provider-credential',
        );
        const tenantId = config.settings?.syntheticTenantId;
        if (typeof tenantId !== 'string')
          throw new Error('Synthetic tenant binding missing');
        const adapter: Pick<
          CRMAdapter,
          'getStaffScheduleDay' | 'getAvailableSlots'
        > = {
          getStaffScheduleDay: ({ tenantId: requested, staffId, date }) => {
            expect(requested).toBe(tenantId);
            expect(staffId).toBe('c9-synthetic-staff');
            reads.push('schedule:' + tenantId);
            return Promise.resolve({
              staff_id: staffId,
              date,
              is_working: true,
              slots: [{ from: '12:00', to: '13:00' }],
              revision: 'synthetic-schedule-v1',
            });
          },
          getAvailableSlots: async ({
            tenantId: requested,
            staffId,
            date,
            branchId,
            serviceIds,
          }) => {
            expect(requested).toBe(tenantId);
            expect(staffId).toBe('c9-synthetic-staff');
            expect(serviceIds).toEqual(['c9-synthetic-service']);
            reads.push('availability:' + tenantId);
            const appointment = await db.prisma.appointment.findFirstOrThrow({
              where: { tenantId, status: 'canceled' },
            });
            expect(branchId).toBe(appointment.branchId);
            expect(date).toBe(appointment.startAt.toISOString().slice(0, 10));
            const filled = await db.prisma.appointment.count({
              where: {
                tenantId,
                staffExternalId: staffId,
                status: 'confirmed',
                blockedStartAt: { lt: appointment.blockedEndAt },
                blockedEndAt: { gt: appointment.blockedStartAt },
              },
            });
            return filled
              ? []
              : [
                  {
                    staff_id: staffId!,
                    branch_id: appointment.branchId,
                    start: appointment.blockedStartAt.toISOString(),
                    end: appointment.blockedEndAt.toISOString(),
                  },
                ];
          },
        };
        return occupancyFixtureEdge(adapter as CRMAdapter, (key) =>
          unexpectedEdges.push(key),
        );
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      unexpectedEdges.push('fetch');
      throw new Error('External I/O forbidden in explicit occupancy proof');
    });
    model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        unexpectedEdges.push('model');
        throw new Error('Exact explicit request must not call a model');
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    // Retain synthetic rows for readback, as C9 has independent RESTRICT/retention
    // ownership. The driver stops only its cluster; it never truncates another DB.
    if (stage === 'resume')
      for (const tenantId of touchedTenants)
        await db.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'cancelled' },
        });
    await http?.close();
    await db?.close();
  });
  async function postgresStarted() {
    const rows = await db.prisma.$queryRaw<
      Array<{ started: string }>
    >`SELECT pg_postmaster_start_time()::text AS started`;
    return rows[0].started;
  }
  async function makeSalon(expired = false): Promise<Salon> {
    const tenant = await fx.tenant(
      'C9 occupancy synthetic',
      CalendarSource.EXTERNAL,
    );
    touchedTenants.push(tenant.id);
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + (expired ? -2 : 2));
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    const asOf = expired ? new Date(start.getTime() - 3_600_000) : new Date();
    // Historical source fixtures let real PostgreSQL clock observe expiry. No
    // Date/DB clock, expiry column, immutable C9 row or production owner is mocked.
    const watchStartedAt = new Date(asOf.getTime() - 120_000);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        encryptedApiToken: db.encryption.encrypt(
          'c9-occupancy-synthetic-no-provider-credential',
        ),
        watchStartedAt,
        settingsJson: { syntheticTenantId: tenant.id },
      },
    });
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        staffExternalId: 'c9-synthetic-staff',
        serviceIds: ['c9-synthetic-service'],
        status: 'canceled',
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        source: 'external',
        crmProvider: CrmProvider.YCLIENTS,
        crmExternalId: randomUUID(),
      },
    });
    await db.prisma.domainEvent.create({
      data: {
        tenantId: tenant.id,
        type: DOMAIN_EVENT_TYPE.appointmentRemoved,
        entityType: 'appointment',
        entityId: appointment.id,
        occurredAt: new Date(asOf.getTime() - 60_000),
        receivedAt: asOf,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        observation: 'after_watch_started',
        dedupFingerprint: digest([tenant.id, appointment.id]),
        payload: {},
      },
    });
    const config = http.app.get(ConfigService);
    config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'true');
    config.set(
      'OPPORTUNITY_LIFECYCLE_CUTOVER_AT',
      watchStartedAt.toISOString(),
    );
    try {
      const result = await http.app
        .get(TenantContextService)
        .runAsSystemTenant(tenant.id, () =>
          http.app
            .get(OpportunityLifecycleRunner)
            .run({ tenantId: tenant.id, asOf, sourceCompleteness: 'complete' }),
        );
      expect(result).toMatchObject({
        status: 'ran',
        detectedNow: 1,
        actionIntentsExecuted: 0,
        externalSideEffects: 0,
      });
    } finally {
      config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'false');
    }
    const opportunity = await db.prisma.opportunity.findFirstOrThrow({
      where: { tenantId: tenant.id },
      include: { agentTasks: true },
    });
    expect(opportunity.agentTasks).toHaveLength(1);
    expect(opportunity.agentTasks[0]).toMatchObject({
      status: 'current',
      autonomyLevel: 'L2_5_SHADOW',
    });
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    return {
      tenant,
      owner,
      branchId: branch.id,
      appointmentId: appointment.id,
      opportunityId: opportunity.id,
      taskId: opportunity.agentTasks[0].id,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }
  function login(salon: Salon) {
    return http.login(
      salon.tenant.slug,
      salon.owner.email,
      salon.owner.password,
    );
  }
  async function businessState(tenantId: string) {
    const where = { tenantId };
    const state = await Promise.all([
      db.prisma.appointment.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.opportunity.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.agentTask.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.domainEvent.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.actionExecution.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.inboxItem.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.marketingCampaign.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.marketingCampaignRecipient.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      db.prisma.marketingDeliveryAttempt.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      db.prisma.teamMessage.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.operationalAlertRun.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.expenseReminderRun.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
    for (const effects of state.slice(4)) expect(effects).toHaveLength(0);
    return digest(state);
  }
  async function graph(tenantId: string, runId: string) {
    const revisions = await db.prisma.c9StrategyRevision.findMany({
      where: { tenantId, runId },
      orderBy: { revision: 'asc' },
      include: { c9PlanSteps: { orderBy: { id: 'asc' } } },
    });
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId, runId },
      orderBy: { id: 'asc' },
    });
    expect(revisions).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].state).toBe('SETTLED');
    return digest({ revisions, receipts });
  }
  async function carrier(
    accessToken: string,
    requestId: string,
    mode = 'chat',
  ) {
    const baseUrl = await http.listenLoopback();
    return new Promise<CarrierObservation>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('../maya-carrier-react/test/occupancy-probe.mjs')],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stdout = '',
        stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Owned carrier probe timed out'));
      }, 25_000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0)
          return reject(new Error(`Current carrier probe failed: ${stderr}`));
        try {
          resolve(JSON.parse(stdout) as CarrierObservation);
        } catch (error) {
          reject(error as Error);
        }
      });
      child.stdin.end(
        JSON.stringify({ baseUrl, accessToken, requestId, mode }),
      );
    });
  }
  async function checkedChat(
    salon: Salon,
    accessToken: string,
    requestId = randomUUID(),
  ) {
    const before = await businessState(salon.tenant.id),
      mark = http.recorder.mark();
    const observed = await carrier(accessToken, requestId);
    expect(await businessState(salon.tenant.id)).toBe(before);
    const businessWrites = http.recorder
      .since(mark)
      .filter(
        (op) =>
          op.write &&
          (op.model
            ? /^(Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/.test(
                op.model,
              )
            : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/i.test(
                op.sql ?? '',
              )),
      );
    expect(businessWrites).toEqual([]);
    expect(unexpectedEdges).toEqual([]);
    expect(model).not.toHaveBeenCalled();
    const body = observed.exchanges[0].body;
    expect(body.coordination).toMatchObject({
      scope: 'explicit_occupancy',
      revision: 1,
    });
    expect(body.recommendation).toMatchObject({
      noSideEffects: true,
      executionAuthority: false,
      reasoning: 'deterministic',
    });
    expect(body.reply).toContain('Предложение сохранено, версия 1');
    expect(observed.replies).toEqual([body.reply]);
    observations[`${requestId}:${Object.keys(observations).length}`] = observed;
    return body;
  }
  it('persists one request/proposal/evidence graph, resumes without reread, isolates and refuses revoked authority', async () => {
    if (stage === 'prepare') {
      const salon = await makeSalon(),
        accessToken = await login(salon),
        requestId = randomUUID();
      reads.length = 0;
      const first = await checkedChat(salon, accessToken, requestId);
      expect(first.recommendation.outcome).toBe('AVAILABLE');
      expect(first.reply).toContain('12:00');
      expect(first.reply).toContain('13:00');
      expect(first.reply).toContain('Europe/Moscow');
      expect(first.coordination).toMatchObject({
        current: true,
        replayed: false,
      });
      expect(
        first.recommendation.evidence.opportunityRefs.map(
          (ref) => ref.sourceType,
        ),
      ).toEqual(['Opportunity', 'AgentTask']);
      expect(
        first.recommendation.evidence.opportunityRefs.map((ref) => ref.id),
      ).toEqual([salon.opportunityId, salon.taskId]);
      const root = await db.prisma.c9Run.findUniqueOrThrow({
        where: { id: first.coordination.run_id },
      });
      expect(root).toMatchObject({
        tenantId: salon.tenant.id,
        principalJson: { userId: salon.owner.id },
        currentRevision: 1,
      });
      const work = await db.prisma.c9WorkReceipt.findUniqueOrThrow({
        where: { id: first.recommendation.evidence.workReceiptId },
      });
      expect(work).toMatchObject({
        tenantId: salon.tenant.id,
        runId: root.id,
        state: 'SETTLED',
      });
      expect(reads.sort()).toEqual([
        'availability:' + salon.tenant.id,
        'schedule:' + salon.tenant.id,
      ]);
      const persisted = await graph(salon.tenant.id, first.coordination.run_id);
      reads.length = 0;
      const repeat = await checkedChat(salon, accessToken, requestId);
      expect(repeat.coordination).toEqual({
        ...first.coordination,
        current: false,
        replayed: true,
      });
      expect(repeat.reply).toContain(
        'сохранённый результат предыдущей проверки',
      );
      expect(await graph(salon.tenant.id, first.coordination.run_id)).toBe(
        persisted,
      );
      expect(reads).toEqual([]);
      saved = {
        contract: 'maya.c9-occupancy-private-restart/1',
        database: database.database,
        port: database.port,
        pid: process.pid,
        postgresStarted: await postgresStarted(),
        salon,
        requestId,
        first,
        graph: persisted,
      };
      // Synthetic login password only; no bearer/session token. Never publish this file.
      writeFileSync(receiptPath, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
    } else {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved.contract).toBe('maya.c9-occupancy-private-restart/1');
      expect([saved.database, saved.port]).toEqual([
        database.database,
        database.port,
      ]);
      expect(process.pid).not.toBe(saved.pid);
      expect(await postgresStarted()).not.toBe(saved.postgresStarted);
      touchedTenants.push(saved.salon.tenant.id);
      const salon = saved.salon,
        accessToken = await login(salon);
      expect(
        await graph(salon.tenant.id, saved.first.coordination.run_id),
      ).toBe(saved.graph);
      const replay = await checkedChat(salon, accessToken, saved.requestId);
      expect(replay.coordination).toEqual({
        ...saved.first.coordination,
        current: false,
        replayed: true,
      });
      expect(replay.recommendation.evidence).toEqual(
        saved.first.recommendation.evidence,
      );
      expect(replay.reply).toContain(
        'сохранённый результат предыдущей проверки',
      );
      expect(await graph(salon.tenant.id, replay.coordination.run_id)).toBe(
        saved.graph,
      );
      expect(reads).toEqual([]);
      const history = await carrier(accessToken, randomUUID(), 'history');
      // The current carrier restores only the latest completion per user turn.
      // Older immutable replies remain in the encrypted audit history.
      expect(history.replies).toEqual([replay.reply]);
      const auditReplies = await db.prisma.widgetTimelineTurn.findMany({
        where: {
          tenantId: salon.tenant.id,
          conversationId: saved.first.user_turn.conversationId,
          role: 'assistant',
        },
        orderBy: { turnIndex: 'asc' },
      });
      expect(
        auditReplies.map((turn) =>
          decodeChatReply(db.encryption, turn.textContent!),
        ),
      ).toEqual([saved.first.reply, replay.reply]);
      observations.persistedHistory = history;
      // Simulate later provider state, not a booking action by MAYA. Only this
      // fixture client inserts the occupied interval; the next HTTP request reads it.
      await db.prisma.appointment.create({
        data: {
          tenantId: salon.tenant.id,
          branchId: salon.branchId,
          staffExternalId: 'c9-synthetic-staff',
          serviceIds: ['c9-synthetic-service'],
          status: 'confirmed',
          startAt: salon.start,
          endAt: salon.end,
          blockedStartAt: salon.start,
          blockedEndAt: salon.end,
          source: 'external',
          crmProvider: CrmProvider.YCLIENTS,
          crmExternalId: randomUUID(),
        },
      });
      const occupied = await checkedChat(salon, accessToken);
      expect(occupied.recommendation.outcome).toBe('OCCUPIED');
      expect(occupied.coordination.run_id).not.toBe(replay.coordination.run_id);
      expect(
        occupied.recommendation.options.map((option) => option.key),
      ).toEqual(['c9.no_action']);
      expect(reads).toHaveLength(2);
      const expired = await makeSalon(true),
        expiredToken = await login(expired);
      reads.length = 0;
      expect(
        (await checkedChat(expired, expiredToken)).recommendation.outcome,
      ).toBe('EXPIRED');
      expect(reads).toEqual([]);
      const foreign = await request(http.app.getHttpServer())
        .get(`/api/orchestration/runs/${replay.coordination.run_id}`)
        .set('authorization', `Bearer ${expiredToken}`);
      expect(foreign.status).toBe(400);
      expect(foreign.body).toMatchObject({ message: 'c9_run_authority' });
      expect(JSON.stringify(foreign.body)).not.toContain(salon.appointmentId);
      const runsBefore = await db.prisma.c9Run.count({
        where: { tenantId: salon.tenant.id },
      });
      await db.prisma.membership.updateMany({
        where: { tenantId: salon.tenant.id, userId: salon.owner.id },
        data: { status: 'suspended' },
      });
      const revoked = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          surface: 'web',
          requestId: saved.requestId,
          messages: [{ role: 'user', content: 'Проверь окна после отмен' }],
        });
      expect([401, 403]).toContain(revoked.status);
      const revokedRun = await request(http.app.getHttpServer())
        .get(`/api/orchestration/runs/${replay.coordination.run_id}`)
        .set('authorization', `Bearer ${accessToken}`);
      expect([401, 403]).toContain(revokedRun.status);
      expect(
        await db.prisma.c9Run.count({ where: { tenantId: salon.tenant.id } }),
      ).toBe(runsBefore);
      expect(reads).toEqual([]);
      observations.refusals = {
        foreignTenant: foreign.status,
        revokedChat: revoked.status,
        revokedRun: revokedRun.status,
      };
      expect(unexpectedEdges).toEqual([]);
    }
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          contract: 'maya.explicit-occupancy-http-pg-proof/1',
          stage,
          pid: process.pid,
          postgresStarted: await postgresStarted(),
          database: database.database,
          syntheticCrmAdapter: true,
          externalProviderAcceptance: false,
          modelCalls: model.mock.calls.length,
          browserAcceptance: false,
          observations,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  });
});
