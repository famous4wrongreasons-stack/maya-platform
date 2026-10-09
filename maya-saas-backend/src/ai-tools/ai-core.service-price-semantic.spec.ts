import { ConfigService } from '@nestjs/config';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { C9Orchestrator } from '../orchestration/c9.orchestrator';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision, AiCoreModelInput } from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';
import { bindServicePriceChat } from './service-price-chat-binding';

// Actual structured parser, CI, binding and AiCore. Scripted decisions and
// finite runtime/C9/timeline ports are synthetic; no provider/model/AE/SQL or
// real approval widget acceptance is claimed by these component tests.
const READ = 'catalog.services.read';
const WRITE = 'catalog.service.price.update';
const TITLE = 'Мужская стрижка';
const PREPARE = `Подготовь изменение цены услуги «${TITLE}» на 1500 рублей`;
const CORRECTION = 'Нет, 1600 рублей';
const ci = new ConversationIntelligenceService();
const model = new AiCoreModelService(new ConfigService(), ci);
const tools = [READ, WRITE].map((name) => ({
  name,
  description: name,
  input_schema: { type: 'object' },
  risk_tier: name === WRITE ? 'high_write' : 'read',
  approval_policy: name === WRITE ? 'owner' : 'none',
}));
const catalog = {
  services: [
    { id: '81', name: TITLE, price: 2000 },
    { id: '82', name: 'Оформление бороды', price: 900 },
  ],
};
const forgedArguments = {
  service_id: '82',
  price_rubles: 9999,
  company_id: 'untrusted-model-company',
};

type PlanOptions = {
  intent?: string;
  entities?: Record<string, unknown>;
  tool?: { name: string; arguments: Record<string, unknown> } | null;
  dialogueAct?: string;
  carried?: string[];
  replaced?: string[];
};
function wire(options: PlanOptions = {}) {
  const tool =
    options.tool === undefined
      ? { name: WRITE, arguments: forgedArguments }
      : options.tool;
  return JSON.stringify({
    semantic_plan: {
      parent_request: PREPARE,
      language: 'ru',
      dialogue_act: options.dialogueAct ?? 'request',
      tasks: [
        {
          id: 'price',
          intent: options.intent ?? 'services.price_update',
          entities_json: JSON.stringify(
            options.entities ?? { service: TITLE, requested_price: 1500 },
          ),
          depends_on: [],
          confidence: 1,
          requires_clarification: false,
          clarification_question: null,
        },
      ],
      context: {
        carried_slots: options.carried ?? [],
        replaced_slots: options.replaced ?? [],
        unresolved_references: [],
      },
    },
    tool_call: tool
      ? { name: tool.name, arguments_json: JSON.stringify(tool.arguments) }
      : null,
  });
}
function input(
  role = UserRole.TENANT_OWNER,
  previous: ConversationSemanticPlan | null = null,
  text = PREPARE,
): AiCoreModelInput {
  return {
    surface: 'web',
    persona: 'director',
    principalRole: role,
    messages: [{ role: 'user', content: text }],
    tools,
    toolResults: [],
    allowToolCall: true,
    requiredToolNames: [],
    conversationPlan: previous,
  };
}
const parse = (options: PlanOptions = {}, source = input()) =>
  model['validatePlanningResponse'](wire(options), source);

