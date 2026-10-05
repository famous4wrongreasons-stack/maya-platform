import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from './conversation-intelligence.service';
import { MAYA_CONVERSATION_TAXONOMY } from './conversation-taxonomy';
import { normalizeSemanticSlots } from './semantic-slot-normalization';

describe('semantic vocabulary across canonical intent families', () => {
  const service = new ConversationIntelligenceService();
  const definitions = MAYA_CONVERSATION_TAXONOMY.filter((d) =>
    d.requiredSlots.includes('date_or_period'),
  );
  it.each(definitions)(
    '$id normalizes only its declared temporal slot and preserves permissions',
    (d) => {
      for (const key of ['date', 'period', 'date_or_period']) {
        const entities = Object.fromEntries(
          d.requiredSlots
            .filter((k) => k !== 'date_or_period')
            .map((k) => [
              k,
              k === 'services'
                ? ['haircut']
                : k === 'party_size'
                  ? 2
                  : 'fixture',
            ]),
        );
        entities[key] = '2026-10-06';
        const plan = service.validatePlan(
          { tasks: [{ intent: d.id, entities, confidence: 0.99 }] },
          d.allowedRoles[0],
          d.toolCandidates,
        )!;
        expect(plan.tasks[0].entities.date_or_period).toBe('2026-10-06');
        expect(plan.tasks[0].requires_clarification).toBe(false);
        expect(plan.tasks[0].requires_confirmation).toBe(
          d.risk === 'high' && ['write', 'execute'].includes(d.action),
        );
      }
      const contract = service
        .plannerContract(d.allowedRoles[0], d.toolCandidates)
        .intents.find((i) => i.intent === d.id)!;
      expect(contract.required_slots).toContain('date_or_period');
      expect(contract.slot_aliases.date_or_period).toEqual(['date', 'period']);
    },
  );
  it('does not reinterpret create dates, reschedule dates or analytics periods', () => {
    const data = {
      date: '2026-10-05',
      new_date: '2026-10-06',
      period: 'month',
    };
    expect(
      normalizeSemanticSlots(data, ['date', 'new_date', 'period']),
    ).toEqual(data);
  });
  it('rejects conflict and invalid types; does not satisfy an absent required date from a tool or unknown key', () => {
    for (const value of [false, 1, null, '', [], ['2026-10-05']])
      expect(() =>
        normalizeSemanticSlots({ date: value }, ['date_or_period']),
      ).toThrow('conversation_entity_alias_invalid');
    expect(() =>
      normalizeSemanticSlots({ date: '2026-10-05', period: '2026-10-06' }, [
        'date_or_period',
      ]),
    ).toThrow('conversation_entity_alias_conflict');
    expect(
      normalizeSemanticSlots(
        { date: '2026-10-05', date_or_period: '2026-10-05' },
        ['date_or_period'],
      ),
    ).toEqual({ date_or_period: '2026-10-05' });
    expect(normalizeSemanticSlots({ service: 'cut' }, ['services'])).toEqual({
      services: ['cut'],
    });
    expect(() =>
      normalizeSemanticSlots({ service: 'cut', services: ['beard'] }, [
        'services',
      ]),
    ).toThrow('conversation_entity_alias_conflict');
  });
  it('keeps carried entities and applies only explicit date/employee corrections without mutating previous plan', () => {
    const plan = (entities: Record<string, unknown>, replaced: string[]) =>
      service.validatePlan(
        {
          tasks: [
            { intent: 'booking.find_availability', entities, confidence: 0.99 },
          ],
          context: {
            carried_slots: ['service', 'employee'],
            replaced_slots: replaced,
          },
        },
        UserRole.CLIENT,
        ['booking.availability.read'],
      )!;
    const first = plan(
      { date: '2026-10-05', service: 'haircut', employee: 'staff_one' },
      [],
    );
    const next = plan(
      { ...first.tasks[0].entities, date_or_period: '2026-10-06' },
      ['date'],
    );
    expect(next.tasks[0].entities).toEqual({
      date_or_period: '2026-10-06',
      services: ['haircut'],
      employee: 'staff_one',
    });
    expect(next.context).toMatchObject({
      carried_slots: ['services', 'employee'],
      replaced_slots: ['date_or_period'],
    });
    const changed = plan({ ...next.tasks[0].entities, employee: 'staff_two' }, [
      'employee',
    ]);
    expect(changed.tasks[0].entities).toEqual({
      date_or_period: '2026-10-06',
      services: ['haircut'],
      employee: 'staff_two',
    });
    expect(first.tasks[0].entities.date_or_period).toBe('2026-10-05');
  });
});
