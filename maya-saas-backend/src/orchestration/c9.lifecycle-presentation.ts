import { C9Object, c9Object } from './c9.contract';
import { sourceInstantText } from '../common/source-instant-text';
import { isUsableTimezone } from '../tenants/salon-timezone';
import type { C8DormancyRuleParameters } from '../valuation/c8.read';

/** A bounded explicit READ command, never a marketing instruction or a background trigger. */
export function isExplicitClientReturnRequest(text: string): boolean {
  return /^(?:кого пора вернуть|проверь спящих клиентов|проверь оценки давности клиентов)[?!.]*$/u.test(
    text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '),
  );
}

/** Only source-qualified boolean policy signals; a date is never silently advanced to today. */
export function lifecycleSignal(
  fact: C9Object,
): { key: string; version: number; value: boolean; asOf: string } | null {
  const rule = c9Object(fact.rule ?? {});
  if (
    fact.kind !== 'POLICY_SIGNAL' ||
    fact.current !== true ||
    fact.available !== true ||
    fact.qualification !== 'VERIFIED' ||
    !['COMPLETE', 'PARTIAL'].includes(String(fact.completeness)) ||
    typeof rule.key !== 'string' ||
    !/^c8\.dormancy\/[a-zA-Z0-9_.:-]+$/.test(rule.key) ||
    !Number.isInteger(rule.version) ||
    (rule.version as number) < 1 ||
    typeof fact.asOf !== 'string' ||
    !Number.isFinite(Date.parse(fact.asOf))
  )
    return null;
  const values = Array.isArray(fact.values) ? fact.values : [];
  const signal = values
    .filter((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
    .map((v) => v as C9Object)
    .filter((v) => v.key === (rule.key as string).slice('c8.dormancy/'.length));
  if (signal.length !== 1 || typeof signal[0].value !== 'boolean') return null;
  return {
    key: rule.key,
    version: rule.version as number,
    value: signal[0].value,
    asOf: fact.asOf,
  };
}

export function lifecycleStatement(fact: C9Object): string {
  const signal = lifecycleSignal(fact);
  return signal
    ? `По оценке на ${sourceInstantText(signal.asOf)} (UTC) условие давности визитов по правилу бизнеса (версия ${signal.version}) ${signal.value ? 'выполнено' : 'не выполнено'}. ${lifecycleRuleStatement(fact)} ${fact.completeness === 'COMPLETE' ? 'Исходные данные полные.' : 'Исходные данные неполные.'}`
    : 'Подтверждённая оценка давности недоступна; состояние гостя не установлено.';
}

/** Present only the finite parameters supplied by the exact current C8 reader.
 * Older snapshots lacking that projection cannot borrow today's tenant policy. */
function lifecycleRuleParameters(
  fact: C9Object,
): C8DormancyRuleParameters | null {
  try {
    const rule = c9Object(fact.rule);
    if (rule.version !== 1) return null;
    const value = c9Object(rule.parameters);
    const keys = [
      'elapsed',
      'comparison',
      'evidence',
      'minimumCoverage',
      'serviceScope',
      'timezone',
    ];
    if (
      Object.keys(value).length !== keys.length ||
      keys.some((key) => !(key in value))
    )
      return null;
    const elapsed = c9Object(value.elapsed);
    const scope = c9Object(value.serviceScope);
    if (
      Object.keys(elapsed).length !== 2 ||
      (elapsed.unit !== 'day' && elapsed.unit !== 'calendar_month') ||
      typeof elapsed.count !== 'number' ||
      !Number.isSafeInteger(elapsed.count) ||
      elapsed.count < 1 ||
      (value.comparison !== 'gt' && value.comparison !== 'gte') ||
      value.evidence !== 'proven_attendance' ||
      (value.minimumCoverage !== 'COMPLETE' &&
        value.minimumCoverage !== 'PARTIAL') ||
      Object.keys(scope).length !== 2 ||
      typeof scope.count !== 'number' ||
      !Number.isSafeInteger(scope.count) ||
      scope.count < 0 ||
      scope.count > 100 ||
      scope.restricted !== scope.count > 0 ||
      !isUsableTimezone(value.timezone)
    )
      return null;
    return {
      elapsed: {
        unit: elapsed.unit,
        count: elapsed.count,
      },
      comparison: value.comparison,
      evidence: 'proven_attendance',
      minimumCoverage: value.minimumCoverage,
      serviceScope: {
        restricted: scope.restricted,
        count: scope.count,
      },
      timezone: value.timezone.trim(),
    };
  } catch {
    return null;
  }
}

function lifecycleRuleStatement(fact: C9Object): string {
  const parameters = lifecycleRuleParameters(fact);
  if (!parameters)
    return 'Параметры этого правила в доступной проекции не подтверждены.';
  const { count, unit } = parameters.elapsed;
  const plural =
    count % 100 >= 11 && count % 100 <= 14
      ? 2
      : count % 10 === 1
        ? 0
        : count % 10 >= 2 && count % 10 <= 4
          ? 1
          : 2;
  const label =
    unit === 'day'
      ? ['день', 'дня', 'дней'][plural]
      : ['календарный месяц', 'календарных месяца', 'календарных месяцев'][
          plural
        ];
  return [
    `Интервал правила: ${count} ${label} с последнего подтверждённого посещения.`,
    parameters.comparison === 'gt'
      ? 'Условие выполняется строго после окончания этого интервала.'
      : 'Условие выполняется с момента окончания этого интервала включительно.',
    unit === 'day'
      ? 'День здесь — истёкшие 24 часа.'
      : `Месяцы отсчитываются по местному времени (${parameters.timezone}), с ограничением даты последним днём месяца.`,
    parameters.minimumCoverage === 'COMPLETE'
      ? 'Правило требует полного покрытия исходных данных.'
      : 'Правило допускает частичное покрытие исходных данных.',
    parameters.serviceScope.restricted
      ? `Правило ограничено настроенным набором услуг (${parameters.serviceScope.count}); названия услуг здесь не раскрыты.`
      : 'Правило не ограничено отдельными услугами.',
  ].join(' ');
}
