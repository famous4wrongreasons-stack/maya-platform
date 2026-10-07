/** Actual auth/tenant/feature/PII/AiCore serializer mechanics. Canned model
 * transport only; synthetic CRM reads; no real language/provider acceptance. */
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../src/common/domain.enums';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import type { AiCoreModelInput } from '../../src/ai-tools/ai-core.types';
import { AiToolPolicyService } from '../../src/ai-tools/ai-tool-policy.service';
import { EntitlementsService } from '../../src/entitlements/entitlements.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import type { CRMAdapter } from '../../src/crm/crm-adapter.interface';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import { syntheticYclientsAvailability } from './support/synthetic-yclients-availability';
import { observedGoodsItem } from '../../src/crm/yclients-goods-read';
import { observedServiceCatalog } from '../../src/crm/service-catalog-read';
import { servicePriceSnapshot } from '../../src/crm/yclients-service-price.contract';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
import { occupancyFixtureEdge } from './support/c9-occupancy-fixture-edge';
import {
  bindCandidateSource,
  type CandidateSource,
} from './support/current-candidate-sources';

const nativeRequire = createRequire(__filename);
const { freezeCurrentCandidate } = nativeRequire(
  path.resolve('scripts/conversation-qualification/current-candidate.mjs'),
) as typeof import('../../scripts/conversation-qualification/current-candidate.mjs');
const { CandidateBudgetGate, CANDIDATE_LIMITS } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/current-candidate-budget.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/current-candidate-budget.mjs');
const output = process.env.JEST_CANDIDATE_HTTP_OUTPUT!;
// Only an owned keyless loopback broker may be contacted by this prerequisite.
const loopbackFetch = globalThis.fetch;
const brokerUrl = process.env.JEST_CANDIDATE_DRY_BROKER;
if (
  brokerUrl &&
  !/^http:\/\/127\.0\.0\.1:\d{1,5}\/chat\/completions$/.test(brokerUrl)
)
  throw new Error('candidate_dry_broker_destination');
if (
  !output ||
  !path.isAbsolute(output) ||
  !/^maya_widget_gate_proof_candidate_[a-f0-9]+$/.test(
    assertProofDatabase().database,
  )
)
  throw new Error('Use owned current-candidate-http.mjs runner');
const hash = (v: string | Buffer) =>
  createHash('sha256').update(v).digest('hex');
const write = (name: string, value: unknown) =>
  writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );

