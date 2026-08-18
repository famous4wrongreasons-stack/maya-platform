/**
 * P3 §10 — ОБЯЗАТЕЛЬНАЯ РЕГРЕССИЯ МИГРАЦИИ HTTP-ПОТРЕБИТЕЛЯ.
 *
 * 🔴 Кабинет перестал считать бизнес-факты сам. Двенадцать пунктов ниже — это
 * не «тесты на новый код», а утверждения о том, что при смене владельца
 * вычисления НЕ изменилось ничего из того, что видит владелец салона: ни
 * числа, ни различие «ноль / не измеряли / недоступно», ни границы периода,
 * ни то, чего роль видеть не должна.
 *
 * Каждый пункт назван так же, как в задании, чтобы проверять по списку.
 */
import { BusinessStateService } from '../business-state/business-state.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  withLegacyNet,
  withoutFactDiagnostics,
  withoutOperationalStatusBuckets,
} from './cabinet-overview.presenter';
import { OperationsAnalyticsService } from './operations-analytics.service';

const PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};
const PREVIOUS = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T23:59:59.999Z',
};

type Options = {
  source?: 'crm' | 'internal';
  visits?: unknown[];
  internalRows?: unknown[];
  completeness?: 'complete' | 'truncated';
  finance?: unknown;
  attendanceGroups?: Array<{
    attendance: string | null;
    _count: { _all: number };
  }>;
  reconciled?: boolean;
};

const visit = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
  startAt = '2026-08-10T09:00:00.000Z',
) => ({
  id,
  client: { id: `c-${id}`, name: 'Клиент' },
  provider: { id: staff, name: staff === 's1' ? 'Илья' : 'Стас' },
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
  status,
  attendance: status === 'completed' ? 'arrived' : null,
  notes: null,
  total_price: price,
  currency: 'RUB',
});

function build(options: Options = {}) {
  const external = (options.source ?? 'crm') === 'crm';
  const visits = options.visits ?? [];
  const crmService = {
    getJournal: jest.fn().mockResolvedValue({
      calendar_source: 'external',
      completeness: options.completeness ?? 'complete',
      timezone: 'Europe/Moscow',
      range: PERIOD,
      provider_id: null,
      count: visits.length,
      appointments: external ? visits : [],
    }),
    getFinancialSummary: jest.fn().mockResolvedValue(options.finance ?? null),
    getRevenueSummary: jest.fn().mockResolvedValue(null),
  } as unknown as CrmService;
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: 'Europe/Moscow',
        calendarSource: external
          ? CalendarSource.EXTERNAL
          : CalendarSource.INTERNAL,
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue(options.internalRows ?? []),
      groupBy: jest.fn().mockResolvedValue(options.attendanceGroups ?? []),
    },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
    internalProvider: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 's1', displayName: 'Илья' }),
    },
    crmStaffAccess: {
      findFirst: jest.fn().mockResolvedValue({
        externalStaffId: 's1',
        encryptedDisplayName: 'Илья',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    reconciliationRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reconciled
            ? { finishedAt: new Date('2026-09-01T00:00:00.000Z') }
            : null,
        ),
    },
    expensePeriodDeclaration: { findUnique: jest.fn().mockResolvedValue(null) },
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
  return {
    tenantContext,
    businessState: new BusinessStateService(analytics, prisma),
  };
}

/** Ровно контроллер: канонический state → опубликованный контракт кабинета. */
const present = (state: { sourceOverview: unknown }) =>
  withLegacyNet(
    withoutOperationalStatusBuckets(
      withoutFactDiagnostics(
        state.sourceOverview as Parameters<typeof withLegacyNet>[0],
      ),
    ),
  ) as Record<string, unknown>;

const cabinetRequest = (comparison: typeof PREVIOUS | null = null) => ({
  tenantId: 'tenant-http',
  period: PERIOD,
  comparisonMode: comparison ? ('previous_period' as const) : ('none' as const),
  comparisonPeriod: comparison,
  financeAllowed: false,
  bookedValueAllowed: false,
  operationalDetail: true,
  disclose: () => ({
    names: new Map<string, string>(),
    allowedExternalIds: new Set<string>(),
  }),
});

