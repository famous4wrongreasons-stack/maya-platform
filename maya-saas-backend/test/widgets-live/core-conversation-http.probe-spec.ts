/** Bounded development diagnostic: actual auth/HTTP/AiCore/DeepSeek serializer
 * and actual HTTP reply history. Model input retains the canonical privacy
 * filter and server-owned semantic continuation, not caller assistant prose.
 * No corpus gold answer enters dialogue history, and source owners remain intact.
 * The separately owned broker provides canned or explicitly qualified recorded
 * replay transport in dry mode and admitted transport in live mode; this process
 * never reads a provider credential. */
import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiCoreService } from '../../src/ai-tools/ai-core.service';
import type { AiCoreModelInput } from '../../src/ai-tools/ai-core.types';
import { AiToolPolicyService } from '../../src/ai-tools/ai-tool-policy.service';
import { OWNER_REVIEW_QUESTION } from '../../src/ai-tools/owner-review-plan';
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
import {
  coreFullOfflineRecipe,
  configureCoreFullOfflineAfterBind,
  coreFullOfflineExternalFacts,
} from './support/core-full-offline-fixtures';
import { occupancyFixtureEdge } from './support/c9-occupancy-fixture-edge';
import { assertProofDatabase } from './support/proof-db-guard';
import {
  captureCoreFullOfflineAudit,
  sanitizeCoreFullOfflineAuditValue,
  projectCoreFullOfflinePublicCompany,
  createCoreFullOfflinePublicCompanyRecorder,
} from './support/core-full-offline-audit';

const nativeRequire = createRequire(__filename);
const { replayPilot, sha256 } = nativeRequire(
  path.resolve('scripts/conversation-qualification/replay.mjs'),
) as typeof import('../../scripts/conversation-qualification/replay.mjs');
const {
  CandidateBudgetGate,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_UNION_PROFILE,
  CORE_OFFLINE_PROFILE,
} = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/current-candidate-budget.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/current-candidate-budget.mjs');
const {
  assessCoreTurn,
  hasExactReviewedSlot,
  CORE_FOLLOWUP_CASE_IDS,
  CORE_CASE_TURNS,
} = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-conversation-assessment.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/core-conversation-assessment.mjs');
const followupCaseIds = new Set(CORE_FOLLOWUP_CASE_IDS);
type SemanticAssessment =
  import('../../scripts/conversation-qualification/replay.mjs').SemanticAssessment;
type ReplayResult =
  import('../../scripts/conversation-qualification/replay.mjs').ReplayResult;
const { coreConversationProfile } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-conversation-profile.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/core-conversation-profile.mjs');
const { readCoreManifest, assertCoreAdmission } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-conversation-admission.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/core-conversation-admission.mjs');
const { socketRequest } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-conversation-socket.mjs',
  ),
) as typeof import('../../scripts/conversation-qualification/core-conversation-socket.mjs');
const mode = process.env.JEST_CORE_CONVERSATION_MODE;
const recordedReplayFlag = process.env.JEST_CORE_CONVERSATION_RECORDED_REPLAY;
const recordedReplay = recordedReplayFlag === '1';
const semanticFailureFixture =
  process.env.JEST_CORE_CONVERSATION_SEMANTIC_FAILURE_FIXTURE;
const replayFixture = process.env.JEST_CORE_CONVERSATION_REPLAY_FIXTURE;
const recordedReplayQualification =
  'RECORDED_RESPONSE_REPLAY_WITH_DECLARED_BINDING_AND_SYNTHETIC_CONTINUATIONS_NOT_MODEL_QUALITY';
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
  !['dry', 'live', 'live-local'].includes(mode ?? '') ||
  (recordedReplayFlag !== undefined &&
    (recordedReplayFlag !== '1' || mode !== 'dry')) ||
  (replayFixture !== undefined &&
    (!recordedReplay ||
      !['actual-20261009', 'synthetic-accept-20261009'].includes(
        replayFixture,
      ))) ||
  !output ||
  !path.isAbsolute(output) ||
  !manifestPath ||
  !path.isAbsolute(manifestPath) ||
  !/^[a-f0-9]{64}$/.test(manifestSha256 ?? '') ||
  !/^[a-f0-9]{40}$/.test(sourceHead ?? '') ||
  !/^[a-f0-9]{64}$/.test(sourceDigest ?? '') ||
  (mode === 'dry' &&
    (!brokerUrl ||
      !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/chat\/completions$/.test(
        brokerUrl,
      ) ||
      Number(new URL(brokerUrl).port) > 65535)) ||
  (mode !== 'dry' && brokerUrl !== undefined)
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
const auditRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function offlineSelection(value: unknown, tenantId: string) {
  const resolution = auditRecord(value),
    receipt = auditRecord(resolution.receipt),
    envelope = auditRecord(receipt.envelope),
    body = auditRecord(envelope.body),
    provenance = auditRecord(envelope.provenance);
  const groups = Array.isArray(body.groups) ? body.groups : [];
  const slots = groups.flatMap((group) => {
    const rows = auditRecord(group).slots;
    return Array.isArray(rows)
      ? rows.map((value) => {
          const slot = auditRecord(value);
          return {
            start: auditRecord(slot.start).value ?? null,
            end: auditRecord(slot.end).value ?? null,
          };
        })
      : [];
  });
  return {
    matched: resolution.matched === true,
    contract: typeof envelope.contract === 'string' ? envelope.contract : null,
    receiptMatches:
      typeof receipt.widget_id === 'string' &&
      receipt.widget_id.length > 0 &&
      envelope.widget_id === receipt.widget_id,
    kind: typeof envelope.kind === 'string' ? envelope.kind : null,
    sourceCapability:
      typeof provenance.source_capability === 'string'
        ? provenance.source_capability
        : null,
    tenantMatches: envelope.tenant_id === tenantId,
    shownCount: typeof body.shown_count === 'number' ? body.shown_count : null,
    exactReview: hasExactReviewedSlot(value, {
      tenantId,
      timezone: 'Europe/Moscow',
      start: typeof slots[0]?.start === 'string' ? slots[0].start : '',
    }),
    slots,
  };
}
const safeDiagnosticCode = (value: unknown) =>
  typeof value === 'string' &&
  /^(?:ai_core|ai_model|conversation|core)_[a-z0-9_:-]{1,72}$/.test(value)
    ? value
    : null;
