import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelInput, AiCoreModelDecision } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';

/** Scripted planning JSON through the actual model parser and CI validator.
 * Runtime/CRM are finite component doubles, not provider or HTTP acceptance. */
function fixture(twoTasks = false, maxSteps = '2', unresolved: string[] = []) {
  const ci = new ConversationIntelligenceService();
  const parser = Object.create(AiCoreModelService.prototype) as {
    validatePlanningResponse(
      output: string,
      input: AiCoreModelInput,
    ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
  };
  Object.defineProperty(parser, 'conversationIntelligence', { value: ci });
  const branch = {
    id: 'branch-active',
    name: 'Набережная',
    timezone: 'Europe/Moscow',
    sourceRevision: 'b'.repeat(64),
  };
  const source = {
    provider: 'yclients',
    staffId: 'staff-internal',
    externalStaffId: '71',
    branchId: branch.id,
    timezone: branch.timezone,
    sourceHash: 'a'.repeat(64),
  };
  const crm = {
    resolveConfiguredBookingBranch: jest.fn().mockResolvedValue(branch),
    resolveBookingBranchPreference: jest.fn().mockResolvedValue(branch),
    resolveStaffScheduleSource: jest.fn().mockResolvedValue(source),
  };
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockImplementation((_user, name, dto) => {
      if (name === 'catalog.staff.read')
        return Promise.resolve({
          status: 'completed',
          execution_id: 'catalog-execution',
          result: { staff: [{ id: '71', name: 'Артём' }] },
        });
      if (name === 'staff.schedule.read')
        return Promise.resolve({
          status: 'completed',
          execution_id: 'schedule-execution',
          result: {
            verified: true,
            date: dto.arguments.date,
            staff: [
              {
                id: '71',
                name: 'Артём',
                is_working: true,
                slots: [{ from: '10:00', to: '20:00' }],
              },
            ],
            read_scope: {
              contract: 'maya.staff-schedule-read/1',
              branch_id: branch.id,
              timezone: branch.timezone,
              source_hash: source.sourceHash,
              staff_id: '71',
            },
          },
        });
      throw new Error('unexpected tool');
    });
  const tools = ['catalog.staff.read', 'staff.schedule.read'].map((name) => ({
    name,
    description: name,
    input_schema: { type: 'object' },
    risk_tier: 'read' as const,
    approval_policy: 'none' as const,
    idempotency: 'none',
    timeout_ms: 8000,
  }));
  const listTools = jest.fn().mockResolvedValue({ tools });
  const decide = jest.fn(
    (input: AiCoreModelInput): Promise<AiCoreModelDecision> => {
      const parsed = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: twoTasks ? 'compound_request' : 'request',
            tasks: [
              ...(twoTasks
                ? [
                    {
                      id: 'catalog',
                      intent: 'employees.list_public',
                      entities: {},
                      confidence: 1,
                    },
                  ]
                : []),
              {
                id: 'schedule',
                intent: 'schedule.get_team',
                entities: { employee: 'Артём', date_or_period: 'tomorrow' },
                depends_on: twoTasks ? ['catalog'] : [],
                confidence: 1,
                requires_clarification: unresolved.length > 0,
              },
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: unresolved,
            },
          },
          tool_call: unresolved.length
            ? null
            : twoTasks
              ? { name: 'catalog.staff.read', arguments: {} }
              : {
                  name: 'staff.schedule.read',
                  arguments: {
                    date: '1999-01-01',
                    staff_id: 'untrusted-model-id',
                  },
                },
        }),
        input,
      );
      return Promise.resolve({
        ...parsed,
        reply: 'UNVERIFIED_MODEL_99999',
        provider: 'deepseek',
        model: 'scripted-local-parser',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    },
  );
  const service = new AiCoreService(
    {
      get: (key: string) =>
        key === 'AI_CORE_MAX_TOOL_STEPS' ? maxSteps : undefined,
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
        config: {
          enabled_capabilities: ['staff_operations', 'schedule_management'],
        },
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
    undefined,
    crm as never,
  );
  const completionOwner = service as unknown as {
    complete(...args: unknown[]): Promise<unknown>;
  };
  const completion = jest.spyOn(completionOwner, 'complete');
  return {
    service,
    completion,
    finish: (args: unknown[]) => completionOwner.complete(...args),
    execute,
    decide,
    branch,
    source,
    crm,
    plan: () =>
      (
        completion.mock.calls.at(-1)?.[5] as AiCoreModelDecision[] | undefined
      )?.at(-1)?.semanticPlan,
    chat: () =>
      service.chat(
        {
          userId: 'owner',
          tenantId: 'tenant-current',
          sessionId: 'session',
          email: 'owner@example.test',
          role: UserRole.TENANT_OWNER,
          branchId: null,
          membershipId: 'membership-current',
          membershipStatus: 'active',
        },
        {
          surface: 'web',
          requestId: 'employee_schedule_request_123',
          messages: [{ role: 'user', content: 'Артём завтра работает?' }],
        },
      ),
  };
}

