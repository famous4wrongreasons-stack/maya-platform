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
import { ClientIntelligenceService } from './client-intelligence.service';
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
  'catalog.services.read': { services: [] },
  'catalog.staff.read': { staff: [] },
  'booking.availability.read': { slots: [] },
  'appointments.own.list': { appointments: [] },
  'loyalty.own.read': { balance: 0, spend_options: { items: [] } },
};

/** Аргументы, которыми модель зовёт инструмент, когда сервер его не предзагрузил. */
function argumentsForTool(name: string): Record<string, unknown> {
  if (name === 'booking.availability.read') {
    return { date: '2026-08-08T09:00:00.000Z' };
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
    {
      tryHandle: jest.fn().mockResolvedValue(null),
    } as unknown as StaffScheduleCommandService,
    new MayaBrainRouterService(),
    {
      tryHandle: jest.fn().mockResolvedValue(null),
    } as unknown as ClientIntelligenceService,
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
  const ask = (...turns: string[]) =>
    tenantContext.runAsSystemTenant('tenant-a', () =>
      service.chat(user, {
        surface: 'native',
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

  return { ask, decide, executed, approvals };
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
