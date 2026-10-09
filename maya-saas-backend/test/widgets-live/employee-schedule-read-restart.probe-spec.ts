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

const stage = process.env.JEST_EMPLOYEE_SCHEDULE_STAGE;
const receipt = process.env.JEST_EMPLOYEE_SCHEDULE_RECEIPT;
const output = process.env.JEST_EMPLOYEE_SCHEDULE_OUTPUT;
const sourceHead = process.env.JEST_EMPLOYEE_SCHEDULE_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_EMPLOYEE_SCHEDULE_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use employee-schedule-read-proof.mjs',
);
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_employeeschedule_[a-f0-9]+$/,
);
const outputDirectory: string = output;
const receiptFile: string = receipt;
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const TENANT_TIMEZONE = 'Pacific/Honolulu';
const BRANCH_NAME = 'основной филиал';
const TOKEN = 'employee-schedule-synthetic-no-credential';
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
  text: 'Кстати, Артём завтра работает?',
  employee: 'Артём',
};
const ELENA: Scenario = {
  text: 'Кстати, Елена завтра работает?',
  employee: 'Елена',
};
const AMBIGUOUS: Scenario = { text: 'Саша завтра работает?', employee: 'Саша' };
const SELECTED: Scenario = {
  text: 'Саша Иванов завтра работает в «основной филиал»?',
  employee: 'Саша Иванов',
  branch: BRANCH_NAME,
  compound: true,
};
const OTHER_BRANCH: Scenario = {
  text: 'Артём завтра работает в «другой филиал»?',
  employee: 'Артём',
  branch: 'другой филиал',
};
type Saved = {
  contract: 'synthetic-employee-schedule-read-proof/1';
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
  runId: string;
  graph: string;
  business: string;
};

