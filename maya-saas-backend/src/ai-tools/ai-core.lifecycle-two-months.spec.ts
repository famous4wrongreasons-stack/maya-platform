import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision, AiCoreModelInput } from './ai-core.types';
import type { AiTypedWidgetTriggerPort } from './ai-typed-widget-trigger.port';
import type { C9ConversationReads } from '../orchestration/c9.orchestrator';

/** Actual CI/parser/chat ingress. C9, timeline and runtime are synthetic owner
 * seams. This proves routing only, not C8 policy matching, client discovery,
 * provider/model quality, database persistence or authority admission. */
const request = { period: 'more_than_two_months' } as const;
type Request = Readonly<typeof request>;
function fixture(
  options: {
    entities?: Record<string, unknown>;
    role?: UserRole;
    audience?: 'client' | 'staff';
    confidence?: number;
    unresolved?: string[];
    compound?: boolean;
    proposedTool?: boolean;
  } = {},
) {
  const ci = new ConversationIntelligenceService();
  const parser = Object.create(AiCoreModelService.prototype) as {
    validatePlanningResponse(
      output: string,
      input: AiCoreModelInput,
    ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
  };
  Object.defineProperty(parser, 'conversationIntelligence', { value: ci });
  const user: AuthenticatedUser = {
    userId: 'owner-current',
    tenantId: 'tenant-current',
    sessionId: 'session',
    email: 'owner@example.invalid',
    role: options.role ?? UserRole.TENANT_OWNER,
    branchId: null,
    membershipId: 'membership-current',
    membershipStatus: 'active',
  };
  const runtime = {
    listTools: jest.fn().mockResolvedValue({
      tools: [
        {
          name: 'clients.retention.scan',
          description: 'Existing owner registry capability',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: { type: 'object' },
        },
        {
          name: 'clients.dormant.list',
          description: 'Existing dormant client capability',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: { type: 'object' },
        },
      ],
    }),
    execute: jest
      .fn()
      .mockRejectedValue(new Error('unexpected_generic_runtime_read')),
  };
  const decide = jest.fn(
    (input: AiCoreModelInput): Promise<AiCoreModelDecision> => {
      const parsed = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: options.compound ? 'compound_request' : 'request',
            tasks: [
              {
                id: 'return',
                intent: 'clients.dormant_list',
                entities: options.entities ?? request,
                confidence: options.confidence ?? 1,
              },
              ...(options.compound
                ? [
                    {
                      id: 'term',
                      intent: 'general.explain_term',
                      entities: { term: 'удержание' },
                      confidence: 1,
                    },
                  ]
                : []),
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: options.unresolved ?? [],
            },
          },
          tool_call: options.proposedTool
            ? {
                name: 'clients.dormant.list',
                arguments: { days: 1, limit: 50 },
              }
            : null,
        }),
        input,
      );
      return Promise.resolve({
        ...parsed,
        reply: 'UNVERIFIED_SCRIPTED_PLANNER_PROSE',
        provider: 'deepseek',
        model: 'SCRIPTED_VALIDATED_PLAN',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    },
  );
  type PersistInput = Parameters<
    AiTypedWidgetTriggerPort['persistAssistantReply']
  >[0];
  const saved: PersistInput[] = [];
  let turnNumber = 0;
  const persistTypedTurn = jest
    .fn<
      ReturnType<AiTypedWidgetTriggerPort['persistTypedTurn']>,
      Parameters<AiTypedWidgetTriggerPort['persistTypedTurn']>
    >()
    .mockImplementation(() =>
      Promise.resolve({
        turnId: `turn-${++turnNumber}`,
        conversationId: 'conversation-current',
      }),
    );
  const persistAssistantReply = jest
    .fn<Promise<void>, [PersistInput]>()
    .mockImplementation((input) => {
      saved.push(input);
      return Promise.resolve();
    });
  const timeline = {
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn,
    persistAssistantReply,
    readConversationContext: jest.fn().mockResolvedValue(null),
  };
  const result = {
    reply: 'SYNTHETIC_C9_EXACT_PERIOD_RESULT',
    coordination: {
      run_id: 'lifecycle-run',
      scope: 'explicit_lifecycle',
      state: 'PROPOSED',
      revision: 1,
      revision_id: 'result-revision',
      current: true,
      replayed: false,
    },
    recommendation: {
      contract: 'maya.c9-lifecycle-response/1',
      outcome: 'PARTIAL',
      canContact: false,
      noSideEffects: true,
      executionAuthority: false,
      request,
      evidence: { qualification: 'SCRIPTED_OWNER_RESULT_ONLY' },
    },
  };
  const checkClientReturn = jest
    .fn<Promise<typeof result>, [C9ConversationReads, Request?]>()
    .mockResolvedValue(result);
  const orchestration = {
    checkClientReturn,
    conversationDigest: (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    conversationRead: jest
      .fn()
      .mockRejectedValue(new Error('unexpected_generic_c9_read')),
    finishConversationReads: jest.fn().mockResolvedValue(null),
    reviewBusinessAndClientReturn: jest
      .fn()
      .mockRejectedValue(new Error('unexpected_compound_read')),
    checkCancellationWindows: jest
      .fn()
      .mockRejectedValue(new Error('unexpected_occupancy_read')),
  };
  const service = new AiCoreService(
    { get: () => undefined } as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
    runtime as never,
    { decide } as never,
    {
      log: jest.fn().mockResolvedValue(undefined),
      tryLog: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: {
          enabled_capabilities: ['business_analytics', 'client_return'],
        },
      }),
    } as never,
    { tryHandle: jest.fn().mockResolvedValue(null) } as never,
    new MayaBrainRouterService(),
    orchestration as never,
    undefined,
    ci,
    {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
      },
    } as never,
    { get: () => timeline } as never,
  );
  let chats = 0;
  const chat = (
    text = 'Проверь клиентов, которые не приходили больше двух месяцев',
  ) =>
    service.chat(user, {
      surface: 'web',
      requestId: `lifecycle_two_months_request_${++chats}`,
      conversationId: 'conversation-current',
      ...(options.audience ? { audience: options.audience } : {}),
      messages: [{ role: 'user', content: text }],
    });
  return {
    service,
    user,
    runtime,
    decide,
    timeline,
    saved,
    result,
    orchestration,
    chat,
  };
}

