/**
 * Исход визита — канонический словарь Maya.
 *
 * 🔴 Зачем это понадобилось. До P3 исход визита ездил по системе как голая
 * `status: string`, и владельца у словаря не было. Каждый потребитель оборонялся
 * собственным списком написаний:
 *
 *   appointments.service         'canceled' | 'cancelled'
 *   internal-calendar.service    ['canceled','cancelled']
 *   ai-tool-handler.service      'no_show'|'noshow'; 'canceled'|'cancelled'; 'completed'|'done'|'visited'
 *   operations-analytics.service ['canceled','cancelled']; ['no_show','no-show','noshow','did_not_come']
 *
 * Списки РАСХОДИЛИСЬ: аналитика принимала `did_not_come` и `complete`, а
 * AI-слой — нет, и то же значение классифицировалось двумя модулями по-разному.
 *
 * Перед объединением расхождение проверено эмпирически, а не рассуждением:
 * значения `did_not_come`, `visited`, `done` не порождает НИ ОДНО место в коде
 * (нулевое число источников), единственное `'complete'` относится к другому
 * домену — полноте книги расходов, а в боевой базе на момент P3 у всех
 * записей ровно один статус `completed`. Поэтому объединение словарей
 * наблюдаемого поведения не меняет.
 */

export type VisitOutcome = 'scheduled' | 'completed' | 'canceled' | 'no_show';

/** Значение, которое словарю неизвестно. Не ошибка — исход просто не назван. */
export type VisitOutcomeOrUnknown = VisitOutcome | 'unknown';

/**
 * Написания, которыми исход «отменён» лежит В БАЗЕ.
 *
 * 🔴 Это НЕ список синонимов для разбора, а значения для запроса к Postgres
 * (`status: { notIn: ... }`). Менять состав нельзя: изменится выборка.
 */
export const CANCELED_STATUS_VALUES: readonly string[] = [
  'canceled',
  'cancelled',
];

const ALIASES = new Map<string, VisitOutcome>([
  ['canceled', 'canceled'],
  ['cancelled', 'canceled'],
  ['no_show', 'no_show'],
  ['noshow', 'no_show'],
  ['did_not_come', 'no_show'],
  ['completed', 'completed'],
  ['complete', 'completed'],
  ['done', 'completed'],
  ['visited', 'completed'],
  ['confirmed', 'scheduled'],
  ['scheduled', 'scheduled'],
  ['pending', 'scheduled'],
]);

/**
 * Разобрать исход визита из любого источника: адаптера CRM, колонки БД или
 * словаря легаси-бота.
 *
 * Дефисы и пробелы приводятся к подчёркиванию — так `no-show` и `no show`
 * попадают в `no_show` без отдельных записей в таблице синонимов. Ровно так же
 * это делал `normalizedAppointmentStatus` в AI-слое.
 */
export function parseVisitOutcome(
  value: string | null | undefined,
): VisitOutcomeOrUnknown {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ALIASES.get(normalized) ?? 'unknown';
}

export function isCanceledOutcome(value: string | null | undefined): boolean {
  return parseVisitOutcome(value) === 'canceled';
}

export function isNoShowOutcome(value: string | null | undefined): boolean {
  return parseVisitOutcome(value) === 'no_show';
}

export function isCompletedOutcome(value: string | null | undefined): boolean {
  return parseVisitOutcome(value) === 'completed';
}
