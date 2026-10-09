import { ServiceUnavailableException } from '@nestjs/common';
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
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import {
  chatReplyId,
  decodeChatCompletion,
  decodeChatReply,
} from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
// Bootstrap imports remain ahead of existing business-content owner cycles.
import { BusinessContentService } from '../../src/business-content/business-content.service';

const stage = process.env.JEST_REVIEWS_PERIOD_STAGE;
const receipt = process.env.JEST_REVIEWS_PERIOD_RECEIPT;
const output = process.env.JEST_REVIEWS_PERIOD_OUTPUT;
const sourceHead = process.env.JEST_REVIEWS_PERIOD_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_REVIEWS_PERIOD_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use the finite reviews-period READ proof runner',
);
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
const database = assertProofDatabase();
assert.match(
  database.database,
  /^maya_widget_gate_proof_reviewsperiod_[a-f0-9]+$/,
);
assert.equal(
  new URL(database.connectionString).username,
  'reviews_period_proof',
);
const outputDirectory: string = output,
  receiptFile: string = receipt;
const BRANCH_NAME = 'Набережная';
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const TENANT_TIMEZONE = 'Pacific/Honolulu';
const PRIVATE_FIXTURE = [
  'PRIVATE_RAW_REVIEW_TEXT',
  'PRIVATE_CUSTOMER_NAME',
  '+79990001122',
  'private-review@example.invalid',
];
const REVIEW_TEXT = PRIVATE_FIXTURE.join(' ') + ' мастер вежливый, ожидание';
const SCRIPTED_DENIAL = 'Отзывы бизнеса недоступны вашей роли.';
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
type ReviewFact = { rating: number; at: string; branchId: string; id: string };
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  restricted: UserFixture;
  revoked: UserFixture;
  clientActor: UserFixture;
  staffActor: UserFixture;
  branchId: string;
  otherBranchId: string;
  facts: ReviewFact[];
};
type Window = {
  from: string;
  toExclusive: string;
  month: string;
  timezone: string;
};
function lastMonth(): Window {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRANCH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(fields.find((x) => x.type === 'year')?.value),
    month = Number(fields.find((x) => x.type === 'month')?.value);
  assert.ok(Number.isInteger(year) && month >= 1 && month <= 12);
  // This finite fixture deliberately uses Kiritimati (UTC+14, no DST), not
  // the production period resolver as its boundary oracle.
  const fromLocal = new Date(Date.UTC(year, month - 2, 1));
  return {
    from: new Date(fromLocal.getTime() - 14 * 3600000).toISOString(),
    toExclusive: new Date(
      Date.UTC(year, month - 1, 1) - 14 * 3600000,
    ).toISOString(),
    month: fromLocal.toISOString().slice(0, 7),
    timezone: BRANCH_TIMEZONE,
  };
}
type Scenario = {
  text: string;
  period?: string;
  rating?: string | number;
  branch?: string;
  followup?: boolean;
  label?: string;
};
const EXACT: Scenario = {
  text: 'Покажи отзывы с оценкой 2 за прошлый месяц в филиале Набережная',
  period: 'last_month',
  rating: 2,
  branch: BRANCH_NAME,
};
const ALL: Scenario = {
  text: 'Покажи отзывы со всеми оценками за прошлый месяц в филиале Набережная',
  period: 'last_month',
  rating: 'all',
  branch: BRANCH_NAME,
};
type Saved = {
  contract: 'synthetic-reviews-period-read-proof/1';
  database: string;
  sourceHead: string;
  sourceBindingsDigest: string;
  pid: number;
  pgStarted: string;
  window: Window;
  salons: Salon[];
  requestId: string;
  conversationId: string;
  firstReply: string;
  firstEvidenceHash: string;
  runId: string;
  graph: string;
  business: string;
};

