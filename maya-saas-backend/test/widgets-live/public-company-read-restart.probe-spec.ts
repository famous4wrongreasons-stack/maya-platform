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

const stage = process.env.JEST_PUBLIC_COMPANY_STAGE;
const receipt = process.env.JEST_PUBLIC_COMPANY_RECEIPT;
const output = process.env.JEST_PUBLIC_COMPANY_OUTPUT;
const sourceHead = process.env.JEST_PUBLIC_COMPANY_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_PUBLIC_COMPANY_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use public-company-read-proof.mjs',
);
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_publiccompany_[a-f0-9]+$/,
);
const outputDirectory: string = output;
const receiptFile: string = receipt;
const BRANCH_NAME = 'Набережная';
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const TENANT_TIMEZONE = 'Pacific/Honolulu';
const TOKEN = 'public-company-synthetic-no-credential';
const PRIVATE_FIXTURE = [
  'PRIVATE_TENANT_BRANDING',
  'PRIVATE_BRANDING_ADDRESS',
  'PRIVATE_STAFF_ROSTER',
  'PRIVATE_A22_GUIDANCE',
  'PRIVATE_PROVIDER_PHONE',
  'PRIVATE_PROVIDER_SCHEDULE',
];
const SOURCE_UNAVAILABLE =
  'Не удалось подтвердить текущий источник публичных сведений выбранного филиала.';
const UNRESOLVED_BRANCH =
  'Не удалось однозначно сопоставить указанный филиал с текущими данными CRM.';
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  restricted: UserFixture;
  revoked: UserFixture;
  clientActor: UserFixture;
  branchId: string;
  otherBranchId: string;
  company: number;
  title: string;
  address: string | null;
};
type Scenario = {
  text: string;
  label?: string;
  branch: string;
  field?: 'name' | 'address';
  compound?: boolean;
};
const EXACT: Scenario = {
  text: 'Как называются и где находятся помещения филиала Набережная?',
  branch: BRANCH_NAME,
};
const ADDRESS: Scenario = {
  text: 'Какой адрес у филиала Набережная?',
  branch: BRANCH_NAME,
  field: 'address',
};
const NAME: Scenario = {
  text: 'Как называется филиал Набережная?',
  branch: BRANCH_NAME,
  field: 'name',
};
type Saved = {
  contract: 'synthetic-public-company-read-proof/1';
  database: string;
  sourceHead: string;
  sourceBindingsDigest: string;
  pid: number;
  pgStarted: string;
  salons: Salon[];
  requestId: string;
  conversationId: string;
  firstReply: string;
  firstEvidenceHash: string;
  runId: string;
  graph: string;
  business: string;
};

