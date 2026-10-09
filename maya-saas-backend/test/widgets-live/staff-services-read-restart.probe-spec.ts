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

const stage = process.env.JEST_STAFF_SERVICES_STAGE;
const receipt = process.env.JEST_STAFF_SERVICES_RECEIPT;
const output = process.env.JEST_STAFF_SERVICES_OUTPUT;
const sourceHead = process.env.JEST_STAFF_SERVICES_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_STAFF_SERVICES_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use the finite staff-services READ proof runner',
);
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_staffservices_[a-f0-9]+$/,
);
assert.equal(
  new URL(database.connectionString).username,
  'staff_services_proof',
);
const outputDirectory: string = output;
const receiptFile: string = receipt;
const BRANCH_NAME = 'Набережная';
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const TENANT_TIMEZONE = 'Pacific/Honolulu';
const TOKEN = 'staff-services-synthetic-no-credential';
const SERVICE = 'Мужская стрижка';
const PRIVATE_FIXTURE = [
  'PRIVATE_TENANT_BRANDING',
  'PRIVATE_BRANDING_ADDRESS',
  'PRIVATE_STAFF_PHONE',
  'PRIVATE_A22_GUIDANCE',
  'PRIVATE_PROVIDER_PHONE',
  'PRIVATE_PROVIDER_DESCRIPTION',
];
const roster = [
  { id: 71, name: 'Артём' },
  { id: 72, name: 'Марина' },
  { id: 73, name: 'Саша' },
  { id: 74, name: 'Саша' },
  { id: 75, name: 'Елена' },
  { id: 76, name: 'Никита' },
  { id: 77, name: 'Ольга' },
];
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
  currency: string | null;
  fixedPrice: number;
};
type Scenario = {
  text: string;
  employee: string;
  branch?: string;
  service?: string;
  label?: string;
};
const LIST: Scenario = {
  text: 'Какие услуги выполняет Артём в филиале Набережная?',
  employee: 'Артём',
  branch: BRANCH_NAME,
};
const price = (employee: string, service = SERVICE): Scenario => ({
  text: `Сколько стоит ${service} у мастера ${employee} в филиале Набережная?`,
  employee,
  service,
  branch: BRANCH_NAME,
});
type Saved = {
  contract: 'synthetic-staff-services-read-proof/1';
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

describe('staff services actual HTTP/auth/parser/C9/native READ [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  const salons: Salon[] = [];
  let active: Scenario | undefined;
  let serviceHook: (() => Promise<void>) | undefined;
  let modelCalls = 0;
  const transport: Array<{
    tenantHash: string;
    company: number;
    resource: 'staff' | 'services';
    staffId?: string;
  }> = [];
  const unexpected: string[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const sourceReceipts: Array<Record<string, unknown>> = [];
  const report: Record<string, unknown> = {
    contract: 'synthetic-staff-services-read-observations/1',
    stage,
    sourceHead,
    sourceBindingsDigest,
    realHttpAuth: true,
    realPlannerValidation: true,
    realC9AndRuntime: true,
    realNativeAdapter: true,
    planning: 'SCRIPTED_JSON_THROUGH_ACTUAL_PLANNER_VALIDATOR',
    syntheticTransport: true,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    browserAcceptance: false,
    full48Reclassification: false,
    c9ReadsPerPositive: 2,
    nativeGetCountIsNotC9ReadCount: true,
    noBusinessWritesClaim: 'OBSERVED_SCOPED_FAMILIES_AFTER_FIXTURE_SETUP',
  };
  const respond = (data: unknown) =>
    new Response(JSON.stringify({ success: true, data }), { status: 200 });
  // Deliberately different prices for the same service at two employees. Neither
  // value is a tenant-wide fallback. Unknown and zero remain distinct.
  function services(salon: Salon, staffId: string): unknown {
    if (staffId === '76') return { services: [] };
    if (staffId === '77')
      return {
        services: [
          { id: 81, title: SERVICE },
          { id: 81, title: 'Duplicate identity' },
        ],
      };
    const fixed = staffId === '72' ? salon.fixedPrice + 700 : salon.fixedPrice;
    return {
      services: [
        {
          id: 81,
          title: SERVICE,
          price_min: fixed,
          price_max: fixed,
          seance_length: 1800,
          description: PRIVATE_FIXTURE[5],
        },
        {
          id: 82,
          title: 'Комплекс',
          price_min: 2000,
          price_max: 2600,
          seance_length: 3600,
        },
        {
          id: 83,
          title: 'Консультация',
          price_min: 0,
          price_max: 0,
          seance_length: 900,
        },
        { id: 84, title: 'Уход', seance_length: 1800 },
        {
          id: 85,
          title: 'Дублированная услуга',
          price_min: 900,
          price_max: 900,
        },
        {
          id: 86,
          title: 'Дублированная услуга',
          price_min: 1100,
          price_max: 1100,
        },
      ],
    };
  }
  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    process.env.YCLIENTS_PARTNER_TOKEN = TOKEN;
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptFile, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-staff-services-read-proof/1');
      assert.equal(saved.database, database.database);
      assert.equal(saved.sourceHead, sourceHead);
      assert.equal(saved.sourceBindingsDigest, sourceBindingsDigest);
      assert.notEqual(saved.pid, process.pid);
      salons.push(...saved.salons);
    }
    // Never fall back to original fetch. GETs without the exact employee query
    // (including a tenant catalogue) are refused before any I/O.
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
        throw new Error('staff_services_unexpected_transport');
      }
      if (match[2] === `company/${salon.company}/staff` && !url.search) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          company: salon.company,
          resource: 'staff',
        });
        return respond(
          roster.map(({ id, name }) => ({
            id,
            name,
            specialization: 'Мастер',
            bookable: true,
            fired: false,
            phone: PRIVATE_FIXTURE[2],
          })),
        );
      }
      const query = /^\?staff_id=(71|72|73|74|75|76|77)$/.exec(url.search);
      if (match[2] === `book_services/${salon.company}` && query) {
        transport.push({
          tenantHash: digest(salon.tenant.id),
          company: salon.company,
          resource: 'services',
          staffId: query[1],
        });
        const hook = serviceHook;
        serviceHook = undefined;
        await hook?.();
        return respond(services(salon, query[1]));
      }
      unexpected.push('unlisted_or_unscoped_catalog_read');
      throw new Error('staff_services_unlisted_catalog_read');
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
        throw new Error('staff_services_unexpected_model_call');
      }
      for (const value of [TOKEN, ...PRIVATE_FIXTURE])
        expect(JSON.stringify(input).includes(value)).toBe(false);
      modelCalls++;
      expect(input.tools.some((t) => t.name === 'catalog.services.read')).toBe(
        true,
      );
      const planned = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: 'request',
            tasks: [
              {
                id: 'services',
                intent: active.service ? 'services.price' : 'services.list',
                entities: {
                  employee: active.employee,
                  ...(active.branch ? { branch: active.branch } : {}),
                  ...(active.service ? { service: active.service } : {}),
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
          tool_call: { name: 'catalog.services.read', arguments: {} },
        }),
        input,
      );
      expect(planned.semanticPlan?.tasks[0]?.permission.status).toBe('allowed');
      return Promise.resolve({
        ...planned,
        reply: 'UNVERIFIED_PLANNER_TEXT',
        provider: 'deepseek' as const,
        model: 'SCRIPTED_STAFF_SERVICES',
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
      staff: await db.prisma.staff.findMany({ where, orderBy: { id: 'asc' } }),
      staffLinks: await db.prisma.staffProviderLink.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      services: await db.prisma.internalService.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
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
      'InternalService|InternalProviderService|Staff|Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder|Client|BrandingSettings|TenantBusinessConfigurationRevision';
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

  async function seed(
    company: number,
    currency: string | null = 'RUB',
  ): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Staff services synthetic',
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
    for (const member of roster) {
      const staff = await db.prisma.staff.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          title: 'Мастер',
          active: true,
          encryptedDisplayName: db.encryption.encrypt(member.name),
        },
      });
      if (member.id === 75) continue; // Deliberately missing current tenant's provider identity.
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
          ...(currency ? { currency } : {}),
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: company,
            branchId: branch.id,
          },
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
      currency,
      fixedPrice: company === 99501 ? 1500 : 3300,
    };
    salons.push(salon);
    return salon;
  }
  async function chat(
    token: string,
    scenario: Scenario,
    requestId: string = randomUUID(),
    conversationId?: string,
  ) {
    active = scenario;
    const beforeModels = modelCalls,
      beforeReads = transport.length;
    let result: request.Response;
    try {
      result = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId,
          ...(conversationId ? { conversationId } : {}),
          messages: [{ role: 'user', content: scenario.text }],
        });
    } finally {
      active = undefined;
    }
    const body = object(result.body);
    checkpoints.push({
      requestHash: digest(requestId),
      text: scenario.label ?? scenario.text,
      status: result.status,
      modelCalls: modelCalls - beforeModels,
      nativeGets: transport.length - beforeReads,
      reply: typeof body.reply === 'string' ? sanitizedReply(body.reply) : null,
      grounding: object(body.grounding).status ?? null,
      errorCode: object(body.error).code ?? null,
      errorMessageHash:
        body.message === undefined ? null : digest(body.message),
    });
    expect(modelCalls - beforeModels).toBeLessThanOrEqual(1);
    if (typeof body.reply === 'string') assertPrivateAbsent(body.reply);
    return { status: result.status, body };
  }
  function assertVerified(response: {
    status: number;
    body: Record<string, unknown>;
  }) {
    expect(response.status).toBe(201);
    expect(checkpoints.at(-1)?.modelCalls).toBe(1);
    expect(response.body.action).toBeNull();
    expect(object(response.body.grounding).status).toBe('verified');
    expect(response.body.resolution).toBeUndefined();
    expect(response.body.tools_used).toEqual([
      expect.objectContaining({
        name: 'catalog.staff.read',
        status: 'completed',
      }),
      expect.objectContaining({
        name: 'catalog.services.read',
        status: 'completed',
      }),
    ]);
    expect(String(response.body.reply)).not.toContain(
      'UNVERIFIED_PLANNER_TEXT',
    );
    assertPrivateAbsent(response.body);
  }
  function assertBlocked(response: {
    status: number;
    body: Record<string, unknown>;
  }) {
    expect(response.status).toBe(201);
    expect(object(response.body.grounding).status).toBe('blocked');
    expect(response.body.action).toBeNull();
    expect(response.body.resolution).toBeUndefined();
    expect(String(response.body.reply)).not.toMatch(
      /1500|2200|3300|4000|2000|2600|UNVERIFIED_PLANNER_TEXT/,
    );
    assertPrivateAbsent(response.body);
  }
  function assertNativeReads(
    mark: number,
    salon: Salon,
    staffId: string | null,
  ) {
    const reads = transport.slice(mark);
    const rosterReads = reads.filter((row) => row.resource === 'staff');
    expect(rosterReads.length).toBeLessThanOrEqual(1);
    const rosterRead = {
      tenantHash: digest(salon.tenant.id),
      company: salon.company,
      resource: 'staff' as const,
    };
    // The native adapter may reuse its current staff catalog. This is not a
    // skipped C9 READ: evidence() separately requires both settled receipts.
    // Admit a zero-GET roster only after this process observed that exact
    // tenant/company catalog; never clear the canonical cache to force I/O.
    if (rosterReads.length === 0)
      expect(transport.slice(0, mark)).toContainEqual(rosterRead);
    expect(reads).toEqual([
      ...(rosterReads.length ? [rosterRead] : []),
      ...(staffId === null
        ? []
        : [
            {
              tenantHash: digest(salon.tenant.id),
              company: salon.company,
              resource: 'services',
              staffId,
            },
          ]),
    ]);
    return reads.length;
  }
  async function evidence(
    salon: Salon,
    response: Record<string, unknown>,
    staffId = '71',
    actor = salon.owner,
  ) {
    const coordination = object(response.coordination);
    expect(coordination.state).toBe('COMPLETED');
    assert.ok(typeof coordination.run_id === 'string');
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId: coordination.run_id },
      orderBy: { admittedAt: 'asc' },
    });
    expect(rows.map((row) => row.taskKey).sort()).toEqual([
      'catalog.services.read',
      'catalog.staff.read',
    ]);
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
        toolName: row.taskKey,
        status: 'completed',
      });
      assert.ok(execution.encryptedResult);
      const result = object(
        JSON.parse(db.encryption.decrypt(execution.encryptedResult)) as unknown,
      );
      if (row.taskKey === 'catalog.services.read') {
        const current = await http.app
          .get(TenantContextService)
          .runAsAuthPrincipal(
            { tenantId: salon.tenant.id, userId: actor.id, role: actor.role },
            async () => ({
              source: await http.app
                .get(CrmService)
                .resolveStaffScheduleSource(salon.tenant.id, staffId),
              branch: await http.app
                .get(CrmService)
                .resolveConfiguredBookingBranch(salon.tenant.id),
            }),
          );
        assert.ok(current.branch);
        expect(result).toMatchObject({
          contract: 'maya.service-catalog.read/1',
          source: 'external_crm',
          catalog_exhaustive: false,
          read_scope: {
            contract: 'maya.staff-service-catalog.read/1',
            branch_id: salon.branchId,
            source_hash: current.source.sourceHash,
            source_revision: current.branch.sourceRevision,
            staff_id: staffId,
          },
        });
        const scope = object(result.read_scope);
        expect(Object.keys(scope).sort()).toEqual([
          'branch_id',
          'contract',
          'source_hash',
          'source_revision',
          'staff_id',
        ]);
        expect(current.source.branchId).toBe(salon.branchId);
        expect(current.source.timezone).toBe(BRANCH_TIMEZONE);
        expect(current.source.externalStaffId).toBe(staffId);
        expect(scope.source_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(scope.source_revision).toMatch(/^[a-f0-9]{64}$/);
        const items = result.services;
        assert.ok(Array.isArray(items));
        if (staffId === '76') expect(items).toEqual([]);
        else {
          expect(items).toHaveLength(6);
          const byName = (name: string) =>
            object(items.find((item: unknown) => object(item).name === name));
          expect(byName(SERVICE)).toMatchObject({
            price: staffId === '72' ? salon.fixedPrice + 700 : salon.fixedPrice,
            currency: salon.currency,
            duration_minutes: 30,
          });
          expect(byName('Комплекс')).toMatchObject({
            price: null,
            price_min: 2000,
            price_max: 2600,
          });
          expect(byName('Консультация')).toMatchObject({
            price: 0,
            price_min: 0,
            price_max: 0,
          });
          expect(byName('Уход')).toMatchObject({
            price: null,
            price_min: null,
            price_max: null,
          });
          expect(byName('Уход').limitations).toContain(
            'fixed_price_not_observed',
          );
          if (salon.currency === null)
            expect(byName(SERVICE).limitations).toContain(
              'currency_not_configured',
            );
        }
        assertPrivateAbsent(result);
        // Record exact opaque source metadata, not a text sanitizer that could
        // mistake hexadecimal digits for a phone number.
        references.push({
          sourceHash: current.source.sourceHash,
          sourceRevision: scope.source_revision,
          staffId,
          company: salon.company,
          workHash: digest(row.id),
          executionHash: digest(execution.id),
          taskKey: row.taskKey,
          inputHash: execution.inputHash,
          resultHash: digest(result),
        });
      } else
        references.push({
          workHash: digest(row.id),
          executionHash: digest(execution.id),
          taskKey: row.taskKey,
          inputHash: execution.inputHash,
          resultHash: digest(result),
        });
    }
    expect(sourceReceipts.length).toBeLessThan(25);
    sourceReceipts.push({
      runHash: digest(coordination.run_id),
      actorHash: digest(actor.id),
      company: salon.company,
      staffId,
      references,
    });
    return coordination.run_id;
  }
  async function assertNoPrivateToolReads() {
    const where = { tenantId: { in: salons.map((s) => s.tenant.id) } };
    const executions = await db.prisma.aiToolExecution.findMany({
      where,
      select: { toolName: true },
    });
    expect(executions.length).toBeGreaterThan(0);
    expect(
      executions.every((row) =>
        ['catalog.staff.read', 'catalog.services.read'].includes(row.toolName),
      ),
    ).toBe(true);
    expect(await db.prisma.client.count({ where })).toBe(0);
  }
  it('keeps employee-specific facts and exact evidence through application/PG restart', async () => {
    if (stage === 'prepare') {
      const a = await seed(99501),
        b = await seed(99502),
        unknownCurrency = await seed(99503, null);
      const token = await login(a),
        foreignToken = await login(b),
        clientToken = await login(a, a.clientActor);
      const restrictedToken = await login(a, a.restricted);
      await configurePrivateGuidance(a, token);
      const mark = http.recorder.mark(),
        before = await business();
      const requestId = randomUUID();
      const first = await chat(token, LIST, requestId);
      assertVerified(first);
      for (const value of [
        'Артём',
        SERVICE,
        'Комплекс',
        'Консультация',
        'Уход',
      ])
        expect(first.body.reply).toContain(value);
      expect(
        String(first.body.reply).replace(/[\s\u00a0\u202f]/g, ''),
      ).toContain('1500');
      expect(transport).toEqual([
        {
          tenantHash: digest(a.tenant.id),
          company: a.company,
          resource: 'staff',
        },
        {
          tenantHash: digest(a.tenant.id),
          company: a.company,
          resource: 'services',
          staffId: '71',
        },
      ]);
      const conversationId = object(first.body.user_turn).conversationId;
      assert.ok(typeof conversationId === 'string');
      const runId = await evidence(a, first.body),
        firstEvidenceHash = digest(sourceReceipts.at(-1));
      const graphBeforeReplay = await graph(a.tenant.id),
        beforeReplay = transport.length;
      const replay = await chat(token, LIST, requestId, conversationId);
      assertVerified(replay);
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

      for (const [employee, staffId, value] of [
        ['Артём', '71', '1500'],
        ['Марина', '72', '2200'],
      ] as const) {
        const n = transport.length;
        const answer = await chat(token, price(employee));
        assertVerified(answer);
        expect(answer.body.reply).toContain(employee);
        expect(answer.body.reply).toContain(SERVICE);
        expect(
          String(answer.body.reply).replace(/[\s\u00a0\u202f]/g, ''),
        ).toContain(value);
        expect(
          String(answer.body.reply).replace(/[\s\u00a0\u202f]/g, ''),
        ).not.toContain(value === '1500' ? '2200' : '1500');
        assertNativeReads(n, a, staffId);
        await evidence(a, answer.body, staffId);
      }
      const clientBefore = transport.length;
      const client = await chat(clientToken, price('Марина'));
      assertVerified(client);
      expect(client.body.reply).toContain('Марина');
      expect(
        String(client.body.reply).replace(/[\s\u00a0\u202f]/g, ''),
      ).toContain('2200');
      await evidence(a, client.body, '72', a.clientActor);
      const clientNativeGets = assertNativeReads(clientBefore, a, '72');
      report.clientPublicRead = {
        status: client.status,
        role: 'CLIENT',
        clientIdentityGranted: false,
        source: 'EXACT_STAFF_SCOPED_NATIVE_CATALOG',
        nativeGets: clientNativeGets,
      };
      const beforePrivateRead = transport.length;
      const guidance = await request(http.app.getHttpServer())
        .get('/api/governed-settings/tenant/business_rules')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(guidance.status).toBe(403);
      assertPrivateAbsent(guidance.body);
      expect(transport).toHaveLength(beforePrivateRead);
      report.clientInternalGuidance = {
        status: guidance.status,
        privateFactsWithheld: true,
        providerReadsAdded: 0,
      };

      const range = await chat(token, price('Артём', 'Комплекс'));
      assertVerified(range);
      expect(String(range.body.reply).replace(/[\s\u00a0\u202f]/g, '')).toMatch(
        /2000[^\d]+2600/,
      );
      await evidence(a, range.body);
      const zero = await chat(token, price('Артём', 'Консультация'));
      assertVerified(zero);
      expect(String(zero.body.reply)).toMatch(/\b0\b/);
      await evidence(a, zero.body);
      const unknown = await chat(token, price('Артём', 'Уход'));
      assertVerified(unknown);
      expect(String(unknown.body.reply)).toMatch(
        /цен[^.\n]*(?:не|нет|неизвест)/i,
      );
      await evidence(a, unknown.body);
      const currency = await chat(await login(unknownCurrency), price('Артём'));
      assertVerified(currency);
      expect(String(currency.body.reply)).toMatch(
        /валют[^.\n]*(?:не|нет|неизвест)/i,
      );
      expect(currency.body.reply).not.toMatch(/RUB|₽|руб/);
      await evidence(unknownCurrency, currency.body);
      const empty = await chat(token, {
        text: 'Какие услуги выполняет Никита в филиале Набережная?',
        employee: 'Никита',
        branch: BRANCH_NAME,
      });
      assertVerified(empty);
      expect(String(empty.body.reply)).toMatch(/не возвращены/);
      expect(String(empty.body.reply)).toMatch(
        /Полнота каталога не подтверждена/,
      );
      await evidence(a, empty.body, '76');
      report.numericFacts = {
        sameServiceDifferentStaff: true,
        observedZeroDistinctFromUnknown: true,
        boundedRange: true,
        unknownCurrencyNotRubles: true,
        emptyIsScopedNotComplete: true,
      };

      const beforeForeign = transport.length;
      const foreignHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignHistory.status).toBe(200);
      expect(object(foreignHistory.body).turns).toEqual([]);
      const foreignRun = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + runId)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignRun.status).toBe(400);
      expect(object(foreignRun.body).message).toBe('c9_run_authority');
      expect(transport).toHaveLength(beforeForeign);
      const ownForeign = await chat(foreignToken, price('Артём'));
      assertVerified(ownForeign);
      expect(
        String(ownForeign.body.reply).replace(/[\s\u00a0\u202f]/g, ''),
      ).toContain('3300');
      expect(ownForeign.body.reply).not.toContain('1500');
      await evidence(b, ownForeign.body);
      report.foreignArtifacts = {
        historyIsolated: true,
        runStatus: foreignRun.status,
        independentCompanyPrice: true,
      };

      // Both Sashas exist in the actual provider catalog. Elena is uniquely
      // named but deliberately lacks this tenant's StaffProviderLink.
      for (const employee of ['Саша', 'Елена', 'Несуществующий']) {
        const n = transport.length;
        const answer = await chat(token, {
          text: `Какие услуги выполняет ${employee}?`,
          employee,
        });
        assertBlocked(answer);
        assertNativeReads(n, a, null);
      }
      for (const service of ['Дублированная услуга', 'Несуществующая услуга']) {
        const n = transport.length;
        assertBlocked(await chat(token, price('Артём', service)));
        assertNativeReads(n, a, '71');
      }
      const beforeBranch = transport.length;
      assertBlocked(
        await chat(token, {
          ...LIST,
          text: `Какие услуги выполняет Артём в филиале ${b.branchId}?`,
          branch: b.branchId,
          label: 'Foreign tenant branch ID omitted',
        }),
      );
      assertBlocked(
        await chat(token, {
          ...LIST,
          text: 'Какие услуги выполняет Артём в другом филиале?',
          branch: 'другой филиал',
        }),
      );
      expect(transport).toHaveLength(beforeBranch);
      const restricted = await chat(restrictedToken, LIST);
      expect(restricted.status).toBe(403);
      expect(transport).toHaveLength(beforeBranch);
      const beforeMalformed = transport.length;
      const malformed = await chat(token, {
        text: 'Какие услуги выполняет Ольга?',
        employee: 'Ольга',
      });
      assertBlocked(malformed);
      assertNativeReads(beforeMalformed, a, '77');
      report.sourceRefusals = {
        ambiguousEmployee: true,
        missingEmployeeLink: true,
        unknownEmployee: true,
        ambiguousService: true,
        unknownService: true,
        foreignBranch: true,
        nonconfiguredBranch: true,
        malformedCatalog: true,
        branchRestrictedStatus: restricted.status,
        tenantCatalogFallback: false,
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
      assert.ok(typeof first.body.reply === 'string');
      expect(
        turns.every((turn) => !turn.textContent?.includes('Услуги мастера')),
      ).toBe(true);
      await assertNoPrivateToolReads();
      expect(await business()).toBe(before);
      noWrites(mark);
      saved = {
        contract: 'synthetic-staff-services-read-proof/1',
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
      // Private synthetic login fixture only; never archive this restart receipt.
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
      const turns = object(history.body).turns;
      assert.ok(Array.isArray(turns));
      expect(
        turns.some((turn: unknown) => {
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
        LIST,
        saved.requestId,
        saved.conversationId,
      );
      assertVerified(replay);
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

      const beforeDrift = transport.length;
      serviceHook = async () => {
        await db.prisma.crmIntegration.update({
          where: { tenantId: b.tenant.id },
          data: {
            settingsJson: {
              companyId: 99512,
              currency: 'RUB',
              branchBinding: {
                contract: 'maya.crm-branch-binding/1',
                companyId: 99512,
                branchId: b.branchId,
              },
            },
          },
        });
      };
      const midDrift = await chat(otherToken, price('Артём'));
      assertBlocked(midDrift);
      const driftNativeGets = assertNativeReads(beforeDrift, b, '71');
      report.midReadCompanyCutover = {
        status: midDrift.status,
        previousCompany: b.company,
        currentCompany: 99512,
        capturedFactsWithheld: true,
        tenantCatalogFallback: false,
        nativeGets: driftNativeGets,
      };

      const beforeRevocation = transport.length;
      serviceHook = async () => {
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: a.revoked.id, tenantId: a.tenant.id },
          },
          data: { status: 'suspended' },
        });
      };
      const revokedDuringRead = await chat(revokedToken, LIST);
      expect(revokedDuringRead.status).toBe(403);
      expect(revokedDuringRead.body.reply).toBeUndefined();
      const revocationNativeGets = assertNativeReads(beforeRevocation, a, '71');
      const n = transport.length,
        models = modelCalls;
      const revoked = await chat(revokedToken, LIST);
      expect(revoked.status).toBe(401);
      expect(transport).toHaveLength(n);
      expect(modelCalls).toBe(models);
      report.revocation = {
        duringReadStatus: revokedDuringRead.status,
        priorReadStatus: revoked.status,
        duringReadProviderReads: revocationNativeGets,
        afterRevocationProviderReads: 0,
      };

      const beforeReplayDrift = transport.length;
      await db.prisma.crmIntegration.update({
        where: { tenantId: a.tenant.id },
        data: { updatedAt: new Date(Date.now() + 1000) },
      });
      const drift = await chat(
        token,
        LIST,
        saved.requestId,
        saved.conversationId,
      );
      assertBlocked(drift);
      expect(transport).toHaveLength(beforeReplayDrift);
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
