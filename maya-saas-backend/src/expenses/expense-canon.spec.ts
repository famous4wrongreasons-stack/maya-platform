import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppointmentsService } from '../appointments/appointments.service';
import { AiCoreService } from '../ai-tools/ai-core.service';
import { AiToolHandlerService } from '../ai-tools/ai-tool-handler.service';
import { buildChatReportCard } from '../ai-tools/chat-report-card';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { BusinessStateService } from '../business-state/business-state.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { EncryptionService } from '../encryption/encryption.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserRole } from '../common/domain.enums';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  EXPENSE_CATEGORY_SLUGS,
  MANUAL_EXPENSE_CATEGORY_SLUGS,
  PAYROLL_EXPENSE_CATEGORY,
  findExpenseCategory,
  resolveExpenseCategory,
} from './expense-category';
import { foldExpenseRows, readExpensePeriod } from './expense-period.reader';
import { ExpensesService } from './expenses.service';

/**
 * 🔴 Cycle 04 P8. Одна статья расхода — одна идентичность и один сумматор.
 *
 * До этого пакета «зарплата» называлась `payroll` в справочнике и `salary` в
 * аналитике, а «сколько потрачено за период» складывалось в четырёх местах, из
 * которых два обрывались на пятистах записях. Здесь проверяется, что обе
 * развилки закрыты и не могут открыться молча.
 */

type Row = {
  id: string;
  tenantId: string;
  branchId: string | null;
  category: string;
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
};

const row = (
  category: string,
  amountKopecks: number,
  index = 0,
  extra: Partial<Row> = {},
): Row => ({
  id: `expense-${category}-${index}`,
  tenantId: 'tenant-a',
  branchId: null,
  category,
  amountKopecks,
  currency: 'RUB',
  occurredAt: new Date('2026-07-10T10:00:00.000Z'),
  ...extra,
});

const july = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T23:59:59.999Z',
};

/**
 * `fail: 'aggregate'` роняет только неограниченный запрос — тот, что читает
 * период целиком. Именно он в жизни отваливается по таймауту первым, а
 * постраничный перечень при этом приезжает. Состояние «строки есть, а итог
 * неизвестен» реально, и ноль вместо него был бы враньём.
 */
function createExpenses(rows: Row[], options: { fail?: 'aggregate' } = {}) {
  const tenantContext = new TenantContextService();
  const calls: Array<Record<string, unknown>> = [];
  const findMany = jest.fn((args: Record<string, unknown>) => {
    calls.push(args);
    if (options.fail === 'aggregate' && typeof args.take !== 'number') {
      return Promise.reject(new Error('expense ledger unavailable'));
    }
    const where = args.where as { tenantId: string; branchId?: string };
    const matched = rows.filter(
      (item) =>
        item.tenantId === where.tenantId &&
        (where.branchId === undefined || item.branchId === where.branchId),
    );
    const take = typeof args.take === 'number' ? args.take : undefined;
    return Promise.resolve(take ? matched.slice(0, take) : matched);
  });
  const prisma = {
    expense: { findMany, findFirst: jest.fn().mockResolvedValue(null) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'Europe/Moscow',
      }),
    },
    branch: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const service = new ExpensesService(
    prisma,
    tenantContext,
    {
      assertBranchBelongsToTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as TenantsService,
    {
      encrypt: jest.fn((value: string) => value),
      decrypt: jest.fn((value: string) => value),
    } as unknown as EncryptionService,
    {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService,
    {} as never,
  );
  return { service, prisma, tenantContext, findMany, calls };
}

function createHandler(
  expensesService: ExpensesService,
  prisma: PrismaService,
) {
  return new AiToolHandlerService(
    {} as CrmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    {} as OperationsAnalyticsService,
    expensesService,
    prisma,
    {} as CustomersService,
    {} as StaffService,
    new BusinessStateService({} as OperationsAnalyticsService, prisma),
    new AppointmentPeriodReader({} as CrmService),
    new ClientRecencyFactsService({} as CrmService),
  );
}

async function toolPayload(rows: Row[], options: { fail?: 'aggregate' } = {}) {
  const setup = createExpenses(rows, options);
  const handler = createHandler(setup.service, setup.prisma);
  const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
    handler.execute(
      'expenses.read',
      {
        tenantId: 'tenant-a',
        userId: 'owner-a',
        role: UserRole.TENANT_OWNER,
        membershipId: 'membership-a',
      } as never,
      { period: 'custom', from: july.from, to: july.to },
      `execution-${Math.abs(rows.length)}`,
    ),
  );
  return result as Record<string, unknown>;
}

