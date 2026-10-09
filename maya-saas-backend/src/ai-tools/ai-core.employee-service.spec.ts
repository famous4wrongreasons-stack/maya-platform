import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelInput, AiCoreModelDecision } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';

/** Actual CI/parser/AiCore. Runtime and CRM are synthetic component doubles only. */
function fixture(
  options: {
    price?: boolean;
    role?: UserRole;
    maxSteps?: string;
    compound?: boolean;
    missingService?: boolean;
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
  const branch = {
    id: 'branch-current',
    name: 'Набережная',
    timezone: 'Europe/Moscow',
    sourceRevision: 'b'.repeat(64),
  };
  const source = {
    provider: 'yclients',
    staffId: 'local-staff',
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
  const catalog = {
    status: 'completed',
    execution_id: 'staff-execution',
    result: { staff: [{ id: '71', name: 'Артём' }] },
  };
  const services = {
    status: 'completed',
    execution_id: 'services-execution',
    result: {
      contract: 'maya.service-catalog.read/1',
      source: 'external_crm',
      scope: 'public_booking_catalog',
      as_of: '2026-10-09T12:00:00.000Z',
      catalog_exhaustive: false,
      services: [
        {
          id: '81',
          name: 'Стрижка',
          price: 2000,
          price_min: 2000,
          price_max: 2000,
          duration_minutes: 30,
          currency: 'RUB',
          category: null,
          limitations: [],
        },
      ],
      read_scope: {
        contract: 'maya.staff-service-catalog.read/1',
        branch_id: branch.id,
        source_revision: branch.sourceRevision,
        source_hash: source.sourceHash,
        staff_id: '71',
      },
    },
  };
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockImplementation((_user, name) =>
      Promise.resolve(name === 'catalog.staff.read' ? catalog : services),
    );
  const tools = ['catalog.staff.read', 'catalog.services.read'].map((name) => ({
    name,
    description: name,
    input_schema: { type: 'object' },
    risk_tier: 'read' as const,
    approval_policy: 'none' as const,
    idempotency: 'none',
    timeout_ms: 8000,
  }));
  const decide = jest.fn(
    (input: AiCoreModelInput): Promise<AiCoreModelDecision> => {
      const parsed = parser.validatePlanningResponse(
        JSON.stringify({
          semantic_plan: {
            dialogue_act: options.compound ? 'compound_request' : 'request',
            tasks: [
              ...(options.compound
                ? [
                    {
                      id: 'staff',
                      intent: 'employees.list_public',
                      entities: {},
                      confidence: 1,
                    },
                  ]
                : []),
              {
                id: 'services',
                intent: options.price ? 'services.price' : 'services.list',
                entities: {
                  employee: 'Артём',
                  branch: branch.name,
                  ...(options.price && !options.missingService
                    ? { service: 'Стрижка' }
                    : {}),
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
          // Missing required service is a clarification, not a tool dispatch.
          tool_call: options.missingService
            ? null
            : { name: 'catalog.services.read', arguments: {} },
        }),
        input,
      );
      if (options.missingService) {
        expect(parsed.toolCall).toBeNull();
        expect(parsed.semanticPlan?.tasks[0].requires_clarification).toBe(true);
      }
      return Promise.resolve({
        ...parsed,
        reply: 'UNVERIFIED_MODEL_TEXT_99999',
        provider: 'deepseek',
        model: 'SCRIPTED_VALIDATED_PLAN',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    },
  );
  const service = new AiCoreService(
    {
      get: (key: string) =>
        key === 'AI_CORE_MAX_TOOL_STEPS'
          ? (options.maxSteps ?? '2')
          : undefined,
    } as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
    { listTools: jest.fn().mockResolvedValue({ tools }), execute } as never,
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
  const dto = {
    surface: 'web' as const,
    requestId: 'employee_services_request_123',
    messages: [
      {
        role: 'user' as const,
        content: options.missingService
          ? 'Сколько стоит услуга у Артёма в филиале Набережная?'
          : options.price
            ? 'Сколько стоит стрижка у Артёма в филиале Набережная?'
            : 'Какие услуги есть у Артёма в филиале Набережная?',
      },
    ],
  };
  return {
    service,
    execute,
    decide,
    crm,
    branch,
    source,
    catalog,
    services,
    completion,
    dto,
    finish: (args: unknown[]) => completionOwner.complete(...args),
    chat: () =>
      service.chat(
        {
          userId: 'actor',
          tenantId: 'tenant-current',
          sessionId: 'session',
          email: 'actor@example.test',
          role: options.role ?? UserRole.TENANT_OWNER,
          branchId: null,
          membershipId: 'membership',
          membershipStatus: 'active',
        },
        dto,
      ),
  };
}
describe('AiCore employee services [actual parser, synthetic owners]', () => {
  it.each([UserRole.TENANT_OWNER, UserRole.CLIENT])(
    'reads selected staff services for existing role %s without second model or mutation',
    async (role) => {
      const f = fixture({ role });
      const result = await f.chat();
      expect(result.grounding.status).toBe('verified');
      expect(result.action).toBeNull();
      expect(result.reply).toContain('Стрижка: 2000 RUB; 30 мин');
      expect(result.reply).not.toContain('UNVERIFIED_MODEL');
      expect(result.resolution).toBeUndefined();
      expect(result.widget).toBeUndefined();
      expect(result.widget_data).toBeUndefined();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
        'catalog.staff.read',
        'catalog.services.read',
      ]);
      for (const call of f.execute.mock.calls) {
        expect(call[2].arguments).toEqual({});
        expect(call[3]?.suppressWidgetTrigger).toBe(true);
      }
      expect(f.execute.mock.calls[1][3]?.staffScheduleReadScope).toEqual({
        branchId: f.branch.id,
        sourceRevision: f.branch.sourceRevision,
        staffSource: f.source,
      });
      expect(
        new Set(f.execute.mock.calls.map((call) => call[2].idempotencyKey))
          .size,
      ).toBe(2);
    },
  );
  it('answers exact selected service price from the scoped result', async () => {
    const f = fixture({ price: true });
    const result = await f.chat();
    expect(result.grounding.status).toBe('verified');
    expect(result.reply).toContain('2000 RUB');
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it.each(['budget', 'compound', 'missing-service'])(
    'does not fall through to general catalog for %s',
    async (kind) => {
      const f = fixture({
        maxSteps: kind === 'budget' ? '1' : '2',
        compound: kind === 'compound',
        price: kind === 'missing-service',
        missingService: kind === 'missing-service',
      });
      const result = await f.chat();
      expect(result.grounding.status).toBe('blocked');
      expect(result.reply).not.toContain('2000');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it('never selects the first duplicate staff', async () => {
    const f = fixture();
    f.catalog.result.staff.push({ id: '72', name: 'Артём' });
    const result = await f.chat();
    expect(result.grounding.status).toBe('blocked');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(result.reply).not.toContain('2000');
  });
  it('withholds a failed current source without retry or aggregate fallback', async () => {
    const f = fixture();
    f.crm.resolveStaffScheduleSource.mockRejectedValue(
      new ConflictException({
        error: { code: 'staff_schedule_source_unavailable' },
      }),
    );
    const result = await f.chat();
    expect(result.grounding.status).toBe('blocked');
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).not.toContain('2000');
  });
  it('propagates revocation instead of changing it into missing service data', async () => {
    const f = fixture();
    f.crm.resolveStaffScheduleSource.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(f.chat()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it.each(['denied', 'INCOMPLETE', 'STOPPED'])(
    'requires C9 completion for verified result: %s',
    async (state) => {
      const f = fixture();
      await f.chat();
      const args = f.completion.mock.calls[0];
      const turn = { runId: 'services-run', failed: false };
      (Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>).set(
        args[1] as object,
        turn,
      );
      Reflect.set(f.service, 'orchestrator', {
        finishConversationReads: jest
          .fn()
          .mockResolvedValue({ run_id: turn.runId, state }),
      });
      await expect(f.finish(args)).rejects.toMatchObject({
        response: { error: { code: 'conversation_history_unavailable' } },
      });
    },
  );
  it('does not swallow final C9 authority failure', async () => {
    const f = fixture();
    await f.chat();
    const args = f.completion.mock.calls[0];
    (Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>).set(
      args[1] as object,
      { runId: 'services-run' },
    );
    Reflect.set(f.service, 'orchestrator', {
      finishConversationReads: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    });
    await expect(f.finish(args)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('retains observed empty as verified evidence requiring C9 completion', async () => {
    const f = fixture();
    f.services.result.services = [];
    const result = await f.chat();
    expect(result.grounding.status).toBe('verified');
    expect(result.reply).toContain('услуги не возвращены');
    expect(result.reply).not.toContain('услуг нет');
    const args = f.completion.mock.calls[0];
    expect((args[7] as Array<{ name: string }>).map((r) => r.name)).toContain(
      'catalog.services.read',
    );
    (Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>).set(
      args[1] as object,
      { runId: 'services-run' },
    );
    Reflect.set(f.service, 'orchestrator', {
      finishConversationReads: jest
        .fn()
        .mockResolvedValue({ state: 'INCOMPLETE' }),
    });
    await expect(f.finish(args)).rejects.toMatchObject({
      response: { error: { code: 'conversation_history_unavailable' } },
    });
  });
});
