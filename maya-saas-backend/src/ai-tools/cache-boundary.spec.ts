import { measurementReaderDouble } from '../../test/helpers/measurement-reader';
/**
 * P7 §11 — СОСТЯЗАТЕЛЬНАЯ ПРОВЕРКА ГРАНИЦ КЭША.
 *
 * 🔴 Вопрос пакета один: может ли кэш стать вторым источником истины.
 * Двенадцать пунктов ниже названы так же, как в задании, и каждый пытается
 * заставить кэш соврать: отдать чужому арендатору, перепутать сутки, отдать
 * привилегированный ответ роли без прав, выдать просроченное за свежее или
 * подменить неполноту измерением.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { CalendarSource, UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { CustomersService } from '../customers/customers.service';
import type { ExpensesService } from '../expenses/expenses.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { StaffService } from '../staff/staff.service';

const visit = (id: string, price: number | null, startAt: string) => ({
  id,
  client: { id: `c-${id}`, name: 'Клиент' },
  provider: { id: 'crm-1', name: 'Илья' },
  branch: null,
  service_ids: ['svc-1'],
  services: [
    {
      id: 'svc-1',
      name: 'Стрижка',
      price: price ?? 0,
      duration_minutes: 60,
      currency: 'RUB',
    },
  ],
  start_at: startAt,
  end_at: startAt,
  status: 'completed',
  attendance: 'arrived',
  notes: null,
  total_price: price,
  currency: 'RUB',
});

const FINANCE = {
  source: 'external_crm',
  provider: 'yclients',
  verified: true,
  period: { from: '2026-08-01', to: '2026-08-31' },
  revenue: {
    status: 'available',
    verified: true,
    total: { currency: 'RUB', amount_kopecks: 7_777_700 },
    transaction_count: 10,
    by_account: [],
    by_staff: [],
    by_service: [],
    staff_attribution_status: 'unavailable',
    staff_attribution_coverage_percent: null,
  },
  payroll: {
    status: 'unavailable',
    verified: false,
    accrued_total: null,
    paid_total: null,
    balance_total: null,
    staff: [],
  },
  warnings: [],
};

type Options = {
  visitsByTenant?: Record<string, unknown[]>;
  timezone?: string;
  completeness?: 'complete' | 'truncated';
  journalFails?: boolean;
  finance?: unknown;
};

function build(options: Options = {}) {
  const getJournal = jest.fn(
    (tenantId: string, range: { from: string; to: string }) => {
      if (options.journalFails) {
        return Promise.reject(new Error('provider is down'));
      }
      const all = options.visitsByTenant?.[tenantId] ?? [];
      const from = new Date(range.from).getTime();
      const to = new Date(range.to).getTime();
      return Promise.resolve({
        calendar_source: 'external',
        completeness: options.completeness ?? 'complete',
        timezone: options.timezone ?? 'Europe/Moscow',
        range,
        provider_id: null,
        count: all.length,
        appointments: all.filter((item) => {
          const at = new Date(
            (item as { start_at: string }).start_at,
          ).getTime();
          return at >= from && at <= to;
        }),
        all_masters: [],
      });
    },
  );
  const crmService = {
    getJournal,
    getStaff: jest.fn().mockResolvedValue([]),
    getFinancialSummary: jest.fn().mockResolvedValue(options.finance ?? null),
    /**
     * Длинный период граница CRM обслуживает другим вызовом: расчёт зарплаты
     * она отдаёт только за короткое окно, а выручку — за год.
     */
    getRevenueSummary: jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: { from: '2026-01-01', to: '2026-12-31' },
      revenue: {
        status: 'available',
        verified: true,
        total: { currency: 'RUB', amount_kopecks: 7_777_700 },
        transaction_count: 10,
        by_account: [],
        by_staff: [],
        by_service: [],
        staff_attribution_status: 'unavailable',
        staff_attribution_coverage_percent: null,
      },
      warnings: [],
    }),
    getClientRegistry: jest.fn().mockResolvedValue({ clients: [] }),
  } as unknown as CrmService;
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: options.timezone ?? 'Europe/Moscow',
        calendarSource: CalendarSource.EXTERNAL,
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
    internalProvider: { findMany: jest.fn().mockResolvedValue([]) },
    reconciliationRun: { findFirst: jest.fn().mockResolvedValue(null) },
    branch: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const tenantContext = new TenantContextService();
  const analytics = new OperationsAnalyticsService(
    prisma,
    tenantContext,
    { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
    crmService,
    {
      encrypt: (value: string) => value,
      decrypt: (value: string) => value,
    } as unknown as EncryptionService,
    new AppointmentPeriodReader(crmService),
    new AttendanceFactsService(prisma, tenantContext),
  );
  const businessState = new BusinessStateService(analytics, prisma);
  const businessSpy = jest.spyOn(businessState, 'business');
  const handler = new AiToolHandlerService(
    crmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    analytics,
    {} as ExpensesService,
    prisma,
    {} as CustomersService,
    {} as StaffService,
    businessState,
    new AppointmentPeriodReader(crmService),
    new ClientRecencyFactsService(crmService),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    measurementReaderDouble(),
  );
  return { handler, tenantContext, getJournal, businessSpy, analytics };
}

