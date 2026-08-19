import { Logger } from '@nestjs/common';

import {
  ExpenseCategoryKind,
  ExpenseCategorySlug,
  resolveExpenseCategory,
} from './expense-category';

/**
 * Единственный счётчик расходов за период.
 *
 * До этого модуля один и тот же вопрос — «сколько потрачено за период» —
 * складывали четыре разных места: список расходов (первые 500 строк), разрез
 * по статьям поверх того же обрезанного списка, обзорная сумма по валютам без
 * обрезки и книга расходов расчёта прибыли. Два первых отвечали иначе, чем два
 * последних, как только записей становилось больше пятисот, и ни один
 * потребитель не мог узнать, какой из ответов он держит в руках.
 *
 * Здесь суммирование ровно одно, обрезки у него нет по построению, а статьи
 * берутся из канонического справочника, а не из локального словаря.
 */
export interface ExpensePeriodCategoryTotal {
  readonly category: ExpenseCategorySlug;
  readonly label: string;
  readonly kind: ExpenseCategoryKind;
  readonly currency: string;
  readonly amount_kopecks: number;
  readonly expense_count: number;
}

export interface ExpensePeriodTotal {
  readonly currency: string;
  readonly amount_kopecks: number;
}

export interface ExpensePeriodRead {
  /**
   * `measured` — книга расходов прочитана целиком; пустой период при этом
   * означает измеренный ноль. `unavailable` — прочитать не удалось, и ноль тут
   * поставить нельзя: это разные состояния, и путать их запрещено (P0).
   */
  readonly status: 'measured' | 'unavailable';
  readonly unavailable_reason: string | null;
  readonly scope: { readonly branch_id: string | null };
  /**
   * Сколько строк расхода попало в период. Сумма считается по всем.
   *
   * 🔴 `null`, когда книга не прочитана. Ноль здесь означал бы «строк не было» —
   * ровно та подмена, которую запрещает докстрока `status` выше, и она уже
   * успела проехать в доказательства модели рядом с полусотней реальных строк.
   */
  readonly expense_count: number | null;
  readonly by_category: readonly ExpensePeriodCategoryTotal[];
  readonly totals: readonly ExpensePeriodTotal[];
}

/**
 * 🔴 Отказ обязан оставить след. Без него настоящая причина — таймаут, чужая
 * схема после кривого выката — умирает здесь, а в журнале юнита остаётся один
 * машинный лозунг, и разбирать аварию не по чему.
 */
const logger = new Logger('ExpensePeriodReader');

/** Почему книгу расходов прочитать не удалось. */
export const EXPENSE_PERIOD_UNAVAILABLE = {
  notReadable: 'expense_ledger_is_not_readable',
  readFailed: 'expense_ledger_did_not_answer_for_this_period',
} as const;

type ExpenseRowShape = {
  category: string | null;
  currency: string;
  amountKopecks: number;
};

type ExpenseDelegate = {
  findMany?: (args: unknown) => Promise<ExpenseRowShape[]>;
};

export interface ExpensePeriodQuery {
  readonly tenantId: string;
  readonly from: Date;
  readonly to: Date;
  /** `null` — весь арендатор. Филиал сужает выборку, а не меняет смысл. */
  readonly branchId?: string | null;
}

export async function readExpensePeriod(
  prisma: { expense?: ExpenseDelegate },
  query: ExpensePeriodQuery,
): Promise<ExpensePeriodRead> {
  const branchId = query.branchId ?? null;
  if (typeof prisma.expense?.findMany !== 'function') {
    logger.error(
      `expense ledger is not readable tenant=${query.tenantId}: ` +
        'prisma has no expense delegate',
    );
    return unavailable(branchId, EXPENSE_PERIOD_UNAVAILABLE.notReadable);
  }
  let rows: ExpenseRowShape[];
  try {
    rows = await prisma.expense.findMany({
      where: {
        tenantId: query.tenantId,
        occurredAt: { gte: query.from, lte: query.to },
        ...(branchId ? { branchId } : {}),
      },
      select: { category: true, currency: true, amountKopecks: true },
      // 🔴 `take` здесь нет намеренно. Потолок на строках означал бы, что итог
      // периода зависит от их количества, и владелец увидел бы сумму первых
      // пятисот как «всего за период». Перечень операций обрезать можно —
      // деньги нельзя.
    });
  } catch (error) {
    logger.error(
      `expense ledger read failed tenant=${query.tenantId} ` +
        `period=${query.from.toISOString()}..${query.to.toISOString()} ` +
        `branch=${branchId ?? 'all'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      error instanceof Error ? error.stack : undefined,
    );
    return unavailable(branchId, EXPENSE_PERIOD_UNAVAILABLE.readFailed);
  }
  return foldExpenseRows(rows, branchId);
}

/** Свернуть уже прочитанные строки. Вынесено, чтобы тесты не ходили в базу. */
export function foldExpenseRows(
  rows: readonly ExpenseRowShape[],
  branchId: string | null = null,
): ExpensePeriodRead {
  const categories = new Map<string, ExpensePeriodCategoryTotal>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const resolved = resolveExpenseCategory(row.category);
    const key = `${resolved.slug}|${row.currency}`;
    const current = categories.get(key);
    if (current) {
      categories.set(key, {
        ...current,
        amount_kopecks: current.amount_kopecks + row.amountKopecks,
        expense_count: current.expense_count + 1,
      });
    } else {
      categories.set(key, {
        category: resolved.slug,
        label: resolved.label,
        kind: resolved.kind,
        currency: row.currency,
        amount_kopecks: row.amountKopecks,
        expense_count: 1,
      });
    }
    totals.set(
      row.currency,
      (totals.get(row.currency) ?? 0) + row.amountKopecks,
    );
  }
  return {
    status: 'measured',
    unavailable_reason: null,
    scope: { branch_id: branchId },
    expense_count: rows.length,
    // От большего к меньшему: вопрос «на что больше всего тратим» отвечается
    // первой строкой, а не поиском максимума на стороне потребителя.
    by_category: [...categories.values()].sort(
      (left, right) =>
        right.amount_kopecks - left.amount_kopecks ||
        left.category.localeCompare(right.category),
    ),
    totals: [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount_kopecks]) => ({ currency, amount_kopecks })),
  };
}

function unavailable(
  branchId: string | null,
  reason: string,
): ExpensePeriodRead {
  return {
    status: 'unavailable',
    unavailable_reason: reason,
    scope: { branch_id: branchId },
    expense_count: null,
    by_category: [],
    totals: [],
  };
}
