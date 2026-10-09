import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelInput, AiCoreModelDecision } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';

/** Real planner JSON validation and AiCore; finite synthetic CRM/runtime owners. */
function fixture(
  options: {
    compound?: boolean;
    field?: string;
    unresolved?: boolean;
    role?: UserRole;
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
    sourceRevision: 'a'.repeat(64),
  };
  const crm = {
    resolveConfiguredBookingBranch: jest.fn().mockResolvedValue(branch),
    resolveBookingBranchPreference: jest.fn().mockResolvedValue(branch),
  };
  const observed = {
    status: 'completed',
    execution_id: 'public-read',
    result: {
      salon: { name: 'CRM public name', address: 'Улица 1' },
      public_scope: {
        contract: 'maya.company-public-profile.read/1',
        projection: 'company_profile',
        branch_id: branch.id,
        source_revision: branch.sourceRevision,
        company_id: '101',
      },
    },
  };
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockResolvedValue(observed);
  const tools = [
    {
      name: 'catalog.staff.read',
      description: 'public catalog',
      input_schema: { type: 'object' },
      risk_tier: 'read' as const,
      approval_policy: 'none' as const,
      idempotency: 'none',
      timeout_ms: 8000,
    },
  ];
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
                id: 'company',
                intent: 'company.public_info',
                entities: {
                  ...(options.unresolved ? {} : { branch: branch.name }),
                  field: options.field ?? 'address',
                },
                confidence: 1,
              },
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: options.unresolved ? ['branch'] : [],
            },
          },
          tool_call: { name: 'catalog.staff.read', arguments: {} },
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
        key === 'AI_CORE_MAX_TOOL_STEPS' ? '1' : undefined,
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
  const actor = {
    userId: 'actor',
    tenantId: 'tenant-current',
    sessionId: 'session',
    email: 'actor@example.test',
    role: options.role ?? UserRole.TENANT_OWNER,
    branchId: null as string | null,
    membershipId: 'membership',
    membershipStatus: 'active',
  };
  return {
    service,
    execute,
    decide,
    observed,
    branch,
    crm,
    actor,
    completion,
    finish: (args: unknown[]) => completionOwner.complete(...args),
    chat: () =>
      service.chat(actor, {
        surface: 'web',
        requestId: 'public_company_request_123',
        messages: [
          { role: 'user', content: 'Какой адрес у филиала Набережная?' },
        ],
      }),
  };
}

