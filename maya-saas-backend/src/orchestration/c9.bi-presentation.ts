import {
  measurementTextParts,
  type MeasurementPresentation,
} from '../measurement/measurement.presentation';
import { C9Object, c9Object } from './c9.contract';
import { sourceInstantText } from '../common/source-instant-text';

export type FinancialReportRequest =
  { kind: 'latest' } | { kind: 'calendar_month'; year: number; month: number };

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/** Finite explicit snapshot request; no live analytics, comparison or scoped expansion. */
export function parseExplicitFinancialReportRequest(
  text: string,
): FinancialReportRequest | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
  if (
    /^(?:объясни|покажи) последний опубликованный финансовый отчет[?!.]*$/u.test(
      normalized,
    )
  )
    return { kind: 'latest' };
  const match =
    /^(?:объясни|покажи) (?:опубликованные показатели|опубликованный финансовый отчет) за ([а-я]+) ([1-9]\d{3})(?: года)?[?!.]*$/u.exec(
      normalized,
    );
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]) + 1;
  return month
    ? { kind: 'calendar_month', year: Number(match[2]), month }
    : null;
}

export function isExplicitFinancialReportRequest(text: string): boolean {
  return parseExplicitFinancialReportRequest(text) !== null;
}

export function financialReportMonthLabel(
  request: FinancialReportRequest,
): string {
  return request.kind === 'calendar_month'
    ? `${MONTHS[request.month - 1]} ${request.year} года`
    : '';
}

/** Exact source-local calendar boundaries. Null means corrupt/unknown metadata. */
export function financialReportMonthMatches(
  period: { from: unknown; toExclusive: unknown; timezone: unknown },
  request: Extract<FinancialReportRequest, { kind: 'calendar_month' }>,
): boolean | null {
  const instant = (value: unknown): Date | null => {
    if (value instanceof Date)
      return Number.isFinite(value.getTime()) ? value : null;
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
    )
      return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')
      ? date
      : null;
  };
  const from = instant(period.from),
    to = instant(period.toExclusive);
  if (
    !from ||
    !to ||
    from >= to ||
    typeof period.timezone !== 'string' ||
    !period.timezone
  )
    return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: period.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const boundary = (date: Date, year: number, month: number) => {
      const parts = Object.fromEntries(
        formatter.formatToParts(date).map((p) => [p.type, p.value]),
      );
      return (
        date.getUTCMilliseconds() === 0 &&
        Number(parts.year) === year &&
        Number(parts.month) === month &&
        parts.day === '01' &&
        parts.hour === '00' &&
        parts.minute === '00' &&
        parts.second === '00'
      );
    };
    return (
      boundary(from, request.year, request.month) &&
      boundary(
        to,
        request.month === 12 ? request.year + 1 : request.year,
        request.month === 12 ? 1 : request.month + 1,
      )
    );
  } catch {
    return null;
  }
}

/** Restates only the C7 snapshot projection; no comparison, new arithmetic or causal inference. */
export function biReportExplanation(fact: C9Object): {
  statement: string;
  truncated: boolean;
} {
  const period = c9Object(fact.period ?? {}),
    rule = c9Object(fact.rule ?? {});
  if (
    fact.sourceContract !== 'c7.measurement.read/1' ||
    fact.mode !== 'as_reported' ||
    fact.kind !== 'business_period' ||
    rule.key !== 'c7.business-period' ||
    rule.version !== 1 ||
    !Number.isInteger(fact.revision) ||
    (fact.revision as number) < 1 ||
    !Array.isArray(fact.metrics) ||
    typeof fact.asOf !== 'string' ||
    !Number.isFinite(Date.parse(fact.asOf)) ||
    typeof period.from !== 'string' ||
    typeof period.toExclusive !== 'string' ||
    typeof period.timezone !== 'string' ||
    !Number.isFinite(Date.parse(period.from)) ||
    !Number.isFinite(Date.parse(period.toExclusive))
  )
    return {
      statement:
        'Опубликованный финансовый снимок не содержит достаточных проверенных данных для объяснения.',
      truncated: false,
    };
  const view = {
    contract: 'c7.measurement.read/1',
    mode: 'as_reported',
    revisionId: null,
    snapshotHash: null,
    revision: fact.revision,
    expiresAt: null,
    kind: fact.kind,
    subject: {},
    rule,
    asOf: fact.asOf,
    period,
    completeness: fact.completeness,
    qualification: fact.qualification,
    attribution: fact.attribution,
    metrics: fact.metrics,
    limitations: fact.limitations ?? [],
  } as unknown as MeasurementPresentation;
  const parts = measurementTextParts(view);
  const mandatory = [
    `Опубликованный финансовый снимок, версия ${String(fact.revision)}.\nПериод: ${sourceInstantText(period.from, period.timezone)} — ${sourceInstantText(period.toExclusive, period.timezone)} (конец не включён; ${period.timezone}).`,
    ...parts.qualifications,
    'Это сохранённые измерения, без пересчёта текущего состояния. Причина изменения выручки не установлена.',
  ].join('\n');
  const warning = ' Показана часть показателей; остальные не приняты за ноль.';
  const displayed: string[] = [];
  for (const line of parts.metrics) {
    if ([mandatory, ...displayed, line].join(' ').length + warning.length > 800)
      break;
    displayed.push(line);
  }
  const truncated = displayed.length < parts.metrics.length;
  const statement =
    [mandatory, ...displayed].join('\n') + (truncated ? warning : '');
  return statement.length <= 800
    ? { statement, truncated }
    : {
        statement:
          'Опубликованный снимок нельзя безопасно показать в ограниченном ответе. Показатели не приняты за ноль; нужен отдельный просмотр отчёта.',
        truncated: true,
      };
}

export function biReportStatement(fact: C9Object): string {
  return biReportExplanation(fact).statement;
}
