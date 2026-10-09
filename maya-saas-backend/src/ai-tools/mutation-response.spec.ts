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
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationEntities } from '../conversation-intelligence/conversation-intelligence.types';

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

describe('bounded reschedule preference clarification', () => {
  const plan = (
    entities: ConversationEntities = {
      new_date: 'friday',
      new_time: '20:00',
    },
    intent = 'booking.reschedule_own',
  ) => {
    const result = new ConversationIntelligenceService().validatePlan(
      {
        parent_request: 'Давай на 20:00',
        tasks: [{ intent, entities, confidence: 1 }],
      },
      UserRole.CLIENT,
      [
        'appointments.own.reschedule',
        'appointments.own.create',
        'appointments.own.cancel',
      ],
    );
    if (!result) throw new Error('Expected validated reschedule test plan');
    return result;
  };

  it('repeats the validated request date/time as unverified preferences while asking which appointment', () => {
    const current = plan();
    current.tasks[0].clarification_question = 'Уже перенесено, слот свободен.';
    const before = JSON.stringify(current);
    const reply = mutationClarification(current);
    expect(reply).toContain('Пожелание для переноса: пятница, 20:00.');
    expect(reply).toContain('Возможность переноса ещё не проверена.');
    expect(reply).toContain('уточните запись.');
    expect(reply).toContain('Подтверждённого результата выполнения пока нет.');
    expect(reply).not.toMatch(/Уже перенесено|слот свободен|сохранила/);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('reflects a corrected time without carrying an older preference or changing the plan', () => {
    const current = plan({ new_date: 'friday', new_time: '21:00' });
    const before = JSON.stringify(current);
    expect(mutationClarification(current)).toContain('пятница, 21:00');
    expect(mutationClarification(current)).not.toContain('20:00');
    expect(JSON.stringify(current)).toBe(before);
  });

  it('asks for absent new time/date while repeating only a finite known preference', () => {
    const withoutTime = mutationClarification(plan({ new_date: 'tomorrow' }));
    expect(withoutTime).toContain('Пожелание для переноса: завтра.');
    expect(withoutTime).toContain('уточните запись, новое время.');
    const withoutDate = mutationClarification(plan({ new_time: '20:00' }));
    expect(withoutDate).toContain('Пожелание для переноса: 20:00.');
    expect(withoutDate).toContain('уточните запись, новую дату.');
  });

  it('accepts exact valid ISO days without resolving weekdays or relative dates to an instant', () => {
    for (const [value, label] of [
      ['2028-02-29', '2028-02-29'],
      ['сегодня', 'сегодня'],
      ['пятницу', 'пятница'],
    ]) {
      const reply = mutationClarification(
        plan({ new_date: value, new_time: '20:00' }),
      );
      expect(reply).toContain(`Пожелание для переноса: ${label}, 20:00.`);
      expect(reply).not.toMatch(/(?:Z|[+-]0[0-9]:00)\b/);
    }
  });

  it('does not echo malformed dates, invalid times, arbitrary prose or private appointment/staff references', () => {
    for (const value of [
      '2026-02-30',
      '2026-13-01',
      '2026-10-09T20:00:00Z',
      'PRIVATE_DAY_VALUE',
    ]) {
      const reply = mutationClarification(
        plan({ new_date: value, new_time: '20:00' }),
      );
      expect(reply).not.toContain(value);
      expect(reply).toContain('Пожелание для переноса: 20:00.');
      expect(reply).toContain('новую дату');
    }
    for (const value of ['24:00', '20:60', '20:00 PRIVATE_VALUE', 'вечером']) {
      const reply = mutationClarification(
        plan({ new_date: 'friday', new_time: value }),
      );
      expect(reply).not.toContain(value);
      expect(reply).toContain('Пожелание для переноса: пятница.');
      expect(reply).toContain('новое время');
    }
    const privatePlan = plan({
      appointment: 'PRIVATE_APPOINTMENT',
      new_employee: 'PRIVATE_EMPLOYEE',
      new_date: 'PRIVATE_DAY_VALUE',
    });
    expect(mutationClarification(privatePlan)).not.toMatch(/PRIVATE_/);
    expect(mutationClarification(privatePlan)).not.toContain('Пожелание');
  });

  it('keeps denied and unavailable actions on their existing refusal path', () => {
    const denied = plan();
    denied.tasks[0].permission.status = 'denied';
    expect(mutationClarification(denied)).toBe(
      'Для этого действия нужен подтверждённый клиентский доступ.',
    );
    const unavailable = plan();
    unavailable.tasks[0].tool.status = 'not_available';
    expect(mutationClarification(unavailable)).toBe(
      'Это действие сейчас недоступно. Подтверждённого результата выполнения нет.',
    );
  });

  it('does not specialize other intents or multiple tasks', () => {
    for (const intent of ['booking.create_own', 'booking.cancel_own']) {
      const current = plan({}, intent);
      expect(mutationClarification(current)).not.toContain('Пожелание');
    }
    const multiple = plan();
    multiple.tasks.push({ ...multiple.tasks[0], id: 'independent-other-task' });
    expect(mutationClarification(multiple)).toBe(
      'Для подготовки действия уточните запись. Подтверждённого результата выполнения пока нет.',
    );
  });

  it('does not present an unresolved date or time as a retained preference', () => {
    const current = plan();
    current.context.unresolved_references = ['new_date', 'new_time'];
    const reply = mutationClarification(current);
    expect(reply).not.toContain('Пожелание');
    expect(reply).not.toContain('20:00');
    expect(reply).toContain('уточните запись, новую дату, новое время.');
  });
});

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