const ask = (
  stack: ReturnType<typeof build>,
  tenantId: string,
  args: Record<string, unknown>,
  role: UserRole = UserRole.TENANT_OWNER,
) =>
  stack.tenantContext.runAsSystemTenant(tenantId, () =>
    stack.handler.execute(
      'analytics.business.query',
      {
        tenantId,
        userId: `user-of-${tenantId}`,
        role,
        surface: 'web',
      } as never,
      args as never,
      'cache-test',
    ),
  ) as Promise<Record<string, never>>;

const CUSTOM = {
  period: 'custom',
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
  comparison: 'none',
};

describe('P7 §11 — кэш не становится источником истины', () => {
  it('🔴 1. один период, два арендатора: записи не смешиваются', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
        'tenant-b': [
          visit('b1', 3000, '2026-08-10T09:00:00.000Z'),
          visit('b2', 3000, '2026-08-11T09:00:00.000Z'),
        ],
      },
    });

    const a = await ask(stack, 'tenant-a', CUSTOM);
    const b = await ask(stack, 'tenant-b', CUSTOM);

    expect((a.metrics as Record<string, number>).appointments_total).toBe(1);
    expect((b.metrics as Record<string, number>).appointments_total).toBe(2);
  });

  it('2. один арендатор, разные периоды: ответы различаются', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [
          visit('a', 2500, '2026-08-10T09:00:00.000Z'),
          visit('b', 2500, '2026-09-10T09:00:00.000Z'),
        ],
      },
    });

    const august = await ask(stack, 'tenant-a', CUSTOM);
    const september = await ask(stack, 'tenant-a', {
      ...CUSTOM,
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });

    expect((august.metrics as Record<string, number>).appointments_total).toBe(
      1,
    );
    expect(
      (september.metrics as Record<string, number>).appointments_total,
    ).toBe(1);
    expect(august.resolved_period).not.toEqual(september.resolved_period);
  });

  it('🔴 3. те же границы, другой пояс: разные записи кэша', async () => {
    const moscow = build({
      timezone: 'Europe/Moscow',
      visitsByTenant: { 'tenant-a': [] },
    });
    const almaty = build({
      timezone: 'Asia/Almaty',
      visitsByTenant: { 'tenant-a': [] },
    });

    const first = await ask(moscow, 'tenant-a', {
      period: 'month_to_date',
      comparison: 'none',
    });
    const second = await ask(almaty, 'tenant-a', {
      period: 'month_to_date',
      comparison: 'none',
    });

    // Разные пояса дают разные границы месяца — и это видно в ответе.
    expect(first.resolved_period).not.toEqual(second.resolved_period);
  });

  it('🔴 4. привилегированный и ограниченный вызывающий не делят запись', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      finance: FINANCE,
    });

    const owner = await ask(stack, 'tenant-a', CUSTOM, UserRole.TENANT_OWNER);
    const restricted = await ask(
      stack,
      'tenant-a',
      CUSTOM,
      UserRole.BRANCH_MANAGER,
    );

    expect(
      (owner.metrics as Record<string, number>).revenue_amount_kopecks,
    ).toBeNull();
    expect(owner.measurement).toMatchObject({
      contract: 'c7.measurement.read/1',
    });
    expect(restricted.measurement).toBeNull();
    // 🔴 Роль без права на кассу не должна получить её из кэша владельца.
    expect(
      (restricted.metrics as Record<string, number | null>)
        .revenue_amount_kopecks,
    ).toBeNull();
    expect(JSON.stringify(restricted)).not.toContain('7777700');
  });

  it('5. измеренный ноль переживает попадание в кэш', async () => {
    const stack = build({ visitsByTenant: { 'tenant-a': [] } });

    const first = await ask(stack, 'tenant-a', CUSTOM);
    const second = await ask(stack, 'tenant-a', CUSTOM);

    for (const answer of [first, second]) {
      expect(
        (answer.metrics as Record<string, number>).appointments_total,
      ).toBe(0);
      expect(answer.available_metrics as string[]).toContain(
        'appointments_total',
      );
    }
    // Второй ответ пришёл из кэша: источник не перечитывался.
    expect(stack.businessSpy).toHaveBeenCalledTimes(1);
  });

  it('🔴 6. неполное чтение НЕ кэшируется и не становится измеренным', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      completeness: 'truncated',
    });

    const first = await ask(stack, 'tenant-a', CUSTOM);
    const second = await ask(stack, 'tenant-a', CUSTOM);

    for (const answer of [first, second]) {
      expect(
        (answer.limitations as Array<{ key: string }>).map((item) => item.key),
      ).toContain('incomplete_read');
    }
    // Каждый запрос идёт к владельцу заново: деградировавший ответ не живёт.
    expect(stack.businessSpy).toHaveBeenCalledTimes(2);
  });

  it('7. недоступный денежный источник остаётся недоступным', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      finance: null,
    });

    const answer = await ask(stack, 'tenant-a', CUSTOM);

    expect((answer.metrics as Record<string, string>).revenue_basis).toBe(
      'unavailable',
    );
  });

  it('🔴 8. просроченная запись не отдаётся как свежая', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
    });

    const first = await ask(stack, 'tenant-a', CUSTOM);
    // Пять минут спустя.
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1_000;
    try {
      const second = await ask(stack, 'tenant-a', CUSTOM);
      expect(stack.businessSpy).toHaveBeenCalledTimes(2);
      expect(second.calculated_at).not.toBe(first.calculated_at);
    } finally {
      Date.now = realNow;
    }
  });

  it('🔴 9. отказ провайдера не подменяется старым значением', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
    });
    await ask(stack, 'tenant-a', CUSTOM);

    // Источник падает, срок жизни записи истёк.
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1_000;
    (stack.getJournal as jest.Mock).mockRejectedValue(
      new Error('provider is down'),
    );
    try {
      await expect(ask(stack, 'tenant-a', CUSTOM)).rejects.toThrow(
        'provider is down',
      );
    } finally {
      Date.now = realNow;
    }
  });

  it('10. промах ведёт к каноническому владельцу, а не к старому помощнику', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
    });

    await ask(stack, 'tenant-a', CUSTOM);

    expect(stack.businessSpy).toHaveBeenCalledTimes(1);
    expect(stack.businessSpy.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-a',
      comparisonMode: 'none',
    });
  });

  it('11. потеря кэша меняет скорость, а не правду', async () => {
    const warm = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      finance: FINANCE,
    });
    const cold = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      finance: FINANCE,
    });

    await ask(warm, 'tenant-a', CUSTOM);
    const hit = await ask(warm, 'tenant-a', CUSTOM);
    // Второй стенд — как после перезапуска процесса: кэш пуст.
    const miss = await ask(cold, 'tenant-a', CUSTOM);

    expect(hit.metrics).toEqual(miss.metrics);
    expect(hit.limitations).toEqual(miss.limitations);
    expect(hit.unavailable_metrics).toEqual(miss.unavailable_metrics);
    expect(hit.resolved_period).toEqual(miss.resolved_period);
  });

  it('12. попадание и промах дают одну семантику всем поверхностям', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, '2026-08-10T09:00:00.000Z')],
      },
      finance: FINANCE,
    });

    const miss = await ask(stack, 'tenant-a', CUSTOM);
    const hit = await ask(stack, 'tenant-a', CUSTOM);
    const fields = [
      'revenue_amount_kopecks',
      'revenue_basis',
      'booked_value_amount_kopecks',
      'booked_value_basis',
      'appointments_total',
    ];

    for (const field of fields) {
      expect((hit.metrics as Record<string, unknown>)[field]).toEqual(
        (miss.metrics as Record<string, unknown>)[field],
      );
    }
    expect(hit.calculated_at).toBe(miss.calculated_at);
  });
});

