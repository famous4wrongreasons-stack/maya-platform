import { UserRole } from '../common/domain.enums';
import { mutationClarification } from '../ai-tools/mutation-response';
import { rescheduleOwnReadClarification } from '../ai-tools/personal-reschedule-preparation';
import { ConversationIntelligenceService } from './conversation-intelligence.service';
import type { ConversationSemanticPlan } from './conversation-intelligence.types';

const service = new ConversationIntelligenceService();
const tools = ['appointments.own.list', 'appointments.own.reschedule'];
function candidate(
  entities: Record<string, string>,
  paired: boolean,
  act = 'clarification',
): {
  dialogue_act: string;
  tasks: {
    id: string;
    intent: string;
    entities: Record<string, string>;
    depends_on?: string[];
    confidence: number;
  }[];
} {
  return {
    dialogue_act: act,
    tasks: [
      ...(paired
        ? [
            {
              id: 'list',
              intent: 'booking.list_own',
              entities: {},
              confidence: 1,
            },
          ]
        : []),
      {
        id: 'move',
        intent: 'booking.reschedule_own',
        entities,
        depends_on: paired ? ['list'] : [],
        confidence: 1,
      },
    ],
  };
}
function validate(
  value: unknown,
  previous?: ConversationSemanticPlan | null,
  role = UserRole.CLIENT,
  available = tools,
) {
  return service.validatePlan(value, role, available, previous)!;
}

describe('unselected personal reschedule preference continuation', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'retains day through a time answer (read prerequisite %s → %s)',
    (before, after) => {
      const first = validate(
        candidate({ new_date: '2026-10-16' }, before, 'request'),
      );
      const snapshot = JSON.stringify(first);
      const second = validate(candidate({ new_time: '20:00' }, after), first);
      expect(second.tasks.at(-1)?.entities).toEqual({
        new_date: '2026-10-16',
        new_time: '20:00',
      });
      expect(second.context.carried_slots).toContain('new_date');
      expect(second.tasks.at(-1)).toMatchObject({
        requires_clarification: true,
        requires_confirmation: true,
      });
      const reply = after
        ? rescheduleOwnReadClarification(second)
        : mutationClarification(second);
      expect(reply).toContain('2026-10-16, 20:00');
      expect(reply).toContain('Какую запись хотите перенести?');
      expect(reply).toContain('Доступность ещё нужно проверить');
      expect(() =>
        service.assertToolCallMatchesPlan(
          {
            name: 'appointments.own.reschedule',
            arguments: {},
          },
          second,
        ),
      ).toThrow();
      expect(JSON.stringify(first)).toBe(snapshot);
    },
  );

  it('replaces only the corrected day/time and never mutates the saved plan', () => {
    const first = validate(
      candidate({ new_date: 'friday', new_time: '20:00' }, true, 'request'),
    );
    const second = validate(
      candidate({ new_time: '19:00' }, true, 'correction'),
      first,
    );
    expect(second.tasks[1].entities).toEqual({
      new_date: 'friday',
      new_time: '19:00',
    });
    expect(second.context.replaced_slots).toContain('new_time');
    const third = validate(
      candidate({ new_date: 'saturday' }, false, 'correction'),
      second,
    );
    expect(third.tasks[0].entities).toEqual({
      new_date: 'saturday',
      new_time: '19:00',
    });
    expect(third.context.replaced_slots).toContain('new_date');
    expect(first.tasks[1].entities).toEqual({
      new_date: 'friday',
      new_time: '20:00',
    });
  });

  it.each(['request', 'cancel', 'stop', 'unknown'])(
    'does not carry into dialogue act %s',
    (act) => {
      const first = validate(candidate({ new_date: 'friday' }, false));
      const second = validate(
        candidate({ new_time: '20:00' }, false, act),
        first,
      );
      expect(second.tasks[0].entities).toEqual({ new_time: '20:00' });
    },
  );

  it.each([
    'previous-selection',
    'current-selection',
    'previous-staff',
    'current-staff',
    'other-task',
    'unavailable',
    'role-denied',
    'low-confidence',
    'missing-dependency',
  ])('refuses carry across %s', (boundary) => {
    const before = candidate({ new_date: 'friday' }, true, 'request');
    const after = candidate({ new_time: '20:00' }, true);
    if (boundary === 'previous-selection')
      before.tasks[1].entities.appointment = 'opaque-appointment';
    if (boundary === 'current-selection')
      after.tasks[1].entities.appointment = 'opaque-appointment';
    if (boundary === 'previous-staff')
      before.tasks[1].entities.new_employee = 'opaque-employee';
    if (boundary === 'current-staff')
      after.tasks[1].entities.new_employee = 'opaque-employee';
    if (boundary === 'other-task')
      before.tasks[0].intent = 'booking.cancel_own';
    if (boundary === 'low-confidence') before.tasks[1].confidence = 0.4;
    if (boundary === 'missing-dependency') after.tasks[1].depends_on = [];
    const first = validate(before);
    const second = validate(
      after,
      first,
      boundary === 'role-denied' ? UserRole.TENANT_OWNER : UserRole.CLIENT,
      boundary === 'unavailable' ? [] : tools,
    );
    expect(second.tasks[1].entities).not.toHaveProperty('new_date');
  });

  it.each(['2026-02-30', 'PRIVATE_DATE', 'next_month', '25:00'])(
    'does not carry invalid preference %s',
    (value) => {
      const key = value === '25:00' ? 'new_time' : 'new_date';
      const first = validate(candidate({ [key]: value }, false));
      const second = validate(candidate({}, false), first);
      expect(second.tasks[0].entities).not.toHaveProperty(key);
    },
  );

  it.each(['previous', 'current'])(
    'does not fill an explicitly unresolved %s date',
    (when) => {
      const raw = {
        ...candidate({ new_date: 'friday' }, false),
        context: {
          unresolved_references: when === 'previous' ? ['new_date'] : [],
        },
      };
      const first = validate(raw);
      const next = {
        ...candidate({ new_time: '20:00' }, false),
        context: {
          unresolved_references: when === 'current' ? ['new_date'] : [],
        },
      };
      const second = validate(next, first);
      expect(second.tasks[0].entities).not.toHaveProperty('new_date');
    },
  );

  it('does not restore preferences with absent context or through another task', () => {
    const next = candidate({ new_time: '20:00' }, false);
    const unrelated = validate({
      tasks: [{ intent: 'general.explain_term', entities: { topic: 'time' } }],
    });
    for (const previous of [null, unrelated]) {
      expect(validate(next, previous).tasks[0].entities).toEqual({
        new_time: '20:00',
      });
    }
  });
});
