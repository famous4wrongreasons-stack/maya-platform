import { randomUUID } from 'node:crypto';
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
      .mockImplementation(async (input) =>
        input.toolResults.length
          ? null
          : {
              reply: 'Проверяю.',
              toolCall: { name: tool, arguments: args },
              provider: 'openai',
              model: 'scripted-owner-path-proof',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            },
      );
  }

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
      expect(response.body.coordination).toMatchObject({
        state: 'COMPLETED',
        scope: 'deterministic_reads',
      });
      const result = await source.mock.results[0].value;
      expect(result).toHaveProperty(
        'measurement.contract',
        'c7.measurement.read/1',
      );
      expect(response.body.reply).toBeTruthy();
      if (text === 'Как сегодня дела?')
        expect(response.body.reply).toContain('за сегодня');
      if (text === 'Почему просела выручка?') {
        expect(response.body.reply).toContain(
          'Причина изменения выручки не установлена',
        );
        expect(response.body.reply).toContain('не измерено');
      }
      if (text === 'Что мне сейчас сделать?') {
        expect(response.body.reply).not.toMatch(/^Записанное рабочее время:/);
        expect(response.body.reply).toContain('Уточните цель');
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
    expect(computed.body).toMatchObject({
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
    expect(response.body.reply).toContain('c8.dormancy/barber_cadence');
    expect(response.body.reply).toContain('PARTIAL');
    expect(response.body.reply).not.toContain(client.id);
    expect(response.body.coordination).toMatchObject({
      state: 'COMPLETED',
      scope: 'deterministic_reads',
    });
    const replay = await f.chat('Кто давно не приходил?', requestId);
    expect(replay.body.coordination).toEqual(response.body.coordination);
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { runId: response.body.coordination.run_id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      taskKey: 'clients.dormant.list',
      state: 'SETTLED',
    });
    const denied = await request(http.app.getHttpServer())
      .get('/api/analytics/valuations/' + computed.body.id)
      .set('Authorization', `Bearer ${foreign.token}`);
    expect(denied.status).toBe(404);
    const empty = await foreign.chat('Кто давно не приходил?');
    expect(empty.body.reply).toContain('недоступны');
    await db.prisma.appointment.updateMany({
      where: { tenantId: f.tenant.id },
      data: { attendance: 'no_show' },
    });
    const stale = await f.chat('Кто давно не приходил?');
    expect(stale.body.reply).toContain('недоступны');
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
});