describe('explicit branch public company [actual parser, synthetic source]', () => {
  it.each(['denied', 'INCOMPLETE', 'STOPPED'])(
    'withholds verified profile after C9 finalization %s',
    async (state) => {
      const f = fixture();
      await f.chat();
      const args = f.completion.mock.calls[0],
        turn = { runId: 'public-run', failed: false };
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
      expect(f.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('retains missing-field evidence and refuses incomplete C9 finalization', async () => {
    const f = fixture();
    Object.assign(f.observed.result.salon, { address: null });
    Object.assign(f.observed, { replayed: true });
    const response = await f.chat();
    expect(response.grounding.status).toBe('verified');
    expect(response.reply).toContain('Сохранённый результат проверки.');
    expect(response.reply).toContain(
      'В прочитанном профиле CRM этого филиала адрес не указан.',
    );
    const args = f.completion.mock.calls[0],
      turn = { runId: 'public-missing-run', failed: false };
    const results = args[7] as Array<{ name: unknown }>;
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('catalog.staff.read');
    (Reflect.get(f.service, 'readTurns') as WeakMap<object, unknown>).set(
      args[1] as object,
      turn,
    );
    Object.defineProperty(f.service, 'orchestrator', {
      value: {
        finishConversationReads: jest.fn().mockResolvedValue({
          run_id: turn.runId,
          scope: 'deterministic_reads',
          state: 'INCOMPLETE',
        }),
      },
    });
    await expect(f.finish(args)).rejects.toThrow();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it.each([UserRole.TENANT_OWNER, UserRole.CLIENT])(
    'uses one existing C9 tool and exact private source marker for %s',
    async (role) => {
      const f = fixture({ role });
      const response = await f.chat();
      expect(response.grounding.status).toBe('verified');
      expect(response.reply).toContain('Адрес в профиле: Улица 1');
      expect(response.reply).not.toContain('UNVERIFIED_MODEL');
      expect(response.action).toBeNull();
      expect(response).not.toHaveProperty('widget');
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.decide).toHaveBeenCalledTimes(1);
      const call = f.execute.mock.calls[0];
      expect(call[1]).toBe('catalog.staff.read');
      expect(call[2].arguments).toEqual({});
      expect(call[3]).toMatchObject({
        suppressWidgetTrigger: true,
        staffScheduleReadScope: {
          branchId: f.branch.id,
          sourceRevision: f.branch.sourceRevision,
          publicProjection: 'company_profile',
        },
      });
      expect(f.crm.resolveBookingBranchPreference).toHaveBeenCalledWith(
        'tenant-current',
        f.branch.name,
      );
    },
  );
  it.each(['unknown', 'foreign', 'unconfigured'])(
    'does not read or silently enrich %s branch',
    async (kind) => {
      const f = fixture();
      if (kind === 'unknown')
        f.crm.resolveBookingBranchPreference.mockResolvedValue(null);
      if (kind === 'foreign')
        f.crm.resolveBookingBranchPreference.mockResolvedValue({
          ...f.branch,
          id: 'foreign',
        });
      if (kind === 'unconfigured')
        f.crm.resolveConfiguredBookingBranch.mockResolvedValue(null);
      const response = await f.chat();
      expect(response.grounding.status).toBe('blocked');
      expect(response.reply).not.toContain('Улица 1');
      expect(response.reply).toContain(
        kind === 'unknown' ? 'однозначно сопоставить' : 'текущий источник',
      );
      expect(response.reply).not.toContain('Уточните один филиал');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ compound: true }, { unresolved: true }, { field: 'phone' }])(
    'clarifies unsupported requested-branch shape %j before any read',
    async (options) => {
      const f = fixture(options);
      const response = await f.chat();
      expect(response.grounding.status).toBe('blocked');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
    },
  );
  it('propagates branch membership denial without profile reads', async () => {
    const f = fixture();
    f.actor.branchId = 'other';
    await expect(f.chat()).rejects.toThrow(ForbiddenException);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(['stale', 'old-branding', 'wrong-source'])(
    'withholds %s receipt instead of using model prose',
    async (kind) => {
      const f = fixture();
      if (kind === 'stale') Object.assign(f.observed, { stale: true });
      if (kind === 'old-branding')
        Object.assign(f.observed, {
          result: { salon: { address: 'PRIVATE_BRANDING' }, staff: [] },
        });
      if (kind === 'wrong-source')
        f.observed.result.public_scope.source_revision = 'b'.repeat(64);
      const response = await f.chat();
      expect(response.grounding.status).toBe('blocked');
      expect(response.reply).not.toMatch(
        /Улица 1|PRIVATE_BRANDING|UNVERIFIED_MODEL/,
      );
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
  it('distinguishes cached source from a fresh observation', async () => {
    const f = fixture();
    Object.assign(f.observed, { replayed: true });
    const response = await f.chat();
    expect(response.reply).toContain('Сохранённый результат проверки.');
  });
  it.each([409, 403])(
    'retains controlled source refusal or revoked authority %s',
    async (status) => {
      const f = fixture();
      f.execute.mockRejectedValue(
        status === 409
          ? new ConflictException({
              error: { code: 'crm_company_profile_source_unavailable' },
            })
          : new ForbiddenException('revoked'),
      );
      if (status === 403)
        await expect(f.chat()).rejects.toThrow(ForbiddenException);
      else {
        const response = await f.chat();
        expect(response.grounding.status).toBe('blocked');
        expect(response.reply).not.toContain('Улица 1');
      }
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.decide).toHaveBeenCalledTimes(1);
    },
  );
});
