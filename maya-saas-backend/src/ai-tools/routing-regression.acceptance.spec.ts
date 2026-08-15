/**
 * РЕГРЕССИОННЫЙ КОРПУС МАРШРУТИЗАЦИИ.
 *
 * Живые формулировки владельца барбершопа из owner-routing.corpus.ts:
 * инструмент + период. Плюс роли и команда расхода. Новый прод-косяк =
 * новая строка в корпусе, не if в mid-сервисе.
 */
import { ConfigService } from '@nestjs/config';

import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision, AiCoreModelInput } from './ai-core.types';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';
import { OWNER_ROUTING_CORPUS } from './owner-routing.corpus';

/** «Сегодня» корпуса: 7 августа 2026 — июль позади, август идёт. */
const NOW = new Date('2026-08-07T09:00:00.000Z');

const ALL_FEATURES: Record<string, boolean> = {
  'ai.owner': true,
  'ai.admin': true,
  'ai.consultant': true,
  'analytics.business': true,
  'analytics.employee': true,
  'expenses.core': true,
  'customers.core': true,
  booking: true,
  'booking.customer_app': true,
  loyalty: true,
};

/** Ответы инструментов: числа здесь не важны, важно КТО ответил. */
const TOOL_RESULTS: Record<string, unknown> = {
  'analytics.business.query': {
    verified: true,
    comparison: { mode: 'none' },
    metrics: {},
    changes: {},
    current: {},
    service_changes: [],
  },
  'analytics.employee.query': {
    verified: true,
    comparison: { mode: 'none' },
    metrics: {},
    changes: {},
    current: {},
    service_changes: [],
  },
  'analytics.business.profit': {
    period: {},
    confirmed_revenue: { status: 'unavailable' },
    net_profit: { status: 'unavailable', unavailable_reason: 'test' },
    expenses: {},
    payroll: {},
    client_acquisition_cost: { status: 'unavailable' },
  },
  'expenses.read': { by_category: [], totals: [] },
  'customers.count': { count: 0 },
  'clients.retention.scan': {
    source: 'external_crm',
    provider: 'yclients',
    generated_at: '2026-08-07T08:59:00.000Z',
    as_of: '2026-08-07',
    complete: true,
    contains_personal_data: false,
    total_clients: 1200,
    clients_with_visits: 1140,
    clients_without_visits: 60,
    clients_with_unknown_last_visit: 5,
    loyal_clients_with_unknown_last_visit: 2,
    repeat_clients: 840,
    loyal_clients: 620,
    inactivity: {
      over_1_month: 430,
      over_2_months: 310,
      over_3_months: 240,
      over_4_months: 190,
      over_5_months: 150,
      over_6_months: 120,
      over_1_year: 45,
    },
    loyal_inactivity: {
      over_1_month: 260,
      over_2_months: 180,
      over_3_months: 130,
      over_4_months: 100,
      over_5_months: 80,
      over_6_months: 60,
      over_1_year: 20,
    },
    loyal_reactivation_cohorts: {
      from_1_to_2_months: 80,
      from_2_to_3_months: 50,
      from_3_to_6_months: 70,
      from_6_to_12_months: 40,
      over_1_year: 20,
    },
  },
  'clients.dossier.read': {
    found: true,
    display_name: 'клиент',
    matches_count: 1,
    visits: 39,
    last_visit: '2026-07-20',
    inactivity_days: 18,
    favorite_services: ['Стрижка', 'Борода'],
    avg_cycle_days: 31,
    total_spent: 62_150,
    loyal: true,
    loyalty_segment: 'core',
    bonus_balance: 2133,
    bonus_currency: 'RUB',
    bonus_status: 'available',
  },
  'catalog.services.read': { services: [] },
  'catalog.staff.read': { staff: [] },
  'booking.availability.read': { slots: [] },
  'appointments.own.list': { appointments: [] },
  'loyalty.own.read': { balance: 0, spend_options: { items: [] } },
  'operations.journal.read': {
    verified: true,
    source: 'yclients',
    pii_redacted: true,
    date: '2026-08-07',
    summary: {
      total: 12,
      active: 10,
      confirmed: 7,
      completed: 3,
      canceled: 2,
      no_show: 0,
      other: 0,
    },
    staff: [
      {
        name: 'Тестовый мастер',
        is_working: true,
        working_hours: [{ from: '10:00', to: '20:00' }],
        appointments: {
          total: 12,
          active: 10,
          confirmed: 7,
          completed: 3,
          canceled: 2,
          no_show: 0,
          other: 0,
        },
        booked_minutes: 600,
        working_minutes: 600,
        load_percent: 100,
      },
    ],
    appointments: [],
  },
};