describe('service price update semantic contract [actual parser/CI]', () => {
  it.each([UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER])(
    'routes %s only to the existing high-risk price preparation tool',
    (role) => {
      const parsed = parse({}, input(role));
      expect(parsed.semanticPlan.tasks[0]).toMatchObject({
        intent: 'services.price_update',
        action: 'write',
        data_class: 'E',
        risk: 'high',
        permission: { required: WRITE, status: 'allowed' },
        tool: { name: WRITE, alternatives: [WRITE], status: 'ready' },
        requires_confirmation: true,
        requires_clarification: false,
        entities: { service: TITLE, requested_price: 1500 },
      });
      expect(parsed.toolCall).toEqual({
        name: WRITE,
        arguments: forgedArguments,
      });
      const advertised = ci
        .plannerContract(role, [READ, WRITE])
        .intents.find((entry) => entry.intent === 'services.price_update');
      expect(advertised?.required_slots).toEqual([
        'service',
        'requested_price',
      ]);
      expect(advertised?.ready_tools).toEqual([WRITE]);
    },
  );

  it.each(
    Object.values(UserRole).filter(
      (role) =>
        role !== UserRole.TENANT_OWNER && role !== UserRole.BUSINESS_OWNER,
    ),
  )('denies %s even if a caller advertises the write tool', (role) => {
    const parsed = parse({ tool: null }, input(role));
    expect(parsed.toolCall).toBeNull();
    expect(parsed.semanticPlan.tasks[0]).toMatchObject({
      intent: 'services.price_update',
      data_class: 'F',
      permission: { status: 'denied' },
      tool: { status: 'not_available', alternatives: [] },
      requires_confirmation: false,
    });
    expect(() => parse({}, input(role))).toThrow(
      'conversation_tool_plan_mismatch',
    );
  });

  it('keeps services.price a READ and rejects using that plan to prepare a write', () => {
    const options = { intent: 'services.price', entities: { service: TITLE } };
    const parsed = parse({ ...options, tool: { name: READ, arguments: {} } });
    expect(parsed.semanticPlan.tasks[0]).toMatchObject({
      action: 'read',
      data_class: 'C',
      tool: { name: READ },
      requires_confirmation: false,
    });
    expect(() => parse(options)).toThrow('conversation_tool_plan_mismatch');
  });

  it.each([
    { label: 'price', entities: { service: TITLE } },
    { label: 'service', entities: { requested_price: 1500 } },
    { label: 'both', entities: {} },
  ])(
    'clarifies missing $label even when model arguments contain an ID and price',
    ({ entities }) => {
      const parsed = parse({ entities, tool: null });
      expect(parsed.toolCall).toBeNull();
      expect(parsed.semanticPlan.tasks[0].requires_clarification).toBe(true);
      expect(parsed.semanticPlan.tasks[0].clarification_question).toEqual(
        expect.any(String),
      );
      expect(parsed.semanticPlan.tasks[0].entities).toEqual(entities);
      expect(() => parse({ entities })).toThrow(
        'conversation_tool_plan_mismatch',
      );
    },
  );

  it('does not substitute a catalog READ when the existing write capability is unavailable', () => {
    const source = {
      ...input(),
      tools: tools.filter((tool) => tool.name === READ),
    };
    const parsed = parse({ tool: null }, source);
    expect(parsed.semanticPlan.tasks[0].tool).toMatchObject({
      status: 'not_available',
      alternatives: [],
    });
    expect(parsed.toolCall).toBeNull();
    expect(() =>
      parse({ tool: { name: READ, arguments: {} } }, source),
    ).toThrow('conversation_tool_plan_mismatch');
  });

  it('uses explicit model-carried service as a preference while binding corrected price only from actual user messages', () => {
    const previous = parse().semanticPlan;
    const corrected = parse(
      {
        dialogueAct: 'correction',
        entities: { service: TITLE, requested_price: 1600 },
        carried: ['service'],
        replaced: ['requested_price'],
      },
      input(UserRole.TENANT_OWNER, previous, CORRECTION),
    );
    expect(corrected.semanticPlan.tasks[0].entities).toEqual({
      service: TITLE,
      requested_price: 1600,
    });
    expect(corrected.semanticPlan.context.carried_slots).toContain('service');
    expect(corrected.semanticPlan.context.replaced_slots).toContain(
      'requested_price',
    );
    expect(corrected.toolCall?.arguments).toEqual(forgedArguments);
    expect(
      bindServicePriceChat({
        userMessages: [PREPARE, CORRECTION],
        serviceSource: catalog,
      }),
    ).toEqual({
      kind: 'resolved',
      arguments: { service_id: '81', price_rubles: 1600 },
    });
    expect(
      bindServicePriceChat({
        userMessages: [CORRECTION],
        serviceSource: catalog,
      }).kind,
    ).toBe('clarify');
    expect(
      bindServicePriceChat({
        userMessages: [`Сколько стоит услуга «${TITLE}»?`, CORRECTION],
        serviceSource: catalog,
      }).kind,
    ).toBe('clarify');
  });

  it('does not fill a missing current semantic service from tool arguments or an unrelated previous READ', () => {
    const previous = parse({
      intent: 'services.price',
      entities: { service: TITLE },
      tool: { name: READ, arguments: {} },
    }).semanticPlan;
    const parsed = parse(
      {
        dialogueAct: 'correction',
        entities: { requested_price: 1600 },
        tool: null,
      },
      input(UserRole.TENANT_OWNER, previous, CORRECTION),
    );
    expect(parsed.semanticPlan.tasks[0].requires_clarification).toBe(true);
    expect(parsed.semanticPlan.tasks[0].entities).not.toHaveProperty('service');
    expect(parsed.toolCall).toBeNull();
  });

  it('does not convert an inflected corpus title into a literal authoritative selection', () => {
    const parsed = parse();
    expect(parsed.semanticPlan.tasks[0].entities.service).toBe(TITLE);
    expect(
      bindServicePriceChat({
        userMessages: [
          'Подготовь изменение цены мужской стрижки на 1500 рублей',
        ],
        serviceSource: catalog,
      }),
    ).toEqual({ kind: 'clarify', reason: 'exact_service_required' });
  });
});

