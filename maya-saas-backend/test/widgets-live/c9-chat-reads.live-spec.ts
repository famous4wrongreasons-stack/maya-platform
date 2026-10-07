import { AiToolRuntimeService } from '../../src/ai-tools/ai-tool-runtime.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { createHash, randomUUID } from 'node:crypto';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { writeFileSync } from 'node:fs';
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

  it('Admin public consultation uses current tenant profile and staff through C9 without invented facts or mutations', async () => {
    const owner = await fixture(
      'Мужская Эстетика',
      1500,
      UserRole.TENANT_OWNER,
    );
    const other = await fixture('Другой салон', 2300, UserRole.TENANT_OWNER);
    const staff = await db.prisma.internalProvider.create({
      data: {
        tenantId: owner.tenant.id,
        displayName: 'Тестовый мастер',
        title: 'Барбер',
      },
    });
    await db.prisma.internalProvider.create({
      data: { tenantId: other.tenant.id, displayName: 'Другой мастер' },
    });
    const profile = await db.prisma.brandingSettings.create({
      data: {
        tenantId: owner.tenant.id,
        appName: 'Мужская Эстетика',
        onboardingJson: {},
        contactDetailsJson: {},
      },
    });
    const network = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('No network permitted');
    });
    const tool = 'catalog.staff.read';
    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        if (input.toolResults.length)
          throw new Error('Public source facts must not return to the model');
        const content = input.messages
          .filter((m) => m.role === 'user')
          .at(-1)?.content;
        const intent =
          content === 'Расскажи о салоне'
            ? 'company.public_info'
            : 'employees.list_public';
        return Promise.resolve({
          reply: '',
          toolCall: { name: tool, arguments: {} },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [{ intent, entities: {}, confidence: 0.99 }],
            },
            UserRole.TENANT_OWNER,
            [tool],
          ),
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_PUBLIC_SELECTION',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const runtime = jest.spyOn(http.app.get(AiToolRuntimeService), 'execute');
    const firstId = randomUUID();
    const first = await owner.chat(firstId, 'Какие у вас мастера?');
    expect(first.status).toBe(201);
    if (first.body.coordination?.state !== 'COMPLETED') {
      const sourceOutcomes = await Promise.all(
        runtime.mock.results.map(async (result) => {
          try {
            await result.value;
            return 'resolved';
          } catch (error) {
            return error instanceof Error
              ? error.message.slice(0, 500)
              : 'source_failed';
          }
        }),
      );
      throw new Error(
        JSON.stringify({
          first,
          sourceOutcomes,
          executionErrors: await db.prisma.aiToolExecution.findMany({
            where: { tenantId: owner.tenant.id },
            select: { status: true, errorCode: true },
          }),
        }),
      );
    }
    expect(first.body).toMatchObject({
      action: null,
      coordination: { scope: 'deterministic_reads', state: 'COMPLETED' },
      grounding: { status: 'verified', evidence_tools: [tool] },
    });
    expect(first.body.reply).toContain('Тестовый мастер');
    expect(first.body.reply).not.toContain('Другой мастер');
    const replay = await owner.chat(firstId, 'Какие у вас мастера?');
    expect(replay.body.reply).toBe(first.body.reply);
    expect(source).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledTimes(2);
    const salon = await owner.chat(randomUUID(), 'Расскажи о салоне');
    expect(salon.status).toBe(201);
    expect(salon.body.reply).toContain('Название в профиле: Мужская Эстетика');
    expect(salon.body.reply).not.toMatch(
      /Ставропол|Лермонтов|2020|шест|премиальн|стабильн/,
    );
    const beforeUpdate = await db.prisma.brandingSettings.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(beforeUpdate).toEqual(profile);
    const second = await other.chat(randomUUID(), 'Какие у вас мастера?');
    expect(second.status).toBe(201);
    expect(second.body.reply).toContain('Другой мастер');
    expect(second.body.reply).not.toContain('Тестовый мастер');
    const foreign = await request(http.app.getHttpServer())
      .get(`/api/orchestration/runs/${first.body.coordination.run_id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(foreign.status).toBe(400);
    await db.prisma.internalProvider.update({
      where: { id: staff.id },
      data: { active: false },
    });
    const changed = await owner.chat(randomUUID(), 'Какие у вас мастера?');
    expect(changed.status).toBe(201);
    expect(changed.body.reply).toContain(
      'В полученном публичном каталоге нет записей',
    );
    expect(changed.body.reply).not.toContain('Тестовый мастер');
    for (const [, principal] of source.mock.calls)
      expect([owner.tenant.id, other.tenant.id]).toContain(principal.tenantId);
    expect(source.mock.calls[0]?.[1]).toMatchObject({
      tenantId: owner.tenant.id,
      userId: owner.user.id,
      role: UserRole.TENANT_OWNER,
    });
    // Reproduce a pre-fix durable source receipt, including its old input identity.
    // The existing C9 replay must refuse it without redispatch or invented prose.
    const principal = source.mock.calls[0][1];
    const canonical = (value: unknown): string => {
      if (value !== null && typeof value === 'object')
        return (
          '{' +
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
            .join(',') +
          '}'
        );
      return JSON.stringify(value);
    };
    const oldHash = createHash('sha256')
      .update(
        canonical({
          actor_user_id: principal.userId,
          arguments: {},
          surface: 'web',
          tool_name: tool,
          read_authority: {
            contract: 'maya.read-authority/1',
            role: principal.role,
            ...principal.readAuthority,
          },
        }),
      )
      .digest('hex');
    const oldPayload = {
      salon: {
        name: 'Мужская Эстетика',
        about: ['Лермонтова, 343. Работаем больше шести лет.'],
      },
      staff: [],
    };
    await db.prisma.aiToolExecution.update({
      where: { id: first.body.tools_used[0].execution_id },
      data: {
        inputHash: oldHash,
        encryptedResult: http.app
          .get(EncryptionService)
          .encrypt(JSON.stringify(oldPayload)),
      },
    });
    const callsBeforeLegacyReplay = source.mock.calls.length;
    const legacyReplay = await owner.chat(firstId, 'Какие у вас мастера?');
    expect(legacyReplay.body.coordination.state).toBe('INCOMPLETE');
    expect(legacyReplay.body.reply).not.toMatch(
      /Лермонтов|шест|Тестовый мастер/,
    );
    expect(source).toHaveBeenCalledTimes(callsBeforeLegacyReplay);
    const readsBeforeRevocation = source.mock.calls.length;
    await db.prisma.membership.updateMany({
      where: { tenantId: owner.tenant.id, userId: owner.user.id },
      data: { status: 'suspended' },
    });
    const revoked = await owner.chat(firstId, 'Какие у вас мастера?');
    expect(revoked.status).toBe(401);
    expect(source).toHaveBeenCalledTimes(readsBeforeRevocation);
    const executions = await db.prisma.actionExecution.count({
      where: { tenantId: { in: [owner.tenant.id, other.tenant.id] } },
    });
    expect(executions).toBe(0);
    expect(network).not.toHaveBeenCalled();
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: owner.tenant.id },
    });
    expect(receipts).toHaveLength(3);
    for (const receipt of receipts) {
      expect(receipt).toMatchObject({
        taskKey: tool,
        kind: 'TOOL_READ',
        state: 'SETTLED',
      });
      expect(JSON.stringify(receipt.resultJson)).not.toMatch(
        /Тестовый мастер|Мужская Эстетика|encryptedDisplayName/,
      );
    }
    if (process.env.JEST_PUBLIC_CONSULTATION_REPORT)
      writeFileSync(
        process.env.JEST_PUBLIC_CONSULTATION_REPORT,
        JSON.stringify(
          {
            contract: 'maya.admin-public-consultation-http/1',
            syntheticSourceFacts: true,
            scriptedModelSelection: true,
            realModelAcceptance: false,
            externalProviderAcceptance: false,
            browserAcceptance: false,
            appRestart: false,
            modelCalls: model.mock.calls.length,
            sourceCalls: source.mock.calls.length,
            networkCalls: network.mock.calls.length,
            actionExecutions: executions,
            initialProfileUnchanged: true,
            legacyReplay,
            first,
            replay,
            salon,
            other: second,
            changed,
            foreignStatus: foreign.status,
            revokedStatus: revoked.status,
            receipts: receipts.map(({ kind, domain, state, taskKey }) => ({
              kind,
              domain,
              state,
              taskKey,
            })),
            certificate: 'NOT_ISSUED',
          },
          null,
          2,
        ) + '\n',
      );
  });

  it('Admin integration status uses stored tenant facts through C9 without live provider health or side effects', async () => {
    const owner = await fixture(
      'Stored Admin status',
      1500,
      UserRole.TENANT_OWNER,
    );
    const other = await fixture(
      'Other Admin status',
      2300,
      UserRole.TENANT_OWNER,
    );
    const client = await fixture('Client cannot read integration', 1500);
    for (const f of [owner, other, client])
      await fx.grantFeature(f.tenant, 'crm.integration');
    await db.prisma.tenant.update({
      where: { id: owner.tenant.id },
      data: { calendarSource: CalendarSource.EXTERNAL },
    });
    const integration = await db.prisma.crmIntegration.create({
      data: {
        tenantId: owner.tenant.id,
        provider: 'yclients',
        status: 'error',
        encryptedApiToken: 'SYNTHETIC_NEVER_DECRYPT',
        baseUrl: 'https://synthetic.invalid',
        verifiedAt: new Date('2026-10-05T08:00:00.000Z'),
        lastCheckedAt: new Date('2026-10-06T09:00:00.000Z'),
        lastSyncAt: null,
        lastErrorCode: 'PRIVATE_SOURCE_ERROR',
      },
    });
    const network = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('No network permitted');
    });
    const tool = 'support.integration-status.read';
    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockResolvedValue({
        reply: '',
        toolCall: { name: tool, arguments: {} },
        provider: 'openai',
        model: 'SCRIPTED_SYNTHETIC_ADMIN_SELECTION',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    const source = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const text = 'Как состояние подключения?';
    const id = randomUUID();
    const first = await owner.chat(id, text);
    expect(first.status).toBe(201);
    expect(first.body.reply).toContain(
      'Сохранённый статус интеграции YCLIENTS: ошибка подключения',
    );
    expect(first.body.reply).toContain('06.10.2026, 09:00 (UTC)');
    expect(first.body.reply).toContain('дата недоступна');
    expect(first.body.reply).toContain(
      'Текущая доступность CRM не подтверждена',
    );
    expect(first.body.reply).toContain('переподключить CRM');
    expect(first.body.reply).not.toMatch(
      /PRIVATE|SYNTHETIC_NEVER_DECRYPT|synthetic.invalid/,
    );
    expect(first.body.coordination).toMatchObject({
      scope: 'deterministic_reads',
      state: 'COMPLETED',
    });
    expect(model).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledTimes(1);
    expect(source.mock.calls[0]?.[1]).toMatchObject({
      tenantId: owner.tenant.id,
      userId: owner.user.id,
      role: UserRole.TENANT_OWNER,
    });
    const replay = await owner.chat(id, text);
    expect(replay.body.reply).toBe(first.body.reply);
    expect(source).toHaveBeenCalledTimes(1);
    const second = await other.chat(randomUUID(), text);
    expect(second.status).toBe(201);
    expect(second.body.reply).toContain('интеграция CRM не настроена');
    expect(second.body.reply).not.toMatch(/YCLIENTS|09:00|переподключить CRM/);
    const foreign = await request(http.app.getHttpServer())
      .get(`/api/orchestration/runs/${first.body.coordination.run_id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(foreign.status).toBe(400);
    const callsBeforeDenials = source.mock.calls.length;
    const deniedClient = await client.chat(randomUUID(), text);
    // The deliberately invalid model selection is refused before source dispatch.
    expect(deniedClient.status).toBe(503);
    expect(JSON.stringify(deniedClient.body)).not.toMatch(
      /Сохранённый статус интеграции|09:00|переподключить CRM/,
    );
    expect(source).toHaveBeenCalledTimes(callsBeforeDenials);
    const clientTool = await request(http.app.getHttpServer())
      .post(`/api/ai/tools/${tool}/execute`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ surface: 'web', arguments: {} });
    expect(clientTool.status).toBe(403);
    await db.prisma.tenantEntitlement.update({
      where: {
        tenantId_featureKey: {
          tenantId: owner.tenant.id,
          featureKey: 'crm.integration',
        },
      },
      data: { enabled: false },
    });
    const revoked = await owner.chat(id, text);
    expect(revoked.status).toBe(503);
    expect(JSON.stringify(revoked.body)).not.toMatch(
      /Сохранённый статус интеграции|09:00|переподключить CRM/,
    );
    expect(source).toHaveBeenCalledTimes(callsBeforeDenials);
    const revokedTool = await request(http.app.getHttpServer())
      .post(`/api/ai/tools/${tool}/execute`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ surface: 'web', arguments: {} });
    expect(revokedTool.status).toBe(403);
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: owner.tenant.id },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      taskKey: tool,
      domain: 'ADMIN',
      state: 'SETTLED',
    });
    expect(JSON.stringify(receipts[0].resultJson)).not.toMatch(
      /YCLIENTS|last_checked_at|MeasurementRevision|PRIVATE/,
    );
    const storedAfter = await db.prisma.crmIntegration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(storedAfter).toEqual(integration);
    const executions = await db.prisma.actionExecution.count({
      where: { tenantId: owner.tenant.id },
    });
    expect(executions).toBe(0);
    expect(network).not.toHaveBeenCalled();
    if (process.env.JEST_ADMIN_STATUS_REPORT)
      writeFileSync(
        process.env.JEST_ADMIN_STATUS_REPORT,
        JSON.stringify(
          {
            contract: 'maya.admin-stored-status-http-proof/1',
            syntheticSource: true,
            scriptedModelSelection: true,
            realModelAcceptance: false,
            browserAcceptance: false,
            networkCalls: network.mock.calls.length,
            sourceCalls: source.mock.calls.length,
            scriptedModelCalls: model.mock.calls.length,
            actionExecutions: executions,
            sourceIntegrationUnchanged: true,
            first,
            replay,
            other: second,
            foreignStatus: foreign.status,
            clientDenied: deniedClient,
            featureRevoked: revoked,
            directClientToolStatus: clientTool.status,
            directRevokedToolStatus: revokedTool.status,
            receipt: {
              kind: receipts[0].kind,
              domain: receipts[0].domain,
              state: receipts[0].state,
              taskKey: receipts[0].taskKey,
            },
          },
          null,
          2,
        ) + '\n',
      );
  });

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
      reply: '',
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
    expect(first.body.reply).toBe(
      'В доступном списке нет записей. Источник: ваши записи в MAYA.',
    );
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
