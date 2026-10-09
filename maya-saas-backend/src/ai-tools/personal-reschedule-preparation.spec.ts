import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { rescheduleOwnReadClarification } from './personal-reschedule-preparation';

const tools = ['appointments.own.list', 'appointments.own.reschedule'];
const intelligence = new ConversationIntelligenceService();
function candidate() {
  return {
    parent_request: 'Перенеси мою ближайшую запись на пятницу после проверки.',
    dialogue_act: 'request',
    tasks: [
      {
        id: 'own_list',
        intent: 'booking.list_own',
        entities: { period: 'nearest' },
        depends_on: [],
        confidence: 1,
      },
      {
        id: 'reschedule',
        intent: 'booking.reschedule_own',
        entities: { new_date: 'friday' },
        depends_on: ['own_list'],
        confidence: 1,
      },
    ],
  };
}
function plan(
  role = UserRole.CLIENT,
  availableTools: readonly string[] = tools,
): ConversationSemanticPlan {
  const validated = intelligence.validatePlan(
    candidate(),
    role,
    availableTools,
  );
  if (!validated) throw new Error('Expected a validated prerequisite plan');
  return validated;
}

describe('own-list reschedule preparation presentation', () => {
  it('uses the existing CI ordered dependency and preserves reschedule/date while only the own READ is admissible', () => {
    const validated = plan();
    const before = JSON.stringify(validated);
    const read = { name: 'appointments.own.list', arguments: {} };
    expect(intelligence.assertToolCallMatchesPlan(read, validated)).toBe(read);
    expect(() =>
      intelligence.assertToolCallMatchesPlan(
        { name: 'appointments.own.reschedule', arguments: {} },
        validated,
      ),
    ).toThrow('conversation_tool_plan_mismatch');
    const reply = rescheduleOwnReadClarification(validated);
    expect(reply).toContain('Пожелание для переноса: пятница.');
    expect(reply).toContain('Возможность переноса ещё не проверена.');
    expect(reply).toContain('уточните запись, новое время.');
    expect(reply).toContain('Подтверждённого результата выполнения пока нет.');
    expect(validated.tasks.map((task) => task.intent)).toEqual([
      'booking.list_own',
      'booking.reschedule_own',
    ]);
    expect(JSON.stringify(validated)).toBe(before);
  });

  it('uses the finite current date/time preference, not a model-authored question or an appointment selection', () => {
    const validated = plan();
    validated.tasks[1].entities.new_time = '20:00';
    validated.tasks[1].clarification_question =
      'PRIVATE_PHONE: запись уже перенесена, свободный слот подтверждён.';
    const before = JSON.stringify(validated);
    const reply = rescheduleOwnReadClarification(validated);
    expect(reply).toContain('пятница, 20:00');
    expect(reply).toContain('уточните запись.');
    expect(reply).not.toMatch(/PRIVATE|уже перенесена|слот подтверждён/);
    expect(JSON.stringify(validated)).toBe(before);
  });

  it('refuses role denial and unavailable owners instead of converting them into preparation', () => {
    expect(
      rescheduleOwnReadClarification(plan(UserRole.ADMINISTRATOR)),
    ).toBeNull();
    expect(
      rescheduleOwnReadClarification(plan(UserRole.CLIENT, [])),
    ).toBeNull();
    expect(
      rescheduleOwnReadClarification(
        plan(UserRole.CLIENT, ['appointments.own.list']),
      ),
    ).toBeNull();
    expect(
      rescheduleOwnReadClarification(
        plan(UserRole.CLIENT, ['appointments.own.reschedule']),
      ),
    ).toBeNull();
  });

  it.each(['missing', 'other', 'reversed', 'extra'] as const)(
    'does not specialize a %s dependency graph',
    (variant) => {
      const value = candidate();
      if (variant === 'missing') value.tasks[1].depends_on = [];
      if (variant === 'other') value.tasks[1].depends_on = ['unknown_task'];
      if (variant === 'reversed') value.tasks.reverse();
      if (variant === 'extra')
        value.tasks.push({ ...value.tasks[0], id: 'another_read' });
      const validated = intelligence.validatePlan(
        value,
        UserRole.CLIENT,
        tools,
      );
      expect(rescheduleOwnReadClarification(validated)).toBeNull();
    },
  );

  it('requires both exact owners and an unresolved appointment, not a selected or executable mutation', () => {
    const selected = plan();
    selected.tasks[1].entities.appointment = 'PRIVATE_APPOINTMENT';
    expect(rescheduleOwnReadClarification(selected)).toBeNull();
    const ready = plan();
    ready.tasks[1].requires_clarification = false;
    expect(rescheduleOwnReadClarification(ready)).toBeNull();
    const unreadable = plan();
    unreadable.tasks[0].requires_clarification = true;
    expect(rescheduleOwnReadClarification(unreadable)).toBeNull();
    const other = plan();
    other.tasks[1].intent = 'booking.cancel_own';
    expect(rescheduleOwnReadClarification(other)).toBeNull();
    const altered = plan();
    altered.tasks[0].tool.alternatives.push('clients.dossier.read');
    expect(rescheduleOwnReadClarification(altered)).toBeNull();
    expect(rescheduleOwnReadClarification(null)).toBeNull();
  });

  it('never echoes unresolved appointment, private entity values or invalid requested times', () => {
    const validated = plan();
    validated.tasks[1].entities = {
      appointment: 'PRIVATE_APPOINTMENT',
      new_employee: 'PRIVATE_EMPLOYEE',
      new_date: 'PRIVATE_DATE',
      new_time: '25:00',
    };
    validated.context.unresolved_references = ['appointment'];
    const before = JSON.stringify(validated);
    const reply = rescheduleOwnReadClarification(validated);
    expect(reply).not.toMatch(/PRIVATE|25:00|Пожелание/);
    expect(reply).toContain('уточните новую дату, новое время, запись.');
    expect(JSON.stringify(validated)).toBe(before);
  });

  it('does not reinterpret an unrelated list-only plan as a reschedule request', () => {
    const validated = intelligence.validatePlan(
      { tasks: [candidate().tasks[0]] },
      UserRole.CLIENT,
      tools,
    );
    expect(rescheduleOwnReadClarification(validated)).toBeNull();
  });
});
