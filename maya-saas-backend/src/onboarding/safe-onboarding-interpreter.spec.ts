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

  it('understands a naturally phrased service without the services keyword', () => {
    const result = interpreter.interpret(
      'Студия называется Тихая сила. Я работаю одна. Массаж спины стоит 3000 рублей и длится 60 минут.',
    );

    expect(result.missingFields).toEqual([]);
    expect(result.blueprint.services).toEqual([
      { name: 'Массаж спины', price: 3000, durationMinutes: 60 },
    ]);
  });

  it('accepts a short business name and a plain service list in separate replies', () => {
    const first = interpreter.interpret(
      'Я частный мастер и работаю одна без CRM.',
    );
    expect(first.missingFields).toEqual(['business_name', 'services']);

    const named = interpreter.interpret('Мужская эстетика', first.blueprint);
    expect(named.blueprint.businessName).toBe('Мужская эстетика');
    expect(named.missingFields).toEqual(['services']);

    const completed = interpreter.interpret(
      'Мужская стрижка, оформление бороды, камуфляж седины',
      named.blueprint,
    );
    expect(completed.missingFields).toEqual([]);
    expect(completed.blueprint.services).toEqual([
      { name: 'Мужская стрижка', price: 0, durationMinutes: 60 },
      { name: 'оформление бороды', price: 0, durationMinutes: 60 },
      { name: 'камуфляж седины', price: 0, durationMinutes: 60 },
    ]);
  });

  it('keeps an unlabeled service list while continuing to ask for the name', () => {
    const first = interpreter.interpret('Я частный специалист и работаю один.');
    const services = interpreter.interpret(
      'Диагностика, консультация, сопровождение',
      first.blueprint,
    );

    expect(services.blueprint.businessName).toBeNull();
    expect(services.blueprint.services).toEqual([
      { name: 'Диагностика', price: 0, durationMinutes: 60 },
      { name: 'консультация', price: 0, durationMinutes: 60 },
      { name: 'сопровождение', price: 0, durationMinutes: 60 },
    ]);
    expect(services.missingFields).toEqual(['business_name']);
  });

  it('understands a combined follow-up with a natural name label and bare prices', () => {
    const first = interpreter.interpret(
      'Я работаю одна и веду расписание в MAYA.',
    );
    const result = interpreter.interpret(
      'Название бизнеса — Линия. Услуги: консультация 2500 45 минут; сопровождение 5000 90 минут.',
      first.blueprint,
    );

    expect(result.missingFields).toEqual([]);
    expect(result.blueprint.businessName).toBe('Линия');
    expect(result.blueprint.services).toEqual([
      { name: 'консультация', price: 2500, durationMinutes: 45 },
      { name: 'сопровождение', price: 5000, durationMinutes: 90 },
    ]);
  });

  it('does not mistake an explicit business-name reply for a service', () => {
    const first = interpreter.interpret('Я частный специалист и работаю один.');
    const named = interpreter.interpret(
      'Название бизнеса — Север',
      first.blueprint,
    );

    expect(named.blueprint.businessName).toBe('Север');
    expect(named.blueprint.services).toEqual([]);
    expect(named.missingFields).toEqual(['services']);
  });
});
