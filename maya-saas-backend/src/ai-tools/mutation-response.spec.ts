import {
  mutationClarification,
  mutationReceiptReply,
  mutationReceiptStatus,
} from './mutation-response';
import { AiCoreModelService } from './ai-core-model.service';
import bounded from './fixtures/deepseek-v4-pro-bounded-recheck.json';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../common/domain.enums';
import captures from './fixtures/deepseek-v4-pro-followup-failures.json';
import type { AiCoreModelInput } from './ai-core.types';

const model = new AiCoreModelService(new ConfigService());
const input: AiCoreModelInput = {
  surface: 'web',
  persona: 'admin',
  principalRole: UserRole.CLIENT,
  messages: [],
  tools: [],
  toolResults: [],
  allowToolCall: true,
  requiredToolNames: [],
};
const parse = (
  request: number,
  previous?: AiCoreModelInput['conversationPlan'],
) =>
  model['validatePlanningResponse'](
    captures.find((c) => c.request === request)!.content,
    {
      ...input,
      conversationPlan: previous,
      tools: [
        {
          name: 'booking.availability.read',
          description: '',
          input_schema: {},
          risk_tier: 'read',
          approval_policy: 'none',
        },
        {
          name: 'appointments.own.create',
          description: '',
          input_schema: {},
          risk_tier: 'high',
          approval_policy: 'required',
        },
      ],
    },
  ).semanticPlan;

describe('captured follow-up semantic and evidence regressions', () => {
  it('grades the exact final capture as ambiguous proposal language, not proof of completed booking', () => {
    const raw = JSON.parse(captures.find((c) => c.request === 25)!.content) as {
      tool_call: unknown;
      semantic_plan: { tasks: { clarification_question: string }[] };
    };
    expect(raw.tool_call).toBeNull();
    expect(raw.semantic_plan.tasks[0].clarification_question).toBe(
      'Подтверждаю запись на завтра, 6 октября, в 17:00 на моделирование бороды. Всё верно?',
    );
    // The question suggests a proposal, but its opening implies completion. No receipt exists.
    const reply = mutationClarification(parse(25));
    expect(reply).toContain('Подтверждённого результата выполнения пока нет.');
    expect(reply).not.toContain('Подтверждаю запись');
  });
  it('carries the known date and service across availability to create without inventing confirmation', () => {
    const previous = parse(23);
    const next = parse(24, previous);
    expect(next.tasks[0].entities).toMatchObject({
      date: 'tomorrow',
      time: '17:00',
      services: ['моделирование бороды'],
    });
    expect(next.tasks[0].requires_clarification).toBe(true);
    expect(next.tasks[0].requires_confirmation).toBe(true);
    expect(mutationClarification(next)).not.toContain('уточните дату');
    expect(previous.tasks[0].entities).not.toHaveProperty('time');
  });
  it('does not narrow an interval into an appointment day', () => {
    const previous = parse(23);
    previous.tasks[0].entities.date_or_period = 'next week';
    expect(parse(24, previous).tasks[0].entities).not.toHaveProperty('date');
  });
  it('only authoritative successful receipts permit completed wording', () => {
    const receipt = {
      contract: 'maya.action-execution-result/1',
      executionId: 'synthetic-ae',
      state: 'SUCCEEDED',
    };
    expect(
      mutationReceiptReply({
        status: 'completed',
        canonical_actions: [receipt],
      }),
    ).toBe('Действие выполнено. Результат подтверждён системой.');
    for (const execution of [
      { status: 'completed', result: { success: true } },
      { status: 'unknown', canonical_actions: [receipt] },
      {
        status: 'completed',
        canonical_actions: [{ ...receipt, state: 'UNKNOWN' }],
      },
      { status: 'completed', canonical_actions: [] },
      {
        status: 'completed',
        canonical_actions: [{ ...receipt, contract: 'model-says-success' }],
      },
    ])
      expect(mutationReceiptReply(execution)).toContain('пока не подтверждён');
  });
  it('the bounded live capture carries preferences but cannot grant permissions or use labels as IDs', () => {
    const tools = ['booking.availability.read', 'appointments.own.create'].map(
      (name) => ({
        name,
        description: '',
        input_schema: {},
        risk_tier: 'read',
        approval_policy: 'none',
      }),
    );
    const previous = model['validatePlanningResponse'](bounded[0].content, {
      ...input,
      tools,
    }).semanticPlan;
    const next = model['validatePlanningResponse'](bounded[1].content, {
      ...input,
      tools,
      conversationPlan: previous,
    });
    expect(next.semanticPlan.tasks[0].entities).toMatchObject({
      date: 'tomorrow',
      time: '17:00',
      services: ['моделирование бороды'],
    });
    expect(next.semanticPlan.tasks[0].risk).toBe('high');
    expect(next.semanticPlan.tasks[0].requires_confirmation).toBe(true);
    expect(() =>
      new AiToolRegistryService().validateArguments(
        next.toolCall!.name,
        next.toolCall!.arguments,
      ),
    ).toThrow();
    expect(() =>
      model['validatePlanningResponse'](bounded[1].content, {
        ...input,
        tools,
        principalRole: UserRole.EMPLOYEE,
        conversationPlan: previous,
      }),
    ).toThrow();
  });
  it('mixed UNKNOWN and FAILED receipts stay UNKNOWN', () => {
    const receipt = {
      contract: 'maya.action-execution-result/1',
      executionId: 'synthetic-ae',
    };
    expect(
      mutationReceiptStatus({
        status: 'failed',
        canonical_actions: [
          { ...receipt, state: 'FAILED' },
          { ...receipt, state: 'UNKNOWN' },
        ],
      }),
    ).toBe('unknown');
    expect(
      mutationReceiptStatus({
        status: 'failed',
        canonical_actions: [{ ...receipt, state: 'FAILED' }],
      }),
    ).toBe('failed');
    expect(
      mutationReceiptStatus({ status: 'failed', result: { success: false } }),
    ).toBe('unknown');
  });
  it('a corrected current date_or_period must override the older booking day when entering create', () => {
    const tools = ['booking.availability.read', 'appointments.own.create'].map(
      (name) => ({
        name,
        description: '',
        input_schema: {},
        risk_tier: 'read',
        approval_policy: 'none',
      }),
    );
    const previous = model['validatePlanningResponse'](bounded[0].content, {
      ...input,
      tools,
    }).semanticPlan;
    const corrected = JSON.parse(bounded[1].content) as {
      semantic_plan: { tasks: { entities: Record<string, unknown> }[] };
      tool_call: { arguments_json: string };
    };
    corrected.semantic_plan.tasks[0].entities.date_or_period = '2026-10-07';
    const args = JSON.parse(corrected.tool_call.arguments_json) as Record<
      string,
      unknown
    >;
    args.start = '2026-10-07T17:00:00+03:00';
    corrected.tool_call.arguments_json = JSON.stringify(args);
    const next = model['validatePlanningResponse'](JSON.stringify(corrected), {
      ...input,
      tools,
      conversationPlan: previous,
    });
    expect(next.semanticPlan.tasks[0].entities.date).toBe('2026-10-07');
    expect(next.semanticPlan.tasks[0].entities).not.toHaveProperty(
      'date_or_period',
    );
    expect(next.semanticPlan.context.replaced_slots).toContain('date');
    expect(next.semanticPlan.context.carried_slots).not.toContain('date');
  });
});
