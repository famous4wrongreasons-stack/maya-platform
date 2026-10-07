import { C9Object, c9Object } from './c9.contract';

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
    ? `По оценке на ${signal.asOf} условие ${signal.key} (версия ${signal.version}) ${signal.value ? 'выполнено' : 'не выполнено'}. Полнота исходных данных: ${String(fact.completeness)}.`
    : 'Подтверждённая оценка давности недоступна; состояние гостя не установлено.';
}
