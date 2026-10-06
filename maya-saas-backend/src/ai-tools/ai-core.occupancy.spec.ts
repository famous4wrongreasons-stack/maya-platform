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
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn: jest
      .fn()
      .mockResolvedValue({ turnId: 'turn', conversationId: 'conversation' }),
    persistAssistantReply: jest.fn().mockResolvedValue(undefined),
  };
  const orchestration = {
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
