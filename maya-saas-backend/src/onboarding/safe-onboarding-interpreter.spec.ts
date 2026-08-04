import { CalendarSource } from '../common/domain.enums';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';

describe('SafeOnboardingInterpreter', () => {
  const interpreter = new SafeOnboardingInterpreter();

  it('runs the short solo guided flow without reopening skipped fields', () => {
    const workMode = interpreter.interpret('Я работаю на себя');

    expect(workMode.blueprint).toMatchObject({
      workMode: 'solo',
      providerCount: 1,
    });
    expect(workMode.assistantMessage).toBe('Чем вы занимаетесь?');
    expect(workMode.quickReplies.map((reply) => reply.label)).toEqual(
      expect.arrayContaining([
        'Барбер',
        'Парикмахер',
        'Стоматолог',
        'Тренер',
        'Юрист / адвокат',
        'Другая профессия',
      ]),
    );

    const category = interpreter.interpret(
      'Я работаю барбером',
      workMode.blueprint,
    );
    expect(category.blueprint).toMatchObject({
      categoryId: 'solo_barber',
      templateId: 'barbershop',
      industryPresetId: 'barbershop',
      providerCount: 1,
    });
    expect(category.blueprint.services).toHaveLength(17);
    expect(category.missingFields).toEqual([
      'business_name',
      'calendar_source',
    ]);

    const noName = interpreter.interpret(
      'Название пока не придумал',
      category.blueprint,
    );
    expect(noName.blueprint.businessNameDeferred).toBe(true);
    expect(noName.missingFields).toEqual(['calendar_source']);
    expect(noName.assistantMessage).toContain('У вас есть CRM');

    const ready = interpreter.interpret(
      'Будем вести записи во внутреннем календаре MAYA',
      noName.blueprint,
    );
    expect(ready.missingFields).toEqual([]);
    expect(ready.quickReplies).toEqual([
      expect.objectContaining({ label: 'Можем начинать', action: 'confirm' }),
      expect.objectContaining({
        label: 'Отредактировать данные',
        action: 'edit',
      }),
    ]);
  });

  it.each([
    'Названия пока нет',
    'Пока без названия',
    'Можно пока без названия',
    'Название добавлю потом',
    'Не определился с названием',
  ])('treats "%s" as an intentional name deferral', (reply) => {
    const workMode = interpreter.interpret('Я работаю на себя');
    const category = interpreter.interpret(
      'Я работаю барбером',
      workMode.blueprint,
    );

    const result = interpreter.interpret(reply, category.blueprint);

    expect(result.blueprint.businessName).toBeNull();
    expect(result.blueprint.businessNameDeferred).toBe(true);
    expect(result.missingFields).toEqual(['calendar_source']);
  });

  it('does not store conversational filler as a business name', () => {
    const workMode = interpreter.interpret('Я работаю на себя');
    const category = interpreter.interpret(
      'Я работаю барбером',
      workMode.blueprint,
    );

    const result = interpreter.interpret(
      'Ну короче, всё как у людей',
      category.blueprint,
    );

    expect(result.blueprint.businessName).toBeNull();
    expect(result.blueprint.businessNameDeferred).toBe(false);
    expect(result.missingFields).toEqual(['business_name', 'calendar_source']);
  });

  it('uses business-specific choices and asks team size only for a business', () => {
    const workMode = interpreter.interpret('У меня бизнес');

    expect(workMode.blueprint.workMode).toBe('business');
    expect(workMode.assistantMessage).toBe('Какой у вас бизнес?');
    expect(workMode.quickReplies.map((reply) => reply.label)).toEqual(
      expect.arrayContaining([
        'Барбершоп',
        'Салон красоты',
        'Стоматология',
        'Косметология',
        'Фитнес',
        'Автосервис',
        'Детейлинг',
        'Другой бизнес',
      ]),
    );

    const category = interpreter.interpret(
      'У меня барбершоп',
      workMode.blueprint,
    );
    expect(category.blueprint.categoryId).toBe('business_barbershop');
    expect(category.missingFields).toEqual([
      'business_name',
      'provider_count',
      'calendar_source',
    ]);
  });

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
    expect(first.missingFields).toEqual(['calendar_source']);
    expect(first.blueprint.services.map((service) => service.name)).toEqual([
      'Классический массаж',
      'Массаж спины',
      'Спортивный массаж',
      'Лимфодренажный массаж',
    ]);

    const second = interpreter.interpret(
      'Буду вести записи во внутреннем календаре MAYA',
      first.blueprint,
    );
    expect(second.missingFields).toEqual([]);
    expect(second.blueprint.businessName).toBe('Мягкая сила');
    expect(second.blueprint.providerCount).toBe(1);
    expect(second.blueprint.calendarSourceConfirmed).toBe(true);
  });

  it('does not mistake a calendar answer for a missing business name', () => {
    const first = interpreter.interpret(
      'У меня барбершоп, работают 2 барбера. Услуги поставь автоматически.',
    );

    expect(first.blueprint.businessName).toBeNull();
    expect(first.missingFields).toEqual(['business_name', 'calendar_source']);

    const second = interpreter.interpret(
      'Записи ведем во внутреннем календаре MAYA',
      first.blueprint,
    );

    expect(second.blueprint.businessName).toBeNull();
    expect(second.blueprint.calendarSource).toBe(CalendarSource.INTERNAL);
    expect(second.blueprint.calendarSourceConfirmed).toBe(true);
    expect(second.missingFields).toEqual(['business_name']);
  });

  it.each(['каждый день', 'ежедневно', 'без выходных'])(
    'creates a seven-day schedule for the phrase "%s"',
    (schedulePhrase) => {
      const result = interpreter.interpret(
        `Барбершоп называется Север. Работают 2 барбера. Услуги поставь автоматически. Работаем ${schedulePhrase} с 10:00 до 20:00 без CRM.`,
      );

      expect(result.blueprint.weeklyRules.map((rule) => rule.weekday)).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);
      expect(result.blueprint.scheduleAssumed).toBe(false);
    },
  );

  it('marks a CRM-based business for external calendar connection', () => {
    const result = interpreter.interpret(
      'Студия называется Контур, 2 мастера. Услуги: консультация 1000 руб 30 минут. Работаем в YClients.',
    );

    expect(result.blueprint.calendarSource).toBe(CalendarSource.EXTERNAL);
  });

  it('understands a naturally phrased service without the services keyword', () => {
    const result = interpreter.interpret(
      'Студия называется Тихая сила. Я работаю одна. Массаж спины стоит 3000 рублей и длится 60 минут. Запись веду в календаре MAYA.',
    );

    expect(result.missingFields).toEqual([]);
    expect(result.blueprint.services).toEqual([
      { name: 'Массаж спины', price: 3000, durationMinutes: 60 },
    ]);
  });

  it('accepts a short business name and a plain service list in separate replies', () => {
    const first = interpreter.interpret(
      'Я частный мастер, у меня другая профессия, работаю одна без CRM.',
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
    const first = interpreter.interpret(
      'Я частный специалист, у меня другая профессия, работаю один в календаре MAYA.',
    );
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
      'Я работаю одна, у меня другая профессия и веду расписание в MAYA.',
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
    const first = interpreter.interpret(
      'Я частный специалист, у меня другая профессия, работаю один в календаре MAYA.',
    );
    const named = interpreter.interpret(
      'Название бизнеса — Север',
      first.blueprint,
    );

    expect(named.blueprint.businessName).toBe('Север');
    expect(named.blueprint.services).toEqual([]);
    expect(named.missingFields).toEqual(['services']);
  });

  it('understands common slang and collective number words without AI', () => {
    const result = interpreter.interpret(
      'У нас движ с тачками, делаем детейлинг без срм. Бизнес называется Блеск. Нас трое. Услуги: мойка/полировка/химчистка.',
    );

    expect(result.blueprint).toMatchObject({
      templateId: 'auto_service',
      businessName: 'Блеск',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 3,
    });
    expect(result.blueprint.services.map((service) => service.name)).toEqual([
      'мойка',
      'полировка',
      'химчистка',
    ]);
  });

  it('recognizes a hairdresser and fills the complete barbershop catalog automatically', () => {
    const first = interpreter.interpret(
      'Барбершоп называется Север. Я парикмахер и работаю один без CRM.',
    );
    const completed = interpreter.interpret(
      'поставь автоматически',
      first.blueprint,
    );

    expect(first.blueprint.templateId).toBe('barbershop');
    expect(completed.missingFields).toEqual([]);
    expect(completed.blueprint.services).toHaveLength(17);
    expect(completed.blueprint.services.map((service) => service.name)).toEqual(
      expect.arrayContaining([
        'Мужская стрижка',
        'Стрижка машинкой + фейд',
        'Моделирование бороды',
        'Бритьё головы',
        'Укладка',
      ]),
    );
    expect(completed.blueprint.services).not.toContainEqual(
      expect.objectContaining({ name: 'Консультация' }),
    );
  });

  it('applies automatic barbershop services inside a complete natural-language answer', () => {
    const result = interpreter.interpret(
      'Я работаю барбером, снимаю кресло и веду запись без CRM. Да никак не называется, меня зовут Артем и мои клиенты знают меня как Артема. Услуги поставь автоматически.',
    );

    expect(result.blueprint).toMatchObject({
      templateId: 'barbershop',
      businessName: 'Артем',
      providerCount: 1,
    });
    expect(result.blueprint.services).toHaveLength(17);
    expect(result.blueprint.services).not.toContainEqual(
      expect.objectContaining({ name: 'поставь автоматически' }),
    );
    expect(result.missingFields).toEqual([]);
  });

  it('never stores an automatic-fill instruction as a service name', () => {
    const result = interpreter.interpret(
      'Короче я барбер, работаю один, услуги поставь нормальные типовые автоматически',
    );

    expect(result.blueprint.categoryId).toBe('solo_barber');
    expect(result.blueprint.services).toHaveLength(17);
    expect(result.blueprint.services.map((service) => service.name)).toContain(
      'Мужская стрижка',
    );
    expect(result.blueprint.services).not.toContainEqual(
      expect.objectContaining({
        name: 'поставь нормальные типовые автоматически',
      }),
    );
  });

  it('treats solo specialist as business shape and keeps profession services', () => {
    const result = interpreter.interpret(
      'Я барбер, работаю один без CRM. Услуги поставь автоматически.',
      undefined,
      'solo_specialist',
    );

    expect(result.blueprint).toMatchObject({
      templateId: 'barbershop',
      industryPresetId: 'barbershop',
      providerCount: 1,
    });
    expect(result.blueprint.services).toHaveLength(17);
    expect(result.blueprint.services).not.toContainEqual(
      expect.objectContaining({ name: 'Консультация' }),
    );
  });

  it('understands a chair-renting hairdresser who works under their own name', () => {
    const first = interpreter.interpret(
      'я работаю парикмахером! снимаю кресло!',
    );

    expect(first.blueprint).toMatchObject({
      templateId: 'beauty_and_care',
      industryPresetId: 'beauty_salon',
      providerCount: 1,
      businessName: null,
    });
    expect(first.missingFields).toEqual(['business_name', 'calendar_source']);
    expect(first.assistantMessage).toContain('Как вас знают клиенты');

    const named = interpreter.interpret(
      'да никак не называется меня зовут Артем и мои клиенты знают меня как Артема',
      first.blueprint,
    );

    expect(named.blueprint).toMatchObject({
      templateId: 'beauty_and_care',
      providerCount: 1,
      businessName: 'Артем',
    });
    expect(named.missingFields).toEqual(['calendar_source']);
    expect(named.assistantMessage).not.toContain('Как называется ваш бизнес');
    expect(named.assistantMessage).toContain('CRM');
  });

  it('asks for a client-facing name after a no-name reply without looping', () => {
    const first = interpreter.interpret(
      'Я парикмахер, снимаю кресло и работаю без CRM.',
    );
    const noName = interpreter.interpret(
      'У меня нет отдельного названия',
      first.blueprint,
    );

    expect(noName.blueprint.businessName).toBeNull();
    expect(noName.blueprint.businessNameDeferred).toBe(true);
    expect(noName.needsClarification).toBe(false);
    expect(noName.missingFields).toEqual([]);
    expect(noName.assistantMessage).toBe(
      'Основа готова. Проверьте данные перед созданием бизнеса. Всё остальное можно добавить позже.',
    );
    expect(noName.quickReplies.map((reply) => reply.action)).toEqual([
      'confirm',
      'edit',
    ]);
  });

  it.each([
    'заполни сама',
    'как обычно',
    'автоматом',
    'выбери стандартные услуги',
  ])('understands the contextual auto-services reply "%s"', (message) => {
    const first = interpreter.interpret(
      'Барбершоп называется Север. Я парикмахер, работаю один.',
    );

    expect(
      interpreter.interpret(message, first.blueprint).blueprint.services,
    ).toHaveLength(17);
  });

  it('does not overwrite custom services with a vague auto reply', () => {
    const first = interpreter.interpret(
      'Барбершоп называется Север. Я парикмахер, работаю один. Услуги: авторская стрижка 3500 руб 90 минут.',
    );
    const result = interpreter.interpret(
      'поставь автоматически',
      first.blueprint,
    );

    expect(result.blueprint.services).toEqual([
      { name: 'авторская стрижка', price: 3500, durationMinutes: 90 },
    ]);
  });

  it('does not invent facts from an ambiguous one-word reply', () => {
    const first = interpreter.interpret(
      'Я частный специалист, работаю один без CRM.',
    );
    const ambiguous = interpreter.interpret('ага', first.blueprint);

    expect(ambiguous.blueprint).toEqual(first.blueprint);
    expect(ambiguous.needsClarification).toBe(true);
    expect(ambiguous.confidence).toBeLessThan(0.72);
    expect(ambiguous.quickReplies.length).toBeGreaterThan(0);
    expect(ambiguous.assistantMessage).toContain('Не хочу додумывать');
  });
});
