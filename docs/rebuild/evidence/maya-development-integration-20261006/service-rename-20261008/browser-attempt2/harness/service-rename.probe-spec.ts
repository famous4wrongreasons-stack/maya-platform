/** Actual HTTP/auth/PG/C9/current React; actual CRM factory/native adapter.
 * Only model selection and finite fetch responses are synthetic. No writer port,
 * approval, widget intent, provider mutation or real external network is admitted. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { bootFixtureContext, type FixtureContext } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/bootstrap';
import { bootHttp, fixturesForHttp, type HttpHarness } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/http-bootstrap';
import type { TenantFixture, UserFixture } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/fixtures';
import { assertProofDatabase } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/proof-db-guard';
import { object } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/release-booking-flow';
import { CalendarSource, CrmProvider, UserRole } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/common/domain.enums';
import { AiCoreModelService } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/ai-tool-handler.service';
import { ConversationIntelligenceService } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/conversation-intelligence/conversation-intelligence.service';
import { CrmAdapterFactory } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/adapters/yclients-crm.adapter';

const output = process.env.JEST_SERVICE_RENAME_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'Use owned service rename proof driver');
assertProofDatabase();
const ORIGIN = 'http://127.0.0.1:65519'; // Intercepted finite transport; no listener.
const TOKEN = 'SYNTHETIC_SERVICE_RENAME_USER';
const TOOL = 'catalog.service.rename.preview';
const CATALOG = 'catalog.services.read';
const COMPANY = '426201', FOREIGN_COMPANY = '426202';
const SERVICE = '201';
const KEYS = ['success', 'ambiguous', 'forbidden', 'drift'] as const;
type ReadKey = typeof KEYS[number];
const NEW_TITLES = ['Новое название', 'Другое название', 'Проверка прав', 'Проверка источника'];
const BOOKING_TITLE = 'Онлайн SOURCE_BOOKING_LABEL';
const PRINT_TITLE = 'Печатное SOURCE_PRINT_PRIVATE';
const NOTE = 'Служебное SOURCE_NOTE_PRIVATE';
const FOREIGN_TITLE = 'Услуга FOREIGN_SERVICE_PRIVATE';
const UNAVAILABLE = 'Не удалось завершить проверку данных для этого запроса. Подтверждённого ответа пока нет.';
const AMBIGUOUS = 'В текущем ответе каталога нет одной однозначной услуги. Укажите её точный номер в YCLIENTS и новое название.';
const permissions = { settings: { settings_services_access: true, services_edit: true, settings_services_edit_title_access: true, settings_services_edit_price_access: false } };
// Same qualified source shape as adapters/yclients-service-price.spec.ts; finite
// synthetic values only. print_title is observed, never treated as a writable key.
const source = (company: string) => ({
  id: 201, company_id: Number(company), title: company === COMPANY ? 'Стрижка' : FOREIGN_TITLE,
  booking_title: BOOKING_TITLE, print_title: PRINT_TITLE, category_id: 1,
  price_min: 2000, price_max: 2000, duration: 1800, is_multi: false,
  tax_variant: 1, vat_id: 2, is_need_limit_date: false, seance_search_start: 0,
  seance_search_finish: 86400, step: 900, seance_search_step: 900,
  technical_break_duration: 300, staff: [{ id: 101, seance_length: 1800 }],
  active: 1, is_chain: false, is_price_managed_only_in_chain: false,
  comment: NOTE, discount: 5, weight: 2, api_service_id: 712,
});
const FORBIDDEN = [PRINT_TITLE, NOTE, FOREIGN_TITLE, 'MODEL_CHANGED_SERVICE', 'MODEL_GUESS', '№999'];
const EXPECTED: Record<ReadKey, { present: string[]; absent: string[]; grounding: string; coordination: string }> = {
  success: { present: [
    `Проект изменения внутреннего названия услуги №${SERVICE} в компании YCLIENTS №${COMPANY}:`,
    'Сейчас: «Стрижка».', 'Предлагается: «Новое название».',
    `Название для онлайн-записи остаётся «${BOOKING_TITLE}».`,
    'Цена, длительность и связи с мастерами в проекте сохраняются по прочитанному состоянию CRM.',
    'Влияние внутреннего названия на печатное название услуги пока не подтверждено.',
    'Перед будущим применением потребуется новая проверка состояния и прав.',
    'Это только проверка проекта. Подтверждение и применение этого изменения из чата ещё не подключены. В YCLIENTS ничего не изменено.',
  ], absent: [], grounding: 'verified', coordination: 'COMPLETED' },
  ambiguous: { present: [AMBIGUOUS], absent: [BOOKING_TITLE, 'Проект изменения внутреннего'], grounding: 'not_required', coordination: 'COMPLETED' },
  forbidden: { present: [UNAVAILABLE], absent: [BOOKING_TITLE, 'Проект изменения внутреннего'], grounding: 'blocked', coordination: 'INCOMPLETE' },
  drift: { present: [UNAVAILABLE], absent: [BOOKING_TITLE, 'Проект изменения внутреннего'], grounding: 'blocked', coordination: 'INCOMPLETE' },
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Salon = { tenant: TenantFixture; user: UserFixture; company: string; token: string };
type Execution = { tenantId: string; tool: string; args: unknown; phase: string; key: ReadKey | null; result?: unknown; errorStatus?: number; errorCode?: unknown };
type NativeGet = { company: string; path: string; phase: string; key: ReadKey | null };

describe('Service rename preview [ACTUAL HTTP PG REACT NATIVE READ / SYNTHETIC FETCH]', () => {
  let db: FixtureContext, http: HttpHarness, own: Salon, foreign: Salon;
  let baseline: string, mark: number, phase = 'setup', activeKey: ReadKey | null = null;
  let modelCalls = 0, nativeFactoryCalls = 0;
  const fetches: NativeGet[] = [], executions: Execution[] = [], checkpoints: string[] = [], unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    contract: 'maya.service-rename-http-react-proof/1', status: 'running',
    providerTransport: 'FINITE_IN_PROCESS_SYNTHETIC_FETCH', adapter: 'ACTUAL_CRM_FACTORY_AND_NATIVE_YCLIENTS',
    setup: 'SYNTHETIC_ACTIVE_INTEGRATION_ROWS_NOT_A17', a17Acceptance: false,
    sourceDrift: 'SYNTHETIC_SETTINGS_UPDATE_DURING_REAL_NATIVE_SERVICE_READ',
    scriptedModel: true, realModelAcceptance: false, realProviderAcceptance: false,
    restartClaim: false, mutationLaneAcceptance: false,
    businessEffectsScope: 'REQUESTS_EXCLUDE_EXPLICIT_TEST_SEED_SOURCE_DRIFT_AND_MEMBERSHIP_REVOCATION',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined, 'Real partner credential forbidden');
    const factory = http.app.get(CrmAdapterFactory), create = factory.create.bind(factory);
    jest.spyOn(factory, 'create').mockImplementation((provider, configuration) => {
      expect(provider).toBe(CrmProvider.YCLIENTS);
      expect(configuration.apiToken).toBe(TOKEN);
      expect(configuration.baseUrl).toBe(ORIGIN + '/api/v1');
      nativeFactoryCalls++;
      process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_SERVICE_RENAME_PARTNER';
      try {
        const adapter = create(provider, configuration);
        expect(adapter).toBeInstanceOf(YclientsCRMAdapter);
        return adapter;
      } finally { delete process.env.YCLIENTS_PARTNER_TOKEN; }
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const company = phase === 'foreign' ? FOREIGN_COMPANY : COMPANY;
      const catalog = `/api/v1/book_services/${company}`;
      const permission = `/api/v1/user/permissions/${company}`;
      const service = `/api/v1/company/${company}/services/${SERVICE}`;
      // Existing public catalog READ has no redirect override. Exact management
      // reads use preserveGoodsNumbers and must still refuse redirects.
      const expectedRedirect = url.pathname === catalog ? undefined : 'error';
      if (url.origin !== ORIGIN || ![catalog, permission, service].includes(url.pathname) ||
          (init?.method ?? 'GET') !== 'GET' || init?.body !== undefined || url.search || url.hash || init?.redirect !== expectedRedirect ||
          !['foreign', 'browser'].includes(phase)) {
        unexpected.push('unexpected_provider_route_method_or_scope');
        throw new Error('Finite read-only native transport refused');
      }
      const prior = fetches.filter(row => row.phase === phase && row.key === activeKey);
      const expectedPaths = phase === 'foreign' ? [permission, service, permission] :
        activeKey === 'ambiguous' ? [catalog] : activeKey === 'forbidden' ? [catalog, permission, service] : [catalog, permission, service, permission];
      expect(url.pathname).toBe(expectedPaths[prior.length]);
      fetches.push({ company, path: url.pathname, phase, key: activeKey });
      let data: unknown;
      if (url.pathname === catalog) {
        const row = { id: 201, title: 'Стрижка', price_min: 2000, price_max: 2000, seance_length: 1800 };
        data = { services: activeKey === 'ambiguous' ? [row, { ...row, id: 202 }] : [row] };
      } else if (url.pathname === permission) data = permissions;
      else {
        if (activeKey === 'forbidden') return new Response(JSON.stringify({ success: false, data: null, meta: { message: 'SYNTHETIC_PROVIDER_FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        data = source(company);
        if (activeKey === 'drift') await db.prisma.crmIntegration.update({
          where: { tenantId: own.tenant.id }, data: { settingsJson: { companyId: COMPANY, currency: 'RUB', sourceDriftWitness: 'SYNTHETIC_CHANGED' } },
        });
      }
      return new Response(JSON.stringify({ success: true, data, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockImplementation(input => {
      expect(phase).toBe('browser');
      expect(modelCalls).toBeLessThan(4);
      activeKey = KEYS[modelCalls++];
      expect(input.toolResults).toEqual([]);
      expect(input.tools.map(tool => tool.name)).toEqual(expect.arrayContaining([CATALOG, TOOL]));
      expect(input.messages.every(message => message.role === 'user')).toBe(true);
      for (const privateText of [BOOKING_TITLE, PRINT_TITLE, NOTE, FOREIGN_TITLE]) expect(JSON.stringify(input)).not.toContain(privateText);
      // Deliberately wrong target/title. Current literal request + fresh catalog
      // must replace both through the real server binder, never through this spy.
      return Promise.resolve({ reply: 'MODEL_CHANGED_SERVICE', toolCall: { name: TOOL, arguments: { service_id: '999', new_title: 'MODEL_GUESS' } }, semanticPlan: new ConversationIntelligenceService().validatePlan({ dialogue_act: 'request', tasks: [{ intent: 'services.rename_preview', entities: { service: 'MODEL_GUESS', new_title: 'MODEL_GUESS' }, confidence: 0.99 }] }, UserRole.TENANT_OWNER, [CATALOG, TOOL], input.conversationPlan), provider: 'openai', model: 'SCRIPTED_SYNTHETIC_SERVICE_RENAME', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
    });
    const handler = http.app.get(AiToolHandlerService), execute = handler.execute.bind(handler);
    jest.spyOn(handler, 'execute').mockImplementation(async (tool, principal, args, key) => {
      expect([CATALOG, TOOL]).toContain(tool);
      const salon = phase === 'foreign' ? foreign : own;
      expect(principal.tenantId).toBe(salon.tenant.id);
      expect(principal.userId).toBe(salon.user.id);
      const entry: Execution = { tenantId: principal.tenantId, tool, args, phase, key: activeKey };
      executions.push(entry);
      try { entry.result = await execute(tool, principal, args, key); return entry.result; }
      catch (error) {
        if (error instanceof HttpException) { entry.errorStatus = error.getStatus(); entry.errorCode = object(object(error.getResponse()).error).code; }
        throw error;
      }
    });
  });
  afterAll(async () => {
    if (observations.status === 'running') observations.status = 'failed';
    Object.assign(observations, { modelCalls, realModelCalls: 0, nativeFactoryCalls, nativeSyntheticGetCount: fetches.length, nativeGetLedger: fetches, checkpoints, unexpected });
    if (db && own && foreign) {
      const where = { tenantId: { in: [own.tenant.id, foreign.tenant.id] } };
      observations.actionExecutions = await db.prisma.actionExecution.count({ where });
      observations.approvalRequests = await db.prisma.aiApprovalRequest.count({ where });
      observations.widgetIntents = await db.prisma.widgetIntentRecord.count({ where });
    }
    writeFileSync(path.join(output, 'service-rename-observations.json'), JSON.stringify(observations, null, 2) + '\n', { mode: 0o600 });
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  async function salon(label: string, company: string): Promise<Salon> {
    const fx = fixturesForHttp(db, http), tenant = await fx.tenant(label, CalendarSource.EXTERNAL), user = await fx.user(tenant, UserRole.TENANT_OWNER);
    // The finite preview requires both registered READs: catalog.services.read
    // uses the existing booking entitlement; rename uses current owner/CRM rights.
    for (const feature of ['ai.owner', 'ai.admin', 'ai.consultant', 'widgets.runtime', 'crm.integration', 'booking'] as const) await fx.grantFeature(tenant, feature);
    await db.prisma.crmIntegration.create({ data: { tenantId: tenant.id, provider: CrmProvider.YCLIENTS, status: 'active', encryptedApiToken: db.encryption.encrypt(TOKEN), baseUrl: ORIGIN + '/api/v1', settingsJson: { companyId: company, currency: 'RUB' } } });
    return { tenant, user, company, token: await http.login(tenant.slug, user.email, user.password) };
  }
  async function businessSnapshot() {
    const where = { tenantId: { in: [own.tenant.id, foreign.tenant.id] } }, orderBy = { id: 'asc' as const };
    return digest({
      actions: await db.prisma.actionExecution.findMany({ where, orderBy }), approvals: await db.prisma.aiApprovalRequest.findMany({ where, orderBy }),
      tasks: await db.prisma.operationalWorkItem.findMany({ where, orderBy }), inbox: await db.prisma.inboxItem.findMany({ where, orderBy }),
      appointments: await db.prisma.appointment.count({ where }), deliveryAttempts: await db.prisma.marketingDeliveryAttempt.count({ where }),
      widgetIntents: await db.prisma.widgetIntentRecord.count({ where }), widgetEmissions: await db.prisma.widgetEmission.count({ where }),
    });
  }
  async function noEffects() {
    expect(await businessSnapshot()).toBe(baseline);
    const family = 'Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApprovalRequest|WidgetIntent|WidgetEmission|WidgetDraft|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder|Client|Loyalty|Bonus|Crm|Inventory|ServiceOffering';
    expect(http.recorder.since(mark).filter(op => op.write && (op.model ? new RegExp('^(' + family + ')').test(op.model) : new RegExp('\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:' + family + ')', 'i').test(op.sql ?? '')))).toEqual([]);
    expect(unexpected).toEqual([]);
  }
  async function assertReads(count: number) {
    expect(modelCalls).toBe(count);
    const expectedCounts = [4, 1, 3, 4];
    expect(fetches.filter(row => row.phase === 'browser')).toHaveLength(expectedCounts.slice(0, count).reduce((a, b) => a + b, 0));
    const seen = executions.filter(row => row.phase === 'browser');
    expect(seen.filter(row => row.tool === CATALOG)).toHaveLength(count);
    expect(seen.filter(row => row.tool === TOOL)).toHaveLength(count - (count >= 2 ? 1 : 0));
    for (const entry of seen.filter(row => row.tool === TOOL)) {
      expect(object(entry.args)).toMatchObject({ service_id: SERVICE, new_title: NEW_TITLES[KEYS.indexOf(entry.key!)] });
      expect(object(entry.args).source_revision).toMatch(/^[a-f0-9]{64}$/);
    }
    const receipts = await db.prisma.c9WorkReceipt.findMany({ where: { tenantId: own.tenant.id } });
    expect(receipts).toHaveLength(count * 2 - (count >= 2 ? 1 : 0));
    expect(receipts.filter(row => row.taskKey === CATALOG)).toHaveLength(count);
    expect(receipts.filter(row => row.taskKey === TOOL)).toHaveLength(count - (count >= 2 ? 1 : 0));
    for (const row of receipts) expect(row).toMatchObject({ kind: 'TOOL_READ', domain: row.taskKey === CATALOG ? 'OCCUPANCY' : 'ADMIN' });
    expect(receipts.filter(row => row.state === 'HELD_UNKNOWN')).toHaveLength(Math.max(0, count - 2));
    expect(receipts.filter(row => row.state === 'SETTLED')).toHaveLength(count + 1);
    expect(await db.prisma.c9Run.count({ where: { tenantId: own.tenant.id, state: 'COMPLETED' } })).toBe(Math.min(2, count));
    expect(await db.prisma.c9Run.count({ where: { tenantId: foreign.tenant.id } })).toBe(0);
    if (count >= 3) expect(seen.find(row => row.key === 'forbidden' && row.tool === TOOL)).toMatchObject({ errorStatus: 503, errorCode: 'service_rename_source_unavailable' });
    if (count >= 4) expect(seen.find(row => row.key === 'drift' && row.tool === TOOL)).toMatchObject({ errorStatus: 409, errorCode: 'service_rename_source_changed' });
    for (const row of seen.filter(row => row.errorStatus)) expect(row.result).toBeUndefined();
  }
  function assertReply(value: unknown, key: ReadKey) {
    const body = object(value), expected = EXPECTED[key];
    expect(body.action).toBeNull(); expect(body.resolution).toBeUndefined();
    expect(object(body.grounding).status).toBe(expected.grounding);
    expect(object(body.coordination).state).toBe(expected.coordination);
    for (const text of expected.present) expect(body.reply).toContain(text);
    for (const text of [...expected.absent, ...FORBIDDEN]) expect(body.reply).not.toContain(text);
    if (key === 'success') {
      const result = object(executions.at(-1)?.result);
      expect(result).toMatchObject({ contract: 'maya.service-rename.preview/1', source: 'external_crm', scope: 'single_existing_service_title', company_id: COMPANY, service_id: SERVICE, old_title: 'Стрижка', new_title: NEW_TITLES[0], booking_title: BOOKING_TITLE, preview_only: true, noSideEffects: true, blocked_reason: 'approval_lane_not_registered' });
      for (const key of ['source_revision', 'current_revision', 'preserved_fields_hash']) expect(result[key]).toMatch(/^[a-f0-9]{64}$/);
      expect(result.limitations).toEqual(expect.arrayContaining(['print_title_effective_label_not_qualified', 'future_write_preservation_not_qualified', 'preview_does_not_authorize_mutation']));
      expect(Number.isFinite(Date.parse(result.as_of as string))).toBe(true);
      expect(result.preservedPayload).toBeUndefined();
    } else expect(body.reply).toBe(key === 'ambiguous' ? AMBIGUOUS : UNAVAILABLE);
  }
  it('previews one explicit title with no write authority, safely refuses ambiguity/drift and retains only saved text', async () => {
    own = await salon('Service rename synthetic', COMPANY);
    foreign = await salon('Foreign service rename synthetic', FOREIGN_COMPANY);
    const client = await fixturesForHttp(db, http).user(own.tenant, UserRole.CLIENT);
    const clientToken = await http.login(own.tenant.slug, client.email, client.password);
    baseline = await businessSnapshot(); mark = http.recorder.mark();
    const read = (token: string) => http.executeTool(token, TOOL, { surface: 'web', arguments: { service_id: SERVICE, new_title: NEW_TITLES[0] } }, randomUUID());
    const denied = await read(clientToken);
    expect(denied.status).toBe(403); expect(object(object(denied.body).error).code).toBe('ai_tool_forbidden');
    expect(fetches).toEqual([]); expect(executions).toEqual([]);
    observations.clientRoleDenied = { status: 403, code: 'ai_tool_forbidden', sourceGets: 0 };
    phase = 'foreign';
    const foreignRead = await read(foreign.token);
    expect(foreignRead.status).toBe(201);
    expect(object(object(foreignRead.body).result)).toMatchObject({ company_id: FOREIGN_COMPANY, service_id: SERVICE, old_title: FOREIGN_TITLE, preview_only: true });
    expect(fetches).toHaveLength(3); expect(fetches.every(row => row.company === FOREIGN_COMPANY)).toBe(true);
    observations.foreignTenantRead = { status: 201, exactOwnCompanyRoute: true, ownCompanyGets: 0, foreignCompanyGets: 3, sourceFixtureSynthetic: true };
    await noEffects();
    phase = 'browser';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['/tmp/maya-service-edit-20261008/service-rename-browser-probe.mjs'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      let pending = Promise.resolve(), failure: Error | undefined, stderr = '', killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => { failure ??= error instanceof Error ? error : new Error(String(error)); child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000); };
      const timer = setTimeout(() => fail(new Error('Bounded service rename browser timeout')), 300000);
      child.stderr!.on('data', (buffer: Buffer) => { stderr = (stderr + buffer.toString()).slice(-2000); });
      child.on('message', (raw: unknown) => {
        pending = pending.then(async () => {
          const message = object(raw);
          if (message.type === 'ready') { child.send({ type: 'start', backendOrigin: await http.listenLoopback(), output, email: own.user.email, expected: EXPECTED, forbiddenReplyFragments: FORBIDDEN }); return; }
          expect(message.type).toBe('checkpoint'); assert.ok(typeof message.name === 'string'); const name = message.name;
          expect(name).toBe([...KEYS, 'reload', 'revoked'][checkpoints.length]);
          const count = Math.min(checkpoints.length + 1, 4);
          await assertReads(count); await noEffects();
          if (KEYS.includes(name as ReadKey)) assertReply(message.body, name as ReadKey);
          if (name === 'reload') await db.prisma.membership.update({ where: { userId_tenantId: { userId: own.user.id, tenantId: own.tenant.id } }, data: { status: 'suspended' } });
          if (name === 'revoked') expect([401, 403]).toContain(message.status);
          observations[name] = { modelSelections: modelCalls, catalogC9Reads: count, previewC9Reads: count - (count >= 2 ? 1 : 0), nativeGets: fetches.filter(row => row.phase === 'browser').length, businessSnapshotUnchanged: true, providerWrites: 0, approvals: 0, widgetIntents: 0, ...(name === 'revoked' ? { status: message.status } : {}) };
          checkpoints.push(name); child.send({ type: 'continue:' + name });
        }).catch(fail);
      });
      child.once('error', fail);
      child.once('close', code => { clearTimeout(timer); clearTimeout(killTimer); void pending.then(() => failure ? reject(failure) : code === 0 ? resolve() : reject(new Error(`Service rename browser ${code}: ${stderr}`))); });
    });
    expect(checkpoints).toHaveLength(6); expect(nativeFactoryCalls).toBeGreaterThan(0); expect(fetches).toHaveLength(15);
    await noEffects();
    Object.assign(observations, { status: 'passed', businessEffects: 0, actionExecutions: 0, approvalRequests: 0, widgetIntents: 0, providerWrites: 0, outboundNotifications: 0, realProviderCalls: 0, priceEditPermissionGranted: false });
  }, 330000);
});