const card = (payload: Record<string, unknown>) =>
  buildChatReportCard([{ name: 'expenses.read', result: payload }], {
    personal: false,
    userText: 'на что уходят деньги',
  });

/** Детерминированный текст — метод без состояния, поэтому зовётся напрямую. */
const deterministicExpenseText = (payload: Record<string, unknown>) =>
  (
    Object.create(AiCoreService.prototype) as unknown as {
      deterministicExpenseReply(evidence: unknown): string | null;
    }
  ).deterministicExpenseReply(payload);

describe('Cycle 04 P8 — канон статей расхода', () => {
  it('1. каждая принимаемая DTO категория разрешается канонически', () => {
    for (const slug of EXPENSE_CATEGORY_SLUGS) {
      const resolved = resolveExpenseCategory(slug);
      expect(resolved.slug).toBe(slug);
      expect(resolved.match).toBe('canonical');
      expect(resolved.label).not.toBe(slug);
    }
    for (const slug of MANUAL_EXPENSE_CATEGORY_SLUGS) {
      const errors = validateSync(
        plainToInstance(CreateExpenseDto, {
          category: slug,
          amountKopecks: 1_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        }),
      );
      expect(errors.filter((error) => error.property === 'category')).toEqual(
        [],
      );
    }
  });

  it('2. неизвестная категория отвергается и на входе, и в сервисе', async () => {
    const errors = validateSync(
      plainToInstance(CreateExpenseDto, {
        category: 'arenda',
        amountKopecks: 1_000,
        occurredAt: '2026-07-10T10:00:00.000Z',
      }),
    );
    expect(errors.some((error) => error.property === 'category')).toBe(true);

    const setup = createExpenses([]);
    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.create('tenant-a', 'owner-a', {
          category: 'arenda',
          amountKopecks: 1_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('3. legacy-синоним зарплаты разрешается ровно в одном месте', async () => {
    for (const legacy of [
      'salary',
      'salaries',
      'wages',
      'zarplata',
      'staff_salary',
    ]) {
      const resolved = resolveExpenseCategory(legacy);
      expect(resolved.slug).toBe(PAYROLL_EXPENSE_CATEGORY);
      expect(resolved.match).toBe('legacy_alias');
      // Путь ЗАПИСИ синонимов не знает: иначе одна статья снова начала бы
      // въезжать в базу под разными именами.
      expect(findExpenseCategory(legacy)).toBeNull();
    }
    const setup = createExpenses([]);
    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.create('tenant-a', 'owner-a', {
          category: 'salary',
          amountKopecks: 1_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('4. презентация не держит собственного словаря статей', () => {
    const src = (path: string) =>
      readFileSync(join(__dirname, '..', path), 'utf8');
    const cardSource = src('ai-tools/chat-report-card.ts');
    expect(cardSource).toContain(
      "import { PAYROLL_EXPENSE_CATEGORY } from '../expenses/expense-category'",
    );
    const analytics = src('analytics/operations-analytics.service.ts');
    for (const forbidden of [
      'EXPENSE_CATEGORY_ALIASES',
      'EXPENSE_CATEGORY_LABELS',
      'canonicalExpenseCategory',
    ]) {
      expect(analytics).not.toContain(forbidden);
    }
    // Литерал статьи в коде — это второй справочник на одну строку.
    for (const source of [cardSource, analytics]) {
      const literals = source
        .split('\n')
        .filter(
          (line) =>
            !line.trim().startsWith('*') && !line.trim().startsWith('//'),
        )
        .filter((line) => /['"]salary['"]/.test(line));
      expect(literals).toEqual([]);
    }
  });

  it('5. одни и те же строки дают одинаковые суммы во всех срезах', async () => {
    const rows = [
      row('rent', 200_000, 1),
      row('supplies', 50_000, 2),
      row('supplies', 25_000, 3),
    ];
    const canonical = foldExpenseRows(rows);
    const setup = createExpenses(rows);
    const list = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', july),
    );
    const payload = await toolPayload(rows);
    const widget = card(payload)?.widget_data as Record<string, unknown>;

    expect(
      list.by_category.map(({ category, amount_kopecks }) => ({
        category,
        amount_kopecks,
      })),
    ).toEqual(
      canonical.by_category.map(({ category, amount_kopecks }) => ({
        category,
        amount_kopecks,
      })),
    );
    expect(
      (payload.by_category as Array<Record<string, unknown>>).map((entry) => ({
        category: entry.category,
        amount_kopecks: entry.amount_kopecks,
      })),
    ).toEqual(
      canonical.by_category.map(({ category, amount_kopecks }) => ({
        category,
        amount_kopecks,
      })),
    );
    expect(widget.primary_rub).toBe(2_750);
    expect(
      (widget.rows as Array<{ label: string; value_rub: number }>).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Аренда', 'Расходники']);
    expect(String(deterministicExpenseText(payload))).toContain('Аренда');
  });

  it('6. ноль расходов измерен, а нечитаемая книга — нет', async () => {
    const measured = await toolPayload([]);
    expect(measured.totals_basis).toBe('all_recorded_expenses_in_scope');
    expect(measured.expense_count).toBe(0);
    expect(String(card(measured)?.widget_data.status_text)).toContain(
      'внесённых записей нет',
    );
    expect(String(deterministicExpenseText(measured))).toContain(
      'не заведено ни одного',
    );

    const unread = await toolPayload([row('rent', 100_000)], {
      fail: 'aggregate',
    });
    expect(unread.totals_basis).toBe('unavailable');
    expect(unread.totals).toEqual([]);
    // 🔴 Счётчик строк тоже не выдумывается. Ноль рядом с реальными операциями
    // в доказательствах модели читается как «расходов не было» — и сторож
    // чисел его пропустит, потому что ноль буквально лежит в ответе.
    expect(unread.expense_count).toBeNull();
    // Перечень операций при этом приехал — и именно поэтому ноль в итоге был бы
    // прочитан как «расходов не было».
    expect((unread.items as unknown[]).length).toBe(1);
    const status = String(card(unread)?.widget_data.status_text);
    expect(status).toContain('прочитать не удалось');
    expect(card(unread)?.widget_data.source_complete).toBe(false);
    expect(String(deterministicExpenseText(unread))).toContain(
      'прочитать не удалось',
    );
  });

  it('7. пятьсот строк не выдаются за полный реестр, а суммы считаются по всем', async () => {
    const rows = Array.from({ length: 620 }, (_, index) =>
      row('supplies', 1_000, index),
    );
    const payload = await toolPayload(rows);
    expect((payload.items as unknown[]).length).toBe(500);
    expect(payload.truncated).toBe(true);
    expect(payload.expense_count).toBe(620);
    // 🔴 Главное: деньги не зависят от потолка перечня. Раньше здесь было
    // 500 000 копеек — сумма первой страницы, подписанная «всего за период».
    expect(payload.totals).toEqual([
      expect.objectContaining({ currency: 'RUB', amount_kopecks: 620_000 }),
    ]);
    expect(
      (payload.by_category as Array<Record<string, unknown>>)[0].amount_kopecks,
    ).toBe(620_000);
    const status = String(card(payload)?.widget_data.status_text);
    expect(status).toContain('620');
    expect(status).not.toContain('нижняя граница');
  });

  it('8. сумматор не смешивает арендаторов', async () => {
    const rows = [
      row('rent', 200_000, 1),
      row('rent', 999_000, 2, { tenantId: 'tenant-b' }),
    ];
    const setup = createExpenses(rows);
    const list = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', july),
    );
    expect(list.totals).toEqual([{ currency: 'RUB', amount_kopecks: 200_000 }]);
    for (const call of setup.calls) {
      expect((call.where as { tenantId: string }).tenantId).toBe('tenant-a');
    }
  });

  it('9. филиал сужает выборку, а его отсутствие означает весь арендатор', async () => {
    const rows = [
      row('rent', 200_000, 1, { branchId: 'branch-a' }),
      row('rent', 300_000, 2, { branchId: 'branch-b' }),
    ];
    const setup = createExpenses(rows);
    const scoped = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', { ...july, branchId: 'branch-a' }),
    );
    expect(scoped.totals).toEqual([
      { currency: 'RUB', amount_kopecks: 200_000 },
    ]);
    expect(scoped.by_category[0].expense_count).toBe(1);

    const whole = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', july),
    );
    expect(whole.totals).toEqual([
      { currency: 'RUB', amount_kopecks: 500_000 },
    ]);

    // Расчёт прибыли читает книгу по всему арендатору: филиальный срез он
    // отказывает раньше — CRM подтверждает кассу только по компании.
    const tenantWide = await readExpensePeriod(setup.prisma, {
      tenantId: 'tenant-a',
      from: new Date(july.from),
      to: new Date(july.to),
    });
    expect(tenantWide.scope.branch_id).toBeNull();
    expect(tenantWide.totals).toEqual([
      { currency: 'RUB', amount_kopecks: 500_000 },
    ]);
  });

  it('11. непрочитанная книга не называет число строк ни одному потребителю', async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      row('supplies', 1_000, index),
    );
    const setup = createExpenses(rows, { fail: 'aggregate' });
    const period = await readExpensePeriod(setup.prisma, {
      tenantId: 'tenant-a',
      from: new Date(july.from),
      to: new Date(july.to),
    });
    expect(period.status).toBe('unavailable');
    expect(period.expense_count).toBeNull();

    const list = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', july),
    );
    expect(list.expense_count).toBeNull();
    expect(list.items).toHaveLength(3);

    const payload = await toolPayload(rows, { fail: 'aggregate' });
    const status = String(card(payload)?.widget_data.status_text);
    expect(status).toContain('прочитать не удалось');
    expect(status).not.toMatch(/\d/);
  });

  it('12. ровно пятьсот записей — это полный перечень, а не обрыв', async () => {
    const exactly = Array.from({ length: 500 }, (_, index) =>
      row('supplies', 1_000, index),
    );
    const payload = await toolPayload(exactly);
    expect((payload.items as unknown[]).length).toBe(500);
    expect(payload.expense_count).toBe(500);
    // 🔴 Раньше признак обрыва означал «страница заполнена», и владельцу
    // сообщали о неполноте, которой нет, — подрывая доверие ровно к тем
    // числам, ради честности которых пакет и переписывал текст.
    expect(payload.truncated).toBe(false);
    expect(String(card(payload)?.widget_data.status_text)).not.toContain(
      'не все операции',
    );

    const oneMore = Array.from({ length: 501 }, (_, index) =>
      row('supplies', 1_000, index),
    );
    const beyond = await toolPayload(oneMore);
    expect(beyond.truncated).toBe(true);
    expect(beyond.expense_count).toBe(501);
    expect(String(card(beyond)?.widget_data.status_text)).toContain('501');
  });

  it('13. непрочитанная книга расходов названа своей причиной, а не зарплатой', () => {
    // Движок проверяет книгу ПЕРВОЙ, поэтому её отказ — настоящий блокер.
    const reply = (
      Object.create(AiCoreService.prototype) as unknown as {
        deterministicProfitReply(evidence: unknown): string | null;
      }
    ).deterministicProfitReply({
      resolved_period: { label_ru: 'август' },
      confirmed_revenue: {
        status: 'available',
        total: { currency: 'RUB', amount_kopecks: 10_000_000 },
      },
      expenses: { status: 'unavailable', by_category: [], totals: [] },
      completeness: { owner_confirmation_required: false },
      payroll: { status: 'unavailable' },
      net_profit: {
        status: 'unavailable',
        unavailable_reason: 'expense_ledger_did_not_answer_for_this_period',
      },
    });
    expect(String(reply)).toContain('книгу расходов');
    expect(String(reply)).not.toContain('спросите за месяц');
    expect(String(reply)).not.toContain('Спросите за месяц');
  });

  it('14. охват сумм назван, а не подразумевается', async () => {
    const rows = [
      row('rent', 200_000, 1, { branchId: 'branch-a' }),
      row('rent', 300_000, 2, { branchId: 'branch-b' }),
    ];
    const setup = createExpenses(rows);
    const scoped = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', { ...july, branchId: 'branch-a' }),
    );
    // 🔴 «Все расходы периода» на филиальном срезе — другое число под тем же
    // именем. Поэтому имя основания говорит про охват, а сам охват публикуется.
    expect(scoped.totals_basis).toBe('all_recorded_expenses_in_scope');
    expect(scoped.scope).toEqual({ branch_id: 'branch-a' });

    const whole = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', july),
    );
    expect(whole.scope).toEqual({ branch_id: null });
  });

  it('10. синоним и канон складываются в одну статью, а не в две', () => {
    const folded = foldExpenseRows([
      row('supplies', 30_000, 1),
      // Строка, заведённая до появления справочника.
      row('rashodniki', 20_000, 2),
      row('materials', 10_000, 3),
    ]);
    expect(folded.by_category).toHaveLength(1);
    expect(folded.by_category[0]).toMatchObject({
      category: 'supplies',
      label: 'Расходники',
      kind: 'variable',
      amount_kopecks: 60_000,
      expense_count: 3,
    });
  });
});
