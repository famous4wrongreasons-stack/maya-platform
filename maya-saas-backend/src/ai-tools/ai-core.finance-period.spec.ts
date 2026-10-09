import { ServiceUnavailableException } from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationEntities } from '../conversation-intelligence/conversation-intelligence.types';
import type {
  MeasurementMetric,
  MeasurementResult,
} from '../measurement/measurement.contract';
import { presentMeasurement } from '../measurement/measurement.presentation';
import type { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiTypedWidgetTriggerPort } from './ai-typed-widget-trigger.port';

const toolName = 'analytics.business.query';
const tenantId = 'finance-tenant';
const user: AuthenticatedUser = {
  userId: 'finance-owner',
  tenantId,
  sessionId: 'finance-session',
  role: UserRole.TENANT_OWNER,
  email: 'owner@example.test',
  branchId: null,
  membershipId: 'finance-membership',
  membershipStatus: 'active',
};
const now = new Date('2026-10-09T12:00:00.000Z');

/** Actual CI validation and C7 presentation; only model/provider/runtime I/O is
 * scripted. These component tests do not claim live C7 or C9 authorization. */
function fixture(
  intent: 'finance.revenue' | 'finance.compare_periods',
  entities: ConversationEntities,
  unresolved: string[] = [],
) {
  const ci = new ConversationIntelligenceService();
  const plan = ci.validatePlan(
    {
      dialogue_act: 'request',
      tasks: [{ intent, entities, confidence: 1 }],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: unresolved,
      },
    },
    user.role,
    [toolName],
  );
  if (!plan) throw new Error('Expected the real CI validator to return a plan');
  const decision: AiCoreModelDecision = {
    reply: 'MODEL_UNVERIFIED_NUMBER 999999',
    toolCall: { name: toolName, arguments: { period: 'month_to_date' } },
    semanticPlan: plan,
    provider: 'deepseek',
    model: 'scripted-component-fixture',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
  const decide: jest.MockedFunction<AiCoreModelService['decide']> = jest
    .fn()
    .mockResolvedValue(decision);
  const execute: jest.MockedFunction<AiToolRuntimeService['execute']> =
    jest.fn();
  const listTools: jest.MockedFunction<AiToolRuntimeService['listTools']> = jest
    .fn()
    .mockResolvedValue({
      tools: [
        {
          name: toolName,
          description: 'Existing finance READ',
          input_schema: { type: 'object' },
          risk_tier: 'read',
          approval_policy: 'none',
          idempotency: 'none',
          timeout_ms: 8000,
        },
      ],
    });
  const service = new AiCoreService(
    {
      get: (key: string) =>
        key === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
    } as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
    { listTools, execute } as never,
    { decide } as never,
    {
      log: jest.fn().mockResolvedValue(undefined),
      tryLog: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
    } as never,
    { tryHandle: jest.fn().mockResolvedValue(null) } as never,
    new MayaBrainRouterService(),
    {} as never,
    undefined,
    ci,
    {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
    } as never,
  );
  return {
    decide,
    execute,
    plan,
    service,
    chat: (content: string) =>
      service.chat(user, {
        surface: 'web',
        requestId: 'finance_request_12345678',
        messages: [{ role: 'user', content }],
      }),
  };
}

