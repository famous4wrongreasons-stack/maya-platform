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

/**
 * Слаг зарплаты. Вынесен в константу не ради красоты: расчёт прибыли и
 * карточка чата обязаны говорить об одной и той же статье, а строковый литерал
 * в двух файлах — это два разных места, которые расходятся молча.
 */
export const PAYROLL_EXPENSE_CATEGORY: ExpenseCategorySlug = 'payroll';

/** Категория, из которой берётся стоимость привлечения нового клиента. */
export const MARKETING_EXPENSE_CATEGORY: ExpenseCategorySlug = 'marketing';

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

/**
 * Синонимы статей — ТОЛЬКО на чтение.
 *
 * Раньше такой же список жил в аналитике и сводил `arenda`/`ads`/`zarplata` к
 * своим именам. Своим — потому что зарплата там называлась `salary`, а здесь
 * `payroll`: одна статья расхода имела две идентичности, и какая из них
 * приедет в карточку, зависело от того, какой инструмент отработал последним.
 *
 * Список нужен для строк, заведённых до появления справочника, и для будущего
 * импорта из CRM. На запись он не действует: `findExpenseCategory` синонимов не
 * знает, и `@IsIn(EXPENSE_CATEGORY_SLUGS)` в DTO пропускает только канон —
 * иначе «аренда» снова начала бы въезжать в базу тремя разными строками.
 */
const LEGACY_EXPENSE_CATEGORY_ALIASES: Record<string, ExpenseCategorySlug> = {
  arenda: 'rent',
  lease: 'rent',
  premises: 'rent',
  rent_payment: 'rent',
  office_rent: 'rent',
  salary: 'payroll',
  salaries: 'payroll',
  wages: 'payroll',
  zarplata: 'payroll',
  staff_salary: 'payroll',
  ads: 'marketing',
  advertising: 'marketing',
  advertisement: 'marketing',
  promo: 'marketing',
  promotion: 'marketing',
  reklama: 'marketing',
  smm: 'marketing',
  targeting: 'marketing',
  consumables: 'supplies',
  materials: 'supplies',
  rashodniki: 'supplies',
  tax: 'taxes',
  nalogi: 'taxes',
  communal: 'utilities',
  kommunalka: 'utilities',
};

/**
 * `Rent-payment` и `rent payment` — это одна и та же статья, написанная разными
 * руками. Приведение к `rent_payment` делается только при поиске синонима: сам
 * справочник сравнивается точно.
 */
function normaliseCategoryToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
}

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
  /** Опознана ли категория вообще — каноном или синонимом. */
  readonly known: boolean;
  /** Как именно опознана: точным слагом, синонимом или никак. */
  readonly match: 'canonical' | 'legacy_alias' | 'unknown';
  /**
   * Исходная строка из БД. Старые записи с чужими категориями читаются как
   * `other`, но то, что человек когда-то ввёл, не теряется.
   */
  readonly raw: string;
}

/**
 * Прочитать сохранённую категорию.
 *
 * Записи, заведённые до появления справочника, не ломаются: известный синоним
 * сводится к канонической статье, неопознанное отдаётся как `other`, и в обоих
 * случаях исходная строка сохраняется в `raw`.
 */
export function resolveExpenseCategory(raw: unknown): ResolvedExpenseCategory {
  const original = typeof raw === 'string' ? raw : '';
  const direct = findExpenseCategory(original);
  if (direct) {
    return describe(direct, 'canonical', original);
  }
  const alias =
    LEGACY_EXPENSE_CATEGORY_ALIASES[normaliseCategoryToken(original)];
  const aliased = alias ? CATEGORY_BY_SLUG.get(alias) : undefined;
  if (aliased) {
    // Синоним — это та же статья, написанная иначе. `raw` хранит написание.
    return describe(aliased, 'legacy_alias', original);
  }
  const fallback = CATEGORY_BY_SLUG.get(
    FALLBACK_EXPENSE_CATEGORY,
  ) as ExpenseCategoryDefinition;
  return describe(fallback, 'unknown', original);
}

function describe(
  category: ExpenseCategoryDefinition,
  match: ResolvedExpenseCategory['match'],
  raw: string,
): ResolvedExpenseCategory {
  return {
    slug: category.slug as ExpenseCategorySlug,
    label: category.label,
    kind: category.kind,
    known: match !== 'unknown',
    match,
    raw,
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
