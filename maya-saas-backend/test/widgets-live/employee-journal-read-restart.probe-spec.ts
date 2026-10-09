import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
import { decodeChatReply } from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
// Keep AppModule bootstrap ahead of the existing CRM owner import cycle.
import { CrmService } from '../../src/crm/crm.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';

const stage = process.env.JEST_EMPLOYEE_JOURNAL_STAGE;
const receipt = process.env.JEST_EMPLOYEE_JOURNAL_RECEIPT;
const output = process.env.JEST_EMPLOYEE_JOURNAL_OUTPUT;
const sourceHead = process.env.JEST_EMPLOYEE_JOURNAL_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_EMPLOYEE_JOURNAL_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use employee-journal-read-proof.mjs',
);
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_employeejournal_[a-f0-9]+$/,
);
const outputDirectory: string = output;
const receiptFile: string = receipt;
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const TENANT_TIMEZONE = 'Pacific/Honolulu';
const BRANCH_NAME = 'основной филиал';
const TOKEN = 'employee-journal-synthetic-no-credential';
const PRIVATE_FIXTURE = [
  'PRIVATE_SYNTHETIC_CLIENT',
  '+79990001122',
  'PRIVATE_SYNTHETIC_NOTE',
];
const SERVICE = 'Мужская стрижка';
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const roster = [
  { id: 71, name: 'Артём', from: '10:00', to: '20:00' },
  { id: 72, name: 'Саша Иванов', from: '11:00', to: '19:00' },
  { id: 73, name: 'Саша Петров', from: '12:00', to: '18:00' },
  { id: 74, name: 'Елена', from: '09:00', to: '17:00' },
];
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  restricted: UserFixture;
  revoked: UserFixture;
  staffActor: UserFixture;
  clientActor: UserFixture;
  branchId: string;
  otherBranchId: string;
  company: number;
};
type Scenario = {
  text: string;
  label?: string;
  employee: string;
  branch?: string;
  compound?: boolean;
};
const EXACT: Scenario = {
  text: 'Покажи записи Артёма на завтра',
  employee: 'Артём',
};
const MISSING_LINK: Scenario = {
  text: 'Покажи записи Елены на завтра',
  employee: 'Елена',
};
const AMBIGUOUS: Scenario = {
  text: 'Покажи записи Саши на завтра',
  employee: 'Саша',
};
const SELECTED: Scenario = {
  text: 'Покажи сотрудников и записи Саши Иванова на завтра в «основной филиал»',
  employee: 'Саша Иванов',
  branch: BRANCH_NAME,
  compound: true,
};
const OTHER_BRANCH: Scenario = {
  text: 'Покажи записи Артёма на завтра в «другой филиал»',
  employee: 'Артём',
  branch: 'другой филиал',
};
type Saved = {
  contract: 'synthetic-employee-journal-read-proof/1';
  database: string;
  sourceHead: string;
  sourceBindingsDigest: string;
  pid: number;
  pgStarted: string;
  day: string;
  salons: Salon[];
  requestId: string;
  conversationId: string;
  firstReply: string;
  firstEvidenceHash: string;
  runId: string;
  graph: string;
  business: string;
};

