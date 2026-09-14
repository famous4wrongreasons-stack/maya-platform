import { measurementReaderDouble } from '../../test/helpers/measurement-reader';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
import { ClientRecencyFactsService } from './client-recency-facts.service';

/**
 * 🔴 Cycle 04 P9. Храповик: канон давности публикует ИЗМЕРЕНИЕ.
 *
 * «Спящий», «потерянный», «пора вернуть», «риск» — это интерпретация, и она
 * живёт выше. Стоит ей просочиться сюда, и один порог начнёт определять,
 * потерян ли клиент, — прямо внутри примитива, из которого этот вывод делают
 * все остальные.
 */

const source = (relative: string) =>
  readFileSync(join(__dirname, relative), 'utf8');

/** Комментарии описывают убранные дефекты: искать надо в коде, а не в них. */
const withoutComments = (code: string) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('Cycle 04 P9 — граница канона давности', () => {
  const owner = withoutComments(source('client-recency-facts.service.ts'));

  it('не публикует словарь оттока и риска', () => {
    for (const forbidden of [
      'churn',
      'lost',
      'sleeping',
      'at_risk',
      'needs_reactivation',
      'reactivation',
      'dormant',
      'inactive',
      'спящ',
      'потерян',
      'ушёл',
      'вернуть',
      'риск',
    ]) {
      expect(owner.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('не содержит порогов давности', () => {
    // 30 / 45 / 60 / 90 дней и месячные горизонты — это правила интерпретации.
    // Единственное число, которому здесь место, — окно наблюдения источника.
    // Арифметику суток из проверки убираем: `24 * 60 * 60 * 1000` — это не порог.
    const withoutMillis = owner.replace(/24 \* 60 \* 60 \* 1000/g, 'DAY_MS');
    expect(withoutMillis.match(/\b(30|45|60|90|180|365)\b/g) ?? []).toEqual([]);
    expect(owner).toContain('PROVIDER_VISIT_HISTORY_WINDOW_DAYS = 730');
    // Число суток сравнивается только с нулём — «дата в будущем». Любое другое
    // сравнение означало бы, что примитив начал решать, давно ли это было.
    const comparisons = [...owner.matchAll(/days\s*[<>]=?\s*(\d+)/g)].map(
      (match) => match[1],
    );
    expect(comparisons.every((value) => value === '0')).toBe(true);
  });

  it('не берёт время из воздуха: точка отсчёта только из аргумента', () => {
    expect(owner).not.toMatch(/new Date\(\s*\)/);
    expect(owner).not.toContain('Date.now()');
  });

  it('не решает, кто такой клиент Maya', () => {
    // Ни склейки по телефону, ни создания идентичности: P9 не миграция.
    for (const forbidden of [
      'phonesMatch',
      'phoneHash',
      'CrmClientLink',
      'registerCrmClient',
      'prisma',
    ]) {
      expect(owner).not.toContain(forbidden);
    }
  });
});

describe('Cycle 04 P9 — кэш не меняет правду о давности', () => {
  const clients = [
    {
      id: '1',
      external_id: '1',
      name: 'Гость',
      phone: null,
      visits_count: 4,
      sold_amount: 400,
      last_visit_date: '2026-05-01',
    },
  ];

  function build() {
    const getClientRegistry = jest.fn().mockResolvedValue({
      clients,
      complete: true,
      provider: 'yclients',
      generated_at: '2026-08-19T09:00:00.000Z',
    });
    const crmService = {
      getClientRegistry,
      getClientVisitHistory: jest.fn().mockResolvedValue([]),
    } as unknown as CrmService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultTimezone: 'Europe/Moscow',
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
    return { handler, tenantContext, getClientRegistry };
  }

  const principal = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    role: UserRole.TENANT_OWNER,
    membershipId: 'membership-a',
  } as never;

  const scan = (stack: ReturnType<typeof build>, execution: string) =>
    stack.tenantContext.runAsSystemTenant('tenant-a', () =>
      stack.handler.execute('clients.retention.scan', principal, {}, execution),
    );

  afterEach(() => {
    jest.useRealTimers();
  });

  it('промах и попадание дают один и тот же разбор давности', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    const stack = build();
    const miss = await scan(stack, 'scan-miss');
    const hit = await scan(stack, 'scan-hit');
    expect(hit).toEqual(miss);
    expect(stack.getClientRegistry).toHaveBeenCalledTimes(1);
    expect((miss as { as_of: string }).as_of).toBe('2026-08-19');
  });

  it('на следующие сутки точка отсчёта другая, и кэш не выдаёт вчерашнюю', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T20:58:00.000Z'));
    const stack = build();
    const yesterday = (await scan(stack, 'scan-day-1')) as { as_of: string };
    // 23:58 по Москве → следующая минута уже другие сутки салона.
    jest.setSystemTime(new Date('2026-08-19T21:01:00.000Z'));
    const today = (await scan(stack, 'scan-day-2')) as { as_of: string };
    expect(yesterday.as_of).toBe('2026-08-19');
    expect(today.as_of).toBe('2026-08-20');
    expect(stack.getClientRegistry).toHaveBeenCalledTimes(2);
  });
});
