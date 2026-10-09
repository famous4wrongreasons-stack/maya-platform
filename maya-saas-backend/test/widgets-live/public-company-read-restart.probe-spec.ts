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
import {
  chatReplyId,
  decodeChatCompletion,
  decodeChatReply,
  isChatReply,
} from '../../src/widgets/stores/chat-reply-codec';
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
import { c9Hash } from '../../src/orchestration/c9.contract';

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
const ORIGINAL_DATASET_SHA256 =
  '9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b';
const SUPPLEMENTAL_BRANCH = 'основной филиал';
const SUPPLEMENTAL_REQUESTS = [
  {
    id: 'utt-company.public_info-037',
    sourceRowSha256:
      '71783d08af20d161d23e02de6748a5e07b5ed717d687af28e83651873bd3a674',
    text: 'Покажите актуальные данные: как вас найти. По точке «основной филиал». Покажи главный вывод.',
  },
  {
    id: 'utt-company.public_info-041',
    sourceRowSha256:
      '645e728407459ff68d9d5bf2b6677a4114a322ae8a51b65e3cc8028101c1ad5d',
    text: 'Итогом: как вас найти? По точке «основной филиал». Покажи главный вывод.',
  },
] as const;
type SupplementalCaseId = (typeof SUPPLEMENTAL_REQUESTS)[number]['id'];
const SUPPLEMENTAL_QUALIFICATION =
  'SEPARATE_SCRIPTED_BRANCH_EXTRACTION_AND_SYNTHETIC_BINDING_NOT_ORIGINAL_81_RESCORE';
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
type SupplementalSaved = {
  originalCaseId: SupplementalCaseId;
  tenantId: string;
  requestId: string;
  conversationId: string;
  parentTurnId: string;
  assistantTurnId: string;
  firstReply: string;
  completionHash: string;
  historyAssistantTurnId: string;
  historyReply: string;
  historyCompletionHash: string;
  runId: string;
  evidenceHash: string;
  publicProfileHash: string;
  sourceRevision: string;
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
  supplemental: SupplementalSaved[];
  supplementalGraph: string;
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
  const supplemental: SupplementalSaved[] = [];
  const supplementalReceipts: Record<string, unknown>[] = [];
  const nativeProfiles: Array<{
    tenantHash: string;
    company: number;
    publicProfileHash: string;
  }> = [];
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
    supplementalQualification: SUPPLEMENTAL_QUALIFICATION,
    originalDatasetSha256: ORIGINAL_DATASET_SHA256,
    supplementalOriginalCases: SUPPLEMENTAL_REQUESTS.map((row) => row.id),
    supplementalOriginalFamilies: 1,
    supplementalRole: 'CLIENT',
    c9ReadsPerPositive: 1,
    nativeGetCountIsNotC9ReadCount: true,
    noBusinessWritesClaim: 'OBSERVED_SCOPED_FAMILIES_AFTER_FIXTURE_SETUP',
  };
  beforeAll(async () => {
    // Read-only pin: these cases remain unchanged in the original 48/81 corpus.
    const originalBytes = readFileSync(
      path.resolve(
        __dirname,
        '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
      ),
    );
    assert.equal(
      createHash('sha256').update(originalBytes).digest('hex'),
      ORIGINAL_DATASET_SHA256,
    );
    const original = object(
      JSON.parse(originalBytes.toString('utf8')) as unknown,
    );
    assert.ok(Array.isArray(original.cases));
    const originalCases: unknown[] = original.cases;
    assert.equal(originalCases.length, 48);
    for (const requested of SUPPLEMENTAL_REQUESTS) {
      const matched = originalCases.filter(
        (row: unknown) => object(row).id === requested.id,
      );
      assert.equal(matched.length, 1);
      assert.equal(object(matched[0]).role, 'client');
      assert.equal(
        object(matched[0]).sourceRowSha256,
        requested.sourceRowSha256,
      );
      assert.deepEqual(object(matched[0]).userTurns, [requested.text]);
      assert.deepEqual(object(matched[0]).familyRefs, [
        'historical-single:company.public_info:3',
      ]);
    }
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
      assert.equal(saved.supplemental.length, SUPPLEMENTAL_REQUESTS.length);
      assert.deepEqual(
        saved.supplemental.map((row) => row.originalCaseId),
        SUPPLEMENTAL_REQUESTS.map((row) => row.id),
      );
      supplemental.push(...saved.supplemental);
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
      nativeProfiles.push({
        tenantHash: digest(salon.tenant.id),
        company: salon.company,
        publicProfileHash: digest({
          name: salon.title,
          address: salon.address,
        }),
      });
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
      supplementalReceipts,
      nativeProfiles,
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
    options: {
      noTitle?: boolean;
      noAddress?: boolean;
      unbound?: boolean;
      branchName?: string;
      mismatchedCompany?: boolean;
    } = {},
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
        name: options.branchName ?? BRANCH_NAME,
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
                  companyId: options.mismatchedCompany
                    ? company + 1000
                    : company,
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
    return {
      status: result.status,
      body,
      modelCalls: modelCalls - beforeModels,
    };
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
  function supplementalScenario(originalCaseId: SupplementalCaseId): Scenario {
    const requested = SUPPLEMENTAL_REQUESTS.find(
      (row) => row.id === originalCaseId,
    );
    assert.ok(requested);
    // Separate scripted extraction through the real parser; never modify the
    // original offline model recipe or assert natural-language model quality.
    return {
      text: requested.text,
      branch: SUPPLEMENTAL_BRANCH,
      field: 'address',
    };
  }
  async function supplementalCompletion(
    salon: Salon,
    response: Record<string, unknown>,
    expectedAssistantId?: string,
  ) {
    const userTurn = object(response.user_turn);
    assert.ok(
      typeof userTurn.turnId === 'string' &&
        typeof userTurn.conversationId === 'string',
    );
    const now = new Date();
    const parent = await db.prisma.widgetTimelineTurn.findFirstOrThrow({
      where: {
        id: userTurn.turnId,
        tenantId: salon.tenant.id,
        conversationId: userTurn.conversationId,
        role: 'user',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: now },
      },
    });
    const candidates = await db.prisma.widgetTimelineTurn.findMany({
      where: {
        ...(expectedAssistantId ? { id: expectedAssistantId } : {}),
        tenantId: salon.tenant.id,
        conversationId: parent.conversationId,
        principalProofHash: parent.principalProofHash,
        role: 'assistant',
        channel: 'pwa',
        turnIndex: { gt: parent.turnIndex },
        erasedAt: null,
        retentionUntil: { gt: now },
      },
      orderBy: { turnIndex: 'desc' },
      take: 3,
    });
    const matches = candidates.flatMap((stored) => {
      if (stored.textContent === null || !isChatReply(stored.textContent))
        return [];
      const completion = decodeChatCompletion(
        db.encryption,
        stored.textContent,
      );
      return completion.parentId === parent.id &&
        completion.text === response.reply
        ? [{ stored, completion }]
        : [];
    });
    expect(matches).toHaveLength(1);
    const { stored, completion } = matches[0];
    expect(stored.id).toBe(
      chatReplyId(salon.tenant.id, `${parent.id}:${completion.completionHash}`),
    );
    assertPrivateAbsent(completion);
    return { parent, stored, completion };
  }
  async function supplementalEvidence(
    salon: Salon,
    response: Record<string, unknown>,
    expectedProfileHash: string,
    expectedAssistantId?: string,
  ) {
    const actor = salon.clientActor;
    expect(actor.role).toBe(UserRole.CLIENT);
    const membership = await db.prisma.membership.findUniqueOrThrow({
      where: {
        userId_tenantId: { userId: actor.id, tenantId: salon.tenant.id },
      },
    });
    expect(membership).toMatchObject({
      status: 'active',
      role: UserRole.CLIENT,
    });
    const runId = await evidence(salon, response, actor);
    const run = await db.prisma.c9Run.findFirstOrThrow({
      where: { id: runId, tenantId: salon.tenant.id },
    });
    expect(run.state).toBe('COMPLETED');
    expect(object(run.principalJson)).toMatchObject({
      kind: 'USER',
      tenantId: salon.tenant.id,
      userId: actor.id,
      membershipId: membership.id,
      clientId: null,
      channelLinkId: null,
    });
    const work = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId },
    });
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      state: 'SETTLED',
      kind: 'TOOL_READ',
      taskKey: 'catalog.staff.read',
    });
    const ref = object(work[0].resultJson);
    assert.ok(typeof ref.executionId === 'string');
    const execution = await db.prisma.aiToolExecution.findUniqueOrThrow({
      where: { id: ref.executionId },
    });
    assert.ok(execution.completedAt && execution.encryptedResult);
    expect(execution).toMatchObject({
      tenantId: salon.tenant.id,
      actorUserId: actor.id,
      toolName: 'catalog.staff.read',
      riskTier: 'read',
      status: 'completed',
    });
    expect(ref).toEqual({
      contract: 'maya.c9-conversation-read-receipt/1',
      sourceType: 'AiToolExecution',
      executionId: execution.id,
      inputHash: execution.inputHash,
      completedAt: execution.completedAt.toISOString(),
      capability: 'catalog.staff.read',
      businessQualification: 'SOURCE_DEFINED',
    });
    expect(work[0].resultHash).toBe(c9Hash('work-result/1', [ref]));
    expect(response.tools_used).toEqual([
      expect.objectContaining({
        name: 'catalog.staff.read',
        status: 'completed',
        execution_id: execution.id,
      }),
    ]);
    const result = object(
      JSON.parse(db.encryption.decrypt(execution.encryptedResult)) as unknown,
    );
    const publicScope = object(result.public_scope);
    expect(digest(result.salon)).toBe(expectedProfileHash);
    expect(publicScope).toMatchObject({
      contract: 'maya.company-public-profile.read/1',
      projection: 'company_profile',
      branch_id: salon.branchId,
      company_id: String(salon.company),
    });
    assert.ok(typeof publicScope.source_revision === 'string');
    const stored = await supplementalCompletion(
      salon,
      response,
      expectedAssistantId,
    );
    expect(stored.parent.principalProofHash).toBe(run.authorityHash);
    const semanticContext = object(stored.completion.semanticContext);
    expect(semanticContext.version).toBe('maya.chat-semantic-context/1');
    const plan = object(semanticContext.plan);
    assert.ok(Array.isArray(plan.tasks));
    expect(plan.tasks).toHaveLength(1);
    expect(object(plan.tasks[0])).toMatchObject({
      intent: 'company.public_info',
      requires_clarification: false,
      entities: { branch: SUPPLEMENTAL_BRANCH, field: 'address' },
    });
    const linked = {
      runHash: digest(runId),
      workHash: digest(work[0].id),
      executionHash: digest(execution.id),
      actorHash: digest(actor.id),
      authorityHash: run.authorityHash,
      inputHash: execution.inputHash,
      resultHash: digest(result),
      workResultHash: work[0].resultHash,
      publicScopeHash: digest(publicScope),
      publicProfileHash: expectedProfileHash,
    };
    return {
      ...stored,
      runId,
      sourceRevision: publicScope.source_revision,
      publicProfileHash: expectedProfileHash,
      evidenceHash: digest(linked),
      linked,
    };
  }
  function assertSupplementalAddress(
    response: {
      status: number;
      body: Record<string, unknown>;
      modelCalls: number;
    },
    salon: Salon,
    replayed = false,
  ) {
    assertVerified(response);
    expect(response.modelCalls).toBe(1);
    expect(response.body.reply).toBe(
      [
        ...(replayed ? ['Сохранённый результат проверки.'] : []),
        'По данным CRM для выбранного филиала:',
        `Адрес в профиле: ${salon.address}.`,
      ].join('\n'),
    );
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
      const supplementalBound = await seed(99407, {
          branchName: SUPPLEMENTAL_BRANCH,
        }),
        supplementalUnbound = await seed(99408, {
          branchName: SUPPLEMENTAL_BRANCH,
          unbound: true,
        }),
        supplementalMismatched = await seed(99409, {
          branchName: SUPPLEMENTAL_BRANCH,
          mismatchedCompany: true,
        });
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
      // Two unchanged original utterances under separate, explicitly bound
      // synthetic source conditions. These do not replace the original 81 runs.
      let supplementalConversationId: string | undefined;
      const supplementalToken = await login(
        supplementalBound,
        supplementalBound.clientActor,
      );
      for (const requested of SUPPLEMENTAL_REQUESTS) {
        const scenario = supplementalScenario(requested.id);
        const key = randomUUID();
        const before = {
          reads: transport.length,
          profiles: nativeProfiles.length,
        };
        const result = await chat(
          supplementalToken,
          scenario,
          key,
          supplementalConversationId,
        );
        assertSupplementalAddress(result, supplementalBound);
        const conversation = object(result.body.user_turn).conversationId;
        assert.ok(typeof conversation === 'string');
        if (supplementalConversationId)
          expect(conversation).toBe(supplementalConversationId);
        supplementalConversationId = conversation;
        expect(transport.slice(before.reads)).toEqual([
          {
            tenantHash: digest(supplementalBound.tenant.id),
            resource: 'company',
            company: supplementalBound.company,
          },
        ]);
        expect(nativeProfiles.length - before.profiles).toBe(1);
        const observed = nativeProfiles[before.profiles];
        expect(observed).toMatchObject({
          tenantHash: digest(supplementalBound.tenant.id),
          company: supplementalBound.company,
        });
        const linked = await supplementalEvidence(
          supplementalBound,
          result.body,
          observed.publicProfileHash,
        );
        expect(linked.parent.conversationId).toBe(conversation);
        assert.ok(typeof result.body.reply === 'string');
        const beforeReplay = {
          reads: transport.length,
          profiles: nativeProfiles.length,
          graph: await graph(supplementalBound.tenant.id),
        };
        const repeated = await chat(
          supplementalToken,
          scenario,
          key,
          conversation,
        );
        assertSupplementalAddress(repeated, supplementalBound, true);
        const replayEvidence = await supplementalEvidence(
          supplementalBound,
          repeated.body,
          observed.publicProfileHash,
        );
        expect(replayEvidence.runId).toBe(linked.runId);
        expect(replayEvidence.evidenceHash).toBe(linked.evidenceHash);
        expect(replayEvidence.parent.id).toBe(linked.parent.id);
        expect(transport).toHaveLength(beforeReplay.reads);
        expect(nativeProfiles).toHaveLength(beforeReplay.profiles);
        expect(await graph(supplementalBound.tenant.id)).toBe(
          beforeReplay.graph,
        );
        supplemental.push({
          originalCaseId: requested.id,
          tenantId: supplementalBound.tenant.id,
          requestId: key,
          conversationId: conversation,
          parentTurnId: linked.parent.id,
          assistantTurnId: linked.stored.id,
          firstReply: result.body.reply,
          completionHash: linked.completion.completionHash,
          historyAssistantTurnId: replayEvidence.stored.id,
          historyReply: replayEvidence.completion.text,
          historyCompletionHash: replayEvidence.completion.completionHash,
          runId: linked.runId,
          evidenceHash: linked.evidenceHash,
          publicProfileHash: linked.publicProfileHash,
          sourceRevision: linked.sourceRevision,
        });
        supplementalReceipts.push({
          originalCaseId: requested.id,
          utteranceHash: digest(requested.text),
          originalSourceRowSha256: requested.sourceRowSha256,
          qualification: SUPPLEMENTAL_QUALIFICATION,
          originalFamily: 'historical-single:company.public_info:3',
          phase: 'boundClientReadAndImmediateReplay',
          role: 'CLIENT',
          goalCompleted: true,
          original81Reclassified: false,
          source: 'SCOPED_NATIVE_PROFILE',
          branch: SUPPLEMENTAL_BRANCH,
          evidence: linked.linked,
          evidenceHash: linked.evidenceHash,
          parentHash: digest(linked.parent.id),
          completionHash: linked.completion.completionHash,
          freshNativeReads: 1,
          c9Reads: 1,
          replayNativeReads: 0,
        });
      }
      for (const [salon, boundary] of [
        [supplementalUnbound, 'missing_company_branch_binding'],
        [supplementalMismatched, 'company_id_disagrees_with_branch_binding'],
      ] as const) {
        const clientToken = await login(salon, salon.clientActor);
        const before = {
          reads: transport.length,
          profiles: nativeProfiles.length,
          graph: await graph(salon.tenant.id),
        };
        for (const requested of SUPPLEMENTAL_REQUESTS) {
          const refused = await chat(
            clientToken,
            supplementalScenario(requested.id),
          );
          assertBlocked(refused, SOURCE_UNAVAILABLE);
          expect(refused.modelCalls).toBe(1);
          expect(refused.body.tools_used).toEqual([]);
          expect(transport).toHaveLength(before.reads);
          expect(nativeProfiles).toHaveLength(before.profiles);
          expect(await graph(salon.tenant.id)).toBe(before.graph);
          expect(
            await db.prisma.aiToolExecution.count({
              where: { tenantId: salon.tenant.id },
            }),
          ).toBe(0);
          supplementalReceipts.push({
            originalCaseId: requested.id,
            utteranceHash: digest(requested.text),
            phase: boundary,
            role: 'CLIENT',
            status: refused.status,
            goalCompleted: false,
            nativeReadsAdded: 0,
            c9ReadsAdded: 0,
            tenantBrandingFallback: false,
            qualification: SUPPLEMENTAL_QUALIFICATION,
          });
        }
      }
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
        supplemental,
        supplementalGraph: await graph(supplementalBound.tenant.id),
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
      // Retain the original A/B cold-cache and revocation controls above. This
      // distinct CLIENT tenant has its own same-conversation history and receipts.
      const supplementalSalon = salons.find(
        (salon) => salon.tenant.id === supplemental[0].tenantId,
      );
      assert.ok(supplementalSalon);
      expect(
        supplemental.every(
          (row) => row.tenantId === supplementalSalon.tenant.id,
        ),
      ).toBe(true);
      expect(new Set(supplemental.map((row) => row.conversationId)).size).toBe(
        1,
      );
      expect(await graph(supplementalSalon.tenant.id)).toBe(
        saved.supplementalGraph,
      );
      const supplementalToken = await login(
        supplementalSalon,
        supplementalSalon.clientActor,
      );
      const beforeHistory = { reads: transport.length, models: modelCalls };
      const supplementalHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${supplementalToken}`);
      expect(supplementalHistory.status).toBe(200);
      expect(object(supplementalHistory.body).conversationId).toBe(
        supplemental[0].conversationId,
      );
      const supplementalTurns = object(supplementalHistory.body).turns;
      assert.ok(Array.isArray(supplementalTurns));
      assertPrivateAbsent(supplementalHistory.body);
      for (const original of supplemental) {
        const scenario = supplementalScenario(original.originalCaseId);
        expect(
          supplementalTurns.some((value: unknown) => {
            const row = object(value);
            return (
              row.id === original.parentTurnId &&
              row.role === 'user' &&
              row.text === scenario.text
            );
          }),
        ).toBe(true);
        expect(
          supplementalTurns.some((value: unknown) => {
            const row = object(value);
            return (
              row.id === original.historyAssistantTurnId &&
              row.role === 'assistant' &&
              row.text === original.historyReply
            );
          }),
        ).toBe(true);
        const persisted = await supplementalCompletion(
          supplementalSalon,
          {
            user_turn: {
              turnId: original.parentTurnId,
              conversationId: original.conversationId,
            },
            reply: original.firstReply,
          },
          original.assistantTurnId,
        );
        expect(persisted.completion.completionHash).toBe(
          original.completionHash,
        );
        const latest = await supplementalCompletion(
          supplementalSalon,
          {
            user_turn: {
              turnId: original.parentTurnId,
              conversationId: original.conversationId,
            },
            reply: original.historyReply,
          },
          original.historyAssistantTurnId,
        );
        expect(latest.completion.completionHash).toBe(
          original.historyCompletionHash,
        );
      }
      expect(transport).toHaveLength(beforeHistory.reads);
      expect(modelCalls).toBe(beforeHistory.models);
      for (const original of supplemental) {
        const before = {
          reads: transport.length,
          profiles: nativeProfiles.length,
        };
        const repeated = await chat(
          supplementalToken,
          supplementalScenario(original.originalCaseId),
          original.requestId,
          original.conversationId,
        );
        assertSupplementalAddress(repeated, supplementalSalon, true);
        const linked = await supplementalEvidence(
          supplementalSalon,
          repeated.body,
          original.publicProfileHash,
          original.historyAssistantTurnId,
        );
        expect(linked.runId).toBe(original.runId);
        expect(linked.evidenceHash).toBe(original.evidenceHash);
        expect(linked.sourceRevision).toBe(original.sourceRevision);
        expect(linked.parent.id).toBe(original.parentTurnId);
        expect(transport).toHaveLength(before.reads);
        expect(nativeProfiles).toHaveLength(before.profiles);
        expect(await graph(supplementalSalon.tenant.id)).toBe(
          saved.supplementalGraph,
        );
        supplementalReceipts.push({
          originalCaseId: original.originalCaseId,
          phase: 'sameClientHistoryAndReplayAfterProcessAndPgRestart',
          qualification: SUPPLEMENTAL_QUALIFICATION,
          status: repeated.status,
          original81Reclassified: false,
          savedParentHash: digest(original.parentTurnId),
          completionHash: original.completionHash,
          evidence: linked.linked,
          evidenceHash: linked.evidenceHash,
          originalHistoryRestored: true,
          sameRun: true,
          nativeReadsAdded: 0,
        });
      }
      const beforeSupplementalDrift = {
        reads: transport.length,
        profiles: nativeProfiles.length,
        completed: await db.prisma.aiToolExecution.count({
          where: { tenantId: supplementalSalon.tenant.id, status: 'completed' },
        }),
      };
      const integration = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: supplementalSalon.tenant.id },
      });
      await db.prisma.crmIntegration.update({
        where: { tenantId: supplementalSalon.tenant.id },
        data: { updatedAt: new Date(integration.updatedAt.getTime() + 1000) },
      });
      for (const original of supplemental) {
        const refused = await chat(
          supplementalToken,
          supplementalScenario(original.originalCaseId),
          original.requestId,
          original.conversationId,
        );
        assertBlocked(refused, SOURCE_UNAVAILABLE);
        expect(refused.modelCalls).toBe(1);
        expect(transport).toHaveLength(beforeSupplementalDrift.reads);
        expect(nativeProfiles).toHaveLength(beforeSupplementalDrift.profiles);
        expect(
          await db.prisma.aiToolExecution.count({
            where: {
              tenantId: supplementalSalon.tenant.id,
              status: 'completed',
            },
          }),
        ).toBe(beforeSupplementalDrift.completed);
        // The old result remains immutable evidence; its previous scope no
        // longer qualifies a current public answer after metadata cutover.
        const work = await db.prisma.c9WorkReceipt.findMany({
          where: {
            tenantId: supplementalSalon.tenant.id,
            runId: original.runId,
            taskKey: 'catalog.staff.read',
            state: 'SETTLED',
          },
        });
        expect(work).toHaveLength(1);
        const reference = object(work[0].resultJson);
        assert.ok(typeof reference.executionId === 'string');
        const old = await db.prisma.aiToolExecution.findUniqueOrThrow({
          where: { id: reference.executionId },
        });
        assert.ok(old.encryptedResult);
        const oldResult = object(
          JSON.parse(db.encryption.decrypt(old.encryptedResult)) as unknown,
        );
        expect(object(oldResult.public_scope).source_revision).toBe(
          original.sourceRevision,
        );
        expect(digest(oldResult.salon)).toBe(original.publicProfileHash);
        supplementalReceipts.push({
          originalCaseId: original.originalCaseId,
          phase: 'sameRequestSourceRevisionChanged',
          qualification: SUPPLEMENTAL_QUALIFICATION,
          status: refused.status,
          publicFactsWithheld: true,
          nativeReadsAdded: 0,
          priorResultPreserved: true,
          originalEvidenceHash: original.evidenceHash,
        });
      }
      await assertNoPrivateToolReads();
      expect(await business()).toBe(saved.business);
      noWrites(mark);
      report.businessHash = saved.business;
    }
  });
});
