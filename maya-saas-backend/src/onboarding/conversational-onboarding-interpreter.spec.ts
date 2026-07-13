import { ConfigService } from '@nestjs/config';

import { CalendarSource } from '../common/domain.enums';
import type { AiOnboardingBlueprint } from './ai-onboarding.types';
import { ConversationalOnboardingInterpreter } from './conversational-onboarding-interpreter';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';

describe('ConversationalOnboardingInterpreter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createInterpreter(config: Record<string, string> = {}) {
    const values: Record<string, string> = {
      AI_ONBOARDING_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_AI_ONBOARDING_MODEL: 'test-model',
      ...config,
    };
    return new ConversationalOnboardingInterpreter(
      {
        get: jest.fn((key: string) => values[key]),
      } as unknown as ConfigService,
      new SafeOnboardingInterpreter(),
    );
  }

  function mockModelTurn(turn: Record<string, unknown>) {
    const requests: RequestInit[] = [];
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(
      (_input, init) => {
        requests.push(init ?? {});
        return Promise.resolve(
          new Response(
            JSON.stringify({
              output: [
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text: JSON.stringify(turn),
                    },
                  ],
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      },
    );
    global.fetch = fetchMock;
    return requests;
  }

  it('uses structured output for slang while redacting contacts and names', async () => {
    const requests = mockModelTurn({
      intent: 'provide_details',
      confidence: 0.94,
      needs_clarification: false,
      assistant_message:
        'Поняла: барбершоп, три специалиста и две основные услуги.',
      clarification_question: null,
      accepted_fields: [
        'template',
        'business_name',
        'calendar_source',
        'provider_count',
        'services',
      ],
      quick_replies: [],
      patch: {
        template_id: 'barbershop',
        business_name: 'Север',
        calendar_source: 'internal',
        provider_count: 3,
        use_template_services: false,
        services: [
          { name: 'Стрижка', price: 2000, durationMinutes: 60 },
          { name: 'Борода', price: 1200, durationMinutes: 30 },
        ],
        weekly_rules: [],
      },
    });
    const interpreter = createInterpreter();
    const message =
      'Меня зовут Иван Иванов, +79991234567, ivan@example.ru, API-токен: superSecretToken123. Барбершоп называется Север, нас трое, стрижем и ровняем бороду без CRM.';

    const result = await interpreter.interpret(message);

    expect(result.source).toBe('openai');
    expect(result.missingFields).toEqual([]);
    expect(result.blueprint).toMatchObject({
      templateId: 'barbershop',
      businessName: 'Север',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 3,
    });

    const requestBody = requests[0]?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const request = JSON.parse(requestBody) as Record<string, unknown>;
    const modelInput = String(request.input);
    expect(request.store).toBe(false);
    expect(request.text).toMatchObject({
      format: { type: 'json_schema', strict: true },
    });
    expect(modelInput).not.toContain('Иван Иванов');
    expect(modelInput).not.toContain('+79991234567');
    expect(modelInput).not.toContain('ivan@example.ru');
    expect(modelInput).not.toContain('superSecretToken123');
  });

  it('redacts personal names from the previously collected service context', async () => {
    const requests = mockModelTurn({
      intent: 'provide_details',
      confidence: 0.92,
      needs_clarification: false,
      assistant_message: 'Поняла уточнение.',
      clarification_question: null,
      accepted_fields: [],
      quick_replies: [],
      patch: {
        template_id: null,
        business_name: null,
        calendar_source: null,
        provider_count: null,
        use_template_services: false,
        services: [],
        weekly_rules: [],
      },
    });
    const previous: AiOnboardingBlueprint = {
      templateId: 'barbershop',
      businessName: 'Север',
      summary: 'Барберы, услуги и расписание точки',
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 2,
      providerTitle: 'Барбер',
      services: [
        { name: 'Стрижка у Алексея', price: 2000, durationMinutes: 60 },
      ],
      weeklyRules: [{ weekday: 1, startTime: '10:00', endTime: '20:00' }],
      scheduleAssumed: true,
    };

    await createInterpreter().interpret('Цену оставь как есть', previous);

    const requestBody = requests[0]?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const modelInput = String(
      (JSON.parse(requestBody) as Record<string, unknown>).input,
    );
    expect(modelInput).not.toContain('Алексея');
    expect(modelInput).not.toContain('Север');
  });

  it('preserves prior facts and returns quick replies when a short answer is unclear', async () => {
    mockModelTurn({
      intent: 'unclear',
      confidence: 0.31,
      needs_clarification: true,
      assistant_message: 'Хочу уточнить ответ.',
      clarification_question: 'Вы про количество специалистов или услуги?',
      accepted_fields: [],
      quick_replies: [
        {
          label: 'Про специалистов',
          message: 'Я отвечал про количество специалистов',
        },
        { label: 'Про услуги', message: 'Я отвечал про услуги' },
      ],
      patch: {
        template_id: null,
        business_name: null,
        calendar_source: null,
        provider_count: null,
        use_template_services: false,
        services: [],
        weekly_rules: [],
      },
    });
    const previous: AiOnboardingBlueprint = {
      templateId: 'barbershop',
      businessName: 'Север',
      summary: 'Барберы, услуги и расписание точки',
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 3,
      providerTitle: 'Барбер',
      services: [],
      weeklyRules: [{ weekday: 1, startTime: '10:00', endTime: '20:00' }],
      scheduleAssumed: true,
    };

    const result = await createInterpreter().interpret('ага', previous);

    expect(result.blueprint).toEqual(previous);
    expect(result.needsClarification).toBe(true);
    expect(result.assistantMessage).toBe(
      'Вы про количество специалистов или услуги?',
    );
    expect(result.quickReplies).toHaveLength(2);
  });

  it('keeps deterministic template services when the model would miss an auto reply', async () => {
    const requests = mockModelTurn({
      intent: 'unclear',
      confidence: 0.4,
      needs_clarification: true,
      assistant_message: 'Перечислите услуги.',
      clarification_question: 'Какие услуги вы оказываете?',
      accepted_fields: [],
      quick_replies: [],
      patch: {
        template_id: null,
        business_name: null,
        calendar_source: null,
        provider_count: null,
        use_template_services: false,
        services: [],
        weekly_rules: [],
      },
    });
    const previous: AiOnboardingBlueprint = {
      templateId: 'barbershop',
      businessName: 'Север',
      summary: 'Барберы, услуги и расписание точки',
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 1,
      providerTitle: 'Барбер',
      services: [],
      weeklyRules: [{ weekday: 1, startTime: '10:00', endTime: '20:00' }],
      scheduleAssumed: true,
    };

    const result = await createInterpreter().interpret(
      'поставь автоматически',
      previous,
    );

    expect(requests).toHaveLength(0);
    expect(result.blueprint.services).toHaveLength(17);
    expect(result.missingFields).toEqual([]);
    expect(result.assistantMessage).toContain('Я собрала основу');
  });

  it('keeps a locally resolved personal brand name away from the model', async () => {
    const requests = mockModelTurn({
      intent: 'unclear',
      confidence: 0.3,
      needs_clarification: true,
      assistant_message: 'Уточните название.',
      clarification_question: 'Как называется бизнес?',
      accepted_fields: [],
      quick_replies: [],
      patch: {
        template_id: null,
        business_name: null,
        calendar_source: null,
        provider_count: null,
        use_template_services: false,
        services: [],
        weekly_rules: [],
      },
    });
    const previous: AiOnboardingBlueprint = {
      templateId: 'barbershop',
      businessName: null,
      summary: 'Барберы, услуги и расписание точки',
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.INTERNAL,
      providerCount: 1,
      providerTitle: 'Барбер',
      services: [],
      weeklyRules: [{ weekday: 1, startTime: '10:00', endTime: '20:00' }],
      scheduleAssumed: true,
    };

    const result = await createInterpreter().interpret(
      'Никак не называется, меня зовут Артем',
      previous,
    );

    expect(requests).toHaveLength(0);
    expect(result.source).toBe('safe_fallback');
    expect(result.blueprint.businessName).toBe('Артем');
    expect(result.missingFields).toEqual(['services']);
  });

  it('falls back safely when the model transport is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));

    const result = await createInterpreter().interpret(
      'Я частный массажист, работаю один. Название Точка. Услуги: массаж 3000 руб 60 минут.',
    );

    expect(result.source).toBe('safe_fallback');
    expect(result.blueprint.services).toHaveLength(1);
  });
});
