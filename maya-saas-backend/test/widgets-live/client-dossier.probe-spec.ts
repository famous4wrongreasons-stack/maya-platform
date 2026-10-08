/** Actual HTTP/PG/current React and existing C9 READ. Source replies are finite
 * SYNTHETIC CRM DOMAIN-PORT fixtures; no native adapter, A17/provider identity,
 * production data, external model, provider acceptance or restart claim. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
// Keep canonical bootstrap imports before owner imports (AppModule owns DI).
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { object } from './support/release-booking-flow';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { CrmService } from '../../src/crm/crm.service';
import type { CrmClientSearchResult } from '../../src/crm/crm-adapter.interface';
import { LoyaltyService } from '../../src/loyalty/loyalty.service';
import { ClientRecencyFactsService } from '../../src/business-facts/client-recency-facts.service';

const output = process.env.JEST_CLIENT_DOSSIER_OUTPUT;
assert.ok(
  output && path.isAbsolute(output),
  'Use the owned client-dossier proof driver',
);
assertProofDatabase();
const KEYS = ['ambiguous', 'unique', 'none', 'unavailable'] as const;
type ReadKey = (typeof KEYS)[number];
const QUERIES = ['Иван', 'Иван Петров', 'Зиновий', 'Семён'];
const REPLIES = {
  ambiguous:
    'Нашла несколько клиентов. Уточните имя и фамилию или последние четыре цифры телефона.',
  none: 'Клиент не найден. Уточни имя (≥3 букв) или телефон (≥4 цифр).',
  unavailable: 'Поиск клиентов в CRM сейчас недоступен.',
};
const SERVICE = 'Синтетическая услуга PRIVATE_DOSSIER_HISTORY_FIXTURE';
const SELECTED: CrmClientSearchResult = {
  id: 'synthetic-selected-client-private',
  name: 'Иван Петров',
  phone: '+70000000101',
  visits_count: 7,
  sold_amount: 8400,
  last_visit_date: '2026-09-30T10:00:00.000Z',
};
const OTHER: CrmClientSearchResult = {
  id: 'synthetic-other-client-private',
  name: 'Иван Сидоров',
  phone: '+70000000102',
  visits_count: 91,
  sold_amount: 999999,
  last_visit_date: '2026-09-29T10:00:00.000Z',
};
const HISTORY: Awaited<ReturnType<CrmService['getClientVisitHistory']>> = [
  {
    start: '2026-09-30T10:00:00.000Z',
    service_names: [SERVICE],
    total_price: 1200,
    attendance: 'arrived',
  },
  {
    start: '2026-09-23T10:00:00.000Z',
    service_names: [SERVICE],
    total_price: 1200,
    attendance: 'arrived',
  },
];
const UNIQUE_FRAGMENTS = [
  'По карточке CRM: 7 визитов.',
  SERVICE,
  'Последний подтверждённый приход — 30.09.2026',
  'Средний цикл между визитами — 7 дней.',
];
const PRIVATE_IDENTITIES = [
  'Иван',
  'Петров',
  'Сидоров',
  'Зиновий',
  'Семён',
  SELECTED.id,
  OTHER.id,
  SELECTED.phone!,
  OTHER.phone!,
];
const FORBIDDEN_REPLY = [
  ...PRIVATE_IDENTITIES,
  '91 визит',
  '999999',
  '999 999',
  '999\u00a0999',
];
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('Client dossier ambiguity [ACTUAL HTTP PG REACT / SYNTHETIC DOMAIN PORT]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    tenant: TenantFixture,
    foreignTenant: TenantFixture,
    user: UserFixture,
    foreignOwner: UserFixture;
  let baseline: string,
    mark: number,
    modelCalls = 0;
  const searches: Array<{ tenantId: string; query: string }> = [];
  const foreignSearches: typeof searches = [];
  const histories: Array<{
    tenantId: string;
    clientId: string;
    limit: number | undefined;
  }> = [];
  const loyalties: Array<{ tenantId: string; clientId: string }> = [];
  const recencies: Array<{ tenantId: string; clientId: string | null }> = [];
  const executions: Array<{
    tool: string;
    tenantId: string;
    query: unknown;
    result: unknown;
  }> = [];
  const boundaryExecutions: typeof executions = [];
  const checkpoints: string[] = [],
    unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    contract: 'maya.client-dossier-http-react-proof/1',
    status: 'running',
    sourceSeam:
      'FINITE_SYNTHETIC_CRM_DOMAIN_PORT_SEARCH_HISTORY_AND_LOYALTY_UNAVAILABLE',
    recency: 'ACTUAL_OWNER_CALL_THROUGH_WITH_SUPPLIED_SYNTHETIC_HISTORY',
    scriptedModel: true,
    realModelAcceptance: false,
    realProviderAcceptance: false,
    nativeAdapterAcceptance: false,
    a17IdentityAcceptance: false,
    restartClaim: false,
    nativeSearchUnavailableGap:
      'YclientsCRMAdapter search error swallowing is outside this domain-port proof',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      unexpected.push('external_fetch');
      throw new Error('Provider/model/outbound fetch forbidden');
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        expect(modelCalls).toBeLessThanOrEqual(4);
        expect(input.requiredToolNames).toEqual(['clients.dossier.read']);
        expect(input.toolResults).toEqual([]);
        expect(input.messages.every((message) => message.role === 'user')).toBe(
          true,
        );
        const serialized = JSON.stringify(input);
        for (const secret of [...PRIVATE_IDENTITIES, SERVICE])
          expect(serialized).not.toContain(secret);
        // This constant public placeholder cannot select a client. Existing AiCore
        // raw-request parsing and presetToolCall must overwrite it before execute.
        return Promise.resolve({
          reply: '',
          toolCall: {
            name: 'clients.dossier.read',
            arguments: { query: 'клиент' },
          },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_CLIENT_DOSSIER',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    const crm = http.app.get(CrmService);
    jest.spyOn(crm, 'searchClients').mockImplementation((tenantId, query) => {
      if (tenantId === foreignTenant.id) {
        foreignSearches.push({ tenantId, query });
        if (query !== QUERIES[0] || foreignSearches.length !== 1)
          unexpected.push('unexpected_foreign_search');
        // Distinct tenant-owned synthetic source, intentionally empty for the
        // same name. This proves principal routing, not native isolation.
        return Promise.resolve([]);
      }
      searches.push({ tenantId, query });
      if (tenantId !== tenant.id || query !== QUERIES[searches.length - 1]) {
        unexpected.push('unexpected_search_scope_or_query');
        throw new Error('Synthetic search scope refused');
      }
      if (query === QUERIES[0])
        return Promise.resolve([
          structuredClone(SELECTED),
          structuredClone(OTHER),
        ]);
      if (query === QUERIES[1])
        return Promise.resolve([structuredClone(SELECTED)]);
      if (query === QUERIES[2]) return Promise.resolve([]);
      return Promise.reject(new Error('Synthetic source unavailable'));
    });
    jest
      .spyOn(crm, 'getClientVisitHistory')
      .mockImplementation((tenantId, clientId, limit) => {
        histories.push({ tenantId, clientId, limit });
        if (
          tenantId !== tenant.id ||
          clientId !== SELECTED.id ||
          histories.length !== 1 ||
          limit !== 30
        ) {
          unexpected.push('unexpected_history_scope');
          throw new Error('Synthetic history scope refused');
        }
        return Promise.resolve(structuredClone(HISTORY));
      });
    jest
      .spyOn(http.app.get(LoyaltyService), 'getStateForCrmClient')
      .mockImplementation((tenantId, clientId) => {
        loyalties.push({ tenantId, clientId });
        if (
          tenantId !== tenant.id ||
          clientId !== SELECTED.id ||
          loyalties.length !== 1
        )
          unexpected.push('unexpected_loyalty_scope');
        // Explicit unavailable source; no invented balance and no real provider read.
        return Promise.reject(
          new Error('Synthetic loyalty source unavailable'),
        );
      });
    const recency = http.app.get(ClientRecencyFactsService);
    const readRecency = recency.forProviderClient.bind(recency);
    jest
      .spyOn(recency, 'forProviderClient')
      .mockImplementation((tenantId, source, context) => {
        recencies.push({ tenantId, clientId: source.providerClientId });
        expect(source).toMatchObject({
          providerClientId: SELECTED.id,
          history: HISTORY,
          historyFailure: null,
          historyLimit: 30,
        });
        expect(context.timezone).toBe('Europe/Moscow');
        return readRecency(tenantId, source, context);
      });
    const handler = http.app.get(AiToolHandlerService);
    const execute = handler.execute.bind(handler);
    jest
      .spyOn(handler, 'execute')
      .mockImplementation(async (tool, principal, args, key) => {
        expect(tool).toBe('clients.dossier.read');
        expect([tenant.id, foreignTenant.id]).toContain(principal.tenantId);
        const foreign = principal.tenantId === foreignTenant.id;
        expect(principal.userId).toBe(foreign ? foreignOwner.id : user.id);
        const result = await execute(tool, principal, args, key);
        (foreign ? boundaryExecutions : executions).push({
          tool,
          tenantId: principal.tenantId,
          query: args.query,
          result,
        });
        return result;
      });
  });
  afterAll(async () => {
    if (observations.status === 'running') observations.status = 'failed';
    Object.assign(observations, {
      modelCalls,
      realModelCalls: 0,
      browserSourceSearchReads: searches.length,
      foreignDirectToolSourceSearchReads: foreignSearches.length,
      boundaryHandlerExecutions: boundaryExecutions.length,
      sourceHistoryReads: histories.length,
      sourceLoyaltyReads: loyalties.length,
      actualRecencyReads: recencies.length,
      handlerExecutions: executions.length,
      checkpoints,
      unexpected,
    });
    if (db && tenant) {
      observations.actionExecutions = await db.prisma.actionExecution.count({
        where: { tenantId: { in: [tenant.id, foreignTenant.id] } },
      });
      observations.devicePushTokens = await db.prisma.devicePushToken.count({
        where: { tenantId: { in: [tenant.id, foreignTenant.id] } },
      });
    }
    writeFileSync(
      path.join(output, 'client-dossier-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  async function businessSnapshot() {
    const where = { tenantId: { in: [tenant.id, foreignTenant.id] } },
      orderBy = { id: 'asc' as const };
    return digest({
      actions: await db.prisma.actionExecution.findMany({ where, orderBy }),
      tasks: await db.prisma.operationalWorkItem.findMany({ where, orderBy }),
      inbox: await db.prisma.inboxItem.findMany({ where, orderBy }),
      appointments: await db.prisma.appointment.count({ where }),
      opportunities: await db.prisma.opportunity.count({ where }),
      deliveryAttempts: await db.prisma.marketingDeliveryAttempt.count({
        where,
      }),
    });
  }
  async function noEffects() {
    expect(await businessSnapshot()).toBe(baseline);
    const family =
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder|Client|Loyalty|Bonus|Crm';
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
  async function assertReads(expected: number) {
    expect(modelCalls).toBe(expected);
    expect(searches).toEqual(
      QUERIES.slice(0, expected).map((query) => ({
        tenantId: tenant.id,
        query,
      })),
    );
    expect(executions).toHaveLength(expected);
    expect(executions.map((row) => row.query)).toEqual(
      QUERIES.slice(0, expected),
    );
    const downstream = expected >= 2 ? 1 : 0;
    expect(histories).toHaveLength(downstream);
    expect(loyalties).toHaveLength(downstream);
    expect(recencies).toHaveLength(downstream);
    if (downstream) {
      expect(histories[0]).toEqual({
        tenantId: tenant.id,
        clientId: SELECTED.id,
        limit: 30,
      });
      expect(loyalties[0]).toEqual({
        tenantId: tenant.id,
        clientId: SELECTED.id,
      });
      expect(recencies[0]).toEqual({
        tenantId: tenant.id,
        clientId: SELECTED.id,
      });
    }
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: tenant.id },
    });
    expect(receipts).toHaveLength(expected);
    for (const row of receipts)
      expect(row).toMatchObject({
        kind: 'TOOL_READ',
        taskKey: 'clients.dossier.read',
        domain: 'CLIENT_LIFECYCLE',
        state: 'SETTLED',
      });
    expect(
      await db.prisma.c9Run.count({
        where: { tenantId: tenant.id, state: 'COMPLETED' },
      }),
    ).toBe(expected);
  }
  function assertReply(value: unknown, key: ReadKey) {
    const body = object(value);
    expect(body.action).toBeNull();
    expect(body.resolution).toBeUndefined();
    expect(object(body.grounding).status).toBe(
      key === 'unique' ? 'verified' : 'blocked',
    );
    expect(object(body.coordination).state).toBe('COMPLETED');
    expect(typeof body.reply).toBe('string');
    for (const text of FORBIDDEN_REPLY) expect(body.reply).not.toContain(text);
    const result = object(executions.at(-1)?.result);
    if (key === 'unique') {
      expect(result).toMatchObject({
        found: true,
        display_name: 'клиент',
        matches_count: 1,
        visits: 7,
        visits_scope: 'full_crm_card',
        total_spent: 8400,
        favorite_services: [SERVICE],
        avg_cycle_days: 7,
        bonus_status: 'unavailable',
        attended_visits_observed: 2,
      });
      for (const text of UNIQUE_FRAGMENTS) expect(body.reply).toContain(text);
      expect((body.reply as string).replace(/[\s\u00a0\u202f]/g, '')).toContain(
        'Покупкипокарточке—8400₽.',
      );
    } else {
      expect(body.reply).toBe(REPLIES[key]);
      expect(result).toEqual(
        key === 'ambiguous'
          ? {
              found: false,
              status: 'ambiguous',
              requires_clarification: true,
              error: REPLIES.ambiguous,
            }
          : { found: false, error: REPLIES[key] },
      );
      for (const text of UNIQUE_FRAGMENTS)
        expect(body.reply).not.toContain(text);
    }
  }
  it('clarifies ambiguity before dossier reads, selects only explicit refinement, retains the reply and refuses revoked access', async () => {
    const fx = fixturesForHttp(db, http);
    tenant = await fx.tenant(
      'Dossier domain-port synthetic',
      CalendarSource.INTERNAL,
    );
    foreignTenant = await fx.tenant(
      'Dossier foreign source synthetic',
      CalendarSource.INTERNAL,
    );
    user = await fx.user(tenant, UserRole.TENANT_OWNER);
    foreignOwner = await fx.user(foreignTenant, UserRole.TENANT_OWNER);
    const client = await fx.user(tenant, UserRole.CLIENT);
    for (const ownTenant of [tenant, foreignTenant]) {
      for (const feature of [
        'ai.owner',
        'ai.admin',
        'ai.consultant',
        'widgets.runtime',
        'booking',
      ] as const)
        await fx.grantFeature(ownTenant, feature);
      await db.prisma.tenant.update({
        where: { id: ownTenant.id },
        data: { defaultTimezone: 'Europe/Moscow' },
      });
    }
    const clientToken = await http.login(
      tenant.slug,
      client.email,
      client.password,
    );
    const foreignToken = await http.login(
      foreignTenant.slug,
      foreignOwner.email,
      foreignOwner.password,
    );
    baseline = await businessSnapshot();
    mark = http.recorder.mark();
    observations.businessSnapshotSha256 = baseline;
    const denied = await http.executeTool(
      clientToken,
      'clients.dossier.read',
      { surface: 'web', arguments: { query: QUERIES[0] } },
      randomUUID(),
    );
    expect(denied.status).toBe(403);
    expect(object(object(denied.body).error).code).toBe('ai_tool_forbidden');
    expect(executions).toHaveLength(0);
    expect(boundaryExecutions).toHaveLength(0);
    expect(foreignSearches).toHaveLength(0);
    await assertReads(0);
    await noEffects();
    observations.clientRoleDenied = {
      status: 403,
      code: 'ai_tool_forbidden',
      sourceReads: 0,
      handlerExecutions: 0,
    };
    const foreign = await http.executeTool(
      foreignToken,
      'clients.dossier.read',
      { surface: 'web', arguments: { query: QUERIES[0] } },
      randomUUID(),
    );
    expect(foreign.status).toBe(201);
    expect(object(foreign.body).result).toEqual({
      found: false,
      error: REPLIES.none,
    });
    expect(foreignSearches).toEqual([
      { tenantId: foreignTenant.id, query: QUERIES[0] },
    ]);
    expect(boundaryExecutions).toHaveLength(1);
    expect(boundaryExecutions[0]).toMatchObject({
      tenantId: foreignTenant.id,
      query: QUERIES[0],
      result: { found: false, error: REPLIES.none },
    });
    expect(
      await db.prisma.c9WorkReceipt.count({
        where: { tenantId: foreignTenant.id },
      }),
    ).toBe(0);
    await assertReads(0);
    await noEffects();
    observations.foreignTenantRead = {
      status: 201,
      tenantRoutedDomainPortOnly: true,
      sourceReads: 1,
      ownSourceReads: 0,
      historyLoyaltyRecencyReads: 0,
      nativeIsolationClaim: false,
    };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/client-dossier-browser-probe.mjs',
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
        () => fail(new Error('Bounded client dossier browser timeout')),
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
                email: user.email,
                expectedReplies: REPLIES,
                uniqueReplyFragments: UNIQUE_FRAGMENTS,
                forbiddenReplyFragments: FORBIDDEN_REPLY,
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            const name = String(message.name);
            expect(name).toBe(
              [...KEYS, 'reload', 'revoked'][checkpoints.length],
            );
            const expected = Math.min(checkpoints.length + 1, 4);
            await assertReads(expected);
            await noEffects();
            if (KEYS.includes(name as ReadKey))
              assertReply(message.body, name as ReadKey);
            if (name === 'reload')
              await db.prisma.membership.update({
                where: {
                  userId_tenantId: { userId: user.id, tenantId: tenant.id },
                },
                data: { status: 'suspended' },
              });
            if (name === 'revoked')
              expect([401, 403]).toContain(message.status);
            observations[name] = {
              modelCalls,
              exactC9DossierReadReceipts: expected,
              serverRawQueryOverridesPublicModelPlaceholder: true,
              privateNamesIdsAndHistoryAbsentFromModel: true,
              searchReads: searches.length,
              historyReads: histories.length,
              loyaltyReads: loyalties.length,
              actualRecencyReads: recencies.length,
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
              : reject(new Error(`Client dossier browser ${code}: ${stderr}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(6);
    await noEffects();
    observations.status = 'passed';
    observations.businessEffects = 0;
    observations.providerFetches = 0;
    observations.outboundNotifications = 0;
  }, 360000);
});
