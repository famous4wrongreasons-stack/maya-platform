import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelInput, AiCoreModelDecision } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';
import { reviewRatingQuestion } from './reviews-calendar-read';

/** Actual CI/parser/AiCore; metadata, runtime and C9 are synthetic component doubles. */
function fixture(
  entities: Record<string, unknown> = {
    period: 'last_month',
    rating: 2,
    branch: 'Набережная',
  },
  act = 'request',
) {
  const ci = new ConversationIntelligenceService();
  const parser = Object.create(AiCoreModelService.prototype) as {
    validatePlanningResponse(
      output: string,
      input: AiCoreModelInput,
    ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
  };
  Object.defineProperty(parser, 'conversationIntelligence', { value: ci });
  const scope = {
    branchId: 'branch-current',
    timezone: 'Europe/Moscow',
    period: 'named_month' as const,
    month: '2026-09',
    fromInclusive: '2026-08-31T21:00:00.000Z',
    toExclusive: '2026-09-30T21:00:00.000Z',
    rating: null as number | null,
    limit: 20,
  };
  const execution = {
    status: 'completed',
    execution_id: 'reviews-execution',
    result: {
      source: 'tenant_review_registry',
      privacy: 'review_text_redacted_from_ai',
      count: 1,
      reviews: [
        {
          rating: 2,
          occurred_at: '2026-09-04T10:00:00.000Z',
          topics: ['wait'],
        },
      ],
      read_scope: {
        contract: 'maya.review-registry-query/2',
        month: scope.month,
        timezone: scope.timezone,
        from_inclusive: scope.fromInclusive,
        to_exclusive: scope.toExclusive,
        branch_id: scope.branchId,
        rating_mode: 'exact',
        rating_exact: 2,
        scope: 'one_branch',
        order: 'occurred_at_desc',
        limit: 20,
        returned_count: 1,
        has_more: false,
        configuration_status: 'not_observed',
        observed_at: '2026-10-09T12:00:00.000Z',
      },
    },
  };
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockResolvedValue(execution);
  const finishConversationReads = jest
    .fn()
    .mockResolvedValue({ run_id: 'reviews-run', state: 'COMPLETED' });
  const orchestrator = {
    conversationDigest: () => 'digest',
    conversationRead: jest.fn(
      (
        _turn: unknown,
        _name: unknown,
        _key: unknown,
        _digest: unknown,
        read: () => Promise<unknown>,
      ) => read(),
    ),
    finishConversationReads,
  };
  const tools = [
    {
      name: 'reviews.list.read',
      description: 'reviews',
      input_schema: { type: 'object' },
      risk_tier: 'read',
      approval_policy: 'none',
    },
  ];
  const decide = jest.fn(
    (input: AiCoreModelInput): Promise<AiCoreModelDecision> =>
      Promise.resolve({
        ...parser.validatePlanningResponse(
          JSON.stringify({
            semantic_plan: {
              dialogue_act: act,
              tasks: [
                {
                  id: 'reviews',
                  intent: 'reviews.list_recent',
                  entities,
                  confidence: 1,
                },
              ],
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: {
              name: 'reviews.list.read',
              arguments: {
                period: 'last_month',
                rating: 5,
                limit: 50,
                branch_id: 'forged',
              },
            },
          }),
          input,
        ),
        reply: 'UNVERIFIED_MODEL_TEXT',
        provider: 'deepseek',
        model: 'SCRIPTED_VALIDATED_PLAN',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
  );
  const branches = jest.fn().mockResolvedValue([{ id: scope.branchId }]);
  const resolveReviewCalendarScope = jest.fn().mockImplementation(() => {
    (Reflect.get(service, 'readTurns') as WeakMap<object, unknown>).set(dto, {
      runId: 'reviews-run',
    });
    return Promise.resolve(scope);
  });
  const service = new AiCoreService(
    {
      get: (key: string) =>
        key === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
    } as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
    {
      listTools: jest.fn().mockResolvedValue({ tools }),
      execute,
      resolveReviewCalendarScope,
    } as never,
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
    orchestrator as never,
    undefined,
    ci,
    {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findMany: branches },
    } as never,
  );
  const owner = service as unknown as {
    complete(...args: unknown[]): Promise<unknown>;
    previousSemanticPlan(...args: unknown[]): Promise<unknown>;
  };
  const completion = jest.spyOn(owner, 'complete');
  const previous = jest
    .spyOn(owner, 'previousSemanticPlan')
    .mockResolvedValue(null);
  const dto = {
    surface: 'web' as const,
    requestId: 'reviews_calendar_request_123',
    messages: [
      { role: 'user' as const, content: 'Покажи отзывы за прошлый месяц' },
    ],
  };
  const user = {
    userId: 'actor',
    tenantId: 'tenant-current',
    sessionId: 'session',
    email: 'actor@example.test',
    role: UserRole.TENANT_OWNER,
    branchId: null,
    membershipId: 'membership',
    membershipStatus: 'active',
  };
  return {
    service,
    ci,
    execute,
    decide,
    scope,
    execution,
    branches,
    resolveReviewCalendarScope,
    orchestrator,
    completion,
    previous,
    dto,
    user,
    finish: (args: unknown[]) => owner.complete(...args),
    chat: () => service.chat(user, dto),
  };
}
describe('AiCore exact calendar reviews [synthetic owners, actual planner parser]', () => {
  it('uses semantic period/rating/branch rather than forged tool arguments, with one model and one C9 READ', async () => {
    const f = fixture();
    const answer = await f.chat();
    expect(answer.grounding.status).toBe('verified');
    expect(answer.action).toBeNull();
    expect(answer).not.toHaveProperty('widget');
    expect(answer.reply).toContain('ровно 2');
    expect(answer.reply).not.toContain('UNVERIFIED');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0][2].arguments).toEqual({
      period: 'named_month',
      month: '2026-09',
      rating: 2,
      limit: 20,
      branch_id: 'branch-current',
    });
    expect(f.execute.mock.calls[0][3]).toMatchObject({
      suppressWidgetTrigger: true,
      reviewCalendarReadScope: { ...f.scope, rating: 2 },
    });
    expect(f.orchestrator.conversationRead).toHaveBeenCalledTimes(1);
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(f.decide.mock.calls[0][0].toolResults).toEqual([]);
  });
  it.each([undefined, 'low', [1, 2], '2'])(
    'asks one rating preserving authorized month for %p, no row READ',
    async (rating) => {
      const f = fixture({
        period: 'last_month',
        ...(rating === undefined ? {} : { rating }),
      });
      const answer = await f.chat();
      expect(answer.reply).toBe(reviewRatingQuestion('2026-09'));
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.completion.mock.calls[0][5]).toHaveProperty(
        '0.semanticPlan.tasks.0.entities.period',
        '2026-09',
      );
      expect(f.completion.mock.calls[0][5]).toHaveProperty(
        '0.semanticPlan.tasks.0.requires_clarification',
        true,
      );
    },
  );
  it('keeps explicit all, including observed empty, as verified evidence', async () => {
    const f = fixture({ period: '2026-09', rating: 'all' });
    f.execution.result.reviews = [];
    f.execution.result.count = 0;
    f.execution.result.read_scope.returned_count = 0;
    f.execution.result.read_scope.rating_mode = 'all';
    Object.assign(f.execution.result.read_scope, { rating_exact: null });
    const answer = await f.chat();
    expect(answer.grounding.status).toBe('verified');
    expect(answer.reply).toContain('все оценки');
    expect(answer.reply).toContain('не найдены');
    expect(f.execute.mock.calls[0][2].arguments).toHaveProperty(
      'all_ratings',
      true,
    );
  });
  it('resumes a rating-only answer from the previous validated finite clarification', async () => {
    const f = fixture({ rating: 2 }, 'clarification_answer');
    f.previous.mockResolvedValue(
      f.ci.validatePlan(
        {
          dialogue_act: 'request',
          tasks: [
            {
              id: 'reviews',
              intent: 'reviews.list_recent',
              entities: {
                period: '2026-09',
                branch: 'branch-current',
                rating: 'low',
              },
              confidence: 1,
              requires_clarification: true,
              clarification_question: reviewRatingQuestion('2026-09'),
            },
          ],
          context: {
            carried_slots: [],
            replaced_slots: [],
            unresolved_references: [],
          },
        },
        UserRole.TENANT_OWNER,
        ['reviews.list.read'],
      ),
    );
    const answer = await f.chat();
    expect(answer.grounding.status).toBe('verified');
    expect(f.resolveReviewCalendarScope.mock.calls[0]).toEqual([
      f.user,
      'web',
      {
        period: 'named_month',
        month: '2026-09',
        all_ratings: true,
        limit: 20,
        branch_id: 'branch-current',
      },
    ]);
  });
  it.each(['unknown', 'duplicate', 'employee', 'unsupported-period'])(
    'does not drop %s scope into general registry',
    async (kind) => {
      const f = fixture({
        period: kind === 'unsupported-period' ? 'named_range' : 'last_month',
        rating: 2,
        ...(kind === 'employee'
          ? { employee: 'Мастер' }
          : { branch: 'Набережная' }),
      });
      if (kind === 'unknown') f.branches.mockResolvedValue([]);
      if (kind === 'duplicate')
        f.branches.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      const answer = await f.chat();
      expect(answer.grounding.status).toBe('blocked');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.resolveReviewCalendarScope).not.toHaveBeenCalled();
    },
  );
  it.each([
    new ConflictException('review_calendar_scope_changed'),
    new ServiceUnavailableException('review_calendar_source_unavailable'),
  ])(
    'withholds finite source failure without fallback/retry',
    async (error) => {
      const f = fixture();
      f.execute.mockRejectedValue(error);
      const answer = await f.chat();
      expect(answer.grounding.status).toBe('blocked');
      expect(answer.reply).toContain('Не удалось подтвердить');
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it('does not downgrade current permission revocation to missing source', async () => {
    const f = fixture();
    f.resolveReviewCalendarScope.mockRejectedValue(new ForbiddenException());
    await expect(f.chat()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(['UNCONFIRMED', 'INCOMPLETE', 'STOPPED', 'missing'])(
    'withholds verified result without final C9 COMPLETED: %s',
    async (state) => {
      const f = fixture();
      await f.chat();
      const args = f.completion.mock.calls[0];
      if (state === 'missing')
        (
          Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>
        ).delete(f.dto);
      else
        f.orchestrator.finishConversationReads.mockResolvedValue({
          run_id: 'reviews-run',
          state,
        });
      await expect(f.finish(args)).rejects.toMatchObject({
        response: { error: { code: 'conversation_history_unavailable' } },
      });
    },
  );
  it('propagates final C9 authority failure', async () => {
    const f = fixture();
    f.orchestrator.finishConversationReads.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(f.chat()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('persists only the server month/rating question in existing semantic context', async () => {
    const f = fixture({ period: 'last_month', rating: 'low' });
    await f.chat();
    const args = f.completion.mock.calls[0];
    const persistAssistantReply = jest.fn().mockResolvedValue(undefined);
    (
      Reflect.get(f.service, 'persistedUserTurns') as WeakMap<object, unknown>
    ).set(f.dto, { turnId: 'turn', conversationId: 'conversation' });
    Reflect.set(f.service, 'moduleRef', {
      get: () => ({ persistAssistantReply }),
    });
    await f.finish(args);
    const saved = persistAssistantReply.mock.calls[0] as readonly unknown[];
    expect(saved[0]).toHaveProperty(
      'semanticContext.plan.tasks.0.entities.period',
      '2026-09',
    );
    expect(saved[0]).toHaveProperty(
      'semanticContext.plan.tasks.0.clarification_question',
      reviewRatingQuestion('2026-09'),
    );
  });
});