describe('employee journal actual HTTP/auth/CI/C9/native READ [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  const salons: Salon[] = [];
  let active: Scenario | undefined;
  let rosterHook: (() => Promise<void>) | undefined;
  let modelCalls = 0;
  const transport: Array<{
    tenantHash: string;
    resource: 'staff' | 'schedule' | 'records' | 'services' | 'categories';
    page?: number;
    staffId?: string;
    date?: string;
  }> = [];
  const unexpected: string[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const sourceReceipts: Array<{
    runHash: string;
    staffId: string;
    partial: boolean;
    references: Record<string, unknown>[];
  }> = [];
  const report: Record<string, unknown> = {
    contract: 'synthetic-employee-journal-read-observations/1',
    stage,
    sourceHead,
    sourceBindingsDigest,
    realHttpAuth: true,
    realC9AndRuntime: true,
    realNativeAdapter: true,
    planning: 'SCRIPTED_JSON_THROUGH_ACTUAL_PLANNER_VALIDATOR',
    syntheticTransport: true,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    browserAcceptance: false,
    utterances: [EXACT.text, AMBIGUOUS.text],
    realAnalyticsAndPeriodReader: true,
    c9ReadsPerPositive: 2,
    nativeGetCountIsNotC9ReadCount: true,
    isolatedUtterancesOnly: true,
    fullDialogueReclassification: false,
    full48Reclassification: false,
  };
  const respond = (data: unknown) =>
    new Response(JSON.stringify({ success: true, data }), { status: 200 });
  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    process.env.YCLIENTS_PARTNER_TOKEN = TOKEN;
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptFile, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-employee-journal-read-proof/1');
      assert.equal(saved.database, database.database);
      assert.equal(saved.sourceHead, sourceHead);
      assert.equal(saved.sourceBindingsDigest, sourceBindingsDigest);
      assert.notEqual(saved.pid, process.pid);
      salons.push(...saved.salons);
    }
    // No original fetch fallback: every non-enumerated call fails before I/O.
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const match = /^\/synthetic\/([^/]+)\/(.+)$/.exec(url.pathname);
      const salon = salons.find((s) => s.tenant.id === match?.[1]);
      if (
        url.origin !== 'http://127.0.0.1:9' ||
        init?.method !== 'GET' ||
        init.body !== undefined ||
        !match ||
        !salon
      ) {
        unexpected.push('unowned_or_nonread_transport');
        throw new Error('employee_journal_unexpected_transport');
      }
      if (match[2] === `company/${salon.company}/staff` && !url.search) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'staff',
        });
        const hook = rosterHook;
        rosterHook = undefined;
        await hook?.();
        return respond(
          roster.map(({ id, name }) => ({
            id,
            name,
            specialization: 'Мастер',
            bookable: true,
            fired: false,
          })),
        );
      }
      const slot =
        /^schedule\/(\d+)\/(71|72|73|74)\/(\d{4}-\d{2}-\d{2})\/\3$/.exec(
          match[2],
        );
      if (slot && Number(slot[1]) === salon.company && !url.search) {
        const member = roster.find((row) => String(row.id) === slot[2]);
        assert.ok(member);
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'schedule',
          staffId: slot[2],
          date: slot[3],
        });
        return respond([
          {
            date: slot[3],
            is_working: true,
            slots: [{ from: member.from, to: member.to }],
          },
        ]);
      }
      if (match[2] === `records/${salon.company}`) {
        const query = Object.fromEntries(url.searchParams);
        const staffId = query.staff_id;
        const page = Number(query.page);
        const partial = staffId === '72';
        expect(['71', '72']).toContain(staffId);
        expect(query).toEqual({
          start_date: tomorrow(),
          end_date: tomorrow(),
          staff_id: staffId,
          count: '200',
          page: String(page),
          with_deleted: '1',
        });
        expect(page === 1 || (partial && page === 2)).toBe(true);
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'records',
          staffId,
          date: query.start_date,
          page,
        });
        // A repeated full page is the native reader's bounded no-progress signal.
        // No CrmJournal, completeness, Analytics or period-reader owner is mocked.
        return respond(
          Array.from({ length: partial ? 200 : 2 }, (_, index) => ({
            id: 8100 + index,
            staff_id: Number(staffId),
            datetime: `${query.start_date} ${index === 0 ? '10:00' : '11:00'}:00`,
            seance_length: 1800,
            attendance: 0,
            paid_full: index === 0,
            deleted: false,
            client: {
              id: 9001 + index,
              name: PRIVATE_FIXTURE[0],
              phone: PRIVATE_FIXTURE[1],
            },
            comment: PRIVATE_FIXTURE[2],
            services: [
              { id: 81, title: SERVICE, cost: 99997, seance_length: 1800 },
            ],
          })),
        );
      }
      if (match[2] === `book_services/${salon.company}` && !url.search) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'services',
        });
        return respond({
          services: [
            {
              id: 81,
              title: SERVICE,
              price_min: 99997,
              price_max: 99997,
              seance_length: 1800,
            },
          ],
        });
      }
      if (match[2] === `service_categories/${salon.company}` && !url.search) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'categories',
        });
        return respond([]);
      }
      unexpected.push('unlisted_provider_read');
      throw new Error('employee_journal_unexpected_provider_read');
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    http.app.get(ConfigService).set('AI_CORE_MAX_TOOL_STEPS', '2');
    const model = http.app.get(AiCoreModelService);
    const parser = model as unknown as {
      validatePlanningResponse(
        output: string,
        input: AiCoreModelInput,
      ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
    };
    jest.spyOn(model, 'decide').mockImplementation((input) => {
      if (!active || input.toolResults.length > 0) {
        unexpected.push('unscripted_or_second_model_call');
        throw new Error('employee_journal_unexpected_model_call');
      }
      for (const value of [TOKEN, ...PRIVATE_FIXTURE])
        expect(JSON.stringify(input).includes(value)).toBe(false);
      modelCalls++;
      const planned = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: active.compound ? 'compound_request' : 'request',
            tasks: [
              ...(active.compound
                ? [
                    {
                      id: 'catalog',
                      intent: 'employees.list_public',
                      entities: {},
                      confidence: 1,
                    },
                  ]
                : []),
              {
                id: 'journal',
                intent: 'operations.journal_day',
                entities: {
                  employee: active.employee,
                  period: 'tomorrow',
                  ...(active.branch ? { branch: active.branch } : {}),
                },
                depends_on: active.compound ? ['catalog'] : [],
                confidence: 1,
              },
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: [],
            },
          },
          tool_call: active.compound
            ? { name: 'catalog.staff.read', arguments: {} }
            : {
                name: 'operations.journal.read',
                arguments: {
                  date: '1999-01-01',
                  staff_id: 'untrusted-model-id',
                },
              },
        }),
        input,
      );
      return Promise.resolve({
        ...planned,
        reply: 'UNVERIFIED_PLANNER_TEXT',
        provider: 'deepseek' as const,
        model: 'SCRIPTED_EMPLOYEE_JOURNAL',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  });
  afterAll(async () => {
    report.transport = transport;
    report.modelCalls = modelCalls;
    report.unexpected = unexpected;
    report.checkpoints = checkpoints;
    report.sourceReceipts = sourceReceipts;
    try {
      writeFileSync(
        path.join(outputDirectory, `${stage}-observations.json`),
        JSON.stringify(report, null, 2) + '\n',
        { mode: 0o600 },
      );
    } finally {
      try {
        await http?.close();
      } finally {
        await db?.close();
        jest.restoreAllMocks();
        delete process.env.YCLIENTS_PARTNER_TOKEN;
      }
    }
  });
  function tomorrow(timeZone = BRANCH_TIMEZONE) {
    const current = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const next = new Date(current + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ value: string }>
      >`SELECT pg_postmaster_start_time()::text AS value`
    )[0].value;
  }
  async function seed(company: number): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Employee journal synthetic',
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const restricted = await fx.user(tenant, UserRole.MANAGER);
    const revoked = await fx.user(tenant, UserRole.TENANT_OWNER);
    const staffActor = await fx.user(tenant, UserRole.STAFF);
    const clientActor = await fx.user(tenant, UserRole.CLIENT);
    for (const feature of [
      'crm.integration',
      'ai.consultant',
      'ai.admin',
      'ai.owner',
      'booking',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: TENANT_TIMEZONE },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: BRANCH_NAME,
        timezone: BRANCH_TIMEZONE,
      },
    });
    const other = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'другой филиал',
        timezone: TENANT_TIMEZONE,
      },
    });
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { userId: restricted.id, tenantId: tenant.id },
      },
      data: { branchId: other.id },
    });
    for (const member of roster) {
      const staff = await db.prisma.staff.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          title: 'Мастер',
          encryptedDisplayName: db.encryption.encrypt(member.name),
          active: true,
        },
      });
      // Deliberately unlinked: one ambiguous Sasha and the uniquely named Elena.
      if (member.id === 73 || member.id === 74) continue;
      await db.prisma.staffProviderLink.create({
        data: {
          tenantId: tenant.id,
          staffId: staff.id,
          provider: CrmProvider.YCLIENTS,
          externalId: String(member.id),
        },
      });
    }
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        encryptedApiToken: db.encryption.encrypt(TOKEN),
        baseUrl: `http://127.0.0.1:9/synthetic/${tenant.id}`,
        status: 'active',
        settingsJson: {
          companyId: company,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: company,
            branchId: branch.id,
          },
        },
      },
    });
    const salon = {
      tenant,
      owner,
      restricted,
      revoked,
      staffActor,
      clientActor,
      branchId: branch.id,
      otherBranchId: other.id,
      company,
    };
    salons.push(salon);
    return salon;
  }
  const login = (salon: Salon, user = salon.owner) =>
    http.login(salon.tenant.slug, user.email, user.password);
  async function chat(
    token: string,
    scenario: Scenario,
    requestId: string = randomUUID(),
    conversationId?: string,
  ) {
    active = scenario;
    const beforeModels = modelCalls;
    const result = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId,
        ...(conversationId ? { conversationId } : {}),
        messages: [{ role: 'user', content: scenario.text }],
      });
    active = undefined;
    const rawMessage: unknown = object(result.body).message;
    const errorMessage =
      typeof rawMessage === 'string' &&
      /^(?:(?:ai_|c9_|conversation_|typed_|staff_schedule_|journal_|booking_)[a-z0-9_]{1,100}|Unauthorized|Forbidden|Conflict)$/.test(
        rawMessage,
      )
        ? rawMessage
        : rawMessage === undefined
          ? null
          : { sha256: digest(rawMessage) };
    checkpoints.push({
      requestHash: digest(requestId),
      text: scenario.label ?? scenario.text,
      status: result.status,
      modelCalls: modelCalls - beforeModels,
      reply:
        typeof object(result.body).reply === 'string'
          ? sanitizedReply(String(object(result.body).reply))
          : null,
      grounding: object(object(result.body).grounding).status ?? null,
      errorCode: object(object(result.body).error).code ?? null,
      errorMessage,
    });
    expect(modelCalls - beforeModels).toBeLessThanOrEqual(1);
    return { status: result.status, body: object(result.body) };
  }
  function sanitizedReply(value: string) {
    const privateValues = [
      TOKEN,
      ...PRIVATE_FIXTURE,
      ...salons.flatMap((salon) => [
        salon.tenant.id,
        salon.branchId,
        salon.otherBranchId,
        salon.owner.id,
        salon.owner.email,
      ]),
    ];
    return privateValues.reduce(
      (text, privateValue) =>
        text.split(privateValue).join('[private omitted]'),
      value,
    );
  }
  async function roleRefusal(salon: Salon, actor: UserFixture) {
    const token = await login(salon, actor);
    const before = { reads: transport.length, models: modelCalls };
    const result = await request(http.app.getHttpServer())
      .post('/api/ai/tools/operations.journal.read/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        arguments: { date: tomorrow(), staff_id: '71' },
        idempotencyKey: randomUUID(),
      });
    expect(result.status).toBe(403);
    expect(transport).toHaveLength(before.reads);
    expect(modelCalls).toBe(before.models);
    const conversation = await chat(token, EXACT);
    expect([201, 401, 403]).toContain(conversation.status);
    if (conversation.status === 201) {
      expect(conversation.body.action).toBeNull();
      expect(object(conversation.body.grounding).status).toBe('blocked');
      expect(conversation.body.reply).not.toContain('10:00');
      expect(conversation.body.reply).not.toContain('Журнал на');
      expect(conversation.body.resolution).toBeUndefined();
    }
    expect(transport).toHaveLength(before.reads);
    checkpoints.push({
      boundary: 'ordinary_chat_manager_journal_refusal',
      role: actor.role,
      status: conversation.status,
      providerReadsAdded: 0,
      clientIdentityGranted: false,
    });
    checkpoints.push({
      boundary: 'direct_registered_tool_http_only',
      role: actor.role,
      managerJournalStatus: result.status,
      providerReadsAdded: 0,
      clientIdentityGranted: false,
    });
  }
  async function graph(tenantId: string) {
    return digest({
      runs: await db.prisma.c9Run.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
      }),
      work: await db.prisma.c9WorkReceipt.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
      }),
    });
  }
  async function business() {
    const ids = salons.map((s) => s.tenant.id);
    const where = { tenantId: { in: ids } };
    return digest({
      clients: await db.prisma.client.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      appointments: await db.prisma.appointment.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      actions: await db.prisma.actionExecution.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      approvals: await db.prisma.aiApprovalRequest.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      opportunities: await db.prisma.opportunity.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      tasks: await db.prisma.agentTask.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      inbox: await db.prisma.inboxItem.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      delivery: await db.prisma.marketingDeliveryAttempt.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
    });
  }
  function noWrites(mark: number) {
    const family =
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder|Client';
    const forbidden = http.recorder
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
      );
    expect(forbidden).toEqual([]);
    expect(unexpected).toEqual([]);
  }
  function assertPositive(
    response: { status: number; body: Record<string, unknown> },
    staff = roster[0],
    partial = false,
  ) {
    expect(response.status).toBe(201);
    expect(response.body.action).toBeNull();
    expect(object(response.body.grounding).status).toBe('verified');
    const [year, month, day] = tomorrow().split('-');
    expect(response.body.reply).toContain(
      `Журнал на ${day}.${month}.${year}: ${staff.name}.`,
    );
    expect(response.body.reply).toContain('10:00–10:30');
    expect(response.body.reply).toContain(SERVICE);
    expect(response.body.reply).toContain('отмечена завершённой в CRM');
    expect(response.body.reply).toContain(`Филиал: ${BRANCH_NAME}`);
    expect(response.body.reply).toContain(`Часовой пояс: ${BRANCH_TIMEZONE}`);
    expect(response.body.reply).toContain(
      'присутствие и свободные окна этим ответом не подтверждаются',
    );
    expect(response.body.reply).not.toContain(TENANT_TIMEZONE);
    expect(response.body.reply).not.toContain('UNVERIFIED');
    expect(response.body.reply).not.toContain('1999');
    expect(response.body.reply).not.toContain('99997');
    expect(response.body.reply).not.toContain('пришли');
    for (const value of PRIVATE_FIXTURE)
      expect(String(response.body.reply).includes(value)).toBe(false);
    if (partial) {
      expect(response.body.reply).toContain('Источник прочитан не полностью');
      expect(response.body.reply).toContain(
        'Показана только часть полученных записей',
      );
    } else {
      expect(response.body.reply).not.toContain(
        'Источник прочитан не полностью',
      );
      expect(response.body.reply).not.toContain('Показана только часть');
    }
    expect(response.body.resolution).toBeUndefined();
  }
  async function evidence(
    salon: Salon,
    response: Record<string, unknown>,
    staffId = '71',
    partial = false,
  ) {
    const coordination = object(response.coordination);
    expect(coordination.state).toBe('COMPLETED');
    assert.ok(typeof coordination.run_id === 'string');
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId: coordination.run_id },
      orderBy: { admittedAt: 'asc' },
    });
    expect(rows.map((row) => row.taskKey).sort()).toEqual([
      'catalog.staff.read',
      'operations.journal.read',
    ]);
    const references = [];
    for (const row of rows) {
      expect(row.state).toBe('SETTLED');
      expect(row.kind).toBe('TOOL_READ');
      const ref = object(row.resultJson);
      expect(ref.sourceType).toBe('AiToolExecution');
      assert.ok(typeof ref.executionId === 'string');
      const execution = await db.prisma.aiToolExecution.findUniqueOrThrow({
        where: { id: ref.executionId },
      });
      expect(execution).toMatchObject({
        tenantId: salon.tenant.id,
        actorUserId: salon.owner.id,
        toolName: row.taskKey,
        status: 'completed',
      });
      assert.ok(execution.encryptedResult);
      const result = object(
        JSON.parse(db.encryption.decrypt(execution.encryptedResult)) as unknown,
      );
      if (row.taskKey === 'operations.journal.read') {
        const current = await http.app
          .get(TenantContextService)
          .runAsAuthPrincipal(
            {
              tenantId: salon.tenant.id,
              userId: salon.owner.id,
              role: salon.owner.role,
            },
            () =>
              http.app
                .get(CrmService)
                .resolveStaffScheduleSource(salon.tenant.id, staffId),
          );
        expect(result).toMatchObject({
          verified: true,
          pii_redacted: true,
          appointments_returned: partial ? 100 : 2,
          appointments_truncated: partial,
          completeness: { status: partial ? 'incomplete' : 'complete' },
          date: tomorrow(),
          read_scope: {
            contract: 'maya.employee-journal-read/1',
            branch_id: salon.branchId,
            staff_id: staffId,
            source_hash: current.sourceHash,
            timezone: BRANCH_TIMEZONE,
          },
        });
      }
      if (row.taskKey === 'operations.journal.read') {
        const appointments = result.appointments;
        assert.ok(Array.isArray(appointments));
        expect(object(appointments[0])).toMatchObject({
          time: '10:00',
          end_time: '10:30',
          status: 'completed',
          services: [SERVICE],
        });
        expect(object(result.attendance).source).toBe('canonical_mirror');
        // Provider paid_full marks completed, but the canonical mirror has no observed arrivals.
        expect(object(result.attendance).state).not.toBe('measured');
        expect(object(result.attendance).arrived).toBeNull();
        expect(object(result.attendance).no_show).toBeNull();
        expect(object(result.attendance).awaiting).toBeNull();
        for (const value of PRIVATE_FIXTURE)
          expect(JSON.stringify(result).includes(value)).toBe(false);
      }
      references.push({
        workHash: digest(row.id),
        executionHash: digest(execution.id),
        taskKey: row.taskKey,
        inputHash: execution.inputHash,
        resultHash: digest(result),
      });
    }
    expect(sourceReceipts.length).toBeLessThan(8);
    sourceReceipts.push({
      runHash: digest(coordination.run_id),
      staffId,
      partial,
      references,
    });
    return coordination.run_id;
  }
  it('qualifies only actual scoped READ results, survives restart, and refuses source/authority drift', async () => {
    if (stage === 'prepare') {
      expect(tomorrow()).not.toBe(tomorrow(TENANT_TIMEZONE));
      const a = await seed(99301),
        b = await seed(99302);
      const token = await login(a),
        foreignToken = await login(b),
        restrictedToken = await login(a, a.restricted);
      const mark = http.recorder.mark(),
        before = await business();
      const requestId = randomUUID();
      const first = await chat(token, EXACT, requestId);
      assertPositive(first);
      expect(
        transport.every((row) => row.tenantHash === digest(a.tenant.id)),
      ).toBe(true);
      expect(transport.filter((row) => row.resource === 'records')).toEqual([
        {
          tenantHash: digest(a.tenant.id),
          resource: 'records',
          staffId: '71',
          date: tomorrow(),
          page: 1,
        },
      ]);
      const conversationId = object(first.body.user_turn).conversationId;
      assert.ok(typeof conversationId === 'string');
      const runId = await evidence(a, first.body);
      const firstEvidenceHash = digest(sourceReceipts.at(-1));
      const beforeReplay = transport.length;
      const graphBeforeReplay = await graph(a.tenant.id);
      const replay = await chat(token, EXACT, requestId, conversationId);
      assertPositive(replay);
      expect(await evidence(a, replay.body)).toBe(runId);
      expect(digest(sourceReceipts.at(-1))).toBe(firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(graphBeforeReplay);
      expect(transport).toHaveLength(beforeReplay);
      report.prepareReplay = {
        runHash: digest(runId),
        graphHashUnchanged: graphBeforeReplay,
      };
      const beforeAmbiguity = transport.filter(
        (r) => r.resource === 'records',
      ).length;
      const ambiguous = await chat(
        token,
        AMBIGUOUS,
        randomUUID(),
        conversationId,
      );
      expect(ambiguous.status).toBe(201);
      expect(object(ambiguous.body.grounding).status).toBe('blocked');
      expect(ambiguous.body.reply).toContain('однозначно');
      expect(transport.filter((r) => r.resource === 'records')).toHaveLength(
        beforeAmbiguity,
      );
      const selected = await chat(
        token,
        SELECTED,
        randomUUID(),
        conversationId,
      );
      assertPositive(selected, roster[1], true);
      await evidence(a, selected.body, '72', true);
      expect(
        transport
          .filter((r) => r.resource === 'records' && r.staffId === '72')
          .map((r) => r.page),
      ).toEqual([1, 2]);
      const beforeMissing = transport.filter(
        (r) => r.resource === 'records',
      ).length;
      const missing = await chat(
        token,
        MISSING_LINK,
        randomUUID(),
        conversationId,
      );
      expect(missing.status).toBe(201);
      expect(object(missing.body.grounding).status).toBe('blocked');
      expect(missing.body.reply).not.toContain('10:00');
      expect(missing.body.reply).not.toContain('записей нет');
      expect(missing.body.reply).toContain(
        'актуальные записи сейчас не подтверждены',
      );
      expect(transport.filter((r) => r.resource === 'records')).toHaveLength(
        beforeMissing,
      );
      report.missingLink = { uniquePublicName: true, journalReadsAdded: 0 };
      report.ambiguity = {
        candidateWithLink: 1,
        candidateWithoutLink: 1,
        journalReadsAdded: 0,
      };
      await roleRefusal(a, a.staffActor);
      await roleRefusal(a, a.clientActor);
      expect(
        await db.prisma.client.count({ where: { tenantId: a.tenant.id } }),
      ).toBe(0);
      const beforeBranch = transport.length;
      const branch = await chat(
        token,
        OTHER_BRANCH,
        randomUUID(),
        conversationId,
      );
      expect(branch.status).toBe(201);
      expect(object(branch.body.grounding).status).toBe('blocked');
      expect(transport).toHaveLength(beforeBranch);
      const foreignBranch = await chat(
        token,
        {
          text: `Покажи записи Артёма на завтра в филиале ${b.branchId}`,
          label: 'Foreign tenant branch preference (synthetic ID omitted)',
          employee: 'Артём',
          branch: b.branchId,
        },
        randomUUID(),
        conversationId,
      );
      expect(foreignBranch.status).toBe(201);
      expect(object(foreignBranch.body.grounding).status).toBe('blocked');
      expect(foreignBranch.body.reply).not.toContain('10:00');
      expect(transport).toHaveLength(beforeBranch);
      const restricted = await chat(restrictedToken, EXACT);
      expect(restricted.status).toBe(403);
      expect(transport).toHaveLength(beforeBranch);
      const foreignRun = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + runId)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignRun.status).toBe(400);
      expect(object(foreignRun.body).message).toBe('c9_run_authority');
      report.foreignRun = { status: foreignRun.status, runHash: digest(runId) };
      const foreignHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignHistory.status).toBe(200);
      expect(object(foreignHistory.body).turns).toEqual([]);
      expect(object(foreignHistory.body).conversationId).not.toBe(
        conversationId,
      );
      expect(transport).toHaveLength(beforeBranch);
      report.foreignHistory = { status: foreignHistory.status, isolated: true };
      const turns = await db.prisma.widgetTimelineTurn.findMany({
        where: { tenantId: a.tenant.id, conversationId, role: 'assistant' },
      });
      expect(
        turns.some(
          (turn) =>
            turn.textContent &&
            decodeChatReply(db.encryption, turn.textContent) ===
              first.body.reply,
        ),
      ).toBe(true);
      expect(turns.every((turn) => !turn.textContent?.includes('10:00'))).toBe(
        true,
      );
      expect(await business()).toBe(before);
      noWrites(mark);
      assert.ok(typeof first.body.reply === 'string');
      saved = {
        contract: 'synthetic-employee-journal-read-proof/1',
        database: database.database,
        sourceHead,
        sourceBindingsDigest,
        pid: process.pid,
        pgStarted: await pgStarted(),
        day: tomorrow(),
        salons,
        requestId,
        conversationId,
        firstReply: first.body.reply,
        firstEvidenceHash,
        runId,
        graph: await graph(a.tenant.id),
        business: before,
      };
      writeFileSync(receiptFile, JSON.stringify(saved) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      report.businessHash = before;
    } else {
      const a = saved.salons[0];
      expect(saved.pgStarted).not.toBe(await pgStarted());
      expect(saved.day).toBe(tomorrow());
      expect(await graph(a.tenant.id)).toBe(saved.graph);
      expect(await business()).toBe(saved.business);
      report.restart = {
        applicationPidChanged: saved.pid !== process.pid,
        postgresStartedChanged: true,
        graphHashUnchanged: saved.graph,
      };
      const token = await login(a),
        revokedToken = await login(a, a.revoked);
      const mark = http.recorder.mark();
      const history = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${token}`);
      expect(history.status).toBe(200);
      expect(object(history.body).conversationId).toBe(saved.conversationId);
      const historyTurns = object(history.body).turns;
      assert.ok(Array.isArray(historyTurns));
      expect(
        historyTurns.some((turn: unknown) => {
          const row = object(turn);
          return (
            row.role === 'assistant' &&
            typeof row.text === 'string' &&
            row.text.includes(saved.firstReply)
          );
        }),
      ).toBe(true);
      expect(transport).toEqual([]);
      expect(modelCalls).toBe(0);
      const replay = await chat(
        token,
        EXACT,
        saved.requestId,
        saved.conversationId,
      );
      assertPositive(replay);
      expect(transport).toEqual([]);
      expect(await evidence(a, replay.body)).toBe(saved.runId);
      expect(digest(sourceReceipts.at(-1))).toBe(saved.firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(saved.graph);
      report.resumeReplay = {
        runHash: digest(saved.runId),
        graphHashUnchanged: saved.graph,
      };
      const beforeRevocation = transport.filter(
        (r) => r.resource === 'records',
      ).length;
      rosterHook = async () => {
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: a.revoked.id, tenantId: a.tenant.id },
          },
          data: { status: 'suspended' },
        });
      };
      const revokedDuringRead = await chat(revokedToken, EXACT);
      expect(revokedDuringRead.status).toBe(403);
      expect(transport.filter((r) => r.resource === 'records')).toHaveLength(
        beforeRevocation,
      );
      const beforeRevoked = { reads: transport.length, models: modelCalls };
      const revoked = await chat(revokedToken, EXACT);
      expect([401, 403]).toContain(revoked.status);
      expect(transport).toHaveLength(beforeRevoked.reads);
      expect(modelCalls).toBe(beforeRevoked.models);
      const beforeDrift = transport.length;
      await db.prisma.crmIntegration.update({
        where: { tenantId: a.tenant.id },
        data: { updatedAt: new Date(Date.now() + 1000) },
      });
      const drift = await chat(
        token,
        EXACT,
        saved.requestId,
        saved.conversationId,
      );
      expect(drift.status).toBe(201);
      expect(object(drift.body.grounding).status).toBe('blocked');
      expect(drift.body.reply).not.toContain('10:00');
      expect(transport).toHaveLength(beforeDrift);
      expect(await business()).toBe(saved.business);
      noWrites(mark);
      report.businessHash = saved.business;
      report.sourceDriftSameRequest = {
        requestHash: digest(saved.requestId),
        status: drift.status,
        readsAdded: transport.length - beforeDrift,
      };
    }
  });
});
