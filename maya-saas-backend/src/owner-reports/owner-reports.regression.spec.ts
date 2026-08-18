/**
 * P4 §11 — ОБЯЗАТЕЛЬНАЯ РЕГРЕССИЯ МИГРАЦИИ БРИФОВ И ОТЧЁТОВ.
 *
 * 🔴 Тринадцать пунктов задания, названных так же, как в нём. Проверяется не
 * «работает ли код», а то, что сводка владельца НЕ ИМЕЕТ ПРАВА сказать: числа
 * приходят из канонического владельца, а неизвестное называется неизвестным.
 *
 * Стенд поднимает настоящую цепочку целиком: журнал → аналитика →
 * `BusinessStateService` → факты → текст.
 */
import { ConfigService } from '@nestjs/config';

import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import {
  buildStack,
  FINANCE_FULL,
  internalRow,
  LOCAL_DATE,
  TENANT,
  visit,
  type StackOptions,
} from './brief-stack.spec-helper.spec';
import { OwnerReportsService } from './owner-reports.service';

function service(options: StackOptions = {}) {
  const stack = buildStack(options);
  const inbox = {
    hasSourceEvent: jest.fn().mockResolvedValue(false),
    publishForTenant: jest
      .fn()
      .mockResolvedValue({ stored: 1, user_ids: ['owner-user'] }),
  };
  const dashboardPreferences = {
    filterUsersWithAssistantCapability: jest
      .fn()
      .mockImplementation((_tenantId: string, userIds: string[]) =>
        Promise.resolve(userIds),
      ),
  };
  const reports = new OwnerReportsService(
    stack.prisma,
    stack.businessState,
    inbox as unknown as InboxService,
    stack.tenantContext,
    { get: jest.fn() } as unknown as ConfigService,
    dashboardPreferences as unknown as DashboardPreferencesService,
  );
  return { reports, stack, inbox };
}

const render = async (options: StackOptions, masters: string[] = ['crm-1']) => {
  const { reports, stack } = service(options);
  return stack.tenantContext.runAsSystemTenant(TENANT.id, () =>
    reports.renderBriefs(TENANT, LOCAL_DATE, { masterExternalIds: masters }),
  );
};

const FINANCE_ZERO = {
  ...FINANCE_FULL,
  revenue: {
    status: 'available',
    verified: true,
    total: { currency: 'RUB', amount_kopecks: 0 },
    transaction_count: 0,
    by_account: [],
    by_staff: [],
    by_service: [],
    staff_attribution_status: 'available',
    staff_attribution_coverage_percent: 100,
  },
};