function source(from: string, to: string, label: string, amount = '15000') {
  const metric = (
    key: string,
    value: string,
    unit: string,
    basis: string,
  ): MeasurementMetric => ({
    key,
    value,
    unit,
    basis,
    currency: unit === 'money_minor' ? 'RUB' : null,
    state: 'COMPLETE',
    dimensions: {},
    sourceRefs: [],
  });
  const facts: MeasurementResult = {
    sources: [],
    dependencies: [],
    metrics: [
      metric('confirmed_cash', amount, 'money_minor', 'confirmed_cash'),
      metric(
        'observed_period_from',
        from,
        'instant',
        'canonical_half_open_window',
      ),
      metric(
        'observed_period_to_exclusive',
        to,
        'instant',
        'canonical_half_open_window',
      ),
    ],
    completeness: 'COMPLETE',
    qualification: 'VERIFIED',
    reasons: [],
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
  return {
    measurement: presentMeasurement(
      tenantId,
      {
        kind: 'business_period',
        periodFrom: new Date(from),
        periodTo: new Date(to),
        asOf: now,
        timezone: 'UTC',
        scope: {
          version: 1,
          capabilityKey: 'analytics.business.finance.read',
          branchIds: [],
          dimensions: {},
          sourceQuery: {},
        },
      },
      facts,
    ),
    resolved_period: {
      kind: 'named_range',
      label_ru: label,
      from,
      to: new Date(Date.parse(to) - 1).toISOString(),
    },
  };
}
function completed(result: unknown, execution = 'finance-read-1') {
  return { status: 'completed', execution_id: execution, result };
}
const current = () =>
  source(
    '2026-09-08T00:00:00.000Z',
    '2026-09-09T00:00:00.000Z',
    '8 сентября 2026 года',
  );
const previous = () =>
  source(
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
    '1 сентября 2026 года',
    '10000',
  );
const comparison = () =>
  fixture('finance.compare_periods', {
    period: '2026-09-08',
    comparison_period: '2026-09-01',
    metric: 'revenue',
  });

function expectTextOnly(response: Awaited<ReturnType<AiCoreService['chat']>>) {
  expect(response.action).toBeNull();
  expect(response).not.toHaveProperty('resolution');
  expect(response).not.toHaveProperty('widget');
  expect(response).not.toHaveProperty('widget_data');
  expect(response.reply).not.toMatch(/MODEL_UNVERIFIED|999999/);
}

describe('AiCore finite finance periods through the existing READ', () => {
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('retains the validated previous_year on a short follow-up instead of substituting the default month', async () => {
    const f = fixture('finance.revenue', { period: 'previous_year' });
    f.execute.mockResolvedValue(
      completed(
        source(
          '2025-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
          '2025 год',
        ),
      ),
    );
    const response = await f.chat('А прошлый год?');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0][0]).toBe(user);
    expect(f.execute.mock.calls[0][1]).toBe(toolName);
    expect(f.execute.mock.calls[0][2].arguments).toEqual({
      period: 'named_range',
      from_day: '2025-01-01',
      to_day: '2025-12-31',
      comparison: 'none',
    });
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(response.reply).toContain('2025 год');
    expect(response.reply).toContain('150,00');
    expect(response.grounding.status).toBe('verified');
    expectTextOnly(response);
  });

  it('uses the explicit fresh day over a model-selected month and reports the actual source window', async () => {
    const f = fixture('finance.revenue', { period: '2026-08' });
    f.execute.mockResolvedValue(
      completed(
        source(
          '2026-08-07T00:00:00.000Z',
          '2026-08-08T00:00:00.000Z',
          '7 августа 2026 года',
        ),
      ),
    );
    const response = await f.chat('Покажи выручку за 7 августа 2026 года');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0][2].arguments).toEqual({
      period: 'named_day',
      day: '2026-08-07',
      comparison: 'none',
    });
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(response.reply).toContain('7 августа 2026 года');
    expect(response.reply).toContain('07.08.2026');
    expect(response.reply).toContain('08.08.2026');
    expect(response.reply).toContain('конец не включён');
    expectTextOnly(response);
  });

  it('persists the explicit day through the existing semantic-context owner and restores it on the next short turn', async () => {
    const f = fixture('finance.revenue', { period: '2026-08' });
    const saved: unknown[] = [];
    let turn = 0;
    const persistAssistantReply: jest.MockedFunction<
      AiTypedWidgetTriggerPort['persistAssistantReply']
    > = jest.fn();
    persistAssistantReply.mockImplementation((input) => {
      saved.push(input.semanticContext);
      return Promise.resolve();
    });
    const timeline = {
      routeTypedUtterance: jest.fn().mockResolvedValue(null),
      persistTypedTurn: jest.fn().mockImplementation(() =>
        Promise.resolve({
          turnId: `finance-turn-${++turn}`,
          conversationId: 'finance-conversation',
        }),
      ),
      readConversationContext: jest.fn().mockImplementation(() =>
        Promise.resolve({
          version: 'maya.chat-context-window/1',
          contexts: saved.slice(-8).reverse(),
        }),
      ),
      persistAssistantReply,
    };
    // Exercise AiCore's actual save/restore calls. Persistence and C9 READ I/O
    // remain finite test ports; this is not a database/restart acceptance claim.
    Object.defineProperty(f.service, 'moduleRef', {
      value: { get: () => timeline },
    });
    const conversationRead = jest.fn(
      (
        _turn: unknown,
        _name: string,
        _key: string,
        _digest: string,
        read: () => Promise<unknown>,
      ) => read(),
    );
    Object.defineProperty(f.service, 'orchestrator', {
      value: {
        conversationDigest: () => 'a'.repeat(64),
        conversationRead,
        finishConversationReads: jest.fn().mockResolvedValue(null),
      },
    });
    f.execute.mockResolvedValue(
      completed(
        source(
          '2026-08-07T00:00:00.000Z',
          '2026-08-08T00:00:00.000Z',
          '7 августа 2026 года',
        ),
      ),
    );
    const chat = (requestId: string, content: string) =>
      f.service.chat(user, {
        surface: 'web',
        conversationId: 'finance-conversation',
        requestId,
        messages: [{ role: 'user', content }],
      });
    const first = await chat(
      'finance_day_request_1',
      'Покажи выручку за 7 августа 2026 года',
    );
    expectTextOnly(first);
    expect(persistAssistantReply).toHaveBeenCalledTimes(1);
    const persisted = persistAssistantReply.mock.calls[0][0];
    expect(persisted.actor).toBe(user);
    expect(persisted.userTurn).toEqual({
      turnId: 'finance-turn-1',
      conversationId: 'finance-conversation',
    });
    expect(persisted.reply).toBe(first.reply);
    expect(persisted.semanticContext).toMatchObject({
      version: 'maya.chat-semantic-context/1',
      timezone: 'UTC',
      plan: {
        tasks: [
          { intent: 'finance.revenue', entities: { period: '2026-08-07' } },
        ],
      },
    });
    f.decide.mockImplementationOnce((input) =>
      Promise.resolve({
        reply: 'MODEL_UNVERIFIED_NUMBER 999999',
        toolCall: { name: toolName, arguments: { period: 'month_to_date' } },
        semanticPlan: new ConversationIntelligenceService().validatePlan(
          input.conversationPlan,
          user.role,
          [toolName],
        ),
        provider: 'deepseek',
        model: 'scripted-component-fixture',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
    );
    const second = await chat('finance_day_request_2', 'А сколько получилось?');
    expect(f.decide).toHaveBeenCalledTimes(2);
    expect(
      f.decide.mock.calls[1][0].conversationPlan?.tasks[0].entities.period,
    ).toBe('2026-08-07');
    expect(timeline.readConversationContext).toHaveBeenLastCalledWith(
      user,
      'finance-conversation',
      'finance-turn-2',
      { precedingCompletions: true },
    );
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.execute.mock.calls[1][2].arguments).toEqual({
      period: 'named_day',
      day: '2026-08-07',
      comparison: 'none',
    });
    expect(conversationRead).toHaveBeenCalledTimes(2);
    expect(persistAssistantReply).toHaveBeenCalledTimes(2);
    expect(second.reply).toContain('7 августа 2026 года');
    expectTextOnly(second);
  });

  it('awaits the first source then performs exactly two distinct authorized READ calls, with no comparison defaults or widgets', async () => {
    const f = comparison();
    let release!: (value: ReturnType<typeof completed>) => void;
    let entered!: () => void;
    const enteredFirst = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = new Promise<ReturnType<typeof completed>>((resolve) => {
      release = resolve;
    });
    f.execute.mockImplementationOnce(() => {
      entered();
      return first;
    });
    f.execute.mockResolvedValueOnce(completed(previous(), 'finance-read-2'));
    const pending = f.chat('Сравни выручку двух указанных дней');
    await enteredFirst;
    expect(f.execute).toHaveBeenCalledTimes(1);
    release(completed(current()));
    const response = await pending;
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.execute.mock.calls.map((call) => call[0])).toEqual([user, user]);
    expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
      toolName,
      toolName,
    ]);
    expect(f.execute.mock.calls.map((call) => call[2].arguments)).toEqual([
      { period: 'named_day', day: '2026-09-08', comparison: 'none' },
      { period: 'named_day', day: '2026-09-01', comparison: 'none' },
    ]);
    const keys = f.execute.mock.calls.map((call) => call[2].idempotencyKey);
    expect(keys.every((key) => typeof key === 'string' && key.length > 0)).toBe(
      true,
    );
    expect(new Set(keys).size).toBe(2);
    for (const call of f.execute.mock.calls) {
      expect(call[3]).toMatchObject({
        suppressWidgetTrigger: true,
        requestId: 'finance_request_12345678',
      });
      expect(call[3]).not.toHaveProperty('widgetTrigger');
    }
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(response.tools_used).toHaveLength(2);
    for (const part of [
      '8 сентября 2026 года',
      '1 сентября 2026 года',
      '150,00',
      '100,00',
    ])
      expect(response.reply).toContain(part);
    expectTextOnly(response);
  });

  it('returns a blocked comparison without the first amount or report card when the second READ throws, and makes no third READ', async () => {
    const f = comparison();
    f.execute.mockResolvedValueOnce(completed(current()));
    f.execute.mockRejectedValueOnce(
      new ServiceUnavailableException('second_source_unavailable'),
    );
    const response = await f.chat('Сравни выручку двух указанных дней');
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(response.grounding.status).toBe('blocked');
    expect(response.reply).toMatch(/сравнен|период|источник/i);
    expect(response.reply).not.toMatch(
      /150,00|15000|RUB|Подтверждённые поступления:/,
    );
    expectTextOnly(response);
  });

  it.each([
    'envelope-stale',
    'result-stale',
    'malformed-result',
    'failed',
    'throw',
  ] as const)(
    'stops after a %s first READ and never discloses its amount or starts the second',
    async (state) => {
      const f = comparison();
      const untrusted = current();
      untrusted.measurement.metrics[0].value = '987654321';
      if (state === 'throw')
        f.execute.mockRejectedValue(
          new ServiceUnavailableException('source_unavailable'),
        );
      else
        f.execute.mockResolvedValue({
          ...completed(
            state === 'malformed-result'
              ? { revenue: '987654321' }
              : {
                  ...untrusted,
                  ...(state === 'result-stale' ? { stale: true } : {}),
                },
          ),
          ...(state === 'envelope-stale' ? { stale: true } : {}),
          ...(state === 'failed' ? { status: 'failed' } : {}),
        });
      const response = await f.chat('Сравни выручку двух указанных дней');
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(response.grounding.status).toBe('blocked');
      expect(response.reply.replace(/\s/gu, '')).not.toMatch(
        /987654321|9876543,21/,
      );
      expect(response.reply).not.toContain('Подтверждённые поступления:');
      expectTextOnly(response);
    },
  );

  it.each<{
    label: string;
    intent: 'finance.revenue' | 'finance.compare_periods';
    entities: ConversationEntities;
    unresolved: string[];
  }>([
    {
      label: 'unsupported period',
      intent: 'finance.revenue',
      entities: { period: 'all_history' },
      unresolved: [],
    },
    {
      label: 'invalid calendar day',
      intent: 'finance.revenue',
      entities: { period: '2026-02-31' },
      unresolved: [],
    },
    {
      label: 'ambiguous periods',
      intent: 'finance.revenue',
      entities: { period: ['2026-09', '2026-08'] },
      unresolved: [],
    },
    {
      label: 'missing comparison',
      intent: 'finance.compare_periods',
      entities: { period: '2026-09' },
      unresolved: [],
    },
    {
      label: 'identical comparison',
      intent: 'finance.compare_periods',
      entities: { period: '2026-09', comparison_period: '2026-09' },
      unresolved: [],
    },
    {
      label: 'unresolved reference',
      intent: 'finance.revenue',
      entities: { period: 'previous_year' },
      unresolved: ['period'],
    },
  ])(
    'does not read a default month for $label',
    async ({ intent, entities, unresolved }) => {
      const f = fixture(intent, entities, unresolved);
      const response = await f.chat('Покажи выручку за тот период');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(response.reply).toMatch(/уточн|период/i);
      expect(response.reply).not.toContain('150,00');
      expectTextOnly(response);
    },
  );
});
