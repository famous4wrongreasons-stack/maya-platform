import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { WidgetConversationErasureJob } from '../../src/widgets/consent/erasure.job';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import type { AiTypedWidgetTriggerPort } from '../../src/ai-tools/ai-typed-widget-trigger.port';
type HistoryBody = Awaited<
  ReturnType<AiTypedWidgetTriggerPort['readCurrentConversation']>
>;
type ChatBody = {
  reply: string;
  user_turn: { turnId: string; conversationId: string };
};
const typedResponse = <T>(
  response: request.Response,
): { status: number; body: T } => ({
  status: response.status,
  body: response.body as T,
});

describe('Conversation text resume [HTTP] [PostgreSQL] [scripted model]', () => {
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

  function model(reply = 'Рада вас видеть.') {
    return jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockResolvedValue({
        provider: 'openai',
        model: 'scripted-history-proof',
        reply,
        toolCall: null,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
  }
  async function salon() {
    const tenant = await fx.tenant(
      'Conversation resume',
      CalendarSource.INTERNAL,
    );
    tenants.push(tenant.id);
    for (const feature of ['ai.owner', 'widgets.runtime'] as const)
      await fx.grantFeature(tenant, feature);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    const login = () => http.login(tenant.slug, user.email, user.password);
    const token = await login();
    const get = (bearer = token) =>
      request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${bearer}`)
        .then((response) => typedResponse<HistoryBody>(response));
    const chat = (key = randomUUID(), conversationId?: string) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId: key,
          ...(conversationId ? { conversationId } : {}),
          messages: [{ role: 'user', content: 'Привет!' }],
        })
        .then((response) => typedResponse<ChatBody>(response));
    return { tenant, user, token, login, get, chat };
  }

  it('restores completed text after fresh login; identical replay dedupes and changed reply appends a historical revision', async () => {
    const f = await salon(),
      decide = model();
    expect((await f.get()).body).toMatchObject({
      conversationId: null,
      turns: [],
    });
    const key = randomUUID();
    const first = await f.chat(key);
    expect(first.status).toBe(201);
    expect(first.body.reply).toBe('Рада вас видеть.');
    const restored = await f.get(await f.login());
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      contract: 'maya.conversation-history/1',
      conversationId: first.body.user_turn.conversationId,
      interrupted: false,
      turns: [
        { role: 'user', text: 'Привет!', completed: true },
        { role: 'assistant', text: 'Рада вас видеть.', completed: true },
      ],
    });
    const raw = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: f.tenant.id, role: 'assistant' },
    });
    expect(raw).toHaveLength(1);
    expect(raw[0].textContent).toMatch(/^maya.chat-reply\/1:/);
    expect(raw[0].textContent).not.toContain('Рада вас видеть.');
    expect((await f.chat(key)).status).toBe(201);
    decide.mockResolvedValueOnce({
      provider: 'openai',
      model: 'scripted-history-proof',
      reply: 'Другой ответ.',
      toolCall: null,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    expect((await f.chat(key)).body.reply).toBe('Другой ответ.');
    expect((await f.get()).body.turns).toHaveLength(2);
    expect((await f.get()).body.turns[1].text).toBe('Другой ответ.');
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'assistant' },
      }),
    ).toBe(2);
    expect(
      (await f.chat(randomUUID(), first.body.user_turn.conversationId)).status,
    ).toBe(201);
    expect((await f.get()).body.turns).toHaveLength(4);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });

  it('never returns another actor/tenant history, and rechecks current membership/role', async () => {
    const a = await salon(),
      b = await salon();
    model();
    await a.chat();
    expect((await b.get()).body.turns).toEqual([]);
    const other = await fx.user(a.tenant, UserRole.TENANT_OWNER);
    const otherToken = await http.login(
      a.tenant.slug,
      other.email,
      other.password,
    );
    expect((await a.get(otherToken)).body.turns).toEqual([]);
    await db.prisma.membership.updateMany({
      where: { tenantId: a.tenant.id, userId: a.user.id },
      data: { role: UserRole.MANAGER },
    });
    expect((await a.get()).body.turns).toEqual([]);
    await db.prisma.membership.updateMany({
      where: { tenantId: a.tenant.id, userId: a.user.id },
      data: { status: 'suspended' },
    });
    expect((await a.get()).status).toBe(401);
  });

  it('labels interrupted work, excludes expired content, and uses the existing atomic erasure owner', async () => {
    const f = await salon(),
      decide = model();
    decide.mockRejectedValueOnce(
      new Error('synthetic interruption before reply'),
    );
    expect((await f.chat()).status).toBe(500);
    expect((await f.get()).body).toMatchObject({
      interrupted: true,
      turns: [{ role: 'user', completed: false }],
    });
    await db.prisma.widgetTimelineTurn.updateMany({
      where: { tenantId: f.tenant.id },
      data: { retentionUntil: new Date(Date.now() - 1) },
    });
    expect((await f.get()).body.turns).toEqual([]);
    const fresh = await f.chat();
    expect(fresh.status).toBe(201);
    const parent = await db.prisma.widgetTimelineTurn.findUniqueOrThrow({
      where: { id: fresh.body.user_turn.turnId },
    });
    const before = await db.prisma.actionExecution.count({
      where: { tenantId: f.tenant.id },
    });
    const erased = await http.app.get(WidgetConversationErasureJob).run({
      tenantId: f.tenant.id,
      conversationId: parent.conversationId,
      erasureRequestRef: `local-history-proof:${randomUUID()}`,
      subjectPrincipalProofHash: parent.principalProofHash,
    });
    expect(erased.tombstonesWritten).toBeGreaterThanOrEqual(2);
    expect((await f.get()).body.turns).toEqual([]);
    const cleared = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: f.tenant.id, conversationId: parent.conversationId },
    });
    expect(
      cleared.every(
        (turn) => turn.textContent === null && turn.erasedAt !== null,
      ),
    ).toBe(true);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
  });
});
