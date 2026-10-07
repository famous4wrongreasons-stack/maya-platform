import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../../src/package5-wave1/package5-wave1.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

/** Typed test projection; assertions below verify the endpoint values. */
function payload(response: { body: unknown }) {
  return response.body as {
    id: string;
    reply: string;
    error: { code: string };
    coordination: { run_id: string; state: string; scope: string };
  };
}

/** Real HTTP/auth/C9/C7/C8/AE/PostgreSQL. Scripted model selection; synthetic source facts only. */
describe('Owner read paths [HTTP] [PostgreSQL] [synthetic model and facts]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const tenants: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const id of tenants.splice(0))
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  async function salon() {
    const tenant = await fx.tenant(
      'Owner reads synthetic',
      CalendarSource.INTERNAL,
    );
    tenants.push(tenant.id);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const key of [
      'ai.owner',
      'widgets.runtime',
      'analytics.business',
      'customers.core',
    ] as const)
      await fx.grantFeature(tenant, key);
    const token = await http.login(tenant.slug, user.email, user.password);
    const chat = (text: string, requestId = randomUUID()) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          audience: 'owner',
          requestId,
          messages: [{ role: 'user', content: text }],
        });
    return { tenant, user, token, chat };
  }
  function select(tool: string, args: Record<string, unknown> = {}) {
    return jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) =>
        Promise.resolve(
          input.toolResults.length
            ? null
            : {
                reply: 'Проверяю.',
                toolCall: { name: tool, arguments: args },
                provider: 'openai',
                model: 'scripted-owner-path-proof',
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              },
        ),
      );
  }

  it('keeps a multi-turn owner booking request out of analytics and never invents Client authority', async () => {
    const f = await salon();
    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) =>
        Promise.resolve({
          reply: 'Для личной записи нужен подтверждённый клиентский доступ.',
          toolCall: null,
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              parent_request: 'Личная запись на стрижку',
              tasks: [
                {
                  intent: 'booking.create_own',
                  confidence: 0.98,
                  entities: {
                    service: 'стрижка',
                    date: 'today',
                    time: '16:30',
                  },
                },
              ],
            },
            input.principalRole!,
            input.tools.map((tool) => tool.name),
          ),
          provider: 'openai',
          model: 'scripted-owner-context-boundary',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      );
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const text of [
      'Я хочу записаться как клиент',
      'На сегодня на 16:30',
      'Нет, лучше завтра вечером',
    ]) {
      messages.push({ role: 'user', content: text });
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ surface: 'native', requestId: randomUUID(), messages });
      expect(response.status).toBe(201);
      expect(payload(response).reply).toContain(
        'подтверждённый клиентский доступ',
      );
      messages.push({ role: 'assistant', content: payload(response).reply });
    }
    expect(model).toHaveBeenCalledTimes(3);
    expect(
      model.mock.calls[2][0].messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content),
    ).toEqual([
      'Я хочу записаться как клиент',
      'На сегодня на 16:30',
      'Нет, лучше завтра вечером',
    ]);
    expect(source).not.toHaveBeenCalled();
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });

  it('reports planner unavailability without an unrelated CRM report or invented CRM outage', async () => {
    const f = await salon();
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockRejectedValue(
      new ServiceUnavailableException({
        error: { code: 'ai_model_unavailable' },
      }),
    );
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const response = await f.chat('На сегодня на 16:30');
    expect(response.status).toBe(503);
    expect(payload(response).error.code).toBe('ai_model_unavailable');
    expect(source).not.toHaveBeenCalled();
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });

  it.each([
    ['Как сегодня дела?', 'today', 'none'],
    ['Почему просела выручка?', 'month_to_date', 'previous_period'],
    ['Что мне сейчас сделать?', 'today', 'none'],
  ])(
    'qualifies existing analytics owner through HTTP: %s',
    async (text, period, comparison) => {
      const f = await salon();
      select('analytics.business.query', { period, comparison });
      const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
      const response = await f.chat(text);
      expect(response.status).toBe(201);
      expect(source).toHaveBeenCalled();
      expect(payload(response).coordination).toMatchObject({
        state: 'COMPLETED',
        scope: 'deterministic_reads',
      });
      const result: unknown = await source.mock.results[0].value;
      expect(result).toHaveProperty(
        'measurement.contract',
        'c7.measurement.read/1',
      );
      expect(payload(response).reply).toBeTruthy();
      if (text === 'Как сегодня дела?')
        expect(payload(response).reply).toContain('за сегодня');
      if (text === 'Почему просела выручка?') {
        expect(payload(response).reply).toContain(
          'Причина изменения выручки не установлена',
        );
        expect(payload(response).reply).toContain('не измерено');
      }
      if (text === 'Что мне сейчас сделать?') {
        expect(payload(response).reply).not.toMatch(
          /^Записанное рабочее время:/,
        );
        expect(payload(response).reply).toContain('Уточните цель');
      }
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
    },
  );

  it('reads a real C8 result through chat, preserves replay and denies foreign/revoked access', async () => {
    const f = await salon(),
      foreign = await salon();
    // Existing chapter8-wave4 proof policy, solely a synthetic fixture, never a product default.
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
      .runAsSystemTenant(f.tenant.id, async () =>
        http.app.get(Package5Wave1ExecutableService).execute(
          await http.app
            .get(Package5Wave1ShadowService)
            .buildGoverned(
              f.tenant.id,
              f.user.id,
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
      data: { tenantId: f.tenant.id },
    });
    const start = new Date(Date.now() - 40 * 86400000),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
      data: {
        tenantId: f.tenant.id,
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
      .set('Authorization', `Bearer ${f.token}`)
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
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    select('clients.dormant.list');
    const before = await db.prisma.actionExecution.count({
      where: { tenantId: f.tenant.id },
    });
    const requestId = randomUUID();
    const response = await f.chat('Кто давно не приходил?', requestId);
    expect(response.status).toBe(201);
    expect(payload(response).reply).toContain('c8.dormancy/barber_cadence');
    expect(payload(response).reply).toContain('PARTIAL');
    expect(payload(response).reply).not.toContain(client.id);
    expect(payload(response).coordination).toMatchObject({
      state: 'COMPLETED',
      scope: 'deterministic_reads',
    });
    const replay = await f.chat('Кто давно не приходил?', requestId);
    expect(payload(replay).coordination).toEqual(
      payload(response).coordination,
    );
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { runId: payload(response).coordination.run_id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      taskKey: 'clients.dormant.list',
      state: 'SETTLED',
    });
    const denied = await request(http.app.getHttpServer())
      .get('/api/analytics/valuations/' + payload(computed).id)
      .set('Authorization', `Bearer ${foreign.token}`);
    expect(denied.status).toBe(404);
    const empty = await foreign.chat('Кто давно не приходил?');
    expect(payload(empty).reply).toContain('недоступны');
    await db.prisma.appointment.updateMany({
      where: { tenantId: f.tenant.id },
      data: { attendance: 'no_show' },
    });
    const stale = await f.chat('Кто давно не приходил?');
    expect(payload(stale).reply).toContain('недоступны');
    expect(
      await db.prisma.c8ResultRevision.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(1);
    await db.prisma.membership.update({
      where: { userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id } },
      data: { status: 'suspended' },
    });
    expect((await f.chat('Кто давно не приходил?')).status).toBe(401);
  });

  it('explicit Lifecycle uses actual C8 revisions, saves one bounded proposal and rechecks after app restart', async () => {
    const f = await salon(),
      foreign = await salon();
    // Existing chapter8-wave4 proof policy, solely a synthetic fixture, never a product default.
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
      .runAsSystemTenant(f.tenant.id, async () =>
        http.app.get(Package5Wave1ExecutableService).execute(
          await http.app
            .get(Package5Wave1ShadowService)
            .buildGoverned(
              f.tenant.id,
              f.user.id,
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
      data: { tenantId: f.tenant.id },
    });
    const start = new Date(Date.now() - 40 * 86400000),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
      data: {
        tenantId: f.tenant.id,
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
      .set('Authorization', `Bearer ${f.token}`)
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

    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        throw new Error('No model is admitted for the explicit Lifecycle READ');
      });
    const before = await db.prisma.actionExecution.count({
      where: { tenantId: f.tenant.id },
    });
    const requestId = randomUUID();
    const read = async (token: string, id = requestId) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          audience: 'owner',
          requestId: id,
          messages: [{ role: 'user', content: 'Кого пора вернуть?' }],
        });
    const initial = await read(f.token);
    expect(initial.status).toBe(201);
    const response = initial.body as {
      reply: string;
      coordination: {
        run_id: string;
        revision_id: string;
        revision: number;
        replayed: boolean;
      };
      recommendation: {
        outcome: string;
        agent: {
          agent_id: string;
          findings: unknown[];
          completeness: { totalCount: number | null };
        };
        canContact: boolean;
      };
    };
    expect(response.reply).toContain('По оценке на');
    expect(response.reply).toContain('c8.dormancy/barber_cadence');
    expect(response.recommendation).toMatchObject({
      outcome: 'PARTIAL',
      canContact: false,
      agent: {
        agent_id: 'CLIENT_LIFECYCLE',
        completeness: { totalCount: null },
      },
    });
    expect(JSON.stringify(response)).not.toContain(client.id);
    const revision = await db.prisma.c9StrategyRevision.findUniqueOrThrow({
      where: { id: response.coordination.revision_id },
    });
    const ref = (
      revision.evidenceRefsJson as unknown as {
        id: string;
        retentionUntil: string;
      }[]
    )[0];
    expect(ref.id).toBe(payload(computed).id);
    expect(revision.retentionUntil.toISOString()).toBe(ref.retentionUntil);
    const originalHash = revision.snapshotHash;
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { runId: response.coordination.run_id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].state).toBe('SETTLED');
    expect(JSON.stringify(receipts[0].resultJson)).not.toContain(client.id);
    expect(model).not.toHaveBeenCalled();
    const foreignRead = await request(http.app.getHttpServer())
      .get('/api/orchestration/runs/' + response.coordination.run_id)
      .set('Authorization', `Bearer ${foreign.token}`);
    expect(foreignRead.status).toBeGreaterThanOrEqual(400);
    const empty = await read(foreign.token, randomUUID());
    expect(empty.status).toBe(201);
    expect(payload(empty).reply).toContain('недоступны');
    jest.restoreAllMocks();
    await http.close();
    http = await bootHttp();
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        throw new Error('No model on replay');
      });
    const token = await http.login(
      f.tenant.slug,
      f.user.email,
      f.user.password,
    );
    const replay = await read(token);
    expect(replay.status).toBe(201);
    expect(payload(replay).coordination).toMatchObject({
      revision_id: revision.id,
      revision: 1,
      replayed: true,
      current: false,
    });
    await db.prisma.appointment.updateMany({
      where: { tenantId: f.tenant.id },
      data: { attendance: 'no_show' },
    });
    const stale = await read(token);
    expect(stale.status).toBe(201);
    expect((stale.body as typeof response).recommendation).toMatchObject({
      outcome: 'STALE',
      agent: { findings: [] },
    });
    expect(payload(stale).reply).not.toContain('условие c8.dormancy');
    expect(
      (
        await db.prisma.c9StrategyRevision.findUniqueOrThrow({
          where: { id: revision.id },
        })
      ).snapshotHash,
    ).toBe(originalHash);
    expect(
      await db.prisma.c9StrategyRevision.count({
        where: { runId: response.coordination.run_id },
      }),
    ).toBe(1);
    expect(
      await db.prisma.c8ResultRevision.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(1);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
    await db.prisma.tenantEntitlement.update({
      where: {
        tenantId_featureKey: {
          tenantId: f.tenant.id,
          featureKey: 'customers.core',
        },
      },
      data: { enabled: false },
    });
    const revoked = await read(token);
    expect(revoked.status).toBe(403);
    const output = process.env.JEST_LIFECYCLE_OUTPUT;
    if (output)
      writeFileSync(
        join(output, 'lifecycle-observations.json'),
        JSON.stringify(
          {
            contract: 'maya.explicit-lifecycle-proof/1',
            qualification: 'NOT_ISSUED',
            syntheticSourceFacts: true,
            modelCalls: 0,
            externalProviderAcceptance: false,
            appRestart: true,
            postgresRestart: false,
            initial: response,
            replay: replay.body as unknown,
            stale: stale.body as unknown,
            revokedStatus: revoked.status,
            foreignStatus: foreignRead.status,
            revisions: 1,
            c8Revisions: 1,
            originalRevisionHash: originalHash,
            immutableRevisionHashUnchanged: true,
            effectCountBefore: before,
            effectCountAfter: await db.prisma.actionExecution.count({
              where: { tenantId: f.tenant.id },
            }),
            workReceiptHasClientRefs: false,
            sourceExpiryCapsRevisionRetention: true,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
  });
});
