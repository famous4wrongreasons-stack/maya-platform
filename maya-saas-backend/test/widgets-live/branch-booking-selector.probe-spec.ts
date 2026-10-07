/** Actual guarded HTTP + PG/process restart; native YclientsCRMAdapter with
 * finite in-process synthetic transport. No real provider/model acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { ActionEngineRuntimeService } from '../../src/action-engine/action-engine.runtime';
import { CanonicalActionIngressService } from '../../src/action-engine/action-engine.ingress';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmService } from '../../src/crm/crm.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
import type { Fixtures } from './support/fixtures';
import {
  firstSlot,
  firstOption,
  object,
  list,
  observe,
  submit,
} from './support/release-booking-flow';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { openWidgetNounHandle } from '../../src/widgets/emission/seal.service';
import { asHandle } from '../../src/widgets/noun-resolution/noun-handles';
import {
  decodeBookingCatalogOwnerRef,
  decodeBookingSlotSelectionRef,
} from '../../src/widgets/booking/booking-noun-identity';

const stage = process.env.JEST_BRANCH_BOOKING_STAGE;
const ordinary = process.env.JEST_BRANCH_BOOKING_ORDINARY === '1';
const receiptPath = process.env.JEST_BRANCH_BOOKING_RECEIPT!;
const reportPath = process.env.JEST_BRANCH_BOOKING_REPORT!;
assert.ok(
  ['prepare', 'resume', 'browser'].includes(stage ?? '') &&
    receiptPath &&
    reportPath,
  'Use branch-booking-selector-proof.mjs',
);
assertProofDatabase();
type Scenario = {
  key: string;
  tenantId: string;
  slug: string;
  email: string;
  password: string;
  branchId: string;
  otherBranchId: string;
  companyId: number;
  day: string;
  clientId: string;
  linkId: string;
  userId: string;
  confirmation?: Record<string, unknown>;
  mode?: 'typed' | 'personal';
  selectionWidgetIds?: string[];
  partial?: {
    conversationId: string;
    staffEnvelope: Record<string, unknown>;
    auditRows: unknown;
    auditSha256: string;
    staffId: string;
  };
  requestKey?: string;
  previewFactsHash?: string;
  syntheticServicePrice?: number;
  originalAction?: {
    id: string;
    evidenceRefs: unknown;
    normalizedInputHash: string;
    identityFingerprint: string;
    bookingIntentHash: string | null;
  };
  expectedSelection?: {
    branchId: string;
    staffId: string;
    serviceIds: string[];
    start: string;
  };
};
type Receipt = {
  scenarios: Scenario[];
  preparePid: number;
  preparePgStart: string;
};
const origin = 'https://synthetic-branch-selector.invalid';
const binding = (s: Scenario, branchId = s.branchId) => ({
  contract: 'maya.crm-branch-binding/1',
  companyId: s.companyId,
  branchId,
});
const settings = (s: Scenario, branchId?: string) => ({
  companyId: s.companyId,
  currency: 'RUB',
  branchBinding: binding(s, branchId),
});
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

describe('Branch-preserving native booking selector [SYNTHETIC PROVIDER / ACTUAL HTTP PG]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, receipt: Receipt;
  const reads: string[] = [],
    posts: number[] = [],
    forbidden: string[] = [],
    checkpoints: string[] = [];
  const observations: Record<string, unknown> = {
    stage,
    ordinary,
    scriptedModel: ordinary || stage === 'browser',
    realProviderAcceptance: false,
    realModelAcceptance: false,
    qualification: 'NOT_ISSUED',
    transport: 'FINITE_IN_PROCESS_SYNTHETIC_NATIVE_YCLIENTS',
    modelCalls: 0,
    bookingActionCapability: 'crm.appointment.create.v1',
    setupActionsExcludedFromBookingEffectCounts: true,
  };
  const scenarios: Scenario[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    if (stage !== 'resume') {
      // Test-only provider ledger in the freshly owned proof DB; no product migration.
      await db.prisma.$executeRawUnsafe(
        'CREATE TABLE branch_selector_synthetic_posts (id bigserial primary key, company_id integer not null, payload jsonb not null)',
      );
    } else {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt;
      scenarios.push(...receipt.scenarios);
    }
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.equal(config.apiToken, 'SYNTHETIC_BRANCH_SELECTOR_USER');
        process.env.YCLIENTS_PARTNER_TOKEN =
          'SYNTHETIC_BRANCH_SELECTOR_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: origin + '/api/v1',
          });
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    const config = http.app.get(ConfigService);
    if (stage === 'browser') {
      config.set('EMAIL_LOGIN_ENABLED', 'true');
      config.set('EMAIL_AUTH_PROVIDER', 'debug');
    }
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        if (stage !== 'browser' && !ordinary) {
          forbidden.push('model');
          throw new Error('Model forbidden');
        }
        const s = scenarios.find(
          (row) =>
            row.tenantId ===
            http.app.get(TenantContextService).requireTenantId(),
        );
        assert.ok(s && (ordinary || s.mode), 'Known synthetic actor required');
        const calls = Number(observations.scriptedModelCalls ?? 0) + 1;
        assert.ok(calls <= (ordinary ? 64 : 24), 'Synthetic model bounded');
        observations.scriptedModelCalls = calls;
        if (ordinary) {
          const prompt = input.messages
            .filter((m) => m.role === 'user')
            .at(-1)?.content;
          const alternateDay = new Date(new Date(s.day).getTime() + 86400000)
            .toISOString()
            .slice(0, 10);
          const initial = [
            'Хочу записаться',
            'Запишите меня, пожалуйста',
          ].includes(prompt ?? '');
          const resume = prompt === 'Продолжим запись';
          const entities: Record<string, unknown> = {};
          if (prompt === `На ${s.day}`) entities.date_or_period = s.day;
          else if (prompt === `Лучше на ${alternateDay}`)
            entities.date_or_period = alternateDay;
          else if (prompt === 'Лучше Синтетическая борода')
            entities.services = ['Синтетическая борода'];
          else if (prompt === 'Лучше к Другой синтетический мастер')
            entities.employee = 'Другой синтетический мастер';
          else
            assert.ok(
              initial || resume,
              'Only finite explicit ordinary prompts admitted',
            );
          // The model supplies only the new utterance meaning. The real CI/owners restore preferences.
          const semanticPlan =
            new ConversationIntelligenceService().validatePlan(
              {
                dialogue_act: 'request',
                tasks: [
                  {
                    intent: initial
                      ? 'booking.prepare_personal'
                      : 'booking.find_availability',
                    entities,
                    confidence: 0.99,
                  },
                ],
              },
              input.principalRole ?? UserRole.CLIENT,
              input.tools.map((tool) => tool.name),
              input.conversationPlan,
            );
          return Promise.resolve({
            reply: '',
            semanticPlan,
            toolCall:
              input.toolResults.length || resume
                ? null
                : {
                    name: initial
                      ? 'catalog.services.read'
                      : 'booking.availability.read',
                    arguments: {},
                  },
            provider: 'openai',
            model: 'SCRIPTED_SYNTHETIC_ORDINARY_BOOKING',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          });
        }
        return Promise.resolve({
          reply: input.toolResults.length ? 'Выберите время для записи.' : '',
          toolCall: input.toolResults.length
            ? null
            : s.mode === 'typed'
              ? {
                  name: 'booking.availability.read',
                  arguments: {
                    date: s.day,
                    staff_id: '71',
                    service_ids: ['81'],
                    branch_id: s.branchId,
                  },
                }
              : { name: 'catalog.services.read', arguments: {} },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_BRANCH_BOOKING',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== origin) {
        forbidden.push('external-network');
        throw new Error('External network forbidden');
      }
      const route = url.pathname.replace('/api/v1/', '');
      const method = init?.method ?? 'GET';
      const companyId = Number(
        route.split('/').find((part) => /^42\d{4}$/.test(part)),
      );
      const s = scenarios.find(
        (candidate) => candidate.companyId === companyId,
      );
      let data: unknown;
      if (method === 'POST' && route === `book_record/${companyId}` && s) {
        assert.equal(typeof init?.body, 'string');
        const payload = JSON.parse(init!.body as string) as {
          appointments: {
            services: number[];
            staff_id: number;
            datetime: string;
          }[];
          notify_by_sms: number;
          notify_by_email: number;
        };
        expect(payload.appointments).toHaveLength(1);
        const expected = s.expectedSelection ?? {
          branchId: s.branchId,
          staffId: '71',
          serviceIds: ['81'],
          start: s.day + 'T07:00:00.000Z',
        };
        expect(expected.branchId).toBe(s.branchId);
        const formatted = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Europe/Moscow',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
          .format(new Date(expected.start))
          .replace(' ', 'T');
        expect(payload.appointments[0]).toMatchObject({
          services: expected.serviceIds.map(Number),
          staff_id: Number(expected.staffId),
          datetime: formatted,
        });
        expect(payload.notify_by_email).toBe(0);
        expect(payload.notify_by_sms).toBe(0);
        const rows = await db.prisma.$queryRaw<
          { id: bigint }[]
        >`INSERT INTO branch_selector_synthetic_posts(company_id, payload) VALUES (${companyId}, ${JSON.stringify(payload)}::jsonb) RETURNING id`;
        posts.push(companyId);
        if (['unknown', 'unknown-restart'].includes(s.key))
          throw new TypeError('fetch failed after synthetic ledger persisted');
        data = [{ id: 1, record_id: Number(rows[0].id) + 5000 }];
      } else if (
        method === 'POST' &&
        route === `company/${companyId}/clients/search` &&
        s &&
        ['unknown', 'unknown-restart'].includes(s.key)
      ) {
        // Native reconciliation uses an HTTP POST for a read-only search. No ledger write.
        assert.equal(typeof init?.body, 'string');
        const query = JSON.parse(init!.body as string) as Record<
          string,
          unknown
        >;
        expect(query).toMatchObject({
          fields: ['id', 'name', 'phone'],
          page: 1,
          page_size: 8,
        });
        observations.syntheticReadOnlySearchPosts =
          Number(observations.syntheticReadOnlySearchPosts ?? 0) + 1;
        return new Response(
          JSON.stringify({
            success: false,
            meta: { message: 'synthetic reconciliation unavailable' },
          }),
          { status: 503 },
        );
      } else if (method === 'GET' && init?.body === undefined) {
        reads.push(route);
        const company = {
          id: companyId,
          title: 'Synthetic salon',
          timezone_name: 'Europe/Moscow',
        };
        if (route === 'companies')
          data = scenarios.map((row) => ({
            id: row.companyId,
            title: 'Synthetic salon',
            timezone_name: 'Europe/Moscow',
          }));
        else if (s && route === `company/${companyId}`) data = company;
        else if (s && route === `book_services/${companyId}`)
          data = {
            services: [
              {
                id: 81,
                title: 'Синтетическая стрижка',
                price_min: s.syntheticServicePrice ?? 1000,
                price_max: s.syntheticServicePrice ?? 1000,
                seance_length: 1800,
              },
              {
                id: 82,
                title: 'Синтетическая борода',
                price_min: 800,
                price_max: 800,
                seance_length: 1800,
              },
            ],
          };
        else if (s && route === `service_categories/${companyId}`) data = [];
        else if (
          s &&
          [
            `company/${companyId}/staff`,
            `staff/${companyId}`,
            `book_staff/${companyId}`,
          ].includes(route)
        )
          data = [
            {
              id: 71,
              name: 'Синтетический мастер',
              bookable: true,
              fired: false,
              hidden: false,
              specialization: 'Мастер',
            },
            {
              id: 72,
              name: 'Другой синтетический мастер',
              bookable: true,
              fired: false,
              hidden: false,
              specialization: 'Мастер',
            },
          ];
        else if (
          s &&
          new RegExp(
            `^book_times/${companyId}/(?:71|72)/\\d{4}-\\d{2}-\\d{2}$`,
          ).test(route)
        )
          data = [
            { time: '10:00', seance_length: 1800 },
            { time: '11:00', seance_length: 1800 },
          ];
        else if (
          s &&
          route === `records/${companyId}` &&
          ['unknown', 'unknown-restart'].includes(s.key)
        )
          return new Response(
            JSON.stringify({
              success: false,
              meta: { message: 'synthetic reconciliation unavailable' },
            }),
            { status: 503 },
          );
        else {
          forbidden.push('unknown-provider-read:' + route);
          throw new Error('Unexpected synthetic provider read: ' + route);
        }
      } else {
        forbidden.push('unapproved-provider-write');
        throw new Error('Unexpected synthetic transport method');
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
      });
    });
  });
  afterAll(async () => {
    observations.checkpoints = checkpoints;
    observations.providerReads = reads;
    observations.syntheticPostCompanies = posts;
    observations.forbidden = forbidden;
    observations.pid = process.pid;
    if (db)
      observations.setupActionCounts = await Promise.all(
        scenarios.map(async (s) => ({
          scenario: s.mode ? `${s.mode}-${s.key}` : s.key,
          count: await db.prisma.actionExecution.count({
            where: {
              tenantId: s.tenantId,
              capability: { not: 'crm.appointment.create.v1' },
            },
          }),
        })),
      );
    writeFileSync(reportPath, JSON.stringify(observations, null, 2) + '\n', {
      mode: 0o600,
    });
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
    // Fixtures intentionally persist across owned PG restart; driver removes authority by stopping its cluster.
  });
  async function login(s: Scenario) {
    return http.login(s.slug, s.email, s.password);
  }
  async function createScenario(key: string) {
    const tenant = await fx.tenant(
      'Synthetic branch selector ' + key,
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'ai.owner',
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Синтетический филиал',
        timezone: 'Europe/Moscow',
      },
    });
    const other = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Другой синтетический филиал',
        timezone: 'Europe/Moscow',
      },
    });
    const client = await db.prisma.client.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: user.id },
    });
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: tenant.id, clientId: client.id, revokedAt: null },
    });
    const s: Scenario = {
      key,
      tenantId: tenant.id,
      slug: tenant.slug,
      email: user.email,
      password: user.password,
      userId: user.id,
      clientId: client.id,
      linkId: link.id,
      branchId: branch.id,
      otherBranchId: other.id,
      companyId: 420001 + scenarios.length,
      day: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    };
    scenarios.push(s);
    const token = await http.login(tenant.slug, owner.email, owner.password);
    const connect = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/connect')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({
        provider: 'yclients',
        apiToken: 'SYNTHETIC_BRANCH_SELECTOR_USER',
        settingsJson: settings(s),
      });
    expect(connect.status).toBe(201);
    const activate = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/activate')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(activate.status).toBe(201);
    expect(
      (
        await db.prisma.crmIntegration.findUniqueOrThrow({
          where: { tenantId: s.tenantId },
        })
      ).status,
    ).toBe('active');
    await db.prisma.tenant.update({
      where: { id: s.tenantId },
      data: { defaultTimezone: 'UTC' },
    });
    return s;
  }
  async function slots(
    s: Scenario,
    token: string,
    branchId = s.branchId,
    day = s.day,
  ) {
    return http.executeTool(
      token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          branch_id: branchId,
          staff_id: '71',
          service_ids: ['81'],
          date: day,
        },
      },
      randomUUID(),
    );
  }
  async function selector(s: Scenario, token: string) {
    const read = await slots(s, token);
    expect(read.status).toBe(201);
    const body = object(read.body);
    expect(object(body.result).timezone).toBe('Europe/Moscow');
    const envelope = object(object(object(body.resolution).receipt).envelope);
    expect(envelope.kind).toBe('TIME_SLOT_SELECTOR');
    // Render observations belong only to SERVICE/STAFF_SELECTOR; TIME_SLOT is not that lifecycle.
    expect(
      (await http.resolveWidgets(token, { thread_page: { limit: 50 } })).status,
    ).toBe(200);
    return envelope;
  }
  async function preview(s: Scenario, token: string) {
    const envelope = await selector(s, token);
    const result = await submit(
      http,
      token,
      envelope,
      'DRAFT',
      firstSlot(envelope).slot_ref,
    );
    expect(result.receipt_outcome).toBe('ACCEPTED');
    const confirmation = object(result.next_envelope);
    expect(confirmation.kind).toBe('BOOKING_CONFIRMATION');
    expect(JSON.stringify(confirmation.body)).toContain('Europe/Moscow');
    expect(
      (await http.resolveWidgets(token, { thread_page: { limit: 50 } })).status,
    ).toBe(200);
    expect(
      await db.prisma.actionExecution.count({
        where: {
          tenantId: s.tenantId,
          capability: 'crm.appointment.create.v1',
        },
      }),
    ).toBe(0);
    return confirmation;
  }
  async function ledgerCount(s: Scenario) {
    const rows = await db.prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM branch_selector_synthetic_posts WHERE company_id=${s.companyId}`;
    return Number(rows[0].count);
  }
  async function assertNoEffect(s: Scenario) {
    expect(await ledgerCount(s)).toBe(0);
    expect(
      await db.prisma.actionExecution.count({
        where: {
          tenantId: s.tenantId,
          capability: 'crm.appointment.create.v1',
        },
      }),
    ).toBe(0);
    expect(
      await db.prisma.appointment.count({ where: { tenantId: s.tenantId } }),
    ).toBe(0);
  }
  async function revoke(s: Scenario) {
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: s.linkId },
    });
    const proof = randomUUID();
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () =>
        Promise.reject(new Error('Synthetic new link forbidden')),
      verifyRevocation: (supplied) =>
        supplied === proof
          ? Promise.resolve({
              tenantId: s.tenantId,
              provider: 'maya_user',
              providerSubjectHash: link.providerSubjectHash,
              linkId: link.id,
              revocationIdentityHash: hash(proof),
              actorProofHash: hash('actor:' + proof),
              reason: 'synthetic branch preview revocation',
              validUntil: new Date(Date.now() + 600000),
            })
          : Promise.reject(new Error('Unknown synthetic revocation')),
    });
    await db.tenantContext.runAsSystemTenant(s.tenantId, () =>
      owner.revoke({ proof }),
    );
  }
  const bookingWhere = (s: Scenario) => ({
    tenantId: s.tenantId,
    capability: 'crm.appointment.create.v1',
  });
  const bookingDto = (s: Scenario) => ({
    branchId: s.branchId,
    staffId: '71',
    serviceIds: ['81'],
    start: s.day + 'T07:00:00.000Z',
  });
  const personal = (
    token: string,
    route: string,
    body: Record<string, unknown>,
    key?: string,
  ) => {
    const call = request(http.app.getHttpServer())
      .post('/api/personal-client/' + route)
      .set('authorization', 'Bearer ' + token)
      .set('x-maya-authority-context', 'personal_client');
    if (key) call.set('idempotency-key', key);
    return call.send(body);
  };
  async function bookingSnapshot(s: Scenario) {
    const executions = await db.prisma.actionExecution.findMany({
      where: bookingWhere(s),
    });
    expect(executions).toHaveLength(1);
    const execution = executions[0];
    expect(execution).toMatchObject({
      dryRun: false,
      policyDecision: 'ALLOW',
      approvalDecision: 'NOT_REQUIRED',
      sourceType: 'authenticated_request',
      sourceRef: 'client-channel-link:' + s.linkId,
    });
    expect(execution.approvalRequestedAt).toBeNull();
    expect(
      await db.prisma.actionExecution.count({
        where: { ...bookingWhere(s), approvalRequestedAt: { not: null } },
      }),
    ).toBe(0);
    expect(
      await db.prisma.actionExecutionIdempotencyBinding.count({
        where: { tenantId: s.tenantId, actionExecutionId: execution.id },
      }),
    ).toBe(1);
    return execution;
  }
  async function retainSource(s: Scenario) {
    const execution = await bookingSnapshot(s);
    const refs = execution.evidenceRefsJson;
    expect(Array.isArray(refs)).toBe(true);
    expect(
      (refs as unknown[]).filter(
        (ref) =>
          typeof ref === 'string' && ref.startsWith('crm-branch-source/1:'),
      ),
    ).toHaveLength(1);
    expect(
      (refs as unknown[]).filter(
        (ref) =>
          typeof ref === 'string' &&
          ref.startsWith('booking-service-facts:v1:'),
      ),
    ).toHaveLength(1);
    s.originalAction = {
      id: execution.id,
      evidenceRefs: refs,
      normalizedInputHash: execution.normalizedInputHash,
      identityFingerprint: execution.identityFingerprint,
      bookingIntentHash: execution.bookingIntentHash,
    };
    return execution;
  }
  async function assertOriginalSource(s: Scenario) {
    const execution = await bookingSnapshot(s);
    expect({
      id: execution.id,
      evidenceRefs: execution.evidenceRefsJson,
      normalizedInputHash: execution.normalizedInputHash,
      identityFingerprint: execution.identityFingerprint,
      bookingIntentHash: execution.bookingIntentHash,
    }).toEqual(s.originalAction);
    return execution;
  }
  function catalogHandle(
    s: Scenario,
    handle: unknown,
    noun: 'service' | 'staff',
    expectedId: string,
  ) {
    expect(typeof handle).toBe('string');
    const identity = openWidgetNounHandle(asHandle(handle as string));
    expect(identity).toMatchObject({ tenantId: s.tenantId, noun });
    assert.ok(identity);
    const decoded = decodeBookingCatalogOwnerRef(identity.ownerRef);
    expect(decoded?.id).toBe(expectedId);
    expect(decoded?.scope?.branchId).toBe(s.branchId);
    expect(decoded?.scope?.branchId).not.toBe(s.otherBranchId);
    expect(decoded?.scope?.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
    return decoded!.scope!;
  }
  async function storedSelection(
    s: Scenario,
    widgetId: unknown,
    expected: {
      kind: string;
      service: string;
      staff?: string;
      day?: string;
      selectedStart?: unknown;
    },
  ) {
    expect(typeof widgetId).toBe('string');
    const row = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: s.tenantId,
        widgetId: widgetId as string,
        effect: expected.kind === 'TIME_SLOT_SELECTOR' ? 'DRAFT' : 'REFINE',
      },
      include: { emission: { include: { turn: true, renderReceipts: true } } },
    });
    expect(row.widgetKind).toBe(expected.kind);
    const nouns = object(row.frozenNounsJson);
    const scope = catalogHandle(s, nouns.service, 'service', expected.service);
    const currentRevision = await http.app
      .get(TenantContextService)
      .runAsSystemTenant(s.tenantId, () =>
        http.app
          .get(CrmService)
          .readBranchAvailabilityRevision(s.tenantId, s.branchId),
      );
    expect(scope.sourceRevision).toBe(currentRevision);
    if (expected.staff)
      expect(catalogHandle(s, nouns.staff, 'staff', expected.staff)).toEqual(
        scope,
      );
    const render = row.emission.renderReceipts.find(
      (value) => value.erasedAt === null,
    );
    assert.ok(render);
    const envelope = object(render.composedEnvelopeJson);
    if (expected.day) {
      const slots = list(object(envelope.body).groups).flatMap((group) =>
        list(object(group).slots),
      );
      expect(slots.length).toBeGreaterThan(0);
      for (const value of slots) {
        const slot = object(value);
        const identity = openWidgetNounHandle(asHandle(String(slot.slot_ref)));
        assert.ok(identity);
        expect(identity).toMatchObject({ tenantId: s.tenantId, noun: 'slot' });
        const decoded = decodeBookingSlotSelectionRef(identity.ownerRef);
        expect(decoded?.scope).toEqual(scope);
        expect(decoded?.start.slice(0, 10)).toBe(expected.day);
      }
      if (expected.selectedStart !== undefined)
        expect(
          slots.some(
            (slot) =>
              object(object(slot).start).value === expected.selectedStart,
          ),
        ).toBe(true);
    }
    return { row, envelope, scope };
  }
  async function ordinaryChat(
    token: string,
    prompt: string,
    conversationId?: string,
  ) {
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('authorization', 'Bearer ' + token)
      .send({
        surface: 'web',
        audience: 'client',
        requestId: randomUUID(),
        ...(conversationId ? { conversationId } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
    expect(response.status).toBe(201);
    return object(response.body);
  }
  const chatEnvelope = (body: Record<string, unknown>) =>
    object(object(object(body.resolution).receipt).envelope);
  async function selectionAudits(s: Scenario) {
    return db.prisma.widgetIntentSubmissionAudit.findMany({
      where: { tenantId: s.tenantId, profileId: 'canonical-booking-selection' },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        widgetId: true,
        intentTokenHash: true,
        inputsClosedJson: true,
        profileId: true,
        clientNonce: true,
        erasedAt: true,
      },
    });
  }
  async function ordinarySelectionRestart() {
    const keys = ['unfinished-selection', 'concurrent-selection'];
    if (stage === 'prepare') {
      for (const key of keys) {
        const s = await createScenario(key),
          token = await login(s);
        const service = chatEnvelope(
          await ordinaryChat(token, 'Хочу записаться'),
        );
        expect(service.kind).toBe('SERVICE_SELECTOR');
        catalogHandle(s, firstOption(service), 'service', '81');
        await observe(http, token, service);
        const chosenService = await submit(
          http,
          token,
          service,
          'REFINE',
          firstOption(service),
        );
        expect(chosenService.receipt_outcome).toBe('ACCEPTED');
        const staff = object(chosenService.next_envelope);
        expect(staff.kind).toBe('STAFF_SELECTOR');
        s.selectionWidgetIds = [
          String(service.widget_id),
          String(staff.widget_id),
        ];
        const options = list(object(staff.body).options).map(object);
        expect(options).toHaveLength(2);
        catalogHandle(s, options[0].option_id, 'staff', '71');
        catalogHandle(s, options[1].option_id, 'staff', '72');
        await observe(http, token, staff);
        let winningIndex = 0;
        if (key === 'concurrent-selection') {
          const attempts = await Promise.all(
            options.map((option) =>
              submit(http, token, staff, 'REFINE', option.option_id),
            ),
          );
          expect(
            attempts.filter((value) => value.receipt_outcome === 'ACCEPTED'),
          ).toHaveLength(1);
          winningIndex = attempts.findIndex(
            (value) => value.receipt_outcome === 'ACCEPTED',
          );
          const loser = attempts[1 - winningIndex];
          expect(loser).toMatchObject({
            outcome: 'expired',
            receipt_outcome: null,
          });
          expect(['1', '13']).toContain(loser.stopped_at_gate);
          observations.concurrentSelection = {
            acceptedRequests: 1,
            loserOutcome: loser.outcome,
            loserStoppedAtGate: loser.stopped_at_gate,
          };
        } else {
          const chosenStaff = await submit(
            http,
            token,
            staff,
            'REFINE',
            options[0].option_id,
          );
          expect(chosenStaff).toMatchObject({
            receipt_outcome: 'ACCEPTED',
            next_envelope: null,
            owner_decision: {
              kind: 'booking_selection_pending',
              next: 'date',
              reply: 'На какую дату проверить время у выбранного мастера?',
            },
          });
        }
        const stored = await storedSelection(s, staff.widget_id, {
          kind: 'STAFF_SELECTOR',
          service: '81',
        });
        const audits = await selectionAudits(s);
        expect(audits).toHaveLength(2);
        const staffAudit = audits.find(
          (audit) => audit.widgetId === staff.widget_id,
        )!;
        expect(staffAudit.inputsClosedJson).toEqual({
          staff_ref: [options[winningIndex].option_id],
        });
        for (const audit of audits) {
          expect(audit.erasedAt).toBeNull();
          expect(audit.profileId).toBe('pwa.default');
          expect(audit.clientNonce).toMatch(/^[a-f0-9-]{36}$/);
          const receipt = await db.prisma.widgetIntentReceipt.findUniqueOrThrow(
            {
              where: {
                tenantId_intentTokenHash: {
                  tenantId: s.tenantId,
                  intentTokenHash: audit.intentTokenHash,
                },
              },
            },
          );
          expect(receipt.outcome).toBe('ACCEPTED');
          expect(receipt.actionReceiptRef).toBeNull();
        }
        // An altered replay cannot become a second canonical preference.
        const changed = await submit(
          http,
          token,
          staff,
          'REFINE',
          options[1 - winningIndex].option_id,
        );
        expect(changed).toMatchObject({
          outcome: 'expired',
          stopped_at_gate: '1',
          receipt_outcome: null,
        });
        expect(await selectionAudits(s)).toEqual(audits);
        s.partial = {
          conversationId: stored.row.emission.turn.conversationId,
          staffEnvelope: staff,
          auditRows: audits,
          auditSha256: hash(JSON.stringify(audits)),
          staffId: winningIndex === 0 ? '71' : '72',
        };
        await assertNoEffect(s);
        observations[key] = {
          state: 'STAFF_SELECTED_DATE_REQUIRED',
          canonicalAcceptedPreferences: 2,
          auditSha256: s.partial.auditSha256,
          selectedStaffId: s.partial.staffId,
          alteredReplayOutcome: 'expired',
          alteredReplayAppendedCanonicalPreference: false,
          bookingActionExecutions: 0,
          syntheticBookingPosts: 0,
          noGuessedDate: true,
        };
      }
    } else {
      for (const s of scenarios.filter((row) => keys.includes(row.key))) {
        assert.ok(s.partial);
        const token = await login(s);
        expect(await selectionAudits(s)).toEqual(s.partial.auditRows);
        await assertNoEffect(s);
        const mark = reads.length;
        const time = chatEnvelope(
          await ordinaryChat(token, `На ${s.day}`, s.partial.conversationId),
        );
        expect(time.kind).toBe('TIME_SLOT_SELECTOR');
        expect(time.widget_id).not.toBe(s.partial.staffEnvelope.widget_id);
        await storedSelection(s, time.widget_id, {
          kind: 'TIME_SLOT_SELECTOR',
          service: '81',
          staff: s.partial.staffId,
          day: s.day,
        });
        expect(reads.length).toBeGreaterThan(mark);
        expect(await selectionAudits(s)).toEqual(s.partial.auditRows);
        await assertNoEffect(s);
        observations[s.key] = {
          initialState: 'STAFF_SELECTED_DATE_REQUIRED',
          state: 'FRESH_TIME_SLOT_AFTER_EXPLICIT_DAY',
          canonicalAcceptedPreferences: 2,
          originalAuditSha256: s.partial.auditSha256,
          originalAuditUnchanged: true,
          selectedStaffId: s.partial.staffId,
          freshProviderReads: reads.length - mark,
          sourceBranchRevalidated: true,
          unboundSiblingSelected: false,
          bookingActionExecutions: 0,
          syntheticBookingPosts: 0,
        };
      }
    }
    checkpoints.push(
      'Ordinary closed selection persists as preferences only; fresh explicit day revalidates the same bound branch after restart',
    );
  }
  async function ordinaryBrowserCheckpoint(
    s: Scenario,
    message: Record<string, unknown>,
  ) {
    const name = String(message.name).slice(s.key.length + 1);
    const day = new Date(new Date(s.day).getTime() + 86400000)
      .toISOString()
      .slice(0, 10);
    if (['selection', 'resumed'].includes(name)) {
      await assertNoEffect(s);
      await storedSelection(s, message.widgetId, {
        kind: 'STAFF_SELECTOR',
        service: '81',
      });
      observations[String(message.name)] = {
        state: 'SERVICE_SELECTED_STAFF_REQUIRED',
        bookingActionExecutions: 0,
        syntheticBookingPosts: 0,
      };
    } else if (
      ['date', 'service-edit', 'staff-edit', 'day-edit'].includes(name)
    ) {
      await assertNoEffect(s);
      const service = name === 'date' ? '81' : '82',
        staff = ['date', 'service-edit'].includes(name) ? '71' : '72';
      await storedSelection(s, message.widgetId, {
        kind: 'TIME_SLOT_SELECTOR',
        service,
        staff,
        day: name === 'day-edit' ? day : s.day,
        selectedStart: message.selectedStart,
      });
      observations[String(message.name)] = {
        serviceId: service,
        staffId: staff,
        day: name === 'day-edit' ? day : s.day,
        exactBoundBranchPreserved: true,
        bookingActionExecutions: 0,
        syntheticBookingPosts: 0,
      };
    } else if (name === 'preview') {
      await assertNoEffect(s);
      expect(object(message.confirmation).kind).toBe('BOOKING_CONFIRMATION');
      expect(typeof message.selectedStart).toBe('string');
      expect(String(message.selectedStart).slice(0, 10)).toBe(day);
      s.expectedSelection = {
        branchId: s.branchId,
        staffId: '72',
        serviceIds: ['82'],
        start: message.selectedStart as string,
      };
      if (s.key === 'stale')
        await db.prisma.crmIntegration.update({
          where: { tenantId: s.tenantId },
          data: { updatedAt: new Date(Date.now() + 1000) },
        });
    } else {
      expect(['result', 'reload']).toContain(name);
      if (s.key === 'stale') {
        await assertNoEffect(s);
        if (name === 'result')
          expect(message.result).toMatchObject({
            outcome: 'superseded',
            code: 'handle_stale',
            stoppedAtGate: '11',
            receiptOutcome: null,
            ownerState: null,
            hasSuccessor: false,
          });
        observations[String(message.name)] = {
          bookingActionExecutions: 0,
          syntheticBookingPosts: 0,
          ...(name === 'result'
            ? { result: message.result }
            : { noDispatchOnReload: true }),
        };
      } else {
        expect(await ledgerCount(s)).toBe(1);
        const execution = await bookingSnapshot(s);
        expect(execution).toMatchObject({
          state: s.key === 'unknown' ? 'UNKNOWN' : 'SUCCEEDED',
          executionAttemptCount: 1,
        });
        const appointments = await db.prisma.appointment.findMany({
          where: { tenantId: s.tenantId },
        });
        expect(appointments).toHaveLength(s.key === 'unknown' ? 0 : 1);
        if (s.key === 'success') {
          expect(appointments[0]).toMatchObject({
            branchId: s.branchId,
            mayaClientId: s.clientId,
            staffExternalId: '72',
            serviceIds: ['82'],
          });
          expect(appointments[0].startAt.toISOString()).toBe(
            s.expectedSelection!.start,
          );
        }
        observations[String(message.name)] = {
          state: execution.state,
          executionAttempts: 1,
          bookingActionExecutions: 1,
          syntheticBookingPosts: 1,
        };
      }
    }
  }
  async function ordinaryActionRestart() {
    observations.admissionCountBasis =
      'DISTINCT_CANONICAL_BOOKING_ACTION_ROWS_NOT_HTTP_RETRY_CALLS';
    observations.historyErasure = {
      status: 'BLOCKED_MISSING_CANONICAL_OWNER_ROUTE',
      gap: 'GAP-HISTORY-ERASE',
      fixtureErasureUsed: false,
    };
    observations.readySeam =
      'SB1_PERSONAL_HTTP_REAL_AUTHORIZED_CANONICAL_ADMISSION_THEN_SYNTHETIC_FAILURE_BEFORE_CLAIM_NOT_PRODUCTION_CRASH_EQUIVALENCE';
    const knownKeys = [
      'ready-current',
      'ready-stale',
      'ready-timezone',
      'ready-price',
      'ready-revoked',
      'unknown-restart',
    ];
    if (stage === 'prepare') {
      for (const key of knownKeys) {
        const s = await createScenario(key),
          token = await login(s);
        s.requestKey = randomUUID();
        const preview = await personal(
          token,
          'appointments/preview',
          bookingDto(s),
        );
        expect(preview.status).toBe(201);
        const previewBody = object(preview.body);
        expect(previewBody.factsHash).toMatch(/^[a-f0-9]{64}$/);
        s.previewFactsHash = String(previewBody.factsHash);
        let reply: { status: number; body: unknown };
        if (key.startsWith('ready-')) {
          const runtime = http.app.get(ActionEngineRuntimeService);
          const hold = jest
            .spyOn(runtime, 'executeWithReceipt')
            .mockImplementationOnce(async (input, handlers) => {
              expect(input.capability).toBe('crm.appointment.create.v1');
              expect(input.tenantId).toBe(s.tenantId);
              expect(typeof handlers.authorizeIngress).toBe('function');
              await handlers.authorizeIngress!();
              const admitted = await http.app
                .get(CanonicalActionIngressService)
                .createExecution(input);
              expect(admitted).toMatchObject({
                state: 'READY',
                executionAttemptCount: 0,
              });
              throw new ServiceUnavailableException(
                'synthetic_stop_after_canonical_admission_before_claim',
              );
            });
          try {
            reply = await personal(
              token,
              'appointments',
              { ...bookingDto(s), previewFactsHash: s.previewFactsHash },
              s.requestKey,
            );
          } finally {
            hold.mockRestore();
          }
          expect(reply.status).toBe(503);
          const execution = await retainSource(s);
          expect(execution).toMatchObject({
            state: 'READY',
            executionAttemptCount: 0,
          });
          expect(
            await db.prisma.actionAttempt.count({
              where: {
                tenantId: s.tenantId,
                actionExecutionId: execution.id,
                kind: 'EXECUTION',
              },
            }),
          ).toBe(0);
          expect(await ledgerCount(s)).toBe(0);
          if (key === 'ready-stale')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: { updatedAt: new Date(Date.now() + 1000) },
            });
          if (key === 'ready-timezone')
            await db.prisma.branch.update({
              where: { id: s.branchId },
              data: { timezone: 'UTC' },
            });
          if (key === 'ready-price') s.syntheticServicePrice = 1200;
          if (key === 'ready-revoked') await revoke(s);
        } else {
          reply = await personal(
            token,
            'appointments',
            { ...bookingDto(s), previewFactsHash: s.previewFactsHash },
            s.requestKey,
          );
          expect(reply).toMatchObject({
            status: 503,
            body: { error: { code: 'crm_outcome_unknown' } },
          });
          const execution = await retainSource(s);
          expect(execution).toMatchObject({
            state: 'UNKNOWN',
            executionAttemptCount: 1,
          });
          expect(await ledgerCount(s)).toBe(1);
        }
        const execution = await assertOriginalSource(s);
        observations[key] = {
          state: execution.state,
          executionAttempts: execution.executionAttemptCount,
          durableBookingAdmissions: 1,
          idempotencyBindings: 1,
          approvalRequests: 0,
          syntheticBookingPosts: await ledgerCount(s),
          originalEvidenceSha256: hash(
            JSON.stringify(execution.evidenceRefsJson),
          ),
        };
      }
      checkpoints.push(
        'Authorized canonical READY actions and an already UNKNOWN action persist before actual app/PG restart',
      );
    } else {
      for (const s of scenarios.filter((row) => knownKeys.includes(row.key))) {
        const token = await login(s),
          initial = await assertOriginalSource(s);
        expect(initial.state).toBe(
          s.key === 'unknown-restart' ? 'UNKNOWN' : 'READY',
        );
        const beforePosts = await ledgerCount(s);
        const mark = posts.length;
        const results = await request(http.app.getHttpServer())
          .get('/api/personal-client/appointments/results')
          .set('authorization', 'Bearer ' + token)
          .set('x-maya-authority-context', 'personal_client');
        if (s.key === 'ready-revoked') expect(results.status).toBe(403);
        else {
          expect(results.status).toBe(200);
          expect(object(results.body).results).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: initial.id, state: initial.state }),
            ]),
          );
        }
        expect(posts.length).toBe(mark); // Reading durable state never starts dispatch.
        const retry = await personal(
          token,
          'appointments',
          bookingDto(s),
          s.requestKey,
        );
        const expectedState =
          s.key === 'ready-current'
            ? 'SUCCEEDED'
            : ['ready-stale', 'ready-timezone', 'ready-price'].includes(s.key)
              ? 'FAILED'
              : s.key === 'ready-revoked'
                ? 'READY'
                : 'UNKNOWN';
        if (s.key === 'ready-current') expect(retry.status).toBe(201);
        else if (
          ['ready-stale', 'ready-timezone', 'ready-price'].includes(s.key)
        )
          expect(retry).toMatchObject({
            status: 409,
            body: { error: { code: 'booking_preview_stale' } },
          });
        else if (s.key === 'ready-revoked') expect(retry.status).toBe(403);
        else
          expect(retry).toMatchObject({
            status: 503,
            body: { error: { code: 'crm_outcome_unknown' } },
          });
        if (s.key === 'unknown-restart') {
          const replays = await Promise.all(
            Array.from({ length: 3 }, () =>
              personal(token, 'appointments', bookingDto(s), s.requestKey),
            ),
          );
          for (const replay of replays)
            expect(replay).toMatchObject({
              status: 503,
              body: { error: { code: 'crm_outcome_unknown' } },
            });
        }
        const final = await assertOriginalSource(s);
        expect(final.state).toBe(expectedState);
        expect(final.executionAttemptCount).toBe(
          s.key === 'ready-revoked' ? 0 : 1,
        );
        const expectedPosts =
          s.key === 'ready-current' || s.key === 'unknown-restart' ? 1 : 0;
        expect(await ledgerCount(s)).toBe(expectedPosts);
        expect(posts.length - mark).toBe(s.key === 'ready-current' ? 1 : 0);
        expect(
          await db.prisma.appointment.count({
            where: { tenantId: s.tenantId },
          }),
        ).toBe(s.key === 'ready-current' ? 1 : 0);
        observations[s.key] = {
          initialState: initial.state,
          state: final.state,
          initialSyntheticBookingPosts: beforePosts,
          totalSyntheticBookingPosts: expectedPosts,
          resumeSyntheticBookingPosts: posts.length - mark,
          durableBookingAdmissions: 1,
          idempotencyBindings: 1,
          approvalRequests: 0,
          executionAttempts: final.executionAttemptCount,
          originalSourceEvidenceUnchanged: true,
          originalEvidenceSha256: hash(JSON.stringify(final.evidenceRefsJson)),
          retryStatus: retry.status,
        };
      }
      checkpoints.push(
        'Restart READ is inert; explicit retry rechecks original source and Client authority; UNKNOWN sends no second booking POST',
      );
    }
  }
  async function browser() {
    const cases = ordinary
      ? ([
          ['typed', 'success'],
          ['typed', 'unknown'],
          ['typed', 'stale'],
        ] as const)
      : ([
          ['typed', 'success'],
          ['typed', 'removed'],
          ['typed', 'unknown'],
          ['personal', 'success'],
          ['personal', 'changed'],
        ] as const);
    for (const [mode, key] of cases) {
      const s = await createScenario(key);
      s.mode = mode;
    }
    observations.scriptedModel = true;
    observations.syntheticA18Verifier = true;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            ordinary
              ? '../maya-carrier-react/test/ordinary-booking-selector-browser-probe.mjs'
              : '../maya-carrier-react/test/branch-booking-selector-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve(),
        killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded branch browser timeout')),
        630000,
      );
      child.stderr!.on('data', (buffer: Buffer) => {
        stderr += buffer.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = object(raw);
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: path.dirname(reportPath),
                scenarios: scenarios.map((s) => ({
                  mode: s.mode,
                  initialVariant: s.key === 'unknown' ? 1 : 0,
                  key: s.key,
                  email: s.email,
                  branchId: s.branchId,
                  otherBranchId: s.otherBranchId,
                  branchName: 'Синтетический филиал',
                  otherBranchName: 'Другой синтетический филиал',
                  timezone: 'Europe/Moscow',
                  serviceName: 'Синтетическая стрижка',
                  otherServiceName: 'Синтетическая борода',
                  staffName: 'Синтетический мастер',
                  otherStaffName: 'Другой синтетический мастер',
                  serviceId: '81',
                  otherServiceId: '82',
                  staffId: '71',
                  otherStaffId: '72',
                  day: s.day,
                  alternateDay: new Date(new Date(s.day).getTime() + 86400000)
                    .toISOString()
                    .slice(0, 10),
                })),
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            const expectedNames = ordinary
              ? [
                  ...scenarios.map((s) => `${s.key}-selection`),
                  ...scenarios.flatMap((s) =>
                    [
                      'resumed',
                      'date',
                      'service-edit',
                      'staff-edit',
                      'day-edit',
                      'preview',
                      'result',
                    ].map((name) => `${s.key}-${name}`),
                  ),
                  ...scenarios.map((s) => `${s.key}-reload`),
                ]
              : [
                  ...scenarios.flatMap((s) =>
                    ['preview', 'result'].map(
                      (name) => `${s.mode}-${s.key}-${name}`,
                    ),
                  ),
                  ...scenarios.map((s) => `${s.mode}-${s.key}-reload`),
                ];
            expect(message.name).toBe(expectedNames[checkpoints.length]);
            const s = scenarios.find((row) =>
              String(message.name).startsWith(
                ordinary ? `${row.key}-` : `${row.mode}-${row.key}-`,
              ),
            )!;
            if (ordinary) {
              await ordinaryBrowserCheckpoint(s, message);
              expect(forbidden).toEqual([]);
              checkpoints.push(String(message.name));
              child.send({ type: 'continue:' + String(message.name) });
              return;
            }
            if (String(message.name).endsWith('-preview')) {
              await assertNoEffect(s);
              const selection = message.selection
                ? object(message.selection)
                : {
                    staffId: '71',
                    serviceIds: ['81'],
                    branchId: s.branchId,
                    start: message.selectedStart,
                  };
              expect(selection.branchId).toBe(s.branchId);
              expect(typeof selection.start).toBe('string');
              s.expectedSelection = selection as Scenario['expectedSelection'];
              if (s.mode === 'personal') {
                expect(selection.staffId).toBe('72');
                expect(selection.serviceIds).toEqual(['82']);
                expect(String(selection.start).slice(0, 10)).toBe(
                  new Date(new Date(s.day).getTime() + 86400000)
                    .toISOString()
                    .slice(0, 10),
                );
              }
              if (s.key === 'removed')
                await db.prisma.crmIntegration.update({
                  where: { tenantId: s.tenantId },
                  data: {
                    settingsJson: { companyId: s.companyId, currency: 'RUB' },
                  },
                });
              if (s.key === 'changed')
                await db.prisma.crmIntegration.update({
                  where: { tenantId: s.tenantId },
                  data: { updatedAt: new Date(Date.now() + 1000) },
                });
            } else if (s.key === 'removed' || s.key === 'changed') {
              await assertNoEffect(s);
            } else {
              expect(await ledgerCount(s)).toBe(1);
              const executions = await db.prisma.actionExecution.findMany({
                where: {
                  tenantId: s.tenantId,
                  capability: 'crm.appointment.create.v1',
                },
              });
              expect(executions).toHaveLength(1);
              expect(executions[0]).toMatchObject({
                state: s.key === 'unknown' ? 'UNKNOWN' : 'SUCCEEDED',
                executionAttemptCount: 1,
              });
              const appointments = await db.prisma.appointment.findMany({
                where: { tenantId: s.tenantId },
              });
              expect(appointments).toHaveLength(s.key === 'unknown' ? 0 : 1);
              if (s.key === 'success') {
                expect(appointments[0]).toMatchObject({
                  branchId: s.branchId,
                  mayaClientId: s.clientId,
                  staffExternalId: s.expectedSelection!.staffId,
                  serviceIds: s.expectedSelection!.serviceIds,
                });
                expect(appointments[0].startAt.toISOString()).toBe(
                  new Date(s.expectedSelection!.start).toISOString(),
                );
              }
              observations[String(message.name)] = {
                bookingActionExecutions: 1,
                state: executions[0].state,
                executionAttempts: 1,
                syntheticPosts: 1,
              };
            }
            expect(forbidden).toEqual([]);
            checkpoints.push(String(message.name));
            child.send({ type: 'continue:' + String(message.name) });
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
              : reject(new Error(`Browser ${code}: ${stderr.slice(-2000)}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(ordinary ? 27 : 15);
  }
  it(
    ordinary
      ? 'persists canonical ordinary preferences, READY pre-claim seam and already UNKNOWN across restart without renewed authority'
      : 'persists MINTED confirmations across restart, dispatches native POST once only after COMMIT and refuses stale scope',
    async () => {
      const pg = await db.prisma.$queryRaw<
        { started: Date }[]
      >`SELECT pg_postmaster_start_time() AS started`;
      observations.pgStart = pg[0].started.toISOString();
      if (ordinary && stage !== 'browser') {
        if (stage === 'resume') {
          expect(process.pid).not.toBe(receipt.preparePid);
          expect(pg[0].started.toISOString()).not.toBe(receipt.preparePgStart);
        }
        await ordinarySelectionRestart();
        await ordinaryActionRestart();
        if (stage === 'prepare') {
          receipt = {
            scenarios,
            preparePid: process.pid,
            preparePgStart: pg[0].started.toISOString(),
          };
          writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
        }
        expect(forbidden).toEqual([]);
        return;
      }

      if (stage === 'browser') {
        await browser();
        return;
      }
      if (stage === 'prepare') {
        for (const key of ['success', 'unknown']) {
          const s = await createScenario(key);
          s.confirmation = await preview(s, await login(s));
          await assertNoEffect(s);
        }
        expect(posts).toHaveLength(0);
        receipt = {
          scenarios,
          preparePid: process.pid,
          preparePgStart: pg[0].started.toISOString(),
        };
        writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
        checkpoints.push(
          'A17 activated exact bindings; canonical Client links; branch-local MINTED confirmations persisted with zero booking AE/provider booking effects',
        );
        observations.restartState =
          'MINTED_WIDGET_CONFIRMATION_NOT_READY_ACTION_EXECUTION';
      } else {
        expect(process.pid).not.toBe(receipt.preparePid);
        expect(pg[0].started.toISOString()).not.toBe(receipt.preparePgStart);
        for (const s of [...scenarios]) {
          const token = await login(s),
            confirmation = s.confirmation!;
          expect(
            (await http.resolveWidgets(token, { thread_page: { limit: 50 } }))
              .status,
          ).toBe(200);
          const first = await submit(http, token, confirmation, 'COMMIT');
          expect(first.receipt_outcome).toBe('ACCEPTED');
          const results = await Promise.all(
            Array.from({ length: 3 }, () =>
              submit(http, token, confirmation, 'COMMIT'),
            ),
          );
          expect(await ledgerCount(s)).toBe(1);
          const executions = await db.prisma.actionExecution.findMany({
            where: {
              tenantId: s.tenantId,
              capability: 'crm.appointment.create.v1',
            },
          });
          expect(executions).toHaveLength(1);
          expect(executions[0]).toMatchObject({
            state: s.key === 'success' ? 'SUCCEEDED' : 'UNKNOWN',
            executionAttemptCount: 1,
            capability: 'crm.appointment.create.v1',
          });
          if (s.key === 'success') {
            const appointment = await db.prisma.appointment.findFirstOrThrow({
              where: { tenantId: s.tenantId },
            });
            expect(appointment).toMatchObject({
              mayaClientId: s.clientId,
              branchId: s.branchId,
              staffExternalId: '71',
              serviceIds: ['81'],
            });
            expect(appointment.startAt.toISOString()).toBe(
              s.day + 'T07:00:00.000Z',
            );
          } else {
            expect(
              await db.prisma.appointment.count({
                where: { tenantId: s.tenantId },
              }),
            ).toBe(0);
            for (const result of [first, ...results])
              expect(JSON.stringify(result)).not.toContain(
                'Запись подтверждена.',
              );
          }
          observations[s.key] = {
            bookingActionExecutions: 1,
            state: executions[0].state,
            executionAttemptCount: executions[0].executionAttemptCount,
            syntheticPosts: await ledgerCount(s),
            replays: results.length,
          };
          checkpoints.push(
            s.key +
              ' native COMMIT exactly once; durable replay after actual restart',
          );
        }
        for (const change of [
          'mapping',
          'metadata',
          'timezone',
          'removed',
          'revoked',
          'old-slot',
        ]) {
          const s = await createScenario(change),
            token = await login(s);
          const oldSelector =
            change === 'old-slot' ? await selector(s, token) : null;
          const confirmation = oldSelector ? null : await preview(s, token);
          if (change === 'mapping' || change === 'old-slot')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: { settingsJson: settings(s, s.otherBranchId) },
            });
          else if (change === 'metadata')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: { updatedAt: new Date(Date.now() + 1000) },
            });
          else if (change === 'timezone')
            await db.prisma.branch.update({
              where: { id: s.branchId },
              data: { timezone: 'UTC' },
            });
          else if (change === 'removed')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: {
                settingsJson: { companyId: s.companyId, currency: 'RUB' },
              },
            });
          else await revoke(s);
          const result = oldSelector
            ? await submit(
                http,
                token,
                oldSelector,
                'DRAFT',
                firstSlot(oldSelector).slot_ref,
              )
            : await submit(http, token, confirmation!, 'COMMIT');
          expect(result).toMatchObject(
            change === 'revoked' || change === 'old-slot'
              ? {
                  outcome: 'terminate',
                  receipt_outcome: 'REFUSED',
                  code: 'effect_not_admissible',
                  stopped_at_gate: '13',
                  next_envelope: null,
                }
              : {
                  outcome: 'superseded',
                  receipt_outcome: null,
                  code: 'handle_stale',
                  stopped_at_gate: '11',
                  next_envelope: null,
                },
          );
          await assertNoEffect(s);
          observations[change] = {
            outcome: result.outcome,
            receiptOutcome: result.receipt_outcome,
            code: result.code,
            stoppedAtGate: result.stopped_at_gate,
            syntheticPosts: 0,
            bookingActionExecutions: 0,
          };
          checkpoints.push(change + ' refuses before AE/provider POST');
        }
        const s = await createScenario('foreign-unbound'),
          token = await login(s),
          other = scenarios[0];
        const mark = reads.length;
        for (const branchId of [other.branchId, s.otherBranchId]) {
          const refused = await slots(s, token, branchId);
          expect(refused).toMatchObject({
            status: 503,
            body: { error: { code: 'booking_branch_source_unavailable' } },
          });
          expect(object(refused.body)).not.toHaveProperty('result');
          expect(object(refused.body)).not.toHaveProperty('resolution');
        }
        // The authenticated public availability controller qualifies branch ownership
        // before entering the CRM owner; its existing foreign-branch status is 404.
        const publicForeign = await request(http.app.getHttpServer())
          .get('/api/available-slots')
          .set('Authorization', 'Bearer ' + token)
          .query({
            branchId: other.branchId,
            date: s.day,
            staffId: '71',
            serviceIds: '81',
          });
        expect(publicForeign.status).toBe(404);
        expect(reads.length).toBe(mark);
        await assertNoEffect(s);
        checkpoints.push(
          'foreign and unbound branches refused before provider GET',
        );
        observations.foreignUnbound = {
          toolForeign: 503,
          toolUnbound: 503,
          toolCode: 'booking_branch_source_unavailable',
          authenticatedPublicForeign: 404,
          providerReads: 0,
        };
      }
      expect(forbidden).toEqual([]);
    },
    stage === 'browser' ? 660000 : 120000,
  );
});
