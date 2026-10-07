import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  developmentIntegrationFixture,
  INTEGRATION_PROMPTS,
} from '../widgets-diagnostics/support/development-integration-fixture';

type ChatReply = {
  reply: string;
  action: unknown;
  user_turn: { conversationId: string };
  coordination: { run_id: string; revision_id: string };
  recommendation: {
    evidence: { workReceiptId: string; opportunityRefs: unknown[] };
  };
  resolution?: {
    receipt?: {
      envelope?: {
        kind: string;
        widget_id: string;
        body: { approve_intent: string };
        intents: Array<{ intent_ref: string; intent_token: string }>;
      };
    };
  };
};
// Prepared heavy fixture. Scripted model + synthetic CRM edge; never real-model
// acceptance, a profile certificate, or a substitute for the 165 release duties.
describe('combined owner conversation [HTTP] [PostgreSQL] [SCRIPTED SYNTHETIC]', () => {
  let f: Awaited<ReturnType<typeof developmentIntegrationFixture>>;
  beforeAll(async () => {
    f = await developmentIntegrationFixture(async (fixtures, tenant) => {
      for (const feature of [
        'ai.consultant',
        'ai.owner',
        'widgets.runtime',
        'booking',
        'booking.customer_app',
        'crm.integration',
      ] as const)
        await fixtures.grantFeature(tenant, feature);
    });
  });
  afterAll(async () => {
    await f?.close();
  });
  it('persists one conversation: general → C9 evidence → exact pricing approval → unavailable schedule editor', async () => {
    const salon = await f.salon(),
      foreign = await f.salon();
    const token = await f.login(salon),
      foreignToken = await f.login(foreign);
    await f.restrict(salon);
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let conversationId: string | undefined;
    async function turn(content: string, requestId = randomUUID()) {
      history.push({ role: 'user', content });
      const response = await request(f.http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          audience: 'owner',
          requestId,
          conversationId,
          messages: history,
        });
      if (response.status !== 201)
        throw new Error(
          JSON.stringify({
            status: response.status,
            body: response.body as unknown,
          }),
        );
      expect(response.status).toBe(201);
      const body = response.body as ChatReply;
      if (conversationId)
        expect(body.user_turn.conversationId).toBe(conversationId);
      conversationId = body.user_turn.conversationId;
      history.push({ role: 'assistant', content: body.reply });
      return body;
    }
    const general = await turn(INTEGRATION_PROMPTS.general);
    expect(general.action).toBeNull();
    const before = await f.businessState(salon),
      calls = f.modelCalls();
    const occupancyMark = f.http.recorder.mark();
    const untouched = await f.businessState(salon, false);
    const requestId = randomUUID();
    const occupancy = await turn(INTEGRATION_PROMPTS.occupancy, requestId);
    expect(occupancy.recommendation).toMatchObject({
      outcome: 'AVAILABLE',
      noSideEffects: true,
      executionAuthority: false,
      reasoning: 'deterministic',
    });
    expect(occupancy.coordination).toMatchObject({
      scope: 'explicit_occupancy',
      revision: 1,
    });
    expect(occupancy.recommendation.evidence.workReceiptId).toEqual(
      expect.any(String),
    );
    expect(
      occupancy.recommendation.evidence.opportunityRefs.length,
    ).toBeGreaterThan(0);
    expect(await f.businessState(salon)).toEqual(before);
    expect(f.modelCalls()).toBe(calls);
    expect(f.businessWrites(occupancyMark)).toEqual([]);
    const replay = await request(f.http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId,
        conversationId,
        messages: history.slice(0, -1),
      });
    expect(replay.status).toBe(201);
    expect((replay.body as ChatReply).coordination.run_id).toBe(
      occupancy.coordination.run_id,
    );
    expect((replay.body as ChatReply).coordination.revision_id).toBe(
      occupancy.coordination.revision_id,
    );
    const foreignRead = await request(f.http.app.getHttpServer())
      .get(`/api/orchestration/runs/${occupancy.coordination.run_id}`)
      .set('Authorization', `Bearer ${foreignToken}`);
    expect(foreignRead.status).toBe(400);
    expect(foreignRead.body).toMatchObject({ message: 'c9_run_authority' });
    expect(f.businessWrites(occupancyMark)).toEqual([]);
    const pricingMark = f.http.recorder.mark();
    const price = await turn(INTEGRATION_PROMPTS.price);
    const envelope = price.resolution?.receipt?.envelope;
    expect(envelope?.kind).toBe('APPROVAL');
    if (!envelope) throw new Error('Pricing approval envelope missing');
    expect(salon.state.priceWrites).toBe(0);
    const intent = envelope.intents.find(
      (row: { intent_ref: string }) =>
        row.intent_ref === envelope.body.approve_intent,
    );
    if (!intent) throw new Error('Pricing approve intent missing');
    const submission = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    };
    const unauthenticated = await f.http.postIntentUnauthenticated(submission);
    expect(unauthenticated.status).toBe(401);
    await f.http.postIntent(foreignToken, submission);
    expect(salon.state.priceWrites).toBe(0);
    await f.http.resolveWidgets(token, { thread_page: { limit: 20 } });
    const approved = await f.http.postIntent(token, submission);
    expect(approved.status).toBe(200);
    expect(salon.state.priceWrites).toBe(1);
    expect(salon.state.price).toBe(2500);
    await f.http.postIntent(token, {
      ...submission,
      client_nonce: randomUUID(),
    });
    expect(salon.state.priceWrites).toBe(1);
    const actions = await f.db.prisma.actionExecution.findMany({
      where: { tenantId: salon.tenant.id },
    });
    expect(
      actions.some(
        (row) =>
          row.capability === 'crm.service.fixed-price.update.v1' &&
          row.state === 'SUCCEEDED',
      ),
    ).toBe(true);
    expect(f.businessWrites(pricingMark, true)).toEqual([]);
    expect(await f.businessState(salon, false)).toEqual(untouched);
    expect(actions).toHaveLength(1);
    const scheduleMark = f.http.recorder.mark();
    const schedule = await turn(INTEGRATION_PROMPTS.schedule);
    expect(schedule.action).toBeNull();
    expect(schedule.resolution?.receipt).toBeUndefined();
    expect(schedule.reply).toContain(
      'Подтверждение изменения графика недоступно',
    );
    expect(salon.state.scheduleWrites).toBe(0);
    expect(f.businessWrites(scheduleMark)).toEqual([]);
    const page = await f.http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(JSON.stringify(page.body)).not.toContain('editor_handoff_intent');
    expect(JSON.stringify(page.body)).not.toContain(
      'Подтвердить изменение графика',
    );
    const restored = await request(f.http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('Authorization', `Bearer ${token}`);
    expect(restored.status).toBe(200);
    expect(JSON.stringify(restored.body)).toContain(
      'Предложение сохранено, версия 1',
    );
    expect(f.unexpected).toEqual([]);
    await f.db.prisma.membership.update({
      where: {
        userId_tenantId: { userId: salon.owner.id, tenantId: salon.tenant.id },
      },
      data: { status: 'suspended' },
    });
    const revoked = await request(f.http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        conversationId,
        messages: [{ role: 'user', content: INTEGRATION_PROMPTS.occupancy }],
      });
    expect([401, 403]).toContain(revoked.status);
    expect(f.businessWrites(scheduleMark)).toEqual([]);
    expect(await f.businessState(salon, false)).toEqual(untouched);
    expect(salon.state.priceWrites).toBe(1);
    expect(salon.state.scheduleWrites).toBe(0);
  });
});
