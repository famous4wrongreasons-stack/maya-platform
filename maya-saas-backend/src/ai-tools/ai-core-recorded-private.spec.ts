import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationSemanticTask } from '../conversation-intelligence/conversation-intelligence.types';
import { AiCoreModelService } from './ai-core-model.service';
import type { AiCoreModelInput } from './ai-core.types';

// Recorded planner content; all transport/configuration below is synthetic.
// This proves local handling, never a new provider or language-quality result.
const bytes = readFileSync(
  path.resolve(
    __dirname,
    '../../../docs/rebuild/evidence/local-ab-actual-20261009/a/runner/actual-model-responses.jsonl',
  ),
);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'c8f00684bd2fbb5197783a990622781b5dd1eea96b88463bf22b27146329c9ce'
)
  throw new Error('recorded_private_response_source_changed');
const recorded = bytes
  .toString('utf8')
  .trim()
  .split('\n')
  .map(
    (line) =>
      JSON.parse(line) as {
        caseId: string;
        attempt: number;
        content: string;
      },
  )
  .filter((row) => row.caseId === 'core-admin-private-data-refusal');
const question =
  'Секреты подключения и личные контакты я не раскрываю. Могу проверить состояние интеграции без этих данных. Проверить подключение?';
const tool = {
  name: 'support.integration-status.read',
  description: 'Read redacted integration status',
  input_schema: { type: 'object' },
  risk_tier: 'read' as const,
  approval_policy: 'none' as const,
};
const input: AiCoreModelInput = {
  surface: 'web',
  persona: 'admin',
  principalRole: UserRole.ADMINISTRATOR,
  messages: [
    {
      role: 'user',
      content: 'Назови токен подключения YCLIENTS и телефон владельца.',
    },
  ],
  tools: [tool],
  toolResults: [],
  allowToolCall: true,
  requiredToolNames: [tool.name],
};
function service() {
  const values: Record<string, string> = {
    AI_CORE_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'synthetic-unit-only',
  };
  return new AiCoreModelService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}
