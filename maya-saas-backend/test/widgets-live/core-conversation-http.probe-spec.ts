/** Bounded development diagnostic: actual auth/HTTP/AiCore/DeepSeek serializer
 * and actual assistant history. No golden plan, model output substitution,
 * source-owner override or ordinary widgets harness change. The separately
 * owned broker provides canned transport in dry mode and admitted transport
 * in live mode; this process never reads a provider credential. */
import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import type { AiCoreModelInput } from '../../src/ai-tools/ai-core.types';
import { AiToolPolicyService } from '../../src/ai-tools/ai-tool-policy.service';
import { CrmProvider, UserRole } from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import type { CRMAdapter } from '../../src/crm/crm-adapter.interface';
import { observedServiceCatalog } from '../../src/crm/service-catalog-read';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import {
  bindCandidateSource,
  type CandidateSource,
  type CorpusCase,
} from './support/current-candidate-sources';
import { occupancyFixtureEdge } from './support/c9-occupancy-fixture-edge';
import { assertProofDatabase } from './support/proof-db-guard';

const nativeRequire = createRequire(__filename);
const { replayPilot, sha256 } = nativeRequire(
  path.resolve('scripts/conversation-qualification/replay.mjs'),
) as typeof import('../../scripts/conversation-qualification/replay.mjs');
const {
  CandidateBudgetGate,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
} = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/current-candidate-budget.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/current-candidate-budget.mjs');
const { readCoreManifest, assertCoreAdmission } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-conversation-admission.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/core-conversation-admission.mjs');
const mode = process.env.JEST_CORE_CONVERSATION_MODE;
const output = process.env.JEST_CORE_CONVERSATION_OUTPUT;
const brokerUrl = process.env.JEST_CORE_CONVERSATION_BROKER_URL;
const manifestPath = process.env.JEST_CORE_CONVERSATION_MANIFEST_PATH;
const manifestSha256 = process.env.JEST_CORE_CONVERSATION_MANIFEST_SHA256;
const sourceHead = process.env.JEST_CORE_CONVERSATION_SOURCE_HEAD;
const sourceDigest = process.env.JEST_CORE_CONVERSATION_SOURCE_DIGEST;
const permitPath = process.env.JEST_CORE_CONVERSATION_PERMIT_PATH;
const permitSha256 = process.env.JEST_CORE_CONVERSATION_PERMIT_SHA256;
const ownerApprovalRef = process.env.JEST_CORE_CONVERSATION_OWNER_APPROVAL_REF;
const proof = assertProofDatabase();
if (
  !/^maya_widget_gate_proof_c9occ_[a-z0-9_]+$/.test(proof.database) ||
  !['dry', 'live'].includes(mode ?? '') ||
  !output ||
  !path.isAbsolute(output) ||
  !manifestPath ||
  !path.isAbsolute(manifestPath) ||
  !/^[a-f0-9]{64}$/.test(manifestSha256 ?? '') ||
  !/^[a-f0-9]{40}$/.test(sourceHead ?? '') ||
  !/^[a-f0-9]{64}$/.test(sourceDigest ?? '') ||
  !brokerUrl ||
  !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/chat\/completions$/.test(brokerUrl) ||
  Number(new URL(brokerUrl).port) > 65535
)
  throw new Error(
    'Use the owned core conversation HTTP runner with exact fresh bindings',
  );
if (mode === 'dry' && (permitPath || permitSha256 || ownerApprovalRef))
  throw new Error('core_dry_permit_refused');