describe('Current corpus actual authenticated HTTP / canned transport mechanics', () => {
  let db: FixtureContext, http: HttpHarness;
  const sources = new Map<string, CandidateSource>();
  let nativeAvailability:
    ReturnType<typeof syntheticYclientsAvailability> | undefined;
  let active: CandidateSource | null = null,
    currentTurn = 0;
  let gate: InstanceType<typeof CandidateBudgetGate>;
  let admissionFailure: Record<string, unknown> | null = null;
  const requests: Record<string, unknown>[] = [],
    outcomes: Record<string, unknown>[] = [],
    modelInputs: Record<string, unknown>[] = [],
    policyReads: Record<string, unknown>[] = [];
  const featureReads = new Map<string, string[]>();
  const forbidden: string[] = [];
  let transportCalls = 0;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    for (const [key, value] of Object.entries({
      AI_CORE_PROVIDER: 'deepseek',
      DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
      DEEPSEEK_API_KEY: 'OFFLINE_PLACEHOLDER_NOT_A_CREDENTIAL',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      AI_CORE_MAX_OUTPUT_TOKENS: '2048',
    }))
      config.set(key, value);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((_provider, config) => {
        const source = sources.get(String(config.settings?.syntheticTenantId));
        if (!source) throw new Error('candidate_unknown_crm_source');
        const read = (kind: string, tenantId = source.tenant.id) => {
          expect(tenantId).toBe(source.tenant.id);
          source.reads.push(kind);
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
        const native =
          source.item.id === 'current-admin-ordinary'
            ? (nativeAvailability ??= syntheticYclientsAvailability(
                source.company,
                source.startsAt.slice(0, 10),
              ))
            : undefined;
        const adapter = {
          getCompanyProfile: () => {
            read('company');
            return Promise.resolve({
              id: source.company,
              title: 'Тестовый салон',
              address: 'Тестовый адрес, дом 1',
              schedule: '10:00–20:00',
              timezone: 'Europe/Moscow',
              logo_url: null,
            });
          },
          getServices: (tenantId: string) => {
            read('services', tenantId);
            return Promise.resolve(services);
          },
          readServiceCatalog: (tenantId: string) => {
            read('service-catalog-contract', tenantId);
            return Promise.resolve(
              observedServiceCatalog(services, 'synthetic'),
            );
          },
          getServicePriceSnapshot: (serviceId: string) => {
            read('service-price-snapshot');
            expect(serviceId).toBe('81');
            return Promise.resolve(
              servicePriceSnapshot(
                {
                  id: 81,
                  company_id: Number(source.company),
                  title: 'Мужская стрижка',
                  booking_title: 'Мужская стрижка',
                  price_min: 2000,
                  price_max: 2000,
                  category_id: 11,
                  duration: 1800,
                  is_chain: false,
                  is_price_managed_only_in_chain: false,
                  is_multi: false,
                  tax_variant: 1,
                  vat_id: 2,
                  is_need_limit_date: false,
                  seance_search_start: 0,
                  seance_search_finish: 86400,
                  step: 900,
                  seance_search_step: 900,
                  technical_break_duration: null,
                  staff: [{ id: 71, seance_length: 1800 }],
                },
                source.company,
                serviceId,
                'RUB',
              ),
            );
          },
          updateServiceFixedPrice: () => {
            forbidden.push('crm:price_write');
            throw new Error('candidate_provider_write_forbidden');
          },
          getPublicBookingServices: (tenantId: string) => {
            read('public-services', tenantId);
            return Promise.resolve(services);
          },
          getTeamMembers: (tenantId: string) => {
            read('team-access', tenantId);
            return Promise.resolve([
              {
                id: '71',
                name: 'Synthetic employee',
                bookable: true,
                suggested_role: 'staff' as const,
              },
            ]);
          },
          getStaff: (tenantId: string) => {
            read('staff', tenantId);
            return Promise.resolve([
              { id: '71', name: 'Артём' },
              { id: '72', name: 'Максим' },
            ]);
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
            read('schedule:' + date, tenantId);
            return Promise.resolve({
              staff_id: staffId,
              date,
              is_working: true,
              slots: [{ from: '10:00', to: '18:00' }],
              revision: 'synthetic-current-schedule',
            });
          },
          getAvailableSlots: (
            params: Parameters<CRMAdapter['getAvailableSlots']>[0],
          ) => {
            const { tenantId, staffId } = params;
            read('availability', tenantId);
            if (native) return native.adapter.getAvailableSlots(params);
            return Promise.resolve(
              source.occupied
                ? []
                : [
                    {
                      start: source.startsAt,
                      end: source.endsAt,
                      staff_id: staffId ?? '71',
                      branch_id: source.branchId,
                    },
                  ],
            );
          },
          readGoodsItem: (tenantId: string, goodsId: string) => {
            read('goods', tenantId);
            expect(goodsId).toBe('123');
            if (source.item.variant === 'negative')
              return Promise.reject(
                new CrmOutcomeUnknownError(
                  'synthetic_goods_transport_unavailable',
                ),
              );
            return Promise.resolve(
              observedGoodsItem(
                [
                  {
                    good_id: '123',
                    title: 'Синтетический шампунь',
                    cost: '100',
                    actual_cost: '40',
                    unit_actual_cost: '4',
                    unit_id: '11',
                    service_unit_id: '22',
                    unit_short_title: 'флакон',
                    service_unit_short_title: 'мл',
                    unit_equals: '10',
                    loyalty_abonement_type_id: 0,
                    loyalty_certificate_type_id: 0,
                    actual_amounts: [{ storage_id: '9', amount: '1.250' }],
                  },
                ],
                '123',
                source.company,
                'RUB',
              ),
            );
          },
        };
        return occupancyFixtureEdge(adapter, (key) =>
          forbidden.push('crm:' + key),
        ) as unknown as CRMAdapter;
      });
    const effective = http.app.get(EntitlementsService),
      effectiveRead = effective.getEffectiveEntitlements.bind(effective);
    jest
      .spyOn(effective, 'getEffectiveEntitlements')
      .mockImplementation(async (tenantId) => {
        const result = await effectiveRead(tenantId);
        featureReads.set(
          tenantId,
          Object.keys(result.features)
            .filter((k) => result.features[k])
            .sort(),
        );
        return result;
      });
    const policy = http.app.get(AiToolPolicyService),
      list = policy.listAllowed.bind(policy);
    jest.spyOn(policy, 'listAllowed').mockImplementation(async (...args) => {
      const result = await list(...args);
      if (active)
        policyReads.push({
          caseId: active.item.id,
          turn: currentTurn,
          sameTenant: args[0] === active.tenant.id,
          sameActor: args[1] === active.user.id,
          role: args[2],
          surface: args[3],
          tools: result.map((t) => t.name),
        });
      return result;
    });
    const model = http.app.get(AiCoreModelService),
      decide = model.decide.bind(model);
    jest
      .spyOn(model, 'decide')
      .mockImplementation((input: AiCoreModelInput) => {
        modelInputs.push({
          caseId: active?.item.id,
          turn: currentTurn,
          role: input.principalRole,
          actualTools: input.tools.map((t) => t.name),
          requiredTools: input.requiredToolNames,
          sourceProjections: input.toolResults.map((r) => ({
            name: r.name,
            bytes: Buffer.byteLength(JSON.stringify(r.result)),
          })),
          nowUtc: input.nowUtc,
          timezone: input.businessTimezone,
        });
        return decide(input);
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const synthetic = nativeAvailability?.respond(url, init);
      if (synthetic) return synthetic;
      if (
        !active ||
        !gate ||
        typeof init?.body !== 'string' ||
        !(
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url
        ).startsWith('https://api.deepseek.com/')
      ) {
        forbidden.push('external_fetch');
        throw new Error('candidate_external_fetch_forbidden');
      }
      const body = JSON.parse(init.body) as {
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
      };
      const bytes = Buffer.byteLength(init.body),
        data = JSON.parse(
          body.messages.find((m) => m.role === 'user')!.content,
        ) as Record<string, unknown>;
      for (const source of sources.values())
        for (const value of source.privateValues)
          expect(init.body).not.toContain(value);
      expect(init.body).not.toMatch(
        /OFFLINE_PLACEHOLDER_NOT_A_CREDENTIAL|sourceProofFile|httpBinding|forbiddenClaims|reviewChecks|CANDIDATE_SYNTHETIC_PRIVATE_TOKEN/,
      );
      requests.push({
        caseId: active.item.id,
        turn: currentTurn,
        phase: data.phase,
        bytes,
        bodySha256: hash(init.body),
        conservativeInputTokenBound: bytes + 4096,
        outputLimit: body.max_tokens,
        sections: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [
            k,
            Buffer.byteLength(JSON.stringify(v)),
          ]),
        ),
        systemBytes: Buffer.byteLength(body.messages[0].content),
      });
      try {
        return await gate.fetch(url, init);
      } catch (error) {
        admissionFailure ??= {
          caseId: active.item.id,
          turn: currentTurn,
          bytes,
          reason:
            error instanceof Error && /^candidate_[a-z_]+$/.test(error.message)
              ? error.message
              : 'candidate_transport_failed',
        };
        throw error;
      }
    });
  });
  afterAll(async () => {
    try {
      gate?.close();
    } finally {
      jest.restoreAllMocks();
      await http?.close();
      await db?.close();
    }
  });
  it('binds the corpus to current authenticated principals and measures actual requests without spending', async () => {
    const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const base = freezeCurrentCandidate(process.cwd(), candidate);
    const groups = process.env.JEST_CANDIDATE_GROUPS?.split(',');
    if (groups?.some((g) => !base.cases.some((c) => c.group === g)))
      throw new Error('candidate_group_selection_invalid');
    const selectedCases = base.cases.filter(
      (c) => !groups || groups.includes(c.group),
    );
    const bindingSources = [
      'test/jest-current-candidate-http.json',
      'test/widgets-live/support/current-candidate-mjs-transform.cjs',
      'test/widgets-live/current-candidate-http.probe-spec.ts',
      'test/widgets-live/support/current-candidate-sources.ts',
      'test/widgets-live/support/synthetic-yclients-availability.ts',
      'scripts/conversation-qualification/current-candidate-http.mjs',
      'scripts/conversation-qualification/current-candidate-dry-broker.mjs',
      'scripts/conversation-qualification/owned-child-cleanup.mjs',
      'src/ai-tools/planner-wire-context.ts',
      'src/conversation-intelligence/conversation-intelligence.service.ts',
      'src/widgets/composition/chat-read.trigger.ts',
    ];
    const manifest = {
      ...base,
      status: 'AUTHENTICATED_HTTP_CANNED_MECHANICS_CANDIDATE',
      bindingSources: Object.fromEntries(
        bindingSources.map((f) => [f, hash(readFileSync(f))]),
      ),
      sourceCorpusUnchanged: true,
      selectedCaseIds: selectedCases.map((c) => c.id),
      selection: groups
        ? 'TARGETED_AFFECTED_BOUNDARIES'
        : 'FULL_DEVELOPMENT_CORPUS',
    };
    const manifestSha256 = hash(JSON.stringify(manifest));
    write('candidate-manifest.json', {
      ...manifest,
      bindingManifestSha256: manifestSha256,
    });
    gate = new CandidateBudgetGate({
      ledgerPath: path.join(output, 'ledger.jsonl'),
      manifestSha256,
      candidateCommit: candidate,
      mode: 'OFFLINE_SYNTHETIC_ONLY',
      transport: async (_url, init) => {
        transportCalls++;
        expect(init?.headers).toBeUndefined();
        if (typeof init?.body !== 'string')
          throw new Error('candidate_transport_body_missing');
        if (brokerUrl)
          return loopbackFetch(brokerUrl, {
            method: 'POST',
            body: init.body,
            redirect: 'error',
            signal: init.signal,
            headers: {
              'content-type': 'application/json',
              'x-candidate-manifest': manifestSha256,
              'x-candidate-case': active!.item.id,
              'x-candidate-turn': String(currentTurn),
            },
          });
        const body = JSON.parse(init.body) as {
          response_format?: unknown;
        };
        const content = body.response_format
          ? JSON.stringify({
              semantic_plan: {
                parent_request: 'Синтетическая проверка механики',
                language: 'ru',
                dialogue_act: 'request',
                tasks: [
                  {
                    id: 'task_1',
                    intent: 'small_talk.greeting',
                    entities_json: '{}',
                    depends_on: [],
                    confidence: 1,
                    requires_clarification: true,
                    clarification_question: 'Уточните синтетический запрос.',
                  },
                ],
                context: {
                  carried_slots: [],
                  replaced_slots: [],
                  unresolved_references: [],
                },
              },
              tool_call: null,
            })
          : 'Синтетический ответ проверки механики.';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              model: CANDIDATE_LIMITS.model,
              choices: [{ message: { content }, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    });
    const fx = fixturesForHttp(db, http);
    for (const item of base.cases)
      await bindCandidateSource(db, http, fx, item, sources);
    const foreign = await fx.tenant('Separate foreign corpus tenant');
    const foreignUser = await fx.user(foreign, UserRole.CLIENT);
    const foreignBranch = await db.prisma.branch.create({
      data: {
        tenantId: foreign.id,
        name: 'Synthetic foreign branch',
        timezone: 'Europe/Moscow',
      },
    });
    await db.prisma.internalProvider.create({
      data: {
        id: 'foreign-staff',
        tenantId: foreign.id,
        displayName: 'Foreign synthetic staff',
        active: true,
      },
    });
    for (const source of sources.values())
      source.privateValues.push(foreign.id, foreignUser.id);
    // No runtime action can dispatch, even if a future canned response changes.
    const { ActionEngineRuntimeService } = nativeRequire(
      path.resolve('src/action-engine/action-engine.runtime'),
    ) as typeof import('../../src/action-engine/action-engine.runtime');
    const runtime = http.app.get(ActionEngineRuntimeService);
    jest.spyOn(runtime, 'executeWithReceipt').mockImplementation(() => {
      forbidden.push('action_dispatch');
      throw new Error('candidate_action_dispatch_forbidden');
    });
    const baseline = await db.prisma.actionExecution.count();
    const unauth = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .send({
        surface: 'web',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Покажи товар 123.' }],
      });
    expect(unauth.status).toBe(401);
    // Independent source reads and price-approval preparation use real HTTP.
    // No approval is executed. This is not a model-selected tool sequence and
    // does not change the frozen dialogue.
    const preflights: Record<string, unknown>[] = [];
    const preflight = async (
      source: CandidateSource,
      name: string,
      args: Record<string, unknown> = {},
      endpoint?: string,
      expectedOverride?: number,
    ) => {
      const response = endpoint
        ? await request(http.app.getHttpServer())
            .get(endpoint)
            .set('Authorization', `Bearer ${source.token}`)
        : await http.executeTool(
            source.token,
            name,
            { surface: 'web', arguments: args, idempotencyKey: randomUUID() },
            randomUUID(),
          );
      const body = response.body as Record<string, unknown>;
      const result = (body.result ?? body) as Record<string, unknown>;
      if (
        name === 'inventory.goods.read' &&
        source.item.variant === 'negative'
      ) {
        expect(response.status).toBe(503);
        expect(body.error).toEqual({ code: 'goods_read_source_unavailable' });
        expect(body.message).toContain('не означает нулевой остаток');
        expect(body.result).toBeUndefined();
        expect(body.resolution).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('synthetic_goods_transport');
        const failed = await db.prisma.aiToolExecution.findFirstOrThrow({
          where: { tenantId: source.tenant.id, toolName: name },
          orderBy: { createdAt: 'desc' },
        });
        expect(failed.status).toBe('failed');
        expect(failed.errorCode).toBe('goods_read_source_unavailable');
        expect(failed.encryptedResult).toBeNull();
      }
      if (
        response.status === 503 &&
        [
          'booking.availability.read',
          'booking.group-availability.read',
        ].includes(name)
      ) {
        expect(body.error).toEqual({
          code: 'booking_branch_source_unavailable',
        });
        expect(body.result).toBeUndefined();
        expect(body.resolution).toBeUndefined();
      }
      const revoked =
        source.item.group === 'lifecycle' && source.item.variant === 'negative';
      const expectedStatus =
        expectedOverride ??
        (revoked
          ? 401
          : name.includes('.foreign.snapshot')
            ? 404
            : endpoint
              ? 200
              : name === 'inventory.goods.read' &&
                  source.item.variant === 'negative'
                ? 503
                : name === 'catalog.service.price.update' &&
                    source.item.variant === 'negative'
                  ? 403
                  : 201);
      preflights.push({
        caseId: source.item.id,
        name,
        httpStatus: response.status,
        expectedHttpStatus: expectedStatus,
        expectedStatusMatched: response.status === expectedStatus,
        qualification:
          source.item.group === 'staff_config' &&
          source.item.variant === 'negative' &&
          name === 'booking.availability.read'
            ? 'OBSERVATION_ONLY_PUBLIC_READ_DOES_NOT_PROVE_BRANCH_DENIAL'
            : expectedStatus === 503
              ? 'KNOWN_SOURCE_UNAVAILABLE_HTTP_503_NO_FACTS_NO_EFFECT'
              : 'AUTHENTICATED_SOURCE_OR_EXPECTED_REFUSAL',
        status: body.status ?? null,
        keys: Object.keys(result),
        error:
          response.status >= 400 ? (body.error ?? body.message ?? null) : null,
        contract: result.contract ?? null,
        resultSha256: hash(JSON.stringify(result)),
        // Only finite non-PII observations are archived, never raw HTTP bodies.
        appointments: Array.isArray(result.appointments)
          ? result.appointments.length
          : null,
        services: Array.isArray(result.services)
          ? result.services.length
          : null,
        slots: Array.isArray(result.slots) ? result.slots.length : null,
        widgetEmitted: body.resolution !== undefined,
        item: name === 'inventory.goods.read' ? result.item : undefined,
        stock: name === 'inventory.goods.read' ? result.stock : undefined,
      });
      if (response.status === 201 && name === 'catalog.staff.read')
        expect(body.resolution).toBeUndefined();
      if (
        response.status === 201 &&
        name === 'booking.availability.read' &&
        Array.isArray(result.slots) &&
        result.slots.length === 0
      )
        expect(body.resolution).toBeUndefined();
      return result;
    };
    // Public INTERNAL availability admits another same-tenant branch. Current
    // membership branch is not public catalog authority; foreign tenant is.
    const publicSource = sources.get(
      [...sources.values()].find(
        (s) => s.item.id === 'current-booking-ordinary',
      )!.tenant.id,
    )!;
    active = publicSource;
    const otherBranch = await db.prisma.branch.create({
      data: {
        tenantId: publicSource.tenant.id,
        name: 'Synthetic second public branch',
        timezone: 'Europe/Moscow',
      },
    });
    publicSource.privateValues.push(otherBranch.id, foreignBranch.id);
    await db.prisma.membership.update({
      where: {
        userId_tenantId: {
          userId: publicSource.user.id,
          tenantId: publicSource.tenant.id,
        },
      },
      data: { branchId: publicSource.branchId },
    });
    const publicStaff = await db.prisma.internalProvider.findMany({
      where: { tenantId: publicSource.tenant.id },
    });
    for (const staff of publicStaff)
      await db.prisma.internalProvider.update({
        where: { id: staff.id },
        data: {
          branchId:
            staff.displayName === 'Артём'
              ? publicSource.branchId
              : otherBranch.id,
        },
      });
    const publicService = await db.prisma.internalService.findFirstOrThrow({
      where: { tenantId: publicSource.tenant.id },
    });
    const branchEvidence: Record<string, unknown>[] = [];
    for (const [branchId, expectedStatus] of [
      [publicSource.branchId, 201],
      [otherBranch.id, 201],
      [foreignBranch.id, 404],
      [randomUUID(), 404],
    ] as const) {
      const result = await preflight(
        publicSource,
        'booking.availability.read',
        {
          date: publicSource.startsAt,
          service_ids: [publicService.id],
          branch_id: branchId,
        },
        undefined,
        expectedStatus,
      );
      if (expectedStatus === 201) {
        const slots = result.slots as Array<{
          branch_id: string;
          staff_id: string;
        }>;
        expect(slots.length).toBeGreaterThan(0);
        expect(slots.every((s) => s.branch_id === branchId)).toBe(true);
        const allowedStaff = publicStaff
          .filter(
            (s) =>
              (s.displayName === 'Артём'
                ? publicSource.branchId
                : otherBranch.id) === branchId,
          )
          .map((s) => s.id);
        expect(slots.every((s) => allowedStaff.includes(s.staff_id))).toBe(
          true,
        );
      } else expect(result.slots).toBeUndefined();
      branchEvidence.push({
        kind:
          branchId === publicSource.branchId
            ? 'MEMBERSHIP_BRANCH'
            : branchId === otherBranch.id
              ? 'OTHER_SAME_TENANT_BRANCH_ALLOWED'
              : branchId === foreignBranch.id
                ? 'FOREIGN_TENANT_REJECTED'
                : 'UNKNOWN_BRANCH_REJECTED',
        expectedStatus,
        source: 'ACTUAL_INTERNAL_CALENDAR',
      });
    }
    // Native YC availability owner with a typed finite synthetic provider
    // transport. Source preflight is separate from canned language selection.
    const ycSource = [...sources.values()].find(
      (s) => s.item.id === 'current-admin-ordinary',
    )!;
    active = ycSource;
    const ycOtherBranch = await db.prisma.branch.create({
      data: {
        tenantId: ycSource.tenant.id,
        name: 'Other synthetic Maya branch',
      },
    });
    ycSource.privateValues.push(ycOtherBranch.id);
    const ycArgs = {
      date: ycSource.startsAt,
      staff_id: '71',
      service_ids: ['81'],
    };
    const ycDay = ycSource.startsAt.slice(0, 10);
    const ycRoute = (branchId?: string, days = false) =>
      '/api/available-' +
      (days ? 'days' : 'slots') +
      '?' +
      new URLSearchParams({
        ...(days ? { from: ycDay, to: ycDay } : { date: ycDay }),
        staffId: '71',
        serviceIds: '81',
        ...(branchId === undefined ? {} : { branchId }),
      }).toString();
    const ycUnscoped = await preflight(
      ycSource,
      'booking.availability.read',
      ycArgs,
    );
    expect(ycUnscoped.slots).toEqual([
      {
        start: new Date(ycSource.startsAt).toISOString(),
        end: new Date(ycSource.endsAt).toISOString(),
        staff_id: '71',
        branch_id: null,
      },
    ]);
    const ycReads = nativeAvailability!.reads;
    expect(ycReads).toBe(1);
    const ycBranchEvidence: Record<string, unknown>[] = [
      {
        kind: 'UNSCOPED_CONFIGURED_COMPANY',
        status: 201,
        slots: 1,
        branchId: null,
        nativeProviderReads: ycReads,
      },
    ];
    for (const [branchId, status, kind] of [
      [ycSource.branchId, 503, 'OWN_TENANT_BRANCH_UNBOUND'],
      [ycOtherBranch.id, 503, 'OTHER_TENANT_OWNED_BRANCH_UNBOUND'],
      [foreignBranch.id, 404, 'FOREIGN_TENANT_REJECTED'],
      [randomUUID(), 404, 'UNKNOWN_BRANCH_REJECTED'],
    ] as const) {
      const result = await preflight(
        ycSource,
        'availability.slots.http',
        {},
        ycRoute(branchId),
        status,
      );
      expect(result.slots).toBeUndefined();
      if (status === 503) {
        expect(result.error).toEqual({
          code: 'booking_branch_source_unavailable',
        });
        expect(result.message).toContain('не означает');
      }
      expect(nativeAvailability!.reads).toBe(ycReads);
      ycBranchEvidence.push({
        kind,
        status,
        slots: null,
        nativeProviderReadDelta: 0,
      });
    }
    for (const name of [
      'booking.availability.read',
      'booking.group-availability.read',
    ]) {
      const result = await preflight(
        ycSource,
        name,
        {
          ...ycArgs,
          ...(name.includes('group')
            ? { staff_id: undefined, party_size: 2 }
            : {}),
          branch_id: ycOtherBranch.id,
        },
        undefined,
        503,
      );
      expect(result.error).toEqual({
        code: 'booking_branch_source_unavailable',
      });
      expect(result.slots).toBeUndefined();
      expect(result.groups).toBeUndefined();
      const failed = await db.prisma.aiToolExecution.findFirstOrThrow({
        where: { tenantId: ycSource.tenant.id, toolName: name },
        orderBy: { createdAt: 'desc' },
      });
      expect(failed.status).toBe('failed');
      expect(failed.errorCode).toBe('booking_branch_source_unavailable');
      expect(failed.encryptedResult).toBeNull();
      expect(nativeAvailability!.reads).toBe(ycReads);
      ycBranchEvidence.push({
        kind: name,
        status: 503,
        canonicalExecution: 'FAILED_NO_RESULT',
        nativeProviderReadDelta: 0,
      });
    }
    const ycDays = await preflight(
      ycSource,
      'availability.days.http',
      {},
      ycRoute(ycSource.branchId, true),
      503,
    );
    expect(ycDays.error).toEqual({ code: 'booking_branch_source_unavailable' });
    expect(ycDays.days).toBeUndefined();
    expect(nativeAvailability!.reads).toBe(ycReads);
    ycBranchEvidence.push({
      kind: 'AVAILABLE_DAYS_UNBOUND',
      status: 503,
      nativeProviderReadDelta: 0,
      catalogReadsMayPrecedeRefusal: true,
    });
    const selectedSources = [...sources.values()].filter((s) =>
      selectedCases.some((c) => c.id === s.item.id),
    );
    for (const source of selectedSources) {
      active = source;
      currentTurn = 0;
      const group = source.item.group;
      if (['booking', 'admin', 'staff_config', 'occupancy'].includes(group)) {
        await preflight(source, 'catalog.services.read');
        await preflight(source, 'catalog.staff.read');
      }
      if (group === 'admin')
        await preflight(source, 'company.business-hours.read');
      if (group === 'staff_config' && source.item.role === 'owner')
        await preflight(source, 'catalog.service.price.update', {
          service_id: '81',
          price_rubles: 1500,
        });
      if (group === 'booking') {
        const service = await db.prisma.internalService.findFirstOrThrow({
          where: { tenantId: source.tenant.id },
        });
        const staff = await db.prisma.internalProvider.findFirstOrThrow({
          where: { tenantId: source.tenant.id, displayName: 'Артём' },
        });
        await preflight(source, 'booking.availability.read', {
          date: source.startsAt,
          staff_id:
            source.item.variant === 'negative' ? 'foreign-staff' : staff.id,
          service_ids: [service.id],
        });
      }
      if (group === 'personal') {
        const result = await preflight(source, 'appointments.own.list');
        expect((result.appointments as unknown[]).length).toBe(
          source.item.variant === 'negative' ? 0 : 1,
        );
        const denied = source.sourceRefs.filter(
          (r) => r.status === 'OTHER_CLIENT_DENIED',
        );
        for (const ref of denied)
          expect(JSON.stringify(result)).not.toContain(ref.id);
      }
      if (group === 'staff_config' && source.item.role === 'employee')
        await preflight(source, 'staff.schedule.own.read', {
          date: source.startsAt.slice(0, 10),
        });
      // External configured-company fixtures do not prove a Maya branch mapping.
      // Cross-branch public visibility is qualified with INTERNAL sources above.
      if (group === 'bi') {
        const own = source.sourceRefs.find((r) => r.owner === 'C7')!;
        const other = [...sources.values()].find(
          (s) =>
            s.item.group === 'bi' &&
            s.tenant.id !== source.tenant.id &&
            s.item.variant !== 'negative',
        )!;
        const foreignRef = other.sourceRefs.find((r) => r.owner === 'C7')!;
        if (own.id !== 'absent')
          await preflight(
            source,
            'C7.own.snapshot',
            {},
            '/api/analytics/measurements/' + own.id,
          );
        await preflight(
          source,
          'C7.foreign.snapshot',
          {},
          '/api/analytics/measurements/' + foreignRef.id,
        );
      }
      if (group === 'lifecycle') {
        const own = source.sourceRefs.find((r) => r.owner === 'C8')!;
        await preflight(
          source,
          'C8.own.snapshot',
          {},
          '/api/analytics/valuations/' + own.id,
        );
        const other = [...sources.values()].find(
          (s) =>
            s.item.group === 'lifecycle' &&
            s.tenant.id !== source.tenant.id &&
            s.item.variant !== 'negative',
        )!;
        await preflight(
          source,
          'C8.foreign.snapshot',
          {},
          '/api/analytics/valuations/' +
            other.sourceRefs.find((r) => r.owner === 'C8')!.id,
        );
      }
      if (group === 'occupancy')
        await preflight(source, 'booking.availability.read', {
          date: source.startsAt,
          branch_id: source.branchId,
          staff_id: '71',
          service_ids: ['81'],
        });
      if (group === 'goods')
        await preflight(source, 'inventory.goods.read', { goods_id: '123' });
    }
    expect(modelInputs).toEqual([]);
    expect(requests).toEqual([]);
    write('source-preflights.json', preflights);
    for (const source of selectedSources) {
      active = source;
      if (!admissionFailure) gate.dialog();
      const tools = await request(http.app.getHttpServer())
        .get('/api/ai/tools?surface=web')
        .set('Authorization', `Bearer ${source.token}`);
      const revoked =
        source.item.group === 'lifecycle' && source.item.variant === 'negative';
      expect(tools.status).toBe(revoked ? 401 : 200);
      const initialTools =
        tools.status === 200
          ? (tools.body as { tools: Array<{ name: string }> }).tools.map(
              (t) => t.name,
            )
          : [];
      const expectedTools: Record<string, string[]> = {
        booking: ['booking.availability.read', 'catalog.staff.read'],
        personal: ['appointments.own.list'],
        admin: ['catalog.staff.read', 'catalog.services.read'],
        staff_config: [
          source.item.role === 'employee'
            ? 'staff.schedule.own.read'
            : 'catalog.service.price.update',
        ],
        bi: ['analytics.business.query'],
        lifecycle: ['valuations.read', 'clients.dormant.list'],
        occupancy: ['booking.availability.read'],
        goods: ['inventory.goods.read'],
      };
      if (!revoked)
        for (const name of expectedTools[source.item.group])
          expect(initialTools).toContain(name);
      let conversationId: string | undefined;
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        [];
      for (const [index, text] of source.item.userTurns.entries()) {
        currentTurn = index + 1;
        if (admissionFailure) {
          outcomes.push({
            caseId: source.item.id,
            turn: currentTurn,
            status: 'UNEXECUTED',
            reason: 'batch_halted_after_request_admission_failure',
            blockedBy: admissionFailure,
          });
          continue;
        }
        gate.turn();
        if (
          source.item.group === 'occupancy' &&
          source.item.variant === 'correction' &&
          index === 1
        ) {
          source.occupied = true;
          await db.prisma.appointment.updateMany({
            where: { tenantId: source.tenant.id },
            data: { status: 'confirmed' },
          });
          source.sourceRefs.push({
            owner: 'CRM_CURRENT_AVAILABILITY',
            id: source.branchId,
            status: 'OCCUPIED_BEFORE_CORRECTION_TURN_LOCAL_FIXTURE_ONLY',
          });
        }
        const before = requests.length,
          beforeModel = modelInputs.length,
          beforeReads = source.reads.length;
        messages.push({ role: 'user', content: text });
        try {
          const response = await request(http.app.getHttpServer())
            .post('/api/ai/chat')
            .set('Authorization', `Bearer ${source.token}`)
            .send({
              surface: 'web',
              audience:
                source.item.role === 'client'
                  ? 'client'
                  : source.item.role === 'employee'
                    ? 'staff'
                    : 'owner',
              requestId: randomUUID(),
              ...(conversationId ? { conversationId } : {}),
              messages,
            });
          const body = response.body as {
            reply?: string;
            user_turn?: { conversationId: string };
            source?: string;
            action?: { status?: string };
            coordination?: {
              run_id: string;
              revision_id: string;
              scope: string;
              revision: number;
              state: string;
              current: boolean;
              replayed: boolean;
            };
            recommendation?: {
              contract: string;
              outcome: string;
              evidence: {
                asOf: string;
                opportunityRefs: unknown[];
                workReceiptId: string;
              };
              options: unknown[];
              noSideEffects: boolean;
              executionAuthority: boolean;
              reasoning: string;
            };
            grounding?: { status: string };
          };
          const occupancy =
            body.coordination?.scope === 'explicit_occupancy' &&
            body.recommendation
              ? {
                  coordination: body.coordination,
                  recommendation: body.recommendation,
                }
              : undefined;
          if (body.user_turn) conversationId = body.user_turn.conversationId;
          if (typeof body.reply === 'string')
            messages.push({ role: 'assistant', content: body.reply });
          outcomes.push({
            caseId: source.item.id,
            turn: currentTurn,
            httpStatus: response.status,
            status: admissionFailure
              ? 'REQUEST_ADMISSION_REFUSED'
              : revoked && response.status === 401
                ? 'EXPECTED_PERMISSION_REFUSAL'
                : response.status === 201
                  ? 'CANNED_HTTP_MECHANICS'
                  : 'HTTP_UNSUPPORTED',
            source: body.source,
            actionStatus: body.action?.status ?? null,
            grounding: body.grounding?.status,
            serializedCalls: requests.length - before,
            modelCalls: modelInputs.length - beforeModel,
            modelCoverage:
              modelInputs.length === beforeModel
                ? 'ZERO_MODEL_NOT_LANGUAGE_COVERAGE'
                : 'CANNED_NOT_LANGUAGE_COVERAGE',
            zeroModelReason:
              modelInputs.length !== beforeModel
                ? null
                : revoked
                  ? 'CURRENT_SESSION_REVOKED_BEFORE_MODEL'
                  : occupancy
                    ? 'EXISTING_DETERMINISTIC_EXPLICIT_C9_OCCUPANCY'
                    : body.grounding?.status === 'blocked'
                      ? 'EXISTING_GROUNDING_ACCESS_OR_NO_REQUIRED_SOURCE_PRECHECK'
                      : 'EXISTING_DETERMINISTIC_PATH_NOT_LANGUAGE_COVERAGE',
            occupancy: occupancy
              ? {
                  scope: occupancy.coordination.scope,
                  runSha256: hash(occupancy.coordination.run_id),
                  revisionSha256: hash(occupancy.coordination.revision_id),
                  revision: occupancy.coordination.revision,
                  state: occupancy.coordination.state,
                  current: occupancy.coordination.current,
                  replayed: occupancy.coordination.replayed,
                  outcome: occupancy.recommendation.outcome,
                  evidenceCount:
                    occupancy.recommendation.evidence.opportunityRefs.length,
                  workReceiptSha256: hash(
                    occupancy.recommendation.evidence.workReceiptId,
                  ),
                  asOf: occupancy.recommendation.evidence.asOf,
                  optionCount: occupancy.recommendation.options.length,
                  noSideEffects: occupancy.recommendation.noSideEffects,
                  executionAuthority:
                    occupancy.recommendation.executionAuthority,
                  reasoning: occupancy.recommendation.reasoning,
                }
              : null,
            replySha256: hash(body.reply ?? ''),
            initialTools,
          });
          if (!admissionFailure)
            expect(response.status).toBe(revoked ? 401 : 201);
          if (revoked) {
            expect(modelInputs.length).toBe(beforeModel);
            expect(source.reads.length).toBe(beforeReads);
          }
          if (
            !admissionFailure &&
            source.item.id === 'current-admin-correction' &&
            index === 0
          ) {
            expect(modelInputs.length).toBeGreaterThan(beforeModel);
            expect(body.grounding?.status).not.toBe('blocked');
            expect(modelInputs.at(-1)?.actualTools).toContain(
              'catalog.staff.read',
            );
            expect(modelInputs.at(-1)?.actualTools).not.toContain(
              'analytics.business.query',
            );
          }
          const explicitOccupancyTurn =
            source.item.group === 'occupancy' &&
            ['ordinary', 'correction'].includes(source.item.variant) &&
            index === 0;
          if (!admissionFailure && explicitOccupancyTurn) {
            expect(occupancy).toBeDefined();
            expect(modelInputs.length).toBe(beforeModel);
          }
          if (occupancy) {
            expect(occupancy.coordination.run_id).toEqual(expect.any(String));
            expect(occupancy.coordination.revision_id).toEqual(
              expect.any(String),
            );
            expect(occupancy.coordination.revision).toBeGreaterThan(0);
            expect(occupancy.coordination.current).toBe(true);
            expect(occupancy.coordination.state).toBe('PROPOSED');
            expect(occupancy.recommendation.contract).toBe(
              'maya.c9-occupancy-response/1',
            );
            expect(occupancy.recommendation.reasoning).toBe('deterministic');
            expect(occupancy.recommendation.evidence.workReceiptId).toEqual(
              expect.any(String),
            );
            expect(occupancy.recommendation.noSideEffects).toBe(true);
            expect(occupancy.recommendation.executionAuthority).toBe(false);
            expect(
              occupancy.recommendation.evidence.opportunityRefs.length,
            ).toBeGreaterThan(0);
          }
        } finally {
          gate.endTurn();
        }
      }
    }
    expect(forbidden).toEqual([]);
    expect(policyReads.every((r) => r.sameTenant && r.sameActor)).toBe(true);
    expect(await db.prisma.actionExecution.count()).toBe(baseline);
    const pgClock = await db.prisma.$queryRaw<
      Array<{ now: string }>
    >`SELECT clock_timestamp()::text AS now`;
    write('http-report.json', {
      mode: 'ACTUAL_AUTHENTICATED_HTTP_CANNED_TRANSPORT_ONLY',
      status: admissionFailure
        ? 'STOPPED_REMAINING_UNEXECUTED'
        : preflights.some((p) => !p.expectedStatusMatched)
          ? 'SOURCE_PREFLIGHT_FAILED'
          : 'OFFLINE_MECHANICS_PASS_WITH_QUALIFIERS',
      candidate,
      bindingManifestSha256: manifestSha256,
      requestByteCap: CANDIDATE_LIMITS.requestBytes,
      maxRequestBytes: Math.max(0, ...requests.map((r) => Number(r.bytes))),
      maxConservativeInputTokenBound: Math.max(
        0,
        ...requests.map((r) => Number(r.conservativeInputTokenBound)),
      ),
      transportCalls,
      actualPaidCalls: 0,
      brokerMode: brokerUrl
        ? 'SEPARATE_PROCESS_NO_UPSTREAM_ONLY'
        : 'IN_PROCESS_CANNED_ONLY',
      externalFetchCalls: 0,
      providerWrites: 0,
      modelQuality: 'NOT_EVALUATED',
      cannedResponse: 'FIXED_CLARIFICATION_NOT_SELECTED_FROM_CASE_ORACLE',
      requests,
      modelInputs,
      policyReads,
      preflights,
      outcomes,
      admissionFailure,
      budget: gate.stats,
      pgClock: pgClock[0].now,
      bindings: [...sources.values()].map((s) => ({
        caseId: s.item.id,
        role: s.item.role,
        grantedFeatures: s.features,
        effectiveFeatures: featureReads.get(s.tenant.id) ?? [],
        sourceRefs: s.sourceRefs.map((r) => ({
          owner: r.owner,
          idSha256: hash(r.id),
          status: r.status,
        })),
        reads: s.reads,
        clockBinding: s.clockBinding,
      })),
      authWithoutToken: unauth.status,
      sourceCorpusUnchanged: true,
      selectedCaseIds: selectedCases.map((c) => c.id),
      selectedDialogs: selectedCases.length,
      selectedTurns: selectedCases.reduce((n, c) => n + c.userTurns.length, 0),
      branchEvidence,
      ycBranchEvidence,
      fixtureSourceLanguageAcceptance: false,
      qualificationLimits: [
        'Fixed canned clarification does not select or explain domain sources; source preflight is separate.',
        'Public INTERNAL availability allows another same-tenant branch; native YCLIENTS adapter refuses every selected Maya branch without canonical mapping and returns branch_id:null for unscoped configured-company reads. Provider transport is finite synthetic, not live acceptance.',
        'Known goods source unavailability returns HTTP 503 with a stable error code; unexpected program errors remain errors, not empty goods facts.',
        'Authored absolute October remains an open period at the real fixture date; no full-month result is claimed.',
        'Zero-model deterministic paths contribute zero model coverage; no real model or provider acceptance.',
      ],
    });
    expect(preflights.filter((p) => !p.expectedStatusMatched)).toEqual([]);
  }, 660000);
});