describe('employee schedule actual HTTP/auth/CI/C9/native READ [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  const salons: Salon[] = [];
  let active: Scenario | undefined;
  let rosterHook: (() => Promise<void>) | undefined;
  let modelCalls = 0;
  const transport: Array<{
    tenantHash: string;
    resource: 'staff' | 'schedule';
    staffId?: string;
    date?: string;
  }> = [];
  const unexpected: string[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    contract: 'synthetic-employee-schedule-read-observations/1',
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
    originalOwnerTurns: [EXACT.text, ELENA.text],
    isolatedUtterancesOnly: true,
    fullDialogueReclassification: false,
    journalAmbiguityAcceptance: false,
  };
  const respond = (data: unknown) =>
    new Response(JSON.stringify({ success: true, data }), { status: 200 });
  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    process.env.YCLIENTS_PARTNER_TOKEN = TOKEN;
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptFile, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-employee-schedule-read-proof/1');
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
        !salon ||
        url.search
      ) {
        unexpected.push('unowned_or_nonread_transport');
        throw new Error('employee_schedule_unexpected_transport');
      }
      if (match[2] === `company/${salon.company}/staff`) {
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
      if (slot && Number(slot[1]) === salon.company) {
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
      unexpected.push('unlisted_provider_read');
      throw new Error('employee_schedule_unexpected_provider_read');
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
        throw new Error('employee_schedule_unexpected_model_call');
      }
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
                id: 'schedule',
                intent: 'schedule.get_team',
                entities: {
                  employee: active.employee,
                  date_or_period: 'tomorrow',
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
                name: 'staff.schedule.read',
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
        model: 'SCRIPTED_EMPLOYEE_SCHEDULE',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  });
  afterAll(async () => {
    report.transport = transport;
    report.modelCalls = modelCalls;
    report.unexpected = unexpected;
    report.checkpoints = checkpoints;
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
  function tomorrow() {
    const current = new Intl.DateTimeFormat('en-CA', {
      timeZone: BRANCH_TIMEZONE,
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
      'Employee schedule synthetic',
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const restricted = await fx.user(tenant, UserRole.MANAGER);
    const revoked = await fx.user(tenant, UserRole.TENANT_OWNER);
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
    conversationId: string = randomUUID(),
  ) {
    active = scenario;
    const beforeModels = modelCalls;
    const result = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId,
        conversationId,
        messages: [{ role: 'user', content: scenario.text }],
      });
    active = undefined;
    checkpoints.push({
      requestHash: digest(requestId),
      text: scenario.label ?? scenario.text,
      status: result.status,
      modelCalls: modelCalls - beforeModels,
      reply:
        typeof object(result.body).reply === 'string'
          ? object(result.body).reply
          : null,
      grounding: object(object(result.body).grounding).status ?? null,
      errorCode: object(object(result.body).error).code ?? null,
    });
    expect(modelCalls - beforeModels).toBeLessThanOrEqual(1);
    return { status: result.status, body: object(result.body) };
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
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder';
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
  ) {
    expect(response.status).toBe(201);
    expect(response.body.action).toBeNull();
    expect(object(response.body.grounding).status).toBe('verified');
    const [year, month, day] = tomorrow().split('-');
    expect(response.body.reply).toContain(
      `${day}.${month}.${year}: ${staff.name} — ${staff.from}–${staff.to}`,
    );
    expect(response.body.reply).toContain(`Филиал: ${BRANCH_NAME}`);
    expect(response.body.reply).toContain(`Часовой пояс: ${BRANCH_TIMEZONE}`);
    expect(response.body.reply).not.toContain('UNVERIFIED');
    expect(response.body.reply).not.toContain('1999');
    expect(response.body.resolution).toBeUndefined();
  }
  async function evidence(salon: Salon, response: Record<string, unknown>) {
    const coordination = object(response.coordination);
    expect(coordination.state).toBe('COMPLETED');
    assert.ok(typeof coordination.run_id === 'string');
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId: coordination.run_id },
      orderBy: { admittedAt: 'asc' },
    });
    expect(rows.map((row) => row.taskKey).sort()).toEqual([
      'catalog.staff.read',
      'staff.schedule.read',
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
      if (row.taskKey === 'staff.schedule.read') {
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
                .resolveStaffScheduleSource(salon.tenant.id, '71'),
          );
        expect(result).toMatchObject({
          date: tomorrow(),
          read_scope: {
            contract: 'maya.staff-schedule-read/1',
            branch_id: salon.branchId,
            staff_id: '71',
            source_hash: current.sourceHash,
            timezone: BRANCH_TIMEZONE,
          },
        });
      }
      references.push({
        workHash: digest(row.id),
        executionHash: digest(execution.id),
        taskKey: row.taskKey,
        inputHash: execution.inputHash,
        resultHash: digest(result),
      });
    }
    report.sourceReceipts = references;
    return coordination.run_id;
  }
  it('qualifies only actual scoped READ results, survives restart, and refuses source/authority drift', async () => {
    if (stage === 'prepare') {
      const a = await seed(99201),
        b = await seed(99202);
      const token = await login(a),
        foreignToken = await login(b),
        restrictedToken = await login(a, a.restricted);
      const mark = http.recorder.mark(),
        before = await business();
      const requestId = randomUUID(),
        conversationId = randomUUID();
      const first = await chat(token, EXACT, requestId, conversationId);
      assertPositive(first);
      const runId = await evidence(a, first.body);
      const beforeReplay = transport.length;
      const replay = await chat(token, EXACT, requestId, conversationId);
      assertPositive(replay);
      expect(transport).toHaveLength(beforeReplay);
      const beforeAmbiguity = transport.filter(
        (r) => r.resource === 'schedule',
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
      expect(transport.filter((r) => r.resource === 'schedule')).toHaveLength(
        beforeAmbiguity,
      );
      const selected = await chat(
        token,
        SELECTED,
        randomUUID(),
        conversationId,
      );
      assertPositive(selected, roster[1]);
      const elena = await chat(token, ELENA, randomUUID(), conversationId);
      assertPositive(elena, roster[3]);
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
          text: `Артём завтра работает в филиале ${b.branchId}?`,
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
      expect(JSON.stringify(foreignHistory.body)).not.toContain(
        first.body.reply,
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
        contract: 'synthetic-employee-schedule-read-proof/1',
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
      expect(JSON.stringify(history.body)).toContain(saved.firstReply);
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
      await evidence(a, replay.body);
      const beforeRevocation = transport.filter(
        (r) => r.resource === 'schedule',
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
      expect(transport.filter((r) => r.resource === 'schedule')).toHaveLength(
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
