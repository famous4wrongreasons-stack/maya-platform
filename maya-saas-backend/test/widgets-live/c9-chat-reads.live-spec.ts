import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { C9WorkService } from '../../src/orchestration/c9.work';
import { C9Store } from '../../src/orchestration/c9.store';
import { C9Authority } from '../../src/orchestration/c9.authority';
import { c9PrincipalHash } from '../../src/orchestration/c9.identity';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import { canonicalUtcTransaction } from '../../src/prisma/canonical-utc-transaction';
import type { AiCoreModelInput } from '../../src/ai-tools/ai-core.types';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

type ChatBody = {
  reply: string;
  coordination: { run_id: string; scope: string; state: string };
  tools_used: Array<{ execution_id: string }>;
};

/** Real HTTP, auth, C9, source runtime and PostgreSQL. Only model wording is scripted. */
describe('C9 conversation reads [HTTP] [PostgreSQL] [scripted model]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fx.teardown();
    http.recorder.clear();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  async function fixture(label: string, price: number, role = UserRole.CLIENT) {
    const tenant = await fx.tenant(label, CalendarSource.INTERNAL);
    const user = await fx.user(tenant, role);
    for (const feature of [
      'ai.consultant',
      'booking',
      'widgets.runtime',
      'ai.owner',
      'ai.admin',
      'analytics.business',
      'booking.customer_app',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.internalService.create({
      data: { tenantId: tenant.id, name: label, price, durationMinutes: 30 },
    });
    const token = await http.login(tenant.slug, user.email, user.password);
    const chat = (
      id: string,
      text = 'Какие услуги и цены?',
      history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    ) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          audience: role === UserRole.CLIENT ? 'client' : 'owner',
          requestId: id,
          messages: [...history, { role: 'user', content: text }],
        })
        .then((response) => ({
          status: response.status,
          body: response.body as ChatBody,
        }));
    return { tenant, user, token, chat };
  }

  function model(price: number) {
    return jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input: AiCoreModelInput) =>
        Promise.resolve({
          reply: input.toolResults.length
            ? `Услуга стоит ${price} ₽.`
            : 'Проверяю прайс.',
          toolCall: input.toolResults.length
            ? null
            : { name: 'catalog.services.read', arguments: {} },
          provider: 'openai',
          model: 'scripted-test-only',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      );
  }

  async function revokeSyntheticPersonalLink(tenantId: string, linkId: string) {
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: linkId },
    });
    const token = randomUUID();
    // Test-only A18 verifier; the real immutable link owner performs revocation.
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () =>
        Promise.reject(new Error('Link creation not admitted here')),
      verifyRevocation: (provided) =>
        provided === token
          ? Promise.resolve({
              tenantId,
              provider: 'maya_user',
              providerSubjectHash: link.providerSubjectHash,
              linkId,
              revocationIdentityHash: 'c'.repeat(64),
              actorProofHash: 'd'.repeat(64),
              reason: 'synthetic-personal-read-revocation',
              validUntil: new Date(Date.now() + 600_000),
            })
          : Promise.reject(new Error('Unknown synthetic proof')),
    });
    await db.tenantContext.runAsSystemTenant(tenantId, () =>
      owner.revoke({ proof: token }),
    );
  }

  it('a personal chat read uses the verified Client and refuses replay after its link is revoked without changing the owner role', async () => {
    const f = await fixture(
      'Personal verified read',
      1500,
      UserRole.TENANT_OWNER,
    );
    const client = await fx.client(f.tenant, f.user);
    await db.prisma.client.update({
      where: { id: client.clientId },
      data: { userId: null },
    });
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockResolvedValue({
      reply: null,
      toolCall: { name: 'appointments.own.list', arguments: {} },
      provider: 'openai',
      model: 'SCRIPTED_SYNTHETIC_PERSONAL_READ',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const requestId = randomUUID();
    const text = 'Покажи мои личные записи как клиента';
    const first = await f.chat(requestId, text);
    expect(first.status).toBe(201);
    expect(first.body.reply).toBe('У вас пока нет записей.');
    expect((await f.chat(requestId, text)).body.reply).toBe(first.body.reply);
    expect(source).toHaveBeenCalledTimes(1);
    await revokeSyntheticPersonalLink(f.tenant.id, client.linkId);
    const revoked = await f.chat(requestId, text);
    expect(revoked.status).toBe(201);
    expect(revoked.body.coordination.state).toBe('INCOMPLETE');
    expect(revoked.body.reply).not.toBe(first.body.reply);
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.membership.findUniqueOrThrow({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
      }),
    ).toMatchObject({ role: UserRole.TENANT_OWNER, status: 'active' });
  });

  it('routes current source results through C9, replays once and isolates a second tenant', async () => {
    const first = await fixture('First salon service', 1500);
    const second = await fixture('Second salon service', 2300);
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const wording = model(1500);
    const id = randomUUID();
    const one = await first.chat(id);
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({
      reply: 'Услуга стоит 1500 ₽.',
      coordination: { scope: 'deterministic_reads', state: 'COMPLETED' },
    });
    const replay = await first.chat(id);
    expect(replay.status).toBe(201);
    expect(replay.body.coordination).toEqual(one.body.coordination);
    expect(replay.body.tools_used).toEqual(one.body.tools_used);
    expect(source).toHaveBeenCalledTimes(1);
    const firstInput = wording.mock.calls.find(
      ([input]) => input.toolResults.length,
    )?.[0];
    expect(JSON.stringify(firstInput?.toolResults)).toContain('1500');
    expect(JSON.stringify(firstInput?.toolResults)).not.toContain(
      'Second salon service',
    );
    wording.mockRestore();
    const secondWording = model(2300);
    const two = await second.chat(randomUUID());
    expect(two.body).toMatchObject({
      reply: 'Услуга стоит 2300 ₽.',
      coordination: { state: 'COMPLETED' },
    });
    expect(two.body.coordination.run_id).not.toBe(one.body.coordination.run_id);
    const secondInput = secondWording.mock.calls.find(
      ([input]) => input.toolResults.length,
    )?.[0];
    expect(JSON.stringify(secondInput?.toolResults)).not.toContain(
      'First salon service',
    );
    const forbidden = await request(http.app.getHttpServer())
      .get(`/api/orchestration/runs/${one.body.coordination.run_id}`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(forbidden.status).toBeGreaterThanOrEqual(400);
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: first.tenant.id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      state: 'SETTLED',
      taskKey: 'catalog.services.read',
      kind: 'TOOL_READ',
    });
    expect(JSON.stringify(receipts[0].resultJson)).not.toContain('1500');
    expect(JSON.stringify(receipts[0].resultJson)).not.toContain(
      'MeasurementRevision',
    );
    expect(
      await db.prisma.measurementRevision.count({
        where: { tenantId: first.tenant.id },
      }),
    ).toBe(0);
  });

  it('does not start C9 or tools for general conversation', async () => {
    const f = await fixture('Small talk salon', 1500);
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockResolvedValue({
      reply: 'Привет! Чем помочь?',
      toolCall: null,
      provider: 'openai',
      model: 'scripted-test-only',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const response = await f.chat(
      randomUUID(),
      'Привет',
      Array.from({ length: 11 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'Б'.repeat(1900),
      })),
    );
    expect(response.body.reply).toBe('Привет! Чем помочь?');
    expect(response.body.coordination).toBeUndefined();
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
    expect(
      await db.prisma.aiToolExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });

  it('preserves a qualified stale source snapshot and replay without dispatching again', async () => {
    const f = await fixture('Stale source salon', 1500, UserRole.TENANT_OWNER);
    const wording = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) =>
        Promise.resolve({
          reply: input.toolResults.length
            ? 'Показатели получены.'
            : 'Проверяю.',
          toolCall: input.toolResults.length
            ? null
            : {
                name: 'analytics.business.query',
                arguments: { period: 'month_to_date' },
              },
          provider: 'openai',
          model: 'scripted-test-only',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      );
    // Synthetic source data exercises the existing degraded-read contract, not CRM factuality.
    const source = jest
      .spyOn(http.app.get(AiToolHandlerService), 'execute')
      .mockResolvedValue({ verified: true, metrics: { unique_clients: 41 } });
    const fresh = await f.chat(randomUUID(), 'Покажи показатели');
    expect(fresh.status).toBe(201);
    expect(fresh.body.coordination.state).toBe('COMPLETED');
    source.mockRejectedValue(new Error('synthetic source outage'));
    const id = randomUUID();
    const stale = await f.chat(id, 'Покажи показатели');
    expect(stale.status).toBe(201);
    expect(stale.body.coordination.state).toBe('COMPLETED');
    const receipt = await db.prisma.c9WorkReceipt.findFirstOrThrow({
      where: { runId: stale.body.coordination.run_id },
    });
    expect(receipt.resultJson).toMatchObject({
      stale: true,
      executionId: fresh.body.tools_used[0].execution_id,
    });
    expect(receipt.resultJson).toHaveProperty('attemptExecutionId');
    const replay = await f.chat(id, 'Покажи показатели');
    expect(replay.body.coordination).toEqual(stale.body.coordination);
    expect(source).toHaveBeenCalledTimes(2);
    const sourceResult = wording.mock.calls.at(-1)?.[0].toolResults;
    expect(JSON.stringify(sourceResult)).toContain('stale');
    expect(JSON.stringify(sourceResult)).toContain('41');
  });

  it('does not reuse source reads after membership role or branch scope changes', async () => {
    const f = await fixture('Scoped source salon', 1500, UserRole.TENANT_OWNER);
    const source = jest
      .spyOn(http.app.get(AiToolHandlerService), 'execute')
      .mockResolvedValue({ verified: true, metrics: { unique_clients: 41 } });
    const key = randomUUID();
    const read = (id: string) =>
      request(http.app.getHttpServer())
        .post('/api/ai/tools/analytics.business.query/execute')
        .set('Authorization', `Bearer ${f.token}`)
        .send({
          surface: 'web',
          arguments: { period: 'month_to_date', comparison: 'none' },
          idempotencyKey: id,
        });
    const initial = await read(key);
    expect(initial.status).toBe(201);
    await db.prisma.membership.updateMany({
      where: { tenantId: f.tenant.id, userId: f.user.id },
      data: { role: UserRole.MANAGER },
    });
    const oldRole = await read(key);
    expect(oldRole.status).toBe(409);
    expect(JSON.stringify(oldRole.body)).not.toContain('41');
    source.mockRejectedValue(new Error('synthetic source outage'));
    const fallback = await read(randomUUID());
    expect(fallback.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(fallback.body)).not.toContain('41');
    source.mockResolvedValue({
      verified: true,
      metrics: { unique_clients: 17 },
    });
    const managerKey = randomUUID();
    expect((await read(managerKey)).status).toBe(201);
    const branch = await db.prisma.branch.create({
      data: { tenantId: f.tenant.id, name: 'Scope branch' },
    });
    await db.prisma.membership.updateMany({
      where: { tenantId: f.tenant.id, userId: f.user.id },
      data: { branchId: branch.id },
    });
    expect((await read(managerKey)).status).toBe(409);
  });

  it('concurrent same-turn requests never dispatch the source twice', async () => {
    const f = await fixture('Concurrent salon', 1500);
    model(1500);
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const id = randomUUID();
    const answers = await Promise.all([f.chat(id), f.chat(id)]);
    expect(answers.every((r) => r.status === 201)).toBe(true);
    expect(answers.some((r) => r.body.reply === 'Услуга стоит 1500 ₽.')).toBe(
      true,
    );
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(1);
    expect(
      await db.prisma.c9WorkReceipt.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(1);
    const changed = await f.chat(id, 'А какие мастера?');
    expect(changed.status).toBeGreaterThanOrEqual(400);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('personal source replay follows current staff and client identity bindings', async () => {
    const f = await fixture(
      'Personal scope salon',
      1500,
      UserRole.TENANT_OWNER,
    );
    const source = jest
      .spyOn(http.app.get(AiToolHandlerService), 'execute')
      .mockResolvedValue({ verified: true, marker: 'old-personal-result' });
    const staff = await fx.staff(f.tenant, f.user, 'Test staff');
    const access = await db.prisma.crmStaffAccess.create({
      data: {
        tenantId: f.tenant.id,
        userId: f.user.id,
        staffId: staff.id,
        externalStaffId: 'test-staff-A',
        encryptedDisplayName: db.encryption.encrypt('Synthetic staff'),
        role: UserRole.TENANT_OWNER,
        status: 'active',
      },
    });
    const read = (tool: string, id: string, args: Record<string, unknown>) =>
      request(http.app.getHttpServer())
        .post(`/api/ai/tools/${tool}/execute`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ surface: 'web', arguments: args, idempotencyKey: id });
    const staffKey = randomUUID();
    expect(
      (await read('staff.schedule.own.read', staffKey, { date: '2026-10-06' }))
        .status,
    ).toBe(201);
    await db.prisma.crmStaffAccess.update({
      where: { id: access.id },
      data: { externalStaffId: 'test-staff-B' },
    });
    expect(
      (await read('staff.schedule.own.read', staffKey, { date: '2026-10-06' }))
        .status,
    ).toBe(409);
    const client = await fx.client(f.tenant, f.user);
    const clientKey = randomUUID();
    expect((await read('appointments.own.list', clientKey, {})).status).toBe(
      201,
    );
    await db.prisma.client.update({
      where: { id: client.clientId },
      data: { userId: null },
    });
    // Removing the optional legacy association does not revoke a verified episode.
    expect((await read('appointments.own.list', clientKey, {})).status).toBe(
      201,
    );
    await revokeSyntheticPersonalLink(f.tenant.id, client.linkId);
    expect((await read('appointments.own.list', clientKey, {})).status).toBe(
      403,
    );
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('recovers a lost C9 settlement from the completed source without redispatch', async () => {
    const f = await fixture('Recovery salon', 1500);
    model(1500);
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    jest
      .spyOn(http.app.get(C9WorkService), 'settle')
      .mockRejectedValueOnce(new Error('synthetic lost settlement'));
    const id = randomUUID();
    const first = await f.chat(id);
    expect(first.body.reply).not.toContain('1500');
    expect(first.body.coordination.state).toBe('INCOMPLETE');
    const held = await db.prisma.c9WorkReceipt.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(held.state).toBe('HELD_UNKNOWN');
    const confirmed = await db.prisma.aiToolExecution.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(confirmed.status).toBe('completed');
    const recovered = await f.chat(id);
    expect(recovered.body).toMatchObject({
      reply: 'Услуга стоит 1500 ₽.',
      coordination: { state: 'COMPLETED' },
    });
    expect(recovered.body.tools_used[0].execution_id).toBe(confirmed.id);
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.c9WorkReceipt.findUnique({ where: { id: held.id } }),
    ).toMatchObject({ state: 'SETTLED' });
  });

  it('missing retained source result blocks replay without a new provider read', async () => {
    const f = await fixture('Retention salon', 1500);
    model(1500);
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const id = randomUUID();
    const first = await f.chat(id);
    expect(first.body.reply).toContain('1500');
    await db.prisma.aiToolExecution.update({
      where: { id: first.body.tools_used[0].execution_id },
      data: { encryptedResult: null },
    });
    const replay = await f.chat(id);
    expect(replay.body.reply).not.toContain('1500');
    expect(replay.body.coordination.state).toBe('INCOMPLETE');
    expect(source).toHaveBeenCalledTimes(1);
    expect(
      await db.prisma.aiToolExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(1);
  });

  it('an expired persisted turn cannot mint a fresh C9 age or budget', async () => {
    const f = await fixture('Expired turn salon', 1500);
    const actor = await fx.actor(f.tenant, f.user);
    const context = http.app.get(TenantContextService);
    const proofHash = await context.run(randomUUID(), () => {
      http.app.get(TenantResolverService).bindAuthenticatedUser(actor);
      return db.prisma.$transaction(async (tx) =>
        c9PrincipalHash(await http.app.get(C9Authority).current(tx)),
      );
    });
    const turnId = randomUUID(),
      conversationId = randomUUID();
    await canonicalUtcTransaction(db.prisma, (tx) =>
      tx.widgetTimelineTurn.create({
        data: {
          id: turnId,
          tenantId: f.tenant.id,
          conversationId,
          turnIndex: 0,
          role: 'user',
          channel: 'pwa',
          principalProofHash: proofHash,
          createdAt: new Date(Date.now() - 25 * 60 * 60_000),
          retentionUntil: new Date(Date.now() + 60 * 60_000),
          textContent: 'Old request',
        },
      }),
    );
    await expect(
      context.run(randomUUID(), () => {
        http.app.get(TenantResolverService).bindAuthenticatedUser(actor);
        return http.app
          .get(C9Store)
          .conversationReadRun({ turnId, conversationId }, 'a'.repeat(64));
      }),
    ).rejects.toThrow('c9_event_expired');
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
  });

  it('a failed second read labels the compound answer as incomplete', async () => {
    const f = await fixture('Partial answer salon', 1500);
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) =>
        Promise.resolve({
          reply: 'Проверяю.',
          toolCall: {
            name: input.toolResults.length
              ? 'catalog.staff.read'
              : 'catalog.services.read',
            arguments: {},
          },
          provider: 'openai',
          model: 'scripted-test-only',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      );
    const work = http.app.get(C9WorkService);
    const reserve = work.reserve.bind(work);
    let calls = 0;
    jest
      .spyOn(work, 'reserve')
      .mockImplementation((...args) =>
        ++calls === 2
          ? Promise.reject(new Error('synthetic coordination limit'))
          : reserve(...args),
      );
    const response = await f.chat(randomUUID(), 'Какие услуги и кто работает?');
    expect(response.status).toBe(201);
    expect(response.body.reply).toMatch(
      /Полного ответа пока нет|Подтверждённого ответа пока нет/,
    );
    expect(response.body.coordination.state).toBe('INCOMPLETE');
    expect(response.body.tools_used).toHaveLength(1);
  });
});