describe('public company actual HTTP/auth/CI/C9/native READ [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  const salons: Salon[] = [];
  let active: Scenario | undefined;
  let profileHook: (() => Promise<void>) | undefined;
  let missingProfileCompany: number | undefined;
  let modelCalls = 0;
  const transport: Array<{
    tenantHash: string;
    resource: 'company' | 'companies';
    company: number;
  }> = [];
  const unexpected: string[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const sourceReceipts: Array<{
    runHash: string;
    actorHash: string;
    company: number;
    references: Record<string, unknown>[];
  }> = [];
  const report: Record<string, unknown> = {
    contract: 'synthetic-public-company-read-observations/1',
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
    explicitValidatedBranchOnly: true,
    fullDialogueReclassification: false,
    full48Reclassification: false,
    c9ReadsPerPositive: 1,
    nativeGetCountIsNotC9ReadCount: true,
    noBusinessWritesClaim: 'OBSERVED_SCOPED_FAMILIES_AFTER_FIXTURE_SETUP',
  };
  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    process.env.YCLIENTS_PARTNER_TOKEN = TOKEN;
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptFile, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-public-company-read-proof/1');
      assert.equal(saved.database, database.database);
      assert.equal(saved.sourceHead, sourceHead);
      assert.equal(saved.sourceBindingsDigest, sourceBindingsDigest);
      assert.notEqual(saved.pid, process.pid);
      salons.push(...saved.salons);
    }
    // No original fetch fallback or external socket. Discovery is allowed only
    // in the explicitly selected missing-profile scenario, never for other calls.
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
        unexpected.push('unowned_or_nonprofile_transport');
        throw new Error('public_company_unexpected_transport');
      }
      if (
        missingProfileCompany === salon.company &&
        match[2] === 'companies' &&
        url.search === '?my=1'
      ) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          resource: 'companies',
          company: salon.company,
        });
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
        });
      }
      if (match[2] !== `company/${salon.company}` || url.search) {
        unexpected.push('unlisted_profile_read');
        throw new Error('public_company_unlisted_profile_read');
      }
      transport.push({
        tenantHash: digest(salon.tenant.id),
        resource: 'company',
        company: salon.company,
      });
      if (missingProfileCompany === salon.company)
        return new Response(JSON.stringify({ success: false, data: null }), {
          status: 404,
        });
      const hook = profileHook;
      profileHook = undefined;
      await hook?.();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: salon.company,
            ...(salon.title ? { title: salon.title } : {}),
            ...(salon.address === null ? {} : { address: salon.address }),
            timezone_name: BRANCH_TIMEZONE,
            phone: PRIVATE_FIXTURE[4],
            schedule: PRIVATE_FIXTURE[5],
          },
        }),
        { status: 200 },
      );
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    http.app.get(ConfigService).set('AI_CORE_MAX_TOOL_STEPS', '1');
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
        throw new Error('public_company_unexpected_model_call');
      }
      for (const value of [TOKEN, ...PRIVATE_FIXTURE])
        expect(JSON.stringify(input).includes(value)).toBe(false);
      modelCalls++;
      expect(
        input.tools.some((tool) => tool.name === 'catalog.staff.read'),
      ).toBe(true);
      const planned = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: active.compound ? 'compound_request' : 'request',
            tasks: [
              ...(active.compound
                ? [
                    {
                      id: 'staff',
                      intent: 'employees.list_public',
                      entities: {},
                      confidence: 1,
                    },
                  ]
                : []),
              {
                id: 'company',
                intent: 'company.public_info',
                entities: {
                  branch: active.branch,
                  ...(active.field ? { field: active.field } : {}),
                },
                confidence: 1,
              },
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: [],
            },
          },
          tool_call: { name: 'catalog.staff.read', arguments: {} },
        }),
        input,
      );
      const task = planned.semanticPlan?.tasks.find(
        (row) => row.intent === 'company.public_info',
      );
      expect(task?.permission.status).toBe('allowed');
      expect(task?.tool.name).toBe('catalog.staff.read');
      return Promise.resolve({
        ...planned,
        reply: 'UNVERIFIED_PLANNER_TEXT',
        provider: 'deepseek' as const,
        model: 'SCRIPTED_PUBLIC_COMPANY',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  });
  afterAll(async () => {
    Object.assign(report, {
      transport,
      modelCalls,
      unexpected,
      checkpoints,
      sourceReceipts,
    });
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
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ value: string }>
      >`SELECT pg_postmaster_start_time()::text AS value`
    )[0].value;
  }
  async function seed(
    company: number,
    options: { noTitle?: boolean; noAddress?: boolean; unbound?: boolean } = {},
  ): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Public company synthetic',
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const restricted = await fx.user(tenant, UserRole.MANAGER);
    const revoked = await fx.user(tenant, UserRole.TENANT_OWNER);
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
    await db.prisma.branch.createMany({
      data: [1, 2].map(() => ({
        tenantId: tenant.id,
        name: 'Дублированный',
        timezone: BRANCH_TIMEZONE,
      })),
    });
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { userId: restricted.id, tenantId: tenant.id },
      },
      data: { branchId: other.id },
    });
    await db.prisma.brandingSettings.create({
      data: {
        tenantId: tenant.id,
        appName: PRIVATE_FIXTURE[0],
        contactDetailsJson: { address: PRIVATE_FIXTURE[1] },
      },
    });
    await db.prisma.staff.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        title: 'Мастер',
        active: true,
        encryptedDisplayName: db.encryption.encrypt(PRIVATE_FIXTURE[2]),
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        encryptedApiToken: db.encryption.encrypt(TOKEN),
        baseUrl: `http://127.0.0.1:9/synthetic/${tenant.id}`,
        status: 'active',
        settingsJson: {
          companyId: company,
          ...(options.unbound
            ? {}
            : {
                branchBinding: {
                  contract: 'maya.crm-branch-binding/1',
                  companyId: company,
                  branchId: branch.id,
                },
              }),
        },
      },
    });
    const salon: Salon = {
      tenant,
      owner,
      restricted,
      revoked,
      clientActor,
      branchId: branch.id,
      otherBranchId: other.id,
      company,
      title: options.noTitle ? '' : `Салон у реки ${company}`,
      address: options.noAddress ? null : `Набережная улица, ${company}`,
    };
    salons.push(salon);
    return salon;
  }
  const login = (salon: Salon, user = salon.owner) =>
    http.login(salon.tenant.slug, user.email, user.password);
  async function configurePrivateGuidance(salon: Salon, token: string) {
    // Existing A22 HTTP writer only in fixture setup, before no-write observation.
    const current = await request(http.app.getHttpServer())
      .get('/api/governed-settings/tenant/business_rules')
      .set('Authorization', `Bearer ${token}`);
    expect(current.status).toBe(200);
    const state = object(current.body);
    const result = await request(http.app.getHttpServer())
      .post('/api/governed-settings/tenant')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', randomUUID())
      .send({
        confirmed: true,
        namespace: 'business_rules',
        expectedRevision: state.revision,
        previousRevisionId: state.previousRevisionId,
        content: { rules: [{ text: PRIVATE_FIXTURE[3] }] },
      });
    expect(result.status).toBe(201);
    expect(
      await db.prisma.tenantBusinessConfigurationRevision.count({
        where: { tenantId: salon.tenant.id },
      }),
    ).toBe(1);
    report.privateGuidanceSetup = 'EXISTING_A22_OWNER_BEFORE_OBSERVATION';
  }
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
    const body = object(result.body);
    const message = body.message;
    checkpoints.push({
      requestHash: digest(requestId),
      text: scenario.label ?? scenario.text,
      status: result.status,
      modelCalls: modelCalls - beforeModels,
      reply: typeof body.reply === 'string' ? sanitizedReply(body.reply) : null,
      grounding: object(body.grounding).status ?? null,
      errorCode: object(body.error).code ?? null,
      errorMessage:
        typeof message === 'string' &&
        /^(?:(?:ai_|c9_|conversation_|typed_|staff_schedule_|booking_|public_company_|crm_)[a-z0-9_]{1,100}|Unauthorized|Forbidden|Conflict)$/.test(
          message,
        )
          ? message
          : message === undefined
            ? null
            : { sha256: digest(message) },
    });
    expect(modelCalls - beforeModels).toBeLessThanOrEqual(1);
    if (typeof body.reply === 'string') assertPrivateAbsent(body.reply);
    return { status: result.status, body };
  }
  function sanitizedReply(value: string) {
    return [
      TOKEN,
      ...PRIVATE_FIXTURE,
      ...salons.flatMap((s) => [
        s.tenant.id,
        s.branchId,
        s.otherBranchId,
        ...[s.owner, s.clientActor, s.restricted, s.revoked].flatMap((u) => [
          u.id,
          u.email,
        ]),
      ]),
    ].reduce(
      (text, privateValue) =>
        text.split(privateValue).join('[private omitted]'),
      value,
    );
  }
  function assertPrivateAbsent(value: unknown) {
    const text = JSON.stringify(value);
    for (const secret of [TOKEN, ...PRIVATE_FIXTURE])
      expect(text.includes(secret)).toBe(false);
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
      branding: await db.prisma.brandingSettings.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      guidance: await db.prisma.tenantBusinessConfigurationRevision.findMany({
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
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder|Client|BrandingSettings|TenantBusinessConfigurationRevision';
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

  function assertVerified(response: {
    status: number;
    body: Record<string, unknown>;
  }) {
    expect(response.status).toBe(201);
    expect(response.body.action).toBeNull();
    expect(object(response.body.grounding).status).toBe('verified');
    expect(response.body.resolution).toBeUndefined();
    expect(response.body.tools_used).toEqual([
      expect.objectContaining({
        name: 'catalog.staff.read',
        status: 'completed',
      }),
    ]);
    expect(String(response.body.reply)).not.toContain(
      'UNVERIFIED_PLANNER_TEXT',
    );
    assertPrivateAbsent(response.body);
  }
  function assertProfile(
    response: { status: number; body: Record<string, unknown> },
    salon: Salon,
  ) {
    assertVerified(response);
    expect(response.body.reply).toContain(
      'По данным CRM для выбранного филиала:',
    );
    expect(response.body.reply).toContain(
      `Название в профиле: ${salon.title}.`,
    );
    expect(response.body.reply).toContain(`Адрес в профиле: ${salon.address}.`);
    expect(response.body.reply).not.toContain('Час');
    expect(response.body.reply).not.toContain('Телефон');
  }
  function assertBlocked(
    response: { status: number; body: Record<string, unknown> },
    reply?: string,
  ) {
    expect(response.status).toBe(201);
    expect(object(response.body.grounding).status).toBe('blocked');
    expect(response.body.action).toBeNull();
    expect(response.body.resolution).toBeUndefined();
    if (reply) expect(response.body.reply).toBe(reply);
    for (const salon of salons) {
      if (salon.title)
        expect(String(response.body.reply).includes(salon.title)).toBe(false);
      if (salon.address)
        expect(String(response.body.reply).includes(salon.address)).toBe(false);
    }
    assertPrivateAbsent(response.body);
  }
  async function evidence(
    salon: Salon,
    response: Record<string, unknown>,
    actor = salon.owner,
  ) {
    const coordination = object(response.coordination);
    expect(coordination.state).toBe('COMPLETED');
    assert.ok(typeof coordination.run_id === 'string');
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId: coordination.run_id },
      orderBy: { admittedAt: 'asc' },
    });
    expect(rows.map((row) => row.taskKey)).toEqual(['catalog.staff.read']);
    const references: Record<string, unknown>[] = [];
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
        actorUserId: actor.id,
        toolName: 'catalog.staff.read',
        status: 'completed',
      });
      assert.ok(execution.encryptedResult);
      const result = object(
        JSON.parse(db.encryption.decrypt(execution.encryptedResult)) as unknown,
      );
      const current = await http.app
        .get(TenantContextService)
        .runAsAuthPrincipal(
          {
            tenantId: salon.tenant.id,
            userId: actor.id,
            role: actor.role,
          },
          () =>
            http.app
              .get(CrmService)
              .resolveConfiguredBookingBranch(salon.tenant.id),
        );
      assert.ok(current);
      expect(result).toEqual({
        salon: { name: salon.title, address: salon.address },
        public_scope: {
          contract: 'maya.company-public-profile.read/1',
          projection: 'company_profile',
          branch_id: salon.branchId,
          source_revision: current.sourceRevision,
          company_id: String(salon.company),
        },
      });
      expect(Object.hasOwn(result, 'staff')).toBe(false);
      assertPrivateAbsent(result);
      references.push({
        workHash: digest(row.id),
        executionHash: digest(execution.id),
        taskKey: row.taskKey,
        inputHash: execution.inputHash,
        resultHash: digest(result),
      });
    }
    expect(sourceReceipts.length).toBeLessThan(20);
    sourceReceipts.push({
      runHash: digest(coordination.run_id),
      actorHash: digest(actor.id),
      company: salon.company,
      references,
    });
    return coordination.run_id;
  }
  async function assertNoPrivateToolReads() {
    const executions = await db.prisma.aiToolExecution.findMany({
      where: { tenantId: { in: salons.map((s) => s.tenant.id) } },
      select: { toolName: true },
    });
    expect(executions.length).toBeGreaterThan(0);
    expect(
      executions.every((row) => row.toolName === 'catalog.staff.read'),
    ).toBe(true);
    expect(
      await db.prisma.client.count({
        where: { tenantId: { in: salons.map((s) => s.tenant.id) } },
      }),
    ).toBe(0);
  }
  it('reads only the explicit bound public profile and preserves exact evidence through restart', async () => {
    if (stage === 'prepare') {
      const a = await seed(99401),
        b = await seed(99402),
        noTitle = await seed(99403, { noTitle: true }),
        noAddress = await seed(99404, { noAddress: true }),
        neither = await seed(99405, { noTitle: true, noAddress: true }),
        unbound = await seed(99406, { unbound: true });
      const token = await login(a),
        foreignToken = await login(b),
        clientToken = await login(a, a.clientActor),
        restrictedToken = await login(a, a.restricted);
      await configurePrivateGuidance(a, token);
      const mark = http.recorder.mark(),
        before = await business();
      const requestId = randomUUID();
      const first = await chat(token, EXACT, requestId);
      assertProfile(first, a);
      expect(transport).toEqual([
        {
          tenantHash: digest(a.tenant.id),
          resource: 'company',
          company: a.company,
        },
      ]);
      const conversationId = object(first.body.user_turn).conversationId;
      assert.ok(typeof conversationId === 'string');
      const runId = await evidence(a, first.body);
      const firstEvidenceHash = digest(sourceReceipts.at(-1));
      const graphBeforeReplay = await graph(a.tenant.id),
        beforeReplay = transport.length;
      const replay = await chat(token, EXACT, requestId, conversationId);
      assertProfile(replay, a);
      expect(replay.body.reply).toContain('Сохранённый результат проверки.');
      expect(await evidence(a, replay.body)).toBe(runId);
      expect(digest(sourceReceipts.at(-1))).toBe(firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(graphBeforeReplay);
      expect(transport).toHaveLength(beforeReplay);
      report.prepareReplay = {
        runHash: digest(runId),
        graphHashUnchanged: graphBeforeReplay,
        providerReadsAdded: 0,
      };

      const clientBefore = transport.length;
      const client = await chat(clientToken, EXACT);
      assertProfile(client, a);
      expect(transport.length - clientBefore).toBe(1);
      await evidence(a, client.body, a.clientActor);
      report.clientPublicRead = {
        status: client.status,
        role: 'CLIENT',
        clientIdentityGranted: false,
        runHash: digest(object(client.body.coordination).run_id),
        source: 'SCOPED_NATIVE_PROFILE',
      };

      const beforePrivateRead = transport.length;
      const clientGuidance = await request(http.app.getHttpServer())
        .get('/api/governed-settings/tenant/business_rules')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(clientGuidance.status).toBe(403);
      assertPrivateAbsent(clientGuidance.body);
      expect(transport).toHaveLength(beforePrivateRead);
      report.clientInternalGuidance = {
        status: clientGuidance.status,
        privateFactsWithheld: true,
        providerReadsAdded: 0,
      };

      // This actor has not chatted in tenant B yet. Foreign history must not expose tenant A.
      const foreignHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignHistory.status).toBe(200);
      expect(object(foreignHistory.body).turns).toEqual([]);
      expect(object(foreignHistory.body).conversationId).not.toBe(
        conversationId,
      );
      const foreignRun = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + runId)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignRun.status).toBe(400);
      expect(object(foreignRun.body).message).toBe('c9_run_authority');
      report.foreignArtifacts = {
        historyStatus: foreignHistory.status,
        historyIsolated: true,
        runStatus: foreignRun.status,
      };
      const otherBefore = transport.length;
      const otherCompany = await chat(foreignToken, EXACT);
      assertProfile(otherCompany, b);
      expect(otherCompany.body.reply).not.toContain(a.title);
      expect(otherCompany.body.reply).not.toContain(a.address);
      expect(transport.slice(otherBefore)).toEqual([
        {
          tenantHash: digest(b.tenant.id),
          resource: 'company',
          company: b.company,
        },
      ]);
      await evidence(b, otherCompany.body);
      const beforeMissingProfile = transport.length;
      const workBeforeMissingProfile = await db.prisma.c9WorkReceipt.count({
        where: { tenantId: b.tenant.id, kind: 'TOOL_READ' },
      });
      missingProfileCompany = b.company;
      const missingProfile = await chat(foreignToken, EXACT);
      missingProfileCompany = undefined;
      assertBlocked(missingProfile, SOURCE_UNAVAILABLE);
      expect(
        transport.slice(beforeMissingProfile).map((row) => row.resource),
      ).toEqual(['company', 'companies']);
      expect(
        await db.prisma.c9WorkReceipt.count({
          where: { tenantId: b.tenant.id, kind: 'TOOL_READ' },
        }),
      ).toBe(workBeforeMissingProfile + 1);
      report.missingProfile = {
        status: missingProfile.status,
        nativeGets: 2,
        c9ReadAttempts: 1,
        detailStatus: 404,
        discovery: 'EXACT_EMPTY',
        publicFactsWithheld: true,
      };

      for (const [salon, scenario, absence] of [
        [noTitle, NAME, 'название не указано'],
        [noAddress, ADDRESS, 'адрес не указан'],
        [neither, EXACT, 'название и адрес не указаны'],
      ] as const) {
        const missingToken = await login(salon),
          key = randomUUID(),
          beforeMissing = transport.length;
        const missing = await chat(missingToken, scenario, key);
        assertVerified(missing);
        expect(missing.body.reply).toBe(
          `В прочитанном профиле CRM этого филиала ${absence}.`,
        );
        expect(transport.length - beforeMissing).toBe(1);
        const missingRun = await evidence(salon, missing.body);
        const missingHash = digest(sourceReceipts.at(-1));
        const missingConversation = object(
          missing.body.user_turn,
        ).conversationId;
        assert.ok(typeof missingConversation === 'string');
        const missingGraph = await graph(salon.tenant.id);
        const repeat = await chat(
          missingToken,
          scenario,
          key,
          missingConversation,
        );
        assertVerified(repeat);
        expect(repeat.body.reply).toBe(
          `Сохранённый результат проверки.\nВ прочитанном профиле CRM этого филиала ${absence}.`,
        );
        expect(await evidence(salon, repeat.body)).toBe(missingRun);
        expect(digest(sourceReceipts.at(-1))).toBe(missingHash);
        expect(await graph(salon.tenant.id)).toBe(missingGraph);
        expect(transport.length - beforeMissing).toBe(1);
      }

      const beforeInvalid = transport.length;
      for (const scenario of [
        {
          text: 'Какой адрес у филиала Дублированный?',
          branch: 'Дублированный',
        },
        {
          text: 'Какой адрес у филиала Несуществующий?',
          branch: 'Несуществующий',
        },
        {
          text: `Какой адрес у филиала ${b.branchId}?`,
          branch: b.branchId,
          label: 'Foreign tenant branch (synthetic ID omitted)',
        },
      ]) {
        const invalid = await chat(
          token,
          scenario,
          randomUUID(),
          conversationId,
        );
        assertBlocked(invalid, UNRESOLVED_BRANCH);
        expect(transport).toHaveLength(beforeInvalid);
      }
      const wrongConfigured = await chat(
        token,
        {
          text: 'Какой адрес у другого филиала?',
          branch: 'другой филиал',
        },
        randomUUID(),
        conversationId,
      );
      assertBlocked(wrongConfigured, SOURCE_UNAVAILABLE);
      expect(transport).toHaveLength(beforeInvalid);
      const compound = await chat(
        token,
        {
          text: 'Покажи сотрудников и адрес филиала Набережная',
          branch: BRANCH_NAME,
          compound: true,
        },
        randomUUID(),
        conversationId,
      );
      assertBlocked(
        compound,
        'Уточните один филиал и отдельно запросите его название или адрес.',
      );
      expect(transport).toHaveLength(beforeInvalid);
      const missingBinding = await chat(await login(unbound), EXACT);
      assertBlocked(missingBinding, SOURCE_UNAVAILABLE);
      expect(transport).toHaveLength(beforeInvalid);
      const restricted = await chat(restrictedToken, EXACT);
      expect(restricted.status).toBe(403);
      expect(transport).toHaveLength(beforeInvalid);
      report.sourceRefusals = {
        ambiguity: true,
        unknownBranch: true,
        foreignBranch: true,
        nonconfiguredBranch: true,
        missingBinding: true,
        compoundPreserved: true,
        branchRestrictedStatus: restricted.status,
        providerReadsAdded: 0,
      };

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
      const publicAddress = a.address;
      assert.ok(publicAddress);
      expect(
        turns.every((turn) => !turn.textContent?.includes(publicAddress)),
      ).toBe(true);
      await assertNoPrivateToolReads();
      expect(await business()).toBe(before);
      noWrites(mark);
      assert.ok(typeof first.body.reply === 'string');
      saved = {
        contract: 'synthetic-public-company-read-proof/1',
        database: database.database,
        sourceHead,
        sourceBindingsDigest,
        pid: process.pid,
        pgStarted: await pgStarted(),
        salons,
        requestId,
        conversationId,
        firstReply: first.body.reply,
        firstEvidenceHash,
        runId,
        graph: await graph(a.tenant.id),
        business: before,
      };
      // Synthetic login fixtures are private restart material, never a public evidence artifact.
      writeFileSync(receiptFile, JSON.stringify(saved) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      report.businessHash = before;
    } else {
      const a = saved.salons[0],
        b = saved.salons[1];
      expect(saved.pgStarted).not.toBe(await pgStarted());
      expect(await graph(a.tenant.id)).toBe(saved.graph);
      expect(await business()).toBe(saved.business);
      report.restart = {
        applicationPidChanged: saved.pid !== process.pid,
        postgresStartedChanged: true,
        graphHashUnchanged: saved.graph,
      };
      const token = await login(a),
        revokedToken = await login(a, a.revoked),
        otherToken = await login(b);
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
      assertPrivateAbsent(history.body);
      expect(transport).toEqual([]);
      expect(modelCalls).toBe(0);
      const replay = await chat(
        token,
        EXACT,
        saved.requestId,
        saved.conversationId,
      );
      assertProfile(replay, a);
      expect(replay.body.reply).toContain('Сохранённый результат проверки.');
      expect(transport).toEqual([]);
      expect(await evidence(a, replay.body)).toBe(saved.runId);
      expect(digest(sourceReceipts.at(-1))).toBe(saved.firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(saved.graph);
      report.resumeReplay = {
        runHash: digest(saved.runId),
        graphHashUnchanged: saved.graph,
        providerReadsAdded: 0,
      };

      // Real metadata mutation is an adversarial fixture control, not a mocked guard.
      const beforeMidDrift = transport.length;
      profileHook = async () => {
        await db.prisma.crmIntegration.update({
          where: { tenantId: b.tenant.id },
          data: {
            settingsJson: {
              companyId: 99412,
              branchBinding: {
                contract: 'maya.crm-branch-binding/1',
                companyId: 99412,
                branchId: b.branchId,
              },
            },
          },
        });
      };
      const midDrift = await chat(otherToken, EXACT);
      assertBlocked(midDrift, SOURCE_UNAVAILABLE);
      expect(transport.length - beforeMidDrift).toBe(1);
      report.midReadCompanyCutover = {
        status: midDrift.status,
        providerReadsAdded: 1,
        previousCompany: b.company,
        currentCompany: 99412,
        sameOwnedTenant: true,
        capturedPublicFactsWithheld: true,
      };

      const beforeRevocation = transport.length;
      profileHook = async () => {
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: a.revoked.id, tenantId: a.tenant.id },
          },
          data: { status: 'suspended' },
        });
      };
      const revokedDuringRead = await chat(revokedToken, EXACT);
      expect(revokedDuringRead.status).toBe(403);
      expect(transport.length - beforeRevocation).toBe(1);
      expect(revokedDuringRead.body.reply).toBeUndefined();
      const beforeRevoked = { reads: transport.length, models: modelCalls };
      const revoked = await chat(revokedToken, EXACT);
      expect(revoked.status).toBe(401);
      expect(transport).toHaveLength(beforeRevoked.reads);
      expect(modelCalls).toBe(beforeRevoked.models);
      report.revocation = {
        duringReadStatus: revokedDuringRead.status,
        priorReadStatus: revoked.status,
        duringReadProviderReads: 1,
        afterRevocationProviderReads: 0,
      };

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
      assertBlocked(drift, SOURCE_UNAVAILABLE);
      expect(transport).toHaveLength(beforeDrift);
      report.sourceDriftSameRequest = {
        requestHash: digest(saved.requestId),
        status: drift.status,
        providerReadsAdded: 0,
      };
      await assertNoPrivateToolReads();
      expect(await business()).toBe(saved.business);
      noWrites(mark);
      report.businessHash = saved.business;
    }
  });
});
