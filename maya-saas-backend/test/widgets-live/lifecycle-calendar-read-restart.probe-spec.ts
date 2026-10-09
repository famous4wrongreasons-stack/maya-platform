// Finite supplemental proof: exact frozen initial questions, synthetic source facts,
// actual HTTP/auth/planner/C9/A22/C7/C8. No source, clock, policy or permission mock.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import type {
  AiCoreModelDecision,
  AiCoreModelInput,
} from '../../src/ai-tools/ai-core.types';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { C8ReadService } from '../../src/valuation/c8.read';
import { C9Handles } from '../../src/orchestration/c9.context';
import { C9Orchestrator } from '../../src/orchestration/c9.orchestrator';
import { c9Hash } from '../../src/orchestration/c9.contract';
import {
  c9Capability,
  C9_REGISTRY_HASH,
} from '../../src/orchestration/c9.registry';
import {
  chatReplyId,
  decodeChatCompletion,
  isChatReply,
} from '../../src/widgets/stores/chat-reply-codec';

const stage = process.env.JEST_LIFECYCLE_CALENDAR_STAGE;
const receiptPath = process.env.JEST_LIFECYCLE_CALENDAR_RECEIPT;
const output = process.env.JEST_LIFECYCLE_CALENDAR_OUTPUT;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receiptPath && output,
  'Use the owned lifecycle-calendar prepare/restart/resume driver',
);
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_lifecyclecalendar_[a-f0-9]+$/,
);
const DATASET_SHA =
  '9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b';
const QUESTIONS = [
  {
    id: 'mt-retention_drill_down-0',
    text: 'Кто не был больше двух месяцев',
    rowHash: 'f972654f752ab1b2c0fb6b50bdeee1c0a218de179db869188dea0c8a9f088ed8',
  },
  {
    id: 'mt-retention_drill_down-15',
    text: 'Без догадок: кто не был больше двух месяцев. Ответь только после проверки данных.',
    rowHash: '996398aab2a28b631db6c09e26b216050fe88ab03302f41c88962151afd13a65',
  },
] as const;
const PERIOD = 'more_than_two_months';
const PRIVATE = 'SYNTHETIC_PRIVATE_VISIT_NOTE_NOT_FOR_MODEL';
const sha = (text: string | Buffer) =>
  createHash('sha256').update(text).digest('hex');
