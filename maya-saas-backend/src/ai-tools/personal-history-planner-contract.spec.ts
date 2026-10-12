/** Offline regression of the 2026-10-12 live planner failure. The unchanged
 * provider response contains only the generic question/plan, never visit data.
 * Mocked provider outputs below prove wiring, not new model acceptance. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../common/domain.enums';
import { AiCoreModelService } from './ai-core-model.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import type { AiCoreModelInput } from './ai-core.types';
import { personalHistoryReply } from './personal-history-presentation';
import type { plannerWireContext } from './planner-wire-context';

const recorded = readFileSync(
  path.join(
    __dirname,
    '__fixtures__/recorded-last-visit-invalid-tool-arguments.json',
  ),
  'utf8',
);
const registry = new AiToolRegistryService();
const definition = registry.get('appointments.own.list');
const input: AiCoreModelInput = {
  surface: 'web',
  persona: 'director',
  principalRole: UserRole.CLIENT,
  messages: [{ role: 'user', content: 'Когда я был у вас последний раз?' }],
  tools: [
    {
      name: definition.name,
      description: definition.description,
      input_schema: definition.inputSchema,
      risk_tier: definition.riskTier,
      approval_policy: definition.approvalPolicy,
    },
  ],
  toolResults: [],
  allowToolCall: true,
  requiredToolNames: [definition.name],
};
const model = (provider = 'deepseek') => {
  const config: Record<string, string> = {
    AI_CORE_PROVIDER: provider,
    DEEPSEEK_API_KEY: 'synthetic-offline-only',
    OPENAI_API_KEY: 'synthetic-offline-only',
  };
  return new AiCoreModelService({
    get: (key: string) => config[key],
  } as ConfigService);
};

function validOutput(period: 'past' | 'last_visit') {
  return JSON.stringify({
    semantic_plan: {
      parent_request: input.messages[0].content,
      language: 'ru',
      dialogue_act: 'question',
      tasks: [
        {
          id: 'task_1',
          intent: 'booking.list_own',
          entities_json: JSON.stringify({ period }),
          depends_on: [],
          confidence: 0.97,
          requires_clarification: false,
          clarification_question: null,
        },
      ],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    tool_call: { name: definition.name, arguments_json: '{}' },
  });
}

describe('personal history planner contract: recorded period regression', () => {
  beforeEach(() => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('offline_regression_network_forbidden');
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('reproduces the exact recorded refusal without sanitizing invalid arguments', () => {
    expect(createHash('sha256').update(recorded).digest('hex')).toBe(
      '75daca7820bf0e01f9b333849590cafd708088bd7bd337cfdf772192d3373379',
    );
    const parsed = model()['validatePlanningResponse'](recorded, input);
    expect(parsed.semanticPlan.tasks[0].entities).toEqual({
      period: 'last_visit',
    });
    expect(parsed.toolCall).toEqual({
      name: definition.name,
      arguments: { period: 'last_visit' },
    });
    let failure: unknown;
    try {
      registry.validateArguments(definition.name, parsed.toolCall!.arguments);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(BadRequestException);
    if (!(failure instanceof BadRequestException))
      throw new Error('expected_registry_refusal');
    expect(failure.getResponse()).toMatchObject({
      error: { code: 'ai_tool_arguments_invalid' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('changes only tool arguments in an explicit diagnostic copy, preserving the recorded semantic period', () => {
    const copy = JSON.parse(recorded) as {
      tool_call: { arguments_json: string };
    };
    copy.tool_call.arguments_json = '{}';
    const parsed = model()['validatePlanningResponse'](
      JSON.stringify(copy),
      input,
    );
    expect(parsed.semanticPlan.tasks[0].entities).toEqual({
      period: 'last_visit',
    });
    expect(
      registry.validateArguments(definition.name, parsed.toolCall!.arguments),
    ).toEqual({});
    expect((JSON.parse(recorded) as typeof copy).tool_call.arguments_json).toBe(
      '{"period":"last_visit"}',
    );
  });

  it.each(['deepseek', 'openai'])(
    '%s sends explicit semantic-only period instructions and an unchanged closed tool schema',
    async (provider) => {
      const content = validOutput('last_visit');
      const fetchMock = jest.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify(
            provider === 'deepseek'
              ? { choices: [{ message: { content }, finish_reason: 'stop' }] }
              : {
                  output: [
                    { content: [{ type: 'output_text', text: content }] },
                  ],
                },
          ),
        ),
      );
      const decision = await model(provider).decide(input);
      expect(decision.toolCall).toEqual({
        name: definition.name,
        arguments: {},
      });
      expect(decision.semanticPlan?.tasks[0].entities).toEqual({
        period: 'last_visit',
      });
      expect(
        registry.validateArguments(
          definition.name,
          decision.toolCall!.arguments,
        ),
      ).toEqual({});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
        messages: Array<{ content: string }>;
        instructions: string;
        input: string;
      };
      const instructions =
        provider === 'deepseek' ? body.messages[0].content : body.instructions;
      const wire = JSON.parse(
        provider === 'deepseek' ? body.messages[1].content : body.input,
      ) as ReturnType<typeof plannerWireContext>;
      const available = wire.available_tools as {
        columns: string[];
        rows: unknown[][];
      };
      const tool = Object.fromEntries(
        available.columns.map((column, i) => [column, available.rows[0][i]]),
      );
      expect(wire.tool_input_schemas[tool.input_schema_ref as number]).toEqual({
        type: 'object',
        additionalProperties: false,
        properties: {},
      });
      expect(instructions).toContain(
        'Semantic task slots are not tool arguments',
      );
      expect(tool.description).toContain('arguments_json="{}"');
      expect(tool.description).toContain('entities_json');
      const intents = wire.conversation_contract.intents;
      const row = intents.rows.find(
        (row) => row[intents.columns.indexOf('intent')] === 'booking.list_own',
      )!;
      expect(row).toBeDefined();
      const description = row[intents.columns.indexOf('description')];
      expect(description).toContain('entities_json');
      expect(description).toContain('period=last_visit');
      expect(description).toContain('not tool arguments');
      expect(wire).not.toHaveProperty('appointments');
    },
  );

  it.each([
    { period: 'last_visit' },
    { status: 'completed' },
    { client_id: 'foreign-client' },
    { tenant_id: 'foreign-tenant' },
    { user_id: 'foreign-user' },
  ])('refuses unsupported or caller-selected arguments %j', (args) => {
    expect(() => registry.validateArguments(definition.name, args)).toThrow();
  });

  it.each(['past', 'last_visit'] as const)(
    '%s retains semantic intent through parser → registry → authenticated source → private server presentation',
    async (period) => {
      const parsed = model()['validatePlanningResponse'](
        validOutput(period),
        input,
      );
      const args = registry.validateArguments(
        definition.name,
        parsed.toolCall!.arguments,
      );
      const listClientAppointments = jest.fn().mockResolvedValue([
        {
          id: 'synthetic-own',
          start_at: new Date('2020-01-01T12:00:00Z'),
          status: 'completed',
          attendance: null,
          is_upcoming: false,
          branch: null,
          timezone: 'UTC',
          timezone_source: 'tenant_default',
          notes: 'PRIVATE_SYNTHETIC_NOTE',
          client_phone: '+12025550123',
        },
      ]);
      const handler = Object.create(
        AiToolHandlerService.prototype,
      ) as AiToolHandlerService;
      Object.defineProperties(handler, {
        appointmentsService: { value: { listClientAppointments } },
        governedSettings: {
          value: { ownHistoryEnabled: jest.fn().mockResolvedValue(true) },
        },
      });
      const result = await handler.execute(
        definition.name,
        {
          tenantId: 'synthetic-tenant',
          userId: 'synthetic-account',
          role: UserRole.CLIENT,
          surface: 'web',
        },
        args,
        'synthetic-offline-history',
      );
      expect(listClientAppointments).toHaveBeenCalledWith(
        'synthetic-tenant',
        'synthetic-account',
      );
      expect(parsed.semanticPlan.tasks[0].entities.period).toBe(period);
      const answer = personalHistoryReply(result, false, period);
      expect(answer.status).toBe('verified');
      if (period === 'last_visit') {
        expect(answer.reply).toContain('пока нет подтверждённых');
        expect(answer.reply).not.toContain('01.01.2020');
      } else expect(answer.reply).toContain('01.01.2020');
      expect(JSON.stringify(result)).not.toMatch(
        /PRIVATE_SYNTHETIC_NOTE|12025550123/,
      );
      expect(answer.reply).not.toContain('synthetic-own');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );
});