describe('P4 §11 — обязательная регрессия сводок', () => {
  it('1. измеренный ноль: пустой день остаётся нулём и звучит нулём', async () => {
    const out = await render({ visits: [], finance: FINANCE_ZERO });

    expect(out.facts.counts.total).toBe(0);
    expect(out.morning.bodyText).toContain('всего 0 записей');
    expect(out.morning.payload.booked).toBe(0);
    expect(out.morning.bodyText).not.toContain('не измерено');
  });

  it('2. неполное чтение: числа названы нижней границей', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      completeness: 'truncated',
    });

    expect(out.facts.sourceComplete).toBe(false);
    for (const text of [out.morning.bodyText, out.evening.bodyText]) {
      expect(text).toMatch(/прочитан НЕ целиком/);
    }
    expect(out.morning.payload.appointments_source_complete).toBe(false);
  });

  it('3. недоступное: касса не отвечает — «пусто» не говорится', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      finance: 'throw',
    });

    expect(out.facts.revenue.amountKopecks).toBeNull();
    expect(out.facts.revenue.basis).toBe('unavailable');
    expect(out.evening.bodyText).toContain('недоступна');
    expect(out.evening.bodyText).not.toContain('пустая');
    expect(out.evening.payload.revenue_total_kopecks).toBeNull();
  });

  it('4. присутствие каноническое: статус провайдера неявкой не считается', async () => {
    const out = await render({
      // Запись со статусом `no_show`, но зеркало главы 3 период не сверяло.
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 1500, 'no_show', '2026-08-13T12:00:00.000Z', null),
      ],
    });

    expect(out.facts.attendance.measured).toBe(false);
    expect(out.evening.bodyText).toContain('не сверено');
    expect(out.evening.bodyText).not.toMatch(/неявок \d/);
    expect(out.evening.payload.attendance_no_show).toBeNull();
  });

  it('4-бис. присутствие сверено — числа из зеркала, а не из статусов', async () => {
    const out = await render({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 1500, 'no_show', '2026-08-13T12:00:00.000Z', null),
      ],
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: 'no_show', _count: { _all: 1 } },
      ],
    });

    expect(out.evening.bodyText).toContain('Присутствие: пришли 1, неявок 1');
    expect(out.evening.payload.attendance_arrived).toBe(1);
  });

  it('5. стоимость записанного: цены журнала со своим основанием', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-2', 3000)],
    });

    expect(out.facts.bookedValue.amountKopecks).toBe(550_000);
    expect(out.facts.bookedValue.basis).toBe('booked_prices');
    expect(out.morning.payload.booked_value_basis).toBe('booked_prices');
    expect(out.morning.bodyText).toContain('ожидаемо');
  });

  it('6. выручка: только подтверждённая касса, и она не путается с записанным', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE_FULL,
    });

    expect(out.facts.revenue.amountKopecks).toBe(1_250_000);
    expect(out.facts.revenue.basis).toBe('provider_transactions');
    // Записанное — другое число и другое основание.
    expect(out.facts.bookedValue.amountKopecks).toBe(250_000);
    expect(out.evening.bodyText).toMatch(/Выручка за день: 12\s?500/);
    expect(out.morning.bodyText).not.toMatch(/12\s?500/);
  });

  it('7. видимость по роли: утренний бриф денежный контур не читает', async () => {
    const { reports, stack } = service({
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE_FULL,
    });
    const getFinancialSummary = (
      stack.crmService as unknown as { getFinancialSummary: jest.Mock }
    ).getFinancialSummary;

    await stack.tenantContext.runAsSystemTenant(TENANT.id, () =>
      reports.runMorningBrief(TENANT, new Date('2026-08-13T05:05:00.000Z')),
    );

    // Утренний бриф не запрашивал деньги — не запрашивал их и до миграции.
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('8. внутренний календарь: денег нет по свойству источника, а не по роли', async () => {
    const out = await render(
      {
        source: 'internal',
        internalRows: [
          internalRow('a', 'prov-1', 250_000),
          internalRow('b', 'prov-1', 300_000),
        ],
        finance: FINANCE_FULL,
        internalMasters: [{ userId: 'master-user', id: 'prov-1' }],
      },
      ['prov-1'],
    );

    expect(out.facts.source).toBe('maya');
    expect(out.facts.revenue.amountKopecks).toBeNull();
    // Стоимость записанного у собственного календаря есть всегда.
    expect(out.facts.bookedValue.amountKopecks).toBe(550_000);
    // 🔴 И мастер собственного календаря получает СВОЙ день, а не нули.
    expect(out.masters[0].brief.bodyText).toContain('Записей: 2');
  });

  it('9. внешняя CRM: полный день доезжает целиком', async () => {
    const out = await render({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-2', 3000, 'canceled'),
      ],
      finance: FINANCE_FULL,
    });

    expect(out.facts.source).toBe('crm');
    expect(out.facts.counts.total).toBe(2);
    expect(out.facts.counts.cancelled).toBe(1);
    expect(out.evening.bodyText).toContain('Записей за день: 2');
  });

  it('10. текущий против прошлого: сводка сравнения не публикует', async () => {
    const out = await render({ visits: [visit('a', 'crm-1', 2500)] });

    for (const payload of [out.morning.payload, out.evening.payload]) {
      expect(Object.keys(payload)).not.toContain('previous');
      expect(Object.keys(payload)).not.toContain('changes');
    }
  });

  it('11. неявка мастера: личный бриф её не выдумывает', async () => {
    const out = await render({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 1500, 'no_show', '2026-08-13T12:00:00.000Z', null),
      ],
      reconciled: true,
      attendanceGroups: [{ attendance: 'no_show', _count: { _all: 1 } }],
    });

    // Присутствие сверяется по салону, а не по человеку: личный бриф молчит.
    expect(out.masters[0].brief.bodyText).not.toMatch(/неявок/);
    expect(out.masters[0].brief.payload.total).toBe(2);
  });

  it('12. запись вне окна провайдера в сводку не попадает', async () => {
    const out = await render({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('out', 'crm-1', 999_900, 'completed', '2026-09-20T09:00:00.000Z'),
      ],
    });

    expect(out.facts.counts.total).toBe(1);
    expect(JSON.stringify(out.morning.payload)).not.toContain('99990000');
  });

  it('13. AI, кабинет и бриф берут факты у одного владельца', async () => {
    const options: StackOptions = {
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-2', 3000, 'canceled'),
      ],
      finance: FINANCE_FULL,
    };
    const { reports, stack } = service(options);

    const [brief, canonical] = await stack.tenantContext.runAsSystemTenant(
      TENANT.id,
      async () => [
        await reports.renderBriefs(TENANT, LOCAL_DATE, {
          masterExternalIds: [],
        }),
        // Тот же период глазами AI и кабинета: тот же владелец, тот же вызов.
        await stack.businessState.business({
          tenantId: TENANT.id,
          period: {
            from: '2026-08-12T21:00:00.000Z',
            to: '2026-08-13T20:59:59.999Z',
          },
          comparisonMode: 'none',
          comparisonPeriod: null,
          financeAllowed: true,
          bookedValueAllowed: true,
          operationalDetail: true,
          disclose: (rows) => ({
            names: new Map(rows.map((row) => [row.externalId, row.name ?? ''])),
            allowedExternalIds: null,
          }),
        }),
      ],
    );

    expect(brief.facts.counts.total).toBe(canonical.metrics.appointments_total);
    expect(brief.facts.counts.cancelled).toBe(
      canonical.metrics.appointments_cancelled,
    );
    expect(brief.facts.revenue.amountKopecks).toBe(
      canonical.metrics.revenue_amount_kopecks,
    );
    expect(brief.facts.revenue.basis).toBe(canonical.metrics.revenue_basis);
    expect(brief.facts.bookedValue.amountKopecks).toBe(
      canonical.metrics.booked_value_amount_kopecks,
    );
    expect(brief.facts.bookedValue.basis).toBe(
      canonical.metrics.booked_value_basis,
    );
  });

  it('🔴 сверх списка: неотнесённые провайдером деньги больше не пропадают', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE_FULL,
    });

    // 5 000 наличными + 7 000 картой при выручке 12 500: раньше 500 ₽
    // сертификата исчезали молча.
    expect(out.evening.bodyText).toMatch(/Наличные — 5\s?000/);
    expect(out.evening.bodyText).toMatch(/Карта — 7\s?000/);
    expect(out.evening.bodyText).toContain('не отнёс ни к наличным');
  });

  it('🔴 сверх списка: календарь мастера не сопоставлен — нулей не будет', async () => {
    const out = await render({ visits: [visit('a', 'crm-1', 2500)] }, ['']);

    expect(out.masters[0].brief.bodyText).toContain('не сопоставлен');
    expect(out.masters[0].brief.bodyText).not.toMatch(/Записей: \d/);
    expect(out.masters[0].brief.payload.identity_resolved).toBe(false);
  });
});

