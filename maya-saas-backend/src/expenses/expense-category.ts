/**
 * Справочник статей расходов.
 *
 * Раньше `Expense.category` была свободной строкой, и одна и та же аренда
 * приезжала как `rent`, `arenda` и `arenda-avgust`. Пока расходы только
 * складывали, это было терпимо; как только по ним считается маржа, разъехавшийся
 * справочник превращается в три разные статьи вместо одной.
 *
 * Поэтому категорий ровно столько, сколько перечислено ниже, и у каждой есть
 * `kind`: постоянная (не зависит от выручки) или переменная (растёт вместе с
 * оборотом). Без этого деления маржу не посчитать: постоянные надо покрыть
 * независимо от загрузки, переменные уходят вместе с каждым рублём выручки.
 */
export type ExpenseCategoryKind = 'fixed' | 'variable';

export interface ExpenseCategoryDefinition {
  /** Машинный слаг — то, что лежит в БД. */
  readonly slug: string;
  /** Человеческая подпись для карточки подтверждения и отчётов. */
  readonly label: string;
  /** Постоянная или переменная — для расчёта маржи. */
  readonly kind: ExpenseCategoryKind;
  /**
   * Можно ли завести такой расход руками. Зарплата приходит из расчёта CRM
   * (payroll) отдельным потоком и уже учтена: ручная запись сложила бы её
   * саму с собой.
   */
  readonly manualEntry: 'allowed' | 'blocked';
  /** Почему руками нельзя — машиночитаемо, чтобы MAYA объяснила словами. */
  readonly manualEntryBlockedReason?: string;
}

export const EXPENSE_CATEGORIES = [
  {
    slug: 'rent',
    label: 'Аренда',
    kind: 'fixed',
    manualEntry: 'allowed',
  },
  {
    slug: 'payroll',
    label: 'Зарплата',
    // Процентная схема мастеров: начисление — доля от выручки, значит переменная.
    kind: 'variable',
    manualEntry: 'blocked',
    manualEntryBlockedReason: 'payroll_is_calculated_by_the_crm',
  },
  {
    slug: 'supplies',
    label: 'Расходники',
    kind: 'variable',
    manualEntry: 'allowed',
  },
  {
    slug: 'marketing',
    label: 'Реклама',
    kind: 'variable',
    manualEntry: 'allowed',
  },
  {
    slug: 'taxes',
    label: 'Налоги',
    kind: 'variable',
    manualEntry: 'allowed',
  },
  {
    slug: 'utilities',
    label: 'Коммунальные платежи',
    kind: 'fixed',
    manualEntry: 'allowed',
  },
  {
    slug: 'other',
    label: 'Прочее',
    kind: 'variable',
    manualEntry: 'allowed',
  },
] as const satisfies readonly ExpenseCategoryDefinition[];

export type ExpenseCategorySlug = (typeof EXPENSE_CATEGORIES)[number]['slug'];

/** Куда падает всё, что не опознали. */
export const FALLBACK_EXPENSE_CATEGORY: ExpenseCategorySlug = 'other';

const CATEGORY_BY_SLUG = new Map<string, ExpenseCategoryDefinition>(
  EXPENSE_CATEGORIES.map((category) => [category.slug, category]),
);

export const EXPENSE_CATEGORY_SLUGS: readonly string[] = EXPENSE_CATEGORIES.map(
  (category) => category.slug,
);

/** Слаги, которые разрешено заводить руками (человеком или MAYA). */
export const MANUAL_EXPENSE_CATEGORY_SLUGS: readonly string[] =
  EXPENSE_CATEGORIES.filter(
    (category) => category.manualEntry === 'allowed',
  ).map((category) => category.slug);

export function findExpenseCategory(
  slug: unknown,
): ExpenseCategoryDefinition | null {
  if (typeof slug !== 'string') {
    return null;
  }
  return CATEGORY_BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

export function isManualExpenseCategory(slug: unknown): boolean {
  return findExpenseCategory(slug)?.manualEntry === 'allowed';
}

export interface ResolvedExpenseCategory {
  /** Опознанный слаг: либо из справочника, либо `other`. */
  readonly slug: ExpenseCategorySlug;
  readonly label: string;
  readonly kind: ExpenseCategoryKind;
  /** Была ли категория в справочнике. */
  readonly known: boolean;
  /**
   * Исходная строка из БД. Старые записи с чужими категориями читаются как
   * `other`, но то, что человек когда-то ввёл, не теряется.
   */
  readonly raw: string;
}

/**
 * Прочитать сохранённую категорию.
 *
 * Записи, заведённые до появления справочника, не ломаются: неизвестный слаг
 * отдаётся как `other` с сохранением исходной строки в `raw`.
 */
export function resolveExpenseCategory(raw: unknown): ResolvedExpenseCategory {
  const original = typeof raw === 'string' ? raw : '';
  const known = findExpenseCategory(original);
  if (known) {
    return {
      slug: known.slug as ExpenseCategorySlug,
      label: known.label,
      kind: known.kind,
      known: true,
      raw: original,
    };
  }
  const fallback = CATEGORY_BY_SLUG.get(
    FALLBACK_EXPENSE_CATEGORY,
  ) as ExpenseCategoryDefinition;
  return {
    slug: fallback.slug as ExpenseCategorySlug,
    label: fallback.label,
    kind: fallback.kind,
    known: false,
    raw: original,
  };
}

/** Источник расхода. `crm` резервируется за импортом из внешней CRM. */
export const EXPENSE_SOURCES = ['manual', 'crm'] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export function isExpenseSource(value: unknown): value is ExpenseSource {
  return (
    typeof value === 'string' &&
    (EXPENSE_SOURCES as readonly string[]).includes(value)
  );
}

/** Потолок одной записи — 10 млн рублей: опечатка в разряде дороже отказа. */
export const MAX_EXPENSE_RUBLES = 10_000_000;

/**
 * Рубли → копейки.
 *
 * Модель считать не умеет и не должна: она передаёт то, что сказал человек
 * («шестьдесят тысяч» → 60000), а разряды доводит сервер. Возвращает null,
 * если сумма не рубли с точностью до копейки.
 */
export function rublesToKopecks(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 0 || value > MAX_EXPENSE_RUBLES) {
    return null;
  }
  const kopecks = Math.round(value * 100);
  // Дробнее копейки денег не бывает: 100.005 — это не сумма, а ошибка разбора.
  if (Math.abs(value * 100 - kopecks) > 1e-6) {
    return null;
  }
  if (kopecks < 1) {
    return null;
  }
  return kopecks;
}
