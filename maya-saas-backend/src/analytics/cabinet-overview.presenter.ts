/**
 * Совместимость опубликованного контракта кабинета.
 *
 * 🔴 Cycle 04 P3. Это ПРЕЗЕНТАЦИЯ, и живёт она отдельно намеренно.
 *
 * Кабинет — отдельно деплоящийся фронт с уже выпущенным контрактом. Пока он не
 * мигрирован, ответ обязан выглядеть побайтово так же, как выглядел годами.
 * Раньше эта совместимость жила внутри сервиса аналитики и потому притворялась
 * бизнес-вычислением: `net` считался прямо там, вторым владельцем прибыли.
 *
 * Теперь она здесь — на HTTP-краю, под своим именем. Числа приходят от
 * канонического владельца; этот файл только переименовывает и складывает то,
 * что уже посчитано, и не имеет права ничего измерять.
 */

/** Старые имена на проводе. Не словарь системы — совместимость с фронтом. */
type LegacyOverview = {
  data_source: string;
  revenue: Array<{ currency: string; amount_kopecks: number }>;
  expenses: Array<{ currency: string; amount_kopecks: number }>;
  net: Array<{ currency: string; amount_kopecks: number }>;
  net_status: string;
  net_unavailable_reason: string;
};

/**
 * Снять диагностику фактов с ответа кабинета.
 *
 * Полнота и присутствие — правда о данных, и они обязаны доезжать до фактов.
 * Но добавлять их в опубликованный контракт ради диагностики значит менять
 * контракт: это отдельное решение, согласованное с фронтом (реестр 4.2).
 * Порядок оставшихся ключей при удалении сохраняется — именно он и есть
 * контракт.
 */
export function withoutFactDiagnostics<T extends object>(
  overview: T,
): Omit<T, 'completeness' | 'attendance'> {
  const rest = { ...overview } as T &
    Partial<Record<'completeness' | 'attendance', unknown>>;
  delete rest.completeness;
  delete rest.attendance;
  return rest;
}

/**
 * Вернуть ответу форму, которая была до появления честной прибыли.
 *
 * 🔴 `net` здесь — СОВМЕСТИМОСТЬ, а не бизнес-факт. Карточка «Чистыми»
 * рисуется только у арендатора на внутреннем календаре, где обе величины —
 * цены собственного календаря и собственные расходы, то есть одной природы.
 * Убрать поле, не имея возможности одновременно поправить фронт, значит
 * соврать пользователю новым способом вместо старого.
 *
 * Честная прибыль от подтверждённой кассы живёт в `getBusinessProfitability`
 * и сюда не протекает.
 */
export function withLegacyNet<T extends LegacyOverview>(overview: T) {
  if (overview.data_source !== 'maya') {
    return overview;
  }
  // Копия и точечное удаление: порядок оставшихся ключей сохраняется, а
  // именно он и есть контракт — фронт читает объект как есть.
  const rest = { ...overview } as Omit<
    T,
    'net_status' | 'net_unavailable_reason'
  > &
    Partial<Pick<T, 'net_status' | 'net_unavailable_reason'>>;
  delete rest.net_status;
  delete rest.net_unavailable_reason;
  const revenueMap = new Map(
    rest.revenue.map((item) => [item.currency, item.amount_kopecks]),
  );
  const expenseMap = new Map(
    rest.expenses.map((item) => [item.currency, item.amount_kopecks]),
  );
  const currencies = [
    ...new Set([...revenueMap.keys(), ...expenseMap.keys()]),
  ].sort((left, right) => left.localeCompare(right));
  rest.net = currencies.map((currency) => ({
    currency,
    amount_kopecks:
      (revenueMap.get(currency) ?? 0) - (expenseMap.get(currency) ?? 0),
  }));
  return rest;
}

/**
 * Снять операционные корзины статусов с ответа кабинета.
 *
 * 🔴 Канонический владелец читает ПОЛНЫЙ операционный срез: `scheduled`,
 * `completed`, `no_show` разведены главой 3 именно затем, чтобы будущие,
 * проведённые и неявившиеся записи никогда больше не смешивались. Отдавать
 * канону обеднённый вход ради формы ответа значило бы завести второе чтение —
 * ровно то, что P3 убирает.
 *
 * Поэтому корзины снимаются здесь, на HTTP-краю, по той же причине, что и
 * диагностика фактов: кабинет — отдельно деплоящийся фронт с выпущенным
 * контрактом, этих ключей в нём никогда не было, и добавление полей — решение,
 * согласованное с фронтом (реестр 4.2), а не побочный эффект миграции.
 *
 * Ни одно число не меняется: удаляются только ключи, которых старый ответ не
 * содержал. Порядок оставшихся сохраняется — он и есть контракт.
 */
const OPERATIONAL_ONLY_KEYS = {
  appointments: ['scheduled', 'completed', 'no_show'],
  daily: ['total', 'active', 'scheduled', 'completed', 'cancelled', 'no_show'],
  staff: ['total', 'scheduled', 'completed', 'no_show'],
} as const;

function withoutKeys(source: unknown, keys: readonly string[]): unknown {
  if (source === null || typeof source !== 'object') return source;
  const rest = { ...(source as Record<string, unknown>) };
  for (const key of keys) delete rest[key];
  return rest;
}

export function withoutOperationalStatusBuckets<T extends object>(
  overview: T,
): T {
  const rest = { ...overview } as Record<string, unknown>;
  if ('appointments' in rest) {
    rest.appointments = withoutKeys(
      rest.appointments,
      OPERATIONAL_ONLY_KEYS.appointments,
    );
  }
  for (const collection of ['daily', 'staff'] as const) {
    const rows = rest[collection];
    if (!Array.isArray(rows)) continue;
    rest[collection] = rows.map((row) =>
      withoutKeys(row, OPERATIONAL_ONLY_KEYS[collection]),
    );
  }
  return rest as T;
}