const hash = (value: unknown) => sha(JSON.stringify(value));
function object(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}
function rows(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}
function string(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  revoked: UserFixture;
  branchId: string;
  serviceId: string;
};
type Rule = {
  ruleKey: string;
  serviceScope: string[];
  elapsed: { unit: 'day' | 'calendar_month'; count: number };
  comparison: 'gt' | 'gte';
  evidence: 'proven_attendance';
  minimumCoverage: 'PARTIAL';
};
type Published = {
  id: string;
  clientId: string;
  hash: string;
  t0: string;
  ruleKey: string;
};
type ChatInput = {
  surface: 'web';
  requestId: string;
  conversationId?: string;
  messages: [{ role: 'user'; content: string }];
};
type Result = {
  status: number;
  body: Record<string, unknown>;
  modelDelta: number;
  discoveryDelta: number;
};
type Positive = {
  input: ChatInput;
  runId: string;
  revisionId: string;
  workId: string;
  graphHash: string;
  reply: string;
  originalCaseId: string;
  history: {
    assistantTurnId: string;
    parentId: string;
    completionHash: string;
    reply: string;
  };
};
type Saved = {
  contract: 'maya.lifecycle-calendar-private-restart/1';
  database: string;
  port: string;
  pid: number;
  pgStarted: string;
  sourceHead: string;
  sourceDigest: string;
  main: Salon;
  late: Salon;
  foreign: Salon;
  mainSource: Published;
  lateSource: Published;
  decoys: Published[];
  positives: Positive[];
  conversationId: string;
  business: Record<string, string>;
  privateIds: string[];
};
type Gate = {
  arrived(): void;
  entered: Promise<void>;
  release(): void;
  wait(): Promise<void>;
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
          () => reject(new Error('bounded_snapshot_delivery_timeout')),
          15000,
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
async function arrived(g: Gate) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      g.entered,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('snapshot_boundary_not_reached')),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Exact two-calendar-month lifecycle [supplemental actual HTTP/PG restart]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let model: jest.SpyInstance, transport: jest.SpyInstance;
  const privateIds = new Set<string>();
  const discoveries: Array<{
    tenantHash: string;
    period: string;
    ids: string[];
  }> = [];
  const snapshots: string[] = [];
  const requests: Array<{
    turnId: string;
    intentHash: string;
    period: string;
  }> = [];
  const gates: Gate[] = [];
  let lateFault:
    | {
        tenantId: string;
        sourceId: string;
        gate: Gate;
        settledReads: number;
        used: boolean;
        actualHash?: string;
        deliveredHash?: string;
      }
    | undefined;
  const cases: Record<string, unknown>[] = [];
  const controlledA22Indices = new Set<number>();
  const controlledA22Transitions: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    contract: 'maya.lifecycle-calendar-http-proof/1',
    stage,
    status: 'incomplete',
    sourceHead: process.env.JEST_LIFECYCLE_CALENDAR_SOURCE_HEAD,
    sourceDigest: process.env.JEST_LIFECYCLE_CALENDAR_SOURCE_DIGEST,
    datasetSha256: DATASET_SHA,
    planning: 'SCRIPTED_JSON_THROUGH_ACTUAL_PLANNER_VALIDATOR',
    source: 'SYNTHETIC_INTERNAL_APPOINTMENTS_CANONICAL_A22_C7_C8',
    realModelAcceptance: false,
    realProviderAcceptance: false,
    original81Reclassification: false,
    fullCohortAcceptance: false,
    calendarBoundaryEqualityAcceptance: false,
    controlledA22Transitions,
    cases,
    qualifications: [
      'Only the two frozen initial questions are exercised; regularity and ranking follow-ups remain separate.',
      'HTTP uses genuine server T0 and immutable published C7/C8; exact equality, month-end and DST arithmetic belong to separate owner unit tests.',
      'Setup and adversarial A22 transitions are explicit fixture actions, never authority from chat.',
      'At most three evaluations are exposed, without client identities, audience or contact authority.',
      'Restart means distinct Node process and PostgreSQL postmaster; no crashed worker or natural expiry recovery claim.',
    ],
  };
  beforeAll(async () => {
    mkdirSync(output, { recursive: true });
    assert.match(string(report.sourceHead), /^[a-f0-9]{40}$/);
    assert.match(string(report.sourceDigest), /^[a-f0-9]{64}$/);
    const datasetBytes = readFileSync(
      path.resolve(
        __dirname,
        '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
      ),
    );
    expect(sha(datasetBytes)).toBe(DATASET_SHA);
    const dataset = object(JSON.parse(datasetBytes.toString('utf8')));
    for (const expected of QUESTIONS) {
      const matches = rows(dataset.cases)
        .map(object)
        .filter((r) => r.id === expected.id);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        role: 'owner',
        sourceRowSha256: expected.rowHash,
      });
      expect(rows(matches[0].userTurns)[0]).toBe(expected.text);
    }
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    transport = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('No external transport admitted');
    });
    const c8 = http.app.get(C8ReadService);
    const actualList = c8.listDormancy.bind(c8),
      actualSnapshot = c8.snapshot.bind(c8);
    jest.spyOn(c8, 'listDormancy').mockImplementation(async (...args) => {
      const value = await actualList(...args);
      expect(args[2]).toBe(PERIOD);
      discoveries.push({
        tenantHash: hash(args[0]),
        period: args[2],
        ids: value.items.map((r) => r.id),
      });
      return value;
    });
    jest.spyOn(c8, 'snapshot').mockImplementation(async (...args) => {
      const value = await actualSnapshot(...args);
      snapshots.push(hash([args[0], args[2]]));
      const fault = lateFault;
      if (
        fault &&
        !fault.used &&
        args[0] === fault.tenantId &&
        args[2] === fault.sourceId
      ) {
        const work = await db.prisma.c9WorkReceipt.findFirst({
          where: {
            tenantId: fault.tenantId,
            domain: 'CLIENT_LIFECYCLE',
            state: 'SETTLED',
          },
        });
        // contextProjection first checks the reference with a generic snapshot,
        // then reads a second snapshot whose facts it delivers. Pause that second
        // real read; the later exact snapshotDormancy fence must reject drift.
        if (work && ++fault.settledReads === 2) {
          expect(value).toMatchObject({
            id: fault.sourceId,
            current: true,
            available: true,
          });
          fault.used = true;
          fault.actualHash = hash(value);
          fault.gate.arrived();
          await fault.gate.wait();
          fault.deliveredHash = hash(value);
          expect(fault.deliveredHash).toBe(fault.actualHash);
        }
      }
      return value;
    });
    const c9 = http.app.get(C9Orchestrator),
      actualCheck = c9.checkClientReturn.bind(c9);
    jest
      .spyOn(c9, 'checkClientReturn')
      .mockImplementation((turn, requested) => {
        expect(requested).toEqual({ period: PERIOD });
        requests.push({
          turnId: turn.turn.turnId,
          intentHash: turn.intentHash,
          period: PERIOD,
        });
        return actualCheck(turn, requested);
      });
    const owner = http.app.get(AiCoreModelService);
    model = jest
      .spyOn(owner, 'decide')
      .mockImplementation((input: AiCoreModelInput) => {
        const text = input.messages
          .filter((m) => m.role === 'user')
          .at(-1)?.content;
        expect(QUESTIONS.some((q) => q.text === text)).toBe(true);
        expect(input.messages.every((m) => m.role === 'user')).toBe(true);
        expect(input.toolResults).toEqual([]);
        assertPrivateAbsent(input);
        const parser = owner as unknown as {
          validatePlanningResponse(
            value: string,
            source: AiCoreModelInput,
          ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
        };
        const parsed = parser.validatePlanningResponse(
          JSON.stringify({
            semantic_plan: {
              contract: 'maya-ci/1',
              parent_request: text,
              language: 'ru',
              dialogue_act: 'request',
              tasks: [
                {
                  id: 'calendar_dormancy',
                  intent: 'clients.dormant_list',
                  entities_json: JSON.stringify({ period: PERIOD }),
                  depends_on: [],
                  confidence: 0.99,
                  requires_clarification: false,
                  clarification_question: null,
                },
              ],
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
          model: 'SCRIPTED_SYNTHETIC_CALENDAR_LIFECYCLE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved).toMatchObject({
        contract: 'maya.lifecycle-calendar-private-restart/1',
        database: database.database,
        port: database.port,
        sourceHead: report.sourceHead,
        sourceDigest: report.sourceDigest,
      });
      expect(process.pid).not.toBe(saved.pid);
      expect(await pgStarted()).not.toBe(saved.pgStarted);
      saved.privateIds.forEach((id) => privateIds.add(id));
      report.restart = {
        nodePidChanged: true,
        postgresPostmasterChanged: true,
        sourceBindingExact: true,
      };
    }
  });
  afterAll(async () => {
    gates.forEach((g) => g.dispose());
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(
        {
          ...report,
          modelCalls: model?.mock.calls.length ?? 0,
          realModelCalls: 0,
          externalFetchCalls: transport?.mock.calls.length ?? 0,
          discoveries: discoveries.map((d) => ({ ...d, ids: d.ids.map(hash) })),
          snapshotReads: snapshots,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  function assertPrivateAbsent(value: unknown) {
    const text = JSON.stringify(value);
    expect(text).not.toContain(PRIVATE);
    for (const id of privateIds) expect(text).not.toContain(id);
  }
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
  }
  const login = (s: Salon, user = s.owner) =>
    http.login(s.tenant.slug, user.email, user.password);
  async function salon(label: string): Promise<Salon> {
    const tenant = await fx.tenant(
      'Lifecycle calendar ' + label,
      CalendarSource.INTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER),
      revoked = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'analytics.business',
      'customers.core',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'America/New_York' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic calendar branch',
        timezone: 'America/New_York',
      },
    });
    const service = await db.prisma.internalService.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic scoped service',
        price: 100,
        durationMinutes: 60,
      },
    });
    return {
      tenant,
      owner,
      revoked,
      branchId: branch.id,
      serviceId: service.id,
    };
  }
  function rule(
    ruleKey: string,
    unit: 'day' | 'calendar_month' = 'calendar_month',
    count = 2,
    comparison: 'gt' | 'gte' = 'gt',
    serviceScope: string[] = [],
  ): Rule {
    return {
      ruleKey,
      serviceScope,
      elapsed: { unit, count },
      comparison,
      evidence: 'proven_attendance',
      minimumCoverage: 'PARTIAL',
    };
  }
  async function a22Census() {
    // This database is fresh and owned by this finite proof. Global censuses
    // detect an unrelated execution even if it were written during the POST.
    const options = { orderBy: { id: 'asc' as const }, take: 129 };
    const [executions, attempts, mutations, revisions] = await Promise.all([
      db.prisma.actionExecution.findMany(options),
      db.prisma.actionAttempt.findMany(options),
      db.prisma.actionTargetMutation.findMany(options),
      db.prisma.tenantBusinessConfigurationRevision.findMany(options),
    ]);
    for (const values of [executions, attempts, mutations, revisions])
      expect(values.length).toBeLessThanOrEqual(128);
    return { executions, attempts, mutations, revisions };
  }
  function oneAdded<T extends { id: string }>(before: T[], after: T[]): T {
    expect(after).toHaveLength(before.length + 1);
    const previousIds = new Set(before.map((row) => row.id));
    const added = after.filter((row) => !previousIds.has(row.id));
    expect(added).toHaveLength(1);
    expect(after.filter((row) => previousIds.has(row.id))).toEqual(before);
    return added[0];
  }
  async function configure(s: Salon, rules: Rule[]) {
    const token = await login(s);
    const before = await request(http.app.getHttpServer())
      .get('/api/governed-settings/tenant/c8_valuation')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);
    const state = object(before.body);
    const censusBefore = await a22Census();
    const intervalStart = http.recorder.mark();
    const result = await request(http.app.getHttpServer())
      .post('/api/governed-settings/tenant')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', randomUUID())
      .send({
        confirmed: true,
        namespace: 'c8_valuation',
        expectedRevision: state.revision,
        previousRevisionId: state.previousRevisionId,
        content: {
          version: 1,
          valueMeasures: [],
          predictionTargets: [],
          dormancyRules: rules,
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
      });
    const intervalEnd = http.recorder.mark();
    expect(result.status).toBe(201);
    const current =
      await db.prisma.tenantBusinessConfigurationRevision.findFirstOrThrow({
        where: { tenantId: s.tenant.id, namespace: 'c8_valuation' },
        orderBy: { revision: 'desc' },
      });
    expect(current.revision).toBe(Number(state.revision) + 1);
    assert.ok(current.actionExecutionId);
    const censusAfter = await a22Census();
    const execution = oneAdded(censusBefore.executions, censusAfter.executions);
    const attempt = oneAdded(censusBefore.attempts, censusAfter.attempts);
    const mutation = oneAdded(censusBefore.mutations, censusAfter.mutations);
    const revision = oneAdded(censusBefore.revisions, censusAfter.revisions);
    const member = await db.prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: s.owner.id, tenantId: s.tenant.id } },
    });
    expect(member).toMatchObject({
      status: 'active',
      role: UserRole.TENANT_OWNER,
    });
    expect(execution).toMatchObject({
      id: current.actionExecutionId,
      tenantId: s.tenant.id,
      actorUserId: s.owner.id,
      sourceType: 'authenticated_request',
      actionClass: 'update_tenant_business_configuration',
      capability: 'package5.settings.tenant-business.execute.v1',
      targetKind: 'setting',
      targetRef: 'tenant-config:c8_valuation',
      state: 'SUCCEEDED',
      dryRun: false,
      executionAttemptCount: 1,
    });
    expect(attempt).toMatchObject({
      tenantId: s.tenant.id,
      actionExecutionId: execution.id,
      attemptNumber: 1,
      kind: 'EXECUTION',
      state: 'SUCCEEDED',
    });
    expect(mutation).toMatchObject({
      tenantId: s.tenant.id,
      actionExecutionId: execution.id,
      targetKind: 'setting',
      targetRef: 'tenant-config:c8_valuation',
      mutationKind: 'tenant_business_configuration',
      targetGeneration: Number(state.revision),
    });
    expect(revision).toEqual(current);
    expect(revision).toMatchObject({
      tenantId: s.tenant.id,
      namespace: 'c8_valuation',
      actorUserId: s.owner.id,
      actorMembershipId: member.id,
      actionExecutionId: execution.id,
      previousRevisionId: state.previousRevisionId,
      revision: Number(state.revision) + 1,
    });
    const governedWrites = http.recorder.operations
      .slice(intervalStart, intervalEnd)
      .flatMap((operation, offset) =>
        isBusinessWrite(operation)
          ? [{ index: intervalStart + offset, operation }]
          : [],
      );
    // HTTP runs in another async context: scope:null is expected. Admit only
    // these exact indexed operations AFTER their independent canonical DB join.
    const operationKeys = governedWrites
      .map(({ operation }) => `${operation.model}:${operation.operation}`)
      .sort();
    expect(operationKeys).toEqual(
      [
        'ActionExecution:create',
        'ActionExecution:update',
        'ActionExecution:update',
        'ActionAttempt:create',
        'ActionAttempt:update',
        'ActionTargetMutation:create',
        'TenantBusinessConfigurationRevision:create',
      ].sort(),
    );
    expect(controlledA22Transitions.length).toBeLessThan(8);
    for (const { index } of governedWrites) {
      expect(controlledA22Indices.has(index)).toBe(false);
      controlledA22Indices.add(index);
    }
    controlledA22Transitions.push({
      phase:
        stage === 'resume'
          ? 'EXPLICIT_POLICY_TRANSITION'
          : 'CANONICAL_FIXTURE_SETUP',
      interval: { startInclusive: intervalStart, endExclusive: intervalEnd },
      operationIndices: governedWrites.map(({ index }) => index),
      operationKeys,
      tenantHash: hash(s.tenant.id),
      actorHash: hash(s.owner.id),
      executionHash: hash(execution.id),
      attemptHash: hash(attempt.id),
      mutationHash: hash(mutation.id),
      revisionHash: hash(revision.id),
      namespace: revision.namespace,
      revision: revision.revision,
      contentHash: revision.contentHash,
      exactNewRowCounts: {
        executions: 1,
        attempts: 1,
        mutations: 1,
        revisions: 1,
      },
      priorRowsUnchanged: true,
    });
    return {
      revision: current.revision,
      contentHash: current.contentHash,
      executionHash: hash(current.actionExecutionId),
    };
  }
  async function publish(
    s: Salon,
    key: string,
    branchScoped = false,
    serviceScoped = false,
  ): Promise<Published> {
    const client = await db.prisma.client.create({
      data: { tenantId: s.tenant.id },
    });
    privateIds.add(client.id);
    // Far from the threshold: real server clock remains untouched. Boundary arithmetic is separately tested.
    const start = new Date(Date.now() - 120 * 86400000),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
      data: {
        tenantId: s.tenant.id,
        mayaClientId: client.id,
        branchId: s.branchId,
        source: 'internal',
        staffExternalId: 'synthetic-' + client.id,
        serviceIds: serviceScoped ? [s.serviceId] : [],
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        attendance: 'arrived',
        status: 'confirmed',
        totalPriceKopecks: 12345,
        currency: 'RUB',
        notes: PRIVATE,
      },
    });
    const response = await request(http.app.getHttpServer())
      .post('/api/analytics/valuations/compute')
      .set('Authorization', `Bearer ${await login(s)}`)
      .send({
        subjectKind: 'client',
        subjectId: client.id,
        capability: 'dormancy/' + key,
        branchIds: branchScoped ? [s.branchId] : [],
      });
    expect(response.status).toBe(201);
    const body = object(response.body);
    expect(body).toMatchObject({
      current: true,
      available: true,
      kind: 'POLICY_SIGNAL',
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
    });
    const source = await db.prisma.c8ResultRevision.findUniqueOrThrow({
      where: { id: string(body.id) },
    });
    expect(source).toMatchObject({
      tenantId: s.tenant.id,
      state: 'PUBLISHED',
      basis: 'proven_attendance_policy',
      ruleKey: 'c8.dormancy/' + key,
      ruleVersion: 1,
      subjectId: client.id,
      timezone: 'America/New_York',
    });
    expect(source.scopeJson).toMatchObject({
      branchIds: branchScoped ? [s.branchId] : [],
      serviceScope: serviceScoped ? [s.serviceId] : [],
    });
    expect(source.periodTo.getTime()).toBeLessThanOrEqual(source.t0.getTime());
    expect(source.t0.getTime()).toBeLessThanOrEqual(
      source.admittedAt.getTime(),
    );
    expect(source.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(body.asOf).toBe(source.t0.toISOString());
    const refs = rows(source.evidenceRefsJson)
      .map(object)
      .filter((r) => r.owner === 'MeasurementRevision');
    assert.ok(refs.length > 0 && refs.length <= 10);
    for (const ref of refs) {
      const c7 = await db.prisma.measurementRevision.findFirstOrThrow({
        where: { tenantId: s.tenant.id, id: string(ref.id) },
      });
      expect(c7.state).toBe('PUBLISHED');
      expect(c7.snapshotHash).toBe(ref.revisionOrStateHash);
      expect(c7.expiresAt.getTime()).toBeGreaterThanOrEqual(
        source.expiresAt.getTime(),
      );
    }
    return {
      id: source.id,
      clientId: client.id,
      hash: hash(source),
      t0: source.t0.toISOString(),
      ruleKey: source.ruleKey,
    };
  }
  const input = (index: 0 | 1 = 0, conversationId?: string): ChatInput => ({
    surface: 'web',
    requestId: randomUUID(),
    ...(conversationId ? { conversationId } : {}),
    messages: [{ role: 'user', content: QUESTIONS[index].text }],
  });
  async function chat(token: string, requestInput: ChatInput): Promise<Result> {
    const before = {
      model: model.mock.calls.length,
      discovery: discoveries.length,
    };
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(requestInput)
      .timeout({ response: 25000, deadline: 30000 });
    const body = object(response.body);
    assertPrivateAbsent(body);
    const result = {
      status: response.status,
      body,
      modelDelta: model.mock.calls.length - before.model,
      discoveryDelta: discoveries.length - before.discovery,
    };
    expect(result.modelDelta).toBeLessThanOrEqual(1);
    return result;
  }
  function reply(
    result: Result,
    outcome: string,
    findings: number,
    replayed = false,
  ) {
    expect(result.status).toBe(201);
    const body = result.body,
      coordination = object(body.coordination),
      recommendation = object(body.recommendation);
    expect(coordination).toMatchObject({
      scope: 'explicit_lifecycle',
      state: 'PROPOSED',
      revision: 1,
      current: !replayed && findings > 0,
      replayed,
    });
    expect(recommendation).toMatchObject({
      contract: 'maya.c9-lifecycle-response/1',
      outcome,
      noSideEffects: true,
      executionAuthority: false,
      canContact: false,
    });
    expect(rows(object(recommendation.agent).findings)).toHaveLength(findings);
    expect(rows(object(recommendation.evidence).sourceHandles)).toHaveLength(
      findings,
    );
    expect(body.action).toBeNull();
    expect(body.tools_used).toEqual([]);
    expect(body.resolution).toBeUndefined();
    const text = string(body.reply);
    expect(text).toContain('не список уникальных клиентов');
    expect(text).toContain('Охват всей базы не подтверждён');
    expect(text).toContain('разрешения на контакт нет');
    if (findings) {
      expect(text).toMatch(/2 календарных месяца/);
      expect(text).toContain('строго после');
      expect(text).toContain('America/New_York');
      expect(text).toContain('неполные');
    } else expect(text).not.toContain('Оценка 1:');
    if (replayed) expect(text).toContain('Сохранённая версия');
    return coordination;
  }
  async function graph(
    s: Salon,
    body: Record<string, unknown>,
    expected: Published[],
  ) {
    const coordination = object(body.coordination),
      runId = string(coordination.run_id);
    const run = await db.prisma.c9Run.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(run).toMatchObject({
      tenantId: s.tenant.id,
      principalJson: { userId: s.owner.id },
      currentRevision: 1,
    });
    const revisions = await db.prisma.c9StrategyRevision.findMany({
      where: { tenantId: s.tenant.id, runId },
      orderBy: { revision: 'asc' },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].id).toBe(coordination.revision_id);
    expect(revisions[0].objectiveJson).toMatchObject({
      key: 'c9.client_return',
    });
    const refs = rows(revisions[0].evidenceRefsJson).map(object);
    expect(refs.map((r) => r.id).sort()).toEqual(
      expected.map((r) => r.id).sort(),
    );
    const works = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: s.tenant.id, runId },
      orderBy: { id: 'asc' },
    });
    expect(works).toHaveLength(1);
    const work = works[0];
    const requested = requests.findLast(
      (r) => r.turnId === object(body.user_turn).turnId,
    );
    assert.ok(requested);
    const effectiveIntentHash = c9Hash('lifecycle-request-scope/1', [
      requested.intentHash,
      { period: PERIOD },
    ]);
    expect(run.requestIntentJson).toMatchObject({
      objectiveKey: 'c9.conversation_lifecycle:' + effectiveIntentHash,
    });
    const cap = c9Capability('clients.dormant.list', 'CLIENT_LIFECYCLE');
    const reservation = {
      contract: 'maya.c9-reservation/1',
      toolCalls: 1,
      modelCalls: 0,
      domain: 'CLIENT_LIFECYCLE',
      inputTokens: 0,
      outputTokens: 0,
      costMicros: '0',
      priceHash: null,
      zeroCostEvidenceRef: `local:${cap.toolOrInterface}:no-provider-charge`,
      stepRef: null,
    };
    expect(work.reservationJson).toEqual(reservation);
    expect(work).toMatchObject({
      kind: 'TOOL_READ',
      taskKey: cap.capabilityKey,
      revisionId: null,
      registryHash: C9_REGISTRY_HASH,
    });
    expect(work.inputHash).toBe(
      c9Hash('call-intent/1', [
        'CLIENT_LIFECYCLE',
        'TOOL_READ',
        cap.capabilityKey,
        c9Hash('lifecycle-request/1', [effectiveIntentHash]),
        [],
        reservation,
        null,
        C9_REGISTRY_HASH,
      ]),
    );
    expect(work).toMatchObject({
      domain: 'CLIENT_LIFECYCLE',
      state: 'SETTLED',
      resultJson: {
        contract: 'maya.c9-lifecycle-receipt/1',
        revisionId: revisions[0].id,
        request: { period: PERIOD },
      },
    });
    const recommendation = object(body.recommendation),
      exposed = object(recommendation.evidence);
    expect(exposed.workReceiptId).toBe(work.id);
    expect(rows(exposed.sourceHandles).sort()).toEqual(
      refs.map((ref) => new C9Handles(runId).add(ref)).sort(),
    );
    for (const expectedSource of expected) {
      const source = await db.prisma.c8ResultRevision.findFirstOrThrow({
        where: { tenantId: s.tenant.id, id: expectedSource.id },
      });
      expect(hash(source)).toBe(expectedSource.hash);
      const ref = refs.find((r) => r.id === source.id);
      assert.ok(ref);
      expect(ref).toMatchObject({
        sourceType: 'C8ResultRevision',
        tenantId: s.tenant.id,
        subjectKind: 'client',
        subjectRef: expectedSource.clientId,
        identityHash: source.identityHash,
        inputHash: source.intentHash,
        observedAt: source.admittedAt.toISOString(),
        validUntil: source.expiresAt.toISOString(),
        retentionUntil: source.expiresAt.toISOString(),
        status: 'VERIFIED',
        completeness: 'PARTIAL',
      });
      expect(revisions[0].validUntil.getTime()).toBeLessThanOrEqual(
        source.expiresAt.getTime(),
      );
      expect(revisions[0].retentionUntil.getTime()).toBeLessThanOrEqual(
        source.expiresAt.getTime(),
      );
    }
    // Subject-linked refs belong only to the source-capped revision. The work
    // receipt's independent retention is not shortened by refs it never stores.
    expect(work.inputEvidenceRefsJson).toEqual([]);
    expect(Object.keys(object(work.resultJson)).sort()).toEqual(
      [
        'contract',
        'revisionId',
        'sourceDigest',
        'asOf',
        'configured',
        'hasMore',
        'withheld',
        'request',
      ].sort(),
    );
    assertPrivateAbsent(work.resultJson);
    return {
      runId,
      revisionId: revisions[0].id,
      workId: work.id,
      graphHash: hash({ run, revisions, works }),
    };
  }
  async function completion(
    s: Salon,
    response: Record<string, unknown>,
    expectedAssistantId?: string,
  ) {
    const turn = object(response.user_turn),
      now = new Date();
    const parent = await db.prisma.widgetTimelineTurn.findFirstOrThrow({
      where: {
        id: string(turn.turnId),
        tenantId: s.tenant.id,
        conversationId: string(turn.conversationId),
        role: 'user',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: now },
      },
    });
    const candidates = await db.prisma.widgetTimelineTurn.findMany({
      where: {
        ...(expectedAssistantId ? { id: expectedAssistantId } : {}),
        tenantId: s.tenant.id,
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
      const decoded = decodeChatCompletion(db.encryption, stored.textContent);
      return decoded.parentId === parent.id && decoded.text === response.reply
        ? [{ stored, decoded }]
        : [];
    });
    expect(matches).toHaveLength(1);
    const { stored, decoded } = matches[0];
    expect(stored.id).toBe(
      chatReplyId(s.tenant.id, `${parent.id}:${decoded.completionHash}`),
    );
    assertPrivateAbsent(decoded);
    return {
      assistantTurnId: stored.id,
      parentId: parent.id,
      completionHash: decoded.completionHash,
      reply: decoded.text,
    };
  }
  async function rawGraph(s: Salon, runId: string) {
    return hash({
      run: await db.prisma.c9Run.findUniqueOrThrow({ where: { id: runId } }),
      revisions: await db.prisma.c9StrategyRevision.findMany({
        where: { tenantId: s.tenant.id, runId },
        orderBy: { revision: 'asc' },
      }),
      works: await db.prisma.c9WorkReceipt.findMany({
        where: { tenantId: s.tenant.id, runId },
        orderBy: { id: 'asc' },
      }),
    });
  }
  async function business(s: Salon) {
    const where = { tenantId: s.tenant.id },
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
  function isBusinessWrite(op: (typeof http.recorder.operations)[number]) {
    const names =
      /^(Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory|Measurement|C8|TenantBusinessConfigurationRevision)/;
    return (
      op.write &&
      (op.model
        ? names.test(op.model)
        : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Client|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|Operational|ExpenseReminder|Inventory|Measurement|C8|TenantBusinessConfigurationRevision)/i.test(
            op.sql ?? '',
          ))
    );
  }
  function noEffects(mark: number) {
    expect(
      http.recorder.operations
        .slice(mark)
        .filter(
          (op, offset) =>
            isBusinessWrite(op) && !controlledA22Indices.has(mark + offset),
        ),
    ).toEqual([]);
    expect(transport.mock.calls).toHaveLength(0);
  }
  function observe(result: Result) {
    return {
      status: result.status,
      reply: result.body.reply ?? null,
      replyHash: hash(result.body.reply ?? null),
      outcome: object(result.body.recommendation).outcome,
      modelCalls: result.modelDelta,
      discoveryCalls: result.discoveryDelta,
    };
  }
  if (stage === 'prepare')
    it('publishes canonical sources, selects exact rule beyond newer decoys, and saves immutable proposals', async () => {
      const main = await salon('matching'),
        day = await salon('day60'),
        gte = await salon('inclusive'),
        scope = await salon('restricted'),
        missing = await salon('unpublished'),
        foreign = await salon('unconfigured'),
        late = await salon('late-policy');
      await configure(main, [
        rule('exact'),
        rule('day60', 'day', 60),
        rule('inclusive', 'calendar_month', 2, 'gte'),
        rule('services', 'calendar_month', 2, 'gt', [main.serviceId]),
      ]);
      const mainSource = await publish(main, 'exact');
      const decoys = [
        await publish(main, 'day60'),
        await publish(main, 'inclusive'),
        await publish(main, 'exact', true),
        await publish(main, 'services', false, true),
      ];
      const newest = await db.prisma.c8ResultRevision.findMany({
        where: { tenantId: main.tenant.id },
        orderBy: [{ admittedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      });
      expect(newest).toHaveLength(3);
      expect(newest.map((r) => r.id)).not.toContain(mainSource.id);
      await configure(day, [rule('day60', 'day', 60)]);
      await publish(day, 'day60');
      await configure(gte, [rule('inclusive', 'calendar_month', 2, 'gte')]);
      await publish(gte, 'inclusive');
      await configure(scope, [
        rule('exact'),
        rule('services', 'calendar_month', 2, 'gt', [scope.serviceId]),
      ]);
      await publish(scope, 'exact', true);
      await publish(scope, 'services', false, true);
      await configure(missing, [rule('exact')]);
      await configure(late, [rule('exact')]);
      const lateSource = await publish(late, 'exact');
      const salons = [main, day, gte, scope, missing, foreign, late];
      const baseline: Record<string, string> = {};
      for (const s of salons) baseline[s.tenant.id] = await business(s);
      const mark = http.recorder.mark(),
        token = await login(main),
        positives: Positive[] = [];
      let conversationId: string | undefined;
      for (const index of [0, 1] as const) {
        const requestInput = input(index, conversationId),
          result = await chat(token, requestInput);
        reply(result, 'PARTIAL', 1);
        expect(result.modelDelta).toBe(1);
        expect(result.discoveryDelta).toBe(1);
        expect(discoveries.at(-1)?.ids).toEqual([mainSource.id]);
        conversationId = string(object(result.body.user_turn).conversationId);
        const joined = await graph(main, result.body, [mainSource]);
        const replay = await chat(token, requestInput);
        reply(replay, 'HISTORICAL', 1, true);
        expect(replay.discoveryDelta).toBe(0);
        expect(await rawGraph(main, joined.runId)).toBe(joined.graphHash);
        const historyCompletion = await completion(main, replay.body);
        positives.push({
          input: requestInput,
          ...joined,
          reply: string(result.body.reply),
          originalCaseId: QUESTIONS[index].id,
          history: historyCompletion,
        });
        cases.push({
          case: QUESTIONS[index].id,
          utteranceHash: sha(QUESTIONS[index].text),
          supplementalOnly: true,
          exactCalendarRequest: true,
          matchedBeyondNewestThree: true,
          ...observe(result),
          replay: observe(replay),
          historyAssistantHash: hash(historyCompletion.assistantTurnId),
          historyCompletionHash: historyCompletion.completionHash,
          graphHash: joined.graphHash,
          sourceHash: mainSource.hash,
          t0: mainSource.t0,
        });
      }
      assert.ok(conversationId);
      for (const [s, name, outcome] of [
        [day, 'day60_not_calendar', 'UNAVAILABLE'],
        [gte, 'gte_not_strictly_more', 'UNAVAILABLE'],
        [scope, 'branch_or_service_scope_not_whole_business', 'UNAVAILABLE'],
        [missing, 'configured_without_published_result', 'UNAVAILABLE'],
        [foreign, 'policy_absent', 'UNCONFIGURED'],
      ] as const) {
        const result = await chat(await login(s), input());
        reply(result, outcome, 0);
        await graph(s, result.body, []);
        expect(result.discoveryDelta).toBe(outcome === 'UNCONFIGURED' ? 0 : 1);
        cases.push({ case: name, ...observe(result), noSubstitutedRule: true });
      }
      const foreignToken = await login(foreign),
        before = { models: model.mock.calls.length, reads: discoveries.length };
      const foreignRun = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + positives[0].runId)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignRun.status).toBe(400);
      expect(foreignRun.body).toMatchObject({ message: 'c9_run_authority' });
      const foreignSource = await request(http.app.getHttpServer())
        .get('/api/analytics/valuations/' + mainSource.id)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignSource.status).toBe(404);
      expect(foreignSource.body).toMatchObject({
        message: 'c8_result_unavailable',
      });
      expect(model.mock.calls.length).toBe(before.models);
      expect(discoveries).toHaveLength(before.reads);
      cases.push({
        case: 'foreign_tenant',
        runStatus: foreignRun.status,
        sourceStatus: foreignSource.status,
        noModelOrDiscovery: true,
      });
      for (const s of salons)
        expect(await business(s)).toBe(baseline[s.tenant.id]);
      noEffects(mark);
      saved = {
        contract: 'maya.lifecycle-calendar-private-restart/1',
        database: database.database,
        port: database.port,
        pid: process.pid,
        pgStarted: await pgStarted(),
        sourceHead: string(report.sourceHead),
        sourceDigest: string(report.sourceDigest),
        main,
        late,
        foreign,
        mainSource,
        lateSource,
        decoys,
        positives,
        conversationId,
        business: baseline,
        privateIds: [...privateIds],
      };
      writeFileSync(receiptPath, JSON.stringify(saved), {
        flag: 'wx',
        mode: 0o600,
      });
      report.status = 'passed';
    }, 120000);
  if (stage === 'resume')
    it('restores history and exact receipts, then rejects revoked/current-policy and late-policy evidence', async () => {
      const token = await login(saved.main),
        mark = http.recorder.mark();
      expect(await business(saved.main)).toBe(
        saved.business[saved.main.tenant.id],
      );
      const history = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${token}`);
      expect(history.status).toBe(200);
      const historyBody = object(history.body);
      expect(historyBody.conversationId).toBe(saved.conversationId);
      for (const positive of saved.positives) {
        expect(
          rows(historyBody.turns)
            .map(object)
            .some(
              (r) =>
                r.role === 'assistant' &&
                r.id === positive.history.assistantTurnId &&
                r.text === positive.history.reply,
            ),
        ).toBe(true);
        expect(await rawGraph(saved.main, positive.runId)).toBe(
          positive.graphHash,
        );
        const replay = await chat(token, positive.input);
        reply(replay, 'HISTORICAL', 1, true);
        expect(replay.discoveryDelta).toBe(0);
        expect(
          await completion(
            saved.main,
            replay.body,
            positive.history.assistantTurnId,
          ),
        ).toEqual(positive.history);
        expect(object(replay.body.coordination)).toMatchObject({
          run_id: positive.runId,
          revision_id: positive.revisionId,
        });
        expect(
          (await graph(saved.main, replay.body, [saved.mainSource])).graphHash,
        ).toBe(positive.graphHash);
        cases.push({
          case: 'restart_replay_' + positive.originalCaseId,
          ...observe(replay),
          exactImmutableGraph: true,
          historyRestored: true,
        });
      }
      assertPrivateAbsent(history.body);
      const revokedToken = await login(saved.main, saved.main.revoked);
      await db.prisma.membership.update({
        where: {
          userId_tenantId: {
            userId: saved.main.revoked.id,
            tenantId: saved.main.tenant.id,
          },
        },
        data: { status: 'suspended' },
      });
      const count = {
        model: model.mock.calls.length,
        reads: discoveries.length,
        snapshots: snapshots.length,
      };
      const revoked = await chat(revokedToken, input());
      expect(revoked.status).toBe(401);
      expect(revoked.body).toMatchObject({
        message: 'Active tenant membership is required',
      });
      expect(revoked.body.recommendation).toBeUndefined();
      expect(model.mock.calls.length).toBe(count.model);
      expect(discoveries).toHaveLength(count.reads);
      expect(snapshots).toHaveLength(count.snapshots);
      cases.push({
        case: 'current_membership_revoked',
        status: revoked.status,
        zeroModelAndSourceReads: true,
      });
      noEffects(mark);
      expect(await business(saved.main)).toBe(
        saved.business[saved.main.tenant.id],
      );
      const previous = await configure(saved.main, [
          rule('replacement_day60', 'day', 60),
        ]),
        afterTransition = await business(saved.main);
      const stale = await chat(token, saved.positives[0].input);
      reply(stale, 'STALE', 0, true);
      expect(stale.discoveryDelta).toBe(0);
      expect(await rawGraph(saved.main, saved.positives[0].runId)).toBe(
        saved.positives[0].graphHash,
      );
      const fresh = await chat(token, input(0, saved.conversationId));
      reply(fresh, 'UNAVAILABLE', 0);
      await graph(saved.main, fresh.body, []);
      expect(await business(saved.main)).toBe(afterTransition);
      cases.push({
        case: 'policy_revision_changed',
        transition: previous,
        savedReplay: observe(stale),
        fresh: observe(fresh),
        immutableSourceAndVersion: true,
      });
      const g = gate();
      gates.push(g);
      lateFault = {
        tenantId: saved.late.tenant.id,
        sourceId: saved.lateSource.id,
        gate: g,
        settledReads: 0,
        used: false,
      };
      const lateToken = await login(saved.late),
        pending = chat(lateToken, input());
      let transition: unknown,
        workHash: string | undefined,
        sourceHash: string | undefined,
        lateBusinessAfterTransition: string | undefined,
        refused: Result;
      try {
        await arrived(g);
        const work = await db.prisma.c9WorkReceipt.findFirstOrThrow({
          where: {
            tenantId: saved.late.tenant.id,
            domain: 'CLIENT_LIFECYCLE',
            state: 'SETTLED',
          },
        });
        workHash = hash(work);
        sourceHash = hash(
          await db.prisma.c8ResultRevision.findUniqueOrThrow({
            where: { id: saved.lateSource.id },
          }),
        );
        transition = await configure(saved.late, [
          rule('replacement_day60', 'day', 60),
        ]);
        lateBusinessAfterTransition = await business(saved.late);
      } finally {
        g.release();
        refused = await pending;
      }
      expect(lateFault.used).toBe(true);
      expect(lateFault.actualHash).toBe(lateFault.deliveredHash);
      expect(lateFault.settledReads).toBe(2);
      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ message: 'c8_result_unavailable' });
      expect(refused.body.recommendation).toBeUndefined();
      expect(refused.body.coordination).toBeUndefined();
      expect(JSON.stringify(refused.body)).not.toMatch(
        /Оценка 1:|условие давности визитов/,
      );
      expect(
        hash(
          await db.prisma.c9WorkReceipt.findFirstOrThrow({
            where: {
              tenantId: saved.late.tenant.id,
              domain: 'CLIENT_LIFECYCLE',
            },
          }),
        ),
      ).toBe(workHash);
      expect(
        hash(
          await db.prisma.c8ResultRevision.findUniqueOrThrow({
            where: { id: saved.lateSource.id },
          }),
        ),
      ).toBe(sourceHash);
      cases.push({
        case: 'late_policy_after_actual_snapshot',
        status: refused.status,
        error: refused.body.message,
        transition,
        genuineReadDeliveredUnchanged: true,
        finalFence: 'CURRENT_C8_SNAPSHOT_DORMANCY_REFUSED',
        noProseOrFindings: true,
        settledReceiptUnchanged: true,
      });
      expect(await business(saved.late)).toBe(lateBusinessAfterTransition);
      expect(controlledA22Transitions).toHaveLength(2);
      noEffects(mark);
      report.status = 'passed';
    }, 120000);
});
