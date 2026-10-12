/** Fresh wire/continuation regression, not real-model language acceptance. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../common/domain.enums';
import { AiCoreModelService } from './ai-core-model.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import type { AiCoreModelInput } from './ai-core.types';
import { personalHistoryReply } from './personal-history-presentation';

const bytes = readFileSync(
  path.join(
    __dirname,
    '__fixtures__/recorded-history-last-visit-stale-period.json',
  ),
);
const fixture = JSON.parse(bytes.toString()) as {
  responses: Array<{ caseId: string; content: string }>;
};
const history = 'Покажи историю моих визитов';
const last = 'Когда я был у вас последний раз?';
const registry = new AiToolRegistryService();
const definition = registry.get('appointments.own.list');
const base: AiCoreModelInput = {
  surface: 'web',
  persona: 'director',
  principalRole: UserRole.CLIENT,
  messages: [{ role: 'user', content: history }],
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
const makeModel = (provider = 'deepseek') =>
  new AiCoreModelService({
    get: (key: string) =>
      ({
        AI_CORE_PROVIDER: provider,
        DEEPSEEK_API_KEY: 'synthetic-offline-only',
        OPENAI_API_KEY: 'synthetic-offline-only',
      })[key],
  } as ConfigService);

function syntheticOutput(question: string, period: 'past' | 'last_visit') {
  const output = JSON.parse(fixture.responses[1].content) as {
    semantic_plan: {
      parent_request: string;
      tasks: Array<{ entities_json: string }>;
    };
  };
  output.semantic_plan.parent_request = question;
  output.semantic_plan.tasks[0].entities_json = JSON.stringify({ period });
  return JSON.stringify(output);
}

describe('current user request versus retained personal history plan', () => {
  beforeEach(() =>
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('offline_regression_network_forbidden');
    }),
  );
  afterEach(() => jest.restoreAllMocks());

  it('preserves the recorded semantic failure instead of sanitizing it into a success', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'f08d22e683095e4c827bdc087f148e7f2be741cf0c5a440cf0b96e5660aa7673',
    );
    const model = makeModel();
    const first = model['validatePlanningResponse'](
      fixture.responses[0].content,
      base,
    );
    const second = model['validatePlanningResponse'](
      fixture.responses[1].content,
      {
        ...base,
        messages: [...base.messages, { role: 'user', content: last }],
        conversationPlan: first.semanticPlan,
      },
    );
    expect(second.semanticPlan.parent_request).toBe(history);
    expect(second.semanticPlan.tasks[0].entities.period).toBe('past');
    expect(
      registry.validateArguments(definition.name, second.toolCall!.arguments),
    ).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['deepseek', 'openai'])(
    '%s wire explicitly binds each current utterance while retaining history and scope',
    async (provider) => {
      const model = makeModel(provider);
      const turns = [
        { question: history, period: 'past' as const },
        { question: last, period: 'last_visit' as const },
        {
          question: 'Покажи снова все мои прошлые записи',
          period: 'past' as const,
        },
      ];
      let prior: AiCoreModelInput['conversationPlan'] = null;
      const messages: AiCoreModelInput['messages'] = [];
      for (const { question, period } of turns) {
        messages.push({ role: 'user', content: question });
        const content = syntheticOutput(question, period);
        const request = jest.mocked(globalThis.fetch).mockResolvedValue(
          new Response(
            JSON.stringify(
              provider === 'deepseek'
                ? {
                    choices: [{ message: { content }, finish_reason: 'stop' }],
                  }
                : {
                    output: [
                      { content: [{ type: 'output_text', text: content }] },
                    ],
                  },
            ),
          ),
        );
        const previousBytes = JSON.stringify(prior);
        const decision = await model.decide({
          ...base,
          messages: [...messages],
          conversationPlan: prior,
        });
        const body = JSON.parse(
          request.mock.calls.at(-1)![1]!.body as string,
        ) as {
          messages: Array<{ content: string }>;
          instructions: string;
          input: string;
        };
        const wire = JSON.parse(
          provider === 'deepseek' ? body.messages[1].content : body.input,
        ) as {
          current_user_request: string;
          conversation: unknown;
          semantic_plan: unknown;
          tool_results: unknown;
          remembered_notes: unknown;
          principal_role: string;
        };
        const instructions =
          provider === 'deepseek'
            ? body.messages[0].content
            : body.instructions;
        expect(wire.current_user_request).toBe(question);
        expect(Object.keys(wire).at(-1)).toBe('current_user_request');
        expect(wire.conversation).toEqual(messages);
        expect(wire.semantic_plan).toEqual(prior);
        expect(JSON.stringify(prior)).toBe(previousBytes);
        expect(instructions).toContain('Answer current_user_request.');
        expect(instructions).toContain(
          'Re-evaluate explicit scope even for the same intent/tool',
        );
        expect(wire.tool_results).toEqual([]);
        expect(wire.remembered_notes).toEqual([]);
        expect(wire.principal_role).toBe(UserRole.CLIENT);
        expect(decision?.semanticPlan?.tasks[0].entities.period).toBe(period);
        expect(
          registry.validateArguments(
            definition.name,
            decision!.toolCall!.arguments,
          ),
        ).toEqual({});
        // Synthetic private source stays in the server composer, never the wire.
        const result = {
          history_scope: {
            source: 'maya_canonical',
            coverage: 'last_synchronized',
            enabled: true,
          },
          appointments: [
            {
              id: 'private-synthetic-visit',
              start_at: '2020-01-01T12:00:00.000Z',
              status: 'completed',
              attendance: null,
              is_upcoming: false,
              branch: null,
              timezone: 'UTC',
              timezone_source: 'tenant_default',
            },
          ],
        };
        const answer = personalHistoryReply(result, false, period);
        expect(answer.status).toBe('verified');
        if (period === 'last_visit') {
          expect(answer.reply).toContain(
            'пока нет подтверждённых состоявшихся визитов',
          );
          expect(answer.reply).not.toContain('01.01.2020');
        } else expect(answer.reply).toContain('01.01.2020');
        expect(JSON.stringify(wire)).not.toContain('private-synthetic-visit');
        prior = decision!.semanticPlan;
      }
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    },
  );

  it('selects only the latest user message, not assistant prose or a retained parent', () => {
    const model = makeModel();
    const prior = model['validatePlanningResponse'](
      fixture.responses[0].content,
      base,
    ).semanticPlan;
    const input: AiCoreModelInput = {
      ...base,
      conversationPlan: prior,
      messages: [
        { role: 'user', content: history },
        { role: 'user', content: 'А что было самым недавним?' },
        { role: 'assistant', content: 'synthetic trailing assistant' },
      ],
    };
    expect(model['plannerModelInput'](input).current_user_request).toBe(
      'А что было самым недавним?',
    );
    expect(
      model['plannerModelInput']({ ...input, messages: [] })
        .current_user_request,
    ).toBeNull();
    expect(
      model['plannerModelInput']({ ...input, messages: [input.messages[2]] })
        .current_user_request,
    ).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
