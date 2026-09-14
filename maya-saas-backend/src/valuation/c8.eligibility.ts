import {
  C8Feature,
  C8Object,
  C8Target,
  c8Object,
  c8Ref,
  c8Features,
} from './c8.contract';
import { c8Policy } from './c8.policy';
import { c8ShiftWindow } from './c8.time';
/** Deterministic source eligibility, distinct from a statistical model's quality gate. */
export function c8Eligibility(input: {
  tenantId: string;
  t0: Date;
  features: unknown;
  policy: unknown;
  requiredFeatures: readonly string[];
  providerSupported: boolean;
  timezone?: string;
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_MEASURED';
  target?: C8Target;
}): {
  eligibility: 'ELIGIBLE' | 'INSUFFICIENT_DATA' | 'UNSUPPORTED';
  missingness: string[];
  features: C8Feature[];
  policy: C8Object;
} {
  const policy = c8Policy(input.policy);
  const features = c8Features(input.features, input.tenantId, input.t0);
  const names = new Set(
    features.filter((f) => f.value !== null).map((f) => f.key),
  );
  const missingness = input.requiredFeatures.filter((k) => !names.has(k));
  if (!input.providerSupported)
    return {
      eligibility: 'UNSUPPORTED',
      missingness: [...missingness, 'provider_capability_unavailable'],
      features,
      policy,
    };
  // Numeric target qualification never follows from fact row existence, coverage or tenant configuration.
  if (input.target)
    return {
      eligibility: 'INSUFFICIENT_DATA',
      missingness: [...missingness, 'qualified_model_unavailable'],
      features,
      policy,
    };
  for (const rule of policy.minimumEvidence as C8Object[]) {
    if (!(
      typeof rule.targetKey === 'string' &&
      input.requiredFeatures.includes(rule.targetKey)
    ))
      continue;
    const measured = features.find((f) => f.key === rule.targetKey);
    if (
      !measured ||
      (rule.requiredCoverage === 'COMPLETE' &&
        measured.sourceRefs.some((r) => r.coverage !== 'COMPLETE'))
    )
      missingness.push('minimum_source_coverage_unavailable');
    const count = features.find((f) =>
      ['observed_frequency', 'observed_attended_count'].includes(f.key),
    );
    if (
      Number(rule.minimumObservedEvents) > 0 &&
      (!count?.value ||
        !/^(0|[1-9]\d*)$/.test(count.value) ||
        BigInt(count.value) < BigInt(Number(rule.minimumObservedEvents)))
    )
      missingness.push('minimum_observed_events_unavailable');
    if (!input.timezone) missingness.push('source_age_timezone_unavailable');
    else {
      const earliest = c8ShiftWindow(
        input.t0,
        rule.maximumInputAge,
        input.timezone,
        -1,
      );
      if (
        !measured ||
        measured.sourceRefs.some((r) => Date.parse(r.asOf) < earliest.getTime())
      )
        missingness.push('source_age_exceeded');
    }
  }
  const sourceUnavailable = features.some((f) =>
    f.sourceRefs.some((r) => {
      c8Ref(r, input.tenantId, input.t0);
      return (
        r.qualification === 'UNQUALIFIED' ||
        r.coverage === 'UNAVAILABLE' ||
        r.coverage === 'NOT_MEASURED'
      );
    }),
  );
  return {
    eligibility:
      missingness.length ||
      sourceUnavailable ||
      ['UNAVAILABLE', 'NOT_MEASURED'].includes(input.coverage)
        ? 'INSUFFICIENT_DATA'
        : 'ELIGIBLE',
    missingness,
    features,
    policy,
  };
}
/** Only controlled scalar value forms; feature/source readers supply evidence, never LLMs. */
export function c8SafeValue(value: unknown) {
  const v = c8Object(value, [
    'key',
    'type',
    'value',
    'unit',
    'basis',
    'currency',
  ]);
  if (!['observed', 'scenario', 'policy', 'expected'].includes(String(v.type)))
    throw new Error('c8_value_type');
  if (v.type === 'expected')
    throw new Error('c8_numeric_activation_not_qualified');
  if (
    v.value !== null &&
    typeof v.value !== 'string' &&
    typeof v.value !== 'boolean'
  )
    throw new Error('c8_value_scalar');
  return v;
}