describe('AiCore explicit employee schedule [actual parser, synthetic sources]', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-10-09T22:30:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());
  it.each([false, true])(
    'runs bounded existing READ pair after actual parser (catalog dependency=%s)',
    async (two) => {
      const f = fixture(two);
      const reply = await f.chat();
      expect(reply.reply).toContain('11.10.2026: Артём — 10:00–20:00');
      expect(reply.reply).toContain('Набережная');
      expect(reply.reply).not.toContain('UNVERIFIED_MODEL');
      expect(reply.grounding.status).toBe('verified');
      expect(reply.action).toBeNull();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.execute).toHaveBeenCalledTimes(2);
      expect(f.execute).toHaveBeenLastCalledWith(
        expect.anything(),
        'staff.schedule.read',
        expect.objectContaining({
          arguments: { date: '2026-10-11', staff_id: '71' },
        }),
        {
          suppressWidgetTrigger: true,
          staffScheduleReadScope: {
            branchId: f.branch.id,
            sourceRevision: f.branch.sourceRevision,
            staffSource: f.source,
          },
        },
      );
      expect(f.plan()?.tasks.at(-1)?.entities).toMatchObject({
        employee: 'Артём',
        branch: 'Набережная',
        date_or_period: '2026-10-11',
      });
    },
  );
  it('bounds source-unavailable to one model call and no second tool', async () => {
    const f = fixture();
    f.crm.resolveStaffScheduleSource.mockRejectedValue(
      new ConflictException({
        error: { code: 'staff_schedule_source_unavailable' },
      }),
    );
    const result = await f.chat();
    expect(result.grounding.status).toBe('blocked');
    expect(result.reply).not.toContain('10:00');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it('does not downgrade revoked or foreign tenant authority to missing data', async () => {
    const f = fixture();
    f.crm.resolveConfiguredBookingBranch.mockRejectedValue(
      new ForbiddenException('foreign_tenant'),
    );
    await expect(f.chat()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('does not claim schedule when read budget is insufficient', async () => {
    const f = fixture(false, '1');
    const result = await f.chat();
    expect(result.grounding.status).toBe('blocked');
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it('does not replace unresolved branch in actual CI with the configured branch', async () => {
    const f = fixture(false, '2', ['branch']);
    const result = await f.chat();
    expect(result.grounding.status).toBe('blocked');
    expect(result.reply).toContain('Уточните филиал');
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
  });
  it('clears only the finite resolved references after the current employee owner succeeds', async () => {
    const f = fixture(false, '2', ['employee']);
    const result = await f.chat();
    expect(result.grounding.status).toBe('verified');
    expect(f.plan()?.context.unresolved_references).toEqual([]);
    expect(f.plan()?.tasks[0].requires_clarification).toBe(false);
  });
  it.each(['denied', 'INCOMPLETE', 'STOPPED'])(
    'withholds the reply when C9 finalization is %s',
    async (state) => {
      const f = fixture();
      await f.chat();
      const args = f.completion.mock.calls[0];
      const turn = { runId: 'run-current', failed: false };
      (Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>).set(
        args[1] as object,
        turn,
      );
      const finish =
        state === 'denied'
          ? jest.fn().mockRejectedValue(new ForbiddenException('revoked'))
          : jest.fn().mockResolvedValue({
              run_id: turn.runId,
              scope: 'deterministic_reads',
              state,
            });
      Object.defineProperty(f.service, 'orchestrator', {
        value: { finishConversationReads: finish },
      });
      await expect(f.finish(args)).rejects.toThrow();
      expect(finish).toHaveBeenCalledWith(turn);
      expect(f.execute).toHaveBeenCalledTimes(2);
    },
  );
});
