import { AppointmentsService } from '../appointments/appointments.service';
import { AiToolHandlerService } from '../ai-tools/ai-tool-handler.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentPeriodReader } from './appointment-period.reader';
import {
  ClientRecencyFactsService,
  PROVIDER_VISIT_HISTORY_WINDOW_DAYS,
  RECENCY_UNKNOWN,
  daysBetweenLocalDates,
  providerAssertedLastVisit,
} from './client-recency-facts.service';

/**
 * 🔴 Cycle 04 P9. Давность посещения — измерение, у него один владелец.
 *
 * Каждый пункт ниже закрывает конкретную развилку, на которой прежние четыре
 * формулы отвечали по-разному: неизвестность против нуля, будущее против
 * «сегодня», отметка провайдера против доказанного прихода, часовой пояс.
 */

const MOSCOW = 'Europe/Moscow';
const asOf = (iso: string, timezone = MOSCOW) => ({
  asOf: new Date(iso),
  timezone,
});

const visit = (start: string, attendance: string | null) => ({
  start,
  attendance,
});

function createRecency(
  history?: Array<{ start: string; attendance: string | null }>,
) {
  const getClientVisitHistory = jest.fn().mockResolvedValue(history ?? []);
  const service = new ClientRecencyFactsService({
    getClientVisitHistory,
  } as unknown as CrmService);
  return { service, getClientVisitHistory };
}