function chatFixture(
  messages: string[],
  options: {
    stale?: boolean;
    corrected?: boolean;
    continuation?: boolean;
  } = {},
) {
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockImplementation((_actor, name) => {
      if (name === READ)
        return Promise.resolve({
          status: 'completed',
          execution_id: 'synthetic-catalog-read',
          stale: options.stale ?? false,
          result: catalog,
        });
      if (name === WRITE)
        return Promise.resolve({
          status: 'approval_required',
          approval: {
            id: 'synthetic-price-approval',
            summary: 'SYNTHETIC: требуется подтверждение цены.',
          },
        });
      throw new Error('unexpected_synthetic_tool');
    });
  const decide = jest.fn(
    (source: AiCoreModelInput): Promise<AiCoreModelDecision> =>
      Promise.resolve({
        ...model['validatePlanningResponse'](
          wire(
            options.continuation
              ? (() => {
                  const text = source.messages.at(-1)?.content ?? '';
                  if (text.includes('Подготовь'))
                    return { entities: { requested_price: 9999 }, tool: null };
                  return text.includes('1600')
                    ? {
                        dialogueAct: 'correction',
                        entities: { requested_price: 1600 },
                      }
                    : {
                        dialogueAct: 'clarification',
                        entities: { service: TITLE },
                        ...(source.conversationPlan ? {} : { tool: null }),
                      };
                })()
              : {
                  entities: {
                    service: TITLE,
                    requested_price: options.corrected ? 1600 : 1500,
                  },
                  dialogueAct: options.corrected ? 'correction' : 'request',
                },
          ),
          source,
        ),
        reply: 'UNVERIFIED_SCRIPTED_TEXT',
        provider: 'deepseek',
        model: 'SCRIPTED_SYNTHETIC',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
  );
  let savedContext: unknown = null;
  let sourceRevision = 'a'.repeat(64);
  const timeline = {
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn: jest.fn().mockResolvedValue({
      turnId: 'price-turn',
      conversationId: 'price-conversation',
    }),
    persistAssistantReply: jest
      .fn()
      .mockImplementation((value: { semanticContext: unknown }) => {
        savedContext = JSON.parse(JSON.stringify(value.semanticContext));
        return Promise.resolve();
      }),
    readConversationContext: jest
      .fn()
      .mockImplementation(() => Promise.resolve(savedContext)),
  };
  const c9 = {
    conversationDigest: () => 'a'.repeat(64),
    conversationRead: jest.fn(
      (...args: Parameters<C9Orchestrator['conversationRead']>) => args[4](),
    ),
    finishConversationReads: jest.fn().mockResolvedValue(null),
  };
  const makeService = () =>
    new AiCoreService(
      {
        get: (key: string) =>
          key === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
      } as never,
      { assertTenantId: (tenant: string) => tenant } as never,
      { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
      { listTools: jest.fn().mockResolvedValue({ tools }), execute } as never,
      { decide } as never,
      { log: jest.fn(), tryLog: jest.fn() } as never,
      {
        getAssistant: jest.fn().mockResolvedValue({
          config: { enabled_capabilities: ['business_analytics'] },
        }),
      } as never,
      { tryHandle: jest.fn().mockResolvedValue(null) } as never,
      new MayaBrainRouterService(),
      c9 as never,
      undefined,
      ci,
      undefined,
      { get: () => timeline } as never,
      {
        servicePriceReadIdentity: jest
          .fn()
          .mockImplementation(() => Promise.resolve(sourceRevision)),
      } as never,
    );
  let service = makeService();
  const actor = {
    userId: 'owner',
    tenantId: 'tenant',
    sessionId: 'session',
    role: UserRole.TENANT_OWNER,
    email: 'synthetic@example.test',
    branchId: null,
    membershipId: 'membership',
    membershipStatus: 'active',
  };
  return {
    execute,
    decide,
    c9,
    timeline,
    restart: () => {
      service = makeService();
    },
    changeSource: () => {
      sourceRevision = 'b'.repeat(64);
    },
    saved: () => savedContext,
    chat: (turns = messages, resumed = false) =>
      service.chat(actor, {
        surface: 'web',
        requestId: 'price_semantic_request_123',
        ...(resumed ? { conversationId: 'price-conversation' } : {}),
        messages: turns.map((content) => ({
          role: 'user' as const,
          content,
        })),
      }),
  };
}

describe('AiCore price preparation [actual semantic parser, synthetic owners]', () => {
  it.each([false, true])(
    'binds literal raw intent and current catalog; correction=%s',
    async (corrected) => {
      const f = chatFixture(corrected ? [PREPARE, CORRECTION] : [PREPARE], {
        corrected,
      });
      if (corrected) {
        await f.chat([PREPARE]);
        f.execute.mockClear();
        f.decide.mockClear();
        f.timeline.persistAssistantReply.mockClear();
      }
      const result = await f.chat(
        corrected ? [CORRECTION] : [PREPARE],
        corrected,
      );
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
        READ,
        WRITE,
      ]);
      const preparation = f.execute.mock.calls.find(
        (call) => call[1] === WRITE,
      );
      expect(preparation?.[2].arguments).toEqual({
        service_id: '81',
        price_rubles: corrected ? 1600 : 1500,
      });
      expect(preparation?.[3]?.userTurn).toEqual({
        turnId: 'price-turn',
        conversationId: 'price-conversation',
      });
      expect(f.execute.mock.calls[0][3]?.suppressWidgetTrigger).toBe(true);
      expect(result.action).toMatchObject({
        status: 'approval_required',
        approval: { id: 'synthetic-price-approval' },
      });
      expect(result.reply).toBe('SYNTHETIC: требуется подтверждение цены.');
      expect(result.reply).not.toContain('UNVERIFIED_SCRIPTED_TEXT');
      expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      label: 'inflected title',
      text: 'Подготовь изменение цены мужской стрижки на 1500 рублей',
      stale: false,
    },
    { label: 'stale catalog', text: PREPARE, stale: true },
  ])(
    '$label cannot prepare a change using model service or amount',
    async ({ text, stale }) => {
      const f = chatFixture([text], { stale });
      const result = await f.chat();
      expect(f.decide).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.calls.map((call) => call[1])).toEqual([READ]);
      expect(result.action).toBeNull();
      expect(result.reply).not.toContain('UNVERIFIED_SCRIPTED_TEXT');
      expect(result.reply).not.toContain('9999');
    },
  );
});