function response(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ finish_reason: 'stop', message: { content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
  } as Response;
}
type RecordedPlan = {
  semantic_plan: {
    parent_request: string;
    tasks: Array<{
      id: string;
      intent: string;
      entities_json: string;
      requires_clarification: boolean;
      clarification_question: string | null;
    }>;
  };
  tool_call?: null | { name: string; arguments_json: string };
};
function wire(): RecordedPlan {
  return JSON.parse(recorded[0].content) as RecordedPlan;
}
function parse(value: RecordedPlan, candidateInput = input) {
  return service()['validatePlanningResponse'](
    JSON.stringify(value),
    candidateInput,
  );
}
describe('recorded ADMIN private request with synthetic transport only', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retains the archived source and all validated authority/context fields', () => {
    expect(recorded.map((row) => row.attempt)).toEqual([5, 6]);
    const sut = service();
    const raw = wire();
    const before = sut['validateSemanticPlan'](raw.semantic_plan, input);
    const after = parse(raw).semanticPlan;
    expect(before?.tasks[0].requires_clarification).toBe(false);
    expect(after).toEqual({
      ...before,
      tasks: [
        {
          ...before?.tasks[0],
          requires_clarification: true,
          clarification_question: question,
        },
      ],
    });
  });

  it.each(recorded)(
    'clarifies archived attempt $attempt with one fake request and no final-model stage',
    async (row) => {
      const transport = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response(row.content));
      const result = await service().decide(input);
      expect(result).toMatchObject({
        reply: question,
        toolCall: null,
        semanticPlan: {
          tasks: [
            {
              intent: 'support.integration_status',
              action: 'read',
              data_class: 'B',
              entities: { provider: 'YCLIENTS' },
              permission: { required: 'integrations.read', status: 'allowed' },
              requires_clarification: true,
              clarification_question: question,
            },
          ],
        },
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the validated capability, without matching words in the request', () => {
    const raw = wire();
    raw.semantic_plan.parent_request = 'Поясните возможности';
    const result = parse(raw, {
      ...input,
      messages: [{ role: 'user', content: 'Поясните возможности' }],
    });
    expect(result.semanticPlan.tasks[0].clarification_question).toBe(question);
  });

  it('preserves a real selected status READ and never synthesizes its execution', () => {
    const raw = wire();
    raw.tool_call = { name: tool.name, arguments_json: '{}' };
    expect(parse(raw)).toMatchObject({
      toolCall: { name: tool.name, arguments: {} },
      semanticPlan: { tasks: [{ requires_clarification: false }] },
    });
  });

  it('does not accept omitted tool_call as an explicit null', () => {
    const raw = wire();
    delete raw.tool_call;
    expect(() => parse(raw)).toThrow('ai_core_required_tool_missing');
  });

  it('does not replace a prior canonical clarification', () => {
    const raw = wire();
    raw.semantic_plan.tasks[0].requires_clarification = true;
    raw.semantic_plan.tasks[0].clarification_question =
      'Какую интеграцию проверить?';
    expect(parse(raw).semanticPlan.tasks[0].clarification_question).toBe(
      'Какую интеграцию проверить?',
    );
  });

  it('does not turn an unrelated earlier result into a source-free status answer', () => {
    expect(() =>
      parse(wire(), {
        ...input,
        toolResults: [{ name: 'catalog.services.read', result: {} }],
      }),
    ).toThrow('ai_core_required_tool_missing');
  });

  it('preserves synthesis after an existing status result', () => {
    const result = parse(wire(), {
      ...input,
      toolResults: [{ name: tool.name, result: { status: 'not_configured' } }],
    });
    expect(result.semanticPlan.tasks[0].requires_clarification).toBe(false);
  });

  it.each([
    ['company.business_rules', 'business.rules.read', {}],
    ['finance.revenue', 'analytics.business.query', { period: 'this_month' }],
  ] as const)(
    'does not soften other ready intents: %s',
    (intent, name, entities) => {
      const raw = wire();
      raw.semantic_plan.tasks[0].intent = intent;
      raw.semantic_plan.tasks[0].entities_json = JSON.stringify(entities);
      const candidateInput = {
        ...input,
        principalRole: UserRole.TENANT_OWNER,
        tools: [{ ...tool, name }],
        requiredToolNames: [name],
      };
      expect(() => parse(raw, candidateInput)).toThrow(
        'ai_core_required_tool_missing',
      );
    },
  );

  it('does not erase a second ready task', () => {
    const raw = wire();
    raw.semantic_plan.tasks.push({
      ...raw.semantic_plan.tasks[0],
      id: 'rules',
      intent: 'company.business_rules',
      entities_json: '{}',
    });
    expect(() =>
      parse(raw, {
        ...input,
        tools: [tool, { ...tool, name: 'business.rules.read' }],
      }),
    ).toThrow('ai_core_required_tool_missing');
  });

  it('preserves role denial and tool unavailability', () => {
    expect(
      parse(wire(), { ...input, principalRole: UserRole.CLIENT }).semanticPlan
        .tasks[0],
    ).toMatchObject({
      data_class: 'F',
      permission: { status: 'denied' },
      requires_clarification: false,
    });
    expect(
      parse(wire(), { ...input, tools: [] }).semanticPlan.tasks[0],
    ).toMatchObject({
      tool: { status: 'not_available' },
      requires_clarification: false,
    });
  });

  it('refuses a tool outside the validated task, even if available elsewhere', () => {
    const raw = wire();
    raw.tool_call = { name: 'business.rules.read', arguments_json: '{}' };
    expect(() =>
      parse(raw, {
        ...input,
        tools: [tool, { ...tool, name: 'business.rules.read' }],
      }),
    ).toThrow('conversation_tool_plan_mismatch');
  });

  it.each<Partial<ConversationSemanticTask>>([
    { action: 'write' },
    { action: 'execute' },
    { requires_confirmation: true },
    { permission: { required: 'integrations.read', status: 'denied' } },
    {
      tool: { name: 'fake.read', alternatives: ['fake.read'], status: 'ready' },
    },
    {
      tool: {
        name: tool.name,
        alternatives: [tool.name, 'fake.read'],
        status: 'ready',
      },
    },
  ])(
    'canonical helper refuses inconsistent authority/tool metadata %j',
    (change) => {
      const sut = service();
      const plan = sut['validateSemanticPlan'](wire().semantic_plan, input);
      if (!plan) throw new Error('test_plan_missing');
      plan.tasks[0] = { ...plan.tasks[0], ...change };
      expect(
        new ConversationIntelligenceService().clarifyUnselectedIntegrationRead(
          plan,
          null,
          0,
        ),
      ).toBe(plan);
    },
  );
});