describe('Cycle 04 P9 — канон давности посещения', () => {
  it('1. приход становится последним доказанным посещением', async () => {
    const { service } = createRecency([
      visit('2026-07-20T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit).toMatchObject({
      local_date: '2026-07-20',
      attendance_proven: true,
      basis: 'provider_visit_history_canonical_attendance',
    });
    expect(facts.days_since_last_attended_visit.days).toBe(30);
  });

  it('2. отметка «ожидается» посещением не является', async () => {
    const { service } = createRecency([
      visit('2026-08-18T09:00:00.000Z', 'awaiting'),
      // Провайдерский `completed` сам по себе присутствия не доказывает: он
      // означает «пришёл ИЛИ оплачено». Каноническое поле здесь — присутствие.
      visit('2026-08-17T09:00:00.000Z', 'completed'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.state).toBe('not_measured');
    expect(facts.last_attended_visit.reason).toBe(
      RECENCY_UNKNOWN.noAttendedVisitInWindow,
    );
    expect(facts.days_since_last_attended_visit.days).toBeNull();
  });

  it('3. неявка посещением не является', async () => {
    const { service } = createRecency([
      visit('2026-08-01T09:00:00.000Z', 'no_show'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.local_date).toBeNull();
    expect(facts.days_since_last_attended_visit.days).toBeNull();
  });

  it('4. удалённая запись посещением не является', async () => {
    // Отметка о приходе на удалённой записи — след прошлого состояния;
    // провайдер такие строки в историю не отдаёт, а если отдаст без
    // канонического присутствия, посещением они не станут.
    const { service } = createRecency([
      visit('2026-08-02T09:00:00.000Z', 'removed'),
      visit('2026-08-03T09:00:00.000Z', null),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.state).toBe('not_measured');
  });

  it('5. будущая запись последним посещением не становится', async () => {
    const { service } = createRecency([
      visit('2026-07-20T09:00:00.000Z', 'arrived'),
      visit('2026-09-02T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.local_date).toBe('2026-07-20');
    expect(facts.days_since_last_attended_visit.days).toBe(30);
  });

  it('6. из двух приходов побеждает последний', async () => {
    const { service } = createRecency([
      visit('2026-06-01T09:00:00.000Z', 'arrived'),
      visit('2026-08-10T09:00:00.000Z', 'arrived'),
      visit('2026-07-04T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.local_date).toBe('2026-08-10');
    expect(facts.observation.attended_visits_observed).toBe(3);
  });

  it('7. дата карточки и доказанный приход — разные факты и не подменяют друг друга', async () => {
    const { service } = createRecency([
      visit('2026-06-01T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42', card: { last_visit_date: '2026-08-15' } },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.provider_asserted_last_visit).toMatchObject({
      local_date: '2026-08-15',
      attendance_proven: false,
      basis: 'provider_client_card',
    });
    expect(facts.last_attended_visit).toMatchObject({
      local_date: '2026-06-01',
      attendance_proven: true,
    });
    expect(facts.days_since_provider_asserted_last_visit.days).toBe(4);
    expect(facts.days_since_last_attended_visit.days).toBe(79);
  });

  it('8. отсутствие истории — это не ноль дней', async () => {
    const { service } = createRecency([]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42', card: { last_visit_date: null } },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.days_since_last_attended_visit.days).toBeNull();
    expect(facts.days_since_provider_asserted_last_visit.days).toBeNull();
    expect(facts.days_since_provider_asserted_last_visit.reason).toBe(
      RECENCY_UNKNOWN.providerCardHasNoDate,
    );
    // Дата в будущем — тоже не ноль: измерять ещё нечего.
    const future = providerAssertedLastVisit('2026-09-01', '2026-08-19');
    expect(future.distance.days).toBeNull();
    expect(future.distance.reason).toBe(
      RECENCY_UNKNOWN.providerCardDateIsInTheFuture,
    );
  });

  it('9. точка отсчёта явная: тот же визит на другую дату даёт другое число', async () => {
    const history = [visit('2026-07-20T09:00:00.000Z', 'arrived')];
    const { service } = createRecency(history);
    const near = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-07-25T12:00:00.000Z'),
    );
    const far = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(near.days_since_last_attended_visit.days).toBe(5);
    expect(far.days_since_last_attended_visit.days).toBe(30);
    expect(near.as_of.instant).toBe('2026-07-25T12:00:00.000Z');
    // Никакого «сейчас» внутри: ответ полностью определён входом.
    const repeat = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-07-25T12:00:00.000Z'),
    );
    expect(repeat).toEqual(near);
  });

  it('10. граница суток: один и тот же визит в разных поясах даёт разные сутки', async () => {
    const history = [visit('2026-08-18T21:30:00.000Z', 'arrived')];
    const moscow = await createRecency(history).service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T09:00:00.000Z', 'Europe/Moscow'),
    );
    const london = await createRecency(history).service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T09:00:00.000Z', 'Europe/London'),
    );
    // В Москве это уже 19 августа (00:30), в Лондоне — ещё 18-е (22:30).
    expect(moscow.last_attended_visit.local_date).toBe('2026-08-19');
    expect(london.last_attended_visit.local_date).toBe('2026-08-18');
    expect(moscow.days_since_last_attended_visit.days).toBe(0);
    expect(london.days_since_last_attended_visit.days).toBe(1);
  });

  it('11. клиент провайдера не превращается в клиента Maya', async () => {
    const { service } = createRecency([
      visit('2026-08-10T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.identity.space).toBe('provider_client');
    expect(facts.identity.maya_client_id).toBeNull();
    expect(facts.identity.limitation).toContain(
      'appointment mirror has no business client identity',
    );

    // Без идентичности провайдера факта нет вовсе — и это не ноль дней.
    const anonymous = await service.forProviderClient(
      'tenant-a',
      { providerClientId: null, card: { last_visit_date: '2026-08-01' } },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(anonymous.last_attended_visit.reason).toBe(
      RECENCY_UNKNOWN.identityUnknown,
    );
    expect(anonymous.days_since_last_attended_visit.days).toBeNull();
  });

  it('12. поверхности считают давность одинаково', async () => {
    const card = { last_visit_date: '2026-07-20', external_id: '42' };
    const when = asOf('2026-08-19T12:00:00.000Z');
    const { service } = createRecency([]);
    const direct = service.fromProviderCard(card, when);
    const viaFacts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42', card },
      when,
    );
    expect(direct.distance.days).toBe(30);
    expect(viaFacts.days_since_provider_asserted_last_visit.days).toBe(30);
    // И то же самое число, что даёт чистая арифметика суток.
    expect(daysBetweenLocalDates('2026-07-20', '2026-08-19')).toBe(30);
  });

  it('13. окно наблюдения названо, а не подразумевается', async () => {
    const { service } = createRecency([
      visit('2026-08-10T09:00:00.000Z', 'arrived'),
    ]);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42' },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    // Даже найденный визит — наблюдение в пределах окна истории, а не вся
    // жизнь гостя: поэтому состояние «измерено неполно», и окно названо.
    expect(facts.last_attended_visit.state).toBe('measured_incomplete');
    expect(facts.observation.window_days).toBe(
      PROVIDER_VISIT_HISTORY_WINDOW_DAYS,
    );
  });

  it('14. отказ истории — недоступность, а не отсутствие визитов', async () => {
    const service = new ClientRecencyFactsService({
      getClientVisitHistory: jest
        .fn()
        .mockRejectedValue(new Error('crm is unavailable')),
    } as unknown as CrmService);
    const facts = await service.forProviderClient(
      'tenant-a',
      { providerClientId: '42', card: { last_visit_date: '2026-07-20' } },
      asOf('2026-08-19T12:00:00.000Z'),
    );
    expect(facts.last_attended_visit.state).toBe('unavailable');
    expect(facts.last_attended_visit.reason).toBe(
      RECENCY_UNKNOWN.historyUnavailable,
    );
    expect(facts.days_since_last_attended_visit.days).toBeNull();
    // Соседний факт от этого не страдает: карточка прочитана.
    expect(facts.days_since_provider_asserted_last_visit.days).toBe(30);
  });
});

describe('Cycle 04 P9 — поверхности после переезда', () => {
  const registry = (clients: Array<Record<string, unknown>>) => ({
    clients,
    complete: true,
    provider: 'yclients',
    generated_at: '2026-08-19T09:00:00.000Z',
  });

  function build(clients: Array<Record<string, unknown>>) {
    const crmService = {
      getClientRegistry: jest.fn().mockResolvedValue(registry(clients)),
      getClientVisitHistory: jest.fn().mockResolvedValue([]),
    } as unknown as CrmService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultTimezone: MOSCOW,
          calendarSource: 'external',
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const handler = new AiToolHandlerService(
      crmService,
      {} as AppointmentsService,
      {} as LoyaltyService,
      {} as OperationsAnalyticsService,
      {} as ExpensesService,
      prisma,
      {} as CustomersService,
      {} as StaffService,
      new BusinessStateService({} as OperationsAnalyticsService, prisma),
      new AppointmentPeriodReader(crmService),
      new ClientRecencyFactsService(crmService),
    );
    return { handler, tenantContext };
  }

  const principal = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    role: UserRole.TENANT_OWNER,
    membershipId: 'membership-a',
  } as never;

  it('список «давно не приходили» называет источник давности и не выдаёт его за приход', async () => {
    const stack = build([
      {
        id: '1',
        external_id: '1',
        name: 'Гость',
        phone: '+70000000001',
        visits_count: 5,
        sold_amount: 1000,
        last_visit_date: '2026-01-01',
      },
    ]);
    const result = (await stack.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        stack.handler.execute(
          'clients.dormant.list',
          principal,
          { inactive_days: 30, limit: 10 },
          'execution-dormant',
        ),
    )) as Record<string, unknown>;
    expect(result.recency_basis).toBe('provider_client_card');
    expect(result.recency_attendance_proven).toBe(false);
    expect(result.timezone).toBe(MOSCOW);
  });

  it('рейтинг по свежести не превращает неизвестную дату в 1970 год', async () => {
    const stack = build([
      {
        id: '1',
        external_id: '1',
        name: 'Без даты',
        phone: null,
        visits_count: 9,
        sold_amount: 900,
        last_visit_date: null,
      },
      {
        id: '2',
        external_id: '2',
        name: 'Давний',
        phone: null,
        visits_count: 9,
        sold_amount: 900,
        last_visit_date: '2020-01-01',
      },
      {
        id: '3',
        external_id: '3',
        name: 'Свежий',
        phone: null,
        visits_count: 9,
        sold_amount: 900,
        last_visit_date: '2026-08-01',
      },
    ]);
    const result = (await stack.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        stack.handler.execute(
          'clients.high-value.read',
          principal,
          { metric: 'recency', limit: 10 },
          'execution-rank',
        ),
    )) as { clients: Array<Record<string, unknown>> };
    const days = result.clients.map((entry) => entry.inactivity_days);
    // Сначала свежий, затем давний, и только потом — карточка без даты:
    // неизвестность стоит в конце, но древностью не притворяется.
    expect(days[0]).toBeLessThan(days[1] as number);
    expect(days[2]).toBeNull();
  });
});