describe('exact two-month Lifecycle ingress [actual parser, synthetic C9]', () => {
  it.each([UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER])(
    'routes the exact validated request once through existing C9 for %s',
    async (role) => {
      const f = fixture({ role });
      const response = await f.chat();
      expect(f.orchestration.checkClientReturn).toHaveBeenCalledTimes(1);
      const [turn, selection] = f.orchestration.checkClientReturn.mock.calls[0];
      expect(turn.turn).toEqual({
        turnId: 'turn-1',
        conversationId: 'conversation-current',
      });
      expect(turn.intentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(selection).toEqual(request);
      expect(Object.keys(selection ?? {})).toEqual(['period']);
      expect(response.reply).toBe(f.result.reply);
      expect(response.recommendation).toEqual(f.result.recommendation);
      expect(response.coordination).toEqual(f.result.coordination);
      expect(response.action).toBeNull();
      expect(response).not.toHaveProperty('analysis');
      expect(response).not.toHaveProperty('resolution');
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.orchestration.conversationRead).not.toHaveBeenCalled();
      expect(
        f.orchestration.reviewBusinessAndClientReturn,
      ).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
      expect(f.saved[0].semanticContext).toHaveProperty(
        'plan.tasks.0.entities',
        request,
      );
      expect(f.saved[0].semanticContext).not.toHaveProperty(
        'ownerReviewClarification',
      );
      expect(f.decide.mock.calls[0][0].toolResults).toEqual([]);
    },
  );
  it('ignores proposed generic days/limit arguments instead of turning them into a source threshold', async () => {
    const f = fixture({ proposedTool: true });
    await f.chat();
    expect(f.orchestration.checkClientReturn).toHaveBeenCalledTimes(1);
    expect(f.orchestration.checkClientReturn.mock.calls[0][1]).toEqual(request);
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it.each([
    { period: ['more_than_two_months'] },
    { period: 'more_than_two_months', branch: 'named-branch' },
    { period: 'more_than_two_months', employee: 'named-employee' },
    { period: 'more_than_two_months', previous_frequency: 'regular' },
    { period: 'more_than_two_months', goal: 'return_priority' },
    { period: 'more_than_two_months', days_since_last_visit: 60 },
    { period: 'more_than_two_months', source_revision: 'forged' },
    { period: 'more_than_three_months' },
  ])(
    'does not drop unsupported scope into an unscoped owner request: %j',
    async (entities) => {
      const f = fixture({ entities });
      const response = await f.chat();
      expect(f.orchestration.checkClientReturn).not.toHaveBeenCalled();
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.orchestration.conversationRead).not.toHaveBeenCalled();
      expect(response.action).toBeNull();
      expect(response).not.toHaveProperty('recommendation');
      expect(f.saved[0].semanticContext).toHaveProperty(
        'ownerReviewClarification',
      );
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { confidence: 0.5 },
    { unresolved: ['period'] },
    { compound: true, proposedTool: true },
  ])('keeps unready or mixed requests bounded: %j', async (options) => {
    const f = fixture(options);
    const response = await f.chat();
    expect(f.orchestration.checkClientReturn).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(response).not.toHaveProperty('recommendation');
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it.each(['client', 'staff'] as const)(
    'does not grant owner Lifecycle to %s audience',
    async (audience) => {
      const f = fixture({ audience });
      await f.chat();
      expect(f.orchestration.checkClientReturn).not.toHaveBeenCalled();
      expect(f.runtime.execute).not.toHaveBeenCalled();
    },
  );
  it('requires a persisted current user turn before handing the constraint to C9', async () => {
    const f = fixture();
    f.timeline.persistTypedTurn.mockResolvedValue(null);
    await expect(f.chat()).rejects.toMatchObject({
      response: { error: { code: 'conversation_history_unavailable' } },
    });
    expect(f.orchestration.checkClientReturn).not.toHaveBeenCalled();
    expect(f.timeline.persistAssistantReply).not.toHaveBeenCalled();
  });
  it.each([
    new Error('c9_read_work_in_progress_or_unknown'),
    new ForbiddenException('c9_current_principal_required'),
  ])(
    'does not replace a current C9 refusal with generic data',
    async (error) => {
      const f = fixture();
      f.orchestration.checkClientReturn.mockRejectedValue(error);
      await expect(f.chat()).rejects.toBe(error);
      expect(f.orchestration.checkClientReturn).toHaveBeenCalledTimes(1);
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.timeline.persistAssistantReply).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves the constraint on each explicit turn and exposes only the C9 replay projection', async () => {
    const f = fixture();
    await f.chat();
    f.result.coordination.replayed = true;
    const response = await f.chat(
      'Ещё раз проверь отсутствующих больше двух месяцев',
    );
    expect(
      f.orchestration.checkClientReturn.mock.calls.map((call) => call[1]),
    ).toEqual([request, request]);
    expect(
      f.orchestration.checkClientReturn.mock.calls.map(
        (call) => call[0].turn.turnId,
      ),
    ).toEqual(['turn-1', 'turn-2']);
    expect(response.coordination).toHaveProperty('replayed', true);
    expect(f.decide).toHaveBeenCalledTimes(2);
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });
});
