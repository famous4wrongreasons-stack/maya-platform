import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { readExpensePeriod } from './expense-period.reader';
import {
  EXPENSE_CATEGORY_SLUGS,
  ExpenseSource,
  MANUAL_EXPENSE_CATEGORY_SLUGS,
  findExpenseCategory,
  resolveExpenseCategory,
} from './expense-category';

interface ExpenseRow {
  id: string;
  tenantId: string;
  branchId: string | null;
  category: string;
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
  encryptedNote: string | null;
  source: string;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ExpensePeriodDeclarationRow {
  id: string;
  tenantId: string;
  declaredById: string | null;
  periodFromDay: string;
  periodToDay: string;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExpenseOptions {
  /** `manual` — завёл человек или MAYA, `crm` — импорт из внешней CRM. */
  source?: ExpenseSource;
  /** Идентификатор платежа в CRM: защищает импорт от повторов. */
  externalId?: string | null;
  /**
   * Ключ подтверждения. Повторное подтверждение той же карточки в чате
   * возвращает уже созданный расход, а не заводит второй.
   */
  idempotencyKey?: string | null;
}

/** Страница перечня операций. Деньги периода от неё не зависят. */
const LIST_PAGE_SIZE = 500;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantsService: TenantsService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateExpenseDto,
    options: CreateExpenseOptions = {},
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const source: ExpenseSource = options.source ?? 'manual';
    const category = this.assertCategory(dto.category, source);
    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        scopedTenantId,
      );
    }
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid expense date');
    }

    const idempotencyKey = options.idempotencyKey ?? null;
    const externalId = options.externalId ?? null;
    const replayed = await this.findExisting(
      scopedTenantId,
      idempotencyKey,
      externalId,
    );
    if (replayed) {
      return { ...this.serialize(replayed), possible_duplicate: null };
    }

    // 🔴 Мягкая защита от задвоения, а не запрет. Уникальность по externalId
    // ловит только повторный ИМПОРТ; один и тот же реальный платёж, введённый
    // руками и приехавший из CRM, для базы — две разные записи, и в прибыли он
    // вычитается дважды. Блокировать нельзя: у владельца бывает две одинаковых
    // оплаты в один день, и он знает это лучше нас. Поэтому — пометка, которую
    // видно в карточке подтверждения и в ответе.
    const duplicates = await this.findProbableDuplicates(scopedTenantId, {
      category,
      amountKopecks: dto.amountKopecks,
      currency: dto.currency ?? 'RUB',
      occurredAt,
      source,
    }).catch(() => []);

    let expense: ExpenseRow;
    try {
      expense = await this.prisma.expense.create({
        data: {
          tenantId: scopedTenantId,
          branchId: dto.branchId ?? null,
          branchTenantId: dto.branchId ? scopedTenantId : null,
          createdById: actorUserId,
          createdByTenantId: scopedTenantId,
          category,
          amountKopecks: dto.amountKopecks,
          currency: dto.currency ?? 'RUB',
          occurredAt,
          encryptedNote: dto.note?.trim()
            ? this.encryptionService.encrypt(dto.note.trim())
            : null,
          source,
          externalId,
          idempotencyKey,
        },
      });
    } catch (error) {
      // Гонка двух подтверждений одной карточки: индекс сработал раньше нас,
      // расход уже есть — отдаём его, а не заводим второй.
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const raced = await this.findExisting(
        scopedTenantId,
        idempotencyKey,
        externalId,
      );
      if (!raced) {
        throw error;
      }
      return { ...this.serialize(raced), possible_duplicate: null };
    }

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount_kopecks: expense.amountKopecks,
        currency: expense.currency,
        occurred_at: expense.occurredAt.toISOString(),
        source: expense.source,
        possible_duplicate_of: duplicates.map((row) => row.id),
      },
    });

    await this.invalidatePeriodDeclarations(
      scopedTenantId,
      occurredAt.toISOString().slice(0, 10),
    );

    return {
      ...this.serialize(expense),
      possible_duplicate:
        duplicates.length === 0
          ? null
          : {
              status: 'suspected' as const,
              reason:
                'the_same_amount_and_category_within_one_day_is_already_recorded_from_another_source',
              matches: duplicates,
            },
    };
  }

  async list(tenantId: string, query: ListExpensesQueryDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.assertRange(from, to);
    if (query.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        query.branchId,
        scopedTenantId,
      );
    }

    const [expenses, period] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          tenantId: scopedTenantId,
          occurredAt: { gte: from, lte: to },
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: LIST_PAGE_SIZE,
      }) as Promise<ExpenseRow[]>,
      // 🔴 Cycle 04 P8. Итоги считает канонический сумматор по ВСЕМ строкам
      // периода, а не по первой странице. Раньше `totals` складывались из тех
      // же обрезанных `items`, и на 501-й записи владелец получал сумму первых
      // пятисот, подписанную как «всего за период».
      readExpensePeriod(this.prisma, {
        tenantId: scopedTenantId,
        from,
        to,
        branchId: query.branchId ?? null,
      }),
    ]);

    return {
      items: expenses.map((expense) => this.serialize(expense)),
      totals: period.totals.map((total) => ({ ...total })),
      by_category: period.by_category.map((row) => ({ ...row })),
      /**
       * Сколько строк расхода в периоде всего — включая не попавшие в `items`.
       * `null`, если книгу прочитать не удалось: ноль был бы враньём.
       */
      expense_count: period.expense_count,
      /**
       * Обрезан ПЕРЕЧЕНЬ операций. Суммы выше от этого не зависят.
       *
       * 🔴 Сравнение с реальным числом строк, а не «страница заполнена». Ровно
       * пятьсот расходов за период — это полный перечень, и говорить о нём
       * «показаны не все» значит сомневаться в верных числах на ровном месте.
       * Когда числа строк нет (книга не прочитана), полагаться остаётся только
       * на заполненность страницы.
       */
      truncated:
        period.expense_count === null
          ? expenses.length === LIST_PAGE_SIZE
          : period.expense_count > expenses.length,
      totals_basis:
        period.status === 'measured'
          ? ('all_recorded_expenses_in_scope' as const)
          : ('unavailable' as const),
      totals_unavailable_reason: period.unavailable_reason,
      /**
       * Охват сумм. Без него «все расходы периода» на филиальном срезе читается
       * как «весь салон», а это другое число под тем же именем.
       */
      scope: { ...period.scope },
    };
  }

  async remove(tenantId: string, actorUserId: string, expenseId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId: scopedTenantId },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.prisma.expense.delete({
      where: { id_tenantId: { id: expenseId, tenantId: scopedTenantId } },
    });
    await this.invalidatePeriodDeclarations(
      scopedTenantId,
      expense.occurredAt.toISOString().slice(0, 10),
    );
    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'expense.deleted',
      entityType: 'expense',
      entityId: expenseId,
      metadata: {
        category: expense.category,
        amount_kopecks: expense.amountKopecks,
        currency: expense.currency,
      },
    });

    return { ok: true, expense_id: expenseId };
  }

  /**
   * Владелец явно подтверждает полноту НЕсистемных расходов периода.
   *
   * Это не расход на ноль рублей и не догадка модели. Декларация хранится
   * отдельно, аудируется и автоматически снимается, если книга периода
   * меняется. Зарплата сюда не относится: она всегда приходит из CRM.
   */
  async declarePeriodComplete(
    tenantId: string,
    actorUserId: string,
    periodFromDay: string,
    periodToDay: string,
    idempotencyKey?: string | null,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    this.assertDayRange(periodFromDay, periodToDay);

    const key = idempotencyKey?.trim() || null;
    if (key) {
      const replayed = await this.prisma.expensePeriodDeclaration.findFirst({
        where: { tenantId: scopedTenantId, idempotencyKey: key },
      });
      if (replayed) {
        if (
          replayed.periodFromDay !== periodFromDay ||
          replayed.periodToDay !== periodToDay
        ) {
          throw new BadRequestException(
            'Expense declaration idempotency key belongs to another period',
          );
        }
        return this.serializePeriodDeclaration(replayed);
      }
    }

    let declaration: ExpensePeriodDeclarationRow;
    try {
      declaration = await this.prisma.expensePeriodDeclaration.upsert({
        where: {
          tenantId_periodFromDay_periodToDay: {
            tenantId: scopedTenantId,
            periodFromDay,
            periodToDay,
          },
        },
        create: {
          tenantId: scopedTenantId,
          declaredById: actorUserId,
          periodFromDay,
          periodToDay,
          idempotencyKey: key,
        },
        update: {
          declaredById: actorUserId,
          idempotencyKey: key,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error) || !key) {
        throw error;
      }
      const raced = await this.prisma.expensePeriodDeclaration.findFirst({
        where: { tenantId: scopedTenantId, idempotencyKey: key },
      });
      if (!raced) {
        throw error;
      }
      declaration = raced;
    }

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'expense.period_declared_complete',
      entityType: 'expense_period_declaration',
      entityId: declaration.id,
      metadata: {
        period_from_day: declaration.periodFromDay,
        period_to_day: declaration.periodToDay,
      },
    });

    return this.serializePeriodDeclaration(declaration);
  }

  async findPeriodDeclaration(
    tenantId: string,
    periodFromDay: string,
    periodToDay: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    this.assertDayRange(periodFromDay, periodToDay);
    const declaration = await this.prisma.expensePeriodDeclaration.findUnique({
      where: {
        tenantId_periodFromDay_periodToDay: {
          tenantId: scopedTenantId,
          periodFromDay,
          periodToDay,
        },
      },
    });
    return declaration ? this.serializePeriodDeclaration(declaration) : null;
  }

  /**
   * Категория при записи — только из справочника, и зарплату руками нельзя.
   *
   * Начисления мастерам приезжают расчётом из CRM и уже участвуют в отчётах.
   * Ручной расход с той же категорией сложил бы зарплату саму с собой и
   * занизил прибыль ровно на фонд оплаты труда.
   */
  private assertCategory(value: unknown, source: ExpenseSource): string {
    const known = findExpenseCategory(value);
    if (!known) {
      throw new BadRequestException({
        message: `Unknown expense category. Allowed: ${EXPENSE_CATEGORY_SLUGS.join(', ')}.`,
        error: {
          code: 'expense_category_unknown',
          allowed_categories: EXPENSE_CATEGORY_SLUGS,
        },
      });
    }
    if (source === 'manual' && known.manualEntry !== 'allowed') {
      throw new BadRequestException({
        message:
          'Payroll is not recorded by hand: master payroll already arrives from the CRM payroll calculation, and a manual copy would count it twice. Manual categories: ' +
          `${MANUAL_EXPENSE_CATEGORY_SLUGS.join(', ')}.`,
        error: {
          code: 'expense_category_not_manual',
          category: known.slug,
          reason: known.manualEntryBlockedReason ?? 'category_is_system_owned',
          allowed_categories: MANUAL_EXPENSE_CATEGORY_SLUGS,
        },
      });
    }
    return known.slug;
  }

  /**
   * Похожие расходы ИЗ ДРУГОГО ИСТОЧНИКА — кандидаты в дубли.
   *
   * Совпадение по сумме, статье и валюте в пределах ±1 дня. Сутки допуска
   * нужны потому, что руками платёж записывают в день оплаты, а CRM проводит
   * его датой закрытия смены — расхождение на день здесь норма, а не разные
   * платежи. Свой же источник не считается: два ручных расхода подряд — это
   * осознанное действие человека, а не рассинхрон систем.
   */
  async findProbableDuplicates(
    tenantId: string,
    candidate: {
      category: string;
      amountKopecks: number;
      currency: string;
      occurredAt: Date;
      source: ExpenseSource;
    },
  ): Promise<
    Array<{
      id: string;
      source: string;
      occurred_at: string;
      amount_kopecks: number;
      currency: string;
      category: string;
    }>
  > {
    if (typeof this.prisma.expense?.findMany !== 'function') {
      return [];
    }
    const window = 24 * 60 * 60 * 1000;
    const rows = (await this.prisma.expense.findMany({
      where: {
        tenantId,
        category: candidate.category,
        amountKopecks: candidate.amountKopecks,
        currency: candidate.currency,
        occurredAt: {
          gte: new Date(candidate.occurredAt.getTime() - window),
          lte: new Date(candidate.occurredAt.getTime() + window),
        },
      },
      orderBy: { occurredAt: 'asc' },
      take: 5,
    })) as ExpenseRow[];

    return rows
      .filter((row) => (row.source ?? 'manual') !== candidate.source)
      .map((row) => ({
        id: row.id,
        source: row.source ?? 'manual',
        occurred_at: row.occurredAt.toISOString(),
        amount_kopecks: row.amountKopecks,
        currency: row.currency,
        category: row.category,
      }));
  }

  private async findExisting(
    tenantId: string,
    idempotencyKey: string | null,
    externalId: string | null,
  ): Promise<ExpenseRow | null> {
    if (idempotencyKey) {
      const byKey = (await this.prisma.expense.findFirst({
        where: { tenantId, idempotencyKey },
      })) as ExpenseRow | null;
      if (byKey) {
        return byKey;
      }
    }
    if (externalId) {
      const byExternalId = (await this.prisma.expense.findFirst({
        where: { tenantId, externalId },
      })) as ExpenseRow | null;
      if (byExternalId) {
        return byExternalId;
      }
    }
    return null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private assertRange(from: Date, to: Date): void {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() > to.getTime()
    ) {
      throw new BadRequestException('Invalid expense date range');
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Expense date range cannot exceed 366 days',
      );
    }
  }

  private assertDayRange(periodFromDay: string, periodToDay: string): void {
    const valid = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    };
    if (
      !valid(periodFromDay) ||
      !valid(periodToDay) ||
      periodFromDay > periodToDay
    ) {
      throw new BadRequestException('Invalid expense declaration date range');
    }
  }

  private async invalidatePeriodDeclarations(
    tenantId: string,
    occurredDay: string,
  ): Promise<void> {
    await this.prisma.expensePeriodDeclaration.deleteMany({
      where: {
        tenantId,
        periodFromDay: { lte: occurredDay },
        periodToDay: { gte: occurredDay },
      },
    });
  }

  private serializePeriodDeclaration(declaration: ExpensePeriodDeclarationRow) {
    return {
      id: declaration.id,
      tenant_id: declaration.tenantId,
      period_from_day: declaration.periodFromDay,
      period_to_day: declaration.periodToDay,
      declared_complete: true as const,
      declared_at: declaration.updatedAt,
    };
  }

  private serialize(expense: ExpenseRow) {
    // Старые записи с категориями вне справочника читаются как `other`,
    // но исходная строка не теряется: она в category_raw.
    const category = resolveExpenseCategory(expense.category);
    return {
      id: expense.id,
      tenant_id: expense.tenantId,
      branch_id: expense.branchId,
      category: category.slug,
      category_label: category.label,
      category_kind: category.kind,
      category_known: category.known,
      category_raw: category.raw,
      amount_kopecks: expense.amountKopecks,
      currency: expense.currency,
      occurred_at: expense.occurredAt,
      source: expense.source ?? 'manual',
      external_id: expense.externalId ?? null,
      note: expense.encryptedNote
        ? this.encryptionService.decrypt(expense.encryptedNote)
        : null,
      created_at: expense.createdAt,
      updated_at: expense.updatedAt,
    };
  }
}
