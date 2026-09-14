/**
 * Насколько полно прочитана выборка у внешнего источника.
 *
 * 🔴 Зачем понадобилось. Постраничный обход записей в боевом адаптере
 * заканчивался просто `return records`: если последняя разрешённая страница
 * пришла полной, вызывающий получал усечённый список и **не мог отличить**
 * «записей больше нет» от «мы прочитали не всё».
 *
 * Соседние выборки в том же файле (реестр клиентов, финансовые операции) при
 * переполнении бросают исключение — то есть честный вариант в доме уже был.
 * Записи оказались единственной выборкой, способной тихо соврать.
 *
 * Цена этой лжи в главе 3 конкретна: сверка, увидев неполный список, решила бы,
 * что не пришедшие записи удалены. `не вернулась в выборке` ≠ `удалена`.
 *
 * Контракт не зависит от провайдера: постраничность, курсоры и лимиты — детали
 * реализации, а «полно ли прочитано» — общий вопрос ко всякому источнику.
 */
export type FetchCompleteness =
  /** Источник отдал всё, что просили. Пустой результат тоже бывает полным. */
  | 'complete'
  /** Прочитано не всё. Делать выводы об отсутствии по такой выборке нельзя. */
  | 'truncated';

/** Почему выборка неполна. Машинные коды, а не свободный текст. */
export const FETCH_TRUNCATION_REASON = {
  /**
   * Упёрлись в предохранитель по числу страниц, а последняя страница пришла
   * полной — значит у источника осталось ещё.
   */
  pageLimitReached: 'page_limit_reached',
} as const;

export type FetchTruncationReason =
  (typeof FETCH_TRUNCATION_REASON)[keyof typeof FETCH_TRUNCATION_REASON];

/** Выборка вместе с признанием, насколько она полна. */
export interface FetchResult<T> {
  items: T[];
  completeness: FetchCompleteness;
  /** Заполнена только при `truncated`. */
  truncationReason?: FetchTruncationReason;
  /** Сколько страниц реально прочитано — для наблюдаемости. */
  pagesLoaded: number;
}

/**
 * Можно ли по этой выборке заключать, что чего-то БОЛЬШЕ НЕТ.
 *
 * 🔴 Единственный владелец этого вопроса. Вызывающий не должен сравнивать
 * строки статуса сам: именно так и появляются места, где неполнота
 * незаметно приравнивается к отсутствию.
 */
export function allowsAbsenceInference(result: {
  completeness: FetchCompleteness;
}): boolean {
  return result.completeness === 'complete';
}

/** Полная выборка — включая честно пустую. */
export function completeFetch<T>(
  items: T[],
  pagesLoaded: number,
): FetchResult<T> {
  return { items, completeness: 'complete', pagesLoaded };
}

/** Неполная выборка: то, что успели прочитать, и причина остановки. */
export function truncatedFetch<T>(
  items: T[],
  pagesLoaded: number,
  reason: FetchTruncationReason,
): FetchResult<T> {
  return {
    items,
    completeness: 'truncated',
    truncationReason: reason,
    pagesLoaded,
  };
}
