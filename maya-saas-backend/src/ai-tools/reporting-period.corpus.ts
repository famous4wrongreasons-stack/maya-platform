import type { ReportingPeriodToolArgs } from './reporting-period.resolver';

/**
 * Живой корпус владельца: формулировка → ожидаемое окно.
 *
 * Новый косяк периода = новая строка сюда, а не if в mid-сервисе.
 * now зафиксирован: 2026-08-07T09:00:00.000Z (как в routing-regression).
 */
export type PeriodCorpusCase = {
  id: string;
  text: string;
  previous?: string;
  expect: ReportingPeriodToolArgs;
};

export const REPORTING_PERIOD_CORPUS: PeriodCorpusCase[] = [
  {
    id: 'today-records',
    text: 'Сколько записей сегодня?',
    expect: { period: 'today' },
  },
  {
    id: 'yesterday',
    text: 'Что по кассе вчера',
    expect: { period: 'yesterday' },
  },
  {
    id: 'day-august-7-report',
    text: 'Дай отчет за 7 августа',
    expect: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'day-august-7-short',
    text: 'А за 7',
    previous: 'Сколько записей сегодня?',
    expect: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'day-dotted',
    text: 'Касса за 07.08',
    expect: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'day-not-whole-month',
    text: 'Я прошу только за 7 августа',
    expect: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'day-iso',
    text: 'Отчёт за 2026-08-07',
    expect: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'day-after-august-context',
    text: 'А за 5',
    previous: 'Что по кассе в августе',
    expect: { period: 'named_day', day: '2026-08-05' },
  },
  {
    id: 'month-july-profit',
    text: 'Какая была прибыль в июле',
    expect: { period: 'named_month', month: '2026-07' },
  },
  {
    id: 'month-august-followup',
    text: 'А прибыль в августе?',
    previous: 'Какая была прибыль в июле',
    expect: { period: 'named_month', month: '2026-08' },
  },
  {
    id: 'month-slang-money',
    text: 'Че по бабкам за август',
    expect: { period: 'named_month', month: '2026-08' },
  },
  {
    id: 'range-1-7-august',
    text: 'Сводку с 1 по 7 августа',
    expect: {
      period: 'named_range',
      from_day: '2026-08-01',
      to_day: '2026-08-07',
    },
  },
  {
    id: 'range-dashed',
    text: 'Отчёт за 1–7 августа',
    expect: {
      period: 'named_range',
      from_day: '2026-08-01',
      to_day: '2026-08-07',
    },
  },
  {
    id: 'first-week-august',
    text: 'За первую неделю августа',
    expect: {
      period: 'named_range',
      from_day: '2026-08-01',
      to_day: '2026-08-07',
    },
  },
  {
    id: 'last-week',
    text: 'Что было на прошлой неделе',
    expect: { period: 'last_week' },
  },
  {
    id: 'last-7-days',
    text: 'Динамика за последние 7 дней',
    expect: { period: 'last_7_days' },
  },
  {
    id: 'last-30-days',
    text: 'За последние 30 дней',
    expect: { period: 'last_30_days' },
  },
  {
    id: 'week-to-date',
    text: 'Как неделя',
    expect: { period: 'week_to_date' },
  },
  {
    id: 'last-month',
    text: 'Касса за прошлый месяц',
    expect: { period: 'last_month' },
  },
  {
    id: 'inherit-today-followup-without-day',
    text: 'А по записям?',
    previous: 'Сколько выручки сегодня?',
    expect: { period: 'today' },
  },
  {
    id: 'default-mtd',
    text: 'Что по деньгам',
    expect: { period: 'month_to_date' },
  },
];
