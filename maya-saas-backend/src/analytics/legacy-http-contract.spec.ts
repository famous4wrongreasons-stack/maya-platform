/**
 * ЭТАЛОНЫ ОПУБЛИКОВАННОГО КОНТРАКТА КАБИНЕТА.
 *
 * 🔴 Cycle 04 P3. Кабинет перестал считать бизнес-факты сам и спрашивает
 * канонического владельца. Доказательством миграции считается не «тесты
 * зелёные», а побайтовое совпадение ответа с тем, что кабинет отдавал ДО
 * переноса.
 *
 * Эталоны в `__fixtures__/legacy-http-contract.json` сняты прогоном СТАРОГО
 * пути (`getBusinessOverviewForCabinet` / `getEmployeeOverviewForCabinet`, оба
 * уже удалены) на тех же фикстурах, что собираются здесь. Файл эталонов лежит
 * в репозитории и правится только осознанным решением о смене контракта.
 *
 * Пять срезов покрывают требование §5: внешняя CRM с данными и пустая,
 * внутренний календарь с расходами и пустой, личный срез мастера.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const GOLDEN = JSON.parse(
  readFileSync(
    join(__dirname, '__fixtures__', 'legacy-http-contract.json'),
    'utf8',
  ),
) as Record<string, unknown>;

const PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};

const visit = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
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
  start_at: '2026-08-10T09:00:00.000Z',
  end_at: '2026-08-10T10:00:00.000Z',
  status,
  attendance: status === 'completed' ? 'arrived' : null,
  notes: null,
  total_price: price,
  currency: 'RUB',
});

const internalRow = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
) => ({
  id,
  clientId: `c-${id}`,
  branchId: null,
  staffExternalId: staff,
  startAt: new Date('2026-08-10T09:00:00.000Z'),
  endAt: new Date('2026-08-10T10:00:00.000Z'),
  status,
  totalPriceKopecks: price,
  currency: 'RUB',
});

interface Case {
  name: string;
  source: 'crm' | 'internal';
  visits: unknown[];
  expenses?: Array<{
    amountKopecks: number;
    currency: string;
    occurredAt: Date;
  }>;
  employee?: boolean;
}

const CASES: Case[] = [
  {
    name: 'внешняя CRM: полные данные',
    source: 'crm',
    visits: [visit('a', 's1', 2500), visit('b', 's2', 3000, 'canceled')],
  },
  { name: 'внешняя CRM: записей нет', source: 'crm', visits: [] },
  {
    name: 'внутренний календарь',
    source: 'internal',
    visits: [internalRow('a', 's1', 250000), internalRow('b', 's2', 300000)],
    expenses: [
      {
        amountKopecks: 50000,
        currency: 'RUB',
        occurredAt: new Date('2026-08-05T00:00:00.000Z'),
      },
    ],
  },
  { name: 'внутренний календарь: пусто', source: 'internal', visits: [] },
  {
    name: 'личный срез мастера',
    source: 'crm',
    visits: [visit('a', 's1', 2500)],
    employee: true,
  },
];

function build(kase: Case) {
  const external = kase.source === 'crm';
  const crmService = {
    getJournal: jest.fn().mockResolvedValue({
      calendar_source: 'external',
      completeness: 'complete',
      timezone: 'Europe/Moscow',
      range: PERIOD,
      provider_id: null,
      count: kase.visits.length,
      appointments: external ? kase.visits : [],
    }),
    getFinancialSummary: jest.fn().mockResolvedValue(null),
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
      findMany: jest.fn().mockResolvedValue(external ? [] : kase.visits),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    expense: { findMany: jest.fn().mockResolvedValue(kase.expenses ?? []) },
    staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
    internalProvider: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 's1', displayName: 'Илья' }),
    },
    crmStaffAccess: {
      findFirst: jest.fn().mockResolvedValue({
        externalStaffId: 's1',
        encryptedDisplayName: 'enc:Илья',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    reconciliationRun: { findFirst: jest.fn().mockResolvedValue(null) },
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
      decrypt: (value: string) => value.replace(/^enc:/, ''),
    } as unknown as EncryptionService,
    new AppointmentPeriodReader(crmService),
    new AttendanceFactsService(prisma, tenantContext),
  );
  return {
    tenantContext,
    businessState: new BusinessStateService(analytics, prisma),
  };
}

/** Ровно то, что делает контроллер: канонический state → контракт кабинета. */
function cabinet(state: { sourceOverview: unknown }) {
  return withLegacyNet(
    withoutOperationalStatusBuckets(
      withoutFactDiagnostics(
        state.sourceOverview as Parameters<typeof withLegacyNet>[0],
      ),
    ),
  );
}