describe('P7 — окна с движущейся правой границей', () => {
  /**
   * 🔴 Найдено состязательной проверкой ПОСЛЕ того, как я счёл пакет готовым.
   *
   * У `month_to_date`, `week_to_date`, `year_to_date`, `last_7_days` и
   * `last_30_days` правая граница окна — это «сейчас» с точностью до
   * миллисекунды. Первая версия ключа клала её в ключ, и кэш переставал
   * попадать вовсе: каждый вызов давал новый ключ, а старая запись оставалась
   * в памяти навсегда. Боевая проверка этого не поймала, потому что шла на
   * `custom` с фиксированными границами.
   */
  const MOVING = [
    'month_to_date',
    'week_to_date',
    'year_to_date',
    'last_7_days',
    'last_30_days',
  ];

  for (const period of MOVING) {
    it(`🔴 «${period}»: второй вызов попадает в кэш`, async () => {
      const stack = build({
        visitsByTenant: {
          'tenant-a': [visit('a', 2500, new Date().toISOString())],
        },
        // Денежный контур отвечает: этот тест про тождество ключа, а не про
        // гейт деградации.
        finance: FINANCE,
      });

      const first = await ask(stack, 'tenant-a', {
        period,
        comparison: 'none',
      });
      const second = await ask(stack, 'tenant-a', {
        period,
        comparison: 'none',
      });

      expect(stack.businessSpy).toHaveBeenCalledTimes(1);
      expect(second.calculated_at).toBe(first.calculated_at);
    });
  }

  it('🔴 но на следующие сутки ключ меняется сам', async () => {
    const stack = build({
      visitsByTenant: {
        'tenant-a': [visit('a', 2500, new Date().toISOString())],
      },
      finance: FINANCE,
    });

    await ask(stack, 'tenant-a', {
      period: 'month_to_date',
      comparison: 'none',
    });
    const realNow = Date.now;
    // Следующие сутки арендатора, но в пределах срока жизни записи.
    Date.now = () => realNow() + 24 * 60 * 60 * 1_000;
    try {
      await ask(stack, 'tenant-a', {
        period: 'month_to_date',
        comparison: 'none',
      });
      expect(stack.businessSpy).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('закрытый период по-прежнему ключуется своими границами', async () => {
    const stack = build({
      visitsByTenant: { 'tenant-a': [] },
      finance: FINANCE,
    });

    await ask(stack, 'tenant-a', { period: 'yesterday', comparison: 'none' });
    await ask(stack, 'tenant-a', { period: 'yesterday', comparison: 'none' });

    expect(stack.businessSpy).toHaveBeenCalledTimes(1);
  });
});

describe('P7 — храповик границы кэша', () => {
  const read = () =>
    readFileSync(join(__dirname, 'ai-tool-handler.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('🔴 ключ факта периода строится из РАЗРЕШЁННОГО окна, а не из фразы', () => {
    const source = read();

    // Общий строитель ключа существует и используется обоими кэшами.
    expect(source).toMatch(/private periodCacheKey\(/);
    expect((source.match(/this\.periodCacheKey\(/g) ?? []).length).toBe(2);
    // Фраза запроса ключом больше не является.
    expect(source).not.toMatch(
      /cacheKey = \[\s*principal\.tenantId,\s*principal\.role,\s*this\.requiredString\(args\.period\)/,
    );
  });

  it('🔴 в ключ входят арендатор, видимость, окно и пояс', () => {
    const source = read();
    const builder = source.slice(
      source.indexOf('private periodCacheKey('),
      source.indexOf('private async reportingWindow('),
    );

    expect(builder).toMatch(/window\.query\.from/);
    expect(builder).toMatch(/window\.timezone/);
    expect(builder).toMatch(/window\.query\.branchId/);
    // Личность вызывающего приходит параметром `identity` и всегда содержит
    // арендатора: оба вызова передают его первым.
    const calls = source.match(/periodCacheKey\(\s*\[[^\]]*\]/g) ?? [];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toContain('principal.tenantId');
      // Видимость: роль решает, что вызывающему можно показать.
      expect(call).toContain('principal.role');
    }
    // Личный срез дополнительно разделён по пользователю.
    expect(calls.some((call) => call.includes('principal.userId'))).toBe(true);
  });

  it('🔴 неполные и неподтверждённые ответы не кэшируются', () => {
    const source = read();

    // Оба кэша проверяют полноту ОБЕИХ сторон сравнения перед записью.
    expect(
      (source.match(/completeness\.current !== 'incomplete'/g) ?? []).length,
    ).toBe(2);
    expect(
      (source.match(/completeness\.previous !== 'incomplete'/g) ?? []).length,
    ).toBe(2);
    // И запись идёт через ограниченный по размеру помощник, а не напрямую.
    expect((source.match(/this\.rememberPeriodAnswer\(/g) ?? []).length).toBe(
      2,
    );
    expect(source).not.toMatch(/QueryCache\.set\(cacheKey/);
  });

  it('🔴 у кэшируемого ответа есть момент вычисления', () => {
    const source = read();

    expect(
      (
        source.match(
          /calculated_at: new Date\(Date\.now\(\)\)\.toISOString\(\)/g,
        ) ?? []
      ).length,
    ).toBe(2);
  });

  it('промах ведёт к каноническому владельцу', () => {
    const source = read();

    // После промаха вызывается канонический слой, а не локальный помощник.
    expect(source).toMatch(/this\.businessState\.business\(/);
    expect(source).toMatch(/this\.businessState\.employee\(/);
  });
});
