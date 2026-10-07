import {
  measurementTextParts,
  type MeasurementPresentation,
} from '../measurement/measurement.presentation';
import { C9Object, c9Object } from './c9.contract';
import { sourceInstantText } from '../common/source-instant-text';

export function isExplicitFinancialReportRequest(text: string): boolean {
  return /^(?:объясни|покажи) последний опубликованный финансовый отчет[?!.]*$/u.test(
    text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '),
  );
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
    `Опубликованный финансовый снимок, версия ${String(fact.revision)}.\nПериод: ${sourceInstantText(period.from as string, period.timezone as string)} — ${sourceInstantText(period.toExclusive as string, period.timezone as string)} (конец не включён; ${period.timezone}).`,
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