describe('reviews exact calendar HTTP/auth/parser/C9 READ [SCRIPTED MODEL, SYNTHETIC CANONICAL FACTS]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  const salons: Salon[] = [];
  let window: Window = lastMonth();
  let active: Scenario | undefined;
  let afterRead: (() => Promise<void>) | undefined;
  let unavailableNext = false,
    modelCalls = 0;
  const unexpected: string[] = [],
    checkpoints: Record<string, unknown>[] = [],
    sourceReceipts: Record<string, unknown>[] = [],
    clarificationReceipts: Record<string, unknown>[] = [],
    deniedPlans: Record<string, unknown>[] = [];
  const registryReads: Array<{
    tenantHash: string;
    optionsHash: string;
    resultHash: string | null;
    unavailable: boolean;
  }> = [];
  let lastPlan: AiCoreModelDecision['semanticPlan'] | undefined;
  const currentPlan = () => lastPlan;
  const report: Record<string, unknown> = {
    contract: 'synthetic-reviews-period-read-observations/1',
    stage,
    sourceHead,
    sourceBindingsDigest,
    planning: 'SCRIPTED_JSON_THROUGH_ACTUAL_PLANNER_VALIDATOR',
    plannerPlanMeaning:
      'INITIAL_VALIDATED_PARSER_PLAN_NOT_FINAL_PERSISTED_CONTEXT',
    realHttpAuth: true,
    realC9AndRuntime: true,
    realCanonicalReviewOwner: true,
    source: 'SYNTHETIC_FACTS_INGESTED_THROUGH_CANONICAL_HTTP_OWNER',
    realProviderCalls: 0,
    realModelAcceptance: false,
    browserAcceptance: false,
    full48Reclassification: false,
    c9ReadsPerQualifiedRequest: 1,
    registryReadCountMeaning: 'OWNER_LIST_REVIEWS_INVOCATIONS_NOT_SQL_COUNT',
    noBusinessWritesClaim:
      'OBSERVED_SCOPED_FAMILIES_AFTER_CANONICAL_FIXTURE_SETUP',
  };
  async function pgStarted() {
    return (
      await db.prisma.$queryRaw<
        Array<{ value: string }>
      >`SELECT pg_postmaster_start_time()::text AS value`
    )[0].value;
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
      reviews: await db.prisma.businessReview.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      staff: await db.prisma.staff.findMany({ where, orderBy: { id: 'asc' } }),
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
      'BusinessReview|InternalService|InternalProviderService|Staff|Appointment|Opportunity|AgentTask|DomainEvent|Action|AiApproval|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder|Client|BrandingSettings|TenantBusinessConfigurationRevision';
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

  async function seed(): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Reviews period synthetic',
      CalendarSource.INTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER),
      restricted = await fx.user(tenant, UserRole.MANAGER),
      revoked = await fx.user(tenant, UserRole.TENANT_OWNER),
      clientActor = await fx.user(tenant, UserRole.CLIENT),
      staffActor = await fx.user(tenant, UserRole.STAFF);
    for (const feature of [
      'reviews.core',
      'ai.consultant',
      'ai.admin',
      'ai.owner',
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
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { userId: staffActor.id, tenantId: tenant.id },
      },
      data: { branchId: branch.id },
    });
    await db.prisma.staff.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        userId: staffActor.id,
        encryptedDisplayName: db.encryption.encrypt('Служебный мастер'),
        active: true,
      },
    });
    const salon = {
      tenant,
      owner,
      restricted,
      revoked,
      clientActor,
      staffActor,
      branchId: branch.id,
      otherBranchId: other.id,
      facts: [],
    };
    salons.push(salon);
    return salon;
  }
  const login = (salon: Salon, user = salon.owner) =>
    http.login(salon.tenant.slug, user.email, user.password);
  async function ingest(
    salon: Salon,
    token: string,
    rating: number,
    at: string,
    branchId = salon.branchId,
  ) {
    const result = await request(http.app.getHttpServer())
      .post('/api/business-content/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'synthetic_registry',
        externalRef: randomUUID(),
        rating,
        occurredAt: at,
        branchId,
        text: REVIEW_TEXT,
      });
    expect(result.status).toBe(201);
    const id = object(result.body).id;
    assert.ok(typeof id === 'string');
    const row = await db.prisma.businessReview.findUniqueOrThrow({
      where: { id },
    });
    expect(row.tenantId).toBe(salon.tenant.id);
    assert.ok(row.encryptedText);
    expect(db.encryption.decrypt(row.encryptedText)).toBe(REVIEW_TEXT);
    for (const privateValue of PRIVATE_FIXTURE)
      expect(row.encryptedText).not.toContain(privateValue);
    salon.facts.push({ id, rating, at, branchId });
  }
  function assertPrivateAbsent(value: unknown) {
    const text = JSON.stringify(value);
    for (const privateValue of PRIVATE_FIXTURE)
      expect(text.includes(privateValue)).toBe(false);
  }
  async function chat(
    token: string,
    scenario: Scenario,
    requestId: string = randomUUID(),
    conversationId?: string,
  ) {
    active = scenario;
    lastPlan = undefined;
    const beforeModels = modelCalls,
      beforeReads = registryReads.length;
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
      registryReads: registryReads.length - beforeReads,
      reply: typeof body.reply === 'string' ? body.reply : null,
      grounding: object(body.grounding).status ?? null,
      plannerPlan:
        currentPlan()?.tasks.map((t) => ({
          intent: t.intent,
          permission: t.permission.status,
          entities: t.entities,
          clarification: t.requires_clarification,
        })) ?? null,
      errorCode: object(body.error).code ?? null,
      errorMessageHash:
        body.message === undefined ? null : digest(body.message),
    });
    expect(modelCalls - beforeModels).toBeLessThanOrEqual(1);
    assertPrivateAbsent(body);
    return {
      status: result.status,
      body,
      modelCalls: modelCalls - beforeModels,
    };
  }
  beforeAll(async () => {
    for (const name of [
      'YCLIENTS_PARTNER_TOKEN',
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
    ])
      assert.equal(process.env[name], undefined);
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptFile, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-reviews-period-read-proof/1');
      assert.equal(saved.database, database.database);
      assert.equal(saved.sourceHead, sourceHead);
      assert.equal(saved.sourceBindingsDigest, sourceBindingsDigest);
      assert.notEqual(saved.pid, process.pid);
      assert.deepEqual(
        saved.window,
        window,
        'Resume must remain in the same actual business calendar month',
      );
      window = saved.window;
      salons.push(...saved.salons);
    }
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      unexpected.push('external_transport_attempt');
      return Promise.reject(new Error('reviews_period_no_external_transport'));
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    http.app.get(ConfigService).set('AI_CORE_MAX_TOOL_STEPS', '1');
    const content = http.app.get(BusinessContentService);
    const actualRead = content.listReviews.bind(content);
    jest.spyOn(content, 'listReviews').mockImplementation(async (...args) => {
      const row = {
        tenantHash: digest(args[0]),
        optionsHash: digest(args[1]),
        resultHash: null as string | null,
        unavailable: false,
      };
      registryReads.push(row);
      if (unavailableNext) {
        unavailableNext = false;
        row.unavailable = true;
        // Explicit failure injection, never a synthetic successful/empty read.
        throw new ServiceUnavailableException(
          'review_calendar_source_unavailable',
        );
      }
      const result = await actualRead(...args);
      row.resultHash = digest(result);
      const hook = afterRead;
      afterRead = undefined;
      await hook?.();
      return result;
    });
    const model = http.app.get(AiCoreModelService);
    const parser = model as unknown as {
      validatePlanningResponse(
        output: string,
        input: AiCoreModelInput,
      ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
    };
    jest.spyOn(model, 'decide').mockImplementation((input) => {
      if (!active || input.toolResults.length) {
        unexpected.push('unscripted_or_second_model_call');
        throw new Error('reviews_period_unexpected_model_call');
      }
      assertPrivateAbsent(input);
      modelCalls++;
      const allowed = input.tools.some(
        (tool) => tool.name === 'reviews.list.read',
      );
      const planned = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: active.followup ? 'clarification_answer' : 'request',
            tasks: [
              {
                id: 'reviews',
                intent: 'reviews.list_recent',
                entities: {
                  ...(active.period === undefined
                    ? {}
                    : { period: active.period }),
                  ...(active.rating === undefined
                    ? {}
                    : { rating: active.rating }),
                  ...(active.branch === undefined
                    ? {}
                    : { branch: active.branch }),
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
          tool_call: allowed
            ? {
                name: 'reviews.list.read',
                arguments: {
                  period: 'last_month',
                  rating: 5,
                  limit: 50,
                  branch_id: 'untrusted-model-branch',
                },
              }
            : null,
        }),
        input,
      );
      lastPlan = planned.semanticPlan;
      if (!allowed) {
        const task = planned.semanticPlan?.tasks[0];
        assert.ok(task);
        expect(task.permission.status).toBe('denied');
        expect(task.tool.status).toBe('not_available');
        expect(planned.toolCall).toBeNull();
        deniedPlans.push({
          role: input.principalRole,
          intent: task.intent,
          permission: task.permission.status,
          replyOrigin: 'SCRIPTED_DENIAL_PROSE_NOT_LANGUAGE_ACCEPTANCE',
        });
      }
      return Promise.resolve({
        ...planned,
        reply: allowed ? 'UNVERIFIED_PLANNER_TEXT' : SCRIPTED_DENIAL,
        provider: 'deepseek' as const,
        model: 'SCRIPTED_REVIEWS_PERIOD',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  });
  afterAll(async () => {
    Object.assign(report, {
      window,
      registryReads,
      modelCalls,
      unexpected,
      checkpoints,
      sourceReceipts,
      clarificationReceipts,
      deniedPlans,
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
      }
    }
  });
  function assertVerified(answer: {
    status: number;
    body: Record<string, unknown>;
    modelCalls: number;
  }) {
    expect(answer.status).toBe(201);
    expect(answer.body.action).toBeNull();
    expect(answer.body.resolution).toBeUndefined();
    expect(answer.modelCalls).toBe(1);
    expect(object(answer.body.grounding).status).toBe('verified');
    expect(answer.body.tools_used).toEqual([
      expect.objectContaining({
        name: 'reviews.list.read',
        status: 'completed',
      }),
    ]);
    expect(String(answer.body.reply)).not.toContain('UNVERIFIED_PLANNER_TEXT');
    assertPrivateAbsent(answer.body);
  }
  async function assertClarification(
    salon: Salon,
    answer: { status: number; body: Record<string, unknown> },
    beforeReads: number,
  ) {
    expect(answer.status).toBe(201);
    expect(answer.body.action).toBeNull();
    expect(answer.body.resolution).toBeUndefined();
    expect(registryReads).toHaveLength(beforeReads);
    expect(answer.body.tools_used ?? []).toEqual([]);
    expect(String(answer.body.reply)).toMatch(/оцен|рейтинг/i);
    expect(String(answer.body.reply)).not.toContain('UNVERIFIED_PLANNER_TEXT');
    const userTurn = object(answer.body.user_turn);
    assert.ok(typeof userTurn.turnId === 'string');
    assert.ok(typeof userTurn.conversationId === 'string');
    const observedAt = new Date();
    const parent = await db.prisma.widgetTimelineTurn.findFirstOrThrow({
      where: {
        id: userTurn.turnId,
        tenantId: salon.tenant.id,
        conversationId: userTurn.conversationId,
        role: 'user',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: observedAt },
      },
    });
    const candidates = await db.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: salon.tenant.id,
        conversationId: parent.conversationId,
        principalProofHash: parent.principalProofHash,
        role: 'assistant',
        channel: 'pwa',
        turnIndex: { gt: parent.turnIndex },
        erasedAt: null,
        retentionUntil: { gt: observedAt },
      },
      orderBy: { turnIndex: 'desc' },
      take: 3,
    });
    const matching = candidates
      .map((stored) => {
        assert.ok(stored.textContent);
        return {
          stored,
          completion: decodeChatCompletion(db.encryption, stored.textContent),
        };
      })
      .filter(
        ({ completion }) =>
          completion.parentId === parent.id &&
          completion.text === answer.body.reply,
      );
    expect(matching).toHaveLength(1);
    const { stored, completion } = matching[0];
    expect(stored.id).toBe(
      chatReplyId(salon.tenant.id, `${parent.id}:${completion.completionHash}`),
    );
    expect(completion.parentId).toBe(parent.id);
    expect(completion.text).toBe(answer.body.reply);
    const semanticContext = object(completion.semanticContext);
    expect(semanticContext.version).toBe('maya.chat-semantic-context/1');
    const plan = object(semanticContext.plan);
    assert.ok(Array.isArray(plan.tasks));
    expect(plan.tasks).toHaveLength(1);
    const task = object(plan.tasks[0]);
    expect(task.intent).toBe('reviews.list_recent');
    expect(object(task.entities).period).toBe(window.month);
    expect(object(task.entities).branch).toBe(salon.branchId);
    expect(task.requires_clarification).toBe(true);
    const question = `За ${window.month} показать все оценки или отзывы с одной оценкой — 1, 2, 3, 4 или 5?`;
    expect(task.clarification_question).toBe(question);
    expect(completion.text).toBe(question);
    assertPrivateAbsent(completion);
    clarificationReceipts.push({
      tenantHash: digest(salon.tenant.id),
      parentTurnHash: digest(parent.id),
      assistantTurnHash: digest(stored.id),
      completionHash: completion.completionHash,
      semanticContextHash: digest(completion.semanticContext),
      replyHash: digest(completion.text),
      month: window.month,
      branchHash: digest(salon.branchId),
      observation: 'EXACT_PERSISTED_ASSISTANT_COMPLETION_BY_TENANT_AND_PARENT',
    });
    assertPrivateAbsent(answer.body);
  }
  async function evidence(
    salon: Salon,
    response: Record<string, unknown>,
    rating: number | null,
    actor = salon.owner,
  ) {
    const coordination = object(response.coordination);
    expect(coordination.state).toBe('COMPLETED');
    assert.ok(typeof coordination.run_id === 'string');
    const works = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: salon.tenant.id, runId: coordination.run_id },
    });
    expect(works).toHaveLength(1);
    const work = works[0];
    expect(work.taskKey).toBe('reviews.list.read');
    expect(work.kind).toBe('TOOL_READ');
    expect(work.state).toBe('SETTLED');
    const ref = object(work.resultJson);
    expect(ref.sourceType).toBe('AiToolExecution');
    assert.ok(typeof ref.executionId === 'string');
    const execution = await db.prisma.aiToolExecution.findUniqueOrThrow({
      where: { id: ref.executionId },
    });
    expect(execution).toMatchObject({
      tenantId: salon.tenant.id,
      actorUserId: actor.id,
      toolName: 'reviews.list.read',
      status: 'completed',
    });
    assert.ok(execution.encryptedResult);
    const result = object(
      JSON.parse(db.encryption.decrypt(execution.encryptedResult)) as unknown,
    );
    if (stage === 'prepare')
      expect(
        registryReads.some(
          (row) =>
            !row.unavailable &&
            row.tenantHash === digest(salon.tenant.id) &&
            row.resultHash === digest(result),
        ),
      ).toBe(true);
    const scope = object(result.read_scope);
    expect(scope).toMatchObject({
      contract: 'maya.review-registry-query/2',
      from_inclusive: window.from,
      to_exclusive: window.toExclusive,
      timezone: window.timezone,
      month: window.month,
      branch_id: salon.branchId,
      rating_mode: rating === null ? 'all' : 'exact',
      rating_exact: rating,
      scope: 'one_branch',
      order: 'occurred_at_desc',
      limit: 20,
      configuration_status: 'not_observed',
    });
    expect(result.privacy).toBe('review_text_redacted_from_ai');
    expect(result.source).toBe('tenant_review_registry');
    expect(typeof scope.observed_at).toBe('string');
    expect(Number.isFinite(Date.parse(String(scope.observed_at)))).toBe(true);
    const expected = salon.facts
      .filter(
        (fact) =>
          fact.branchId === salon.branchId &&
          fact.at >= window.from &&
          fact.at < window.toExclusive &&
          (rating === null || fact.rating === rating),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
    const reviews = result.reviews;
    assert.ok(Array.isArray(reviews));
    expect(
      reviews.map((value: unknown) => {
        const row = object(value);
        return { rating: row.rating, at: row.occurred_at };
      }),
    ).toEqual(
      expected
        .slice(0, 20)
        .map((fact) => ({ rating: fact.rating, at: fact.at })),
    );
    expect(result.count).toBe(Math.min(expected.length, 20));
    expect(scope.returned_count).toBe(Math.min(expected.length, 20));
    expect(scope.has_more).toBe(expected.length > 20);
    assertPrivateAbsent(result);
    for (const raw of reviews) {
      const row = object(raw);
      expect(Object.keys(row).sort()).toEqual([
        'occurred_at',
        'rating',
        'topics',
      ]);
    }
    const projection = {
      runHash: digest(coordination.run_id),
      workHash: digest(work.id),
      executionHash: digest(execution.id),
      actorHash: digest(actor.id),
      inputHash: execution.inputHash,
      resultHash: digest(result),
      month: window.month,
      timezone: window.timezone,
      fromInclusive: window.from,
      toExclusive: window.toExclusive,
      rating,
      count: reviews.length,
      hasMore: scope.has_more,
      branchHash: digest(salon.branchId),
      reviewRefs: expected.slice(0, 20).map((fact) => digest(fact.id)),
      reviewRefOrigin:
        'CANONICAL_SYNTHETIC_SETUP_MATCHED_BY_UNIQUE_DATE_AND_RATING',
    };
    expect(sourceReceipts.length).toBeLessThan(20);
    sourceReceipts.push(projection);
    return coordination.run_id;
  }
  async function history(
    token: string,
    conversationId: string,
    firstReply: string,
  ) {
    const before = { models: modelCalls, reads: registryReads.length };
    const result = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    const body = object(result.body);
    expect(body.conversationId).toBe(conversationId);
    assert.ok(Array.isArray(body.turns));
    expect(
      body.turns.some((value: unknown) => {
        const turn = object(value);
        return (
          turn.role === 'assistant' &&
          typeof turn.text === 'string' &&
          turn.text.includes(firstReply)
        );
      }),
    ).toBe(true);
    assertPrivateAbsent(body);
    expect(modelCalls).toBe(before.models);
    expect(registryReads).toHaveLength(before.reads);
  }
  it('reads the exact calendar scope without private review text and preserves receipts across restart', async () => {
    if (stage === 'prepare') {
      const a = await seed(),
        b = await seed(),
        empty = await seed();
      const token = await login(a),
        foreignToken = await login(b),
        emptyToken = await login(empty);
      const from = Date.parse(window.from),
        to = Date.parse(window.toExclusive),
        middle = from + 14 * 86400000;
      for (const at of [
        from - 1,
        from,
        from + 12 * 3600000,
        middle,
        to - 1,
        to,
      ])
        await ingest(a, token, 2, new Date(at).toISOString());
      for (const rating of [1, 3, 4, 5])
        await ingest(
          a,
          token,
          rating,
          new Date(middle + rating * 3600000).toISOString(),
        );
      for (let index = 0; index < 22; index++)
        await ingest(
          a,
          token,
          5,
          new Date(middle + (index + 8) * 3600000).toISOString(),
        );
      await ingest(
        a,
        token,
        2,
        new Date(middle + 60 * 3600000).toISOString(),
        a.otherBranchId,
      );
      await ingest(
        b,
        foreignToken,
        2,
        new Date(middle + 61 * 3600000).toISOString(),
      );
      report.fixtureSetup = {
        writer: 'EXISTING_POST_BUSINESS_CONTENT_REVIEWS_CANONICAL_OWNER',
        encryptedRawTextVerified: true,
        branchTimezone: BRANCH_TIMEZONE,
        tenantTimezone: TENANT_TIMEZONE,
        boundaryInstants: [from - 1, from, from + 12 * 3600000, to - 1, to].map(
          (n) => new Date(n).toISOString(),
        ),
        sourceRows: salons.reduce((n, salon) => n + salon.facts.length, 0),
      };
      const mark = http.recorder.mark(),
        before = await business(),
        requestId = randomUUID();
      const first = await chat(token, EXACT, requestId);
      assertVerified(first);
      expect(registryReads).toHaveLength(1);
      const conversationId = object(first.body.user_turn).conversationId;
      assert.ok(typeof conversationId === 'string');
      const ownerChat = (scenario: Scenario) =>
        chat(token, scenario, randomUUID(), conversationId);
      const runId = await evidence(a, first.body, 2),
        firstEvidenceHash = digest(sourceReceipts.at(-1));
      expect(sourceReceipts.at(-1)?.count).toBe(4);
      expect(sourceReceipts.at(-1)?.hasMore).toBe(false);
      const graphBeforeReplay = await graph(a.tenant.id),
        beforeReplay = registryReads.length;
      const replay = await chat(token, EXACT, requestId, conversationId);
      assertVerified(replay);
      expect(replay.body.reply).toContain('Сохранённый результат проверки.');
      expect(await evidence(a, replay.body, 2)).toBe(runId);
      expect(digest(sourceReceipts.at(-1))).toBe(firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(graphBeforeReplay);
      expect(registryReads).toHaveLength(beforeReplay);
      report.prepareReplay = {
        sameRun: true,
        sameSourceReceipt: true,
        registryReadsAdded: 0,
      };

      const beforeAll = registryReads.length;
      const all = await ownerChat(ALL);
      assertVerified(all);
      await evidence(a, all.body, null);
      expect(registryReads.length - beforeAll).toBe(1);
      expect(sourceReceipts.at(-1)?.count).toBe(20);
      expect(sourceReceipts.at(-1)?.hasMore).toBe(true);
      expect(String(all.body.reply)).toMatch(/лимит|остальн|первые/i);
      report.exactAllRatings = {
        halfOpenCalendarScope: true,
        count: 20,
        hasMore: true,
        exhaustiveClaim: false,
      };
      for (const rating of ['low', undefined] as const) {
        const n = registryReads.length;
        const unclear = await ownerChat({
          text:
            rating === 'low'
              ? 'Покажи плохие отзывы за прошлый месяц в филиале Набережная'
              : 'Покажи отзывы за прошлый месяц в филиале Набережная',
          period: 'last_month',
          rating,
          branch: BRANCH_NAME,
        });
        await assertClarification(a, unclear, n);
        // The followup supplies only the new constraint: the model fixture does
        // not echo the previous month or branch as invented fresh input.
        const resolved = await ownerChat({
          text: 'Только с оценкой 2',
          rating: 2,
          followup: true,
        });
        assertVerified(resolved);
        await evidence(a, resolved.body, 2);
        expect(registryReads.length - n).toBe(1);
      }
      report.clarifications = {
        lowNotDefaultedToThree: true,
        missingRatingNotAll: true,
        exactMonthRetained: true,
        ratingOnlyFollowup: true,
      };

      const beforeIncomplete = registryReads.length;
      for (const offset of [1, 2]) {
        const month = new Date(`${window.month}-01T00:00:00.000Z`);
        month.setUTCMonth(month.getUTCMonth() + offset);
        const period = month.toISOString().slice(0, 7);
        const incomplete = await ownerChat({
          text: `Покажи отзывы с оценкой 2 за ${period} в филиале Набережная`,
          period,
          rating: 2,
          branch: BRANCH_NAME,
        });
        expect(incomplete.status).toBe(201);
        expect(object(incomplete.body.grounding).status).toBe('blocked');
        expect(incomplete.body.action).toBeNull();
        expect(incomplete.body.tools_used ?? []).toEqual([]);
        expect(String(incomplete.body.reply)).not.toMatch(
          /отзывы не найдены|получено отзывов: 0/i,
        );
        expect(registryReads).toHaveLength(beforeIncomplete);
      }
      report.incompletePeriods = {
        currentMonthRefused: true,
        futureMonthRefused: true,
        registryReadsAdded: 0,
      };

      const beforeEmpty = registryReads.length;
      const emptyRead = await chat(emptyToken, EXACT);
      assertVerified(emptyRead);
      await evidence(empty, emptyRead.body, 2);
      expect(registryReads.length - beforeEmpty).toBe(1);
      expect(sourceReceipts.at(-1)?.count).toBe(0);
      expect(sourceReceipts.at(-1)?.hasMore).toBe(false);
      expect(String(emptyRead.body.reply)).toMatch(/не найден|не возвращ/i);
      expect(String(emptyRead.body.reply)).not.toMatch(
        /реестр не настроен|отзывы не настроены/i,
      );
      const beforeFailure = registryReads.length;
      unavailableNext = true;
      const unavailable = await chat(emptyToken, {
        ...EXACT,
        text: EXACT.text + '?',
      });
      expect(unavailableNext).toBe(false);
      expect(registryReads.length - beforeFailure).toBe(1);
      expect(registryReads.at(-1)?.unavailable).toBe(true);
      expect(unavailable.status).toBe(201);
      expect(object(unavailable.body.grounding).status).toBe('blocked');
      expect(unavailable.body.action).toBeNull();
      expect(unavailable.body.resolution).toBeUndefined();
      expect(String(unavailable.body.reply)).not.toMatch(
        /отзывы не найдены|получено отзывов: 0|реестр не настроен/i,
      );
      report.emptyVsUnavailable = {
        emptyStatus: emptyRead.status,
        unavailableStatus: unavailable.status,
        failedReadWasNotEmpty: true,
      };

      const beforeForeign = registryReads.length;
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
      expect(registryReads).toHaveLength(beforeForeign);
      const otherTenant = await chat(foreignToken, EXACT);
      assertVerified(otherTenant);
      await evidence(b, otherTenant.body, 2);
      expect(sourceReceipts.at(-1)?.count).toBe(1);
      const beforeInvalid = registryReads.length;
      for (const branch of [b.branchId, 'Несуществующий', 'Дублированный']) {
        const invalid = await ownerChat({
          ...EXACT,
          text: `Покажи отзывы с оценкой 2 за прошлый месяц в филиале ${branch}`,
          branch,
          label:
            branch === b.branchId ? 'Foreign branch ID omitted' : undefined,
        });
        expect(invalid.status).toBe(201);
        expect(object(invalid.body.grounding).status).toBe('blocked');
        expect(invalid.body.action).toBeNull();
        expect(invalid.body.tools_used ?? []).toEqual([]);
        expect(registryReads).toHaveLength(beforeInvalid);
      }
      const restricted = await chat(await login(a, a.restricted), EXACT);
      expect(restricted.status).toBe(403);
      expect(registryReads).toHaveLength(beforeInvalid);
      const roleRefusals: Record<string, unknown>[] = [];
      for (const { actor, role } of [
        { actor: a.clientActor, role: UserRole.CLIENT },
        { actor: a.staffActor, role: UserRole.STAFF },
      ]) {
        const n = registryReads.length;
        const actorToken = await login(a, actor);
        const roleResponse = await chat(actorToken, EXACT);
        expect(roleResponse.status).toBe(201);
        expect(object(roleResponse.body.grounding).status).toBe('blocked');
        expect(roleResponse.body.action).toBeNull();
        expect(roleResponse.body.resolution).toBeUndefined();
        expect(roleResponse.body.tools_used ?? []).toEqual([]);
        expect(registryReads).toHaveLength(n);
        assertPrivateAbsent(roleResponse.body);
        let provenance: string;
        if (roleResponse.modelCalls === 0) {
          expect(currentPlan()).toBeUndefined();
          provenance = 'EXISTING_SERVER_PREMODEL_DENIAL';
        } else {
          expect(roleResponse.modelCalls).toBe(1);
          const plan = currentPlan();
          assert.ok(plan);
          expect(plan.tasks).toHaveLength(1);
          expect(plan.tasks[0].intent).toBe('reviews.list_recent');
          expect(plan.tasks[0].permission.status).toBe('denied');
          expect(plan.tasks[0].tool.status).toBe('not_available');
          expect(roleResponse.body.reply).toBe(SCRIPTED_DENIAL);
          provenance =
            'SCRIPTED_SEMANTIC_POLICY_DENIAL_NOT_LANGUAGE_ACCEPTANCE';
        }
        const beforeDirectModels = modelCalls;
        const direct = await request(http.app.getHttpServer())
          .post('/api/ai/tools/reviews.list.read/execute')
          .set('Authorization', `Bearer ${actorToken}`)
          .send({
            surface: 'web',
            idempotencyKey: randomUUID(),
            arguments: {
              period: 'named_month',
              month: window.month,
              rating: 2,
              limit: 20,
              branch_id: a.branchId,
            },
          });
        expect(direct.status).toBe(403);
        expect(object(object(direct.body).error).code).toBe(
          'ai_tool_forbidden',
        );
        expect(registryReads).toHaveLength(n);
        expect(modelCalls).toBe(beforeDirectModels);
        assertPrivateAbsent(direct.body);
        roleRefusals.push({
          role,
          chatStatus: roleResponse.status,
          chatModelCalls: roleResponse.modelCalls,
          chatDenialProvenance: provenance,
          directStatus: direct.status,
          directCode: 'ai_tool_forbidden',
          directModelCalls: 0,
          registryReadsAdded: 0,
        });
      }
      report.isolation = {
        foreignHistoryIsolated: true,
        foreignRunStatus: 400,
        foreignBranchRefused: true,
        restrictedBranchStatus: 403,
        clientAndStaffNoRegistryReads: true,
        roleRefusals,
      };
      assert.ok(typeof first.body.reply === 'string');
      const firstReply = first.body.reply;
      await history(token, conversationId, firstReply);
      const storedTurns = await db.prisma.widgetTimelineTurn.findMany({
        where: { tenantId: a.tenant.id, conversationId, role: 'assistant' },
      });
      expect(
        storedTurns.some(
          (turn) =>
            turn.textContent &&
            decodeChatReply(db.encryption, turn.textContent) ===
              first.body.reply,
        ),
      ).toBe(true);
      expect(
        storedTurns.every((turn) => !turn.textContent?.includes(firstReply)),
      ).toBe(true);
      noWrites(mark);
      expect(await business()).toBe(before);
      saved = {
        contract: 'synthetic-reviews-period-read-proof/1',
        database: database.database,
        sourceHead,
        sourceBindingsDigest,
        pid: process.pid,
        pgStarted: await pgStarted(),
        window,
        salons,
        requestId,
        conversationId,
        firstReply: first.body.reply,
        firstEvidenceHash,
        runId,
        graph: await graph(a.tenant.id),
        business: before,
      };
      // Contains synthetic login fixtures: keep private and exclude from archive.
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
        applicationPidChanged: true,
        postgresStartedChanged: true,
        graphHashUnchanged: saved.graph,
      };
      const token = await login(a),
        revokedToken = await login(a, a.revoked),
        otherToken = await login(b);
      const mark = http.recorder.mark();
      await history(token, saved.conversationId, saved.firstReply);
      expect(registryReads).toEqual([]);
      expect(modelCalls).toBe(0);
      const replay = await chat(
        token,
        EXACT,
        saved.requestId,
        saved.conversationId,
      );
      assertVerified(replay);
      expect(replay.body.reply).toContain('Сохранённый результат проверки.');
      expect(await evidence(a, replay.body, 2)).toBe(saved.runId);
      expect(digest(sourceReceipts.at(-1))).toBe(saved.firstEvidenceHash);
      expect(await graph(a.tenant.id)).toBe(saved.graph);
      expect(registryReads).toEqual([]);
      report.resumeReplay = {
        sameRun: true,
        sameSourceReceipt: true,
        registryReadsAdded: 0,
      };
      const beforeDrift = registryReads.length;
      afterRead = async () => {
        await db.prisma.branch.update({
          where: { id: b.branchId },
          data: { timezone: TENANT_TIMEZONE },
        });
      };
      const drift = await chat(otherToken, EXACT);
      expect(drift.status).toBe(201);
      expect(object(drift.body.grounding).status).toBe('blocked');
      expect(drift.body.action).toBeNull();
      expect(registryReads.length - beforeDrift).toBe(1);
      expect(drift.body.resolution).toBeUndefined();
      report.duringReadTimezoneChange = {
        status: drift.status,
        registryReadAttempts: 1,
        capturedFactsWithheld: true,
      };
      const beforeRevocation = registryReads.length;
      afterRead = async () => {
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: a.revoked.id, tenantId: a.tenant.id },
          },
          data: { status: 'suspended' },
        });
      };
      const revokedDuringRead = await chat(revokedToken, EXACT);
      expect(revokedDuringRead.status).toBe(403);
      expect(revokedDuringRead.body.reply).toBeUndefined();
      expect(registryReads.length - beforeRevocation).toBe(1);
      const n = registryReads.length,
        models = modelCalls;
      const revoked = await chat(revokedToken, EXACT);
      expect(revoked.status).toBe(401);
      expect(registryReads).toHaveLength(n);
      expect(modelCalls).toBe(models);
      report.revocation = {
        duringReadStatus: 403,
        priorReadStatus: 401,
        afterRevocationRegistryReads: 0,
      };
      await db.prisma.branch.update({
        where: { id: a.branchId },
        data: { timezone: TENANT_TIMEZONE },
      });
      const beforeCachedDrift = registryReads.length;
      const cachedDrift = await chat(
        token,
        EXACT,
        saved.requestId,
        saved.conversationId,
      );
      expect(cachedDrift.status).toBe(201);
      expect(object(cachedDrift.body.grounding).status).toBe('blocked');
      expect(cachedDrift.body.action).toBeNull();
      expect(cachedDrift.body.resolution).toBeUndefined();
      expect(registryReads).toHaveLength(beforeCachedDrift);
      report.cachedTimezoneChange = {
        status: cachedDrift.status,
        registryReadsAdded: 0,
        staleFactsWithheld: true,
      };
      noWrites(mark);
      expect(await business()).toBe(saved.business);
      report.businessHash = saved.business;
    }
  });
});
