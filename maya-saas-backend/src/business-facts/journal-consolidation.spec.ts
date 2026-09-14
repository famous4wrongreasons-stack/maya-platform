import { measurementReaderDouble } from '../../test/helpers/measurement-reader';
/**
 * P6 §10 — ОБЯЗАТЕЛЬНАЯ РЕГРЕССИЯ КОНСОЛИДАЦИИ ЖУРНАЛА.
 *
 * 🔴 Главный вопрос пакета: у вопроса «что произошло с визитами за период»
 * один владелец. Двенадцать пунктов ниже названы так же, как в задании.
 *
 * Самый важный — первый: в бою журнал провайдера отвечал «пришли 13», а
 * зеркало главы 3 — «пришли 12 и одна запись ожидает отметки». После P6
 * пользовательская поверхность обязана брать ответ у зеркала и не иметь
 * возможности выбрать другой.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from './appointment-period.reader';
import { AttendanceFactsService } from './attendance-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { CalendarSource, UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AiToolHandlerService } from '../ai-tools/ai-tool-handler.service';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { CustomersService } from '../customers/customers.service';
import type { ExpensesService } from '../expenses/expenses.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { StaffService } from '../staff/staff.service';

const DATE = '2026-08-18';
const TENANT = 'tenant-p6';

const visit = (
  id: string,
  attendance: string | null,
  status = 'completed',
  startAt = `${DATE}T09:00:00.000Z`,
  price: number | null = 2500,
) => ({
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
  end_at: new Date(new Date(startAt).getTime() + 60 * 60_000).toISOString(),
  status,
  attendance,
  notes: null,
  total_price: price,
  currency: 'RUB',
});

type Options = {
  visits?: unknown[];
  completeness?: 'complete' | 'truncated';
  journalThrows?: boolean;
  attendanceGroups?: Array<{
    attendance: string | null;
    _count: { _all: number };
  }>;
  reconciled?: boolean;
  source?: 'crm' | 'internal';
  internalRows?: unknown[];
  timezone?: string;
};

function build(options: Options = {}) {
  const external = (options.source ?? 'crm') === 'crm';
  const visits = options.visits ?? [];
  const getJournal = jest.fn(() =>
    options.journalThrows
      ? Promise.reject(new Error('provider is down'))
      : Promise.resolve({
          calendar_source: 'external',
          completeness: options.completeness ?? 'complete',
          timezone: options.timezone ?? 'Europe/Moscow',
          range: { from: DATE, to: DATE },
          provider_id: null,
          count: visits.length,
          appointments: external ? visits : [],
          all_masters: [
            {
              id: 'crm-1',
              name: 'Илья',
              title: 'Барбер',
              is_working: true,
              work_slots: [{ from: '10:00', to: '20:00' }],
            },
          ],
        }),
  );
  const crmService = {
    getJournal,
    getStaff: jest
      .fn()
      .mockResolvedValue([{ id: 'crm-1', name: 'Илья', title: 'Барбер' }]),
    getFinancialSummary: jest.fn().mockResolvedValue(null),
    getRevenueSummary: jest.fn().mockResolvedValue(null),
    getStaffScheduleDay: jest.fn().mockResolvedValue(null),
  } as unknown as CrmService;
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: options.timezone ?? 'Europe/Moscow',
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
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'prov-1', displayName: 'Мастер' }]),
    },
    reconciliationRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reconciled
            ? { finishedAt: new Date('2026-08-19T00:00:00.000Z') }
            : null,
        ),
    },
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
  return { analytics, businessState, handler, tenantContext, getJournal };
}

const day = async (options: Options = {}) => {
  const stack = build(options);
  const result = (await stack.tenantContext.runAsSystemTenant(TENANT, () =>
    stack.handler.execute(
      'operations.journal.read',
      {
        tenantId: TENANT,
        userId: 'owner-1',
        role: UserRole.TENANT_OWNER,
        surface: 'web',
      } as never,
      { date: DATE },
      'p6',
    ),
  )) as Record<string, never>;
  return { result, stack };
};

describe('P6 §10 — обязательная регрессия консолидации', () => {
  it('🔴 1. боевой случай: журнал говорит 13, зеркало 12 — побеждает зеркало', async () => {
    // Тринадцать записей, у всех провайдер поставил «пришёл».
    const visits = Array.from({ length: 13 }, (_, index) =>
      visit(`a${index}`, 'arrived'),
    );
    const { result } = await day({
      visits,
      reconciled: true,
      // Зеркало главы 3 наблюдало иначе: двенадцать пришли, одна ждёт отметки.
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 12 } },
        { attendance: 'awaiting', _count: { _all: 1 } },
      ],
    });

    const attendance = result.attendance as unknown as Record<string, unknown>;
    expect(attendance.arrived).toBe(12);
    expect(attendance.awaiting).toBe(1);
    expect(attendance.source).toBe('canonical_mirror');
    // Статус провайдера при этом остаётся статусом и виден отдельно.
    expect((result.summary as unknown as Record<string, number>).total).toBe(
      13,
    );
  });

  it('2. полный журнал: счётчики и минуты приходят от канона', async () => {
    const { result } = await day({
      visits: [visit('a', 'arrived'), visit('b', null, 'confirmed')],
    });
    const summary = result.summary as unknown as Record<string, number>;

    expect(summary.total).toBe(2);
    expect(summary.booked_minutes).toBe(120);
  });

  it('3. усечённый журнал: неполнота доезжает до ответа', async () => {
    const { result } = await day({
      visits: [visit('a', 'arrived')],
      completeness: 'truncated',
    });
    const completeness = result.completeness as unknown as Record<
      string,
      unknown
    >;

    expect(completeness.status).toBe('incomplete');
    expect(completeness.zero_means_none).toBe(false);
  });

  it('4. отказ провайдера не превращается в пустой день', async () => {
    await expect(day({ journalThrows: true })).rejects.toThrow(
      'provider is down',
    );
  });

  it('5. записи вне суток в день не попадают', async () => {
    const { result } = await day({
      visits: [
        visit('a', 'arrived'),
        visit('out', 'arrived', 'completed', '2026-09-20T09:00:00.000Z'),
      ],
    });

    expect((result.summary as unknown as Record<string, number>).total).toBe(1);
    expect(
      (result.completeness as unknown as Record<string, number>)
        .out_of_period_discarded,
    ).toBe(1);
  });

  it('6. граница часового пояса: сутки строит владелец, а не инструмент', async () => {
    const { stack } = await day({ visits: [visit('a', 'arrived')] });

    // Провайдера спрашивают ровно про сутки арендатора в его поясе.
    expect(stack.getJournal).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        from: '2026-08-17T21:00:00.000Z',
        to: '2026-08-18T20:59:59.999Z',
      }),
      { includeCanceled: true },
    );
  });

  it('7. стоимость записанного считает канон', async () => {
    const { result } = await day({
      visits: [
        visit('a', 'arrived', 'completed', `${DATE}T09:00:00.000Z`, 2500),
      ],
    });
    const staff = result.staff as unknown as Array<Record<string, unknown>>;

    expect(staff[0].booked_service_value).toEqual([
      { currency: 'RUB', amount_kopecks: 250_000 },
    ]);
  });

  it('8. записанные минуты и утилизация — разные факты', async () => {
    const { result } = await day({ visits: [visit('a', 'arrived')] });
    const staff = result.staff as unknown as Array<Record<string, unknown>>;

    expect(staff[0].booked_minutes).toBe(60);
    expect(staff[0].working_minutes).toBe(600);
    expect(staff[0].load_percent).toBe(10);
  });

  it('9. текущий и прошлый период считает один владелец', async () => {
    const stack = build({ visits: [visit('a', 'arrived')] });
    const state = await stack.tenantContext.runAsSystemTenant(TENANT, () =>
      stack.businessState.business({
        tenantId: TENANT,
        period: {
          from: '2026-08-18T00:00:00.000Z',
          to: '2026-08-18T23:59:59.999Z',
        },
        comparisonMode: 'previous_period',
        comparisonPeriod: {
          from: '2026-08-17T00:00:00.000Z',
          to: '2026-08-17T23:59:59.999Z',
        },
        financeAllowed: false,
        bookedValueAllowed: true,
        disclose: () => ({
          names: new Map<string, string>(),
          allowedExternalIds: null,
        }),
      }),
    );

    expect(state.previous).not.toBeNull();
    expect(Object.keys(state.changes).length).toBeGreaterThan(0);
  });

  it('10. внутренний календарь: присутствие не измеряется вовсе', async () => {
    const { result } = await day({
      source: 'internal',
      internalRows: [
        {
          id: 'a',
          clientId: 'c-a',
          branchId: null,
          staffExternalId: 'prov-1',
          startAt: new Date(`${DATE}T09:00:00.000Z`),
          endAt: new Date(`${DATE}T10:00:00.000Z`),
          status: 'completed',
          totalPriceKopecks: 250_000,
          currency: 'RUB',
        },
      ],
    });
    const attendance = result.attendance as unknown as Record<string, unknown>;

    expect(attendance.state).toBe('not_measured');
    expect(attendance.arrived).toBeNull();
  });

  it('11. внешняя CRM: присутствие измеряется зеркалом', async () => {
    const { result } = await day({
      visits: [visit('a', 'arrived')],
      reconciled: true,
      attendanceGroups: [{ attendance: 'arrived', _count: { _all: 1 } }],
    });
    const attendance = result.attendance as unknown as Record<string, unknown>;

    expect(attendance.state).toBe('measured');
    expect(attendance.arrived).toBe(1);
  });

  it('12. читатели главы 3 не тронуты: зеркало и сверка читают журнал сами', () => {
    const mirror = readFileSync(
      join(__dirname, '..', 'crm', 'appointment-mirror.service.ts'),
      'utf8',
    );
    const reconciliation = readFileSync(
      join(__dirname, '..', 'crm', 'appointment-reconciliation.service.ts'),
      'utf8',
    );

    for (const source of [mirror, reconciliation]) {
      expect(source).toMatch(/getJournal\(/);
      expect(source).not.toMatch(/AppointmentPeriodReader/);
    }
  });
});

describe('P6 — храповик источника', () => {
  /** Исходник без комментариев: описание убранного дефекта — не дефект. */
  const read = (relative: string) =>
    readFileSync(join(__dirname, relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('🔴 слой инструментов не читает журнал собственной нарезкой', () => {
    const handler = read('../ai-tools/ai-tool-handler.service.ts');

    // Ровно один вызов границы CRM за журналом остаться не должен вовсе:
    // читателя периода теперь зовут через канонический класс.
    expect(handler).not.toMatch(/crmService\.getJournal\(/);
    expect(handler).toMatch(/appointmentPeriodReader\.readProviderJournal\(/);
    // Собственной нарезки окон тоже нет.
    expect(handler).not.toMatch(/CRM_JOURNAL_MAX_WINDOW_DAYS/);
  });

  it('🔴 присутствие ЗА ПЕРИОД слой инструментов не выводит сам', () => {
    const handler = read('../ai-tools/ai-tool-handler.service.ts');

    // Дневной срез присутствие больше не считает — берёт готовым фактом.
    expect(handler).toMatch(/canonical_mirror/);
    // В дневном срезе корзин присутствия не осталось: единственное место,
    // где они ещё считаются, — отметки по клиенту (ниже), и их ровно одно.
    expect(
      (handler.match(/attendanceCounts\.arrived \+= 1/g) ?? []).length,
    ).toBe(1);

    /**
     * 🔴 Отметки провайдера ПО КЛИЕНТУ остаются — у этого факта нет
     * канонического владельца, пока идентичность клиента бизнеса пуста
     * (реестр 3.7). Но они обязаны называться отметками, а не присутствием:
     * пользователь не должен выбирать между двумя числами.
     */
    expect(handler).toMatch(/provider_attendance_marks/);
    expect(handler).toMatch(/provider_marked_no_show/);
    expect(handler).not.toMatch(/attendance_counts:/);
  });

  it('🔴 дневной срез принадлежит слою, который владеет агрегацией периода', () => {
    const analytics = read('../analytics/operations-analytics.service.ts');

    expect(analytics).toMatch(/async getDayOperations\(/);
    expect(analytics).toMatch(/attendanceFacts\s*\n?\s*\.periodAttendance\(/);
  });

  it('🔴 словарь отмены и цена записи в мотивации — из общего владельца', () => {
    const motivation = read('../ai-tools/master-money-motivation.ts');

    expect(motivation).toMatch(
      /isCanceledOutcome\(parseVisitOutcome\(status\)\)/,
    );
    // Сумма услуг больше не подменяет отсутствующую цену записи.
    expect(motivation).not.toMatch(/fromTotal > 0 \? fromTotal : fromServices/);
  });

  it('запрет не шире задуманного: границы главы 3 и транспорт не тронуты', () => {
    const reader = read('./appointment-period.reader.ts');

    // Канонический читатель обязан ходить к границе CRM — это его работа.
    expect(reader).toMatch(/crmService\.getJournal\(/);
    // И обязан признавать неполноту.
    expect(reader).toMatch(/completeness/);
  });
});
