// Actual HTTP/auth/AppModule/C8/C9/PostgreSQL proof. The only fault seam delays
// or loses delivery AFTER a real C8 read. It never replaces a value, guard,
// store, clock, source owner, lease or constraint. Parent owns all execution.
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
import { C8ReadService } from '../../src/valuation/c8.read';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_C9_FAILURE_STAGE;
const receiptPath = process.env.JEST_C9_FAILURE_RECEIPT;
const output = process.env.JEST_C9_FAILURE_OUTPUT;
if (!['prepare', 'resume'].includes(stage ?? '') || !receiptPath || !output)
  throw new Error('Use the owned C9 failure prepare/restart/resume driver');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_c9occ_[a-z0-9_]+$/.test(database.database))
  throw new Error('C9 failure proof requires a fresh owned c9occ database');
const singlePrompt = 'Кого пора вернуть?';
const compoundPrompt =
  'Объясни последний опубликованный финансовый отчёт и проверь оценки давности визитов гостей';
const fixturePolicyScope = 'fixture:c9-failure-policy-transition';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const businessModels =
  /^(Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/;
type Salon = { tenant: TenantFixture; user: UserFixture; branchId: string };
type Source = { c8Id: string; clientId: string; sourceHash: string };
type ChatInput = {
  surface: 'web';
  requestId: string;
  messages: [{ role: 'user'; content: string }];
};
type Wire = {
  message?: string;
  reply?: string;
  coordination?: {
    run_id: string;
    revision_id: string;
    revision: number;
    current: boolean;
    replayed: boolean;
    state: string;
  };
  recommendation?: {
    outcome: string;
    agent: { findings: unknown[] };
    evidence: { sourceHandles: unknown[] };
    noSideEffects: boolean;
    executionAuthority: boolean;
    canContact: boolean;
  };
  analysis?: {
    outcome: string;
    agent: { findings: unknown[] };
    evidence: { sourceHandles: unknown[] };
  };
};
type HttpResult = { status: number; body: Wire };
type Checkpoint = {
  salon: Salon;
  source: Source;
  input: ChatInput;
  runId: string;
  workHash: string;
  evidenceHash: string;
};
type Saved = {
  contract: 'maya.c9-failure-private-restart/1';
  database: string;
  port: string;
  pid: number;
  pgStarted: string;
  sourceHead: string | null;
  sourceDigest: string | null;
  settled: Checkpoint;
  held: Checkpoint;
};
type Gate = {
  entered: Promise<void>;
  arrived(): void;
  wait(): Promise<void>;
  release(): void;
  dispose(): void;
};
function gate(): Gate {
  let arrive!: () => void, release!: () => void;
  let timer: NodeJS.Timeout | undefined;
  const entered = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    arrived: arrive,
    release,
    wait: () =>
      new Promise<void>((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('synthetic_delivery_gate_deadline')),
          4000,
        );
        void released.then(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
    dispose: () => {
      clearTimeout(timer);
      release();
    },
  };
}
async function entered(g: Gate) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      g.entered,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('synthetic_read_boundary_not_reached')),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('C9 lifecycle failure [actual HTTP, canonical work, process and PostgreSQL restart]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let model: jest.SpyInstance, transport: jest.SpyInstance;
  const listReads: string[] = [],
    snapshotReads: string[] = [],
    providerReads: string[] = [],
    forbiddenEdges: string[] = [];
  const financeDays = new Map<string, string>();
  const privateClientIds = new Set<string>();
  const gates: Gate[] = [];
  let listFault:
    | { tenantId: string; mode: 'pause' | 'lost'; gate?: Gate; used: boolean }
    | undefined;
  let snapshotFault:
    | {
        tenantId: string;
        c8Id: string;
        gate: Gate;
        count: number;
        used: boolean;
        actualHash?: string;
        deliveredHash?: string;
      }
    | undefined;
  const cases: Record<string, unknown> = {};
  const observations = {
    contract: 'maya.c9-lifecycle-failure-http-proof/1',
    stage,
    status: 'incomplete',
    sourceHead: process.env.JEST_C9_FAILURE_SOURCE_HEAD ?? null,
    sourceDigest: process.env.JEST_C9_FAILURE_SOURCE_DIGEST ?? null,
    realModelCalls: 0,
    realProviderCalls: 0,
    modelSelection: 'SCRIPTED_SYNTHETIC_COMPOUND_ONLY',
    sourceBoundary:
      'CALL_THROUGH_ACTUAL_C8_READ_THEN_SYNTHETIC_DELIVERY_PAUSE_OR_LOSS',
    qualifications: [
      'Internal historical appointment facts and active CRM binding are synthetic setup, not booking/A17 acceptance.',
      'HELD_UNKNOWN crosses actual restart; no crashed DISPATCHED worker or natural lease-expiry recovery is claimed.',
      'Lifecycle HELD replay refuses; only a new explicit request admits new discovery. No completed source receipt is guessed.',
      'Policy changes use the canonical owner in a separately labelled fixture scope. No temporal/constraint/clock edits.',
      'C7 publication uses the native YCLIENTS adapter with finite synthetic GET transport; no external network.',
    ],
    cases,
  };
  beforeAll(async () => {
    mkdirSync(output, { recursive: true });
    expect(process.env.YCLIENTS_PARTNER_TOKEN).toBeUndefined();
    process.env.YCLIENTS_PARTNER_TOKEN =
      'SYNTHETIC_C9_FAILURE_NO_PROVIDER_CREDENTIAL';
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const c8 = http.app.get(C8ReadService);
    const actualList = c8.list.bind(c8),
      actualSnapshot = c8.snapshot.bind(c8);
    jest.spyOn(c8, 'list').mockImplementation(async (...args) => {
      const value = await actualList(...args);
      listReads.push(args[0]);
      if (listFault?.tenantId === args[0] && !listFault.used) {
        const fault = listFault;
        fault.used = true;
        expect(value.items).toHaveLength(1);
        expect(value.items[0]).toMatchObject({
          current: true,
          available: true,
        });
        if (fault.mode === 'lost') throw new Error('synthetic_delivery_lost');
        fault.gate!.arrived();
        await fault.gate!.wait();
      }
      return value;
    });
    jest.spyOn(c8, 'snapshot').mockImplementation(async (...args) => {
      const value = await actualSnapshot(...args);
      snapshotReads.push(args[0]);
      const fault = snapshotFault;
      if (
        fault &&
        !fault.used &&
        args[0] === fault.tenantId &&
        args[2] === fault.c8Id
      ) {
        // The first snapshot after SETTLED is C9Sources.check; the second is
        // contextProjection's data read. Both remain genuine C8 reads.
        const work = await db.prisma.c9WorkReceipt.findFirst({
          where: {
            tenantId: fault.tenantId,
            domain: 'CLIENT_LIFECYCLE',
            state: 'SETTLED',
          },
        });
        if (work) {
          expect(
            await db.prisma.c9StrategyRevision.count({
              where: { tenantId: fault.tenantId, runId: work.runId },
            }),
          ).toBe(1);
          fault.count++;
          if (fault.count === 2) {
            fault.used = true;
            expect(value).toMatchObject({
              id: fault.c8Id,
              current: true,
              available: true,
            });
            fault.actualHash = hash(value);
            fault.gate.arrived();
            await fault.gate.wait();
            fault.deliveredHash = hash(value);
            expect(fault.deliveredHash).toBe(fault.actualHash);
          }
        }
      }
      return value;
    });
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
          '.synthetic-c9-failure.invalid',
          '',
        );
        if (
          !financeDays.has(tenantId) ||
          url.hostname !== tenantId + '.synthetic-c9-failure.invalid' ||
          init?.method !== 'GET' ||
          init.body !== undefined
        ) {
          forbiddenEdges.push('unexpected-provider-or-outbound-edge');
          throw new Error('Only finite synthetic finance GET is admitted');
        }
        const route = url.pathname.replace('/api/v1/', ''),
          day = financeDays.get(tenantId)!;
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
          throw new Error('Unexpected synthetic finance route');
        }
        providerReads.push(route);
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
        expect(
          input.messages.filter((m) => m.role === 'user').at(-1)?.content,
        ).toBe(compoundPrompt);
        expect(input.messages.every((m) => m.role === 'user')).toBe(true);
        expect(input.toolResults).toEqual([]);
        for (const id of privateClientIds)
          expect(JSON.stringify(input)).not.toContain(id);
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
              parent_request: compoundPrompt,
              language: 'ru',
              dialogue_act: 'request',
              tasks: ['analytics.business_summary', 'clients.dormant_list'].map(
                (intent, index) => ({
                  id: 'task' + index,
                  intent,
                  entities_json: '{}',
                  depends_on: [],
                  confidence: 0.99,
                  requires_clarification: false,
                  clarification_question: null,
                }),
              ),
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
          model: 'SCRIPTED_SYNTHETIC_C9_FAILURE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved).toMatchObject({
        contract: 'maya.c9-failure-private-restart/1',
        database: database.database,
        port: database.port,
        sourceHead: observations.sourceHead,
        sourceDigest: observations.sourceDigest,
      });
      expect(process.pid).not.toBe(saved.pid);
      expect(await pgStarted()).not.toBe(saved.pgStarted);
      privateClientIds.add(saved.settled.source.clientId);
      privateClientIds.add(saved.held.source.clientId);
      cases.restart = {
        nodePidChanged: true,
        postgresPostmasterChanged: true,
        exactSourceBinding: true,
      };
    }
  });
  afterAll(async () => {
    for (const g of gates) g.dispose();
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(
        {
          ...observations,
          modelSelections: model?.mock.calls.length ?? 0,
          actualC8ListReads: listReads.length,
          actualC8SnapshotReads: snapshotReads.length,
          syntheticNativeProviderReads: providerReads,
          transportCalls: transport?.mock.calls.length ?? 0,
          forbiddenEdges,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    jest.restoreAllMocks();
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    await http?.close();
    await db?.close();
  });
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
  }
  function newInput(compound = false): ChatInput {
    return {
      surface: 'web',
      requestId: randomUUID(),
      messages: [
        { role: 'user', content: compound ? compoundPrompt : singlePrompt },
      ],
    };
  }
  async function login(s: Salon) {
    return http.login(s.tenant.slug, s.user.email, s.user.password);
  }
  async function chat(token: string, input: ChatInput): Promise<HttpResult> {
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .timeout({ response: 20000, deadline: 25000 });
    for (const id of privateClientIds)
      expect(JSON.stringify(response.body)).not.toContain(id);
    return { status: response.status, body: response.body as Wire };
  }
  async function salon(finance = false): Promise<Salon> {
    const tenant = await fx.tenant(
      'C9 failure synthetic',
      finance ? CalendarSource.EXTERNAL : CalendarSource.INTERNAL,
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
        name: 'Synthetic C9 failure branch',
        timezone: 'UTC',
      },
    });
    if (finance)
      await db.prisma.crmIntegration.create({
        data: {
          tenantId: tenant.id,
          provider: CrmProvider.YCLIENTS,
          status: 'active',
          baseUrl: `https://${tenant.id}.synthetic-c9-failure.invalid/api/v1`,
          encryptedApiToken: db.encryption.encrypt(
            'SYNTHETIC_C9_FAILURE_TOKEN',
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
    await http.recorder.within(fixturePolicyScope, () =>
      http.app
        .get(TenantContextService)
        .runAsSystemTenant(s.tenant.id, async () =>
          http.app.get(Package5Wave1ExecutableService).execute(
            await http.app
              .get(Package5Wave1ShadowService)
              .buildGoverned(
                s.tenant.id,
                s.user.id,
                'tenant_business_configuration',
                'c9-failure-policy-' + randomUUID(),
                randomUUID(),
                {
                  confirmed: true,
                  namespace: 'c8_valuation',
                  expectedRevision: previous?.revision ?? 0,
                  previousRevisionId: previous?.id ?? null,
                  content: {
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
                  },
                },
              ),
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
      contentHash: current.contentHash,
      executionHash: hash(current.actionExecutionId),
    };
  }
  async function publishLifecycle(s: Salon): Promise<Source> {
    const client = await db.prisma.client.create({
      data: { tenantId: s.tenant.id },
    });
    privateClientIds.add(client.id);
    const start = new Date(Date.now() - 40 * 86400000),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
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
    const response = await request(http.app.getHttpServer())
      .post('/api/analytics/valuations/compute')
      .set('Authorization', `Bearer ${await login(s)}`)
      .send({
        subjectKind: 'client',
        subjectId: client.id,
        capability: 'dormancy/barber_cadence',
        branchIds: [],
      });
    expect(response.status).toBe(201);
    const value = response.body as {
      id: string;
      current: boolean;
      available: boolean;
    };
    expect(value).toMatchObject({ current: true, available: true });
    const source = await db.prisma.c8ResultRevision.findUniqueOrThrow({
      where: { id: value.id },
    });
    expect(source.state).toBe('PUBLISHED');
    return { c8Id: value.id, clientId: client.id, sourceHash: hash(source) };
  }
  async function publishFinancial(s: Salon) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.toISOString().slice(0, 10);
    financeDays.set(s.tenant.id, day);
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
    const { MeasurementReportReader } = createRequire(__filename)(
      '../../src/measurement/measurement.report',
    ) as typeof import('../../src/measurement/measurement.report');
    const report = await http.app
      .get(TenantContextService)
      .runAsSystemTenant(s.tenant.id, () =>
        http.app.get(MeasurementReportReader).snapshot(
          s.tenant.id,
          'c9-failure-finance-' + randomUUID(),
          {
            from: date.toISOString(),
            to: new Date(date.getTime() + 86400000 - 1).toISOString(),
          },
          new Date(),
        ),
      );
    expect(report.mode).toBe('as_reported');
    expect(report.revisionId).toEqual(expect.any(String));
    return report.revisionId!;
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
  function noEffects(mark: number) {
    expect(
      http.recorder
        .since(mark)
        .filter(
          (op) =>
            op.write &&
            op.scope !== fixturePolicyScope &&
            (op.model
              ? businessModels.test(op.model)
              : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/i.test(
                  op.sql ?? '',
                )),
        ),
    ).toEqual([]);
    expect(forbiddenEdges).toEqual([]);
  }
  async function work(s: Salon, runId?: string) {
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: {
        tenantId: s.tenant.id,
        domain: 'CLIENT_LIFECYCLE',
        ...(runId ? { runId } : {}),
      },
    });
    expect(rows).toHaveLength(1);
    return rows[0];
  }
  async function evidence(runId: string) {
    return db.prisma.c9StrategyRevision.findMany({
      where: { runId },
      orderBy: { revision: 'asc' },
      include: { c9PlanSteps: { orderBy: { id: 'asc' } } },
    });
  }
  function refused(result: HttpResult) {
    expect(result.status).toBe(400);
    expect(result.body.message).toBe('c9_read_work_in_progress_or_unknown');
    expect(result.body.recommendation).toBeUndefined();
    expect(result.body.coordination).toBeUndefined();
  }
  function positive(result: HttpResult, replayed = false) {
    expect(result.status).toBe(201);
    expect(result.body.coordination).toMatchObject({
      revision: 1,
      current: !replayed,
      replayed,
    });
    expect(result.body.recommendation).toMatchObject({
      outcome: replayed ? 'HISTORICAL' : 'PARTIAL',
      noSideEffects: true,
      executionAuthority: false,
      canContact: false,
    });
    expect(result.body.recommendation!.agent.findings).toHaveLength(1);
  }
  async function checkpoint(
    s: Salon,
    source: Source,
    input: ChatInput,
  ): Promise<Checkpoint> {
    const row = await work(s);
    return {
      salon: s,
      source,
      input,
      runId: row.runId,
      workHash: hash(row),
      evidenceHash: hash(await evidence(row.runId)),
    };
  }
  function observed(result: HttpResult) {
    return {
      status: result.status,
      code: result.body.message ?? null,
      reply: result.body.reply ?? null,
      current: result.body.coordination?.current ?? null,
      outcome: result.body.recommendation?.outcome ?? null,
      findingsCount: result.body.recommendation?.agent.findings.length ?? 0,
      financialFindingsCount: result.body.analysis?.agent.findings.length ?? 0,
    };
  }
  if (stage === 'prepare')
    it('A/B: concurrent duplicate is held; lost delivery persists HELD_UNKNOWN without a guessed receipt', async () => {
      const s = await salon();
      await configure(s);
      const source = await publishLifecycle(s),
        token = await login(s);
      const input = newInput(),
        g = gate();
      gates.push(g);
      listFault = {
        tenantId: s.tenant.id,
        mode: 'pause',
        gate: g,
        used: false,
      };
      const before = await businessState(s.tenant.id),
        mark = http.recorder.mark(),
        reads = listReads.length;
      const pending = chat(token, input);
      let completed: HttpResult;
      try {
        await entered(g);
        const dispatched = await work(s);
        expect(dispatched).toMatchObject({
          state: 'DISPATCHED',
          leaseGeneration: 1,
          resultJson: null,
        });
        expect(await evidence(dispatched.runId)).toEqual([]);
        const duplicate = await chat(token, input);
        refused(duplicate);
        expect(listReads.length - reads).toBe(1);
        expect(hash(await work(s))).toBe(hash(dispatched));
        cases.concurrent = {
          duplicate: observed(duplicate),
          stateDuringPause: dispatched.state,
          leaseGeneration: dispatched.leaseGeneration,
          genuineSourceReads: 1,
        };
      } finally {
        g.release();
        completed = await pending;
      }
      positive(completed!);
      const settled = await work(s);
      expect(settled).toMatchObject({ state: 'SETTLED', leaseGeneration: 1 });
      expect(await evidence(settled.runId)).toHaveLength(1);
      noEffects(mark);
      expect(await businessState(s.tenant.id)).toBe(before);
      const settledCheckpoint = await checkpoint(s, source, input);
      cases.concurrent = {
        ...(cases.concurrent as object),
        completed: observed(completed!),
        exactlyOneWork: true,
        exactlyOneRevision: true,
        businessHashUnchanged: true,
      };

      const heldSalon = await salon();
      await configure(heldSalon);
      const heldSource = await publishLifecycle(heldSalon),
        heldToken = await login(heldSalon);
      const heldInput = newInput(),
        heldBefore = await businessState(heldSalon.tenant.id),
        heldMark = http.recorder.mark(),
        heldReads = listReads.length;
      listFault = { tenantId: heldSalon.tenant.id, mode: 'lost', used: false };
      const lost = await chat(heldToken, heldInput);
      expect(lost.status).toBe(500);
      expect(lost.body.recommendation).toBeUndefined();
      const held = await work(heldSalon);
      expect(held).toMatchObject({
        state: 'HELD_UNKNOWN',
        leaseGeneration: 1,
        resultJson: null,
        resultHash: null,
      });
      expect(await evidence(held.runId)).toEqual([]);
      const snapshots = snapshotReads.length;
      const duplicate = await chat(heldToken, heldInput);
      refused(duplicate);
      expect(listReads.length - heldReads).toBe(1);
      expect(snapshotReads).toHaveLength(snapshots);
      expect(hash(await work(heldSalon))).toBe(hash(held));
      noEffects(heldMark);
      expect(await businessState(heldSalon.tenant.id)).toBe(heldBefore);
      expect(model).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      cases.held = {
        originalStatus: 500,
        duplicate: observed(duplicate),
        state: held.state,
        leaseGeneration: 1,
        genuineSourceReads: 1,
        sourceRedispatch: 0,
        revisions: 0,
        businessHashUnchanged: true,
      };
      saved = {
        contract: 'maya.c9-failure-private-restart/1',
        database: database.database,
        port: database.port,
        pid: process.pid,
        pgStarted: await pgStarted(),
        sourceHead: observations.sourceHead,
        sourceDigest: observations.sourceDigest,
        settled: settledCheckpoint,
        held: await checkpoint(heldSalon, heldSource, heldInput),
      };
      writeFileSync(receiptPath, JSON.stringify(saved) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      observations.status = 'passed';
    }, 90000);

  if (stage === 'resume') {
    it('A/B restart: settled exact replay is historical; held exact replay refuses; new explicit request may read', async () => {
      for (const [name, savedCase] of [
        ['settled', saved.settled],
        ['held', saved.held],
      ] as const) {
        const token = await login(savedCase.salon),
          before = await businessState(savedCase.salon.tenant.id),
          mark = http.recorder.mark();
        expect(hash(await work(savedCase.salon, savedCase.runId))).toBe(
          savedCase.workHash,
        );
        expect(hash(await evidence(savedCase.runId))).toBe(
          savedCase.evidenceHash,
        );
        expect(
          hash(
            await db.prisma.c8ResultRevision.findUniqueOrThrow({
              where: { id: savedCase.source.c8Id },
            }),
          ),
        ).toBe(savedCase.source.sourceHash);
        const reads = listReads.length,
          snapshots = snapshotReads.length;
        const replay = await chat(token, savedCase.input);
        if (name === 'settled') positive(replay, true);
        else refused(replay);
        expect(listReads).toHaveLength(reads);
        if (name === 'held') expect(snapshotReads).toHaveLength(snapshots);
        expect(hash(await work(savedCase.salon, savedCase.runId))).toBe(
          savedCase.workHash,
        );
        expect(hash(await evidence(savedCase.runId))).toBe(
          savedCase.evidenceHash,
        );
        noEffects(mark);
        expect(await businessState(savedCase.salon.tenant.id)).toBe(before);
        cases[name + 'Restart'] = {
          response: observed(replay),
          exactReceiptUnchanged: true,
          savedEvidenceUnchanged: true,
          discoveryCalls: 0,
        };
      }
      const held = saved.held,
        token = await login(held.salon),
        before = await businessState(held.salon.tenant.id),
        mark = http.recorder.mark(),
        reads = listReads.length;
      const fresh = await chat(token, newInput());
      positive(fresh);
      expect(fresh.body.coordination!.run_id).not.toBe(held.runId);
      expect(listReads.length - reads).toBe(1);
      expect(hash(await work(held.salon, held.runId))).toBe(held.workHash);
      noEffects(mark);
      expect(await businessState(held.salon.tenant.id)).toBe(before);
      expect(model).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      cases.freshRequest = {
        response: observed(fresh),
        distinctExplicitRequest: true,
        heldReceiptUnchanged: true,
        genuineSourceReads: 1,
      };
    }, 90000);

    for (const compound of [false, true])
      it(`${compound ? 'D compound' : 'C standalone'}: late policy change cannot expose a previously current C8 finding`, async () => {
        const s = await salon(compound),
          firstPolicy = await configure(s),
          source = await publishLifecycle(s);
        const c7Id = compound ? await publishFinancial(s) : null;
        const token = await login(s),
          input = newInput(compound),
          g = gate();
        gates.push(g);
        const fault = {
          tenantId: s.tenant.id,
          c8Id: source.c8Id,
          gate: g,
          count: 0,
          used: false,
        } as NonNullable<typeof snapshotFault>;
        snapshotFault = fault;
        const key = compound ? 'compoundLateSource' : 'standaloneLateSource';
        const mark = http.recorder.mark(),
          reads = listReads.length,
          providerBefore = providerReads.length,
          modelBefore = model.mock.calls.length;
        let originalEvidenceHash = '',
          originalWorkHash = '',
          afterTransition = '',
          runId = '';
        const pending = chat(token, input);
        let result: HttpResult;
        try {
          await entered(g);
          expect(fault).toMatchObject({ used: true, count: 2 });
          const receipt = await work(s);
          runId = receipt.runId;
          expect(receipt).toMatchObject({
            state: 'SETTLED',
            leaseGeneration: 1,
          });
          originalWorkHash = hash(receipt);
          const revisions = await evidence(runId);
          expect(revisions).toHaveLength(1);
          expect(revisions[0].evidenceRefsJson).toEqual([
            expect.objectContaining({
              sourceType: 'C8ResultRevision',
              id: source.c8Id,
            }),
          ]);
          originalEvidenceHash = hash(revisions);
          const biWork = await db.prisma.c9WorkReceipt.findMany({
            where: {
              tenantId: s.tenant.id,
              runId,
              domain: 'BUSINESS_INTELLIGENCE',
            },
          });
          if (compound) {
            expect(biWork).toHaveLength(1);
            expect(biWork[0]).toMatchObject({
              state: 'SETTLED',
              resultJson: { sourceCount: 1 },
            });
            expect(biWork[0].inputEvidenceRefsJson).toEqual([
              expect.objectContaining({
                sourceType: 'MeasurementRevision',
                id: c7Id,
              }),
            ]);
          } else expect(biWork).toEqual([]);
          const transitionMark = http.recorder.mark();
          const nextPolicy = await configure(s, false);
          expect(nextPolicy.revision).toBe(firstPolicy.revision + 1);
          expect(nextPolicy.contentHash).not.toBe(firstPolicy.contentHash);
          afterTransition = await businessState(s.tenant.id);
          cases[key] = {
            delayedReadWasCurrentAndAvailable: true,
            postSettlementSnapshotOrdinal: 2,
            actualSnapshotHash: fault.actualHash,
            sourcePolicyBefore: firstPolicy,
            sourcePolicyAfter: nextPolicy,
            labelledFixtureWrites: http.recorder
              .since(transitionMark)
              .filter((op) => op.write && op.scope === fixturePolicyScope)
              .length,
            actualC7Publication: compound,
            immutableSourceHash: source.sourceHash,
          };
        } finally {
          g.release();
          result = await pending;
          snapshotFault = undefined;
        }
        cases[key] = {
          ...(cases[key] as object),
          response: observed(result!),
          actualValueDeliveredUnchanged:
            fault.actualHash === fault.deliveredHash,
        };
        expect(fault.deliveredHash).toBe(fault.actualHash);
        expect(hash(await work(s, runId))).toBe(originalWorkHash);
        expect(hash(await evidence(runId))).toBe(originalEvidenceHash);
        expect(
          hash(
            await db.prisma.c8ResultRevision.findUniqueOrThrow({
              where: { id: source.c8Id },
            }),
          ),
        ).toBe(source.sourceHash);
        expect(listReads.length - reads).toBe(1);
        expect(providerReads).toHaveLength(providerBefore);
        expect(model.mock.calls.length - modelBefore).toBe(compound ? 1 : 0);
        noEffects(mark);
        expect(await businessState(s.tenant.id)).toBe(afterTransition);
        // This is the RED acceptance assertion for standalone. A generic 500 or
        // unrelated refusal is NOT accepted as evidence of a correct source fence.
        if (result!.status === 400) {
          expect(result!.body.message).toBe('c9_source_changed');
          expect(result!.body.recommendation).toBeUndefined();
        } else {
          expect(result!.status).toBe(201);
          if (result!.body.recommendation) {
            expect(['STALE', 'UNAVAILABLE']).toContain(
              result!.body.recommendation.outcome,
            );
            expect(result!.body.recommendation.agent.findings).toEqual([]);
            expect(result!.body.coordination?.current).toBe(false);
          } else {
            expect(result!.body.reply).toBe(
              'Не удалось завершить проверку данных для этого запроса. Подтверждённого ответа пока нет.',
            );
            expect(result!.body.coordination?.state).toBe('UNCONFIRMED');
          }
        }
        const fresh = await chat(token, newInput());
        expect(fresh.status).toBe(201);
        expect(fresh.body.recommendation).toMatchObject({
          outcome: 'UNAVAILABLE',
          agent: { findings: [] },
        });
        expect(fresh.body.coordination?.current).toBe(false);
        noEffects(mark);
        expect(await businessState(s.tenant.id)).toBe(afterTransition);
        cases[key] = {
          ...(cases[key] as object),
          savedReceiptAndRevisionUnchanged: true,
          freshExplicitResponse: observed(fresh),
          noRuntimeBusinessWrites: true,
        };
        if (
          compound &&
          cases.freshRequest &&
          cases.standaloneLateSource &&
          (
            cases.standaloneLateSource as {
              savedReceiptAndRevisionUnchanged?: boolean;
            }
          ).savedReceiptAndRevisionUnchanged
        )
          observations.status = 'passed';
      }, 90000);
  }
});
