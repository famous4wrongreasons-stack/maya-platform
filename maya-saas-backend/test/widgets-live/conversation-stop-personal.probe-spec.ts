// Narrow actual HTTP/PG regression. Finite scripted model and synthetic Client
// links; no upstream/model/provider acceptance and no business mutations.
import { createHash, randomUUID } from 'node:crypto';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { writeFileSync } from 'node:fs';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import type { AiCoreModelDecision } from '../../src/ai-tools/ai-core.types';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('STOP lineage and branchless personal read [HTTP] [PG] [SCRIPTED]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const tenants: string[] = [],
    evidence: unknown[] = [];
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
    if (process.env.JEST_STOP_PERSONAL_REPORT)
      writeFileSync(
        process.env.JEST_STOP_PERSONAL_REPORT,
        JSON.stringify(
          {
            qualification: 'SYNTHETIC_SCRIPTED_HTTP_ONLY',
            realModelAcceptance: false,
            evidence,
          },
          null,
          2,
        ) + '\n',
      );
  });
  function decision(
    changes: Partial<AiCoreModelDecision> = {},
  ): AiCoreModelDecision {
    return {
      reply: 'Уточните запрос.',
      toolCall: null,
      provider: 'openai',
      model: 'SCRIPTED_STOP_PERSONAL_REGRESSION',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      ...changes,
    };
  }
  async function salon(role: UserRole) {
    const tenant = await fx.tenant(
      'STOP personal regression',
      CalendarSource.INTERNAL,
    );
    tenants.push(tenant.id);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'booking',
      'booking.customer_app',
      'crm.integration',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        defaultTimezone: 'Asia/Novosibirsk',
        currentPeriodEnd: new Date('2099-01-01'),
      },
    });
    const user = await fx.user(tenant, role),
      token = await http.login(tenant.slug, user.email, user.password);
    const chat = (content: string, conversationId?: string, bearer = token) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${bearer}`)
        .send({
          surface: 'web',
          audience: 'client',
          requestId: randomUUID(),
          ...(conversationId ? { conversationId } : {}),
          messages: [{ role: 'user', content }],
        });
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error('External fetch forbidden in local regression'),
      );
    return { tenant, user, token, chat };
  }
  it('retains STOP across an old in-flight completion and a fresh authenticated next turn', async () => {
    const f = await salon(UserRole.CLIENT);
    const decide = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockResolvedValue(decision());
    const first = await f.chat('Привет');
    expect(first.status).toBe(201);
    const conversation = (
      first.body as { user_turn: { conversationId: string } }
    ).user_turn.conversationId;
    let enter!: () => void, release!: (value: AiCoreModelDecision) => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<AiCoreModelDecision>((resolve) => {
      release = resolve;
    });
    decide.mockImplementationOnce(() => {
      enter();
      return held;
    });
    const late = f
      .chat('Перенеси мою запись на пятницу в 20:00', conversation)
      .then((response) => response);
    await entered;
    const stop = await f.chat('Стоп, ничего не меняй', conversation);
    expect(stop.status).toBe(201);
    expect(stop.body).toMatchObject({ action: null, tools_used: [] });
    expect((stop.body as { reply: string }).reply).toContain(
      'Не продолжаю подготовку',
    );
    expect(decide).toHaveBeenCalledTimes(2);
    release(
      decision({
        semanticPlan: new ConversationIntelligenceService().validatePlan(
          {
            dialogue_act: 'request',
            tasks: [
              {
                intent: 'booking.reschedule_own',
                entities: { new_date: 'friday', new_time: '20:00' },
              },
            ],
          },
          UserRole.CLIENT,
          ['appointments.own.reschedule'],
        ),
      }),
    );
    const old = await late;
    expect(old.status).toBe(201);
    decide.mockClear();
    const token = await http.login(
      f.tenant.slug,
      f.user.email,
      f.user.password,
    );
    const next = await f.chat('Что дальше?', conversation, token);
    expect(next.status).toBe(201);
    expect(decide.mock.calls[0][0].conversationPlan).toBeNull();
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    evidence.push({
      case: 'late_completion_after_stop',
      stop: stop.body as unknown,
      late: old.body as unknown,
      next: next.body as unknown,
      restoredPlan: decide.mock.calls[0][0].conversationPlan,
      actionExecutions: 0,
    });
  });
  it.each([UserRole.CLIENT, UserRole.TENANT_OWNER])(
    'reads only own branchless appointments for %s, with explicit display timezone and revocation',
    async (role) => {
      const f = await salon(role),
        source = await fx.bookingSource(f.tenant, f.user, true);
      const own = await db.prisma.client.findFirstOrThrow({
        where: { tenantId: f.tenant.id, userId: f.user.id },
      });
      const foreign = await db.prisma.client.create({
        data: { tenantId: f.tenant.id },
      });
      const start = new Date(Date.now() + 2 * 86400000);
      start.setUTCHours(9, 0, 0, 0);
      for (const [index, client] of [own, foreign].entries()) {
        const at = new Date(start.getTime() + index * 3600000),
          end = new Date(at.getTime() + 1800000);
        await db.prisma.appointment.create({
          data: {
            tenantId: f.tenant.id,
            mayaClientId: client.id,
            source: 'internal',
            staffExternalId: source.staffId,
            serviceIds: [source.serviceId],
            status: 'confirmed',
            startAt: at,
            endAt: end,
            blockedStartAt: at,
            blockedEndAt: end,
          },
        });
      }
      const before = await db.prisma.appointment.findMany({
        where: { tenantId: f.tenant.id },
        orderBy: { id: 'asc' },
      });
      const decide = jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockResolvedValue(
          decision({
            reply: '',
            toolCall: { name: 'appointments.own.list', arguments: {} },
          }),
        );
      const response = await f.chat('Когда я записан?');
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        grounding: { status: 'verified' },
        action: null,
      });
      const reply = (response.body as { reply: string }).reply;
      expect(reply).toContain('Предстоящих: 1');
      expect(reply).toContain('16:00');
      expect(reply).not.toContain('17:00');
      expect(reply).toContain('Asia/Novosibirsk');
      expect(reply).toContain('филиал записи не указан');
      expect(decide).toHaveBeenCalledTimes(1);
      expect(decide.mock.calls[0][0].toolResults).toEqual([]);
      const emissionsBefore = await db.prisma.widgetEmission.count({
        where: { tenantId: f.tenant.id },
      });
      decide.mockResolvedValueOnce(
        decision({
          reply: '',
          toolCall: { name: 'appointments.own.list', arguments: {} },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                {
                  intent: 'booking.list_own',
                  entities: { period: 'next_week' },
                },
              ],
            },
            role,
            ['appointments.own.list'],
          ),
        }),
      );
      const scoped = await f.chat('А на следующей неделе?');
      expect(scoped.status).toBe(201);
      expect((scoped.body as { reply: string }).reply).toContain(
        'Следующая неделя',
      );
      expect(
        await db.prisma.widgetEmission.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(emissionsBefore);
      expect(decide).toHaveBeenCalledTimes(2);
      expect(decide.mock.calls[1][0].toolResults).toEqual([]);
      const link = await db.prisma.clientChannelLink.findFirstOrThrow({
        where: { tenantId: f.tenant.id, clientId: own.id, revokedAt: null },
      });
      const proof = randomUUID(),
        hash = (v: string) => createHash('sha256').update(v).digest('hex');
      const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
        verifyLink: () => Promise.reject(new Error('No new link authority')),
        verifyRevocation: (supplied) =>
          supplied === proof
            ? Promise.resolve({
                tenantId: f.tenant.id,
                provider: 'maya_user',
                providerSubjectHash: link.providerSubjectHash,
                linkId: link.id,
                revocationIdentityHash: hash(proof),
                actorProofHash: hash('synthetic'),
                reason: 'synthetic-stop-personal-regression',
                validUntil: new Date(Date.now() + 600000),
              })
            : Promise.reject(new Error('Unknown synthetic proof')),
      });
      await db.tenantContext.runAsSystemTenant(f.tenant.id, () =>
        owner.revoke({ proof }),
      );
      const revoked = await f.chat('Когда я записан?');
      expect(JSON.stringify(revoked.body)).not.toContain('16:00');
      expect(
        await db.prisma.appointment.findMany({
          where: { tenantId: f.tenant.id },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      evidence.push({
        case: 'personal_' + role,
        response: response.body as unknown,
        scopedResponse: scoped.body as unknown,
        scopedWidgetEmissionDelta: 0,
        revoked: { status: revoked.status, body: revoked.body as unknown },
        appointmentsUnchanged: true,
        actionExecutions: 0,
      });
    },
  );
});
