/**
 * КОНТРАКТ /analytics/business ДЛЯ ТЕНАНТА НА ВНУТРЕННЕМ КАЛЕНДАРЕ.
 *
 * 🔴 Кабинет — отдельно деплоящийся фронт, и он рисует карточку «Чистыми» из
 * поля `net`. На пустом массиве карточка показывает «0 ₽»: салон с прибылью
 * выглядит как салон в ноль. Поэтому HTTP-ответ обязан остаться ПОБАЙТОВО
 * прежним, а честная прибыль от подтверждённой кассы живёт в отдельном
 * инструменте и в этот контракт не протекает.
 *
 * Эталон ниже снят прогоном ЭТОЙ ЖЕ фикстуры на рабочем дереве HEAD (коммит
 * ec3a5802, до появления честной прибыли), а не написан руками.
 */
import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from './operations-analytics.service';

const HEAD_SNAPSHOT =
  '{"data_source":"maya","period":{"from":"2026-07-01T00:00:00.000Z","to":"2026-07-31T20:59:59.000Z","timezone":"Europe/Moscow"},"appointments":{"total":3,"active":2,"cancelled":1,"cancellation_rate_percent":33.3,"unique_clients":2,"repeat_clients_in_period":0,"repeat_client_rate_percent":0,"identified_client_visits":2,"clients_returning":2,"clients_new":0,"returning_share_percent":100,"cohort_lookback_days":90,"cohort_status":"available","cohort_unavailable_reason":null,"booked_minutes":0},"revenue":[{"currency":"RUB","amount_kopecks":10000},{"currency":"USD","amount_kopecks":2000}],"expenses":[{"currency":"EUR","amount_kopecks":3000},{"currency":"RUB","amount_kopecks":2500}],"net":[{"currency":"EUR","amount_kopecks":-3000},{"currency":"RUB","amount_kopecks":7500},{"currency":"USD","amount_kopecks":2000}],"average_ticket":[{"currency":"RUB","amount_kopecks":10000},{"currency":"USD","amount_kopecks":2000}],"daily":[{"date":"2026-07-10","appointments":2,"revenue":[{"currency":"RUB","amount_kopecks":10000},{"currency":"USD","amount_kopecks":2000}]}],"staff":[{"staff_external_id":"staff-a","name":null,"appointments":1,"cancelled":1,"cancellation_rate_percent":50,"unique_clients":1,"repeat_clients_in_period":0,"revenue":[{"currency":"RUB","amount_kopecks":10000}],"booked_minutes":0,"services":[]},{"staff_external_id":"staff-b","name":null,"appointments":1,"cancelled":0,"cancellation_rate_percent":0,"unique_clients":1,"repeat_clients_in_period":0,"revenue":[{"currency":"USD","amount_kopecks":2000}],"booked_minutes":0,"services":[]}],"services":[],"data_quality":{"priced_appointments":2,"active_appointments":2,"unidentified_client_appointments":0,"revenue_coverage":1,"note":null}}';

const july = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T20:59:59.000Z',
};