/** Аргументы, которыми модель зовёт инструмент, когда сервер его не предзагрузил. */
function argumentsForTool(name: string): Record<string, unknown> {
  if (name === 'booking.availability.read') {
    return { date: '2026-08-08T09:00:00.000Z' };
  }
  if (name === 'clients.dossier.read') {
    return { query: 'Иван' };
  }
  if (name === 'operations.journal.read') {
    return { date: '2026-08-07' };
  }
  if (name === 'analytics.business.profit' || name === 'expenses.read') {
    return { period: 'month_to_date' };
  }
  if (name.startsWith('analytics.')) {
    return { period: 'month_to_date', comparison: 'none' };
  }
  return {};
}

function createHarness(
  user: AuthenticatedUser,
  features: Record<string, boolean> = ALL_FEATURES,
) {
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;
  const approvals: Record<string, unknown>[] = [];
  const executions: Record<string, unknown>[] = [];

  const prisma = {
    aiApprovalRequest: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('approval'),
          decidedByUserId: null,
          decidedByTenantId: null,
          decidedAt: null,
          executedAt: null,
          errorCode: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...args.data,
        };
        approvals.push(row);
        return Promise.resolve({ ...row });
      }),
    },
    aiToolExecution: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = { id: nextId('execution'), ...args.data };
        executions.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn((args: { where: { id: string }; data: object }) => {
        const found = executions.find((row) => row.id === args.where.id);
        if (found) Object.assign(found, args.data);
        return Promise.resolve(found ?? {});
      }),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const encryption = {
    encrypt: (value: string) =>
      `enc:${Buffer.from(value, 'utf8').toString('base64url')}`,
    decrypt: (value: string) =>
      Buffer.from(value.slice(4), 'base64url').toString('utf8'),
  } as unknown as EncryptionService;
  const auditLog = {
    log: jest.fn().mockResolvedValue({ id: 'audit-a' }),
  } as unknown as AuditLogService;
  const entitlements = {
    getEffectiveEntitlements: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      planId: 'max',
      features,
      featureKeys: [],
    }),
    assertFeature: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntitlementsService;

  const executed: Array<{ name: string; arguments: unknown }> = [];
  const handler = {
    normalizeArguments: jest.fn(
      (_name: string, _principal: unknown, args: unknown) =>
        Promise.resolve(args),
    ),
    enrichApprovalPreview: jest.fn(
      (
        _name: string,
        _principal: unknown,
        _args: unknown,
        payload: Record<string, unknown>,
      ) => Promise.resolve(payload),
    ),
    execute: jest.fn((name: string, _principal: unknown, args: unknown) => {
      executed.push({ name, arguments: args });
      return Promise.resolve(TOOL_RESULTS[name] ?? {});
    }),
  } as unknown as AiToolHandlerService;

  const registry = new AiToolRegistryService();
  const runtime = new AiToolRuntimeService(
    prisma,
    tenantContext,
    registry,
    new AiToolPolicyService(tenantContext, entitlements, registry),
    handler,
    encryption,
    auditLog,
  );

  const decide = jest.fn<
    Promise<AiCoreModelDecision | null>,
    [AiCoreModelInput]
  >();
  const scheduleCommandStub = { tryHandle: jest.fn().mockResolvedValue(null) };
  const service = new AiCoreService(
    {
      get: jest.fn((name: string) =>
        name === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
      ),
    } as unknown as ConfigService,
    tenantContext,
    {
      assertTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRateLimitService,
    runtime,
    { decide } as unknown as AiCoreModelService,
    auditLog,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
      updateAssistant: jest.fn(),
    } as unknown as DashboardPreferencesService,
    scheduleCommandStub as unknown as StaffScheduleCommandService,
    new MayaBrainRouterService(),
  );

  // Модель послушная: берёт ПЕРВОЕ имя из required_tools — то есть подсказку
  // сервера. Так видно, куда маршрутизация ведёт живой вопрос.
  decide.mockImplementation((input: AiCoreModelInput) => {
    const hint = input.requiredToolNames[0] ?? null;
    const toolCall =
      input.allowToolCall && input.toolResults.length === 0 && hint
        ? { name: hint, arguments: argumentsForTool(hint) }
        : null;
    return Promise.resolve({
      reply: toolCall ? 'Смотрю данные.' : 'Готово, отвечаю по данным.',
      toolCall,
      provider: 'deepseek' as const,
      model: 'test-model',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
  });

  let request = 0;
  const askWithAudience = (
    audience: 'client' | 'staff' | 'owner' | undefined,
    ...turns: string[]
  ) =>
    tenantContext.runAsSystemTenant('tenant-a', () =>
      service.chat(user, {
        surface: 'native',
        ...(audience ? { audience } : {}),
        requestId: `request_${(request += 1)}0000000`,
        // Предыдущие ходы — это уже состоявшийся разговор: вопрос человека и
        // ответ MAYA. Последняя реплика — та, которую разбираем.
        messages: turns.flatMap((text, index) =>
          index === turns.length - 1
            ? [{ role: 'user' as const, content: text }]
            : [
                { role: 'user' as const, content: text },
                { role: 'assistant' as const, content: 'Ответила по данным.' },
              ],
        ),
      }),
    );
  const ask = (...turns: string[]) => askWithAudience(undefined, ...turns);

  return {
    ask,
    askWithAudience,
    decide,
    executed,
    approvals,
    scheduleTryHandle: scheduleCommandStub.tryHandle,
  };
}

const OWNER: AuthenticatedUser = {
  userId: 'owner_12345678',
  sessionId: 'session-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  email: 'owner@example.test',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
};
const MASTER: AuthenticatedUser = {
  ...OWNER,
  userId: 'master_12345678',
  role: UserRole.EMPLOYEE,
};
const CLIENT: AuthenticatedUser = {
  ...OWNER,
  userId: 'client_12345678',
  role: UserRole.CLIENT,
};

describe('КОРПУС: живые формулировки владельца барбершопа', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterAll(() => jest.useRealTimers());

  /** Вопрос → инструмент, которым MAYA ответила. */
  const route = async (...turns: string[]) => {
    const harness = createHarness(OWNER);
    const answer = await harness.ask(...turns);
    return {
      tools: answer.tools_used.map((tool) => tool.name),
      domain: answer.grounding.domain,
      arguments: harness.executed.at(-1)?.arguments as
        Record<string, unknown> | undefined,
      modelCalls: harness.decide.mock.calls.length,
      answer,
    };
  };

  it.each(OWNER_ROUTING_CORPUS)(
    '$id',
    async ({
      text,
      previous,
      tools,
      arguments: expectedArgs,
      notTools,
      domain,
    }) => {
      const turns = previous ? [previous, text] : [text];
      const result = await route(...turns);

      expect(result.tools).toEqual(tools);
      for (const banned of notTools ?? []) {
        expect(result.tools).not.toContain(banned);
      }
      if (expectedArgs) {
        expect(result.arguments).toMatchObject(expectedArgs);
        if (expectedArgs.period === 'named_day') {
          expect(result.arguments).not.toHaveProperty('month');
        }
      }
      if (domain) {
        expect(result.domain).toBe(domain);
      }
    },
  );

  it('команда «Запиши аренду 60 тысяч» — карточка расхода, а не отчёт', async () => {
    const harness = createHarness(OWNER);
    // Команда — это действие: подсказки нет, инструмент называет модель.
    harness.decide.mockImplementation((input: AiCoreModelInput) =>
      Promise.resolve({
        reply: 'Подготовила запись расхода.',
        toolCall:
          input.toolResults.length === 0
            ? {
                name: 'expenses.create',
                arguments: { category: 'rent', amount_rubles: 60_000 },
              }
            : null,
        provider: 'deepseek' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    );

    const answer = await harness.ask('Запиши аренду 60 тысяч');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'expenses.create',
    ]);
    expect(answer.action).toMatchObject({ status: 'approval_required' });
    // Отчёт по салону ради команды не поднимается.
    expect(harness.executed).toEqual([]);
  });

  it('«сколько всего клиентов в базе» — полный CRM-реестр, не гости месяца', async () => {
    const result = await route('Сколько всего клиентов в нашей базе?');

    expect(result.tools).toEqual(['clients.retention.scan']);
    expect(result.domain).toBe('client_retention');
    expect(result.answer.reply).toContain('1200');
    expect(result.tools).not.toContain('analytics.business.query');
  });

  it('«не ходят больше двух месяцев» — точный готовый порог', async () => {
    const result = await route(
      'Сколько клиентов не ходят к нам больше двух месяцев?',
    );

    expect(result.tools).toEqual(['clients.retention.scan']);
    expect(result.domain).toBe('client_retention');
    expect(result.answer.reply).toContain('310');
    expect(result.answer.reply).toMatch(/больше 2 месяцев/i);
  });

  it('«сколько лояльных» — пожизненные визиты карточки CRM', async () => {
    const result = await route('Сколько у нас всего лояльных клиентов?');

    expect(result.tools).toEqual(['clients.retention.scan']);
    expect(result.domain).toBe('client_retention');
    expect(result.answer.reply).toContain('620');
    expect(result.answer.reply).toMatch(/минимум с 3 визитами/i);
  });

  it('пересекает лояльность и срок отсутствия, а не берёт всю базу', async () => {
    const result = await route(
      'Кто у нас не был больше 1 месяца из лояльных клиентов?',
    );

    expect(result.tools).toEqual(['clients.retention.scan']);
    expect(result.answer.reply).toContain('260');
    expect(result.answer.reply).toContain('Из 620 лояльных');
    expect(result.answer.reply).not.toContain('430');
    expect(result.modelCalls).toBe(0);
  });

  it('удерживает retention-сегмент в реплике «как их вернуть»', async () => {
    const result = await route(
      'Кто у нас не был больше 1 месяца из лояльных клиентов?',
      'Дай совет, как их вернуть?',
    );

    expect(result.tools).toEqual(['clients.retention.scan']);
    expect(result.tools).not.toContain('analytics.business.query');
    expect(result.answer.reply).toContain('260');
    expect(result.answer.reply).toContain('80 клиентов');
    expect(result.answer.reply).toContain('1–2 месяца');
    expect(result.answer.reply).toMatch(/привычного мастера и услугу/i);
    expect(result.answer.reply).toMatch(/проверки согласий/i);
    expect(result.answer.reply).not.toMatch(/снизить отмены/i);
    expect(result.modelCalls).toBe(0);
  });

  it('«сколько визитов у клиента» — точное обезличенное CRM-досье', async () => {
    const result = await route('Сколько визитов у Ивана?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.domain).toBe('client_dossier');
    expect(result.answer.reply).toContain('39 визитов');
    expect(result.answer.reply).toContain('2 133 ₽');
    expect(result.answer.reply).not.toContain('Иван');
    expect(result.answer.source).toBe('safe_fallback');
    expect(result.arguments).toEqual({ query: 'Ивана' });
    expect(result.modelCalls).toBe(0);
  });

  it('«сколько бонусов у клиента» — не баланс самого владельца', async () => {
    const result = await route('Сколько бонусов у Ивана?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.tools).not.toContain('loyalty.own.read');
    expect(result.answer.reply).toContain('Бонусный баланс — 2 133 ₽');
  });

  it('«какие услуги покупает клиент» — привычки из последних визитов', async () => {
    const result = await route('Какие услуги покупает Иван?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.answer.reply).toMatch(/Стрижка, Борода/);
  });

  it('уточнение «что он обычно берёт» сохраняет клиента из прошлого хода', async () => {
    const result = await route('Расскажи про Ивана', 'Что он обычно берёт?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.arguments).toEqual({ query: 'Ивана' });
    expect(result.answer.reply).toMatch(/Стрижка, Борода/);
    expect(result.modelCalls).toBe(0);
  });
});

describe('КОРПУС: роли остались на своих данных', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterAll(() => jest.useRealTimers());

  const askAs = async (user: AuthenticatedUser, text: string) => {
    const harness = createHarness(user);
    const answer = await harness.ask(text);
    return {
      tools: answer.tools_used.map((tool) => tool.name),
      domain: answer.grounding.domain,
      answer,
    };
  };

  it('клиент: «какие у вас мастера» — справочник мастеров', async () => {
    const result = await askAs(CLIENT, 'Какие у вас мастера?');

    expect(result.tools).toEqual(['catalog.staff.read']);
    expect(result.domain).toBe('staff_catalog');
  });

  it('клиент: «мои записи» — своя история, и она не уходит в модель', async () => {
    const harness = createHarness(CLIENT);
    const answer = await harness.ask('Мои записи');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'appointments.own.list',
    ]);
    expect(answer.grounding.domain).toBe('client_appointments');
    // 🔴 152-ФЗ: историю визитов собирает сервер, во внешнюю модель она не
    // уезжает — второго обращения к провайдеру нет вовсе.
    expect(harness.decide).toHaveBeenCalledTimes(1);
    expect(answer.source).toBe('safe_fallback');
  });

  it('клиент: «сколько у меня баллов» — баланс, собранный сервером', async () => {
    const harness = createHarness(CLIENT);
    const answer = await harness.ask('Сколько у меня баллов?');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'loyalty.own.read',
    ]);
    expect(answer.grounding.domain).toBe('client_loyalty');
    expect(harness.decide).toHaveBeenCalledTimes(1);
  });

  it('клиент: «свободные окна завтра» — реальные слоты', async () => {
    const result = await askAs(CLIENT, 'Свободные окна завтра есть?');

    expect(result.tools).toEqual(['booking.availability.read']);
    expect(result.domain).toBe('booking_availability');
  });

  it('мастер: «сколько у меня записей» — личная аналитика, а не отказ', async () => {
    const result = await askAs(MASTER, 'Сколько у меня записей?');

    // 🔴 Раньше подсказка вела в клиентскую историю визитов, мастеру её не
    // выдают — и вопрос заканчивался «недоступно для вашей роли».
    expect(result.tools).toEqual(['analytics.employee.query']);
    expect(result.domain).toBe('employee_query');
  });

  it('мастер: «мои повторные клиенты» — личная аналитика', async () => {
    const result = await askAs(MASTER, 'Мои повторные клиенты?');

    expect(result.tools).toEqual(['analytics.employee.query']);
    expect(result.domain).toBe('employee_query');
  });

  it('мастер: «что за клиент Иван» — CRM-досье', async () => {
    const result = await askAs(MASTER, 'Что за клиент Иван?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.domain).toBe('client_dossier');
  });

  it('владелец: «ты видишь базу клиентов?» — честный доступ, без отказа', async () => {
    const result = await askAs(OWNER, 'Ты видишь базу клиентов?');

    expect(result.tools).toEqual([]);
    expect(result.answer.source).toBe('safe_fallback');
    expect(result.answer.reply).toMatch(/доступ есть/i);
    expect(result.answer.reply).not.toMatch(/не вижу/i);
  });
});