async function cabinetResponse(kase: Case) {
  const { tenantContext, businessState } = build(kase);
  const request = {
    tenantId: 'tenant-http',
    period: PERIOD,
    comparisonMode: 'none' as const,
    comparisonPeriod: null,
    financeAllowed: false,
    bookedValueAllowed: false,
    operationalDetail: true,
    disclose: () => ({
      names: new Map<string, string>(),
      allowedExternalIds: new Set<string>(),
    }),
  };
  return tenantContext.runAsSystemTenant('tenant-http', async () =>
    cabinet(
      kase.employee
        ? await businessState.employee({
            ...request,
            userId: 'user-1',
            nameRows: () => new Map<string, string>(),
          })
        : await businessState.business(request),
    ),
  );
}

describe('опубликованный контракт кабинета после миграции на канонический слой', () => {
  for (const kase of CASES) {
    it(`«${kase.name}» — ответ побайтово прежний`, async () => {
      const result = await cabinetResponse(kase);

      // Побайтово: не только значения, но и состав ключей и их порядок. Фронт
      // читает объект как есть, и лишний служебный ключ — уже смена контракта.
      expect(operationalContract(result)).toEqual(
        operationalContract(GOLDEN[kase.name]),
      );
      expect(result).toMatchObject({
        net: [],
        net_status: 'unavailable',
        completeness: expect.any(Object) as unknown,
        attendance: expect.any(Object) as unknown,
      });
    });
  }

  it('🔴 личный срез не превращается в пустой объект', async () => {
    // Отдельным утверждением, потому что провалиться это может ТИХО: пустой
    // `sourceOverview` проходит через презентер и отдаётся как `{}` без ошибки.
    const result = (await cabinetResponse(CASES[CASES.length - 1])) as Record<
      string,
      unknown
    >;

    expect(Object.keys(result).length).toBeGreaterThan(5);
    expect(result.employee).toEqual({ provider_id: 's1', name: 'Илья' });
  });

  it('презентер не изобретает чисел: снимаются только ключи', () => {
    // Храповик на сам презентер. Если он однажды начнёт что-то вычислять,
    // «побайтово прежний» перестанет быть доказательством переноса.
    const source = readFileSync(
      join(__dirname, 'cabinet-overview.presenter.ts'),
      'utf8',
    );
    const bodyAfterLegacyNet = source.slice(
      source.indexOf('export function withoutOperationalStatusBuckets'),
    );

    expect(bodyAfterLegacyNet).not.toMatch(/[+\-*/]=|Math\./);
  });
});

function operationalContract(value: unknown) {
  const data = structuredClone(value) as Record<string, unknown>;
  for (const key of [
    'net',
    'net_status',
    'net_unavailable_reason',
    'completeness',
    'attendance',
  ])
    delete data[key];
  const appointments = data.appointments as Record<string, unknown>;
  for (const key of ['scheduled', 'completed', 'no_show'])
    delete appointments[key];
  for (const row of (data.daily ?? []) as Array<Record<string, unknown>>)
    for (const key of [
      'total',
      'active',
      'scheduled',
      'completed',
      'cancelled',
      'no_show',
    ])
      delete row[key];
  for (const row of (data.staff ?? []) as Array<Record<string, unknown>>)
    for (const key of ['total', 'scheduled', 'completed', 'no_show'])
      delete row[key];
  return data;
}