function createService(calendarSource: CalendarSource) {
  const tenantContext = new TenantContextService();
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: 'Europe/Moscow',
        calendarSource,
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'appointment-rub',
          clientId: 'client-a',
          branchId: null,
          staffExternalId: 'staff-a',
          startAt: new Date('2026-07-10T09:00:00.000Z'),
          status: 'confirmed',
          totalPriceKopecks: 10_000,
          currency: 'RUB',
          durationMinutes: 60,
          provider: { id: 'staff-a', displayName: 'Мастер А' },
          services: [
            {
              serviceId: 'service-a',
              priceKopecks: 10_000,
              currency: 'RUB',
              service: { id: 'service-a', name: 'Мужская стрижка' },
            },
          ],
        },
        {
          id: 'appointment-cancelled',
          clientId: 'client-a',
          branchId: null,
          staffExternalId: 'staff-a',
          startAt: new Date('2026-07-10T10:00:00.000Z'),
          status: 'canceled',
          totalPriceKopecks: 5_000,
          currency: 'RUB',
          durationMinutes: 30,
          provider: { id: 'staff-a', displayName: 'Мастер А' },
          services: [],
        },
        {
          id: 'appointment-usd',
          clientId: 'client-c',
          branchId: null,
          staffExternalId: 'staff-b',
          startAt: new Date('2026-07-10T12:00:00.000Z'),
          status: 'confirmed',
          totalPriceKopecks: 2_000,
          currency: 'USD',
          durationMinutes: 45,
          provider: { id: 'staff-b', displayName: 'Мастер Б' },
          services: [],
        },
      ]),
    },
    expense: {
      findMany: jest.fn().mockResolvedValue([
        {
          category: 'rent',
          amountKopecks: 2_500,
          currency: 'RUB',
          occurredAt: new Date('2026-07-10T08:00:00.000Z'),
        },
        {
          category: 'marketing',
          amountKopecks: 3_000,
          currency: 'EUR',
          occurredAt: new Date('2026-07-10T08:00:00.000Z'),
        },
      ]),
    },
    internalProvider: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    crmStaffAccess: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return {
    tenantContext,
    service: new OperationsAnalyticsService(
      prisma,
      tenantContext,
      { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
      {
        getJournal: jest.fn().mockResolvedValue({
          calendar_source: 'external',
          timezone: 'Europe/Moscow',
          range: { from: july.from, to: july.to },
          provider_id: null,
          count: 0,
          appointments: [],
        }),
        getFinancialSummary: jest.fn(),
        getRevenueSummary: jest.fn(),
      } as unknown as CrmService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value,
      } as EncryptionService,
    ),
  };
}

describe('/analytics/business — контракт кабинета', () => {
  it('для тенанта на внутреннем календаре ответ побайтово прежний', async () => {
    const setup = createService(CalendarSource.INTERNAL);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverviewForCabinet('tenant-a', july),
    );

    // Побайтово: не только значения, но и состав ключей и их порядок. Лишний
    // служебный ключ сломал бы сравнение — и правильно, что сломал бы: фронт
    // читает этот объект как есть.
    expect(JSON.stringify(result)).toBe(HEAD_SNAPSHOT);
  });

  it('в старом контракте нет ни net_status, ни причины недоступности', async () => {
    const setup = createService(CalendarSource.INTERNAL);

    const result = (await setup.tenantContext.runAsSystemTenant(
      'tenant-a',
      () => setup.service.getBusinessOverviewForCabinet('tenant-a', july),
    )) as Record<string, unknown>;

    expect(Object.keys(result)).not.toContain('net_status');
    expect(Object.keys(result)).not.toContain('net_unavailable_reason');
    expect(result.net).toEqual([
      { currency: 'EUR', amount_kopecks: -3_000 },
      { currency: 'RUB', amount_kopecks: 7_500 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
  });

  it('AI-слой того же тенанта прибыли в обзоре по-прежнему НЕ видит', async () => {
    const setup = createService(CalendarSource.INTERNAL);

    // 🔴 Инструменты ходят в getBusinessOverview напрямую. Там `net` — это
    // «выручка минус те расходы, что успели завести», и называть это прибылью
    // нельзя: при одной строке расходов число почти равно выручке.
    const overview = (await setup.tenantContext.runAsSystemTenant(
      'tenant-a',
      () => setup.service.getBusinessOverview('tenant-a', july),
    )) as Record<string, unknown>;

    expect(overview.net).toEqual([]);
    expect(overview.net_status).toBe('unavailable');
    expect(overview.net_unavailable_reason).toBe(
      'profit_is_calculated_only_from_till_confirmed_cash_and_a_complete_expense_ledger_never_from_booked_prices',
    );
  });
});
