import type { OccupancyProjection } from './c9.occupancy-source';

/** Closed deterministic copy. Dates are source values, never model estimates. */
export function occupancyStatement(
  p: OccupancyProjection,
  historical = false,
): string {
  if (historical)
    return 'Это сохранённый результат предыдущей проверки, а не подтверждение текущей доступности. Для новой проверки отправьте новый запрос «Проверь окна после отмен».';
  switch (p.outcome) {
    case 'AVAILABLE': {
      if (!p.window)
        return 'Данные окна неполны; свободное время не подтверждено.';
      const format = (value: string) =>
        new Intl.DateTimeFormat('ru-RU', {
          timeZone: p.window!.timezone,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(value));
      return `После снятия записи сохранилось окно ${format(p.window.start)} — ${format(p.window.end)} (${p.window.timezone}). CRM подтвердила рабочий график и доступность этого интервала на момент проверки.`;
    }
    case 'OCCUPIED':
      return 'Сохранённое окно больше не подтверждается текущим графиком или доступностью CRM. Предлагать его для записи сейчас нельзя.';
    case 'EXPIRED':
      return 'Сохранённое окно уже началось или срок возможности истёк. Рекомендация заполнить его неактуальна.';
    case 'CLOSED':
      return 'Сохранённая возможность закрыта либо запись больше не находится в состоянии снятой. Актуальное свободное окно не подтверждено.';
    case 'STALE':
      return 'Исходные данные изменились. Предыдущая возможность не подтверждает актуальное окно; нужна новая проверка.';
    case 'INCOMPLETE':
      return 'Недостаточно текущих данных для проверки сохранённого окна. Свободное время не подтверждено.';
    case 'UNAVAILABLE':
      return 'CRM сейчас не подтвердила доступность. Это недоступность источника, а не отсутствие свободных окон.';
    case 'NONE':
      return 'В проверенном источнике нет сохранённой возможности после отмены. Это не доказывает отсутствие отмен или свободных окон в CRM.';
  }
}

export function isExplicitCancellationWindowRequest(text: string): boolean {
  return /^(?:пожалуйста[, ]+)?проверь(?:те)?\s+окна\s+после\s+отмен(?:ы)?[.!?]?$/iu.test(
    text.trim(),
  );
}

export function occupancyLocalDate(
  window: NonNullable<OccupancyProjection['window']>,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: window.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(window.start));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
