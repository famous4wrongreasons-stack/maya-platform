import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';

export function formatRubFromKopecks(kopecks: number | null | undefined): string {
  const rub = Math.round(Number(kopecks || 0) / 100);
  return `${rub.toLocaleString('ru-RU')} ₽`;
}

export function localCalendarDate(
  timeZone: string,
  reference: Date = new Date(),
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(reference)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localHour(
  timeZone: string,
  reference: Date = new Date(),
): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(reference);
  return Number(hour);
}

export function dayIsoRange(
  timeZone: string,
  localDate: string,
): { from: string; to: string } {
  const from = localDateMinuteToUtc(localDate, 0, timeZone);
  const to = new Date(
    localDateMinuteToUtc(localDate, 24 * 60, timeZone).getTime() - 1,
  );
  return { from: from.toISOString(), to: to.toISOString() };
}

export function displayDayRu(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;
  return `${match[3]}.${match[2]}`;
}