describe('server-owned pricing clarification continuation', () => {
  it('preserves the raw price through service-only clarification, a new AiCore instance, and price-only correction', async () => {
    const f = chatFixture([], { continuation: true });
    const first = await f.chat([
      'Подготовь изменение цены мужской стрижки на 1500 рублей.',
    ]);
    expect(first.action).toBeNull();
    expect(first.reply).toContain('1\u00a0500');
    expect(first.reply.match(/\?/g)).toHaveLength(1);
    expect(f.saved()).toMatchObject({
      servicePrice: { requestedPrice: 1500, service: null },
    });
    f.restart();
    const clarified = await f.chat([TITLE], true);
    expect(clarified.action?.status).toBe('approval_required');
    expect(
      f.execute.mock.calls.filter((call) => call[1] === WRITE).at(-1)?.[2]
        .arguments,
    ).toEqual({ service_id: '81', price_rubles: 1500 });
    expect(f.saved()).toMatchObject({
      servicePrice: {
        requestedPrice: 1500,
        service: { id: '81', name: TITLE },
      },
    });
    f.restart();
    const corrected = await f.chat(['Нет, на 1600 рублей.'], true);
    expect(corrected.action?.status).toBe('approval_required');
    expect(
      f.execute.mock.calls.filter((call) => call[1] === WRITE).at(-1)?.[2]
        .arguments,
    ).toEqual({ service_id: '81', price_rubles: 1600 });
    expect(
      f.execute.mock.calls
        .filter((call) => call[1] === WRITE)
        .map((call) => call[3]),
    ).toEqual([
      expect.objectContaining({ servicePriceSourceRevision: 'a'.repeat(64) }),
      expect.objectContaining({ servicePriceSourceRevision: 'a'.repeat(64) }),
    ]);
  });

  it('cannot dispatch a restored preference through a compound plan without binding this turn', async () => {
    const f = chatFixture([], { continuation: true });
    await f.chat(['Подготовь изменение цены мужской стрижки на 1500 рублей.']);
    await f.chat([TITLE], true);
    f.execute.mockClear();
    f.decide.mockImplementation((source) => {
      const candidate = JSON.parse(wire()) as {
        semantic_plan: { tasks: unknown[] };
      };
      candidate.semantic_plan.tasks.push({
        id: 'other',
        intent: 'services.price',
        entities_json: JSON.stringify({ service: TITLE }),
        confidence: 1,
      });
      return Promise.resolve({
        ...model['validatePlanningResponse'](JSON.stringify(candidate), source),
        reply: 'SCRIPTED',
        provider: 'openai',
        model: 'synthetic-compound-price-attempt',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
    await expect(f.chat(['Расскажи про услуги'], true)).rejects.toThrow();
    expect(f.execute.mock.calls.some((call) => call[1] === WRITE)).toBe(false);
  });

  it('does not revive the old amount from caller history after current source changed', async () => {
    const f = chatFixture([], { continuation: true });
    await f.chat(['Подготовь изменение цены мужской стрижки на 1500 рублей.']);
    f.restart();
    f.changeSource();
    const result = await f.chat([PREPARE, TITLE], true);
    expect(result.action).toBeNull();
    expect(
      f.execute.mock.calls.filter((call) => call[1] === WRITE),
    ).toHaveLength(0);
    expect(f.saved()).not.toHaveProperty('servicePrice');
    const reads = f.execute.mock.calls.filter((call) => call[1] === READ);
    expect(reads[0][2].idempotencyKey).not.toBe(reads[1][2].idempotencyKey);
  });
});
