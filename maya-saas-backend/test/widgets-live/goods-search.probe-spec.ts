/** Actual HTTP/auth/PG/C9/current React plus real CrmAdapterFactory/native
 * YclientsCRMAdapter. Only finite fetch replies and model selection are
 * synthetic. Integration rows are explicit test seeds, not A17 acceptance. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { object } from './support/release-booking-flow';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';

const output = process.env.JEST_GOODS_SEARCH_OUTPUT;
assert.ok(
  output && path.isAbsolute(output),
  'Use the owned goods-search proof driver',
);
assertProofDatabase();
const ORIGIN = 'http://127.0.0.1:65519'; // Intercepted fetch only; no listener.
const TOKEN = 'SYNTHETIC_GOODS_SEARCH_USER';
const TOOL = 'inventory.goods.search';
const COMPANY = '426101',
  FOREIGN_COMPANY = '426102';
const KEYS = ['mixed', 'categories', 'empty', 'unavailable'] as const;
type ReadKey = (typeof KEYS)[number];
const QUERIES = ['шампунь', 'уход', 'несуществующий', 'синтетический сбой'];
const UNAVAILABLE =
  'Не удалось завершить проверку данных для этого запроса. Подтверждённого ответа пока нет.';
const BOUNDED =
  'Это не полный каталог; отсутствие товара в этом ответе не подтверждает его отсутствие в YCLIENTS.';
const CHOOSE =
  'Для цен и остатков укажите номер нужного товара из списка. Товар ещё не выбран.';
const ITEM_TITLE = 'Шампунь SOURCE_GOODS_PRIVATE',
  CATEGORY_TITLE = 'Уход SOURCE_CATEGORY_PRIVATE';
const FOREIGN_TITLE = 'Товар FOREIGN_GOODS_PRIVATE';
const HIDDEN_TITLE = 'Категория 21 HIDDEN_GOODS_PRIVATE';
const category = (id: number, title: string) => ({
  parent_id: 0,
  item_id: 0,
  category_id: id,
  title,
  is_chain: true,
  is_category: true,
  is_item: false,
});
const item = (id: number, title: string) => ({
  parent_id: 900,
  item_id: id,
  category_id: 0,
  title,
  is_chain: false,
  is_category: false,
  is_item: true,
  // Unread fields must never turn search candidates into price/stock evidence.
  cost: 987654,
  actual_amounts: [{ storage_id: 9, amount: 77331 }],
});
const MIXED = [category(900, CATEGORY_TITLE), item(123, ITEM_TITLE)];
const CATEGORIES = Array.from({ length: 21 }, (_, index) =>
  category(
    901 + index,
    index === 20
      ? HIDDEN_TITLE
      : 'Категория ' + String(index + 1).padStart(2, '0'),
  ),
);
const FORBIDDEN = [
  FOREIGN_TITLE,
  HIDDEN_TITLE,
  '987654',
  '987 654',
  '77331',
  '77 331',
  '₽',
];
const EXPECTED: Record<ReadKey, { present: string[]; absent: string[] }> = {
  mixed: {
    present: [
      'Результаты поиска в YCLIENTS:',
      'Товар №123: ' + ITEM_TITLE,
      'Категории:',
      CATEGORY_TITLE,
      CHOOSE,
      BOUNDED,
    ],
    absent: ['Показаны первые 20', 'Товар №900'],
  },
  categories: {
    present: [
      'Категории:',
      'Категория 01',
      'Категория 20',
      'В этом ответе есть категории, но нет карточек товаров.',
      'Показаны первые 20 совпадений',
      BOUNDED,
    ],
    absent: [ITEM_TITLE, CHOOSE, 'Товар №'],
  },
  empty: {
    present: ['CRM не вернула совпадений по этому запросу.', BOUNDED],
    absent: [ITEM_TITLE, CATEGORY_TITLE, CHOOSE, 'Товар №'],
  },
  unavailable: {
    present: [UNAVAILABLE],
    absent: [
      ITEM_TITLE,
      CATEGORY_TITLE,
      'CRM не вернула совпадений',
      'Товар №',
    ],
  },
};
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Salon = {
  tenant: TenantFixture;
  user: UserFixture;
  company: string;
  token: string;
};
type Execution = {
  tenantId: string;
  query: unknown;
  phase: string;
  result?: unknown;
  errorStatus?: number;
  errorCode?: unknown;
};

describe('Goods search [ACTUAL HTTP PG REACT NATIVE ADAPTER / SYNTHETIC FETCH]', () => {
  let db: FixtureContext, http: HttpHarness, own: Salon, foreign: Salon;
  let baseline: string,
    mark: number,
    phase = 'setup',
    modelCalls = 0,
    nativeFactoryCalls = 0;
  const fetches: Array<{ company: string; query: string; phase: string }> = [];
  const executions: Execution[] = [],
    checkpoints: string[] = [],
    unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    contract: 'maya.goods-search-http-react-proof/1',
    status: 'running',
    providerTransport: 'FINITE_IN_PROCESS_SYNTHETIC_FETCH',
    adapter: 'ACTUAL_CRM_FACTORY_AND_NATIVE_YCLIENTS',
    setup: 'SYNTHETIC_ACTIVE_INTEGRATION_ROWS',
    sourceDrift: 'SYNTHETIC_SETTINGS_UPDATE_DURING_REAL_NATIVE_READ',
    a17Acceptance: false,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    scriptedModel: true,
    restartClaim: false,
    businessEffectsScope:
      'REQUESTS_EXCLUDE_EXPLICIT_TEST_INTEGRATION_SEED_AND_SOURCE_DRIFT',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    if (process.env.YCLIENTS_PARTNER_TOKEN !== undefined)
      throw new Error(
        'Owned synthetic proof requires absent partner credential',
      );
    const factory = http.app.get(CrmAdapterFactory),
      create = factory.create.bind(factory);
    jest
      .spyOn(factory, 'create')
      .mockImplementation((provider, configuration) => {
        expect(provider).toBe(CrmProvider.YCLIENTS);
        expect(configuration.apiToken).toBe(TOKEN);
        expect(configuration.baseUrl).toBe(ORIGIN + '/api/v1');
        nativeFactoryCalls++;
        // Real factory call-through, unchanged config; temporary synthetic partner
        // token satisfies constructor only. No secret or authorization is logged.
        process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_GOODS_SEARCH_PARTNER';
        try {
          const adapter = create(provider, configuration);
          expect(adapter).toBeInstanceOf(YclientsCRMAdapter);
          return adapter;
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const match = /^\/api\/v1\/goods\/search\/(426101|426102)$/.exec(
        url.pathname,
      );
      const query = url.searchParams.get('term');
      if (
        url.origin !== ORIGIN ||
        !match ||
        (init?.method ?? 'GET') !== 'GET' ||
        init?.body !== undefined ||
        !query ||
        JSON.stringify([...url.searchParams.entries()]) !==
          JSON.stringify([
            ['term', query],
            ['count', '21'],
          ]) ||
        url.hash ||
        init?.redirect !== 'error'
      ) {
        unexpected.push('unexpected_provider_route_method_or_query');
        throw new Error('Finite native search transport refused');
      }
      const company = match[1];
      fetches.push({ company, query, phase });
      let data: unknown;
      if (
        phase === 'foreign' &&
        company === FOREIGN_COMPANY &&
        query === QUERIES[0]
      )
        data = [item(321, FOREIGN_TITLE)];
      else if (
        phase === 'source-change' &&
        company === COMPANY &&
        query === 'проверка смены'
      ) {
        await db.prisma.crmIntegration.update({
          where: { tenantId: own.tenant.id },
          data: { settingsJson: { companyId: COMPANY, currency: 'EUR' } },
        });
        data = MIXED;
      } else if (
        phase === 'browser' &&
        company === COMPANY &&
        query ===
          QUERIES[fetches.filter((row) => row.phase === 'browser').length - 1]
      ) {
        if (query === QUERIES[0]) data = MIXED;
        else if (query === QUERIES[1]) data = CATEGORIES;
        else if (query === QUERIES[2]) data = [];
        else
          return new Response(
            JSON.stringify({
              success: false,
              data: [],
              meta: { message: 'Synthetic source unavailable' },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
      } else {
        unexpected.push('unexpected_provider_scope_or_sequence');
        throw new Error('Finite native search scope refused');
      }
      return new Response(
        JSON.stringify({ success: true, data, meta: { count: 0 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        expect(phase).toBe('browser');
        expect(modelCalls).toBeLessThanOrEqual(4);
        expect(input.toolResults).toEqual([]);
        expect(input.messages.every((message) => message.role === 'user')).toBe(
          true,
        );
        for (const label of [
          ITEM_TITLE,
          CATEGORY_TITLE,
          FOREIGN_TITLE,
          HIDDEN_TITLE,
        ])
          expect(JSON.stringify(input)).not.toContain(label);
        const query = QUERIES[modelCalls - 1];
        expect(input.messages.at(-1)?.content).toBe(
          'Найди в YCLIENTS ' + query,
        );
        return Promise.resolve({
          reply: '',
          toolCall: { name: TOOL, arguments: { query } },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                {
                  intent: 'inventory.goods_search',
                  entities: { product: query },
                  confidence: 0.99,
                },
              ],
            },
            UserRole.TENANT_OWNER,
            [TOOL],
            input.conversationPlan,
          ),
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_GOODS_SEARCH',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    const handler = http.app.get(AiToolHandlerService),
      execute = handler.execute.bind(handler);
    jest
      .spyOn(handler, 'execute')
      .mockImplementation(async (tool, principal, args, key) => {
        expect(tool).toBe(TOOL);
        const salon = principal.tenantId === own.tenant.id ? own : foreign;
        expect(principal.tenantId).toBe(salon.tenant.id);
        expect(principal.userId).toBe(salon.user.id);
        const execution: Execution = {
          tenantId: principal.tenantId,
          query: args.query,
          phase,
        };
        executions.push(execution);
        try {
          execution.result = await execute(tool, principal, args, key);
          return execution.result;
        } catch (error) {
          if (error instanceof HttpException) {
            execution.errorStatus = error.getStatus();
            const payload = error.getResponse();
            const nested =
              typeof payload === 'object' && payload !== null
                ? (payload as Record<string, unknown>).error
                : undefined;
            execution.errorCode =
              nested && typeof nested === 'object'
                ? (nested as Record<string, unknown>).code
                : undefined;
          }
          throw error;
        }
      });
  });
  afterAll(async () => {
    if (observations.status === 'running') observations.status = 'failed';
    Object.assign(observations, {
      modelCalls,
      realModelCalls: 0,
      nativeFactoryCalls,
      nativeSyntheticGetCount: fetches.length,
      nativeGetLedger: fetches,
      checkpoints,
      unexpected,
    });
    if (db && own && foreign) {
      const where = { tenantId: { in: [own.tenant.id, foreign.tenant.id] } };
      observations.actionExecutions = await db.prisma.actionExecution.count({
        where,
      });
      observations.approvalRequests = await db.prisma.aiApprovalRequest.count({
        where,
      });
    }
    writeFileSync(
      path.join(output, 'goods-search-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  async function salon(label: string, company: string): Promise<Salon> {
    const fx = fixturesForHttp(db, http),
      tenant = await fx.tenant(label, CalendarSource.EXTERNAL),
      user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
      'commerce.store',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        encryptedApiToken: db.encryption.encrypt(TOKEN),
        baseUrl: ORIGIN + '/api/v1',
        settingsJson: { companyId: company, currency: 'RUB' },
      },
    });
    return {
      tenant,
      user,
      company,
      token: await http.login(tenant.slug, user.email, user.password),
    };
  }
  const read = (token: string, query: string) =>
    http.executeTool(
      token,
      TOOL,
      { surface: 'web', arguments: { query } },
      randomUUID(),
    );
  async function businessSnapshot() {
    const where = { tenantId: { in: [own.tenant.id, foreign.tenant.id] } },
      orderBy = { id: 'asc' as const };
    return digest({
      actions: await db.prisma.actionExecution.findMany({ where, orderBy }),
      approvals: await db.prisma.aiApprovalRequest.findMany({ where, orderBy }),
      tasks: await db.prisma.operationalWorkItem.findMany({ where, orderBy }),
      inbox: await db.prisma.inboxItem.findMany({ where, orderBy }),
      appointments: await db.prisma.appointment.count({ where }),
      deliveryAttempts: await db.prisma.marketingDeliveryAttempt.count({
        where,
      }),
    });
  }
  async function noEffects() {
    expect(await businessSnapshot()).toBe(baseline);
    const family =
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder|Client|Loyalty|Bonus|Crm|Inventory';
    expect(
      http.recorder
        .since(mark)
        .filter(
          (op) =>
            op.write &&
            (op.model
              ? new RegExp('^(' + family + ')').test(op.model)
              : new RegExp(
                  '\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:' +
                    family +
                    ')',
                  'i',
                ).test(op.sql ?? '')),
        ),
    ).toEqual([]);
    expect(unexpected).toEqual([]);
  }
  async function assertBrowserReads(count: number) {
    expect(modelCalls).toBe(count);
    expect(fetches.filter((row) => row.phase === 'browser')).toEqual(
      QUERIES.slice(0, count).map((query) => ({
        company: COMPANY,
        query,
        phase: 'browser',
      })),
    );
    const browserExecutions = executions.filter(
      (row) => row.phase === 'browser',
    );
    expect(browserExecutions).toHaveLength(count);
    expect(browserExecutions.map((row) => row.query)).toEqual(
      QUERIES.slice(0, count),
    );
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: own.tenant.id },
    });
    expect(receipts).toHaveLength(count);
    for (const row of receipts)
      expect(row).toMatchObject({
        kind: 'TOOL_READ',
        taskKey: TOOL,
        domain: 'ADMIN',
      });
    expect(receipts.filter((row) => row.state === 'SETTLED')).toHaveLength(
      Math.min(count, 3),
    );
    expect(receipts.filter((row) => row.state === 'HELD_UNKNOWN')).toHaveLength(
      count === 4 ? 1 : 0,
    );
    expect(
      await db.prisma.c9Run.count({
        where: { tenantId: own.tenant.id, state: 'COMPLETED' },
      }),
    ).toBe(Math.min(count, 3));
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: foreign.tenant.id } }),
    ).toBe(0);
    if (count === 4) {
      expect(browserExecutions[3]).toMatchObject({
        errorStatus: 503,
        errorCode: 'goods_search_source_unavailable',
      });
      expect(browserExecutions[3].result).toBeUndefined();
      expect(
        await db.prisma.aiToolExecution.count({
          where: {
            tenantId: own.tenant.id,
            toolName: TOOL,
            status: 'failed',
            errorCode: 'goods_search_source_unavailable',
          },
        }),
      ).toBe(1);
    }
  }
  function assertReply(value: unknown, key: ReadKey) {
    const body = object(value);
    expect(body.action).toBeNull();
    expect(body.resolution).toBeUndefined();
    expect(object(body.grounding).status).toBe(
      key === 'unavailable' ? 'blocked' : 'verified',
    );
    expect(object(body.coordination).state).toBe(
      key === 'unavailable' ? 'INCOMPLETE' : 'COMPLETED',
    );
    for (const text of EXPECTED[key].present)
      expect(body.reply).toContain(text);
    for (const text of [...EXPECTED[key].absent, ...FORBIDDEN])
      expect(body.reply).not.toContain(text);
    if (key === 'unavailable') {
      expect(body.reply).toBe(UNAVAILABLE);
      return;
    }
    const result = object(executions.at(-1)?.result);
    expect(result).toMatchObject({
      contract: 'maya.goods-search.read/1',
      source: 'external_crm',
      scope: 'bounded_goods_and_categories_search',
      company_id: COMPANY,
      query: QUERIES[KEYS.indexOf(key)],
      limit: 20,
      exhaustive: false,
      may_have_more: key === 'categories',
    });
    expect(Number.isFinite(Date.parse(result.as_of as string))).toBe(true);
    const expectedRows = (
      key === 'mixed'
        ? MIXED
        : key === 'categories'
          ? CATEGORIES.slice(0, 20)
          : []
    ).map((row) => ({
      kind: row.is_item ? 'item' : 'category',
      id: String(row.is_item ? row.item_id : row.category_id),
      title: row.title,
    }));
    expect(result.rows).toEqual(expectedRows);
    expect(result.limitations).toEqual(
      expect.arrayContaining([
        'category_first_bounded_search',
        'search_matches_not_goods_cards',
        'price_and_stock_not_observed',
        'no_mutation_authority',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('actual_amounts');
    expect(JSON.stringify(result)).not.toContain('987654');
  }
  it('searches current company without selecting a good, auto detail, business effects or redispatch on reload', async () => {
    own = await salon('Goods search synthetic', COMPANY);
    foreign = await salon('Foreign goods search synthetic', FOREIGN_COMPANY);
    const client = await fixturesForHttp(db, http).user(
      own.tenant,
      UserRole.CLIENT,
    );
    const clientToken = await http.login(
      own.tenant.slug,
      client.email,
      client.password,
    );
    baseline = await businessSnapshot();
    mark = http.recorder.mark();
    const denied = await read(clientToken, QUERIES[0]);
    expect(denied.status).toBe(403);
    expect(object(object(denied.body).error).code).toBe('ai_tool_forbidden');
    expect(fetches).toEqual([]);
    expect(executions).toEqual([]);
    await noEffects();
    observations.clientRoleDenied = {
      status: 403,
      code: 'ai_tool_forbidden',
      sourceGets: 0,
    };
    phase = 'foreign';
    const foreignRead = await read(foreign.token, QUERIES[0]);
    expect(foreignRead.status).toBe(201);
    expect(object(object(foreignRead.body).result)).toMatchObject({
      company_id: FOREIGN_COMPANY,
      rows: [{ kind: 'item', id: '321', title: FOREIGN_TITLE }],
    });
    expect(JSON.stringify(foreignRead.body)).not.toContain(ITEM_TITLE);
    expect(fetches).toEqual([
      { company: FOREIGN_COMPANY, query: QUERIES[0], phase },
    ]);
    await noEffects();
    observations.foreignTenantRead = {
      exactOwnCompanyRoute: true,
      ownCompanyGets: 0,
      foreignCompanyGets: 1,
      nativeAdapterSyntheticTransport: true,
    };
    phase = 'source-change';
    const changed = await read(own.token, 'проверка смены');
    expect(changed.status).toBe(409);
    expect(object(changed.body).message).toBe('goods_source_changed');
    expect(object(changed.body).result).toBeUndefined();
    expect(object(changed.body).resolution).toBeUndefined();
    expect(executions.at(-1)?.result).toBeUndefined();
    expect(fetches.filter((row) => row.phase === phase)).toHaveLength(1);
    expect(await businessSnapshot()).toBe(baseline);
    observations.sourceChangedDuringRead = {
      status: 409,
      reason: 'goods_source_changed',
      nativeGets: 1,
      candidatesReturned: false,
      syntheticSettingsEdit: true,
    };
    await db.prisma.crmIntegration.update({
      where: { tenantId: own.tenant.id },
      data: { settingsJson: { companyId: COMPANY, currency: 'RUB' } },
    });
    // Exclude only the explicitly declared test-source edit and restoration.
    mark = http.recorder.mark();
    phase = 'browser';
    observations.businessSnapshotSha256 = baseline;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/goods-search-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let pending = Promise.resolve(),
        failure: Error | undefined,
        stderr = '',
        killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded goods search browser timeout')),
        300000,
      );
      child.stderr!.on('data', (buffer: Buffer) => {
        stderr = (stderr + buffer.toString()).slice(-2000);
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = object(raw);
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output,
                email: own.user.email,
                expected: EXPECTED,
                forbiddenReplyFragments: FORBIDDEN,
                unavailableReply: UNAVAILABLE,
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            const name = String(message.name);
            expect(name).toBe(
              [...KEYS, 'reload', 'revoked'][checkpoints.length],
            );
            const count = Math.min(checkpoints.length + 1, 4);
            await assertBrowserReads(count);
            await noEffects();
            if (KEYS.includes(name as ReadKey))
              assertReply(message.body, name as ReadKey);
            if (name === 'reload')
              await db.prisma.membership.update({
                where: {
                  userId_tenantId: {
                    userId: own.user.id,
                    tenantId: own.tenant.id,
                  },
                },
                data: { status: 'suspended' },
              });
            if (name === 'revoked')
              expect([401, 403]).toContain(message.status);
            observations[name] = {
              modelCalls,
              exactC9SearchReadReceipts: count,
              settledReceipts: Math.min(count, 3),
              heldUnknownReceipts: count === 4 ? 1 : 0,
              nativeSearchGets: count,
              autoDetailGets: 0,
              providerWrites: 0,
              businessSnapshotUnchanged: true,
              ...(name === 'revoked' ? { status: message.status } : {}),
            };
            checkpoints.push(name);
            child.send({ type: 'continue:' + name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`Goods search browser ${code}: ${stderr}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(6);
    expect(nativeFactoryCalls).toBeGreaterThan(0);
    expect(fetches).toHaveLength(6);
    await noEffects();
    Object.assign(observations, {
      status: 'passed',
      businessEffects: 0,
      nativeDetailGets: 0,
      nativeMutationRequests: 0,
      outboundNotifications: 0,
      realProviderCalls: 0,
    });
  }, 360000);
});
