import {
  FETCH_TRUNCATION_REASON,
  allowsAbsenceInference,
  completeFetch,
  truncatedFetch,
} from './fetch-completeness';

/**
 * 🔴 CYCLE 03 B3.0 — контракт полноты выборки.
 *
 * Постраничный обход записей заканчивался просто `return records`: усечённый
 * список выдавался за полный. Для сверки это означало бы вывод «записи
 * исчезли» там, где мы просто не дочитали.
 */

describe('полнота выборки', () => {
  it('🔴 доказанный пустой ответ — ПОЛНАЯ выборка', () => {
    // Пусто и «не знаю» — разные вещи. Пустой полный ответ разрешает вывод об
    // отсутствии; именно на этом различии стоит вся сверка.
    const result = completeFetch([], 1);

    expect(result.completeness).toBe('complete');
    expect(result.items).toEqual([]);
    expect(allowsAbsenceInference(result)).toBe(true);
  });

  it('неполная последняя страница — выборка полна', () => {
    const result = completeFetch([1, 2, 3], 2);

    expect(result.completeness).toBe('complete');
    expect(allowsAbsenceInference(result)).toBe(true);
  });

  it('🔴 упёрлись в потолок страниц — выборка НЕПОЛНА', () => {
    const result = truncatedFetch(
      [1, 2, 3],
      25,
      FETCH_TRUNCATION_REASON.pageLimitReached,
    );

    expect(result.completeness).toBe('truncated');
    expect(result.truncationReason).toBe('page_limit_reached');
    expect(result.pagesLoaded).toBe(25);
  });

  it('🔴 по неполной выборке вывод об отсутствии ЗАПРЕЩЁН', () => {
    // Главное правило главы 3: `не вернулась в выборке` ≠ `удалена`.
    const result = truncatedFetch(
      [1],
      25,
      FETCH_TRUNCATION_REASON.pageLimitReached,
    );

    expect(allowsAbsenceInference(result)).toBe(false);
  });

  it('причина усечения — машинный код, а не текст', () => {
    const result = truncatedFetch(
      [],
      25,
      FETCH_TRUNCATION_REASON.pageLimitReached,
    );

    expect(result.truncationReason).toMatch(/^[a-z_]+$/);
  });

  it('у полной выборки причины усечения нет вовсе', () => {
    expect(completeFetch([1], 1).truncationReason).toBeUndefined();
  });
});