async function cabinet(options: Options = {}) {
  const { tenantContext, businessState } = build(options);
  const state = await tenantContext.runAsSystemTenant('tenant-http', () =>
    businessState.business(cabinetRequest()),
  );
  return { state, response: present(state) };
}

const record = (value: unknown) => (value ?? {}) as Record<string, unknown>;

describe('P3 §10 — обязательная регрессия HTTP-потребителя', () => {
  it('1. внешняя CRM, полные данные: чтение признано полным', async () => {
    const { state, response } = await cabinet({
      visits: [visit('a', 's1', 2500)],
    });

    expect(
      record(record(state.current).completeness).appointments,
    ).toMatchObject({
      status: 'complete',
      reason: null,
      out_of_period_discarded: 0,
    });
    expect(record(response.appointments).total).toBe(1);
  });

  it('2. внешняя CRM, чтение оборвано: неполнота названа, а не спрятана', async () => {
    const { state, response } = await cabinet({
      visits: [visit('a', 's1', 2500)],
      completeness: 'truncated',
    });

    expect(
      record(record(state.current).completeness).appointments,
    ).toMatchObject({ status: 'incomplete', reason: 'source_read_truncated' });
    expect(state.limitations.map((item) => item.key)).toContain(
      'incomplete_read',
    );
    // 🔴 Презентер снимает диагностику, но НЕ подменяет её словом «полно»:
    // ключа нет вовсе. Слепота кабинета к неполноте — свойство выпущенного
    // контракта фронта (реестр 4.2), а не решение, принятое этой миграцией.
    expect(Object.keys(response)).not.toContain('completeness');
    expect(JSON.stringify(response)).not.toContain('"complete"');
  });

  it('3. внутренний календарь: источник maya и совместимый `net`', async () => {
    const { response } = await cabinet({
      source: 'internal',
      internalRows: [
        {
          id: 'a',
          clientId: 'c-a',
          branchId: null,
          staffExternalId: 's1',
          startAt: new Date('2026-08-10T09:00:00.000Z'),
          endAt: new Date('2026-08-10T10:00:00.000Z'),
          status: 'completed',
          totalPriceKopecks: 250000,
          currency: 'RUB',
        },
      ],
    });

    expect(response.data_source).toBe('maya');
    expect(response.net).toEqual([{ currency: 'RUB', amount_kopecks: 250000 }]);
    expect(Object.keys(response)).not.toContain('net_status');
  });

  it('4. измеренный ноль: пустой период — это `0`, а не «нет данных»', async () => {
    const { state, response } = await cabinet({ visits: [] });

    expect(record(response.appointments).total).toBe(0);
    expect(response.revenue).toEqual([]);
    // Канонический слой различает измеренный ноль и неизмеренное: ноль попадает
    // в доступные метрики, а не в «недоступно».
    expect(state.metrics.appointments_total).toBe(0);
    expect(state.availableMetrics).toContain('appointments_total');
  });

  it('5. недоступное остаётся недоступным и не превращается в ноль', async () => {
    const { state } = await cabinet({ visits: [visit('a', 's1', 2500)] });

    // Кабинет кассу не запрашивает: у роли нет денежной видимости.
    expect(state.metrics.revenue_amount_kopecks).toBeNull();
    expect(state.metrics.revenue_basis).toBe('unavailable');
    // Недоступное не попадает в доступные метрики: `null` и `0` не смешаны.
    expect(state.availableMetrics).not.toContain('revenue_amount_kopecks');
    expect(state.availableMetrics).toContain('appointments_total');
    expect(
      state.unavailableMetrics.some((item) => item.key === 'booked_value'),
    ).toBe(true);
  });

  it('6. роль с денежной видимостью получает подтверждённую кассу', async () => {
    const { tenantContext, businessState } = build({
      visits: [visit('a', 's1', 2500)],
      finance: {
        verified: true,
        revenue: {
          status: 'available',
          verified: true,
          total: { currency: 'RUB', amount_kopecks: 990000 },
          transaction_count: 1,
          by_staff: [],
        },
        payroll: { status: 'unavailable', verified: false, staff: [] },
        warnings: [],
      },
    });

    const state = await tenantContext.runAsSystemTenant('tenant-http', () =>
      businessState.business({
        ...cabinetRequest(),
        financeAllowed: true,
        bookedValueAllowed: true,
        operationalDetail: false,
      }),
    );

    expect(state.metrics.revenue_amount_kopecks).toBe(990000);
    expect(state.metrics.revenue_basis).toBe('provider_transactions');
  });

  it('7. роль без денежной видимости: кассы в ответе кабинета нет', async () => {
    const { response, state } = await cabinet({
      visits: [visit('a', 's1', 2500)],
      finance: {
        verified: true,
        revenue: {
          status: 'available',
          verified: true,
          total: { currency: 'RUB', amount_kopecks: 990000 },
          transaction_count: 1,
          by_staff: [],
        },
        payroll: { status: 'unavailable', verified: false, staff: [] },
        warnings: [],
      },
    });

    // Кабинет не просит денежный контур вовсе — и не получает его ни одним
    // числом. 990000 не должно встречаться нигде в ответе.
    expect(JSON.stringify(response)).not.toContain('990000');
    expect(state.metrics.revenue_amount_kopecks).toBeNull();
  });

  it('8. стоимость записанного — цены журнала, с собственным основанием', async () => {
    const { tenantContext, businessState } = build({
      visits: [visit('a', 's1', 2500)],
    });

    const state = await tenantContext.runAsSystemTenant('tenant-http', () =>
      businessState.business({
        ...cabinetRequest(),
        bookedValueAllowed: true,
        operationalDetail: false,
      }),
    );

    expect(state.metrics.booked_value_amount_kopecks).toBe(250000);
    expect(state.metrics.booked_value_basis).toBe('booked_prices');
  });

  it('9. выручка не выводится из цен журнала', async () => {
    const { tenantContext, businessState } = build({
      visits: [visit('a', 's1', 2500)],
    });

    const state = await tenantContext.runAsSystemTenant('tenant-http', () =>
      businessState.business({
        ...cabinetRequest(),
        bookedValueAllowed: true,
        operationalDetail: false,
      }),
    );

    // Цены журнала есть, кассы нет — выручка обязана остаться недоступной.
    expect(state.metrics.booked_value_amount_kopecks).toBe(250000);
    expect(state.metrics.revenue_amount_kopecks).toBeNull();
    expect(state.metrics.revenue_basis).toBe('unavailable');
  });

  it('10. присутствие: неявка не становится визитом', async () => {
    const { state, response } = await cabinet({
      visits: [visit('a', 's1', 2500), visit('b', 's1', 2500, 'no_show')],
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: 'no_show', _count: { _all: 1 } },
      ],
    });

    const attendance = record(record(state.current).attendance);
    expect(attendance.state).toBe('measured');
    expect(attendance.arrived).toBe(1);
    expect(attendance.no_show).toBe(1);
    // Провайдерский `completed` присутствием не считается: у канона свой счёт.
    expect(state.metrics.attended_appointments).toBe(1);
    expect(state.metrics.attendance_no_show).toBe(1);
    expect(state.metrics.appointments_cancelled).toBe(0);
    // Кабинет корзины статусов не публиковал никогда: их в ответе нет, но и
    // счётчики, которые он публиковал, не изменились.
    expect(Object.keys(record(response.appointments))).not.toContain('no_show');
    expect(record(response.appointments).total).toBe(2);
  });

  it('11. запись вне окна провайдера не попадает в период', async () => {
    const { state, response } = await cabinet({
      visits: [
        visit('a', 's1', 2500),
        visit('out', 's1', 999900, 'completed', '2026-09-15T09:00:00.000Z'),
      ],
    });

    expect(record(response.appointments).total).toBe(1);
    expect(JSON.stringify(response)).not.toContain('999900');
    expect(state.limitations.map((item) => item.key)).toContain(
      'provider_window',
    );
  });

  it('12. кабинет сравнения периодов не публикует — и не начал', async () => {
    const { response } = await cabinet({ visits: [visit('a', 's1', 2500)] });

    for (const key of ['comparison', 'previous', 'changes']) {
      expect(Object.keys(response)).not.toContain(key);
    }

    // Способность сравнивать при этом на месте: её просто никто не просит на
    // этом эндпоинте. Иначе «контракт сохранён» означало бы «функция потеряна».
    const { tenantContext, businessState } = build({
      visits: [visit('a', 's1', 2500)],
    });
    const compared = await tenantContext.runAsSystemTenant('tenant-http', () =>
      businessState.business(cabinetRequest(PREVIOUS)),
    );

    expect(compared.previous).not.toBeNull();
    expect(Object.keys(compared.changes).length).toBeGreaterThan(0);
  });

  it('🔴 миграция не добавила кабинету повторного чтения источника', async () => {
    // Найдено собственной проверкой P3: канонический слой читает с одной
    // повторной попыткой — так делал инструмент модели. Кабинет так НЕ делал,
    // и молча приехавший повтор удваивал бы обращения к провайдеру в момент
    // его отказа. Решение о повторе принимает вызывающий.
    const failing = () => {
      const { tenantContext, businessState } = build({ visits: [] });
      const crm = (
        businessState as unknown as {
          analyticsService: { crmService: { getJournal: jest.Mock } };
        }
      ).analyticsService.crmService;
      crm.getJournal.mockRejectedValue(new Error('provider is down'));
      return { tenantContext, businessState, crm };
    };

    const http = failing();
    await expect(
      http.tenantContext.runAsSystemTenant('tenant-http', () =>
        http.businessState.business({
          ...cabinetRequest(),
          retryOnFailure: false,
        }),
      ),
    ).rejects.toThrow('provider is down');
    // Одно чтение периода тянет несколько окон журнала (период + окно когорт),
    // поэтому считается не абсолютное число, а число ПОПЫТОК: повтор ровно
    // удваивает обращения к провайдеру.
    const httpCalls = http.crm.getJournal.mock.calls.length;
    expect(httpCalls).toBeGreaterThan(0);

    const ai = failing();
    await expect(
      ai.tenantContext.runAsSystemTenant('tenant-http', () =>
        ai.businessState.business(cabinetRequest()),
      ),
    ).rejects.toThrow('provider is down');
    expect(ai.crm.getJournal.mock.calls.length).toBe(httpCalls * 2);
  });

  it('§7. AI и HTTP берут факты у одного владельца', async () => {
    const { tenantContext, businessState } = build({
      visits: [visit('a', 's1', 2500), visit('b', 's2', 3000, 'canceled')],
    });

    const [http, ai] = await tenantContext.runAsSystemTenant(
      'tenant-http',
      async () => [
        await businessState.business(cabinetRequest()),
        await businessState.business({
          ...cabinetRequest(),
          bookedValueAllowed: true,
          operationalDetail: false,
          disclose: (rows) => ({
            names: new Map(rows.map((row) => [row.externalId, row.name ?? ''])),
            allowedExternalIds: new Set(rows.map((row) => row.externalId)),
          }),
        }),
      ],
    );

    const wire = present(http);
    // Совпадать обязаны факт, период и полнота. Представление — не обязано:
    // кабинет рисует таблицу, модель разговаривает.
    expect(record(wire.appointments).total).toBe(ai.metrics.appointments_total);
    expect(record(wire.appointments).cancelled).toBe(
      ai.metrics.appointments_cancelled,
    );
    expect(wire.period).toEqual(ai.period);
    const completeness = (state: { current: Record<string, unknown> }) => {
      const block = record(record(state.current).completeness).appointments;
      // Момент чтения у двух вызовов различается по определению: сравнивается
      // полнота, а не часы.
      const { status, reason, out_of_period_discarded } = record(block);
      return { status, reason, out_of_period_discarded };
    };

    expect(completeness(http)).toEqual(completeness(ai));
  });
});
