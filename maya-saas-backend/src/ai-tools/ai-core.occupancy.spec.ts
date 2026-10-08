import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { AiCoreService } from './ai-core.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { C9Orchestrator } from '../orchestration/c9.orchestrator';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';

const user: AuthenticatedUser = {
  userId: 'owner',
  sessionId: 'session',
  tenantId: 'tenant',
  role: UserRole.TENANT_OWNER,
  email: 'synthetic@example.test',
  branchId: null,
  membershipId: 'member',
  membershipStatus: 'active',
};
function fixture(entities: Record<string, string> = {}) {
  const ci = new ConversationIntelligenceService();
  const plan = ci.validatePlan(
    {
      parent_request: 'Посмотри, что освободилось из-за отменённых визитов',
      tasks: [
        {
          intent: 'schedule.review_cancellation_windows',
          entities,
          confidence: 0.98,
        },
      ],
    },
    user.role,
    ['booking.availability.read'],
  );
  const model = {
    decide: jest.fn().mockResolvedValue({
      provider: 'safe',
      model: 'SCRIPTED_SYNTHETIC',
      reply: null,
      toolCall: null,
      semanticPlan: plan,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }),
  };
  const runtime = {
    listTools: jest.fn().mockResolvedValue({
      tools: [
        {
          name: 'clients.dormant.list',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: {},
        },
        {
          name: 'analytics.business.query',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: {},
        },
        {
          name: 'staff.schedule.read',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: {},
        },
        {
          name: 'operations.journal.read',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: {},
        },
        {
          name: 'booking.availability.read',
          risk_tier: 'read',
          approval_policy: 'none',
          input_schema: {},
        },
      ],
    }),
    execute: jest.fn(),
  };
  const timeline = {
    readConversationContext: jest.fn().mockResolvedValue(null),
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn: jest
      .fn()
      .mockResolvedValue({ turnId: 'turn', conversationId: 'conversation' }),
    persistAssistantReply: jest
      .fn<Promise<void>, [{ semanticContext: unknown; reply: string }]>()
      .mockResolvedValue(undefined),
  };
  const orchestration = {
    reviewBusinessAndClientReturn: jest.fn().mockResolvedValue({
      reply:
        'SYNTHETIC: опубликованный отчёт и до трёх оценок давности; без контактов.',
      coordination: {
        run_id: 'client-value-run',
        scope: 'explicit_business_lifecycle',
        state: 'PROPOSED',
        revision: 1,
      },
      analysis: { contract: 'maya.c9-bi-report-response/1', synthetic: true },
      recommendation: {
        contract: 'maya.c9-lifecycle-response/1',
        canContact: false,
        noSideEffects: true,
        executionAuthority: false,
      },
    }),
    reviewBusinessAndCancellationWindows: jest.fn().mockResolvedValue({
      reply:
        'SYNTHETIC: последний опубликованный общий отчёт и одно окно; ограниченная рекомендация.',
      coordination: {
        run_id: 'compound-run',
        scope: 'explicit_owner_review',
        state: 'PROPOSED',
        revision: 1,
      },
      analysis: { contract: 'maya.c9-bi-response/1', synthetic: true },
      recommendation: {
        contract: 'maya.c9-occupancy-response/1',
        noSideEffects: true,
        executionAuthority: false,
      },
    }),
    conversationDigest: jest.fn().mockReturnValue('a'.repeat(64)),
    conversationRead: jest.fn(
      (...args: Parameters<C9Orchestrator['conversationRead']>) => {
        args[0].runId = 'existing-read-run';
        return args[4]();
      },
    ),
    finishConversationReads: jest.fn().mockResolvedValue(null),
    checkCancellationWindows: jest.fn().mockResolvedValue({
      reply: 'SYNTHETIC: окно подтверждено CRM; два варианта, без действий.',
      coordination: {
        run_id: 'run',
        scope: 'explicit_occupancy',
        state: 'PROPOSED',
        revision: 1,
        revision_id: 'revision',
        current: true,
      },
      recommendation: {
        reasoning: 'deterministic',
        noSideEffects: true,
        executionAuthority: false,
      },
    }),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    tryLog: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AiCoreService(
    { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    {
      assertTenantId: jest.fn((v: string) => v),
    } as unknown as TenantContextService,
    {
      assertTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRateLimitService,
    runtime as unknown as AiToolRuntimeService,
    model as unknown as AiCoreModelService,
    audit as unknown as AuditLogService,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
    } as unknown as DashboardPreferencesService,
    {
      tryHandle: jest.fn().mockResolvedValue(null),
    } as unknown as StaffScheduleCommandService,
    new MayaBrainRouterService(),
    orchestration as unknown as C9Orchestrator,
    undefined,
    ci,
    undefined,
    { get: jest.fn().mockReturnValue(timeline) } as unknown as ModuleRef,
  );
  return { service, model, runtime, timeline, orchestration, audit };
}
const dto = (content: string) => ({
  surface: 'web' as const,
  requestId: 'request_occupancy',
  messages: [{ role: 'user' as const, content }],
});
const compoundPlan = (entities: Record<string, string> = {}) =>
  new ConversationIntelligenceService().validatePlan(
    {
      parent_request: 'Обзор бизнеса, окна после отмен и рекомендация',
      tasks: [
        {
          id: 'summary',
          intent: 'analytics.business_summary',
          entities,
          confidence: 0.99,
        },
        {
          id: 'windows',
          intent: 'schedule.review_cancellation_windows',
          entities: {},
          confidence: 0.99,
        },
        {
          id: 'recommendation',
          intent: 'analytics.recommendations',
          entities: {},
          depends_on: ['summary', 'windows'],
          confidence: 0.99,
        },
      ],
    },
    user.role,
    ['analytics.business.query', 'booking.availability.read'],
  );
const compoundDecision = (entities: Record<string, string> = {}) => ({
  provider: 'safe',
  model: 'SCRIPTED_SYNTHETIC',
  reply: '',
  toolCall: null,
  semanticPlan: compoundPlan(entities),
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});

function clientValueDecision(entities: Record<string, string> = {}) {
  const decision = compoundDecision();
  decision.semanticPlan = new ConversationIntelligenceService().validatePlan(
    {
      parent_request: 'Последний финансовый отчёт и давно не приходившие гости',
      tasks: [
        {
          id: 'summary',
          intent: 'analytics.business_summary',
          entities,
          confidence: 0.99,
        },
        {
          id: 'return',
          intent: 'clients.dormant_list',
          entities: {},
          confidence: 0.99,
        },
      ],
    },
    user.role,
    ['analytics.business.query', 'clients.dormant.list'],
  );
  return decision;
}

describe('explicit BI + Lifecycle in current chat (scripted planning only)', () => {
  it('delegates one complete response to C9 without generic source dispatch or another model stage', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(clientValueDecision());
    const out = await f.service.chat(
      user,
      dto(
        'Покажи последний финансовый отчёт и проверь, что известно о давно не приходивших гостях',
      ),
    );
    expect(f.orchestration.reviewBusinessAndClientReturn).toHaveBeenCalledTimes(
      1,
    );
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({
      action: null,
      coordination: { run_id: 'client-value-run' },
      analysis: { synthetic: true },
      recommendation: { canContact: false },
    });
  });
  it('restores the distinct question and original period into a new service before a fresh explicit continuation', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(
      clientValueDecision({ period: 'today', branch: 'named' }),
    );
    const question = await f.service.chat(
      user,
      dto('Покажи отчёт за сегодня по филиалу и кого пора вернуть'),
    );
    expect(question.reply).toContain('до трёх оценок');
    expect(question.reply).not.toContain('отмен');
    expect(
      f.orchestration.reviewBusinessAndClientReturn,
    ).not.toHaveBeenCalled();
    const saved =
      f.timeline.persistAssistantReply.mock.calls[0][0].semanticContext;
    expect(saved).toHaveProperty(
      'ownerReviewClarification.scope',
      'last_published_tenant_finance_and_three_c8_evaluations',
    );
    expect(saved).toHaveProperty('plan.tasks.0.entities', {
      period: 'today',
      branch: 'named',
    });
    const restarted = fixture();
    restarted.timeline.readConversationContext.mockResolvedValue(saved);
    restarted.model.decide.mockResolvedValue(clientValueDecision());
    const out = await restarted.service.chat(user, {
      ...dto('Да, такой ограниченный обзор'),
      conversationId: 'conversation',
    });
    expect(restarted.model.decide.mock.calls).toHaveProperty(
      '0.0.conversationPlan.tasks',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'summary',
          entities: {
            period: 'today',
            branch: expect.stringMatching(/^\[reference removed\]@/) as unknown,
          },
          clarification_question: question.reply,
          requires_clarification: true,
        }),
      ]),
    );
    expect(out.coordination).toMatchObject({ run_id: 'client-value-run' });
    expect(
      restarted.orchestration.reviewBusinessAndClientReturn,
    ).toHaveBeenCalledTimes(1);
    expect(
      restarted.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
  });
  it('withholds both parts when C9 holds the combined request', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(clientValueDecision());
    f.orchestration.reviewBusinessAndClientReturn.mockImplementation(
      (...args: unknown[]) => {
        Object.assign(args[0], {
          runId: 'client-value-run',
          failed: true,
        });
        return Promise.reject(new Error('synthetic current source drift'));
      },
    );
    f.orchestration.finishConversationReads.mockResolvedValue({
      run_id: 'client-value-run',
      state: 'UNCONFIRMED',
    });
    const out = await f.service.chat(
      user,
      dto('Покажи отчёт и проверь давность визитов'),
    );
    expect(out.reply).toContain('Подтверждённого ответа пока нет');
    expect(out).not.toHaveProperty('analysis');
    expect(out).not.toHaveProperty('recommendation');
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });
});
describe('finite owner review compound ingress (synthetic, not real model acceptance)', () => {
  it('delegates the finite plan once to the existing C9 owner and preserves one coherent completion', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(compoundDecision());
    const result = await f.service.chat(
      user,
      dto(
        'Дай общий обзор бизнеса, проверь окна после отмен и предложи следующий шаг',
      ),
    );
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).toHaveBeenCalledTimes(1);
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      action: null,
      coordination: { run_id: 'compound-run', revision: 1 },
      analysis: { synthetic: true },
      recommendation: { noSideEffects: true },
    });
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
  });
  it('asks and persists the exact bounded alternative instead of silently replacing the requested period', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(compoundDecision({ period: 'today' }));
    const result = await f.service.chat(
      user,
      dto(
        'Дай обзор за сегодня, проверь окна после отмен и посоветуй следующий шаг',
      ),
    );
    expect(result.reply).toContain('последний опубликованный финансовый отчёт');
    expect(result.reply).toContain('по всему бизнесу');
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
    expect(f.timeline.persistAssistantReply.mock.calls[0][0]).toMatchObject({
      semanticContext: {
        ownerReviewClarification: { question: result.reply },
      },
    });
  });
  it('returns one explicit incomplete completion when compound work is held after admission', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(compoundDecision());
    f.orchestration.reviewBusinessAndCancellationWindows.mockImplementation(
      (
        turn: Parameters<
          C9Orchestrator['reviewBusinessAndCancellationWindows']
        >[0],
      ) => {
        turn.runId = 'compound-run';
        turn.failed = true;
        return Promise.reject(new Error('synthetic compound settlement loss'));
      },
    );
    // A proposed compound run must never be terminalized as an ordinary read run.
    f.orchestration.finishConversationReads.mockRejectedValue(
      new Error('conversation_read_run_required'),
    );

    const result = await f.service.chat(
      user,
      dto(
        'Дай общий обзор бизнеса, проверь окна после отмен и предложи следующий шаг',
      ),
    );

    expect(result.reply).toBe(
      'Не удалось завершить проверку данных для этого запроса. Подтверждённого ответа пока нет.',
    );
    expect(result).toMatchObject({
      action: null,
      source: 'safe_fallback',
      coordination: { run_id: 'compound-run', state: 'UNCONFIRMED' },
    });
    expect(result).not.toHaveProperty('analysis');
    expect(result).not.toHaveProperty('recommendation');
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).toHaveBeenCalledTimes(1);
    expect(f.orchestration.finishConversationReads).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'compound-run', failed: true }),
    );
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
    expect(f.orchestration.conversationRead).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ reply: result.reply }),
    );
  });
  it.each([
    { branch: 'branch-A' },
    { date_or_period: 'tomorrow' },
    { employee: 'staff-A' },
    { goal: 'fill_every_window' },
    { custom_constraint: 'discount' },
  ])('clarifies unsupported entities before any read: %j', async (entities) => {
    const f = fixture();
    f.model.decide.mockResolvedValue(compoundDecision(entities));
    const out = await f.service.chat(
      user,
      dto(
        'Обзор бизнеса, окна после отмен и рекомендация с дополнительными условиями',
      ),
    );
    expect(out.reply).toContain('Подойдёт такой ограниченный обзор');
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
  });
  it('restores the server question and original requested scope after restart before accepting a newly planned bounded review', async () => {
    const before = fixture();
    before.model.decide.mockResolvedValue(
      compoundDecision({ period: 'today' }),
    );
    const asked = await before.service.chat(
      user,
      dto('Дай обзор за сегодня, окна после отмен и совет'),
    );
    const saved =
      before.timeline.persistAssistantReply.mock.calls[0][0].semanticContext;
    const restarted = fixture();
    restarted.timeline.readConversationContext.mockResolvedValue(saved);
    restarted.model.decide.mockResolvedValue(compoundDecision());
    const result = await restarted.service.chat(user, {
      ...dto('Да, такой ограниченный обзор'),
      conversationId: 'conversation',
    });
    expect(restarted.model.decide).toHaveBeenCalledTimes(1);
    expect(restarted.model.decide.mock.calls).toHaveProperty(
      '0.0.conversationPlan.tasks',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'summary',
          entities: { period: 'today' },
          requires_clarification: true,
          clarification_question: asked.reply,
        }),
      ]),
    );
    expect(
      restarted.orchestration.reviewBusinessAndCancellationWindows,
    ).toHaveBeenCalledTimes(1);
    expect(result.coordination).toMatchObject({ run_id: 'compound-run' });
    expect(restarted.runtime.execute).not.toHaveBeenCalled();
  });
  it('ignores a generic tool proposal inside the finite plan and never dispatches it', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue({
      ...compoundDecision(),
      toolCall: { name: 'analytics.business.query', arguments: {} },
    });
    await f.service.chat(user, dto('Обзор бизнеса и окна после отмен'));
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).toHaveBeenCalledTimes(1);
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });
  it('refuses a late compound purpose switch after an ordinary settled read', async () => {
    const f = fixture();
    f.model.decide
      .mockResolvedValueOnce({
        ...compoundDecision(),
        semanticPlan: null,
        toolCall: {
          name: 'analytics.business.query',
          arguments: { period: 'today', query: 'summary' },
        },
      })
      .mockResolvedValue(compoundDecision());
    f.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'ordinary-read',
      result: { date: '2035-05-10', staff: [] },
    });
    await f.service.chat(user, dto('Посмотри дела в салоне'));
    expect(f.orchestration.conversationRead).toHaveBeenCalledTimes(1);
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
  });
  it.each([
    { surface: 'native' as const },
    { audience: 'client' as const },
    { audience: 'staff' as const },
  ])('cannot delegate a foreign surface or audience: %j', async (scope) => {
    const f = fixture();
    f.model.decide.mockResolvedValue(compoundDecision());
    await f.service.chat(user, {
      ...dto('Обзор бизнеса и окна после отмен'),
      ...scope,
    });
    expect(
      f.orchestration.reviewBusinessAndCancellationWindows,
    ).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });
});
describe('explicit owner chat Occupancy ingress (scripted semantic routing, not real model acceptance)', () => {
  it('handles the canonical explicit command without model or generic tool calls and saves the reply', async () => {
    const f = fixture();
    const result = await f.service.chat(user, dto('Проверь окна после отмен'));
    expect(f.model.decide).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.orchestration.checkCancellationWindows).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: { turnId: 'turn', conversationId: 'conversation' },
      }),
    );
    expect(result).toMatchObject({
      action: null,
      coordination: { revision: 1 },
      recommendation: { executionAuthority: false },
    });
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ reply: result.reply }),
    );
  });
  it('routes a paraphrase from the validated semantic task on the existing first planning pass', async () => {
    const f = fixture();
    const result = await f.service.chat(
      user,
      dto('Посмотри, что освободилось из-за отменённых визитов'),
    );
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.orchestration.checkCancellationWindows).toHaveBeenCalledTimes(1);
    expect(result.coordination).toMatchObject({ scope: 'explicit_occupancy' });
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
  });
  it('does not silently drop a requested branch/date scope', async () => {
    const f = fixture({ date_or_period: 'today', branch: 'named-branch' });
    const result = await f.service.chat(
      user,
      dto('Какие окна освободились после отмен сегодня в филиале?'),
    );
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
    expect(result.reply).toContain('Для отдельного периода, филиала');
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });
  it('refuses a late purpose switch after a settled ordinary read instead of creating a second run', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValueOnce({
      provider: 'safe',
      model: 'SCRIPTED_SYNTHETIC',
      reply: null,
      toolCall: {
        name: 'analytics.business.query',
        arguments: { query: 'summary', period: 'today' },
      },
      semanticPlan: null,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    f.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'read-execution',
      result: { date: '2035-05-10', staff: [] },
    });
    const result = await f.service.chat(
      user,
      dto('Посмотри, что освободилось из-за отменённых визитов'),
    );
    expect(f.orchestration.conversationRead).toHaveBeenCalledTimes(1);
    expect(f.model.decide).toHaveBeenCalledTimes(2);
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
    expect(result.reply).toContain('одну сохранённую возможность');
  });
  it('requires a persisted canonical user turn and cannot synthesize authority', async () => {
    const f = fixture();
    f.timeline.persistTypedTurn.mockResolvedValue(null);
    await expect(
      f.service.chat(user, dto('Проверь окна после отмен')),
    ).rejects.toThrow();
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
    expect(f.model.decide).not.toHaveBeenCalled();
  });
  it('does not route a customer-audience owner into the occupancy business projection', async () => {
    const f = fixture();
    f.model.decide.mockResolvedValue(null);
    await f.service.chat(user, {
      ...dto('Проверь окна после отмен'),
      audience: 'client',
    });
    expect(f.orchestration.checkCancellationWindows).not.toHaveBeenCalled();
  });
});
