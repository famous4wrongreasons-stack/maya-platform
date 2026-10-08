// Actual AppModule/auth/C7/C8/C9/PostgreSQL/current React proof. Only native
// provider transport and model selection are synthetic. The parent owns runs.
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import type {
  AiCoreModelDecision,
  AiCoreModelInput,
} from '../../src/ai-tools/ai-core.types';
import { CLIENT_VALUE_CLARIFICATION } from '../../src/ai-tools/owner-review-plan';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from '../../src/package5-wave1/package5-wave1.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_CLIENT_VALUE_STAGE;
const receiptPath = process.env.JEST_CLIENT_VALUE_RECEIPT;
const output = process.env.JEST_CLIENT_VALUE_OUTPUT;
if (!['prepare', 'resume'].includes(stage ?? '') || !receiptPath || !output)
  throw new Error('Use the owned client-value prepare/restart/resume driver');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_c9occ_[a-z0-9_]+$/.test(database.database))
  throw new Error('Client value requires a fresh owned c9occ proof database');
const prompts = {
  overview:
    'Объясни последний опубликованный финансовый отчёт и проверь оценки давности визитов гостей',
  scoped:
    'Объясни финансовый отчёт за 2026-10-01 по филиалу «Синтетический Север» и проверь оценки давности визитов гостей',
  corrected: 'Нет, за 2026-10-02 по филиалу «Синтетический Юг»',
  accept: 'Да, такой ограниченный обзор без дополнительных условий',
} as const;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const businessModels =
  /^(Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/;
type Projection = {
  contract: string;
  outcome: string;
  agentId: string;
  findingsCount: number;
  evidenceCount: number;
  noSideEffects?: boolean;
  executionAuthority?: boolean;
  canContact?: boolean;
};
type Reply = {
  request_id?: string;
  reply: string;
  user_turn: { turnId: string; conversationId: string };
  coordination?: {
    run_id: string;
    revision_id: string;
    revision: number;
    scope: string;
    domains: string[];
    replayed: boolean;
    current: boolean;
  };
  analysis?: Projection;
  recommendation?: Projection;
};
type Salon = { tenant: TenantFixture; user: UserFixture; branchId: string };
type Source = {
  c7Id: string;
  c7Hash: string;
  c8Id: string;
  clientId: string;
  appointmentId: string;
  day: string;
};
type Saved = {
  contract: 'maya.client-value-private-restart/1';
  database: string;
  port: string;
  pid: number;
  pgStarted: string;
  salon: Salon;
  source: Source;
  first: Reply;
  firstRequestId: string;
  firstGraphHash: string;
  conversationId: string;
  businessHash: string;
  notBefore: number;
};
type WireReply = Omit<Reply, 'analysis' | 'recommendation'> & {
  analysis?: {
    contract: string;
    outcome: string;
    agent: { agent_id: string; findings: unknown[] };
    evidence: { sourceHandles: unknown[] };
    noSideEffects: boolean;
    executionAuthority: boolean;
  };
  recommendation?: {
    contract: string;
    outcome: string;
    agent: { agent_id: string; findings: unknown[] };
    evidence: { sourceHandles: unknown[] };
    noSideEffects: boolean;
    executionAuthority: boolean;
    canContact: boolean;
  };
};
function project(body: WireReply): Reply {
  const section = (value: NonNullable<WireReply['analysis']>): Projection => ({
    contract: value.contract,
    outcome: value.outcome,
    agentId: value.agent.agent_id,
    findingsCount: value.agent.findings.length,
    evidenceCount: value.evidence.sourceHandles.length,
    noSideEffects: value.noSideEffects,
    executionAuthority: value.executionAuthority,
  });
  return {
    ...body,
    ...(body.analysis ? { analysis: section(body.analysis) } : {}),
    ...(body.recommendation
      ? {
          recommendation: {
            ...section(body.recommendation),
            canContact: body.recommendation.canContact,
          },
        }
      : {}),
  } as Reply;
}

describe('client value [actual HTTP, current React, C7/C8 owners, process and PostgreSQL restart]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let model: jest.SpyInstance, transport: jest.SpyInstance;
  const financeDays = new Map<string, string>();
  const providerReads: Array<{ tenantHash: string; route: string }> = [];
  const forbiddenEdges: string[] = [];
  const privateClientIds = new Set<string>();
  let originalSource: Source | undefined;
  let currentC8Ids: string[] = [];
  const observations: Record<string, unknown> = {
    contract: 'maya.client-value-http-proof/1',
    stage,
    status: 'incomplete',
    sourceHead: process.env.JEST_CLIENT_VALUE_SOURCE_HEAD ?? null,
    sourceDigest: process.env.JEST_CLIENT_VALUE_SOURCE_DIGEST ?? null,
    modelSelection: 'SCRIPTED_SYNTHETIC',
    realModelCalls: 0,
    providerTransport: 'FINITE_SYNTHETIC_NATIVE_YCLIENTS_GET',
    realProviderCalls: 0,
    integrationSetup: 'SYNTHETIC_ACTIVE_BINDING_NOT_A17_ACCEPTANCE',
    businessEffectAcceptance: false,
    certificate: 'NOT_ISSUED',
    proofGaps: [
      {
        case: 'expired-source-http',
        executed: false,
        reason:
          'Existing published source expiry cannot be rewritten without bypassing canonical DB invariants.',
        c7: 'prisma/migrations/20260908153000_chapter7_measurement_foundation/migration.sql:76 C7_measurement_retention_ck; :202 C7 snapshot immutable; :263 C7_measurement_publication_guard_trg',
        c8: 'prisma/migrations/20260913093000_chapter8_valuation_foundation/migration.sql:142 C8_result_time_ck; :299-300 C8 immutable result/history; :497 C8_result_write_trg',
        qualification:
          'No expiry/admission/period/hash rewrite, trigger disabling, clock mock or substituted reader. Existing unit checks remain separate.',
      },
      {
        case: 'held-work-http',
        executed: false,
        reason: 'No C9/work-store fault injection in this proof.',
      },
    ],
  };
  beforeAll(async () => {
    expect(process.env.YCLIENTS_PARTNER_TOKEN).toBeUndefined();
    process.env.YCLIENTS_PARTNER_TOKEN =
      'SYNTHETIC_CLIENT_VALUE_NO_PROVIDER_CREDENTIAL';
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    transport = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        const tenantId = url.hostname.replace(
          '.synthetic-client-value.invalid',
          '',
        );
        if (
          !financeDays.has(tenantId) ||
          url.hostname !== tenantId + '.synthetic-client-value.invalid' ||
          init?.method !== 'GET' ||
          init.body !== undefined
        ) {
          forbiddenEdges.push('unexpected-provider-or-outbound-edge');
          throw new Error(
            'Only finite synthetic finance GET transport is admitted',
          );
        }
        const route = url.pathname.replace('/api/v1/', '');
        const day = financeDays.get(tenantId)!;
        const query = Object.fromEntries(url.searchParams);
        let data: unknown;
        if (route === 'transactions/424242' || route === 'records/424242') {
          expect(query).toEqual({
            start_date: day,
            end_date: day,
            count: '200',
            page: '1',
            ...(route.startsWith('records/') ? { with_deleted: '1' } : {}),
          });
          data = route.startsWith('transactions/')
            ? [
                {
                  id: 901,
                  amount: '2000',
                  sold_item_type: 'service',
                  record_id: 801,
                  staff_id: 71,
                  account: { title: 'Synthetic account', is_cash: true },
                },
              ]
            : [
                {
                  id: 801,
                  staff_id: 71,
                  services: [{ id: 81, title: 'Synthetic service' }],
                },
              ];
        } else if (route === 'company/424242/salary/calculation/staff/71') {
          expect(query).toEqual({ date_from: day, date_to: day });
          data = {
            total_sum: { income: '500', expense: '300', balance: '200' },
          };
        } else if (route === 'book_services/424242') {
          expect(query).toEqual({});
          data = {
            services: [
              {
                id: 81,
                title: 'Synthetic service',
                price_min: 1000,
                price_max: 1000,
                seance_length: 3600,
              },
            ],
          };
        } else if (route === 'company/424242/staff') {
          expect(query).toEqual({});
          data = [{ id: 71, name: 'Synthetic master', bookable: true }];
        } else if (route === 'service_categories/424242') {
          expect(query).toEqual({});
          data = [];
        } else {
          forbiddenEdges.push('unknown-provider-read');
          throw new Error('Unexpected synthetic route');
        }
        providerReads.push({ tenantHash: hash(tenantId), route });
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data }), {
            status: 200,
          }),
        );
      });
    const owner = http.app.get(AiCoreModelService);
    model = jest
      .spyOn(owner, 'decide')
      .mockImplementation((input: AiCoreModelInput) => {
        const prompt = input.messages
          .filter((m) => m.role === 'user')
          .at(-1)?.content;
        expect(Object.values(prompts)).toContain(prompt);
        expect(input.toolResults).toEqual([]);
        expect(input.messages.every((m) => m.role === 'user')).toBe(true);
        for (const id of privateClientIds)
          expect(JSON.stringify(input)).not.toContain(id);
        if (prompt === prompts.corrected || prompt === prompts.accept) {
          const period =
            prompt === prompts.corrected ? '2026-10-01' : '2026-10-02';
          expect(input.conversationPlan?.tasks[0]).toMatchObject({
            intent: 'analytics.business_summary',
            requires_clarification: true,
            clarification_question: CLIENT_VALUE_CLARIFICATION.question,
            entities: {
              period,
              branch: expect.stringMatching(
                /^\[reference removed\]@/,
              ) as unknown,
            },
          });
          if (prompt === prompts.accept)
            observations.correctedClarificationRestoredAfterRestart = true;
        }
        const entities =
          prompt === prompts.scoped
            ? { period: '2026-10-01', branch: 'Синтетический Север' }
            : prompt === prompts.corrected
              ? { period: '2026-10-02', branch: 'Синтетический Юг' }
              : {};
        const parser = owner as unknown as {
          validatePlanningResponse(
            output: string,
            input: AiCoreModelInput,
          ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
        };
        const parsed = parser.validatePlanningResponse(
          JSON.stringify({
            semantic_plan: {
              contract: 'maya-ci/1',
              parent_request: prompt,
              language: 'ru',
              dialogue_act: 'request',
              tasks: [
                {
                  id: 'summary',
                  intent: 'analytics.business_summary',
                  entities_json: JSON.stringify(entities),
                },
                {
                  id: 'return',
                  intent: 'clients.dormant_list',
                  entities_json: '{}',
                },
              ].map((t) => ({
                ...t,
                depends_on: [],
                confidence: 0.99,
                requires_clarification: false,
                clarification_question: null,
              })),
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: null,
          }),
          input,
        );
        expect(parsed.toolCall).toBeNull();
        return Promise.resolve({
          ...parsed,
          reply: '',
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_CLIENT_VALUE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    observations.modelSelections = model?.mock.calls.length ?? 0;
    observations.syntheticProviderReads = providerReads;
    observations.syntheticTransportCalls = transport?.mock.calls.length ?? 0;
    observations.forbiddenEdges = forbiddenEdges;
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { flag: 'wx' },
    );
    jest.restoreAllMocks();
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    await http?.close();
    await db?.close();
  });
  async function postgresStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
  }
  async function salon(): Promise<Salon> {
    const tenant = await fx.tenant(
      'Client value synthetic',
      CalendarSource.EXTERNAL,
    );
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
      'analytics.business',
      'customers.core',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'UTC' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic source branch',
        timezone: 'UTC',
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        baseUrl: `https://${tenant.id}.synthetic-client-value.invalid/api/v1`,
        encryptedApiToken: db.encryption.encrypt(
          'SYNTHETIC_CLIENT_VALUE_TOKEN',
        ),
        settingsJson: {
          companyId: 424242,
          currency: 'RUB',
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: 424242,
            branchId: branch.id,
          },
        },
      },
    });
    return { tenant, user, branchId: branch.id };
  }
  async function configure(s: Salon, enabled = true) {
    const previous =
      await db.prisma.tenantBusinessConfigurationRevision.findFirst({
        where: { tenantId: s.tenant.id, namespace: 'c8_valuation' },
        orderBy: { revision: 'desc' },
      });
    const policy = {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: enabled
        ? [
            {
              ruleKey: 'barber_cadence',
              serviceScope: [],
              elapsed: { unit: 'day', count: 30 },
              comparison: 'gt',
              evidence: 'proven_attendance',
              minimumCoverage: 'PARTIAL',
            },
          ]
        : [],
      rankingObjectives: [],
      minimumEvidence: [],
      exclusions: {
        serviceScope: [],
        branchIds: [],
        subjectStates: [],
        requiredFeatures: [],
      },
      opportunityAdmission: { enabled: false, rules: [] },
      modelUse: [],
    };
    await http.app
      .get(TenantContextService)
      .runAsSystemTenant(s.tenant.id, async () =>
        http.app.get(Package5Wave1ExecutableService).execute(
          await http.app
            .get(Package5Wave1ShadowService)
            .buildGoverned(
              s.tenant.id,
              s.user.id,
              'tenant_business_configuration',
              'client-value-policy-' + randomUUID(),
              randomUUID(),
              {
                confirmed: true,
                namespace: 'c8_valuation',
                expectedRevision: previous?.revision ?? 0,
                previousRevisionId: previous?.id ?? null,
                content: policy,
              },
            ),
        ),
      );
    const current =
      await db.prisma.tenantBusinessConfigurationRevision.findFirstOrThrow({
        where: { tenantId: s.tenant.id, namespace: 'c8_valuation' },
        orderBy: { revision: 'desc' },
      });
    expect(current.revision).toBe((previous?.revision ?? 0) + 1);
    return {
      revision: current.revision,
      hash: current.contentHash,
      executionHash: hash(current.actionExecutionId),
    };
  }
  async function publishFinancial(s: Salon, addFact: boolean) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.toISOString().slice(0, 10);
    financeDays.set(s.tenant.id, day);
    if (addFact) {
      const start = new Date(date.getTime() + 12 * 3600000),
        end = new Date(start.getTime() + 3600000);
      await db.prisma.appointment.create({
        data: {
          tenantId: s.tenant.id,
          branchId: s.branchId,
          source: 'external',
          crmProvider: CrmProvider.YCLIENTS,
          crmExternalId: '801',
          staffExternalId: '71',
          serviceIds: ['81'],
          startAt: start,
          endAt: end,
          blockedStartAt: start,
          blockedEndAt: end,
          attendance: 'arrived',
          totalPriceKopecks: 12345,
          currency: 'RUB',
        },
      });
    }
    const { MeasurementReportReader } = createRequire(__filename)(
      '../../src/measurement/measurement.report',
    ) as typeof import('../../src/measurement/measurement.report');
    const report = await http.app
      .get(TenantContextService)
      .runAsSystemTenant(s.tenant.id, () =>
        http.app.get(MeasurementReportReader).snapshot(
          s.tenant.id,
          'client-value-finance-' + randomUUID(),
          {
            from: date.toISOString(),
            to: new Date(date.getTime() + 86400000 - 1).toISOString(),
          },
          new Date(),
        ),
      );
    expect(report.mode).toBe('as_reported');
    expect(report.revisionId).toEqual(expect.any(String));
    expect(report.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(providerReads.map((r) => r.route)).toEqual(
      expect.arrayContaining([
        'transactions/424242',
        'records/424242',
        'company/424242/salary/calculation/staff/71',
      ]),
    );
    return { c7Id: report.revisionId!, c7Hash: report.snapshotHash!, day };
  }
  async function publishLifecycle(s: Salon, elapsedDays: 40 | 41 = 40) {
    const client = await db.prisma.client.create({
      data: { tenantId: s.tenant.id },
    });
    privateClientIds.add(client.id);
    const start = new Date(Date.now() - elapsedDays * 86400000),
      end = new Date(start.getTime() + 3600000);
    // Explicit synthetic reconciled/local historical fact, not a booking action.
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: s.tenant.id,
        mayaClientId: client.id,
        source: 'internal',
        staffExternalId: 'synthetic',
        serviceIds: [],
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        attendance: 'arrived',
        totalPriceKopecks: 12345,
        currency: 'RUB',
      },
    });
    const token = await http.login(
      s.tenant.slug,
      s.user.email,
      s.user.password,
    );
    const response = await request(http.app.getHttpServer())
      .post('/api/analytics/valuations/compute')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subjectKind: 'client',
        subjectId: client.id,
        capability: 'dormancy/barber_cadence',
        branchIds: [],
      });
    expect(response.status).toBe(201);
    const value = response.body as {
      available: boolean;
      current: boolean;
      kind: string;
      id: string;
    };
    expect(value).toMatchObject({
      available: true,
      current: true,
      kind: 'POLICY_SIGNAL',
    });
    const source = await db.prisma.c8ResultRevision.findUniqueOrThrow({
      where: { id: value.id },
    });
    expect(source.state).toBe('PUBLISHED');
    return {
      c8Id: value.id,
      clientId: client.id,
      appointmentId: appointment.id,
    };
  }
  async function businessState(tenantId: string) {
    const where = { tenantId },
      orderBy = { id: 'asc' as const };
    return hash(
      await Promise.all([
        db.prisma.appointment.findMany({ where, orderBy }),
        db.prisma.client.findMany({ where, orderBy }),
        db.prisma.opportunity.findMany({ where, orderBy }),
        db.prisma.agentTask.findMany({ where, orderBy }),
        db.prisma.domainEvent.findMany({ where, orderBy }),
        db.prisma.actionExecution.findMany({ where, orderBy }),
        db.prisma.aiApprovalRequest.findMany({ where, orderBy }),
        db.prisma.inboxItem.findMany({ where, orderBy }),
        db.prisma.marketingCampaign.findMany({ where, orderBy }),
        db.prisma.marketingCampaignRecipient.findMany({ where, orderBy }),
        db.prisma.marketingDeliveryAttempt.findMany({ where, orderBy }),
        db.prisma.teamMessage.findMany({ where, orderBy }),
        db.prisma.operationalAlertRun.findMany({ where, orderBy }),
        db.prisma.expenseReminderRun.findMany({ where, orderBy }),
      ]),
    );
  }
  function assertNoBusinessWrites(mark: number) {
    expect(
      http.recorder
        .since(mark)
        .filter(
          (op) =>
            op.write &&
            (op.model
              ? businessModels.test(op.model)
              : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/i.test(
                  op.sql ?? '',
                )),
        ),
    ).toEqual([]);
    expect(forbiddenEdges).toEqual([]);
  }
  async function graph(
    s: Salon,
    runId: string,
    c7Id: string | null,
    c8Ids: string[],
  ) {
    const root = await db.prisma.c9Run.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(root).toMatchObject({
      tenantId: s.tenant.id,
      principalJson: { userId: s.user.id },
      currentRevision: 1,
    });
    const revisions = await db.prisma.c9StrategyRevision.findMany({
      where: { tenantId: s.tenant.id, runId },
      include: { c9PlanSteps: { orderBy: { id: 'asc' } } },
      orderBy: { revision: 'asc' },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].objectiveJson).toMatchObject({
      key: 'c9.client_return',
    });
    const refs = revisions[0].evidenceRefsJson as Array<{
      sourceType: string;
      id: string;
    }>;
    expect(refs.map((r) => r.sourceType)).toEqual(
      c8Ids.map(() => 'C8ResultRevision'),
    );
    expect(refs.map((r) => r.id).sort()).toEqual([...c8Ids].sort());
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: s.tenant.id, runId },
      orderBy: { domain: 'asc' },
    });
    expect(receipts.map((r) => [r.domain, r.state])).toEqual([
      ['BUSINESS_INTELLIGENCE', 'SETTLED'],
      ['CLIENT_LIFECYCLE', 'SETTLED'],
    ]);
    expect(receipts[0].resultJson).toMatchObject({
      contract: 'maya.c9-bi-report-receipt/1',
      sourceCount: c7Id ? 1 : 0,
    });
    expect(receipts[1].resultJson).toMatchObject({
      contract: 'maya.c9-lifecycle-receipt/1',
      revisionId: revisions[0].id,
    });
    const biRefs = receipts[0].inputEvidenceRefsJson as Array<{
      sourceType: string;
      id: string;
      identityHash: string;
      inputHash: string;
    }>;
    expect(biRefs.map((r) => [r.sourceType, r.id])).toEqual(
      c7Id ? [['MeasurementRevision', c7Id]] : [],
    );
    if (c7Id) {
      const source = await db.prisma.measurementRevision.findUniqueOrThrow({
        where: { id: c7Id },
      });
      expect(source).toMatchObject({
        tenantId: s.tenant.id,
        state: 'PUBLISHED',
        kind: 'business_period',
      });
      expect(biRefs[0]).toMatchObject({
        identityHash: source.identityHash,
        inputHash: source.intentHash,
      });
      expect(receipts[0].retentionUntil.getTime()).toBeLessThanOrEqual(
        source.expiresAt.getTime(),
      );
    }
    // Private subjects may occur in source refs. Their public answer/receipt must not contain them.
    for (const id of privateClientIds)
      expect(JSON.stringify(receipts.map((r) => r.resultJson))).not.toContain(
        id,
      );
    return hash({ root, revisions, receipts });
  }
  function assertReply(
    body: Reply,
    outcome: string,
    financial = true,
    replayed = false,
  ) {
    expect(body.coordination).toMatchObject({
      scope: 'explicit_business_lifecycle',
      domains: ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
      revision: 1,
      current: false,
      replayed,
    });
    expect(body.analysis).toMatchObject({
      contract: 'maya.c9-bi-report-response/1',
      agentId: 'BUSINESS_INTELLIGENCE',
      evidenceCount: financial ? 1 : 0,
    });
    expect(body.recommendation).toMatchObject({
      contract: 'maya.c9-lifecycle-response/1',
      agentId: 'CLIENT_LIFECYCLE',
      outcome,
      noSideEffects: true,
      executionAuthority: false,
      canContact: false,
    });
    for (const text of [
      'разные периоды наблюдения',
      'не список уникальных клиентов',
      'разрешения на контакт нет',
      'не устанавливает ценность этих гостей',
      'вероятность возврата',
      'версия 1',
    ])
      expect(body.reply).toContain(text);
    if (financial) expect(body.reply).toContain('123,45');
    else
      expect(body.reply).toContain(
        'Это не означает нулевую выручку или прибыль',
      );
    for (const id of privateClientIds)
      expect(JSON.stringify(body)).not.toContain(id);
    if (['UNAVAILABLE', 'UNCONFIGURED', 'STALE'].includes(outcome))
      expect(body.recommendation!.findingsCount).toBe(0);
  }
  async function chat(
    s: Salon,
    requestId: string = randomUUID(),
    conversationId?: string,
  ) {
    const token = await http.login(
      s.tenant.slug,
      s.user.email,
      s.user.password,
    );
    const before = await businessState(s.tenant.id),
      mark = http.recorder.mark(),
      modelBefore = model.mock.calls.length,
      providerBefore = providerReads.length;
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId,
        ...(conversationId ? { conversationId } : {}),
        messages: [{ role: 'user', content: prompts.overview }],
      });
    expect(response.status).toBe(201);
    expect(model.mock.calls.length - modelBefore).toBe(1);
    expect(providerReads).toHaveLength(providerBefore);
    assertNoBusinessWrites(mark);
    expect(await businessState(s.tenant.id)).toBe(before);
    return project(response.body as WireReply);
  }
  async function boundaries() {
    const other = await salon();
    const noSources = await chat(other);
    assertReply(noSources, 'UNCONFIGURED', false);
    await graph(other, noSources.coordination!.run_id, null, []);
    expect(noSources.reply).not.toContain('123,45');
    const ownerToken = await http.login(
      other.tenant.slug,
      other.user.email,
      other.user.password,
    );
    const foreign = await request(http.app.getHttpServer())
      .get('/api/orchestration/runs/' + saved.first.coordination!.run_id)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(foreign.status).toBe(400);
    expect(foreign.body).toMatchObject({ message: 'c9_run_authority' });
    expect(JSON.stringify(foreign.body)).not.toContain(
      saved.first.coordination!.revision_id,
    );
    const client = await fx.user(other.tenant, UserRole.CLIENT);
    const clientToken = await http.login(
      other.tenant.slug,
      client.email,
      client.password,
    );
    const before = await businessState(other.tenant.id),
      mark = http.recorder.mark(),
      readCount = providerReads.length,
      modelCount = model.mock.calls.length;
    for (const name of ['analytics.business.profit', 'clients.dormant.list']) {
      const denied = await http.executeTool(
        clientToken,
        name,
        {
          surface: 'web',
          arguments:
            name === 'analytics.business.profit' ? { period: 'today' } : {},
          idempotencyKey: randomUUID(),
        },
        randomUUID(),
      );
      expect(denied.status).toBe(403);
    }
    expect(providerReads).toHaveLength(readCount);
    expect(model.mock.calls).toHaveLength(modelCount);
    assertNoBusinessWrites(mark);
    expect(await businessState(other.tenant.id)).toBe(before);
    const policySetup = await configure(other);
    const lifecycle = await publishLifecycle(other);
    const missingFinance = await chat(other);
    assertReply(missingFinance, 'PARTIAL', false);
    await graph(other, missingFinance.coordination!.run_id, null, [
      lifecycle.c8Id,
    ]);
    observations.boundaries = {
      missingFinancialSource: true,
      remainingLifecycleAvailable: true,
      unconfiguredLifecycle: true,
      foreignRunStatus: 400,
      foreignRunCode: 'c9_run_authority',
      clientRoleStatuses: [403, 403],
      unexpectedSourceReads: 0,
      separateCanonicalPolicySetup: policySetup,
    };
  }
  async function browser() {
    const sequence =
      stage === 'prepare'
        ? ['initial', 'scoped', 'corrected', 'reload-restored']
        : ['restart-restored', 'accepted', 'unavailable'];
    const checkpoints: string[] = [];
    const browserOutput = path.join(output!, stage + '-browser');
    mkdirSync(browserOutput);
    let expectedRuns = stage === 'prepare' ? 0 : 1;
    let expectedModel = model.mock.calls.length;
    const currentC7 = saved.source.c7Id;
    let mark = http.recorder.mark(),
      baseline = await businessState(saved.salon.tenant.id);
    const providerBefore = providerReads.length;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/client-value-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve(),
        killTimer: NodeJS.Timeout | undefined;
      const fail = (error: unknown) => {
        failure ??=
          error instanceof Error
            ? error
            : new Error('Client value browser checkpoint failed');
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Client value browser deadline')),
        300000,
      );
      child.stderr!.on('data', (data: Buffer) => {
        stderr = (stderr + data.toString()).slice(-12000);
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = raw as {
              type: string;
              name: string;
              response?: Reply;
              requestId?: string;
              notBefore?: number;
            };
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                stage,
                backendOrigin: await http.listenLoopback(),
                output: browserOutput,
                email: saved.salon.user.email,
                prompts,
                firstReply: saved.first?.reply,
                initialReply: saved.first?.reply,
                pendingQuestion: CLIENT_VALUE_CLARIFICATION.question,
                clarification: CLIENT_VALUE_CLARIFICATION.question,
                correctedPrompt: prompts.corrected,
                initialRunId: saved.first?.coordination?.run_id,
                conversationId: saved.conversationId,
                notBefore: saved.notBefore,
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(sequence[checkpoints.length]);
            const name = message.name;
            if (message.notBefore) saved.notBefore = message.notBefore;
            if (['initial', 'accepted', 'unavailable'].includes(name)) {
              const body = message.response!;
              assertReply(
                body,
                name === 'unavailable' ? 'UNAVAILABLE' : 'PARTIAL',
              );
              expectedRuns++;
              expectedModel++;
              const expectedC8 = name === 'unavailable' ? [] : currentC8Ids;
              const graphHash = await graph(
                saved.salon,
                body.coordination!.run_id,
                currentC7,
                expectedC8,
              );
              if (name === 'initial') {
                saved.first = body;
                saved.firstGraphHash = graphHash;
                // Actual HTTP response correlation is passed privately by the browser.
                saved.firstRequestId = body.request_id ?? '';
                expect(saved.firstRequestId).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
                saved.conversationId = body.user_turn.conversationId;
              } else
                expect(body.coordination!.run_id).not.toBe(
                  saved.first.coordination!.run_id,
                );
              observations[name] = {
                reply: body.reply,
                runHash: hash(body.coordination!.run_id),
                revisionHash: hash(body.coordination!.revision_id),
                graphHash,
                analysis: body.analysis,
                recommendation: body.recommendation,
              };
            } else if (name === 'scoped' || name === 'corrected') {
              const body = message.response!;
              expectedModel++;
              expect(body.reply).toBe(CLIENT_VALUE_CLARIFICATION.question);
              expect(body.coordination).toBeUndefined();
              expect(body.analysis).toBeUndefined();
              expect(body.recommendation).toBeUndefined();
              expect(body.user_turn.conversationId).toBe(saved.conversationId);
              observations[name] = { reply: body.reply, runStarted: false };
            }
            expect(model.mock.calls).toHaveLength(expectedModel);
            expect(
              await db.prisma.c9Run.count({
                where: { tenantId: saved.salon.tenant.id },
              }),
            ).toBe(expectedRuns);
            expect(
              await db.prisma.c9StrategyRevision.count({
                where: { tenantId: saved.salon.tenant.id },
              }),
            ).toBe(expectedRuns);
            expect(
              await db.prisma.c9WorkReceipt.count({
                where: { tenantId: saved.salon.tenant.id },
              }),
            ).toBe(expectedRuns * 2);
            assertNoBusinessWrites(mark);
            expect(await businessState(saved.salon.tenant.id)).toBe(baseline);
            expect(providerReads).toHaveLength(providerBefore);
            if (name === 'accepted') {
              const prior = originalSource!;
              const replay = await chat(
                saved.salon,
                saved.firstRequestId,
                saved.conversationId,
              );
              expectedModel++;
              assertReply(replay, 'HISTORICAL', true, true);
              expect(replay.coordination!.run_id).toBe(
                saved.first.coordination!.run_id,
              );
              expect(replay.coordination!.revision_id).toBe(
                saved.first.coordination!.revision_id,
              );
              expect(
                await graph(
                  saved.salon,
                  saved.first.coordination!.run_id,
                  prior.c7Id,
                  [prior.c8Id],
                ),
              ).toBe(saved.firstGraphHash);
              expect(
                await db.prisma.c9Run.count({
                  where: { tenantId: saved.salon.tenant.id },
                }),
              ).toBe(expectedRuns);
              expect(
                await db.prisma.c9WorkReceipt.count({
                  where: { tenantId: saved.salon.tenant.id },
                }),
              ).toBe(expectedRuns * 2);
              observations.exactCurrentReplayAfterNewerSources = {
                sameRun: true,
                sameRevision: true,
                sameGraphHash: true,
                oldC7Selected: true,
                oldC8Selected: true,
                outcome: 'HISTORICAL',
                additionalWorkReceipts: 0,
              };
              observations.canonicalPolicyFixtureTransition = await configure(
                saved.salon,
                false,
              );
              mark = http.recorder.mark();
              baseline = await businessState(saved.salon.tenant.id);
            }
            checkpoints.push(name);
            child.send({ type: 'continue:' + name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(
          () =>
            failure
              ? reject(failure)
              : code !== 0
                ? reject(new Error('Client value browser failed: ' + stderr))
                : resolve(),
          reject,
        );
      });
    });
    expect(checkpoints).toEqual(sequence);
    observations.checkpoints = checkpoints;
    saved.businessHash = await businessState(saved.salon.tenant.id);
  }
  it('preserves separate source evidence and clarification across actual process/PG restart', async () => {
    if (stage === 'prepare') {
      const s = await salon();
      observations.canonicalPolicySetup = await configure(s);
      const source = {
        ...(await publishFinancial(s, true)),
        ...(await publishLifecycle(s)),
      };
      saved = {
        contract: 'maya.client-value-private-restart/1',
        database: database.database,
        port: database.port,
        pid: process.pid,
        pgStarted: await postgresStarted(),
        salon: s,
        source,
        first: undefined as unknown as Reply,
        firstRequestId: '',
        firstGraphHash: '',
        conversationId: '',
        businessHash: await businessState(s.tenant.id),
        notBefore: 0,
      };
      currentC8Ids = [source.c8Id];
      await browser();
      await boundaries();
      writeFileSync(receiptPath, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
      observations.restartReceiptPrivate = true;
    } else {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved.contract).toBe('maya.client-value-private-restart/1');
      expect([saved.database, saved.port]).toEqual([
        database.database,
        database.port,
      ]);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(await postgresStarted());
      privateClientIds.add(saved.source.clientId);
      expect(await businessState(saved.salon.tenant.id)).toBe(
        saved.businessHash,
      );
      expect(
        await graph(
          saved.salon,
          saved.first.coordination!.run_id,
          saved.source.c7Id,
          [saved.source.c8Id],
        ),
      ).toBe(saved.firstGraphHash);
      observations.actualProcessAndPostgresRestart = true;
      // Publish a newer C7 through its owner before any UI read. This does not
      // change source facts or the old C9 source witness.
      originalSource = { ...saved.source };
      const newer = await publishFinancial(saved.salon, false);
      expect(newer.c7Id).not.toBe(originalSource.c7Id);
      saved.source = { ...saved.source, ...newer };
      observations.newerC7Publication = {
        originalSourceHash: originalSource.c7Hash,
        newSourceHash: newer.c7Hash,
        distinctRevision: true,
      };
      const newerLifecycle = await publishLifecycle(saved.salon, 41);
      expect(newerLifecycle.c8Id).not.toBe(originalSource.c8Id);
      currentC8Ids = [originalSource.c8Id, newerLifecycle.c8Id];
      observations.newerC8Publication = {
        distinctCanonicalRevision: true,
        separateSyntheticClientAndAppointmentFixture: true,
        rawSubjectReferencesPublished: false,
      };
      await browser();
      const replay = await chat(
        saved.salon,
        saved.firstRequestId,
        saved.conversationId,
      );
      // Canonical policy changed in a separately labelled fixture step: saved
      // lifecycle facts now refuse, while exact version/source refs never change.
      assertReply(replay, 'STALE', true, true);
      expect(replay.coordination!.run_id).toBe(
        saved.first.coordination!.run_id,
      );
      expect(replay.coordination!.revision_id).toBe(
        saved.first.coordination!.revision_id,
      );
      expect(
        await graph(
          saved.salon,
          saved.first.coordination!.run_id,
          originalSource.c7Id,
          [originalSource.c8Id],
        ),
      ).toBe(saved.firstGraphHash);
      observations.exactSavedVersionReplay = {
        sameRun: true,
        sameRevision: true,
        oldC7Selected: true,
        oldC8RefsPreserved: true,
        outcome: replay.recommendation!.outcome,
        additionalWorkReceipts: 0,
      };
      const token = await http.login(
        saved.salon.tenant.slug,
        saved.salon.user.email,
        saved.salon.user.password,
      );
      await db.prisma.membership.updateMany({
        where: { tenantId: saved.salon.tenant.id, userId: saved.salon.user.id },
        data: { status: 'suspended' },
      });
      const mark = http.recorder.mark(),
        before = await businessState(saved.salon.tenant.id),
        modelBefore = model.mock.calls.length,
        readsBefore = providerReads.length;
      const revoked = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          audience: 'owner',
          requestId: randomUUID(),
          conversationId: saved.conversationId,
          messages: [{ role: 'user', content: prompts.overview }],
        });
      expect(revoked.status).toBe(403);
      expect(
        (revoked.body as { recommendation?: unknown }).recommendation,
      ).toBeUndefined();
      expect(model.mock.calls).toHaveLength(modelBefore);
      expect(providerReads).toHaveLength(readsBefore);
      assertNoBusinessWrites(mark);
      expect(await businessState(saved.salon.tenant.id)).toBe(before);
      observations.revocation = {
        status: 403,
        modelSelections: 0,
        providerReads: 0,
        factsExposed: false,
      };
    }
    expect(forbiddenEdges).toEqual([]);
    observations.runtimeBusinessWrites = 0;
    observations.outboundNotifications = 0;
    observations.status = 'passed';
  }, 420000);
});