/**
 * Контракт поверхности «мастер»: приложение шлёт audience=staff из режима
 * мастера, и сервер обязан выдать СТРОГО мастерский набор прав — кем бы
 * человек ни был по членству.
 *
 * 🔴 До фикса audience=staff игнорировался: владелец в режиме мастера получал
 * владельческие инструменты, «Моя статистика» отвечала кассой всего салона —
 * главное расхождение живого поведения с документацией.
 */
describe('КОРПУС: audience=staff — поверхность мастера, а не кабинета', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterAll(() => jest.useRealTimers());

  const askStaffSurface = async (user: AuthenticatedUser, text: string) => {
    const harness = createHarness(user);
    const answer = await harness.askWithAudience('staff', text);
    return {
      tools: answer.tools_used.map((tool) => tool.name),
      domain: answer.grounding.domain,
      answer,
    };
  };

  it('владелец в режиме мастера: «сколько я заработал» — личная аналитика, не касса салона', async () => {
    const result = await askStaffSurface(OWNER, 'Сколько я заработал за июль?');

    expect(result.tools).toEqual(['analytics.employee.query']);
    expect(result.domain).toBe('employee_query');
  });

  it('владелец в режиме мастера: «моя статистика» — личный масштаб', async () => {
    const result = await askStaffSurface(OWNER, 'Моя статистика за месяц?');

    expect(result.tools).toEqual(['analytics.employee.query']);
    expect(result.tools).not.toContain('analytics.business.query');
  });

  it('владелец в режиме мастера: досье клиента остаётся доступным', async () => {
    const result = await askStaffSurface(OWNER, 'Что за клиент Иван?');

    expect(result.tools).toEqual(['clients.dossier.read']);
    expect(result.domain).toBe('client_dossier');
  });

  it('владелец в режиме мастера: команда графика уходит с ролью мастера', async () => {
    // Внутри StaffScheduleCommandService роль мастера получает вежливый отказ
    // (см. её собственный спек) — здесь важно, что поверхность передала
    // именно мастерскую роль, а не владельческую.
    const harness = createHarness(OWNER);
    await harness.askWithAudience('staff', 'Закрой день 12 августа');

    expect(harness.scheduleTryHandle).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.STAFF }),
      expect.anything(),
    );
  });

  it('клиент с audience=staff НЕ повышается: деньги салона — отказ', async () => {
    const result = await askStaffSurface(CLIENT, 'Сколько заработал салон?');

    expect(result.tools).toEqual([]);
    expect(result.answer.source).toBe('safe_fallback');
    expect(result.answer.reply).toMatch(/недоступен/i);
  });

  it('настоящий мастер с audience=staff работает как раньше', async () => {
    const result = await askStaffSurface(MASTER, 'Сколько у меня записей?');

    expect(result.tools).toEqual(['analytics.employee.query']);
    expect(result.domain).toBe('employee_query');
  });

  it('мастер: вопрос о технике — свободный ответ, без принудительного заземления', async () => {
    const harness = createHarness(MASTER);
    const answer = await harness.askWithAudience(
      'staff',
      'Посоветуй технику стрижки для тонких волос',
    );

    expect(answer.tools_used).toEqual([]);
    expect(answer.grounding.status).toBe('not_required');
    expect(answer.source).not.toBe('safe_fallback');
  });
});

