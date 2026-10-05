import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

/** Real A22 writes/reads, auth, C9, source runtime and DB; only model selection is scripted. */
describe('Staff business guidance [HTTP] [PostgreSQL] [scripted model]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const tenantIds: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    http.recorder.clear();
    // Preserve independent immutable A22/C9 evidence and actor FKs.
    for (const id of tenantIds.splice(0))
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  async function salon(label: string) {
    const tenant = await fx.tenant(label, CalendarSource.INTERNAL);
    tenantIds.push(tenant.id);
    for (const feature of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    async function member(role: UserRole) {
      const user = await fx.user(tenant, role);
      const token = await http.login(tenant.slug, user.email, user.password);
      return { user, token };
    }
    const owner = await member(UserRole.TENANT_OWNER);
    const staff = await member(UserRole.ADMINISTRATOR);
    const client = await member(UserRole.CLIENT);
    const get = (path: string, token = owner.token) =>
      request(http.app.getHttpServer())
        .get(`/api/${path}`)
        .set('Authorization', `Bearer ${token}`);
    const post = (
      path: string,
      body: Record<string, unknown>,
      token = owner.token,
      key = randomUUID(),
    ) =>
      request(http.app.getHttpServer())
        .post(`/api/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('idempotency-key', key)
        .send(body);
    async function configure(text: string) {
      const current = await get('governed-settings/tenant/business_rules');
      expect(current.status).toBe(200);
      const state = current.body as {
        revision: number;
        previousRevisionId: string | null;
      };
      const saved = await post('governed-settings/tenant', {
        confirmed: true,
        namespace: 'business_rules',
        expectedRevision: state.revision,
        previousRevisionId: state.previousRevisionId,
        content: { rules: [{ text }] },
      });
      if (saved.status !== 201) throw new Error(JSON.stringify(saved.body));
      return state.revision + 1;
    }
    const read = (token = staff.token, key = randomUUID(), args = {}) =>
      post(
        'ai/tools/business.rules.read/execute',
        { surface: 'web', arguments: args, idempotencyKey: key },
        token,
      );
    const chat = (key = randomUUID()) =>
      post(
        'ai/chat',
        {
          surface: 'web',
          requestId: key,
          messages: [
            { role: 'user', content: 'Покажи утверждённый регламент бизнеса.' },
          ],
        },
        staff.token,
      );
    return { tenant, owner, staff, client, get, post, read, chat, configure };
  }

  function selectRules() {
    return jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockResolvedValue({
        provider: 'openai',
        model: 'scripted-test-only',
        reply: 'Проверяю правила.',
        toolCall: { name: 'business.rules.read', arguments: {} },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
  }

  it('reads current A22 revisions through staff chat and C9 without sending rules to the model', async () => {
    const f = await salon('Staff rules');
    const model = selectRules();
    const empty = await f.chat();
    expect(empty.status).toBe(201);
    expect(empty.body).toMatchObject({
      reply:
        'Утверждённые правила бизнеса пока не настроены. Уточните нужное правило у владельца.',
    });
    expect(await f.configure('Встречать гостя спокойно.')).toBe(1);
    const key = randomUUID();
    const first = await f.chat(key);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      reply:
        'Внутренние правила бизнеса, редакция 1:\n\n• Встречать гостя спокойно.',
      coordination: { state: 'COMPLETED', scope: 'deterministic_reads' },
      tools_used: [
        expect.objectContaining({
          name: 'business.rules.read',
          status: 'completed',
        }),
      ],
    });
    const replay = await f.chat(key);
    expect(replay.body).toMatchObject(first.body as object);
    expect(await f.configure('Уточнять пожелания перед услугой.')).toBe(2);
    const updated = await f.chat();
    expect(updated.body).toMatchObject({
      reply:
        'Внутренние правила бизнеса, редакция 2:\n\n• Уточнять пожелания перед услугой.',
    });
    // Exactly one selection per request. Confirmed free-form guidance never
    // becomes model instructions or a general authorization policy.
    expect(model).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(model.mock.calls)).not.toContain(
      'Встречать гостя спокойно.',
    );
    expect(
      await db.prisma.tenantBusinessConfigurationRevision.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(2);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id, state: 'SUCCEEDED' },
      }),
    ).toBe(2);
  });

  it('keeps tenant rules separate and refuses client access or caller-supplied tenant scope', async () => {
    const a = await salon('Guidance one'),
      b = await salon('Guidance two');
    await a.configure('Встречать гостя спокойно.');
    const key = randomUUID();
    const one = await a.read(a.staff.token, key);
    const two = await b.read(b.staff.token, key);
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({
      result: {
        source: 'tenant_confirmed_business_rules',
        status: 'configured',
        revision: 1,
        audience: 'staff_only',
        rules: [
          {
            id: expect.stringMatching(/^rule_/) as unknown,
            text: 'Встречать гостя спокойно.',
          },
        ],
      },
    });
    expect(two.body).toMatchObject({
      result: { status: 'not_configured', revision: 0, rules: [] },
    });
    expect((await a.read(a.client.token)).status).toBe(403);
    expect(
      (await a.read(a.staff.token, randomUUID(), { tenantId: b.tenant.id }))
        .status,
    ).toBe(400);
    const tools = await a.get('ai/tools?surface=web', a.client.token);
    expect(JSON.stringify(tools.body)).not.toContain('business.rules.read');
    const model = selectRules();
    const clientView = await a.post(
      'ai/chat',
      {
        surface: 'web',
        audience: 'client',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Покажи внутренние правила.' }],
      },
      a.staff.token,
    );
    expect(clientView.status).toBe(503);
    expect(JSON.stringify(clientView.body)).not.toContain(
      'Встречать гостя спокойно.',
    );
    expect(
      model.mock.calls[0]?.[0].tools.some(
        (tool) => tool.name === 'business.rules.read',
      ),
    ).toBe(false);
    await db.prisma.membership.updateMany({
      where: { tenantId: a.tenant.id, userId: a.staff.user.id },
      data: { status: 'suspended' },
    });
    expect((await a.read(a.staff.token, key)).status).toBe(401);
  });
});