type DiagnosticCase = {
  id: string;
  role: 'client' | 'owner' | 'admin';
  runtimeRole?: string;
  audience?: 'client' | 'owner';
  group: string;
  familyRefs?: string[];
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
  error?: { code?: unknown; detail?: unknown };
  resolution?: { matched?: boolean; receipt?: unknown };
  user_turn?: { conversationId?: string };
  coordination?: {
    run_id?: string;
    revision_id?: string;
    scope?: string;
    revision?: number;
    state?: string;
    current?: boolean;
    replayed?: boolean;
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
function assertFiniteFollowupAvailability(
  source: CandidateSource,
  params: Parameters<CRMAdapter['getAvailableSlots']>[0],
) {
  const tomorrow = String(source.clockBinding.tomorrow);
  if (
    params.tenantId !== source.tenant.id ||
    params.timezone !== 'Europe/Moscow' ||
    ![tomorrow, source.startsAt].includes(params.date) ||
    params.staffId !== '71' ||
    JSON.stringify(params.serviceIds) !== JSON.stringify(['81']) ||
    (params.branchId !== undefined && params.branchId !== source.branchId)
  )
    throw new Error('core_followup_finite_availability_source_unavailable');
}

describe('Core conversation [actual HTTP, bounded broker, development diagnostic only]', () => {
  let db: FixtureContext, http: HttpHarness;
  let gate: InstanceType<typeof CandidateBudgetGate> | undefined;
  let manifest: DiagnosticManifest;
  let profile: ReturnType<typeof coreConversationProfile>;
  let active: CandidateSource | undefined;
  let turn = 0,
    modelCallsForTurn = 0,
    modelCalls = 0,
    serializerCalls = 0,
    brokerCalls = 0,
    modelOutputResponses = 0;
  let stopped: string | null = null;
  const sources = new Map<string, CandidateSource>();
  const caseSources = new Map<string, CandidateSource>();
  const actualRepliesByCase = new Map<string, string[]>();
  const financeDays = new Map<string, string>();
  const observedCompanyProfiles = createCoreFullOfflinePublicCompanyRecorder();
  const forbidden: string[] = [];
  const financeReads: Array<{ route: string; company: string }> = [];
  const modelObservations: Record<string, unknown>[] = [];
  const wireObservations: Record<string, unknown>[] = [];
  const policyObservations: Record<string, unknown>[] = [];
  const responses: Record<string, unknown>[] = [];
  const offlineCompletions = new Map<
    string,
    ReturnType<typeof captureCoreFullOfflineAudit>
  >();
  const preflights: Record<string, unknown>[] = [];
  const replayRecords: Record<string, unknown>[] = [];
  let result: ReplayResult | null = null;
  const semanticAssessments = new Map<string, SemanticAssessment>();
  const modelCoverageSince = (
    modelBefore: number,
    brokerBefore: number,
    outputBefore: number,
  ) =>
    modelOutputResponses > outputBefore
      ? recordedReplay
        ? recordedReplayQualification
        : mode === 'dry'
          ? 'CANNED_TRANSPORT_ONLY'
          : 'ACTUAL_MODEL_OUTPUT_UNGRADED'
      : modelCalls === modelBefore
        ? 'ZERO_MODEL_NOT_LANGUAGE_COVERAGE'
        : brokerCalls === brokerBefore
          ? 'NO_MODEL_OUTPUT_PRE_DISPATCH'
          : 'NO_MODEL_OUTPUT_RECEIVED';
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
    const verifiedManifest = readCoreManifest(manifestPath, manifestSha256!, {
      localStdin: mode === 'live-local',
    });
    manifest = verifiedManifest as unknown as DiagnosticManifest;
    profile = coreConversationProfile(verifiedManifest.profile);
    if (
      profile.id === CORE_OFFLINE_PROFILE &&
      (mode !== 'dry' || recordedReplay)
    )
      throw new Error('core_full_offline_dry_only');
    if (
      semanticFailureFixture !== undefined &&
      !(
        semanticFailureFixture === 'first-client-turn' &&
        mode === 'dry' &&
        profile.id === CORE_UNION_PROFILE &&
        !recordedReplay
      )
    )
      throw new Error('core_semantic_fixture_refused');
    if (recordedReplay && profile.id !== CORE_DIAGNOSTIC_PROFILE)
      throw new Error('core_recorded_replay_profile_refused');
    expect(manifest).toMatchObject({
      contract: 'maya.core-conversation-run/1',
      mode:
        mode === 'dry'
          ? 'DRY_HTTP'
          : mode === 'live-local'
            ? 'ADMITTED_LOCAL_MODEL_HTTP'
            : 'ADMITTED_MODEL_HTTP',
      profile: profile.id,
      candidateCommit: sourceHead,
      dialogs: profile.dialogs,
      userTurns: profile.userTurns,
      paidAuthorized: false,
      limitsSha256: profile.limitsSha256,
    });
    expect(manifest.limits).toEqual(profile.limits);
    const datasetPath = path.resolve('..', profile.datasetPath);
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
    if (mode !== 'dry') {
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
      mode !== 'dry'
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
      profile: profile.id,
      ...budgetMode,
      transport: async (_url, init) => {
        if (!active || typeof init?.body !== 'string')
          throw new Error('core_active_serialized_turn_required');
        expect(init.headers).toBeUndefined();
        brokerCalls++;
        const relayInit: RequestInit = {
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
        };
        const response =
          mode !== 'dry'
            ? await socketRequest(
                verifiedManifest.admissionContext!.target,
                '/chat/completions',
                relayInit,
                { localStdin: mode === 'live-local' },
              )
            : await rawFetch(brokerUrl!, relayInit);
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
      DEEPSEEK_AI_CORE_MODEL: profile.limits.model,
      DEEPSEEK_API_KEY: 'CORE_BROKER_PLACEHOLDER_NOT_A_CREDENTIAL',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      AI_CORE_MAX_OUTPUT_TOKENS: String(profile.limits.outputPerAttempt),
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
      const finite =
        profile.id === CORE_OFFLINE_PROFILE
          ? coreFullOfflineExternalFacts(source)
          : null;
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
            return Promise.resolve(
              finite ? finite.getServices(tenantId) : services,
            );
          },
          getPublicBookingServices: (tenantId: string, staffId?: string) => {
            read('public-services', tenantId);
            return Promise.resolve(
              finite ? finite.getServices(tenantId, staffId) : services,
            );
          },
          readServiceCatalog: (tenantId: string) => {
            read('service-catalog', tenantId);
            return Promise.resolve(
              observedServiceCatalog(
                finite ? finite.getServices(tenantId) : services,
                'synthetic',
              ),
            );
          },
          getStaff: (tenantId: string) => {
            read('staff', tenantId);
            return Promise.resolve(
              finite
                ? finite.getStaff(tenantId)
                : [{ id: '71', name: 'Артём' }],
            );
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
            if (finite)
              return Promise.resolve(
                finite.getStaffScheduleDay({ tenantId, staffId, date }),
              );
            if (followupCaseIds.has(source.item.id)) {
              expect(staffId).toBe('71');
              expect(date.slice(0, 10)).toBe(source.clockBinding.tomorrow);
            }
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
            if (finite)
              return Promise.resolve(finite.getAvailableSlots(params));
            if (followupCaseIds.has(source.item.id))
              assertFiniteFollowupAvailability(source, params);
            return Promise.resolve([
              {
                start: source.startsAt,
                end: source.endsAt,
                staff_id: params.staffId ?? '71',
                branch_id: source.branchId,
              },
            ]);
          },
          ...(finite
            ? {
                readGoodsItem: (tenantId: string, goodsId: string) => {
                  read('goods', tenantId);
                  return Promise.resolve(
                    finite.readGoodsItem(tenantId, goodsId),
                  );
                },
                getServicePriceSnapshot: (serviceId: string) => {
                  read('service-price-snapshot');
                  return Promise.resolve(
                    finite.getServicePriceSnapshot(serviceId),
                  );
                },
              }
            : {}),
          getCompanyProfile: () => {
            read('company');
            const returned = {
              id: source.company,
              title: 'Синтетический салон',
              address: 'Синтетический адрес',
              schedule: '10:00–20:00',
              timezone: 'Europe/Moscow',
              logo_url: null,
            };
            if (profile.id === CORE_OFFLINE_PROFILE)
              observedCompanyProfiles.record(
                {
                  tenantId: source.tenant.id,
                  companyId: source.company,
                  provider: 'yclients',
                },
                returned,
              );
            return Promise.resolve(returned);
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
    if (profile.id === CORE_OFFLINE_PROFILE) {
      // Read-only observation of the existing owner at its actual completion
      // boundary. No decision/result/history is replaced by this diagnostic.
      const core = http.app.get<{
        complete(...args: unknown[]): Promise<unknown>;
      }>(AiCoreService);
      const complete = core.complete.bind(core);
      jest.spyOn(core, 'complete').mockImplementation(async (...args) => {
        if (active && turn > 0) {
          const snapshot = captureCoreFullOfflineAudit(args, {
            tenantId: active.tenant.id,
            userId: active.user.id,
            privateValues: active.privateValues,
          });
          offlineCompletions.set(`${active.item.id}:${turn}`, snapshot);
          append('offline-completion-audit.jsonl', {
            caseId: active.item.id,
            turn,
            ...snapshot,
          });
        }
        return complete(...args);
      });
    }
    jest
      .spyOn(model, 'decide')
      .mockImplementation(async (input: AiCoreModelInput) => {
        modelCalls++;
        modelCallsForTurn++;
        const ownerFollowUp =
          active?.item.id === 'core-owner-compound-clarification' &&
          turn === 2 &&
          modelCallsForTurn === 1;
        const previousActualReply = active
          ? actualRepliesByCase.get(active.item.id)?.at(-1)
          : undefined;
        const restoredClarificationMatchesActualReply = ownerFollowUp
          ? typeof previousActualReply === 'string' &&
            input.conversationPlan?.tasks.some(
              (task) =>
                task.requires_clarification &&
                task.clarification_question === previousActualReply,
            ) === true
          : null;
        // The ordinary canned dry transport never asks this owner question.
        // Classify the actual server reply with its existing closed contract;
        // compare against that captured reply, never a corpus/gold response.
        const canonicalOwnerClarificationExpected =
          ownerFollowUp && previousActualReply === OWNER_REVIEW_QUESTION;
        const onlyUserHistoryForwarded = input.messages.every(
          (message) => message.role === 'user',
        );
        modelObservations.push({
          caseId: active?.item.id,
          turn,
          role: input.principalRole,
          actualTools: input.tools.map((t) => t.name),
          requiredTools: input.requiredToolNames,
          historyRoles: input.messages.map((m) => m.role),
          historyPolicy:
            'SANITIZED_USER_TURNS_ONLY_CALLER_ASSISTANT_PROSE_WITHHELD',
          onlyUserHistoryForwarded,
          historySha256: hash(input.messages),
          canonicalOwnerClarificationExpected,
          restoredClarificationMatchesActualReply,
          priorPlanPresent: input.conversationPlan != null,
          pendingOwnerReviewPresent: input.pendingOwnerReview != null,
          pendingOwnerReviewTaskIntents:
            input.pendingOwnerReview?.task_intents ?? [],
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
        // Boolean-only assertions cannot dump private carried assistant prose.
        expect(onlyUserHistoryForwarded).toBe(true);
        if (
          canonicalOwnerClarificationExpected &&
          !(
            profile.id === CORE_UNION_PROFILE ||
            profile.id === CORE_OFFLINE_PROFILE
          )
        )
          expect(restoredClarificationMatchesActualReply).toBe(true);
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
          maya_recorded_replay?: { origin?: unknown; scenario?: unknown };
        };
        const recordedOrigin = payload.maya_recorded_replay?.origin;
        if (
          recordedReplay
            ? typeof recordedOrigin !== 'string' ||
              ![
                'RECORDED_ACTUAL_RESPONSE_WITH_DECLARED_BINDING',
                'SCRIPTED_SYNTHETIC_CONTINUATION',
              ].includes(recordedOrigin)
            : payload.maya_recorded_replay !== undefined
        )
          throw new Error('core_recorded_replay_response_binding_refused');
        if (
          replayFixture !== undefined &&
          payload.maya_recorded_replay?.scenario !==
            (replayFixture === 'actual-20261009'
              ? 'archived'
              : 'synthetic-accept')
        )
          throw new Error('core_recorded_replay_fixture_binding_refused');
        const content = payload.choices?.[0]?.message?.content;
        // An invoked model method, serialized request or broker dispatch alone
        // does not establish that this turn received any model output.
        if (response.ok && typeof content === 'string' && content.length > 0)
          modelOutputResponses++;
        append('actual-model-responses.jsonl', {
          caseId: active.item.id,
          turn,
          attempt: gate.stats.attempts,
          status: response.status,
          origin: recordedReplay
            ? recordedOrigin
            : mode === 'dry'
              ? 'CANNED_SYNTHETIC_RESPONSE'
              : 'BROKER_MODEL_RESPONSE',
          replayFixture: replayFixture ?? null,
          semanticFailureFixture: semanticFailureFixture ?? null,
          semanticQualification:
            mode === 'dry'
              ? 'SCRIPTED_DRY_MECHANICS_NOT_MODEL_QUALITY'
              : 'FINITE_OBSERVED_FACT_CHECKS_NOT_GENERAL_LANGUAGE_ACCEPTANCE',
          qualification: recordedReplay
            ? recordedReplayQualification
            : mode === 'dry'
              ? 'CANNED_TRANSPORT_MECHANICS_ONLY'
              : 'ACTUAL_BROKER_MODEL_OUTPUT_UNGRADED',
          content: typeof content === 'string' ? content : null,
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
      status: result?.status ?? 'incomplete',
      executionStatus: result?.executionStatus ?? 'incomplete',
      semanticStatus: result?.semanticStatus ?? 'ungraded',
      coverage: result?.coverage ?? null,
      qualification: recordedReplay
        ? recordedReplayQualification
        : 'KNOWN_DERIVED_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT_NOT_ACCEPTANCE',
      replayFixture: replayFixture ?? null,
      semanticFailureFixture: semanticFailureFixture ?? null,
      semanticQualification:
        profile?.id === CORE_OFFLINE_PROFILE
          ? 'SCRIPTED_CURRENT_SOURCE_MECHANICAL_CHECKS_NOT_MODEL_QUALITY'
          : mode === 'dry'
            ? 'SCRIPTED_DRY_MECHANICS_NOT_MODEL_QUALITY'
            : 'FINITE_OBSERVED_FACT_CHECKS_NOT_GENERAL_LANGUAGE_ACCEPTANCE',
      sourceHead,
      sourceDigest,
      manifestSha256,
      profile: profile?.id,
      dialogs: profile?.dialogs,
      plannedUserTurns: profile?.userTurns,
      actualHttpTurns: responses.length,
      ...(profile?.id === CORE_OFFLINE_PROFILE
        ? {
            offlineAccounting: {
              plannedTurns: 81,
              actualHttpTurns: responses.length,
              replyBearingResponses: responses.filter(
                (row) =>
                  row.httpStatus === 201 && typeof row.actualReply === 'string',
              ).length,
              expectedRefusals: responses.filter(
                (row) => row.expectedRefusal !== undefined,
              ).length,
              skippedDependentTurns:
                result?.coverage.skippedDependentTurns ?? 0,
              unexecutedTurns: result?.coverage.unexecutedTurns ?? null,
              unresolvedTurns: result?.coverage.unresolvedTurns ?? null,
              qualification:
                'ACTUAL_HTTP_AND_SCRIPTED_TRANSPORT_NOT_MODEL_QUALITY',
            },
          }
        : {}),
      modelCalls,
      serializerCalls,
      brokerCalls,
      modelOutputResponses,
      modelOutputResponsesMeaning:
        'Successful broker envelopes with nonempty content; dry is canned, live requires matching broker evidence; not semantic acceptance',
      gate: gate?.stats ?? null,
      stopped,
      providerQualification: {
        booking: 'ACTUAL_INTERNAL_CALENDAR_AND_VERIFIED_SYNTHETIC_CLIENT',
        occupancy: 'SYNTHETIC_DOMAIN_PORT_READS_CANONICAL_OPPORTUNITY_OWNER',
        finance: 'ACTUAL_C7_OWNER_NATIVE_YCLIENTS_ADAPTER_FINITE_SYNTHETIC_GET',
        realCrmNetworkCalls: 0,
      },
      modelQualification: recordedReplay
        ? recordedReplayQualification
        : mode === 'dry'
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
      ...(profile?.id === CORE_OFFLINE_PROFILE
        ? {
            legacyFiniteAssessments: [...semanticAssessments].map(
              ([key, assessment]) => ({ key, ...assessment }),
            ),
            legacyAssessmentPolicy:
              'RECORDED_NON_BLOCKING_FULL_OFFLINE_SCORE_IS_SEPARATE',
          }
        : {}),
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
    if (profile.id === CORE_OFFLINE_PROFILE) {
      await seedOffline(fx);
      return;
    }
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
        variant:
          item.id === 'followup-owner-topic-switch'
            ? 'finance_schedule_only'
            : 'ordinary',
        userTurns: [...item.userTurns],
        fixture: { clock: 'ACTUAL_EXECUTION_CLOCK_BOUND_ONCE' },
      };
      const source = await bindCandidateSource(db, http, fx, binding, sources);
      caseSources.set(item.id, source);
      // Finite B fixtures bind the frozen utterances to real current owners.
      // Only owned synthetic setup changes here, before the no-effects snapshot.
      const carryOver = item.id === 'followup-client-carry-over';
      if (carryOver) {
        for (const [from, to] of [
          ['Артём', 'Елена'],
          ['Максим', 'Никита'],
        ])
          expect(
            await db.prisma.internalProvider.updateMany({
              where: { tenantId: source.tenant.id, displayName: from },
              data: { displayName: to },
            }),
          ).toEqual({ count: 1 });
        expect(
          await db.prisma.internalService.updateMany({
            where: { tenantId: source.tenant.id, name: 'Мужская стрижка' },
            data: { name: 'комплекс стрижка и борода' },
          }),
        ).toEqual({ count: 1 });
      }
      if (item.id === 'followup-owner-topic-switch')
        await db.prisma.branch.update({
          where: { id: source.branchId },
          data: { name: 'основной филиал' },
        });
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
          where: {
            tenantId: source.tenant.id,
            displayName: carryOver ? 'Елена' : 'Артём',
          },
        });
        const service = await db.prisma.internalService.findFirstOrThrow({
          where: {
            tenantId: source.tenant.id,
            name: carryOver ? 'комплекс стрижка и борода' : 'Мужская стрижка',
          },
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
          staffName: staff.displayName,
          serviceName: service.name,
        });
        expect(response.status).toBe(201);
        expect(preflights.at(-1)?.exact17Available).toBe(true);
        if (followupCaseIds.has(source.item.id)) {
          const other = await db.prisma.internalProvider.findFirstOrThrow({
            where: {
              tenantId: source.tenant.id,
              displayName: carryOver ? 'Никита' : 'Максим',
            },
          });
          const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(String(source.clockBinding.runtimeClock)));
          const tomorrow = String(source.clockBinding.tomorrow);
          const checks = carryOver
            ? [
                { staff, date: today, time: undefined },
                { staff: other, date: tomorrow, time: '17:00' },
              ]
            : [{ staff: other, date: tomorrow, time: '19:30' }];
          for (const check of checks) {
            const checked = await http.executeTool(
              source.token,
              'booking.availability.read',
              {
                surface: 'web',
                arguments: {
                  date: check.date,
                  ...(check.time ? { time: check.time } : {}),
                  staff_id: check.staff.id,
                  service_ids: [service.id],
                  branch_id: source.branchId,
                },
                idempotencyKey: randomUUID(),
              },
              randomUUID(),
            );
            const checkedBody = checked.body as typeof body;
            expect(checked.status).toBe(201);
            const slots = checkedBody.result?.slots;
            expect(Array.isArray(slots)).toBe(true);
            const exactAvailable = check.time
              ? slots!.some(
                  (slot) =>
                    Date.parse(slot.start) ===
                      Date.parse(`${check.date}T${check.time}:00+03:00`) &&
                    slot.staff_id === check.staff.id &&
                    slot.branch_id === source.branchId,
                )
              : null;
            if (check.time) expect(exactAvailable).toBe(true);
            preflights.push({
              caseId: item.id,
              role: member.role,
              httpStatus: checked.status,
              staffName: check.staff.displayName,
              serviceName: service.name,
              date: check.date,
              time: check.time ?? null,
              exactAvailable,
              observedSlotCount: slots!.length,
              clock: source.clockBinding,
              qualification: check.time
                ? 'CANONICAL_EXACT_AVAILABILITY_READ'
                : 'CANONICAL_TODAY_READ_EMPTY_IS_VALID_NO_FABRICATED_FUTURE_SLOT',
            });
          }
        }
      } else if (item.role === 'owner') {
        if (followupCaseIds.has(source.item.id)) {
          const query = {
            tenantId: source.tenant.id,
            timezone: 'Europe/Moscow',
            date: String(source.clockBinding.tomorrow),
            staffId: '71',
            serviceIds: ['81'],
            branchId: source.branchId,
          };
          expect(() =>
            assertFiniteFollowupAvailability(source, query),
          ).not.toThrow();
          for (const bad of [
            { date: '2000-01-01' },
            { date: '' },
            { staffId: 'unknown' },
            { staffId: undefined },
            { serviceIds: ['unknown'] },
            { serviceIds: undefined },
            { branchId: 'foreign' },
            { tenantId: 'foreign' },
            { timezone: 'UTC' },
          ])
            expect(() =>
              assertFiniteFollowupAvailability(source, { ...query, ...bad }),
            ).toThrow('core_followup_finite_availability_source_unavailable');
          preflights.push({
            caseId: item.id,
            finiteExternalAvailabilityFence: true,
            unsupportedQueriesRejected: 9,
          });
        }
        await publishFinance(source);
        const scheduleOnly = item.id === 'followup-owner-topic-switch';
        expect(
          await db.prisma.opportunity.count({
            where: { tenantId: source.tenant.id },
          }),
        ).toBe(scheduleOnly ? 0 : 1);
        if (scheduleOnly) {
          const schedule = await http.executeTool(
            source.token,
            'staff.schedule.read',
            {
              surface: 'web',
              arguments: { staff_id: '71', date: source.clockBinding.tomorrow },
              idempotencyKey: randomUUID(),
            },
            randomUUID(),
          );
          expect(schedule.status).toBe(201);
          expect(schedule.body).toMatchObject({
            result: {
              verified: true,
              source: 'crm',
              staff: [
                {
                  id: '71',
                  name: 'Артём',
                  is_working: true,
                  slots: [{ from: '10:00', to: '20:00' }],
                },
              ],
            },
          });
          preflights.push({
            caseId: item.id,
            role: member.role,
            httpStatus: schedule.status,
            branchName: 'основной филиал',
            staffName: 'Артём',
            date: source.clockBinding.tomorrow,
            schedule: '10:00–20:00',
            financeScope: 'TENANT_WIDE_PUBLISHED_C7_NOT_BRANCH_ROOT_CAUSE',
          });
        }
        preflights.push({
          caseId: item.id,
          role: member.role,
          publishedC7: true,
          canonicalOpportunity: !scheduleOnly,
          clock: source.clockBinding,
        });
      } else {
        if (item.id === 'followup-admin-general-chat') {
          const before = await businessState(source.tenant.id);
          const sourceReadCount = source.reads.length;
          const checks: Record<string, unknown>[] = [];
          for (const content of [
            'Объясни простыми словами выручку',
            'Не подменяй факты прогнозом. Какая выручка?',
            'Дай прогноз выручки',
            'Покажи рост прибыли',
          ]) {
            const denied = await request(http.app.getHttpServer())
              .post('/api/ai/chat')
              .set('Authorization', `Bearer ${source.token}`)
              .send({
                surface: 'web',
                audience: 'owner',
                requestId: randomUUID(),
                messages: [{ role: 'user', content }],
              });
            expect(denied.status).toBe(201);
            expect(denied.body).toMatchObject({
              source: 'safe_fallback',
              action: null,
              tools_used: [],
              grounding: { status: 'blocked' },
            });
            expect((denied.body as { reply: string }).reply).toContain(
              'недоступен',
            );
            checks.push({
              content,
              httpStatus: denied.status,
              grounding: 'blocked',
            });
          }
          const forbiddenTool = await http.executeTool(
            source.token,
            'analytics.business.query',
            {
              surface: 'web',
              arguments: { period: 'today', comparison: 'none' },
              idempotencyKey: randomUUID(),
            },
            randomUUID(),
          );
          expect(forbiddenTool.status).toBe(403);
          expect(modelCalls).toBe(0);
          expect(brokerCalls).toBe(0);
          expect(source.reads.length).toBe(sourceReadCount);
          expect(await businessState(source.tenant.id)).toBe(before);
          preflights.push({
            caseId: item.id,
            qualification:
              'SEPARATE_NEGATIVE_AUTHORITY_CONTROLS_NOT_CORPUS_TURNS',
            role: member.role,
            checks,
            forbiddenToolStatus: 403,
            modelCalls: 0,
            sourceReads: 0,
            businessHashUnchanged: true,
          });
        }
        if (item.id === 'followup-admin-typo-ambiguous-period') {
          for (const tool of ['catalog.staff.read', 'catalog.services.read']) {
            const catalog = await http.executeTool(
              source.token,
              tool,
              {
                surface: 'web',
                arguments: {},
                idempotencyKey: randomUUID(),
              },
              randomUUID(),
            );
            expect(catalog.status).toBe(201);
            preflights.push({
              caseId: item.id,
              role: member.role,
              tool,
              httpStatus: catalog.status,
              currentSyntheticCatalog: true,
              omittedStaffServiceAndConflictingPeriodNotFilledIn: true,
            });
          }
        }
        preflights.push({
          caseId: item.id,
          role: member.role,
          noRoleUpgrade: true,
        });
      }
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
  async function currentOfflineSourceFacts(source: CandidateSource) {
    const where = { tenantId: source.tenant.id };
    const [
      member,
      services,
      staff,
      ownClient,
      appointments,
      c7,
      c8,
      branding,
      policy,
    ] = await Promise.all([
      db.prisma.membership.findUniqueOrThrow({
        where: { userId_tenantId: { ...where, userId: source.user.id } },
      }),
      db.prisma.internalService.findMany({
        where,
        select: {
          name: true,
          price: true,
          currency: true,
          durationMinutes: true,
        },
      }),
      db.prisma.internalProvider.findMany({
        where,
        select: { displayName: true },
      }),
      db.prisma.client.findFirst({
        where: { ...where, userId: source.user.id },
        select: { id: true },
      }),
      db.prisma.appointment.findMany({
        where,
        select: {
          mayaClientId: true,
          startAt: true,
          endAt: true,
          status: true,
        },
      }),
      db.prisma.measurementRevision.findMany({
        where,
        select: {
          state: true,
          periodFrom: true,
          periodTo: true,
          timezone: true,
          valuesJson: true,
          completeness: true,
          qualification: true,
        },
      }),
      db.prisma.c8ResultRevision.findMany({
        where,
        select: {
          state: true,
          ruleKey: true,
          ruleVersion: true,
          periodFrom: true,
          periodTo: true,
          valuesJson: true,
          completeness: true,
          qualification: true,
        },
      }),
      db.prisma.brandingSettings.findUnique({
        where: { tenantId: source.tenant.id },
        select: { appName: true, contactDetailsJson: true },
      }),
      db.prisma.tenantBusinessConfigurationRevision.findFirst({
        where: { ...where, namespace: 'c8_valuation' },
        orderBy: { revision: 'desc' },
        select: { revision: true, encryptedContent: true },
      }),
    ]);
    const external = ['booking', 'personal', 'bi', 'lifecycle'].includes(
      source.item.group,
    )
      ? null
      : coreFullOfflineExternalFacts(source);
    const contacts = auditRecord(branding?.contactDetailsJson);
    const observedCompany = observedCompanyProfiles.snapshot({
      tenantId: source.tenant.id,
      companyId: source.company,
      provider: 'yclients',
    });
    const content = policy?.encryptedContent
      ? auditRecord(JSON.parse(db.encryption.decrypt(policy.encryptedContent)))
      : {};
    const rules = Array.isArray(content.dormancyRules)
      ? content.dormancyRules
      : [];
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return {
      actor: {
        role: member.role,
        sameTenant: member.tenantId === source.tenant.id,
        sameActor: member.userId === source.user.id,
        membershipActive: member.status === 'active',
      },
      facts: {
        qualification: 'CURRENT_SYNTHETIC_SOURCE_SNAPSHOT_NOT_MODEL_INPUT',
        timezone: 'Europe/Moscow',
        today,
        tomorrow: String(source.clockBinding.tomorrow),
        staff: external
          ? external.getStaff(source.tenant.id).map(({ name }) => ({ name }))
          : staff.map(({ displayName }) => ({ name: displayName })),
        services: external
          ? external
              .getServices(source.tenant.id)
              .map(({ name, price, currency, duration_minutes }) => ({
                name,
                price,
                currency,
                durationMinutes: duration_minutes,
              }))
          : services,
        company: observedCompany?.company ?? {
          name: branding?.appName ?? null,
          address: contacts.address ?? null,
          businessHours: contacts.businessHours ?? null,
        },
        companyProvenance: observedCompany?.provenance ?? {
          qualification: 'CURRENT_TENANT_BRANDING_SNAPSHOT_NOT_CRM_READ',
          source: 'tenant_branding',
          reader: 'BrandingSettings.contactDetailsJson',
        },
        ownAppointments: appointments
          .filter(
            (row) => ownClient !== null && row.mayaClientId === ownClient.id,
          )
          .map((row) => ({
            start: row.startAt.toISOString(),
            end: row.endAt.toISOString(),
            status: row.status,
          })),
        otherClientAppointmentCount: appointments.filter(
          (row) =>
            row.mayaClientId !== null && row.mayaClientId !== ownClient?.id,
        ).length,
        occupied: source.occupied,
        c7Published: c7.some((row) => row.state === 'PUBLISHED'),
        c8Published: c8.some((row) => row.state === 'PUBLISHED'),
        c7Scopes: c7.map((row) => ({
          periodFrom: row.periodFrom.toISOString(),
          periodTo: row.periodTo.toISOString(),
          timezone: row.timezone,
          values: row.valuesJson,
          completeness: row.completeness,
          qualification: row.qualification,
        })),
        c8Results: c8.map((row) => ({
          ...row,
          periodFrom: row.periodFrom.toISOString(),
          periodTo: row.periodTo.toISOString(),
        })),
        c8Rule: rules.map((value) => {
          const rule = auditRecord(value);
          return {
            ruleKey: rule.ruleKey,
            ruleVersion: policy?.revision,
            thresholdDays:
              auditRecord(rule.elapsed).unit === 'day'
                ? auditRecord(rule.elapsed).count
                : null,
            comparison: rule.comparison,
            evidence: rule.evidence,
          };
        }),
      },
    };
  }
  async function seedOffline(fx: ReturnType<typeof fixturesForHttp>) {
    expect(manifest.cases).toHaveLength(48);
    expect(
      new Set(manifest.cases.flatMap((item) => item.familyRefs ?? [])).size,
    ).toBe(33);
    for (const item of manifest.cases)
      expect(item.familyRefs?.length).toBeGreaterThan(0);
    expect(
      manifest.cases.reduce((n, item) => n + item.userTurns.length, 0),
    ).toBe(81);
    for (const item of manifest.cases) {
      const recipe = coreFullOfflineRecipe(item.id);
      expect(recipe.binding.userTurns).toEqual(item.userTurns);
      expect(recipe.binding.role).toBe(item.role);
      const source = await bindCandidateSource(
        db,
        http,
        fx,
        recipe.binding,
        sources,
      );
      caseSources.set(item.id, source);
      const setup = await configureCoreFullOfflineAfterBind(db, source);
      // Grant only the exact existing READ feature to the existing role. Clone
      // the binder feature array so another case cannot inherit this setup.
      source.features = [...source.features];
      for (const feature of recipe.requiredFeatures) {
        if (!source.features.includes(feature)) {
          await fx.grantFeature(source.tenant, feature);
          source.features.push(feature);
        }
      }
      const member = await db.prisma.membership.findUniqueOrThrow({
        where: {
          userId_tenantId: {
            userId: source.user.id,
            tenantId: source.tenant.id,
          },
        },
      });
      expect(member.role).toBe(recipe.runtimeRole);
      const revoked = item.id === 'current-lifecycle-negative';
      if (revoked) expect(member.status).toBe('suspended');
      else expect(member.status).toBe('active');
      // Extra finance belongs only to the original compound/schedule scenarios.
      // Ordinary BI/C8 and their negatives remain solely bindCandidateSource's.
      if (
        [
          'core-owner-compound-clarification',
          'followup-owner-compound',
          'followup-owner-topic-switch',
          'mt-topic_switch_and_return-17',
        ].includes(item.id)
      )
        await publishFinance(source);
      const tools = await request(http.app.getHttpServer())
        .get('/api/ai/tools?surface=web')
        .set('Authorization', `Bearer ${source.token}`);
      expect(tools.status).toBe(revoked ? 401 : 200);
      const actualTools =
        tools.status === 200
          ? (tools.body as { tools: Array<{ name: string }> }).tools.map(
              (tool) => tool.name,
            )
          : [];
      const sourceReadProofs: Record<string, unknown>[] = [];
      for (const tool of recipe.requiredFeatures.map((feature) =>
        feature === 'reviews.core'
          ? 'reviews.list.read'
          : 'inventory.stock.read',
      )) {
        expect(actualTools).toContain(tool);
        const checked = await http.executeTool(
          source.token,
          tool,
          {
            surface: 'web',
            arguments:
              tool === 'reviews.list.read'
                ? { days: 30, rating: 1, limit: 20 }
                : { low_stock_only: true },
            idempotencyKey: randomUUID(),
          },
          randomUUID(),
        );
        expect(checked.status).toBe(201);
        expect(checked.body).toMatchObject({
          result: { configured: false, source: 'not_configured', count: 0 },
        });
        sourceReadProofs.push({
          tool,
          httpStatus: checked.status,
          result: (checked.body as { result: unknown }).result,
          qualification:
            'ACTUAL_UNCONFIGURED_LOCAL_REGISTRY_NOT_VERIFIED_EMPTY_PROVIDER_DATA_OR_REQUESTED_PERIOD',
        });
      }
      const where = { tenantId: source.tenant.id };
      const [
        catalog,
        staff,
        appointments,
        c7,
        c8,
        opportunities,
        inventoryCount,
        reviewCount,
      ] = await Promise.all([
        db.prisma.internalService.findMany({
          where,
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            durationMinutes: true,
            active: true,
          },
          orderBy: { id: 'asc' },
        }),
        db.prisma.internalProvider.findMany({
          where,
          select: { id: true, displayName: true, branchId: true, active: true },
          orderBy: { id: 'asc' },
        }),
        db.prisma.appointment.findMany({
          where,
          select: {
            id: true,
            mayaClientId: true,
            staffExternalId: true,
            status: true,
            startAt: true,
            endAt: true,
          },
          orderBy: { id: 'asc' },
        }),
        db.prisma.measurementRevision.findMany({
          where,
          select: { id: true, state: true },
          orderBy: { id: 'asc' },
        }),
        db.prisma.c8ResultRevision.findMany({
          where,
          select: { id: true, state: true },
          orderBy: { id: 'asc' },
        }),
        db.prisma.opportunity.findMany({
          where,
          select: { id: true, status: true },
          orderBy: { id: 'asc' },
        }),
        db.prisma.tenantCatalogItem.count({
          where: { ...where, kind: 'inventory' },
        }),
        db.prisma.businessReview.count({ where }),
      ]);
      preflights.push({
        caseId: item.id,
        group: recipe.binding.group,
        variant: recipe.binding.variant,
        bindingSha256: hash(recipe.binding),
        role: member.role,
        membershipStatus: member.status,
        audience: recipe.audience,
        features: source.features,
        actualTools,
        toolsHttpStatus: tools.status,
        clock: source.clockBinding,
        expectedBoundary: recipe.expectedBoundary,
        sourceReadProofs,
        sourceRefs: source.sourceRefs.map((ref) => ({
          owner: ref.owner,
          idHash: hash(ref.id),
          status: ref.status,
        })),
        branch: {
          idHash: hash(setup.branchId),
          name: setup.branchName,
          secondBranchHash: setup.otherBranchId
            ? hash(setup.otherBranchId)
            : null,
        },
        internalCatalog: catalog.map(({ id, ...row }) => ({
          ...row,
          idHash: hash(id),
        })),
        internalStaff: staff.map(({ id, branchId, ...row }) => ({
          ...row,
          idHash: hash(id),
          branchHash: hash(branchId),
        })),
        appointmentCount: appointments.length,
        appointmentSnapshotHash: hash(appointments),
        c7: c7.map((row) => ({ idHash: hash(row.id), state: row.state })),
        c8: c8.map((row) => ({ idHash: hash(row.id), state: row.state })),
        opportunities: opportunities.map((row) => ({
          idHash: hash(row.id),
          status: row.status,
        })),
        inventoryCount,
        reviewCount,
        occupied: source.occupied,
        qualification:
          'SYNTHETIC_FIXTURE_SETUP_WITH_CURRENT_OWNERS_NOT_DIALOGUE_OR_MODEL_ACCEPTANCE',
      });
    }
    expect(caseSources.size).toBe(48);
    expect(modelCalls).toBe(0);
    expect(serializerCalls).toBe(0);
    expect(brokerCalls).toBe(0);
    expect(forbidden).toEqual([]);
    write('offline-source-snapshots.json', {
      datasetSha256: manifest.datasetSha256,
      cases: preflights,
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
        ...(profile.id === CORE_OFFLINE_PROFILE
          ? [
              db.prisma.internalService.findMany({ where, orderBy }),
              db.prisma.internalProvider.findMany({ where, orderBy }),
              db.prisma.internalAvailabilityRule.findMany({ where, orderBy }),
              db.prisma.tenantCatalogItem.findMany({ where, orderBy }),
              db.prisma.businessReview.findMany({ where, orderBy }),
            ]
          : []),
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
  it('replays exactly the selected frozen dialogs and retains actual HTTP replies before qualification', async () => {
    const unsigned = {
      version: 1,
      purpose: 'pilot_calibration_not_qualification',
      sourceSha256: manifest.datasetSha256,
      split: 'dev',
      roles: ['client', 'owner', 'admin'],
      dialogs: profile.dialogs,
      independentFamilies:
        profile.id === CORE_OFFLINE_PROFILE ? 33 : profile.dialogs,
      userTurns: profile.userTurns,
      cases: manifest.cases.map((c) => ({
        id: c.id,
        familyId: profile.id === CORE_OFFLINE_PROFILE ? c.familyRefs![0] : c.id,
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
      ...(profile.id === CORE_OFFLINE_PROFILE
        ? {
            familyRefs: manifest.cases.map((c) => ({
              caseId: c.id,
              refs: c.familyRefs,
            })),
            familyCount: 33,
            familyCountMeaning:
              'SOURCE_LINEAGE_REFS_NOT_EMPIRICAL_INDEPENDENCE_OR_HOLDOUT',
          }
        : {}),
    });
    result = await replayPilot(replayManifest, {
      budget: gate!,
      ...(profile.id === CORE_OFFLINE_PROFILE
        ? {
            expectedRefusals: [
              {
                caseId: 'current-lifecycle-negative' as const,
                turn: 1 as const,
                httpStatus: 401 as const,
                code: 'membership_revoked' as const,
              },
            ],
          }
        : {}),
      ...(profile.id === CORE_UNION_PROFILE ||
      profile.id === CORE_OFFLINE_PROFILE
        ? {
            semanticFailure: 'next_independent_dialog' as const,
            assessTurn: ({
              caseId,
              turn,
            }: {
              caseId: string;
              turn: number;
            }) => {
              const assessment = semanticAssessments.get(`${caseId}:${turn}`);
              if (!assessment)
                throw new Error('core_semantic_observation_missing');
              // The closed synthetic 48 corpus audits every actual follow-up.
              // Legacy prose-equality checks are retained separately; they may
              // not skip a later correction whose selector/source facts changed.
              // Transport, unknown response and business-effect guards still stop.
              return profile.id === CORE_OFFLINE_PROFILE
                ? { status: 'ungraded' as const, failedCheckIds: [] }
                : assessment;
            },
          }
        : {}),
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
        actualRepliesByCase.set(caseId, priorReplies);
        return Promise.resolve({
          chat: async (body) => {
            turn++;
            modelCallsForTurn = 0;
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
            if (
              profile.id === CORE_OFFLINE_PROFILE &&
              caseId === 'current-occupancy-correction' &&
              turn === 2
            ) {
              source.occupied = true;
              const changed = await db.prisma.appointment.updateMany({
                where: { tenantId: source.tenant.id },
                data: { status: 'confirmed' },
              });
              expect(changed.count).toBe(1);
              source.sourceRefs.push({
                owner: 'CRM_CURRENT_AVAILABILITY',
                id: source.branchId,
                status: 'OCCUPIED_BEFORE_CORRECTION_TURN_LOCAL_FIXTURE_ONLY',
              });
              append('offline-source-transitions.jsonl', {
                caseId,
                turn,
                changedAppointments: changed.count,
                occupied: true,
                qualification:
                  'CONTROLLED_FIXTURE_TRANSITION_BEFORE_TURN_EFFECT_BASELINE_NOT_ASSISTANT_WRITE',
              });
            }
            const expectedRevoked =
              profile.id === CORE_OFFLINE_PROFILE &&
              caseId === 'current-lifecycle-negative' &&
              turn === 1;
            const historyBefore = expectedRevoked
              ? await db.prisma.widgetTimelineTurn.findMany({
                  where: { tenantId: source.tenant.id },
                  orderBy: { id: 'asc' },
                })
              : null;
            const before = await businessState(source.tenant.id),
              mark = http.recorder.mark(),
              modelBefore = modelCalls,
              wireBefore = serializerCalls,
              brokerBefore = brokerCalls,
              outputBefore = modelOutputResponses,
              sourceBefore = source.reads.length;
            let response: { status: number; body: unknown };
            try {
              response = await request(http.app.getHttpServer())
                .post('/api/ai/chat')
                .set('Authorization', `Bearer ${source.token}`)
                .send({
                  ...body,
                  audience:
                    profile.id === CORE_OFFLINE_PROFILE
                      ? coreFullOfflineRecipe(caseId).audience
                      : item.audience,
                })
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
                modelOutputResponses: modelOutputResponses - outputBefore,
                modelCoverage: modelCoverageSince(
                  modelBefore,
                  brokerBefore,
                  outputBefore,
                ),
                noRetry: true,
              };
              responses.push(failed);
              append('actual-http-turns.jsonl', failed);
              throw new Error('core_http_transport_unresolved');
            }
            const answer = response.body as Wire;
            const errorCodes =
              response.status >= 400
                ? {
                    code: safeDiagnosticCode(answer.error?.code),
                    detail: safeDiagnosticCode(answer.error?.detail),
                  }
                : null;
            append('http-response-journal.jsonl', {
              caseId,
              turn,
              requestId: body.requestId,
              httpStatus: response.status,
              actualReply: answer.reply ?? null,
              errorCodes,
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
              errorCodes,
              source: answer.source ?? null,
              grounding: answer.grounding ?? null,
              actionStatus: answer.action?.status ?? null,
              readReceiptPresent: answer.resolution?.receipt != null,
              toolsUsed: answer.tools_used ?? [],
              coordination: answer.coordination
                ? {
                    scope: answer.coordination.scope,
                    state: answer.coordination.state,
                    current: answer.coordination.current,
                    replayed: answer.coordination.replayed,
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
              modelOutputResponses: modelOutputResponses - outputBefore,
              modelCoverage: modelCoverageSince(
                modelBefore,
                brokerBefore,
                outputBefore,
              ),
              sourceReads: source.reads.slice(sourceBefore),
              ...(profile.id === CORE_OFFLINE_PROFILE
                ? {
                    fixtureBoundary:
                      coreFullOfflineRecipe(caseId).expectedBoundary,
                    fixtureBindingSha256: hash(source.item),
                    currentOccupiedSource: source.occupied,
                  }
                : {}),
              businessHashUnchanged: before === after,
              businessWrites: writes,
            };
            let offlineAudit: Record<string, unknown> | null = null;
            if (profile.id === CORE_OFFLINE_PROFILE) {
              const current = await currentOfflineSourceFacts(source);
              const completion = offlineCompletions.get(`${caseId}:${turn}`);
              offlineAudit = {
                qualification: 'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY',
                ...(completion ?? {
                  semanticPlans: [],
                  toolResults: [],
                  completeness: {
                    status: expectedRevoked ? 'complete' : 'incomplete',
                    reasons: expectedRevoked ? [] : ['completion_not_observed'],
                  },
                }),
                actor: {
                  ...current.actor,
                  ...(completion?.actor ?? {}),
                  membershipActive: current.actor.membershipActive,
                },
                selection: offlineSelection(
                  answer.resolution,
                  source.tenant.id,
                ),
                sourceFacts: {
                  ...auditRecord(
                    sanitizeCoreFullOfflineAuditValue(
                      current.facts,
                      source.privateValues,
                    ),
                  ),
                  company: projectCoreFullOfflinePublicCompany(
                    current.facts.company,
                    source.privateValues,
                  ),
                },
                coordination: observation.coordination,
                recommendation: observation.recommendation,
                financialEvidenceCount: observation.financialEvidenceCount,
                persistedCoordination: observation.persistedCoordination,
                effects: {
                  businessHashUnchanged: before === after,
                  businessWrites: writes,
                  forbidden: [...forbidden],
                  outboundCalls: forbidden.filter((value) =>
                    /notification|outbound|send|delivery/i.test(value),
                  ).length,
                },
                expectedRefusal: null,
                historyUnchanged: null,
              };
              Object.assign(observation, { audit: offlineAudit });
              if (!expectedRevoked)
                append('offline-turn-audit.jsonl', observation);
            }
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
            if (expectedRevoked) {
              expect(response.status).toBe(401);
              expect(response.body).toMatchObject({
                statusCode: 401,
                message: 'Active tenant membership is required',
              });
              expect(answer.reply).toBeUndefined();
              expect(answer.user_turn).toBeUndefined();
              expect(observation.modelCalls).toBe(0);
              expect(observation.serializerCalls).toBe(0);
              expect(observation.brokerCalls).toBe(0);
              expect(observation.modelOutputResponses).toBe(0);
              expect(observation.sourceReads).toEqual([]);
              expect(observation.persistedCoordination).toEqual([]);
              expect(approvals).toEqual([]);
              expect(
                await db.prisma.widgetTimelineTurn.findMany({
                  where: { tenantId: source.tenant.id },
                  orderBy: { id: 'asc' },
                }),
              ).toEqual(historyBefore);
              expect(priorReplies).toEqual([]);
              const expectedRefusal = {
                httpStatus: 401,
                code: 'membership_revoked',
              } as const;
              Object.assign(observation, {
                expectedRefusal,
                historyUnchanged: true,
              });
              if (offlineAudit) {
                Object.assign(offlineAudit, {
                  expectedRefusal,
                  historyUnchanged: true,
                });
                append('offline-turn-audit.jsonl', observation);
              }
              append('offline-expected-refusals.jsonl', {
                caseId,
                turn,
                expectedRefusal,
                historyUnchanged: true,
                noBusinessEffects: true,
              });
              return { expectedRefusal };
            }
            expect(response.status).toBe(201);
            expect(typeof answer.reply).toBe('string');
            expect(typeof answer.user_turn?.conversationId).toBe('string');
            if (caseId === 'followup-admin-general-chat') {
              if (!(
                profile.id === CORE_UNION_PROFILE ||
                profile.id === CORE_OFFLINE_PROFILE
              )) {
                expect(modelCalls - modelBefore).toBeGreaterThan(0);
                expect(modelOutputResponses - outputBefore).toBeGreaterThan(0);
              }
              expect(answer.tools_used).toEqual([]);
              expect(observation.sourceReads).toEqual([]);
              expect(answer.action).toBeNull();
              if (!(
                profile.id === CORE_UNION_PROFILE ||
                profile.id === CORE_OFFLINE_PROFILE
              )) {
                expect(answer.grounding?.status).toBe('not_required');
                expect(answer.reply).not.toContain(
                  'недоступен для вашей текущей роли',
                );
              }
              expect(approvals).toEqual([]);
              const inputObservations = modelObservations.filter(
                (entry) => entry.caseId === caseId && entry.turn === turn,
              );
              if (!(
                profile.id === CORE_UNION_PROFILE ||
                profile.id === CORE_OFFLINE_PROFILE
              ))
                expect(inputObservations.length).toBeGreaterThan(0);
              for (const entry of inputObservations) {
                expect(entry.role).toBe(UserRole.ADMINISTRATOR);
                expect(entry.sourceProjections).toEqual([]);
                expect(
                  (entry.actualTools as string[]).some((name) =>
                    name.startsWith('analytics.'),
                  ),
                ).toBe(false);
              }
            }
            // Offline regression expectations apply only to explicitly bound
            // recorded outputs/synthetic continuations, never grade live model
            // choices against a substituted gold answer.
            if (
              recordedReplay &&
              caseId === 'core-client-create-followup' &&
              turn === 2
            ) {
              expect(answer.action).toBeNull();
              expect(approvals).toEqual([]);
              expect(answer.reply).toContain('в 17:00 (Europe/Moscow)');
              expect(answer.reply).not.toContain('Выберите подходящее время');
              expect(answer.resolution).toMatchObject({
                matched: true,
                receipt: {
                  envelope: {
                    kind: 'TIME_SLOT_SELECTOR',
                    body: { prompt: { rendered: 'Проверьте выбранное время' } },
                  },
                },
              });
            }
            if (
              recordedReplay &&
              replayFixture !== 'actual-20261009' &&
              caseId === 'core-owner-compound-clarification' &&
              turn === 2
            ) {
              expect(answer.action).toBeNull();
              expect(answer.coordination).toMatchObject({
                scope: 'explicit_business_occupancy',
                // The composite includes historical C7 measurements even when
                // this explicit request freshly qualifies the window below.
                current: false,
                replayed: false,
                revision: 1,
              });
              expect(observation.financialEvidenceCount).toBeGreaterThan(0);
              expect(observation.recommendation).toMatchObject({
                outcome: 'AVAILABLE',
                noSideEffects: true,
                executionAuthority: false,
              });
              expect(observation.recommendation!.evidenceCount).toBeGreaterThan(
                0,
              );
              const matchingRuns = observation.persistedCoordination.filter(
                (run) => run.runHash === observation.coordination?.runHash,
              );
              expect(matchingRuns).toHaveLength(1);
              const persisted = matchingRuns[0];
              expect(persisted?.currentRevision).toBe(1);
              expect(
                persisted?.revisions.filter(
                  (revision) =>
                    revision.version === 1 &&
                    revision.revisionHash ===
                      observation.coordination?.revisionHash &&
                    (revision.evidenceCount ?? 0) > 0,
                ),
              ).toHaveLength(1);
            }
            if (
              replayFixture === 'actual-20261009' &&
              caseId === 'core-owner-compound-clarification' &&
              turn === 2
            ) {
              // The archive contains no acceptance act. It must neither repeat
              // the original question nor fabricate acceptance/domain reads.
              expect(answer.reply).not.toBe(priorReplies.at(-1));
              expect(answer.source).toBe('safe_fallback');
              expect(answer.action).toBeNull();
              expect(answer.tools_used).toEqual([]);
              expect(observation.coordination).toBeNull();
              expect(observation.financialEvidenceCount).toBe(0);
              expect(observation.recommendation).toBeNull();
              expect(observation.sourceReads).toEqual([]);
              expect(observation.persistedCoordination).toEqual([]);
              expect(observation.readReceiptPresent).toBe(false);
              expect(approvals).toEqual([]);
            }
            if (
              replayFixture !== undefined &&
              caseId === 'core-owner-compound-clarification' &&
              turn === 2
            ) {
              const observedInput = modelObservations.find(
                (row) => row.caseId === caseId && row.turn === turn,
              );
              expect(observedInput?.pendingOwnerReviewPresent).toBe(true);
              expect(observedInput?.pendingOwnerReviewTaskIntents).toEqual([
                'analytics.business_summary',
                'schedule.review_cancellation_windows',
                'analytics.recommendations',
              ]);
            }
            if (
              replayFixture !== undefined &&
              caseId === 'core-admin-private-data-refusal'
            ) {
              expect(modelOutputResponses - outputBefore).toBe(1);
              expect(answer.reply).toBe(
                'Секреты подключения и личные контакты я не раскрываю. Могу проверить состояние интеграции без этих данных. Проверить подключение?',
              );
              expect(answer.action).toBeNull();
              expect(answer.tools_used).toEqual([]);
              expect(observation.sourceReads).toEqual([]);
              expect(observation.coordination).toBeNull();
              expect(observation.persistedCoordination).toEqual([]);
              expect(observation.readReceiptPresent).toBe(false);
              expect(approvals).toEqual([]);
            }
            if (
              profile.id === CORE_UNION_PROFILE ||
              profile.id === CORE_OFFLINE_PROFILE
            ) {
              const inputRows = modelObservations.filter(
                (row) => row.caseId === caseId && row.turn === turn,
              );
              const saved = observation.persistedCoordination.some(
                (run) =>
                  run.runHash === observation.coordination?.runHash &&
                  run.currentRevision === observation.coordination?.revision &&
                  run.revisions.some(
                    (revision) =>
                      revision.version === observation.coordination?.revision &&
                      revision.revisionHash ===
                        observation.coordination?.revisionHash &&
                      (revision.evidenceCount ?? 0) > 0,
                  ),
              );
              const assessment: SemanticAssessment =
                mode === 'dry' &&
                !(
                  profile.id === CORE_OFFLINE_PROFILE &&
                  Object.hasOwn(CORE_CASE_TURNS, caseId)
                )
                  ? semanticFailureFixture === 'first-client-turn' &&
                    caseId === 'core-client-create-followup' &&
                    turn === 1
                    ? {
                        status: 'fail',
                        failedCheckIds: ['synthetic_dry_assertion_failure'],
                      }
                    : { status: 'ungraded', failedCheckIds: [] }
                  : assessCoreTurn({
                      caseId,
                      turn,
                      reply: answer.reply!,
                      previousReply: priorReplies.at(-1) ?? null,
                      modelResponses: modelOutputResponses - outputBefore,
                      currentSelection: hasExactReviewedSlot(
                        answer.resolution,
                        {
                          start: source.startsAt,
                          timezone: 'Europe/Moscow',
                          tenantId: source.tenant.id,
                        },
                      ),
                      ownerEvidenceBounded:
                        observation.coordination?.scope ===
                          'explicit_business_occupancy' &&
                        saved &&
                        observation.financialEvidenceCount > 0 &&
                        observation.recommendation?.noSideEffects === true &&
                        observation.recommendation.executionAuthority ===
                          false &&
                        observation.recommendation.evidenceCount > 0,
                      ownerContextRestored: inputRows.some(
                        (row) =>
                          row.pendingOwnerReviewPresent === true &&
                          row.restoredClarificationMatchesActualReply === true,
                      ),
                      groundingStatus: answer.grounding?.status ?? null,
                      readCount: observation.sourceReads.length,
                      toolCount: Array.isArray(answer.tools_used)
                        ? answer.tools_used.length
                        : 0,
                    });
              semanticAssessments.set(`${caseId}:${turn}`, assessment);
            }
            priorReplies.push(answer.reply!);
            return {
              reply: answer.reply!,
              userTurn: { conversationId: answer.user_turn!.conversationId! },
              evidence: {
                modelCalls: modelCalls - modelBefore,
                brokerCalls: brokerCalls - brokerBefore,
                modelOutputResponses: modelOutputResponses - outputBefore,
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
    if (profile.id === CORE_OFFLINE_PROFILE) {
      expect(result.executionStatus).toBe('completed');
      expect([
        'replayed_ungraded',
        'completed_with_semantic_failures',
      ]).toContain(result.status);
      expect(result.coverage).toMatchObject({
        plannedTurns: 81,
        expectedRefusals: 1,
        unresolvedTurns: 0,
        unexecutedTurns: 0,
      });
      expect(
        result.coverage.validResponses +
          1 +
          result.coverage.skippedDependentTurns,
      ).toBe(81);
      expect(result.coverage.attemptedTurns).toBe(
        result.coverage.validResponses + 1,
      );
      expect(
        result.coverage.semanticPasses +
          result.coverage.semanticFailures +
          result.coverage.semanticUngraded,
      ).toBe(result.coverage.validResponses);
      expect(result.outcomes).toHaveLength(48);
      expect(responses).toHaveLength(result.coverage.attemptedTurns);
      expect(responses.filter((row) => row.httpStatus === 401)).toHaveLength(1);
      expect(
        responses.filter(
          (row) =>
            row.httpStatus === 201 && typeof row.actualReply === 'string',
        ),
      ).toHaveLength(result.coverage.validResponses);
    } else if (profile.id === CORE_UNION_PROFILE) {
      expect(result.executionStatus).toBe('completed');
      expect([
        'replayed_ungraded',
        'completed_with_semantic_failures',
      ]).toContain(result.status);
      expect(
        result.coverage.validResponses + result.coverage.skippedDependentTurns,
      ).toBe(profile.userTurns);
      expect(
        result.coverage.unresolvedTurns + result.coverage.unexecutedTurns,
      ).toBe(0);
      expect(responses).toHaveLength(result.coverage.attemptedTurns);
      expect(result.outcomes).toHaveLength(profile.dialogs);
      if (semanticFailureFixture === 'first-client-turn') {
        expect(result.coverage).toMatchObject({
          attemptedTurns: 17,
          validResponses: 17,
          skippedDependentTurns: 1,
          semanticFailures: 1,
        });
        expect(result.outcomes[0]).toMatchObject({
          outcome: 'semantic_fail',
          failedCheckIds: ['synthetic_dry_assertion_failure'],
        });
      }
    } else {
      expect(result.status).toBe('replayed_ungraded');
      expect(responses).toHaveLength(profile.userTurns);
    }
    expect(forbidden).toEqual([]);
    expect(gate!.stats).toMatchObject({
      dialogs: profile.dialogs,
      turns: result.coverage.attemptedTurns,
      halted: false,
    });
    if (replayFixture !== undefined) {
      expect(modelOutputResponses).toBe(5);
      expect(brokerCalls).toBe(5);
      expect(gate!.stats.attempts).toBe(5);
    }
    // Live choices remain ungraded. The explicit offline replay additionally
    // verifies regression outcomes against canonical source/persisted state.
  });
});