/**
 * 🔴 Состязательная проверка P4: восемь дефектов, найденных тремя линзами уже
 * ПОСЛЕ того, как я счёл пакет готовым. Шесть из них мои.
 */
describe('P4 — находки состязательной проверки', () => {
  it('🔴 собственный календарь: отчёт не обвиняет контур, которого нет', async () => {
    const out = await render(
      {
        source: 'internal',
        internalRows: [internalRow('a', 'prov-1', 250_000)],
        finance: FINANCE_FULL,
      },
      [],
    );

    // Финансы для внутреннего календаря не читаются в принципе — значит и
    // «не ответил» сказать нельзя: это не отказ, это отсутствие понятия.
    expect(out.evening.bodyText).not.toContain('не ответил');
    expect(out.evening.bodyText).toContain('собственного календаря');
    expect(out.facts.revenue.basis).toBe('booked_prices');
  });

  it('🔴 строка зарплаты со статусом «недоступно» остаётся видимой', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-2', 3000)],
      finance: {
        ...FINANCE_FULL,
        payroll: {
          ...FINANCE_FULL.payroll,
          staff: [
            {
              staff_id: 'crm-1',
              name: 'Илья',
              status: 'available',
              verified: true,
              accrued: { currency: 'RUB', amount_kopecks: 250_000 },
              paid: null,
              balance: null,
            },
            {
              staff_id: 'crm-2',
              name: 'Стас',
              status: 'unavailable',
              verified: false,
              accrued: null,
              paid: null,
              balance: null,
            },
          ],
        },
      },
    });

    // Мастер, которому CRM не посчитала смену, и мастер, которому начислили
    // ноль, — разные новости. Отфильтровать первого значит соврать вторым.
    expect(out.evening.bodyText).toContain('расчёт не пришёл из CRM');
    expect(out.facts.payroll.rows).toHaveLength(2);
    expect(out.facts.payroll.rows[1].measured).toBe(false);
  });

  it('🔴 измеренный ноль начисления печатается нулём, а не исчезает', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      finance: {
        ...FINANCE_FULL,
        payroll: {
          ...FINANCE_FULL.payroll,
          accrued_total: { currency: 'RUB', amount_kopecks: 0 },
          staff: [
            {
              staff_id: 'crm-1',
              name: 'Илья',
              status: 'available',
              verified: true,
              accrued: { currency: 'RUB', amount_kopecks: 0 },
              paid: null,
              balance: null,
            },
          ],
        },
      },
    });

    expect(out.facts.payroll.rows[0].accruedKopecks).toBe(0);
    expect(out.evening.bodyText).toMatch(/Илья: 0/);
  });

  it('🔴 частичная сверка присутствия не выдаётся за отсутствие сверки', async () => {
    const partial = await render({
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-1', 2500)],
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: null, _count: { _all: 1 } },
      ],
    });
    const never = await render({ visits: [visit('a', 'crm-1', 2500)] });

    expect(partial.facts.attendance.partial).toBe(true);
    expect(partial.evening.bodyText).toContain('НЕ по всем записям');
    expect(never.evening.bodyText).toContain('ещё не сверено');
    expect(partial.evening.bodyText).not.toBe(never.evening.bodyText);
  });

  it('🔴 пустой разрез мастеров не выдаётся за ровную загрузку', async () => {
    const out = await render({ visits: [], finance: FINANCE_ZERO });

    expect(out.facts.staff).toHaveLength(0);
    expect(out.morning.bodyText).not.toContain('выглядит ровной');
  });

  it('🔴 оговорка о неполноте стоит ПЕРЕД числами, которые описывает', async () => {
    const out = await render({
      visits: [visit('a', 'crm-1', 2500)],
      completeness: 'truncated',
    });

    const note = out.morning.bodyText.indexOf('прочитан НЕ целиком');
    const numbers = out.morning.bodyText.indexOf('Сегодня в CRM');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(numbers);
  });

  it('🔴 тёзки в денежном списке различимы', async () => {
    const out = await render({
      visits: [
        visit('a', 'crm-1', 2500),
        {
          ...visit('b', 'crm-2', 3000),
          provider: { id: 'crm-2', name: 'Илья' },
        },
      ],
      finance: FINANCE_FULL,
    });

    const names = out.facts.payroll.rows.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((name) => /\(2\)/.test(name))).toBe(true);
  });

  it('🔴 отказ денежного контура остаётся в журнале сервера', async () => {
    const { reports, stack } = service({
      visits: [visit('a', 'crm-1', 2500)],
      finance: 'throw',
    });
    const warn = jest
      .spyOn(
        (reports as unknown as { logger: { warn: (message: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    await stack.tenantContext.runAsSystemTenant(TENANT.id, () =>
      reports.runDailyReport(TENANT, new Date('2026-08-13T18:05:00.000Z')),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('finance unavailable'),
    );
  });
});
