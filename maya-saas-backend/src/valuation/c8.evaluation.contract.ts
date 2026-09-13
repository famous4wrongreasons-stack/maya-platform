import {
  C8Object,
  C8Ref,
  c8Digest,
  c8Id,
  c8Instant,
  c8Object,
  c8Ref,
} from './c8.contract';
export type C8Case = {
  caseKey: string;
  predictionRef: { tenantId: string; id: string; hash: string };
  backtestInputRef: null;
  labelRefs: C8Ref[];
  labelState: 'QUALIFIED' | 'IMMATURE' | 'UNKNOWN' | 'EXCLUDED';
  labelValue: string | null;
  exclusionCodes: string[];
  clusterRef: string;
  dependencyDeadline: string;
};
/** Immutable case inputs. Statistical/calibration outcomes are never caller inputs. */
export function c8Cases(
  value: unknown,
  tenantId: string,
  labelsAsOf: Date,
): C8Case[] {
  if (!Array.isArray(value) || value.length > 5000)
    throw new Error('c8_bounded_cases_required');
  const keys = new Set<string>();
  return value
    .map((item) => {
      const c = c8Object(item, [
        'caseKey',
        'predictionRef',
        'backtestInputRef',
        'labelRefs',
        'labelState',
        'labelValue',
        'exclusionCodes',
        'clusterRef',
        'dependencyDeadline',
      ]);
      c8Digest(c.caseKey);
      if (keys.has(String(c.caseKey))) throw new Error('c8_duplicate_case');
      keys.add(String(c.caseKey));
      const p = c8Object(c.predictionRef, ['tenantId', 'id', 'hash']);
      if (p.tenantId !== tenantId || c.backtestInputRef !== null)
        throw new Error('c8_prospective_case_scope');
      c8Id(p.id);
      c8Digest(p.hash);
      c8Id(c.clusterRef);
      c8Instant(c.dependencyDeadline);
      if (
        !Array.isArray(c.labelRefs) ||
        !['QUALIFIED', 'IMMATURE', 'UNKNOWN', 'EXCLUDED'].includes(
          String(c.labelState),
        )
      )
        throw new Error('c8_label_state');
      const refs = c.labelRefs.map((r) => c8Ref(r, tenantId, labelsAsOf));
      if (refs.some((r) => r.owner !== 'MeasurementRevision'))
        throw new Error('c8_label_requires_canonical_measurement');
      if (c.labelState === 'QUALIFIED') {
        if (
          !refs.length ||
          refs.some(
            (r) =>
              r.qualification !== 'VERIFIED' ||
              !['COMPLETE', 'PARTIAL'].includes(r.coverage),
          ) ||
          typeof c.labelValue !== 'string' ||
          !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(c.labelValue)
        )
          throw new Error('c8_qualified_label_required');
      } else if (c.labelValue !== null)
        throw new Error('c8_unknown_label_not_zero');
      if (
        !Array.isArray(c.exclusionCodes) ||
        c.exclusionCodes.some(
          (v) => typeof v !== 'string' || !/^[a-z][a-z0-9_]{0,100}$/.test(v),
        )
      )
        throw new Error('c8_label_reason');
      return { ...c, labelRefs: refs } as C8Case;
    })
    .sort((a, b) => a.caseKey.localeCompare(b.caseKey, 'en'));
}
export function c8CaseCounts(cases: C8Case[]): C8Object {
  return {
    version: 1,
    total: cases.length,
    qualified: cases.filter((c) => c.labelState === 'QUALIFIED').length,
    immature: cases.filter((c) => c.labelState === 'IMMATURE').length,
    unknown: cases.filter((c) => c.labelState === 'UNKNOWN').length,
    excluded: cases.filter((c) => c.labelState === 'EXCLUDED').length,
    independentClusters: new Set(cases.map((c) => c.clusterRef)).size,
  };
}
