/**
 * Чтение источника за период — один владелец двух вопросов сразу:
 * «что действительно попало в период» и «полно ли прочитано».
 *
 * 🔴 Зачем это понадобилось. Реестр 3.8, измерено на боевых данных: провайдер
 * возвращает записи ВНЕ запрошенного окна — прогон с окном
 * `2026-07-17…2026-09-17` вернул 17 записей 2024–2025 годов. Значит ответ
 * источника окном НЕ ЯВЛЯЕТСЯ, и «прочитано N» нельзя читать как «в периоде N».
 *
 * Аудит Phase A нашёл три независимых читателя журнала. Фильтр по периоду был
 * ровно у одного (аналитика); два в AI-слое считали всё, что вернул источник.
 * Отдельно от этого `completeness` не читал НИКТО из отвечающих владельцу —
 * усечённая выборка выглядела полной.
 *
 * Оба ответа собираются здесь, в чистой функции без Nest, Prisma и времени.
 */

import type { BusinessPeriod } from './business-fact';
import type { FetchCompleteness } from './fetch-completeness';

/** Одно окно чтения: то, что источник вернул, и признался ли он в неполноте. */
export interface PeriodWindowRead<T> {
  items: readonly T[];
  completeness: FetchCompleteness;
  /**
   * Причина неполноты, как её назвал источник. Машинные коды живут в
   * `FETCH_TRUNCATION_REASON`; тип оставлен строкой, потому что второй
   * источник вправе назвать свою причину своим словом.
   */
  truncationReason?: string | null;
}

/** Результат чтения периода целиком. */
export interface PeriodRead<T> {
  /** Только записи, действительно попавшие в период. Отсортированы. */
  items: T[];
  /**
   * Полно ли прочитано. `truncated`, если ХОТЬ ОДНО окно пришло неполным:
   * недочитанная часть могла содержать что угодно, и «в периоде столько-то»
   * после этого — нижняя граница.
   */
  completeness: FetchCompleteness;
  truncationReason: string | null;
  /** Сколько окон прочитано и сколько из них пришли неполными. */
  windows: number;
  truncatedWindows: number;
  /** Уникальных записей, вернувшихся от источника (до фильтра по периоду). */
  fetched: number;
  /**
   * Сколько уникальных записей источник вернул мимо запрошенного окна.
   *
   * Считается, а не выбрасывается молча: это единственный способ заметить,
   * что контракт провайдера изменился.
   */
  outOfPeriodDiscarded: number;
  /** Сколько записей источник вернул без пригодной даты начала. */
  undatedDiscarded: number;
}

/**
 * Попадает ли момент в период.
 *
 * 🔴 Обе границы ВКЛЮЧИТЕЛЬНО — ровно так, как это делала аналитика до P0.
 * Полуоткрытый интервал был бы аккуратнее теоретически, но сменил бы числа у
 * уже работающего кабинета, а P0 меняет семантику неизвестности, а не суммы.
 * Владельцы окон в системе строят `to` как последнюю миллисекунду суток, и при
 * такой договорённости включительность границы ни на что не влияет.
 */
export function isWithinPeriod(at: Date, from: Date, to: Date): boolean {
  const value = at.getTime();
  return (
    Number.isFinite(value) && value >= from.getTime() && value <= to.getTime()
  );
}

export interface PeriodRecordSelectors<T> {
  /** Начало записи. `null` означает «дата непригодна» — такая не считается. */
  startAt: (item: T) => Date | null;
  /** Ключ записи у источника. Дубли между окнами схлопываются по нему. */
  key: (item: T) => string;
}

/**
 * Собрать записи периода из окон источника.
 *
 * Порядок операций важен и обратим только в одну сторону: сначала схлопываем
 * дубли (одна запись, попавшая в два соседних окна, — это одна запись), потом
 * отбрасываем то, что вне периода. Иначе `fetched` считал бы одну запись
 * дважды, и число «прочитано» перестало бы что-либо значить.
 */
export function collectPeriodRecords<T>(
  windows: readonly PeriodWindowRead<T>[],
  period: BusinessPeriod,
  selectors: PeriodRecordSelectors<T>,
): PeriodRead<T> {
  const from = new Date(period.from);
  const to = new Date(period.to);

  const unique = new Map<string, T>();
  let truncatedWindows = 0;
  let truncationReason: string | null = null;

  for (const window of windows) {
    if (window.completeness === 'truncated') {
      truncatedWindows += 1;
      truncationReason ??= window.truncationReason ?? 'unknown';
    }
    for (const item of window.items) {
      // Последнее вхождение побеждает: соседние окна перекрываются, и более
      // поздняя выборка ближе к текущему состоянию источника.
      unique.set(selectors.key(item), item);
    }
  }

  const items: Array<{ key: string; startAt: Date; item: T }> = [];
  let outOfPeriodDiscarded = 0;
  let undatedDiscarded = 0;

  for (const [key, item] of unique) {
    const startAt = selectors.startAt(item);
    if (!startAt || Number.isNaN(startAt.getTime())) {
      undatedDiscarded += 1;
      continue;
    }
    if (!isWithinPeriod(startAt, from, to)) {
      outOfPeriodDiscarded += 1;
      continue;
    }
    items.push({ key, startAt, item });
  }

  // Детерминированный порядок: одинаковое начало разводится ключом источника.
  // Без второго ключа два ответа на один и тот же вопрос могли бы отличаться
  // порядком, и сравнение периодов сопоставляло бы разные строки.
  items.sort(
    (left, right) =>
      left.startAt.getTime() - right.startAt.getTime() ||
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );

  return {
    items: items.map((entry) => entry.item),
    completeness: truncatedWindows > 0 ? 'truncated' : 'complete',
    truncationReason,
    windows: windows.length,
    truncatedWindows,
    fetched: unique.size,
    outOfPeriodDiscarded,
    undatedDiscarded,
  };
}