const rawFetch = globalThis.fetch;
const hash = (value: unknown) => sha256(JSON.stringify(value));
const fileHash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
type DiagnosticCase = {
  id: string;
  role: 'client' | 'owner' | 'admin';
  runtimeRole: string;
  audience: 'client' | 'owner';
  group: string;
  userTurns: string[];
};
type DiagnosticManifest = {
  contract: string;
  mode: string;
  profile: string;
  candidateCommit: string;
  sourceHashes: Record<string, string>;
  datasetSha256: string;
  dialogs: number;
  userTurns: number;
  cases: DiagnosticCase[];
  limits: unknown;
  limitsSha256: string;
  runId: string;
  paidAuthorized: false;
};
type Wire = Record<string, unknown> & {
  reply?: string;
  user_turn?: { conversationId?: string };
  coordination?: {
    run_id?: string;
    revision_id?: string;
    scope?: string;
    revision?: number;
    state?: string;
    current?: boolean;
  };
  action?: { status?: string };
  grounding?: { status?: string };
  analysis?: { evidence?: { sourceHandles?: unknown[] } };
  recommendation?: {
    outcome?: string;
    noSideEffects?: boolean;
    executionAuthority?: boolean;
    evidence?: { opportunityRefs?: unknown[]; workReceiptId?: string };
  };
};
const businessPattern =
  /^(Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/;

describe('Core conversation [actual HTTP, bounded broker, development diagnostic only]', () => {
  let db: FixtureContext, http: HttpHarness;
  let gate: InstanceType<typeof CandidateBudgetGate> | undefined;
  let manifest: DiagnosticManifest;
  let active: CandidateSource | undefined;
  let turn = 0,
    modelCalls = 0,
    serializerCalls = 0,
    brokerCalls = 0;
  let stopped: string | null = null;
  const sources = new Map<string, CandidateSource>();
  const caseSources = new Map<string, CandidateSource>();
  const financeDays = new Map<string, string>();
  const forbidden: string[] = [];
  const financeReads: Array<{ route: string; company: string }> = [];
  const modelObservations: Record<string, unknown>[] = [];
  const wireObservations: Record<string, unknown>[] = [];
  const policyObservations: Record<string, unknown>[] = [];
  const responses: Record<string, unknown>[] = [];
  const preflights: Record<string, unknown>[] = [];
  const replayRecords: Record<string, unknown>[] = [];
  let result: unknown = null;
  const write = (name: string, value: unknown) =>
    writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  const append = (name: string, value: unknown) =>
    appendFileSync(path.join(output, name), JSON.stringify(value) + '\n', {
      mode: 0o600,
    });
  beforeAll(async () => {
    const verifiedManifest = readCoreManifest(manifestPath, manifestSha256!);
    manifest = verifiedManifest as unknown as DiagnosticManifest;
    expect(manifest).toMatchObject({
      contract: 'maya.core-conversation-run/1',
      mode: mode === 'dry' ? 'DRY_HTTP' : 'ADMITTED_MODEL_HTTP',
      profile: CORE_DIAGNOSTIC_PROFILE,
      candidateCommit: sourceHead,
      dialogs: 3,
      userTurns: 5,
      paidAuthorized: false,
      limitsSha256: CORE_DIAGNOSTIC_LIMITS_SHA256,
    });
    expect(manifest.limits).toEqual(CORE_DIAGNOSTIC_LIMITS);
    const datasetPath = path.resolve(
      'datasets/conversation-intelligence/core-diagnostic-20261008.json',
    );
    const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
      cases: DiagnosticCase[];
    };
    expect(fileHash(datasetPath)).toBe(manifest.datasetSha256);
    expect(manifest.cases).toEqual(dataset.cases);
    expect(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ).toBe(sourceHead);
    const repository = path.resolve('..');
    for (const [relative, digest] of Object.entries(manifest.sourceHashes)) {
      expect(relative).not.toMatch(/^(?:\/|\.\.)/);
      const file = path.resolve(repository, relative);
      expect(file.startsWith(repository + path.sep)).toBe(true);
      expect(fileHash(file)).toBe(digest);
    }
    // A runner may assert an existing broker claim, never create a permit/claim.
    let admission: ReturnType<typeof assertCoreAdmission> | undefined;
    if (mode === 'live') {
      if (
        !permitPath ||
        !path.isAbsolute(permitPath) ||
        !/^[a-f0-9]{64}$/.test(permitSha256 ?? '') ||
        !ownerApprovalRef ||
        !verifiedManifest.admissionContext
      )
        throw new Error('core_live_admission_required');
      admission = assertCoreAdmission({
        path: permitPath,
        sha256: permitSha256!,
        manifest: verifiedManifest,
        claimPath: permitPath + '.claim',
        role: 'runner',
        ...verifiedManifest.admissionContext,
        ownerApprovalRef,
      });
    }
    const budgetMode =
      mode === 'live'
        ? {
            mode: 'ADMITTED_MODEL_ONLY' as const,
            assertAdmission: (
              binding: Parameters<ReturnType<typeof assertCoreAdmission>>[0],
            ) => {
              admission!(binding);
              return undefined;
            },
          }
        : { mode: 'OFFLINE_SYNTHETIC_ONLY' as const };
    gate = new CandidateBudgetGate({
      ledgerPath: path.join(output, 'runner-budget-ledger.jsonl'),
      manifestSha256: manifestSha256!,
      candidateCommit: sourceHead!,
      profile: CORE_DIAGNOSTIC_PROFILE,
      ...budgetMode,
      transport: async (_url, init) => {
        if (!active || typeof init?.body !== 'string')
          throw new Error('core_active_serialized_turn_required');
        expect(init.headers).toBeUndefined();
        brokerCalls++;
        const response = await rawFetch(brokerUrl, {
          method: 'POST',
          body: init.body,
          redirect: 'error',
          signal: init.signal,
          headers: {
            'content-type': 'application/json',
            'x-candidate-manifest': manifestSha256!,
            'x-candidate-case': active.item.id,
            'x-candidate-turn': String(turn),
          },
        });
        // Capture the actual synthetic-dialog model output before any parser or
        // diagnostic assertion. The bounded gate owns the response-size limit.
        return response;
      },
    });
    expect(process.env.YCLIENTS_PARTNER_TOKEN).toBeUndefined();
    process.env.YCLIENTS_PARTNER_TOKEN =
      'SYNTHETIC_CORE_NO_PROVIDER_CREDENTIAL';
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    for (const [key, value] of Object.entries({
      AI_CORE_PROVIDER: 'deepseek',
      DEEPSEEK_AI_CORE_MODEL: CORE_DIAGNOSTIC_LIMITS.model,
      DEEPSEEK_API_KEY: 'CORE_BROKER_PLACEHOLDER_NOT_A_CREDENTIAL',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      AI_CORE_MAX_OUTPUT_TOKENS: String(
        CORE_DIAGNOSTIC_LIMITS.outputPerAttempt,
      ),
    }))
      config.set(key, value);
    const factory = http.app.get(CrmAdapterFactory),
      create = factory.create.bind(factory);
    jest.spyOn(factory, 'create').mockImplementation((provider, config) => {
      const source = sources.get(String(config.settings?.syntheticTenantId));
      if (!source || provider !== CrmProvider.YCLIENTS)
        throw new Error('core_unknown_synthetic_crm_source');
      const native = create(provider, {
        ...config,
        baseUrl: `https://core-${source.company}.synthetic.invalid/api/v1`,
      });
      const read = (name: string, tenantId = source.tenant.id) => {
        expect(tenantId).toBe(source.tenant.id);
        source.reads.push(name);
      };
      const services = [
        {
          id: '81',
          name: 'Мужская стрижка',
          price: 2000,
          duration_minutes: 30,
          currency: 'RUB',
        },
      ];
      return occupancyFixtureEdge(
        {
          getServices: (tenantId: string) => {
            read('services', tenantId);
            return Promise.resolve(services);
          },
          getPublicBookingServices: (tenantId: string) => {
            read('public-services', tenantId);
            return Promise.resolve(services);
          },
          readServiceCatalog: (tenantId: string) => {
            read('service-catalog', tenantId);
            return Promise.resolve(
              observedServiceCatalog(services, 'synthetic'),
            );
          },
          getStaff: (tenantId: string) => {
            read('staff', tenantId);
            return Promise.resolve([{ id: '71', name: 'Артём' }]);
          },
          getStaffScheduleDay: ({
            tenantId,
            staffId,
            date,
          }: {
            tenantId: string;
            staffId: string;
            date: string;
          }) => {
            read('schedule', tenantId);
            return Promise.resolve({
              staff_id: staffId,
              date,
              is_working: true,
              slots: [{ from: '10:00', to: '20:00' }],
              revision: 'synthetic-core-schedule',
            });
          },
          getAvailableSlots: (
            params: Parameters<CRMAdapter['getAvailableSlots']>[0],
          ) => {
            read('availability', params.tenantId);
            return Promise.resolve([
              {
                start: source.startsAt,
                end: source.endsAt,
                staff_id: params.staffId ?? '71',
                branch_id: source.branchId,
              },
            ]);
          },
          getCompanyProfile: () => {
            read('company');
            return Promise.resolve({
              id: source.company,
              title: 'Синтетический салон',
              address: 'Синтетический адрес',
              schedule: '10:00–20:00',
              timezone: 'Europe/Moscow',
              logo_url: null,
            });
          },
          getFinancialSummary: (
            params: Parameters<
              NonNullable<CRMAdapter['getFinancialSummary']>
            >[0],
          ) => {
            read('finance-native', params.tenantId);
            return native.getFinancialSummary!(params);
          },
        },
        (key) => {
          forbidden.push('crm:' + key);
        },
      ) as unknown as CRMAdapter;
    });
    const model = http.app.get(AiCoreModelService),
      decide = model.decide.bind(model);
    jest
      .spyOn(model, 'decide')
      .mockImplementation(async (input: AiCoreModelInput) => {
        modelCalls++;
        modelObservations.push({
          caseId: active?.item.id,
          turn,
          role: input.principalRole,
          actualTools: input.tools.map((t) => t.name),
          requiredTools: input.requiredToolNames,
          historyRoles: input.messages.map((m) => m.role),
          historySha256: hash(input.messages),
          priorPlanPresent: input.conversationPlan != null,
          priorPlanTasks:
            input.conversationPlan?.tasks.map((task) => ({
              intent: task.intent,
              requiresClarification: task.requires_clarification,
              entityKeys: Object.keys(task.entities),
            })) ?? [],
          sourceProjections: input.toolResults.map((r) => ({
            name: r.name,
            bytes: Buffer.byteLength(JSON.stringify(r.result)),
          })),
          nowUtc: input.nowUtc,
          timezone: input.businessTimezone,
        });
        return decide(input);
      });
    const policy = http.app.get(AiToolPolicyService),
      list = policy.listAllowed.bind(policy);
    jest.spyOn(policy, 'listAllowed').mockImplementation(async (...args) => {
      const value = await list(...args);
      if (active)
        policyObservations.push({
          caseId: active.item.id,
          turn,
          sameTenant: args[0] === active.tenant.id,
          sameActor: args[1] === active.user.id,
          role: args[2],
          surface: args[3],
          tools: value.map((t) => t.name),
        });
      return value;
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        url.hostname.startsWith('core-') &&
        url.hostname.endsWith('.synthetic.invalid')
      ) {
        try {
          return financeResponse(url, init);
        } catch (error) {
          forbidden.push('finance-contract-refused');
          throw error;
        }
      }
      if (
        !active ||
        !gate ||
        ![
          'https://api.deepseek.com/chat/completions',
          'https://api.deepseek.com/v1/chat/completions',
        ].includes(url.href) ||
        init?.method !== 'POST' ||
        typeof init.body !== 'string'
      ) {
        forbidden.push('unexpected-fetch');
        throw new Error('core_external_fetch_forbidden');
      }
      serializerCalls++;
      const serialized = init.body;
      if (
        [...sources.values()].some((source) =>
          source.privateValues.some((value) => serialized.includes(value)),
        ) ||
        /CORE_BROKER_PLACEHOLDER|fixtureRequirements|reviewChecks|forbiddenClaims|sourceBindings|provenance|expectedIntents/.test(
          serialized,
        )
      ) {
        forbidden.push('model-body-private-data-or-corpus-metadata');
        stopped = 'model_body_privacy_refused';
        append('transport-failures.jsonl', {
          caseId: active.item.id,
          turn,
          reason: stopped,
          dispatched: false,
          bodySha256: sha256(serialized),
        });
        throw new Error('core_model_body_privacy_refused');
      }
      const body = JSON.parse(init.body) as {
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
        response_format?: unknown;
      };
      const row = {
        caseId: active.item.id,
        turn,
        bytes: Buffer.byteLength(init.body),
        bodySha256: sha256(init.body),
        outputLimit: body.max_tokens,
        jsonMode: body.response_format !== undefined,
        messageRoles: body.messages.map((m) => m.role),
      };
      wireObservations.push(row);
      append('serialized-attempts.jsonl', row);
      try {
        const response = await gate.fetch(input, init);
        const payload = (await response.clone().json()) as {
          choices?: Array<{
            finish_reason?: unknown;
            message?: { content?: unknown };
          }>;
          usage?: Record<string, unknown>;
        };
        append('actual-model-responses.jsonl', {
          caseId: active.item.id,
          turn,
          attempt: gate.stats.attempts,
          status: response.status,
          content:
            typeof payload.choices?.[0]?.message?.content === 'string'
              ? payload.choices[0].message.content
              : null,
          finishReason: payload.choices?.[0]?.finish_reason ?? null,
          usage: Object.fromEntries(
            [
              'prompt_tokens',
              'completion_tokens',
              'total_tokens',
              'prompt_cache_hit_tokens',
              'prompt_cache_miss_tokens',
            ]
              .filter((key) => Number.isSafeInteger(payload.usage?.[key]))
              .map((key) => [key, payload.usage![key]]),
          ),
        });
        return response;
      } catch (error) {
        stopped ??=
          error instanceof Error && /^candidate_[a-z_]+$/.test(error.message)
            ? error.message
            : 'model_transport_or_admission_unresolved';
        append('transport-failures.jsonl', {
          caseId: active.item.id,
          turn,
          reason: stopped,
          attempt: gate.stats.attempts,
        });
        throw error;
      }
    });
    await seed();
  });
  afterAll(async () => {
    write('http-report.json', {
      contract: 'maya.core-conversation-http-diagnostic/1',
      mode,
      status: result ? (result as { status: string }).status : 'incomplete',
      qualification:
        'KNOWN_DERIVED_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT_NOT_ACCEPTANCE',
      sourceHead,
      sourceDigest,
      manifestSha256,
      dialogs: 3,
      plannedUserTurns: 5,
      actualHttpTurns: responses.length,
      modelCalls,
      serializerCalls,
      brokerCalls,
      gate: gate?.stats ?? null,
      stopped,
      providerQualification: {
        booking: 'ACTUAL_INTERNAL_CALENDAR_AND_VERIFIED_SYNTHETIC_CLIENT',
        occupancy: 'SYNTHETIC_DOMAIN_PORT_READS_CANONICAL_OPPORTUNITY_OWNER',
        finance: 'ACTUAL_C7_OWNER_NATIVE_YCLIENTS_ADAPTER_FINITE_SYNTHETIC_GET',
        realCrmNetworkCalls: 0,
      },
      modelQualification:
        mode === 'dry'
          ? 'CANNED_TRANSPORT_MECHANICS_ONLY'
          : 'ACTUAL_BROKER_MODEL_OUTPUT_REQUIRES_BROKER_ADMISSION_AND_USAGE_EVIDENCE',
      restarts: 'NOT_EXERCISED',
      currentReact: 'NOT_EXERCISED',
      businessAcceptance: false,
      preflights,
      responses,
      modelObservations,
      wireObservations,
      policyObservations,
      financeReads,
      forbidden,
      replayRecords,
      result,
    });
    gate?.close();
    jest.restoreAllMocks();
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    await http?.close();
    await db?.close();
  });
  function financeResponse(url: URL, init?: RequestInit) {
    const company = url.hostname.slice(5).replace('.synthetic.invalid', ''),
      day = financeDays.get(company);
    if (
      !day ||
      url.origin !== `https://core-${company}.synthetic.invalid` ||
      init?.method !== 'GET' ||
      init.body !== undefined
    ) {
      forbidden.push('unexpected-finance-fetch');
      throw new Error('core_finance_transport_scope');
    }
    const route = url.pathname.replace('/api/v1/', ''),
      query = Object.fromEntries(url.searchParams);
    let data: unknown;
    if (route === `transactions/${company}` || route === `records/${company}`) {
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
              services: [{ id: 81, title: 'Мужская стрижка' }],
            },
          ];
    } else if (route === `company/${company}/salary/calculation/staff/71`) {
      expect(query).toEqual({ date_from: day, date_to: day });
      data = { total_sum: { income: '500', expense: '300', balance: '200' } };
    } else if (route === `book_services/${company}`) {
      expect(query).toEqual({});
      data = {
        services: [
          {
            id: 81,
            title: 'Мужская стрижка',
            price_min: 2000,
            price_max: 2000,
            seance_length: 1800,
          },
        ],
      };
    } else if (route === `company/${company}/staff`) {
      expect(query).toEqual({});
      data = [{ id: 71, name: 'Артём', bookable: true }];
    } else if (route === `service_categories/${company}`) {
      expect(query).toEqual({});
      data = [];
    } else {
      forbidden.push('unexpected-finance-route');
      throw new Error('core_finance_route');
    }
    financeReads.push({ route, company });
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
    });
  }
  async function seed() {
    const fx = fixturesForHttp(db, http);
    for (const item of manifest.cases) {
      const binding: CorpusCase = {
        id: item.id,
        role: item.role,
        group:
          item.group === 'owner_review'
            ? 'occupancy'
            : item.group === 'authority'
              ? 'admin'
              : item.group,
        variant: 'ordinary',
        userTurns: [...item.userTurns],
        fixture: { clock: 'ACTUAL_EXECUTION_CLOCK_BOUND_ONCE' },
      };
      const source = await bindCandidateSource(db, http, fx, binding, sources);
      caseSources.set(item.id, source);
      const member = await db.prisma.membership.findUniqueOrThrow({
        where: {
          userId_tenantId: {
            userId: source.user.id,
            tenantId: source.tenant.id,
          },
        },
      });
      expect(member.role).toBe(
        (
          {
            CLIENT: UserRole.CLIENT,
            TENANT_OWNER: UserRole.TENANT_OWNER,
            ADMINISTRATOR: UserRole.ADMINISTRATOR,
          } as const
        )[item.runtimeRole as 'CLIENT' | 'TENANT_OWNER' | 'ADMINISTRATOR'],
      );
      if (item.role === 'client') {
        await db.prisma.internalProvider.updateMany({
          where: { tenantId: source.tenant.id },
          data: { branchId: source.branchId },
        });
        const staff = await db.prisma.internalProvider.findFirstOrThrow({
          where: { tenantId: source.tenant.id, displayName: 'Артём' },
        });
        const service = await db.prisma.internalService.findFirstOrThrow({
          where: { tenantId: source.tenant.id, name: 'Мужская стрижка' },
        });
        const client = await db.prisma.client.findFirstOrThrow({
          where: { tenantId: source.tenant.id, userId: source.user.id },
        });
        expect(
          await db.prisma.clientChannelLink.count({
            where: {
              tenantId: source.tenant.id,
              clientId: client.id,
              provider: 'maya_user',
              revokedAt: null,
            },
          }),
        ).toBe(1);
        source.privateValues.push(client.id);
        const response = await http.executeTool(
          source.token,
          'booking.availability.read',
          {
            surface: 'web',
            arguments: {
              date: source.startsAt,
              time: '17:00',
              staff_id: staff.id,
              service_ids: [service.id],
              branch_id: source.branchId,
            },
            idempotencyKey: randomUUID(),
          },
          randomUUID(),
        );
        const body = response.body as {
          result?: {
            slots?: Array<{
              start: string;
              staff_id: string;
              branch_id: string;
            }>;
          };
        };
        preflights.push({
          caseId: item.id,
          role: member.role,
          httpStatus: response.status,
          exact17Available:
            body.result?.slots?.some(
              (slot) =>
                Date.parse(slot.start) === Date.parse(source.startsAt) &&
                slot.staff_id === staff.id &&
                slot.branch_id === source.branchId,
            ) ?? false,
          clock: source.clockBinding,
          verifiedClientLink: true,
        });
        expect(response.status).toBe(201);
        expect(preflights.at(-1)?.exact17Available).toBe(true);
      } else if (item.role === 'owner') {
        await publishFinance(source);
        expect(
          await db.prisma.opportunity.count({
            where: { tenantId: source.tenant.id },
          }),
        ).toBe(1);
        preflights.push({
          caseId: item.id,
          role: member.role,
          publishedC7: true,
          canonicalOpportunity: true,
          clock: source.clockBinding,
        });
      } else
        preflights.push({
          caseId: item.id,
          role: member.role,
          noRoleUpgrade: true,
        });
    }
    const foreign = await fx.tenant('Separate core diagnostic foreign tenant');
    const foreignUser = await fx.user(foreign, UserRole.CLIENT);
    for (const source of sources.values())
      source.privateValues.push(foreign.id, foreignUser.id, foreignUser.email);
    const unauth = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .send({
        surface: 'web',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Здравствуйте' }],
      });
    expect(unauth.status).toBe(401);
    expect(modelCalls).toBe(0);
    expect(brokerCalls).toBe(0);
    expect(forbidden).toEqual([]);
    write('fixture-preflight.json', {
      preflights,
      unauthenticatedStatus: 401,
      modelCalls: 0,
      brokerCalls: 0,
      sourceQualification: 'FINITE_SYNTHETIC_FACTS_WITH_CANONICAL_OWNERS',
      financeReads,
    });
  }
  async function publishFinance(source: CandidateSource) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() - 86400000));
    financeDays.set(source.company, day);
    const start = new Date(day + 'T12:00:00+03:00'),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
      data: {
        tenantId: source.tenant.id,
        branchId: source.branchId,
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
    const { MeasurementReportReader } = nativeRequire(
      '../../src/measurement/measurement.report',
    ) as typeof import('../../src/measurement/measurement.report');
    const report = await http.app
      .get(TenantContextService)
      .runAsSystemTenant(source.tenant.id, () =>
        http.app
          .get(MeasurementReportReader)
          .snapshot(
            source.tenant.id,
            'core-finance-' + randomUUID(),
            { from: day + 'T00:00:00+03:00', to: day + 'T23:59:59.999+03:00' },
            new Date(),
          ),
      );
    expect(report.mode).toBe('as_reported');
    expect(report.revisionId).toEqual(expect.any(String));
    const row = await db.prisma.measurementRevision.findUniqueOrThrow({
      where: { id: report.revisionId! },
    });
    expect(row.state).toBe('PUBLISHED');
    source.sourceRefs.push({
      owner: 'C7',
      id: row.id,
      status: 'PUBLISHED_SYNTHETIC_YESTERDAY_NOT_TODAY',
    });
    source.privateValues.push(row.id);
    expect(
      financeReads.some(
        (r) =>
          r.company === source.company &&
          r.route === `transactions/${source.company}`,
      ),
    ).toBe(true);
  }
  async function businessState(tenantId: string) {
    const where = { tenantId },
      orderBy = { id: 'asc' as const };
    return hash(
      await Promise.all([
        db.prisma.appointment.findMany({ where, orderBy }),
        db.prisma.client.findMany({ where, orderBy }),
        db.prisma.clientChannelLink.findMany({ where, orderBy }),
        db.prisma.clientBookingConfirmation.findMany({ where, orderBy }),
        db.prisma.opportunity.findMany({ where, orderBy }),
        db.prisma.agentTask.findMany({ where, orderBy }),
        db.prisma.domainEvent.findMany({ where, orderBy }),
        db.prisma.actionExecution.findMany({ where, orderBy }),
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
  function noWrites(mark: number) {
    return http.recorder
      .since(mark)
      .filter(
        (op) =>
          op.write &&
          (op.model
            ? businessPattern.test(op.model)
            : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory)/i.test(
                op.sql ?? '',
              )),
      )
      .map((op) => ({
        model: op.model,
        operation: op.operation,
        scope: op.scope,
      }));
  }
  async function coordinationState(tenantId: string) {
    const runs = await db.prisma.c9Run.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    });
    return Promise.all(
      runs.map(async (run) => ({
        runHash: hash(run.id),
        state: run.state,
        currentRevision: run.currentRevision,
        revisions: (
          await db.prisma.c9StrategyRevision.findMany({
            where: { tenantId, runId: run.id },
            orderBy: { revision: 'asc' },
          })
        ).map((revision) => ({
          revisionHash: hash(revision.id),
          version: revision.revision,
          evidenceHash: hash(revision.evidenceRefsJson),
          evidenceCount: Array.isArray(revision.evidenceRefsJson)
            ? revision.evidenceRefsJson.length
            : null,
        })),
        work: (
          await db.prisma.c9WorkReceipt.findMany({
            where: { tenantId, runId: run.id },
            orderBy: { domain: 'asc' },
          })
        ).map((row) => ({
          workHash: hash(row.id),
          domain: row.domain,
          taskKey: row.taskKey,
          state: row.state,
          resultHash: row.resultHash,
        })),
      })),
    );
  }
  it('replays exactly the frozen three dialogs and retains actual HTTP replies before qualification', async () => {
    const unsigned = {
      version: 1,
      purpose: 'pilot_calibration_not_qualification',
      sourceSha256: manifest.datasetSha256,
      split: 'dev',
      roles: ['client', 'owner', 'admin'],
      dialogs: 3,
      independentFamilies: 3,
      userTurns: 5,
      cases: manifest.cases.map((c) => ({
        id: c.id,
        familyId: c.id,
        role: c.role,
        group: c.group,
        sourceCaseSha256: hash(c),
        userTurns: [...c.userTurns],
        reviewChecks: [],
        expectedIntents: [],
      })),
    };
    const replayManifest = { ...unsigned, manifestSha256: hash(unsigned) };
    write('replay-binding.json', {
      externalManifestSha256: manifestSha256,
      replayManifestSha256: replayManifest.manifestSha256,
      userTurns: replayManifest.cases.map((c) => ({
        id: c.id,
        role: c.role,
        userTurns: c.userTurns,
      })),
      labelsReachModel: false,
    });
    result = await replayPilot(replayManifest, {
      budget: gate!,
      record: (row) => {
        replayRecords.push(row);
        append('replay-records.jsonl', row);
      },
      openDialog: ({ caseId, role }) => {
        const source = caseSources.get(caseId)!;
        const item = manifest.cases.find((c) => c.id === caseId)!;
        expect(source).toBeDefined();
        expect(item.role).toBe(role);
        active = source;
        turn = 0;
        const priorReplies: string[] = [];
        return Promise.resolve({
          chat: async (body) => {
            turn++;
            expect(
              body.messages
                .filter((m) => m.role === 'user')
                .map((m) => m.content),
            ).toEqual(item.userTurns.slice(0, turn));
            expect(
              body.messages
                .filter((m) => m.role === 'assistant')
                .map((m) => m.content),
            ).toEqual(priorReplies);
            if (stopped || gate!.stats.halted)
              throw new Error('core_batch_already_stopped');
            const before = await businessState(source.tenant.id),
              mark = http.recorder.mark(),
              modelBefore = modelCalls,
              wireBefore = serializerCalls,
              brokerBefore = brokerCalls,
              sourceBefore = source.reads.length;
            let response: { status: number; body: unknown };
            try {
              response = await request(http.app.getHttpServer())
                .post('/api/ai/chat')
                .set('Authorization', `Bearer ${source.token}`)
                .send({ ...body, audience: item.audience })
                .timeout({ response: 120000, deadline: 150000 });
            } catch {
              stopped ??= 'http_transport_unresolved';
              const failed = {
                caseId,
                turn,
                requestId: body.requestId,
                userText: item.userTurns[turn - 1],
                priorActualAssistantReplies: [...priorReplies],
                actualReply: null,
                httpStatus: null,
                failure: stopped,
                modelCalls: modelCalls - modelBefore,
                serializerCalls: serializerCalls - wireBefore,
                brokerCalls: brokerCalls - brokerBefore,
                noRetry: true,
              };
              responses.push(failed);
              append('actual-http-turns.jsonl', failed);
              throw new Error('core_http_transport_unresolved');
            }
            const answer = response.body as Wire;
            append('http-response-journal.jsonl', {
              caseId,
              turn,
              requestId: body.requestId,
              httpStatus: response.status,
              actualReply: answer.reply ?? null,
              responseKeys: Object.keys(answer),
              responseHash: hash(answer),
            });
            const writes = noWrites(mark),
              after = await businessState(source.tenant.id);
            const approvals = await db.prisma.aiApprovalRequest.findMany({
              where: { tenantId: source.tenant.id },
              orderBy: { id: 'asc' },
              select: {
                id: true,
                status: true,
                toolName: true,
                decidedAt: true,
                executedAt: true,
              },
            });
            const observation = {
              caseId,
              turn,
              requestId: body.requestId,
              userText: item.userTurns[turn - 1],
              priorActualAssistantReplies: [...priorReplies],
              actualReply: answer.reply ?? null,
              httpStatus: response.status,
              source: answer.source ?? null,
              grounding: answer.grounding ?? null,
              actionStatus: answer.action?.status ?? null,
              coordination: answer.coordination
                ? {
                    scope: answer.coordination.scope,
                    state: answer.coordination.state,
                    current: answer.coordination.current,
                    revision: answer.coordination.revision,
                    runHash: hash(answer.coordination.run_id ?? null),
                    revisionHash: hash(answer.coordination.revision_id ?? null),
                  }
                : null,
              financialEvidenceCount:
                answer.analysis?.evidence?.sourceHandles?.length ?? 0,
              recommendation: answer.recommendation
                ? {
                    outcome: answer.recommendation.outcome,
                    noSideEffects: answer.recommendation.noSideEffects,
                    executionAuthority:
                      answer.recommendation.executionAuthority,
                    evidenceCount:
                      answer.recommendation.evidence?.opportunityRefs?.length ??
                      0,
                  }
                : null,
              responseKeys: Object.keys(answer),
              responseHash: hash(answer),
              conversationHash: hash(answer.user_turn?.conversationId ?? null),
              persistedCoordination: await coordinationState(source.tenant.id),
              pendingApprovals: approvals.map((approval) => ({
                approvalHash: hash(approval.id),
                toolName: approval.toolName,
                status: approval.status,
                decided: approval.decidedAt !== null,
                executed: approval.executedAt !== null,
              })),
              modelCalls: modelCalls - modelBefore,
              serializerCalls: serializerCalls - wireBefore,
              brokerCalls: brokerCalls - brokerBefore,
              modelCoverage:
                modelCalls === modelBefore
                  ? 'ZERO_MODEL_NOT_LANGUAGE_COVERAGE'
                  : mode === 'dry'
                    ? 'CANNED_TRANSPORT_ONLY'
                    : 'ACTUAL_MODEL_OUTPUT_UNGRADED',
              sourceReads: source.reads.slice(sourceBefore),
              businessHashUnchanged: before === after,
              businessWrites: writes,
            };
            // Preserve actual failure and reply before any assertion/replay validation.
            responses.push(observation);
            append('actual-http-turns.jsonl', observation);
            expect(writes).toEqual([]);
            expect(after).toBe(before);
            expect(forbidden).toEqual([]);
            for (const approval of approvals)
              expect(approval).toMatchObject({
                status: 'pending',
                decidedAt: null,
                executedAt: null,
              });
            for (const s of sources.values())
              for (const value of s.privateValues)
                expect(answer.reply ?? '').not.toContain(value);
            if (stopped || gate!.stats.halted)
              throw new Error('core_transport_stopped_after_actual_reply');
            expect(response.status).toBe(201);
            expect(typeof answer.reply).toBe('string');
            expect(typeof answer.user_turn?.conversationId).toBe('string');
            priorReplies.push(answer.reply!);
            return {
              reply: answer.reply!,
              userTurn: { conversationId: answer.user_turn!.conversationId! },
              evidence: {
                modelCalls: modelCalls - modelBefore,
                brokerCalls: brokerCalls - brokerBefore,
                actionStatus: answer.action?.status ?? null,
                noBusinessEffects: true,
              },
            };
          },
          close: () => {
            active = undefined;
            return Promise.resolve();
          },
        });
      },
    });
    expect((result as { status: string }).status).toBe('replayed_ungraded');
    expect(responses).toHaveLength(5);
    expect(forbidden).toEqual([]);
    expect(gate!.stats).toMatchObject({ dialogs: 3, turns: 5, halted: false });
    // No semantic correctness assertion uses a gold answer; evidence is reviewed
    // against actual canonical source state after this development diagnostic.
  });
});
