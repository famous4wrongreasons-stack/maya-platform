import { CalendarSource } from '../common/domain.enums';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';

describe('SafeOnboardingInterpreter', () => {
  const interpreter = new SafeOnboardingInterpreter();

  it('builds a complete barbershop blueprint from a natural-language story', () => {
    const result = interpreter.interpret(
      'Барбершоп называется Север. У нас 3 барбера. Услуги: мужская стрижка 2000 руб 60 минут, борода 1200 руб 30 минут. Работаем пн-сб с 10:00 до 20:00 без CRM.',
    );

    expect(result.missingFields).toEqual([]);
    expect(result.blueprint).toMatchObject({
      templateId: 'barbershop',
      businessName: 'Север',
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 3,
      providerTitle: 'Барбер',
      scheduleAssumed: false,
    });
    expect(result.blueprint.services).toEqual([
      { name: 'мужская стрижка', price: 2000, durationMinutes: 60 },
      { name: 'борода', price: 1200, durationMinutes: 30 },
    ]);
    expect(result.blueprint.weeklyRules).toHaveLength(6);
  });

  it('asks only for missing details and merges a follow-up answer', () => {
    const first = interpreter.interpret(
      'Я частный массажист, работаю одна. Название Мягкая сила.',
    );
    expect(first.missingFields).toEqual(['services']);

    const second = interpreter.interpret(
      'Услуги: массаж 3000 руб 60 минут',
      first.blueprint,
    );
    expect(second.missingFields).toEqual([]);
    expect(second.blueprint.businessName).toBe('Мягкая сила');
    expect(second.blueprint.providerCount).toBe(1);
    expect(second.blueprint.services).toEqual([
      { name: 'массаж', price: 3000, durationMinutes: 60 },
    ]);
  });

  it('marks a CRM-based business for external calendar connection', () => {
    const result = interpreter.interpret(
      'Студия называется Контур, 2 мастера. Услуги: консультация 1000 руб 30 минут. Работаем в YClients.',
    );

    expect(result.blueprint.calendarSource).toBe(CalendarSource.EXTERNAL);
  });
});