/**
 * Свойства самой маршрутизации — то, ради чего она переделана. Корпус выше
 * проверяет тринадцать конкретных фраз, а эти три теста — что ход не ломается
 * на четырнадцатой, которую никто не предусмотрел.
 */
describe('КОРПУС: промах подсказки больше не отказ', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterAll(() => jest.useRealTimers());

  it('модель взяла НЕ подсказанный инструмент — ответ доходит, а не отказ', async () => {
    const harness = createHarness(OWNER);
    // Сервер подсказывает справочник услуг, модель считает вопрос вопросом об
    // экономике и берёт аналитику. Раньше это был мгновенный отказ: инструмент
    // не из списка — ход обрывался.
    harness.decide.mockImplementation((input: AiCoreModelInput) =>
      Promise.resolve({
        reply:
          input.toolResults.length === 0
            ? 'Смотрю данные.'
            : 'Отвечаю по данным.',
        toolCall:
          input.toolResults.length === 0
            ? {
                name: 'analytics.business.query',
                arguments: { period: 'month_to_date', comparison: 'none' },
              }
            : null,
        provider: 'deepseek' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    );

    const answer = await harness.ask('Сколько стоит стрижка?');

    expect(answer.source).toBe('deepseek');
    expect(answer.grounding).toMatchObject({
      status: 'verified',
      // Домен — по факту: тему назвал инструмент, который отработал.
      domain: 'business_query',
      evidence_tools: ['analytics.business.query'],
    });
    expect(answer.reply).toBe('Отвечаю по данным.');
  });

  it('перехват ПД идёт по вызванному инструменту, а не по угаданной теме', async () => {
    const harness = createHarness(CLIENT);
    // Подсказка ведёт в баллы, а модель берёт историю визитов. Перехват обязан
    // сработать всё равно: это ПД спрашивающего.
    harness.decide.mockImplementation((input: AiCoreModelInput) =>
      Promise.resolve({
        reply: 'Смотрю данные.',
        toolCall:
          input.toolResults.length === 0
            ? { name: 'appointments.own.list', arguments: {} }
            : null,
        provider: 'deepseek' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    );

    const answer = await harness.ask('Что у меня по баллам и записям?');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'appointments.own.list',
    ]);
    // Второго обращения к модели нет: история визитов за периметр не уехала.
    expect(harness.decide).toHaveBeenCalledTimes(1);
    expect(answer.source).toBe('safe_fallback');
    expect(answer.grounding.domain).toBe('client_appointments');
  });

  it('ни одного инструмента данных для роли — прежний честный отказ', async () => {
    const harness = createHarness(CLIENT);

    const answer = await harness.ask('Какая выручка бизнеса за этот месяц?');

    expect(answer.reply).toBe(
      'Этот запрос недоступен для вашей текущей роли или тарифа. MAYA не покажет чужие или закрытые данные.',
    );
    expect(answer.grounding).toMatchObject({
      status: 'blocked',
      domain: 'business_query',
    });
    expect(harness.decide).not.toHaveBeenCalled();
  });
});
